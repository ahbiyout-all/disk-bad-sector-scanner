# 🛡️ Disk Bad Sector Scanner - 네이티브 .exe & 인스톨러 패키징 가이드
**(Windows Native Executable & Unpacked Installer Packaging Architecture)**

본 문서는 **Disk Bad Sector Scanner (디스크 배드섹터 검사기)**를 순수 네이티브 윈도우 실행 파일(`.exe`) 및 폴더 풀림(Unpacked Multi-File) Windows 공식 인스톨러로 패키징하는 아키텍처와 절차를 안내합니다.

---

## 📌 개요 (Overview)

**Disk Bad Sector Scanner**는 웹 브라우저 샌드박스의 한계를 넘어 **물리 디스크 블록 장치(`\\.\PhysicalDriveX`) 직접 제어, OS 캐시 우회(Direct I/O), S.M.A.R.T. 하드웨어 텔레메트리 조회, 백그라운드 트레이 가디언**을 수행할 수 있도록 네이티브 윈도우 프로세스로 실행됩니다.

```
                  [ Disk Bad Sector Scanner Architecture ]
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
[경로 1: Rust Host Binary]   [경로 2: Tauri v2 Native]    [경로 3: Inno Setup Installer]
 (src/native/rust/main.rs)       (src-tauri/)             (setup.iss + build.bat)
        │                             │                             │
   Cargo Build                 Tauri WebView2 Bundler        Inno Setup Compiler (ISCC)
        │                             │                             │
 DiskBadSectorScanner.exe   DiskBadSectorScanner.exe   DiskBadSectorScanner_Setup_v4.6.0.exe
        │                             │                             │
 14대 C ABI DLL 직접 링크      Rust Direct FFI Bridge        Unpacked 설치 + 방화벽 자동구성
```

---

## 🚀 경로 1. Rust Cargo 기반 네이티브 바이너리 빌드 (`DiskBadSectorScanner.exe`)

Rust 툴체인이 설치된 환경에서 단 한 번의 명령어로 DLL과 단독 실행 바이너리를 동시에 빌드합니다.

```cmd
build-rust.bat
```

- 산출물: `bin\native\DiskBadSectorScanner.exe`, `bin\native\DiskSentinelNativeCore.dll`

---

## ⚡ 경로 2. Tauri v2 기반 WebView2 네이티브 데스크톱 패키징

```cmd
# 개발 모드 실시간 테스트
npm run tauri:dev

# 최종 릴리즈 네이티브 .exe 및 .msi 패키징
npm run tauri:build
```

---

## 📦 경로 3. Inno Setup 6 폴더 풀림(Unpacked Multi-File) 공식 인스톨러 (`build.bat`)

엔드유저 배포를 위한 Windows 공식 설치 프로그램(`Output\DiskBadSectorScanner_Setup_v4.6.0.exe`)을 생성합니다. *(포터블 ZIP 및 불필요한 문서는 인스톨러에 포함하지 않습니다.)*

```cmd
build.bat
```

### 인스톨러 주요 특징 및 실행 순서
1. **고유 AppId 및 설치 경로**: `{8E4C7A21-5B94-4F18-9D32-6A1E9C4F0B7D}` / `{autopf}\Disk Bad Sector Scanner`
2. **기존 앱 실행 중 강제 종료**: `taskkill /F /IM DiskBadSectorScanner.exe /T` (+ 레거시 바이너리)
3. **기존 설치 감지 분기**:
   - `[예]` 기존 버전 제거 후 깨끗한 재설치
   - `[아니오]` 기존 폴더에 덮어쓰기 설치
   - `[취소]` 설치 중단
4. **라이선스 선언**: Apache License 2.0 (`docs\LICENSE_KR.md`)
5. **Unpacked Multi-File 설치**: 런타임 필수 파일(`index.html`, `DiskBadSectorScanner.exe`, `DiskSentinelNativeCore.dll`)만 설치하고 문서/포터블/`.gitignore`/`aistudio` 제외
6. **바탕화면 바로가기(기본 체크) 및 설치 후 앱 실행**
7. **무인 설치(`/SILENT`, `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART`)** 및 Windows 프로그램 추가/제거 정식 등록
8. **방화벽 규칙 조용한 자동 등록**:
   - `Disk Bad Sector Scanner` (기본 앱 이름)
   - `Disk Bad Sector Scanner v{#AppVersion}` (버전 표기 앱 이름)

---

## 🛠️ 경로 4. C++ MSVC / MinGW 빌드 (`build-dll.bat`) 및 내장 `csc.exe` 폴백

```cmd
build-dll.bat
```
컴파일러 미설치 Windows 환경에서도 `build.bat`이 Windows 내장 `.NET csc.exe`를 이용해 `bin\native\DiskBadSectorScanner.exe`를 자동 생성합니다.
