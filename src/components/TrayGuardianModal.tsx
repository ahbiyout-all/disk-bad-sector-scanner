import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Bell, 
  Clock, 
  Thermometer, 
  Cpu, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Volume2, 
  Layers, 
  Settings2,
  Play,
  Pause
} from 'lucide-react';
import { DiskDrive } from '../types';
import { 
  DS_RunTrayGuardianCheck, 
  DS_ConfigureTrayGuardian, 
  DSTrayGuardianStatus 
} from '../utils/nativeDllBridge';

interface TrayGuardianModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  highestTemp?: number;
  hasBadSector?: boolean;
  onTriggerNotification?: (title: string, body: string) => void;
}

export const TrayGuardianModal: React.FC<TrayGuardianModalProps> = ({
  isOpen,
  onClose,
  drives,
  highestTemp = 41,
  hasBadSector = false,
  onTriggerNotification,
}) => {
  const [pollInterval, setPollInterval] = useState<number>(10);
  const [tempThreshold, setTempThreshold] = useState<number>(55);
  const [alertPending, setAlertPending] = useState<boolean>(true);
  const [isDaemonActive, setIsDaemonActive] = useState<boolean>(true);
  const [soundAlert, setSoundAlert] = useState<boolean>(true);
  const highestDrive = drives.length > 0 
    ? drives.reduce((prev, curr) => (curr.temperatureC > prev.temperatureC ? curr : prev), drives[0])
    : undefined;
  const effectiveHighestTemp = highestTemp || highestDrive?.temperatureC || 36;
  const effectiveDriveName = highestDrive?.name || highestDrive?.model || '로컬 디스크';

  const [status, setStatus] = useState<DSTrayGuardianStatus>(() =>
    DS_RunTrayGuardianCheck(effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName)
  );
  const [lastCheckTime, setLastCheckTime] = useState<string>(() =>
    new Date().toLocaleTimeString('ko-KR')
  );

  useEffect(() => {
    if (!isOpen || !isDaemonActive) return;

    DS_ConfigureTrayGuardian(pollInterval, tempThreshold, alertPending);
    const intervalId = setInterval(() => {
      const res = DS_RunTrayGuardianCheck(effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName);
      setStatus(res);
      setLastCheckTime(new Date().toLocaleTimeString('ko-KR'));
    }, pollInterval * 1000);

    return () => clearInterval(intervalId);
  }, [isOpen, isDaemonActive, pollInterval, tempThreshold, alertPending, effectiveHighestTemp, hasBadSector, drives.length, effectiveDriveName]);

  if (!isOpen) return null;

  const handleToggleDaemon = () => {
    setIsDaemonActive(prev => !prev);
  };

  const handleTestTrayAlert = () => {
    const title = '🛡️ DiskSentinel Pro 가디언 트레이 경보';
    const body = `[정기 진단 완료] 전체 ${drives.length}대 드라이브 S.M.A.R.T. 정상 (${effectiveDriveName}, 최고 온도: ${effectiveHighestTemp}°C, 백그라운드 상주 중)`;
    if (onTriggerNotification) {
      onTriggerNotification(title, body);
    }
  };

  const realMemoryUsageMb = typeof window !== 'undefined' && (performance as any)?.memory?.usedJSHeapSize
    ? ((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
    : '4.8';
  const realCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  시스템 트레이 경량 가디언 데몬
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
                초경량 백그라운드 스레드로 시스템 자원 점유 없이 디스크 건전성 항시 감시
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Status Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                데몬 상주 상태
              </div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isDaemonActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                {isDaemonActive ? '정상 작동' : '일시 정지'}
              </div>
              <div className="text-[9px] text-slate-400 mt-1 font-mono">
                {realCores} 스레드 | 힙 {realMemoryUsageMb}MB
              </div>
            </div>

            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mb-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                모니터링 최고온도
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                {status.highestTempCelsius}°C
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
              <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">
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
              <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                {drives.length}대 대상
              </div>
              <div className="text-[9px] text-slate-400 mt-1">
                S.M.A.R.T. 전체 추적
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
                  className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        PhysicalDrive{idx}: {d.name || d.model}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        {d.capacityGb}GB | {d.interface}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {d.temperatureC}°C
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                      건강도 {d.healthScore}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
