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
  platform: 'PC (Windows/Mac/Linux)' | 'Android (APK/PWA)' | 'iOS (WebBundle)' | 'Universal';
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
    version: 'v4.3.2',
    releaseDate: '2026-10-08',
    tagName: 'v4.3.2',
    name: 'DiskSentinel Pro v4.3.2 (설치 경로 직접 지정 및 안정성 강화 패치)',
    body: `### 🚀 v4.3.2 주요 업데이트 내역
- **Inno Setup 설치 경로 직접 지정 구현**: 사용자가 설치 위치를 직관적으로 변경 가능하도록 Inno Setup 디렉토리 선택 창 활성화 및 기본 경로를 'C:\\DiskSentinelPro'로 직접 매핑하여 권한 오류 예방.
- **보고서 내보내기 (Export CSV) 성능 고도화**: 대량 배드섹터 감지 시 엑셀 한글 깨짐 방지 인코딩(UTF-8 BOM) 및 동시성 버퍼 제어 추가 개선.
- **자동 빌드 & 패키징 배치 스크립트 ('build.bat') 업데이트**: v4.3.1 빌드 산출물 이름 및 Inno Setup ISCC 컴파일 단계 버그 패치 및 완료 시 자동 폴더 팝업 연동.`,
    htmlUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/tag/v4.3.2',
    isLatest: true,
    assets: [
      {
        name: 'DiskSentinel-Pro-v4.3.2-PC-Windows-macOS-Linux.zip',
        platform: 'PC (Windows/Mac/Linux)',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.3.2/DiskSentinel-Pro-v4.3.2-PC-Windows-macOS-Linux.zip',
        sizeMb: 15.3,
        description: '데스크톱 PC 전용 독립 실행 오프라인 설치 패키지'
      },
      {
        name: 'DiskSentinel-Pro-v4.3.2-Android.apk.zip',
        platform: 'Android (APK/PWA)',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.3.2/DiskSentinel-Pro-v4.3.2-Android.apk.zip',
        sizeMb: 8.5,
        description: '안드로이드 모바일 & 태블릿 최적화 패키지'
      },
      {
        name: 'DiskSentinel-Pro-v4.3.2-iOS-WebBundle.zip',
        platform: 'iOS (WebBundle)',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.3.2/DiskSentinel-Pro-v4.3.2-iOS-WebBundle.zip',
        sizeMb: 8.1,
        description: 'iOS Safari / 홈 화면 바로가기 패키지'
      },
      {
        name: 'DiskSentinel-Pro-v4.3.2-Universal-WebInstaller.tar.gz',
        platform: 'Universal',
        downloadUrl: 'https://github.com/AhBiYout-all/disk-bad-sector-scanner/releases/download/v4.3.2/DiskSentinel-Pro-v4.3.2-Universal-WebInstaller.tar.gz',
        sizeMb: 11.9,
        description: '모든 OS에서 동작하는 유니버설 웹 인스톨러'
      }
    ]
  } as ReleaseInfo
};
