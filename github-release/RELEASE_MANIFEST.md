# DiskSentinel Pro - GitHub Essential Build Package (v4.4.0)
> Generated: 2026-10-11T08:31:22.924Z
> Folder: github-release
> Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
> Author: AhBiYout (CISNet)

이 전용 디렉터리(`github-release`)는 깃허브 원격 저장소 및 배포에 필요한 순수 핵심 소스 및 필수 빌드 구성 파일만을 추출하여 관리하는 전용 스테이징 폴더입니다.
(탐색기/에디터의 숨김 파일 설정 유무와 무관하게 즉시 탐색할 수 있도록 `github-release/` 및 `.github-release/` 동시 동기화)

## 포함된 핵심 구성 요소
- **설정 및 명세 파일**:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `metadata.json`
- **소스 코드**:
  - `src/` (TypeScript / React 19 / Tailwind CSS 4 핵심 엔진 및 UI 컴포넌트)
  - `public/` (사운드 에셋, 파비콘, 정적 자산)
- **빌드 및 배포 자동화**:
  - `setup.iss` (Inno Setup 6 윈도우 인스톨러 생성기)
  - `build.bat` (Windows 원클릭 프로덕션 빌드 스크립트)
  - `git-push-auto.bat` (GitHub 자동 동기화 & 릴리스 태깅 스크립트)
  - `scripts/` (빌드 패키징, 릴리스 동기화 스크립트)
  - `.github/workflows/` (CI/CD 자동 빌드 및 릴리스 파이프라인)
- **문서**:
  - `docs/` (패치노트, 보안 보고서, 작업 로그, DLL 명세, 라이선스 안내)

## 제외된 불필요/임시 파일
- `node_modules/` (npm 의존성 패키지)
- `dist/`, `dist-packages/`, `build/` (빌드 산출물 및 임시 패키지)
- `.env`, `.env.local` 등 비밀정보 및 환경설정 파일
- 운영체제 캐시 및 에디터 메타데이터 (`.DS_Store`, `Thumbs.db`, `.vscode/`)
