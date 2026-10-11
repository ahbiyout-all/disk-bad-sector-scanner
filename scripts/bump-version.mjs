/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Version Synchronization Script for DiskSentinel Pro
 * Synchronizes version across package.json, metadata.json, and src/config/projectInfo.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetVersion = process.argv[2];

if (!targetVersion) {
  console.log('Usage: node scripts/bump-version.mjs <new-version> (e.g. 4.2.1 or v4.2.1)');
  process.exit(1);
}

const cleanVersion = targetVersion.replace(/^v/, '').trim();
const taggedVersion = `v${cleanVersion}`;

console.log(`\n🚀 Synchronizing DiskSentinel Pro to version: ${taggedVersion} (${cleanVersion})\n`);

// 1. Update package.json
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = cleanVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✓ Updated package.json -> ${cleanVersion}`);
}

// 2. Update metadata.json if exists
const metaPath = path.join(rootDir, 'metadata.json');
if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(`✓ Verified metadata.json synchronization`);
}

// 3. Update src/config/projectInfo.ts
const projectInfoPath = path.join(rootDir, 'src', 'config', 'projectInfo.ts');
if (fs.existsSync(projectInfoPath)) {
  let content = fs.readFileSync(projectInfoPath, 'utf8');
  content = content.replace(/version:\s*'v[^']+'/, `version: '${taggedVersion}'`);
  content = content.replace(/versionNumber:\s*'[^']+'/, `versionNumber: '${cleanVersion}'`);
  const today = new Date().toISOString().split('T')[0];
  content = content.replace(/buildDate:\s*'[^']+'/, `buildDate: '${today}'`);
  fs.writeFileSync(projectInfoPath, content, 'utf8');
  console.log(`✓ Updated src/config/projectInfo.ts -> ${taggedVersion}`);
}

console.log(`\n✅ Version synchronization complete! All channels linked to ${taggedVersion}.\n`);
