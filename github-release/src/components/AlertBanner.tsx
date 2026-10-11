import React from 'react';
import { AlertTriangle, X, ShieldAlert, ArrowRight, Bell } from 'lucide-react';

interface AlertBannerProps {
  badCount: number;
  latestBadLba?: number;
  onOpenReport: () => void;
  onDismiss: () => void;
  visible: boolean;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  badCount,
  latestBadLba,
  onOpenReport,
  onDismiss,
  visible,
  notificationPermission,
  onRequestNotification
}) => {
  if (!visible || badCount === 0) return null;

  return (
    <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-2.5 sm:p-3 text-red-300 shadow-xs mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 bg-red-900/40 text-red-400 rounded shrink-0 mt-0.5 sm:mt-0">
            <ShieldAlert className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs sm:text-sm text-red-200">
                🚨 배드섹터 {badCount}개 검출! (즉각 백업 권장)
              </span>
              {latestBadLba !== undefined && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-red-900/60 text-red-200 font-semibold">
                  LBA: #{latestBadLba.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-[11px] text-red-300/80 mt-0.5 hidden sm:block">
              디스크 표면에 읽기 불가능한 물리적/논리적 손상 블록이 감지되었습니다. 파일 유실을 방지하려면 중요 데이터를 즉시 백업하십시오.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
          {notificationPermission !== 'granted' && (
            <button
              onClick={onRequestNotification}
              title="배드섹터 발견 시 브라우저 알림 받기"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-900/30 hover:bg-red-900/60 text-red-200 transition-colors border border-red-700/40"
            >
              <Bell className="w-3 h-3" />
              알림 권한
            </button>
          )}

          <button
            onClick={onOpenReport}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors shadow-xs"
          >
            보고서 확인
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            onClick={onDismiss}
            className="p-1 text-red-400 hover:bg-red-900/50 rounded transition-colors"
            title="알림 배너 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
