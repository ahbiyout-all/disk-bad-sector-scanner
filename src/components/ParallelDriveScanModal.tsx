import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CliBatchAction, DiskDrive, FleetMatrixRow } from '../types';
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
  ShieldCheck,
  Terminal,
  Download,
  Copy,
  Check,
  ArrowUpDown,
  Search
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
  const [activeView, setActiveView] = useState<'scan' | 'fleet'>('scan');
  const [fleetSearch, setFleetSearch] = useState<string>('');
  const [fleetStatusFilter, setFleetStatusFilter] = useState<'ALL' | 'HEALTHY' | 'WARNING' | 'CRITICAL'>('ALL');
  const [fleetSortKey, setFleetSortKey] = useState<'driveIndex' | 'healthScore' | 'temperatureC' | 'reallocatedOrMediaErrors' | 'pendingSectors'>('driveIndex');
  const [fleetSortAsc, setFleetSortAsc] = useState<boolean>(true);
  const [cliAction, setCliAction] = useState<CliBatchAction>('smart-snapshot');
  const [cliFormat, setCliFormat] = useState<'json' | 'csv'>('json');
  const [cliOutPath, setCliOutPath] = useState<string>('C:\\DiskSentinel\\reports\\fleet_audit.json');
  const [cliFailOnBad, setCliFailOnBad] = useState<boolean>(true);
  const [copiedSnippet, setCopiedSnippet] = useState<'cli' | 'schtasks' | null>(null);
  const abortedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortedRef.current = true;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      abortedRef.current = true;
      setIsScanning(false);
    }
  }, [isOpen]);

  const fleetRows: FleetMatrixRow[] = useMemo(() => {
    return drives.map((d, idx) => {
      const parsedIdx = parseInt(d.id.replace('drive-tauri-physical-', ''), 10);
      const driveIndex = Number.isNaN(parsedIdx) ? idx : parsedIdx;
      const reallocAttr = d.smartAttributes.find(a => a.id === 5 || a.id === 196);
      const pendingAttr = d.smartAttributes.find(a => a.id === 197 || a.id === 198);
      const parseSmartInt = (raw?: string) => {
        if (!raw) return 0;
        const n = parseInt(String(raw).split(/[\s(]/)[0], 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
      };
      const reallocatedOrMediaErrors =
        (d.hardwareSpecs?.nvmeMediaErrors ?? 0) > 0
          ? Number(d.hardwareSpecs?.nvmeMediaErrors ?? 0)
          : parseSmartInt(reallocAttr?.raw);
      const pendingSectors = parseSmartInt(pendingAttr?.raw);
      const temp = d.temperatureC ?? d.hardwareSpecs?.currentTempC ?? null;
      const health = d.healthScore ?? null;

      let overallStatus: FleetMatrixRow['overallStatus'] = 'UNKNOWN';
      if (
        (health !== null && health < 60) ||
        reallocatedOrMediaErrors > 0 ||
        pendingSectors > 0 ||
        (temp !== null && temp >= 65)
      ) {
        overallStatus = 'CRITICAL';
      } else if (
        (health !== null && health < 85) ||
        (temp !== null && temp >= 55)
      ) {
        overallStatus = 'WARNING';
      } else if (health !== null || d.smartAttributes.length > 0) {
        overallStatus = 'HEALTHY';
      }

      return {
        driveId: d.id,
        driveIndex,
        model: d.model,
        serialNumber: d.serialNumber || 'N/A',
        busType: d.hardwareSpecs?.busType || d.type || d.interface,
        capacityGb: d.capacityGb,
        mountPoint: d.mountPoint || '-',
        healthScore: health,
        temperatureC: temp,
        powerOnHours: d.powerOnHours ?? d.hardwareSpecs?.powerOnHoursReal ?? null,
        reallocatedOrMediaErrors,
        pendingSectors,
        trimSupported: d.hardwareSpecs?.trimSupported ?? null,
        overallStatus
      };
    });
  }, [drives]);

  const filteredFleetRows = useMemo(() => {
    const q = fleetSearch.trim().toLowerCase();
    const list = fleetRows.filter(row => {
      if (fleetStatusFilter !== 'ALL' && row.overallStatus !== fleetStatusFilter) return false;
      if (!q) return true;
      return (
        row.model.toLowerCase().includes(q) ||
        row.serialNumber.toLowerCase().includes(q) ||
        row.mountPoint.toLowerCase().includes(q) ||
        `physicaldrive${row.driveIndex}`.includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const av = a[fleetSortKey] ?? -1;
      const bv = b[fleetSortKey] ?? -1;
      return fleetSortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [fleetRows, fleetSearch, fleetStatusFilter, fleetSortKey, fleetSortAsc]);

  const selectedDriveIndices = useMemo(() => {
    return selectedDriveIds
      .map(id => fleetRows.find(r => r.driveId === id)?.driveIndex)
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b);
  }, [selectedDriveIds, fleetRows]);

  const cliCommandString = useMemo(() => {
    const driveArg =
      selectedDriveIndices.length === drives.length || selectedDriveIndices.length === 0
        ? 'all'
        : selectedDriveIndices.join(',');
    return `DiskBadSectorScanner.exe --batch --action ${cliAction} --drives ${driveArg} --format ${cliFormat} --out "${cliOutPath}"${cliFailOnBad ? ' --fail-on-bad' : ''}`;
  }, [cliAction, cliFormat, cliOutPath, cliFailOnBad, selectedDriveIndices, drives.length]);

  const schtasksSnippet = useMemo(() => {
    return `schtasks /Create /TN "DiskSentinel_FleetAudit" /TR "${cliCommandString.replace(/"/g, '\\"')}" /SC DAILY /ST 03:00 /RL HIGHEST /F`;
  }, [cliCommandString]);

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
      const driveIndex = !Number.isNaN(parsedIdx) && parsedIdx >= 0 ? parsedIdx : idx;
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
          if (abortedRef.current || !isMountedRef.current || !isOpenRef.current) return;
          setDriveProgress(prev => ({ ...prev, [driveId]: progress }));
          setDriveBadCount(prev => ({ ...prev, [driveId]: badFound }));
        },
        drives
      );
      if (!abortedRef.current && isMountedRef.current && isOpenRef.current) {
        setSummaries(results);
      }
    } catch (e) {
      console.error('Parallel scan error:', e);
    } finally {
      clearInterval(timer);
      if (isMountedRef.current) {
        setIsScanning(false);
      }
    }
  };

  const handleAbort = () => {
    abortedRef.current = true;
    setIsScanning(false);
  };

  const completedSummaries = summaries ? summaries.filter(s => s.isCompleted) : [];
  const hasAnyUnsupported = summaries ? summaries.some(s => !s.isCompleted) : false;

  const toggleFleetSort = (key: typeof fleetSortKey) => {
    if (fleetSortKey === key) {
      setFleetSortAsc(prev => !prev);
    } else {
      setFleetSortKey(key);
      setFleetSortAsc(key === 'driveIndex');
    }
  };

  const handleExportFleetCsv = () => {
    const headers = [
      'PhysicalDrive',
      'Model',
      'Serial',
      'BusType',
      'CapacityGB',
      'Mount',
      'HealthPct',
      'TempC',
      'PowerOnHours',
      'ReallocatedOrMediaErrors',
      'PendingSectors',
      'TrimSupported',
      'OverallStatus'
    ];
    const rows = fleetRows.map(r =>
      [
        `\\\\.\\PhysicalDrive${r.driveIndex}`,
        `"${r.model.replace(/"/g, '""')}"`,
        `"${r.serialNumber.replace(/"/g, '""')}"`,
        r.busType,
        r.capacityGb ?? '',
        `"${r.mountPoint.replace(/"/g, '""')}"`,
        r.healthScore ?? '',
        r.temperatureC ?? '',
        r.powerOnHours ?? '',
        r.reallocatedOrMediaErrors,
        r.pendingSectors,
        r.trimSupported === null ? '' : r.trimSupported ? 'YES' : 'NO',
        r.overallStatus
      ].join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disk_fleet_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFleetJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      totalDrives: fleetRows.length,
      fleet: fleetRows
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disk_fleet_matrix_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCommand = async (kind: 'cli' | 'schtasks', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      setCopiedSnippet(kind);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        copyTimeoutRef.current = null;
        if (isMountedRef.current) setCopiedSnippet(null);
      }, 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  다중 디스크 병렬 스캐너 &amp; Fleet 건강 매트릭스
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-500/30">
                  {drives.length} Drives
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                동시 다중 물리 드라이브 I/O 검사, 전체 스토리지 Fleet 상태 매트릭스 및 헤드리스 CLI 배치 프로파일 생성
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 border border-slate-300/70 dark:border-slate-700 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActiveView('scan')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  activeView === 'scan'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                실시간 병렬 스캔
              </button>
              <button
                type="button"
                onClick={() => setActiveView('fleet')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  activeView === 'fleet'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span>Fleet 건강 매트릭스 &amp; CLI</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeView === 'scan' ? (
            <>
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
                        <td className={`py-1.5 px-2 text-center font-bold ${s.badSectorsFound > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
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
                    * 일부 장치는 Tauri 데스크톱 IPC 관리자 권한 핸들이 없어 제외되었습니다 (Windows 관리자 권한 Tauri 데스크톱 앱 실행 시 전체 검사 가능).
                  </p>
                )}
              </div>
            </div>
          )}
            </>
          ) : (
            /* Fleet Health Matrix & CLI Automation View */
            <div className="space-y-4">
              {/* Summary Strip + Filters + Export */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fleetSearch}
                      onChange={e => setFleetSearch(e.target.value)}
                      placeholder="모델 / 시리얼 / 마운트 검색"
                      className="pl-7 pr-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 w-52"
                    />
                  </div>

                  <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden text-[11px] font-mono">
                    {(['ALL', 'HEALTHY', 'WARNING', 'CRITICAL'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFleetStatusFilter(st)}
                        className={`px-2 py-1 cursor-pointer ${
                          fleetStatusFilter === st
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={fleetRows.length === 0}
                    onClick={handleExportFleetCsv}
                    className="px-2.5 py-1.5 rounded border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Fleet CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={fleetRows.length === 0}
                    onClick={handleExportFleetJson}
                    className="px-2.5 py-1.5 rounded border border-indigo-500/40 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Fleet JSON</span>
                  </button>
                </div>
              </div>

              {/* Multi-Drive Matrix Table */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-950">
                <table className="w-full text-left text-[11px] font-mono tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-2 px-2.5">
                        <button type="button" onClick={() => toggleFleetSort('driveIndex')} className="inline-flex items-center gap-1 font-bold hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <span>장치</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5">모델 / 시리얼</th>
                      <th className="py-2 px-2.5">버스 / 용량</th>
                      <th className="py-2 px-2.5 text-center">
                        <button type="button" onClick={() => toggleFleetSort('healthScore')} className="inline-flex items-center gap-1 font-bold hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <span>건강</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-center">
                        <button type="button" onClick={() => toggleFleetSort('temperatureC')} className="inline-flex items-center gap-1 font-bold hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <span>온도</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-center">POH</th>
                      <th className="py-2 px-2.5 text-center">
                        <button type="button" onClick={() => toggleFleetSort('reallocatedOrMediaErrors')} className="inline-flex items-center gap-1 font-bold hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <span>05h/Err</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-center">
                        <button type="button" onClick={() => toggleFleetSort('pendingSectors')} className="inline-flex items-center gap-1 font-bold hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <span>C5h</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-center">TRIM</th>
                      <th className="py-2 px-2.5 text-right">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                    {filteredFleetRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                          조건에 맞는 물리 드라이브가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredFleetRows.map(row => (
                        <tr key={row.driveId} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <td className="py-2 px-2.5 font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                            PD{row.driveIndex} <span className="text-slate-400 font-normal">({row.mountPoint})</span>
                          </td>
                          <td className="py-2 px-2.5 max-w-[230px]">
                            <div className="font-sans font-bold text-slate-900 dark:text-slate-100 truncate">{row.model}</div>
                            <div className="text-[10px] text-slate-500 truncate">S/N: {row.serialNumber}</div>
                          </td>
                          <td className="py-2 px-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {row.busType} · {row.capacityGb !== null ? `${row.capacityGb} GB` : 'N/A'}
                          </td>
                          <td className={`py-2 px-2.5 text-center font-bold ${
                            row.healthScore === null
                              ? 'text-slate-400'
                              : row.healthScore >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.healthScore >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {row.healthScore !== null ? `${row.healthScore}%` : 'N/A'}
                          </td>
                          <td className={`py-2 px-2.5 text-center font-semibold ${
                            row.temperatureC === null
                              ? 'text-slate-400'
                              : row.temperatureC >= 60
                              ? 'text-red-500'
                              : row.temperatureC >= 50
                              ? 'text-amber-500'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            {row.temperatureC !== null ? `${row.temperatureC}°C` : 'N/A'}
                          </td>
                          <td className="py-2 px-2.5 text-center text-slate-600 dark:text-slate-400">
                            {row.powerOnHours !== null ? `${row.powerOnHours.toLocaleString()}h` : '-'}
                          </td>
                          <td className={`py-2 px-2.5 text-center font-bold ${
                            row.reallocatedOrMediaErrors > 0 ? 'text-red-500' : 'text-slate-500'
                          }`}>
                            {row.reallocatedOrMediaErrors}
                          </td>
                          <td className={`py-2 px-2.5 text-center font-bold ${
                            row.pendingSectors > 0 ? 'text-amber-500' : 'text-slate-500'
                          }`}>
                            {row.pendingSectors}
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            {row.trimSupported === null ? '-' : row.trimSupported ? 'ON' : 'OFF'}
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              row.overallStatus === 'CRITICAL'
                                ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-red-500/30'
                                : row.overallStatus === 'WARNING'
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : row.overallStatus === 'HEALTHY'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                            }`}>
                              {row.overallStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* CLI Batch Automation Builder & Windows Task Scheduler Snippet */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-indigo-500" />
                      <span>CLI 헤드리스 배치 자동화 빌더 (--batch)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      GUI 실행 없이 Windows 작업 스케줄러 또는 CI 서버 스크립트에서 SMART 감사·섹터 검증을 실행하고 종료 코드(0/10/20)를 반환합니다
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">배치 작업 (--action)</span>
                    <select
                      value={cliAction}
                      onChange={e => setCliAction(e.target.value as CliBatchAction)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                    >
                      <option value="smart-snapshot">smart-snapshot (S.M.A.R.T. 수집)</option>
                      <option value="quick-verify">quick-verify (경계 LBA 고속 검증)</option>
                      <option value="full-audit">full-audit (SMART + 표면 감사)</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">출력 형식 (--format)</span>
                    <select
                      value={cliFormat}
                      onChange={e => {
                        const fmt = e.target.value as 'json' | 'csv';
                        setCliFormat(fmt);
                        setCliOutPath(prev => prev.replace(/\.(json|csv)$/i, `.${fmt}`));
                      }}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                    >
                      <option value="json">JSON (.json)</option>
                      <option value="csv">CSV (.csv)</option>
                    </select>
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">리포트 경로 (--out)</span>
                    <input
                      type="text"
                      value={cliOutPath}
                      onChange={e => setCliOutPath(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cliFailOnBad}
                    onChange={e => setCliFailOnBad(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>배드섹터·재할당 경고 감지 시 비정상 종료 코드 반환 (--fail-on-bad: Warning=10, Bad=20)</span>
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300">
                    <code className="overflow-x-auto whitespace-nowrap">{cliCommandString}</code>
                    <button
                      type="button"
                      onClick={() => void copyCommand('cli', cliCommandString)}
                      className="shrink-0 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSnippet === 'cli' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'cli' ? '복사됨' : '복사'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-sky-300">
                    <code className="overflow-x-auto whitespace-nowrap">{schtasksSnippet}</code>
                    <button
                      type="button"
                      onClick={() => void copyCommand('schtasks', schtasksSnippet)}
                      className="shrink-0 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSnippet === 'schtasks' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'schtasks' ? '복사됨' : '작업 스케줄러 복사'}</span>
                    </button>
                  </div>
                </div>
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
            {activeView === 'scan' && (isScanning ? (
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
            ))}
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
