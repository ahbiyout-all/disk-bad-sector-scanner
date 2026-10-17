/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GitHub Essential Release Bundler Script for DiskSentinel Pro
 * Generates and stages only the essential, verified files required for building
 * and deploying the project from a clean clone, isolating them in dedicated folders:
 * 1. `github-release/` (Visible in all file explorers, IDEs, and environments)
 * 2. `.github-release/` (Hidden dot-directory standard)
 * 
 * Target: https://github.com/AhBiYout-all/disk-bad-sector-scanner
 * Developer: AhBiYout (CISNet)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Staging destinations: both visible `github-release` and `.github-release`
const visibleReleaseDir = path.join(rootDir, 'github-release');
const dotReleaseDir = path.join(rootDir, '.github-release');

// List of exact core files and directories essential for clean build & documentation
const ESSENTIAL_FILES = [
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'metadata.json',
  '.env.example',
  '.gitignore',
  'setup.iss',
  'build.bat',
  'build-dll.bat',
  'build-rust.bat',
];

const ESSENTIAL_DIRECTORIES = [
  'src',
  'public',
  'docs',
  '.github',
  'scripts',
  'src-tauri',
];

// Patterns to exclude strictly to prevent bloating or security leakage
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'dist-packages',
  'build',
  '.cache',
  '.git',
  '.github-release',
  'github-release',
  '.env',
  '.env.local',
  'Thumbs.db',
  '.DS_Store',
  '*.tmp',
  '*.log',
  'git-push-auto.bat',
];

function shouldExclude(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (norm.endsWith(ext)) return true;
    } else {
      if (norm === pattern || norm.startsWith(`${pattern}/`) || norm.includes(`/${pattern}/`)) {
        return true;
      }
    }
  }
  return false;
}

function copyRecursive(src, dest, relBase = '') {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (shouldExclude(relBase)) {
      return;
    }
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      const childRel = relBase ? `${relBase}/${entry}` : entry;
      if (shouldExclude(childRel)) {
        continue;
      }
      copyRecursive(srcPath, destPath, childRel);
    }
  } else if (stats.isFile()) {
    if (!shouldExclude(relBase)) {
      const parentDir = path.dirname(dest);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
    }
  }
}

function bundleToDirectory(targetDir, displayName) {
  console.log(`\n-> Staging into [${displayName}]: ${targetDir}`);

  // Clean target directory
  if (fs.existsSync(targetDir)) {
    console.log(`   Cleaning previous ${displayName} directory...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  let fileCount = 0;

  // 1. Copy essential files
  for (const file of ESSENTIAL_FILES) {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(targetDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
      console.log(`   [FILE] + ${file}`);
    } else {
      console.warn(`   [WARN] Missing expected core file: ${file}`);
    }
  }

  // 2. Copy essential directories
  for (const dir of ESSENTIAL_DIRECTORIES) {
    const srcPath = path.join(rootDir, dir);
    const destPath = path.join(targetDir, dir);
    if (fs.existsSync(srcPath)) {
      console.log(`   [DIR]  + ${dir}/`);
      copyRecursive(srcPath, destPath, dir);
    } else {
      console.warn(`   [WARN] Missing expected core dir: ${dir}`);
    }
  }

  // 3. Create RELEASE_MANIFEST.md in dedicated folder
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const folderName = path.basename(targetDir);
  const manifestContent = `# DiskSentinel Pro - GitHub Essential Build Package (v${pkg.version})
> Generated: ${new Date().toISOString()}
> Folder: ${folderName}
> Repository: https://github.com/AhBiYout-all/disk-bad-sector-scanner
> Author: AhBiYout (CISNet)

이 전용 디렉터리(\`${folderName}\`)는 깃허브 원격 저장소 및 배포에 필요한 순수 핵심 소스 및 필수 빌드 구성 파일만을 추출하여 관리하는 전용 스테이징 폴더입니다.
(탐색기/에디터의 숨김 파일 설정 유무와 무관하게 즉시 탐색할 수 있도록 \`github-release/\` 및 \`.github-release/\` 동시 동기화)

## 포함된 핵심 구성 요소
- **설정 및 명세 파일**:
  - \`package.json\`, \`tsconfig.json\`, \`vite.config.ts\`, \`index.html\`, \`metadata.json\`
- **소스 코드**:
  - \`src/\` (TypeScript / React 19 / Tailwind CSS 4 핵심 엔진 및 UI 컴포넌트)
  - \`public/\` (사운드 에셋, 파비콘, 정적 자산)
- **빌드 및 배포 자동화**:
  - \`setup.iss\` (Inno Setup 6 윈도우 인스톨러 생성기)
  - \`build.bat\` (Windows 원클릭 프로덕션 빌드 스크립트)
  - \`git-push-auto.bat\` (GitHub 자동 동기화 & 릴리스 태깅 스크립트)
  - \`scripts/\` (빌드 패키징, 릴리스 동기화 스크립트)
  - \`.github/workflows/\` (CI/CD 자동 빌드 및 릴리스 파이프라인)
- **문서**:
  - \`docs/\` (패치노트, 보안 보고서, 작업 로그, DLL 명세, 라이선스 안내)

## 제외된 불필요/임시 파일
- \`node_modules/\` (npm 의존성 패키지)
- \`dist/\`, \`dist-packages/\`, \`build/\` (빌드 산출물 및 임시 패키지)
- \`.env\`, \`.env.local\` 등 비밀정보 및 환경설정 파일
- 운영체제 캐시 및 에디터 메타데이터 (\`.DS_Store\`, \`Thumbs.db\`, \`.vscode/\`)
`;

  fs.writeFileSync(path.join(targetDir, 'RELEASE_MANIFEST.md'), manifestContent, 'utf8');
  console.log(`   ✓ Completed staging in: ${targetDir}`);
}

console.log('===================================================================');
console.log('  DiskSentinel Pro - GitHub Essential Release Bundler');
console.log('===================================================================');

// Run bundler for both visible and hidden folders
bundleToDirectory(visibleReleaseDir, 'github-release (Visible)');
bundleToDirectory(dotReleaseDir, '.github-release (Dot/Hidden)');

console.log('\n-------------------------------------------------------------------');
console.log('✓ Successfully created both visible "github-release/" and ".github-release/"!');
console.log('✓ Only essential source & build configuration files have been staged.');
console.log('===================================================================\n');
