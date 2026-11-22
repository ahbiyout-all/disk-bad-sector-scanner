import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ShieldAlert,
  Sparkles,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Cpu
} from 'lucide-react';
import { DiskDrive, DriveSanitizeCapability, SanitizeActionId } from '../types';
import {
  invokeTauriSanitizeOrTrim,
  isTauriDesktopRuntime,
  queryTauriRawSectorBytes,
  queryTauriSanitizeCapabilities
} from '../utils/nativeDriveEngine';
import {
  RecoveryWipePatternResult,
  RecoveryWipeVerifyResult,
  runRecoveryWipePatternGen,
  runRecoveryWipeVerify,
  WipePatternMode
} from '../utils/recoveryDllBridge';

interface SanitizeTrimModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  onRefreshHardware?: () => Promise<void> | void;
}

export const SanitizeTrimModal: React.FC<SanitizeTrimModalProps> = ({
  isOpen,
  onClose,
  drive,
  onRefreshHardware
}) => {
  const [cap, setCap] = useState<DriveSanitizeCapability | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedVolume, setSelectedVolume] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<SanitizeActionId | null>(null);
  const [serialInput, setSerialInput] = useState<string>('');
  const [executing, setExecuting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [wipePatternMode, setWipePatternMode] = useState<WipePatternMode>(3);
  const [wipeConstantHex, setWipeConstantHex] = useState<string>('A5');
  const [wipeSeedStr, setWipeSeedStr] = useState<string>('202604060001');
  const [wipeLbaOffset, setWipeLbaOffset] = useState<number>(0);
  const [wipeGenResult, setWipeGenResult] = useState<RecoveryWipePatternResult | null>(null);
  const [wipeVerifyResult, setWipeVerifyResult] = useState<RecoveryWipeVerifyResult | null>(null);
  const [wipeBusy, setWipeBusy] = useState<boolean>(false);

  const tauriActive = isTauriDesktopRuntime() && drive.id.startsWith('drive-tauri-physical-');

  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const capReqIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      capReqIdRef.current += 1;
    };
  }, []);

  const loadCapabilities = useCallback(async () => {
    const reqId = ++capReqIdRef.current;
    const reqDriveId = drive.id;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await queryTauriSanitizeCapabilities(drive);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== reqDriveId ||
        capReqIdRef.current !== reqId
      ) {
        return;
      }
      setCap(res);
      if (res.mountedVolumes.length > 0) {
        setSelectedVolume(prev =>
          res.mountedVolumes.includes(prev) ? prev : res.mountedVolumes[0]
        );
      } else {
        setSelectedVolume('');
      }
    } finally {
      if (
        isMountedRef.current &&
        activeDriveIdRef.current === reqDriveId &&
        capReqIdRef.current === reqId
      ) {
        setLoading(false);
      }
    }
  }, [drive]);

  useEffect(() => {
    capReqIdRef.current += 1;
    if (!isOpen) {
      setConfirmAction(null);
      setSerialInput('');
      setFeedback(null);
      setLoading(false);
      setWipeGenResult(null);
      setWipeVerifyResult(null);
      setWipeBusy(false);
      return;
    }
    setConfirmAction(null);
    setSerialInput('');
    setCap(null);
    setWipeGenResult(null);
    setWipeVerifyResult(null);
    void loadCapabilities();
  }, [isOpen, drive.id, loadCapabilities]);

  if (!isOpen) return null;

  const expectedSuffix = (() => {
    const raw = (cap?.serialNumber || drive.serialNumber || '').trim();
    if (raw.length >= 4) return raw.slice(-4);
    if (raw.length > 0) return raw;
    return `DRIVE${cap?.driveIndex ?? 0}`;
  })();

  const handleRunTrim = async () => {
    if (executing !== null) return;
    const reqDrive = drive;
    const reqDriveId = drive.id;
    setExecuting('volume_trim');
    setFeedback(null);
    try {
      const res = await invokeTauriSanitizeOrTrim(reqDrive, 'volume_trim', undefined, selectedVolume);
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setFeedback({ ok: res.success, message: res.message });
    } finally {
      if (isMountedRef.current) {
        setExecuting(null);
      }
    }
  };

  const handleConfirmDestructive = async () => {
    if (!confirmAction || confirmAction === 'volume_trim' || executing !== null) return;
    const reqDrive = drive;
    const reqDriveId = drive.id;
    const action = confirmAction;
    setExecuting(action);
    setFeedback(null);
    try {
      const res = await invokeTauriSanitizeOrTrim(reqDrive, action, serialInput.trim());
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setFeedback({ ok: res.success, message: res.message });
      if (res.success) {
        setConfirmAction(null);
        setSerialInput('');
        await loadCapabilities();
        await onRefreshHardware?.();
      }
    } finally {
      if (isMountedRef.current) {
        setExecuting(null);
      }
    }
  };

  const parseConstByte = () => {
    const parsed = parseInt(wipeConstantHex.trim().replace(/^0x/i, ''), 16);
    return Number.isFinite(parsed) ? parsed & 0xff : 0xa5;
  };

  const handleGenerateAndVerifyWipePattern = async () => {
    if (wipeBusy) return;
    const reqDriveId = drive.id;
    const secSize = drive.hardwareSpecs?.logicalSectorSize || 512;
    const constByte = parseConstByte();
    setWipeBusy(true);
    try {
      const gen = await runRecoveryWipePatternGen(
        secSize,
        wipePatternMode,
        constByte,
        wipeSeedStr,
        wipeLbaOffset
      );
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setWipeGenResult(gen);
      const ver = await runRecoveryWipeVerify(
        gen.bytes,
        wipePatternMode,
        constByte,
        wipeSeedStr,
        wipeLbaOffset
      );
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setWipeVerifyResult(ver);
    } finally {
      if (isMountedRef.current) setWipeBusy(false);
    }
  };

  const handleSimulateTamperCheck = async () => {
    if (wipeBusy || !wipeGenResult) return;
    const reqDriveId = drive.id;
    const constByte = parseConstByte();
    const tampered = [...wipeGenResult.bytes];
    const injectIdx = Math.min(17, Math.max(0, tampered.length - 1));
    tampered[injectIdx] = (tampered[injectIdx] ^ 0xff) & 0xff;
    setWipeBusy(true);
    try {
      const ver = await runRecoveryWipeVerify(
        tampered,
        wipePatternMode,
        constByte,
        wipeSeedStr,
        wipeLbaOffset
      );
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setWipeVerifyResult(ver);
    } finally {
      if (isMountedRef.current) setWipeBusy(false);
    }
  };

  const handleVerifyPhysicalLbaClean = async () => {
    if (wipeBusy || !tauriActive) return;
    const reqDrive = drive;
    const reqDriveId = drive.id;
    const constByte = parseConstByte();
    setWipeBusy(true);
    setFeedback(null);
    try {
      const rawRes = await queryTauriRawSectorBytes(reqDrive, Math.max(0, Math.floor(wipeLbaOffset)), 1);
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      if (!rawRes.supported || rawRes.bytes.length === 0) {
        setFeedback({
          ok: false,
          message: rawRes.reason || `LBA #${wipeLbaOffset} 물리 섹터를 판독할 수 없습니다.`
        });
        return;
      }
      const ver = await runRecoveryWipeVerify(
        rawRes.bytes,
        wipePatternMode,
        constByte,
        wipeSeedStr,
        wipeLbaOffset
      );
      if (!isMountedRef.current || !isOpenRef.current || activeDriveIdRef.current !== reqDriveId) {
        return;
      }
      setWipeVerifyResult(ver);
    } finally {
      if (isMountedRef.current) setWipeBusy(false);
    }
  };

  const isSystemBlocked = Boolean(cap?.isSystemDrive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  NVMe/ATA 보안 삭제(Sanitize/Format) &amp; SSD TRIM 최적화 센터
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {drive.model} · S/N {cap?.serialNumber || drive.serialNumber} · Protocol: {cap?.protocol || drive.hardwareSpecs?.busType || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={loading || executing !== null}
              onClick={() => void loadCapabilities()}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
              title="펌웨어 보안/TRIM 기능 재조회"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              disabled={executing !== null}
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {!tauriActive && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="text-[11px]">
                Windows 관리자 권한 Tauri 데스크톱 네이티브 IPC 환경에서만 실제 드라이브 보안 상태(Word 128 / NVMe OACS·FNA·SANICAP), 볼륨 TRIM(`defrag /L`), 보안 삭제를 실행할 수 있습니다.
              </div>
            </div>
          )}

          {isSystemBlocked && (
            <div className="p-3 rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <div className="space-y-0.5">
                <div className="font-bold">OS 시스템/부트 드라이브 영구 보호 가드 활성</div>
                <p className="text-[11px] opacity-90">
                  이 드라이브({cap?.mountedVolumes.join(', ') || 'PhysicalDrive0'})는 Windows 운영체제 부트 볼륨을 포함하고 있으므로, 아래 모든 파괴적 보안 삭제(Format NVM / ATA Secure Erase) 명령이 프론트엔드 및 Rust 백엔드에서 이중 차단됩니다.
                </p>
              </div>
            </div>
          )}

          {/* 1. SSD TRIM / Deallocate Optimization Panel (Safe) */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    비파괴 SSD TRIM / Unmap 성능 최적화 (안전 작업)
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    하드웨어 TRIM 지원: {cap?.trimSupported ? 'Supported' : '미지원/HDD'} · Windows DisableDeleteNotify: {cap?.osTrimEnabled === true ? 'TRIM Enabled (0)' : cap?.osTrimEnabled === false ? 'TRIM Disabled (1)' : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={selectedVolume}
                disabled={!tauriActive || (cap?.mountedVolumes.length || 0) === 0 || executing !== null}
                onChange={e => setSelectedVolume(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 disabled:opacity-40"
              >
                {cap && cap.mountedVolumes.length > 0 ? (
                  cap.mountedVolumes.map(vol => (
                    <option key={vol} value={vol}>
                      볼륨 {vol} (Slab ReTrim / TRIM 최적화)
                    </option>
                  ))
                ) : (
                  <option value="">마운트된 Windows 볼륨 없음</option>
                )}
              </select>

              <button
                type="button"
                disabled={!tauriActive || !selectedVolume || executing !== null}
                onClick={() => void handleRunTrim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{executing === 'volume_trim' ? 'TRIM 최적화 중...' : '볼륨 TRIM 즉시 실행'}</span>
              </button>
            </div>
          </div>

          {/* 2. Hardware Sanitize / Security Capabilities Telemetry */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <span className="font-bold text-slate-900 dark:text-white">
                컨트롤러 펌웨어 보안 삭제(Sanitize / Security Erase) 지원 매트릭스
              </span>
            </div>

            {cap?.protocol === 'NVMe' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">Format NVM (OACS Bit 1)</div>
                  <div className={`font-bold ${cap.nvmeFormat.formatSupported ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {cap.nvmeFormat.formatSupported ? 'SUPPORTED' : 'NO'}
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">Cryptographic Erase (FNA)</div>
                  <div className={`font-bold ${cap.nvmeFormat.cryptoEraseSupported ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {cap.nvmeFormat.cryptoEraseSupported ? 'SUPPORTED' : 'NO'}
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">SANICAP (Block/Crypto)</div>
                  <div className="font-bold text-indigo-500">
                    0x{cap.nvmeFormat.sanicapRaw.toString(16).toUpperCase().padStart(2, '0')}
                  </div>
                </div>
              </div>
            ) : cap?.protocol === 'ATA' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">ATA Security (Word 128)</div>
                  <div className={`font-bold ${cap.ataSecurity.supported ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {cap.ataSecurity.supported ? 'SUPPORTED' : 'NO'}
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">Security Frozen 상태</div>
                  <div className={`font-bold ${cap.ataSecurity.frozen ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {cap.ataSecurity.frozen ? 'FROZEN (동결)' : 'NOT FROZEN'}
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">Security Locked</div>
                  <div className={`font-bold ${cap.ataSecurity.locked ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`}>
                    {cap.ataSecurity.locked ? 'LOCKED' : 'UNLOCKED'}
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="text-[10px] text-slate-500 font-sans">예상 소요 시간</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {cap.ataSecurity.eraseTimeMin > 0 ? `${cap.ataSecurity.eraseTimeMin}분` : 'N/A'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Identify 패스스루가 차단되었거나 Tauri 데스크톱 핸들이 연결되지 않았습니다.
              </div>
            )}

            {/* Destructive Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                disabled={
                  !tauriActive ||
                  isSystemBlocked ||
                  cap?.protocol !== 'NVMe' ||
                  !cap?.nvmeFormat.formatSupported ||
                  executing !== null
                }
                onClick={() => {
                  setConfirmAction('nvme_format_user');
                  setSerialInput('');
                }}
                className="p-2.5 rounded-lg border border-red-500/40 bg-red-50/70 dark:bg-red-950/25 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>NVMe Format (User Erase)</span>
              </button>

              <button
                type="button"
                disabled={
                  !tauriActive ||
                  isSystemBlocked ||
                  cap?.protocol !== 'NVMe' ||
                  !cap?.nvmeFormat.cryptoEraseSupported ||
                  executing !== null
                }
                onClick={() => {
                  setConfirmAction('nvme_format_crypto');
                  setSerialInput('');
                }}
                className="p-2.5 rounded-lg border border-red-500/40 bg-red-50/70 dark:bg-red-950/25 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>NVMe Crypto Erase</span>
              </button>

              <button
                type="button"
                disabled={
                  !tauriActive ||
                  isSystemBlocked ||
                  cap?.protocol !== 'ATA' ||
                  !cap?.ataSecurity.supported ||
                  cap?.ataSecurity.frozen ||
                  executing !== null
                }
                onClick={() => {
                  setConfirmAction('ata_security_erase');
                  setSerialInput('');
                }}
                className="p-2.5 rounded-lg border border-red-500/40 bg-red-50/70 dark:bg-red-950/25 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ATA Security Erase Unit</span>
              </button>
            </div>
          </div>

          {/* 3. NIST SP 800-88 / Xoshiro256** Wipe Pattern & Read-Back Integrity Verifier */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    NIST SP 800-88 / Xoshiro256** 보안 소거 패턴 생성 &amp; 잔존 데이터 검증기
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    DiskSentinelRecovery.dll · 64-bit SplitMix64 + Xoshiro256** 결정적 PRNG 및 CRC32 무결성 검증
                  </div>
                </div>
              </div>
              {wipeVerifyResult && (
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                  {wipeVerifyResult.engineSource === 'native-cpp-dll'
                    ? 'DiskSentinelRecovery.dll'
                    : wipeVerifyResult.engineSource === 'rust-parity-fallback'
                    ? 'Recovery Rust Parity'
                    : 'TS Parity'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">패턴 모드</label>
                <select
                  value={wipePatternMode}
                  onChange={e => setWipePatternMode(Number(e.target.value) as WipePatternMode)}
                  disabled={wipeBusy}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100"
                >
                  <option value={0}>Mode 0 · 0x00 Zero-Fill</option>
                  <option value={1}>Mode 1 · 0xFF NAND Fill</option>
                  <option value={2}>Mode 2 · Constant Byte</option>
                  <option value={3}>Mode 3 · Xoshiro256** PRNG</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">고정 바이트 (Hex)</label>
                <input
                  type="text"
                  value={wipeConstantHex}
                  onChange={e => setWipeConstantHex(e.target.value)}
                  disabled={wipeBusy || wipePatternMode !== 2}
                  maxLength={4}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">64-bit PRNG Seed</label>
                <input
                  type="text"
                  value={wipeSeedStr}
                  onChange={e => setWipeSeedStr(e.target.value)}
                  disabled={wipeBusy || wipePatternMode !== 3}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">대상 LBA 오프셋</label>
                <input
                  type="number"
                  min={0}
                  value={wipeLbaOffset}
                  onChange={e => setWipeLbaOffset(Math.max(0, Number(e.target.value) || 0))}
                  disabled={wipeBusy}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums text-[11px] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={wipeBusy}
                onClick={() => void handleGenerateAndVerifyWipePattern()}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                패턴 버퍼 생성 &amp; 무결성 검증
              </button>
              <button
                type="button"
                disabled={wipeBusy || !wipeGenResult}
                onClick={() => void handleSimulateTamperCheck()}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                1바이트 변조 탐지 테스트
              </button>
              {tauriActive && (
                <button
                  type="button"
                  disabled={wipeBusy}
                  onClick={() => void handleVerifyPhysicalLbaClean()}
                  className="px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  실제 LBA #{wipeLbaOffset.toLocaleString()} Read-Back 검증
                </button>
              )}
            </div>

            {(wipeGenResult || wipeVerifyResult) && (
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono tabular-nums text-[11px] space-y-1">
                {wipeGenResult && (
                  <div className="text-slate-600 dark:text-slate-300 truncate">
                    생성 버퍼 ({wipeGenResult.bufferLength}B · CRC32 0x{wipeGenResult.crc32.toString(16).toUpperCase().padStart(8, '0')}):{' '}
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {wipeGenResult.previewBytes.slice(0, 16).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                    </span>
                  </div>
                )}
                {wipeVerifyResult && (
                  <div className={wipeVerifyResult.verifiedClean ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                    {wipeVerifyResult.verifiedClean
                      ? `검증 통과 (Verified Clean): ${wipeVerifyResult.checkedBytes}B 전수 일치 · 잔존 바이트 0건 · CRC32 0x${wipeVerifyResult.crc32.toString(16).toUpperCase().padStart(8, '0')}`
                      : `불일치 감지: ${wipeVerifyResult.residualNonMatchingBytes}바이트 잔존 (최초 오프셋 +0x${wipeVerifyResult.firstMismatchOffset.toString(16).toUpperCase()})`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2-Step Serial Confirmation Panel */}
          {confirmAction && !isSystemBlocked && (
            <div className="p-4 rounded-lg border border-red-500/60 bg-red-50 dark:bg-red-950/40 space-y-2.5">
              <div className="font-bold text-red-800 dark:text-red-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>경고: 대상 드라이브의 모든 데이터가 영구 소거되며 복구할 수 없습니다 ({confirmAction})</span>
              </div>
              <p className="text-[11px] text-red-700 dark:text-red-300">
                실행을 승인하려면 대상 드라이브 시리얼 번호 뒷자리 <strong className="font-mono underline">{expectedSuffix}</strong>를 아래에 정확히 입력하세요.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={serialInput}
                  onChange={e => setSerialInput(e.target.value)}
                  placeholder={`시리얼 뒷자리 (${expectedSuffix})`}
                  className="flex-1 px-3 py-1.5 rounded border border-red-400 dark:border-red-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={executing !== null || serialInput.trim().toUpperCase() !== expectedSuffix.toUpperCase()}
                  onClick={() => void handleConfirmDestructive()}
                  className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing ? '보안 삭제 실행 중...' : '영구 삭제 실행'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAction(null);
                    setSerialInput('');
                  }}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-lg border flex items-start gap-2 ${
                feedback.ok
                  ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : 'border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
              }`}
            >
              {feedback.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              )}
              <span className="text-[11px]">{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            OS Boot-Drive Hardware Guard &amp; 2-Step Serial Verification
          </span>
          <button
            type="button"
            disabled={executing !== null}
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-40"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
