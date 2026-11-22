# DiskSentinel Pro 모듈 및 순수 창작 DLL 시스템 명세서 (MODULES.md)

- **프로젝트명**: DiskSentinel Pro (디스크 배드섹터 정밀 검사기)
- **개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0
- **버전**: v4.6.0

---

## 1. 개요 (Overview)

DiskSentinel Pro는 고성능 하드웨어 표면 정밀 진단 시스템으로, 웹 프론트엔드 UI 계층과 저수준 하드웨어 다이렉트 I/O를 제어하는 **순수 독자 창작 C++ 네이티브 엔진(`DiskSentinelNativeCore.dll`)**, OS 핸들 의존 없이 고속 통계·엔트로피·파티션 무결성을 연산하는 **순수 창작 포렌식 엔진(`DiskSentinelForensics.dll`)**, Weibull RUL·음향 탐색 RMSSD 지터·Arrhenius 열가속·S.M.A.R.T. OLS 추세 회귀를 연산하는 **순수 창작 예지 진단 엔진(`DiskSentinelPredictive.dll`)**, 16-시그니처 파일 카빙·NTFS `$MFT` USA/Runlist 디코더·NIST SP 800-88 `Xoshiro256**` 소거 검증·ddrescue 도메인 구간 플래너를 제공하는 **순수 창작 데이터 복구 엔진(`DiskSentinelRecovery.dll`)**, 그리고 스트리밍 FIPS 180-4 SHA-256·Slicing-by-8 CRC32·$O((E+B)\log B)$ 익스텐트 Bit-Rot/배드섹터 생존성 평가·시점 간 S.M.A.R.T. 열화 속도(Diff)·플릿 Watchdog SLA 매트릭스를 연산하는 **순수 창작 무결성·Watchdog 엔진(`DiskSentinelIntegrity.dll`)**의 **5-DLL(Penta-DLL) 순수 창작 아키텍처**로 구성되어 있습니다.

본 문서는 프로젝트 내 모든 핵심 모듈의 역할, 아키텍처, 기존 네이티브 코드 감사 결과(버그 및 개선 사항), 그리고 **순수 창작 DLL들의 동작 원리와 세부 인터페이스**를 상세히 기록합니다.

---

## 2. 순수 창작 DLL (`DiskSentinelNativeCore.dll`)

### 2.1 개발 목적 및 특징
- **OS 캐시 바이패스 Direct I/O**: Windows 파일 시스템 캐시(`FILE_FLAG_NO_BUFFERING`) 및 선행 읽기 버퍼를 우회하여 플래터/NAND 셀의 순수 하드웨어 응답 지연시간(Raw Latency)을 마이크로초(µs) 단위로 정밀 측정.
- **순수 독자 창작 알고리즘**: 타사 상용 도구를 모방하거나 후킹하지 않고 독자적으로 연구 개발한 3대 핵심 알고리즘 내장.
- **표준 C ABI 호환**: C++, C# (.NET P/Invoke), Python (`ctypes`), Rust (`extern "C"`), Node-API / Electron과 100% 호환.

### 2.2 기존 네이티브 DLL 코드의 오류 및 개선 내역 (Audit Findings & Resolutions)

| 결함 항목 | 기존 상태 및 위험성 | 개선 및 해결 내역 |
| :--- | :--- | :--- |
| **1. 스텁(Stub) 방치 함수** | `DS_GetSmartTelemetry`, `DS_AttemptSoftSectorRepair`가 `return 0` 더미 상태로 방치되어 실제 텔레메트리 획득 및 수복 불가능 | Windows `IOCTL_STORAGE_PREDICT_FAILURE` 실제 호출 및 원자적 Read-Write-Verify 수복 시퀀스 완벽 구현 |
| **2. 컴파일러 이식성 결함** | MSVC 전용인 `strcpy_s`, `_aligned_malloc` 직결 호출로 MinGW, GCC, Clang에서 빌드 에러 발생 | 크로스 플랫폼 `safe_strncpy` 및 매크로 기반 정렬 할당자(`DS_ALIGNED_ALLOC`) 도입 |
| **3. 64비트 LBA 오버플로** | `offset = lba * sectorSize` 계산 시 32비트 연산으로 처리되어 4TB 이상 대용량 드라이브에서 주소 래핑 발생 | `((LONGLONG)lba) * ((LONGLONG)sectorSize)`로 64비트 정수 연산 강제 적용 |
| **4. 적응형 알고리즘 부재** | 고속 검사를 위한 청크 점핑 로직이 없어 대용량 디스크 전수 검사 시 과도한 시간 소요 | `DS_AdaptiveScanChunk` (가변 버스트 + 결함 시 1섹터 이진 분해 탐색) 알고리즘 신규 구현 |
| **5. 무결성 검증 도구 부재** | 읽어온 섹터의 소프트 체크섬 손상 여부를 판단하는 저수준 연산기 부재 | `DS_CalculateParityChecksum` (256-엔트리 IEEE 802.3 CRC32 LUT + 64비트 다중 레인 XOR 패리티) 구현 및 v4.6.0 고속 언롤링 최적화 |
| **6. 종합 신뢰도 산출기 부재** | 개별 SMART 값만 존재하고 종합 수명 예측 지표 산출 불가 | `DS_EvaluateDriveReliability` (5대 핵심 결함 속성 가중치 기반 수명 및 신뢰도 산출) 및 NULL 포인터 방어 적용 |
| **7. 누락된 `DS_GetDriveDetails` 익스포트 & NVMe 경계 검사 (v4.6.0)** | 런처 P/Invoke에서 호출하는 `DS_GetDriveDetails` 미구현으로 진입점 오류 가능, NVMe 오프셋 포인터 사전 경계 검증 및 4Kn/쓰기 캐시 실측 누락 | `DS_GetDriveDetails` 정식 익스포트 구현, `StorageAccessAlignmentProperty`/`StorageDeviceWriteCacheProperty` 실측, NVMe 오프셋 사전 경계 검증 및 `DS_VerifyLbaBlock` 64MB 분할 처리 |
| **8. Memory-Mapped Zero-Copy & Direct DMA 대용량 I/O 최적화 (v4.6.1)** | 매 I/O마다 버퍼 재할당/제로초기화·중복 시크 시스템 콜 발생, 결함 시 선형 섹터 탐색($O(K)$), 이미지 스캔/복제 시 커널-유저 이중 복사 발생 | `VirtualAlloc` 64KB 페이지 정렬 DMA 재사용 버퍼 + `StorageAdapterProperty`(`MaximumTransferLength`) 동적 스케일링 + 순차 오프셋 추적으로 `SetFilePointerEx` 생략 + $O(\log K)$ 반복 이진 분할 + `CreateFileMappingW`/`MapViewOfFile`(`mmap`) 영속 매핑 및 Direct DMA 직접 기록 API(#20~#25) C++/Rust 동시 적용 |
| **9. v4.6.2 전수 안전성·메모리·Slicing-by-8 가속·포렌식 UTF-8·Rust 패리티 감사 수정 (v4.6.2)** | C++ 코어 및 Rust 미러(`src/native/rust/src/lib.rs`)의 미사용 `VirtualAlloc` 선할당 낭비, LBA/수복 `checked_mul` 경계, `physical_sector_size=4096` 고정 및 쓰기 캐시·길이 IOCTL 누락, 치명 Win32 오류 시 불필요한 이진 분할, 소프트 수복 `0xA5` 센티넬 포이즈닝 부재, 1바이트 CRC32 병목, Forensics VBR exFAT/FAT32 시프트 오탐 및 UTF-16LE 서로게이트 손실 | C++/Rust 동시 지연 DMA 할당, `checked_mul`/`INT64_MAX` 가드, `StorageAccessAlignmentProperty(6)`·`StorageDeviceWriteCacheProperty(4)`·`GET_LENGTH_INFO` 실측, 치명 핸들 오류(`5,6,21,55,433,1167`) 즉시 중단, `0xA5` 센티넬 포이즈닝+청크 수복, **Slicing-by-8 CRC32**, Forensics VBR 엄격 시프트/BPB 차단 및 완전 UTF-16LE→UTF-8 디코더 적용 |
| **10. Quad-DLL 감사 패치 & Tauri 번들 리소스 통합 (v4.6.0)** | `DS_AdaptiveScanChunk`에서 `DS_ScanLbaBlock`이 `DS_STATUS_BAD`에도 `true`를 반환해 치명 핸들 중단(`isFatalHandleError`)이 도달 불가 데드코드였던 결함, `DS_VerifyLbaBlock`/`DS_CopyLbaRangeToMappedFile` 핸들 읽기 권한 및 QPF 주파수 미검증, `DSP_ComputeWeibullRul`의 `availableSparePct == 0` 누락, TypeScript 브리지 1바이트 비트 CRC32, MFT/PE 헤더 32비트 정수 래핑 가능성, `tauri.conf.json`/`tauri-desktop.yml` DLL 번들 누락 | `DS_AdaptiveScanChunk` 반환값/win32Err 직결 검사 수정, 핸들·`QueryPerformanceFrequency` 가드 추가, NVMe 예비 블록 완전 고갈(`availableSparePct == 0`) 감점 수정, `DS_CRC32_LUT` 테이블 가속 통일, Recovery MFT/PE 64비트 감산·오버플로 경계 하드닝, `tauri.conf.json` `bundle.resources` 및 GitHub Actions 선행 DLL 스테이징 통합 |
| **11. MSVC `C3861` 빌드 수정 및 v4.6.2 심층 자기성찰 감사 패치 (v4.6.2)** | `DiskSentinelEngine.cpp`의 `<math.h>`/`<cmath>` 누락으로 인한 MSVC `C3861 ('pow', 'fmax')` 실패, USB Hub IOCTL 비정렬 역참조 UB, `main.rs`의 `DEVPKEY_PciDevice_*` PID `10`/`11` 교차 오류, `ERROR_HANDLE_EOF` 시 `CloseHandle` 누락, `extent_count` 미검증 버퍼 오프셋 접근, NTFS 정션/심볼릭 링크 순환 탐색, PowerShell 알림 보간 | `<math.h>`+`<cmath>` 추가 및 USB Hub `memcpy` 교체, PCIe PID `10(Width)/11(Speed)` 교정 및 부모 DevNode `0..6` 확장, `ERROR_HANDLE_EOF` `CloseHandle`·`rp_buf` 경계 클램핑, `symlink_metadata` + 방문 `HashSet` 차단, 환경 변수 전달 + `CREATE_NO_WINDOW` 격리 적용 |
| **12. Penta-DLL 전수 감사 & Rust/TS 수리 패리티 보정 (v4.6.3)** | `Forensics` 512B 미만 입력에서 92B GPT 헤더 CRC32(LBA1) 검증 누락, `Predictive` 1시간 미만 초단기 샘플(`spanDays < 1/24`)의 OLS 일 기울기 과대 외삽(C++·Rust·TS 불일치), `Recovery` UTF-8 다중바이트(한글·일본어 등) 로그의 바이너리 오분류 및 `targetLba == 0` 시 `$MFT` 상주 오탐(Rust 미러·TS 포함), `NativeCore` 1차 읽기 실패(`ERROR_CRC`) 후 비정렬 재할당 버퍼 정렬 보증 및 `Rust` 미러 포렌식/카빙 패리티 격차 | `Forensics`에 `bufLen >= 92` GPT CRC32 직접 검증 추가, `Predictive`/`main.rs`/`predictiveAnalyticsBridge.ts` 전 계층 `< 1h` 기울기 0 가드 통일, `Recovery`/`main.rs`/`recoveryDllBridge.ts`에 2/3/4바이트 UTF-8 유효 시퀀스 인쇄율 가산 및 `targetLba > 0 && != UINT64_MAX` 가드 적용, `NativeCore` USB 토폴로지·Slicing-by-8·지연 DMA 정렬 경계 하드닝 |

### 2.3 3대 순수 창작 알고리즘 및 Zero-Copy I/O 동작 원리

#### 알고리즘 1: 적응형 버스트 점핑 & $O(\log K)$ 이진 분할 스캔 (`DS_AdaptiveScanChunk`)
- **원리**: 
  - 정상 블록(Latency < 50ms) 구간에서는 `StorageAdapterProperty` 기반 하드웨어 최적 전송 크기(1~4MB)로 묶어 고속 버스트 읽기를 수행하고, 순차 LBA 읽기 시 `SetFilePointerEx` 시스템 콜을 생략합니다.
  - 지연시간 임계치 초과 또는 I/O 오류(`ERROR_CRC`, `ERROR_SECTOR_NOT_FOUND`)가 감지되면 선형 탐색 대신 **스택 기반 반복 이진 분할(Iterative Binary Subdivision)**을 수행하여 정상 구간 절반을 1회 I/O로 건너뛰고 $O(\log K)$ 시스템 콜만으로 1섹터 결함 LBA를 핀포인트 식별합니다.

#### 알고리즘 2: 단일 패스 퓨즈드 ECC 패리티·제로 체크·LUT CRC32 검증기 (`DS_CalculateParityChecksum` / `DS_CalculateAvx2ChecksumAndZeroCheck`)
- **원리**:
  - `0xEDB88320` 256-엔트리 룩업 테이블 기반 8바이트 언롤 CRC32 연산, 64비트 누적 XOR 갈루아 필드 패리티, All-Zero 감지를 **단일 메모리 순회(Single Pass)**로 융합해 L1/L2 캐시 재적재 병목을 제거했습니다.

#### 알고리즘 3: 다차원 가중치 기반 신뢰도 지수 및 잔여 수명 평가기 (`DS_EvaluateDriveReliability`)
- **원리**:
  - 하드웨어 고장과 가장 직결되는 5대 S.M.A.R.T. 속성(재할당 섹터 `0x05`, 보류 섹터 `0xC5`, 오프라인 회복 불가 `0xBB`/`0xC6`, 가동 시간 `0x09`, 온도 `0xC2`)을 다변량 감점 모델로 분석.
  - 100점 만점 신뢰도 점수와 Weibull 위험 모델 기반 잔여 수명 일수(`estimatedRemainingDays`), 최종 등급(`EXCELLENT`, `GOOD`, `WARNING`, `CRITICAL`)을 도출.

#### 아키텍처 4: Memory-Mapped File Zero-Copy & Direct DMA 파이프라인 (`DS_OpenMappedTarget` ~ `DS_CopyLbaRangeToMappedFile`)
- **원리**:
  - 물리 드라이브(`\\.\PhysicalDriveN`)는 Windows NT 아키텍처상 섹션 매핑(`CreateFileMappingW`)과 `FILE_FLAG_NO_BUFFERING` 페이지 캐시 우회가 상호 배타적이므로 **이중 경로(Dual-Path)**로 설계했습니다.
  - 이미지/복제 대상 파일은 `CreateFileMappingW`/`MapViewOfFile`(POSIX는 `mmap`)의 OS 할당 단위(64KB) 정렬 슬라이딩 뷰로 직접 매핑해 `ReadFile`/`WriteFile` 복사 없이 사용자 공간 포인터(`DSMappedSectorWindow.viewPtr`)로 스캔(`DS_ScanMappedLbaRange`)하고, 물리 드라이브 복제(`DS_CopyLbaRangeToMappedFile`, Rust `DS_CopyLbaRangeChunk`)는 `ReadFile` DMA 데이터를 매핑된 목적지 페이지에 직접 전송합니다.

### 2.4 신규 순수 창작 포렌식·수리연산 DLL (`DiskSentinelForensics.dll`)
- **개발 목적**: Windows 디바이스 핸들에 의존하지 않고 원시 바이트 버퍼와 텔레메트리 배열만으로 고성능 통계·포렌식·파티션 무결성 검증을 수행하는 독립 C ABI 라이브러리 (`docs/DiskSentinel_Forensics_DLL_Specification.md` 참조).
- **탑재 6대 익스포트 API**:
  1. `DSF_GetForensicsEngineInfo`: 엔진 버전(`4.6.0`), 기능 비트마스크 및 `"123456789"` 표준 CRC32(`0xCBF43926`) 자체 테스트 검증.
  2. `DSF_AnalyzeSectorTelemetryZScore`: **Welford 단일 패스 분산** 기반 Z-Score 밴딩 및 `maxBlockIdGap`을 반영한 물리적 연속 열화 클러스터 탐지.
  3. `DSF_ComputeExtentBadDensityHeatmap`: **$O(N \log M)$ 이진 탐색** 기반 단편화 파일 익스텐트 배드섹터 밀도 히트맵 매핑.
  4. `DSF_ComputeSectorEntropyAndPattern`: **256-bin 섀넌 엔트로피($H = -\sum p \log_2 p$)**, All-0x00/0xFF 소거 NAND, 32비트 반복 패턴 및 IEEE CRC32 분석.
  5. `DSF_InspectBootAndPartitionTable`: MBR/보호 MBR 및 GPT `"EFI PART"` 헤더(92B)·파티션 배열 IEEE 802.3 CRC32 실검증 및 UTF-16LE→UTF-8 라벨·4K 정렬 점검.
  6. `DSF_InspectVbrBootSector`: NTFS(`$MFT` LCN), FAT32, exFAT 볼륨 부트 레코드(VBR) 2의 거듭제곱 BPB/시프트 검증 및 기하 구조 디코딩.
- **Tauri 통합**: `src-tauri/src/main.rs`가 Windows에서 `LoadLibraryW`로 `DiskSentinelForensics.dll`을 동적 로드(비Windows·미배치 시 Rust 패리티 자동 폴백)하고, `src/utils/forensicsDllBridge.ts`를 통해 `SectorHexPartitionModal`(섀넌 엔트로피·CRC32·VBR·GPT 헤더/배열 무결성)과 `LatencyHistogramDashboard`(Z-Score 열화 밴드)에 실시간 연동합니다.

### 2.5 신규 순수 창작 장애 예측·음향 진동 DLL (`DiskSentinelPredictive.dll`)
- **개발 목적**: 커널 핸들 비의존 환경에서 S.M.A.R.T.·NVMe 마모·온도·연속 LBA 지연 샘플을 결합해 미래 고장 확률, 잔여 수명(RUL), 음향 탐색 진동 및 열화 추세를 정량 예측하는 독립 C ABI 라이브러리 (`docs/DiskSentinel_Predictive_DLL_Specification.md` 참조).
- **탑재 5대 익스포트 API & Tauri IPC 연동**:
  1. `DSP_GetPredictiveEngineInfo`: 엔진 버전(`4.6.0`), 기능 마스크(`0x0F`) 및 Weibull($1 - e^{-1}$)·OLS($R^2 = 1.0$) 결정적 수학 자가 테스트 검증.
  2. `DSP_ComputeWeibullRul`: 매체별(HDD/SATA SSD/NVMe/USB) Weibull 형상($\beta$)·척도($\eta$) 동적 보정 및 30/90/365일 조건부 고장 확률·중앙값 RUL(일) 산출.
  3. `DSP_AnalyzeAcousticSeekProfile`: 연속 탐색 지연 **RMSSD 지터**, 순차 vs 스트라이드 지터 분리, FTL GC/헤드 재시도 마이크로 스톨 버스트 및 공진비 연산.
  4. `DSP_EvaluateThermalWearStress`: Arrhenius 열가속 방정식($E_a=0.7\text{eV}, T_{\text{ref}}=35^\circ\text{C}$) 기반 등가 노화 시간, 일일 TBW 쓰기율 및 잔여 연수 평가.
  5. `DSP_ProjectSmartDegradationTrend`: 중심화 2-Pass OLS 선형 회귀로 일 변화율, $R^2$, 30일 전망치 및 주의/위험 임계치 도달 예상 일수 산출.
- **Tauri 통합**: `src-tauri/src/main.rs`가 Windows에서 `LoadLibraryW`로 `DiskSentinelPredictive.dll`을 동적 로드하고, Rust/TypeScript 동일 수리 패리티 fallback과 함께 `LatencyHistogramDashboard`, `HealthSummaryDashboard`, `SmartAttributeTrendChart`에 실시간 반영합니다.

### 2.6 신규 순수 창작 데이터 복구·MFT·보안 소거 검증 DLL (`DiskSentinelRecovery.dll`)
- **개발 목적**: 커널 디바이스 핸들 없이 순수 원시 섹터/MFT 버퍼와 ddrescue 도메인 구간을 고속 복구·해독·검증하는 독립 C ABI 라이브러리 (`docs/DiskSentinel_Recovery_DLL_Specification.md` 참조).
- **탑재 7대 익스포트 API & Tauri IPC 연동**:
  1. `DSR_GetRecoveryEngineInfo`: 엔진 버전(`4.6.0`), 기능 마스크(`0x0F`), 16-시그니처 규칙 수 및 CRC32(`0xCBF43926`)·`Xoshiro256**` 결정적 자가 테스트 검증.
  2. `DSR_InspectRecoveryCarveBuffer`: JPEG/PNG/PDF/ZIP/MP4/RIFF/GIF/BMP/7z/RAR/GZIP/SQLite3/ELF/PE/NTFS `$Boot`/Text 16+ 포맷 헤더·푸터 EOF 판별 및 **Hamming Distance(1~2bit 반전)** 손상 헤더 복원.
  3. `DSR_ParseNtfsMftRecord`: 512B 섹터 말미 **USA Fixup** 인플레이스 복원, `$STANDARD_INFORMATION`/`$FILE_NAME`(Win32>POSIX>DOS 우선 UTF-16LE→UTF-8)·비거주 `$DATA` 가변 VarInt Runlist 디코딩.
  4. `DSR_ScanMftBufferForCluster`: 대용량 `$MFT` 배치 버퍼에서 특정 `targetLcn` 클러스터 및 `$MFT` 상주 `targetLba` 영향 파일 일괄 고속 스캔.
  5. `DSR_GenerateWipePatternBuffer`: NIST SP 800-88 / DoD 5220.22-M 호환 `0x00`/`0xFF`/상수/LBA-바인딩 SplitMix64+`Xoshiro256**` 소거 버퍼 및 IEEE CRC32 생성.
  6. `DSR_VerifyWipedBuffer`: Read-Back 섹터에서 기대 소거 패턴 대비 잔존 바이트 수(`residualNonMatchingBytes`) 및 최초 불일치 오프셋(`firstMismatchOffset`) 무결성 감사.
  7. `DSR_CoalesceAndPlanDdrescueIntervals`: ddrescue 도메인 구간 병합(Coalescing) 및 다음 Pass(`copying` / `trimming` / `retrying` / `completed`) LBA 작업 단위 스케줄링.
- **Tauri & UI 통합**: `src-tauri/src/main.rs`가 `LoadLibraryW`로 `DiskSentinelRecovery.dll`을 로드해 6대 IPC 커맨드를 제공하며, `src/utils/recoveryDllBridge.ts`를 통해 `BitCarvingRecoveryModal`, `lbaFileTracer.ts`, `SanitizeTrimModal`, `LbaImageClonerModal`에 실시간 연동됩니다.

### 2.7 신규 순수 창작 무결성·Bit-Rot·Diff·Watchdog DLL (`DiskSentinelIntegrity.dll`)
- **개발 목적**: 커널 디바이스 핸들 없이 스트리밍 FIPS 180-4 SHA-256 다이제스트·IEEE CRC32·FNV-1a64, 물리 익스텐트 Bit-Rot/배드섹터 생존성 평가, 시점 간 S.M.A.R.T. 열화 속도(Diff), 플릿 Watchdog SLA 규칙 매트릭스를 단일 네이티브 C ABI 엔진으로 통합 연산하는 제5 순수 창작 라이브러리 (`docs/DiskSentinel_Integrity_DLL_Specification.md` 참조).
- **탑재 8대 익스포트 API & 동작 원리**:
  1. `DSI_GetIntegrityEngineInfo`: 엔진 버전(`4.6.0`), 기능 마스크(`0x0F`), 8개 익스포트 수 및 **4종 KAT 자가진단**(FIPS 180-4 SHA-256(`"abc"`), Slicing-by-8 CRC32(`"123456789"` == `0xCBF43926`), 익스텐트 이진 탐색 중첩 KAT, 스캔 Diff 열화 KAT) 즉시 검증.
  2. `DSI_Sha256Init` / `DSI_Sha256Update` / `DSI_Sha256Final`: 112B `#pragma pack(push, 8)` 컨텍스트 기반 대용량 파일 64KB 청크 무제한 스트리밍 SHA-256 연산(Tauri `sha256_file_streaming`에서 Win32 DLL 직접 가속).
  3. `DSI_ComputeIntegrityDigest`: 단일 패스 메모리 버퍼에서 SHA-256 + Slicing-by-8 IEEE 802.3 CRC32 + FNV-1a64 다이제스트를 동시 산출.
  4. `DSI_EvaluateExtentIntegrity`: 배드섹터/고지연 LBA 배열 정렬·중복 제거 후 $O((E+B)\log B)$ `std::lower_bound` 구간 교차로 익스텐트 피해율, Bit-Rot 불일치 가중 위험도 및 최종 **생존성 점수(`survivabilityScore`, 0~100)** 산출.
  5. `DSI_ComputeScanSmartDiff`: 두 스냅샷 간 경과 시간(`>= 1h` 가드) 기반 일일 배드섹터 증가율(`badSectorsPerDay`), 건강도 손실율(`healthLossPerDay`), S.M.A.R.T. 속성별 델타 및 4단계 퇴행 등급(`regressionGrade` 0~3) 계산.
  6. `DSI_EvaluateWatchdogMatrix`: 전 플릿 드라이브 × Watchdog SLA 규칙(온도·`0x05` 재할당 증가·`0xC5` 보류 섹터·건강도·주기적 Quick Scan·링크 다운그레이드) 및 쿨다운을 교차 평가해 경보 트리거 목록과 플릿 종합 건강 지수(`fleetHealthIndex`) 반환.
- **Tauri, Launcher & UI 통합**: `src-tauri/src/main.rs`가 Windows에서 `LoadLibraryW`로 `DiskSentinelIntegrity.dll`을 로드(미로드/비Windows 시 Rust `Sha256` 및 동일 수식 폴백)해 5대 IPC 커맨드(`inspect_integrity_dll_status`, `compute_integrity_digest`, `evaluate_extent_integrity`, `compute_scan_smart_diff`, `evaluate_fleet_watchdog`)와 `sha256_file_streaming` 가속을 제공하고, `DiskSentinelLauncher.cs` `/api/native/status`(`integrityDllLoaded`), `src/utils/integrityDllBridge.ts`, `FolderLbaIntegrityPanel.tsx`, `HistoryAndComparison.tsx`, `TrayGuardianModal.tsx`에 실시간 연동됩니다.

---

## 3. 프론트엔드 및 서비스 모듈 구조

### 3.1 하드웨어 다이렉트 계층 (`src/services/nativeHostDrive.ts`)
- 웹 브라우저 환경에서 실제 PC의 물리 드라이브 파일(`\\.\PhysicalDrive0`), 로컬 백업 이미지/VHD 파일(`createNativeDriveFromFile`)을 네이티브 DMA 방식으로 마운트하여 실시간 표면 블록 읽기 에뮬레이션 및 실제 I/O 프로토콜 처리.

### 3.2 수복 워크플로우 엔진 (`src/components/SmartRemapModal.tsx`)
- LBA 블록 대상 제로필(Zero-Fill), 심층 ECC 패리티 재계산, 펌웨어 저수준 강제 치환 시뮬레이션.
- 매체별(NVMe, SATA SSD, HDD, USB) 속도 프로필 기반 복구 예상 완료 시간 및 파일 시스템 손상 경고 2단계 안전 모달 탑재.

### 3.3 실시간 자동 업데이트 모듈 (`src/components/UpdateNotificationModal.tsx`)
- GitHub Releases 최신 태그(`https://api.github.com/repos/AhBiYout-all/disk-bad-sector-scanner/releases/latest`)를 비동기 폴링하여 새 릴리스 감지 시 원클릭 업데이트 모달 표시.

### 3.4 네이티브 기술 백서 뷰어 (`src/components/DllDocsModal.tsx`)
- C ABI 구조체, C#/Python/Rust 예제 코드, 컴파일러 지침 및 클립보드 복사 인터페이스 제공.

### 3.5 D3 실시간 레이턴시 분포 히스토그램 (`src/components/LatencyHistogramDashboard.tsx`)
- 실시간 섹터 검사 레이턴시(`ms`) 및 읽기 속도(`MB/s`) 분포를 D3 빈(Bin)·로그/선형 스케일로 시각화.
- 선택된 검사 방식(`Quick` 8-Bin/0.1ms vs `Full` 20-Bin/0.01ms) 연동 통계 정밀도 동적 제어 및 표본 오차한계(`±ms`) 산출.
- `>= 100ms` 지연 섹터 오렌지/레드 그라데이션 하이라이트, 차트 상단 실시간 `Slow/Critical` 카운터, 클릭 시 LBA 상세 드릴다운 인스펙터 지원.

### 3.6 S.M.A.R.T. 건강 요약 및 임계치 경고 (`src/components/HealthSummaryDashboard.tsx`)
- 제조사 임계치(Threshold) 초과·위험 근접 속성 감지 시 행 하이라이트, 경고 배지 및 상세 진단 툴팁 제공.
- `TemperatureLineChart` 및 `LatencyHistogramDashboard` 통합 렌더링.

### 3.7 USB 버전·장치별 적응형 표면검사 매트릭스 & 위조 용량 가드 (`src/utils/usbScanMatrix.ts`)
- **네이티브 USB 토폴로지 & 동적 정책 API (`#26 DS_ProbeUsbTopology`, `#27 DS_ScanLbaBlockWithPolicy`)**:
  - Windows 레지스트리·PnP 트리(`cfgmgr32.dll`)·USB Hub IOCTL(`setupapi.dll`)을 통해 `bcdUSB`, 포트 Negotiated Speed(USB 1.1~USB4), 전송 드라이버(`USBSTOR` BOT / `UASPStor` UASP / `stornvme` PCIe 터널), 브릿지 칩셋 VID/PID를 실측해 C++·Rust·TypeScript 전 계층에 반영.
  - USB 버전(1.1 / 2.0 / 3.0 / 3.2 Gen2 / Gen2x2 / USB4) × 장치 클래스(Flash / SD UHS / External HDD / External SATA·NVMe SSD) 매트릭스에 따라 `chunkSectors`, `slowThresholdMs`, `criticalThresholdMs`, `maxRetries`, `cooldownEveryNBlocks`를 실시간 동적 튜닝하여 오탐(False Positive) 제거 및 과열/전압강하 방지.
- **2단계 위조 용량 가드 (`probe_fake_capacity_checkpoints`, `runFakeCapacityGuardScan`)**:
  - Tier 1 읽기 전용 2의 거듭제곱 LBA CRC32 앨리어싱 점검 + `PhysicalDrive0`/`C:` 영구 차단 보호가 적용된 선택적 Tier 2 `Xoshiro256**` 왕복 검증·원본 복원 지원 ([상세 명세서](USB_Surface_Scan_Matrix_Specification.md)).

### 3.8 전체 디스크 플릿 비교 대시보드 (`src/components/FleetOverviewDashboard.tsx`)
- 시스템에 장착된 모든 내·외장 물리 디스크의 건강 점수, 온도, 가동 시간, 링크 상태(`isLinkDowngraded`), 재할당/보류 섹터 카운트를 일목요연하게 비교하고 CSV/JSON 일괄 리포트를 생성합니다.

### 3.9 중요 폴더 LBA 매핑 & SHA-256 Bit-Rot 무결성 감시 (`src/components/FolderLbaIntegrityPanel.tsx`, `src/utils/lbaIntegrityStore.ts`)
- Tauri Win32 백엔드(`probe_paths_lba_integrity`, `FSCTL_GET_RETRIEVAL_POINTERS`)로 중요 폴더/파일의 물리 디스크 번호·LBA 익스텐트 구간을 추적해 표면 검사 결함 LBA와 교차 대조하고, SHA-256 기준 해시 변조(Bit-Rot)를 탐지합니다.

### 3.10 체크포인트 중단/재개 & S.M.A.R.T. 시점 비교 Diff (`src/utils/scanCheckpoint.ts`, `src/utils/scanDiff.ts`, `src/components/HistoryAndComparison.tsx`)
- 장시간 표면 검사 중단·종료 시 진행률 및 블록 상태를 체크포인트로 보존해 이어하기를 제공하며, 검사 이력 두 시점 간 S.M.A.R.T. 속성 변화량(`rawDelta`, `worsened`, `improved`)과 CSV/인쇄용 진단서를 생성합니다.

### 3.11 OS 네이티브 Watchdog 규칙 엔진 (`src/utils/watchdogEngine.ts`, `src/components/TrayGuardianModal.tsx`)
- 온도 임계 초과, 배드섹터 신규 발생, PCIe/USB 링크 다운그레이드, Bit-Rot 변조를 사용자 정의 규칙으로 상시 감시하고, Windows 네이티브 알림(`send_native_os_notification`) 및 웹 알림을 발송합니다.

### 3.12 통합 커맨드 팔레트 & 다국어 UI (`src/components/CommandPaletteModal.tsx`, `src/utils/i18n.ts`)
- `Ctrl+K` 단축키로 20여 개 모달·진단 도구·탭·드라이브 액션을 즉시 검색·실행하며 한국어(`ko`) / 영어(`en`) UI 언어 전환을 지원합니다.

---

## 4. 빌드 및 배포 자동화 파이프라인

- **`build-dll.bat`**: MSVC (`cl.exe`) 및 MinGW (`g++.exe`)를 자동 감지하여 `DiskSentinelNativeCore.dll`, `DiskSentinelForensics.dll`, `DiskSentinelPredictive.dll`, `DiskSentinelRecovery.dll`, `DiskSentinelIntegrity.dll` 5종을 원클릭 동시 빌드.
- **`build.bat`**: Vite 기반 웹 애플리케이션 프로덕션 패키징 및 산출물 자동 오픈.
- **`setup.iss`**: Inno Setup 전용 무인 설치(`/VERYSILENT`), 폴더 풀림 개별 파일 설치, 기존 설치본 감지/덮어쓰기 질의, `DiskSentinelForensics.dll`·`DiskSentinelPredictive.dll`·`DiskSentinelRecovery.dll`·`DiskSentinelIntegrity.dll` 포함 5종 네이티브 바이너리 배포 및 Windows 방화벽 규칙 자동 등록.
- **`.github/workflows/tauri-desktop.yml`**: Windows MSVC x64 환경에서 5종 순수 창작 DLL을 컴파일·`bin/native/` 스테이징한 뒤 Tauri v2 데스크톱 앱(`DiskBadSectorScanner.exe`, NSIS, MSI) `bundle.resources`에 포함해 빌드·배포.
- **`git-push-auto.bat`**: 민감 정보 및 임시 파일을 자동 필터링하고 `bundle:release`와 연동하여 필수 소스만 GitHub에 자동 반영.
- **`scripts/bundle-essential-release.mjs`**: 일반 디렉터리 `github-release/`와 숨김 디렉터리 `.github-release/`를 동시 생성 및 실시간 동기화.
