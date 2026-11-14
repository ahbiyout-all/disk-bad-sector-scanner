import React, { useState, useEffect, useRef } from 'react';
import { DiskDrive } from '../types';
import {
  DSMultiDriveScanTarget,
  DSMultiDriveScanSummary,
  DS_ScanMultipleDrivesParallel
} from '../utils/nativeDllBridge';
import {
  X,
  Layers,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Zap,
  HardDrive,
  ShieldCheck
} from 'lucide-react';

interface ParallelDriveScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
}

export const ParallelDriveScanModal: React.FC<ParallelDriveScanModalProps> = ({
  isOpen,
  onClose,
  drives,
}) => {
  const [selectedDriveIds, setSelectedDriveIds] = useState<string[]>(() =>
    drives.map(d => d.id)
  );
  const [concurrencyThreads, setConcurrencyThreads] = useState<number>(() => {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return Math.min(16, Math.max(2, navigator.hardwareConcurrency));
    }
    return 4;
  });
  const [burstStep, setBurstStep] = useState<number>(256);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [driveProgress, setDriveProgress] = useState<Record<string, number>>({});
  const [driveBadCount, setDriveBadCount] = useState<Record<string, number>>({});
  const [summaries, setSummaries] = useState<DSMultiDriveScanSummary[] | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const abortedRef = useRef<boolean>(false);

  useEffect(() => {
    if (isScanning) return;
    const validIds = new Set(drives.map(d => d.id));
    setSelectedDriveIds(prev => {
      const kept = prev.filter(id => validIds.has(id));
      if (kept.length === 0 && drives.length > 0 && isOpen) {
        return drives.map(d => d.id);
      }
      return kept;
    });
  }, [drives, isOpen, isScanning]);

  if (!isOpen) return null;

  const toggleSelectDrive = (id: string) => {
    if (isScanning) return;
    setSelectedDriveIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (isScanning) return;
    setSelectedDriveIds(drives.map(d => d.id));
  };

  const deselectAll = () => {
    if (isScanning) return;
    setSelectedDriveIds([]);
  };

  const handleStartParallelScan = async () => {
    if (selectedDriveIds.length === 0) return;

    abortedRef.current = false;
    setIsScanning(true);
    setSummaries(null);
    setElapsedSeconds(0);

    const initialProg: Record<string, number> = {};
    const initialBad: Record<string, number> = {};
    selectedDriveIds.forEach(id => {
      initialProg[id] = 0;
      initialBad[id] = 0;
    });
    setDriveProgress(initialProg);
    setDriveBadCount(initialBad);

    const timer = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);

    const targets: DSMultiDriveScanTarget[] = selectedDriveIds.map((id, idx) => {
      const drive = drives.find(d => d.id === id);
      const capLabel = drive?.capacityGb !== null && drive?.capacityGb !== undefined ? `${drive.capacityGb}GB` : '용량 N/A';
      const parsedIdx = parseInt(id.replace('drive-tauri-physical-', ''), 10);
      const driveIndex = Number.isNaN(parsedIdx) ? idx : parsedIdx;
      const clampedSectors = BigInt(Math.min(10000, Math.max(1, drive?.totalSectors || 10000)));
      return {
        driveIndex,
        driveId: id,
        driveName: drive ? `${drive.model} (${capLabel})` : `Drive ${idx}`,
        startLba: 0n,
        sectorCount: clampedSectors,
        burstStep
      };
    });

    try {
      const results = await DS_ScanMultipleDrivesParallel(
        targets,
        (driveId, progress, badFound) => {
          if (abortedRef.current) return;
          setDriveProgress(prev => ({ ...prev, [driveId]: progress }));
          setDriveBadCount(prev => ({ ...prev, [driveId]: badFound }));
        },
        drives
      );
      if (!abortedRef.current) {
        setSummaries(results);
      }
    } catch (e) {
      console.error('Parallel scan error:', e);
    } finally {
      clearInterval(timer);
      setIsScanning(false);
    }
  };

  const handleAbort = () => {
    abortedRef.current = true;
    setIsScanning(false);
  };

  const completedSummaries = summaries ? summaries.filter(s => s.isCompleted) : [];
  const hasAnyUnsupported = summaries ? summaries.some(s => !s.isCompleted) : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">

        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Rayon 다중 디스크 동시 병렬 스캐너
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-500/30">
                  Concurrent Real I/O
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tauri 네이티브 Rust 스레드 풀 및 Win32 PhysicalDrive 직접 I/O로 연결된 다중 물리 드라이브를 동시 검사합니다
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">

          {/* Controls Bar */}
          <div className="p-3.5 rounded-lg border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                대상 드라이브: ({selectedDriveIds.length}/{drives.length})
              </span>
              <button
                onClick={selectAll}
                disabled={isScanning}
                className="px-2 py-1 text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                전체 선택
              </button>
              <button
                onClick={deselectAll}
                disabled={isScanning}
                className="px-2 py-1 text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                선택 해제
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-slate-600 dark:text-slate-400">동시 스레드:</span>
                <select
                  value={concurrencyThreads}
                  onChange={(e) => setConcurrencyThreads(Number(e.target.value))}
                  disabled={isScanning}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value={2}>2 Threads</option>
                  <option value={4}>4 Threads</option>
                  <option value={8}>8 Threads</option>
                  <option value={16}>16 Threads</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-slate-600 dark:text-slate-400">버스트:</span>
                <select
                  value={burstStep}
                  onChange={(e) => setBurstStep(Number(e.target.value))}
                  disabled={isScanning}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value={64}>64 Sectors</option>
                  <option value={128}>128 Sectors</option>
                  <option value={256}>256 Sectors</option>
                  <option value={512}>512 Sectors</option>
                </select>
              </div>
            </div>
          </div>

          {/* Drive List & Progress Matrix */}
          <div className="space-y-2.5">
            {drives.map((drive) => {
              const isSelected = selectedDriveIds.includes(drive.id);
              const progress = driveProgress[drive.id] || 0;
              const badCount = driveBadCount[drive.id] || 0;

              return (
                <div
                  key={drive.id}
                  onClick={() => toggleSelectDrive(drive.id)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-900/90 border-orange-500/50 shadow-xs'
                      : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        disabled={isScanning}
                        className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                      />
                      <HardDrive className={`w-4 h-4 ${isSelected ? 'text-orange-500' : 'text-slate-400'}`} />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{drive.model}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {drive.capacityGb !== null ? `${drive.capacityGb} GB` : '용량 N/A'}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-indigo-500">
                            {drive.interface}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          S/N: {drive.serialNumber} | Firmware: {drive.firmware}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono">
                      {badCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          오류 {badCount}건 발견
                        </span>
                      )}
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {progress}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        badCount > 0
                          ? 'bg-red-500'
                          : progress === 100
                          ? 'bg-emerald-500'
                          : 'bg-orange-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Results Summary */}
          {summaries && (
            <div className={`p-4 rounded-xl border animate-in fade-in duration-200 ${
              hasAnyUnsupported && completedSummaries.length === 0
                ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-500/30'
                : 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {completedSummaries.length > 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    다중 드라이브 병렬 I/O 검사 완료 ({elapsedSeconds}초 소요)
                  </h4>
                </div>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                  실측 성공 {completedSummaries.length} / {summaries.length}대
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs">
                <div className="p-2.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-700/40">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">실측 완료 드라이브</span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                    {completedSummaries.length} / {summaries.length}대
                  </span>
                </div>
                <div className="p-2.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-700/40">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">총 판독 섹터</span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                    {summaries.reduce((acc, s) => acc + Number(s.totalSectorsScanned), 0).toLocaleString()} Sectors
                  </span>
                </div>
                <div className="p-2.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-700/40">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">오류 블록 검출</span>
                  <span className={`text-base font-bold font-mono ${
                    summaries.some(s => s.badSectorsFound > 0) ? 'text-red-500' : 'text-emerald-500'
                  }`}>
                    {summaries.reduce((acc, s) => acc + s.badSectorsFound, 0)}개
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/40 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200/40 dark:border-slate-800">
                      <th className="py-1 px-2 font-semibold">드라이브</th>
                      <th className="py-1 px-2 font-semibold text-center">실측 대역폭</th>
                      <th className="py-1 px-2 font-semibold text-center">평균 지연율</th>
                      <th className="py-1 px-2 font-semibold text-center">지연 섹터</th>
                      <th className="py-1 px-2 font-semibold text-center">오류 섹터</th>
                      <th className="py-1 px-2 font-semibold text-right">상태 / 비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/30 dark:divide-slate-800/60">
                    {summaries.map(s => (
                      <tr key={s.driveId} className="hover:bg-slate-500/5">
                        <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                          {s.driveName}
                        </td>
                        <td className="py-1.5 px-2 text-center text-indigo-600 dark:text-indigo-400 font-semibold">
                          {s.throughputMbSec !== null ? `${s.throughputMbSec} MB/s` : 'N/A'}
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-700 dark:text-slate-300">
                          {s.isCompleted ? `${s.avgLatencyMs} ms` : 'N/A'}
                        </td>
                        <td className="py-1.5 px-2 text-center text-amber-600 dark:text-amber-400">
                          {s.isCompleted ? `${s.slowSectorsFound}개` : '-'}
                        </td>
                        <td className={`py-1.5 px-2 text-center font-bold ${s.badSectorsFound > 0 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
                          {s.isCompleted ? `${s.badSectorsFound}개` : '-'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {!s.isCompleted ? (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 cursor-help"
                              title={s.unsupportedReason}
                            >
                              미지원 (핸들 필요)
                            </span>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              s.badSectorsFound > 0
                                ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'
                                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {s.badSectorsFound > 0 ? '손상 발견' : '정상 (OK)'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hasAnyUnsupported && (
                  <p className="mt-2 text-[10px] font-sans text-amber-700 dark:text-amber-400">
                    * 일부 장치는 브라우저 샌드박스에서 RAW LBA 직접 핸들에 접근할 수 없어 제외되었습니다 (파일 마운트 또는 Tauri 관리자 실행 시 전체 검사 가능).
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Genuine Multi-Drive Real I/O Engine</span>
          </div>

          <div className="flex items-center gap-2">
            {isScanning ? (
              <button
                onClick={handleAbort}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                병렬 검사 중단
              </button>
            ) : (
              <button
                onClick={handleStartParallelScan}
                disabled={selectedDriveIds.length === 0}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {selectedDriveIds.length}대 드라이브 일괄 동시 검사 시작
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isScanning}
              className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
