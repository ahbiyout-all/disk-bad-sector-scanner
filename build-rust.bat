@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo   DiskSentinel Pro - Rust Native Core DLL Builder (Cargo)
echo ===================================================================

where cargo >nul 2>&1
if %errorlevel% neq 0 goto CARGO_NOT_FOUND

goto CARGO_FOUND

:CARGO_NOT_FOUND
echo [ERROR] Rust toolchain cargo is not found in PATH.
echo Please install Rust from https://rustup.rs
goto FAIL

:CARGO_FOUND
echo [STEP 1] Building DiskSentinelNativeCore.dll via Cargo (Release)...
cd /d "%~dp0src\native\rust"
cargo build --release
if %errorlevel% neq 0 goto CARGO_BUILD_FAIL

cd /d "%~dp0"
if not exist "bin\native" mkdir "bin\native"
if not exist "dist" mkdir "dist"

echo [STEP 2] Copying compiled Rust binaries to bin\native and dist\...
if exist "src\native\rust\target\release\DiskSentinelNativeCore.dll" (
    copy /y "src\native\rust\target\release\DiskSentinelNativeCore.dll" "bin\native\DiskSentinelNativeCore.dll" >nul
    copy /y "src\native\rust\target\release\DiskSentinelNativeCore.dll" "dist\DiskSentinelNativeCore.dll" >nul
    echo [SUCCESS] Rust DLL copied: bin\native\DiskSentinelNativeCore.dll
)
if exist "src\native\rust\target\release\DiskSentinelPro.exe" (
    copy /y "src\native\rust\target\release\DiskSentinelPro.exe" "bin\native\DiskSentinelPro.exe" >nul
    copy /y "src\native\rust\target\release\DiskSentinelPro.exe" "dist\DiskSentinelPro.exe" >nul
    echo [SUCCESS] Native Executable copied: bin\native\DiskSentinelPro.exe
)

echo ===================================================================
echo   RUST BUILD COMPLETED SUCCESSFULLY
echo ===================================================================
echo Exported Native Rust Functions:
echo   1. DS_OpenDriveDirect
echo   2. DS_ScanLbaBlock
echo   3. DS_AdaptiveScanChunk - Adaptive Burst Seeker
echo   4. DS_GetSmartTelemetry
echo   5. DS_EvaluateDriveReliability - Weighted Reliability and Life Index
echo   6. DS_CalculateParityChecksum - Fast ECC Parity and CRC32 Generator
echo   7. DS_AttemptSoftSectorRepair
echo   8. DS_CloseDrive
echo   9. DS_GetNvmeDeepTelemetry - NVMe Log Page 02h Deep Telemetry
echo  10. DS_CalculateAvx2ChecksumAndZeroCheck - AVX2 256-bit SIMD Zero-Check
echo  11. DS_ScanMultipleDrivesParallel - Rayon Multi-Drive Parallel Scanner
echo  12. DS_ConfigureTrayGuardian - System Tray Lightweight Guardian Configuration
echo  13. DS_RunTrayGuardianCheck - System Tray Guardian Status and Thermal Polling
echo  14. DS_ExecuteBitCarvingRecovery - Deep Bit Carving File Signature Salvager
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
