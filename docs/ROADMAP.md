# DiskSentinel Pro - Project Implementation Roadmap (ROADMAP.md)

- **Application**: DiskSentinel Pro (디스크 배드섹터 정밀 검사기)
- **Current Version**: v4.4.1
- **Author**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **Affiliation**: CISNet (http://www.cisnet.co.kr)
- **Official Blog**: https://ahbiyoutvibe.blogspot.com/

---

## 1. Feature & Verification Matrix

### [TASK-DLL-01] Pure Creative Native DLL Architecture & Bug Audit
- **Description**: 순수 창작 C++ 네이티브 DLL (`DiskSentinelNativeCore.dll`) 오류 전면 진단, 크로스 컴파일러 호환성 확보 및 빌드 파이프라인 정비.
- **Priority**: P0
- **Dependencies**: None
- **Target Files**:
  - `src/native/DiskSentinelEngine.h`
  - `src/native/DiskSentinelEngine.cpp`
  - `build-dll.bat`
  - `build.bat`
  - `docs/DiskSentinel_Native_DLL_Specification.md`
  - `docs/MODULES.md`
- **Implementation Plan**:
  1. `DS_GetSmartTelemetry` 및 `DS_AttemptSoftSectorRepair` 커널 I/O 스크러빙 실제 구현.
  2. 64-bit LBA 오버플로 차단 연산 적용.
  3. MinGW / MSVC 크로스 컴파일러 매크로(`safe_strncpy`, `DS_ALIGNED_ALLOC`) 표준화.
  4. `build-dll.bat`의 Windows CMD 파싱 오류(`&` 분기 명령어 오인식) 수정 및 `--no-pause` 플래그 도입.
  5. `#ifndef DISKSENTINEL_EXPORTS` 매크로 재정의 경고 제거.
- **Acceptance Criteria**:
  - 컴파일러 경고 없이 MSVC/MinGW에서 빌드 성공.
  - Windows 배치 실행 시 'Life', 'CRC32' 명령 미인식 오류 0건.
- **Validation**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (0 errors)
  - C++ header/source integrity check: PASS
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-EXP-02] Comprehensive Inspection Results Export (CSV & PDF)
- **Description**: 검사 결과를 고해상도 PDF 공인 인증서 및 UTF-8 BOM CSV 파일로 내보내기/보관/공유 기능.
- **Priority**: P1
- **Dependencies**: `jspdf`
- **Target Files**:
  - `src/utils/reportGenerator.ts`
  - `src/components/ReportModal.tsx`
  - `src/components/ExportModal.tsx`
  - `src/components/TelemetryPanel.tsx`
  - `src/App.tsx`
- **Implementation Plan**:
  1. `reportGenerator.ts` 내 `exportPdfReport` 및 `exportCsvReport` 완전 구현.
  2. Canvas 기반 렌더링을 활용하여 한글 폰트 깨짐 없는 A4 규격 다면 진단 보고서 PDF 생성.
  3. `ExportModal.tsx`를 통해 1-클릭 PDF, CSV, 인쇄, JSON 내보내기 지원.
  4. `TelemetryPanel` 및 진단 모달에서 '검사 결과 내보내기' 접근 버튼 제공.
- **Acceptance Criteria**:
  - PDF 클릭 시 브라우저 내에서 즉각 `DiskSentinel-Inspection-Report-*.pdf` 다운로드.
  - CSV 클릭 시 Excel 호환 UTF-8 BOM 인코딩된 검사 레코드 즉각 다운로드.
- **Validation**:
  - TypeScript 정적 타입 검증 및 번들링 성공.
  - 단위 및 컴포넌트 이벤트 연결 완료.
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-CHART-03] Real-time 10-Minute Temperature Line Chart
- **Description**: `HealthSummaryDashboard` 컴포넌트에 최근 10분간의 실시간 디스크 온도 변화를 직관적으로 관측할 수 있는 인터랙티브 선 그래프(Line Chart) 탑재.
- **Priority**: P1
- **Dependencies**: None
- **Target Files**:
  - `src/components/TemperatureLineChart.tsx`
  - `src/components/HealthSummaryDashboard.tsx`
- **Implementation Plan**:
  1. SVG 기반 초경량 고해상도 선 그래프 컴포넌트 설계 (외부 대형 차트 라이브러리 의존성 없이 번들 최적화).
  2. 최근 10분(600초, 10초 간격 60개 샘플 포인트) 롤링 타임 버퍼 관리.
  3. 최저/최고/평균 온도, 발열 추세(상승/하강/안정), 안전/주의/과열 구역 색상 가이드라인 시각화.
  4. 마우스 호버 시 특정 시점의 온도 툴팁 상세 표기.
- **Acceptance Criteria**:
  - `HealthSummaryDashboard` 로드 시 최근 10분 온도 변화 곡선 정상 렌더링.
  - 온도 변화 시 부드러운 패스 업데이트 및 발열 추세 지표 반영.
- **Validation**:
  - React 19 컴파일 및 Vite 번들링 통과.
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-GRID-04] SectorGrid Physical LBA Bad Sector Zoom & Cluster Navigation
- **Description**: `SectorGrid` 컴포넌트에서 결함 섹터가 위치한 물리적 LBA 영역별로 그리드를 1x/2x/4x/8x 확대하여 정밀 탐색할 수 있는 줌 기능 구현.
- **Priority**: P1
- **Dependencies**: None
- **Target Files**:
  - `src/components/SectorGrid.tsx`
- **Implementation Plan**:
  1. 1x, 2x, 4x, 8x 단계별 줌 레벨 상태 관리.
  2. 전체 블록 중 배드섹터가 밀집된 LBA 클러스터를 자동 감지하여 원클릭 포커싱 기능 제공.
  3. 미니맵 네비게이터를 통한 전체 디스크 대비 현재 가시 영역 LBA 범위(Start ~ End LBA) 표시.
  4. 스캔 헤드 실시간 자동 추적(Follow Scan Head) 토글 지원.
- **Acceptance Criteria**:
  - 줌 인/아웃 버튼 클릭 시 해당 배드섹터 LBA 중심 돋보기 확대 표출.
  - 배드섹터 클러스터 바로가기 클릭 시 해당 LBA 블록 영역으로 뷰포트 즉시 이동.
- **Validation**:
  - TypeScript 컴파일 검사 통과 및 인터랙티브 UI 반응성 확인.
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-BUILD-05] Windows Batch & CI/CD Pipeline Automation
- **Description**: Windows CRLF 규격 배치 스크립트(`build.bat`, `build-dll.bat`, `git-push-auto.bat`) 및 Inno Setup 인스톨러 빌드 자동화.
- **Priority**: P1
- **Dependencies**: Inno Setup (`ISCC.exe`), MinGW / MSVC
- **Target Files**:
  - `build.bat`
  - `build-dll.bat`
  - `git-push-auto.bat`
  - `setup.iss`
  - `scripts/bundle-essential-release.mjs`
- **Implementation Plan**:
  1. `build.bat`에서 `build-dll.bat --no-pause` 호출 연계.
  2. `bundle:release`를 통해 `github-release/` 및 `.github-release/` 핵심 소스 자동 미러링.
  3. Inno Setup 전처리기 매크로 연동.
- **Acceptance Criteria**:
  - 배치 스크립트 무결성 보장 및 무인 빌드 파이프라인 구축.
- **Validation**:
  - `node scripts/bundle-essential-release.mjs` 실행 통과.
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-RUST-06] Rust Native Core Engine & NVMe Deep Telemetry + AVX2 Acceleration (Phase 1)
- **Description**: C++ 코어를 대체 가능한 순수 Rust 고성능 네이티브 코어(`src/native/rust/src/lib.rs`, `Cargo.toml`) 도입 및 1단계 기능(NVMe Log Page 02h 심층 텔레메트리 파싱 + AVX2 하드웨어 가속 제로 체크/체크섬) 구현.
- **Priority**: P1
- **Dependencies**: Cargo (Rust 2021 edition), AVX2 intrinsics
- **Target Files**:
  - `src/native/rust/Cargo.toml`
  - `src/native/rust/src/lib.rs`
  - `src/native/DiskSentinelEngine.h`
  - `src/native/DiskSentinelEngine.cpp`
  - `src/utils/nativeDllBridge.ts`
  - `src/components/TelemetryPanel.tsx`
  - `src/components/DllDocsModal.tsx`
  - `build-rust.bat`
  - `build.bat`
  - `docs/RUST_MIGRATION_GUIDE.md`
- **Implementation Plan**:
  1. `src/native/rust/` 디렉터리에 C ABI 호환 Rust `cdylib` 패키지 구축.
  2. `DSNvmeHealthLog` 구조체 정의 (가용 예비영역, 온도, 마모율, 누적 TBW, 호스트 I/O 명령 수, 에러 카운터 등 16개 핵심 지표).
  3. `DS_GetNvmeDeepTelemetry`: Win32 `IOCTL_STORAGE_PROTOCOL_COMMAND` 기반 NVMe Log Page 02h 파싱 및 보정 폴백 구현.
  4. `DS_CalculateAvx2ChecksumAndZeroCheck`: `_mm256_testz_si256` SIMD 벡터화 제로 체크, 256비트 패리티 누적, 하드웨어/스칼라 CRC32 연산 구현.
  5. C++ 헤더(`DiskSentinelEngine.h`), C++ 소스(`DiskSentinelEngine.cpp`), TS 브리지(`nativeDllBridge.ts`)에 C ABI 시그니처 100% 동기화.
  6. `TelemetryPanel.tsx`에 NVMe Log 02h 텔레메트리 및 AVX2 가속 상태 실시간 시각화 배너 연동.
  7. `build-rust.bat` 빌드 스크립트 작성 및 `build.bat` 자동 탐지 파이프라인 연계.
- **Acceptance Criteria**:
  - Rust 네이티브 코어에 `DS_GetNvmeDeepTelemetry`, `DS_CalculateAvx2ChecksumAndZeroCheck` 구현 완료.
  - TypeScript 브리지 및 React 대시보드 컴파일 에러 0건.
- **Validation**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (0 errors)
  - UI 텔레메트리 실시간 렌더링 확인: PASS
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-RUST-07] Rayon Multi-Drive Concurrent Scanner (Phase 2)
- **Description**: Rayon 워커 스레드 풀을 활용하여 시스템에 장착된 여러 대의 HDD/SSD/외장 디스크를 Data Race 및 I/O 기아 현상 없이 동시 병렬 Direct I/O로 스캔하는 동시성 엔진 구현.
- **Priority**: P1
- **Dependencies**: `rayon = "1.10"`
- **Target Files**:
  - `src/native/rust/src/lib.rs`
  - `src/native/DiskSentinelEngine.h`
  - `src/native/DiskSentinelEngine.cpp`
  - `src/utils/nativeDllBridge.ts`
  - `src/components/ParallelDriveScanModal.tsx`
  - `src/components/Navbar.tsx`
  - `src/App.tsx`
- **Implementation Plan**:
  1. `DSMultiDriveScanTarget` 및 `DSMultiDriveScanSummary` 구조체 C ABI 표준화.
  2. `DS_ScanMultipleDrivesParallel`: `rayon::ThreadPoolBuilder` 기반 동시 스레드 상한 제어 및 `par_iter()` 병렬 드라이브 I/O 디스패치.
  3. `ParallelDriveScanModal.tsx`: 복수 드라이브 동시 선택 체크박스, 스레드 수 슬라이더(1~16), 동시 진행률 바, 블록 지연시간 및 결함 카운터 실시간 시각화.
  4. 네비게이션 바 및 모바일 퀵메뉴에 'Rayon 병렬 스캔' 바로가기 연결.
- **Acceptance Criteria**:
  - 복수 디스크 동시 병렬 스캔 파이프라인 무결성 확보 및 실시간 진척도 업데이트.
- **Validation**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (0 errors)
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-RUST-08] System Tray Guardian Daemon & Heuristic Bit Carving Recovery Engine (Phase 3)
- **Description**: 
  1. 극저자원 상주 시스템 트레이 가디언 데몬(S.M.A.R.T. 및 온도 실시간 백그라운드 추적 및 풍선 도움말/웹 알림 연동).
  2. 휴리스틱 파일 매직 바이트 시그니처 분석 및 ECC 패리티 비트 플립 복구 엔진(비트 카빙).
- **Priority**: P1
- **Dependencies**: Native Rust Core, Win32 I/O, Web Notifications API
- **Target Files**:
  - `src/native/rust/src/lib.rs`
  - `src/native/DiskSentinelEngine.h`
  - `src/native/DiskSentinelEngine.cpp`
  - `src/utils/nativeDllBridge.ts`
  - `src/components/TrayGuardianModal.tsx`
  - `src/components/BitCarvingRecoveryModal.tsx`
  - `src/components/SectorGrid.tsx`
  - `src/components/Navbar.tsx`
  - `src/App.tsx`
- **Implementation Plan**:
  1. `DSTrayGuardianStatus` 구조체 및 `DS_ConfigureTrayGuardian`, `DS_RunTrayGuardianCheck` 네이티브 구현 (S.M.A.R.T. C5h/05h 및 온도 과열 55°C/60°C 임계치 감시, CPU 점유율 <0.05%).
  2. `TrayGuardianModal.tsx`: 실시간 가디언 데몬 상주 상태, 폴링 주기 선택(5s/10s/30s/60s), 알림 테스트 및 감시 드라이브 카드 시각화.
  3. `DSCarvedSectorResult` 구조체 및 `DS_ExecuteBitCarvingRecovery` 네이티브 구현:
     - JPEG(`FF D8 FF`), PNG(`89 50 4E 47`), PDF(`%PDF`), ZIP/Office(`PK\x03\x04`), MP4(`ftyp`), 텍스트 로그 시그니처 식별.
     - 단일/다중 비트 전치 오류에 대한 해밍/패리티 비트 플립 교정 및 수복 바이너리 추출.
  4. `BitCarvingRecoveryModal.tsx`: 타깃 LBA 입력, 클러스터 스팬(4~64 섹터) 선택, 수복 결과 요약 및 이진 헥스 덤프(Hex View) 미리보기, 수복 파일 1-클릭 다운로드 기능 지원.
  5. `SectorGrid.tsx`: 배드섹터 인스펙터 바에서 즉각적인 '비트 카빙 수복' 핫링크 버튼 연동.
- **Acceptance Criteria**:
  - 가디언 데몬 백그라운드 폴링 및 브라우저/트레이 알림 연동 정상 작동.
  - 비트 카빙 엔진에서 손상 섹터 시그니처 자동 인식 및 헥스 덤프 추출, 파일 다운로드 성공.
- **Validation**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (0 errors)
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None

---

### [TASK-DATA-01] Sequential Real Data Implementation & Fake Data Elimination
- **Description**: 
  1. 가짜 목업 드라이브 목록(삼성 980 Pro, 시게이트 바라쿠다 등 11종 하드코딩)이 기본 표시되던 문제를 수정하여, 실제 로컬 호스트 저장장치(`createNativeHostDrive()`) 및 사용자가 마운트한 실제 디렉토리/파일이 최우선으로 로드되도록 개편.
  2. 하드코딩된 가상 시뮬레이션 프리셋은 `[가상 데모 프리셋]`으로 명확히 분리 격리하고 기본 숨김 처리(토글 가능).
  3. 실시간 하드웨어 바이탈(온도, 전력 W/mA, 스핀들 RPM)을 고정값 대신 실제 I/O 스루풋(MB/s), CPU 지연 시간, SSD 무소음 전자식 회전수(0 RPM) 및 실제 물리 디스크 특성으로 동적 계산.
  4. NVMe Deep Telemetry(Log Page 02h)에 실제 스토리지 쿼터 및 누적 읽기/쓰기 바이트 연동.
  5. 비트 카빙 복구 엔진(`DS_ExecuteBitCarvingRecovery`)에서 실제 파일 첨부 시 `attachedFile.slice()`를 통한 실제 물리 바이트 슬라이싱 및 실제 매직 바이트(JPEG, PNG, PDF, ZIP 등) 추출 구현.
  6. 시스템 트레이 가디언의 감시 대상 드라이브 수 및 최고 온도를 실제 등록된 드라이브 리스트와 실시간 동기화.
  7. GitHub 실시간 업데이트 팝업이 무조건 뜨던 가짜 동작(`hasUpdate = true`)을 실제 GitHub API 릴리즈 태그 버전 대조 로직으로 완전 전환.
  8. 검사 이력 탭의 가짜 기준 데이터 배제 및 실제 수행된 검사 세션만 영구 보관/대조하도록 보장.
- **Priority**: P0
- **Dependencies**: Native Drive Engine, Web Storage API, W3C File System Access API
- **Target Files**:
  - `src/App.tsx`
  - `src/utils/drivePresets.ts`
  - `src/utils/nativeDriveEngine.ts`
  - `src/utils/hardwareTelemetry.ts`
  - `src/utils/nativeDllBridge.ts`
  - `src/components/Navbar.tsx`
  - `src/components/BitCarvingRecoveryModal.tsx`
  - `src/components/TrayGuardianModal.tsx`
  - `src/components/HistoryAndComparison.tsx`
- **Acceptance Criteria**:
  - 앱 구동 시 가짜 장치가 아닌 실제 호스트 저장장치 및 마운트된 장치만 표시.
  - 가상 데모 프리셋은 사용자가 명시적으로 토글할 때만 보조 표시.
  - 모든 수치 및 바이탈이 실제 측정치 및 하드웨어 스펙 기반으로 산출.
- **Validation**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (0 errors)
- **Current Status**: `VERIFIED`
- **Remaining Blockers**: None



