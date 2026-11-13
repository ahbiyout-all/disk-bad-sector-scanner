# DiskSentinel Pro (디스크 배드섹터 정밀 검사기 v4.6.0)

> **고성능 물리 스토리지 정밀 진단 · D3 레이턴시 히스토그램 · 배드섹터 분석/수복 엔진**  
> **Official Repository**: [https://github.com/AhBiYout-all/disk-bad-sector-scanner](https://github.com/AhBiYout-all/disk-bad-sector-scanner)  
> **Developer**: AhBiYout (CISNet)  
> **Technical Blog**: [https://ahbiyoutvibe.blogspot.com/](https://ahbiyoutvibe.blogspot.com/)  
> **License**: Apache-2.0  

---

## 📌 프로젝트 소개 (Introduction)

**DiskSentinel Pro**는 물리 하드 드라이브(HDD), 솔리드 스테이트 드라이브(SSD, NVMe), 외장 USB 스토리지의 표면 결함과 배드섹터(Bad Sector)를 실시간으로 스캔·진단·수복하는 고성능 물리 스토리지 진단 애플리케이션입니다.

- **D3.js 실시간 섹터 읽기 속도 및 I/O 레이턴시 분포 히스토그램 (`LatencyHistogramDashboard`)**:
  - 실시간 P50/P95/P99, 표준편차(σ), 꼬리 왜도(Tail Ratio) 및 배드섹터 전조 증상 자동 판정
  - 선택된 검사 방식(`Quick` 8-Bin/0.1ms vs `Full` 20-Bin/0.01ms) 연동 통계 정밀도 동적 제어
  - **100ms 이상 지연(Slow/Critical) 섹터 오렌지/레드 컬러 하이라이트** 및 차트 상단 실시간 요약 카운터, 클릭 시 LBA 상세 드릴다운 지원
- **Windows IOCTL/WMI 네이티브 32-드라이브 전수 탐색 & 제로 더미(Zero-Dummy) 실측 엔진**:
  - `\\.\PhysicalDrive0`~`31` 물리 장치 및 논리 볼륨 매핑 정밀 인식 (SSD/HDD/NVMe/USB 자동 분류)
  - C++, Rust, Tauri, TypeScript 전 계층의 가짜/더미 폴백을 완전 제거하고 커널 Direct I/O 및 브라우저 실측 API(OPFS/File/Storage) 전면 적용 (미지원 항목 `N/A` 표기)
- **S.M.A.R.T. 제조사 임계치 초과 시각 경고 (`HealthSummaryDashboard`)**:
  - 재할당 섹터·보류 섹터·온도 등 핵심 속성이 제조사 Threshold를 초과하거나 근접할 때 시각적 경고 배지 및 툴팁 제공
- **순수 독자 창작 C++ / Rust 네이티브 코어 엔진 (`DiskSentinelNativeCore.dll`)**: OS 파일시스템 캐시를 우회한 Direct I/O 및 마이크로초(µs) 단위 정밀 지연시간 계측
- **엔터프라이즈급 배포 파이프라인**: Inno Setup 6 기반 자동 설치 프로그램, 포터블(Portable) 무설치 패키지, 무인(Silent) 설치 지원 및 기존 설치 감지/덮어쓰기 분기 로직 탑재

---

## 📂 핵심 소스 및 파일 구조 (Repository Architecture)

저장소에는 빌드 및 배포에 꼭 필요한 핵심 파일 및 소스 디렉터리만을 포함하고 있으며, 모든 임시 캐시 및 컴파일된 바이너리는 제외 목록(`.gitignore`)에 등록되어 있습니다.

```
.
├── .github/                     # GitHub Actions CI/CD 워크플로 (ci.yml, release.yml)
├── docs/                        # 기술 아키텍처, 네이티브 DLL 명세서, 보안 보고서, 패치노트
├── public/                      # 오디오 효과음, 런처 스크립트, 파비콘 등 정적 자산
├── scripts/                     # 빌드 패키징, 릴리스 번들링, 버전 관리 유틸리티
├── src/                         # 프론트엔드 UI 컴포넌트, 상태 관리, 텔레메트리 훅
│   ├── components/              # 섹터 그리드, D3 레이턴시 히스토그램, S.M.A.R.T. 대시보드 등 UI 모듈
│   ├── native/                  # C++ 및 C# 네이티브 런처 및 DLL 소스 코드
│   ├── utils/                   # 포맷터, 사운드 엔진, 진단 리포트 생성기
│   ├── App.tsx                  # 메인 애플리케이션 프레임워크 및 라우팅
│   └── main.tsx                 # React 루트 엔트리포인트
├── src-tauri/                   # Rust / Tauri 네이티브 데스크톱 빌드 구성
├── .env.example                 # 개발 환경 변수 템플릿
├── .gitignore                   # 엄격한 빌드 산출물 및 임시 파일 제외 목록
├── build.bat                    # Windows 원클릭 프로덕션 빌드 & 패키징 배치 스크립트
├── build-dll.bat                # C/C++ 네이티브 DLL & 런처 컴파일 배치 스크립트
├── build-rust.bat               # Tauri/Rust 데스크톱 컴파일 배치 스크립트
├── git-push-auto.bat            # 필수 소스 검증 및 GitHub 자동 푸시 스크립트
├── index.html                   # HTML 진입점 및 메타데이터
├── metadata.json                # 앱 메타데이터 및 권한 정의
├── package.json                 # npm 패키지 의존성 및 스크립트 정의
├── package-lock.json            # npm 의존성 잠금 파일
├── setup.iss                    # Inno Setup 6 윈도우 인스톨러 컴파일러 스크립트
├── tsconfig.json                # TypeScript 컴파일러 설정
└── vite.config.ts               # Vite 번들러 및 단일 파일 인라인 최적화 설정
```

---

## 🛠️ 빌드 및 패키징 가이드 (Build & Packaging)

### 1. 개발 환경 요구사항
- **Node.js**: v18.0.0 이상 (v20+ 권장)
- **npm**: v9.0.0 이상
- **Windows OS**: Windows 10 / 11 (런처 컴파일 시 .NET Framework 4.0+ `csc.exe` 내장)
- *(선택 사항)* **Inno Setup 6**: `setup.iss`를 통해 설치 실행 파일(`.exe`) 컴파일 시 필요

### 2. 의존성 설치 및 정적 검증
```bash
# 의존성 설치
npm install

# TypeScript 정적 타입 및 린트 검사
npm run lint
```

### 3. 단일 파일 프로덕션 빌드
```bash
npm run build
```
Vite의 `vite-plugin-singlefile` 최적화를 통해 단일 실행 가능한 `dist/index.html`이 생성됩니다.

### 4. Windows 원클릭 자동 빌드 파이프라인
프로젝트 루트에서 `build.bat`을 실행하면 다음 8단계가 전자동으로 실행됩니다:
1. Node.js & npm 환경 검사
2. npm 의존성 자동 점검
3. TypeScript 정적 타입 검증 (`tsc --noEmit`)
4. Vite 프로덕션 인라인 번들링
5. Windows 네이티브 데스크톱 런처 컴파일 (`DiskSentinelLauncher.cs`)
6. 크로스 플랫폼 릴리스 패키징 (`package-cross-platform.mjs`)
   - 무설치 포터블 패키지 (`DiskSentinel-Pro-v4.6.0-Portable.zip`)
   - 폴더 풀림(Unpacked Multi-File) 인스톨러 (`DiskSentinelPro-Installer-Unpacked/`)
   - 설치 프로그램 사전 방화벽 조용히 등록 및 무인 설치(`/SILENT`, `/VERYSILENT`) 지원
   - 기존 앱 설치 여부 확인 및 덮어쓰기/삭제 분기 로직
7. Inno Setup 인스톨러 컴파일 (`ISCC.exe` 감지 시)
8. 최종 릴리스 산출물 디렉터리(`dist-packages/`) 자동 정리 및 탐색기 오픈

---

## 🚀 GitHub 자동 푸시 (Git Push Automation)

로컬 윈도우 환경에서 핵심 파일들만 선별하여 안전하게 푸시하려면 로컬 스크립트 `git-push-auto.bat`을 실행하십시오:

```cmd
git-push-auto.bat
```

- 자동으로 TypeScript 타입 체크를 통과한 후 필수 파일들만 스테이징합니다.
- `git-push-auto.bat` 자체를 포함하여 빌드 결과물(`dist/`, `dist-packages/`, `build/`), 캐시, 임시 파일, 개인 키 및 바이너리는 `.gitignore`에 의해 완벽하게 차단되어 원격 저장소에 푸시되지 않습니다.

---

## 📄 라이선스 (License)

Copyright (c) 2026 AhBiYout (CISNet).  
Licensed under the [Apache License, Version 2.0](LICENSE_EN.md).
