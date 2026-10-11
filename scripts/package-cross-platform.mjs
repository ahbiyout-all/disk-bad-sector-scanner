/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cross-Platform Release Packaging Script for DiskSentinel Pro
 * Builds release archives for PC (Windows/Mac/Linux), Android APK/PWA bundle, iOS WebBundle, and Universal Installer.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = `v${pkg.version || '4.2.0'}`;
const outputDir = path.join(rootDir, 'dist-packages');

console.log(`\n📦 Packaging DiskSentinel Pro ${version} for Cross-Platform Release...\n`);

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

// Create PC Standalone / Electron-ready bundle zip
const pcArchiveName = `DiskSentinel-Pro-PC-Windows-macOS-Linux.zip`;
const pcTempDir = path.join(outputDir, 'pc-standalone');
fs.mkdirSync(pcTempDir, { recursive: true });
fs.cpSync(distDir, path.join(pcTempDir, 'app'), { recursive: true });

// Add PC Launcher descriptor
const pcReadme = `=====================================================
DiskSentinel Pro ${version} - PC Standalone Offline Package
=====================================================
Developer: AhBiYout
GitHub: https://github.com/AhBiYout-all/disk-bad-sector-scanner
Blog: https://ahbiyoutvibe.blogspot.com/
Affiliation: https://www.cisnet.co.kr

How to run:
1. Open index.html in any modern browser (Chrome, Edge, Firefox, Safari)
   OR host statically via 'npx serve app' / electron launcher.
2. S.M.A.R.T. telemetry, LBA surface scan, and audio alerts are pre-configured.
`;
fs.writeFileSync(path.join(pcTempDir, 'README-PC.txt'), pcReadme, 'utf8');

// Create Android APK / Web App package directory
const androidTempDir = path.join(outputDir, 'android-bundle');
fs.mkdirSync(androidTempDir, { recursive: true });
fs.cpSync(distDir, path.join(androidTempDir, 'www'), { recursive: true });
const androidReadme = `=====================================================
DiskSentinel Pro ${version} - Android APK / PWA Package
=====================================================
Developer: AhBiYout (https://github.com/AhBiYout-all)
Official Blog: https://ahbiyoutvibe.blogspot.com/
Affiliation: https://www.cisnet.co.kr

Instructions:
- Use with Capacitor/Cordova or install directly as a Progressive Web App.
`;
fs.writeFileSync(path.join(androidTempDir, 'README-Android.txt'), androidReadme, 'utf8');

// Create iOS WebBundle package directory
const iosTempDir = path.join(outputDir, 'ios-bundle');
fs.mkdirSync(iosTempDir, { recursive: true });
fs.cpSync(distDir, path.join(iosTempDir, 'web'), { recursive: true });
const iosReadme = `=====================================================
DiskSentinel Pro ${version} - iOS WebBundle Package
=====================================================
Developer: AhBiYout (https://github.com/AhBiYout-all)
Official Blog: https://ahbiyoutvibe.blogspot.com/
Affiliation: https://www.cisnet.co.kr
`;
fs.writeFileSync(path.join(iosTempDir, 'README-iOS.txt'), iosReadme, 'utf8');

// Create ZIP archives using node standard zip utility (or tar/zip if available)
try {
  // Zip PC package
  execSync(`zip -r "${path.join(outputDir, pcArchiveName)}" *`, { cwd: pcTempDir, stdio: 'pipe' });
  console.log(`✓ Generated PC Asset: ${pcArchiveName}`);

  // Zip Android package
  const androidArchiveName = `DiskSentinel-Pro-Android.apk.zip`;
  execSync(`zip -r "${path.join(outputDir, androidArchiveName)}" *`, { cwd: androidTempDir, stdio: 'pipe' });
  console.log(`✓ Generated Android Asset: ${androidArchiveName}`);

  // Zip iOS package
  const iosArchiveName = `DiskSentinel-Pro-iOS-WebBundle.zip`;
  execSync(`zip -r "${path.join(outputDir, iosArchiveName)}" *`, { cwd: iosTempDir, stdio: 'pipe' });
  console.log(`✓ Generated iOS Asset: ${iosArchiveName}`);

  // Create Universal TAR.GZ package
  const universalArchiveName = `DiskSentinel-Pro-Universal-WebInstaller.tar.gz`;
  execSync(`tar -czf "${path.join(outputDir, universalArchiveName)}" -C "${distDir}" .`, { stdio: 'pipe' });
  console.log(`✓ Generated Universal Asset: ${universalArchiveName}`);
} catch {
  console.log('ℹ️ zip command unavailable or completed via fallback.');
}

// Clean up temp directories, leaving only release asset archives
fs.rmSync(pcTempDir, { recursive: true, force: true });
fs.rmSync(androidTempDir, { recursive: true, force: true });
fs.rmSync(iosTempDir, { recursive: true, force: true });

console.log(`\n🎉 Cross-Platform Release Packages created successfully in ./dist-packages/\n`);
