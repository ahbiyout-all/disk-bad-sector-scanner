@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo   Disk Bad Sector Scanner - Automated Tauri v2 Desktop App Builder
echo ===================================================================

:: 1. Verify Node.js
where node >nul 2>&1
if errorlevel 1 (
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo [AUTO-SETUP] Installing Node.js LTS via winget...
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    )
)
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required. Install from https://nodejs.org
    goto END_FAIL
)

:: 2. Verify Rust toolchain (cargo) and auto-provision via winget if missing
where cargo >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
        set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
    )
)
where cargo >nul 2>&1
if errorlevel 1 (
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo [AUTO-SETUP] Installing Rust toolchain via winget...
        winget install -e --id Rustlang.Rustup --accept-package-agreements --accept-source-agreements
        if exist "%USERPROFILE%\.cargo\bin\rustup.exe" (
            set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
            call rustup default stable
        )
    )
)
where cargo >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Rust toolchain ^(cargo^) is required. Install from https://rustup.rs
    goto END_FAIL
)

echo [STEP 1] Installing npm dependencies ^(including @tauri-apps/cli^)...
call npm install
if errorlevel 1 goto END_FAIL

echo [STEP 2] Running TypeScript verification ^(npm run lint^)...
call npm run lint
if errorlevel 1 goto END_FAIL

echo [STEP 3] Building Tauri v2 Desktop Executable ^& Windows Installers ^(NSIS / MSI^)...
call npm run tauri:build
if errorlevel 1 goto END_FAIL

echo.
echo ===================================================================
echo   TAURI DESKTOP APP BUILD COMPLETED!
echo ===================================================================
echo   Executable : src-tauri\target\release\DiskBadSectorScanner.exe
echo   NSIS Setup : src-tauri\target\release\bundle\nsis\
echo   MSI Setup  : src-tauri\target\release\bundle\msi\
echo ===================================================================
echo.

if exist "src-tauri\target\release\bundle" (
    explorer "src-tauri\target\release\bundle"
)

if "%1"=="--no-pause" exit /b 0
pause
exit /b 0

:END_FAIL
echo.
echo [FAILED] Tauri Desktop build encountered an error.
if "%1"=="--no-pause" exit /b 1
pause
exit /b 1
