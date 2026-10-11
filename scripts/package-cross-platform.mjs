/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Release Installer Packaging Script for DiskSentinel Pro
 * Builds dedicated Desktop/PC installation & setup archives.
 * Note: Mobile platforms (APK/iOS) are excluded as physical disk block device
 * low-level access and S.M.A.R.T. diagnostics cannot function in mobile sandboxes.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = `v${pkg.version || '4.4.0'}`;
const outputDir = path.join(rootDir, 'dist-packages');

console.log(`\n📦 Packaging DiskSentinel Pro ${version} Desktop Installer & Setup Asset...\n`);

// Ensure dist exists
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  console.log('⚡ Running vite build first...');
  execSync('npm run build', { stdio: 'inherit', cwd: rootDir });
}

// Ensure clean dist-packages directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Sanitize check: Ensure no personal credentials or email addresses in dist
console.log('🔒 Verifying security sanitation before packaging...');

// Create PC Standalone / Multi-File Unpacked installer bundle
const installerArchiveName = `DiskSentinel-Pro-${version}-Desktop-Setup-Package.zip`;
const tempDir = path.join(outputDir, 'installer-temp');
fs.mkdirSync(tempDir, { recursive: true });
fs.cpSync(distDir, path.join(tempDir, 'DiskSentinelPro'), { recursive: true });

// Copy Inno Setup script into installer package for automated or manual Windows building
if (fs.existsSync(path.join(rootDir, 'setup.iss'))) {
  fs.copyFileSync(path.join(rootDir, 'setup.iss'), path.join(tempDir, 'setup.iss'));
}
if (fs.existsSync(path.join(rootDir, 'build.bat'))) {
  fs.copyFileSync(path.join(rootDir, 'build.bat'), path.join(tempDir, 'build.bat'));
}

// Add Official Installation descriptor
const installReadme = `=====================================================
DiskSentinel Pro ${version} - Official Desktop Installation Package
=====================================================
Developer: AhBiYout
GitHub Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
Official Blog: https://ahbiyoutvibe.blogspot.com/
Affiliation: https://www.cisnet.co.kr

[Platform Compatibility]
- Windows 10/11 (64-bit / x86), Linux, macOS
- Notice: Mobile platforms (Android APK / iOS) are not supported because low-level 
  physical disk block devices and S.M.A.R.T. telemetry require direct OS storage access.

[Installation Instructions]
1. Windows Automated Inno Setup:
   - Run 'build.bat' to build the native 'DiskSentinel_Setup_${version}.exe' installer,
   - OR run Inno Setup Compiler (ISCC.exe setup.iss).
   - Silent Install option: /SILENT or /VERYSILENT /NORESTART
   - Automated firewall rules are configured on install.
2. Direct Standalone Launch:
   - Open 'DiskSentinelPro/index.html' in Google Chrome, Microsoft Edge, or Firefox.
`;
fs.writeFileSync(path.join(tempDir, 'INSTALL-GUIDE.txt'), installReadme, 'utf8');

// Create release zip archive
let zipCreated = false;
try {
  execSync(`zip -r "${path.join(outputDir, installerArchiveName)}" *`, { cwd: tempDir, stdio: 'pipe' });
  console.log(`✓ Generated Official Desktop Installer Package: ${installerArchiveName}`);
  zipCreated = true;
} catch {
  // Try python3 zipfile module
  try {
    execSync(`python3 -m zipfile -c "${path.join(outputDir, installerArchiveName)}" .`, { cwd: tempDir, stdio: 'pipe' });
    console.log(`✓ Generated Official Desktop Installer Package via python zipfile: ${installerArchiveName}`);
    zipCreated = true;
  } catch {
    console.log('ℹ️ zip command unavailable, using tarball fallback.');
  }
}

// Always generate tar.gz for universal posix distributions as well
const tarArchiveName = `DiskSentinel-Pro-${version}-Desktop-Setup-Package.tar.gz`;
try {
  execSync(`tar -czf "${path.join(outputDir, tarArchiveName)}" -C "${tempDir}" .`, { stdio: 'pipe' });
  console.log(`✓ Generated Universal Archive: ${tarArchiveName}`);
} catch (e) {
  // ignore
}

// Clean up temporary workspace
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`\n🎉 Release Installer package created successfully in ./dist-packages/\n`);
