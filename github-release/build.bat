@echo off
REM ===================================================================
REM DiskSentinel Pro - Automated Build & Packaging Pipeline Script
REM Operating System: Windows (CRLF)
REM Language: English
REM Author: AhBiYout-all (https://github.com/AhBiYout-all)
REM ===================================================================

echo ===================================================================
echo   DiskSentinel Pro Automated Build Tool
echo ===================================================================

echo [STEP 1] Retrieving application version from package.json dynamically...
FOR /F "tokens=*" %%i IN ('node -p "require('./package.json').version"') DO SET APP_VERSION=%%i

if "%APP_VERSION%"=="" (
    echo [WARNING] Failed to extract version from package.json. Defaulting to 4.3.0.
    SET APP_VERSION=4.3.0
)

echo -> Detected Version: v%APP_VERSION%
title DiskSentinel Pro Build Pipeline - v%APP_VERSION%

echo.
echo [STEP 1.5] Verifying dependency packages...
set NEED_INSTALL=0
if not exist node_modules set NEED_INSTALL=1
if not exist node_modules\.bin\vite.cmd set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
    echo -> [INFO] 'node_modules' or 'vite.cmd' not found.
    echo -> [ACTION] Automatically executing 'npm install' to configure dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install npm dependencies. Please check your internet connection.
        pause
        exit /b %ERRORLEVEL%
    )
) else (
    echo -> Dependencies and Vite builder are verified and ready.
)

echo.
echo [STEP 2] Cleaning previous builds...
if exist dist (
    echo -> Removing old 'dist' folder...
    rmdir /s /q dist
)
if exist build (
    echo -> Removing old 'build' folder...
    rmdir /s /q build
)
if exist dist_packages (
    echo -> Removing old 'dist_packages' folder...
    rmdir /s /q dist_packages
)

echo.
echo [STEP 3] Running production build via Vite (npm run build)...
:TRY_BUILD
call npm run build

if %ERRORLEVEL% EQU 0 goto BUILD_SUCCESS
echo.
echo [ERROR] Production compilation failed!
echo -> This usually happens if 'npm install' was skipped or interrupted.
set /p REINSTALL="Would you like to run 'npm install' to repair packages and try again? (Y/N): "
if /i "%REINSTALL%"=="Y" (
    echo Running dependency repair...
    call npm install
    echo Retrying build...
    goto TRY_BUILD
)
pause
exit /b %ERRORLEVEL%

:BUILD_SUCCESS
echo -> Production compilation completed successfully!

echo.
echo [STEP 4] Preparing distribution structures...
mkdir dist_packages
SET EXPORT_DIR=dist_packages\DiskSentinel-Pro-v%APP_VERSION%
mkdir "%EXPORT_DIR%"

echo -> Copying compiled client assets...
xcopy /s /e /y dist "%EXPORT_DIR%\"

echo.
echo [STEP 5] Compiling cross-platform zip package...
powershell -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'dist_packages\DiskSentinel-Pro-v%APP_VERSION%-PC-Windows.zip' -Force"
echo -> Zip archive created successfully: dist_packages\DiskSentinel-Pro-v%APP_VERSION%-PC-Windows.zip

echo.
echo [STEP 6] Checking for Inno Setup Compiler (ISCC)...
set ISCC_PATH=ISCC
where ISCC >nul 2>&1
if %ERRORLEVEL% EQU 0 goto COMPILE_INNO

rem Scanning default Inno Setup installation directories...
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    goto COMPILE_INNO
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files\Inno Setup 6\ISCC.exe"
    goto COMPILE_INNO
)
if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Users\%USERNAME%\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    goto COMPILE_INNO
)
if exist "C:\Program Files (x86)\Inno Setup 5\ISCC.exe" (
    set ISCC_PATH="C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
    goto COMPILE_INNO
)
if exist "C:\Program Files\Inno Setup 5\ISCC.exe" (
    set ISCC_PATH="C:\Program Files\Inno Setup 5\ISCC.exe"
    goto COMPILE_INNO
)

rem If not found in common directories, check the Registry
FOR /F "usebackq tokens=2*" %%A IN (`REG QUERY "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1" /v "InstallLocation" 2^>nul`) DO (
    if exist "%%B\ISCC.exe" (
        set ISCC_PATH="%%B\ISCC.exe"
        goto COMPILE_INNO
    )
)
FOR /F "usebackq tokens=2*" %%A IN (`REG QUERY "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1" /v "InstallLocation" 2^>nul`) DO (
    if exist "%%B\ISCC.exe" (
        set ISCC_PATH="%%B\ISCC.exe"
        goto COMPILE_INNO
    )
)

goto NO_INNO

:COMPILE_INNO
echo -> Inno Setup Compiler found! Compiling native setup installer...
%ISCC_PATH% /DAppVersion=%APP_VERSION% /O"dist_packages" /F"DiskSentinel_Setup_v%APP_VERSION%" setup.iss
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Inno Setup compilation failed!
    pause
    exit /b %ERRORLEVEL%
)
echo -> Installer package generated: dist_packages\DiskSentinel_Setup_v%APP_VERSION%.exe
goto END_INNO

:NO_INNO
echo [INFO] Inno Setup compiler (ISCC) is not found in PATH or standard installation directories.
echo -> Skipping .exe compiler step. You can compile setup.iss manually using Inno Setup GUI.

:END_INNO

echo.
echo ===================================================================
echo   BUILD COMPLETED SUCCESSFULLY FOR VERSION v%APP_VERSION%
echo ===================================================================
echo Opening output directory...
explorer dist_packages

pause
