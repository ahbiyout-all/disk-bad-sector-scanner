import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiskDrive, DriveFeatureStatus } from '../types';
import {
  isSystemOrBootDrive,
  queryTauriDriveFeatures,
  invokeTauriSetAam,
  invokeTauriSetApm,
  invokeTauriSetWriteCache,
  invokeTauriSetReadLookAhead,
  invokeTauriSetStandbyTimer,
  invokeTauriSpindownNow
} from '../utils/nativeDriveEngine';
import {
  X,
  Sliders,
  Volume2,
  Zap,
  Clock,
  Power,
  HardDrive,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Database
} from 'lucide-react';

interface DriveFeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  onOpenSanitizeTrim?: () => void;
}

const STANDBY_PRESETS: { code: number; label: string }[] = [
  { code: 0, label: '0x00 · 타이머 해제 (Always Active)' },
  { code: 6, label: '0x06 · 30초 (5초 × 6)' },
  { code: 12, label: '0x0C · 1분 (5초 × 12)' },
  { code: 60, label: '0x3C · 5분 (5초 × 60)' },
  { code: 120, label: '0x78 · 10분 (5초 × 120)' },
  { code: 240, label: '0xF0 · 20분 (5초 × 240)' },
  { code: 241, label: '0xF1 · 30분 (Vendor Std)' },
  { code: 242, label: '0xF2 · 1시간' },
  { code: 244, label: '0xF4 · 2시간' }
];

export const DriveFeaturesModal: React.FC<DriveFeaturesModalProps> = ({
  isOpen,
  onClose,
  drive,
  onOpenSanitizeTrim
}) => {
  const [status, setStatus] = useState<DriveFeatureStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [aamLevel, setAamLevel] = useState<number>(192);
  const [apmLevel, setApmLevel] = useState<number>(128);
  const [standbyCode, setStandbyCode] = useState<number>(120);

  // 2-step confirmation for risky actions on OS boot/system drive
  const [confirmAction, setConfirmAction] = useState<'spindown' | 'disable_write_cache' | null>(null);

  const isBootDrive = isSystemOrBootDrive(drive);
  const driveRef = useRef<DiskDrive>(drive);
  driveRef.current = drive;
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const reqIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      reqIdRef.current += 1;
    };
  }, []);

  const loadFeatures = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    const targetDrive = driveRef.current;
    const targetDriveId = targetDrive.id;
    setLoading(true);
    try {
      const res = await queryTauriDriveFeatures(targetDrive);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        reqIdRef.current !== reqId
      ) {
        return;
      }
      setStatus(res);
      if (res.aamCurrent !== null && res.aamCurrent >= 128 && res.aamCurrent <= 254) {
        setAamLevel(res.aamCurrent);
      } else if (res.aamRecommended !== null && res.aamRecommended >= 128 && res.aamRecommended <= 254) {
        setAamLevel(res.aamRecommended);
      }
      if (res.apmCurrent !== null && res.apmCurrent >= 1 && res.apmCurrent <= 254) {
        setApmLevel(res.apmCurrent);
      }
    } finally {
      if (
        isMountedRef.current &&
        activeDriveIdRef.current === targetDriveId &&
        reqIdRef.current === reqId
      ) {
        setLoading(false);
      }
    }
  }, [drive.id]);

  useEffect(() => {
    reqIdRef.current += 1;
    if (!isOpen) {
      setLoading(false);
      setExecuting(null);
      return;
    }
    setStatus(null);
    setFeedback(null);
    setConfirmAction(null);
    void loadFeatures();
  }, [isOpen, drive.id, loadFeatures]);

  if (!isOpen) return null;

  const runCommand = async (
    key: string,
    fn: () => Promise<{ success: boolean; message: string }>
  ) => {
    if (executing !== null) return;
    const reqDriveId = drive.id;
    setExecuting(key);
    setFeedback(null);
    setConfirmAction(null);
    try {
      const res = await fn();
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setFeedback({ ok: res.success, text: res.message });
      if (res.success) {
        await loadFeatures();
      }
    } catch (err: any) {
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setFeedback({ ok: false, text: err?.message || '명령 실행 중 오류가 발생했습니다.' });
    } finally {
      if (isMountedRef.current) {
        setExecuting(null);
      }
    }
  };

  const powerModeLabel = (mode: DriveFeatureStatus['powerMode']) => {
    if (mode === 'active_idle') return { text: 'Active / Idle', cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
    if (mode === 'standby') return { text: 'Standby (Spun Down)', cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    if (mode === 'sleep') return { text: 'Sleep Mode', cls: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800' };
    return { text: 'Unknown / N/A', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  };

  const pmBadge = powerModeLabel(status?.powerMode ?? 'unknown');
  const ataAvailable = Boolean(status?.isAtaPassthroughAvailable);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs font-sans">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="ATA/NVMe 하드웨어 기능 제어"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  ATA / NVMe 하드웨어 기능 제어 (Features)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                  {status?.protocol || drive.hardwareSpecs?.busType || drive.type}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${pmBadge.cls}`}>
                  {pmBadge.text}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {drive.hardwareSpecs?.devicePhysicalPath || drive.model} · S/N: {drive.serialNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadFeatures()}
              disabled={loading || executing !== null}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
          {/* OS System Drive Warning */}
          {isBootDrive && (
            <div className="p-3 rounded-lg border border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">OS 시스템 / 부트 드라이브 보호 활성 ({drive.mountPoint || 'PhysicalDrive0'})</div>
                <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                  현재 선택된 드라이브에 운영체제 볼륨이 포함되어 있습니다. <strong>즉시 스핀다운(0xE0)</strong> 및 <strong>쓰기 캐시 비활성화(0x82)</strong>는 OS 응답 지연 또는 시스템 중단을 유발할 수 있으므로 2단계 확인 절차가 적용됩니다.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs ${
                feedback.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
              }`}
            >
              {feedback.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span className="font-mono text-[11px]">{feedback.text}</span>
            </div>
          )}

          {/* Unsupported / Non-Tauri / NVMe Notice */}
          {!loading && status && !ataAvailable && (
            <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  {status.protocol === 'NVMe'
                    ? 'NVMe 컨트롤러 — ATA AAM/APM/스핀다운 패스스루 대상 아님'
                    : 'Win32 ATA Pass-Through 제어 불가'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {status.reason ||
                  'AAM(음향 제어), APM(고급 전원 관리), 스핀다운 명령(0xEF / 0xE3 / 0xE0)은 ATA/SATA/USB-SAT 브릿지 장치용 Win32 IOCTL_ATA_PASS_THROUGH 환경(Tauri 데스크톱 앱 · Windows 관리자 권한)에서만 실행됩니다.'}
              </p>
            </div>
          )}

          {/* 1. AAM (Automatic Acoustic Management) */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    AAM · 자동 음향 관리 (ATA SET FEATURES 0x42 / 0xC2)
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {status?.aamSupported
                      ? `상태: ${status.aamEnabled ? '활성' : '비활성'} · 현재값 ${status.aamCurrent !== null ? `0x${status.aamCurrent.toString(16).toUpperCase().padStart(2, '0')} (${status.aamCurrent})` : 'N/A'} · 권장 ${status.aamRecommended !== null ? `0x${status.aamRecommended.toString(16).toUpperCase().padStart(2, '0')}` : 'N/A'}`
                      : '장치 지원 여부: 미지원 또는 조회 불가'}
                  </div>
                </div>
              </div>
              {status?.aamRecommended !== null && status?.aamRecommended !== undefined && (
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.aamSupported || executing !== null}
                  onClick={() => setAamLevel(Math.max(128, Math.min(254, status.aamRecommended!)))}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  권장값 (0x{status.aamRecommended.toString(16).toUpperCase().padStart(2, '0')})
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500">
                  <span>0x80 (128 · 저소음 Seek)</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    0x{aamLevel.toString(16).toUpperCase().padStart(2, '0')} ({aamLevel})
                  </span>
                  <span>0xFE (254 · 최고 성능)</span>
                </div>
                <input
                  type="range"
                  min={128}
                  max={254}
                  value={aamLevel}
                  disabled={!ataAvailable || !status?.aamSupported || executing !== null}
                  onChange={e => setAamLevel(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
                  aria-label="AAM 레벨 슬라이더"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.aamSupported || executing !== null}
                  onClick={() => void runCommand('aam-on', () => invokeTauriSetAam(drive, true, aamLevel))}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing === 'aam-on' ? '적용 중...' : '적용'}
                </button>
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.aamSupported || executing !== null}
                  onClick={() => void runCommand('aam-off', () => invokeTauriSetAam(drive, false, aamLevel))}
                  className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  해제
                </button>
              </div>
            </div>
          </div>

          {/* 2. APM (Advanced Power Management) */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    APM · 고급 전원 관리 (ATA SET FEATURES 0x05 / 0x85)
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {status?.apmSupported
                      ? `상태: ${status.apmEnabled ? '활성' : '비활성'} · 현재 레벨 ${status.apmCurrent !== null ? `0x${status.apmCurrent.toString(16).toUpperCase().padStart(2, '0')} (${status.apmCurrent})` : 'N/A'}`
                      : '장치 지원 여부: 미지원 또는 조회 불가'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {[
                  { val: 127, label: '127 (절전·스핀다운 허용)' },
                  { val: 192, label: '192 (균형)' },
                  { val: 254, label: '254 (최대 성능)' }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    disabled={!ataAvailable || !status?.apmSupported || executing !== null}
                    onClick={() => setApmLevel(p.val)}
                    className={`px-1.5 py-0.5 rounded border cursor-pointer disabled:opacity-40 ${
                      apmLevel === p.val
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500">
                  <span>0x01 (최대 절전)</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    0x{apmLevel.toString(16).toUpperCase().padStart(2, '0')} ({apmLevel})
                  </span>
                  <span>0xFE (254 · 최고 성능)</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={254}
                  value={apmLevel}
                  disabled={!ataAvailable || !status?.apmSupported || executing !== null}
                  onChange={e => setApmLevel(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
                  aria-label="APM 레벨 슬라이더"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.apmSupported || executing !== null}
                  onClick={() => void runCommand('apm-on', () => invokeTauriSetApm(drive, true, apmLevel))}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing === 'apm-on' ? '적용 중...' : '적용'}
                </button>
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.apmSupported || executing !== null}
                  onClick={() => void runCommand('apm-off', () => invokeTauriSetApm(drive, false, apmLevel))}
                  className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  해제
                </button>
              </div>
            </div>
          </div>

          {/* 3. Standby Idle Timer & Immediate Spin-Down */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    유휴 대기 타이머(0xE3) &amp; 즉시 스핀다운(0xE0)
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    ATA IDLE (0xE3) · STANDBY IMMEDIATE (0xE0) 전원 제어
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <select
                value={standbyCode}
                disabled={!ataAvailable || executing !== null}
                onChange={e => setStandbyCode(Number(e.target.value))}
                className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px] text-slate-900 dark:text-slate-100 disabled:opacity-40"
                aria-label="스탠바이 타이머 프리셋"
              >
                {STANDBY_PRESETS.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!ataAvailable || executing !== null}
                onClick={() => void runCommand('timer', () => invokeTauriSetStandbyTimer(drive, standbyCode))}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {executing === 'timer' ? '설정 중...' : '타이머 적용'}
              </button>
              <button
                type="button"
                disabled={!ataAvailable || executing !== null}
                onClick={() => {
                  if (isBootDrive && confirmAction !== 'spindown') {
                    setConfirmAction('spindown');
                    return;
                  }
                  void runCommand('spindown', () => invokeTauriSpindownNow(drive));
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-red-500/50 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{executing === 'spindown' ? '스핀다운 중...' : '즉시 스핀다운'}</span>
              </button>
            </div>

            {confirmAction === 'spindown' && (
              <div className="p-2.5 rounded border border-red-500/50 bg-red-50 dark:bg-red-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] text-red-800 dark:text-red-200 font-semibold">
                  OS 드라이브 스핀다운 시 순간 멈춤이 발생할 수 있습니다. 계속 실행할까요?
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void runCommand('spindown', () => invokeTauriSpindownNow(drive))}
                    className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] cursor-pointer"
                  >
                    확인 후 스핀다운
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Write Cache & Read Look-Ahead */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">쓰기 캐시 (Write Cache)</span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                    status?.writeCacheEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {status?.writeCacheSupported ? (status.writeCacheEnabled ? 'ON (0x02)' : 'OFF (0x82)') : 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.writeCacheSupported || executing !== null}
                  onClick={() => void runCommand('wc-on', () => invokeTauriSetWriteCache(drive, true))}
                  className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  활성화 (0x02)
                </button>
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.writeCacheSupported || executing !== null}
                  onClick={() => {
                    if (isBootDrive && confirmAction !== 'disable_write_cache') {
                      setConfirmAction('disable_write_cache');
                      return;
                    }
                    void runCommand('wc-off', () => invokeTauriSetWriteCache(drive, false));
                  }}
                  className="flex-1 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  비활성화 (0x82)
                </button>
              </div>
              {confirmAction === 'disable_write_cache' && (
                <div className="p-2 rounded border border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 space-y-1.5">
                  <div className="text-[10px] text-amber-900 dark:text-amber-200 font-semibold">
                    시스템 드라이브 쓰기 캐시 해제는 I/O 성능 저하를 유발합니다. 진행할까요?
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void runCommand('wc-off', () => invokeTauriSetWriteCache(drive, false))}
                      className="px-2 py-1 rounded bg-amber-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      해제 실행
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[10px] cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-sky-500" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">선행 판독 (Read Look-Ahead)</span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                    status?.readLookAheadEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {status?.readLookAheadSupported ? (status.readLookAheadEnabled ? 'ON (0xAA)' : 'OFF (0x55)') : 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.readLookAheadSupported || executing !== null}
                  onClick={() => void runCommand('rl-on', () => invokeTauriSetReadLookAhead(drive, true))}
                  className="flex-1 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  활성화 (0xAA)
                </button>
                <button
                  type="button"
                  disabled={!ataAvailable || !status?.readLookAheadSupported || executing !== null}
                  onClick={() => void runCommand('rl-off', () => invokeTauriSetReadLookAhead(drive, false))}
                  className="flex-1 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  비활성화 (0x55)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Win32 IOCTL_ATA_PASS_THROUGH Direct Control
          </span>
          <div className="flex items-center gap-2">
            {onOpenSanitizeTrim && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSanitizeTrim();
                }}
                className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 font-bold cursor-pointer"
              >
                보안 삭제 / TRIM 센터...
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
