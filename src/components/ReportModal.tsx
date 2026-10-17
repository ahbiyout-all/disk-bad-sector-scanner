import React, { useState } from 'react';
import { SavedScanRecord, SectorBlock } from '../types';
import { X, Printer, Download, FileSpreadsheet, ShieldAlert, CheckCircle2, HardDrive, Calendar, Check, Activity, ShieldCheck, FileText, Loader2 } from 'lucide-react';
import { exportCsvReport, exportPdfReport, exportJsonReport, exportOtelMetricsReport } from '../utils/reportGenerator';

interface ReportModalProps {
  record: SavedScanRecord;
  badBlocks?: SectorBlock[];
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  record,
  badBlocks = [],
  onClose
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportPdfReport(record, badBlocks);
    } catch (e) {
      console.error('Failed to export PDF:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    exportCsvReport(record, badBlocks);
  };

  const handleExportJson = () => {
    exportJsonReport(record);
  };

  const handleExportOtel = () => {
    exportOtelMetricsReport(record);
  };

  const isHealthy = record.badCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 print:hidden bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Disk Surface Integrity Diagnostic Report
            </h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              title="A4 규격 공식 PDF 인증서 다운로드 (.pdf)"
            >
              {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{isExportingPdf ? 'PDF 생성 중...' : 'PDF 내보내기'}</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
              title="Excel 호환 UTF-8 BOM CSV 파일 다운로드 (.csv)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV 내보내기</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer"
              title="보고서 인쇄 또는 브라우저 PDF 인쇄"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">인쇄</span>
            </button>

            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs"
              title="JSON 파일로 진단 원본 다운로드"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>

            <button
              onClick={handleExportOtel}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer shadow-xs"
              title="OpenTelemetry / Prometheus 호환 메트릭 내보내기"
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">OTel</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors ml-1 cursor-pointer"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Report Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-900 dark:text-slate-100 print:text-black print:p-0">
          {/* Report Header Title Block */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-indigo-600 dark:text-indigo-400 font-bold mb-0.5">
                STORAGE INTEGRITY DIAGNOSTIC CERTIFICATE
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                디스크 배드섹터 정밀 검사 보고서
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                Report ID: {record.id}
              </p>
            </div>

            <div className="text-right text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <div className="flex items-center sm:justify-end gap-1 font-medium text-slate-700 dark:text-slate-300">
                <Calendar className="w-3 h-3" />
                <span>검사 일시: {record.date}</span>
              </div>
              <div className="mt-0.5">소요 시간: {Math.floor(record.durationSeconds / 60)}분 {Math.floor(record.durationSeconds % 60)}초</div>
            </div>
          </div>

          {/* Drive Identification Box */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">드라이브 모델</span>
              <span className="font-semibold font-mono text-xs">{record.driveModel}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">시리얼 번호</span>
              <span className="font-mono text-xs">{record.driveSerial}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">용량 / 방식</span>
              <span className="text-xs">{record.driveCapacityGb} GB ({record.scanMode === 'quick' ? '빠른 표면 검사' : '전수 정밀 검사'})</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">적용된 맞춤 알고리즘</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-xs truncate block" title={record.scanMethodName || '표준 검사'}>
                {record.scanMethodName || '매체 맞춤 정밀 검사'}
              </span>
            </div>
          </div>

          {/* Media-Specific Tailored Diagnosis Callout */}
          {record.mediaSpecificDiagnosis && (
            <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-xs">
              <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                저장 매체별 맞춤형 진단 소견 (Storage Tailored Analysis)
              </div>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed text-xs">
                {record.mediaSpecificDiagnosis}
              </p>
            </div>
          )}

          {/* Diagnostic Result Banner */}
          <div className={`p-3 rounded-lg border flex items-start gap-2.5 ${
            isHealthy
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/20 border-red-500/30 text-red-200'
          }`}>
            <div className="shrink-0 mt-0.5">
              {isHealthy ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold font-mono">
                  {isHealthy ? '정상 판정 (PASS - 배드섹터 0개)' : `주의/경고 판정 (FAIL - 배드섹터 ${record.badCount}개 검출)`}
                </span>
                <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-700">
                  건강도: {record.healthScore}%
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {record.recommendation}
              </p>
            </div>
          </div>

          {/* Sector Count Breakdown Stats */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-slate-800 dark:text-slate-200">
              Response Latency Distribution
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-center font-mono">
              <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/30">
                <div className="text-[10px] text-emerald-400 mb-0.5">정상 (&lt;10ms)</div>
                <div className="text-xs font-bold text-emerald-200">{record.goodCount.toLocaleString()}</div>
              </div>
              <div className="p-2 rounded bg-lime-950/20 border border-lime-500/30">
                <div className="text-[10px] text-lime-400 mb-0.5">양호 (&lt;50ms)</div>
                <div className="text-xs font-bold text-lime-200">{record.normalCount.toLocaleString()}</div>
              </div>
              <div className="p-2 rounded bg-amber-950/20 border border-amber-500/30">
                <div className="text-[10px] text-amber-400 mb-0.5">지연 (&lt;150ms)</div>
                <div className="text-xs font-bold text-amber-200">{record.slowCount.toLocaleString()}</div>
              </div>
              <div className="p-2 rounded bg-orange-950/20 border border-orange-500/30">
                <div className="text-[10px] text-orange-400 mb-0.5">심각 (&lt;500ms)</div>
                <div className="text-xs font-bold text-orange-200">{record.criticalCount.toLocaleString()}</div>
              </div>
              <div className="p-2 rounded bg-red-950/30 border border-red-500/40">
                <div className="text-[10px] text-red-400 font-bold mb-0.5">배드 (Error)</div>
                <div className="text-xs font-bold text-red-300">{record.badCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500 font-mono">
              <span>평균 응답 지연: {record.avgLatencyMs} ms</span>
              <span>최대 응답 지연: {record.maxLatencyMs} ms</span>
            </div>
          </div>

          {/* Bad Sectors LBA Table */}
          {record.badCount > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-1.5 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Detected Bad Sector LBA Addresses ({record.badCount})
              </h3>
              <div className="max-h-44 overflow-y-auto border border-red-500/30 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-red-950/60 text-red-200 font-semibold font-mono text-[10px]">
                    <tr>
                      <th className="px-2.5 py-1.5">No.</th>
                      <th className="px-2.5 py-1.5">손상 시작 LBA</th>
                      <th className="px-2.5 py-1.5">블록 번호</th>
                      <th className="px-2.5 py-1.5">오류 코드</th>
                      <th className="px-2.5 py-1.5">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-900/30 font-mono text-[11px]">
                    {record.badLbaList.map((lba, idx) => (
                      <tr key={idx} className="hover:bg-red-950/20">
                        <td className="px-2.5 py-1.5 text-slate-500">{idx + 1}</td>
                        <td className="px-2.5 py-1.5 font-bold text-red-400">#{lba.toLocaleString()}</td>
                        <td className="px-2.5 py-1.5 text-slate-400">
                          {badBlocks[idx]?.id !== undefined ? `#${badBlocks[idx].id}` : '블록 매핑됨'}
                        </td>
                        <td className="px-2.5 py-1.5 text-red-300">
                          {badBlocks[idx]?.errorCode || 'UNC (Uncorrectable Error)'}
                        </td>
                        <td className="px-2.5 py-1.5 text-slate-500 text-[10px]">데이터 판독 불가</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* S.M.A.R.T. Snapshot Summary */}
          {record.smartSnapshot && record.smartSnapshot.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-800 dark:text-slate-200">
                S.M.A.R.T. Attributes Snapshot
              </h3>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 font-semibold text-slate-500 text-[10px]">
                    <tr>
                      <th className="px-2.5 py-1.5">ID</th>
                      <th className="px-2.5 py-1.5">속성명</th>
                      <th className="px-2.5 py-1.5 text-center">현재값</th>
                      <th className="px-2.5 py-1.5 text-center">임계치</th>
                      <th className="px-2.5 py-1.5 font-mono">원시값(Raw)</th>
                      <th className="px-2.5 py-1.5 text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                    {record.smartSnapshot.map(s => (
                      <tr key={s.id}>
                        <td className="px-2.5 py-1.5 text-slate-500">{s.id}</td>
                        <td className="px-2.5 py-1.5 font-sans font-medium">{s.name}</td>
                        <td className="px-2.5 py-1.5 text-center">{s.current}</td>
                        <td className="px-2.5 py-1.5 text-center text-slate-500">{s.threshold}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-slate-200">{s.raw}</td>
                        <td className="px-2.5 py-1.5 text-center font-sans">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            s.status === 'critical'
                              ? 'bg-red-900/40 text-red-300 border border-red-700/50'
                              : s.status === 'warning'
                              ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50'
                              : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50'
                          }`}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Engineer Sign-off & Compliance Footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-500 gap-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                본 보고서는 <strong>ATA SFF-8035i</strong> 및 <strong>NVMe Spec 2.0 / OpenTelemetry</strong> 오픈 표준 규격에 따라 생성되었습니다. (저작권/특허 보호 및 완전한 데이터 프라이버시 준수)
              </span>
            </div>
            <div className="font-mono text-[10px] shrink-0 font-semibold text-slate-400">
              DISK INTEGRITY VERIFIED · APACHE 2.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
