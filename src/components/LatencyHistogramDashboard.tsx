import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DiskDrive, SectorBlock, SpecializedScanMethodId } from '../types';
import { SCAN_METHOD_DEFINITIONS } from '../utils/scanProfiles';
import {
  analyzePredictiveFailure,
  ContiguousDegradationZone,
  PredictiveFailureReport
} from '../utils/predictiveFailureAnalysis';
import {
  BarChart3,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Crosshair,
  Wrench,
  Play,
  Activity,
  SlidersHorizontal,
  Radar
} from 'lucide-react';

interface LatencyHistogramDashboardProps {
  blocks: SectorBlock[];
  drive: DiskDrive;
  activeMethodId?: SpecializedScanMethodId;
  scanMode?: 'quick' | 'full';
  isScanning?: boolean;
  onSelectBlock?: (block: SectorBlock) => void;
  onStartScan?: () => void;
  onOpenRemapModal?: () => void;
  onDegradationWarning?: (zone: ContiguousDegradationZone, report: PredictiveFailureReport) => void;
}

interface HistogramBucket {
  id: string;
  label: string;
  subLabel: string;
  x0: number;
  x1: number;
  blocks: SectorBlock[];
  count: number;
  pct: number;
  severity: 'good' | 'normal' | 'slow' | 'critical' | 'bad';
  isSlowHighlighted: boolean;
  speedRangeLabel: string;
  isOutlierError?: boolean;
}

const CHART_WIDTH = 860;
const CHART_HEIGHT = 252;
const MARGIN = { top: 26, right: 20, bottom: 44, left: 48 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

export const LatencyHistogramDashboard: React.FC<LatencyHistogramDashboardProps> = ({
  blocks,
  drive,
  activeMethodId,
  scanMode = 'full',
  isScanning = false,
  onSelectBlock,
  onStartScan,
  onOpenRemapModal,
  onDegradationWarning
}) => {
  const [binMode, setBinMode] = useState<'adaptive' | 'linear'>('adaptive');
  const [yScaleMode, setYScaleMode] = useState<'linear' | 'log'>('log');
  const [precisionMode, setPrecisionMode] = useState<'auto' | 'quick_8' | 'full_20'>('auto');
  const [slowHighlightThresholdMs, setSlowHighlightThresholdMs] = useState<number>(100);
  const [hoveredBucketId, setHoveredBucketId] = useState<string | null>(null);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const onDegradationWarningRef = useRef(onDegradationWarning);
  onDegradationWarningRef.current = onDegradationWarning;
  const reportedZonesRef = useRef<Set<string>>(new Set());

  const methodDef = activeMethodId ? SCAN_METHOD_DEFINITIONS[activeMethodId] : undefined;
  const profileSlowMs = methodDef?.slowThresholdMs ?? 150;
  const criticalThresholdMs = methodDef?.criticalThresholdMs ?? 500;
  const blockSizeKb = methodDef?.blockSizeKb ?? 512;

  // Resolve effective statistical precision from selected scanMode (Quick vs Full) or manual override
  const effectivePrecision: 'quick' | 'full' =
    precisionMode === 'auto'
      ? (scanMode === 'quick' ? 'quick' : 'full')
      : precisionMode === 'quick_8'
        ? ('quick' as const)
        : ('full' as const);

  const decimalDigits = effectivePrecision === 'quick' ? 1 : 2;
  const linearThresholdCount = effectivePrecision === 'quick' ? 8 : 20;

  const scannedBlocks = useMemo(
    () => blocks.filter(b => b.status !== 'unscanned'),
    [blocks]
  );

  const validLatencyBlocks = useMemo(
    () => scannedBlocks.filter(b => b.status !== 'bad' && b.responseTimeMs >= 0),
    [scannedBlocks]
  );

  const errorBlocks = useMemo(
    () => scannedBlocks.filter(b => b.status === 'bad' || b.responseTimeMs < 0),
    [scannedBlocks]
  );

  const over100msBlocks = useMemo(
    () => validLatencyBlocks.filter(b => b.responseTimeMs >= 100),
    [validLatencyBlocks]
  );

  const slowHighlightedBlocks = useMemo(
    () => validLatencyBlocks.filter(b => b.responseTimeMs >= slowHighlightThresholdMs),
    [validLatencyBlocks, slowHighlightThresholdMs]
  );

  // Predictive Failure Analysis: Z-Score distribution & contiguous >=100ms physical range detector
  const predictiveReport = useMemo(
    () =>
      analyzePredictiveFailure(blocks, {
        latencyThresholdMs: 100,
        minContiguousCount: 3,
        scanMode: scanMode === 'quick' ? 'quick' : 'full'
      }),
    [blocks, scanMode]
  );

  // Reset emitted zone tracker when switching drives or clearing scan blocks
  useEffect(() => {
    if (predictiveReport.sampleCount === 0) {
      reportedZonesRef.current.clear();
    }
  }, [drive.id, predictiveReport.sampleCount]);

  // Trigger preemptive Degradation Warning when sectors consistently exceed 100ms in a contiguous range
  useEffect(() => {
    if (!onDegradationWarningRef.current || predictiveReport.contiguousZones.length === 0) {
      return;
    }

    for (const zone of predictiveReport.contiguousZones) {
      const scopedKey = `${drive.id}:${zone.warningKey}`;
      if (!reportedZonesRef.current.has(scopedKey)) {
        reportedZonesRef.current.add(scopedKey);
        onDegradationWarningRef.current(zone, predictiveReport);
      }
    }
  }, [drive.id, predictiveReport]);

  // D3 statistical summary & precursor anomaly scoring scaled to Quick vs Full precision
  const stats = useMemo(() => {
    if (scannedBlocks.length === 0) {
      return {
        totalScanned: 0,
        p50: null as number | null,
        p95: null as number | null,
        p99: null as number | null,
        meanLatency: null as number | null,
        stdDevLatency: null as number | null,
        standardErrorMs: null as number | null,
        meanSpeedMbSec: null as number | null,
        tailRatio: null as number | null,
        over100msCount: 0,
        over100msPct: 0,
        slowCriticalCount: 0,
        slowCriticalPct: 0,
        slowZoneCount: 0,
        slowHighlightedCount: 0,
        slowHighlightedPct: 0,
        verdict: 'idle' as 'idle' | 'healthy' | 'watch' | 'precursor' | 'bad'
      };
    }

    const sortedLat = validLatencyBlocks
      .map(b => b.responseTimeMs)
      .sort(d3.ascending);

    const p50 = sortedLat.length > 0 ? (d3.quantileSorted(sortedLat, 0.5) ?? null) : null;
    const p95 = sortedLat.length > 0 ? (d3.quantileSorted(sortedLat, 0.95) ?? null) : null;
    const p99 = sortedLat.length > 0 ? (d3.quantileSorted(sortedLat, 0.99) ?? null) : null;
    const meanLatency = sortedLat.length > 0 ? (d3.mean(sortedLat) ?? null) : null;
    const stdDevLatency = sortedLat.length > 1 ? (d3.deviation(sortedLat) ?? 0) : 0;

    // Sampling margin-of-error: Quick mode samples 25% of blocks (4-block stride), Full mode inspects 100%
    const finitePopFactor = effectivePrecision === 'quick' ? Math.sqrt(0.75) : 0.25;
    const standardErrorMs =
      sortedLat.length > 1
        ? (stdDevLatency / Math.sqrt(sortedLat.length)) * (effectivePrecision === 'quick' ? 1.96 * finitePopFactor : 1)
        : 0;

    const measuredSpeeds = validLatencyBlocks
      .map(b => b.throughputMbSec)
      .filter((v): v is number => typeof v === 'number' && v > 0);

    const derivedSpeed =
      measuredSpeeds.length > 0
        ? d3.mean(measuredSpeeds) ?? null
        : meanLatency && meanLatency > 0
        ? (blockSizeKb / 1024) / (meanLatency / 1000)
        : null;

    const tailRatio =
      p50 !== null && p99 !== null
        ? Number((p99 / Math.max(0.05, p50)).toFixed(1))
        : null;

    const criticalLatencyBlocks = validLatencyBlocks.filter(
      b => b.responseTimeMs >= criticalThresholdMs
    );

    const effectiveHighlightMs = Math.min(100, slowHighlightThresholdMs);
    const effectiveSlowMin = Math.min(slowHighlightThresholdMs, profileSlowMs);
    const over100msCount = over100msBlocks.length;
    const over100msPct = Number(((over100msCount / scannedBlocks.length) * 100).toFixed(1));
    const slowCriticalCount = over100msCount + errorBlocks.length;
    const slowCriticalPct = Number(((slowCriticalCount / scannedBlocks.length) * 100).toFixed(1));
    const slowZoneCount = validLatencyBlocks.filter(b => b.responseTimeMs >= effectiveHighlightMs).length;
    const slowHighlightedCount = slowHighlightedBlocks.length;
    const slowHighlightedPct = Number(((slowHighlightedCount / scannedBlocks.length) * 100).toFixed(1));

    let verdict: 'idle' | 'healthy' | 'watch' | 'precursor' | 'bad' = 'healthy';
    if (errorBlocks.length > 0) {
      verdict = 'bad';
    } else if (
      criticalLatencyBlocks.length > 0 ||
      (p99 !== null && p99 >= effectiveSlowMin) ||
      (tailRatio !== null && tailRatio >= 12 && sortedLat.length >= 16 && (p99 ?? 0) >= 25)
    ) {
      verdict = 'precursor';
    } else if (
      slowHighlightedCount > 0 ||
      over100msCount > 0 ||
      (tailRatio !== null && tailRatio >= 6 && sortedLat.length >= 16 && (p95 ?? 0) >= 15)
    ) {
      verdict = 'watch';
    }

    return {
      totalScanned: scannedBlocks.length,
      p50,
      p95,
      p99,
      meanLatency,
      stdDevLatency,
      standardErrorMs,
      meanSpeedMbSec: derivedSpeed,
      tailRatio,
      over100msCount,
      over100msPct,
      slowCriticalCount,
      slowCriticalPct,
      slowZoneCount,
      slowHighlightedCount,
      slowHighlightedPct,
      verdict
    };
  }, [
    scannedBlocks.length,
    validLatencyBlocks,
    errorBlocks.length,
    over100msBlocks.length,
    slowHighlightedBlocks.length,
    effectivePrecision,
    blockSizeKb,
    criticalThresholdMs,
    slowHighlightThresholdMs,
    profileSlowMs
  ]);

  const formatEdge = (val: number) => {
    if (val >= 100) return `${Math.round(val)}`;
    if (val >= 10) return `${Number(val.toFixed(1))}`;
    return `${Number(val.toFixed(effectivePrecision === 'quick' ? 1 : 2))}`;
  };

  // Format equivalent MB/s range for a latency bucket [x0, x1] ms
  const formatSpeedRange = (x0: number, x1: number, binBlocks: SectorBlock[]): string => {
    const measured = binBlocks
      .map(b => b.throughputMbSec)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    if (measured.length > 0) {
      const minSpd = d3.min(measured) ?? 0;
      const maxSpd = d3.max(measured) ?? 0;
      if (Math.abs(maxSpd - minSpd) < 0.5) {
        return `약 ${maxSpd.toFixed(1)} MB/s`;
      }
      return `${minSpd.toFixed(1)} ~ ${maxSpd.toFixed(1)} MB/s`;
    }
    const blockMb = blockSizeKb / 1024;
    const minSpd = x1 > 0 ? blockMb / (x1 / 1000) : 0;
    const maxSpd = x0 > 0.05 ? blockMb / (x0 / 1000) : blockMb / 0.0001;
    return `${minSpd.toFixed(1)} ~ ${Math.min(9999, maxSpd).toFixed(0)} MB/s`;
  };

  // Build D3 histogram buckets with Quick/Full precision & explicit Slow threshold split
  const buckets = useMemo<HistogramBucket[]>(() => {
    if (scannedBlocks.length === 0) return [];
    const total = scannedBlocks.length;

    const effectiveHighlightMs = Math.min(100, slowHighlightThresholdMs);

    const classifySeverity = (x0: number, midMs: number, binBlocks: SectorBlock[]): { severity: HistogramBucket['severity']; isSlowHighlighted: boolean } => {
      const hasSlowBlock = binBlocks.some(b => b.responseTimeMs >= effectiveHighlightMs);
      const isSlowRange = x0 >= effectiveHighlightMs || midMs >= effectiveHighlightMs || hasSlowBlock;

      if (midMs >= criticalThresholdMs || x0 >= criticalThresholdMs) {
        return { severity: 'critical', isSlowHighlighted: true };
      }
      if (isSlowRange) {
        return { severity: 'slow', isSlowHighlighted: true };
      }
      if (midMs >= 10) {
        return { severity: 'normal', isSlowHighlighted: false };
      }
      return { severity: 'good', isSlowHighlighted: false };
    };

    const result: HistogramBucket[] = [];

    if (binMode === 'adaptive') {
      const baseEdges =
        effectivePrecision === 'quick'
          ? [0, 1, 5, 15, 50, 100, 250, 500, Infinity]
          : [0, 0.5, 1, 2, 5, 10, 25, 50, 100, 150, 250, 400, 500, Infinity];

      const edges = Array.from(new Set([...baseEdges, 100, slowHighlightThresholdMs])).sort((a, b) => a - b);

      for (let i = 0; i < edges.length - 1; i++) {
        const x0 = edges[i];
        const x1 = edges[i + 1];
        const inBin = validLatencyBlocks.filter(
          b => b.responseTimeMs >= x0 && (x1 === Infinity ? true : b.responseTimeMs < x1)
        );
        const mid = x1 === Infinity ? Math.max(500, criticalThresholdMs, slowHighlightThresholdMs) : (x0 + x1) / 2;

        // Always render base operational tiers + highlighted Slow threshold tier + any occupied outlier tier
        const shouldShowTier =
          inBin.length > 0 ||
          x0 <= Math.max(150, slowHighlightThresholdMs);

        if (shouldShowTier) {
          const { severity, isSlowHighlighted } = classifySeverity(x0, mid, inBin);
          const labelText =
            x1 === Infinity
              ? `${formatEdge(x0)}ms+`
              : x0 === 0
              ? `<${formatEdge(x1)}ms`
              : `${formatEdge(x0)}-${formatEdge(x1)}`;

          result.push({
            id: `tier-${i}`,
            label: labelText,
            subLabel: x1 === Infinity ? `≥ ${formatEdge(x0)} ms` : `${formatEdge(x0)} ~ ${formatEdge(x1)} ms`,
            x0,
            x1: x1 === Infinity ? Math.max(x0 * 1.5, 600) : x1,
            blocks: inBin,
            count: inBin.length,
            pct: Number(((inBin.length / total) * 100).toFixed(1)),
            severity,
            isSlowHighlighted,
            speedRangeLabel: inBin.length > 0 ? formatSpeedRange(x0, x1 === Infinity ? 1000 : x1, inBin) : '-'
          });
        }
      }
    } else {
      const maxLat = Math.max(
        slowHighlightThresholdMs * 1.25,
        profileSlowMs,
        d3.max<SectorBlock, number>(validLatencyBlocks, b => b.responseTimeMs) ?? 50
      );
      const binGenerator = d3
        .bin<SectorBlock, number>()
        .value(d => d.responseTimeMs)
        .domain([0, maxLat])
        .thresholds(linearThresholdCount);

      const d3Bins = binGenerator(validLatencyBlocks);
      // Extract D3 boundary edges and ensure exact split at 100ms and slowHighlightThresholdMs so <threshold and >=threshold never mix
      const rawEdges = new Set<number>([0, maxLat, 100, slowHighlightThresholdMs]);
      d3Bins.forEach(bin => {
        if (typeof bin.x0 === 'number') rawEdges.add(bin.x0);
        if (typeof bin.x1 === 'number') rawEdges.add(bin.x1);
      });
      const linearEdges = Array.from(rawEdges).sort((a, b) => a - b);

      for (let idx = 0; idx < linearEdges.length - 1; idx++) {
        const x0 = linearEdges[idx];
        const x1 = linearEdges[idx + 1];
        if (x1 - x0 < 0.001) continue;
        const isLast = idx === linearEdges.length - 2;
        const binBlocks = validLatencyBlocks.filter(
          b => b.responseTimeMs >= x0 && (isLast ? b.responseTimeMs <= x1 : b.responseTimeMs < x1)
        );
        const mid = (x0 + x1) / 2;
        const { severity, isSlowHighlighted } = classifySeverity(x0, mid, binBlocks);
        result.push({
          id: `d3bin-${idx}`,
          label: `${formatEdge(x0)}-${formatEdge(x1)}`,
          subLabel: `${x0.toFixed(decimalDigits)} ~ ${x1.toFixed(decimalDigits)} ms`,
          x0,
          x1,
          blocks: binBlocks,
          count: binBlocks.length,
          pct: Number(((binBlocks.length / total) * 100).toFixed(1)),
          severity,
          isSlowHighlighted,
          speedRangeLabel: binBlocks.length > 0 ? formatSpeedRange(x0, x1, binBlocks) : '-'
        });
      }
    }

    // Append explicit Error / Timeout outlier bin whenever bad sectors exist
    if (errorBlocks.length > 0) {
      result.push({
        id: 'bin-bad-timeout',
        label: 'ERR/TMO',
        subLabel: 'I/O 실패 / 응답 시간 초과',
        x0: -1,
        x1: -1,
        blocks: errorBlocks,
        count: errorBlocks.length,
        pct: Number(((errorBlocks.length / total) * 100).toFixed(1)),
        severity: 'bad',
        isSlowHighlighted: false,
        speedRangeLabel: '0.0 MB/s (판독 불가)',
        isOutlierError: true
      });
    }

    return result;
  }, [
    scannedBlocks.length,
    validLatencyBlocks,
    errorBlocks,
    binMode,
    effectivePrecision,
    linearThresholdCount,
    decimalDigits,
    slowHighlightThresholdMs,
    profileSlowMs,
    criticalThresholdMs,
    blockSizeKb
  ]);

  // D3 Scales for SVG rendering
  const { xScale, yTicks, getBarHeight, getBarY } = useMemo(() => {
    const band = d3
      .scaleBand<string>()
      .domain(buckets.map(b => b.id))
      .range([0, PLOT_W])
      .paddingInner(0.18)
      .paddingOuter(0.08);

    const maxCount = Math.max(2, d3.max<HistogramBucket, number>(buckets, b => b.count) ?? 2);

    if (yScaleMode === 'log') {
      const logScale = d3
        .scaleLog()
        .domain([0.6, Math.max(10, maxCount * 1.25)])
        .range([PLOT_H, 0])
        .clamp(true);

      const candidateTicks = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
      const ticks = candidateTicks.filter(t => t <= maxCount * 1.2);
      if (ticks.length === 0) ticks.push(1);

      return {
        xScale: band,
        yTicks: ticks.map(v => ({ value: v, y: logScale(v) })),
        getBarHeight: (count: number) => (count <= 0 ? 0 : Math.max(3, PLOT_H - logScale(count))),
        getBarY: (count: number) => (count <= 0 ? PLOT_H : Math.min(PLOT_H - 3, logScale(count)))
      };
    }

    const linScale = d3
      .scaleLinear()
      .domain([0, maxCount])
      .nice()
      .range([PLOT_H, 0]);

    const ticks = linScale.ticks(4);
    return {
      xScale: band,
      yTicks: ticks.map(v => ({ value: v, y: linScale(v) })),
      getBarHeight: (count: number) => (count <= 0 ? 0 : Math.max(2, PLOT_H - linScale(count))),
      getBarY: (count: number) => (count <= 0 ? PLOT_H : Math.min(PLOT_H - 2, linScale(count)))
    };
  }, [buckets, yScaleMode]);

  // Compute Slow-Highlight zone & Critical threshold X positions along band axis
  const zoneGeometry = useMemo(() => {
    const nonErr = buckets.filter(b => !b.isOutlierError);
    const firstSlowBucket = nonErr.find(b => b.isSlowHighlighted);
    const firstSlowX = firstSlowBucket ? (xScale(firstSlowBucket.id) ?? null) : null;

    const lastNonErr = nonErr[nonErr.length - 1];
    const lastNonErrEnd = lastNonErr
      ? (xScale(lastNonErr.id) ?? 0) + xScale.bandwidth()
      : PLOT_W;

    const critBucket =
      nonErr.find(b => criticalThresholdMs >= b.x0 && criticalThresholdMs <= b.x1) ||
      nonErr.find(b => b.x0 >= criticalThresholdMs);
    const critX = critBucket ? (xScale(critBucket.id) ?? null) : null;

    return {
      slowZoneX: firstSlowX,
      slowZoneWidth: firstSlowX !== null ? Math.max(0, lastNonErrEnd - firstSlowX) : 0,
      critX
    };
  }, [buckets, xScale, criticalThresholdMs]);

  const activeBucket = useMemo(
    () => buckets.find(b => b.id === (hoveredBucketId || selectedBucketId)) || null,
    [buckets, hoveredBucketId, selectedBucketId]
  );

  const selectedBucket = useMemo(
    () => buckets.find(b => b.id === selectedBucketId) || null,
    [buckets, selectedBucketId]
  );

  const sortedSelectedBlocks = useMemo(() => {
    if (!selectedBucket) return [];
    return [...selectedBucket.blocks]
      .sort((a, b) => {
        if (a.status === 'bad' && b.status !== 'bad') return -1;
        if (b.status === 'bad' && a.status !== 'bad') return 1;
        return b.responseTimeMs - a.responseTimeMs;
      })
      .slice(0, 12);
  }, [selectedBucket]);

  const getSeverityFill = (b: HistogramBucket, isHighlighted: boolean) => {
    if (b.severity === 'bad') {
      return isHighlighted ? '#991B1B' : '#DC2626';
    }
    if (b.severity === 'critical') {
      return isHighlighted ? '#B91C1C' : '#EF4444';
    }
    if (b.isSlowHighlighted) {
      // Distinct D3 orange-to-red gradient highlight for >100ms delayed sectors
      return isHighlighted ? 'url(#slow-orange-red-fill-active)' : 'url(#slow-orange-red-fill)';
    }
    if (b.severity === 'normal') {
      return isHighlighted ? '#65A30D' : '#84CC16';
    }
    return isHighlighted ? '#059669' : '#10B981';
  };

  const verdictBanner = (() => {
    switch (stats.verdict) {
      case 'bad':
        return {
          cls: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />,
          label: '결함 검출',
          detail: `I/O 실패 ${errorBlocks.length}개 · ${slowHighlightThresholdMs}ms 이상 Slow 섹터 총 ${stats.slowHighlightedCount.toLocaleString()}개가 관측되었습니다.`
        };
      case 'precursor':
        return {
          cls: 'text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />,
          label: '전조 증상 의심',
          detail: `P99 ${stats.p99?.toFixed(decimalDigits)}ms (왜도 ${stats.tailRatio ?? 0}x) · ${slowHighlightThresholdMs}ms+ Slow 섹터 총 ${stats.slowHighlightedCount.toLocaleString()}개(${stats.slowHighlightedPct}%) — ECC 읽기 재시도 전조`
        };
      case 'watch':
        return {
          cls: 'text-orange-700 dark:text-orange-300 bg-orange-50/70 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40',
          icon: <Activity className="w-3.5 h-3.5 text-orange-500 shrink-0" />,
          label: 'Slow 분포 관찰',
          detail: `${slowHighlightThresholdMs}ms 이상 Slow 섹터 총 ${stats.slowHighlightedCount.toLocaleString()}개(${stats.slowHighlightedPct}%) 및 응답 편차(σ=${stats.stdDevLatency?.toFixed(decimalDigits)}ms)가 감지되었습니다.`
        };
      default:
        return {
          cls: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50',
          icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
          label: '정상 단봉 분포',
          detail: `P99 ${stats.p99 !== null ? `${stats.p99.toFixed(decimalDigits)}ms` : 'N/A'} — ${slowHighlightThresholdMs}ms+ Slow 이상 섹터(0개) 없이 안정적 분포를 보입니다.`
        };
    }
  })();

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs transition-colors">
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 mt-0.5">
            <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                섹터별 읽기 속도 및 I/O 레이턴시 분포 (Histogram)
              </h3>
              {/* Live Slow/Critical (>=100ms & I/O Error) Sector Counter at Top of Chart */}
              <div
                data-testid="realtime-slow-sector-counter"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-mono tabular-nums ${
                  stats.slowCriticalCount > 0
                    ? 'bg-orange-50 dark:bg-red-950/35 border-orange-400 dark:border-red-700/80 text-orange-900 dark:text-orange-200'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isScanning
                      ? stats.slowCriticalCount > 0
                        ? 'bg-red-500 animate-pulse'
                        : 'bg-emerald-500 animate-pulse'
                      : stats.slowCriticalCount > 0
                        ? 'bg-orange-500'
                        : 'bg-slate-400'
                  }`}
                />
                <span className="font-sans font-semibold">Slow/Critical (≥100ms)</span>
                <span className={`font-bold ${
                  stats.slowCriticalCount > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-800 dark:text-slate-100'
                }`}>
                  총 {stats.slowCriticalCount.toLocaleString()}개
                </span>
                <span className="text-[10px] opacity-80">
                  ({stats.slowCriticalPct}%)
                </span>
                {errorBlocks.length > 0 && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 border-l border-orange-300 dark:border-red-800 pl-1.5">
                    오류 {errorBlocks.length}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap font-mono tabular-nums">
              <span className="font-sans">{drive.model}</span>
              <span aria-hidden="true">·</span>
              <span>
                {effectivePrecision === 'quick'
                  ? `Quick 샘플링 정밀도 (8-Bin · ±${stats.standardErrorMs !== null ? stats.standardErrorMs.toFixed(1) : '0.0'}ms 오차)`
                  : `Full 전수 정밀도 (20-Bin · 0.01ms 단위)`}
              </span>
              <span aria-hidden="true">·</span>
              <span>표본 {stats.totalScanned.toLocaleString()}블록</span>
            </p>
          </div>
        </div>

        {/* Interactive Histogram Precision, Slow Threshold & Scale Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick vs Full Statistical Precision Selector */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-[11px]">
            <SlidersHorizontal className="w-3 h-3 text-indigo-500 shrink-0" />
            <label htmlFor="histogram-precision-select" className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
              정밀도
            </label>
            <select
              id="histogram-precision-select"
              value={precisionMode}
              onChange={(e) => {
                setPrecisionMode(e.target.value as 'auto' | 'quick_8' | 'full_20');
                setSelectedBucketId(null);
              }}
              className="bg-transparent font-medium text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="auto" className="bg-white dark:bg-slate-900">
                자동 ({scanMode === 'quick' ? 'Quick 8-Bin' : 'Full 20-Bin'})
              </option>
              <option value="quick_8" className="bg-white dark:bg-slate-900">
                고속 샘플링 (8-Bin / 0.1ms)
              </option>
              <option value="full_20" className="bg-white dark:bg-slate-900">
                초정밀 분석 (20-Bin / 0.01ms)
              </option>
            </select>
          </div>

          {/* Slow Sector Highlight Threshold Selector */}
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-50/80 dark:bg-orange-950/30 border border-orange-300/80 dark:border-orange-700/60 rounded-md text-[11px]">
            <label htmlFor="histogram-slow-threshold" className="text-orange-800 dark:text-orange-300 font-medium whitespace-nowrap">
              Slow 하이라이트
            </label>
            <select
              id="histogram-slow-threshold"
              value={slowHighlightThresholdMs}
              onChange={(e) => {
                setSlowHighlightThresholdMs(Number(e.target.value));
                setSelectedBucketId(null);
              }}
              className="bg-transparent font-mono font-bold text-orange-900 dark:text-orange-200 focus:outline-none cursor-pointer"
            >
              <option value={50} className="bg-white dark:bg-slate-900">50ms 이상</option>
              <option value={100} className="bg-white dark:bg-slate-900">100ms 이상</option>
              <option value={150} className="bg-white dark:bg-slate-900">150ms 이상 (프로파일)</option>
              <option value={200} className="bg-white dark:bg-slate-900">200ms 이상</option>
              <option value={300} className="bg-white dark:bg-slate-900">300ms 이상</option>
            </select>
          </div>

          {/* Adaptive Tiers vs Uniform D3 Bins */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-[11px]">
            <button
              type="button"
              onClick={() => {
                setBinMode('adaptive');
                setSelectedBucketId(null);
              }}
              className={`px-2 py-1 rounded font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                binMode === 'adaptive'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              로그 티어
            </button>
            <button
              type="button"
              onClick={() => {
                setBinMode('linear');
                setSelectedBucketId(null);
              }}
              className={`px-2 py-1 rounded font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                binMode === 'linear'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              D3 균등
            </button>
          </div>

          {/* Y Axis Linear vs Log */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-[11px]">
            <button
              type="button"
              onClick={() => setYScaleMode('log')}
              className={`px-2 py-1 rounded font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                yScaleMode === 'log'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="극소수의 Slow 이상 섹터를 선명하게 강조합니다"
            >
              Y축 로그
            </button>
            <button
              type="button"
              onClick={() => setYScaleMode('linear')}
              className={`px-2 py-1 rounded font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                yScaleMode === 'linear'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Y축 선형
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {stats.totalScanned === 0 ? (
        <div className="mt-3 p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 text-center space-y-2">
          <BarChart3 className="w-6 h-6 text-slate-400 mx-auto" />
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            수집된 실시간 섹터 I/O 레이턴시 데이터가 없습니다
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            표면 검사를 시작하면 현재 선택된 검사 방식({scanMode === 'quick' ? 'Quick 고속 샘플링' : 'Full 정밀 검사'})에 맞춰 D3 히스토그램 정밀도가 자동 조정되며, {slowHighlightThresholdMs}ms 이상 Slow 섹터 분포를 별도 강조합니다.
          </p>
          {onStartScan && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onStartScan}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                실시간 표면 검사 시작
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Statistical Precursor Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50/60 dark:bg-slate-950/50">
            <div className="p-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                지연 백분위 (P50 / P95 / P99)
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.p50 !== null ? stats.p50.toFixed(decimalDigits) : 'N/A'} /{' '}
                {stats.p95 !== null ? stats.p95.toFixed(decimalDigits) : 'N/A'} /{' '}
                <span className={(stats.p99 ?? 0) >= slowHighlightThresholdMs ? 'text-orange-600 dark:text-orange-400' : ''}>
                  {stats.p99 !== null ? `${stats.p99.toFixed(decimalDigits)} ms` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">평균 읽기 속도 · 지터(σ)</div>
              <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.meanSpeedMbSec !== null ? `${stats.meanSpeedMbSec.toFixed(1)} MB/s` : 'N/A'}{' '}
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  (σ={stats.stdDevLatency !== null ? `${stats.stdDevLatency.toFixed(decimalDigits)}ms` : 'N/A'})
                </span>
              </div>
            </div>

            <div className={`p-2.5 ${stats.over100msCount > 0 || stats.slowHighlightedCount > 0 ? 'bg-orange-50/70 dark:bg-orange-950/20' : ''}`}>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
                <span>{slowHighlightThresholdMs}ms+ 지연 섹터 총 개수</span>
                {slowHighlightThresholdMs !== 100 && (
                  <span className="font-mono text-[10px] text-orange-600 dark:text-orange-400">
                    100ms+: {stats.over100msCount.toLocaleString()}개
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className={
                  stats.slowHighlightedCount > 0
                    ? stats.verdict === 'bad' || stats.verdict === 'precursor'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-orange-600 dark:text-orange-400'
                    : 'text-slate-900 dark:text-slate-100'
                }>
                  총 {stats.slowHighlightedCount.toLocaleString()}개 ({stats.slowHighlightedPct}%)
                </span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  · 왜도 {stats.tailRatio !== null ? `${stats.tailRatio.toFixed(1)}x` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">전조 증상 판정</div>
                <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold ${
                  stats.verdict === 'bad'
                    ? 'text-red-600 dark:text-red-400'
                    : stats.verdict === 'precursor' || stats.verdict === 'watch'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {verdictBanner.icon}
                  <span className="truncate">{verdictBanner.label}</span>
                </div>
              </div>
              {(stats.verdict === 'bad' || stats.verdict === 'precursor') && onOpenRemapModal && (
                <button
                  type="button"
                  onClick={onOpenRemapModal}
                  className="px-2 py-1 rounded text-[11px] font-semibold bg-orange-600 hover:bg-orange-500 text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Wrench className="w-3 h-3" />
                  <span>수복</span>
                </button>
              )}
            </div>
          </div>

          {/* Precursor Diagnostic Advice Line */}
          <div className={`px-3 py-2 rounded-md border text-[11px] flex items-center justify-between gap-2 flex-wrap ${verdictBanner.cls}`}>
            <div className="flex items-center gap-1.5">
              {verdictBanner.icon}
              <span>{verdictBanner.detail}</span>
            </div>
            <span className="font-mono text-[10px] opacity-80">
              {isScanning ? '실시간 D3 집계 중' : '강조된 Slow 막대 클릭 시 LBA 상세 조회'}
            </span>
          </div>

          {/* D3 Responsive SVG Histogram */}
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full min-w-[540px] h-auto select-none"
              role="img"
              aria-label="섹터별 읽기 속도 및 응답 레이턴시 분포 히스토그램"
            >
              <defs>
                <linearGradient id="slow-orange-red-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
                <linearGradient id="slow-orange-red-fill-active" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DC2626" />
                  <stop offset="100%" stopColor="#EA580C" />
                </linearGradient>
                <pattern
                  id="slow-highlight-hatch"
                  width="6"
                  height="6"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.28" />
                </pattern>
              </defs>

              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {/* Slow Highlighted Zone Shaded Backdrop (Orange/Red Highlight Zone) */}
                {zoneGeometry.slowZoneX !== null && zoneGeometry.slowZoneWidth > 0 && (
                  <g>
                    <rect
                      x={zoneGeometry.slowZoneX}
                      y={0}
                      width={zoneGeometry.slowZoneWidth}
                      height={PLOT_H}
                      fill="#F97316"
                      fillOpacity={0.11}
                      rx={2}
                    />
                    <line
                      x1={zoneGeometry.slowZoneX}
                      x2={zoneGeometry.slowZoneX}
                      y1={0}
                      y2={PLOT_H}
                      stroke="#EA580C"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={zoneGeometry.slowZoneX + 4}
                      y={-8}
                      className="fill-orange-600 dark:fill-orange-400 text-[9.5px] font-mono font-bold"
                    >
                      Slow 하이라이트 (≥{Math.min(100, slowHighlightThresholdMs)}ms · 총 {stats.slowZoneCount.toLocaleString()}개)
                    </text>
                  </g>
                )}

                {/* Horizontal Y Gridlines & Labels */}
                {yTicks.map((t, idx) => (
                  <g key={`ytick-${idx}`} transform={`translate(0,${t.y})`}>
                    <line
                      x1={0}
                      x2={PLOT_W}
                      y1={0}
                      y2={0}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray={t.value === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={-8}
                      y={3}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {t.value}
                    </text>
                  </g>
                ))}

                {/* Y Axis Title */}
                <text
                  transform={`translate(-36,${PLOT_H / 2}) rotate(-90)`}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                >
                  {yScaleMode === 'log' ? 'Blocks (Log)' : 'Blocks'}
                </text>

                {/* Baseline */}
                <line
                  x1={0}
                  x2={PLOT_W}
                  y1={PLOT_H}
                  y2={PLOT_H}
                  className="stroke-slate-300 dark:stroke-slate-700"
                />

                {/* Critical Precursor Threshold Line */}
                {zoneGeometry.critX !== null && zoneGeometry.critX !== zoneGeometry.slowZoneX && (
                  <g transform={`translate(${zoneGeometry.critX},0)`}>
                    <line
                      x1={0}
                      x2={0}
                      y1={0}
                      y2={PLOT_H}
                      stroke="#DC2626"
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                      opacity={0.85}
                    />
                    <text
                      x={4}
                      y={-8}
                      className="fill-red-600 dark:fill-red-400 text-[9.5px] font-mono font-semibold"
                    >
                      위험 &gt;{criticalThresholdMs}ms
                    </text>
                  </g>
                )}

                {/* D3 Histogram Bars */}
                {buckets.map(b => {
                  const bx = xScale(b.id) ?? 0;
                  const bw = xScale.bandwidth();
                  const bh = getBarHeight(b.count);
                  const by = getBarY(b.count);
                  const isHovered = hoveredBucketId === b.id;
                  const isSelected = selectedBucketId === b.id;

                  return (
                    <g key={b.id}>
                      {/* Full-column hit target */}
                      <rect
                        x={bx}
                        y={0}
                        width={bw}
                        height={PLOT_H}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredBucketId(b.id)}
                        onMouseLeave={() => setHoveredBucketId(null)}
                        onClick={() => setSelectedBucketId(prev => (prev === b.id ? null : b.id))}
                      />

                      {b.count > 0 && (
                        <>
                          <rect
                            x={bx}
                            y={by}
                            width={bw}
                            height={bh}
                            rx={2}
                            data-warning-slow={b.isSlowHighlighted ? 'true' : 'false'}
                            fill={getSeverityFill(b, isHovered || isSelected)}
                            opacity={isSelected || isHovered ? 1 : 0.94}
                            stroke={
                              isSelected
                                ? '#6366F1'
                                : b.severity === 'critical' || b.severity === 'bad'
                                ? '#991B1B'
                                : b.isSlowHighlighted
                                ? '#C2410C'
                                : 'none'
                            }
                            strokeWidth={isSelected ? 1.8 : b.isSlowHighlighted ? 1.4 : 0}
                            className="pointer-events-none transition-opacity duration-150"
                          />
                          {b.isSlowHighlighted && (
                            <rect
                              x={bx}
                              y={by}
                              width={bw}
                              height={bh}
                              rx={2}
                              fill="url(#slow-highlight-hatch)"
                              className="pointer-events-none"
                            />
                          )}
                        </>
                      )}

                      {/* Count label above non-zero bars */}
                      {b.count > 0 && (
                        <text
                          x={bx + bw / 2}
                          y={Math.max(10, by - 4)}
                          textAnchor="middle"
                          className={`text-[9px] font-mono tabular-nums pointer-events-none ${
                            b.severity === 'critical' || b.severity === 'bad'
                              ? 'fill-red-600 dark:fill-red-400 font-bold'
                              : b.isSlowHighlighted
                              ? 'fill-orange-600 dark:fill-orange-400 font-bold'
                              : 'fill-slate-600 dark:fill-slate-300'
                          }`}
                        >
                          {b.count}
                        </text>
                      )}

                      {/* X Axis Label */}
                      <text
                        x={bx + bw / 2}
                        y={PLOT_H + 15}
                        textAnchor="middle"
                        className={`text-[9px] font-mono pointer-events-none ${
                          b.isOutlierError || b.severity === 'critical'
                            ? 'fill-red-600 dark:fill-red-400 font-bold'
                            : b.isSlowHighlighted
                            ? 'fill-orange-600 dark:fill-orange-400 font-semibold'
                            : 'fill-slate-500 dark:fill-slate-400'
                        }`}
                      >
                        {b.label}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis Title */}
                <text
                  x={PLOT_W / 2}
                  y={PLOT_H + 34}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                >
                  섹터 응답 지연 구간 (ms) — 좌측(고속) → 우측(오렌지/빨간색 음영: {slowHighlightThresholdMs}ms 이상 Slow 섹터 총 {stats.slowHighlightedCount.toLocaleString()}개)
                </text>
              </g>
            </svg>
          </div>

          {/* Legend & Hover Inspection Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
            <div className="flex items-center gap-3 flex-wrap text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                <span>고속 (&lt;10ms)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-lime-500" />
                <span>양호 (&lt;{slowHighlightThresholdMs}ms)</span>
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-orange-700 dark:text-orange-300">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-500 border border-orange-700" />
                <span>Slow 하이라이트 (≥{slowHighlightThresholdMs}ms)</span>
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-500 border border-red-800" />
                <span>위험 지연 (&gt;{criticalThresholdMs}ms)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-700" />
                <span>I/O 오류/실패</span>
              </span>
            </div>

            {activeBucket ? (
              <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                <span className={`font-semibold ${
                  activeBucket.severity === 'critical' || activeBucket.severity === 'bad'
                    ? 'text-red-600 dark:text-red-400'
                    : activeBucket.isSlowHighlighted
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-indigo-600 dark:text-indigo-400'
                }`}>
                  [{activeBucket.subLabel}{activeBucket.isSlowHighlighted ? ' · Slow 하이라이트' : ''}]
                </span>
                <span>{activeBucket.count}블록 ({activeBucket.pct}%)</span>
                <span aria-hidden="true">·</span>
                <span>속도 {activeBucket.speedRangeLabel}</span>
              </div>
            ) : (
              <div className="text-slate-400 font-mono text-[10px]">
                막대에 마우스를 올리거나 클릭하여 구간별 LBA를 추적하세요
              </div>
            )}
          </div>

          {/* Predictive Failure Analysis (Z-Score & Contiguous >=100ms Range Telemetry) */}
          <div
            data-testid="predictive-failure-analysis-panel"
            className={`rounded-md border p-3 transition-colors ${
              predictiveReport.shouldWarnDegradation
                ? 'bg-orange-50/80 dark:bg-red-950/20 border-orange-300 dark:border-red-800/70'
                : 'bg-slate-50/60 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2 flex-wrap">
                <Radar
                  className={`w-3.5 h-3.5 shrink-0 ${
                    predictiveReport.shouldWarnDegradation
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-indigo-500 dark:text-indigo-400'
                  }`}
                />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Predictive Failure Analysis (Z-Score 열화 예측)
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    predictiveReport.riskLevel === 'critical'
                      ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                      : predictiveReport.riskLevel === 'high'
                      ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700'
                      : predictiveReport.riskLevel === 'elevated'
                      ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  {predictiveReport.shouldWarnDegradation
                    ? 'DEGRADATION WARNING'
                    : predictiveReport.riskLevel === 'elevated'
                    ? 'Z-SCORE ELEVATED'
                    : 'NOMINAL'}
                  {' · '}위험도 {predictiveReport.degradationRiskScore}/100
                </span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                <span>
                  ≤1σ: {predictiveReport.zBands.normalWithin1Sigma}
                </span>
                <span>
                  1~2σ: {predictiveReport.zBands.elevated1To2Sigma}
                </span>
                <span className={predictiveReport.zBands.warning2To3Sigma > 0 ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                  2~3σ: {predictiveReport.zBands.warning2To3Sigma}
                </span>
                <span className={predictiveReport.zBands.outlierAbove3Sigma > 0 ? 'text-red-600 dark:text-red-400 font-bold' : ''}>
                  &gt;3σ: {predictiveReport.zBands.outlierAbove3Sigma}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2 text-[11px] font-mono tabular-nums">
              <div>
                <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                  레이턴시 분포 (μ ± σ)
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {predictiveReport.meanMs !== null
                    ? `${predictiveReport.meanMs.toFixed(decimalDigits)} ± ${predictiveReport.stdDevMs.toFixed(decimalDigits)} ms`
                    : 'N/A'}
                </div>
              </div>

              <div>
                <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                  최대 Z-Score (Z_max)
                </div>
                <div
                  className={`font-bold mt-0.5 ${
                    (predictiveReport.maxZScore ?? 0) >= 3
                      ? 'text-red-600 dark:text-red-400'
                      : (predictiveReport.maxZScore ?? 0) >= 2
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {predictiveReport.maxZScore !== null
                    ? `${predictiveReport.maxZScore >= 0 ? '+' : ''}${predictiveReport.maxZScore.toFixed(2)}σ`
                    : 'N/A'}
                </div>
              </div>

              <div>
                <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                  통계적 이상치 (Z ≥ 2.0σ)
                </div>
                <div
                  className={`font-bold mt-0.5 ${
                    predictiveReport.outlierZCount > 0
                      ? 'text-red-600 dark:text-red-400'
                      : predictiveReport.elevatedZCount > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {predictiveReport.elevatedZCount}블록 (≥3σ: {predictiveReport.outlierZCount})
                </div>
              </div>

              <div>
                <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                  연속 ≥100ms 물리 구간
                </div>
                <div
                  className={`font-bold mt-0.5 ${
                    predictiveReport.contiguousZones.length > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {predictiveReport.contiguousZones.length > 0
                    ? `${predictiveReport.contiguousZones.length}개 구간 (최장 ${predictiveReport.longestContiguousRun}연속)`
                    : '없음 (연속 ≥3블록 미검출)'}
                </div>
              </div>
            </div>

            {predictiveReport.contiguousZones.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200/80 dark:border-red-900/50 space-y-1.5">
                <div className="text-[11px] font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    연속 물리 LBA 범위에서 100ms 초과 지연 지속 — Error Log Stream에 선제적 Degradation Warning이 기록되었습니다.
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {predictiveReport.contiguousZones.map(zone => (
                    <button
                      key={zone.warningKey}
                      type="button"
                      onClick={() => onSelectBlock && onSelectBlock(zone.firstBlock)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-orange-300 dark:border-red-800 bg-white dark:bg-slate-900 hover:bg-orange-100/70 dark:hover:bg-red-950/50 text-[10px] font-mono tabular-nums text-slate-800 dark:text-slate-200 cursor-pointer transition-colors"
                      title="클릭하여 해당 연속 열화 시작 LBA 블록으로 이동"
                    >
                      <Crosshair className="w-3 h-3 text-red-500 shrink-0" />
                      <span className="font-bold text-red-600 dark:text-red-400">
                        LBA #{zone.startLba.toLocaleString()}~#{zone.endLba.toLocaleString()}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        ({zone.blockCount}연속 · avg {zone.meanLatencyMs.toFixed(1)}ms · Z={zone.maxZScore.toFixed(2)}σ)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clicked Bin Drilldown: Specific LBA List */}
          {selectedBucket && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-slate-50/70 dark:bg-slate-950/60">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span>선택 구간 상세 LBA 목록: {selectedBucket.subLabel}</span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    ({selectedBucket.count}개 블록 중 상위 {sortedSelectedBlocks.length}개)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBucketId(null)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  닫기
                </button>
              </div>

              {sortedSelectedBlocks.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-slate-500">
                  해당 지연 구간에 속한 섹터 블록이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono tabular-nums">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-3 py-1.5">Block ID</th>
                        <th className="px-3 py-1.5">시작 LBA</th>
                        <th className="px-3 py-1.5 text-right">응답 지연</th>
                        <th className="px-3 py-1.5 text-right">Z-Score</th>
                        <th className="px-3 py-1.5 text-right">읽기 속도</th>
                        <th className="px-3 py-1.5">존 / 오류 코드</th>
                        <th className="px-3 py-1.5 text-right">추적</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                      {sortedSelectedBlocks.map(b => {
                        const zVal = predictiveReport.zScoreByBlockId[b.id];
                        return (
                        <tr key={b.id} className="hover:bg-slate-100/70 dark:hover:bg-slate-900/50">
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">#{b.id}</td>
                          <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100 font-semibold">
                            {b.lba.toLocaleString()}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-semibold ${
                            b.status === 'bad' || b.responseTimeMs >= criticalThresholdMs
                              ? 'text-red-600 dark:text-red-400'
                              : b.responseTimeMs >= slowHighlightThresholdMs
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {b.status === 'bad' ? 'TIMEOUT' : `${b.responseTimeMs.toFixed(decimalDigits)} ms`}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-semibold ${
                            typeof zVal === 'number' && zVal >= 3
                              ? 'text-red-600 dark:text-red-400'
                              : typeof zVal === 'number' && zVal >= 2
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            {typeof zVal === 'number'
                              ? `${zVal >= 0 ? '+' : ''}${zVal.toFixed(2)}σ`
                              : b.status === 'bad'
                              ? 'OUTLIER'
                              : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300">
                            {typeof b.throughputMbSec === 'number' && b.throughputMbSec > 0
                              ? `${b.throughputMbSec.toFixed(1)} MB/s`
                              : b.status === 'bad'
                              ? '0.0 MB/s'
                              : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-sans">
                            {b.errorCode || b.zoneTag || 'Normal Zone'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {onSelectBlock && (
                              <button
                                type="button"
                                onClick={() => onSelectBlock(b)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-sans font-semibold cursor-pointer"
                              >
                                <Crosshair className="w-3 h-3" />
                                블록 선택
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
