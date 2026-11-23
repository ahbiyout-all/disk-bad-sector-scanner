import React from 'react';
import {
  CustomSmartThresholdRule,
  DiskDrive,
  ScanTelemetry,
  DriveSmartAttribute,
  SectorBlock,
  SpecializedScanMethodId,
  SmartSelfTestState,
  SmartSelfTestType,
  SavedScanRecord,
  SmartHistorySnapshot
} from '../types';
import { calculateHardwareVitals } from '../utils/hardwareTelemetry';
import {
  evaluateSmartAttributeThreshold,
  formatHexAttributeId
} from '../utils/smartThresholds';
import { detectVendor, getVendorProfile, getDriveMediaAnalysis, getTailoredActionMethods } from '../utils/vendorDiagnostics';
import { TemperatureLineChart } from './TemperatureLineChart';
import { LatencyHistogramDashboard } from './LatencyHistogramDashboard';
import { SmartAttributeTrendChart } from './SmartAttributeTrendChart';
import { SmartExtendedLogsPanel } from './SmartExtendedLogsPanel';
import {
  computeWeibullRul,
  evaluateThermalWearStress,
  extractThermalWearInputFromDrive,
  extractWeibullInputFromDrive,
  runPredictiveWeibullRul,
  runThermalWearEvaluation,
  ThermalWearReport,
  WeibullRulReport
} from '../utils/predictiveAnalyticsBridge';
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
  Square,
  Sliders
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
  onOpenFeaturesModal?: () => void;
  viewMode?: 'all' | 'health_only' | 'smart_only';
  smartSelfTestState?: SmartSelfTestState | null;
  onRunSmartSelfTest?: (testType: SmartSelfTestType | 'abort') => void;
  onPollSmartSelfTest?: () => void;
  smartLogRefreshSignal?: number;
  isTauriRuntime?: boolean;
  scanRecords?: SavedScanRecord[];
  smartSnapshots?: SmartHistorySnapshot[];
  onRecordSmartSnapshot?: (drive: DiskDrive) => void;
  customSmartThresholds?: CustomSmartThresholdRule[];
  onOpenThresholdSettings?: () => void;
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
  onOpenFeaturesModal,
  viewMode = 'all',
  smartSelfTestState,
  onRunSmartSelfTest,
  onPollSmartSelfTest,
  smartLogRefreshSignal = 0,
  isTauriRuntime = false,
  scanRecords = [],
  smartSnapshots = [],
  onRecordSmartSnapshot,
  customSmartThresholds = [],
  onOpenThresholdSettings
}) => {
  const vendorKey = detectVendor(drive);
  const vendorProfile = getVendorProfile(vendorKey);
  const mediaAnalysis = getDriveMediaAnalysis(drive);
  const tailoredActions = getTailoredActionMethods(drive, telemetry);
  const vitals = calculateHardwareVitals(drive, telemetry, 1);

  // Pure Creative DiskSentinelPredictive.dll Prognostics (Weibull RUL & Arrhenius Thermal Wear)
  const weibullInput = React.useMemo(() => extractWeibullInputFromDrive(drive), [drive]);
  const thermalInput = React.useMemo(() => extractThermalWearInputFromDrive(drive), [drive]);

  const syncWeibullReport = React.useMemo<WeibullRulReport | null>(
    () => (weibullInput ? computeWeibullRul(weibullInput) : null),
    [weibullInput]
  );
  const syncThermalReport = React.useMemo<ThermalWearReport | null>(
    () => (thermalInput ? evaluateThermalWearStress(thermalInput) : null),
    [thermalInput]
  );

  const [nativeWeibullReport, setNativeWeibullReport] = React.useState<WeibullRulReport | null>(null);
  const [nativeThermalReport, setNativeThermalReport] = React.useState<ThermalWearReport | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntime) {
      setNativeWeibullReport(null);
      setNativeThermalReport(null);
      return;
    }
    if (weibullInput) {
      runPredictiveWeibullRul(weibullInput).then(res => {
        if (!cancelled) setNativeWeibullReport(res);
      });
    } else {
      setNativeWeibullReport(null);
    }
    if (thermalInput) {
      runThermalWearEvaluation(thermalInput).then(res => {
        if (!cancelled) setNativeThermalReport(res);
      });
    } else {
      setNativeThermalReport(null);
    }
    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime, weibullInput, thermalInput]);

  const weibullReport = nativeWeibullReport ?? syncWeibullReport;
  const thermalWearReport = nativeThermalReport ?? syncThermalReport;

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
  let healthDesc = '커널 S.M.A.R.T. 센서가 미감지 상태입니다. Tauri 데스크톱 환경에서 표면 검사를 실행하면 실제 I/O 응답 기반 건강도 지수가 산출됩니다.';

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

  // Evaluate S.M.A.R.T. attributes using firmware safety floor + custom Warning/Critical thresholds
  const evaluatedAttributes = drive.smartAttributes.map(attr => ({
    attr,
    evalResult: evaluateSmartAttributeThreshold(attr, customSmartThresholds)
  }));

  const thresholdBreaches = evaluatedAttributes
    .filter(item => item.evalResult.isBreached)
    .map(item => ({
      attr: item.attr,
      ...item.evalResult
    }));

  const criticalThresholdBreaches = thresholdBreaches.filter(b => b.severity === 'critical');
  const warningThresholdBreaches = thresholdBreaches.filter(b => b.severity === 'warning');
  const hasThresholdBreaches = thresholdBreaches.length > 0;
  const hasCriticalBreaches = criticalThresholdBreaches.length > 0;
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

              {/* Threshold Limit Breach Visual Callout & Tooltip */}
              {hasThresholdBreaches && (
                <div className="relative group/gaugeTip mt-2 w-full">
                  <div
                    className={`px-2 py-1 rounded border text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-help shadow-2xs ${
                      hasCriticalBreaches
                        ? 'bg-red-600/15 border-red-500/40 text-red-700 dark:text-red-300'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {hasCriticalBreaches ? (
                      <AlertOctagon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span>
                      {hasCriticalBreaches ? '위험 임계치 초과' : '주의 임계치 도달'} {thresholdBreaches.length}건 감지
                    </span>
                  </div>
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/gaugeTip:flex flex-col z-30 w-72 p-2.5 rounded-lg bg-slate-900/95 dark:bg-slate-950/98 text-white border shadow-xl backdrop-blur-md text-[10px] text-left font-sans ${
                      hasCriticalBreaches ? 'border-red-500/60' : 'border-amber-500/60'
                    }`}
                  >
                    <div
                      className={`font-bold flex items-center gap-1 border-b border-slate-700 pb-1 mb-1 ${
                        hasCriticalBreaches ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      임계치 위반 목록 (펌웨어 및 사용자 설정)
                    </div>
                    <div className="space-y-1">
                      {thresholdBreaches.map(b => (
                        <div key={b.attr.id} className="text-slate-300">
                          • <strong className="text-white">{formatHexAttributeId(b.attr.id)}</strong>{' '}
                          {b.attr.name.split('(')[0]}:{' '}
                          <span className={b.severity === 'critical' ? 'text-red-300 font-semibold' : 'text-amber-300 font-semibold'}>
                            {b.severity === 'critical' ? '위험' : '주의'}
                          </span>{' '}
                          — {b.reason}
                        </div>
                      ))}
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
                    {drive.isExternal ? <Usb className="w-3.5 h-3.5 text-blue-500" /> : <HardDrive className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{drive.isExternal ? '외장 저장장치 사양' : '드라이브 하드웨어 사양'}</span>
                  </h3>
                  <div className="flex items-center gap-1">
                    {drive.isExternal && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                        {drive.mountPoint || '외장'}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
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
                        <Cpu className="w-3 h-3 text-blue-400" />
                        브릿지 컨트롤러
                      </span>
                      <span className="font-mono text-blue-600 dark:text-blue-400 text-right truncate max-w-[170px]">
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
                  {vitals.isMechanicalHdd ? <Disc className="w-3.5 h-3.5 text-blue-500" /> : <Cpu className="w-3.5 h-3.5 text-cyan-500" />}
                  <div className="truncate">
                    <div className="text-[9px] uppercase font-semibold text-slate-500">{vitals.isMechanicalHdd ? '회전 속도' : '스토리지 엔진'}</div>
                    <div className="text-[11px] font-bold font-mono text-slate-900 dark:text-slate-100 truncate">{vitals.rpmDisplay}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
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
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>디스크 장치 상세 스펙 & 하드웨어 정보 보기</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto text-blue-400" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pure Creative Predictive Prognostics: Weibull RUL & Arrhenius Thermal Wear */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500 shrink-0" />
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Weibull 잔여 수명(RUL) · Arrhenius 열화 스트레스 예측
                </h3>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>
                  {weibullReport?.engineSource === 'native-cpp-dll'
                    ? 'DiskSentinelPredictive.dll (Native)'
                    : weibullReport?.engineSource === 'rust-parity-fallback'
                    ? 'Predictive Rust Parity'
                    : 'Predictive TS Engine'}
                </span>
                {weibullReport && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        weibullReport.riskGradeCode >= 4
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : weibullReport.riskGradeCode >= 2
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      }
                    >
                      {weibullReport.riskGradeCode === 4
                        ? '치명적 위험'
                        : weibullReport.riskGradeCode === 3
                        ? '높은 위험'
                        : weibullReport.riskGradeCode === 2
                        ? '주의 관찰'
                        : weibullReport.riskGradeCode === 1
                        ? '양호'
                        : '최적'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {!weibullReport && !thermalWearReport ? (
              <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
                커널 S.M.A.R.T. 및 가동시간 텔레메트리 대기 (N/A — 실측 센서 연결 시 자동 산출)
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 text-xs">
                {/* Weibull RUL Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Weibull 조건부 고장 확률 &amp; 잔여 수명
                    </span>
                    {weibullReport && (
                      <span className="font-mono tabular-nums">
                        β={weibullReport.weibullShapeBeta.toFixed(2)} / η={Math.round(weibullReport.weibullScaleEtaHours).toLocaleString()}h
                      </span>
                    )}
                  </div>
                  {weibullReport ? (
                    <div className="grid grid-cols-4 gap-2 font-mono tabular-nums pt-1">
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">예상 RUL</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {weibullReport.estimatedRulDays.toLocaleString()}일
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">30일 고장률</div>
                        <div className={`text-sm font-bold mt-0.5 ${weibullReport.failureProb30dPct >= 15 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {weibullReport.failureProb30dPct.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">90일 고장률</div>
                        <div className={`text-sm font-bold mt-0.5 ${weibullReport.failureProb90dPct >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {weibullReport.failureProb90dPct.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">신뢰성 지수</div>
                        <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          {weibullReport.reliabilityIndexPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-slate-400">RUL 데이터 없음 (N/A)</div>
                  )}
                  {weibullReport && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      주요 위험 인자: <span className="font-mono text-slate-700 dark:text-slate-300">{weibullReport.primaryRiskFactor}</span>
                    </div>
                  )}
                </div>

                {/* Arrhenius Thermal Stress & TBW */}
                <div className="space-y-2 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Arrhenius 열가속 마모 &amp; TBW 소진율
                    </span>
                    {thermalWearReport && (
                      <span className="font-mono tabular-nums">
                        스트레스 {thermalWearReport.thermalStressScore.toFixed(1)}/100
                      </span>
                    )}
                  </div>
                  {thermalWearReport ? (
                    <div className="grid grid-cols-4 gap-2 font-mono tabular-nums pt-1">
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">열가속 계수</div>
                        <div className={`text-sm font-bold mt-0.5 ${thermalWearReport.arrheniusAccelerationFactor >= 2.0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {thermalWearReport.arrheniusAccelerationFactor.toFixed(2)}x
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">열가중 시간</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {Math.round(thermalWearReport.effectiveAgedHours).toLocaleString()}h
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">일일 쓰기율</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {thermalWearReport.dailyTbwRateGb > 0 ? `${thermalWearReport.dailyTbwRateGb.toFixed(1)}GB` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">TBW 잔여</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {thermalWearReport.estimatedTbwRemainingYears >= 0
                            ? `${thermalWearReport.estimatedTbwRemainingYears.toFixed(1)}년`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-slate-400">온도 데이터 없음 (N/A)</div>
                  )}
                  {thermalWearReport && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      열화 소견: <span className="font-mono text-slate-700 dark:text-slate-300">{thermalWearReport.thermalSummary}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Real-time 10-Minute Disk Temperature Trend Line Chart */}
          <TemperatureLineChart
            drive={drive}
            currentTemperature={vitals.temperatureC}
            isScanning={telemetry.status === 'scanning'}
          />

          {/* Historical S.M.A.R.T. Attribute Degradation Trend Line Chart */}
          <SmartAttributeTrendChart
            drive={drive}
            scanRecords={scanRecords}
            smartSnapshots={smartSnapshots}
            customSmartThresholds={customSmartThresholds}
            onStartScan={onStartScan}
            onRecordSmartSnapshot={onRecordSmartSnapshot}
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
          <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 dark:from-blue-950/30 dark:via-slate-900 dark:to-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-blue-600 text-white font-bold shrink-0 shadow-xs mt-0.5">
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
                  <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                    {mediaAnalysis.connectionCategoryKo}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  <strong>주요 컨트롤러:</strong> {vendorProfile.controllerFamily} •{' '}
                  <strong className="ml-1">대역폭/전력:</strong> {mediaAnalysis.busBandwidth} / {mediaAnalysis.powerDelivery}
                </p>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono">
                  <span>권장 맞춤 조치 ({tailoredActions.length}건 준비됨):</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    1. {tailoredActions[0]?.title || '제조사 진단'}
                  </span>
                </div>
              </div>
            </div>

            {onOpenVendorModal && (
              <button
                onClick={onOpenVendorModal}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-end md:self-center"
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

      {/* S.M.A.R.T. Historical Attribute Trend & Attributes Table */}
      {viewMode !== 'health_only' && (
        <>
          {viewMode === 'smart_only' && (
            <SmartAttributeTrendChart
              drive={drive}
              scanRecords={scanRecords}
              smartSnapshots={smartSnapshots}
              customSmartThresholds={customSmartThresholds}
              onStartScan={onStartScan}
              onRecordSmartSnapshot={onRecordSmartSnapshot}
            />
          )}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs">
          {/* Threshold Breach Visual Notification Banner */}
          {hasThresholdBreaches && (
            <div
              className={`mb-3.5 p-3 sm:p-3.5 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-200 ${
                hasCriticalBreaches
                  ? 'bg-red-500/10 dark:bg-red-950/40 border-red-500/40 text-red-700 dark:text-red-300'
                  : 'bg-amber-500/10 dark:bg-amber-950/35 border-amber-500/40 text-amber-800 dark:text-amber-200'
              }`}
            >
              <div
                className={`p-1.5 rounded-md text-white shrink-0 mt-0.5 shadow-xs ${
                  hasCriticalBreaches ? 'bg-red-600' : 'bg-amber-600'
                }`}
              >
                {hasCriticalBreaches ? (
                  <AlertOctagon className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4
                    className={`font-bold text-xs sm:text-sm ${
                      hasCriticalBreaches
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-amber-900 dark:text-amber-100'
                    }`}
                  >
                    S.M.A.R.T. 임계치 초과 감지 ({thresholdBreaches.length}개 항목 · 위험{' '}
                    {criticalThresholdBreaches.length} · 주의 {warningThresholdBreaches.length})
                  </h4>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold text-white uppercase tracking-wider ${
                      hasCriticalBreaches ? 'bg-red-600' : 'bg-amber-600'
                    }`}
                  >
                    {hasCriticalBreaches ? 'CRITICAL THRESHOLD' : 'WARNING THRESHOLD'}
                  </span>
                </div>
                <p
                  className={`text-[11px] mt-1 leading-relaxed ${
                    hasCriticalBreaches
                      ? 'text-red-700/90 dark:text-red-300/90'
                      : 'text-amber-800/90 dark:text-amber-200/90'
                  }`}
                >
                  {hasCriticalBreaches
                    ? '제조사 안전 하한선 또는 사용자 지정 위험(Critical) 임계치에 도달한 속성이 있습니다. 즉시 중요 데이터를 백업하고 드라이브 점검을 진행하십시오.'
                    : '사용자 지정 주의(Warning) 임계치에 도달한 속성이 감지되었습니다. 추가 열화 여부를 지속적으로 모니터링하십시오.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {thresholdBreaches.map(b => (
                    <span
                      key={b.attr.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${
                        b.severity === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/60 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200'
                          : 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {b.severity === 'critical' ? (
                        <AlertOctagon className="w-3 h-3 text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      )}
                      {formatHexAttributeId(b.attr.id)} {b.attr.name.split('(')[0].trim()} ·{' '}
                      {b.severity === 'critical' ? '위험' : '주의'} (
                      {b.isCustomThresholdTrigger ? '사용자 임계치' : '펌웨어 임계치'})
                    </span>
                  ))}
                </div>
              </div>
              {onOpenRemapModal && hasCriticalBreaches && (
                <button
                  onClick={onOpenRemapModal}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer self-start sm:self-center whitespace-nowrap"
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
                  <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                  S.M.A.R.T. Self-Monitoring Attributes
                </h3>
                {!hasSmartData ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                    커널 SMART 미제공 (N/A)
                  </span>
                ) : hasCriticalBreaches ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                    위험 임계치 경보 활성
                  </span>
                ) : hasThresholdBreaches ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    주의 임계치 경보 활성
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    모든 임계치 정상
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                드라이브 펌웨어 실시간 지표 및 사용자 정의 S.M.A.R.T. 주의·위험 임계치 대조
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {onOpenThresholdSettings && (
                <button
                  type="button"
                  onClick={onOpenThresholdSettings}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sliders className="w-3 h-3 text-blue-500" />
                  <span>임계치 설정</span>
                </button>
              )}
              {onOpenFeaturesModal && (
                <button
                  type="button"
                  onClick={onOpenFeaturesModal}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 transition-colors border border-blue-200 dark:border-blue-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sliders className="w-3 h-3" />
                  <span>기능 제어 (AAM·APM)</span>
                </button>
              )}
              {onRefreshSmart && (
                <button
                  onClick={onRefreshSmart}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  새로고침
                </button>
              )}
            </div>
          </div>

          {/* S.M.A.R.T. Hardware Self-Test Runner */}
          {onRunSmartSelfTest && (
            <div className="mb-3.5 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
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
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    Short Test (~2분)
                  </button>
                  <button
                    type="button"
                    disabled={!isTauriRuntime || !drive.id.startsWith('drive-tauri-physical-') || smartSelfTestState?.status === 'running'}
                    onClick={() => onRunSmartSelfTest('extended')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                  Kernel IOCTL Required — Tauri 데스크톱 네이티브 IPC 물리 디스크 핸들이 연결된 경우에만 ATA SMART Self-Test를 실행할 수 있습니다 (Windows 관리자 권한 전용).
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-slate-700 dark:text-slate-300">
                      상태: <strong>{smartSelfTestState?.statusText || 'Idle (실행 대기)'}</strong>
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
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
                          : 'bg-blue-500'
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
                <Info className="w-4 h-4 text-blue-500" />
                <span>S.M.A.R.T. 하드웨어 속성 데이터 없음 (N/A)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                일반 웹 브라우저 또는 패스스루 미지원 USB 브릿지 환경에서는 ATA/NVMe 커널 패스스루(Win32 IOCTL) 직접 호출이 차단되므로 임의의 가짜 SMART 값을 생성하지 않습니다.
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
                  {evaluatedAttributes.map(({ attr, evalResult }) => {
                    const isBreached = evalResult.isBreached;
                    const isCrit = evalResult.severity === 'critical';
                    const isWarn = evalResult.severity === 'warning';
                    const matchedRule = evalResult.matchedRule;
                    const rawStr = String(attr.raw ?? '').trim();
                    const headToken = rawStr.split(/[\s(/,:]+/)[0] || '';
                    const rawNumeric = /^0x[0-9a-f]+$/i.test(headToken)
                      ? parseInt(headToken, 16)
                      : /^\d+$/.test(headToken)
                      ? parseInt(headToken, 10)
                      : NaN;
                    const computedRawHex = attr.rawHex || (!Number.isNaN(rawNumeric)
                      ? `0x${rawNumeric.toString(16).padStart(12, '0').toUpperCase()}`
                      : '0x000000000000');

                    return (
                      <tr
                        key={attr.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          isCrit
                            ? 'bg-red-500/12 dark:bg-red-950/35 text-red-900 dark:text-red-200 font-medium'
                            : isWarn
                            ? 'bg-amber-500/10 dark:bg-amber-950/25 text-amber-950 dark:text-amber-200'
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
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold text-white cursor-help shadow-2xs ${
                                    isCrit ? 'bg-red-600' : 'bg-amber-600'
                                  }`}
                                >
                                  {isCrit ? (
                                    <AlertOctagon className="w-2.5 h-2.5" />
                                  ) : (
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                  )}
                                  {evalResult.isCustomThresholdTrigger
                                    ? isCrit
                                      ? '사용자 위험 임계치'
                                      : '사용자 주의 임계치'
                                    : '펌웨어 한계 초과'}
                                </span>
                                <div
                                  className={`absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:flex flex-col z-30 w-72 p-2.5 rounded-lg bg-slate-900/95 dark:bg-slate-950/98 text-white border shadow-xl backdrop-blur-md text-[11px] font-sans ${
                                    isCrit ? 'border-red-500/60' : 'border-amber-500/60'
                                  }`}
                                >
                                  <div
                                    className={`flex items-center gap-1.5 font-bold border-b border-slate-700 pb-1 mb-1.5 ${
                                      isCrit ? 'text-red-400' : 'text-amber-400'
                                    }`}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                      {evalResult.isCustomThresholdTrigger
                                        ? '사용자 정의 S.M.A.R.T. 임계치 경보'
                                        : '제조사 안전 임계치(Threshold) 위반 경고'}
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10px] leading-relaxed">
                                    <div>
                                      <strong>현재값:</strong> {attr.current} / <strong>펌웨어 임계치:</strong>{' '}
                                      {attr.threshold}
                                    </div>
                                    <div>
                                      <strong>원시값(Raw):</strong> {attr.raw}
                                    </div>
                                    {matchedRule && (
                                      <div>
                                        <strong>설정 임계치:</strong> 주의{' '}
                                        {matchedRule.warningThreshold ?? '-'} / 위험{' '}
                                        {matchedRule.criticalThreshold ?? '-'} (
                                        {matchedRule.comparisonMode === 'raw_above'
                                          ? 'Raw ≥'
                                          : 'Current ≤'}
                                        )
                                      </div>
                                    )}
                                    <div className={`${isCrit ? 'text-red-300' : 'text-amber-300'} pt-0.5`}>
                                      {evalResult.reason}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span
                            className={
                              evalResult.isFirmwareBreach
                                ? 'text-red-600 dark:text-red-400 font-bold underline decoration-red-500 decoration-wavy'
                                : ''
                            }
                          >
                            {attr.current}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center text-slate-500">{attr.worst}</td>
                        <td className="px-2.5 py-2 text-center">
                          <div className="flex flex-col items-center leading-tight">
                            <span
                              className={`font-bold ${
                                evalResult.isFirmwareBreach
                                  ? 'text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded'
                                  : 'text-slate-500'
                              }`}
                            >
                              {attr.threshold}
                            </span>
                            {matchedRule && matchedRule.enabled && (
                              <span
                                className="text-[9px] text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap"
                                title={`사용자 설정: 주의 ${matchedRule.warningThreshold ?? '-'} / 위험 ${matchedRule.criticalThreshold ?? '-'}`}
                              >
                                {matchedRule.comparisonMode === 'raw_above' ? 'R≥' : 'S≤'}
                                {matchedRule.warningThreshold ?? '-'}/{matchedRule.criticalThreshold ?? '-'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-slate-800 dark:text-slate-200">
                          {attr.raw}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {computedRawHex}
                        </td>
                        <td className="px-2.5 py-2 text-center font-sans">
                          {isCrit ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-red-600 text-white shadow-2xs whitespace-nowrap">
                              <AlertOctagon className="w-2.5 h-2.5 shrink-0" />
                              {evalResult.isFirmwareBreach
                                ? '위험 (한계초과)'
                                : evalResult.isCustomThresholdTrigger
                                ? '위험 (임계치)'
                                : '위험'}
                            </span>
                          ) : isWarn ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-600/15 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-500/40 whitespace-nowrap">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {evalResult.isCustomThresholdTrigger ? '주의 (임계치)' : '주의'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-700/40 whitespace-nowrap">
                              <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                              정상
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-sans text-slate-500 dark:text-slate-400 text-[11px]">
                          {isBreached ? (
                            <span
                              className={`font-medium ${
                                isCrit
                                  ? 'text-red-700 dark:text-red-300'
                                  : 'text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {evalResult.reason}
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
          <SmartExtendedLogsPanel
            drive={drive}
            isTauriRuntime={isTauriRuntime}
            refreshSignal={smartLogRefreshSignal}
          />
        </>
      )}
    </div>
  );
};
