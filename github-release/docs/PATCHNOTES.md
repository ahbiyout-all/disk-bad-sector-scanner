# DiskSentinel Pro (디스크 배드섹터 검사기) - Patch Notes & Versions

All notable changes to this project will be documented in this file. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (MAJOR.MINOR.PATCH).

---

## [v4.4.0] - 2026-10-11
### Added
- **GitHub 핵심 빌드 전용 자동 번들링 스크립트 및 전용 스테이징 폴더 구축**:
  - 프로젝트 깃허브(`https://github.com/AhBiYout-all/disk-bad-sector-scanner`) 푸시 및 배포 시 실제 빌드에 꼭 필요한 핵심 파일(`src/`, `public/`, `docs/`, `scripts/`, `.github/`, 빌드 설정)만을 격리 추출하여 스테이징하는 전용 자동화 스크립트(`scripts/bundle-essential-release.mjs`) 및 전용 폴더(`.github-release/`) 생성.
  - `git-push-auto.bat` 파이프라인을 고도화하여 빌드 캐시, `node_modules/`, 불필요한 바이너리를 제외하고 필수 소스 및 설정 파일만을 자동 검증·스테이징·푸시하도록 통제.
  - `package.json`에 `bundle:release` 전용 스크립트 등록 및 `.gitignore` 무결성 검증.
- **배드섹터 복구 예상 처리 완료 시간 실시간 연산 및 안내 엔진 (`SmartRemapModal.tsx`)**:
  - 선택된 복구 방식의 알고리즘 난이도 가중치(표준 제로필 1.0x, 심층 ECC 패리티 2.2x, 저수준 펌웨어 강제 치환 4.0x)와 디스크 매체별 속도 프로필(NVMe PCIe 2,500MB/s, SATA/외장 SSD 500MB/s, 기계식 HDD 120MB/s, USB 40MB/s)을 결합하여 총 예상 처리 시간 및 완료 시각 실시간 계산/표시.
  - 수복 로그 터미널 헤더에 대상 LBA 블록 개수, 적용 알고리즘, 디스크 속도 및 완료 예정 시각 실시간 브리핑.
- **파일 시스템 손상 경고 및 중요 데이터 백업 권장 2단계 워크플로우 팝업**:
  - 수복 작업 시작 전, 현재 배드섹터 상태가 파일 시스템 메타데이터(NTFS MFT, Linux Superblock, FAT/APFS 구조체) 손상 및 데이터 유실 위험을 내포하고 있음을 명시적으로 경고.
  - 중요 데이터 백업 권장 가이드라인을 제공하는 모달 팝업 워크플로우를 통합하여 데이터 보존 확인 후 안전하게 복구가 진행되도록 보장.
- **순수 데스크톱 전용 특화 아키텍처 확립**:
  - 모바일 가상 진단 요소를 제거하고 실제 PC 호스트 드라이브(`createNativeHostDrive`), 로컬 스토리지 파일(`createNativeDriveFromFile`), Web Memory DMA 벤치마크 및 외장 USB/SSD/HDD 데스크톱 환경 진단에 전념하도록 구조 최적화.

### Fixed
- **불필요한 아이콘 임포트 및 미사용 참조 정리**:
  - `App.tsx` 내 사용되지 않는 `Smartphone` 아이콘 참조 정리 및 정적 타입 무결성 검증.
- **Inno Setup 및 패키징 버전 동기화**:
  - `package.json`, `setup.iss`, `src/config/projectInfo.ts` 버전을 4.4.0으로 전면 동기화.

---

## [v4.3.1] - 2026-10-07
### Added
- **Inno Setup 설치 폴더 경로 직접 지정**:
  - 기본 설치 폴더 경로를 `{autopf}` 대신 OS 루트 드라이브의 `C:\DiskSentinelPro`로 직접 지정 및 매핑하여 폴더 접근성을 대폭 향상하고 권한 충돌 완벽 차단.
  - 인스톨러 내의 디렉토리 선택 창 활성화 (`DisableDirPage=no`)를 보장하여 사용자가 직접 원하는 특정 설치 경로로 명확히 바꿀 수 있도록 조치.
  - 앱 버전 4.3.1 승격에 따라 인스톨러 결과물 명칭 (`DiskSentinel_Setup_v4.3.1.exe`) 및 윈도우 인바운드 방화벽 규칙 정보 자동 갱신 적용.
- **로컬 파일 프로토콜 및 웹뷰 흰 화면 수정**:
  - `vite.config.ts` 빌드 기본 경로(base)를 상대 경로인 `./`로 수정하여 로컬 디렉토리에서 바로 실행하거나 (`file:///C:/DiskSentinelPro/index.html` 더블 클릭) 네이티브 래퍼 엔진에서 구동할 때 CSS/JS 에셋이 깨지지 않고 정상 연동되도록 조치.

### Fixed
- **React 19 런타임 Hook 순서 에러 ("Expected static flag was missing") 해결**:
  - `MobileDiagnosticsModal` 내부의 React Hook(`useState`, `useEffect`) 호출보다 앞서 존재하던 조건부 조기 반환(`if (!isOpen) return null;`) 순서를 수정하여 React Rules of Hooks 준수.
  - `App.tsx`에서 모달 렌더링을 조건부 마운트 방식으로 개편하여 백그라운드 렌더링 리소스 낭비 및 정적 트리 불일치 에러 완전 차단.

---

## [v4.3.0] - 2026-10-07
### Added
- **보고서 내보내기 (Export CSV) 기능 구현**: `ErrorLogStream` 컴포넌트에 감지된 모든 배드섹터 및 지연 섹터 정보를 깔끔한 CSV 파일로 다운로드할 수 있는 '보고서 내보내기' 버튼 추가. 한글 깨짐 방지를 위해 UTF-8 BOM (`\uFEFF`) 인코딩 완벽 적용.
- **Inno Setup 인스톨러 배포 설정 (`setup.iss`)**: 
  - 폴더 풀림(Unpacked Multi-File) 방식의 개별 파일 설치 지원.
  - 기존 구동 중이거나 기존 설치된 동일 앱이 감지될 경우 사용자에게 친근한 대화상자로 삭제/덮어쓰기 여부를 묻는 스마트 인스톨러 시퀀스 탑재.
  - Windows 방화벽에 조용히(Silently) 인바운드 규칙 등록 처리 구현 (기본 이름 및 버전이 결합된 이름 동시 자동 등록).
  - 무인 설치 옵션(`/VERYSILENT /SUPPRESSMSGBOXES`) 완벽 지원.
- **Vite 로컬 자동 빌드 스크립트 (`build.bat`)**: Windows 환경(CRLF) 및 영어 메시지로 설계되었으며, `package.json`에서 버전을 동적으로 파싱하여 `.exe` 혹은 빌드 산출물 폴더명에 자동으로 `vX.Y.Z` 버전명을 붙여 패키징하며 완료 후 결과 폴더 자동 오픈.
- **실시간 자동 업데이트 알림 연동 시스템**: GitHub Releases REST API(`https://api.github.com/repos/AhBiYout-all/disk-bad-sector-scanner/releases/latest`)를 실시간 폴링하여 새 버전이 감지되면 앱 화면 최상단에 고해상도 업데이트 알림 모달 팝업 자동 활성화.
- **GitHub Actions 워크플로 최적화**: Node.js 20 Deprecated 및 지원 종료 대응을 위해 차세대 LTS 런타임인 **Node.js 22 LTS / 24 환경**으로 완벽 전환하여 노란색 빌드 경고 완전 제거.

### Fixed
- **과열 경고(Overheat Warning) 오작동 수정**: 60°C 초과 시 알림 배너가 닫힌 후 다시 한계값 돌파 시 재활성화되도록 Dismiss 상태 초기화 로직 보정.

---

## [v4.2.0] - 2026-10-06
### Added
- **실시간 온도/전력/RPM 하드웨어 모니터링 강화**: 실시간 디스크 하드웨어 상태(온도, 전력 소비량, 회전 속도 - RPM)를 보여주는 실시간 텔레메트리 보드 하단 대시보드 탑재.
- **과열 경고 알림 알람**: 디스크 실시간 온도가 임계값인 60도 초과 시 최상단 경고 알림 배너 및 실시간 경고 효과음 출력 및 로그 기록.
- **Thermal Stress Test 부하 시뮬레이션**: 사용자가 수동으로 가혹 고온 부하 상태를 시뮬레이션하여 과열 경고 알림 동작 유무를 수동 검증할 수 있는 가상 과열 시뮬레이션 토글 스위치 도입.

---

## [v4.1.0] - 2026-10-04
### Added
- **안전 잠금(Safety Lock) 안전 장치 추가**: 사용자가 실수로 S.M.A.R.T. 재할당이나 드라이브 제로필(Zero-Fill) 포맷 기능을 동작시켜 데이터 손실을 입는 현상을 방지하고자 물리적 '안전 잠금' 슬라이드 토글 추가. 잠금 상태일 때 모든 디렉티브 수정/포맷 기능 버튼 비활성화.
- **도시바(Toshiba) 정밀 검사 모듈 추가**: 도시바 특유의 M-Zone 검사 방식 및 버터플라이 탐색 알고리즘 데이터 탑재.
- **정밀진단 지원 제조사 카탈로그화**: 삼성, 웨스턴 디지털, 시게이트, 도시바, 인텔, 마이크론, 샌디스크 등 제조사별 특성에 맞는 복구 가이드라인을 제공하는 '제조사별 상세 자가 진단 및 복구 기술 명세 가이드' 모달 구현.

---

## [v4.0.0] - 2026-10-01
### Added
- **크로스 플랫폼 모바일 진단 연동**: Android (UFS/eMMC/MTP) 및 iOS 맞춤형 모바일 드라이브 정밀 진단 가상 프레임워크 설계.
- **다크 모드 고도화**: 대시보드 전체 테마 가독성 보정 알고리즘 적용 및 미려한 폰트 대비 자동 튜닝.
