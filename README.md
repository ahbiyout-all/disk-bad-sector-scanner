# Disk Bad Sector Scanner (디스크 배드섹터 정밀 검사기 v4.6.5)

> **고성능 물리 스토리지 정밀 진단 · HDDScan 방식 4종 표면 검사 · D3 레이턴시 히스토그램 · 자동 수복 엔진**  
> **Official Repository**: [https://github.com/AhBiYout-all/disk-bad-sector-scanner](https://github.com/AhBiYout-all/disk-bad-sector-scanner)  
> **Developer**: AhBiYout (`AhBiYout-all`) · **Affiliation**: [CISNet](https://www.cisnet.co.kr)  
> **Official Google Blog**: [https://ahbiyoutvibe.blogspot.com/](https://ahbiyoutvibe.blogspot.com/)  
> **License**: Apache-2.0

---

## 📌 프로젝트 소개 (Introduction)

**Disk Bad Sector Scanner**는 물리 하드 드라이브(HDD), 솔리드 스테이트 드라이브(SSD, NVMe), 외장 USB 스토리지의 표면 결함과 배드섹터(Bad Sector)를 실시간으로 스캔·진단·수복하는 **Windows 데스크톱 특화 물리 스토리지 진단 애플리케이션**입니다.

- **HDDScan 아키텍처 기반 4종 표면 검사 및 실시간 텔레메트리**:
  - **Verify / Read / Butterfly / Erase** 4종 표면 검사 프로브 및 7단계 응답 지연 버킷(`<5ms` ~ `>500ms`) 실시간 추적
  - 다중 테스트 작업 큐(Task Manager) 및 실시간 디스크 온도/전력/RPM 모니터
- **D3.js 실시간 섹터 읽기 속도 및 I/O 레이턴시 분포 히스토그램 (`LatencyHistogramDashboard`)**:
  - 실시간 P50/P95/P99, 표준편차(σ), 꼬리 왜도(Tail Ratio), Z-Score 기반 **예측 장애 분석(Predictive Failure Analysis)**
  - 선택된 검사 방식(`Quick` 8-Bin/0.1ms vs `Full` 20-Bin/0.01ms) 연동 통계 정밀도 동적 제어
  - **100ms 이상 지연(Slow/Critical) 섹터 오렌지/레드 컬러 하이라이트** 및 차트 상단 실시간 요약 카운터, 클릭 시 LBA 상세 드릴다운 지원
- **5대(Penta-DLL) 순수 창작 C++ DLL 네이티브 엔진 스위트 (`src/native/`)**:
  - **`DiskSentinelNativeCore.dll`**: Direct DMA (`VirtualAlloc` 64KB 정렬 + `StorageAdapterProperty`), Memory-Mapped Zero-Copy I/O, $O(\log K)$ 이진 분할 탐색, Slicing-by-8 CRC32 및 ATA/NVMe 패스ส루
  - **`DiskSentinelForensics.dll`**: 무의존성 Welford Z-Score 군집 탐지, $O(N \log M)$ 익스텐트 히트맵, 256-bin 섀넌 엔트로피·소거 NAND 판별, GPT IEEE 802.3 CRC32(UTF-16LE→UTF-8) & VBR 디코더
  - **`DiskSentinelPredictive.dll`**: **Weibull 욕조 곡선 잔여 수명(RUL) 예측**, **음향 탐색 RMSSD 지터·FTL 스톨 프로파일링**, **Arrhenius(0.7 eV) 열가속·TBW 수명 모델**, **중심화 OLS S.M.A.R.T. 추세 회귀** ([기술 명세서](docs/DiskSentinel_Predictive_DLL_Specification.md))
  - **`DiskSentinelRecovery.dll`**: **16+ 시그니처 카빙·Hamming 비트 반전 복원**, **NTFS `$MFT` USA/Runlist 디코더**, **NIST SP 800-88 `Xoshiro256**` 소거 패턴 생성·검증**, **ddrescue 도메인 구간 병합 플래너** ([기술 명세서](docs/DiskSentinel_Recovery_DLL_Specification.md))
  - **`DiskSentinelIntegrity.dll`**: **스트리밍 FIPS 180-4 SHA-256 + Slicing-by-8 CRC32 + FNV-1a64**, **$O((E+B)\log B)$ 익스텐트 Bit-Rot/생존성 평가**, **시점 간 S.M.A.R.T. 열화 속도(Diff)**, **플릿 Watchdog SLA 매트릭스** ([기술 명세서](docs/DiskSentinel_Integrity_DLL_Specification.md) · [모듈 레지스트리](docs/MODULES.md))
- **Windows IOCTL/WMI 네이티브 32-드라이브 전수 탐색 & 제로 더미(Zero-Dummy) 실측 엔진**:
  - `\\.\PhysicalDrive0`~`31` 물리 장치 및 논리 볼륨 매핑 정밀 인식 (SSD/HDD/NVMe/USB 자동 분류)
  - C++, Rust, Tauri, TypeScript 전 계층의 가짜/더미 폴백을 완전 제거하고 커널 Direct I/O 및 실측 텔레메트리 전면 적용 (미지원 항목 `N/A` 표기)
- **USB 버전·장치별 적응형 표면검사 매트릭스 & 위조 용량 가드**:
  - Win32 USB Hub IOCTL/PnP(`DS_ProbeUsbTopology`)로 USB 1.1~USB4, BOT/UASP/PCIe 터널, 브릿지 칩셋을 실측하고 C++/Rust I/O 엔진(`DS_ScanLbaBlockWithPolicy`) 청크·임계치·재시도·쿨다운을 동적 튜닝
  - H2testw 방식 2단계(Tier 1 읽기 전용 CRC32 앨리어싱 + OS 디스크 영구 보호 Tier 2 `Xoshiro256**` 검증/복원) 위조 용량 가드 내장 ([상세 명세서](docs/USB_Surface_Scan_Matrix_Specification.md))
- **PCIe / SATA / NVMe 링크 속도 실측·컨트롤러 매트릭스 & 플릿(Fleet) 일괄 진단**:
  - `DEVPKEY_PciDevice_*` 기반 실제 PCIe 현재/최대 레인 폭·링크 세대, SATA/NVMe 컨트롤러 규격 실측 및 대역폭 병목(Link Downgrade) 자동 경보
  - 장착된 모든 물리 디스크를 한눈에 비교하는 **전체 디스크 플릿 대시보드(`FleetOverviewDashboard`)** 및 일괄 CSV/JSON 리포트 내보내기
- **중요 폴더 LBA 익스텐트 매핑 · SHA-256 Bit-Rot 무결성 감시 & 스캔 체크포인트 재개**:
  - Win32 `FSCTL_GET_RETRIEVAL_POINTERS`로 중요 폴더/파일의 실제 물리 LBA 익스텐트 구간을 추출해 배드섹터/지연 LBA와의 중첩을 즉시 교차 추적하고 SHA-256 해시로 비트 부패(Bit-Rot) 감지
  - `scanCheckpoint` 기반 실시간 스캔 중단·재개 복구, OS 네이티브 토스트 기반 백그라운드 **Watchdog 규칙 엔진**, `Ctrl+K` 커맨드 팔레트, **S.M.A.R.T. 스냅샷 Diff & 인쇄용 진단서**, 한국어/영어(`KO/EN`) 다국어 UI 지원
- **인터랙티브 단계별 가이드, 자동 마법사 & 복구 완료 결과 모달 (`v4.6.5`)**:
  - 6대 복구 도구별 4단계 상세 가이드와 힌트를 정형화된 JSON 데이터셋(`RECOVERY_SCENARIO_GUIDES_JSON`)으로 정의하고 상단에 세련된 **Stepper UI** 및 **[자동 마법사 실행]** 버튼 제공.
  - 데이터 복구 최종 완료 시 오디오 차임벨(`soundManager.playCompletionChime()`) 재생 및 브라우저/OS **시스템 네이티브 데스크톱 알림(`window.Notification`)**을 자동 발송하는 **복구 완료 결과 요약 모달 (`RecoveryCompletionSummaryModal`)** 탑재.

---

## 📂 핵심 소스 및 파일 구조 (Repository Architecture)

저장소에는 빌드 및 배포에 꼭 필요한 핵심 소스 코드, 공식 문서, 설정 파일 및 빌드 스크립트만 포함되며, 모든 임시 캐시, 빌드 산출물, 푸시 스크립트(`git-push-auto.bat`), 개인정보는 `.gitignore`에 의해 원천 차단됩니다.

```
.
├── .github/workflows/           # GitHub Actions CI/CD (ci.yml, tauri-desktop.yml - Tauri v2 Desktop Only)
├── docs/                        # 기술 아키텍처, 네이티브 DLL 명세서, 보안 보고서, 작업로그, 패치노트
├── public/                      # 정적 웹 자산
├── scripts/                     # Unpacked 스테이징 감사 및 패키징 스크립트 (package-cross-platform.mjs)
├── src/                         # React/TypeScript UI 컴포넌트, 진단 엔진, 상태 관리
│   ├── components/              # D3 히스토그램, 섹터 그리드, 플릿 대시보드, LBA 무결성 감시, 커맨드 팔레트, S.M.A.R.T. 비교 뷰
│   ├── config/                  # 프로젝트 버전 및 GitHub 저장소 메타데이터 (projectInfo.ts)
│   ├── native/                  # C++/C#/Rust 네이티브 런처 및 5대(Penta-DLL) 순수 창작 DLL 소스 코드
│   └── utils/                   # 진단 엔진, 예측 분석, LBA 무결성·체크포인트·Diff·Watchdog·i18n·리포트 생성기
├── src-tauri/                   # Tauri v2 / Rust 데스크톱 빌드 구성
├── .env.example                 # 개발 환경 변수 템플릿
├── .gitignore                   # 빌드 산출물, 바이너리, 푸시 스크립트 및 비밀정보 제외 규칙
├── build.bat                    # Windows 원클릭 프로덕션 빌드 & Inno Setup 인스톨러 파이프라인
├── build-dll.bat                # C/C++ 네이티브 DLL & Host EXE 컴파일 배치 스크립트
├── build-rust.bat               # Rust 네이티브 코어 컴파일 배치 스크립트
├── index.html                   # HTML 진입점 및 메타데이터
├── metadata.json                # 앱 메타데이터 및 권한 정의
├── package.json                 # npm 패키지 의존성 및 스크립트 정의
├── setup.iss                    # Inno Setup 6 윈도우 인스톨러 스크립트 (Unpacked Multi-File)
├── tsconfig.json                # TypeScript 컴파일러 설정
└── vite.config.ts               # Vite 번들러 및 단일 파일 인라인 최적화 설정
```

---

## 🛠️ 빌드 및 인스톨러 패키징 가이드 (Build & Installer Packaging)

### 1. 개발 환경 요구사항
- **Node.js**: **v22 LTS / v24 권장** (Node.js 20 EOL 공식 지원 종료 대응)
- **npm**: v10.0.0 이상
- **Windows OS**: Windows 10 / 11 (네이티브 런처 컴파일 시 .NET Framework 4.0+ `csc.exe` 내장)
- *(인스톨러 컴파일 시)* **Inno Setup 6**: `setup.iss`를 통해 `Output\DiskBadSectorScanner_Setup_v4.6.0.exe` 생성

### 2. 의존성 설치 및 검증
```bash
npm install
npm run lint
npm run build
```

### 3. Windows 원클릭 인스톨러 빌드 파이프라인 (`build.bat`)
프로젝트 루트에서 `build.bat`을 실행하면 다음 단계가 전자동으로 실행됩니다:
1. `package.json`에서 최신 버전(`4.6.0`) 동적 파싱 및 Node.js 점검
2. `npm run lint` TypeScript 정적 타입 검증 & `npm run build`
3. 네이티브 엔진 5종(`DiskSentinelNativeCore.dll`, `DiskSentinelForensics.dll`, `DiskSentinelPredictive.dll`, `DiskSentinelRecovery.dll`, `DiskSentinelIntegrity.dll`) 및 데스크톱 실행 파일(`DiskBadSectorScanner.exe`) 컴파일
4. `package-cross-platform.mjs`로 불필요한 문서·포터블 파일·임시 파일 제거 감사 및 Unpacked 스테이징 검증
5. `ISCC.exe /DAppVersion=%APP_VERSION% setup.iss` 컴파일 → **`Output\DiskBadSectorScanner_Setup_v4.6.0.exe`** 단일 공식 인스톨러 생성

> **GitHub Actions 릴리스 정책**: GitHub Releases에는 **Tauri v2 데스크톱 앱(`DiskBadSectorScanner.exe`, NSIS/MSI 설치 파일)**만 생성·첨부하며, CI 워크플로우가 5종 순수 창작 DLL(`NativeCore`, `Forensics`, `Predictive`, `Recovery`, `Integrity`)을 MSVC x64로 함께 컴파일해 `bundle.resources`에 포함·스테이징합니다.

---

## 🚀 GitHub 안전 자동 푸시 (로컬 전용)

로컬 환경에서는 루트 경로의 `git-push-auto.bat`을 실행하여 타입 검사(`npm run lint`), 개인 이메일/비밀정보 스캔, `.gitignore` 검증 후 필수 파일만 원격 저장소에 푸시할 수 있습니다. (`git-push-auto.bat` 자체는 `.gitignore`에 등록되어 저장소에 업로드되지 않습니다.)

---

## 📄 라이선스 (License)

Copyright (c) 2026 AhBiYout (`AhBiYout-all`).  
Licensed under the [Apache License, Version 2.0](docs/LICENSE_EN.md).
