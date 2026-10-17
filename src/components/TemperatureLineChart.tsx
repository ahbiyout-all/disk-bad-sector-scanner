import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DiskDrive } from '../types';
import { 
  Thermometer, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Flame, 
  ShieldCheck, 
  AlertTriangle, 
  Activity, 
  Info,
  Minus
} from 'lucide-react';

interface TemperaturePoint {
  timeOffsetSeconds: number; // -600 to 0 (where 0 is now)
  temperature: number;
  timestamp: number;
}

interface TemperatureLineChartProps {
  drive: DiskDrive;
  currentTemperature: number;
  isScanning?: boolean;
  isThermalStress?: boolean;
}

export const TemperatureLineChart: React.FC<TemperatureLineChartProps> = ({
  drive,
  currentTemperature,
  isScanning = false,
  isThermalStress = false
}) => {
  // 10 minutes = 600 seconds
  const WINDOW_SECONDS = 600;
  const SAMPLE_INTERVAL_SECONDS = 10;
  const TOTAL_POINTS = WINDOW_SECONDS / SAMPLE_INTERVAL_SECONDS; // 60 data points

  // Generate initial 10-minute history seeded around baseline temperature
  const [history, setHistory] = useState<TemperaturePoint[]>(() => {
    const points: TemperaturePoint[] = [];
    const now = Date.now();
    const baseTemp = Math.max(25, drive.temperatureC || 36);

    for (let i = TOTAL_POINTS; i >= 0; i--) {
      const offset = -(i * SAMPLE_INTERVAL_SECONDS);
      // Gentle curve ending at current temperature
      const progress = 1 - (i / TOTAL_POINTS); // 0 (10m ago) to 1 (now)
      const simulatedTemp = baseTemp + (currentTemperature - baseTemp) * progress + (Math.sin(i * 0.4) * 0.3);
      points.push({
        timeOffsetSeconds: offset,
        temperature: Number(simulatedTemp.toFixed(1)),
        timestamp: now + offset * 1000
      });
    }
    return points;
  });

  const lastDriveIdRef = useRef(drive.id);

  // Reset or reseed when drive changes
  useEffect(() => {
    if (lastDriveIdRef.current !== drive.id) {
      lastDriveIdRef.current = drive.id;
      const points: TemperaturePoint[] = [];
      const now = Date.now();
      const baseTemp = Math.max(25, drive.temperatureC || 36);

      for (let i = TOTAL_POINTS; i >= 0; i--) {
        const offset = -(i * SAMPLE_INTERVAL_SECONDS);
        const progress = 1 - (i / TOTAL_POINTS);
        const simulatedTemp = baseTemp + (currentTemperature - baseTemp) * progress + (Math.sin(i * 0.4) * 0.3);
        points.push({
          timeOffsetSeconds: offset,
          temperature: Number(simulatedTemp.toFixed(1)),
          timestamp: now + offset * 1000
        });
      }
      setHistory(points);
    }
  }, [drive.id, currentTemperature, TOTAL_POINTS]);

  // Append real-time temperature updates every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setHistory(prev => {
        const now = Date.now();
        // Shift time offsets backward by interval
        const updated = prev.map(p => ({
          ...p,
          timeOffsetSeconds: Math.round((p.timestamp - now) / 1000)
        })).filter(p => p.timeOffsetSeconds >= -WINDOW_SECONDS);

        // Add current live point
        updated.push({
          timeOffsetSeconds: 0,
          temperature: Number(currentTemperature.toFixed(1)),
          timestamp: now
        });

        return updated;
      });
    }, 4000);

    return () => clearInterval(timer);
  }, [currentTemperature, WINDOW_SECONDS]);

  // Statistics over the 10-minute window
  const stats = useMemo(() => {
    if (history.length === 0) {
      return { min: currentTemperature, max: currentTemperature, avg: currentTemperature, delta: 0 };
    }
    const temps = history.map(p => p.temperature);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const avg = Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1));
    const first = history[0]?.temperature || currentTemperature;
    const delta = Number((currentTemperature - first).toFixed(1));
    return { min, max, avg, delta };
  }, [history, currentTemperature]);

  // Thermal classification
  let thermalGrade = {
    title: '정상 동작 범위',
    colorText: 'text-emerald-500 dark:text-emerald-400',
    colorBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
    colorBadge: 'bg-emerald-500',
    gradientStart: '#10B981',
    gradientEnd: '#059669',
    advice: '스토리지 낸드 셀 및 메커니컬 모터가 최적 온도로 안정 작동 중입니다.'
  };

  if (currentTemperature >= 60) {
    thermalGrade = {
      title: '과열 한계 도달 (위험)',
      colorText: 'text-red-500 dark:text-red-400',
      colorBg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60',
      colorBadge: 'bg-red-500',
      gradientStart: '#EF4444',
      gradientEnd: '#B91C1C',
      advice: '60°C 초과 고열로 낸드 플래시 데이터 보존성 저하 및 서멀 스로틀링 발생 가능. 쿨링 권장.'
    };
  } else if (currentTemperature >= 52) {
    thermalGrade = {
      title: '고열 주의 구간',
      colorText: 'text-orange-500 dark:text-orange-400',
      colorBg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800/60',
      colorBadge: 'bg-orange-500',
      gradientStart: '#F97316',
      gradientEnd: '#EA580C',
      advice: '장시간 연속 부하로 온도가 상승 중입니다. 팬 속도 증가 또는 통풍 확보가 필요합니다.'
    };
  } else if (currentTemperature >= 45) {
    thermalGrade = {
      title: '온도 상승 구간 (관찰)',
      colorText: 'text-amber-500 dark:text-amber-400',
      colorBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60',
      colorBadge: 'bg-amber-500',
      gradientStart: '#F59E0B',
      gradientEnd: '#D97706',
      advice: '정상 작동 한계(45°C)에 근접하고 있습니다. 부하 지속 시 발열 추세를 점검하십시오.'
    };
  }

  // Hover Tooltip Interaction
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // SVG Chart Geometry
  const chartWidth = 840;
  const chartHeight = 220;
  const padding = { top: 25, right: 30, bottom: 35, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Y Scale bounds (dynamic with safe margin)
  const yMin = Math.min(25, Math.floor(stats.min - 3));
  const yMax = Math.max(68, Math.ceil(stats.max + 4));

  const getX = (timeOffset: number) => {
    // timeOffset is between -600 and 0
    const ratio = (timeOffset + WINDOW_SECONDS) / WINDOW_SECONDS;
    return padding.left + ratio * innerWidth;
  };

  const getY = (temp: number) => {
    const ratio = (temp - yMin) / (yMax - yMin);
    return padding.top + innerHeight - ratio * innerHeight;
  };

  // Generate SVG Path
  const pointsString = history.map(p => `${getX(p.timeOffsetSeconds)},${getY(p.temperature)}`).join(' ');
  const areaPath = history.length > 0
    ? `M ${getX(history[0].timeOffsetSeconds)},${padding.top + innerHeight} L ${history.map(p => `${getX(p.timeOffsetSeconds)},${getY(p.temperature)}`).join(' L ')} L ${getX(history[history.length - 1].timeOffsetSeconds)},${padding.top + innerHeight} Z`
    : '';

  // Reference lines Y positions
  const yOverheat60 = getY(60);
  const yCaution45 = getY(45);
  const yBase30 = getY(30);

  // Handle Mouse Over SVG
  const svgRef = useRef<SVGSVGElement>(null);
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || history.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * chartWidth;

    // Find closest point
    let closestIdx = 0;
    let minDiff = Infinity;
    history.forEach((p, idx) => {
      const px = getX(p.timeOffsetSeconds);
      const diff = Math.abs(px - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const hoveredPoint = hoverIndex !== null ? history[hoverIndex] : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs transition-colors">
      {/* Chart Top Header & Summary Pill Badges */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${thermalGrade.colorBg} shrink-0`}>
              <Thermometer className={`w-4 h-4 ${thermalGrade.colorText}`} />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>최근 10분간 디스크 온도 변화 추이</span>
                <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  실시간 롤링 그래프
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                연속 I/O 부하에 따른 드라이브 센서의 10분간 열화 및 온도 프로파일 분석
              </p>
            </div>
          </div>
        </div>

        {/* 4 Quick Stat Metric Cards */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Current Temp */}
          <div className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${thermalGrade.colorBg}`}>
            <Flame className={`w-3.5 h-3.5 ${thermalGrade.colorText} shrink-0 animate-pulse`} />
            <div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                현재 온도
              </div>
              <div className={`text-sm sm:text-base font-extrabold font-mono tracking-tight ${thermalGrade.colorText}`}>
                {currentTemperature.toFixed(1)}°C
              </div>
            </div>
          </div>

          {/* Min Temp */}
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                10분 최저
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
                {stats.min.toFixed(1)}°C
              </div>
            </div>
          </div>

          {/* Max Temp */}
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                10분 최고
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
                {stats.max.toFixed(1)}°C
              </div>
            </div>
          </div>

          {/* Average & Delta */}
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                평균 (변화량)
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
                {stats.avg.toFixed(1)}°C
                <span className={`text-[10px] ml-1 font-semibold ${
                  stats.delta > 0 ? 'text-rose-500' : stats.delta < 0 ? 'text-blue-500' : 'text-slate-400'
                }`}>
                  ({stats.delta > 0 ? `+${stats.delta}` : stats.delta}°C)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Interactive Line Chart Container */}
      <div className="relative w-full overflow-hidden select-none bg-slate-50/60 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800/80 p-1 sm:p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-48 sm:h-56 cursor-crosshair overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Linear Gradient Fill under the Curve */}
            <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={thermalGrade.gradientStart} stopOpacity="0.35" />
              <stop offset="60%" stopColor={thermalGrade.gradientEnd} stopOpacity="0.10" />
              <stop offset="100%" stopColor={thermalGrade.gradientEnd} stopOpacity="0.0" />
            </linearGradient>

            {/* Glowing Drop Shadow Filter for Active Line */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={thermalGrade.gradientStart} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Horizontal Grid & Threshold Guides */}
          {/* 60°C Critical Overheat Threshold */}
          {yOverheat60 >= padding.top && yOverheat60 <= padding.top + innerHeight && (
            <g className="transition-all">
              <line
                x1={padding.left}
                y1={yOverheat60}
                x2={padding.left + innerWidth}
                y2={yOverheat60}
                stroke="#EF4444"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                strokeOpacity="0.8"
              />
              <text
                x={padding.left + innerWidth - 6}
                y={yOverheat60 - 5}
                textAnchor="end"
                className="fill-red-500 dark:fill-red-400 text-[10px] font-mono font-bold"
              >
                60°C 과열 한계선 (Overheat)
              </text>
            </g>
          )}

          {/* 45°C Warning Caution Line */}
          {yCaution45 >= padding.top && yCaution45 <= padding.top + innerHeight && (
            <g className="transition-all">
              <line
                x1={padding.left}
                y1={yCaution45}
                x2={padding.left + innerWidth}
                y2={yCaution45}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="3 3"
                strokeOpacity="0.7"
              />
              <text
                x={padding.left + innerWidth - 6}
                y={yCaution45 - 5}
                textAnchor="end"
                className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono font-bold"
              >
                45°C 주의선 (Warning)
              </text>
            </g>
          )}

          {/* 30°C Baseline */}
          {yBase30 >= padding.top && yBase30 <= padding.top + innerHeight && (
            <g>
              <line
                x1={padding.left}
                y1={yBase30}
                x2={padding.left + innerWidth}
                y2={yBase30}
                stroke="#94A3B8"
                strokeWidth="0.8"
                strokeDasharray="2 2"
                strokeOpacity="0.3"
              />
              <text
                x={padding.left + innerWidth - 6}
                y={yBase30 - 4}
                textAnchor="end"
                className="fill-slate-400 text-[9px] font-mono"
              >
                30°C 상온 기저선
              </text>
            </g>
          )}

          {/* Y-Axis Temperature Labels */}
          {[yMin, 35, 45, 55, 65].filter(t => t >= yMin && t <= yMax).map(t => {
            const y = getY(t);
            return (
              <g key={t}>
                <line
                  x1={padding.left - 4}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="#CBD5E1"
                  className="dark:stroke-slate-800"
                  strokeWidth="0.5"
                  strokeOpacity="0.4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {t}°C
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#tempGradient)"
              className="transition-all duration-300"
            />
          )}

          {/* Main Temperature Polyline */}
          {history.length > 1 && (
            <polyline
              points={pointsString}
              fill="none"
              stroke={thermalGrade.gradientStart}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              className="transition-all duration-300"
            />
          )}

          {/* Real-time Pulsing Dot at Current Timestamp (0s, Right Edge) */}
          {history.length > 0 && (() => {
            const last = history[history.length - 1];
            const cx = getX(last.timeOffsetSeconds);
            const cy = getY(last.temperature);
            return (
              <g>
                <circle cx={cx} cy={cy} r="6" fill={thermalGrade.gradientStart} fillOpacity="0.3" className="animate-ping" />
                <circle cx={cx} cy={cy} r="4" fill={thermalGrade.gradientStart} stroke="#FFFFFF" strokeWidth="1.5" />
              </g>
            );
          })()}

          {/* Hover Crosshair & Tooltip Point */}
          {hoveredPoint && (
            <g>
              {/* Vertical Crosshair Line */}
              <line
                x1={getX(hoveredPoint.timeOffsetSeconds)}
                y1={padding.top}
                x2={getX(hoveredPoint.timeOffsetSeconds)}
                y2={padding.top + innerHeight}
                stroke="#6366F1"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              {/* Point Circle */}
              <circle
                cx={getX(hoveredPoint.timeOffsetSeconds)}
                cy={getY(hoveredPoint.temperature)}
                r="5"
                fill="#FFFFFF"
                stroke="#6366F1"
                strokeWidth="2.5"
              />
            </g>
          )}

          {/* X-Axis Ticks (-10m, -8m, -6m, -4m, -2m, Now) */}
          {[
            { offset: -600, label: '-10분' },
            { offset: -480, label: '-8분' },
            { offset: -360, label: '-6분' },
            { offset: -240, label: '-4분' },
            { offset: -120, label: '-2분' },
            { offset: 0, label: '현재 (Now)' },
          ].map(tick => {
            const x = getX(tick.offset);
            return (
              <g key={tick.offset}>
                <line
                  x1={x}
                  y1={padding.top + innerHeight}
                  x2={x}
                  y2={padding.top + innerHeight + 4}
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padding.top + innerHeight + 17}
                  textAnchor={tick.offset === 0 ? 'end' : tick.offset === -600 ? 'start' : 'middle'}
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono font-medium"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip HTML Overlay */}
        {hoveredPoint && (
          <div
            className="absolute top-3 left-1/2 transform -translate-x-1/2 pointer-events-none px-3 py-1.5 rounded-lg bg-slate-900/95 text-white border border-slate-700 shadow-xl backdrop-blur-xs text-xs flex items-center gap-3 font-mono animate-in fade-in duration-100"
          >
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {hoveredPoint.timeOffsetSeconds === 0
                  ? '현재 시각'
                  : `${Math.abs(Math.round(hoveredPoint.timeOffsetSeconds / 60))}분 ${Math.abs(hoveredPoint.timeOffsetSeconds % 60)}초 전`}
              </span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1.5 font-bold">
              <Thermometer className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-amber-300">{hoveredPoint.temperature.toFixed(1)}°C</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-sans ${
              hoveredPoint.temperature >= 60
                ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                : hoveredPoint.temperature >= 45
                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
            }`}>
              {hoveredPoint.temperature >= 60 ? '과열' : hoveredPoint.temperature >= 45 ? '주의' : '정상'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Health & Thermal Assessment Advisory Strip */}
      <div className={`mt-2.5 p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${thermalGrade.colorBg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${thermalGrade.colorBadge} shrink-0 animate-ping`} />
          <span className="font-bold">
            열 상태 진단: {thermalGrade.title}
          </span>
          <span className="text-[11px] text-slate-600 dark:text-slate-300">
            — {thermalGrade.advice}
          </span>
        </div>

        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2 shrink-0">
          <Info className="w-3.5 h-3.5" />
          <span>권장 보증 정격: 0°C ~ 45°C (초과 시 수명 감소)</span>
        </div>
      </div>
    </div>
  );
};
