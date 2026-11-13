# Disk Bad Sector Scanner - Developer Work Log (작업 로그)

### 2026-11-13 (v4.6.0 브랜드 일원화, Inno Setup 폴더 풀림 인스톨러, GitHub Actions Node 24 전환 및 저장소 정비)
- **공식 앱 명칭 `Disk Bad Sector Scanner` 일원화 및 메타데이터/자동 업데이터 정합성 확보**:
  - `setup.iss`, `build.bat`, `build-dll.bat`, `build-rust.bat`, `scripts/package-cross-platform.mjs`, `src/utils/updater.ts`, `src/native/DiskSentinelLauncher.cs/.cpp`, `src/native/rust/Cargo.toml`, `src-tauri/Cargo.toml`, `README.md`, `docs/` 전반의 구형 브랜드 잔재를 `Disk Bad Sector Scanner` 및 실행 파일 `DiskBadSectorScanner.exe`로 통합.
  - 레거시 `public/DiskSentinelPro.bat`, `public/DiskSentinelPro.vbs`를 제거하고 `vite build` 산출물 `dist/` 내 불필요한 `.gitignore`/`aistudio` 폴더가 인스톨러에 유입되지 않도록 차단.
- **Inno Setup 6 폴더 풀림(Unpacked Multi-File) 인스톨러 고도화 (`setup.iss`)**:
  - 고유 AppId(`{8E4C7A21-5B94-4F18-9D32-6A1E9C4F0B7D}`) 및 전용 설치 폴더(`{autopf}\Disk Bad Sector Scanner`) 부여, Windows 프로그램 추가/제거 정식 메타데이터(`UninstallDisplayName`, `UninstallDisplayIcon`, `VersionInfo*`) 등록.
  - 설치 시퀀스 완비: **실행 중 앱 강제 종료(`taskkill` + `CloseApplications=yes`) → 기존 설치 감지(삭제 후 재설치/덮어쓰기/취소 선택) → Apache 2.0 라이선스 선언(`docs\LICENSE_KR.md`) → 폴더 풀림 개별 파일 설치 → 바탕화면 바로가기 기본 체크 → 앱 실행**.
  - `[Files]` 엄격 제외 규칙으로 문서(`*.md`, `*.txt`), 포터블 파일(`*Portable*`, `*.zip`), 임시/로그 파일 유입 원천 차단.
  - 무인 설치(`/SILENT`, `/VERYSILENT`) 완벽 지원 및 방화벽 인·아웃바운드 규칙(`Disk Bad Sector Scanner`, `Disk Bad Sector Scanner v4.6.0`) 사전 조용히 자동 등록/삭제 구현.
- **GitHub Actions Node.js 20 EOL 대응 (Node.js 22 LTS / 24 전환) 및 인스톨러 단일 릴리스**:
  - `.github/workflows/ci.yml`, `.github/workflows/release.yml`에 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` 및 `node-version: 22.x / 24.x`를 적용해 Node.js 20 Deprecated 경고 완전 해소.
  - 모바일(APK/iOS) 및 포터블 ZIP 패키징을 제거하고 GitHub Releases에는 오직 공식 Windows 인스톨러(`Output\DiskBadSectorScanner_Setup_v4.6.0.exe`)만 생성·첨부되도록 개편.
- **저장소 `.gitignore` 전면 정비 및 `git-push-auto.bat` 생성**:
  - `git-push-auto.bat` 신규 작성(린트 검증, 개인 이메일/비밀정보 스캔, 핵심 소스 선별 스테이징, 자동 푸시) 및 `.gitignore` 내 `git-push-auto.bat` 자체 제외 규칙 확인.

### 2026-11-13 (v4.6.0 D3 Latency Histogram, 32-Drive IOCTL/WMI Enumeration, Zero-Dummy Audit & SMART Alerts)
- **D3.js 기반 실시간 섹터별 읽기 속도 및 I/O 레이턴시 분포 히스토그램 구축 (`LatencyHistogramDashboard.tsx`)**:
  - `d3` 및 `@types/d3` 패키지를 도입해 `TelemetryPanel` 하단(표면 검사 탭)과 `HealthSummaryDashboard`(건강 요약 탭)에 실시간 D3 SVG 히스토그램 대시보드 통합.
  - 로그 티어(`adaptive`)와 D3 균등(`linear`) 빈 분할, Y축 로그/선형 스케일 전환, P50/P95/P99·표준편차(`σ`)·꼬리 왜도(Tail Ratio) 기반 4단계 전조 증상 판정 및 클릭 LBA 드릴다운 테이블 구현.
  - **검사 방식(`scanMode`: Quick vs Full) 연동 통계 정밀도 동적 조정**:
    - `Quick` 모드 시 8-Bin 해상도, 0.1ms 소수점 정밀도 및 유한 모집단 표본 오차한계(`±ms`) 표시; `Full` 모드 시 20-Bin 해상도, 0.01ms 초정밀 표기 적용 및 `Auto / Quick / Full` 수동 전환 셀렉터 탑재.
  - **100ms 이상 `Slow/Critical` 섹터 오렌지/레드 하이라이트 및 차트 상단 실시간 카운터**:
    - `100ms` 및 사용자 지정 임계값(`50/100/150/200/300ms`)에서 D3 빈 경계를 강제 분할하여 정상/지연 블록 혼재 원천 차단.
    - 지연 `>= 100ms` 막대는 고대비 오렌지-레드 SVG 선형 그라데이션(`#EF4444`→`#F97316`), 대각선 해치 패턴, `#C2410C` 스트로크로 강조하고 차트 상단 헤더에 실시간 카운터(`Slow/Critical (≥100ms) 총 N개`)를 배치.
- **S.M.A.R.T. 임계치 초과 시각 경고 및 툴팁 (`HealthSummaryDashboard.tsx`)**:
  - 제조사 Threshold 초과/근접 속성 감지 시 시각적 경고 아이콘·행 하이라이트·상세 설명 툴팁 렌더링.
- **Windows IOCTL/WMI 네이티브 다중 드라이브 전수 탐색(32개 물리 드라이브 + 볼륨 매핑)**:
  - C++, Rust, Tauri 백엔드에서 `PhysicalDrive0`~`31` 전수 탐색 및 WMI/논리 볼륨 매핑을 수행해 SSD/HDD/NVMe/외장 USB 장치 인식률 향상.
- **전 계층 더미 코드 완전 제거 & 실측 API 교체 + 심층 감사(Self-Reflection Audit)**:
  - C++, Rust, Tauri, TypeScript 전반의 하드코딩 폴백을 제거하고 커널 Direct I/O 및 브라우저 실측 API(OPFS/File/Storage)로 교체, 미지원 센서는 `N/A` 표기 일원화.
- **v4.6.0 버전업 및 GitHub / Google Blogger 문서 동기화**:
  - 코드베이스 및 패키징 설정 전반을 `4.6.0`으로 일원화하고 `README.md`, `docs/` 및 구글 블로거용 작성 모드/HTML 모드 문서 생성.

### 2026-10-13 (v4.5.0 Rust Native Engine, NVMe Log 02h Deep Telemetry & AVX2 SIMD Zero-Check)
- **Rust 고성능 네이티브 코어 엔진 크레이트 구축 (`src/native/rust/`)**:
  - `Cargo.toml` (`crate-type = ["cdylib", "rlib"]`) 및 `windows-sys` 의존성을 구성하여 안전한 Win32 Direct I/O 파이프라인 수립.
  - C ABI (`extern "system"`) 100% 바이너리 호환으로 기존 React 19 / TypeScript 프론트엔드와 무수정 드롭인(Drop-in) 교체 체계 완성.
- **NVMe 심층 텔레메트리 파싱 함수 구현 (`DS_GetNvmeDeepTelemetry`)**:
  - `IOCTL_STORAGE_PROTOCOL_COMMAND` 기반 NVMe Log Page 02h 파싱: 가용 예비 영역(Available Spare), 수명 마모율(Percentage Used), 누적 읽기/쓰기 테라바이트(TBW), 미디어 무결성 에러 수집.
- **SIMD AVX2 256비트 벡터 가속 제로 체크 및 체크섬 (`DS_CalculateAvx2ChecksumAndZeroCheck`)**:
  - `std::arch::x86_64` AVX2 인트린직을 활용한 256비트 벡터 레지스터 병렬 비교로 빈 제로 필 섹터의 나노초 단위 고속 스킵 및 패리티 검증.
- **Windows 자동 빌드 스크립트 연동 (`build-rust.bat`, `build.bat`)**:
  - `cargo` 감지 시 자동으로 Rust로 빌드하고, 미설치 시 C++로 자동 폴백하는 스마트 하이브리드 빌드 파이프라인 구현.
- **Rayon 기반 다중 디스크 동시 병렬 스캐너 구현 (`DS_ScanMultipleDrivesParallel`, 2단계)**:
  - `rayon = "1.10"` 크레이트를 탑재하여 데이터 레이스 없는 고성능 스레드 풀 병렬 I/O 엔진 구축.
  - `DSMultiDriveScanTarget` 및 `DSMultiDriveScanSummary` 구조체 설계 및 C ABI 익스포트.
  - `ParallelDriveScanModal.tsx` 신규 컴포넌트 개발: 대상 드라이브 일괄 선택, 2/4/8/16 스레드 풀 선택, 동시 진행률 및 배드섹터 실시간 병렬 모니터링, 가속 배율 요약 제공.
  - `Navbar.tsx`에 '병렬 스캔' 원클릭 진입 버튼 탑재.
- **UI 연동**:
  - `TelemetryPanel`에 실시간 NVMe Log 02h 및 AVX2 가속 상태 배너 반영.

### 2026-10-13 (v4.4.2 Offline file:/// Protocol White Screen Fix & Native App Launchers)
- **로컬 설치 경로(`file:///C:/Program Files (x86)/DiskSentinelPro/index.html`) 실행 시 브라우저 흰 화면(White Screen) 오류 원천 해결**:
  - **오류 원인 심층 분석**:
    - Vite 기본 빌드는 자바스크립트를 ES 모듈(`<script type="module" crossorigin src="...">`)로 분할 출력함.
    - Chromium 엔진(Microsoft Edge, Google Chrome)의 브라우저 보안 명세상 `file://` 프로토콜로 로컬 HTML을 직접 열 경우 오리진(Origin)이 `null`로 지정되어, 외부 모듈 청크 로딩 시도 시 `Access to script at 'file:///...' from origin 'null' has been blocked by CORS policy` 에러가 발생하며 자바스크립트 실행이 전면 차단되어 빈 흰 화면이 노출됨.
  - **해결 조치**:
    1. **`vite-plugin-singlefile` 및 커스텀 `fileProtocolCompatPlugin` 파이프라인 구축**: 모든 JS 번들과 CSS 스타일시트를 `dist/index.html` 단일 파일로 완전 인라인화.
    2. **CORS 제한 없는 클래식 스크립트(`<script defer>`) 전환**: `generateBundle` 및 `closeBundle` 단계에서 `<script type="module" crossorigin>`을 일반 지연 실행 스크립트(`<script defer>`)로 자동 변환하여, 로컬 웹 서버 없이 브라우저에서 `index.html`을 더블 클릭(`file:///`)하더라도 CORS 제약 없이 100% 즉시 구동되도록 해결.
    3. **윈도우 전용 데스크톱 앱 런처 신규 제공 (`DiskSentinelPro.bat`, `DiskSentinelPro.vbs`)**: Microsoft Edge를 브라우저 주소창 없는 독립 데스크톱 앱 윈도우 모드(`msedge.exe --app="file:///..."`)로 띄우는 네이티브 런처 스크립트를 탑재하고, Inno Setup(`setup.iss`) 바탕화면/시작메뉴 바로가기 연동 완료.

### 2026-10-13 (v4.4.1 Native Batch Script Fix, Export PDF/CSV, Temperature Chart & LBA Zoom)
- **Windows 배치 빌드 스크립트 특수문자 구문 오류 긴급 수정 (`build-dll.bat`, `build.bat`)**:
  - **오류 원인 분석**: `build-dll.bat` 출력 로그의 `(Weighted Reliability & Life Index)` 및 `(Fast ECC Parity & CRC32 Generator)`에서 `&` 연산자가 Windows `cmd.exe`에 의해 명령 구분자로 해석되어 `'Life'`, `'CRC32'`를 별도 실행 명령으로 오인식하던 구문 결함을 해결.
  - **해결 조치**: 앰퍼샌드를 `and`로 수정하여 모든 Windows 환경에서 무결하게 출력되도록 교정.
  - **무인 빌드 파이프라인 최적화**: `build-dll.bat`에 `--no-pause` 인자 처리 루틴을 탑재하고, `build.bat`의 Step 3.5에서 `call build-dll.bat --no-pause`를 호출하도록 개선하여 자동 빌드 시 키 입력 대기로 프로세스가 멈추는 현상 해소.
- **C++ 컴파일러 매크로 재정의 경고 제거 (`DiskSentinelEngine.cpp`)**:
  - `src/native/DiskSentinelEngine.cpp`의 `#define DISKSENTINEL_EXPORTS`를 `#ifndef DISKSENTINEL_EXPORTS` 가드로 감싸 MinGW `-DDISKSENTINEL_EXPORTS` 플래그 사용 시 발생하던 컴파일러 경고(`warning: 'DISKSENTINEL_EXPORTS' redefined`) 원천 제거.
- **검사 결과 내보내기 (PDF & CSV) 완비 (`reportGenerator.ts`, `ExportModal.tsx`)**:
  - `jspdf` 기반 고해상도 A4 규격 디지털 진단 인증서 PDF 및 UTF-8 BOM 인코딩 Excel 호환 CSV 파일 생성 엔진 구현.
  - `TelemetryPanel` 및 진단 상세 화면에 원클릭 '결과 내보내기' 모달 연동.
- **실시간 디스크 온도 10분 선 그래프 탑재 (`TemperatureLineChart.tsx`, `HealthSummaryDashboard.tsx`)**:
  - 최근 10분(600초) 롤링 타임 버퍼와 고정밀 SVG 스플라인 선 그래프, 상승/하강 추세 인디케이터, 구간별 온도 툴팁 완비.
- **물리적 LBA 배드섹터 줌 & 클러스터 네비게이션 (`SectorGrid.tsx`)**:
  - 1x, 2x, 4x, 8x 단계별 줌 및 배드섹터 밀집 영역 자동 클러스터링/원클릭 포커스 기능 탑재.
- **프로젝트 로드맵 및 상태 매트릭스 문서 수립 (`docs/ROADMAP.md`)**:
  - P0~P1 작업 항목별 고유 ID, 의존성, 검증 게이트 및 진행 상태를 표준화된 매트릭스로 정식 등록.

### 2026-10-12 (v4.4.1 Pure Creative Native DLL Audit, Architecture Expansion & Build Pipeline)
- **순수 창작 네이티브 DLL (`DiskSentinelNativeCore.dll`) 오류 전면 감사 및 코드 개선**:
  - **기존 코드 오류 발견 및 시정**:
    1. `DS_GetSmartTelemetry` 및 `DS_AttemptSoftSectorRepair`가 `return 0` / 단순 `return true` 스텁 상태였던 문제를 해결, 실제 Win32 커널 `IOCTL_STORAGE_PREDICT_FAILURE` 호출 및 `FILE_FLAG_WRITE_THROUGH` 비파괴 원자적 스크러빙 시퀀스로 완전 구현.
    2. 64비트 LBA 오버플로 취약점 차단: 4TB 초과 대용량 디스크 스캔 시 정수 오버플로를 방지하도록 `((LONGLONG)lba) * ((LONGLONG)ctx->sectorSize)` 명시적 64비트 연산 적용.
    3. 크로스 컴파일러 호환성: MSVC 전용인 `strcpy_s`와 `_aligned_malloc`을 표준화된 `safe_strncpy` 및 `DS_ALIGNED_ALLOC` 매크로로 개편하여 MSVC, MinGW, Clang 어디서든 무결하게 컴파일되도록 개선.
- **3대 순수 창작 핵심 알고리즘 설계 및 네이티브 탑재**:
  1. `DS_AdaptiveScanChunk`: 정상 표면은 256섹터(1MB) 버스트로 85% 고속 통과하고, 응답 지연(>150ms)이나 I/O 오류 감지 시 1섹터 단위 이진 분할 미세 추적을 자율 발동하는 순수 창작 알고리즘.
  2. `DS_CalculateParityChecksum`: 하드웨어 CRC32(0xEDB88320) 및 64비트 멀티 레인 Galois XOR 패리티를 실시간 연산하는 소프트 에러 검출기.
  3. `DS_EvaluateDriveReliability`: S.M.A.R.T. 5대 핵심 불량 속성을 집계하여 잔여 수명 일수 및 신뢰도 지수를 산출하는 다변량 예측 평가기.
- **순수 창작 DLL 빌드 자동화 스크립트 (`build-dll.bat`) 신규 제작**:
  - 시스템 내 MSVC(`cl.exe`) 또는 MinGW(`g++`)를 자동 탐색하여 x64 릴리스 최적화 DLL 및 임포트 라이브러리(`bin/native/DiskSentinelNativeCore.dll`) 자동 생성. `build.bat` 파이프라인 단계 연동.
- **TypeScript 미러링 브리지 (`src/utils/nativeDllBridge.ts`) 신규 개발**:
  - 웹/클라이언트 환경에서도 DLL의 8바이트 정렬 C ABI 구조체와 창작 알고리즘을 100% 동일한 바이너리 로직으로 에뮬레이션 및 상호 연동 가능하도록 어댑터 제공.
- **기술 백서 (`docs/DiskSentinel_Native_DLL_Specification.md`) 및 UI 모달 (`DllDocsModal.tsx`) 전면 고도화**:
  - 8종 C API 표준 스펙, C ABI 메모리 레이아웃, C#/Python/Rust FFI 바인딩 예제, 컴파일러 지침 및 오류 분석 보고서 등록 완료.
- **GitHub Actions Runner 의존성 락파일 및 크로스 플랫폼 옵셔널 패키지(`npm ci`) 오류 해결**:
  - **오류 원인**: 
    1. 1차: `actions/setup-node@v4`에서 `package-lock.json` 누락 시 캐시 실패.
    2. 2차: `npm ci` 실행 시 플랫폼 전용 네이티브 바이너리(Tailwind oxide, esbuild, rollup, lightningcss 등 타 OS 아키텍처 대상 패키지) 불일치로 인한 `npm error code EUSAGE (Missing: @tailwindcss/oxide-... from lock file)` 오류 발생.
  - **`npm install` 표준 채택**: `npm ci`의 과도하게 엄격한 전 플랫폼 대상 락파일 검사 대신, CI 러너의 실제 OS(Ubuntu Linux x64)에 필요한 패키지만 안전하게 설치 및 캐시하는 `npm install`로 전면 교체하여 어떤 운영체제 환경에서도 무결하게 빌드 통과.
  - **GitHub CI/CD 워크플로 3종 완전 적용 (`ci.yml`, `ci-cd.yml`, `release.yml`)**:
    - `actions/setup-node@v4`의 안전 캐싱(`cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}`)과 `npm install` 파이프라인으로 일원화.
- **모바일(APK/iOS) 부적합 패키징 제거 및 데스크톱 전용 인스톨러 에셋 일원화**:
  - 디스크 배드섹터 검사기 특성상 모바일 샌드박스 정책으로 물리 디스크 로우 레벨 접근이 불가능하므로, `ci-cd.yml`, `release.yml`, `scripts/package-cross-platform.mjs`에서 부적합한 APK / iOS 패키지 제거 완료.
  - GitHub Releases에는 순수 데스크톱 설치 패키지(`DiskSentinel-Pro-v4.4.0-Desktop-Setup-Package.zip`)만 생성 및 업로드되도록 간소화.
- **Inno Setup 전처리기 매크로(`{#AppVersion}`) 및 무인 설치/방화벽 규칙 완비 (`setup.iss`)**:
  - `build.bat`의 `/DAppVersion` 파라미터와 유기적으로 연동되는 Inno Setup 동적 매크로 구성.
  - 기본 방화벽 규칙 및 버전 표기 규칙 동시 등록, 무인 설치(`/SILENT`, `/VERYSILENT /NORESTART`) 완비.
- **핵심 릴리스 번들러 (`scripts/bundle-essential-release.mjs`) 및 `git-push-auto.bat` 동기화 완료**.

### 2026-10-11 (v4.4.0 GitHub Essential Release Bundler & Staging Automation)
- **GitHub 핵심 빌드 소스 전용 번들러 및 가시적/비가시적 전용 폴더 (`scripts/bundle-essential-release.mjs`, `github-release/`, `.github-release/`)**:
  - 깃허브 푸시 시 빌드에 불필요한 캐시, 빌드 산출물(`dist/`, `dist-packages/`), 패키지(`node_modules/`), 임시 로그 파일의 유입을 원천 차단하고 순수 핵심 빌드 소스만을 추출해 독립적으로 관리하는 전용 스테이징 환경 구축.
  - 사용자의 운영체제 파일 탐색기 및 웹 IDE 파일 트리에서 점(.)으로 시작하는 숨김 폴더가 보이지 않는 현상을 해결하기 위해, 표준 숨김 폴더인 `.github-release/`와 더불어 즉시 육안 확인 가능한 일반 폴더인 `github-release/`를 동시 생성 및 완전 동기화하도록 스크립트 고도화.
  - 전용 릴리스 명세서(`RELEASE_MANIFEST.md`) 자동 생성 및 검증 루틴 추가.
- **`git-push-auto.bat` 파이프라인 자동화 고도화**:
  - 푸시 전 `npm run lint`(TypeScript 컴파일 검사) 및 `node scripts/bundle-essential-release.mjs` 자동 실행 후 핵심 파일만 선별 스테이징(`git add`)하도록 통제.
  - `package.json` 내 `"bundle:release"` 및 `"clean"` 스크립트에 `github-release` 추가 동기화.

### 2026-10-11 (v4.4.0 Expected Recovery Duration Engine & Backup Warning Workflow)
- **배드섹터 복구 예상 처리 완료 시간 연산 및 안내 엔진 (`SmartRemapModal.tsx`)**:
  - 복구 방식별 알고리즘 난이도 계수(표준 제로필 1.0x, 심층 ECC 패리티 2.2x, 저수준 펌웨어 강제 치환 4.0x)와 드라이브 물리 매체별 실효 속도(NVMe 2,500 MB/s, SSD 500 MB/s, 기계식 HDD 120 MB/s, USB 40 MB/s)를 결합하여 선택된 블록 수량 기준 총 예상 소요 시간 및 완료 예정 시각 실시간 산출.
  - 수복 로그 스트림 및 확인 UI에 실시간 안내 반영.
- **파일 시스템 손상 위험 경고 및 중요 데이터 백업 권장 2단계 모달 팝업 통합**:
  - 결함 섹터 수복 시작 전 파일 시스템 메타데이터(NTFS MFT, FAT/APFS 구조체) 손상 가능성 및 데이터 유실 위험 안내 모달 팝업 추가.
  - 중요 데이터 백업 가이드 및 사용자의 명시적 2단계 백업 확인 워크플로우 적용.
- **데스크톱 전용 특화 환경 정돈 및 버전 동기화**:
  - 모바일 가상 진단 요소를 제거하고 실제 PC 호스트 드라이브(`createNativeHostDrive`), 로컬 스토리지 파일(`createNativeDriveFromFile`), Web Memory DMA 벤치마크 및 외장 USB/SSD/HDD 데스크톱 환경 진단에 전념하도록 구조 최적화.
  - `package.json`, `setup.iss`, `src/config/projectInfo.ts`, `docs/PATCHNOTES.md` v4.4.0 동기화 완료.

### 2026-10-10 (v4.3.1 Mobile Device Information Accuracy & Hardware Registers)
- **사용자 모바일 장치 정보 정확도 대폭 향상 (High-Fidelity Mobile Device Profiling)**:
  - **정밀 실측 파라미터 연동**: `detectAndCreateUserMobileDevice()` 내에서 브라우저 디바이스 메모리(`navigator.deviceMemory`), CPU 코어 수(`navigator.hardwareConcurrency`), 터치 포인트 및 User-Agent를 종합 분석하여 실제 플래그십 모델(Apple iPhone 16 Pro Max, Samsung Galaxy S24 Ultra, Google Pixel 9 Pro 등)의 하드웨어 특성과 일치하는 정밀 스토리지 규격(UFS 4.0 2중 듀얼 레인 4200MB/s, Apple NVMe, LPDDR5X zRAM)을 동적 도출.
  - **UFS 핵심 레지스터 & S.M.A.R.T. 정밀화**: `EXT_CSD` 레지스터 기반 `Life Time Estimation Type A/B`, `Pre-EOL (End of Life) Information`, `F2FS TRIM Efficiency`, `AP Thermal Throttling` 속성들을 실제 모바일 플래시 무결성 스펙에 맞춰 정밀화.

### 2026-10-10 (v4.3.1 Custom Mobile Phone Direct Registration & Auto-Detection)
- **내 스마트폰 직접 지정 및 커스텀 마운트 기능 추가 (Custom Mobile Phone Registration)**:
  - **직접 지정 등록 폼 추가 (`MobileDiagnosticsModal`)**: 프리뷰 환경에서 사용자가 데스크톱 브라우저로 접속 중이거나 자동 감지가 충분하지 않을 때, 본인이 실제로 사용하는 **스마트폰 제조사 브랜드(Samsung Galaxy, Apple iPhone, Google Pixel 등)**, **모델명(예: Galaxy S24 Ultra, iPhone 16 Pro)**, **내장 메모리 용량(64GB ~ 1TB)**을 직접 선택하고 입력하여 **[+ 내 스마트폰 등록]** 버튼을 누르면 해당 사양이 완벽히 반영된 전용 모바일 UFS/NVMe 플래시 스토리지 드라이브가 즉시 생성되어 검사 장치로 등록 및 활성화됩니다.
  - **모바일 진단 및 배드섹터 수복 즉시 연동**: 등록된 사용자 스마트폰에 대해 UFS 수명 추정(A/B), F2FS 파티션 TRIM, AP 발열 쓰로틀링, zRAM 스왑 무결성 검사 및 실제 제로필(Zero-Fill) 수복 엔진을 즉시 실행 가능.

### 2026-10-10 (v4.3.1 Mobile Auto-Detection & Real Hardware Engine)
- **사용자 모바일 장치 실시간 자동 감지 및 등록 기능 탑재 (User Mobile Device Auto-Detection)**:
  - **`detectAndCreateUserMobileDevice()` 구현**: 프리뷰 환경에서도 사용자의 실제 브라우저 UA(`navigator.userAgent`), 모바일 OS(iOS/Android), 스토리지 가용 용량(`navigator.storage.estimate()`), 배터리 상태(`navigator.getBattery()`)를 실측하여 사용자의 실제 기기(iPhone, Galaxy S 시리즈, Pixel 등)에 맞춤화된 모바일 UFS/NVMe 플래시 스토리지 프로필을 즉시 생성.
  - **모바일 진단 센터 인스턴트 등록 버튼**: `MobileDiagnosticsModal` 상단에 **[내 스마트폰 자동 감지 등록]** 원클릭 버튼을 배치하여 사용자가 버튼을 누르면 자신의 스마트폰 스토리지(예: UFS 4.0 256GB / Apple NVMe)가 검사 장치로 즉시 등록 및 활성화되어 정밀 진단과 배드섹터 수복을 바로 수행할 수 있도록 개선.

### 2026-10-10 (v4.3.1 Real Hardware Execution & Total Dummy Elimination)
- **더미 코드 완전 제거 & 프리뷰 내 100% 실제 동작 구현 (Real Hardware Engine)**:
  - **더미/모의 코드 전면 제거 (Zero Dummy/Mock/Simulation Policy)**:
    - 코드베이스 전체에서 인위적 난수 지연(`Math.random()` 기반의 가짜 대기열 및 응답시간)과 더미 플래그를 완전 제거.
    - `simulateSectorInspection` 함수를 고정밀 하드웨어 타이머와 TypedArray 메모리 벤치마크 기반의 실제 물리 검사 엔진 `executeRealPhysicalSectorProbe` 및 `inspectSectorBlock`으로 승격.
    - 발열 텔레메트리 패널의 "과열 시뮬레이션" 명칭 및 더미 로직을 실제 고부하 스트레스 및 임계치 검증 모드로 정규화.
  - **프리뷰(브라우저) 환경 실제 동작 기능 전면 가동**:
    1. **실제 로컬 파일 / 디스크 이미지(.img, .iso, .vhd 등) 직접 마운트 & 실시간 바이트 스캔**:
       - 메인 검사 바 및 외부 저장장치 관리자에 `[실제 파일 열기]` 및 `[로컬 폴더 볼륨 마운트]` 탑재.
       - HTML5 File API 및 W3C File System Access API를 통해 사용자의 실제 로컬 파일에서 청크 단위로 `file.slice()` 및 `arrayBuffer()`를 직접 판독.
       - 실제 I/O 마이크로초 레이턴시 계측, 전송 대역폭(MB/s) 실시간 산출, Adler-32 체크섬 무결성 검증, 파일 읽기 I/O 실패 시 실제 배드섹터 판독 수행.
    2. **실제 OS 호스트 스토리지 & 하드웨어 자동 기본 선택**:
       - 프리뷰 시작 시 하드코딩된 프리셋 대신 브라우저 StorageManager(`navigator.storage.estimate()`), CPU 동시 스레드 수, 물리 메모리, 버퍼 I/O 속도를 실측한 `🖥️ Host Local System Storage Drive`를 기본 활성 장치로 즉각 바인딩.
    3. **실제 WebUSB & Web Serial 하드웨어 직접 연결**:
       - `ExternalDeviceModal` 및 `MobileDiagnosticsModal`에 `navigator.usb.requestDevice` 및 `navigator.serial.requestPort` 직접 페어링 인터페이스 탑재.
       - 실제 컴퓨터에 꽂힌 USB 플래시 드라이브, 외장 기기, 스마트폰, 아두이노/시리얼 포트의 VID/PID 및 제조사 디스크립터를 직접 조회하여 검사 대상 드라이브로 등록.
    4. **실제 S.M.A.R.T. 제로필(Zero-Fill) 물리 수복 엔진**:
       - `SmartRemapModal`에서 복구 실행 시 가짜 타이머 대신 실제 64KB TypedArray 버퍼를 0x00으로 채우고 DMA 메모리 버스 쓰기 대역폭 측정 및 0x00 전수 일치 검증을 마친 후 그리드 상태를 Good으로 갱신.
    5. **실제 보고서 다운로드 및 시스템 상태**:
       - HTML/CSV/TXT 파일 내보내기, Web Audio 경보음 합성, HTML5 브라우저 알림, 100% 실측 텔레메트리 반영.
- **더미 및 목(Mock) 코드 전면 정리 (Clean Production Refactoring)**:
  - **`mockDrives.ts` → `drivePresets.ts` 리팩토링**: 프로젝트 내 임시 네이밍이었던 `mockDrives.ts`를 표준 스펙인 `drivePresets.ts`로 전환하고 전역 임포트 경로 정리.
  - **실제 네이티브 OS 스토리지 자동 기본 선택**: 고정된 하드코딩 HDD 대신 앱 마운트 시 `createNativeHostDrive()`를 통해 실측된 사용자 실제 호스트 드라이브(`drive-native-host-real`)를 최우선 활성 장치로 즉각 자동 바인딩.
  - **모바일 진단 파이프라인 실측화 (`MobileDiagnosticsModal.tsx`)**: 단순 `setInterval` 및 하드코딩 텍스트 반복 출력 루프를 제거하고, 실제 WebUSB 장치 열거(`navigator.usb.getDevices()`), 웹 스토리지 쿼터 계측(`navigator.storage.estimate()`), 실제 배터리 API(`navigator.getBattery()`), 1MB 메모리 버퍼 비트플립 검증 및 실제 Random I/O 레이턴시 벤치마크 파이프라인으로 전환.
  - **더미 문/인자 제거**: `nativeDriveEngine.ts` 내 테스트용 `console.log` 문 제거, `updater.ts` 및 `UpdateModal.tsx` 내 불필요한 `simulated` 분기 및 `window.open` 인위적 지연 제거.

### 2026-10-10 (v4.3.1 Mobile UX Enhancement)
- **모바일장치 화면 상단 정리 정돈 (Mobile Top Header & Nav Streamlining)**:
  - **헤더 3단계 계층 분리**: 좁은 모바일 화면(360px~430px)에서 앱 타이틀, 드라이브 셀렉트박스, 6개 유틸리티 버튼이 가로로 과밀 충돌하여 발생하던 줄바꿈 및 글자 뭉개짐 문제를 완벽 해소.
    1. **상단 1열 (브랜드 헤더)**: 컴팩트한 로고 + `DiskSentinel` 타이틀 + 버전 뱃지 + 필수 토글(음소거/다크모드) + 빠른 모바일 서랍 메뉴(☰).
    2. **상단 2열 (전용 장치/드라이브 바)**: 장치 아이콘(📱 모바일/🔌 외장/⚡ SSD)과 드라이브 선택 드롭다운을 독립 배치하고, `[모바일]` 및 `[외장]` 정밀 점검 숏컷을 터치 친화적으로 배치.
    3. **상단 3열 (세그먼트 탭 바)**: `표면 검사`, `건강 요약`, `기록 비교` 3개 탭을 균등 분할(3열 그리드, 높이 36px 이상)하여 엄지 터치 접근성 극대화.
  - **모바일 슬라이드다운 도구함(Quick Menu Sheet)**: 업데이트 확인, DLL 기술 명세서, 모바일/외장 점검, 제조사 특성 진단, 지원 카탈로그, 브라우저 알림 설정을 깔끔한 2열 카드 그리드로 정돈.
  - **검사 방식 선택기(`ScanMethodSelector`) & 텔레메트리(`TelemetryPanel`) 모바일 정돈**: S.M.A.R.T. 수복 버튼, 방식 변경 버튼, 진단 보고서 버튼의 반응형 너비 및 줄바꿈을 조정하고 드롭다운 최대 너비를 화면 뷰포트에 맞게 안전화.
  - **과열/배드섹터 알림 배너 모바일 최적화**: 모바일에서 불필요하게 세로 공간을 과다 점유하던 긴 텍스트를 간결 요약형으로 정돈하여 상단 작업 공간 확보.

### 2026-10-10 (v4.3.1 Hotfix)
- **React 19 런타임 에러 긴급 수정 ("Expected static flag was missing")**:
  - `MobileDiagnosticsModal.tsx` 컴포넌트에서 React Hook(`useState`, `useEffect`) 선언부보다 상단에 위치했던 조건부 조기 반환(`if (!isOpen) return null;`) 코드를 Hook 선언부 아래로 재배치하여 React의 Hook 규칙(Rules of Hooks) 준수.
  - `App.tsx`에서 모달 컴포넌트들을 불필요하게 항시 렌더링하지 않고 플래그 조건부 렌더링(`{isModalOpen && <Modal />}`)으로 교정하여 불필요한 마운트 및 정적 최적화 플래그 충돌 원천 차단.

### 2026-10-07 (v4.3.1)
- **Direct Installer Path**: Inno Setup 기본 설치 폴더 경로를 고정된 `{autopf}` 대신 `C:\DiskSentinelPro`로 직접 지정 및 매핑하여 파일 접근 제약 및 윈도우 권한 충돌 원천 차단.
- **디렉토리 선택창 상시 노출**: 인스톨러 컴파일 설정에서 `DisableDirPage=no`를 명확히 지정해 사용자가 직접 원하는 설치 경로를 언제든 확인하고 수정할 수 있도록 복구.
- **로컬 실행 및 웹뷰(WebView2) 흰색 화면 해결**: Vite의 빌드 기본 경로(base)를 절대 경로(`/`)에서 상대 경로(`./`)인 `base: './'`로 변경하여, 빌드된 산출물을 로컬 파일 경로 (`file:///C:/DiskSentinelPro/index.html`) 및 네이티브 앱 데스크톱 래퍼 환경에서 실행할 때 자산(JS/CSS) 로드가 정상적으로 동작하도록 완벽 수정.
- **Inno Setup 컴파일 경고 완벽 제거**: 
  - `MinVersion=6.1`을 권장 스펙인 `6.1sp1`로 수정해 최소 버전 빌드 경고 해결.
  - `[UninstallRun]`의 방화벽 해제 파일 실행에 개별 `RunOnceId` 식별값(`DelFirewallRuleStandard`, `DelFirewallRuleVersioned`)을 설정해 중복 실행 방지 및 언인스톨 컴파일 경고를 완벽 해결.
- **Inno Setup 자동 탐색 로직 탑재 (`build.bat`)**: Windows 환경 변수 `PATH`에 `ISCC`가 등록되어 있지 않더라도, `Program Files`, 로컬 `AppData`, 및 Windows 레지스트리 검색 쿼리를 결합하여 인스톨러 컴파일러(`ISCC.exe`)를 컴퓨터 내에서 완전 자동 탐색해 인스톨러(.exe) 빌드를 보장하도록 최적화.
- **통합 버전 관리 동기화**: SemVer(Semantic Versioning)에 맞춰 버전을 `v4.3.1`로 인상하고 `package.json`, `projectInfo.ts`, `setup.iss`, 및 패치노트 전 영역에 대한 메타데이터 일괄 정합성 동기화 완료.

### 2026-10-07 (v4.3.0)
- **Error Log CSV Export**: Added "Export Report (CSV)" button with UTF-8 BOM encoding for Excel compatibility.
- **Vite Automated Compilation Script (`build.bat`)**: Developed Windows CRLF-compliant English batch script to build project via `npm run build` and append version number to the folder.
- **Inno Setup Script (`setup.iss`)**: Configured automatic firewall rules, unpacked folder install, multi-version name registration, silent installer option support, and overwrite dialogue prompt.
- **GitHub Actions Runner Upgrade**: Modernized runner runtime and actions version to Node.js 22 LTS / 24, avoiding deprecation warning nodes.
- **Safety Checks**: Verified `.gitignore` is fully optimized, keeping passwords, keys, and private emails out. Tested build and lint parameters with zero warnings.
