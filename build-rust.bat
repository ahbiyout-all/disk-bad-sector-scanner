@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo   Disk Bad Sector Scanner - Rust Native Core DLL Builder (Cargo)
echo ===================================================================

where cargo >nul 2>&1
if %errorlevel% neq 0 goto CARGO_NOT_FOUND

goto CARGO_FOUND

:CARGO_NOT_FOUND
echo [ERROR] Rust toolchain cargo is not found in PATH.
echo Please install Rust from https://rustup.rs
goto FAIL

:CARGO_FOUND
echo [STEP 1] Building DiskSentinelNativeCore.dll ^& DiskBadSectorScanner.exe via Cargo (Release)...
cd /d "%~dp0src\native\rust"
cargo build --release
if %errorlevel% neq 0 goto CARGO_BUILD_FAIL

cd /d "%~dp0"
if not exist "bin\native" mkdir "bin\native"

echo [STEP 2] Copying compiled Rust binaries to bin\native\...
if exist "src\native\rust\target\release\disksentinel_core.dll" (
    copy /y "src\native\rust\target\release\disksentinel_core.dll" "bin\native\DiskSentinelNativeCore.dll" >nul
    echo [SUCCESS] Rust DLL copied: bin\native\DiskSentinelNativeCore.dll
)
if exist "src\native\rust\target\release\DiskSentinelNativeCore.dll" (
    copy /y "src\native\rust\target\release\DiskSentinelNativeCore.dll" "bin\native\DiskSentinelNativeCore.dll" >nul
    echo [SUCCESS] Rust DLL copied: bin\native\DiskSentinelNativeCore.dll
)
if exist "src\native\rust\target\release\DiskBadSectorScanner.exe" (
    copy /y "src\native\rust\target\release\DiskBadSectorScanner.exe" "bin\native\DiskBadSectorScanner.exe" >nul
    echo [SUCCESS] Native Executable copied: bin\native\DiskBadSectorScanner.exe
)

echo ===================================================================
echo   RUST BUILD COMPLETED SUCCESSFULLY
echo ===================================================================
if "%1"=="--no-pause" goto END
pause
goto END

:CARGO_BUILD_FAIL
echo [ERROR] Cargo build failed.
goto FAIL

:FAIL
cd /d "%~dp0"
echo ===================================================================
echo   RUST BUILD FAILED OR SKIPPED
echo ===================================================================
if "%1"=="--no-pause" exit /b 1
pause
exit /b 1

:END
exit /b 0
