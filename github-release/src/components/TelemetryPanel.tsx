import React from 'react';
import { DiskDrive, ScanTelemetry } from '../types';
import { calculateHardwareVitals } from '../utils/hardwareTelemetry';
import { Play, Pause, Square, RotateCcw, FileText, Zap, Clock, Activity, Gauge, Thermometer, Disc, Cpu } from 'lucide-react';

interface TelemetryPanelProps {
  drive: DiskDrive;
  telemetry: ScanTelemetry;
  scanMode: 'quick' | 'full';
  onChangeScanMode: (mode: 'quick' | 'full') => void;
  scanSpeedMultiplier: number;
  onChangeSpeedMultiplier: (speed: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onOpenReport: () => void;
  isThermalStress?: boolean;
  onToggleThermalStress?: () => void;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  drive,
  telemetry,
  scanMode,
  onChangeScanMode,
  scanSpeedMultiplier,
  onChangeSpeedMultiplier,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  onOpenReport,
  isThermalStress = false,
  onToggleThermalStress
}) => {
  const formatTime = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds < 0 || totalSeconds === Infinity) return '--:--';
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isScanning = telemetry.status === 'scanning';
  const isPaused = telemetry.status === 'paused';
  const isCompleted = telemetry.status === 'completed';
  const isIdle = telemetry.status === 'idle' || telemetry.status === 'aborted';

  // Calculate Real-time Hardware Vitals (Temperature, Power Watts, RPM)
  const vitals = calculateHardwareVitals(drive, telemetry, scanSpeedMultiplier, isThermalStress);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs transition-colors">
      {/* Top Controls Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isIdle && (
            <button
              onClick={onStart}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              검사 시작 (Start)
            </button>
          )}

          {isScanning && (
            <button
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              일시 정지 (Pause)
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              계속 (Resume)
            </button>
          )}

          {(isScanning || isPaused) && (
            <button
              onClick={onStop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              중지 (Stop)
            </button>
          )}

          {(isCompleted || telemetry.status === 'aborted' || isPaused) && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
          )}

          <button
            onClick={onOpenReport}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs min-h-[34px]"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>진단 보고서</span>
            <span className="hidden sm:inline">생성</span>
          </button>
        </div>

        {/* Scan Mode & Speed Selectors */}
        <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
          {/* Scan Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded border border-slate-200 dark:border-slate-800 text-xs">
            <button
              disabled={isScanning}
              onClick={() => onChangeScanMode('quick')}
              className={`px-2.5 py-1 rounded transition-colors ${
                scanMode === 'quick'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50'
              }`}
            >
              빠른 검사
            </button>
            <button
              disabled={isScanning}
              onClick={() => onChangeScanMode('full')}
              className={`px-2.5 py-1 rounded transition-colors ${
                scanMode === 'full'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50'
              }`}
            >
              정밀 전수 검사
            </button>
          </div>

          {/* Speed Presets */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <Zap className="w-3 h-3 text-amber-500 ml-1 mr-0.5" />
            {[1, 2, 5, 10].map((spd) => (
              <button
                key={spd}
                onClick={() => onChangeSpeedMultiplier(spd)}
                className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                  scanSpeedMultiplier === spd
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={`스캔 속도 ${spd}x 배속`}
              >
                {spd === 10 ? 'MAX' : `${spd}x`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Bar & LBA Counter */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
              검사 진행률: {telemetry.scannedPercentage.toFixed(1)}%
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
              ({telemetry.currentBlockIndex.toLocaleString()} / {telemetry.totalBlocks.toLocaleString()} 블록)
            </span>
          </div>
          <div className="font-mono text-slate-500 dark:text-slate-400 text-xs">
            Current LBA: #{telemetry.currentLba.toLocaleString()}
          </div>
        </div>

        {/* Multi-segmented Slim Progress Bar */}
        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-100 ${
              telemetry.badCount > 0 ? 'bg-amber-500' : 'bg-indigo-600'
            }`}
            style={{ width: `${Math.min(100, telemetry.scannedPercentage)}%` }}
          />
        </div>
      </div>

      {/* High Density Telemetry Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 mt-3">
        {/* Speed */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Scan Speed</span>
            <Gauge className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="text-sm sm:text-base font-semibold font-mono text-emerald-600 dark:text-emerald-400">
            {telemetry.scanSpeedMbPerSec.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">MB/s</span>
          </div>
        </div>

        {/* Elapsed / Remaining */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Elapsed / ETA</span>
            <Clock className="w-3 h-3 text-slate-400" />
          </div>
          <div className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100">
            {formatTime(telemetry.elapsedSeconds)}{' '}
            <span className="text-[11px] font-normal text-slate-400">~{formatTime(telemetry.remainingSeconds)}</span>
          </div>
        </div>

        {/* Healthy (<10ms) */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Healthy (&lt;10ms)</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          </div>
          <div className="text-sm sm:text-base font-semibold font-mono text-emerald-600 dark:text-emerald-400">
            {telemetry.goodCount.toLocaleString()}
          </div>
        </div>

        {/* Normal (<50ms) */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Normal (&lt;50ms)</span>
            <div className="w-1.5 h-1.5 rounded-full bg-lime-500"></div>
          </div>
          <div className="text-sm sm:text-base font-semibold font-mono text-lime-600 dark:text-lime-400">
            {telemetry.normalCount.toLocaleString()}
          </div>
        </div>

        {/* Slow & Critical */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Delayed (&gt;150ms)</span>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
          </div>
          <div className="text-sm sm:text-base font-semibold font-mono text-amber-600 dark:text-amber-400">
            {(telemetry.slowCount + telemetry.criticalCount).toLocaleString()}
          </div>
        </div>

        {/* Bad Blocks */}
        <div className={`p-2.5 rounded-lg border transition-colors ${
          telemetry.badCount > 0
            ? 'bg-red-950/30 border-red-500/30 text-red-400'
            : 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5 flex items-center justify-between">
            <span>Bad Blocks</span>
            <div className={`w-1.5 h-1.5 rounded-full ${telemetry.badCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
          </div>
          <div className={`text-sm sm:text-base font-semibold font-mono ${telemetry.badCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {telemetry.badCount.toLocaleString()} <span className="text-[10px] font-normal">Found</span>
          </div>
        </div>
      </div>

      {/* Real-time Hardware Status Monitoring Section (Lower Dashboard) */}
      <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              실시간 하드웨어 상태 모니터링 (Hardware Vitals)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              센서 실시간 감지 중
            </span>
            <span>•</span>
            <span className="truncate max-w-[200px]">{drive.model}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* 1. Real-time Temperature */}
          <div className={`p-3 rounded-lg border transition-all ${
            vitals.thermalStatus === 'critical'
              ? 'bg-red-950/20 border-red-500/50 text-red-300'
              : vitals.thermalStatus === 'warm'
              ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800/80'
          }`}>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Thermometer className={`w-3.5 h-3.5 ${vitals.thermalStatus === 'critical' ? 'text-red-500' : vitals.thermalStatus === 'warm' ? 'text-amber-500' : 'text-blue-500'}`} />
                실시간 작동 온도
                {onToggleThermalStress && (
                  <button
                    onClick={onToggleThermalStress}
                    className={`ml-1.5 px-1 py-0.2 text-[9px] rounded font-bold cursor-pointer transition-colors ${
                      isThermalStress
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="고부하 발열 스트레스 모드 작동 (60°C 임계치 경보)"
                  >
                    {isThermalStress ? '발열 스트레스 ON' : '발열 스트레스'}
                  </button>
                )}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                vitals.thermalStatus === 'critical'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : vitals.thermalStatus === 'warm'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}>
                {vitals.thermalStatus === 'critical' ? '🔥 고온 경고' : vitals.thermalStatus === 'warm' ? '작동 발열' : '정상 (Cool)'}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-slate-100">
                {vitals.temperatureC.toFixed(1)} <span className="text-sm font-semibold text-slate-400">°C</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                부하 변동:{' '}
                <span className={vitals.tempDeltaFromBaseline > 0 ? 'text-amber-500 font-semibold' : 'text-emerald-500'}>
                  {vitals.tempDeltaFromBaseline > 0 ? `+${vitals.tempDeltaFromBaseline.toFixed(1)}°C` : '0.0°C'}
                </span>
              </div>
            </div>

            {/* Micro visual temperature meter */}
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    vitals.temperatureC > 50 ? 'bg-red-500' : vitals.temperatureC > 42 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (vitals.temperatureC / 70) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-400">
                <span>기준 {drive.temperatureC}°C</span>
                <span>한계 65°C</span>
              </div>
            </div>
          </div>

          {/* 2. Real-time Power Consumption */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                실시간 전력 소비량
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {vitals.powerRailText}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
                {vitals.powerWatts.toFixed(2)} <span className="text-sm font-semibold text-slate-400">W</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                전류: <span className="font-semibold text-slate-800 dark:text-slate-200">{vitals.powerCurrentMa} mA</span>
              </div>
            </div>

            {/* Power Load Meter */}
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (vitals.powerWatts / 12) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-400">
                <span>전압 {vitals.powerVoltageV}V</span>
                <span>부하 {vitals.controllerLoadPct}%</span>
              </div>
            </div>
          </div>

          {/* 3. Real-time RPM / Engine Speed */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                {vitals.isMechanicalHdd ? (
                  <Disc className="w-3.5 h-3.5 text-indigo-500 animate-spin" style={{ animationDuration: '3s' }} />
                ) : (
                  <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                )}
                {vitals.isMechanicalHdd ? '회전 속도 (RPM)' : '스토리지 엔진 속도'}
              </span>
              <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded ${
                vitals.isMechanicalHdd
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              }`}>
                {vitals.isMechanicalHdd ? 'Spindle Motor' : 'Solid State'}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-lg sm:text-xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100 truncate max-w-[210px]">
                {vitals.rpmDisplay}
              </div>
            </div>

            <div className="mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="truncate max-w-[190px]">{vitals.rpmSubtext}</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                부하 {vitals.controllerLoadPct}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
