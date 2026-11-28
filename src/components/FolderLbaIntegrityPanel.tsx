import React, { useMemo, useRef, useState } from 'react';
import {
  AppLocale,
  DiskDrive,
  ErrorLogItem,
  IntegrityProbeResult,
  IntegrityWatchEntry,
  IntegrityWatchStatus,
  SectorBlock
} from '../types';
import { t } from '../utils/i18n';
import {
  correlateIntegrityProbeResults,
  loadIntegrityEntries,
  loadWatchRoots,
  saveIntegrityEntries,
  saveWatchRoots
} from '../utils/lbaIntegrityStore';
import {
  isTauriDesktopRuntime,
  queryTauriPickIntegrityPaths,
  queryTauriProbePathsIntegrity
} from '../utils/nativeDriveEngine';
import {
  getMountedBrowserImageEntry,
  isBrowserMountedDrive,
  readMountedBrowserImageRange
} from '../utils/browserImageMount';
import {
  evaluateExtentIntegrityNative,
  evaluateExtentIntegritySync,
  ExtentIntegrityReport,
  IntegrityEngineStatus,
  queryIntegrityEngineStatus
} from '../utils/integrityDllBridge';
import {
  AlertTriangle,
  Binary,
  CheckCircle2,
  FilePlus,
  FolderPlus,
  HardDriveDownload,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  FileSearch
} from 'lucide-react';

interface FolderLbaIntegrityPanelProps {
  drives: DiskDrive[];
  activeDrive?: DiskDrive;
  sectorBlocks: SectorBlock[];
  errorLogs: ErrorLogItem[];
  badLbaHistory: number[];
  locale: AppLocale;
  onNotifyIntegrityAlert?: (title: string, body: string, severity: 'warning' | 'critical') => void;
  onOpenHexInspector: (lba: number) => void;
  onOpenLbaCloner: (range: { startLba: number; endLba: number }) => void;
  onOpenFileTracer: (lba: number) => void;
}

type StatusFilter = 'ALL' | 'ALERTS' | 'VERIFIED' | 'MISSING';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const FolderLbaIntegrityPanel: React.FC<FolderLbaIntegrityPanelProps> = ({
  drives,
  activeDrive,
  sectorBlocks,
  errorLogs,
  badLbaHistory,
  locale,
  onNotifyIntegrityAlert,
  onOpenHexInspector,
  onOpenLbaCloner,
  onOpenFileTracer
}) => {
  const [watchRoots, setWatchRoots] = useState<string[]>(() => loadWatchRoots());
  const [entries, setEntries] = useState<IntegrityWatchEntry[]>(() => loadIntegrityEntries());
  const [manualPath, setManualPath] = useState<string>('');
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [integrityEngine, setIntegrityEngine] = useState<IntegrityEngineStatus | null>(null);
  const [extentEvalMap, setExtentEvalMap] = useState<Record<string, ExtentIntegrityReport>>({});

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const folderPickerRef = useRef<HTMLInputElement | null>(null);
  const browserFilesRef = useRef<Map<string, File>>(new Map());

  const tauriAvailable = isTauriDesktopRuntime();

  const computeSha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  React.useEffect(() => {
    let active = true;
    void queryIntegrityEngineStatus().then(st => {
      if (active && st) setIntegrityEngine(st);
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    if (entries.length === 0) {
      setExtentEvalMap({});
      return;
    }
    void Promise.all(
      entries.map(async entry => {
        const rep = await evaluateExtentIntegrityNative(
          entry.extents,
          entry.overlappingBadLbas,
          entry.overlappingSlowLbas,
          {
            hashMismatch: entry.status === 'HASH_MISMATCH',
            isUnreadable: entry.status === 'UNREADABLE',
            isMissing: entry.status === 'MISSING_FILE',
            hasSha256: Boolean(entry.currentSha256)
          }
        );
        return [entry.id, rep] as const;
      })
    ).then(pairs => {
      if (!active) return;
      const next: Record<string, ExtentIntegrityReport> = {};
      for (const [id, rep] of pairs) {
        next[id] = rep;
      }
      setExtentEvalMap(next);
    });
    return () => {
      active = false;
    };
  }, [entries]);

  const summary = useMemo(() => {
    let verified = 0;
    let hashMismatch = 0;
    let badOverlap = 0;
    let slowOverlap = 0;
    let missingOrUnreadable = 0;
    for (const e of entries) {
      if (e.status === 'VERIFIED') verified++;
      else if (e.status === 'HASH_MISMATCH') hashMismatch++;
      else if (e.status === 'BAD_LBA_OVERLAP') badOverlap++;
      else if (e.status === 'SLOW_LBA_OVERLAP') slowOverlap++;
      else if (e.status === 'MISSING_FILE' || e.status === 'UNREADABLE') missingOrUnreadable++;
    }
    return {
      total: entries.length,
      verified,
      hashMismatch,
      badOverlap,
      slowOverlap,
      missingOrUnreadable
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(e => {
      if (
        statusFilter === 'ALERTS' &&
        e.status !== 'HASH_MISMATCH' &&
        e.status !== 'BAD_LBA_OVERLAP' &&
        e.status !== 'SLOW_LBA_OVERLAP'
      ) {
        return false;
      }
      if (statusFilter === 'VERIFIED' && e.status !== 'VERIFIED') return false;
      if (statusFilter === 'MISSING' && e.status !== 'MISSING_FILE' && e.status !== 'UNREADABLE') return false;
      if (!q) return true;
      return (
        e.fileName.toLowerCase().includes(q) ||
        e.filePath.toLowerCase().includes(q) ||
        (e.currentSha256 || '').toLowerCase().includes(q)
      );
    });
  }, [entries, statusFilter, searchQuery]);

  const runProbeForRoots = async (roots: string[], refreshBaseline: boolean) => {
    if (roots.length === 0) {
      setFeedback({
        type: 'error',
        message: locale === 'en' ? 'Add at least one folder or file path first.' : '감시할 폴더나 파일 경로를 먼저 추가하세요.'
      });
      return;
    }

    setIsProbing(true);
    setFeedback(null);
    try {
      let probed: IntegrityProbeResult[] | null = null;

      if (tauriAvailable) {
        probed = await queryTauriProbePathsIntegrity(roots, 200, 512 * 1024 * 1024);
        if (probed === null) {
          setFeedback({
            type: 'error',
            message: locale === 'en' ? 'Native Tauri IPC call failed.' : '네이티브 Tauri IPC 호출에 실패했습니다.'
          });
          return;
        }
      } else {
        const results: IntegrityProbeResult[] = [];
        for (const root of roots) {
          if (root.startsWith('image://')) {
            const driveId = root.slice('image://'.length);
            const imgEntry = getMountedBrowserImageEntry(driveId);
            if (!imgEntry) {
              results.push({
                filePath: root,
                driveIndex: null,
                sizeBytes: 0,
                modifiedMs: Date.now(),
                sha256: null,
                extents: [],
                status: 'missing',
                note: '마운트 해제된 이미지'
              });
              continue;
            }
            const totalSectors = imgEntry.drive.totalSectors || Math.floor(imgEntry.file.size / imgEntry.sectorSize);
            const probeRegions = [
              { label: 'LBA_0_MBR_GPT.bin', startLba: 0, sectorCount: Math.min(34, totalSectors) },
              ...(totalSectors > 2048
                ? [{ label: 'LBA_2048_VBR_FAT.bin', startLba: 2048, sectorCount: Math.min(64, totalSectors - 2048) }]
                : [])
            ];
            for (const reg of probeRegions) {
              const bytes = await readMountedBrowserImageRange(
                driveId,
                reg.startLba * imgEntry.sectorSize,
                reg.sectorCount * imgEntry.sectorSize
              );
              const copy = new Uint8Array(bytes.length);
              copy.set(bytes);
              const sha256 = await computeSha256Hex(copy.buffer);
              results.push({
                filePath: `${root}\\${reg.label}`,
                driveIndex: 0,
                sizeBytes: bytes.length,
                modifiedMs: Date.now(),
                sha256,
                extents: [
                  {
                    startLba: reg.startLba,
                    endLba: reg.startLba + reg.sectorCount - 1,
                    sectorCount: reg.sectorCount
                  }
                ],
                status: 'ok',
                note: `${imgEntry.drive.model} (${reg.sectorCount} sectors)`
              });
            }
            continue;
          }

          const matchedFiles: Array<[string, File]> = Array.from<[string, File]>(
            browserFilesRef.current.entries()
          ).filter(
            ([path]) => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)
          );
          if (matchedFiles.length === 0) {
            results.push({
              filePath: root,
              driveIndex: null,
              sizeBytes: 0,
              modifiedMs: Date.now(),
              sha256: null,
              extents: [],
              status: 'missing',
              note: '브라우저 세션에서 파일 재선택 필요'
            });
            continue;
          }

          for (const [vPath, file] of matchedFiles.slice(0, 200)) {
            try {
              const buf = await file.arrayBuffer();
              const sha256 = await computeSha256Hex(buf);
              results.push({
                filePath: vPath,
                driveIndex: null,
                sizeBytes: file.size,
                modifiedMs: file.lastModified || Date.now(),
                sha256,
                extents: [],
                status: 'ok',
                note: 'Browser Web Crypto SHA-256'
              });
            } catch {
              results.push({
                filePath: vPath,
                driveIndex: null,
                sizeBytes: file.size,
                modifiedMs: file.lastModified || Date.now(),
                sha256: null,
                extents: [],
                status: 'unreadable',
                note: '파일 읽기 권한 만료'
              });
            }
          }
        }
        probed = results;
      }

      const normalizePathKey = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
      const correlated = correlateIntegrityProbeResults(probed, entries, {
        watchRootResolver: fp => {
          const normFile = normalizePathKey(fp);
          return (
            roots.find(r => {
              const normRoot = normalizePathKey(r);
              return normFile === normRoot || normFile.startsWith(`${normRoot}\\`);
            }) || fp
          );
        },
        sectorBlocks,
        errorLogs,
        badLbaHistory,
        refreshBaseline
      });

      setEntries(correlated.entries);
      saveIntegrityEntries(correlated.entries);

      if (correlated.bitRotAlerts.length > 0 && onNotifyIntegrityAlert) {
        const first = correlated.bitRotAlerts[0];
        onNotifyIntegrityAlert(
          'Bit-Rot 무결성 변조 감지',
          `${first.fileName} 포함 ${correlated.bitRotAlerts.length}개 파일의 SHA-256 해시가 기준값과 다릅니다.`,
          'critical'
        );
      } else if (correlated.badLbaAlerts.length > 0 && onNotifyIntegrityAlert) {
        const first = correlated.badLbaAlerts[0];
        onNotifyIntegrityAlert(
          '중요 파일 배드섹터 LBA 중첩 감지',
          `${first.fileName} 포함 ${correlated.badLbaAlerts.length}개 파일이 결함 LBA 구간과 겹칩니다.`,
          'warning'
        );
      }

      setFeedback({
        type: 'info',
        message:
          locale === 'en'
            ? `Verified ${probed.length} files (${correlated.bitRotAlerts.length} bit-rot, ${correlated.badLbaAlerts.length} bad LBA overlap).`
            : `총 ${probed.length}개 항목 SHA-256 검증 완료 (Bit-Rot ${correlated.bitRotAlerts.length}건, 배드섹터 LBA 중첩 ${correlated.badLbaAlerts.length}건).`
      });
    } finally {
      setIsProbing(false);
    }
  };

  const handleAddRoots = async (newPaths: string[]) => {
    const cleaned = newPaths.map(p => p.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    const nextRoots = Array.from(new Set([...watchRoots, ...cleaned]));
    setWatchRoots(nextRoots);
    saveWatchRoots(nextRoots);
    await runProbeForRoots(nextRoots, false);
  };

  const handlePickNative = async (pickFolder: boolean) => {
    if (!tauriAvailable) {
      if (pickFolder) {
        folderPickerRef.current?.click();
      } else {
        filePickerRef.current?.click();
      }
      return;
    }
    const picked = await queryTauriPickIntegrityPaths(pickFolder);
    if (picked && picked.length > 0) {
      await handleAddRoots(picked);
    }
  };

  const handleBrowserFilesPicked = async (fileList: FileList | null, fromFolder: boolean) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const addedRoots = new Set<string>();
    for (const file of files.slice(0, 200)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const vPath = rel && rel.length > 0 ? rel : file.name;
      browserFilesRef.current.set(vPath, file);
      if (fromFolder && rel && rel.includes('/')) {
        addedRoots.add(rel.split('/')[0]);
      } else {
        addedRoots.add(vPath);
      }
    }
    await handleAddRoots(Array.from(addedRoots));
  };

  const handleAddManualPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPath.trim()) return;
    const p = manualPath.trim();
    setManualPath('');
    if (!tauriAvailable) {
      setFeedback({
        type: 'error',
        message:
          locale === 'en'
            ? 'In web browser mode, use "Add Folder" or "Add Files" buttons to grant browser file read permission.'
            : '웹 브라우저에서는 보안상 직접 경로 입력 대신 상단 "폴더 추가" 또는 "파일 추가" 버튼으로 로컬 파일 권한을 부여해 주세요.'
      });
      return;
    }
    await handleAddRoots([p]);
  };

  const handleRemoveRoot = (root: string) => {
    const normTarget = root.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    const nextRoots = watchRoots.filter(r => r !== root);
    setWatchRoots(nextRoots);
    saveWatchRoots(nextRoots);
    const nextEntries = entries.filter(
      e => e.watchRootPath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() !== normTarget
    );
    setEntries(nextEntries);
    saveIntegrityEntries(nextEntries);
  };

  const renderStatusBadge = (status: IntegrityWatchStatus) => {
    if (status === 'VERIFIED') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>VERIFIED</span>
        </span>
      );
    }
    if (status === 'HASH_MISMATCH') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
          <ShieldAlert className="w-2.5 h-2.5" />
          <span>BIT-ROT</span>
        </span>
      );
    }
    if (status === 'BAD_LBA_OVERLAP') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>BAD LBA</span>
        </span>
      );
    }
    if (status === 'SLOW_LBA_OVERLAP') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>SLOW LBA</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <span>{status}</span>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header & Watch Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{t(locale, 'integrity.title')}</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                {integrityEngine?.nativeDllLoaded
                  ? `DiskSentinelIntegrity.dll (${integrityEngine.selfTestPassed ? 'KAT OK' : 'WARN'})`
                  : 'DSI Integrity Parity'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(locale, 'integrity.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <input
              ref={folderPickerRef}
              type="file"
              {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              multiple
              className="hidden"
              onChange={e => {
                const files = e.target.files;
                void handleBrowserFilesPicked(files, true).finally(() => {
                  e.target.value = '';
                });
              }}
            />
            <input
              ref={filePickerRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                const files = e.target.files;
                void handleBrowserFilesPicked(files, false).finally(() => {
                  e.target.value = '';
                });
              }}
            />
            <button
              type="button"
              onClick={() => void handlePickNative(true)}
              disabled={isProbing}
              className="min-h-[40px] px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <FolderPlus className="w-3.5 h-3.5 text-blue-500" />
              <span>{t(locale, 'integrity.addFolder')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handlePickNative(false)}
              disabled={isProbing}
              className="min-h-[40px] px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <FilePlus className="w-3.5 h-3.5 text-sky-500" />
              <span>{t(locale, 'integrity.addFiles')}</span>
            </button>
            {!tauriAvailable && activeDrive && isBrowserMountedDrive(activeDrive) && (
              <button
                type="button"
                onClick={() => void handleAddRoots([`image://${activeDrive.id}`])}
                disabled={isProbing}
                className="min-h-[40px] px-3 py-2 rounded-md border border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs font-semibold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Binary className="w-3.5 h-3.5" />
                <span>{locale === 'en' ? 'Hash Mounted Image' : '장착 이미지 부트/파티션 해시 감시'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void runProbeForRoots(watchRoots, false)}
              disabled={isProbing || watchRoots.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
              <span>{t(locale, 'integrity.verifyNow')}</span>
            </button>
            <button
              type="button"
              onClick={() => void runProbeForRoots(watchRoots, true)}
              disabled={isProbing || watchRoots.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <span>{t(locale, 'integrity.refreshBaseline')}</span>
            </button>
          </div>
        </div>

        {/* Manual Path Form + Watched Roots */}
        <form onSubmit={e => void handleAddManualPath(e)} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={manualPath}
            onChange={e => setManualPath(e.target.value)}
            placeholder={
              activeDrive?.mountPoint && /^[A-Z]:/i.test(activeDrive.mountPoint)
                ? `${activeDrive.mountPoint.slice(0, 2)}\\CriticalBackups`
                : 'C:\\Users\\Documents\\Vault'
            }
            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={!manualPath.trim() || isProbing}
            className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {locale === 'en' ? 'Register Path' : '경로 등록'}
          </button>
        </form>

        {watchRoots.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="text-slate-500 dark:text-slate-400 font-sans font-semibold">
              {locale === 'en' ? 'Watched Targets:' : '등록 감시 경로:'}
            </span>
            {watchRoots.map(root => (
              <span
                key={root}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              >
                <span className="truncate max-w-[260px]" title={root}>
                  {root}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRoot(root)}
                  aria-label={locale === 'en' ? `Stop watching ${root}` : `${root} 감시 해제`}
                  className="text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!tauriAvailable && (
          <div className="p-2.5 rounded border border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/30 text-xs text-blue-800 dark:text-blue-200">
            {locale === 'en'
              ? 'Browser Web Crypto mode: add local files/folders or hash a mounted OPFS/.img disk image to compute real SHA-256 digests and track bit-rot across scans.'
              : '브라우저 Web Crypto SHA-256 엔진 활성: 상단 "폴더 추가" / "파일 추가"로 로컬 파일을 선택하거나 장착된 디스크 이미지의 부트·파티션 해시를 등록해 실제 Bit-Rot 무결성 감시를 수행할 수 있습니다.'}
          </div>
        )}

        {feedback && (
          <div
            className={`p-2.5 rounded border text-xs ${
              feedback.type === 'error'
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="p-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {locale === 'en' ? 'Watched Files' : '감시 대상 파일'}
            </div>
            <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {summary.total}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {locale === 'en' ? 'SHA-256 Verified' : '무결성 정상'}
            </div>
            <div className="text-base font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.verified}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {locale === 'en' ? 'Hash Mismatch (Bit-Rot)' : '해시 변조 (Bit-Rot)'}
            </div>
            <div
              className={`text-base font-mono font-bold tabular-nums ${
                summary.hashMismatch > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {summary.hashMismatch}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {locale === 'en' ? 'Bad / Slow LBA Overlap' : '결함·지연 LBA 중첩'}
            </div>
            <div
              className={`text-base font-mono font-bold tabular-nums ${
                summary.badOverlap > 0
                  ? 'text-red-600 dark:text-red-400'
                  : summary.slowOverlap > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {summary.badOverlap} <span className="text-xs font-normal text-slate-400">/</span> {summary.slowOverlap}
            </div>
          </div>
        </div>
      </div>

      {/* Watched Files Extent & Hash Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="inline-flex border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden text-xs">
            {(
              [
                { id: 'ALL', label: locale === 'en' ? `All (${entries.length})` : `전체 (${entries.length})` },
                { id: 'ALERTS', label: locale === 'en' ? `Risk (${summary.hashMismatch + summary.badOverlap + summary.slowOverlap})` : `위험 (${summary.hashMismatch + summary.badOverlap + summary.slowOverlap})` },
                { id: 'VERIFIED', label: locale === 'en' ? `Verified (${summary.verified})` : `정상 (${summary.verified})` },
                { id: 'MISSING', label: locale === 'en' ? `Missing (${summary.missingOrUnreadable})` : `누락/오류 (${summary.missingOrUnreadable})` }
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`min-h-[34px] px-3 py-1 font-semibold whitespace-nowrap cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={locale === 'en' ? 'Filter file or SHA-256...' : '파일명, 경로, SHA-256 검색...'}
              className="w-full min-h-[34px] pl-8 pr-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
            <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto" />
            <p>{t(locale, 'integrity.empty')}</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {locale === 'en' ? 'No watched files match the active filter.' : '필터 조건에 일치하는 파일이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2">{locale === 'en' ? 'File & Path' : '파일 경로'}</th>
                  <th className="px-3 py-2">{locale === 'en' ? 'Status' : '무결성 상태'}</th>
                  <th className="px-3 py-2">{locale === 'en' ? 'Physical LBA Extents' : '물리 LBA 익스텐트'}</th>
                  <th className="px-3 py-2">SHA-256 (Baseline / Current)</th>
                  <th className="px-3 py-2 text-right">{locale === 'en' ? 'Size' : '크기'}</th>
                  <th className="px-3 py-2 text-right">{locale === 'en' ? 'Cross-Link' : '정밀 도구'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEntries.map(entry => {
                  const firstExtent = entry.extents[0];
                  const lastExtent = entry.extents[entry.extents.length - 1];
                  const matchedDrive =
                    entry.driveIndex !== null
                      ? drives.find(d => d.id === `drive-tauri-physical-${entry.driveIndex}`)
                      : undefined;
                  const extentEval =
                    extentEvalMap[entry.id] ??
                    evaluateExtentIntegritySync(
                      entry.extents,
                      entry.overlappingBadLbas,
                      entry.overlappingSlowLbas,
                      {
                        hashMismatch: entry.status === 'HASH_MISMATCH',
                        isUnreadable: entry.status === 'UNREADABLE',
                        isMissing: entry.status === 'MISSING_FILE',
                        hasSha256: Boolean(entry.currentSha256)
                      }
                    );

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 align-middle max-w-[260px]">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={entry.fileName}>
                          {entry.fileName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate" title={entry.filePath}>
                          {entry.filePath}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {renderStatusBadge(entry.status)}
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {locale === 'en' ? 'Surv.' : '생존성'} {extentEval.survivabilityPct.toFixed(0)}%
                          </span>
                        </div>
                        {entry.overlappingBadLbas.length > 0 && (
                          <div className="text-[10px] font-mono text-red-500 mt-0.5">
                            Bad LBA #{entry.overlappingBadLbas[0].toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-[11px] tabular-nums">
                        {firstExtent ? (
                          <div>
                            <div className="text-slate-800 dark:text-slate-200">
                              #{firstExtent.startLba.toLocaleString()} ~ #{firstExtent.endLba.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {matchedDrive ? matchedDrive.model : entry.driveIndex !== null ? `PhysicalDrive${entry.driveIndex}` : 'Drive N/A'} · {entry.extents.length} ext
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">{entry.note || 'Resident / N/A'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-[10px] tabular-nums max-w-[220px]">
                        <div className="truncate text-slate-500 dark:text-slate-400" title={entry.baselineSha256 || ''}>
                          Base: {entry.baselineSha256 ? entry.baselineSha256.slice(0, 16) + '…' : 'N/A'}
                        </div>
                        <div
                          className={`truncate ${
                            entry.status === 'HASH_MISMATCH'
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                          title={entry.currentSha256 || ''}
                        >
                          Curr: {entry.currentSha256 ? entry.currentSha256.slice(0, 16) + '…' : 'N/A'}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {formatBytes(entry.sizeBytes)}
                      </td>
                      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                        {firstExtent ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenHexInspector(firstExtent.startLba)}
                              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Binary className="w-3 h-3 text-blue-500" />
                              <span>Hex</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenLbaCloner({
                                  startLba: firstExtent.startLba,
                                  endLba: lastExtent?.endLba ?? firstExtent.endLba
                                })
                              }
                              className="px-2 py-1 rounded border border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <HardDriveDownload className="w-3 h-3" />
                              <span>ddrescue</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenFileTracer(firstExtent.startLba)}
                              className="px-2 py-1 rounded border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileSearch className="w-3 h-3" />
                              <span>Trace</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">N/A</span>
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
    </div>
  );
};
