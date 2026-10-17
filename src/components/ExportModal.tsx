import React, { useState } from 'react';
import { SavedScanRecord, SectorBlock } from '../types';
import { 
  X, 
  FileText, 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Activity, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Loader2, 
  Share2,
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import { exportPdfReport, exportCsvReport, exportJsonReport, exportOtelMetricsReport } from '../utils/reportGenerator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: SavedScanRecord;
  badBlocks?: SectorBlock[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  record,
  badBlocks = []
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportPdfReport(record, badBlocks);
      setDownloadSuccess('pdf');
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (e) {
      console.error('PDF 내보내기 실패:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    exportCsvReport(record, badBlocks);
    setDownloadSuccess('csv');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportJson = () => {
    exportJsonReport(record);
    setDownloadSuccess('json');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportOtel = () => {
    exportOtelMetricsReport(record);
    setDownloadSuccess('otel');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const isHealthy = record.badCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  검사 결과 내보내기 및 보관 (Export Diagnostic Results)
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                디스크 진단 결과를 CSV, PDF 파일로 즉시 저장하여 외부 공유 또는 영구 보관합니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Drive & Summary Box */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-500 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{record.driveModel}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {record.driveCapacityGb} GB
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  S/N: {record.driveSerial} · 일시: {record.date} · {record.scanMode === 'quick' ? '빠른 검사' : '정밀 검사'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center font-mono">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-sans">건강 점수</div>
                <div className={`text-base font-bold ${
                  record.healthScore >= 80 ? 'text-emerald-500' : record.healthScore >= 50 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {record.healthScore}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-sans">배드섹터</div>
                <div className={`text-base font-bold ${record.badCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {record.badCount}개
                </div>
              </div>
            </div>
          </div>

          {/* Export Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option 1: PDF */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-500/50 dark:hover:border-rose-500/50 bg-white dark:bg-slate-900/40 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                    .PDF
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  PDF 정밀 진단 인증서
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  A4 규격 공식 하드웨어 진단 인증서로 즉시 다운로드합니다. S.M.A.R.T. 텔레메트리, 결함 LBA 목록 및 전문 진단 소견이 포함됩니다.
                </p>
              </div>

              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>PDF 생성 및 렌더링 중...</span>
                  </>
                ) : downloadSuccess === 'pdf' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>다운로드 완료!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF 파일로 저장 (.pdf)</span>
                  </>
                )}
              </button>
            </div>

            {/* Option 2: CSV */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 bg-white dark:bg-slate-900/40 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    .CSV
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  CSV 스프레드시트 데이터
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Excel 및 스프레드시트 호환 UTF-8 BOM 인코딩 파일입니다. 하드웨어 스펙, S.M.A.R.T. 스냅샷, 전체 검사 결함 LBA가 구조화되어 저장됩니다.
                </p>
              </div>

              <button
                onClick={handleExportCsv}
                className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {downloadSuccess === 'csv' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>다운로드 완료!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV 파일로 저장 (.csv)</span>
                  </>
                )}
              </button>
            </div>

            {/* Option 3: Print / Browser PDF */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 bg-white dark:bg-slate-900/40 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Printer className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                    PRINT
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  보고서 인쇄 및 PDF 인쇄
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  인쇄용 레이아웃을 호출하여 실제 종이 프린터로 출력하거나 브라우저 'PDF로 저장' 기능을 통해 벡터 텍스트 문서로 저장합니다.
                </p>
              </div>

              <button
                onClick={handlePrint}
                className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>인쇄 대화상자 열기</span>
              </button>
            </div>

            {/* Option 4: JSON & OTel */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-500/50 dark:hover:border-purple-500/50 bg-white dark:bg-slate-900/40 transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-500/30">
                    RAW DATA
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  JSON 원본 및 OTel 지표
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  개발자, 시스템 관리자 및 Prometheus / OpenTelemetry 모니터링 파이프라인 연동을 위한 규격화된 원시 데이터 파일입니다.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportJson}
                  className="py-2 px-2 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>JSON (.json)</span>
                </button>
                <button
                  onClick={handleExportOtel}
                  className="py-2 px-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Activity className="w-3 h-3" />
                  <span>OTel (.prom)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Security & Verification Notice */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              내보내기 파일에는 개인 파일 내용이나 시스템 비밀번호가 일절 포함되지 않으며, 순수 물리적 하드웨어 LBA 검사 텔레메트리만 안전하게 기록됩니다.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            DiskSentinel Pro v4.4.0 · Apache 2.0
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
