import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { DiskDrive, ThermalHistoryPoint } from '../types';
import { Thermometer, RefreshCw } from 'lucide-react';

interface ThermalMonitorWidgetProps {
  drives: DiskDrive[];
  activeDriveId: string;
  historyByDrive: Record<string, ThermalHistoryPoint[]>;
  isTauriRuntime: boolean;
  isPollingEnabled: boolean;
  onTogglePolling: () => void;
  onPollNow: () => void;
}

export const ThermalMonitorWidget: React.FC<ThermalMonitorWidgetProps> = ({
  drives,
  activeDriveId,
  historyByDrive,
  isTauriRuntime,
  isPollingEnabled,
  onTogglePolling,
  onPollNow
}) => {
  const activePoints = useMemo(() => historyByDrive[activeDriveId] || [], [historyByDrive, activeDriveId]);

  const sparklinePath = useMemo(() => {
    if (activePoints.length < 2) return '';
    const w = 260;
    const h = 44;
    const temps = activePoints.map(p => p.temperatureC);
    const minT = Math.min(20, ...temps) - 2;
    const maxT = Math.max(60, ...temps) + 2;

    const x = d3.scaleLinear().domain([0, activePoints.length - 1]).range([4, w - 4]);
    const y = d3.scaleLinear().domain([minT, maxT]).range([h - 4, 4]);

    const line = d3
      .line<ThermalHistoryPoint>()
      .x((_, i) => x(i))
      .y(d => y(d.temperatureC));

    return line(activePoints) || '';
  }, [activePoints]);

  const minTemp = activePoints.length > 0 ? Math.min(...activePoints.map(p => p.temperatureC)) : null;
  const maxTemp = activePoints.length > 0 ? Math.max(...activePoints.map(p => p.temperatureC)) : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            실시간 온도 모니터
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePolling}
            disabled={!isTauriRuntime}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isTauriRuntime && isPollingEnabled
                ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
            }`}
            title={isTauriRuntime ? '4초 주기 SMART 온도 자동 폴링 토글' : '브라우저 샌드박스에서는 하드웨어 온도 센서를 지원하지 않습니다'}
          >
            {isTauriRuntime ? (isPollingEnabled ? 'POLL ON' : 'POLL OFF') : 'N/A'}
          </button>
          <button
            type="button"
            onClick={onPollNow}
            disabled={!isTauriRuntime}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="온도 즉시 재측정"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Drive Temperature Rows */}
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {drives.map(d => {
          const temp = d.temperatureC;
          const isHot = temp !== null && temp >= 55;
          const isWarn = temp !== null && temp >= 45 && temp < 55;
          const isActive = d.id === activeDriveId;

          return (
            <div
              key={d.id}
              className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] border ${
                isActive
                  ? 'border-indigo-500/40 bg-indigo-50/40 dark:bg-indigo-950/25'
                  : 'border-transparent bg-slate-50/70 dark:bg-slate-950/50'
              }`}
            >
              <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                {d.model}
              </span>
              <span
                className={`font-mono font-bold tabular-nums shrink-0 ${
                  temp === null
                    ? 'text-slate-400 dark:text-slate-500'
                    : isHot
                    ? 'text-red-500'
                    : isWarn
                    ? 'text-amber-500'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {temp !== null ? `${temp}°C` : 'N/A'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Sparkline / Kernel Sensor Readout */}
      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        {activePoints.length >= 2 ? (
          <div>
            <svg viewBox="0 0 260 44" className="w-full h-[44px]">
              <path
                d={sparklinePath}
                fill="none"
                className="stroke-amber-500"
                strokeWidth={1.5}
              />
            </svg>
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>최저 {minTemp}°C</span>
              <span>피크 {maxTemp}°C</span>
              <span>샘플 {activePoints.length}건</span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 leading-relaxed">
            {isTauriRuntime
              ? '물리 드라이브 S.M.A.R.T. 온도 폴링 대기 중 (4초 간격 기록)'
              : '브라우저 샌드박스에서는 OS 디스크 온도 센서 접근이 차단되어 임의 값을 생성하지 않습니다.'}
          </div>
        )}
      </div>
    </div>
  );
};
