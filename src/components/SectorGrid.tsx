import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SectorBlock } from '../types';
import { 
  ShieldAlert, 
  Crosshair, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Info, 
  ZoomIn, 
  Flame, 
  Compass, 
  Navigation,
  RotateCcw,
  Binary,
  FileSearch,
  HardDriveDownload,
  CheckSquare,
  Square,
  Wrench,
  Trash2,
  ListChecks
} from 'lucide-react';

interface SectorGridProps {
  blocks: SectorBlock[];
  activeBlockIndex: number;
  onSelectBlock?: (block: SectorBlock) => void;
  selectedBlock?: SectorBlock | null;
  queuedRepairBlockIds?: number[];
  onToggleQueueBlock?: (blockId: number) => void;
  onBulkSelectRepairBlocks?: (blockIds: number[], mode: 'add' | 'replace' | 'remove') => void;
  onClearRepairQueue?: () => void;
  onOpenRemapWithQueue?: () => void;
  onTriggerBitCarving?: (lba: number) => void;
  onOpenHexInspector?: (lba: number) => void;
  onTraceLbaFile?: (lba: number) => void;
  onCloneLbaRange?: (range: { startLba: number; endLba: number }) => void;
}

export type ZoomLevel = 1 | 2 | 4 | 8;

const SectorTile = React.memo<{
  block: SectorBlock;
  isActive: boolean;
  isSelected: boolean;
  isQueuedForRepair: boolean;
  isBulkSelectMode: boolean;
  zoomLevel: ZoomLevel;
  highlightFilter: 'all' | 'bad' | 'slow';
  onHoverBlock: (block: SectorBlock | null) => void;
  onTileClick: (block: SectorBlock, e: React.MouseEvent<HTMLDivElement>) => void;
}>(({
  block,
  isActive,
  isSelected,
  isQueuedForRepair,
  isBulkSelectMode,
  zoomLevel,
  highlightFilter,
  onHoverBlock,
  onTileClick
}) => {
  let opacity = 'opacity-100';
  if (highlightFilter === 'bad' && block.status !== 'bad' && !isQueuedForRepair) {
    opacity = 'opacity-10';
  } else if (
    highlightFilter === 'slow' &&
    block.status !== 'slow' &&
    block.status !== 'critical' &&
    block.status !== 'bad' &&
    !isQueuedForRepair
  ) {
    opacity = 'opacity-10';
  }

  let colorClass = 'bg-slate-800/80 border-slate-700/40';
  if (block.status === 'good') {
    colorClass = 'bg-emerald-500/75 hover:bg-emerald-400 border-emerald-500/40 text-emerald-100';
  } else if (block.status === 'normal') {
    colorClass = 'bg-lime-500/75 hover:bg-lime-400 border-lime-500/40 text-lime-100';
  } else if (block.status === 'slow') {
    colorClass = 'bg-amber-500/85 hover:bg-amber-400 border-amber-500/40 text-amber-100';
  } else if (block.status === 'critical') {
    colorClass = 'bg-orange-500 hover:bg-orange-400 border-orange-500/50 text-orange-100';
  } else if (block.status === 'bad') {
    colorClass = 'bg-red-500 hover:bg-red-400 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse text-white';
  }

  if (isActive) {
    colorClass = 'bg-indigo-500 border-indigo-300 ring-2 ring-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-10 text-white';
  }

  if (isQueuedForRepair) {
    colorClass += ' ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950 z-15';
  } else if (isSelected) {
    colorClass += ' ring-2 ring-white ring-offset-2 ring-offset-slate-950 z-20';
  }

  const queueHint = isQueuedForRepair
    ? ' · [수복 큐 포함됨]'
    : isBulkSelectMode
    ? ' · (클릭하여 수복 큐 토글)'
    : ' · (Ctrl+클릭으로 다중 선택)';

  if (zoomLevel >= 4) {
    return (
      <div
        onMouseEnter={() => onHoverBlock(block)}
        onMouseLeave={() => onHoverBlock(null)}
        onClick={(e) => onTileClick(block, e)}
        className={`relative rounded-md cursor-pointer transition-all duration-75 border p-1 sm:p-1.5 flex flex-col justify-between ${colorClass} ${opacity} hover:ring-2 hover:ring-white`}
        title={`블록 #${block.id} (LBA: ${block.lba.toLocaleString()} ~ ${block.endLba.toLocaleString()}) - ${block.status.toUpperCase()}${queueHint}`}
      >
        <div className="flex items-center justify-between font-mono text-[9px] sm:text-[10px] leading-tight gap-0.5">
          <span className="font-bold truncate opacity-90">#{block.id}</span>
          {isQueuedForRepair ? (
            <span className="font-extrabold text-[8px] bg-cyan-600 text-white px-1 py-0.2 rounded">
              QUEUE
            </span>
          ) : block.status === 'bad' ? (
            <span className="font-extrabold text-[8px] bg-red-950/80 px-1 py-0.2 rounded border border-red-400/50">
              BAD
            </span>
          ) : (
            <span className="opacity-80 text-[8px]">
              {block.responseTimeMs > 0 ? `${block.responseTimeMs.toFixed(0)}ms` : '--'}
            </span>
          )}
        </div>

        {zoomLevel === 8 && (
          <div className="my-0.5 font-mono text-[8px] leading-none opacity-85 truncate">
            LBA {(block.lba / 1000000).toFixed(1)}M
          </div>
        )}

        <div className="text-[8px] sm:text-[9px] font-mono truncate font-semibold uppercase opacity-95">
          {block.status}
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => onHoverBlock(block)}
      onMouseLeave={() => onHoverBlock(null)}
      onClick={(e) => onTileClick(block, e)}
      className={`relative aspect-square rounded-xs cursor-pointer transition-all duration-75 border ${colorClass} ${opacity} hover:ring-1 hover:ring-white`}
      title={`블록 #${block.id} (LBA: ${block.lba.toLocaleString()}) - ${block.status.toUpperCase()}${block.responseTimeMs > 0 ? ` (${block.responseTimeMs}ms)` : ''}${queueHint}`}
    >
      {isQueuedForRepair && (
        <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-bl-xs bg-cyan-300 pointer-events-none" />
      )}
    </div>
  );
});

export const SectorGrid: React.FC<SectorGridProps> = React.memo(({
  blocks,
  activeBlockIndex,
  onSelectBlock,
  selectedBlock,
  queuedRepairBlockIds = [],
  onToggleQueueBlock,
  onBulkSelectRepairBlocks,
  onClearRepairQueue,
  onOpenRemapWithQueue,
  onTriggerBitCarving,
  onOpenHexInspector,
  onTraceLbaFile,
  onCloneLbaRange,
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<SectorBlock | null>(null);
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'bad' | 'slow'>('all');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);
  const [viewCenterIndex, setViewCenterIndex] = useState<number>(blocks.length / 2);
  const [followScanHead, setFollowScanHead] = useState<boolean>(false);
  const [isBulkSelectMode, setIsBulkSelectMode] = useState<boolean>(false);
  const lastBulkAnchorIndexRef = useRef<number | null>(null);

  const inspectedBlock = hoveredBlock || selectedBlock;

  const queuedRepairSet = useMemo(
    () => new Set<number>(queuedRepairBlockIds),
    [queuedRepairBlockIds]
  );

  const handleHoverBlock = React.useCallback((block: SectorBlock | null) => {
    setHoveredBlock(block);
  }, []);

  // O(1) lookup table + single-pass badEntries / delayedEntries extraction
  const { blockIndexById, badEntries, delayedOrBadEntries } = useMemo(() => {
    const idMap = new Map<number, number>();
    const bads: Array<{ block: SectorBlock; index: number }> = [];
    const delayedOrBad: Array<{ block: SectorBlock; index: number }> = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      idMap.set(b.id, i);
      if (b.status === 'bad') {
        bads.push({ block: b, index: i });
        delayedOrBad.push({ block: b, index: i });
      } else if (b.status === 'critical' || b.status === 'slow') {
        delayedOrBad.push({ block: b, index: i });
      }
    }
    return { blockIndexById: idMap, badEntries: bads, delayedOrBadEntries: delayedOrBad };
  }, [blocks]);

  const handleTileClick = React.useCallback(
    (block: SectorBlock, e: React.MouseEvent<HTMLDivElement>) => {
      const clickedIndex = blockIndexById.get(block.id);

      // Shift+Click range append when bulk handlers are wired
      if (
        e.shiftKey &&
        onBulkSelectRepairBlocks &&
        clickedIndex !== undefined &&
        lastBulkAnchorIndexRef.current !== null
      ) {
        const start = Math.min(lastBulkAnchorIndexRef.current, clickedIndex);
        const end = Math.max(lastBulkAnchorIndexRef.current, clickedIndex);
        const rangeIds = blocks.slice(start, end + 1).map(b => b.id);
        onBulkSelectRepairBlocks(rangeIds, 'add');
        lastBulkAnchorIndexRef.current = clickedIndex;
        if (onSelectBlock) onSelectBlock(block);
        return;
      }

      // Ctrl/Cmd+Click OR active Bulk Select Mode toggles block in non-contiguous repair queue
      if ((isBulkSelectMode || e.ctrlKey || e.metaKey) && onToggleQueueBlock) {
        onToggleQueueBlock(block.id);
        if (clickedIndex !== undefined) {
          lastBulkAnchorIndexRef.current = clickedIndex;
        }
        if (onSelectBlock) onSelectBlock(block);
        return;
      }

      if (clickedIndex !== undefined) {
        lastBulkAnchorIndexRef.current = clickedIndex;
      }
      if (onSelectBlock) {
        onSelectBlock(block);
      }
    },
    [blockIndexById, blocks, isBulkSelectMode, onBulkSelectRepairBlocks, onSelectBlock, onToggleQueueBlock]
  );

  // Group sorted bad blocks into localized LBA clusters in a single O(B) pass
  const badClusters = useMemo(() => {
    if (badEntries.length === 0) return [];

    const clusters: Array<{
      id: number;
      centerIndex: number;
      startIndex: number;
      endIndex: number;
      startLba: number;
      endLba: number;
      badCount: number;
      badBlocksList: SectorBlock[];
    }> = [];

    for (let i = 0; i < badEntries.length; i++) {
      const { block: badBlock, index: idx } = badEntries[i];
      const existing = clusters[clusters.length - 1];

      if (existing && Math.abs(existing.centerIndex - idx) <= 30) {
        existing.badCount++;
        existing.badBlocksList.push(badBlock);
        existing.startIndex = Math.min(existing.startIndex, Math.max(0, idx - 15));
        existing.endIndex = Math.max(existing.endIndex, Math.min(blocks.length - 1, idx + 15));
        existing.centerIndex = Math.round((existing.startIndex + existing.endIndex) / 2);
        existing.startLba = blocks[existing.startIndex]?.lba || existing.startLba;
        existing.endLba = blocks[existing.endIndex]?.endLba || existing.endLba;
      } else {
        const start = Math.max(0, idx - 15);
        const end = Math.min(blocks.length - 1, idx + 15);
        clusters.push({
          id: clusters.length + 1,
          centerIndex: idx,
          startIndex: start,
          endIndex: end,
          startLba: blocks[start]?.lba || badBlock.lba,
          endLba: blocks[end]?.endLba || badBlock.endLba,
          badCount: 1,
          badBlocksList: [badBlock]
        });
      }
    }

    return clusters;
  }, [badEntries, blocks]);

  const [badSectorNavIdx, setBadSectorNavIdx] = useState<number>(0);

  // Jump to specific bad block and automatically zoom into its LBA neighborhood
  const focusOnBlockWithZoom = (targetBlock: SectorBlock, targetZoom: ZoomLevel = 4) => {
    const idx = blockIndexById.get(targetBlock.id);
    if (idx !== undefined) {
      setViewCenterIndex(idx);
      setZoomLevel(targetZoom);
      if (onSelectBlock) {
        onSelectBlock(targetBlock);
      }
    }
  };

  const handleNextBadSector = () => {
    if (badEntries.length === 0) return;
    const nextIdx = (badSectorNavIdx + 1) % badEntries.length;
    setBadSectorNavIdx(nextIdx);
    focusOnBlockWithZoom(badEntries[nextIdx].block, zoomLevel === 1 ? 4 : zoomLevel);
  };

  const handlePrevBadSector = () => {
    if (badEntries.length === 0) return;
    const prevIdx = (badSectorNavIdx - 1 + badEntries.length) % badEntries.length;
    setBadSectorNavIdx(prevIdx);
    focusOnBlockWithZoom(badEntries[prevIdx].block, zoomLevel === 1 ? 4 : zoomLevel);
  };

  // Follow active scanning head if enabled
  useEffect(() => {
    if (followScanHead && zoomLevel > 1 && activeBlockIndex >= 0 && activeBlockIndex < blocks.length) {
      setViewCenterIndex(activeBlockIndex);
    }
  }, [activeBlockIndex, followScanHead, zoomLevel, blocks.length]);

  // When external selectedBlock changes (e.g. from ErrorLogStream), center viewport
  useEffect(() => {
    if (selectedBlock && zoomLevel > 1) {
      const idx = blockIndexById.get(selectedBlock.id);
      if (idx !== undefined) {
        setViewCenterIndex(idx);
      }
    }
  }, [selectedBlock, blockIndexById, zoomLevel]);

  // Compute active visible window based on zoom level and viewCenterIndex
  const { visibleBlocks, windowStartIdx, windowEndIdx, windowSize } = useMemo(() => {
    const total = blocks.length;
    if (zoomLevel === 1) {
      return {
        visibleBlocks: blocks,
        windowStartIdx: 0,
        windowEndIdx: total - 1,
        windowSize: total
      };
    }

    let size = 500;
    if (zoomLevel === 4) size = 250;
    if (zoomLevel === 8) size = 100;

    let start = Math.max(0, Math.round(viewCenterIndex - size / 2));
    let end = start + size - 1;

    if (end >= total) {
      end = total - 1;
      start = Math.max(0, end - size + 1);
    }

    return {
      visibleBlocks: blocks.slice(start, end + 1),
      windowStartIdx: start,
      windowEndIdx: end,
      windowSize: size
    };
  }, [blocks, zoomLevel, viewCenterIndex]);

  // Panning handlers
  const handlePan = (direction: 'left' | 'right') => {
    const shift = Math.max(20, Math.round(windowSize / 3));
    setViewCenterIndex(prev => {
      const next = direction === 'left' ? prev - shift : prev + shift;
      return Math.max(0, Math.min(blocks.length - 1, next));
    });
  };

  const handleZoomChange = (newZoom: ZoomLevel) => {
    setZoomLevel(newZoom);
    if (newZoom === 1) {
      setFollowScanHead(false);
    }
  };

  // Mini-map click handler
  const miniMapRef = useRef<HTMLDivElement>(null);
  const handleMiniMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!miniMapRef.current || blocks.length === 0) return;
    const rect = miniMapRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetIndex = Math.round(ratio * (blocks.length - 1));
    setViewCenterIndex(targetIndex);
    if (zoomLevel === 1) {
      setZoomLevel(4); // Automatically engage 4x zoom on minimap click
    }
  };

  // Bad sectors contained in the current zoomed viewport
  const visibleBadCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < visibleBlocks.length; i++) {
      if (visibleBlocks[i].status === 'bad') count++;
    }
    return count;
  }, [visibleBlocks]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs transition-colors">
      
      {/* 1. Header with Title, Zoom Controls & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 text-indigo-500">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>디스크 물리적 표면 LBA 지도 (Sector Map)</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold border ${
                zoomLevel > 1 
                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
              }`}>
                {zoomLevel === 1 ? '전체 보기 (1x)' : `줌 ${zoomLevel}x 확대`}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              총 {blocks.length.toLocaleString()}개 블록 중 {visibleBlocks.length}개 표시 중
              {visibleBlocks.length > 0
                ? ` · LBA 범위: #${visibleBlocks[0].lba.toLocaleString()} ~ #${visibleBlocks[visibleBlocks.length - 1].endLba.toLocaleString()}`
                : ' · LBA 범위: N/A'}
            </p>
          </div>
        </div>

        {/* 2. Zoom & Viewport Action Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          
          {/* Zoom Level Button Group (1x, 2x, 4x, 8x) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800 text-xs">
            <span className="px-1.5 text-[10px] font-semibold text-slate-400 uppercase hidden sm:inline">
              ZOOM
            </span>
            {([1, 2, 4, 8] as ZoomLevel[]).map(lvl => (
              <button
                key={lvl}
                onClick={() => handleZoomChange(lvl)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                  zoomLevel === lvl
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                title={`${lvl}배율 LBA 정밀 확대`}
              >
                {lvl}x
              </button>
            ))}
          </div>

          {/* Quick Bad Sector Focus Button */}
          {badEntries.length > 0 && (
            <div className="flex items-center gap-1 bg-red-950/30 border border-red-500/40 rounded-lg px-2 py-1 text-red-400">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-[11px] font-mono font-bold">
                배드 #{badSectorNavIdx + 1}/{badEntries.length}
              </span>
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={handlePrevBadSector}
                  className="p-0.5 hover:bg-red-900/50 rounded text-red-300 transition-colors cursor-pointer"
                  title="이전 배드섹터 LBA로 확대 이동"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleNextBadSector}
                  className="p-0.5 hover:bg-red-900/50 rounded text-red-300 transition-colors cursor-pointer"
                  title="다음 배드섹터 LBA로 확대 이동"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Highlight Filter Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 rounded-lg p-0.5 text-xs font-medium border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setHighlightFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                highlightFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setHighlightFilter('slow')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                highlightFilter === 'slow'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              지연만
            </button>
            <button
              onClick={() => setHighlightFilter('bad')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                highlightFilter === 'bad'
                  ? 'bg-white dark:bg-slate-800 text-red-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              배드만
            </button>
          </div>

          {/* Bulk Non-Contiguous Zero-Fill Selection Toggle */}
          {onToggleQueueBlock && (
            <button
              type="button"
              onClick={() => setIsBulkSelectMode(prev => !prev)}
              aria-pressed={isBulkSelectMode}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isBulkSelectMode
                  ? 'bg-cyan-600 text-white border-cyan-500 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-cyan-500/50'
              }`}
              title="활성화하면 그리드 블록을 클릭해 비연속 다중 섹터를 수복 큐에 추가/제거할 수 있습니다 (또는 Ctrl+클릭)"
            >
              <ListChecks className="w-3.5 h-3.5 shrink-0" />
              <span>다중 선택{queuedRepairBlockIds.length > 0 ? ` (${queuedRepairBlockIds.length})` : ''}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Non-Contiguous Zero-Fill Queue Action Ribbon */}
      {(isBulkSelectMode || queuedRepairBlockIds.length > 0) && onBulkSelectRepairBlocks && (
        <div className="mb-2.5 p-2.5 rounded-lg border border-cyan-500/35 bg-cyan-50/70 dark:bg-cyan-950/25 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-800 dark:text-slate-200">
            <span className="font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 whitespace-nowrap">
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              다중 제로필(Zero-Fill) 수복 큐
            </span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold">
              {queuedRepairBlockIds.length}개 비연속 블록 대기 중
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              (그리드 클릭, Ctrl+클릭, Shift+범위 클릭으로 자유롭게 추가/해제)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {badEntries.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onBulkSelectRepairBlocks(
                    badEntries.map(e => e.block.id),
                    'add'
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-400/50 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>모든 배드섹터 추가 ({badEntries.length})</span>
              </button>
            )}
            {delayedOrBadEntries.length > badEntries.length && (
              <button
                type="button"
                onClick={() =>
                  onBulkSelectRepairBlocks(
                    delayedOrBadEntries.map(e => e.block.id),
                    'add'
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>지연·배드 모두 추가 ({delayedOrBadEntries.length})</span>
              </button>
            )}
            {zoomLevel > 1 && visibleBlocks.some(b => b.status === 'bad') && (
              <button
                type="button"
                onClick={() =>
                  onBulkSelectRepairBlocks(
                    visibleBlocks.filter(b => b.status === 'bad').map(b => b.id),
                    'add'
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>현재 줌 배드만 추가</span>
              </button>
            )}
            {queuedRepairBlockIds.length > 0 && onClearRepairQueue && (
              <button
                type="button"
                onClick={onClearRepairQueue}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3 h-3 shrink-0" />
                <span>큐 비우기</span>
              </button>
            )}
            {onOpenRemapWithQueue && (
              <button
                type="button"
                disabled={queuedRepairBlockIds.length === 0}
                onClick={onOpenRemapWithQueue}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
              >
                <Wrench className="w-3 h-3 shrink-0" />
                <span>다단계 제로필 수복 실행 ({queuedRepairBlockIds.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. LBA Mini-Map & Defective Cluster Jumper Bar */}
      <div className="mb-2.5 space-y-1.5">
        {/* Defective LBA Cluster Quick Jumper Pills (if bad sectors exist) */}
        {badClusters.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-[10px] font-semibold text-red-500 dark:text-red-400 flex items-center gap-1 shrink-0 font-mono">
              <Flame className="w-3 h-3 text-red-500 animate-pulse" />
              배드섹터 결함 영역 ({badClusters.length}개):
            </span>
            {badClusters.map((cluster) => {
              const isCurrentCluster = viewCenterIndex >= cluster.startIndex && viewCenterIndex <= cluster.endIndex && zoomLevel > 1;
              return (
                <button
                  key={cluster.id}
                  onClick={() => {
                    setViewCenterIndex(cluster.centerIndex);
                    setZoomLevel(4);
                    if (cluster.badBlocksList[0] && onSelectBlock) {
                      onSelectBlock(cluster.badBlocksList[0]);
                    }
                  }}
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-mono transition-all flex items-center gap-1 cursor-pointer border ${
                    isCurrentCluster
                      ? 'bg-red-600 text-white border-red-500 font-bold shadow-xs'
                      : 'bg-red-950/20 text-red-400 border-red-500/30 hover:bg-red-900/40 hover:border-red-400'
                  }`}
                  title={`LBA #${cluster.startLba.toLocaleString()} ~ #${cluster.endLba.toLocaleString()} 결함 집중 영역으로 4배율 줌 이동`}
                >
                  <span>LBA {(cluster.startLba / 1000000).toFixed(1)}M 결함대</span>
                  <span className="px-1 rounded-full text-[9px] bg-red-900/60 text-red-200">
                    {cluster.badCount}개 배드
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Interactive LBA Mini-Map Bar */}
        <div className="bg-slate-100 dark:bg-slate-950 rounded-lg p-2 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono mb-1">
            <div className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-indigo-500" />
              <span>전체 디스크 LBA 네비게이터 (미니맵 클릭 시 해당 영역으로 확대 이동)</span>
            </div>
            <span>
              현재 뷰포트: {blocks.length > 0 ? `#${windowStartIdx + 1} ~ #${windowEndIdx + 1} (${((visibleBlocks.length / Math.max(1, blocks.length)) * 100).toFixed(0)}% 영역)` : '0개 블록 (0%)'}
            </span>
          </div>

          <div
            ref={miniMapRef}
            onClick={handleMiniMapClick}
            className="relative h-4 w-full bg-slate-200 dark:bg-slate-800/90 rounded cursor-pointer overflow-hidden group shadow-inner"
            title="미니맵의 원하는 LBA 위치를 클릭하면 해당 영역으로 즉시 확대 이동합니다."
          >
            {/* Scanned Progress Fill */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-indigo-500/20"
              style={{ width: `${blocks.length > 0 ? Math.min(100, (activeBlockIndex / Math.max(1, blocks.length)) * 100) : 0}%` }}
            />

            {/* Individual Bad Sector Red Indicator Dots on Mini-Map */}
            {badEntries.map(({ block: b, index: bIdx }) => {
              const leftPct = (bIdx / Math.max(1, blocks.length)) * 100;
              return (
                <div
                  key={`minimap-bad-${b.id}`}
                  className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,1)] z-10"
                  style={{ left: `${leftPct}%` }}
                />
              );
            })}

            {/* Queued Non-Contiguous Repair Block Cyan Markers on Mini-Map */}
            {queuedRepairBlockIds.map(qId => {
              const qIdx = blockIndexById.get(qId);
              if (qIdx === undefined) return null;
              const leftPct = (qIdx / Math.max(1, blocks.length)) * 100;
              return (
                <div
                  key={`minimap-queue-${qId}`}
                  className="absolute top-0 h-2 w-1 bg-cyan-300 z-25"
                  style={{ left: `${leftPct}%` }}
                />
              );
            })}

            {/* Active Head Position Marker */}
            {activeBlockIndex >= 0 && activeBlockIndex < blocks.length && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,1)] z-20 animate-pulse"
                style={{ left: `${(activeBlockIndex / Math.max(1, blocks.length)) * 100}%` }}
              />
            )}

            {/* Viewport Zoom Lens Rectangle (Shows current viewed region) */}
            <div
              className={`absolute top-0 bottom-0 rounded-xs border-2 transition-all pointer-events-none z-30 ${
                zoomLevel > 1 
                  ? 'border-indigo-400 bg-indigo-500/25 shadow-xs' 
                  : 'border-slate-400/40 bg-transparent'
              }`}
              style={{
                left: `${(windowStartIdx / Math.max(1, blocks.length)) * 100}%`,
                width: `${blocks.length > 0 ? Math.max(2, (visibleBlocks.length / Math.max(1, blocks.length)) * 100) : 0}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. Zoom Panning Control Ribbon (Visible when Zoom > 1x) */}
      {zoomLevel > 1 && (
        <div className="mb-2 p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-mono">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
              {zoomLevel}X ZOOM
            </span>
            <span className="text-[11px]">
              블록 #{windowStartIdx + 1} ~ #{windowEndIdx + 1} (총 {visibleBlocks.length}개)
            </span>
            {visibleBadCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-500/30">
                ⚠️ 배드섹터 {visibleBadCount}개 포함
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                ✓ 배드섹터 없음
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-center">
            {/* Follow scan head toggle */}
            <button
              onClick={() => setFollowScanHead(!followScanHead)}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 cursor-pointer border ${
                followScanHead
                  ? 'bg-cyan-600 text-white border-cyan-500 font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
              }`}
              title="검사 진행 헤드를 따라 줌 뷰포트가 실시간으로 자동 이동합니다"
            >
              <Navigation className={`w-3 h-3 ${followScanHead ? 'animate-spin' : ''}`} />
              <span>헤드 추적 {followScanHead ? 'ON' : 'OFF'}</span>
            </button>

            {/* Pan Left */}
            <button
              onClick={() => handlePan('left')}
              disabled={windowStartIdx === 0}
              className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
              title="이전 LBA 블록 영역으로 이동"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Pan Right */}
            <button
              onClick={() => handlePan('right')}
              disabled={windowEndIdx >= blocks.length - 1}
              className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
              title="다음 LBA 블록 영역으로 이동"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Reset to 1x */}
            <button
              onClick={() => handleZoomChange(1)}
              className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
              title="전체 디스크 뷰(1x)로 복귀"
            >
              <RotateCcw className="w-3 h-3" />
              <span>전체 뷰</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Grid Canvas / Dynamic Zoom Visualizer */}
      <div className="relative bg-slate-950 rounded-lg border border-slate-800/90 p-2 sm:p-2.5 select-none overflow-hidden min-h-[220px]">
        {/* CSS Dynamic Responsive Grid of Sectors */}
        <div
          className={`grid ${
            zoomLevel === 1
              ? 'gap-[2px] sm:gap-[2.5px]'
              : zoomLevel === 2
              ? 'gap-[3px] sm:gap-[3.5px]'
              : zoomLevel === 4
              ? 'gap-1.5 sm:gap-2'
              : 'gap-2 sm:gap-2.5'
          }`}
          style={{
            gridTemplateColumns:
              zoomLevel === 1
                ? 'repeat(auto-fill, minmax(13px, 1fr))'
                : zoomLevel === 2
                ? 'repeat(auto-fill, minmax(22px, 1fr))'
                : zoomLevel === 4
                ? 'repeat(auto-fill, minmax(46px, 1fr))'
                : 'repeat(auto-fill, minmax(78px, 1fr))'
          }}
        >
          {visibleBlocks.map((block, localIdx) => {
            const actualIndex = windowStartIdx + localIdx;
            return (
              <SectorTile
                key={block.id}
                block={block}
                isActive={actualIndex === activeBlockIndex}
                isSelected={selectedBlock?.id === block.id}
                isQueuedForRepair={queuedRepairSet.has(block.id)}
                isBulkSelectMode={isBulkSelectMode}
                zoomLevel={zoomLevel}
                highlightFilter={highlightFilter}
                onHoverBlock={handleHoverBlock}
                onTileClick={handleTileClick}
              />
            );
          })}
        </div>
      </div>

      {/* 6. Sector Legend & Live Inspector Bar */}
      <div className="mt-2.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        {/* High Density Legend */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>정상 (&lt;10ms)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>읽는 중 (I/O)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-lime-500" />
            <span>양호 (&lt;50ms)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>경고 (&gt;150ms)</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
            <span>배드섹터 (Bad UNC)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700" />
            <span>대기 중</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-semibold">
            <span className="w-2 h-2 rounded-xs bg-cyan-400 ring-1 ring-cyan-300" />
            <span>수복 큐</span>
          </div>
        </div>

        {/* Live Block Inspector Box */}
        {inspectedBlock && inspectedBlock.status !== 'unscanned' ? (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-100 dark:bg-slate-950 rounded text-[11px] font-mono text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 flex-wrap">
            <Eye className="w-3 h-3 text-indigo-500" />
            <span>Block #{inspectedBlock.id}</span>
            {inspectedBlock.zoneTag && (
              <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-[10px]">
                {inspectedBlock.zoneTag}
              </span>
            )}
            <span className="text-slate-500">|</span>
            <span>LBA: #{inspectedBlock.lba.toLocaleString()} ~ #{inspectedBlock.endLba.toLocaleString()}</span>
            {inspectedBlock.checksum && (
              <>
                <span className="text-slate-500">|</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">CRC: {inspectedBlock.checksum}</span>
              </>
            )}
            {inspectedBlock.throughputMbSec && inspectedBlock.throughputMbSec > 0 && (
              <>
                <span className="text-slate-500">|</span>
                <span className="text-violet-600 dark:text-violet-400">{inspectedBlock.throughputMbSec} MB/s</span>
              </>
            )}
            <span className="text-slate-500">|</span>
            <span className="font-semibold">
              {inspectedBlock.status === 'bad' ? (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  BAD ({inspectedBlock.errorCode || 'UNC'})
                </span>
              ) : (
                <span className={inspectedBlock.responseTimeMs > 150 ? 'text-amber-400' : 'text-emerald-400'}>
                  {inspectedBlock.responseTimeMs} ms
                </span>
              )}
            </span>

            {/* Quick Zoom Button for inspected block if currently in 1x */}
            {zoomLevel === 1 && (
              <button
                onClick={() => focusOnBlockWithZoom(inspectedBlock, 4)}
                className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                title="이 블록의 물리적 LBA 주변 영역을 4배율로 확대"
              >
                <ZoomIn className="w-2.5 h-2.5" />
                <span>영역 확대</span>
              </button>
            )}

            {/* Toggle Individual Block in Non-Contiguous Zero-Fill Queue */}
            {onToggleQueueBlock && (
              <button
                type="button"
                onClick={() => onToggleQueueBlock(inspectedBlock.id)}
                className={`ml-1 px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  queuedRepairSet.has(inspectedBlock.id)
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-700 dark:text-slate-200'
                }`}
                title="이 블록을 다중 제로필 수복 큐에 추가하거나 제거합니다"
              >
                {queuedRepairSet.has(inspectedBlock.id) ? (
                  <>
                    <CheckSquare className="w-2.5 h-2.5" />
                    <span>수복 큐 포함됨</span>
                  </>
                ) : (
                  <>
                    <Square className="w-2.5 h-2.5" />
                    <span>수복 큐 추가</span>
                  </>
                )}
              </button>
            )}

            {/* Direct Bit Carving Trigger for Bad Block */}
            {inspectedBlock.status === 'bad' && onTriggerBitCarving && (
              <button
                onClick={() => onTriggerBitCarving(inspectedBlock.lba)}
                className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-red-600 hover:bg-red-500 text-white font-sans font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                title="이 배드섹터에 대해 휴리스틱 파일 시그니처 및 ECC 패리티 비트 카빙 수복 실행"
              >
                <Binary className="w-2.5 h-2.5" />
                <span>비트 카빙 수복</span>
              </button>
            )}

            {/* Direct Raw LBA Hex Inspector Trigger */}
            {onOpenHexInspector && (
              <button
                onClick={() => onOpenHexInspector(inspectedBlock.lba)}
                className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-sans font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                title="이 블록 시작 LBA의 원시 바이트(Hex/ASCII)를 읽기 전용으로 검사"
              >
                <Binary className="w-2.5 h-2.5" />
                <span>LBA 헥스 뷰어</span>
              </button>
            )}

            {/* Direct Affected File Tracer Trigger */}
            {onTraceLbaFile && (
              <button
                onClick={() => onTraceLbaFile(inspectedBlock.lba)}
                className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-sans font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                title="이 LBA를 점유하는 NTFS/FAT32/exFAT 손상 영향 파일 추적"
              >
                <FileSearch className="w-2.5 h-2.5" />
                <span>영향 파일 추적</span>
              </button>
            )}

            {/* Direct ddrescue LBA Cloner Trigger */}
            {onCloneLbaRange && (
              <button
                onClick={() => onCloneLbaRange({ startLba: inspectedBlock.lba, endLba: inspectedBlock.endLba })}
                className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-sky-600 hover:bg-sky-500 text-white font-sans font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                title="이 LBA 구간을 ddrescue 다중 패스 엔진으로 안전 이미지 백업"
              >
                <HardDriveDownload className="w-2.5 h-2.5" />
                <span>이미지 백업</span>
              </button>
            )}
          </div>

        ) : (
          <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            <Info className="w-3 h-3 text-slate-500" />
            <span>블록에 마우스를 올리거나 클릭하면 물리 LBA 주소 및 정밀 진단 수치가 표시됩니다</span>
          </div>
        )}
      </div>
    </div>
  );
});
