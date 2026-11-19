# DiskSentinel Pro 모듈 및 순수 창작 DLL 시스템 명세서 (MODULES.md)

- **프로젝트명**: DiskSentinel Pro (디스크 배드섹터 정밀 검사기)
- **개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0
- **버전**: v4.6.0

---

## 1. 개요 (Overview)

DiskSentinel Pro는 고성능 하드웨어 표면 정밀 진단 시스템으로, 웹 프론트엔드 UI 계층과 저수준 하드웨어 다이렉트 I/O를 제어하는 **순수 독자 창작 C++ 네이티브 엔진(`DiskSentinelNativeCore.dll`)**, 그리고 OS 핸들 의존 없이 고속 통계·엔트로피·파티션 무결성을 연산하는 **순수 창작 포렌식 엔진(`DiskSentinelForensics.dll`)**으로 구성되어 있습니다.

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
  5. `DSF_InspectBootAndPartitionTable`: MBR/보호 MBR 및 GPT `"EFI PART"` 헤더(92B)·파티션 배열 IEEE 802.3 CRC32 실검증 및 4K 정렬 점검.
  6. `DSF_InspectVbrBootSector`: NTFS(`$MFT` LCN), FAT32, exFAT 볼륨 부트 레코드(VBR) 클러스터 기하 구조 디코딩.

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

---

## 4. 빌드 및 배포 자동화 파이프라인

- **`build-dll.bat`**: MSVC (`cl.exe`) 및 MinGW (`g++.exe`)를 자동 감지하여 `DiskSentinelNativeCore.dll`과 `DiskSentinelForensics.dll`을 원클릭 동시 빌드.
- **`build.bat`**: Vite 기반 웹 애플리케이션 프로덕션 패키징 및 산출물 자동 오픈.
- **`setup.iss`**: Inno Setup 전용 무인 설치(`/VERYSILENT`), 폴더 풀림 개별 파일 설치, 기존 설치본 감지/덮어쓰기 질의, `DiskSentinelForensics.dll` 포함 네이티브 바이너리 배포 및 Windows 방화벽 규칙 자동 등록.
- **`git-push-auto.bat`**: 민감 정보 및 임시 파일을 자동 필터링하고 `bundle:release`와 연동하여 필수 소스만 GitHub에 자동 반영.
- **`scripts/bundle-essential-release.mjs`**: 일반 디렉터리 `github-release/`와 숨김 디렉터리 `.github-release/`를 동시 생성 및 실시간 동기화.
