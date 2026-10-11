/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PROJECT_INFO, ReleaseInfo, ReleaseAsset } from '../config/projectInfo';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  release: ReleaseInfo;
  source: 'github-live' | 'fallback';
}

/**
 * Compare two semver strings like "v4.2.0" and "v4.2.1"
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, '').trim();
  const clean2 = v2.replace(/^v/, '').trim();

  const parts1 = clean1.split('.').map(num => parseInt(num, 10) || 0);
  const parts2 = clean2.split('.').map(num => parseInt(num, 10) || 0);

  const length = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < length; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Check GitHub Releases for the latest version.
 * If live API fails (e.g. rate limit, unauthenticated, or repo still private),
 * gracefully falls back to structured release metadata.
 */
export async function checkForGithubReleaseUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = PROJECT_INFO.version;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(PROJECT_INFO.repository.latestApiUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const tagName = data.tag_name || data.name || currentVersion;
      const releaseVersion = tagName.startsWith('v') ? tagName : `v${tagName}`;

      const rawAssets = Array.isArray(data.assets) ? data.assets : [];
      const parsedAssets: ReleaseAsset[] = rawAssets.map((asset: any) => {
        let platform: ReleaseAsset['platform'] = 'Universal';
        const lowerName = (asset.name || '').toLowerCase();
        if (lowerName.includes('pc') || lowerName.includes('win') || lowerName.includes('mac') || lowerName.includes('linux')) {
          platform = 'PC (Windows/Mac/Linux)';
        } else if (lowerName.includes('android') || lowerName.includes('apk')) {
          platform = 'Android (APK/PWA)';
        } else if (lowerName.includes('ios') || lowerName.includes('ipa')) {
          platform = 'iOS (WebBundle)';
        }

        return {
          name: asset.name,
          platform,
          downloadUrl: asset.browser_download_url || PROJECT_INFO.repository.releasesUrl,
          sizeMb: asset.size ? Number((asset.size / (1024 * 1024)).toFixed(1)) : 10.0,
          description: asset.name
        };
      });

      const release: ReleaseInfo = {
        version: releaseVersion,
        releaseDate: data.published_at ? data.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
        tagName: data.tag_name || releaseVersion,
        name: data.name || `DiskSentinel Pro ${releaseVersion}`,
        body: data.body || '새로운 기능과 성능 최적화가 포함된 최신 릴리스입니다.',
        htmlUrl: data.html_url || PROJECT_INFO.repository.releasesUrl,
        isLatest: true,
        assets: parsedAssets.length > 0 ? parsedAssets : PROJECT_INFO.sampleLatestRelease.assets
      };

      const hasUpdate = compareVersions(releaseVersion, currentVersion) > 0;

      return {
        hasUpdate,
        currentVersion,
        latestVersion: releaseVersion,
        release,
        source: 'github-live'
      };
    }
  } catch (error) {
    console.warn('Live GitHub release fetch unavailable, using fallback:', error);
  }

  // Graceful fallback
  const sample = PROJECT_INFO.sampleLatestRelease;
  const hasUpdate = compareVersions(sample.version, currentVersion) > 0;

  return {
    hasUpdate,
    currentVersion,
    latestVersion: sample.version,
    release: sample,
    source: 'fallback'
  };
}
