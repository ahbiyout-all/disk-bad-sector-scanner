import React from 'react';
import {
  DiskDrive,
  ScanTelemetry,
  DriveSmartAttribute,
  SectorBlock,
  SpecializedScanMethodId,
  SmartSelfTestState,
  SmartSelfTestType
} from '../types';
import { calculateHardwareVitals } from '../utils/hardwareTelemetry';
import { detectVendor, getVendorProfile, getDriveMediaAnalysis, getTailoredActionMethods } from '../utils/vendorDiagnostics';
import { TemperatureLineChart } from './TemperatureLineChart';
import { LatencyHistogramDashboard } from './LatencyHistogramDashboard';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Thermometer,
  Clock,
  HardDrive,
  Cpu,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  Usb,
  Zap,
  Disc,
  Wrench,
  Sparkles,
  ArrowRight,
  Info,
  Play,
  Square
} from 'lucide-react';

interface HealthSummaryDashboardProps {
  drive: DiskDrive;
  telemetry: ScanTelemetry;
  calculatedHealth: number | null;
  blocks?: SectorBlock[];
  activeMethodId?: SpecializedScanMethodId;
  scanMode?: 'quick' | 'full';
  onSelectBlock?: (block: SectorBlock) => void;
  onStartScan?: () => void;
  onRefreshSmart?: () => void;
  onOpenVendorModal?: () => void;
  onOpenRemapModal?: () => void;
  onOpenHardwareDetails?: () => void;
  viewMode?: 'all' | 'health_only' | 'smart_only';
  smartSelfTestState?: SmartSelfTestState | null;
  onRunSmartSelfTest?: (testType: SmartSelfTestType | 'abort') => void;
  onPollSmartSelfTest?: () => void;
  isTauriRuntime?: boolean;
}

export const HealthSummaryDashboard: React.FC<HealthSummaryDashboardProps> = ({
  drive,
  telemetry,
  calculatedHealth,
  blocks,
  activeMethodId,
  scanMode = 'full',
  onSelectBlock,
  onStartScan,
  onRefreshSmart,
  onOpenVendorModal,
  onOpenRemapModal,
  onOpenHardwareDetails,
  viewMode = 'all',
  smartSelfTestState,
  onRunSmartSelfTest,
  onPollSmartSelfTest,
  isTauriRuntime = false
}) => {
  const vendorKey = detectVendor(drive);
  const vendorProfile = getVendorProfile(vendorKey);
  const mediaAnalysis = getDriveMediaAnalysis(drive);
  const tailoredActions = getTailoredActionMethods(drive, telemetry);
  const vitals = calculateHardwareVitals(drive, telemetry, 1);

  // Latency breakdown data
  const totalScanned = telemetry.goodCount + telemetry.normalCount + telemetry.slowCount + telemetry.criticalCount + telemetry.badCount;
  const denom = Math.max(1, totalScanned);
  const goodPct = ((telemetry.goodCount / denom) * 100).toFixed(1);
  const normalPct = ((telemetry.normalCount / denom) * 100).toFixed(1);
  const slowPct = ((telemetry.slowCount / denom) * 100).toFixed(1);
  const criticalPct = ((telemetry.criticalCount / denom) * 100).toFixed(1);
  const badPct = ((telemetry.badCount / denom) * 100).toFixed(1);

  // Health level determination
  let healthColor = 'text-slate-400 stroke-slate-400';
  let healthBg = 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300';
  let healthTitle = '센서 미제공 (N/A)';
  let healthDesc = '커널 S.M.A.R.T. 센서가 없는 샌드박스 환경입니다. 표면 검사를 실행하면 실제 I/O 응답 기반 건강도 지수가 산출됩니다.';

  if (calculatedHealth !== null) {
    healthColor = 'text-emerald-500 stroke-emerald-500';
    healthBg = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
    healthTitle = '정상 (Good)';
    healthDesc = '디스크 물리적 표면 및 S.M.A.R.T. 건강 상태가 매우 양호합니다.';

    if (calculatedHealth < 50 || telemetry.badCount >= 5) {
      healthColor = 'text-red-500 stroke-red-500';
      healthBg = 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300';
      healthTitle = '위험 (Critical / Replace)';
      healthDesc = '물리적 손상 및 다수의 배드섹터가 발견되었습니다. 즉시 교체 및 데이터 백업을 권장합니다.';
    } else if (calculatedHealth < 80 || telemetry.badCount > 0 || telemetry.criticalCount > 0) {
      healthColor = 'text-amber-500 stroke-amber-500';
      healthBg = 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
      healthTitle = '주의 (Warning)';
      healthDesc = '불안정 섹터 또는 지연 블록이 감지되었습니다. 진행성 손상 여부를 면밀히 관찰하십시오.';
    }
  }

  // Helper to evaluate S.M.A.R.T. threshold breach
  const checkThresholdBreach = (attr: DriveSmartAttribute): { isBreached: boolean; reason: string } => {
    if (attr.threshold > 0 && attr.current > 0 && attr.current <= attr.threshold) {
      return {
        isBreached: true,
        reason: `현재 정규화 값(${attr.current})이 제조사 안전 임계 한계치(${attr.threshold}) 이하로 전락하여 고장 임계점을 돌파했습니다.`
      };
    }

    const rawVal = parseInt(attr.raw.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(rawVal)) {
      if (attr.id === 5 && attr.threshold > 0 && attr.current <= attr.threshold) {
        return {
          isBreached: true,
          reason: `치환 섹터(Reallocated Sector)가 제조사 안전 예비 트랙 허용 한계를 초과했습니다 (Raw: ${attr.raw}).`
        };
      }
      if ((attr.id === 197 || attr.id === 198) && attr.status === 'critical') {
        return {
          isBreached: true,
          reason: `복구 불가능한 불안정 보류 섹터가 다수 누적되어 하드웨어 위험 한계를 초과했습니다 (Raw: ${attr.raw}).`
        };
      }
    }

    if (attr.status === 'critical' && attr.threshold > 0 && attr.current <= attr.threshold) {
      return {
        isBreached: true,
        reason: `제조사 공장 설정 신뢰성 임계치를 초과한 치명적 속성입니다.`
      };
    }

    return { isBreached: false, reason: '' };
  };

  const thresholdBreaches = drive.smartAttributes
    .map(attr => ({ attr, ...checkThresholdBreach(attr) }))
    .filter(b => b.isBreached);

  const hasThresholdBreaches = thresholdBreaches.length > 0;
  const hasSmartData = drive.smartAttributes.length > 0;

  // Calculate SVG circular gauge metrics
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const gaugePercent = calculatedHealth !== null ? calculatedHealth : 0;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  return (
    <div className="space-y-3 sm:space-y-4">
      {viewMode !== 'smart_only' && (
        <>
          {/* Top Health & Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Overall Health Gauge Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs flex flex-col items-center justify-center text-center relative overflow-hidden">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Overall Health Score
              </h3>

              <div className="relative w-36 h-36 flex items-center justify-center my-1">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="12"
                    fill="transparent"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    className={`transition-all duration-700 ease-out ${healthColor}`}
                    strokeWidth="12"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                    {calculatedHealth !== null ? `${calculatedHealth}%` : 'N/A'}
                  </span>
                  <span className="text-[11px] font-semibold mt-0.5 text-slate-500 dark:text-slate-400">
                    {healthTitle}
                  </span>
                </div>
              </div>

              <div className={`mt-1 px-2.5 py-1 rounded border text-[11px] font-medium ${healthBg}`}>
                {healthDesc}
              </div>

              {/* Critical Threshold Limit Breach Visual Callout & Tooltip */}
              {hasThresholdBreaches && (
                <div className="relative group/gaugeTip mt-2 w-full">
                  <div className="px-2 py-1 rounded bg-red-600/15 border border-red-500/40 text-red-700 dark:text-red-300 text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-help shadow-2xs">
                    <AlertOctagon className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    <span>임계치 초과 속성 {thresholdBreaches.length}건 감지</span>
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/gaugeTip:flex flex-col z-30 w-64 p-2.5 rounded-lg bg-slate-900/95 dark:bg-slate-950/98 text-white border border-red-500/60 shadow-xl backdrop-blur-md text-[10px] text-left font-sans">
                    <div className="font-bold text-red-400 flex items-center gap-1 border-b border-slate-700 pb-1 mb-1">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      제조사 고장 예측 임계치 위반 목록
                    </div>
                    <div className="space-y-1">
                      {thresholdBreaches.map(b => (
                        <div key={b.attr.id} className="text-slate-300">
                          • <strong className="text-white">ID {b.attr.id.toString(16).padStart(2, '0').toUpperCase()}h</strong> {b.attr.name.split('(')[0]}: {b.attr.current} ≤ {b.attr.threshold}
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 text-[9px] text-red-300 pt-1 border-t border-slate-800">
                      하드웨어 고장 임계점에 도달했습니다. 즉각적인 교체와 백업을 권장합니다.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Latency Distribution Histogram Graph Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    응답 속도 분포 요약 그래프
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {totalScanned} 검사됨
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 mb-3 shadow-inner">
                  <div style={{ width: `${goodPct}%` }} className="bg-emerald-500 h-full transition-all" title={`정상: ${goodPct}%`} />
                  <div style={{ width: `${normalPct}%` }} className="bg-lime-500 h-full transition-all" title={`양호: ${normalPct}%`} />
                  <div style={{ width: `${slowPct}%` }} className="bg-amber-500 h-full transition-all" title={`지연: ${slowPct}%`} />
                  <div style={{ width: `${criticalPct}%` }} className="bg-orange-600 h-full transition-all" title={`위험: ${criticalPct}%`} />
                  <div style={{ width: `${badPct}%` }} className="bg-red-600 h-full transition-all" title={`배드섹터: ${badPct}%`} />
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-600 dark:text-slate-300">정상 (&lt;10ms)</span>
                    </div>
                    <div className="font-mono text-slate-900 dark:text-slate-100 font-medium text-[11px]">
                      {telemetry.goodCount.toLocaleString()} ({goodPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-lime-500" />
                      <span className="text-slate-600 dark:text-slate-300">양호 (&lt;50ms)</span>
                    </div>
                    <div className="font-mono text-slate-900 dark:text-slate-100 font-medium text-[11px]">
                      {telemetry.normalCount.toLocaleString()} ({normalPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-slate-600 dark:text-slate-300">경고 지연 (&lt;150ms)</span>
                    </div>
                    <div className="font-mono text-slate-900 dark:text-slate-100 font-medium text-[11px]">
                      {telemetry.slowCount.toLocaleString()} ({slowPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-600" />
                      <span className="text-slate-600 dark:text-slate-300">심각 지연 (&lt;500ms)</span>
                    </div>
                    <div className="font-mono text-slate-900 dark:text-slate-100 font-medium text-[11px]">
                      {telemetry.criticalCount.toLocaleString()} ({criticalPct}%)
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 font-semibold text-red-500">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>배드섹터 (손상 블록)</span>
                    </div>
                    <div className="font-mono font-bold text-red-500 text-[11px]">
                      {telemetry.badCount.toLocaleString()} ({badPct}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hardware Specs & Vital Stats Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    {drive.isExternal ? <Usb className="w-3.5 h-3.5 text-indigo-500" /> : <HardDrive className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{drive.isExternal ? '외장 저장장치 사양' : '드라이브 하드웨어 사양'}</span>
                  </h3>
                  <div className="flex items-center gap-1">
                    {drive.isExternal && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                        {drive.mountPoint || '외장'}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
                      {drive.type}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">모델명</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-right truncate max-w-[180px]">{drive.model}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">시리얼 번호</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{drive.serialNumber}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">인터페이스</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[190px]">{drive.interface}</span>
                  </div>

                  {drive.isExternal && drive.bridgeChipset && (
                    <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        브릿지 컨트롤러
                      </span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 text-right truncate max-w-[170px]">
                        {drive.bridgeChipset}
                      </span>
                    </div>
                  )}

                  {drive.isExternal && drive.fileSystem && (
                    <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                      <span className="text-slate-500 dark:text-slate-400">파일시스템</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{drive.fileSystem}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">전체 용량 / 섹터</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {drive.capacityGb !== null ? `${drive.capacityGb} GB` : 'N/A'} ({drive.totalSectors > 0 ? `${drive.totalSectors.toLocaleString()} LBA` : 'LBA N/A'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware vitals */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Thermometer className={`w-3.5 h-3.5 ${vitals.temperatureC !== null && vitals.temperatureC > 45 ? 'text-amber-500' : 'text-blue-500'}`} />
                  <div>
                    <div className="text-[9px] uppercase font-semibold text-slate-500">작동 온도</div>
                    <div className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                      {vitals.temperatureC !== null ? `${vitals.temperatureC.toFixed(1)}°C` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <div>
                    <div className="text-[9px] uppercase font-semibold text-slate-500">소비 전력</div>
                    <div className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
                      {vitals.powerWatts !== null ? `${vitals.powerWatts.toFixed(2)}W` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {vitals.isMechanicalHdd ? <Disc className="w-3.5 h-3.5 text-indigo-500" /> : <Cpu className="w-3.5 h-3.5 text-cyan-500" />}
                  <div className="truncate">
                    <div className="text-[9px] uppercase font-semibold text-slate-500">{vitals.isMechanicalHdd ? '회전 속도' : '스토리지 엔진'}</div>
                    <div className="text-[11px] font-bold font-mono text-slate-900 dark:text-slate-100 truncate">{vitals.rpmDisplay}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <div>
                    <div className="text-[9px] uppercase font-semibold text-slate-500">사용 시간</div>
                    <div className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                      {drive.powerOnHours !== null ? `${drive.powerOnHours.toLocaleString()}h` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {onOpenHardwareDetails && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={onOpenHardwareDetails}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>디스크 장치 상세 스펙 & 하드웨어 정보 보기</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto text-indigo-400" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Real-time 10-Minute Disk Temperature Trend Line Chart */}
          <TemperatureLineChart
            drive={drive}
            currentTemperature={vitals.temperatureC}
            isScanning={telemetry.status === 'scanning'}
          />

          {/* D3 Read Speed & I/O Latency Distribution Histogram */}
          {blocks && (
            <LatencyHistogramDashboard
              blocks={blocks}
              drive={drive}
              activeMethodId={activeMethodId}
              scanMode={scanMode}
              isScanning={telemetry.status === 'scanning'}
              onSelectBlock={onSelectBlock}
              onStartScan={onStartScan}
              onOpenRemapModal={onOpenRemapModal}
            />
          )}

          {/* Vendor & Storage Media Tailored Action Banner */}
          <div className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-600 text-white font-bold shrink-0 shadow-xs mt-0.5">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    제조사 및 저장매체 특성 진단: {vendorProfile.nameKo}
                  </span>
                  <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${vendorProfile.badgeColor}`}>
                    {vendorProfile.vendor.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    {mediaAnalysis.connectionCategoryKo}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  <strong>주요 컨트롤러:</strong> {vendorProfile.controllerFamily} •{' '}
                  <strong className="ml-1">대역폭/전력:</strong> {mediaAnalysis.busBandwidth} / {mediaAnalysis.powerDelivery}
                </p>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono">
                  <span>권장 맞춤 조치 ({tailoredActions.length}건 준비됨):</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    1. {tailoredActions[0]?.title || '제조사 진단'}
                  </span>
                </div>
              </div>
            </div>

            {onOpenVendorModal && (
              <button
                onClick={onOpenVendorModal}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-end md:self-center"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>제조사 차별화 조치 센터</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {drive.isUsb2 && (
            <div className="p-3.5 rounded-lg border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>USB 2.0 레거시 인터페이스 검사 주의 사항</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-800 dark:text-amber-300 font-semibold">
                      최대 480Mbps (~35MB/s)
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                    USB 2.0은 5V 500mA(2.5W) 전력 및 단일 큐 BOT 방식으로 동작합니다. 전원 부족 시 외장 HDD의 불안정 섹터(Pending Sector)가 유발될 수 있으며, 전송 대역폭 한계로 고속 버스트 스캔 속도가 약 30MB/s 내외로 제한됩니다.
                  </p>
                </div>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-semibold">
                BOT 프로토콜 제한
              </span>
            </div>
          )}
        </>
      )}

      {/* S.M.A.R.T. Attributes Table */}
      {viewMode !== 'health_only' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs">
          {/* Threshold Breach Visual Notification Banner */}
          {hasThresholdBreaches && (
            <div className="mb-3.5 p-3 sm:p-3.5 rounded-lg bg-red-500/10 dark:bg-red-950/40 border border-red-500/40 text-red-700 dark:text-red-300 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="p-1.5 rounded-md bg-red-600 text-white shrink-0 mt-0.5 shadow-xs">
                <AlertOctagon className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-xs sm:text-sm text-red-800 dark:text-red-200">
                    S.M.A.R.T. 제조사 허용 임계치(Threshold) 초과 감지! ({thresholdBreaches.length}개 항목)
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-red-600 text-white uppercase tracking-wider animate-pulse">
                    CRITICAL LIMIT EXCEEDED
                  </span>
                </div>
                <p className="text-[11px] text-red-700/90 dark:text-red-300/90 mt-1 leading-relaxed">
                  디스크 내부 센서 측정값이 제조사 공장 출하 시 지정한 안전 마진 임계값에 도달했거나 초과했습니다.
                  드라이브 하드웨어의 급격한 고장 및 영구적 데이터 소실 위험이 매우 높으므로 즉시 데이터를 백업하십시오.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {thresholdBreaches.map(b => (
                    <span
                      key={b.attr.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 font-mono text-[10px] font-semibold"
                    >
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      ID {b.attr.id.toString(16).padStart(2, '0').toUpperCase()}h {b.attr.name.split('(')[0].trim()}: {b.attr.current} ≤ {b.attr.threshold} (임계치 위반)
                    </span>
                  ))}
                </div>
              </div>
              {onOpenRemapModal && (
                <button
                  onClick={onOpenRemapModal}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer self-start sm:self-center"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>수복/치환</span>
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-2.5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                  S.M.A.R.T. Self-Monitoring Attributes
                </h3>
                {!hasSmartData ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                    커널 SMART 미제공 (N/A)
                  </span>
                ) : hasThresholdBreaches ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                    임계치 초과 경보 활성
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    모든 임계치 정상
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                드라이브 펌웨어가 기록한 실시간 하드웨어 신뢰성 지표 및 제조사 한계 임계치 대조
              </p>
            </div>

            {onRefreshSmart && (
              <button
                onClick={onRefreshSmart}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                새로고침
              </button>
            )}
          </div>

          {/* S.M.A.R.T. Hardware Self-Test Runner */}
          {onRunSmartSelfTest && (
            <div className="mb-3.5 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>S.M.A.R.T. 하드웨어 자체 진단 (Hardware Self-Test)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    ATA SMART Execute Off-line Immediate (0xD4) 커널 패스스루 명령 전송
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-') || smartSelfTestState?.status === 'running'}
                    onClick={() => onRunSmartSelfTest('short')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    Short Test (~2분)
                  </button>
                  <button
                    type="button"
                    disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-') || smartSelfTestState?.status === 'running'}
                    onClick={() => onRunSmartSelfTest('extended')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    Extended Test
                  </button>
                  <button
                    type="button"
                    disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-') || smartSelfTestState?.status === 'running'}
                    onClick={() => onRunSmartSelfTest('conveyance')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Conveyance
                  </button>
                  <button
                    type="button"
                    disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-')}
                    onClick={() => onRunSmartSelfTest('abort')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Square className="w-3 h-3" />
                    Abort
                  </button>
                  {onPollSmartSelfTest && (
                    <button
                      type="button"
                      disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-')}
                      onClick={onPollSmartSelfTest}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="진행 상태 폴링"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-') ? (
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Kernel IOCTL Required — 브라우저 샌드박스 또는 비물리 파일 타겟에서는 ATA SMART Self-Test 실행이 차단됩니다 (Windows 관리자 권한 Tauri 데스크톱 전용).
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-slate-700 dark:text-slate-300">
                      상태: <strong>{smartSelfTestState?.statusText || 'Idle (실행 대기)'}</strong>
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {smartSelfTestState ? `${smartSelfTestState.progressPct}%` : '0%'}
                      {smartSelfTestState?.executionCode !== null && smartSelfTestState?.executionCode !== undefined
                        ? ` (0x${smartSelfTestState.executionCode.toString(16).padStart(2, '0').toUpperCase()})`
                        : ''}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        smartSelfTestState?.status === 'aborted'
                          ? 'bg-red-500'
                          : smartSelfTestState?.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${smartSelfTestState?.progressPct || 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasSmartData ? (
            <div className="p-5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold text-xs">
                <Info className="w-4 h-4 text-indigo-500" />
                <span>S.M.A.R.T. 하드웨어 속성 데이터 없음 (N/A)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                웹 브라우저 보안 샌드박스 또는 USB 브릿지 환경에서는 ATA/NVMe 커널 패스스루(Win32 IOCTL) 직접 호출이 차단되므로 임의의 가짜 SMART 값을 생성하지 않습니다.
                Windows 관리자 권한 Tauri 데스크톱 앱으로 실행하면 실제 물리 디스크의 S.M.A.R.T. 레지스터 전체가 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-2.5 py-2 rounded-l">ID</th>
                    <th className="px-2.5 py-2">속성 이름 (Attribute Name)</th>
                    <th className="px-2.5 py-2 text-center">현재값</th>
                    <th className="px-2.5 py-2 text-center">최악값</th>
                    <th className="px-2.5 py-2 text-center">임계치</th>
                    <th className="px-2.5 py-2 font-mono">원시 데이터 (Raw)</th>
                    <th className="px-2.5 py-2 font-mono">Raw Hex (48-bit)</th>
                    <th className="px-2.5 py-2 text-center">상태</th>
                    <th className="px-2.5 py-2 rounded-r">설명 및 임계치 진단</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px] tabular-nums">
                  {drive.smartAttributes.map((attr) => {
                    const breachInfo = checkThresholdBreach(attr);
                    const isBreached = breachInfo.isBreached;
                    const isCrit = attr.status === 'critical' || isBreached;
                    const isWarn = attr.status === 'warning' && !isBreached;
                    const rawNumeric = Number(String(attr.raw).replace(/[^0-9]/g, ''));
                    const computedRawHex = attr.rawHex || (!Number.isNaN(rawNumeric)
                      ? `0x${rawNumeric.toString(16).padStart(12, '0').toUpperCase()}`
                      : '0x000000000000');

                    return (
                      <tr
                        key={attr.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          isBreached
                            ? 'bg-red-500/15 dark:bg-red-950/40 text-red-900 dark:text-red-200 border-l-4 border-l-red-600 font-medium'
                            : isCrit
                            ? 'bg-red-950/20 font-semibold text-red-300'
                            : ''
                        }`}
                      >
                        <td className="px-2.5 py-2 text-slate-500">
                          0x{attr.id.toString(16).padStart(2, '0').toUpperCase()}
                        </td>
                        <td className="px-2.5 py-2 font-sans font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{attr.name}</span>
                            {isBreached && (
                              <div className="relative group/tip inline-flex items-center">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-600 text-white animate-pulse cursor-help shadow-2xs">
                                  <AlertOctagon className="w-2.5 h-2.5" />
                                  임계치 한계 초과
                                </span>
                                <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:flex flex-col z-30 w-72 p-2.5 rounded-lg bg-slate-900/95 dark:bg-slate-950/98 text-white border border-red-500/60 shadow-xl backdrop-blur-md text-[11px] font-sans">
                                  <div className="flex items-center gap-1.5 font-bold text-red-400 border-b border-slate-700 pb-1 mb-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                    <span>제조사 안전 임계치(Threshold) 위반 경고</span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10px] leading-relaxed">
                                    <div><strong>현재값:</strong> {attr.current} / <strong>임계치:</strong> {attr.threshold}</div>
                                    <div><strong>원시값(Raw):</strong> {attr.raw}</div>
                                    <div className="text-red-300 pt-0.5">{breachInfo.reason}</div>
                                    <div className="text-slate-400 text-[9px] pt-1 border-t border-slate-800">
                                      권장 사항: 즉각적인 백업 및 하드웨어 교체 요망
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={isBreached ? 'text-red-600 dark:text-red-400 font-bold underline decoration-red-500 decoration-wavy' : ''}>
                            {attr.current}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center text-slate-500">{attr.worst}</td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`font-bold ${isBreached ? 'text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded' : 'text-slate-500'}`}>
                            {attr.threshold}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-slate-800 dark:text-slate-200">
                          {attr.raw}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {computedRawHex}
                        </td>
                        <td className="px-2.5 py-2 text-center font-sans">
                          {isBreached ? (
                            <div className="relative group/badge inline-block">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-red-600 text-white shadow-2xs cursor-help">
                                <AlertOctagon className="w-2.5 h-2.5 animate-spin" />
                                위험 (한계초과)
                              </span>
                              <div className="absolute right-0 bottom-full mb-1 hidden group-hover/badge:flex w-48 p-2 rounded bg-black/90 text-white text-[10px] z-20 border border-red-500/50 shadow-md">
                                현재값({attr.current})이 제조사 안전 임계치({attr.threshold}) 이하로 떨어져 디스크 결함 발생 확률이 매우 높습니다.
                              </div>
                            </div>
                          ) : isCrit ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-900/40 text-red-400 border border-red-700/50">
                              <AlertOctagon className="w-2.5 h-2.5" />
                              위험
                            </span>
                          ) : isWarn ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-900/40 text-amber-400 border border-amber-700/50">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              주의
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-700/40">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              정상
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-sans text-slate-500 dark:text-slate-400 text-[11px]">
                          {isBreached ? (
                            <span className="text-red-700 dark:text-red-300 font-medium">
                              ⚠️ {breachInfo.reason}
                            </span>
                          ) : (
                            attr.description
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
  );
};
