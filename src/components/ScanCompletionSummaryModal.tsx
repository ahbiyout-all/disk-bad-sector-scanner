import React from 'react';
import { SavedScanRecord } from '../types';
import { 
  ShieldCheck, 
  ShieldAlert, 
  X, 
  HardDrive, 
  Clock, 
  Activity, 
  FileText, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';

interface ScanCompletionSummaryModalProps {
  isOpen: boolean;
  record: SavedScanRecord | null;
  onClose: () => void;
  onOpenFullReport: (record: SavedScanRecord) => void;
  onOpenRepair?: () => void;
}

export const ScanCompletionSummaryModal: React.FC<ScanCompletionSummaryModalProps> = ({
  isOpen,
  record,
  onClose,
  onOpenFullReport,
  onOpenRepair
}) => {
  if (!isOpen || !record) return null;

  const hasBadSectors = record.badCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans">
        
        {/* Header Banner */}
        <div className={`p-5 text-white flex items-center justify-between ${
          hasBadSectors 
            ? 'bg-gradient-to-r from-red-600 to-amber-600' 
            : 'bg-gradient-to-r from-emerald-600 to-indigo-600'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
              {hasBadSectors ? (
                <ShieldAlert className="w-7 h-7 text-white animate-pulse" />
              ) : (
                <ShieldCheck className="w-7 h-7 text-white" />
              )}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider opacity-90">
                DiskSentinel Pro Scan Completed
              </div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                {hasBadSectors ? '⚠️ 배드섹터 검출 경고' : '🎉 디스크 표면 검사 정상 완료'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          
          {/* Status Message Card */}
          <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            hasBadSectors
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200'
          }`}>
            {hasBadSectors ? (
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold text-sm">
                {hasBadSectors 
                  ? `총 ${record.badCount}개의 배드섹터 / 손상 블록이 발견되었습니다.` 
                  : '검사한 모든 섹터와 블록이 정상 상태(Good)입니다.'}
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {hasBadSectors 
                  ? '데이터 손실 방지를 위해 즉시 중요 파일을 백업하시고 S.M.A.R.T. 제로필 수복을 진행하거나 전문 진단을 수행하세요.' 
                  : '현재 디스크의 저장 매체 무결성과 I/O 응답 속도에 이상이 없습니다.'}
              </p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-0.5">
              <div className="text-slate-400 text-[10px]">대상 드라이브</div>
              <div className="font-bold text-slate-800 dark:text-slate-200 truncate" title={record.driveModel}>
                {record.driveModel}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-0.5">
              <div className="text-slate-400 text-[10px]">검사 모드</div>
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {record.scanMode === 'full' ? '전체 정밀 표면 검사 (Full)' : '고속 샘플링 검사 (Quick)'}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-0.5">
              <div className="text-slate-400 text-[10px]">총 소요 시간</div>
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>{Math.floor(record.durationSeconds / 60)}분 {Math.floor(record.durationSeconds % 60)}초</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-0.5">
              <div className="text-slate-400 text-[10px]">평균 전송 속도</div>
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span>{record.avgSpeedMbSec.toFixed(1)} MB/s</span>
              </div>
            </div>
          </div>

          {/* Action Footer Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenFullReport(record);
              }}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>정밀 검사 보고서 보기</span>
            </button>

            {hasBadSectors && onOpenRepair && (
              <button
                onClick={() => {
                  onClose();
                  onOpenRepair();
                }}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                <span>배드섹터 수복 센터</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
