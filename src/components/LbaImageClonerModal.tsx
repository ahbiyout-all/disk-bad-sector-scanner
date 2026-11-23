import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  HardDrive,
  Play,
  Pause,
  RotateCcw,
  Save,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Layers,
  Eraser,
  RefreshCw,
  Activity
} from 'lucide-react';
import {
  DdrescueBackendStatus,
  DdrescueRetryEvent,
  DiskDrive,
  LbaCloneSessionState,
  PartitionEntryRecord
} from '../types';
import {
  createInitialCloneSession,
  getDefaultClonePaths,
  parseCloneMapJson,
  serializeCloneMapJson,
  summarizeCloneStats,
  validateCloneOutputPath
} from '../utils/lbaImageCloner';
import {
  invokeTauriCopyLbaChunk,
  invokeTauriLoadCloneMap,
  invokeTauriPauseDdrescueBackup,
  invokeTauriSaveCloneMap,
  invokeTauriStartDdrescueBackup,
  isTauriDesktopRuntime,
  queryTauriDdrescueBackupStatus,
  queryTauriRawSectorRange
} from '../utils/nativeDriveEngine';
import {
  RecoveryDdrescuePlanResult,
  runRecoveryDdrescuePlan
} from '../utils/recoveryDllBridge';
import { parsePartitionTableFromRawBytes } from '../utils/partitionParser';

interface LbaImageClonerModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  initialRange?: { startLba: number; endLba: number } | null;
  isInline?: boolean;
}

export const LbaImageClonerModal: React.FC<LbaImageClonerModalProps> = ({
  isOpen,
  onClose,
  drive,
  initialRange,
  isInline = false
}) => {
  const maxLba = Math.max(0, (drive.totalSectors || 2048) - 1);
  const sectorSize = drive.hardwareSpecs?.logicalSectorSize || 512;

  const [startLbaInput, setStartLbaInput] = useState<string>('0');
  const [endLbaInput, setEndLbaInput] = useState<string>('2047');
  const [chunkSectors, setChunkSectors] = useState<number>(128);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [autoZeroFillBad, setAutoZeroFillBad] = useState<boolean>(false);
  const [outputPath, setOutputPath] = useState<string>('');
  const [mapPath, setMapPath] = useState<string>('');
  const [partitions, setPartitions] = useState<PartitionEntryRecord[]>([]);
  const [session, setSession] = useState<LbaCloneSessionState | null>(null);
  const [backendStatus, setBackendStatus] = useState<DdrescueBackendStatus | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isZeroFilling, setIsZeroFilling] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryPlan, setRecoveryPlan] = useState<RecoveryDdrescuePlanResult | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const planReqIdRef = useRef<number>(0);
  const tauriActive = isTauriDesktopRuntime() && drive.id.startsWith('drive-tauri-physical-');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const syncSnapshotToSession = (snap: DdrescueBackendStatus) => {
    setBackendStatus(snap);
    setSession({
      version: 2,
      driveId: `drive-tauri-physical-${snap.driveIndex}`,
      driveModel: snap.driveModel || drive.model,
      driveSerial: snap.driveSerial || drive.serialNumber,
      sectorSize: snap.sectorSize || sectorSize,
      rangeStartLba: snap.rangeStartLba,
      rangeEndLba: snap.rangeEndLba,
      outputPath: snap.outputPath,
      mapPath: snap.mapPath,
      phase: snap.phase === 'error' ? 'paused' : snap.phase,
      chunkSectors: snap.chunkSectors,
      copiedSectors: snap.finishedSectors,
      badSectors: snap.badSectors,
      retriedSectors: snap.totalRetryAttempts,
      bytesWritten: snap.bytesWritten,
      startedAt: Date.now() - snap.elapsedMs,
      updatedAt: Date.now(),
      intervals: snap.intervals
    });
  };

  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const sLba = initialRange ? Math.max(0, Math.floor(initialRange.startLba)) : 0;
    const defaultSpan = Math.min(maxLba, sLba + 16383);
    const eLba = initialRange ? Math.max(sLba, Math.min(maxLba, Math.floor(initialRange.endLba))) : defaultSpan;

    setStartLbaInput(String(sLba));
    setEndLbaInput(String(eLba));

    const defaults = getDefaultClonePaths(drive, sLba, eLba);
    setOutputPath(defaults.outputPath);
    setMapPath(defaults.mapPath);
    setSession(null);
    setBackendStatus(null);
    setRecoveryPlan(null);
    setStatusMessage(null);
    setErrorMessage(null);

    let cancelled = false;
    if (tauriActive) {
      const parsedIdx = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
      const expectedIdx = Number.isNaN(parsedIdx) ? null : parsedIdx;
      void (async () => {
        const [rangeRes, liveSnap] = await Promise.all([
          queryTauriRawSectorRange(drive, 0, 34),
          queryTauriDdrescueBackupStatus()
        ]);
        if (cancelled || !isMountedRef.current) return;
        if (rangeRes.supported && rangeRes.bytes.length >= 512) {
          const parsed = parsePartitionTableFromRawBytes(rangeRes.bytes, rangeRes.sectorSize || 512);
          setPartitions(parsed.entries);
        } else {
          setPartitions([]);
        }
        if (
          liveSnap &&
          liveSnap.isRunning &&
          (expectedIdx === null || liveSnap.driveIndex === expectedIdx)
        ) {
          syncSnapshotToSession(liveSnap);
          setIsRunning(true);
        } else {
          setIsRunning(false);
        }
      })();
    } else {
      setPartitions([]);
      setIsRunning(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, drive.id, initialRange, maxLba, tauriActive]);

  useEffect(() => {
    if (!isRunning || !isOpen || !tauriActive) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const snap = await queryTauriDdrescueBackupStatus();
      if (!snap) return;
      syncSnapshotToSession(snap);

      if (!snap.isRunning) {
        setIsRunning(false);
        if (snap.phase === 'completed') {
          setStatusMessage(
            `다중 패스 백업 완료 — 복구 ${snap.finishedSectors.toLocaleString()} 섹터 (재시도 구출 ${snap.rescuedOnRetrySectors.toLocaleString()}건, 영구 BAD ${snap.badSectors.toLocaleString()}건)`
          );
        } else if (snap.phase === 'paused') {
          setStatusMessage('Tauri 백엔드 백업이 일시 정지되었으며 .map.json이 저장되었습니다.');
        } else if (snap.phase === 'error') {
          setErrorMessage(snap.lastError || 'ddrescue 백엔드 작업 중 오류가 발생했습니다.');
        }
      }
    };

    pollTimerRef.current = setInterval(() => {
      void poll();
    }, 150);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isRunning, isOpen, tauriActive]);

  useEffect(() => {
    const reqId = ++planReqIdRef.current;
    const reqDriveId = drive.id;
    if (!isOpen || !session || session.intervals.length === 0) {
      setRecoveryPlan(null);
      return;
    }
    void runRecoveryDdrescuePlan(session.intervals, chunkSectors).then(plan => {
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== reqDriveId ||
        planReqIdRef.current !== reqId
      ) {
        return;
      }
      setRecoveryPlan(plan);
    });
  }, [isOpen, drive.id, session, chunkSectors]);

  const pathValidation = useMemo(
    () => validateCloneOutputPath(drive, outputPath),
    [drive, outputPath]
  );

  const stats = useMemo(
    () => (session ? summarizeCloneStats(session) : null),
    [session]
  );

  const multiPassMetrics = useMemo(() => {
    const total = backendStatus?.totalSectors || stats?.totalSectors || Math.max(1, (Number(endLbaInput) || 0) - (Number(startLbaInput) || 0) + 1);
    const nonTried = backendStatus?.nonTriedSectors ?? stats?.nonTriedSectors ?? total;
    const nonTrimmed = backendStatus?.nonTrimmedSectors ?? stats?.nonTrimmedSectors ?? 0;
    const nonScraped = backendStatus?.nonScrapedSectors ?? stats?.nonScrapedSectors ?? 0;

    // Pass 1 completion = fraction of range no longer in `non_tried`
    const pass1Done = Math.max(0, total - nonTried);
    const pass1Pct = total > 0 ? Math.min(100, Number(((pass1Done / total) * 100).toFixed(1))) : 0;

    // Pass 2 completion = once pass 1 finishes or trimming starts, fraction resolved out of trimmed pool
    const pass2Attempted = backendStatus?.pass2AttemptedSectors ?? 0;
    const pass2Pool = pass2Attempted + nonTrimmed;
    const pass2Pct =
      nonTried === 0 && nonTrimmed === 0 && total > 0 && session
        ? 100
        : pass2Pool > 0
        ? Math.min(100, Number(((pass2Attempted / pass2Pool) * 100).toFixed(1)))
        : 0;

    // Pass 3 completion = fraction of scraping sectors attempted/resolved
    const pass3Attempted = backendStatus?.pass3AttemptedSectors ?? 0;
    const pass3Pool = pass3Attempted + nonScraped;
    const pass3Pct =
      nonTried === 0 && nonTrimmed === 0 && nonScraped === 0 && total > 0 && session
        ? 100
        : pass3Pool > 0
        ? Math.min(100, Number(((pass3Attempted / pass3Pool) * 100).toFixed(1)))
        : 0;

    const totalRetries = backendStatus?.totalRetryAttempts ?? session?.retriedSectors ?? 0;
    const rescuedOnRetry = backendStatus?.rescuedOnRetrySectors ?? 0;
    const retryEvents: DdrescueRetryEvent[] = backendStatus?.recentEvents ? [...backendStatus.recentEvents].reverse() : [];

    return {
      pass1Pct,
      pass1Rescued: backendStatus?.pass1RescuedSectors ?? stats?.finishedSectors ?? 0,
      pass2Pct,
      pass2Rescued: backendStatus?.pass2RescuedSectors ?? 0,
      pass2Queued: nonTrimmed,
      pass3Pct,
      pass3Queued: nonScraped,
      totalRetries,
      rescuedOnRetry,
      retryEvents
    };
  }, [backendStatus, stats, session, startLbaInput, endLbaInput]);

  if (!isOpen) return null;

  const parsedStart = Math.max(0, Math.min(maxLba, Math.floor(Number(startLbaInput) || 0)));
  const parsedEnd = Math.max(parsedStart, Math.min(maxLba, Math.floor(Number(endLbaInput) || parsedStart)));
  const rangeSectorCount = parsedEnd - parsedStart + 1;
  const estimatedSizeMb = ((rangeSectorCount * sectorSize) / (1024 * 1024)).toFixed(2);

  const handleLoadMap = async () => {
    setErrorMessage(null);
    const res = await invokeTauriLoadCloneMap(mapPath);
    if (!res.ok || !res.jsonContent) {
      setErrorMessage(res.error || '맵 파일을 불러올 수 없습니다.');
      return;
    }
    const loaded = parseCloneMapJson(res.jsonContent);
    if (!loaded) {
      setErrorMessage('유효한 ddrescue 복제 맵 JSON 형식이 아닙니다.');
      return;
    }
    const plan = await runRecoveryDdrescuePlan(loaded.intervals, loaded.chunkSectors || chunkSectors);
    setStartLbaInput(String(loaded.rangeStartLba));
    setEndLbaInput(String(loaded.rangeEndLba));
    setOutputPath(loaded.outputPath);
    setMapPath(loaded.mapPath);
    setChunkSectors(loaded.chunkSectors);
    setBackendStatus(null);
    setRecoveryPlan(plan);
    setSession({
      ...loaded,
      phase: plan.completed ? 'completed' : 'paused',
      intervals: plan.intervals.length > 0 ? plan.intervals : loaded.intervals
    });
    setStatusMessage(
      `복제 맵 로드 완료 — 구간 ${loaded.intervals.length}개 → ${plan.coalescedIntervalCount}개 병합 복원 (${plan.suggestedPhase})`
    );
  };

  const handleSaveMap = async () => {
    if (!session) return;
    const res = await invokeTauriSaveCloneMap(session.mapPath || mapPath, serializeCloneMapJson(session));
    if (res.ok) {
      setStatusMessage(`복제 상태 맵 저장됨: ${session.mapPath || mapPath}`);
    } else if (res.error) {
      setErrorMessage(res.error);
    }
  };

  const handleStartBackendDdrescue = async (resumeExisting = false) => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!tauriActive) {
      setErrorMessage(
        'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 물리 섹터를 .img 파일로 직접 복제할 수 있습니다.'
      );
      return;
    }

    if (!pathValidation.valid) {
      setErrorMessage(pathValidation.reason || '출력 경로가 유효하지 않습니다.');
      return;
    }

    const baseSession =
      resumeExisting && session
        ? session
        : createInitialCloneSession(drive, parsedStart, parsedEnd, outputPath, mapPath, chunkSectors);

    const res = await invokeTauriStartDdrescueBackup({
      drive,
      rangeStartLba: baseSession.rangeStartLba,
      rangeEndLba: baseSession.rangeEndLba,
      outputPath: baseSession.outputPath,
      mapPath: baseSession.mapPath,
      chunkSectors,
      maxRetries,
      zeroFillBad: autoZeroFillBad,
      resumeIntervals: resumeExisting && session ? session.intervals : undefined
    });

    if (!res.ok || !res.status) {
      setErrorMessage(res.error || 'ddrescue 백엔드 엔진 시작에 실패했습니다.');
      return;
    }

    syncSnapshotToSession(res.status);
    setIsRunning(true);
  };

  const handlePauseBackendDdrescue = async () => {
    const res = await invokeTauriPauseDdrescueBackup();
    if (res.ok && res.status) {
      syncSnapshotToSession(res.status);
    }
  };

  const handleZeroFillBadSectors = async () => {
    if (!session || !tauriActive || isRunning || isZeroFilling) return;
    const badIntervals = session.intervals.filter(iv => iv.status === 'bad_sector');
    if (badIntervals.length === 0) return;

    setIsZeroFilling(true);
    setErrorMessage(null);
    let filledCount = 0;
    let failedCount = 0;
    try {
      for (const iv of badIntervals) {
        let rem = iv.sectorCount;
        let cursor = iv.startLba;
        while (rem > 0) {
          if (!isMountedRef.current || !isOpenRef.current) return;
          const chunk = Math.min(2048, rem);
          const destOffset = (cursor - session.rangeStartLba) * session.sectorSize;
          const res = await invokeTauriCopyLbaChunk(
            drive,
            cursor,
            chunk,
            session.outputPath,
            destOffset,
            true
          );
          if (!isMountedRef.current || !isOpenRef.current) return;
          if (res.success) {
            filledCount += chunk;
          } else {
            failedCount += chunk;
          }
          cursor += chunk;
          rem -= chunk;
        }
      }
      if (!isMountedRef.current || !isOpenRef.current) return;
      if (failedCount > 0) {
        setErrorMessage(`일부 불량 구간(${failedCount.toLocaleString()} 섹터)에 0x00 패딩을 기록하지 못했습니다.`);
      }
      if (filledCount > 0) {
        setStatusMessage(`복구 불가 BAD 섹터 ${filledCount.toLocaleString()}개 영역에 0x00 패딩을 기록했습니다.`);
      }
    } finally {
      if (isMountedRef.current) {
        setIsZeroFilling(false);
      }
    }
  };

  const currentPhase = backendStatus?.phase || session?.phase || 'idle';
  const renderPhaseBadge = (phase: string) => {
    switch (phase) {
      case 'copying':
        return 'Pass 1 · 고속 순방향 복사 (Copying)';
      case 'trimming':
        return 'Pass 2 · 결함 경계 분할 (Trimming)';
      case 'retrying':
        return 'Pass 3 · 단일 섹터 정밀 스크래핑 & 재시도 (Retrying)';
      case 'completed':
        return '완료 (Completed)';
      case 'paused':
        return '일시 정지 (Paused)';
      case 'error':
        return '오류 중단 (Error)';
      default:
        return '대기 중 (Ready)';
    }
  };

  const elapsedSec = backendStatus ? (backendStatus.elapsedMs / 1000).toFixed(1) : '0.0';
  const writtenMb = session ? (session.bytesWritten / (1024 * 1024)).toFixed(2) : '0.00';

  return (
    <div
      className={
        isInline
          ? 'w-full font-sans'
          : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto'
      }
    >
      <div
        className={
          isInline
            ? 'relative w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col font-sans'
            : 'relative w-full max-w-5xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md shadow-xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  ddrescue 다중 패스 LBA 이미지 백업 &amp; 섹터 구출
                </h2>
                <span className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                  · Tauri Native Thread Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {drive.model} · S/N {drive.serialNumber} · Max LBA #{maxLba.toLocaleString()} ({sectorSize} B/sector)
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={() => {
                if (!isRunning) onClose();
              }}
              disabled={isRunning}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`p-4 sm:p-5 space-y-4 text-xs ${isInline ? '' : 'overflow-y-auto'}`}>
          {!tauriActive && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <div className="font-bold">Tauri 데스크톱 네이티브 IPC 필요</div>
                <p className="text-[11px] opacity-90">
                  현재 웹 브라우저 미리보기 환경에서는 물리 디스크 핸들에 접근할 수 없습니다. Windows 관리자 권한으로 실행된 Tauri 데스크톱 앱에서 백엔드 스레드 ddrescue 복제와 .map.json 이어받기가 실행됩니다.
                </p>
              </div>
            </div>
          )}

          {/* Quick Partition Presets */}
          {partitions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                탐지된 파티션 범위 빠른 선택 (LBA 0~33 GPT/MBR)
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {partitions.map(part => (
                  <button
                    key={`${part.index}-${part.startLba}`}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      const s = part.startLba;
                      const e = part.endLba;
                      setStartLbaInput(String(s));
                      setEndLbaInput(String(e));
                      const d = getDefaultClonePaths(drive, s, e);
                      setOutputPath(d.outputPath);
                      setMapPath(d.mapPath);
                    }}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-blue-500 text-[11px] font-mono text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-40"
                  >
                    #{part.index} {part.name} ({part.sizeGb}GB · LBA {part.startLba.toLocaleString()}~{part.endLba.toLocaleString()})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Range, Chunk, Retry Policy & Output Paths */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                시작 LBA
              </label>
              <input
                type="number"
                min={0}
                max={maxLba}
                disabled={isRunning}
                value={startLbaInput}
                onChange={e => setStartLbaInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                종료 LBA (예상 {estimatedSizeMb} MB)
              </label>
              <input
                type="number"
                min={0}
                max={maxLba}
                disabled={isRunning}
                value={endLbaInput}
                onChange={e => setEndLbaInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Pass 1 청크 크기
              </label>
              <select
                value={chunkSectors}
                disabled={isRunning}
                onChange={e => setChunkSectors(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={64}>64 Sectors (32 KB)</option>
                <option value={128}>128 Sectors (64 KB)</option>
                <option value={512}>512 Sectors (256 KB)</option>
                <option value={2048}>2048 Sectors (1 MB)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Pass 3 최대 재시도 (Max Retries)
              </label>
              <select
                value={maxRetries}
                disabled={isRunning}
                onChange={e => setMaxRetries(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={1}>1회 (빠른 격리)</option>
                <option value={2}>2회 재시도</option>
                <option value={3}>3회 재시도 (표준)</option>
                <option value={4}>4회 재시도</option>
                <option value={5}>5회 정밀 재시도</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                대상 이미지 출력 경로 (.img — 반드시 다른 물리 드라이브에 저장)
              </label>
              <input
                type="text"
                disabled={isRunning}
                value={outputPath}
                onChange={e => {
                  setOutputPath(e.target.value);
                  setMapPath(`${e.target.value.trim()}.map.json`);
                }}
                placeholder="D:\DiskSentinel_Recovery\disk_rescue.img"
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                이어받기 도메인 맵 (.map.json)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  disabled={isRunning}
                  value={mapPath}
                  onChange={e => setMapPath(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={isRunning || !tauriActive}
                  onClick={() => void handleLoadMap()}
                  title="기존 .map.json 복제 세션 불러오기"
                  className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-40"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="md:col-span-4 flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isRunning}
                  checked={autoZeroFillBad}
                  onChange={e => setAutoZeroFillBad(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>최대 재시도 실패 섹터에 자동으로 0x00 패딩 기록 (파일시스템 이미지 오프셋 정렬 유지)</span>
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                대상: {rangeSectorCount.toLocaleString()} Sectors
              </span>
            </div>
          </div>

          {!pathValidation.valid && (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{pathValidation.reason}</span>
            </div>
          )}

          {/* Multi-Pass Rescue Pipeline & Progress Visualization */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-500" />
                <span className="font-bold text-slate-900 dark:text-white">
                  {renderPhaseBadge(currentPhase)}
                </span>
                {backendStatus && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                    LBA #{backendStatus.currentLba.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">{writtenMb} MB</span>
                <span className="text-slate-500 dark:text-slate-400">{elapsedSec}s</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  {backendStatus ? `${backendStatus.throughputMbSec.toFixed(1)} MB/s` : '0.0 MB/s'}
                </span>
                <span className="text-slate-900 dark:text-white font-bold">
                  {stats ? `${stats.rescuedPct}%` : '0.00%'}
                </span>
              </div>
            </div>

            {/* 3-Pass Dedicated Pipeline Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {/* Pass 1 */}
              <div className={`p-3 rounded-lg border transition-colors ${
                currentPhase === 'copying'
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    Pass 1 · 고속 복사 (Copying)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                    {multiPassMetrics.pass1Pct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${multiPassMetrics.pass1Pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>성공: {multiPassMetrics.pass1Rescued.toLocaleString()} sec</span>
                  <span>청크: {chunkSectors}</span>
                </div>
              </div>

              {/* Pass 2 */}
              <div className={`p-3 rounded-lg border transition-colors ${
                currentPhase === 'trimming'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    Pass 2 · 경계 분할 (Trimming)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                    {multiPassMetrics.pass2Pct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-amber-500 transition-all duration-200"
                    style={{ width: `${multiPassMetrics.pass2Pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>분할 구출: {multiPassMetrics.pass2Rescued.toLocaleString()} sec</span>
                  <span>대기: {multiPassMetrics.pass2Queued.toLocaleString()}</span>
                </div>
              </div>

              {/* Pass 3 */}
              <div className={`p-3 rounded-lg border transition-colors ${
                currentPhase === 'retrying'
                  ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    Pass 3 · 스크래핑 (Retrying)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400">
                    {multiPassMetrics.pass3Pct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-orange-500 transition-all duration-200"
                    style={{ width: `${multiPassMetrics.pass3Pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>재시도 구출: {multiPassMetrics.rescuedOnRetry.toLocaleString()}</span>
                  <span>총 재시도: {multiPassMetrics.totalRetries.toLocaleString()}회</span>
                </div>
              </div>
            </div>

            {/* Domain Interval Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>도메인 섹터 맵 (복구 완료 / 분할 대기 / 스크래핑 / 영구 불량)</span>
                <span className="font-mono">
                  {session ? `Intervals: ${session.intervals.length.toLocaleString()}` : 'Ready'}
                </span>
              </div>
              <div className="w-full h-4 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden flex border border-slate-300/60 dark:border-slate-700/60">
                {session && stats && stats.totalSectors > 0 ? (
                  session.intervals.slice(0, 240).map((iv, idx) => {
                    const pct = (iv.sectorCount / stats.totalSectors) * 100;
                    const bg =
                      iv.status === 'finished'
                        ? iv.attempts > 1
                          ? 'bg-teal-500'
                          : 'bg-emerald-500'
                        : iv.status === 'bad_sector'
                        ? 'bg-red-500'
                        : iv.status === 'non_scraped'
                        ? 'bg-orange-500'
                        : iv.status === 'non_trimmed'
                        ? 'bg-amber-400'
                        : 'bg-slate-400/30';
                    return (
                      <div
                        key={`${iv.startLba}-${idx}`}
                        className={`h-full ${bg}`}
                        style={{ width: `${Math.max(0.25, pct)}%` }}
                        title={`LBA #${iv.startLba.toLocaleString()} (${iv.sectorCount.toLocaleString()} sectors) · 상태: ${iv.status} · 시도/재시도: ${iv.attempts}회${iv.lastErrorCode ? ` · Win32 Error ${iv.lastErrorCode}` : ''}`}
                      />
                    );
                  })
                ) : (
                  <div className="h-full w-full bg-slate-300/40 dark:bg-slate-700/30" />
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-emerald-500" />1차 복사 완료</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-teal-500" />재시도 구출</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-amber-400" />Trimming 대기</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-orange-500" />Scraping 대기</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-red-500" />영구 불량 (BAD)</span>
              </div>
              {recoveryPlan && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span>
                    {recoveryPlan.engineSource === 'native-cpp-dll'
                      ? 'DiskSentinelRecovery.dll'
                      : recoveryPlan.engineSource === 'rust-parity-fallback'
                      ? 'Recovery Rust Parity'
                      : 'TS Parity'}{' '}
                    · 병합 구간 {recoveryPlan.coalescedIntervalCount.toLocaleString()}개
                  </span>
                  <span>
                    권고 다음 패스: <strong className="text-blue-600 dark:text-blue-400 uppercase">{recoveryPlan.suggestedPhase}</strong>
                    {recoveryPlan.hasNextWork
                      ? ` (LBA #${recoveryPlan.nextWorkStartLba.toLocaleString()} · ${recoveryPlan.nextWorkSectorCount} sec)`
                      : ' (전 구간 처리 완료)'}
                  </span>
                </div>
              )}
            </div>

            {/* 6-Card Telemetry Strip with Retry Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">복구 완료 (Finished)</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {stats ? stats.finishedSectors.toLocaleString() : 0}
                </div>
              </div>
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">미시도 (Non-Tried)</div>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {stats ? stats.nonTriedSectors.toLocaleString() : rangeSectorCount.toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">경계/스크래핑 대기</div>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {stats ? (stats.nonTrimmedSectors + stats.nonScrapedSectors).toLocaleString() : 0}
                </div>
              </div>
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">총 재시도 횟수</div>
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {multiPassMetrics.totalRetries.toLocaleString()}회
                </div>
              </div>
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">재시도 구출 성공</div>
                <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                  {multiPassMetrics.rescuedOnRetry.toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-[10px] text-slate-500 font-sans">영구 불량 (BAD)</div>
                <div className="text-sm font-bold text-red-600 dark:text-red-400">
                  {stats ? stats.badSectors.toLocaleString() : 0}
                </div>
              </div>
            </div>

            {/* Live Pass 2/3 Retry & Escalation Log */}
            {multiPassMetrics.retryEvents.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1.5 font-sans font-bold text-slate-200">
                    <Activity className="w-3 h-3 text-orange-400" />
                    최근 멀티패스 재시도 및 결함 격리 로그
                  </span>
                  <span>최근 {multiPassMetrics.retryEvents.length}건</span>
                </div>
                <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/80 font-mono text-[10px] tabular-nums">
                  {multiPassMetrics.retryEvents.map((ev, i) => (
                    <div key={`${ev.timestampMs}-${ev.lba}-${i}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 uppercase">
                          {ev.phase}
                        </span>
                        <span className="text-slate-200 font-semibold">
                          LBA #{ev.lba.toLocaleString()} ({ev.sectorCount} sec)
                        </span>
                        <span className="text-slate-400 inline-flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5" />
                          시도 {ev.attempt}/{ev.maxRetries}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ev.win32ErrorCode > 0 && (
                          <span className="text-slate-400">Err #{ev.win32ErrorCode}</span>
                        )}
                        <span className={`px-1.5 py-0.2 rounded font-bold ${
                          ev.outcome === 'recovered'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/40'
                            : ev.outcome === 'permanent_bad'
                            ? 'bg-red-950 text-red-400 border border-red-700/40'
                            : 'bg-amber-950 text-amber-300 border border-amber-700/40'
                        }`}>
                          {ev.outcome === 'recovered'
                            ? '재시도 복구'
                            : ev.outcome === 'permanent_bad'
                            ? '영구 BAD'
                            : '하위 패스 이관'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {session && (
              <button
                type="button"
                disabled={isRunning || !tauriActive}
                onClick={() => void handleSaveMap()}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                맵 저장
              </button>
            )}
            {session && stats && stats.badSectors > 0 && (
              <button
                type="button"
                disabled={isRunning || isZeroFilling || !tauriActive}
                onClick={() => void handleZeroFillBadSectors()}
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" />
                {isZeroFilling ? '0x00 패딩 중...' : '불량 구간 0x00 패딩'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={() => void handlePauseBackendDdrescue()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                일시 정지 &amp; 맵 저장
              </button>
            ) : (
              <>
                {session && session.phase === 'paused' && (
                  <button
                    type="button"
                    disabled={!tauriActive || !pathValidation.valid}
                    onClick={() => void handleStartBackendDdrescue(true)}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    맵 이어받기 재개
                  </button>
                )}
                <button
                  type="button"
                  disabled={!tauriActive || !pathValidation.valid}
                  onClick={() => void handleStartBackendDdrescue(false)}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  다중 패스 이미지 복제 시작
                </button>
              </>
            )}

            <button
              type="button"
              disabled={isRunning}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer disabled:opacity-40"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
