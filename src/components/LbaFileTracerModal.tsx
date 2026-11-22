import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  FileSearch,
  Search,
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  HardDrive,
  Binary,
  Layers,
  Square,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileWarning,
  AlertOctagon,
  GitBranch,
  Database,
  Cpu,
  Maximize2,
  Minimize2,
  Flame,
  Grid3x3,
  Wrench,
  Loader2,
  ShieldAlert
} from 'lucide-react';
import {
  DiskDrive,
  ErrorLogItem,
  LbaAffectedFileRecord,
  LbaFileTraceResult,
  SectorBlock
} from '../types';
import { traceAffectedFilesForLba } from '../utils/lbaFileTracer';
import {
  executeRealZeroFillRepairBlock,
  isSystemOrBootDrive,
  isTauriDesktopRuntime
} from '../utils/nativeDriveEngine';
import {
  buildHeatmapSearchIndex,
  computeFileLbaHeatmap,
  FileLbaZoneGroup,
  HeatmapSeverity,
  LbaHeatmapCell
} from '../utils/fileLbaHeatmap';
import {
  ForensicsExtentHeatmapReport,
  runForensicsExtentHeatmap
} from '../utils/forensicsDllBridge';

interface LbaFileTracerModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  initialLba?: number;
  sectorBlocks?: SectorBlock[];
  errorLogs?: ErrorLogItem[];
  badLbaHistory?: number[];
  onOpenHexInspector?: (lba: number) => void;
  onOpenLbaCloner?: (range: { startLba: number; endLba: number }) => void;
  onRepairSectors?: (driveId: string, repairedBlockIds: number[], latencyByBlockId?: Record<number, number>) => void;
  isInline?: boolean;
}

interface DirTreeNode {
  id: string;
  name: string;
  path: string;
  children: Map<string, DirTreeNode>;
  files: Array<{ file: LbaAffectedFileRecord; originalIndex: number }>;
}

function getFileNodeKey(file: LbaAffectedFileRecord, idx: number): string {
  return `file-${file.mftRecordNumber ?? idx}-${file.fileName}-${idx}`;
}

function buildDirectoryHierarchy(files: LbaAffectedFileRecord[]): DirTreeNode {
  const root: DirTreeNode = {
    id: 'dir-root',
    name: '\\ (볼륨 루트)',
    path: '\\',
    children: new Map(),
    files: []
  };

  files.forEach((file, originalIndex) => {
    const cleanPath = (file.fullPath || `\\${file.fileName}`).replace(/^\\+/, '');
    const segments = cleanPath.split('\\').filter(Boolean);
    const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];

    let cursor = root;
    let builtPath = '';
    for (const seg of dirSegments) {
      builtPath += `\\${seg}`;
      let next = cursor.children.get(seg);
      if (!next) {
        next = {
          id: `dir-${builtPath}`,
          name: seg,
          path: builtPath,
          children: new Map(),
          files: []
        };
        cursor.children.set(seg, next);
      }
      cursor = next;
    }
    cursor.files.push({ file, originalIndex });
  });

  return root;
}

function collectExpandableNodeIds(root: DirTreeNode, files: LbaAffectedFileRecord[]): string[] {
  const ids = ['node-disk', 'node-partition', 'node-lcn', root.id];
  const walkDir = (node: DirTreeNode) => {
    ids.push(node.id);
    for (const child of node.children.values()) {
      walkDir(child);
    }
  };
  walkDir(root);
  files.forEach((f, idx) => {
    ids.push(getFileNodeKey(f, idx));
  });
  return ids;
}

function countDirSubtreeFiles(node: DirTreeNode): number {
  let total = node.files.length;
  for (const child of node.children.values()) {
    total += countDirSubtreeFiles(child);
  }
  return total;
}

function getSeverityCellClasses(severity: HeatmapSeverity): string {
  switch (severity) {
    case 'gap':
      return 'bg-slate-100/80 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700';
    case 'unscanned':
      return 'bg-slate-200 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700';
    case 'healthy':
      return 'bg-emerald-500/85 dark:bg-emerald-600/85 border border-emerald-600/40 dark:border-emerald-500/40';
    case 'low':
      return 'bg-amber-400 dark:bg-amber-500 border border-amber-500/60';
    case 'medium':
      return 'bg-orange-500 dark:bg-orange-500 border border-orange-600/60';
    case 'high':
      return 'bg-red-500 dark:bg-red-600 border border-red-600/60';
    case 'critical':
      return 'bg-rose-700 dark:bg-rose-600 border border-rose-400';
  }
}

function getSeverityTextLabel(severity: HeatmapSeverity): string {
  switch (severity) {
    case 'gap':
      return '비점유 공백';
    case 'unscanned':
      return '미스캔';
    case 'healthy':
      return '정상 (0%)';
    case 'low':
      return '저밀도 / 지연';
    case 'medium':
      return '중밀도 / 주의';
    case 'high':
      return '고밀도 배드';
    case 'critical':
      return '최고밀도 위험';
  }
}

function getSeverityTextTone(severity: HeatmapSeverity): string {
  switch (severity) {
    case 'gap':
    case 'unscanned':
      return 'text-slate-600 dark:text-slate-400';
    case 'healthy':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'low':
      return 'text-amber-700 dark:text-amber-300';
    case 'medium':
      return 'text-orange-700 dark:text-orange-300';
    case 'high':
      return 'text-red-700 dark:text-red-300';
    case 'critical':
      return 'text-rose-700 dark:text-rose-300';
  }
}

export const LbaFileTracerModal: React.FC<LbaFileTracerModalProps> = ({
  isOpen,
  onClose,
  drive,
  initialLba = 0,
  sectorBlocks = [],
  errorLogs = [],
  badLbaHistory = [],
  onOpenHexInspector,
  onOpenLbaCloner,
  onRepairSectors,
  isInline = false
}) => {
  const maxLba = Math.max(0, (drive.totalSectors || 2048) - 1);
  const [lbaInput, setLbaInput] = useState<string>(String(Math.max(0, Math.floor(initialLba))));
  const [maxMftRecords, setMaxMftRecords] = useState<number>(8192);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [progressNote, setProgressNote] = useState<string>('');
  const [scannedCount, setScannedCount] = useState<number>(0);
  const [traceResult, setTraceResult] = useState<LbaFileTraceResult | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [checkedFileKeys, setCheckedFileKeys] = useState<Record<string, boolean>>({});
  const [selectedHeatmapCellIdx, setSelectedHeatmapCellIdx] = useState<number | null>(null);
  const [hoveredHeatmapCellIdx, setHoveredHeatmapCellIdx] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const repairCancelledRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const heatmapReqIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      repairCancelledRef.current = true;
      heatmapReqIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const tauriActive = isTauriDesktopRuntime() && drive.id.startsWith('drive-tauri-physical-');

  const [sortByCriticality, setSortByCriticality] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [confirmRepairOpen, setConfirmRepairOpen] = useState<boolean>(false);
  const [isRepairingSelected, setIsRepairingSelected] = useState<boolean>(false);
  const [repairProgress, setRepairProgress] = useState<{ current: number; total: number } | null>(null);
  const [repairFeedback, setRepairFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);



  const [nativeExtentHeatmap, setNativeExtentHeatmap] = useState<ForensicsExtentHeatmapReport | null>(null);

  const heatmapSearchIndex = useMemo(
    () => buildHeatmapSearchIndex({ sectorBlocks, errorLogs, badLbaHistory }),
    [sectorBlocks, errorLogs, badLbaHistory]
  );

  const allKnownBadLbas = useMemo(() => {
    const set = new Set<number>();
    for (const blk of sectorBlocks) {
      if (blk.status === 'bad' || blk.status === 'critical') set.add(blk.lba);
    }
    for (const log of errorLogs) {
      if (log.status === 'bad' || log.status === 'critical') set.add(log.lba);
    }
    for (const h of badLbaHistory) {
      set.add(h);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [sectorBlocks, errorLogs, badLbaHistory]);

  // Precompute LBA range grouping & bad-sector density heatmap for every matched file
  const fileHeatmapsByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeFileLbaHeatmap>>();
    if (!traceResult) return map;
    traceResult.affectedFiles.forEach((file, idx) => {
      const key = getFileNodeKey(file, idx);
      map.set(
        key,
        computeFileLbaHeatmap(file, {
          targetLba: traceResult.targetLba,
          sectorsPerCluster: traceResult.sectorsPerCluster,
          searchIndex: heatmapSearchIndex,
          cellCount: 48
        })
      );
    });
    return map;
  }, [traceResult, heatmapSearchIndex]);

  const dirTree = useMemo(() => {
    if (!traceResult) return null;
    const root: DirTreeNode = {
      id: 'dir-root',
      name: '\\ (볼륨 루트)',
      path: '\\',
      children: new Map(),
      files: []
    };

    traceResult.affectedFiles.forEach((file, originalIndex) => {
      const cleanPath = (file.fullPath || `\\${file.fileName}`).replace(/^\\+/, '');
      const segments = cleanPath.split('\\').filter(Boolean);
      const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];

      let cursor = root;
      let builtPath = '';
      for (const seg of dirSegments) {
        builtPath += `\\${seg}`;
        let next = cursor.children.get(seg);
        if (!next) {
          next = {
            id: `dir-${builtPath}`,
            name: seg,
            path: builtPath,
            children: new Map(),
            files: []
          };
          cursor.children.set(seg, next);
        }
        cursor = next;
      }
      cursor.files.push({ file, originalIndex });
    });

    const sortNodeFiles = (node: DirTreeNode) => {
      if (sortByCriticality) {
        node.files.sort((a, b) => {
          const heatA = fileHeatmapsByKey.get(getFileNodeKey(a.file, a.originalIndex))?.overallBadDensityPct ?? 0;
          const heatB = fileHeatmapsByKey.get(getFileNodeKey(b.file, b.originalIndex))?.overallBadDensityPct ?? 0;
          return heatB - heatA;
        });
      }
      for (const child of node.children.values()) {
        sortNodeFiles(child);
      }
    };
    sortNodeFiles(root);

    return root;
  }, [traceResult, fileHeatmapsByKey, sortByCriticality]);

  useEffect(() => {
    if (!traceResult || !dirTree) return;
    const allIds = collectExpandableNodeIds(dirTree, traceResult.affectedFiles);
    const nextExpanded: Record<string, boolean> = {};
    for (const id of allIds) {
      nextExpanded[id] = true;
    }
    setExpandedNodes(nextExpanded);

    // Auto-expand groups that contain the targetLba (or first group)
    const nextGroups: Record<string, boolean> = {};
    traceResult.affectedFiles.forEach((file, idx) => {
      const fKey = getFileNodeKey(file, idx);
      const summary = fileHeatmapsByKey.get(fKey);
      if (summary) {
        for (const g of summary.groups) {
          if (g.containsTargetLba || g.groupIndex === 1) {
            nextGroups[`${fKey}-grp-${g.groupIndex}`] = true;
          }
        }
      }
    });
    setExpandedGroups(nextGroups);

    // Pick initial selected file (prefer exact_extent user file) & initialize bulk checkboxes
    if (traceResult.affectedFiles.length > 0) {
      const preferredIdx = traceResult.affectedFiles.findIndex(
        f => f.matchConfidence === 'exact_extent' && !f.isSystemMetafile
      );
      const chosenIdx = preferredIdx >= 0 ? preferredIdx : 0;
      const chosenKey = getFileNodeKey(traceResult.affectedFiles[chosenIdx], chosenIdx);
      setSelectedFileKey(chosenKey);

      const initialChecked: Record<string, boolean> = {};
      let checkedAny = false;
      traceResult.affectedFiles.forEach((file, idx) => {
        const fKey = getFileNodeKey(file, idx);
        const hm = fileHeatmapsByKey.get(fKey);
        if (hm && hm.totalBadHits + hm.totalCriticalHits > 0) {
          initialChecked[fKey] = true;
          checkedAny = true;
        }
      });
      if (!checkedAny) {
        initialChecked[chosenKey] = true;
      }
      setCheckedFileKeys(initialChecked);
    } else {
      setSelectedFileKey(null);
      setCheckedFileKeys({});
    }
    setConfirmRepairOpen(false);
    setRepairFeedback(null);
    setSelectedHeatmapCellIdx(null);
    setHoveredHeatmapCellIdx(null);
  }, [traceResult, dirTree, fileHeatmapsByKey]);

  useEffect(() => {
    if (!traceResult || !dirTree || !searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();

    setExpandedNodes(prev => {
      const nextExpanded: Record<string, boolean> = { ...prev };
      let changed = false;

      const markExpanded = (id: string) => {
        if (!nextExpanded[id]) {
          nextExpanded[id] = true;
          changed = true;
        }
      };

      const checkNodeMatch = (node: DirTreeNode): boolean => {
        let hasMatch = false;
        for (const child of node.children.values()) {
          if (checkNodeMatch(child)) {
            markExpanded(child.id);
            hasMatch = true;
          }
        }
        for (const { file } of node.files) {
          if (file.fileName.toLowerCase().includes(q) || file.fullPath.toLowerCase().includes(q)) {
            markExpanded(node.id);
            hasMatch = true;
          }
        }
        return hasMatch;
      };

      if (checkNodeMatch(dirTree)) {
        markExpanded('node-disk');
        markExpanded('node-partition');
        markExpanded('node-lcn');
      }
      return changed ? nextExpanded : prev;
    });
  }, [searchQuery, traceResult, dirTree]);

  const selectedFileEntry = useMemo(() => {
    if (!traceResult || traceResult.affectedFiles.length === 0) return null;
    const foundIdx = traceResult.affectedFiles.findIndex(
      (f, idx) => getFileNodeKey(f, idx) === selectedFileKey
    );
    const idx = foundIdx >= 0 ? foundIdx : 0;
    const file = traceResult.affectedFiles[idx];
    const key = getFileNodeKey(file, idx);
    const heatmap = fileHeatmapsByKey.get(key) || null;
    return { file, idx, key, heatmap };
  }, [traceResult, selectedFileKey, fileHeatmapsByKey]);

  useEffect(() => {
    const reqId = ++heatmapReqIdRef.current;
    const reqDriveId = drive.id;
    setNativeExtentHeatmap(null);

    if (
      !isOpen ||
      !tauriActive ||
      !selectedFileEntry ||
      selectedFileEntry.file.extents.length === 0
    ) {
      return;
    }

    const extents = selectedFileEntry.file.extents.map(ext => ({
      startLba: ext.startLba,
      sectorCount: Math.max(1, ext.endLba - ext.startLba + 1)
    }));

    void runForensicsExtentHeatmap(extents, allKnownBadLbas, 48).then(res => {
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== reqDriveId ||
        heatmapReqIdRef.current !== reqId ||
        !res
      ) {
        return;
      }
      setNativeExtentHeatmap(res);
    });
  }, [
    isOpen,
    tauriActive,
    drive.id,
    selectedFileEntry,
    allKnownBadLbas
  ]);

  const selectedBulkEntries = useMemo(() => {
    if (!traceResult || traceResult.affectedFiles.length === 0) return [];
    const checked = traceResult.affectedFiles
      .map((file, idx) => {
        const key = getFileNodeKey(file, idx);
        return { file, idx, key, heatmap: fileHeatmapsByKey.get(key) || null };
      })
      .filter(entry => !!checkedFileKeys[entry.key]);

    if (checked.length > 0) return checked;
    return selectedFileEntry ? [selectedFileEntry] : [];
  }, [traceResult, checkedFileKeys, fileHeatmapsByKey, selectedFileEntry]);

  const selectedBulkBadTargets = useMemo(() => {
    if (!traceResult || selectedBulkEntries.length === 0) {
      return [] as Array<{ blockId: number; lba: number }>;
    }

    const ranges: Array<{ startLba: number; endLba: number }> = [];
    for (const entry of selectedBulkEntries) {
      if (entry.file.extents.length > 0) {
        for (const ext of entry.file.extents) {
          ranges.push({ startLba: ext.startLba, endLba: ext.endLba });
        }
      } else {
        ranges.push({ startLba: traceResult.targetLba, endLba: traceResult.targetLba });
      }
    }

    const byBlockId = new Map<number, { blockId: number; lba: number }>();
    const coveredLbas = new Set<number>();

    for (const blk of sectorBlocks) {
      if (blk.status !== 'bad' && blk.status !== 'critical') continue;
      const overlaps = ranges.some(
        r => Math.max(r.startLba, blk.lba) <= Math.min(r.endLba, blk.endLba)
      );
      if (overlaps) {
        byBlockId.set(blk.id, { blockId: blk.id, lba: blk.lba });
        coveredLbas.add(blk.lba);
      }
    }

    const extraBadLbas = new Set<number>();
    for (const log of errorLogs) {
      if (log.status !== 'bad' && log.status !== 'critical') continue;
      if (ranges.some(r => log.lba >= r.startLba && log.lba <= r.endLba)) {
        extraBadLbas.add(log.lba);
      }
    }
    for (const histLba of badLbaHistory) {
      if (ranges.some(r => histLba >= r.startLba && histLba <= r.endLba)) {
        extraBadLbas.add(histLba);
      }
    }

    const standaloneTargets: Array<{ blockId: number; lba: number }> = [];
    for (const badLba of extraBadLbas) {
      const matchingBlk = sectorBlocks.find(
        blk => badLba >= blk.lba && badLba <= blk.endLba
      );
      if (matchingBlk) {
        if (!byBlockId.has(matchingBlk.id)) {
          byBlockId.set(matchingBlk.id, { blockId: matchingBlk.id, lba: badLba });
        }
      } else if (!coveredLbas.has(badLba)) {
        standaloneTargets.push({ blockId: -1, lba: badLba });
        coveredLbas.add(badLba);
      }
    }

    return [...Array.from(byBlockId.values()), ...standaloneTargets].sort(
      (a, b) => a.lba - b.lba
    );
  }, [traceResult, selectedBulkEntries, sectorBlocks, errorLogs, badLbaHistory]);

  // Pick active heatmap cell (hovered > selected > targetLba cell > hottest cell)
  const inspectedHeatmapCell: LbaHeatmapCell | null = useMemo(() => {
    const heatmap = selectedFileEntry?.heatmap;
    if (!heatmap || heatmap.cells.length === 0) return null;
    if (hoveredHeatmapCellIdx !== null && heatmap.cells[hoveredHeatmapCellIdx]) {
      return heatmap.cells[hoveredHeatmapCellIdx];
    }
    if (selectedHeatmapCellIdx !== null && heatmap.cells[selectedHeatmapCellIdx]) {
      return heatmap.cells[selectedHeatmapCellIdx];
    }
    const targetCell = heatmap.cells.find(c => c.containsTargetLba);
    if (targetCell) return targetCell;
    return heatmap.cells.reduce((best, cur) =>
      cur.badDensityPct > best.badDensityPct ? cur : best
    );
  }, [selectedFileEntry, hoveredHeatmapCellIdx, selectedHeatmapCellIdx]);

  const runTrace = async (targetLbaNum: number) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsTracing(true);
    setScannedCount(0);
    setProgressNote('파티션 및 파일 시스템 분석 준비 중...');

    try {
      const res = await traceAffectedFilesForLba(drive, targetLbaNum, {
        maxMftRecords,
        signal: controller.signal,
        onProgress: (count, note) => {
          if (abortControllerRef.current !== controller || !isOpenRef.current || !isMountedRef.current) {
            return;
          }
          setScannedCount(count);
          setProgressNote(note);
        }
      });
      if (abortControllerRef.current !== controller || !isOpenRef.current || !isMountedRef.current) {
        return;
      }
      setTraceResult(res);
    } finally {
      if (abortControllerRef.current === controller && isMountedRef.current) {
        setIsTracing(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      repairCancelledRef.current = true;
      setIsTracing(false);
      return;
    }
    repairCancelledRef.current = false;
    const safeLba = Math.max(0, Math.floor(initialLba));
    setLbaInput(String(safeLba));
    void runTrace(safeLba);
    return () => {
      abortControllerRef.current?.abort();
      repairCancelledRef.current = true;
    };
  }, [isOpen, initialLba, drive.id]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGroupNode = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const setAllNodesExpanded = (expanded: boolean) => {
    if (!traceResult || !dirTree) return;
    const allIds = collectExpandableNodeIds(dirTree, traceResult.affectedFiles);
    const nextNodes: Record<string, boolean> = {};
    for (const id of allIds) {
      nextNodes[id] = expanded;
    }
    setExpandedNodes(nextNodes);

    const nextGroups: Record<string, boolean> = {};
    traceResult.affectedFiles.forEach((file, idx) => {
      const fKey = getFileNodeKey(file, idx);
      const summary = fileHeatmapsByKey.get(fKey);
      if (summary) {
        for (const g of summary.groups) {
          nextGroups[`${fKey}-grp-${g.groupIndex}`] = expanded;
        }
      }
    });
    setExpandedGroups(nextGroups);
  };

  const getConfidenceLabel = (confidence: LbaAffectedFileRecord['matchConfidence']) => {
    switch (confidence) {
      case 'exact_extent':
        return { text: 'Data Run 직결 일치', cls: 'text-red-700 dark:text-red-300' };
      case 'resident_mft':
        return { text: '$MFT 레코드 상주 일치', cls: 'text-amber-700 dark:text-amber-300' };
      case 'metadata_zone':
        return { text: '볼륨 메타데이터 영역', cls: 'text-indigo-700 dark:text-indigo-300' };
      default:
        return { text: '비할당/미확인', cls: 'text-slate-500 dark:text-slate-400' };
    }
  };

  const toggleFileBulkChecked = (fileKey: string) => {
    setCheckedFileKeys(prev => ({
      ...prev,
      [fileKey]: !prev[fileKey]
    }));
    setConfirmRepairOpen(false);
    setRepairFeedback(null);
  };

  const handleRequestRepairSelected = () => {
    if (isRepairingSelected) return;
    setRepairFeedback(null);

    if (isSystemOrBootDrive(drive)) {
      setConfirmRepairOpen(false);
      setRepairFeedback({
        type: 'error',
        message:
          'OS 부트/시스템 드라이브 보호 모드: 운영체제 볼륨에는 파괴적인 S.M.A.R.T. 제로필 섹터 수복을 실행할 수 없습니다.'
      });
      return;
    }

    if (selectedBulkEntries.length === 0 || selectedBulkBadTargets.length === 0) {
      setConfirmRepairOpen(false);
      setRepairFeedback({
        type: 'warning',
        message:
          '선택된 파일들의 LBA 범위 내에 수복할 배드/위험 섹터가 감지되지 않았습니다.'
      });
      return;
    }

    setConfirmRepairOpen(true);
  };

  const handleExecuteRepairSelected = async () => {
    if (isRepairingSelected || selectedBulkBadTargets.length === 0) return;
    const targetDrive = drive;
    const targets = [...selectedBulkBadTargets];
    const selectedFilesCount = selectedBulkEntries.length;

    setConfirmRepairOpen(false);
    setIsRepairingSelected(true);
    setRepairFeedback(null);
    setRepairProgress({ current: 0, total: targets.length });

    const succeededBlockIds: number[] = [];
    const succeededLatencyMap: Record<number, number> = {};
    let succeededCount = 0;
    let failedCount = 0;
    let lastFailureReason = '';

    repairCancelledRef.current = false;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (repairCancelledRef.current || !isMountedRef.current || !isOpenRef.current) break;
        const target = targets[i];
        const res = await executeRealZeroFillRepairBlock(
          target.blockId >= 0 ? target.blockId : i,
          target.lba,
          targetDrive
        );

        if (res.success && res.verifiedZeros) {
          succeededCount++;
          if (target.blockId >= 0) {
            succeededBlockIds.push(target.blockId);
            succeededLatencyMap[target.blockId] = res.latencyMs;
          }
        } else {
          failedCount++;
          if (res.unsupportedReason) {
            lastFailureReason = res.unsupportedReason;
          }
        }

        if (repairCancelledRef.current || !isMountedRef.current || !isOpenRef.current) break;
        setRepairProgress({ current: i + 1, total: targets.length });
      }

      if (succeededBlockIds.length > 0 && onRepairSectors) {
        onRepairSectors(targetDrive.id, Array.from(new Set(succeededBlockIds)), succeededLatencyMap);
      }

      if (!isMountedRef.current || !isOpenRef.current) return;

      if (succeededCount > 0 && failedCount === 0) {
        setRepairFeedback({
          type: 'success',
          message: `선택된 ${selectedFilesCount}개 파일 범위의 ${succeededCount}개 배드 섹터에 대해 S.M.A.R.T. 제로필 재할당(0x00 기록 및 검증)을 완료했습니다.`
        });
      } else if (succeededCount > 0) {
        setRepairFeedback({
          type: 'warning',
          message: `${succeededCount}개 섹터 수복 완료, ${failedCount}개 섹터 실패 (${lastFailureReason || '디스크 I/O 또는 권한 오류'}).`
        });
      } else {
        setRepairFeedback({
          type: 'error',
          message: `제로필 재할당 실행 중단/실패: ${lastFailureReason || '물리 디스크 직접 쓰기 권한이 필요합니다.'}`
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsRepairingSelected(false);
        setRepairProgress(null);
      }
    }
  };

  const renderSelectedFileHeatmapSection = () => {
    if (!traceResult || !selectedFileEntry || !selectedFileEntry.heatmap) return null;
    const { file, heatmap } = selectedFileEntry;

    return (
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 space-y-3">
        {/* Top Row: Selected File Summary + Total LBA Span */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500 shrink-0" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                선택 파일 전체 LBA 범위 그룹화 및 배드섹터 밀도 히트맵
              </h4>
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
              {file.fullPath} · {heatmap.groups.length}개 LBA 그룹 · {heatmap.fragmentCount}개 Data Run
              {heatmap.isResidentFallbackSpan && ' · $MFT 상주 섹터 윈도우 기준'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">

            {traceResult.affectedFiles.length > 1 && (
              <select
                value={selectedFileEntry.key}
                onChange={e => {
                  setSelectedFileKey(e.target.value);
                  setSelectedHeatmapCellIdx(null);
                  setHoveredHeatmapCellIdx(null);
                }}
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-mono text-slate-800 dark:text-slate-200 max-w-[200px]"
              >
                {traceResult.affectedFiles.map((f, idx) => {
                  const key = getFileNodeKey(f, idx);
                  return (
                    <option key={key} value={key}>
                      {f.fileName}
                    </option>
                  );
                })}
              </select>
            )}

            {onOpenLbaCloner && (
              <button
                type="button"
                onClick={() =>
                  onOpenLbaCloner({
                    startLba: heatmap.globalStartLba,
                    endLba: heatmap.globalEndLba
                  })
                }
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3 h-3" />
                전체 LBA 범위 복제
              </button>
            )}
          </div>
        </div>

        {/* 4-column Tabular Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
          <div className="px-2.5 py-2 rounded border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">전체 LBA 스팬</div>
            <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">
              #{heatmap.globalStartLba.toLocaleString()} ~ #{heatmap.globalEndLba.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {heatmap.totalSpanSectors.toLocaleString()} sectors span
            </div>
          </div>

          <div className="px-2.5 py-2 rounded border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">점유 섹터 / LBA 그룹</div>
            <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              {heatmap.allocatedSectors.toLocaleString()} sec · {heatmap.groups.length}개 그룹
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              유효 점유율 {Math.min(100, Math.round((heatmap.allocatedSectors / heatmap.totalSpanSectors) * 100))}%
            </div>
          </div>

          <div className="px-2.5 py-2 rounded border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">탐지 배드 / 이상 섹터</div>
            <div className="text-[11px] font-bold text-red-600 dark:text-red-400">
              배드 {heatmap.totalBadHits} · 심각 {heatmap.totalCriticalHits} · 지연 {heatmap.totalSlowHits}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              스캔 커버리지 {heatmap.scannedCoveragePct}%
            </div>
          </div>

          <div className="px-2.5 py-2 rounded border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">최대 배드섹터 밀도</div>
            <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
              전체 {heatmap.overallBadDensityPct}%
              {heatmap.hottestGroupIndex !== null && ` · 그룹 #${heatmap.hottestGroupIndex} 집중`}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              추적 LBA #{traceResult.targetLba.toLocaleString()}
            </div>
          </div>
        </div>

        {nativeExtentHeatmap && (
          <div className="px-3 py-1.5 rounded border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
            <span className="font-sans font-semibold text-indigo-700 dark:text-indigo-300">
              {nativeExtentHeatmap.engineSource === 'native-cpp-dll'
                ? 'DiskSentinelForensics.dll O(N log M) 익스텐트 검증'
                : 'Forensics Rust Parity 익스텐트 검증'}
            </span>
            <span>
              영향 익스텐트 {nativeExtentHeatmap.impactedExtentCount}/{nativeExtentHeatmap.totalExtents}개 · 최고 셀 밀도{' '}
              {nativeExtentHeatmap.peakCellDensityPct.toFixed(1)}% · 단편화 확산{' '}
              {(nativeExtentHeatmap.fragmentationSpreadScore * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Grouped LBA Zone Summary Strip */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>LBA 그룹별 공간 분포 및 배드 밀도 ({heatmap.groups.length}개 그룹)</span>
            <span>총 {heatmap.totalSpanSectors.toLocaleString()} Sectors</span>
          </div>
          <div className="flex items-stretch gap-1 w-full overflow-x-auto pb-0.5">
            {heatmap.groups.map(grp => {
              const widthPct = Math.max(
                10,
                Math.round((grp.allocatedSectors / Math.max(1, heatmap.allocatedSectors)) * 100)
              );
              const isSelectedCellInGroup =
                inspectedHeatmapCell !== null &&
                inspectedHeatmapCell.endLba >= grp.startLba &&
                inspectedHeatmapCell.startLba <= grp.endLba;

              return (
                <button
                  key={grp.groupIndex}
                  type="button"
                  onClick={() => {
                    const firstCellIdx = heatmap.cells.findIndex(
                      c => c.endLba >= grp.startLba && c.startLba <= grp.endLba
                    );
                    if (firstCellIdx >= 0) setSelectedHeatmapCellIdx(firstCellIdx);
                    setExpandedGroups(prev => ({
                      ...prev,
                      [`${selectedFileEntry.key}-grp-${grp.groupIndex}`]: true
                    }));
                  }}
                  style={{ flexBasis: `${widthPct}%`, minWidth: '104px' }}
                  className={`text-left rounded border px-2 py-1.5 transition-colors cursor-pointer ${
                    isSelectedCellInGroup
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      그룹 #{grp.groupIndex}
                    </span>
                    <span className={`font-bold tabular-nums ${getSeverityTextTone(grp.severity)}`}>
                      {grp.badDensityPct}%
                    </span>
                  </div>
                  <div className="text-[9px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                    #{grp.startLba.toLocaleString()}~#{grp.endLba.toLocaleString()}
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-xs overflow-hidden bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full ${getSeverityCellClasses(grp.severity).split(' ')[0]}`}
                      style={{ width: `${Math.max(grp.scanned ? 100 : 30, grp.badDensityPct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 48-Cell Bad-Sector Density Heatmap Matrix */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5 font-sans font-semibold text-slate-700 dark:text-slate-300">
              <Grid3x3 className="w-3.5 h-3.5 text-indigo-500" />
              LBA 구간별 배드섹터 밀도 히트맵 ({heatmap.cells.length}개 섹션 분할)
            </span>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-400" />
                공백
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-slate-200 dark:bg-slate-800 border border-slate-400/50" />
                미스캔
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500" />
                정상 0%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-400" />
                1~14%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-orange-500" />
                15~39%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-red-500" />
                40~69%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-rose-700" />
                70%+
              </span>
            </div>
          </div>

          <div
            className="grid gap-1 p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60"
            style={{
              gridTemplateColumns: `repeat(${Math.min(16, Math.max(8, heatmap.cells.length))}, minmax(0, 1fr))`
            }}
          >
            {heatmap.cells.map(cell => {
              const isSelected = inspectedHeatmapCell?.cellIndex === cell.cellIndex;
              return (
                <button
                  key={cell.cellIndex}
                  type="button"
                  onMouseEnter={() => setHoveredHeatmapCellIdx(cell.cellIndex)}
                  onMouseLeave={() => setHoveredHeatmapCellIdx(null)}
                  onClick={() => setSelectedHeatmapCellIdx(cell.cellIndex)}
                  title={`LBA #${cell.startLba.toLocaleString()}~#${cell.endLba.toLocaleString()} | ${getSeverityTextLabel(cell.severity)} | 밀도 ${cell.badDensityPct}%`}
                  className={`relative h-6 rounded-[3px] transition-transform cursor-pointer flex items-center justify-center ${getSeverityCellClasses(
                    cell.severity
                  )} ${isSelected ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 scale-[1.06] z-10' : 'hover:opacity-90'}`}
                >
                  {cell.containsTargetLba && (
                    <span className="w-2 h-2 rounded-full bg-white shadow-xs border border-red-900" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Inspected Cell Detail Bar */}
          {inspectedHeatmapCell && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 font-mono tabular-nums text-[11px]">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    셀 #{inspectedHeatmapCell.cellIndex + 1}: LBA #{inspectedHeatmapCell.startLba.toLocaleString()} ~ #
                    {inspectedHeatmapCell.endLba.toLocaleString()}
                  </span>
                  <span className={`font-bold ${getSeverityTextTone(inspectedHeatmapCell.severity)}`}>
                    {getSeverityTextLabel(inspectedHeatmapCell.severity)} · 밀도 {inspectedHeatmapCell.badDensityPct}%
                  </span>
                  {inspectedHeatmapCell.containsTargetLba && (
                    <span className="font-bold text-red-600 dark:text-red-400">
                      (추적 LBA #{traceResult.targetLba.toLocaleString()} 포함)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  구간 {inspectedHeatmapCell.sectorCount.toLocaleString()} sectors ·{' '}
                  {inspectedHeatmapCell.occupiesFileExtent
                    ? `소속 Run: ${inspectedHeatmapCell.overlappingExtentIndices.map(i => `#${i + 1}`).join(', ')}`
                    : '단편화 공백 구간 (파일 미점유)'}{' '}
                  · 배드 {inspectedHeatmapCell.badCount} / 심각 {inspectedHeatmapCell.criticalCount} / 지연{' '}
                  {inspectedHeatmapCell.slowCount}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onOpenHexInspector && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenHexInspector(
                        inspectedHeatmapCell.containsTargetLba
                          ? traceResult.targetLba
                          : inspectedHeatmapCell.startLba
                      )
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Binary className="w-3 h-3" />
                    셀 HEX
                  </button>
                )}
                {onOpenLbaCloner && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLbaCloner({
                        startLba: inspectedHeatmapCell.startLba,
                        endLba: inspectedHeatmapCell.endLba
                      })
                    }
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    셀 구간 백업
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderZoneGroupNode = (
    group: FileLbaZoneGroup,
    file: LbaAffectedFileRecord,
    fileKey: string,
    result: LbaFileTraceResult
  ) => {
    const groupKey = `${fileKey}-grp-${group.groupIndex}`;
    const isGroupExpanded = !!expandedGroups[groupKey];
    const spc = Math.max(1, result.sectorsPerCluster || 8);
    const secSize = Math.max(512, result.sectorSize || 512);

    return (
      <div key={groupKey} className="relative pl-4 pt-1.5">
        <span
          aria-hidden="true"
          className="absolute left-0 top-5 w-3.5 h-px bg-slate-300 dark:bg-slate-700"
        />

        {group.gapSectorsFromPrev > 0 && (
          <div className="mb-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            ··· 물리 LBA 공백 +{group.gapSectorsFromPrev.toLocaleString()} sectors (타 파일 또는 여유 공간) ···
          </div>
        )}

        <div
          className={`rounded-md border overflow-hidden ${
            group.containsTargetLba
              ? 'border-red-500/40 bg-red-50/30 dark:bg-red-950/15'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
          }`}
        >
          {/* Group Header */}
          <div className="px-2.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => toggleGroupNode(groupKey)}
              className="flex items-center gap-2 text-left min-w-0 cursor-pointer"
            >
              {isGroupExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span
                className={`w-2.5 h-2.5 rounded-[2px] shrink-0 ${getSeverityCellClasses(group.severity)}`}
              />
              <div className="min-w-0 font-mono tabular-nums">
                <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">
                  LBA 그룹 #{group.groupIndex}: #{group.startLba.toLocaleString()} ~ #{group.endLba.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {group.extents.length}개 Run 포함 · {group.allocatedSectors.toLocaleString()} sectors ·{' '}
                  <span className={`font-semibold ${getSeverityTextTone(group.severity)}`}>
                    배드 밀도 {group.badDensityPct}% ({getSeverityTextLabel(group.severity)})
                  </span>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0 pl-6 sm:pl-0">
              {onOpenLbaCloner && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenLbaCloner({
                      startLba: group.startLba,
                      endLba: group.endLba
                    })
                  }
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  그룹 LBA 복제
                </button>
              )}
            </div>
          </div>

          {/* Group Density Bar */}
          <div className="px-2.5 pb-2">
            <div className="h-1.5 w-full rounded-xs overflow-hidden bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-full ${getSeverityCellClasses(group.severity).split(' ')[0]}`}
                style={{ width: `${Math.max(group.scanned ? 100 : 25, group.badDensityPct)}%` }}
              />
            </div>
          </div>

          {/* Child Extents inside this LBA Zone Group */}
          {isGroupExpanded && (
            <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="border-l border-slate-300 dark:border-slate-700 ml-1.5 pl-4 space-y-1.5">
                {group.extents.map(({ extent: ext, extentIndex }) => {
                  const isHit = result.targetLba >= ext.startLba && result.targetLba <= ext.endLba;
                  const sectorOffsetInExt = isHit ? result.targetLba - ext.startLba : 0;
                  const fileByteOffset = isHit
                    ? (ext.vcnStart * spc + sectorOffsetInExt) * secSize
                    : 0;
                  const intraClusterSector = isHit ? sectorOffsetInExt % spc : 0;
                  const exactClusterOffset = isHit
                    ? ext.lcnStart + Math.floor(sectorOffsetInExt / spc)
                    : ext.lcnStart;

                  return (
                    <div key={extentIndex} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-4 top-3.5 w-3.5 h-px bg-slate-300 dark:bg-slate-700"
                      />
                      <div
                        className={`rounded border px-2.5 py-1.5 font-mono tabular-nums text-[11px] ${
                          isHit
                            ? 'border-red-500/50 bg-red-50/70 dark:bg-red-950/30 text-red-900 dark:text-red-100'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold">
                              {file.filesystem === 'NTFS' ? 'Data Run' : 'Cluster Extent'} #{extentIndex + 1}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              VCN #{ext.vcnStart.toLocaleString()} → LCN #{ext.lcnStart.toLocaleString()}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              ({ext.clusterCount.toLocaleString()} clusters)
                            </span>
                          </div>
                          <span className="font-semibold">
                            LBA #{ext.startLba.toLocaleString()} ~ #{ext.endLba.toLocaleString()}
                          </span>
                        </div>

                        {isHit && (
                          <div className="mt-2 ml-2 pl-3 border-l border-red-400/70 dark:border-red-500/60">
                            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded bg-white/95 dark:bg-slate-950/90 border border-red-400/50 px-2.5 py-2">
                              <span
                                aria-hidden="true"
                                className="absolute -left-3 top-3.5 w-2.5 h-px bg-red-400/70 dark:bg-red-500/60"
                              />
                              <div className="flex items-start gap-2">
                                <AlertOctagon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <div className="font-bold text-red-700 dark:text-red-300">
                                    손상 LBA #{result.targetLba.toLocaleString()} 직접 연결 지점
                                  </div>
                                  <div className="text-[10px] text-slate-600 dark:text-slate-400">
                                    적중 클러스터 LCN #{exactClusterOffset.toLocaleString()} · 클러스터 내 섹터{' '}
                                    {intraClusterSector + 1}/{spc} · 파일 내 오프셋{' '}
                                    <span className="text-red-600 dark:text-red-300 font-semibold">
                                      0x{fileByteOffset.toString(16).toUpperCase()} ({formatBytes(fileByteOffset)})
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {onOpenLbaCloner && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenLbaCloner({
                                      startLba: ext.startLba,
                                      endLba: ext.endLba
                                    })
                                  }
                                  className="px-2 py-1 rounded border border-red-500/40 hover:bg-red-500/10 text-red-700 dark:text-red-300 text-[10px] font-semibold cursor-pointer shrink-0"
                                >
                                  이 Run만 복제
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFileLeafNode = (
    file: LbaAffectedFileRecord,
    originalIndex: number,
    result: LbaFileTraceResult
  ) => {
    const fileNodeId = getFileNodeKey(file, originalIndex);
    const isExpanded = !!expandedNodes[fileNodeId];
    const isSelected = selectedFileEntry?.key === fileNodeId;
    const isBulkChecked = !!checkedFileKeys[fileNodeId];
    const heatmap = fileHeatmapsByKey.get(fileNodeId);
    const conf = getConfidenceLabel(file.matchConfidence);

    const badSectorCount = heatmap ? heatmap.totalBadHits + heatmap.totalCriticalHits : 0;
    const creationDate =
      typeof file.creationTimestampMs === 'number' && Number.isFinite(file.creationTimestampMs) && file.creationTimestampMs > 0
        ? new Date(file.creationTimestampMs)
        : null;
    const creationTimeStr =
      creationDate && !Number.isNaN(creationDate.getTime())
        ? creationDate.toLocaleString('ko-KR')
        : '알 수 없음';
    const tooltipTitle = `파일 경로: ${file.fullPath}\n파일 크기: ${formatBytes(file.fileSizeBytes)}\n생성 시각: ${creationTimeStr}\n내부 배드섹터 매핑 수: ${badSectorCount}개 (밀도 ${heatmap?.overallBadDensityPct ?? 0}%)`;

    const queryLower = searchQuery.trim().toLowerCase();
    const isMatching = queryLower.length > 0 && (
      file.fileName.toLowerCase().includes(queryLower) ||
      file.fullPath.toLowerCase().includes(queryLower)
    );

    return (
      <div key={fileNodeId} className="relative pl-5 pt-1.5">
        <span
          aria-hidden="true"
          className="absolute left-0 top-5 w-4 h-px bg-slate-300 dark:bg-slate-700"
        />

        <div
          title={tooltipTitle}
          className={`rounded-lg border overflow-hidden transition-colors ${
            isMatching
              ? 'border-amber-500 ring-2 ring-amber-500/50 bg-amber-50/90 dark:bg-amber-950/45'
              : isSelected
              ? 'border-indigo-500 ring-1 ring-indigo-500/40 bg-white dark:bg-slate-900'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75'
          }`}
        >
          {/* File Node Header (Checkbox for bulk repair + Click selects file for heatmap) */}
          <div className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900">
            <div className="flex items-start gap-2 min-w-0">
              <input
                type="checkbox"
                checked={isBulkChecked}
                onChange={() => toggleFileBulkChecked(fileNodeId)}
                onClick={e => e.stopPropagation()}
                disabled={isRepairingSelected}
                aria-label={`${file.fileName} 일괄 수복 대상 선택`}
                title="일괄 S.M.A.R.T. 제로필 수복 대상에 포함"
                className="mt-1 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
              />

              <button
                type="button"
                onClick={() => toggleNode(fileNodeId)}
                className="mt-0.5 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer shrink-0"
                aria-label="파일 상세 트리 펼치기/접기"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {file.isSystemMetafile ? (
                <FileWarning className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <FileText className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedFileKey(fileNodeId);
                  setSelectedHeatmapCellIdx(null);
                  setHoveredHeatmapCellIdx(null);
                  setExpandedNodes(prev => ({ ...prev, [fileNodeId]: true }));
                }}
                className="min-w-0 space-y-0.5 text-left cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-slate-900 dark:text-white truncate">
                    {file.fileName}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400" aria-hidden="true">·</span>
                  <span className={`text-[10px] font-mono font-semibold ${conf.cls}`}>
                    {conf.text}
                  </span>
                  {badSectorCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-500/30">
                      배드 {badSectorCount}개
                    </span>
                  )}
                  {isSelected && (
                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      [히트맵 선택]
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                  {file.fullPath} · 크기 {formatBytes(file.fileSizeBytes)} · 생성 {creationTimeStr}
                  {file.mftRecordNumber !== undefined && ` · MFT #${file.mftRecordNumber.toLocaleString()}`}
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pl-6 sm:pl-0">
              {onOpenHexInspector && (
                <button
                  type="button"
                  onClick={() => onOpenHexInspector(result.targetLba)}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <Binary className="w-3 h-3" />
                  HEX 보기
                </button>
              )}
              {onOpenLbaCloner && heatmap && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenLbaCloner({
                      startLba: heatmap.globalStartLba,
                      endLba: heatmap.globalEndLba
                    })
                  }
                  className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  전체 LBA 백업
                </button>
              )}
            </div>
          </div>

          {/* File Children: LBA Range Groups + Inline Bad-Sector Heatmap Bar */}
          {isExpanded && (
            <div className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              {file.note && (
                <div className="text-[11px] text-slate-600 dark:text-slate-400">{file.note}</div>
              )}

              {/* Compact Inline Density Strip for Quick Tree Comparison */}
              {heatmap && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>
                      전체 LBA 스팬 #{heatmap.globalStartLba.toLocaleString()} ~ #
                      {heatmap.globalEndLba.toLocaleString()} ({heatmap.groups.length}개 그룹)
                    </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      밀도 {heatmap.overallBadDensityPct}%
                    </span>
                  </div>
                  <div className="flex gap-0.5 h-2.5 w-full rounded bg-slate-100 dark:bg-slate-950 p-0.5 border border-slate-200 dark:border-slate-800">
                    {heatmap.cells.map(cell => (
                      <div
                        key={cell.cellIndex}
                        title={`LBA #${cell.startLba.toLocaleString()}~#${cell.endLba.toLocaleString()} | 밀도 ${cell.badDensityPct}%`}
                        className={`flex-1 rounded-[1px] ${getSeverityCellClasses(cell.severity).split(' ')[0]} ${
                          cell.containsTargetLba ? 'ring-1 ring-red-400' : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {file.extents.length > 0 && heatmap ? (
                <div className="border-l border-slate-300 dark:border-slate-700 ml-1.5 space-y-1.5">
                  {heatmap.groups.map(group =>
                    renderZoneGroupNode(group, file, fileNodeId, result)
                  )}
                </div>
              ) : (
                <div className="border-l border-amber-400/70 ml-1.5 pl-4">
                  <div className="rounded border border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/25 px-2.5 py-2 font-mono text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      비거주 클러스터(Data Run)가 없으며, 손상 LBA #{result.targetLba.toLocaleString()}가 $MFT
                      레코드 #{file.mftRecordNumber?.toLocaleString() ?? '?'} 섹터에 직접 위치합니다.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDirBranch = (node: DirTreeNode, result: LbaFileTraceResult, depth: number): React.ReactNode => {
    const isExpanded = !!expandedNodes[node.id];
    const childDirs = Array.from(node.children.values());
    const subtreeCount = countDirSubtreeFiles(node);

    return (
      <div key={node.id} className={`relative ${depth > 0 ? 'pl-5 pt-1.5' : ''}`}>
        {depth > 0 && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-4 w-4 h-px bg-slate-300 dark:bg-slate-700"
          />
        )}

        <button
          type="button"
          onClick={() => toggleNode(node.id)}
          className="w-full text-left px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 truncate">
              {node.name}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
              {node.path}
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 shrink-0">
            영향 파일 {subtreeCount}건
          </span>
        </button>

        {isExpanded && (
          <div className="ml-3 border-l border-slate-300 dark:border-slate-700">
            {childDirs.map(child => renderDirBranch(child, result, depth + 1))}
            {node.files.map(({ file, originalIndex }) => renderFileLeafNode(file, originalIndex, result))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      id="LbaFileTracerModal"
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
            : 'relative w-full max-w-4xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md shadow-xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-amber-600 flex items-center justify-center text-white shrink-0">
              <FileSearch className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                손상 LBA 영향 파일 추적기 (NTFS $MFT / FAT32 Forensic)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {drive.model} · 물리 LBA → 파일-LBA 관계 트리 → 파일 전체 LBA 범위 배드섹터 밀도 히트맵
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`p-4 sm:p-5 space-y-4 text-xs ${isInline ? '' : 'overflow-y-auto'}`}>
          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                추적할 물리 LBA 주소 (0 ~ {maxLba.toLocaleString()})
              </label>
              <input
                type="number"
                min={0}
                max={maxLba}
                value={lbaInput}
                onChange={e => setLbaInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="sm:w-44">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                최대 $MFT 스캔 레코드
              </label>
              <select
                value={maxMftRecords}
                disabled={isTracing}
                onChange={e => setMaxMftRecords(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={2048}>2,048 Records (빠름)</option>
                <option value={8192}>8,192 Records (권장)</option>
                <option value={16384}>16,384 Records (정밀)</option>
                <option value={32768}>32,768 Records (심층)</option>
              </select>
            </div>

            {isTracing ? (
              <button
                type="button"
                onClick={() => abortControllerRef.current?.abort()}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 h-[34px]"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                추적 중단 ({scannedCount.toLocaleString()})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runTrace(Math.max(0, Math.floor(Number(lbaInput) || 0)))}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 h-[34px]"
              >
                <Search className="w-3.5 h-3.5" />
                영향 파일 추적 실행
              </button>
            )}
          </div>

          {!tauriActive && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="text-[11px]">
                실제 디스크의 MBR/GPT, VBR BPB, NTFS $MFT 및 FAT32 FAT1 클러스터 체인 판독은 Windows 관리자 권한이 부여된 Tauri 데스크톱 네이티브 IPC 환경에서만 수행됩니다.
              </div>
            </div>
          )}

          {isTracing && (
            <div className="p-3 rounded-lg border border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200 flex items-center justify-between">
              <span className="font-mono text-[11px]">{progressNote}</span>
              <span className="font-mono tabular-nums font-bold text-[11px]">
                {scannedCount.toLocaleString()} Records Scanned
              </span>
            </div>
          )}

          {/* Result Telemetry Strip, Heatmap & Relationship Tree */}
          {traceResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500 font-sans">소속 파티션</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                    {traceResult.partitionName}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500 font-sans">파일시스템 / 클러스터</div>
                  <div className="font-bold text-indigo-600 dark:text-indigo-400">
                    {traceResult.filesystem} ({traceResult.clusterSizeBytes > 0 ? `${traceResult.clusterSizeBytes}B` : 'N/A'})
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500 font-sans">대상 클러스터 (LCN)</div>
                  <div className="font-bold text-amber-600 dark:text-amber-400">
                    {traceResult.targetLcn !== null ? `#${traceResult.targetLcn.toLocaleString()}` : 'N/A'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500 font-sans">스캔 MFT / 소요시간</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {traceResult.mftRecordsScanned.toLocaleString()} · {traceResult.elapsedMs}ms
                  </div>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border flex items-start gap-2 ${
                  traceResult.affectedFiles.length > 0
                    ? 'border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                {traceResult.affectedFiles.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                ) : (
                  <HardDrive className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                )}
                <div className="text-[11px]">{traceResult.diagnosticNote}</div>
              </div>

              {/* Selected File Full LBA Range Grouping & Bad-Sector Density Heatmap */}
              {renderSelectedFileHeatmapSection()}

              {/* File Search Input Field for MFT Tree */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="MFT 트리 내 파일 이름 또는 경로 실시간 검색 및 하이라이트..."
                  className="w-full bg-transparent text-xs font-mono text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[10px] font-mono text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded cursor-pointer shrink-0"
                  >
                    초기화
                  </button>
                )}
              </div>

              {/* Section Toolbar: Relationship Tree vs Flat Extent Table */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    파일-LBA 관계 트리 (Physical LBA → Partition → Cluster → Directory → File → LBA 그룹)
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRequestRepairSelected}
                    disabled={isRepairingSelected || selectedBulkEntries.length === 0}
                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                    title="트리에서 선택된 파일들의 LBA 범위 내 배드섹터에 대해 S.M.A.R.T. 제로필 재할당 수복을 일괄 실행합니다"
                  >
                    {isRepairingSelected ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wrench className="w-3 h-3" />
                    )}
                    <span>Repair Selected</span>
                    <span className="font-mono tabular-nums opacity-90">
                      ({selectedBulkEntries.length}파일 · {selectedBulkBadTargets.length}섹터)
                    </span>
                  </button>

                  {viewMode === 'tree' && (
                    <div className="flex items-center gap-1.5 mr-1">
                      <button
                        type="button"
                        onClick={() => setSortByCriticality(prev => !prev)}
                        className={`px-2.5 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          sortByCriticality
                            ? 'bg-rose-600 text-white border-rose-700'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                        title="배드섹터 밀도가 높은 파일 순으로 트리를 재정렬합니다"
                      >
                        <Flame className="w-3 h-3" />
                        {sortByCriticality ? '위험도 정렬 켜짐' : 'Sort by Criticality'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllNodesExpanded(true)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        모두 펼치기
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllNodesExpanded(false)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Minimize2 className="w-3 h-3" />
                        접기
                      </button>
                    </div>
                  )}

                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-0.5 text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setViewMode('tree')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        viewMode === 'tree'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      관계 트리
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        viewMode === 'table'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Extent 상세표
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk S.M.A.R.T. Zero-Fill Remap Confirmation / Progress / Feedback Banner */}
              {(confirmRepairOpen || repairProgress || repairFeedback) && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                  {confirmRepairOpen && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            S.M.A.R.T. 제로필 섹터 재할당 일괄 실행 확인
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            선택된 <span className="font-mono font-bold">{selectedBulkEntries.length}개</span> 파일 LBA 범위 내{' '}
                            <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                              {selectedBulkBadTargets.length}개
                            </span>{' '}
                            배드/위험 섹터에 0x00을 기록하여 예비 섹터(Spare)로 강제 재할당합니다. 대상 섹터의 원본 데이터는 영구 덮어쓰기됩니다.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmRepairOpen(false)}
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleExecuteRepairSelected()}
                          className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          제로필 수복 실행
                        </button>
                      </div>
                    </div>
                  )}

                  {repairProgress && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-200">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                          S.M.A.R.T. 제로필 섹터 재할당 진행 중...
                        </span>
                        <span>
                          {repairProgress.current} / {repairProgress.total}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-rose-600 transition-all"
                          style={{
                            width: `${Math.round((repairProgress.current / Math.max(1, repairProgress.total)) * 100)}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {repairFeedback && (
                    <div
                      className={`flex items-start justify-between gap-2 text-[11px] ${
                        repairFeedback.type === 'success'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : repairFeedback.type === 'warning'
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        {repairFeedback.type === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        )}
                        <span>{repairFeedback.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRepairFeedback(null)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
                        aria-label="수복 결과 닫기"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tree View */}
              {viewMode === 'tree' && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                  {/* Level 0: Physical Disk Node */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleNode('node-disk')}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {expandedNodes['node-disk'] ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <HardDrive className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="font-bold text-slate-900 dark:text-white">
                          {drive.model}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                          물리 디스크 (L0)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {traceResult.sectorSize} B/sec · Target LBA #{traceResult.targetLba.toLocaleString()}
                      </span>
                    </button>

                    {/* Level 1: Partition Node */}
                    {expandedNodes['node-disk'] && (
                      <div className="ml-4 border-l border-slate-300 dark:border-slate-700 pl-5 pt-2 relative">
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-6 w-4 h-px bg-slate-300 dark:bg-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => toggleNode('node-partition')}
                          className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {expandedNodes['node-partition'] ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <Database className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white">
                              {traceResult.partitionName}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                              {traceResult.filesystem} 파티션 (L1)
                            </span>
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            LBA #{traceResult.partitionStartLba.toLocaleString()} ~ #{traceResult.partitionEndLba.toLocaleString()}
                            {traceResult.sectorsPerCluster > 0 &&
                              ` · ${traceResult.sectorsPerCluster} sec/cluster (${traceResult.clusterSizeBytes} B)`}
                          </span>
                        </button>

                        {/* Level 2: Target Cluster (LCN) / Zone Node */}
                        {expandedNodes['node-partition'] && (
                          <div className="ml-4 border-l border-slate-300 dark:border-slate-700 pl-5 pt-2 relative">
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-6 w-4 h-px bg-slate-300 dark:bg-slate-700"
                            />
                            <button
                              type="button"
                              onClick={() => toggleNode('node-lcn')}
                              className="w-full text-left px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/35 flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                {expandedNodes['node-lcn'] ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                )}
                                <Cpu className="w-4 h-4 text-amber-500 shrink-0" />
                                <span className="font-bold font-mono text-amber-900 dark:text-amber-200">
                                  {traceResult.targetLcn !== null
                                    ? `클러스터 LCN #${traceResult.targetLcn.toLocaleString()}`
                                    : '시스템 예약 / 비클러스터 영역'}
                                </span>
                                <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300">
                                  클러스터 매핑 (L2)
                                </span>
                              </div>
                              <span className="text-[10px] font-mono tabular-nums text-amber-800 dark:text-amber-300">
                                물리 LBA #{traceResult.targetLba.toLocaleString()} 역산 좌표
                              </span>
                            </button>

                            {/* Level 3+: Directory Tree -> File -> LBA Zone Groups -> Extent -> Bad LBA Hit */}
                            {expandedNodes['node-lcn'] && (
                              <div className="ml-4 border-l border-slate-300 dark:border-slate-700 pl-5 pt-2 relative">
                                <span
                                  aria-hidden="true"
                                  className="absolute left-0 top-5 w-4 h-px bg-slate-300 dark:bg-slate-700"
                                />
                                {traceResult.affectedFiles.length > 0 && dirTree ? (
                                  renderDirBranch(dirTree, traceResult, 0)
                                ) : (
                                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <div className="font-bold text-slate-800 dark:text-slate-200">
                                          비할당 클러스터 / 스캔 범위 내 매핑 파일 없음 (Unallocated / Unmapped Leaf)
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                          대상 LBA #{traceResult.targetLba.toLocaleString()}는{' '}
                                          {traceResult.partitionName} ({traceResult.filesystem}) 내부에 속하지만,
                                          검사한 레코드 범위에서 연결된 활성 파일을 찾지 못했습니다.
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {onOpenHexInspector && (
                                        <button
                                          type="button"
                                          onClick={() => onOpenHexInspector(traceResult.targetLba)}
                                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                                        >
                                          <Binary className="w-3 h-3" />
                                          LBA 헥스 확인
                                        </button>
                                      )}
                                      {onOpenLbaCloner && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onOpenLbaCloner({
                                              startLba: Math.max(0, traceResult.targetLba - 64),
                                              endLba: Math.min(maxLba, traceResult.targetLba + 64)
                                            })
                                          }
                                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                          <Layers className="w-3 h-3" />
                                          주변 섹터 백업
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Flat Extent Table View */}
              {viewMode === 'table' && traceResult.affectedFiles.length === 0 && (
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-center text-[11px] text-slate-600 dark:text-slate-400">
                  스캔된 범위에서 매핑된 파일이 없습니다. 상단의 <span className="font-semibold">관계 트리</span> 탭에서 파티션 및 클러스터(LCN) 위치와 주변 섹터 복제 옵션을 확인하세요.
                </div>
              )}

              {viewMode === 'table' && traceResult.affectedFiles.length > 0 && (
                <div className="space-y-2.5">
                  {traceResult.affectedFiles.map((file, idx) => (
                    <div
                      key={`${file.mftRecordNumber ?? idx}-${file.fileName}`}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderTree className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate">
                              {file.fullPath}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {file.filesystem} · 크기 {formatBytes(file.fileSizeBytes)}
                              {file.mftRecordNumber !== undefined && ` · MFT #${file.mftRecordNumber}`}
                              {file.isSystemMetafile && ' · NTFS 메타파일'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {onOpenHexInspector && (
                            <button
                              type="button"
                              onClick={() => onOpenHexInspector(traceResult.targetLba)}
                              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                            >
                              <Binary className="w-3 h-3" />
                              LBA 헥스 확인
                            </button>
                          )}
                          {onOpenLbaCloner && file.extents.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const first = file.extents[0];
                                const last = file.extents[file.extents.length - 1];
                                onOpenLbaCloner({
                                  startLba: first.startLba,
                                  endLba: last.endLba
                                });
                              }}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Layers className="w-3 h-3" />
                              이 LBA 범위 이미지 백업
                            </button>
                          )}
                        </div>
                      </div>

                      {file.note && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">{file.note}</div>
                      )}

                      {file.extents.length > 0 && (
                        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800 pt-2">
                          <table className="w-full text-left text-[11px] font-mono tabular-nums">
                            <thead>
                              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-slate-800">
                                <th className="py-1 px-2">VCN Offset</th>
                                <th className="py-1 px-2">LCN Cluster</th>
                                <th className="py-1 px-2">Clusters</th>
                                <th className="py-1 px-2">Start LBA</th>
                                <th className="py-1 px-2">End LBA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/60">
                              {file.extents.slice(0, 16).map((ext, eIdx) => {
                                const containsTarget =
                                  traceResult.targetLba >= ext.startLba &&
                                  traceResult.targetLba <= ext.endLba;
                                return (
                                  <tr
                                    key={eIdx}
                                    className={
                                      containsTarget
                                        ? 'bg-red-500/10 text-red-700 dark:text-red-300 font-bold'
                                        : 'text-slate-700 dark:text-slate-300'
                                    }
                                  >
                                    <td className="py-1 px-2">{ext.vcnStart.toLocaleString()}</td>
                                    <td className="py-1 px-2">{ext.lcnStart.toLocaleString()}</td>
                                    <td className="py-1 px-2">{ext.clusterCount.toLocaleString()}</td>
                                    <td className="py-1 px-2">#{ext.startLba.toLocaleString()}</td>
                                    <td className="py-1 px-2">#{ext.endLba.toLocaleString()}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            100% Read-Only Metadata Traversal (Zero Disk Writes)
          </span>
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
  );
};
