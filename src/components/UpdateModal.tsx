import React, { useState } from 'react';
import { PROJECT_INFO, ReleaseInfo, ReleaseAsset } from '../config/projectInfo';
import { compareVersions } from '../utils/updater';
import {
  Sparkles,
  Download,
  ExternalLink,
  CheckCircle2,
  X,
  ArrowUpRight,
  Laptop,
  HardDrive,
  Globe,
  BookOpen,
  Building2,
  Github,
  RefreshCw,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface UpdateModalProps {
  isOpen: boolean;
  release: ReleaseInfo | null;
  currentVersion: string;
  source: 'github-live' | 'error';
  errorMessage?: string;
  onClose: () => void;
  onCheckAgain?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  release,
  currentVersion,
  source,
  errorMessage,
  onClose,
  onCheckAgain
}) => {
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadAsset = (asset: ReleaseAsset) => {
    if (!release) return;
    setDownloadingAsset(asset.name);
    try {
      const link = document.createElement('a');
      link.href = asset.downloadUrl || release.htmlUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Ignore popup block
    }
    setDownloadingAsset(null);
    setDownloadSuccess(asset.name);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const getPlatformIcon = (platform: ReleaseAsset['platform']) => {
    switch (platform) {
      case 'Windows Installer':
        return <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'Windows Standalone (.exe)':
        return <Laptop className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'PC (Windows/Mac/Linux)':
        return <Laptop className="w-4 h-4 text-indigo-400 shrink-0" />;
      default:
        return <Globe className="w-4 h-4 text-purple-400 shrink-0" />;
    }
  };

  const isNewer = release ? compareVersions(release.version, currentVersion) > 0 : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">

        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-linear-to-r from-indigo-50/70 dark:from-indigo-950/40 to-white dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  {source === 'error' || !release
                    ? '업데이트 확인 실패 (GitHub API 응답 오류)'
                    : isNewer
                    ? '새로운 버전 업데이트 알림'
                    : '소프트웨어 최신 상태 확인'}
                </h2>
                {release && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    {release.version}
                  </span>
                )}
                {source === 'github-live' && release && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    GitHub Live
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {source === 'error' || !release
                  ? 'GitHub Releases API 서버와 통신하지 못했습니다.'
                  : isNewer
                  ? 'GitHub Releases 실시간 연동 시스템에서 최신 배포본을 감지했습니다.'
                  : '현재 설치된 버전이 최신 배포본과 일치하며 정상 구동 중입니다.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">

          {source === 'error' || !release ? (
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>실시간 릴리스 정보를 불러오지 못했습니다</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                {errorMessage || 'GitHub 저장소의 최신 릴리스를 조회하는 중 네트워크 오류 또는 요청 제한이 발생했습니다.'}
              </p>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                현재 클라이언트 버전: {currentVersion}
              </div>
            </div>
          ) : (
            <>
              {/* Version Comparison Card */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">현재 구동 버전</span>
                  <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">{currentVersion}</span>
                  <span className="text-[10px] text-slate-400">설치된 로컬 클라이언트</span>
                </div>
                <div className="flex flex-col gap-0.5 border-l border-slate-200 dark:border-slate-800 pl-3">
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">최신 릴리스 버전</span>
                  <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{release.version}</span>
                  {isNewer ? (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> 업데이트 권장
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> 최신 버전 사용 중
                    </span>
                  )}
                </div>
              </div>

              {/* Release Notes */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    릴리스 주요 변경 내역 ({release.tagName})
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {release.releaseDate}
                  </span>
                </div>

                <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line font-mono bg-white dark:bg-slate-900/80 p-2.5 rounded border border-slate-100 dark:border-slate-800/60">
                  {release.body}
                </div>
              </div>

              {/* Cross-Platform Release Assets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-indigo-500" />
                    크로스 플랫폼 설치 패키지 (Release Assets)
                  </h3>
                </div>

                {release.assets.length === 0 ? (
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px]">
                    이 릴리스에는 직접 다운로드 가능한 첨부 파일이 등록되어 있지 않습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {release.assets.map((asset) => (
                      <div
                        key={asset.name}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          {getPlatformIcon(asset.platform)}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                              {asset.name}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
                              <span>{asset.platform}</span>
                              <span>•</span>
                              <span>{asset.sizeMb} MB</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDownloadAsset(asset)}
                          disabled={downloadingAsset === asset.name}
                          className="shrink-0 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                        >
                          {downloadingAsset === asset.name ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : downloadSuccess === asset.name ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          <span>{downloadSuccess === asset.name ? '완료' : '다운로드'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Official Creator & Channel Links Box */}
          <div className="bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                제작자 및 공식 채널 안내
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                개발자: {PROJECT_INFO.developer.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <a
                href={PROJECT_INFO.developer.githubProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Github className="w-3.5 h-3.5 text-slate-800 dark:text-slate-100 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold truncate">GitHub 저장소</div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">{PROJECT_INFO.developer.githubUsername}</div>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
              </a>

              <a
                href={PROJECT_INFO.developer.blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold truncate">공식 구글 블로그</div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">ahbiyoutvibe</div>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
              </a>

              <a
                href={PROJECT_INFO.developer.affiliation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold truncate">소속 기업</div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">cisnet.co.kr</div>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {onCheckAgain && (
              <button
                onClick={onCheckAgain}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>다시 확인</span>
              </button>
            )}
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              Repo: {PROJECT_INFO.repository.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={release?.htmlUrl || PROJECT_INFO.repository.releasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
            >
              <span>GitHub 릴리스 웹 보기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded transition-colors shadow-xs cursor-pointer"
            >
              확인 및 닫기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
