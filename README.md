# Disk Bad Sector Scanner (디스크 배드섹터 정밀 검사기 v4.6.0)

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
- **Windows IOCTL/WMI 네이티브 32-드라이브 전수 탐색 & 제로 더미(Zero-Dummy) 실측 엔진**:
  - `\\.\PhysicalDrive0`~`31` 물리 장치 및 논리 볼륨 매핑 정밀 인식 (SSD/HDD/NVMe/USB 자동 분류)
  - C++, Rust, Tauri, TypeScript 전 계층의 가짜/더미 폴백을 완전 제거하고 커널 Direct I/O 및 브라우저/OPFS 실측 API 전면 적용 (미지원 항목 `N/A` 표기)
- **GitHub Releases 기반 실시간 자동 업데이트 알림 & 데이터 마이그레이션**:
  - 실행 시 최신 릴리스를 자동 대조해 업데이트 팝업(버전 정보, GitHub 릴리스 링크, 다운로드 버튼) 제공
  - 사용자 설정 및 전체 검사 기록 JSON 백업/복원 지원
- **Inno Setup 6 폴더 풀림(Unpacked Multi-File) Windows 인스톨러 (`setup.iss`)**:
  - 기존 실행 중인 앱 강제 종료 → 기존 설치 감지(삭제/덮어쓰기 선택) → 라이선스 선언 → 폴더 풀림 개별 파일 설치(불필요한 문서/포터블 파일 제외) → 바탕화면 바로가기 → 자동 실행
  - Windows 프로그램 추가/제거 정식 등록, 무인 설치(`/SILENT`, `/VERYSILENT`), 기본명(`Disk Bad Sector Scanner`) 및 버전 표기(`Disk Bad Sector Scanner v4.6.0`) 방화벽 규칙 조용히 자동 등록

---

## 📂 핵심 소스 및 파일 구조 (Repository Architecture)

저장소에는 빌드 및 배포에 꼭 필요한 핵심 소스 코드, 공식 문서, 설정 파일 및 빌드 스크립트만 포함되며, 모든 임시 캐시, 빌드 산출물, 푸시 스크립트(`git-push-auto.bat`), 개인정보는 `.gitignore`에 의해 원천 차단됩니다.

```
.
├── .github/workflows/           # GitHub Actions CI/CD (ci.yml, release.yml - Node.js 22 LTS / 24)
├── docs/                        # 기술 아키텍처, 네이티브 DLL 명세서, 보안 보고서, 작업로그, 패치노트
├── public/                      # 정적 웹 자산
├── scripts/                     # Unpacked 스테이징 감사 및 패키징 스크립트 (package-cross-platform.mjs)
├── src/                         # React/TypeScript UI 컴포넌트, 진단 엔진, 상태 관리
│   ├── components/              # D3 히스토그램, 섹터 그리드, S.M.A.R.T. 대시보드, 업데이트/옵션 모달
│   ├── config/                  # 프로젝트 버전 및 GitHub 저장소 메타데이터 (projectInfo.ts)
│   ├── native/                  # C++/C#/Rust 네이티브 런처 및 Core DLL 소스 코드
│   └── utils/                   # 진단 엔진, 예측 분석, 마이그레이션, 업데이터, 리포트 생성기
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
3. 네이티브 엔진(`DiskSentinelNativeCore.dll`) 및 데스크톱 실행 파일(`DiskBadSectorScanner.exe`) 컴파일
4. `package-cross-platform.mjs`로 불필요한 문서·포터블 파일·임시 파일 제거 감사 및 Unpacked 스테이징 검증
5. `ISCC.exe /DAppVersion=%APP_VERSION% setup.iss` 컴파일 → **`Output\DiskBadSectorScanner_Setup_v4.6.0.exe`** 단일 공식 인스톨러 생성

> **GitHub Actions 릴리스 정책**: 모바일(APK/iOS) 및 포터블 ZIP은 생성하지 않으며, Node.js 22 LTS / 24 환경에서 검증 완료된 공식 Windows 설치 실행 파일(`Output/*.exe`)만 GitHub Releases 에셋으로 첨부합니다.

---

## 🚀 GitHub 안전 자동 푸시 (로컬 전용)

로컬 환경에서는 루트 경로의 `git-push-auto.bat`을 실행하여 타입 검사(`npm run lint`), 개인 이메일/비밀정보 스캔, `.gitignore` 검증 후 필수 파일만 원격 저장소에 푸시할 수 있습니다. (`git-push-auto.bat` 자체는 `.gitignore`에 등록되어 저장소에 업로드되지 않습니다.)

---

## 📄 라이선스 (License)

Copyright (c) 2026 AhBiYout (`AhBiYout-all`).  
Licensed under the [Apache License, Version 2.0](docs/LICENSE_EN.md).
