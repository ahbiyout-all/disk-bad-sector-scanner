# DiskSentinelRecovery.dll 순수 창작 데이터 복구·MFT 디코더·보안 소거 검증 DLL 기술 명세서

**무의존성 네이티브 16-시그니처 파일 카빙 · NTFS `$MFT` USA/Runlist 디코더 · NIST SP 800-88 / Xoshiro256** 소거 검증 · ddrescue 도메인 구간 플래너 (Pure Creative Deep Recovery & Sanitize Verification DLL)**

- **작성자 / 개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0 (100% 독립 창작 알고리즘 및 소스 코드)
- **엔진 버전**: v4.6.0 (ABI v1)
- **대상 플랫폼**: Windows 10/11 x64·ARM64 (`DiskSentinelRecovery.dll`), Tauri v2 Rust `LoadLibraryW` 동적 로드 및 POSIX/Linux 크로스 플랫폼 C ABI 호환

---

## 1. 개발 배경 및 순수 창작 설계 의의 (Design Philosophy)

DiskSentinel Pro의 **4-DLL(Quad-DLL) 순수 창작 아키텍처**에서:
- **`DiskSentinelNativeCore.dll`**은 OS 캐시 우회 Direct DMA/S.M.A.R.T. 입출력 및 Memory-Mapped Zero-Copy 전송을,
- **`DiskSentinelForensics.dll`**은 Welford Z-Score 군집 탐지·섀넌 엔트로피·GPT/VBR 구조 검증을,
- **`DiskSentinelPredictive.dll`**은 Weibull RUL·음향 RMSSD 지터·Arrhenius 열가속·OLS S.M.A.R.T. 추세 회귀를 담당합니다.

신규 순수 창작 라이브러리인 **`DiskSentinelRecovery.dll`**은 커널 디바이스 핸들(`HANDLE`)에 일절 의존하지 않는 순수 바이트 버퍼 및 도메인 구간 연산 엔진으로서, **실제 손상 섹터 복구·NTFS 구조 역추적·보안 소거 검증·멀티패스 이미지 백업 스케줄링**의 4대 핵심 파이프라인을 네이티브 속도와 64비트 메모리 안전성으로 처리합니다.

Quad-DLL 분업 체계 내 고유 역할:
1. **고정밀 다중 시그니처 카빙 & 비트 반전 내성**: 16종 이상의 파일 헤더 및 푸터/트레일러(EOF) 경계를 탐색해 절단 여부를 판별하고, 1~2비트 헤더 반전 손상을 **Hamming Distance(해밍 거리)**로 구출합니다.
2. **NTFS `$MFT` 레코드 USA Fixup & 가변 부호 Runlist 디코딩**: 1024B/4096B MFT 레코드의 Update Sequence Array(USA) 섹터 말미 태그를 인플레이스 복원하고, `$STANDARD_INFORMATION`, `$FILE_NAME`(UTF-16LE→UTF-8 우선순위 네임스페이스), 비거주 `$DATA` 가변 부호 델타 Runlist를 단일 패스로 고속 해독합니다.
3. **NIST SP 800-88 / DoD 5220.22-M 결정적 소거 패턴 & Read-Back 감사**: SplitMix64 시딩 기반 `Xoshiro256**` PRNG와 LBA 오프셋 바인딩으로 재현 가능한 소거 버퍼를 생성하고, Read-Back 섹터에서 단 1바이트의 잔존 데이터(`firstMismatchOffset`)도 즉시 검출합니다.
4. **ddrescue 다중 패스 도메인 구간 병합 & 작업 스케줄링**: 분할·파편화된 인접 LBA 도메인 구간을 정렬·병합(Coalesce)하여 `.map.json` 메타데이터 비대화를 막고, `Copying → Trimming → Retrying → Completed` 중 다음 실행 청크를 결정합니다.

---

## 2. 아키텍처 및 4대 순수 창작 알고리즘 동작 원리

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                 DiskSentinelRecovery.dll (Pure Creative Recovery Engine)                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 1] Deep 16-Signature Carver + EOF Boundary & Hamming Bit-Flip Tolerance          │
│  - DSR_InspectRecoveryCarveBuffer                                                        │
│  - 16종 매직 시그니처, 푸터(FF D9 / IEND / %%EOF / EOCD) 추적, 1~2bit 반전 복원, CRC32 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 2] NTFS $MFT USA Fixup & Non-Resident $DATA Runlist Batch Decoder                │
│  - DSR_ParseNtfsMftRecord, DSR_ScanMftBufferForCluster                                   │
│  - USA 512B 스탬프 복원, 64B UTF-16LE 파일명 우선순위 랭킹, 가변 VarInt LCN 델타 디코딩  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 3] NIST SP 800-88 / SplitMix64 + Xoshiro256** PRNG Sanitize & Read-Back Verifier │
│  - DSR_GenerateWipePatternBuffer, DSR_VerifyWipedBuffer                                  │
│  - LBA-바인딩 결정적 키스트림 생성, IEEE 802.3 CRC32 검증, 최초 오프셋 불일치 검출      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 4] ddrescue Multi-Pass Domain Interval Coalescer & Work-Unit Scheduler           │
│  - DSR_CoalesceAndPlanDdrescueIntervals                                                  │
│  - 오버플로 차단 인접 구간 병합, 상태별 섹터 집계, 다음 Pass(Copy/Trim/Retry) 산출       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 다중 시그니처 파일 카버 & 해밍 비트 반전 탐지기 (`DSR_InspectRecoveryCarveBuffer`)
- **원리**:
  - 단일 패스로 256-bin 히스토그램, IEEE 802.3 CRC32(`0xEDB88320` LUT), 64비트 XOR 갈루아 패리티, 출력 가능 ASCII 비율(`printableRatio`), Shannon 엔트로피($H = -\sum p_i \log_2 p_i$) 및 All-Zero(`zeroAcc == 0`) 여부를 동시 계산합니다.
  - **16종 내장 시그니처**: JPEG (`FF D8 FF` ↔ `FF D9` EOI), PNG (`89 50 4E 47 ...` ↔ `IEND AE 42 60 82`), PDF (`%PDF-` ↔ `%%EOF`), ZIP/OOXML (`50 4B 03 04` ↔ EOCD `50 4B 05 06`), ISO BMFF/MP4 (`ftyp`), RIFF (`WEBP`/`WAVE`/`AVI`), GIF (`GIF87a`/`GIF89a`), BMP, 7-Zip, RAR, GZIP, SQLite 3, ELF, Windows PE/DLL(`MZ`+`PE\0\0` 64비트 경계 검증), NTFS `$Boot` VBR, UTF-8/ASCII 로그.
  - **Hamming 1~2 비트 반전 내성**: 정확 일치 시그니처가 없고 비-제로 데이터일 때 주요 헤더 패턴(PNG, PDF, ZIP, SQLite)과의 바이트별 XOR popcount 합 $\sum \text{popcount}(b_i \oplus p_i) \le 2$를 탐색해 방사선·ECC 감쇠로 헤더 1~2비트가 뒤집힌 손상 파일도 식별합니다.

### 2.2 NTFS `$MFT` USA Fixup & `$DATA` Runlist 배치 디코더 (`DSR_ParseNtfsMftRecord`, `DSR_ScanMftBufferForCluster`)
- **USA (Update Sequence Array) 복원**:
  - NTFS는 디스크 기록 중 찢어짐(Torn Write) 감지를 위해 각 512바이트 섹터 마지막 2바이트를 Update Sequence Number(USN)로 치환하고 원본 바이트를 USA 테이블에 보관합니다.
  - 본 엔진은 `usaOffset >= 42` 및 `usaCount >= 2` 경계를 검증한 뒤 모든 512B 말미 2바이트가 USN과 일치하는지 대조해 원본 바이트를 복원하고, 불일치 시 손상 섹터 수(`usaMismatchSectors`)를 기록합니다.
- **속성 순회 & 32/64비트 경계 보안**:
  - `$STANDARD_INFORMATION(0x10)`에서 Windows FILETIME 기반 생성 시각($\text{ms}$)을 추출하고, `$FILE_NAME(0x30)`에서 Win32/Win32+DOS(순위 3) > POSIX(순위 2) > DOS-only(순위 1) 우선순위로 UTF-16LE 파일명을 UTF-8로 손실 없이 디코딩합니다.
  - 순회 루프에서는 `attrLen > bytesUsed - off` 및 `contentRel > attrLen || attrLen - contentRel < ...` 감산 검사로 비정상/악성 MFT 속성 헤더에 의한 32비트 정수 래핑(Wraparound)을 원천 차단합니다.
  - 비거주 `$DATA(0x80)` 속성에서는 1~8바이트 길이 니블(`lenSize`, `offSize`)을 해독해 부호 확장 상대 델타(`lcnDelta`)를 누적 LCN으로 복원하며, 배치 스캐너(`DSR_ScanMftBufferForCluster`)는 `targetLcn` 일치 또는 `targetLba`가 `$MFT` 레코드 자체 LBA 범위에 걸치는 경우까지 일괄 추출합니다.

### 2.3 NIST SP 800-88 / `Xoshiro256**` 보안 소거 패턴 & Read-Back 검증기 (`DSR_GenerateWipePatternBuffer`, `DSR_VerifyWipedBuffer`)
- **결정적 PRNG 구조**:
  - 64비트 사용자 시드(`seed64`)와 대상 섹터 주소(`lbaOffset`)를 황금비 상수(`0xD6E8FEB86659FD93`, `0xA0761D6478BD642F`)로 혼합한 뒤 4회 SplitMix64 혼합을 거쳐 **256비트 `Xoshiro256**` 내부 상태(`s[4]`)**를 초기화합니다(전부 0 상태 방어 상수 포함).
  - 동일 `(seed64, lbaOffset)` 입력 시 C++, Rust 패리티, TypeScript BigInt 브리지가 **단 1비트의 오차도 없이 완벽히 동일한 바이트열**을 생성하므로, 소거 후 물리 섹터를 Read-Back하여 잔존 바이트(`residualNonMatchingBytes`) 및 최초 불일치 오프셋(`firstMismatchOffset`)과 IEEE CRC32를 즉시 감사할 수 있습니다.

### 2.4 ddrescue 도메인 구간 병합 & 작업 플래너 (`DSR_CoalesceAndPlanDdrescueIntervals`)
- **원리**:
  - 무작위 I/O 재시도 과정에서 잘게 쪼개진 `DdrescueInterval` 목록을 `startLba` 기준 정렬(오름차순, `sectorCount > 0` 필터링)한 뒤 `back.startLba <= UINT64_MAX - back.sectorCount` 오버플로 가드를 거쳐 연속 동일 상태·시도횟수·에러코드 구간을 하나로 병합합니다.
  - 병합된 구간에서 5종 상태별 섹터 총량(`finished`, `non_tried`, `non_trimmed`, `non_scraped`, `bad_sector`)을 합산하고, ddrescue 표준 우선순위(**`non_tried` → `non_trimmed` → `non_scraped` → `completed`**)에 따라 다음 작업 시작 LBA와 청크 크기(`safeChunk` / `trimStep` / `1` 섹터)를 즉시 반환합니다.

---

## 3. 바이너리 C ABI 구조체 및 익스포트 API 명세 (`DiskSentinelRecovery.h`)

모든 구조체는 `#pragma pack(push, 8)`으로 8바이트 정렬되며 `DSR_CALL` (`__stdcall`) 규약을 따릅니다.

```cpp
extern "C" {
  // 1. 엔진 버전(4.6.0), 기능 비트마스크(0x0F), 16-Signature 개수 및 CRC32/Xoshiro256** 자가 검증
  DSR_API bool DSR_CALL DSR_GetRecoveryEngineInfo(DSREngineInfo* outInfo);

  // 2. 16+ 포맷 파일 카빙, EOF 트레일러 확인, Hamming 1~2bit 헤더 복원, 엔트로피/CRC32 산출
  DSR_API bool DSR_CALL DSR_InspectRecoveryCarveBuffer(
      const uint8_t* pBuffer, uint32_t bufferLength, DSRCarveInspectionResult* outResult);

  // 3. 단일 NTFS $MFT 레코드 USA Fixup, UTF-16LE→UTF-8 파일명, $DATA Runlist 디코딩
  DSR_API bool DSR_CALL DSR_ParseNtfsMftRecord(
      uint8_t* recordBytes, uint32_t recordLength, uint32_t recordIndexHint,
      bool applyUsaFixupInPlace, DSRNtfsMftParsedRecord* outRecord,
      DSRNtfsDataRun* outRuns, uint32_t maxRuns);

  // 4. 다중 $MFT 레코드 배치 내 targetLcn / targetLba 영향 파일 일괄 스캔
  DSR_API bool DSR_CALL DSR_ScanMftBufferForCluster(
      const uint8_t* mftBuffer, uint32_t bufferLength, uint32_t mftRecordSize,
      uint32_t firstRecordIndex, uint64_t batchStartLba, uint32_t sectorSize,
      uint64_t targetLba, uint64_t targetLcn,
      DSRNtfsMftParsedRecord* outMatchedRecords, uint32_t maxMatched, uint32_t* outMatchedCount,
      DSRNtfsDataRun* outRunsFlat, uint32_t maxRunsFlat, uint32_t* outWrittenRuns);

  // 5. NIST SP 800-88 / Xoshiro256** PRNG 소거 버퍼 생성 + IEEE CRC32 계산
  DSR_API bool DSR_CALL DSR_GenerateWipePatternBuffer(
      uint8_t* pOutBuffer, uint32_t bufferLength, uint32_t patternMode,
      uint8_t constantByte, uint64_t seed64, uint64_t lbaOffset, uint32_t* outCrc32);

  // 6. 소거된 섹터(Read-Back) 잔존 데이터 및 최초 불일치 오프셋 무결성 검증
  DSR_API bool DSR_CALL DSR_VerifyWipedBuffer(
      const uint8_t* pBuffer, uint32_t bufferLength, uint32_t patternMode,
      uint8_t constantByte, uint64_t seed64, uint64_t lbaOffset,
      DSRWipeVerifyReport* outReport);

  // 7. ddrescue 도메인 구간 병합(Coalescing) 및 다음 Pass 작업 LBA 스케줄링
  DSR_API bool DSR_CALL DSR_CoalesceAndPlanDdrescueIntervals(
      const DSRDdrescueIntervalC* inIntervals, uint32_t inCount, uint32_t chunkSectors,
      DSRDdrescueIntervalC* outCoalesced, uint32_t maxOut,
      DSRDdrescuePlanSummary* outSummary);
}
```

---

## 4. Tauri 데스크톱 통합 & 다국어 FFI 연동

### Tauri v2 Rust 동적 로드 및 패리티 통합 (`src-tauri/src/main.rs`)
- Windows 데스크톱 실행 시 `LoadLibraryW` / `GetProcAddress`로 실행 파일 및 `resources/`·`_up_/bin/native/` 인접 경로의 `DiskSentinelRecovery.dll`을 동적 로드하고, 비-Windows 또는 미배치 환경에서도 동일 알고리즘을 실행하는 Rust 패리티 fallback을 내장합니다.
- 등록된 6개 IPC 커맨드:
  - `inspect_recovery_dll_status`
  - `analyze_recovery_carve_buffer`
  - `parse_recovery_mft_batch`
  - `generate_recovery_wipe_pattern`
  - `verify_recovery_wipe_buffer`
  - `plan_recovery_ddrescue_intervals`

### 프론트엔드 브리지 및 UI 통합 (`src/utils/recoveryDllBridge.ts`)
- **`BitCarvingRecoveryModal.tsx`**: 물리 섹터 복구 후 16종 시그니처 신뢰도, EOF/절단 상태, Hamming 비트 반전, Shannon 엔트로피 및 매칭 확장자 다운로드 지원.
- **`lbaFileTracer.ts`**: NTFS `$MFT` 배치 순회 시 Tauri 환경에서 `runRecoveryMftBatchScan`으로 네이티브 MFT USA + Runlist 가속 매핑 수행.
- **`SanitizeTrimModal.tsx`**: NIST SP 800-88 / `Xoshiro256**` 소거 패턴 생성, 1바이트 변조 탐지, 실제 LBA Read-Back 무결성 검증 UI 탑재.
- **`LbaImageClonerModal.tsx`**: `.map.json` 로드 및 세션 일시 정지 시 도메인 구간 자동 병합 및 다음 권고 패스 안내.

### Python (`ctypes`) 연동 예제
```python
import ctypes
from ctypes import c_uint8, c_uint32, c_uint64, c_int64, c_double, c_char, c_bool, Structure, byref

class DSRCarveInspectionResult(Structure):
    _pack_ = 8
    _fields_ = [
        ("inspectedBytes", c_uint32),
        ("signatureType", c_uint32),
        ("confidenceScore", c_uint32),
        ("footerDetected", c_uint8),
        ("isTruncated", c_uint8),
        ("isZeroFilled", c_uint8),
        ("reserved0", c_uint8),
        ("estimatedPayloadBytes", c_uint64),
        ("crc32", c_uint32),
        ("nearMatchBitFlips", c_uint32),
        ("galoisParity64", c_uint64),
        ("shannonEntropy", c_double),
        ("printableRatio", c_double),
        ("signatureName", c_char * 64),
        ("fileExtension", c_char * 16),
        ("footerMarker", c_char * 32),
    ]

dll = ctypes.windll.LoadLibrary("./bin/native/DiskSentinelRecovery.dll")
dll.DSR_InspectRecoveryCarveBuffer.restype = c_bool

buf = (c_uint8 * 512)(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
res = DSRCarveInspectionResult()
if dll.DSR_InspectRecoveryCarveBuffer(buf, 512, byref(res)):
    print(f"Sig={res.signatureName.decode()}, Ext=.{res.fileExtension.decode()}, Conf={res.confidenceScore}%, CRC=0x{res.crc32:08X}")
```

### C# (.NET P/Invoke) 연동 예제
```csharp
[DllImport("DiskSentinelRecovery.dll", CallingConvention = CallingConvention.StdCall)]
[return: MarshalAs(UnmanagedType.I1)]
public static extern bool DSR_VerifyWipedBuffer(
    byte[] pBuffer, uint bufferLength, uint patternMode,
    byte constantByte, ulong seed64, ulong lbaOffset, out DSRWipeVerifyReport outReport);
```

### 빌드 지침 (`build-dll.bat`)
- **MSVC (x64 Release)**:
  ```cmd
  cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDSR_EXPORTS src\native\DiskSentinelRecovery.cpp /Fe"bin\native\DiskSentinelRecovery.dll"
  ```
- **MinGW-w64 (GCC x64 Release)**:
  ```cmd
  g++.exe -O3 -shared -m64 -DDSR_EXPORTS -D_WIN32 src/native/DiskSentinelRecovery.cpp -o "bin/native/DiskSentinelRecovery.dll"
  ```
- Inno Setup (`setup.iss`), Tauri 번들 리소스 (`src-tauri/tauri.conf.json`), GitHub Actions (`.github/workflows/tauri-desktop.yml`) 모두 `DiskSentinelRecovery.dll`을 자동 컴파일/스테이징합니다.
