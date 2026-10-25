import React from 'react';
import { DiskDrive, ScanTelemetry } from '../types';
import { calculateHardwareVitals } from '../utils/hardwareTelemetry';
import { detectVendor, getVendorProfile, getDriveMediaAnalysis, getTailoredActionMethods } from '../utils/vendorDiagnostics';
import { TemperatureLineChart } from './TemperatureLineChart';
import { ShieldCheck, ShieldAlert, AlertTriangle, Thermometer, Clock, HardDrive, Cpu, CheckCircle2, AlertOctagon, RefreshCw, Usb, Zap, Disc, Wrench, Sparkles, ArrowRight } from 'lucide-react';

interface HealthSummaryDashboardProps {
  drive: DiskDrive;
  telemetry: ScanTelemetry;
  calculatedHealth: number;
  onRefreshSmart?: () => void;
  onOpenVendorModal?: () => void;
  onOpenRemapModal?: () => void;
  onOpenHardwareDetails?: () => void;
  isThermalStress?: boolean;
  viewMode?: 'all' | 'health_only' | 'smart_only';
}

export const HealthSummaryDashboard: React.FC<HealthSummaryDashboardProps> = ({
  drive,
  telemetry,
  calculatedHealth,
  onRefreshSmart,
  onOpenVendorModal,
  onOpenRemapModal,
  onOpenHardwareDetails,
  isThermalStress = false,
  viewMode = 'all'
}) => {
  const vendorKey = detectVendor(drive);
  const vendorProfile = getVendorProfile(vendorKey);
  const mediaAnalysis = getDriveMediaAnalysis(drive);
  const tailoredActions = getTailoredActionMethods(drive, telemetry);
  const vitals = calculateHardwareVitals(drive, telemetry, 1, isThermalStress);
  // Latency breakdown data
  const totalScanned = Math.max(1, telemetry.goodCount + telemetry.normalCount + telemetry.slowCount + telemetry.criticalCount + telemetry.badCount);
  const goodPct = ((telemetry.goodCount / totalScanned) * 100).toFixed(1);
  const normalPct = ((telemetry.normalCount / totalScanned) * 100).toFixed(1);
  const slowPct = ((telemetry.slowCount / totalScanned) * 100).toFixed(1);
  const criticalPct = ((telemetry.criticalCount / totalScanned) * 100).toFixed(1);
  const badPct = ((telemetry.badCount / totalScanned) * 100).toFixed(1);

  // Health level determination
  let healthColor = 'text-emerald-500 stroke-emerald-500';
  let healthBg = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
  let healthTitle = '정상 (Good)';
  let healthDesc = '디스크 물리적 표면 및 S.M.A.R.T. 건강 상태가 매우 양호합니다.';

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

  // Calculate SVG circular gauge metrics
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calculatedHealth / 100) * circumference;

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
              {/* Background circle */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="12"
                fill="transparent"
              />
              {/* Animated Progress Circle */}
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

            {/* Inner Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                {calculatedHealth}%
              </span>
              <span className="text-[11px] font-semibold mt-0.5 text-slate-500 dark:text-slate-400">
                {healthTitle}
              </span>
            </div>
          </div>

          <div className={`mt-1 px-2.5 py-1 rounded border text-[11px] font-medium ${healthBg}`}>
            {healthDesc}
          </div>
        </div>

        {/* Latency Distribution Histogram Graph Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                응답 속도 분포 요약 그래프
              </h3>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {telemetry.goodCount + telemetry.normalCount + telemetry.slowCount + telemetry.criticalCount + telemetry.badCount} 검사됨
              </span>
            </div>

            {/* Stacked Distribution Bar */}
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 mb-3 shadow-inner">
              <div style={{ width: `${goodPct}%` }} className="bg-emerald-500 h-full transition-all" title={`정상: ${goodPct}%`} />
              <div style={{ width: `${normalPct}%` }} className="bg-lime-500 h-full transition-all" title={`양호: ${normalPct}%`} />
              <div style={{ width: `${slowPct}%` }} className="bg-amber-500 h-full transition-all" title={`지연: ${slowPct}%`} />
              <div style={{ width: `${criticalPct}%` }} className="bg-orange-600 h-full transition-all" title={`위험: ${criticalPct}%`} />
              <div style={{ width: `${badPct}%` }} className="bg-red-600 h-full transition-all" title={`배드섹터: ${badPct}%`} />
            </div>

            {/* Distribution Rows */}
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
                <span className="font-mono text-slate-700 dark:text-slate-300">{drive.serialNumber}</span>
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
                  {drive.capacityGb} GB ({drive.totalSectors.toLocaleString()} LBA)
                </span>
              </div>
            </div>
          </div>

          {/* Compute hardware vitals */}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Thermometer className={`w-3.5 h-3.5 ${vitals.temperatureC > 45 ? 'text-amber-500' : 'text-blue-500'}`} />
              <div>
                <div className="text-[9px] uppercase font-semibold text-slate-500">작동 온도</div>
                <div className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">{vitals.temperatureC.toFixed(1)}°C</div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <div>
                <div className="text-[9px] uppercase font-semibold text-slate-500">소비 전력</div>
                <div className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">{vitals.powerWatts.toFixed(2)}W</div>
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
                  {drive.powerOnHours.toLocaleString()}h
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Hardware Specs Action Button */}
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
        isThermalStress={isThermalStress}
      />

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
              <strong>주요 컨트롤러:</strong> {vendorProfile.controllerFamily} • 
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

      {/* USB 2.0 Legacy Bottleneck & Power Advisory (if USB 2.0) */}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
              S.M.A.R.T. Self-Monitoring Attributes
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              드라이브 펌웨어가 기록한 실시간 하드웨어 신뢰성 지표
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
                <th className="px-2.5 py-2 text-center">상태</th>
                <th className="px-2.5 py-2 rounded-r">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
              {drive.smartAttributes.map((attr) => {
                const isCrit = attr.status === 'critical';
                const isWarn = attr.status === 'warning';

                return (
                  <tr
                    key={attr.id}
                    className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                      isCrit ? 'bg-red-950/20 font-semibold text-red-300' : ''
                    }`}
                  >
                    <td className="px-2.5 py-2 text-slate-500">
                      {attr.id.toString().padStart(2, '0')}
                    </td>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {attr.name}
                    </td>
                    <td className="px-2.5 py-2 text-center">{attr.current}</td>
                    <td className="px-2.5 py-2 text-center text-slate-500">{attr.worst}</td>
                    <td className="px-2.5 py-2 text-center text-slate-500">{attr.threshold}</td>
                    <td className="px-2.5 py-2 font-semibold text-slate-800 dark:text-slate-200">
                      {attr.raw}
                    </td>
                    <td className="px-2.5 py-2 text-center font-sans">
                      {isCrit ? (
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
                      {attr.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
