import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { LbaTracePoint, SectorBlock, SurfaceTestType } from '../types';
import { Activity, Gauge } from 'lucide-react';

interface LbaGraphViewProps {
  trace: LbaTracePoint[];
  blocks: SectorBlock[];
  testType: SurfaceTestType;
  totalSectors: number;
  onSelectBlock?: (block: SectorBlock) => void;
}

function decimateTracePoints(points: LbaTracePoint[], metric: 'latency' | 'throughput', maxRendered = 380): LbaTracePoint[] {
  if (points.length <= maxRendered) return points;

  const bucketCount = 160;
  const bucketSize = points.length / bucketCount;
  const selectedIndices = new Set<number>([0, points.length - 1]);
  const severeAnomalyIndices: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(points.length, Math.floor((b + 1) * bucketSize));
    if (start >= end) continue;

    let minIdx = start;
    let maxIdx = start;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = start; i < end; i++) {
      const p = points[i];
      if (p.status === 'bad' || p.status === 'critical') {
        severeAnomalyIndices.push(i);
      }
      const val = metric === 'latency' ? (p.latencyMs < 0 ? 1e9 : p.latencyMs) : p.throughputMbSec;
      if (val < minVal) {
        minVal = val;
        minIdx = i;
      }
      if (val > maxVal) {
        maxVal = val;
        maxIdx = i;
      }
    }
    selectedIndices.add(minIdx);
    selectedIndices.add(maxIdx);
  }

  for (let i = 0; i < severeAnomalyIndices.length && selectedIndices.size < maxRendered; i++) {
    selectedIndices.add(severeAnomalyIndices[i]);
  }

  const ordered = Array.from(selectedIndices).sort((a, b) => a - b);
  return ordered.map(i => points[i]);
}

function findPointAtSeq(points: LbaTracePoint[], targetSeq: number): LbaTracePoint | undefined {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].seqIndex < targetSeq) lo = mid + 1;
    else hi = mid;
  }
  return points[lo];
}

export const LbaGraphView: React.FC<LbaGraphViewProps> = React.memo(({
  trace,
  blocks,
  testType,
  totalSectors,
  onSelectBlock
}) => {
  const [metric, setMetric] = useState<'latency' | 'throughput'>('latency');
  const [hoveredPoint, setHoveredPoint] = useState<LbaTracePoint | null>(null);

  const width = 760;
  const height = 210;
  const margin = { top: 14, right: 16, bottom: 26, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const validPoints = useMemo(() => {
    if (metric === 'latency') return trace;
    return trace.filter(p => p.throughputMbSec >= 0);
  }, [trace, metric]);

  const renderedPoints = useMemo(
    () => decimateTracePoints(validPoints, metric, 380),
    [validPoints, metric]
  );

  const blocksById = useMemo(() => {
    const map = new Map<number, SectorBlock>();
    for (let i = 0; i < blocks.length; i++) {
      map.set(blocks[i].id, blocks[i]);
    }
    return map;
  }, [blocks]);

  const { xScale, yScale, linePath, yMax } = useMemo(() => {
    const maxSeq = Math.max(10, validPoints.length > 0 ? validPoints[validPoints.length - 1].seqIndex : 10);
    const xS = d3.scaleLinear().domain([0, maxSeq]).range([0, innerW]);

    let rawMax = 0;
    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];
      const v =
        metric === 'latency'
          ? p.latencyMs < 0
            ? 600
            : p.latencyMs
          : p.throughputMbSec;
      if (v > rawMax) rawMax = v;
    }
    if (validPoints.length === 0) {
      rawMax = metric === 'latency' ? 120 : 250;
    }

    const computedMax =
      metric === 'latency'
        ? Math.max(25, Math.ceil(rawMax * 1.15))
        : Math.max(50, Math.ceil(rawMax * 1.15));

    const yS = d3.scaleLinear().domain([0, computedMax]).range([innerH, 0]).nice();

    const lineGen = d3
      .line<LbaTracePoint>()
      .x(d => xS(d.seqIndex))
      .y(d => {
        const val =
          metric === 'latency'
            ? d.latencyMs < 0
              ? computedMax
              : Math.min(computedMax, d.latencyMs)
            : d.throughputMbSec;
        return yS(val);
      });

    return {
      xScale: xS,
      yScale: yS,
      linePath: renderedPoints.length > 1 ? lineGen(renderedPoints) || '' : '',
      yMax: yS.domain()[1]
    };
  }, [validPoints, renderedPoints, metric, innerW, innerH]);

  const yTicks = useMemo(() => yScale.ticks(4), [yScale]);
  const xTicks = useMemo(() => xScale.ticks(5), [xScale]);

  const stats = useMemo(() => {
    let latSum = 0;
    let latCount = 0;
    let peakLatency = 0;
    let tpSum = 0;
    let tpCount = 0;

    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];
      if (p.latencyMs < 0) continue;
      latSum += p.latencyMs;
      latCount++;
      if (p.latencyMs > peakLatency) peakLatency = p.latencyMs;
      if (p.throughputMbSec > 0) {
        tpSum += p.throughputMbSec;
        tpCount++;
      }
    }

    if (latCount === 0) {
      return { avgLatency: 0, peakLatency: 0, avgThroughput: 0 };
    }
    return {
      avgLatency: Number((latSum / latCount).toFixed(2)),
      peakLatency: Number(peakLatency.toFixed(2)),
      avgThroughput: Number((tpCount > 0 ? tpSum / tpCount : 0).toFixed(1))
    };
  }, [validPoints]);

  const warn100Y = metric === 'latency' && yMax >= 100 ? yScale(100) : null;
  const crit500Y = metric === 'latency' && yMax >= 500 ? yScale(500) : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            실시간 LBA {metric === 'latency' ? '응답 지연' : '전송 대역폭'} 오실로스코프
          </span>
          {testType === 'butterfly' && (
            <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400">
              Butterfly 외곽↔내곽 교차
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
          <span className="text-slate-500 dark:text-slate-400">
            평균 <strong className="text-slate-900 dark:text-slate-100">{stats.avgLatency}ms</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            피크 <strong className={stats.peakLatency >= 100 ? 'text-orange-500' : 'text-slate-900 dark:text-slate-100'}>{stats.peakLatency}ms</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
            평균 속도 <strong className="text-emerald-600 dark:text-emerald-400">{stats.avgThroughput} MB/s</strong>
          </span>

          <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setMetric('latency')}
              className={`px-2 py-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                metric === 'latency'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Latency (ms)
            </button>
            <button
              type="button"
              onClick={() => setMetric('throughput')}
              className={`px-2 py-0.5 text-[10px] font-sans font-semibold cursor-pointer flex items-center gap-1 ${
                metric === 'throughput'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Gauge className="w-2.5 h-2.5" />
              MB/s
            </button>
          </div>
        </div>
      </div>

      <div className="relative w-full">
        {validPoints.length === 0 ? (
          <div className="h-[190px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-950/40 font-mono">
            검사 시작 시 실시간 LBA {metric === 'latency' ? 'Latency (ms)' : 'Throughput (MB/s)'} 파형이 플롯됩니다.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-[195px] overflow-visible select-none"
          >
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Horizontal Gridlines */}
              {yTicks.map(tick => (
                <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={0}
                    y2={0}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeDasharray="2,3"
                  />
                  <text
                    x={-8}
                    y={3}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {tick}
                  </text>
                </g>
              ))}

              {/* X Ticks */}
              {xTicks.map(tick => {
                const pt = findPointAtSeq(validPoints, tick);
                const label = pt ? `${((pt.blockId / Math.max(1, blocks.length - 1)) * 100).toFixed(0)}%` : String(tick);
                return (
                  <g key={tick} transform={`translate(${xScale(tick)}, ${innerH})`}>
                    <line y1={0} y2={4} className="stroke-slate-300 dark:stroke-slate-700" />
                    <text
                      y={15}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* 100ms & 500ms Threshold Reference Lines */}
              {warn100Y !== null && (
                <g>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={warn100Y}
                    y2={warn100Y}
                    className="stroke-amber-500/80"
                    strokeWidth={1}
                    strokeDasharray="4,3"
                  />
                  <text
                    x={innerW - 4}
                    y={warn100Y - 3}
                    textAnchor="end"
                    className="fill-amber-600 dark:fill-amber-400 text-[9px] font-mono font-bold"
                  >
                    100ms WARN
                  </text>
                </g>
              )}

              {crit500Y !== null && (
                <g>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={crit500Y}
                    y2={crit500Y}
                    className="stroke-red-500/80"
                    strokeWidth={1}
                    strokeDasharray="4,3"
                  />
                  <text
                    x={innerW - 4}
                    y={crit500Y - 3}
                    textAnchor="end"
                    className="fill-red-500 text-[9px] font-mono font-bold"
                  >
                    500ms CRIT
                  </text>
                </g>
              )}

              {/* Primary Trace Path */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  className={metric === 'latency' ? 'stroke-blue-500' : 'stroke-emerald-500'}
                  strokeWidth={1.5}
                />
              )}

              {/* Decimated Sample Points */}
              {renderedPoints.map(pt => {
                const cx = xScale(pt.seqIndex);
                const val =
                  metric === 'latency'
                    ? pt.latencyMs < 0
                      ? yMax
                      : Math.min(yMax, pt.latencyMs)
                    : pt.throughputMbSec;
                const cy = yScale(val);

                let fillClass = metric === 'latency' ? 'fill-blue-500' : 'fill-emerald-500';
                if (pt.status === 'bad') fillClass = 'fill-red-600';
                else if (pt.status === 'critical' || pt.latencyMs >= 150) fillClass = 'fill-orange-500';
                else if (pt.status === 'slow' || pt.latencyMs >= 100) fillClass = 'fill-amber-500';
                else if (pt.passSide === 'inner') fillClass = 'fill-sky-400';

                return (
                  <circle
                    key={`${pt.seqIndex}-${pt.blockId}`}
                    cx={cx}
                    cy={cy}
                    r={pt.status === 'bad' || pt.latencyMs >= 100 ? 3.5 : hoveredPoint?.seqIndex === pt.seqIndex ? 4 : 2}
                    className={`${fillClass} cursor-pointer transition-all`}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    onClick={() => {
                      const blk = blocksById.get(pt.blockId);
                      if (blk && onSelectBlock) onSelectBlock(blk);
                    }}
                  />
                );
              })}

              {/* Axes baseline */}
              <line x1={0} x2={0} y1={0} y2={innerH} className="stroke-slate-300 dark:stroke-slate-700" />
              <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="stroke-slate-300 dark:stroke-slate-700" />
            </g>
          </svg>
        )}

        {/* Compact Hover Telemetry Readout Bar */}
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {hoveredPoint ? (
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <span>BLK #{hoveredPoint.blockId}</span>
              <span>LBA {hoveredPoint.lba.toLocaleString()}</span>
              <span>
                {hoveredPoint.latencyMs < 0 ? 'ERR/BAD' : `${hoveredPoint.latencyMs}ms`}
              </span>
              <span>{hoveredPoint.throughputMbSec} MB/s</span>
              {hoveredPoint.passSide && hoveredPoint.passSide !== 'sequential' && (
                <span className="uppercase text-sky-600 dark:text-sky-400">{hoveredPoint.passSide}</span>
              )}
            </div>
          ) : (
            <span>포인트에 마우스를 올리거나 클릭하면 해당 LBA 섹터를 포커스합니다.</span>
          )}
          <span>Total Span: {totalSectors.toLocaleString()} LBA</span>
        </div>
      </div>
    </div>
  );
});
