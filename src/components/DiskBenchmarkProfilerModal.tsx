import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Gauge,
  Play,
  Square,
  ShieldCheck,
  Info,
  Activity,
  Zap,
  Clock
} from 'lucide-react';
import {
  BenchmarkProfilePreset,
  BenchmarkRunResult,
  BenchmarkSamplePoint,
  DiskDrive,
  DiskHardwareSpecs
} from '../types';
import { queryTauriLbaBenchmarkSample } from '../utils/nativeDriveEngine';
import { safeStorage } from '../utils/safeStorage';

interface DiskBenchmarkProfilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  onBenchmarkComplete?: (driveId: string, specsPatch: Partial<DiskHardwareSpecs>) => void;
  isInline?: boolean;
}

const BENCHMARK_HISTORY_KEY = 'disksentinel_benchmark_history_v1';

function loadSavedBenchmark(driveId: string): BenchmarkRunResult | null {
  try {
    const raw = safeStorage.getItem(BENCHMARK_HISTORY_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, BenchmarkRunResult>;
    return map[driveId] || null;
  } catch {
    return null;
  }
}

function saveBenchmarkResult(result: BenchmarkRunResult): void {
  try {
    const raw = safeStorage.getItem(BENCHMARK_HISTORY_KEY);
    const map: Record<string, BenchmarkRunResult> = raw ? JSON.parse(raw) : {};
    map[result.driveId] = result;
    safeStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export const DiskBenchmarkProfilerModal: React.FC<DiskBenchmarkProfilerModalProps> = ({
  isOpen,
  onClose,
  drive,
  onBenchmarkComplete,
  isInline = false
}) => {
  const [preset, setPreset] = useState<BenchmarkProfilePreset>('combined');
  const [sampleCount, setSampleCount] = useState<10 | 16 | 24>(16);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [samples, setSamples] = useState<BenchmarkSamplePoint[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCompleted, setLastCompleted] = useState<BenchmarkRunResult | null>(() =>
    loadSavedBenchmark(drive.id)
  );
  const cancelRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const runIdRef = useRef<number>(0);

  useEffect(() => {
    const saved = loadSavedBenchmark(drive.id);
    setLastCompleted(saved);
    setSamples(saved?.samples || []);
    setErrorMessage(null);
    cancelRef.current = true;
    runIdRef.current += 1;
    setIsRunning(false);
  }, [drive.id]);

  useEffect(() => {
    if (!isOpen) {
      cancelRef.current = true;
      runIdRef.current += 1;
      setIsRunning(false);
    }
  }, [isOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelRef.current = true;
      runIdRef.current += 1;
    };
  }, []);

  const stats = useMemo(() => {
    if (samples.length === 0) {
      return {
        minMbSec: lastCompleted?.minMbSec ?? null,
        avgMbSec: lastCompleted?.avgMbSec ?? null,
        maxMbSec: lastCompleted?.maxMbSec ?? null,
        avgIops: lastCompleted?.avgRandom4kIops ?? null,
        avgLatencyMs: lastCompleted?.avgLatencyMs ?? null,
        p99LatencyMs: lastCompleted?.p99LatencyMs ?? null
      };
    }
    const speeds = samples.map(s => s.readMbSec).filter(v => v > 0);
    const iopsVals = samples
      .map(s => s.random4kIops)
      .filter((v): v is number => v !== null && v > 0);
    const latencies = samples.map(s => s.avgLatencyMs);
    const p99s = samples.map(s => s.p99LatencyMs);

    const minMbSec = speeds.length > 0 ? Math.min(...speeds) : 0;
    const maxMbSec = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgMbSec =
      speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const avgIops =
      iopsVals.length > 0
        ? Math.round(iopsVals.reduce((a, b) => a + b, 0) / iopsVals.length)
        : null;
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99LatencyMs = Math.max(...p99s);

    return {
      minMbSec: Number(minMbSec.toFixed(1)),
      avgMbSec: Number(avgMbSec.toFixed(1)),
      maxMbSec: Number(maxMbSec.toFixed(1)),
      avgIops,
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      p99LatencyMs: Number(p99LatencyMs.toFixed(2))
    };
  }, [samples, lastCompleted]);

  if (!isOpen) return null;

  const handleStartBenchmark = async () => {
    if (isRunning) return;
    const myRunId = ++runIdRef.current;
    const driveSnapshot = drive;
    const isStale = () =>
      cancelRef.current ||
      !isMountedRef.current ||
      !isOpenRef.current ||
      runIdRef.current !== myRunId;

    cancelRef.current = false;
    setIsRunning(true);
    setErrorMessage(null);
    setSamples([]);

    const totalLba = Math.max(2048, driveSnapshot.totalSectors || 2048);
    const collected: BenchmarkSamplePoint[] = [];

    for (let idx = 0; idx < sampleCount; idx++) {
      if (isStale()) break;

      const ratio = sampleCount === 1 ? 0 : idx / (sampleCount - 1);
      const startLba = Math.min(totalLba - 2048, Math.floor(ratio * (totalLba - 2048)));
      const positionPct = Number((ratio * 100).toFixed(1));

      let readMbSec = 0;
      let random4kIops: number | null = null;
      let avgLatencyMs = 0;
      let p99LatencyMs = 0;
      let statusCode = 0;

      if (preset === 'sequential_zone' || preset === 'combined') {
        const seq = await queryTauriLbaBenchmarkSample(driveSnapshot, startLba, 1048576, 0, 4);
        if (isStale()) break;
        if (!seq.supported) {
          setErrorMessage(
            seq.reason ||
              'Tauri 데스크톱 관리자 권한 환경에서만 물리 디스크 LBA 구간 벤치마크를 실행할 수 있습니다.'
          );
          break;
        }
        readMbSec = Number(seq.throughputMbSec.toFixed(1));
        avgLatencyMs = Number(seq.avgLatencyMs.toFixed(2));
        p99LatencyMs = Number(seq.p99LatencyMs.toFixed(2));
        statusCode = seq.statusCode;
      }

      if ((preset === 'random_4k' || preset === 'combined') && !isStale()) {
        const rnd = await queryTauriLbaBenchmarkSample(driveSnapshot, startLba, 4096, 1, 24);
        if (isStale()) break;
        if (!rnd.supported) {
          setErrorMessage(
            rnd.reason ||
              'Tauri 데스크톱 관리자 권한 환경에서만 4KB 랜덤 IOPS 프로브를 실행할 수 있습니다.'
          );
          break;
        }
        random4kIops = Math.round(rnd.iops);
        if (preset === 'random_4k') {
          readMbSec = Number(rnd.throughputMbSec.toFixed(2));
          avgLatencyMs = Number(rnd.avgLatencyMs.toFixed(2));
          p99LatencyMs = Number(rnd.p99LatencyMs.toFixed(2));
          statusCode = rnd.statusCode;
        } else {
          p99LatencyMs = Number(Math.max(p99LatencyMs, rnd.p99LatencyMs).toFixed(2));
        }
      }

      if (isStale()) break;

      const point: BenchmarkSamplePoint = {
        zoneIndex: idx,
        positionPct,
        startLba,
        readMbSec,
        random4kIops,
        avgLatencyMs,
        p99LatencyMs,
        statusCode
      };

      collected.push(point);
      setSamples([...collected]);
    }

    if (isMountedRef.current && runIdRef.current === myRunId) {
      setIsRunning(false);
    }

    if (collected.length > 0 && !isStale()) {
      const speeds = collected.map(s => s.readMbSec);
      const iopsVals = collected
        .map(s => s.random4kIops)
        .filter((v): v is number => v !== null && v > 0);
      const avgLat = collected.reduce((a, b) => a + b.avgLatencyMs, 0) / collected.length;
      const maxP99 = Math.max(...collected.map(s => s.p99LatencyMs));
      const avgMb = Number((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1));
      const avgIopsVal =
        iopsVals.length > 0
          ? Math.round(iopsVals.reduce((a, b) => a + b, 0) / iopsVals.length)
          : null;

      const summary: BenchmarkRunResult = {
        driveId: driveSnapshot.id,
        driveModel: driveSnapshot.model,
        preset,
        completedAt: Date.now(),
        sampleCount: collected.length,
        minMbSec: Number(Math.min(...speeds).toFixed(1)),
        avgMbSec: avgMb,
        maxMbSec: Number(Math.max(...speeds).toFixed(1)),
        avgRandom4kIops: avgIopsVal,
        avgLatencyMs: Number(avgLat.toFixed(2)),
        p99LatencyMs: Number(maxP99.toFixed(2)),
        samples: collected
      };
      setLastCompleted(summary);
      saveBenchmarkResult(summary);

      if (onBenchmarkComplete) {
        onBenchmarkComplete(driveSnapshot.id, {
          measuredSequentialReadMbSec: preset === 'random_4k' ? driveSnapshot.hardwareSpecs?.measuredSequentialReadMbSec ?? null : avgMb,
          measuredRandom4kReadIops: avgIopsVal ?? driveSnapshot.hardwareSpecs?.measuredRandom4kReadIops ?? null,
          measuredKernelLatencyUs: Math.round(avgLat * 1000),
          probeTimestamp: summary.completedAt
        });
      }
    }
  };

  const handleStop = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  // Build dual SVG chart geometry
  const chartW = 720;
  const chartH = 220;
  const padL = 44;
  const padR = 44;
  const padT = 18;
  const padB = 28;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const maxSpeed = Math.max(50, ...samples.map(s => s.readMbSec * 1.15));
  const maxLat = Math.max(2, ...samples.map(s => s.p99LatencyMs * 1.2));

  const speedPoints = samples
    .map((s, idx) => {
      const x = padL + (samples.length <= 1 ? innerW / 2 : (idx / (samples.length - 1)) * innerW);
      const y = padT + innerH - (s.readMbSec / maxSpeed) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const speedAreaPath =
    samples.length > 0
      ? `M ${padL},${padT + innerH} L ${speedPoints} L ${
          padL + (samples.length <= 1 ? innerW / 2 : innerW)
        },${padT + innerH} Z`
      : '';

  const latencyPoints = samples
    .map((s, idx) => {
      const x = padL + (samples.length <= 1 ? innerW / 2 : (idx / (samples.length - 1)) * innerW);
      const y = padT + innerH - (s.p99LatencyMs / maxLat) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div
      className={
        isInline
          ? 'w-full font-sans'
          : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs font-sans animate-in fade-in duration-150'
      }
    >
      <div
        className={
          isInline
            ? 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full flex flex-col overflow-hidden'
            : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full max-w-5xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden'
        }
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : true}
        aria-label="LBA 구간 I/O 성능 벤치마크 프로파일러"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Gauge className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  LBA 구간 순차/랜덤 I/O 벤치마크 프로파일러
                </h2>
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  · SAFE READ-ONLY
                </span>
              </div>
              <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                {drive.model} ({drive.hardwareSpecs?.busType || drive.type}) · Total LBA {drive.totalSectors.toLocaleString()}
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`flex-1 p-4 sm:p-5 space-y-4 text-xs ${isInline ? '' : 'overflow-y-auto'}`}>
          {/* Control Strip */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">프로파일 모드</span>
                <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  {(
                    [
                      { id: 'combined', label: '통합 (순차 + 4K)' },
                      { id: 'sequential_zone', label: '외곽→내곽 순차 읽기' },
                      { id: 'random_4k', label: '4K 랜덤 IOPS' }
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setPreset(opt.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                        preset === opt.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">샘플 구간 수</span>
                <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  {([10, 16, 24] as const).map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setSampleCount(cnt)}
                      className={`px-2.5 py-1 text-[11px] font-mono font-semibold cursor-pointer disabled:opacity-50 ${
                        sampleCount === cnt
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cnt}존
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isRunning ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>계측 중지 ({samples.length}/{sampleCount})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartBenchmark()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>구간 I/O 벤치마크 시작</span>
                </button>
              )}
            </div>
          </div>

          {/* Safety Note */}
          <div className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>시스템 드라이브 데이터 보존을 위해 비파괴 읽기 전용(Read-Only Direct IOCTL) 프로브만 수행합니다.</span>
            </div>
            {lastCompleted && (
              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                최근 기록: {new Date(lastCompleted.completedAt).toLocaleString('ko-KR')}
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
              <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <div className="font-bold">네이티브 Win32 IOCTL 벤치마크 실행 불가</div>
                <p className="text-[11px] opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* KPI Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                평균 / 최대 속도
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                {stats.avgMbSec !== null ? `${stats.avgMbSec} MB/s` : 'N/A'}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                {stats.minMbSec !== null && stats.maxMbSec !== null
                  ? `최소 ${stats.minMbSec} / 최대 ${stats.maxMbSec} MB/s`
                  : '미측정'}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-indigo-500" />
                4KB 랜덤 IOPS
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
                {stats.avgIops !== null ? stats.avgIops.toLocaleString() : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Q1 Random 4K Read</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-500" />
                평균 응답 지연
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-sky-600 dark:text-sky-400 mt-1">
                {stats.avgLatencyMs !== null ? `${stats.avgLatencyMs} ms` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">커널 ReadFile 응답</div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                P99 테일 레이턴시
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                {stats.p99LatencyMs !== null ? `${stats.p99LatencyMs} ms` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">최대 구간 지연 피크</div>
            </div>
          </div>

          {/* Dual Axis SVG Speed & Latency Graph */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                LBA 위치별(0% → 100%) 전송률 &amp; P99 지연율 커브
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-emerald-500">
                  <span className="w-2.5 h-0.5 bg-emerald-500 inline-block" /> MB/s (좌측 축)
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="w-2.5 h-0.5 bg-amber-500 inline-block" /> P99 ms (우측 축)
                </span>
              </div>
            </div>

            {samples.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-slate-400 text-xs font-mono border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                &quot;구간 I/O 벤치마크 시작&quot;을 누르면 물리 LBA 0%부터 100%까지 실측 커브가 그려집니다.
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-52 select-none"
                role="img"
                aria-label="LBA 속도 및 지연 시간 차트"
              >
                <defs>
                  <linearGradient id="benchSpeedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const y = padT + t * innerH;
                  const spdLabel = Math.round(maxSpeed * (1 - t));
                  const latLabel = (maxLat * (1 - t)).toFixed(1);
                  return (
                    <g key={i}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={chartW - padR}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 text-[9px] font-mono"
                      >
                        {spdLabel}
                      </text>
                      <text
                        x={chartW - padR + 6}
                        y={y + 3}
                        textAnchor="start"
                        className="fill-amber-500/80 text-[9px] font-mono"
                      >
                        {latLabel}ms
                      </text>
                    </g>
                  );
                })}

                {speedAreaPath && <path d={speedAreaPath} fill="url(#benchSpeedGrad)" />}
                {samples.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.2"
                      points={speedPoints}
                    />
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.6"
                      strokeDasharray="4 3"
                      points={latencyPoints}
                    />
                  </>
                )}

                {samples.map((s, idx) => {
                  const x =
                    padL +
                    (samples.length <= 1 ? innerW / 2 : (idx / (samples.length - 1)) * innerW);
                  const y = padT + innerH - (s.readMbSec / maxSpeed) * innerH;
                  return (
                    <g key={s.zoneIndex}>
                      <circle cx={x} cy={y} r="3" fill="#10b981" />
                      <text
                        x={x}
                        y={chartH - 8}
                        textAnchor="middle"
                        className="fill-slate-400 text-[9px] font-mono"
                      >
                        {Math.round(s.positionPct)}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Zone Table */}
          {samples.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-52 overflow-y-auto">
              <table className="w-full text-left text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-1.5">Zone</th>
                    <th className="px-3 py-1.5">LBA Offset</th>
                    <th className="px-3 py-1.5">Read Speed</th>
                    <th className="px-3 py-1.5">4K Random</th>
                    <th className="px-3 py-1.5">Avg / P99 Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {samples.map(s => (
                    <tr key={s.zoneIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-1.5 text-slate-500">
                        #{s.zoneIndex + 1} ({s.positionPct}%)
                      </td>
                      <td className="px-3 py-1.5 text-indigo-600 dark:text-indigo-400">
                        {s.startLba.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                        {s.readMbSec} MB/s
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                        {s.random4kIops !== null ? `${s.random4kIops.toLocaleString()} IOPS` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-amber-600 dark:text-amber-400">
                        {s.avgLatencyMs} / {s.p99LatencyMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            HDD/NVMe 플래터 외곽~내곽 존(Zone) 대역폭 저하 및 SLC 캐시 포화 구간 프로파일링
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
