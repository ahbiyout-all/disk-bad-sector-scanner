/**
 * @file RecoveryCompletionSummaryModal.tsx
 * @brief Recovery Completion Summary Modal displaying real total recovered files,
 *        success rate percentage, downloadable recovered artifacts, and native OS / browser notifications.
 * @license Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppLocale } from '../types';
import { soundManager } from '../utils/audio';
import { invokeTauriNativeNotification, isTauriDesktopRuntime } from '../utils/nativeDriveEngine';
import {
  CheckCircle2,
  Download,
  FileCheck,
  FolderOpen,
  ShieldCheck,
  Trophy,
  X
} from 'lucide-react';

export interface RecoverySummaryItem {
  id?: string;
  name: string;
  size: string;
  path: string;
  status: string;
  canDownload?: boolean;
}

export interface RecoverySummaryData {
  scenarioTitle: string;
  driveModel: string;
  totalFilesScanCount: number;
  recoveredFilesCount: number;
  successRatePct: number;
  totalBytesFormatted: string;
  durationSeconds: number;
  recoveredItemList?: RecoverySummaryItem[];
}

interface RecoveryCompletionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: AppLocale;
  summaryData: RecoverySummaryData;
  onExportReport?: () => void;
  onOpenFolder?: () => void;
  onDownloadItem?: (index: number, item: RecoverySummaryItem) => Promise<void> | void;
}

export const RecoveryCompletionSummaryModal: React.FC<RecoveryCompletionSummaryModalProps> = ({
  isOpen,
  onClose,
  locale,
  summaryData,
  onExportReport,
  onOpenFolder,
  onDownloadItem
}) => {
  const en = locale === 'en';
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActionNotice(null);
      return;
    }

    // 1. Play completion chime
    soundManager.playCompletionChime();

    const title = en ? 'DiskSentinel Pro Recovery Completed' : 'DiskSentinel Pro 복구 작업 완료';
    const body = en
      ? `${summaryData.scenarioTitle}: ${summaryData.recoveredFilesCount} item(s) recovered (${summaryData.successRatePct}% rate).`
      : `${summaryData.scenarioTitle}: 총 ${summaryData.recoveredFilesCount}건 복구/분석 완료 (성공률 ${summaryData.successRatePct}%)`;

    // 2. Native OS Notification via Tauri IPC when available
    if (isTauriDesktopRuntime()) {
      void invokeTauriNativeNotification(title, body, 'info');
    }

    // 3. Browser / System Native Notification fallback
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, { body });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission()
            .then(permission => {
              if (permission === 'granted') {
                new Notification(title, { body });
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      // Ignore iFrame notification restrictions gracefully
    }
  }, [isOpen, summaryData, en]);

  if (!isOpen) return null;

  const badgeTone =
    summaryData.recoveredFilesCount > 0 && summaryData.successRatePct >= 80
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
      : summaryData.recoveredFilesCount > 0
      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
      : 'bg-slate-500/20 text-slate-600 dark:text-slate-400';

  const badgeLabel =
    summaryData.recoveredFilesCount > 0 && summaryData.successRatePct >= 80
      ? 'COMPLETED'
      : summaryData.recoveredFilesCount > 0
      ? 'PARTIAL'
      : 'NO MATCH';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-emerald-600/10 dark:bg-emerald-600/15">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-full bg-emerald-600 text-white shadow-sm shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>{en ? 'Data Recovery Operation Completed' : '데이터 복구 작업 최종 완료'}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badgeTone}`}>
                  {badgeLabel}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {summaryData.scenarioTitle} · {summaryData.driveModel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800 dark:text-slate-200">
          {/* Key Metric Grid Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Success Rate' : '복구 성공률'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {summaryData.successRatePct}%
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Measured Integrity' : '실측 무결성 기준'}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Recovered Items' : '복구된 총 파일 수'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                {summaryData.recoveredFilesCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                {en
                  ? `Out of ${summaryData.totalFilesScanCount.toLocaleString()} scanned`
                  : `총 ${summaryData.totalFilesScanCount.toLocaleString()}건 스캔`}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Total Volume' : '복구된 데이터 용량'}
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
                {summaryData.totalBytesFormatted}
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Extracted Payload' : '추출 가능 페이로드'}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Elapsed Time' : '소요 시간'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {Math.floor(summaryData.durationSeconds / 60)}m {summaryData.durationSeconds % 60}s
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Measured Runtime' : '실제 스캔 소요 시간'}
              </div>
            </div>
          </div>

          {actionNotice && (
            <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionNotice}</span>
            </div>
          )}

          {/* Recovered Item List Preview */}
          {summaryData.recoveredItemList && summaryData.recoveredItemList.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {en ? 'Recovered Items & Export' : '복구된 항목 및 개별 다운로드'}
              </h3>
              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-[#0B101D] text-slate-500 font-mono sticky top-0">
                    <tr>
                      <th className="p-2.5">{en ? 'Name' : '항목명'}</th>
                      <th className="p-2.5">{en ? 'Size' : '크기'}</th>
                      <th className="p-2.5">{en ? 'Location' : '위치 / LBA'}</th>
                      <th className="p-2.5">{en ? 'Status' : '상태'}</th>
                      {onDownloadItem && <th className="p-2.5 text-right">{en ? 'Save' : '저장'}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                    {summaryData.recoveredItemList.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400">
                          <div className="flex items-center gap-1.5 max-w-[180px]">
                            <FileCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{item.size}</td>
                        <td className="p-2.5 text-slate-500 truncate max-w-[160px]">{item.path}</td>
                        <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">{item.status}</td>
                        {onDownloadItem && (
                          <td className="p-2.5 text-right">
                            {item.canDownload ? (
                              <button
                                type="button"
                                disabled={downloadingIdx === idx}
                                onClick={async () => {
                                  setDownloadingIdx(idx);
                                  try {
                                    await onDownloadItem(idx, item);
                                    setActionNotice(
                                      en ? `Saved "${item.name}".` : `"${item.name}" 파일이 저장되었습니다.`
                                    );
                                  } finally {
                                    setDownloadingIdx(null);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                              >
                                <Download className="w-3 h-3" />
                                <span>{en ? 'Save' : '저장'}</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* System Native Notification Status Banner */}
          <div className="p-3.5 rounded-md bg-blue-600/10 border border-blue-600/30 flex items-center gap-3 text-xs text-blue-800 dark:text-blue-300">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <span className="font-bold">{en ? 'System Notification Dispatched: ' : '시스템 네이티브 알림 발송됨: '}</span>
              {en
                ? 'A desktop notification and audio chime were triggered for your recovery session.'
                : '복구 완료 오디오 차임벨과 함께 시스템 네이티브 알림이 전송되었습니다.'}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-2">
            {onExportReport && (
              <button
                type="button"
                onClick={() => {
                  onExportReport();
                  setActionNotice(
                    en ? 'Recovery report (.JSON) downloaded.' : '복구 결과 리포트(.JSON)가 다운로드되었습니다.'
                  );
                }}
                className="px-3.5 h-8 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{en ? 'Export Report (.JSON)' : '복구 리포트 (.JSON) 저장'}</span>
              </button>
            )}
            {onOpenFolder && (
              <button
                type="button"
                onClick={() => {
                  onOpenFolder();
                  setActionNotice(
                    en ? 'Batch export triggered for recovered items.' : '복구 가능한 파일 일괄 다운로드가 시작되었습니다.'
                  );
                }}
                className="px-3.5 h-8 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{en ? 'Download All Artifacts' : '복구 파일 일괄 저장'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 h-8 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            {en ? 'Close & Finish' : '확인 및 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
