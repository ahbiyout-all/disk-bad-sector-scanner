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
  version: 'v4.6.0',
  versionNumber: '4.6.0',
  buildDate: '2026-11-13',
  
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
  }
};
