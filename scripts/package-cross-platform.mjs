/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DiskSentinel Pro - Cross-Platform Release Packaging Script
 * Generates standalone distribution ZIP archives and tarballs in dist-packages/
 * Compatible with Windows, macOS, Linux, and GitHub Actions runners.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read package.json version & handle CLI overrides
const args = process.argv.slice(2);
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

// Use CLI argument if provided, otherwise fallback to package.json
const rawVersion = args[0] || pkg.version || '4.5.0';
const versionTag = rawVersion.startsWith('v') || rawVersion === 'latest-snapshot' ? rawVersion : `v${rawVersion}`;
const version = versionTag.startsWith('v') ? versionTag.substring(1) : versionTag;

console.log(`\n========================================================`);
console.log(`📦 DiskSentinel Pro Release Packaging: ${versionTag}`);
console.log(`========================================================\n`);

// 2. Ensure dist/ exists
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log(`⚙️ dist/ directory missing or incomplete. Running 'npm run build'...`);
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
}

// 3. Ensure dist-packages/ directory exists
const distPackagesDir = path.join(rootDir, 'dist-packages');
if (!fs.existsSync(distPackagesDir)) {
  fs.mkdirSync(distPackagesDir, { recursive: true });
}

// Pure Node.js Standard ZIP Generator (PKZIP Spec 2.0)
class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(relativePath, content) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    // DOS date/time format
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2));
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    
    // Calculate CRC32
    const crc32 = crc32Buffer(data);
    
    // Deflate compression
    const compressed = zlib.deflateRawSync(data);
    const useCompressed = compressed.length < data.length;
    const finalData = useCompressed ? compressed : data;
    const method = useCompressed ? 8 : 0; // 8 = Deflate, 0 = Stored

    this.files.push({
      path: relativePath.replace(/\\/g, '/'),
      data: finalData,
      uncompressedSize: data.length,
      compressedSize: finalData.length,
      crc32,
      dosTime,
      dosDate,
      method
    });
  }

  addDirectory(dirPath, baseInZip = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const zipPath = baseInZip ? `${baseInZip}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        this.addDirectory(fullPath, zipPath);
      } else if (entry.isFile()) {
        this.addFile(zipPath, fs.readFileSync(fullPath));
      }
    }
  }

  toBuffer() {
    let localHeadersSize = 0;
    const localHeaders = [];
    let currentOffset = 0;

    for (const file of this.files) {
      const pathBuf = Buffer.from(file.path, 'utf-8');
      file.offset = currentOffset;

      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0); // Local file header signature
      header.writeUInt16LE(20, 4);          // Version needed: 2.0
      header.writeUInt16LE(0, 6);           // General purpose bit flag
      header.writeUInt16LE(file.method, 8);  // Compression method
      header.writeUInt16LE(file.dosTime, 10);
      header.writeUInt16LE(file.dosDate, 12);
      header.writeUInt32LE(file.crc32, 14);
      header.writeUInt32LE(file.compressedSize, 18);
      header.writeUInt32LE(file.uncompressedSize, 22);
      header.writeUInt16LE(pathBuf.length, 26);
      header.writeUInt16LE(0, 28); // Extra field length

      const fileChunk = Buffer.concat([header, pathBuf, file.data]);
      localHeaders.push(fileChunk);
      currentOffset += fileChunk.length;
      localHeadersSize += fileChunk.length;
    }

    // Central Directory
    const centralHeaders = [];
    let centralDirSize = 0;

    for (const file of this.files) {
      const pathBuf = Buffer.from(file.path, 'utf-8');
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0); // Central directory header signature
      header.writeUInt16LE(20, 4);          // Version made by: 2.0
      header.writeUInt16LE(20, 6);          // Version needed: 2.0
      header.writeUInt16LE(0, 8);           // General purpose bit flag
      header.writeUInt16LE(file.method, 10);
      header.writeUInt16LE(file.dosTime, 12);
      header.writeUInt16LE(file.dosDate, 14);
      header.writeUInt32LE(file.crc32, 16);
      header.writeUInt32LE(file.compressedSize, 20);
      header.writeUInt32LE(file.uncompressedSize, 24);
      header.writeUInt16LE(pathBuf.length, 28);
      header.writeUInt16LE(0, 30); // Extra field length
      header.writeUInt16LE(0, 32); // File comment length
      header.writeUInt16LE(0, 34); // Disk number start
      header.writeUInt16LE(0, 36); // Internal file attributes
      header.writeUInt32LE(0, 38); // External file attributes
      header.writeUInt32LE(file.offset, 42); // Relative offset of local header

      const centralChunk = Buffer.concat([header, pathBuf]);
      centralHeaders.push(centralChunk);
      centralDirSize += centralChunk.length;
    }

    // End of Central Directory (EOCD)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // Number of this disk
    eocd.writeUInt16LE(0, 6);          // Disk with central directory
    eocd.writeUInt16LE(this.files.length, 8);  // Total entries on this disk
    eocd.writeUInt16LE(this.files.length, 10); // Total entries in central dir
    eocd.writeUInt32LE(centralDirSize, 12);     // Size of central directory
    eocd.writeUInt32LE(currentOffset, 16);     // Offset of start of central dir
    eocd.writeUInt16LE(0, 20);                 // Comment length

    return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
  }
}

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32Buffer(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 4. Create Desktop Setup Package ZIP
const setupZipName = `DiskSentinel-Pro-${versionTag}-Desktop-Setup-Package.zip`;
const setupZipPath = path.join(distPackagesDir, setupZipName);

console.log(`📦 Creating: ${setupZipName}...`);
const zip1 = new SimpleZip();

// Add dist files
zip1.addDirectory(distDir, 'app');

// Add native binaries if exist
const nativeDir = path.join(rootDir, 'bin', 'native');
if (fs.existsSync(nativeDir)) {
  zip1.addDirectory(nativeDir, 'bin/native');
}

// Add README & guides if available
const docsToAdd = ['README.md', 'setup.iss', 'build.bat'];
for (const doc of docsToAdd) {
  const p = path.join(rootDir, doc);
  if (fs.existsSync(p)) {
    zip1.addFile(doc, fs.readFileSync(p));
  }
}

const setupZipBuf = zip1.toBuffer();
fs.writeFileSync(setupZipPath, setupZipBuf);
console.log(`   ✅ Created ${setupZipName} (${(setupZipBuf.length / (1024 * 1024)).toFixed(2)} MB)`);

// 5. Create Standalone PC Cross-Platform ZIP (Windows / macOS / Linux)
const pcZipName = `DiskSentinel-Pro-${versionTag}-PC-Windows-macOS-Linux.zip`;
const pcZipPath = path.join(distPackagesDir, pcZipName);

console.log(`📦 Creating: ${pcZipName}...`);
const zip2 = new SimpleZip();
zip2.addDirectory(distDir, 'DiskSentinelPro');

// Add native binaries to portable zip root
if (fs.existsSync(nativeDir)) {
  const bins = fs.readdirSync(nativeDir);
  for (const bin of bins) {
    zip2.addFile(`DiskSentinelPro/${bin}`, fs.readFileSync(path.join(nativeDir, bin)));
  }
}

// Add quick start launcher scripts
zip2.addFile('DiskSentinelPro/README.txt', `DiskSentinel Pro ${versionTag} Standalone Application
-------------------------------------------------------
Open index.html in any modern browser (Chrome, Edge, Firefox, Brave)
Or run with Desktop Native Host: DiskSentinelPro.exe
GitHub: https://github.com/AhBiYout-all/disk-bad-sector-scanner
Official Blog: https://ahbiyoutvibe.blogspot.com/
Affiliation: https://www.cisnet.co.kr
`);

const pcZipBuf = zip2.toBuffer();
fs.writeFileSync(pcZipPath, pcZipBuf);
console.log(`   ✅ Created ${pcZipName} (${(pcZipBuf.length / (1024 * 1024)).toFixed(2)} MB)`);

// 6. Summary of packaged files
console.log(`\n🎉 Packaging completed successfully!`);
console.log(`📂 Output directory: ${distPackagesDir}`);
const outputFiles = fs.readdirSync(distPackagesDir);
for (const file of outputFiles) {
  const stat = fs.statSync(path.join(distPackagesDir, file));
  console.log(`   - ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
}
console.log(``);
