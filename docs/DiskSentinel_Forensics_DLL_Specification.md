# DiskSentinelForensics.dll 순수 창작 포렌식·수리연산 DLL 기술 명세서

**무의존성 네이티브 통계·엔트로피·파티션 무결성 분석 엔진 (Pure Creative Compute & Forensics DLL)**

- **작성자 / 개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0 (100% 독립 창작 알고리즘 및 소스 코드)
- **엔진 버전**: v4.6.0
- **대상 플랫폼**: Windows 10/11 x64·ARM64 (`DiskSentinelForensics.dll`) 및 POSIX/Linux 크로스 플랫폼 C ABI 호환

---

## 1. 개발 배경 및 역할 분리 설계 (Separation of Concerns)

기존 **`DiskSentinelNativeCore.dll`**이 Windows 커널 핸들(`CreateFileW`, `DeviceIoControl`)을 통한 저수준 물리 디스크 I/O·S.M.A.R.T.·NVMe 하드웨어 제어를 담당한다면, 신규 순수 창작 DLL인 **`DiskSentinelForensics.dll`**은 OS 디바이스 핸들이나 관리자 권한에 묶이지 않는 **순수 수리 연산·이진 포렌식·무결성 검증 엔진**으로 분리 설계되었습니다.

이러한 2-DLL 아키텍처 분리로 다음의 이점을 확보합니다:
1. **무의존성 이식성(Zero-Handle Portability)**: 원시 LBA 바이트 버퍼·섹터 레이턴시 텔레메트리·파일 익스텐트 목록만으로 동작하므로 실시간 물리 디스크 검사, 디스크 이미지(`.img`/VHD), 백업 덤프, 단위 테스트에서 동일 네이티브 바이너리를 재사용할 수 있습니다.
2. **프론트엔드·런처 연산 가속**: 대량의 섹터 지연 데이터(Z-Score 군집 분석), 수십만 개 배드 LBA와 파일 익스텐트 교차 히트맵, 256-bin 섀넌 엔트로피 계산을 네이티브 속도로 처리합니다.
3. **표준 C ABI 호환성**: `#pragma pack(push, 8)` 및 `__stdcall` 규약을 준수하여 `.NET P/Invoke(DiskSentinelLauncher.cs)`, Python `ctypes`, Rust FFI, Node-API에서 래퍼 없이 즉시 호출 가능합니다.

---

## 2. 아키텍처 및 5대 순수 창작 모듈 동작 원리

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                     DiskSentinelForensics.dll (Pure Creative Compute Engine)             │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 1] Welford One-Pass Z-Score & Contiguous Cluster Detector                        │
│  - DSF_AnalyzeSectorTelemetryZScore                                                      │
│  - 단일 패스 수치 안정 분산(Welford) + 희소/전체 스캔 갭 허용 연속 열화 클러스터 탐색   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 2] Binary-Search Fragmented Extent Bad-Density Heatmap Mapper                    │
│  - DSF_ComputeExtentBadDensityHeatmap                                                    │
│  - 정렬된 배드 LBA 이진 탐색(O(log M))으로 다중 단편화 익스텐트 셀별 결함 밀도 매핑     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 3] Shannon Entropy & Erased-NAND / Poison-Pattern Classifier                     │
│  - DSF_ComputeSectorEntropyAndPattern                                                    │
│  - 256-bin 히스토그램 H = -Σ p·log2(p), All-0x00/0xFF, 32비트 반복 패턴, LUT CRC32 산출  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 4] MBR / Protective MBR / GPT Header & Array IEEE 802.3 CRC32 Validator          │
│  - DSF_InspectBootAndPartitionTable                                                      │
│  - LBA 0~33 원시 버퍼에서 EFI PART 헤더(92B)와 파티션 엔트리 배열의 실제 CRC32 대조 검증│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 5] Volume Boot Record (NTFS / FAT32 / exFAT) Geometry Decoder                    │
│  - DSF_InspectVbrBootSector                                                              │
│  - BPB·클러스터 크기·$MFT LCN·루트 클러스터·0x55AA 부트 시그니처 즉시 디코딩              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Welford 단일 패스 Z-Score 분산 및 연속 열화 클러스터 탐지 (`DSF_AnalyzeSectorTelemetryZScore`)
- **수치 안정성 문제 해결**: 대용량 드라이브의 수백만 섹터 레이턴시 제곱합($\sum x_i^2$)을 단순 합산하면 부동소수점 정밀도 손실(Catastrophic Cancellation)이 발생합니다. 본 함수는 **Welford 점화식**을 적용해 오차를 원천 차단합니다:
  $$\delta = x_i - \mu_{i-1}, \quad \mu_i = \mu_{i-1} + \frac{\delta}{i}, \quad M_{2,i} = M_{2,i-1} + \delta (x_i - \mu_i)$$
  $$\sigma = \sqrt{\frac{M_{2,N}}{N}}, \quad z_i = \frac{x_i - \mu}{\max(\sigma, 0.05)}$$
- **연속 클러스터 탐지(`maxBlockIdGap`)**:
  - `Full` 스캔에서는 `maxBlockIdGap = 1`로 물리적으로 인접한 연속 불량/지연 구간을 병합하고, `Quick` 희소 샘플링 스캔에서는 블록 간격(`maxBlockIdGap >= 2`)을 허용하여 플래터 트랙·NAND 다이 단위 초기 마모 구역을 정확히 포착합니다.
  - Z-Score 밴드(`<=1σ`, `1~2σ`, `2~3σ`, `>3σ`), 최장 연속 길이(`longestRunBlocks`), 0~100점 열화 위험 지수(`degradationRiskScore`) 및 5단계 위험 등급(`Optimal` ~ `Critical`)을 반환합니다.

### 2.2 $O(N \log M)$ 단편화 익스텐트 배드섹터 밀도 히트맵 매퍼 (`DSF_ComputeExtentBadDensityHeatmap`)
- **동작 원리**:
  - 파일 LBA 맵(`DSFExtentInput[]`)과 배드 섹터 목록(`badLbas[]`)이 주어지면 필요 시 `qsort`로 정렬한 뒤, 각 익스텐트 $[start, start + count)$ 구간에 대해 `lower_bound` 이진 탐색으로 교차 범위를 $O(\log M)$에 절단합니다.
  - 히트된 각 배드 LBA의 파일 논리 오프셋을 계산하여 `cellCount`개의 히트맵 셀에 분포 횟수와 밀도 비율(`%`)을 기록하고, 피크 셀 인덱스 및 단편화 확산 점수(`fragmentationSpreadScore`)를 산출합니다.

### 2.3 섀넌 엔트로피 및 와이프·소거 NAND 섹터 판별기 (`DSF_ComputeSectorEntropyAndPattern`)
- **수학적 모델**:
  $$H(X) = -\sum_{k=0}^{255} p_k \log_2(p_k) \quad (0.0 \le H \le 8.0 \text{ bits/byte})$$
- **6종 섹터 자동 분류(`DSFSectorClass`)**:
  - `0 (All-Zero)`: 100% `0x00` — TRIM 해제 또는 제로필 완료 섹터
  - `1 (All-FF)`: 100% `0xFF` — 소거 완료된 NAND 플래시 페이지
  - `2 (Repeating Pattern)`: 4바이트 고정 워드 반복(예: `0xDEADBEEF`, `0x55AA55AA`, 와이프 패턴)
  - `3 (Text / Metadata)`: 가독 ASCII 비율 `>= 85%` 및 엔트로피 `<= 6.2` — 로그/구성 파일 영역
  - `4 (Structured Binary)`: 파일 시스템 메타데이터 또는 일반 바이너리 구조
  - `5 (Encrypted / Compressed)`: 엔트로피 `>= 7.5` — BitLocker/암호화/압축 데이터 영역

### 2.4 MBR / GPT 헤더 & 파티션 배열 IEEE 802.3 CRC32 무결성 검증기 (`DSF_InspectBootAndPartitionTable`)
- LBA 0 MBR 시그니처(`0x55AA`) 및 보호 MBR(`0xEE`) 여부를 검사한 뒤, LBA 1에서 `"EFI PART"` GPT 헤더를 검증합니다.
- GPT 표준 규격에 따라 헤더 오프셋 `16..19`(`HeaderCRC32`)를 0으로 마스킹한 92바이트 사본의 IEEE 802.3 CRC32(`0xEDB88320`)를 직접 재계산해 `storedHeaderCrc32`와 비교(`gptHeaderCrcValid`)하며, 파티션 엔트리 배열 전체의 CRC32도 동시 대조(`gptEntriesCrcValid`)하여 부트 섹터 변조나 비트 부식(Bit-Rot)을 판별합니다.
- 모든 활성 파티션의 시작/끝 LBA, 크기(Byte), 4K 정렬 여부(`sectorAligned4K`), GPT GUID 기반 파티션 종류(ESP, Microsoft Basic Data, MSR, Windows Recovery, Linux) 및 UTF-16LE 라벨을 디코딩합니다.

### 2.5 NTFS / FAT32 / exFAT VBR 부트 섹터 디코더 (`DSF_InspectVbrBootSector`)
- OEM ID(`"NTFS    "`, `"EXFAT   "`, `"FAT32"`)를 식별하고 섹터당 바이트 수, 클러스터당 섹터 수, 클러스터 크기(Byte), NTFS `$MFT` 시작 LCN 및 FAT32/exFAT 루트 클러스터 번호를 추출합니다.

---

## 3. 바이너리 C ABI 구조체 및 익스포트 API 명세 (`DiskSentinelForensics.h`)

모든 구조체는 `#pragma pack(push, 8)`으로 8바이트 정렬됩니다.

```cpp
extern "C" {
  // 1. 엔진 메타데이터 및 IEEE 802.3 CRC32 ("123456789" -> 0xCBF43926) 자체 무결성 테스트
  DSF_API bool DSF_CALL DSF_GetForensicsEngineInfo(DSFEngineInfo* outInfo);

  // 2. Welford 단일 패스 Z-Score 분산 및 연속 열화 클러스터 탐색
  DSF_API bool DSF_CALL DSF_AnalyzeSectorTelemetryZScore(
      const DSFTelemetrySample* samples, uint32_t sampleCount,
      double baselineExpectedMs, uint32_t maxBlockIdGap,
      DSFZScoreReport* outReport,
      DSFContiguousZone* outZones, uint32_t maxZones, uint32_t* outWrittenZones
  );

  // 3. O(N log M) 단편화 파일 익스텐트 배드섹터 밀도 히트맵 매퍼
  DSF_API bool DSF_CALL DSF_ComputeExtentBadDensityHeatmap(
      const DSFExtentInput* extents, uint32_t extentCount,
      const uint64_t* badLbas, uint32_t badLbaCount, bool badLbasAlreadySorted,
      uint32_t cellCount, uint32_t* outCellBadCounts, double* outCellDensityPct,
      DSFHeatmapSummary* outSummary
  );

  // 4. 256-bin 섀넌 엔트로피, 소거 NAND(0xFF), 반복 패턴 및 LUT CRC32 판별기
  DSF_API bool DSF_CALL DSF_ComputeSectorEntropyAndPattern(
      const uint8_t* pBuffer, uint32_t bufferLength, DSFSectorEntropyResult* outResult
  );

  // 5. MBR / Protective MBR / GPT 헤더 & 파티션 엔트리 배열 CRC32 검증 및 파싱
  DSF_API bool DSF_CALL DSF_InspectBootAndPartitionTable(
      const uint8_t* rawLbaBuffer, uint32_t bufferLength, uint32_t sectorSize,
      DSFPartitionTableReport* outReport,
      DSFPartitionRecord* outPartitions, uint32_t maxPartitions
  );

  // 6. NTFS / FAT32 / exFAT VBR 부트 섹터 기하 구조 디코더
  DSF_API bool DSF_CALL DSF_InspectVbrBootSector(
      const uint8_t* vbrSectorBuffer, uint32_t bufferLength, DSFVbrInfo* outInfo
  );
}
```

---

## 3.1 포렌식 DLL 전수 감사 및 개선 내역 (Audit Findings & Resolutions)

| 점검 대상 함수 | 식별된 결함 / 위험성 | 개선 및 해결 조치 |
| :--- | :--- | :--- |
| **`DSF_AnalyzeSectorTelemetryZScore`** | `NaN`/`Inf`·음수 지연이 Welford 평균/분산 누적에 혼입될 위험, 모표준편차($N$) vs 표본표준편차($N-1$) 불일치, 비정렬 입력 시 연속 클러스터 누락 | `!isfinite`/`< 0` 필터링, `validLatCount - 1` 표본 표준편차 적용, `blockId` 오름차순 사전 정렬로 비정렬 텔레메트리에서도 연속 클러스터 정확 탐지 |
| **`DSF_ComputeExtentBadDensityHeatmap`** | `totalSectors`·`cumulativeOffset` 64비트 누적 오버플로 위험, `badLbaCount <= 1` 불필요 `malloc`/`qsort`, 비중첩 익스텐트 불필요 탐색 | `UINT64_MAX` 포화 가드, `<= 1` 힙 할당 생략, `[minBadLba, maxBadLba]` 범위 사전 스킵으로 탐색 가속 |
| **`DSF_InspectBootAndPartitionTable`** | `partEntriesLba * secBytes` 및 `sizeBytes` 곱셈 오버플로 위험, GPT UTF-16LE 라벨 비ASCII 문자(`'?'` 손실) | 64비트 오버플로 사전 검사 및 BMP·서로게이트 페어 완전 **UTF-16LE → UTF-8 디코더(`dsf_utf16le_to_utf8`)** 구현 |
| **`DSF_InspectVbrBootSector`** | EXFAT 시프트(`secShift < 9 || > 12`, `clusShift > 25`) 오류 시에도 `true` 반환 및 FAT32/미식별 버퍼 `true` 폴백 오탐 위험 | NTFS/FAT32/exFAT 2의 거듭제곱 BPB 기하·시프트 범위(`<=32MB` 클러스터 상한) 엄격 검증 및 미식별/비정상 버퍼 `false` 반환으로 차단 |

---

## 4. 다국어 FFI 연동 및 빌드 가이드

### Tauri v2 데스크톱 FFI (`src-tauri/src/main.rs`) & React 연동
- Tauri 백엔드는 `LoadLibraryW`로 `DiskSentinelForensics.dll` 6대 심볼을 동적 로드하고, 비Windows 또는 DLL 미배치 환경에서는 동일 수식의 Rust 패리티 폴백(`rust-parity-fallback`)을 자동 실행합니다.
- 노출된 6대 Tauri IPC 커맨드: `inspect_forensics_dll_status`, `analyze_forensics_sector_zscore`, `compute_forensics_extent_heatmap`, `compute_forensics_sector_entropy`, `inspect_forensics_partition_table`, `inspect_forensics_vbr_sector`.
- 프론트엔드 `src/utils/forensicsDllBridge.ts`를 통해 `SectorHexPartitionModal`(섀넌 엔트로피·CRC32·VBR·GPT 헤더/배열 무결성)과 `LatencyHistogramDashboard`(Z-Score 열화 밴드)에 실시간 연동됩니다.

### C# (.NET P/Invoke) 연동 (`DiskSentinelLauncher.cs` 탑재)
- 런처는 시작 시 동일 폴더의 `DiskSentinelForensics.dll`을 `LoadLibraryW`로 로드하며, `/api/native/status`에서 `forensicsDllLoaded` 플래그를 반환합니다.
- `POST /api/native/forensics/entropy` 엔드포인트를 통해 물리 디스크 지정 LBA의 원시 섹터 바이트를 읽어 `DSF_ComputeSectorEntropyAndPattern` 결과를 즉시 JSON으로 제공합니다.

```csharp
[DllImport("DiskSentinelForensics.dll", CallingConvention = CallingConvention.StdCall)]
[return: MarshalAs(UnmanagedType.I1)]
public static extern bool DSF_ComputeSectorEntropyAndPattern(
    [In] byte[] pBuffer, uint bufferLength, out DSFSectorEntropyResult outResult);
```

### Python (`ctypes`) 연동 예제
```python
import ctypes
from ctypes import c_uint32, c_uint8, c_double, c_char, c_bool, Structure, byref

class DSFSectorEntropyResult(Structure):
    _pack_ = 8
    _fields_ = [
        ("inspectedBytes", c_uint32),
        ("crc32", c_uint32),
        ("repeatingWord32", c_uint32),
        ("sectorClass", c_uint32),
        ("shannonEntropy", c_double),
        ("zeroByteRatio", c_double),
        ("ffByteRatio", c_double),
        ("printableRatio", c_double),
        ("hasRepeatingPattern", c_uint8),
        ("isAllZero", c_uint8),
        ("isAllFF", c_uint8),
        ("reserved", c_uint8 * 5),
        ("classificationLabel", c_char * 48),
    ]

dll = ctypes.windll.LoadLibrary("./bin/native/DiskSentinelForensics.dll")
dll.DSF_ComputeSectorEntropyAndPattern.restype = c_bool

buf = (c_uint8 * 512)(*[0xFF] * 512)
res = DSFSectorEntropyResult()
if dll.DSF_ComputeSectorEntropyAndPattern(buf, 512, byref(res)):
    print(f"Entropy={res.shannonEntropy:.3f}, CRC32=0x{res.crc32:08X}, Class={res.classificationLabel.decode()}")
```

### 빌드 방법 (`build-dll.bat` 및 GitHub Actions 자동 빌드)
- **MSVC (x64 Release)**:
  ```cmd
  cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDSF_EXPORTS src\native\DiskSentinelForensics.cpp /Fe"bin\native\DiskSentinelForensics.dll"
  ```
- **MinGW-w64 (GCC x64 Release)**:
  ```cmd
  g++.exe -O3 -shared -m64 -DDSF_EXPORTS -D_WIN32 src/native/DiskSentinelForensics.cpp -o "bin/native/DiskSentinelForensics.dll"
  ```
- `setup.iss` Inno Setup 인스톨러는 `DiskBadSectorScanner.exe`, `DiskSentinelNativeCore.dll`과 함께 `DiskSentinelForensics.dll`을 설치 디렉터리에 동시 패키징합니다.
