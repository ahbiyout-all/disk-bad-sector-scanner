@echo off
REM ===================================================================
REM DiskSentinel Pro - Native Core DLL Compilation Script (build-dll.bat)
REM Builds: DiskSentinelNativeCore.dll (Pure Creative C++ Engine)
REM Target: Windows x64 / ARM64
REM Author: AhBiYout (CISNet)
REM Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
REM ===================================================================

echo ===================================================================
echo   DiskSentinelNativeCore.dll - Pure Creative DLL Builder
echo ===================================================================

SET OUTPUT_DIR=bin\native
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo [STEP 1] Detecting C++ Compiler Environment (MSVC / MinGW-GCC)...

rem Check for Microsoft Visual C++ Compiler
where cl.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 goto COMPILE_MSVC

rem Check for MinGW 64-bit Compiler
where g++.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 goto COMPILE_MINGW

echo [WARNING] Neither MSVC (cl.exe) nor MinGW (g++.exe) was found in current PATH.
echo.
echo Please run this script from:
echo   1. 'x64 Native Tools Command Prompt for VS 2022/2019', OR
echo   2. Ensure MinGW-w64 (g++) is installed and added to PATH.
echo.
echo [INFO] DLL Source files are located in 'src/native/':
echo   - src/native/DiskSentinelEngine.h
echo   - src/native/DiskSentinelEngine.cpp
echo.
if /i "%1"=="--no-pause" exit /b 1
pause
exit /b 1

:COMPILE_MSVC
echo -> MSVC compiler detected. Compiling DiskSentinelNativeCore.dll (x64 Release)...
cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDISKSENTINEL_EXPORTS ^
    src\native\DiskSentinelEngine.cpp ^
    /Fe"%OUTPUT_DIR%\DiskSentinelNativeCore.dll" ^
    /Fo"%OUTPUT_DIR%\DiskSentinelEngine.obj"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] MSVC DLL Compilation failed!
    if /i "%1"=="--no-pause" exit /b %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

if exist "src\native\DiskSentinelLauncher.cpp" (
    echo -> MSVC: Compiling native desktop host DiskSentinelPro.exe...
    cl.exe /O2 /MD /EHsc /D_WIN32 src\native\DiskSentinelLauncher.cpp ^
        /Fe"%OUTPUT_DIR%\DiskSentinelPro.exe" ^
        /Fo"%OUTPUT_DIR%\DiskSentinelLauncher.obj" ^
        user32.lib shell32.lib advapi32.lib >nul 2>&1
)
goto COMPILE_SUCCESS

:COMPILE_MINGW
echo -> MinGW G++ compiler detected. Compiling DiskSentinelNativeCore.dll (x64 Release)...
g++.exe -O3 -shared -m64 -DDISKSENTINEL_EXPORTS -D_WIN32 ^
    src/native/DiskSentinelEngine.cpp ^
    -o "%OUTPUT_DIR%/DiskSentinelNativeCore.dll" ^
    -Wl,--out-implib,"%OUTPUT_DIR%/libDiskSentinelNativeCore.a"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] MinGW DLL Compilation failed!
    if /i "%1"=="--no-pause" exit /b %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

if exist "src\native\DiskSentinelLauncher.cpp" (
    echo -> MinGW: Compiling native desktop host DiskSentinelPro.exe...
    g++.exe -O3 -m64 -mwindows src/native/DiskSentinelLauncher.cpp ^
        -o "%OUTPUT_DIR%/DiskSentinelPro.exe" -lshell32 -luser32 -ladvapi32 >nul 2>&1
)

:COMPILE_SUCCESS
echo.
echo ===================================================================
echo   BUILD SUCCESSFUL: %OUTPUT_DIR%\DiskSentinelNativeCore.dll
echo ===================================================================
echo Exported Native DLL Functions:
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

rem Copy to dist if dist exists
if exist dist (
    if exist "%OUTPUT_DIR%\DiskSentinelNativeCore.dll" (
        copy /y "%OUTPUT_DIR%\DiskSentinelNativeCore.dll" dist\ >nul
        echo Copied DiskSentinelNativeCore.dll to dist\ folder for bundling.
    )
    if exist "%OUTPUT_DIR%\DiskSentinelPro.exe" (
        copy /y "%OUTPUT_DIR%\DiskSentinelPro.exe" dist\ >nul
        echo Copied DiskSentinelPro.exe to dist\ folder for bundling.
    )
)

if /i "%1"=="--no-pause" goto EXIT_NOW
pause

:EXIT_NOW
exit /b 0
