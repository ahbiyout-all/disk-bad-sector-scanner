/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enhanced Release Packaging Script for DiskSentinel Pro
 * Builds both:
 *  1. Portable Package (Zero-installation archive, standalone launcher, clean)
 *  2. Unpacked Multi-File Installer with Pre-Installation Check Logic
 *     (Detects existing install, prompts for Clean Uninstall vs Overwrite,
 *      supports unattended /SILENT mode, and auto-registers firewall rules)
 *  3. Inno Setup Compiler execution if ISCC is installed on Windows.
 * 
 * Target: Windows PC Desktop (Mobile sandboxes excluded due to direct device block I/O requirements)
 * Author: AhBiYout (CISNet)
 * Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = `v${pkg.version || '4.5.0'}`;
const rawVersion = pkg.version || '4.5.0';
const outputDir = path.join(rootDir, 'dist-packages');
const distDir = path.join(rootDir, 'dist');

console.log('===================================================================');
console.log(`  DiskSentinel Pro ${version} - Packaging Pipeline`);
console.log('===================================================================');

// 1. Ensure Vite production dist bundle exists
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('⚡ Running vite build first...');
  execSync('npm run build', { stdio: 'inherit', cwd: rootDir });
}

// 2. Try compiling native launcher if on Windows and csc.exe is available
const nativeExeInDist = path.join(distDir, 'DiskSentinelPro.exe');
const nativeExeInBin = path.join(rootDir, 'bin', 'native', 'DiskSentinelPro.exe');
const nativeDllInBin = path.join(rootDir, 'bin', 'native', 'DiskSentinelNativeCore.dll');

if (fs.existsSync(nativeExeInBin) && !fs.existsSync(nativeExeInDist)) {
  fs.copyFileSync(nativeExeInBin, nativeExeInDist);
  console.log('✓ Copied bin/native/DiskSentinelPro.exe into dist/');
}
if (fs.existsSync(nativeDllInBin) && !fs.existsSync(path.join(distDir, 'DiskSentinelNativeCore.dll'))) {
  fs.copyFileSync(nativeDllInBin, path.join(distDir, 'DiskSentinelNativeCore.dll'));
  console.log('✓ Copied bin/native/DiskSentinelNativeCore.dll into dist/');
}

// Check for .NET C# compiler on Windows
if (process.platform === 'win32' && !fs.existsSync(nativeExeInDist)) {
  const cscCandidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const cscPath of cscCandidates) {
    if (fs.existsSync(cscPath)) {
      try {
        console.log(`🔨 Compiling native host launcher via ${cscPath}...`);
        const srcLauncher = path.join(rootDir, 'src', 'native', 'DiskSentinelLauncher.cs');
        execSync(`"${cscPath}" /nologo /target:winexe /optimize+ /out:"${nativeExeInDist}" "${srcLauncher}"`, { stdio: 'pipe' });
        console.log('✓ Successfully compiled native host: dist/DiskSentinelPro.exe');
        break;
      } catch (err) {
        console.warn('ℹ️ csc compilation note:', err.message);
      }
    }
  }
}

// 3. Ensure clean dist-packages directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Helper to filter essential runtime files (excluding unwanted temporary or portable archive files)
function getRuntimeFiles(sourceDir) {
  const allEntries = fs.readdirSync(sourceDir);
  return allEntries.filter(entry => {
    const lower = entry.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.tmp') || lower.endsWith('.log')) return false;
    if (lower.includes('portable') && lower.endsWith('.txt')) return false;
    if (lower === '.gitignore' || lower === 'thumbs.db' || lower === '.ds_store') return false;
    return true;
  });
}

function copyRuntimeFiles(sourceDir, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const files = getRuntimeFiles(sourceDir);
  for (const file of files) {
    const srcPath = path.join(sourceDir, file);
    const dstPath = path.join(targetDir, file);
    fs.cpSync(srcPath, dstPath, { recursive: true });
  }
}

// -----------------------------------------------------------------------------
// PART A: Create Portable Executable Package
// -----------------------------------------------------------------------------
console.log('\n📦 [1/3] Building Portable Distribution Package...');
const portableFolderName = `DiskSentinel-Pro-${version}-Portable`;
const portableDir = path.join(outputDir, portableFolderName);
copyRuntimeFiles(distDir, portableDir);

const portableReadme = `===================================================================
  DiskSentinel Pro ${version} - Official Standalone Portable Package
===================================================================
Developer   : AhBiYout (CISNet)
Repository  : https://github.com/AhBiYout-all/disk-bad-sector-scanner
Blog        : https://ahbiyoutvibe.blogspot.com/
License     : Apache-2.0

[How to Run]
1. 'DiskSentinelPro.exe' (Recommended):
   Launches dedicated lightweight application frame mode.
2. 'DiskSentinelPro.bat' or 'DiskSentinelPro.vbs':
   Alternative zero-dependency Windows desktop launchers.
3. 'index.html':
   Can also be opened directly in Google Chrome, Microsoft Edge, or Firefox.

[Note]
This portable edition is fully standalone and does not require installation.
All scan settings and preferences are stored locally in modern browser storage.
`;
fs.writeFileSync(path.join(portableDir, 'README-PORTABLE.txt'), portableReadme, 'utf8');

const portableZipName = `DiskSentinel-Pro-${version}-Portable.zip`;
try {
  execSync(`zip -r "${path.join(outputDir, portableZipName)}" "${portableFolderName}"`, { cwd: outputDir, stdio: 'pipe' });
  console.log(`✓ Created Portable Archive: ${portableZipName}`);
} catch {
  try {
    execSync(`python3 -m zipfile -c "${path.join(outputDir, portableZipName)}" "${portableDir}"`, { stdio: 'pipe' });
    console.log(`✓ Created Portable Archive (via python zipfile): ${portableZipName}`);
  } catch {
    console.log(`ℹ️ Zip tool not available; portable directory available at: dist-packages/${portableFolderName}`);
  }
}

// -----------------------------------------------------------------------------
// PART B: Create Unpacked Multi-File Installer Package with Pre-Install Check Logic
// -----------------------------------------------------------------------------
console.log('\n📦 [2/3] Building Unpacked Multi-File Installer Package...');
const unpackedInstallerDir = path.join(outputDir, 'DiskSentinelPro-Installer-Unpacked');
const appFilesDir = path.join(unpackedInstallerDir, 'AppFiles');
copyRuntimeFiles(distDir, appFilesDir);

// Generate automated Windows Installation Script (Install.bat)
// Implements:
// 1. Existing installation check (queries registry & Program Files)
// 2. Interactive user prompt: [1] Clean Uninstall & Reinstall, [2] Overwrite, [3] Cancel
// 3. Unattended / Silent mode support (/SILENT, /VERYSILENT, /S)
// 4. Pre-registration of Firewall rules for both standard and versioned names
// 5. Desktop and Start Menu shortcut generation
// 6. Generation of clean Uninstall.bat
const installBatContent = `@echo off
setlocal enabledelayedexpansion

:: =====================================================================
:: DiskSentinel Pro ${version} - Unpacked Multi-File Windows Installer
:: Automatically checks for existing installation, prompts for action,
:: silently registers firewall rules, and creates system shortcuts.
:: =====================================================================

set "APP_NAME=DiskSentinel Pro"
set "APP_VERSION=${rawVersion}"
set "DEFAULT_DIR=%ProgramFiles%\\DiskSentinelPro"
set "TARGET_DIR=%DEFAULT_DIR%"
set "SILENT_MODE=0"

:: Check for unattended silent mode arguments
if /i "%~1"=="/SILENT" set "SILENT_MODE=1"
if /i "%~1"=="/VERYSILENT" set "SILENT_MODE=1"
if /i "%~1"=="/S" set "SILENT_MODE=1"
if /i "%~1"=="-s" set "SILENT_MODE=1"
if /i "%~1"=="/Q" set "SILENT_MODE=1"

echo ===================================================================
echo   DiskSentinel Pro %APP_VERSION% - Desktop Application Setup
echo ===================================================================

:: Check for Administrator elevation
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [NOTICE] Administrator privileges required for installation and firewall setup.
    echo Requesting elevation...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\" %*\"' -Verb RunAs"
    exit /b 0
)

:: Step 1: Detect existing installation
set "ALREADY_INSTALLED=0"
if exist "%TARGET_DIR%\\index.html" set "ALREADY_INSTALLED=1"
if exist "%TARGET_DIR%\\DiskSentinelPro.exe" set "ALREADY_INSTALLED=1"

reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{C6A035D4-733E-4B02-86A5-927A7B056D0D}_is1" >nul 2>&1
if %ERRORLEVEL% EQU 0 set "ALREADY_INSTALLED=1"

if "%ALREADY_INSTALLED%"=="1" (
    echo.
    echo [CHECK] Existing DiskSentinel Pro installation detected at:
    echo         "%TARGET_DIR%"
    echo.
    
    if "%SILENT_MODE%"=="1" (
        echo [SILENT] Unattended installation detected: Proceeding with clean upgrade...
        goto DO_CLEAN_REINSTALL
    )

    echo ===================================================================
    echo  기존에 DiskSentinel Pro 앱이 이미 설치되어 있습니다.
    echo ===================================================================
    echo  [1] 기존 설치 완전히 삭제(제거) 후 새로 설치 (권장)
    echo  [2] 기존 파일을 새 버전으로 그대로 덮어쓰기 (In-place Overwrite)
    echo  [3] 설치 취소 및 종료 (Cancel)
    echo ===================================================================
    set /p "CHOICE=선택 번호를 입력하세요 [1, 2, 3] (기본값: 1): "
    
    if "!CHOICE!"=="2" goto DO_OVERWRITE
    if "!CHOICE!"=="3" (
        echo [INFO] 사용자가 설치를 취소하였습니다.
        exit /b 0
    )
    
    :DO_CLEAN_REINSTALL
    echo -> 기존 설치 파일 및 설정을 정리하는 중...
    if exist "%TARGET_DIR%\\Uninstall.bat" (
        call "%TARGET_DIR%\\Uninstall.bat" /SILENT
    )
    if exist "%TARGET_DIR%" (
        rmdir /S /Q "%TARGET_DIR%" >nul 2>&1
    )
    goto DO_INSTALL
    
    :DO_OVERWRITE
    echo -> 기존 설치 경로에 최신 버전을 덮어씁니다...
)

:DO_INSTALL
echo -> Creating installation directory: "%TARGET_DIR%"...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo -> Copying unpacked application files...
xcopy /E /I /Y "%~dp0AppFiles\\*" "%TARGET_DIR%\\" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to copy application files to destination.
    pause
    exit /b 1
)

echo -> Silently registering Windows Firewall rules (Standard and Versioned)...
netsh advfirewall firewall add rule name="DiskSentinel Pro" dir=in action=allow program="%TARGET_DIR%\\DiskSentinelPro.exe" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="DiskSentinel Pro v%APP_VERSION%" dir=in action=allow program="%TARGET_DIR%\\DiskSentinelPro.exe" enable=yes >nul 2>&1

echo -> Creating Desktop and Start Menu shortcuts...
set "VBS_SCRIPT=%TEMP%\\ds_shortcuts.vbs"
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sDesktop = oWS.SpecialFolders("Desktop"^)
echo sStartMenu = oWS.SpecialFolders("Programs"^)
echo.
echo Set oLink1 = oWS.CreateShortcut(sDesktop ^& "\\DiskSentinel Pro.lnk"^)
echo oLink1.TargetPath = "%TARGET_DIR%\\DiskSentinelPro.exe"
echo oLink1.WorkingDirectory = "%TARGET_DIR%"
echo oLink1.Description = "DiskSentinel Pro Surface Scanner"
echo oLink1.Save
echo.
echo Set oLink2 = oWS.CreateShortcut(sStartMenu ^& "\\DiskSentinel Pro.lnk"^)
echo oLink2.TargetPath = "%TARGET_DIR%\\DiskSentinelPro.exe"
echo oLink2.WorkingDirectory = "%TARGET_DIR%"
echo oLink2.Description = "DiskSentinel Pro Surface Scanner"
echo oLink2.Save
) > "%VBS_SCRIPT%"
cscript //nologo "%VBS_SCRIPT%" >nul 2>&1
del "%VBS_SCRIPT%" >nul 2>&1

:: Generate clean Uninstaller in target directory
set "UNINSTALL_BAT=%TARGET_DIR%\\Uninstall.bat"
(
echo @echo off
echo setlocal
echo echo Removing Windows Firewall rules for DiskSentinel Pro...
echo netsh advfirewall firewall delete rule name="DiskSentinel Pro" ^>nul 2^>^&1
echo netsh advfirewall firewall delete rule name="DiskSentinel Pro v%APP_VERSION%" ^>nul 2^>^&1
echo.
echo Removing Desktop and Start Menu shortcuts...
echo del "%%USERPROFILE%%\\Desktop\\DiskSentinel Pro.lnk" ^>nul 2^>^&1
echo del "%%PUBLIC%%\\Desktop\\DiskSentinel Pro.lnk" ^>nul 2^>^&1
echo del "%%APPDATA%%\\Microsoft\\Windows\\Start Menu\\Programs\\DiskSentinel Pro.lnk" ^>nul 2^>^&1
echo.
echo if "/i"=="%%~1"=="/SILENT" goto SILENT_END
echo echo DiskSentinel Pro has been successfully uninstalled.
echo pause
echo :SILENT_END
echo cd /d "%%TEMP%%"
echo rmdir /S /Q "%TARGET_DIR%" ^>nul 2^>^&1
echo exit /b 0
) > "%UNINSTALL_BAT%"

echo ===================================================================
echo   INSTALLATION COMPLETED SUCCESSFULLY!
echo ===================================================================
echo Location : %TARGET_DIR%
echo Version  : %APP_VERSION%
echo Firewall : Pre-registered (DiskSentinel Pro, DiskSentinel Pro v%APP_VERSION%)
echo Shortcuts: Desktop and Start Menu shortcuts created
echo ===================================================================

if "%SILENT_MODE%"=="0" (
    echo.
    set /p "LAUNCH=지금 DiskSentinel Pro를 실행하시겠습니까? [Y/N] (기본값: Y): "
    if /i "!LAUNCH!" NEQ "N" (
        start "" "%TARGET_DIR%\\DiskSentinelPro.exe"
    )
)
exit /b 0
`;

fs.writeFileSync(path.join(unpackedInstallerDir, 'Install.bat'), installBatContent, 'utf8');

// Copy setup.iss and build.bat to installer package for Inno Setup compilation
if (fs.existsSync(path.join(rootDir, 'setup.iss'))) {
  fs.copyFileSync(path.join(rootDir, 'setup.iss'), path.join(unpackedInstallerDir, 'setup.iss'));
}
if (fs.existsSync(path.join(rootDir, 'build.bat'))) {
  fs.copyFileSync(path.join(rootDir, 'build.bat'), path.join(unpackedInstallerDir, 'build.bat'));
}

const installGuide = `===================================================================
  DiskSentinel Pro ${version} - Windows Installer Package Guide
===================================================================
Developer   : AhBiYout (CISNet)
Repository  : https://github.com/AhBiYout-all/disk-bad-sector-scanner
Blog        : https://ahbiyoutvibe.blogspot.com/

[Installation Methods]
1. Multi-File Unpacked One-Click Installer:
   Run 'Install.bat' as Administrator.
   - Detects any previous installation and prompts to clean reinstall, overwrite, or cancel.
   - Automatically pre-registers Windows Firewall rules silently.
   - Supports unattended silent install: 'Install.bat /SILENT'

2. Inno Setup Standalone Installer (.exe):
   - Compile 'setup.iss' using Inno Setup 6 (ISCC.exe setup.iss).
   - Generates 'DiskSentinel_Setup_${version}.exe'.
   - Automatically prompts user for overwrite/clean removal and handles firewall rules.
   - Supports silent installation: 'DiskSentinel_Setup_${version}.exe /VERYSILENT /NORESTART'
`;
fs.writeFileSync(path.join(unpackedInstallerDir, 'INSTALL-GUIDE.txt'), installGuide, 'utf8');

const installerZipName = `DiskSentinel-Pro-${version}-Installer-Setup-Package.zip`;
try {
  execSync(`zip -r "${path.join(outputDir, installerZipName)}" "DiskSentinelPro-Installer-Unpacked"`, { cwd: outputDir, stdio: 'pipe' });
  console.log(`✓ Created Installer Archive: ${installerZipName}`);
} catch {
  try {
    execSync(`python3 -m zipfile -c "${path.join(outputDir, installerZipName)}" "${unpackedInstallerDir}"`, { stdio: 'pipe' });
    console.log(`✓ Created Installer Archive (via python zipfile): ${installerZipName}`);
  } catch {
    console.log(`ℹ️ Zip tool not available; unpacked installer ready in dist-packages/DiskSentinelPro-Installer-Unpacked`);
  }
}

// -----------------------------------------------------------------------------
// PART C: Compile Standalone Inno Setup Installer Executable (if ISCC available)
// -----------------------------------------------------------------------------
console.log('\n📦 [3/3] Checking Inno Setup Compiler for Setup Executable Generation...');
let isccPath = null;
const isccCandidates = [
  'iscc',
  'ISCC',
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe',
];

for (const cand of isccCandidates) {
  try {
    execSync(`"${cand}" /?`, { stdio: 'pipe' });
    isccPath = cand;
    break;
  } catch {
    // candidate not found
  }
}

if (isccPath) {
  try {
    console.log(`🔨 Found Inno Setup compiler: ${isccPath}`);
    console.log(`   Compiling setup.iss into standalone setup executable...`);
    execSync(`"${isccPath}" /DAppVersion=${rawVersion} /O"${outputDir}" "${path.join(rootDir, 'setup.iss')}"`, { stdio: 'inherit' });
    console.log(`✓ Standalone Windows Setup Executable compiled: DiskSentinel_Setup_${version}.exe`);
  } catch (err) {
    console.warn('⚠️ Inno Setup compilation encountered an issue:', err.message);
  }
} else {
  console.log('ℹ️ Inno Setup compiler (ISCC.exe) not detected in current environment.');
  console.log('   The setup.iss file and Unpacked Multi-File Install.bat are staged and ready.');
}

console.log('\n===================================================================');
console.log(`🎉 PACKAGING COMPLETE for DiskSentinel Pro ${version}`);
console.log('===================================================================');
console.log('Deliverables created in ./dist-packages/:');
console.log(`  1. Portable Package   : ${portableZipName}`);
console.log(`  2. Unpacked Installer : DiskSentinelPro-Installer-Unpacked/ (with Install.bat & pre-install check)`);
console.log(`  3. Installer Archive  : ${installerZipName}`);
if (fs.existsSync(path.join(outputDir, `DiskSentinel_Setup_${version}.exe`))) {
  console.log(`  4. Setup Executable   : DiskSentinel_Setup_${version}.exe`);
}
console.log('===================================================================\n');
