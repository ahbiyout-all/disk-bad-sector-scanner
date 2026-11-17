import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ShieldCheck,
  Clock,
  Thermometer,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Settings2,
  Play,
  Pause,
  BellRing,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';
import {
  DiskDrive,
  WatchdogRule,
  WatchdogRuleMetric,
  WatchdogTriggerEvent
} from '../types';
import {
  DS_RunTrayGuardianCheck,
  DS_RunNativeTrayGuardianPoll,
  DS_ConfigureTrayGuardian,
  DSTrayGuardianStatus
} from '../utils/nativeDllBridge';
import { soundManager } from '../utils/audio';

interface TrayGuardianModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  highestTemp?: number | null;
  hasBadSector?: boolean;
  onTriggerNotification?: (title: string, body: string) => void;
  watchdogRules?: WatchdogRule[];
  onUpdateWatchdogRules?: (rules: WatchdogRule[]) => void;
  watchdogEvents?: WatchdogTriggerEvent[];
  onClearWatchdogEvents?: () => void;
  onRunWatchdogNow?: () => void;
}

const METRIC_LABELS: Record<WatchdogRuleMetric, string> = {
  temp: '온도 상한 초과 (°C)',
  smart_05: '치환 섹터(05h) 증가',
  smart_c5: '보류 섹터(C5h) 발생',
  health_score: '건강도 하락 (이하 %)',
  scheduled_quick_scan: '정기 Quick Scan 예약'
};

export const TrayGuardianModal: React.FC<TrayGuardianModalProps> = ({
  isOpen,
  onClose,
  drives,
  highestTemp = null,
  hasBadSector = false,
  onTriggerNotification,
  watchdogRules = [],
  onUpdateWatchdogRules,
  watchdogEvents = [],
  onClearWatchdogEvents,
  onRunWatchdogNow
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'rules'>('live');
  const [pollInterval, setPollInterval] = useState<number>(10);
  const [tempThreshold, setTempThreshold] = useState<number>(55);
  const [alertPending, setAlertPending] = useState<boolean>(true);
  const [isDaemonActive, setIsDaemonActive] = useState<boolean>(true);
  const [soundAlert, setSoundAlert] = useState<boolean>(true);

  // New rule builder state
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newRuleDriveId, setNewRuleDriveId] = useState<string>('ALL');
  const [newRuleMetric, setNewRuleMetric] = useState<WatchdogRuleMetric>('temp');
  const [newRuleThreshold, setNewRuleThreshold] = useState<number>(58);
  const [newRuleIntervalMin, setNewRuleIntervalMin] = useState<number>(60);
  const [newRuleCooldownMin, setNewRuleCooldownMin] = useState<number>(30);

  // Extract genuine observed highest temperature across mounted drives (or null if none available)
  const validDriveTemps = drives
    .map(d => d.temperatureC)
    .filter((t): t is number => typeof t === 'number' && t > 0);
  const maxDriveTemp = validDriveTemps.length > 0 ? Math.max(...validDriveTemps) : null;
  const highestDrive = maxDriveTemp !== null
    ? drives.find(d => d.temperatureC === maxDriveTemp)
    : drives[0];

  const effectiveHighestTemp: number | null = maxDriveTemp !== null
    ? maxDriveTemp
    : (typeof highestTemp === 'number' && highestTemp > 0 ? highestTemp : null);
  const effectiveDriveName = highestDrive?.name || highestDrive?.model || '로컬 스토리지';

  const [status, setStatus] = useState<DSTrayGuardianStatus>(() =>
    DS_RunTrayGuardianCheck(effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName)
  );
  const [lastCheckTime, setLastCheckTime] = useState<string>(() =>
    new Date().toLocaleTimeString('ko-KR')
  );
  const prevAlertMessageRef = useRef<string>('');
  const drivesRef = useRef<DiskDrive[]>(drives);
  drivesRef.current = drives;

  useEffect(() => {
    DS_ConfigureTrayGuardian(pollInterval, tempThreshold, alertPending);
    if (!isDaemonActive) {
      setStatus({
        ...DS_RunTrayGuardianCheck(effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName),
        isMonitoringActive: false
      });
    }
  }, [pollInterval, tempThreshold, alertPending, isDaemonActive, effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName]);

  useEffect(() => {
    if (!isOpen || !isDaemonActive) return;

    let mounted = true;
    DS_ConfigureTrayGuardian(pollInterval, tempThreshold, alertPending);

    const runPoll = async () => {
      const res = await DS_RunNativeTrayGuardianPoll(drivesRef.current, hasBadSector);
      if (mounted) {
        setStatus(res);
        setLastCheckTime(new Date().toLocaleTimeString('ko-KR'));
        if (res.criticalAlertTriggered && soundAlert && res.lastAlertMessage !== prevAlertMessageRef.current) {
          soundManager.playWarningTone();
        }
        prevAlertMessageRef.current = res.lastAlertMessage;
      }
    };

    runPoll();
    const intervalId = setInterval(runPoll, pollInterval * 1000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [isOpen, isDaemonActive, pollInterval, tempThreshold, alertPending, soundAlert, hasBadSector, drives.length]);

  if (!isOpen) return null;

  const handleToggleDaemon = () => {
    setIsDaemonActive(prev => !prev);
  };

  const handleTestTrayAlert = () => {
    const title = '🛡️ Disk Bad Sector Scanner 가디언 트레이 경보';
    const tempDisplay = status.highestTempCelsius !== null ? `${status.highestTempCelsius}°C` : '센서 N/A';
    const body = `[정기 진단 완료] 전체 ${drives.length}대 드라이브 점검 (${effectiveDriveName}, 최고 온도: ${tempDisplay})`;
    if (soundAlert) {
      soundManager.playWarningTone();
    }
    if (onTriggerNotification) {
      onTriggerNotification(title, body);
    }
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateWatchdogRules) return;
    const safeThreshold = Number.isFinite(newRuleThreshold)
      ? Math.max(1, Math.round(newRuleThreshold))
      : 58;
    const safeInterval = Number.isFinite(newRuleIntervalMin)
      ? Math.max(5, Math.round(newRuleIntervalMin))
      : 60;
    const safeCooldown = Number.isFinite(newRuleCooldownMin)
      ? Math.max(1, Math.round(newRuleCooldownMin))
      : 30;
    const defaultLabel =
      newRuleMetric === 'scheduled_quick_scan'
        ? `정기 Quick Scan (${safeInterval}분 주기)`
        : `${METRIC_LABELS[newRuleMetric]} (${safeThreshold})`;

    const created: WatchdogRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newRuleName.trim() || defaultLabel,
      driveId: newRuleDriveId,
      metric: newRuleMetric,
      thresholdValue: safeThreshold,
      intervalMinutes: safeInterval,
      cooldownMinutes: safeCooldown,
      enabled: true
    };
    onUpdateWatchdogRules([created, ...watchdogRules]);
    setNewRuleName('');
  };

  const handleToggleRule = (ruleId: string) => {
    if (!onUpdateWatchdogRules) return;
    onUpdateWatchdogRules(
      watchdogRules.map(r => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!onUpdateWatchdogRules) return;
    onUpdateWatchdogRules(watchdogRules.filter(r => r.id !== ruleId));
  };

  const realMemoryUsageMb = typeof window !== 'undefined' && (performance as any)?.memory?.usedJSHeapSize
    ? ((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
    : null;
  const realCores = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;

  const activeRuleCount = watchdogRules.filter(r => r.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  시스템 트레이 경량 가디언 &amp; 이상 감시 워치독
                </h2>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  isDaemonActive
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-400/30'
                }`}>
                  {isDaemonActive ? '실시간 상주 활성' : '일시 중지됨'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Win32 S.M.A.R.T. 임계치 상시 워치독, 경보 룰셋 및 정기 Quick Scan 스케줄러
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Sub-Tab Bar */}
        <div className="px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-2">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'live'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>실시간 감시</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'rules'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>알림 규칙 &amp; 스케줄러</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/15 dark:bg-white/10">
                {activeRuleCount}
              </span>
            </button>
          </div>

          {activeTab === 'rules' && onRunWatchdogNow && (
            <button
              type="button"
              onClick={onRunWatchdogNow}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-indigo-500/40 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-[11px] font-bold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>규칙 즉시 평가</span>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {activeTab === 'live' && (
            <>
              {/* Status Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    데몬 상주 상태
                  </div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isDaemonActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {isDaemonActive ? '정상 작동' : '일시 정지'}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 font-mono">
                    {realCores !== null ? `${realCores} 스레드` : '스레드 N/A'} | {realMemoryUsageMb !== null ? `힙 ${realMemoryUsageMb}MB` : '힙 N/A'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                    모니터링 최고온도
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                    {status.highestTempCelsius !== null ? `${status.highestTempCelsius}°C` : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">
                    임계치: {tempThreshold}°C
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    폴링 주기
                  </div>
                  <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
                    {pollInterval}초 간격
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 font-mono">
                    최근 점검: {lastCheckTime}
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                    <Layers className="w-3.5 h-3.5 text-cyan-500" />
                    감시 드라이브 수
                  </div>
                  <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono tabular-nums">
                    {drives.length}대 대상
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">
                    연결된 장치 추적
                  </div>
                </div>
              </div>

              {/* Alert Status Banner */}
              <div className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                status.criticalAlertTriggered
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-500/50 text-red-700 dark:text-red-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
              }`}>
                <div className="flex items-center gap-2">
                  {status.criticalAlertTriggered ? (
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  <span className="font-medium text-xs">
                    {status.lastAlertMessage}
                  </span>
                </div>

                <button
                  onClick={handleTestTrayAlert}
                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors shrink-0 cursor-pointer"
                >
                  트레이 알림 테스트
                </button>
              </div>

              {/* Guardian Settings Form */}
              <div className="p-3.5 rounded-lg border bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  가디언 데몬 세부 감시 정책 설정
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                      S.M.A.R.T. 텔레메트리 폴링 주기
                    </label>
                    <select
                      value={pollInterval}
                      onChange={(e) => setPollInterval(Number(e.target.value))}
                      className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value={5}>5초 (초고감도 모니터링)</option>
                      <option value={10}>10초 (권장 기본값)</option>
                      <option value={30}>30초 (절전 모드)</option>
                      <option value={60}>60초 (최소 자원 점유)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                      고온 과열 경보 임계치 (°C)
                    </label>
                    <select
                      value={tempThreshold}
                      onChange={(e) => setTempThreshold(Number(e.target.value))}
                      className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value={50}>50°C (보수적 조기 경보)</option>
                      <option value={55}>55°C (표준 권장 임계치)</option>
                      <option value={60}>60°C (치명적 한계선)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={alertPending}
                      onChange={(e) => setAlertPending(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    재할당 대기 섹터(C5h) 발생 시 즉시 긴급 알림
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={soundAlert}
                      onChange={(e) => setSoundAlert(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    경보 발생 시 비프 사운드 재생
                  </label>
                </div>
              </div>

              {/* Monitored Drives List */}
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  실시간 감시 대상 드라이브 현황
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {drives.map((d, idx) => (
                    <div
                      key={d.id}
                      className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {d.hardwareSpecs?.devicePhysicalPath || `Drive #${idx}`}: {d.name || d.model}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-2">
                            {d.capacityGb !== null ? `${d.capacityGb}GB` : '용량 N/A'} | {d.interface}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right shrink-0">
                        <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {d.temperatureC !== null ? `${d.temperatureC}°C` : '온도 N/A'}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                          {d.healthScore !== null ? `건강도 ${d.healthScore}%` : '건강도 N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-4">
              {/* New Rule Form */}
              <form
                onSubmit={handleAddRule}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-3"
              >
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  <span>새 워치독 경보 규칙 / 정기 검사 스케줄 추가</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">규칙 이름</label>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={e => setNewRuleName(e.target.value)}
                      placeholder="예: NVMe 야간 빠른 검사 / 고온 감시"
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">대상 드라이브</label>
                    <select
                      value={newRuleDriveId}
                      onChange={e => setNewRuleDriveId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="ALL">전체 연결 드라이브 (ALL)</option>
                      {drives.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.model} ({d.hardwareSpecs?.devicePhysicalPath || d.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">감시 지표 / 작업</label>
                    <select
                      value={newRuleMetric}
                      onChange={e => setNewRuleMetric(e.target.value as WatchdogRuleMetric)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      {(Object.keys(METRIC_LABELS) as WatchdogRuleMetric[]).map(m => (
                        <option key={m} value={m}>
                          {METRIC_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {newRuleMetric === 'scheduled_quick_scan' ? (
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">실행 주기 (분)</label>
                        <input
                          type="number"
                          min={5}
                          max={10080}
                          value={newRuleIntervalMin}
                          onChange={e => setNewRuleIntervalMin(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">임계치</label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={newRuleThreshold}
                          onChange={e => setNewRuleThreshold(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">쿨다운 (분)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={newRuleCooldownMin}
                        onChange={e => setNewRuleCooldownMin(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>규칙 저장</span>
                  </button>
                </div>
              </form>

              {/* Active Rules List */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  등록된 워치독 정책 ({watchdogRules.length}개)
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {watchdogRules.map(rule => {
                    const targetLabel =
                      rule.driveId === 'ALL'
                        ? '전체 드라이브'
                        : drives.find(d => d.id === rule.driveId)?.model || rule.driveId;
                    return (
                      <div
                        key={rule.id}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {rule.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {METRIC_LABELS[rule.metric]}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            대상: {targetLabel} ·{' '}
                            {rule.metric === 'scheduled_quick_scan'
                              ? `매 ${rule.intervalMinutes}분마다 Quick Scan`
                              : `임계치 ${rule.thresholdValue} · 쿨다운 ${rule.cooldownMinutes}분`}
                            {rule.lastTriggeredAt
                              ? ` · 최근 발동 ${new Date(rule.lastTriggeredAt).toLocaleTimeString('ko-KR')}`
                              : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRule(rule.id)}
                            className={`px-2 py-1 rounded text-[10px] font-mono font-bold cursor-pointer ${
                              rule.enabled
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {rule.enabled ? 'ENABLED' : 'PAUSED'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                            title="규칙 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Trigger Event Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    최근 워치독 발동 이력 ({watchdogEvents.length}건)
                  </span>
                  {watchdogEvents.length > 0 && onClearWatchdogEvents && (
                    <button
                      type="button"
                      onClick={onClearWatchdogEvents}
                      className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      이력 비우기
                    </button>
                  )}
                </div>

                {watchdogEvents.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400">
                    아직 임계치를 초과하거나 스케줄러가 발동된 기록이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {watchdogEvents.map(ev => (
                      <div
                        key={ev.id}
                        className={`p-2 rounded border text-[11px] flex items-start justify-between gap-2 ${
                          ev.severity === 'critical'
                            ? 'border-red-500/30 bg-red-50/70 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                            : ev.severity === 'warning'
                            ? 'border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                            : 'border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold">{ev.message}</div>
                          <div className="text-[10px] opacity-75">규칙: {ev.ruleName}</div>
                        </div>
                        <span className="font-mono text-[10px] opacity-80 shrink-0">
                          {new Date(ev.triggeredAt).toLocaleTimeString('ko-KR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <button
            onClick={handleToggleDaemon}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              isDaemonActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isDaemonActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isDaemonActive ? '가디언 데몬 일시 정지' : '가디언 데몬 시작'}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-colors cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>

      </div>
    </div>
  );
};

