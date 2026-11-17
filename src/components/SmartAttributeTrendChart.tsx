import React, { useMemo, useRef, useState } from 'react';
import { DiskDrive, DriveSmartAttribute, SavedScanRecord } from '../types';
import {
  TrendingUp,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Play,
  Info,
  Activity
} from 'lucide-react';

interface SmartAttributeTrendChartProps {
  drive: DiskDrive;
  scanRecords: SavedScanRecord[];
  onStartScan?: () => void;
}

type ValueMode = 'raw' | 'normalized';

interface TrackedAttributeConfig {
  id: number;
  hexId: string;
  name: string;
  nameKo: string;
  color: string;
  dotBgClass: string;
  textClass: string;
  markerShape: 'circle' | 'diamond' | 'square' | 'triangle';
  defaultActive: boolean;
  nameMatchers: RegExp;
}

const TRACKED_ATTRIBUTES: TrackedAttributeConfig[] = [
  {
    id: 5,
    hexId: '05',
    name: 'Reallocated Sector Count',
    nameKo: '치환 섹터 수',
    color: '#F59E0B',
    dotBgClass: 'bg-amber-500',
    textClass: 'text-amber-500',
    markerShape: 'circle',
    defaultActive: true,
    nameMatchers: /reallocated\s*sector/i
  },
  {
    id: 197,
    hexId: 'C5',
    name: 'Current Pending Sector Count',
    nameKo: '보류 섹터 수',
    color: '#EF4444',
    dotBgClass: 'bg-red-500',
    textClass: 'text-red-500',
    markerShape: 'diamond',
    defaultActive: true,
    nameMatchers: /current\s*pending|pending\s*sector/i
  },
  {
    id: 198,
    hexId: 'C6',
    name: 'Uncorrectable Sector Count',
    nameKo: '복구 불가 섹터',
    color: '#8B5CF6',
    dotBgClass: 'bg-violet-500',
    textClass: 'text-violet-500',
    markerShape: 'square',
    defaultActive: false,
    nameMatchers: /uncorrectable\s*sector|offline\s*uncorrectable/i
  },
  {
    id: 187,
    hexId: 'BB',
    name: 'Reported Uncorrectable Errors',
    nameKo: '보고된 복구 불가 오류',
    color: '#06B6D4',
    dotBgClass: 'bg-cyan-500',
    textClass: 'text-cyan-500',
    markerShape: 'triangle',
    defaultActive: false,
    nameMatchers: /reported\s*uncorrectable/i
  },
  {
    id: 10,
    hexId: '0A',
    name: 'Spin Retry Count',
    nameKo: '스핀 재시도 횟수',
    color: '#EC4899',
    dotBgClass: 'bg-pink-500',
    textClass: 'text-pink-500',
    markerShape: 'circle',
    defaultActive: false,
    nameMatchers: /spin\s*retry/i
  }
];

interface SessionPoint {
  key: string;
  label: string;
  shortDate: string;
  fullDate: string;
  timestamp: number;
  isLive: boolean;
  scanMode?: 'quick' | 'full';
  healthScore: number | null;
  badCount: number | null;
  attributes: DriveSmartAttribute[];
}

interface SeriesAnalysis {
  config: TrackedAttributeConfig;
  values: (number | null)[];
  rawValues: (number | null)[];
  normalizedValues: (number | null)[];
  thresholds: (number | null)[];
  latestValue: number | null;
  firstValue: number | null;
  delta: number | null;
  slopePerSession: number | null;
  intercept: number | null;
  projectedNext1: number | null;
  projectedNext2: number | null;
  latestThreshold: number | null;
}

const GENERIC_SERIALS = new Set(['', 'N/A', 'UNKNOWN', 'NONE', '00000000']);

function normalizeSerial(serial?: string | null): string {
  return (serial || '').trim().toUpperCase();
}

export function parseSmartRawCount(attr?: DriveSmartAttribute): number | null {
  if (!attr) return null;
  const rawStr = String(attr.raw ?? '').trim();

  if (rawStr) {
    const hexMatch = rawStr.match(/^0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      const parsedHex = parseInt(hexMatch[1], 16);
      if (Number.isFinite(parsedHex)) return parsedHex;
    }

    const headToken = rawStr.split(/[(/:\s]/)[0]?.replace(/,/g, '') ?? '';
    if (/^-?\d+$/.test(headToken)) {
      const parsedDec = Number(headToken);
      if (Number.isFinite(parsedDec)) return Math.max(0, parsedDec);
    }
  }

  if (attr.rawHex) {
    const cleanHex = attr.rawHex.trim().replace(/^0x/i, '');
    if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
      const parsed = parseInt(cleanHex, 16);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function findMatchingAttr(
  attributes: DriveSmartAttribute[],
  config: TrackedAttributeConfig
): DriveSmartAttribute | undefined {
  return attributes.find(
    a => a.id === config.id || config.nameMatchers.test(a.name)
  );
}

function formatShortTimestamp(ts: number, fallbackDate?: string): string {
  if (Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  }
  return fallbackDate || '-';
}

function computeLinearRegression(
  points: Array<{ x: number; y: number }>
): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const pt of points) {
    sumX += pt.x;
    sumY += pt.y;
    sumXY += pt.x * pt.y;
    sumXX += pt.x * pt.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function renderMarkerShape(
  shape: TrackedAttributeConfig['markerShape'],
  cx: number,
  cy: number,
  color: string,
  size: number,
  isLive: boolean,
  isHovered: boolean
) {
  const r = isHovered ? size + 1.5 : size;
  const fill = isLive ? '#FFFFFF' : color;
  const stroke = isLive ? color : '#FFFFFF';
  const strokeWidth = isLive ? 2 : 1.5;

  if (shape === 'diamond') {
    const d = `M ${cx} ${cy - r - 0.5} L ${cx + r + 0.5} ${cy} L ${cx} ${cy + r + 0.5} L ${cx - r - 0.5} ${cy} Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (shape === 'square') {
    return (
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        rx={1}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (shape === 'triangle') {
    const h = r * 1.15;
    const d = `M ${cx} ${cy - h} L ${cx + r} ${cy + h * 0.85} L ${cx - r} ${cy + h * 0.85} Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export const SmartAttributeTrendChart: React.FC<SmartAttributeTrendChartProps> = ({
  drive,
  scanRecords,
  onStartScan
}) => {
  const [valueMode, setValueMode] = useState<ValueMode>('raw');
  const [showTrendline, setShowTrendline] = useState<boolean>(true);
  const [includeLiveSnapshot, setIncludeLiveSnapshot] = useState<boolean>(true);
  const [activeIds, setActiveIds] = useState<number[]>(() =>
    TRACKED_ATTRIBUTES.filter(a => a.defaultActive).map(a => a.id)
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Match scan records belonging to this physical drive
  const driveSessions = useMemo(() => {
    const activeSerial = normalizeSerial(drive.serialNumber);
    const hasIdentifyingSerial = !GENERIC_SERIALS.has(activeSerial);

    const matched = scanRecords.filter(rec => {
      const recSerial = normalizeSerial(rec.driveSerial);
      if (hasIdentifyingSerial && !GENERIC_SERIALS.has(recSerial)) {
        return recSerial === activeSerial;
      }
      return rec.driveId === drive.id && rec.driveModel === drive.model;
    });

    return [...matched].sort((a, b) => a.timestamp - b.timestamp);
  }, [scanRecords, drive.id, drive.model, drive.serialNumber]);

  const hasLiveSmart = drive.smartAttributes.length > 0;

  // Build chronological timeline points
  const timelinePoints: SessionPoint[] = useMemo(() => {
    const points: SessionPoint[] = driveSessions.map((rec, idx) => ({
      key: rec.id,
      label: `#${idx + 1}`,
      shortDate: formatShortTimestamp(rec.timestamp, rec.date),
      fullDate: rec.date,
      timestamp: rec.timestamp,
      isLive: false,
      scanMode: rec.scanMode,
      healthScore: rec.healthScore,
      badCount: rec.badCount,
      attributes: Array.isArray(rec.smartSnapshot) ? rec.smartSnapshot : []
    }));

    if (driveSessions.length > 0 && includeLiveSnapshot && hasLiveSmart) {
      const now = Date.now();
      points.push({
        key: `live-${drive.id}`,
        label: '현재',
        shortDate: 'Live',
        fullDate: '현재 라이브 커널 S.M.A.R.T. 측정값',
        timestamp: now,
        isLive: true,
        healthScore: drive.healthScore,
        badCount: null,
        attributes: drive.smartAttributes
      });
    }

    return points;
  }, [driveSessions, includeLiveSnapshot, hasLiveSmart, drive.id, drive.healthScore, drive.smartAttributes]);

  // Determine which tracked attributes actually exist in either historical snapshots or live SMART
  const availableAttributes = useMemo(() => {
    return TRACKED_ATTRIBUTES.filter(cfg => {
      if (cfg.id === 5 || cfg.id === 197) return true;
      const inHistory = timelinePoints.some(pt => !!findMatchingAttr(pt.attributes, cfg));
      const inLive = !!findMatchingAttr(drive.smartAttributes, cfg);
      return inHistory || inLive || cfg.id === 198;
    });
  }, [timelinePoints, drive.smartAttributes]);

  const seriesAnalyses: SeriesAnalysis[] = useMemo(() => {
    return availableAttributes.map(config => {
      const rawValues: (number | null)[] = [];
      const normalizedValues: (number | null)[] = [];
      const thresholds: (number | null)[] = [];

      timelinePoints.forEach(pt => {
        const attr = findMatchingAttr(pt.attributes, config);
        if (!attr) {
          rawValues.push(null);
          normalizedValues.push(null);
          thresholds.push(null);
        } else {
          rawValues.push(parseSmartRawCount(attr));
          normalizedValues.push(Number.isFinite(attr.current) ? attr.current : null);
          thresholds.push(Number.isFinite(attr.threshold) && attr.threshold > 0 ? attr.threshold : null);
        }
      });

      const values = valueMode === 'raw' ? rawValues : normalizedValues;
      const validPairs = values
        .map((v, idx) => (v !== null ? { x: idx, y: v } : null))
        .filter((p): p is { x: number; y: number } => p !== null);

      const firstValue = validPairs.length > 0 ? validPairs[0].y : null;
      const latestValue = validPairs.length > 0 ? validPairs[validPairs.length - 1].y : null;
      const delta = firstValue !== null && latestValue !== null ? Number((latestValue - firstValue).toFixed(2)) : null;

      const reg = computeLinearRegression(validPairs);
      const n = timelinePoints.length;
      const clampVal = (v: number) =>
        valueMode === 'raw' ? Math.max(0, Number(v.toFixed(1))) : Math.min(100, Math.max(0, Number(v.toFixed(1))));

      const projectedNext1 = reg ? clampVal(reg.intercept + reg.slope * n) : null;
      const projectedNext2 = reg ? clampVal(reg.intercept + reg.slope * (n + 1)) : null;

      const validThresholds = thresholds.filter((t): t is number => t !== null);
      const latestThreshold = validThresholds.length > 0 ? validThresholds[validThresholds.length - 1] : null;

      return {
        config,
        values,
        rawValues,
        normalizedValues,
        thresholds,
        latestValue,
        firstValue,
        delta,
        slopePerSession: reg ? Number(reg.slope.toFixed(2)) : null,
        intercept: reg ? reg.intercept : null,
        projectedNext1,
        projectedNext2,
        latestThreshold
      };
    });
  }, [availableAttributes, timelinePoints, valueMode]);

  const activeSeries = useMemo(
    () => seriesAnalyses.filter(s => activeIds.includes(s.config.id)),
    [seriesAnalyses, activeIds]
  );

  const hasAnyPlottableData = useMemo(
    () => seriesAnalyses.some(s => s.values.some(v => v !== null)),
    [seriesAnalyses]
  );

  // Live attribute summary for empty state / baseline display
  const liveKeySummary = useMemo(() => {
    return [5, 197, 198].map(id => {
      const cfg = TRACKED_ATTRIBUTES.find(t => t.id === id)!;
      const attr = findMatchingAttr(drive.smartAttributes, cfg);
      return {
        cfg,
        attr,
        raw: parseSmartRawCount(attr)
      };
    });
  }, [drive.smartAttributes]);

  const toggleSeries = (id: number) => {
    setActiveIds(prev => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter(item => item !== id) : prev;
      }
      return [...prev, id];
    });
  };

  // Overall Failure Trend Verdict
  const trendVerdict = useMemo(() => {
    const s05 = seriesAnalyses.find(s => s.config.id === 5);
    const sC5 = seriesAnalyses.find(s => s.config.id === 197);
    const sC6 = seriesAnalyses.find(s => s.config.id === 198);

    const latest05 = s05?.rawValues.filter((v): v is number => v !== null).slice(-1)[0] ?? 0;
    const latestC5 = sC5?.rawValues.filter((v): v is number => v !== null).slice(-1)[0] ?? 0;
    const latestC6 = sC6?.rawValues.filter((v): v is number => v !== null).slice(-1)[0] ?? 0;

    // Calculate raw slopes specifically for accurate failure prediction regardless of display mode
    const rawSlope = (s?: SeriesAnalysis) => {
      if (!s) return 0;
      const pts = s.rawValues
        .map((v, i) => (v !== null ? { x: i, y: v } : null))
        .filter((p): p is { x: number; y: number } => p !== null);
      return computeLinearRegression(pts)?.slope ?? 0;
    };

    const slope05 = rawSlope(s05);
    const slopeC5 = rawSlope(sC5);
    const slopeC6 = rawSlope(sC6);

    const normBreachRisk = seriesAnalyses.some(s => {
      const latestNorm = s.normalizedValues.filter((v): v is number => v !== null).slice(-1)[0];
      return latestNorm !== undefined && s.latestThreshold !== null && latestNorm <= s.latestThreshold + 5;
    });

    if (
      normBreachRisk ||
      latestC5 > 0 && slopeC5 > 0 ||
      latestC6 > 0 && slopeC6 > 0 ||
      slope05 >= 2 ||
      latest05 >= 16 ||
      latestC5 >= 8
    ) {
      return {
        level: 'critical' as const,
        label: '고장 위험 추세 감지',
        detail: '보류(C5) 또는 치환(05) 섹터가 지속 증가하고 있습니다. 즉시 데이터를 백업하고 드라이브 교체를 준비하십시오.',
        badgeClass: 'text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30',
        iconColor: 'text-red-500'
      };
    }

    if (latest05 > 0 || latestC5 > 0 || latestC6 > 0 || slope05 > 0 || slopeC5 > 0) {
      return {
        level: 'warning' as const,
        label: '열화 주의 관찰',
        detail: '손상/재할당 섹터 이력이 존재합니다. 향후 스캔에서 증가 기울기가 가팔라지는지 추적하십시오.',
        badgeClass: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30',
        iconColor: 'text-amber-500'
      };
    }

    return {
      level: 'nominal' as const,
      label: '안정 추세',
      detail: '추적 중인 치환(05)·보류(C5) 섹터 증가 징후 없이 안정 상태를 유지하고 있습니다.',
      badgeClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
      iconColor: 'text-emerald-500'
    };
  }, [seriesAnalyses]);

  // SVG Chart Geometry
  const chartWidth = 840;
  const chartHeight = 245;
  const padding = { top: 24, right: 32, bottom: 42, left: 54 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const canProject = showTrendline && timelinePoints.length >= 2;
  const forecastSteps = canProject ? 2 : 0;
  const totalSlots = Math.max(1, timelinePoints.length + forecastSteps - 1);

  const getX = (index: number) => {
    if (timelinePoints.length === 1 && !canProject) {
      return padding.left + innerWidth / 2;
    }
    return padding.left + (index / totalSlots) * innerWidth;
  };

  // Compute Y scale across active series & optional projections
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (valueMode === 'normalized') {
      return {
        yMin: 0,
        yMax: 100,
        yTicks: [0, 25, 50, 75, 100]
      };
    }

    const allNums: number[] = [];
    activeSeries.forEach(s => {
      s.values.forEach(v => {
        if (v !== null) allNums.push(v);
      });
      if (canProject) {
        if (s.projectedNext1 !== null) allNums.push(s.projectedNext1);
        if (s.projectedNext2 !== null) allNums.push(s.projectedNext2);
      }
    });

    const rawMax = allNums.length > 0 ? Math.max(...allNums) : 0;
    const computedMax = rawMax <= 4 ? 5 : Math.ceil(rawMax * 1.2);
    const step = Math.max(1, Math.ceil(computedMax / 4));
    const roundedMax = step * 4;
    const ticks = [0, step, step * 2, step * 3, roundedMax];

    return {
      yMin: 0,
      yMax: roundedMax,
      yTicks: ticks
    };
  }, [valueMode, activeSeries, canProject]);

  const getY = (val: number) => {
    const ratio = (val - yMin) / Math.max(1, yMax - yMin);
    return padding.top + innerHeight - Math.max(0, Math.min(1, ratio)) * innerHeight;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || timelinePoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * chartWidth;

    let closestIdx = 0;
    let minDiff = Infinity;
    timelinePoints.forEach((_, idx) => {
      const diff = Math.abs(getX(idx) - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const hoveredPoint = hoverIndex !== null ? timelinePoints[hoverIndex] : null;
  const labelStride = timelinePoints.length > 10 ? Math.ceil(timelinePoints.length / 8) : 1;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              S.M.A.R.T. 주요 속성 이력 추이 및 고장 예측
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>{drive.model}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">누적 스캔 {driveSessions.length}회</span>
            <span aria-hidden="true">·</span>
            <span>05h 치환 / C5h 보류 섹터 변화 추적</span>
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setValueMode('raw')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                valueMode === 'raw'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              원시 카운트 (Raw)
            </button>
            <button
              type="button"
              onClick={() => setValueMode('normalized')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                valueMode === 'normalized'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              정규화 점수 (Current)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTrendline(prev => !prev)}
            aria-pressed={showTrendline}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              showTrendline
                ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            추세선 예측 {showTrendline ? 'ON' : 'OFF'}
          </button>

          {driveSessions.length > 0 && hasLiveSmart && (
            <button
              type="button"
              onClick={() => setIncludeLiveSnapshot(prev => !prev)}
              aria-pressed={includeLiveSnapshot}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                includeLiveSnapshot
                  ? 'bg-slate-800 dark:bg-slate-200 border-slate-800 dark:border-slate-200 text-white dark:text-slate-900'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              현재 값 포함
            </button>
          )}
        </div>
      </div>

      {/* Empty State: No Scan Sessions Recorded Yet */}
      {driveSessions.length === 0 ? (
        <div className="p-5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>저장된 이전 스캔 세션 이력이 없습니다</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                표면 검사를 완료할 때마다 해당 드라이브의 S.M.A.R.T. 스냅샷이 자동 기록되어 05h·C5h 섹터 증가 추이와 고장 예측 곡선을 표시합니다.
              </p>
            </div>
            {onStartScan && (
              <button
                type="button"
                onClick={onStartScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
              >
                <Play className="w-3.5 h-3.5" />
                <span>표면 검사 시작</span>
              </button>
            )}
          </div>

          {hasLiveSmart && (
            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">현재 실시간 기준값:</span>
              {liveKeySummary.map(({ cfg, attr, raw }) => (
                <div key={cfg.id} className="flex items-center gap-1.5 font-mono tabular-nums">
                  <span
                    className={`w-2 h-2 rounded-xs shrink-0 ${cfg.dotBgClass}`}
                  />
                  <span className="text-slate-600 dark:text-slate-300">{cfg.hexId}h {cfg.nameKo}:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {raw !== null ? raw.toLocaleString() : 'N/A'}
                  </span>
                  {attr && (
                    <span className="text-slate-400">
                      (점수 {attr.current}/{attr.threshold})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !hasAnyPlottableData ? (
        /* Sessions exist, but snapshots lack ATA 05/C5/C6 attributes (e.g. NVMe or limited USB bridge) */
        <div className="p-5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Info className="w-4 h-4 text-slate-400" />
            <span>이 드라이브의 스캔 스냅샷에 05h / C5h S.M.A.R.T. 속성이 없습니다</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            NVMe 전용 컨트롤러 또는 S.M.A.R.T. 패스스루를 지원하지 않는 USB 브릿지 장치에서는 ATA 재할당/보류 섹터 속성(05h, C5h)이 보고되지 않습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Interactive Series Filter & Delta Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {seriesAnalyses.map(series => {
              const isActive = activeIds.includes(series.config.id);
              const hasData = series.values.some(v => v !== null);
              return (
                <button
                  key={series.config.id}
                  type="button"
                  disabled={!hasData}
                  onClick={() => toggleSeries(series.config.id)}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                    {renderMarkerShape(
                      series.config.markerShape,
                      5,
                      5,
                      isActive ? series.config.color : '#94A3B8',
                      3.5,
                      false,
                      false
                    )}
                  </svg>
                  <span className="font-mono font-bold">{series.config.hexId}h</span>
                  <span>{series.config.nameKo}</span>
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {series.latestValue !== null ? series.latestValue.toLocaleString() : 'N/A'}
                  </span>
                  {series.delta !== null && series.values.filter(v => v !== null).length >= 2 && (
                    <span
                      className={`font-mono tabular-nums text-[10px] ${
                        valueMode === 'raw'
                          ? series.delta > 0
                            ? 'text-red-500'
                            : series.delta < 0
                            ? 'text-emerald-500'
                            : 'text-slate-400'
                          : series.delta < 0
                          ? 'text-red-500'
                          : series.delta > 0
                          ? 'text-emerald-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {series.delta > 0 ? `+${series.delta}` : series.delta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SVG Line Chart Canvas */}
          <div className="relative w-full overflow-hidden select-none bg-slate-50/70 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 sm:p-2">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-52 sm:h-60 cursor-crosshair overflow-visible"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Forecast projection shading zone */}
              {canProject && (
                <g>
                  <rect
                    x={getX(timelinePoints.length - 1)}
                    y={padding.top}
                    width={Math.max(0, getX(totalSlots) - getX(timelinePoints.length - 1))}
                    height={innerHeight}
                    className="fill-indigo-500/5 dark:fill-indigo-400/5"
                  />
                  <line
                    x1={getX(timelinePoints.length - 1)}
                    y1={padding.top}
                    x2={getX(timelinePoints.length - 1)}
                    y2={padding.top + innerHeight}
                    stroke="#6366F1"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    strokeOpacity="0.45"
                  />
                  <text
                    x={getX(totalSlots) - 4}
                    y={padding.top + 11}
                    textAnchor="end"
                    className="fill-indigo-500/80 dark:fill-indigo-400/80 text-[9px] font-mono"
                  >
                    예측 구간 (+2회)
                  </text>
                </g>
              )}

              {/* Horizontal Grid Lines & Y-axis Labels */}
              {yTicks.map(tick => {
                const y = getY(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + innerWidth}
                      y2={y}
                      stroke="#94A3B8"
                      strokeWidth="0.6"
                      strokeOpacity="0.28"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {tick.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Threshold Reference Line in Normalized Mode */}
              {valueMode === 'normalized' &&
                activeSeries.map(series => {
                  if (series.latestThreshold === null) return null;
                  const ty = getY(series.latestThreshold);
                  return (
                    <g key={`thresh-${series.config.id}`}>
                      <line
                        x1={padding.left}
                        y1={ty}
                        x2={padding.left + innerWidth}
                        y2={ty}
                        stroke={series.config.color}
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        strokeOpacity="0.7"
                      />
                      <text
                        x={padding.left + 6}
                        y={ty - 4}
                        className="text-[9px] font-mono font-semibold"
                        fill={series.config.color}
                      >
                        {series.config.hexId}h 임계치 ({series.latestThreshold})
                      </text>
                    </g>
                  );
                })}

              {/* Regression Trend Projection Lines */}
              {canProject &&
                activeSeries.map(series => {
                  const lastValidIdx = series.values.reduce(
                    (acc: number, v, i) => (v !== null ? i : acc),
                    -1
                  );
                  if (
                    lastValidIdx < 1 ||
                    series.slopePerSession === null ||
                    series.intercept === null ||
                    series.projectedNext2 === null
                  ) {
                    return null;
                  }
                  const startYVal = series.values[lastValidIdx]!;
                  const x1 = getX(lastValidIdx);
                  const y1 = getY(startYVal);
                  const x2 = getX(totalSlots);
                  const y2 = getY(series.projectedNext2);

                  return (
                    <g key={`proj-${series.config.id}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={series.config.color}
                        strokeWidth="1.75"
                        strokeDasharray="5 4"
                        strokeOpacity="0.65"
                      />
                      <circle
                        cx={x2}
                        cy={y2}
                        r="3"
                        fill="none"
                        stroke={series.config.color}
                        strokeWidth="1.5"
                        strokeOpacity="0.75"
                      />
                    </g>
                  );
                })}

              {/* Series Lines & Markers */}
              {activeSeries.map(series => {
                const segments: string[] = [];
                let currentPath: string[] = [];

                series.values.forEach((v, idx) => {
                  if (v !== null) {
                    currentPath.push(`${getX(idx)},${getY(v)}`);
                  } else if (currentPath.length > 0) {
                    if (currentPath.length > 1) segments.push(currentPath.join(' '));
                    currentPath = [];
                  }
                });
                if (currentPath.length > 1) segments.push(currentPath.join(' '));

                return (
                  <g key={`series-${series.config.id}`}>
                    {segments.map((pts, segIdx) => (
                      <polyline
                        key={segIdx}
                        points={pts}
                        fill="none"
                        stroke={series.config.color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}

                    {series.values.map((v, idx) => {
                      if (v === null) return null;
                      const pt = timelinePoints[idx];
                      return (
                        <g key={`${series.config.id}-${pt.key}`}>
                          {renderMarkerShape(
                            series.config.markerShape,
                            getX(idx),
                            getY(v),
                            series.config.color,
                            4,
                            pt.isLive,
                            hoverIndex === idx
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Hover Crosshair */}
              {hoverIndex !== null && hoveredPoint && (
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={padding.top + innerHeight}
                  stroke="#6366F1"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              )}

              {/* X-Axis Session Ticks */}
              {timelinePoints.map((pt, idx) => {
                const showTick =
                  idx === 0 ||
                  idx === timelinePoints.length - 1 ||
                  idx % labelStride === 0;
                const x = getX(idx);
                return (
                  <g key={`xtick-${pt.key}`}>
                    <line
                      x1={x}
                      y1={padding.top + innerHeight}
                      x2={x}
                      y2={padding.top + innerHeight + 4}
                      stroke="#94A3B8"
                      strokeWidth="1"
                    />
                    {showTick && (
                      <>
                        <text
                          x={x}
                          y={padding.top + innerHeight + 16}
                          textAnchor="middle"
                          className="fill-slate-600 dark:fill-slate-300 text-[10px] font-mono font-semibold"
                        >
                          {pt.label}
                        </text>
                        <text
                          x={x}
                          y={padding.top + innerHeight + 28}
                          textAnchor="middle"
                          className="fill-slate-400 dark:fill-slate-500 text-[9px] font-mono"
                        >
                          {pt.shortDate}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Forecast X-Axis Labels */}
              {canProject &&
                [1, 2].map(step => {
                  const slotIdx = timelinePoints.length - 1 + step;
                  const x = getX(slotIdx);
                  return (
                    <g key={`forecast-x-${step}`}>
                      <line
                        x1={x}
                        y1={padding.top + innerHeight}
                        x2={x}
                        y2={padding.top + innerHeight + 4}
                        stroke="#818CF8"
                        strokeWidth="1"
                        strokeOpacity="0.6"
                      />
                      <text
                        x={x}
                        y={padding.top + innerHeight + 16}
                        textAnchor="middle"
                        className="fill-indigo-500/80 dark:fill-indigo-400/80 text-[10px] font-mono"
                      >
                        +{step}회
                      </text>
                    </g>
                  );
                })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && hoverIndex !== null && (
              <div
                className={`absolute top-2.5 pointer-events-none z-20 px-3 py-2 rounded-lg bg-slate-900/95 text-white border border-slate-700 shadow-xl text-[11px] font-mono space-y-1 min-w-[210px] ${
                  getX(hoverIndex) > chartWidth * 0.55 ? 'left-3' : 'right-3'
                }`}
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-1">
                  <span className="font-bold text-indigo-300">
                    {hoveredPoint.isLive ? '현재 라이브 측정' : `세션 ${hoveredPoint.label}`}
                  </span>
                  <span className="text-slate-300 text-[10px]">{hoveredPoint.shortDate}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pb-0.5">
                  <span>
                    {hoveredPoint.scanMode
                      ? hoveredPoint.scanMode === 'quick'
                        ? 'Quick Scan'
                        : 'Full Scan'
                      : 'Live Kernel'}
                  </span>
                  <span>
                    건강도 {hoveredPoint.healthScore !== null ? `${hoveredPoint.healthScore}%` : 'N/A'}
                    {hoveredPoint.badCount !== null ? ` · 배드 ${hoveredPoint.badCount}` : ''}
                  </span>
                </div>

                {activeSeries.map(series => {
                  const raw = series.rawValues[hoverIndex];
                  const norm = series.normalizedValues[hoverIndex];
                  const thresh = series.thresholds[hoverIndex];
                  return (
                    <div key={series.config.id} className="flex items-center justify-between gap-3 tabular-nums">
                      <span className="flex items-center gap-1.5 text-slate-200">
                        <span
                          className={`w-2 h-2 rounded-xs shrink-0 ${series.config.dotBgClass}`}
                        />
                        {series.config.hexId}h
                      </span>
                      <span className="font-semibold text-white">
                        Raw {raw !== null ? raw.toLocaleString() : 'N/A'}
                        <span className="text-slate-400 font-normal ml-1.5">
                          ({norm !== null ? norm : '-'}
                          {thresh !== null ? `/${thresh}` : ''})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Trend Assessment & Slope Summary Footer */}
          <div className="p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            <div className="flex items-start sm:items-center gap-2">
              {trendVerdict.level === 'critical' ? (
                <AlertOctagon className={`w-4 h-4 shrink-0 ${trendVerdict.iconColor}`} />
              ) : trendVerdict.level === 'warning' ? (
                <AlertTriangle className={`w-4 h-4 shrink-0 ${trendVerdict.iconColor}`} />
              ) : (
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${trendVerdict.iconColor}`} />
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={`font-bold ${trendVerdict.iconColor}`}>{trendVerdict.label}</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  {timelinePoints.length < 2
                    ? '추세 기울기 분석은 스캔 기록 2회 이상부터 제공됩니다.'
                    : trendVerdict.detail}
                </span>
              </div>
            </div>

            {timelinePoints.length >= 2 && (
              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 flex-wrap">
                {activeSeries
                  .filter(s => s.slopePerSession !== null)
                  .map(s => (
                    <span key={s.config.id} className="whitespace-nowrap">
                      <strong className={s.config.textClass}>{s.config.hexId}h</strong>{' '}
                      기울기 {s.slopePerSession! > 0 ? `+${s.slopePerSession}` : s.slopePerSession}/회
                      {canProject && s.projectedNext1 !== null ? ` → 예상 ${s.projectedNext1}` : ''}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
