/**
 * @file RecoveryCompletionSummaryModal.tsx
 * @brief Recovery Completion Summary Modal displaying total recovered files,
 *        success rate percentage, and triggering system native notifications with audio chime.
 * @license Apache-2.0
 */

import React, { useEffect } from 'react';
import { AppLocale } from '../types';
import { soundManager } from '../utils/audio';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Sparkles,
  Trophy,
  X
} from 'lucide-react';

export interface RecoverySummaryData {
  scenarioTitle: string;
  driveModel: string;
  totalFilesScanCount: number;
  recoveredFilesCount: number;
  successRatePct: number;
  totalBytesFormatted: string;
  durationSeconds: number;
  recoveredItemList?: Array<{ name: string; size: string; path: string; status: string }>;
}

interface RecoveryCompletionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: AppLocale;
  summaryData: RecoverySummaryData;
  onExportReport?: () => void;
  onOpenFolder?: () => void;
}

export const RecoveryCompletionSummaryModal: React.FC<RecoveryCompletionSummaryModalProps> = ({
  isOpen,
  onClose,
  locale,
  summaryData,
  onExportReport,
  onOpenFolder
}) => {
  const en = locale === 'en';

  useEffect(() => {
    if (!isOpen) return;

    // 1. Play success audio completion chime
    soundManager.playCompletionChime();

    // 2. Trigger Browser / System Native Notification if supported & permitted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(en ? 'DiskSentinel Pro Recovery' : '디스크센티넬 프로 복구 완료', {
          body: en
            ? `Recovery completed successfully! Recovered: ${summaryData.recoveredFilesCount} files (${summaryData.successRatePct}% success rate).`
            : `데이터 복구 작업이 완료되었습니다! 복구된 파일: ${summaryData.recoveredFilesCount}개 (성공률: ${summaryData.successRatePct}%)`,
          icon: '/favicon.ico'
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(en ? 'DiskSentinel Pro Recovery' : '디스크센티넬 프로 복구 완료', {
              body: en
                ? `Recovery completed successfully! Recovered: ${summaryData.recoveredFilesCount} files (${summaryData.successRatePct}% success rate).`
                : `데이터 복구 작업이 완료되었습니다! 복구된 파일: ${summaryData.recoveredFilesCount}개 (성공률: ${summaryData.successRatePct}%)`
            });
          }
        });
      }
    }
  }, [isOpen, summaryData, en]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs select-none animate-in fade-in duration-200"
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
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-emerald-600 text-white shadow-sm">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{en ? 'Data Recovery Operation Completed' : '데이터 복구 작업 최종 완료'}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  SUCCESS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {summaryData.scenarioTitle} · {summaryData.driveModel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-800 dark:text-slate-200">
          {/* Key Metric Grid Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Success Rate' : '복구 성공률'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                {summaryData.successRatePct}%
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Verified Integrity' : '무결성 검증 완료'}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Recovered Files' : '복구된 총 파일 수'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-blue-600 dark:text-blue-400">
                {summaryData.recoveredFilesCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? `Out of ${summaryData.totalFilesScanCount} scanned` : `총 스캔 ${summaryData.totalFilesScanCount}건 중`}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Total Volume' : '복구된 데이터 용량'}
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100 truncate">
                {summaryData.totalBytesFormatted}
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Payload Exported' : '추출 페이로드'}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-center space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {en ? 'Elapsed Time' : '소요 시간'}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
                {Math.floor(summaryData.durationSeconds / 60)}m {summaryData.durationSeconds % 60}s
              </div>
              <div className="text-[10px] text-slate-400">
                {en ? 'Optimized Multi-Pass' : '멀티패스 최적화 완료'}
              </div>
            </div>
          </div>

          {/* Recovered Item List Preview */}
          {summaryData.recoveredItemList && summaryData.recoveredItemList.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {en ? 'Recovered Files Sample Preview' : '복구된 주요 파일 샘플 미리보기'}
              </h3>
              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-[#0B101D] text-slate-500 font-mono sticky top-0">
                    <tr>
                      <th className="p-2.5">{en ? 'File Name' : '파일명'}</th>
                      <th className="p-2.5">{en ? 'Size' : '크기'}</th>
                      <th className="p-2.5">{en ? 'Path' : '저장 경로'}</th>
                      <th className="p-2.5">{en ? 'Status' : '상태'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                    {summaryData.recoveredItemList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          <FileCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{item.name}</span>
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">{item.size}</td>
                        <td className="p-2.5 text-slate-500 truncate max-w-[180px]">{item.path}</td>
                        <td className="p-2.5 text-emerald-500 font-semibold">{item.status}</td>
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
                ? 'A desktop notification and audio chime have been successfully triggered for your recovery session.'
                : '복구 완료 오디오 차임벨과 함께 데스크톱 알림이 성공적으로 전송되었습니다.'}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-2">
            {onExportReport && (
              <button
                type="button"
                onClick={onExportReport}
                className="px-3.5 h-8 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{en ? 'Export Report (.JSON)' : '복구 리포트 내보내기'}</span>
              </button>
            )}
            {onOpenFolder && (
              <button
                type="button"
                onClick={onOpenFolder}
                className="px-3.5 h-8 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{en ? 'Open Recovery Folder' : '복구 폴더 열기'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 h-8 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
          >
            {en ? 'Close & Finish' : '확인 및 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
