/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Disk Bad Sector Scanner - Unpacked Multi-File Desktop Staging & Hygiene Audit
 * Prepares clean unpacked runtime distribution without portable archives or unnecessary docs.
 * Compatible with Windows, macOS, Linux, and GitHub Actions runners.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read package.json version & handle CLI overrides
const args = process.argv.slice(2);
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const rawVersion = args[0] || pkg.version || '4.6.0';
const cleanVersion = rawVersion.replace(/^v/, '').trim() || pkg.version || '4.6.0';
const versionTag = `v${cleanVersion}`;

console.log(`\n========================================================`);
console.log(`📦 Disk Bad Sector Scanner Unpacked Staging: ${versionTag}`);
console.log(`========================================================\n`);

// 2. Ensure dist/ exists
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log(`⚙️ dist/ directory missing or incomplete. Running 'npm run build'...`);
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
}

// 3. Strip disallowed artifacts/directories from dist/ before Inno Setup packs them
const FORBIDDEN_PATTERNS = [
  /\.zip$/i,
  /\.7z$/i,
  /\.tar(\.gz)?$/i,
  /\.tmp$/i,
  /\.log$/i,
  /\.bak$/i,
  /\.md$/i,
  /\.txt$/i,
  /\.bat$/i,
  /\.vbs$/i,
  /portable/i,
  /^\.gitignore$/i,
  /^readme/i,
  /^license/i
];

function sanitizeDistDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'aistudio') {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`🧹 Removed unnecessary folder from dist: ${path.relative(rootDir, fullPath)}`);
        continue;
      }
      sanitizeDistDirectory(fullPath);
      if (fs.readdirSync(fullPath).length === 0) {
        fs.rmdirSync(fullPath);
      }
    } else if (entry.isFile()) {
      if (FORBIDDEN_PATTERNS.some((rx) => rx.test(entry.name))) {
        fs.rmSync(fullPath, { force: true });
        console.log(`🧹 Removed disallowed file from dist: ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}

sanitizeDistDirectory(distDir);

// 4. Rebuild fresh Unpacked Multi-File staging folder (no Portable ZIPs)
const distPackagesDir = path.join(rootDir, 'dist-packages');
if (fs.existsSync(distPackagesDir)) {
  fs.rmSync(distPackagesDir, { recursive: true, force: true });
}
const unpackedDir = path.join(distPackagesDir, `DiskBadSectorScanner-Unpacked-${versionTag}`);
fs.mkdirSync(unpackedDir, { recursive: true });

function copyCleanFiles(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyCleanFiles(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyCleanFiles(distDir, unpackedDir);

// 5. Copy native binaries (exe & dll) if compiled
const nativeDir = path.join(rootDir, 'bin', 'native');
if (fs.existsSync(nativeDir)) {
  const bins = fs.readdirSync(nativeDir);
  for (const bin of bins) {
    const ext = path.extname(bin).toLowerCase();
    if (ext === '.exe' || ext === '.dll') {
      fs.copyFileSync(path.join(nativeDir, bin), path.join(unpackedDir, bin));
    }
  }
}

console.log(`✅ Unpacked Multi-File runtime staged at: ${path.relative(rootDir, unpackedDir)}`);
const stagedFiles = fs.readdirSync(unpackedDir);
for (const file of stagedFiles) {
  const stat = fs.statSync(path.join(unpackedDir, file));
  console.log(`   - ${file}${stat.isDirectory() ? '/' : ` (${(stat.size / 1024).toFixed(1)} KB)`}`);
}
console.log(`\n🎉 Installer staging & hygiene check completed (Portable archives disabled).\n`);
