import React, { useState, useRef, useEffect } from 'react';
import { ErrorLogItem } from '../types';
import { Terminal, Copy, Check, Trash2, ArrowDown, AlertOctagon, AlertTriangle, ShieldCheck, Download } from 'lucide-react';

interface ErrorLogStreamProps {
  logs: ErrorLogItem[];
  onClearLogs: () => void;
  onSelectLogLba?: (lba: number) => void;
}

export const ErrorLogStream: React.FC<ErrorLogStreamProps> = ({
  logs,
  onClearLogs,
  onSelectLogLba
}) => {
  const [filter, setFilter] = useState<'all' | 'bad' | 'slow'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter(item => {
    if (filter === 'bad') return item.status === 'bad';
    if (filter === 'slow') return item.status === 'slow' || item.status === 'critical';
    return true;
  });

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopyLbas = () => {
    const badLbas = logs.filter(l => l.status === 'bad').map(l => l.lba);
    if (badLbas.length === 0) return;
    navigator.clipboard.writeText(badLbas.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (logs.length === 0) return;

    // CSV Headers
    const headers = [
      '시간 (Timestamp)',
      '상태 (Status)',
      'LBA',
      '블록 인덱스 (Block Index)',
      '응답 속도 (Latency ms)',
      '오류 코드 (Error Code)',
      '설명 (Description)',
      '검사 정보 (Context)'
    ];
    
    // Convert logs to CSV rows
    const rows = logs.map(log => {
      const statusMap = {
        bad: 'Bad Sector (배드섹터)',
        slow: 'Warning (지연)',
        critical: 'Critical Warning (임계 지연)'
      };
      
      const escape = (val: any) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      return [
        escape(log.timestamp),
        escape(statusMap[log.status] || log.status),
        log.lba,
        log.blockIndex,
        log.latencyMs > 0 ? log.latencyMs : 'TIMEOUT',
        escape(log.errorCode),
        escape(log.description),
        escape(log.methodContext || '')
      ].join(',');
    });

    // Add UTF-8 BOM to prevent Korean character encoding issues in Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `disk_error_report_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const badCount = logs.filter(l => l.status === 'bad').length;
  const slowCount = logs.filter(l => l.status === 'slow' || l.status === 'critical').length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 overflow-hidden transition-colors shadow-xs">
      {/* Log Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-500" />
            System Activity Log
          </h3>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {logs.length} Events
          </span>
        </div>

        {/* Filter & Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Filter Pills */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded text-[10px] font-mono border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilter('bad')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'bad'
                  ? 'bg-white dark:bg-slate-800 text-red-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Bad ({badCount})
            </button>
            <button
              onClick={() => setFilter('slow')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'slow'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Delayed ({slowCount})
            </button>
          </div>

          {badCount > 0 && (
            <button
              onClick={handleCopyLbas}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
              title="배드섹터 LBA 목록 클립보드 복사"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy LBAs'}
            </button>
          )}

          {logs.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 transition-colors border border-emerald-200/50 dark:border-emerald-800/50"
              title="현재 기록된 모든 배드섹터 및 오류 정보를 CSV 파일로 저장"
            >
              <Download className="w-3 h-3" />
              보고서 내보내기 (CSV)
            </button>
          )}

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded text-[10px] border transition-colors ${
              autoScroll
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/30 text-indigo-500'
                : 'border-slate-200 dark:border-slate-800 text-slate-400'
            }`}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          >
            <ArrowDown className="w-3 h-3" />
          </button>

          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
            title="Clear logs"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Terminal View Container */}
      <div
        ref={scrollRef}
        className="bg-slate-950 text-slate-300 font-mono text-[11px] rounded p-2.5 h-36 sm:h-44 overflow-y-auto border border-slate-800/80 scrollbar-thin space-y-1"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
            <ShieldCheck className="w-6 h-6 text-emerald-500/60 mb-1" />
            <p className="text-[11px]">오류 및 비정상 지연 이벤트가 없습니다.</p>
            <p className="text-[10px] text-slate-600">진행 중 감지된 이벤트가 실시간으로 여기에 스트리밍됩니다.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isBad = log.status === 'bad';
            const isCritical = log.status === 'critical';

            return (
              <div
                key={log.id}
                onClick={() => onSelectLogLba && onSelectLogLba(log.lba)}
                className={`flex items-start sm:items-center justify-between gap-2 px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  isBad
                    ? 'text-red-400 hover:bg-red-950/40'
                    : isCritical
                    ? 'text-orange-400 hover:bg-orange-950/40'
                    : 'text-amber-400 hover:bg-amber-950/40'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                  <span className="font-semibold shrink-0">
                    {isBad ? 'CRITICAL:' : isCritical ? 'ALERT:' : 'WARNING:'}
                  </span>
                  <span>{log.description}</span>
                  <span className="text-slate-500 font-mono text-[10px]">LBA #{log.lba.toLocaleString()}</span>
                </div>
                <div className="text-slate-400 text-[10px] shrink-0 font-mono">
                  {log.latencyMs > 0 ? `${log.latencyMs}ms` : 'TIMEOUT'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
