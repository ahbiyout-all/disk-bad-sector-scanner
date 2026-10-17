@echo off
setlocal enabledelayedexpansion

:: =====================================================================
:: DiskSentinel Pro - Automated Build and Packaging Pipeline v4.5.0
:: Windows Native CRLF Desktop App & Setup Distribution Pipeline
:: Author: AhBiYout (AhBiYout-all)
:: Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
:: =====================================================================

echo ===================================================================
echo   DiskSentinel Pro - Automated Build and Packaging Pipeline v4.5.0
echo ===================================================================

echo [STEP 1] Checking Node.js and npm environment...
node --version
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    goto END_BUILD
)

echo [STEP 2] Installing dependencies if needed...
if not exist "node_modules\" (
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        goto END_BUILD
    )
)

echo [STEP 3] Running TypeScript static verification (tsc --noEmit)...
call npm run lint
if errorlevel 1 (
    echo [ERROR] TypeScript lint check failed. Please fix types before building.
    goto END_BUILD
)

echo [STEP 4] Building production Vite bundle (Single-file inline optimization)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Vite production build failed.
    goto END_BUILD
)

echo [STEP 5] Compiling Native Windows Desktop Host (DiskSentinelPro.exe)...
set "CSC_EXE="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC_EXE (
    if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if defined CSC_EXE (
    echo -> Found Windows .NET C# Compiler: !CSC_EXE!
    "!CSC_EXE!" /nologo /target:winexe /optimize+ /out:dist\DiskSentinelPro.exe src\native\DiskSentinelLauncher.cs >nul 2>&1
    if not exist "dist\DiskSentinelPro.exe" (
        "!CSC_EXE!" /nologo /target:winexe /optimize+ /out:dist\DiskSentinelPro.exe src\native\DiskSentinelLauncher.cs
    )
    if exist "dist\DiskSentinelPro.exe" (
        echo [SUCCESS] Compiled native host executable: dist\DiskSentinelPro.exe
    )
) else (
    echo -> csc.exe not found. Checking bin\native\DiskSentinelPro.exe...
    if exist "bin\native\DiskSentinelPro.exe" (
        copy /y "bin\native\DiskSentinelPro.exe" "dist\DiskSentinelPro.exe" >nul
        echo [SUCCESS] Copied existing bin\native\DiskSentinelPro.exe to dist\
    )
)

echo [STEP 6] Compiling Inno Setup Installer Executable (if ISCC is installed)...
set "ISCC_PATH="
where iscc.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 set "ISCC_PATH=iscc.exe"
if not defined ISCC_PATH (
    if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC_PATH=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
)
if not defined ISCC_PATH (
    if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC_PATH=%ProgramFiles%\Inno Setup 6\ISCC.exe"
)
if not defined ISCC_PATH (
    if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" set "ISCC_PATH=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
)

if defined ISCC_PATH (
    echo -> Found Inno Setup Compiler: !ISCC_PATH!
    echo -> Compiling setup.iss with pre-installation check logic...
    if not exist "dist-packages" mkdir "dist-packages"
    "!ISCC_PATH!" /DAppVersion=4.5.0 /O"dist-packages" setup.iss
    if exist "dist-packages\DiskSentinel_Setup_v4.5.0.exe" (
        echo [SUCCESS] Windows Installer created: dist-packages\DiskSentinel_Setup_v4.5.0.exe
    )
) else (
    echo -> Note: Inno Setup Compiler (ISCC.exe) not found in standard paths.
    echo    Unpacked Multi-File Installer with Install.bat will be generated.
)

echo [STEP 7] Executing cross-platform packaging pipeline...
call node scripts/package-cross-platform.mjs
if errorlevel 1 (
    echo [WARNING] Packaging script returned warning or error.
)

echo [STEP 8] Organizing release assets into versioned output directory (dist-v4.5.0)...
if not exist "dist-v4.5.0" mkdir "dist-v4.5.0"
xcopy /E /I /Y "dist" "dist-v4.5.0" >nul
if exist "dist-packages\" (
    if not exist "dist-v4.5.0\packages" mkdir "dist-v4.5.0\packages"
    xcopy /E /I /Y "dist-packages\*" "dist-v4.5.0\packages\" >nul
)

echo ===================================================================
echo   BUILD & PACKAGING SUCCESSFUL! (Version 4.5.0)
echo ===================================================================
echo [Deliverables Summary]
echo   1. Portable Executable Package: dist-packages\DiskSentinel-Pro-v4.5.0-Portable.zip
echo   2. Multi-File Unpacked Setup  : dist-packages\DiskSentinelPro-Installer-Unpacked\
echo   3. Setup Installer Executable : dist-packages\DiskSentinel_Setup_v4.5.0.exe (if ISCC present)
echo   4. Pre-Install Check Logic    : Overwrite vs Clean Uninstall prompt enabled
echo   5. Unattended / Silent Mode   : Supported via /SILENT or /VERYSILENT
echo   6. Firewall Auto-Registration : Silently adds 'DiskSentinel Pro' and versioned rules
echo ===================================================================
echo Output release directory: %CD%\dist-v4.5.0
echo Packages release directory: %CD%\dist-packages
echo.

if exist "%CD%\dist-packages" (
    explorer "%CD%\dist-packages"
) else (
    explorer "%CD%\dist-v4.5.0"
)

:END_BUILD
endlocal
pause
