@echo off
setlocal enabledelayedexpansion

:: =====================================================================
:: Disk Bad Sector Scanner - Automated Build and Installer Pipeline
:: Dynamic Version Read from package.json
:: Author: AhBiYout (AhBiYout-all)
:: Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
:: =====================================================================

echo ===================================================================
echo   Disk Bad Sector Scanner - Automated Build ^& Installer Pipeline
echo ===================================================================

echo [STEP 1] Checking Node.js and reading dynamic version...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    goto END_BUILD
)

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
if "%APP_VERSION%"=="" set "APP_VERSION=4.6.0"
echo -^> Detected Application Version: v%APP_VERSION%

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

echo [STEP 4] Building production Vite bundle (Unpacked Runtime Assets)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Vite production build failed.
    goto END_BUILD
)

echo [STEP 5] Building Native DLL and Desktop Host Executable...
if not exist "bin\native" mkdir "bin\native"
call build-dll.bat --no-pause
if errorlevel 1 (
    echo [INFO] Native C++ compiler not detected, checking .NET csc.exe fallback...
)

set "CSC_EXE="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if "!CSC_EXE!"=="" if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC_EXE=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not "!CSC_EXE!"=="" (
    echo -^> Compiling DiskBadSectorScanner.exe via .NET C# Compiler...
    "!CSC_EXE!" /nologo /target:winexe /optimize+ /out:bin\native\DiskBadSectorScanner.exe src\native\DiskSentinelLauncher.cs
)

if not exist "bin\native\DiskBadSectorScanner.exe" (
    echo [WARNING] Native host executable DiskBadSectorScanner.exe was not built.
) else (
    echo [SUCCESS] Native desktop host ready: bin\native\DiskBadSectorScanner.exe
)

echo [STEP 6] Auditing unpacked installer files (removing unwanted docs/portable artifacts)...
call node scripts/package-cross-platform.mjs "%APP_VERSION%"
if errorlevel 1 (
    echo [ERROR] Staging audit failed.
    goto END_BUILD
)

echo [STEP 7] Compiling Inno Setup Installer Executable (Output\DiskBadSectorScanner_Setup_v%APP_VERSION%.exe)...
set "ISCC_PATH="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if "!ISCC_PATH!"=="" if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
if "!ISCC_PATH!"=="" if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" set "ISCC_PATH=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
if "!ISCC_PATH!"=="" (
    for /f "delims=" %%i in ('where iscc.exe 2^>nul') do set "ISCC_PATH=%%i"
)

if "!ISCC_PATH!"=="" goto NO_ISCC
if not exist "Output" mkdir "Output"
"!ISCC_PATH!" /DAppVersion=%APP_VERSION% /O"Output" setup.iss
if exist "Output\DiskBadSectorScanner_Setup_v%APP_VERSION%.exe" (
    echo [SUCCESS] Windows Installer created: Output\DiskBadSectorScanner_Setup_v%APP_VERSION%.exe
)
goto SUMMARY

:NO_ISCC
echo -^> Note: Inno Setup Compiler (ISCC.exe) not found.
echo    Unpacked installer files staged cleanly in dist-packages\.

:SUMMARY
echo.
echo ===================================================================
echo   BUILD AND INSTALLER PACKAGING COMPLETED! (v%APP_VERSION%)
echo ===================================================================
echo [Deliverables Summary]
echo   1. Unpacked Staged Runtime  : dist-packages\DiskBadSectorScanner-Unpacked-v%APP_VERSION%\
echo   2. Windows Setup Installer  : Output\DiskBadSectorScanner_Setup_v%APP_VERSION%.exe
echo   3. Install Sequence         : Kill running app -^> Existing check -^> License -^> Unpacked Install -^> Shortcut -^> Launch
echo   4. Unattended Silent Mode   : /SILENT or /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
echo   5. Firewall Rules           : Base ('Disk Bad Sector Scanner') ^& Versioned ('Disk Bad Sector Scanner v%APP_VERSION%')
echo ===================================================================
echo.

if exist "Output" (
    explorer "Output"
) else if exist "dist-packages" (
    explorer "dist-packages"
)

:END_BUILD
endlocal
pause
