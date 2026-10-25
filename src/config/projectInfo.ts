/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * [제작자 및 공식 채널 안내]
 * 개발자: AhBiYout
 * GitHub 저장소: https://github.com/AhBiYout-all
 * 공식 구글 블로그: https://ahbiyoutvibe.blogspot.com/
 * 소속 : https://www.cisnet.co.kr
 */

export interface ReleaseAsset {
  name: string;
  platform: 'PC (Windows/Mac/Linux)' | 'Windows Installer' | 'Windows Standalone (.exe)' | 'Universal Desktop';
  downloadUrl: string;
  sizeMb: number;
  description: string;
}

export interface ReleaseInfo {
  version: string;
  releaseDate: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  isLatest: boolean;
  assets: ReleaseAsset[];
}

export const PROJECT_INFO = {
  appName: 'DiskSentinel Pro',
  appKoreanName: '디스크 배드섹터 검사기',
  version: 'v4.5.0',
  versionNumber: '4.5.0',
  buildDate: '2026-10-15',
  
  // Developer & Official Channels
  developer: {
    name: 'AhBiYout',
    githubUsername: 'AhBiYout-all',
    githubProfileUrl: 'https://github.com/AhBiYout-all',
    blogUrl: 'https://ahbiyoutvibe.blogspot.com/',
    affiliation: {
      name: 'CISNet',
      url: 'https://www.cisnet.co.kr',
    }
  },

  // Repository & Releases
  repository: {
    name: 'disk-bad-sector-scanner',
    fullName: 'AhBiYout-all/disk-bad-sector-scanner',
    url: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner',
    releasesUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases',
    latestApiUrl: 'https://api.github.com/repos/AhBiYout-all/disk-bad-sector-scanner/releases/latest',
    allReleasesApiUrl: 'https://api.github.com/repos/AhBiYout-all/disk-bad-sector-scanner/releases',
  },

  // Fallback release info for demo or when API is unreachable
  sampleLatestRelease: {
    version: 'v4.5.0',
    releaseDate: '2026-10-15',
    tagName: 'v4.5.0',
    name: 'DiskSentinel Pro v4.5.0 (W3C StorageManager & 실시간 OS 호스트 텔레메트리 연동)',
    body: `### 🚀 v4.5.0 주요 업데이트 내역
- **W3C StorageManager & OPFS Buffer Probe 실측 연동**: 브라우저 및 데스크톱 환경에서 호스트 시스템의 실제 디스크 용량, 사용량, 초저지연 I/O 대역폭을 다이렉트 측정.
- **실제 파일/볼륨 직접 마운트 검사**: 로컬 디스크 파일(.iso, .img, .bin, 미디어) 및 폴더 볼륨을 가상 드라이브로 마운트하여 실측 섹터 검사 및 비트 카빙 수복 지원.
- **다중 드라이브 병렬 검사 및 트레이 가디언 실시간 CPU/RAM 연동**: 실제 시스템 CPU 코어 수와 물리 메모리 힙 기반 백그라운드 모니터링 엔진 고도화.`,
    htmlUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/tag/v4.5.0',
    isLatest: true,
    assets: [
      {
        name: 'DiskSentinel-Pro-v4.5.0-PC-Windows-macOS-Linux.zip',
        platform: 'PC (Windows/Mac/Linux)',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.5.0/DiskSentinel-Pro-v4.5.0-PC-Windows-macOS-Linux.zip',
        sizeMb: 16.2,
        description: '데스크톱 및 워크스테이션 PC 전용 독립 실행 오프라인 설치 패키지'
      },
      {
        name: 'DiskSentinel-Pro-v4.5.0-Universal-WebInstaller.tar.gz',
        platform: 'Universal Desktop',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.5.0/DiskSentinel-Pro-v4.5.0-Universal-WebInstaller.tar.gz',
        sizeMb: 12.4,
        description: '데스크톱 브라우저 및 Tauri 네이티브 런타임 유니버설 인스톨러'
      }
    ]
  } as ReleaseInfo
};
