# 🛡️ DiskSentinel Pro - 네이티브 .exe 패키징 종합 가이드
**(Windows Native Executable Packaging & Distribution Architecture)**

본 문서는 **DiskSentinel Pro (디스크 배드섹터 검사기)**를 순수 네이티브 윈도우 실행 파일(`.exe`) 및 독립 실행형 인스톨러로 패키징하는 5가지 아키텍처 경로와 세부 실행 절차를 상세히 안내합니다.

---

## 📌 개요 (Overview)

DiskSentinel Pro는 웹 브라우저 샌드박스의 한계를 넘어 **물리 디스크 블록 장치(`\\.\PhysicalDriveX`) 직접 제어, OS 캐시 우회(Direct I/O), S.M.A.R.T. 하드웨어 텔레메트리 조회, 백그라운드 트레이 가디언**을 수행할 수 있도록 네이티브 윈도우 프로세스로 실행되도록 설계되었습니다.

```
                    [ DiskSentinel Pro Multi-Architecture ]
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
[경로 1: Rust Host Binary]    [경로 2: Tauri v2 Native]     [경로 3: Inno Setup Installer]
 (src/native/rust/main.rs)        (src-tauri/)              (setup.iss + build.bat)
        │                              │                              │
   Cargo Build                  Tauri WebView2 Bundler         Inno Setup Compiler (ISCC)
        │                              │                              │
  DiskSentinelPro.exe          DiskSentinelPro.msi / .exe    DiskSentinel_Setup_v4.4.0.exe
        │                              │                              │
 14대 C ABI DLL 직접 링크       Rust Direct FFI Bridge         관리자 UAC 권한 + 방화벽 자동구성
```

---

## 🚀 경로 1. Rust Cargo 기반 네이티브 바이너리 빌드 (`DiskSentinelPro.exe`)

Rust 툴체인이 설치된 환경에서 단 한 번의 명령어로 DLL과 단독 실행 바이너리를 동시에 빌드합니다.

### 1) 빌드 실행
프로젝트 루트 디렉토리에서 아래 배치 파일을 실행합니다:
```cmd
build-rust.bat
```
또는 터미널에서 직접 실행:
```cmd
cd src\native\rust
cargo build --release
```

### 2) 산출물
- `bin\native\DiskSentinelPro.exe`: 단독 실행 가능한 네이티브 윈도우 실행 파일
- `bin\native\DiskSentinelNativeCore.dll`: 14대 고성능 C ABI 저장장치 제어 코어
- `dist\DiskSentinelPro.exe` 및 `dist\DiskSentinelNativeCore.dll`로 자동 동기화 복사

### 3) 지원 CLI 명령어 및 실행 모드
```cmd
# 1. 기본 GUI 데스크톱 프레임 모드로 실행 (Edge App Mode 독립 창)
DiskSentinelPro.exe

# 2. 콘솔에서 0번 물리 드라이브 Direct I/O 표면 검증
DiskSentinelPro.exe --scan 0

# 3. 시스템 트레이 가디언 데몬 백그라운드 모드 (온도 및 배드섹터 감시)
DiskSentinelPro.exe --tray

# 4. 버전 확인
DiskSentinelPro.exe --version
```

---

## ⚡ 경로 2. Tauri v2 기반 완전 통합 WebView2 단일 바이너리 패키징

Tauri CLI를 사용하여 프론트엔드와 Rust 네이티브 엔진을 단 하나의 단독 `.exe` 또는 `.msi` 설치 파일로 컴파일합니다.

### 1) 사전 준비
- Node.js 및 Rust (rustup)
- Tauri CLI (`cargo install tauri-cli --version "^2"`)

### 2) 빌드 명령어
```cmd
# 개발 모드 실시간 테스트
npm run tauri:dev

# 최종 릴리즈 네이티브 .exe 및 .msi 패키징
npm run tauri:build
```

### 3) 산출물
- `src-tauri\target\release\DiskSentinelPro.exe` (초경량 단일 실행 파일, 약 8~12MB)
- `src-tauri\target\release\bundle\msi\DiskSentinelPro_4.4.0_x64_en-US.msi`
- `src-tauri\target\release\bundle\nsis\DiskSentinelPro_4.4.0_x64-setup.exe`

---

## 📦 경로 3. Inno Setup 원클릭 Windows 인스톨러 생성 (`build.bat`)

엔드유저에게 배포하기 가장 적합한 전통적인 윈도우 공식 설치 프로그램(`.exe`)을 생성합니다.

### 1) 원클릭 빌드 실행
```cmd
build.bat
```
`build.bat`는 아래 6단계를 전자동으로 수행합니다:
1. `package.json`에서 현재 버전(v4.4.0)을 동적으로 추출
2. 의존성 검증 및 `npm run build` 프로덕션 번들링
3. Rust / MSVC / MinGW 컴파일러 감지 시 네이티브 DLL 및 `DiskSentinelPro.exe` 빌드
4. **[무설치 대체]** 컴파일러가 없을 경우 윈도우 내장 `csc.exe`로 `DiskSentinelPro.exe` 자동 생성
5. `dist_packages\DiskSentinel-Pro-v4.4.0-PC-Windows.zip` 압축 아카이브 생성
6. Inno Setup 컴파일러(ISCC)를 자동 탐색하여 `DiskSentinel_Setup_v4.4.0.exe` 인스톨러 컴파일

### 2) 인스톨러의 주요 특징
- **관리자 권한 요구 (`PrivilegesRequired=admin`)**: 윈도우 스토리지 직접 접근(`\\.\PhysicalDriveX`)에 필수적인 관리자 권한 UAC 자동 요청
- **방화벽 인바운드 규칙 자동 등록 (`netsh advfirewall`)**: 무결성 통신 보안 규칙 구성
- **바탕화면 및 시작 메뉴 바로가기**: `DiskSentinelPro.exe`로 직접 연결
- **설치 완료 후 즉시 실행 체크박스** 지원

---

## 🛠️ 경로 4. C++ MSVC / MinGW 기반 빌드 (`build-dll.bat`)

C++ 툴체인(Visual Studio 2022 Native Tools Prompt 또는 MinGW-w64)을 보유한 환경에서 C++ 코어를 빌드합니다.

### 1) 빌드 실행
```cmd
build-dll.bat
```

### 2) 컴파일 처리
- `DiskSentinelEngine.cpp` -> `bin\native\DiskSentinelNativeCore.dll`
- `DiskSentinelLauncher.cpp` -> `bin\native\DiskSentinelPro.exe`
- 생성 즉시 `dist\` 폴더로 자동 복사되어 패키징 준비 완료

---

## 💎 경로 5. 외부 컴파일러 없는 순정 윈도우에서의 자동 완비 (`csc.exe` 폴백)

개발 환경이 아닌 순정 Windows 10/11 PC에서도 빌드가 가능하도록, `build.bat` Step 3.6에 **Windows 기본 내장 C# 컴파일러(`csc.exe`)** 연동 파이프라인이 탑재되어 있습니다.

```cmd
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize+ /out:"dist\DiskSentinelPro.exe" src\native\DiskSentinelLauncher.cs
```
- 추가 소프트웨어 설치 없이 순수 윈도우 환경에서도 100% 네이티브 실행 파일 `DiskSentinelPro.exe`가 생성됩니다.

---

## 📋 요약 비교표 (Packaging Methods Comparison)

| 구분 | Rust Host (`build-rust.bat`) | Tauri v2 (`npm run tauri:build`) | Inno Setup (`build.bat`) | C++ Win32 (`build-dll.bat`) |
| :--- | :---: | :---: | :---: | :---: |
| **산출물 형태** | 단독 `.exe` + `.dll` | 단일 `.exe` / `.msi` | 배포용 설치파일 `.exe` | 단독 `.exe` + `.dll` |
| **UI 렌더링** | Edge App Mode 프레임 | 시스템 내장 WebView2 | 언팩 번들 + App Host | Edge App Mode 프레임 |
| **Direct I/O 권한** | 관리자 UAC 연동 | 네이티브 Rust 핸들러 | 인스톨러 레벨 UAC 승인 | 관리자 UAC 연동 |
| **배포 용이성** | 포터블 (ZIP 압축) | 단일 바이너리 배포 | 대중 엔드유저 표준 | 포터블 (ZIP 압축) |
| **권장 용도** | 고급 개발자 / CLI 스캔 | 모던 데스크톱 완성형 배포 | 일반 사용자용 정식 셋업 | C++ 네이티브 최적화 환경 |

모든 패키징 아키텍처는 코드베이스 내에 완벽히 동기화되어 있으며, 어떠한 환경에서도 즉시 빌드 및 배포가 가능합니다.
