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
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  Flame, 
  Layers, 
  Compass, 
  Navigation,
  Sparkles,
  RotateCcw,
  Binary
} from 'lucide-react';

interface SectorGridProps {
  blocks: SectorBlock[];
  activeBlockIndex: number;
  onSelectBlock?: (block: SectorBlock) => void;
  selectedBlock?: SectorBlock | null;
  onTriggerBitCarving?: (lba: number) => void;
}

export type ZoomLevel = 1 | 2 | 4 | 8;

export const SectorGrid: React.FC<SectorGridProps> = ({
  blocks,
  activeBlockIndex,
  onSelectBlock,
  selectedBlock,
  onTriggerBitCarving,
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<SectorBlock | null>(null);
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'bad' | 'slow'>('all');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);
  const [viewCenterIndex, setViewCenterIndex] = useState<number>(blocks.length / 2);
  const [followScanHead, setFollowScanHead] = useState<boolean>(false);

  const inspectedBlock = hoveredBlock || selectedBlock;

  // Bad sectors list for quick navigation
  const badBlocks = useMemo(() => {
    return blocks.filter(b => b.status === 'bad');
  }, [blocks]);

  // Group bad blocks into localized LBA clusters (within ~25 blocks of each other)
  const badClusters = useMemo(() => {
    if (badBlocks.length === 0) return [];

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

    badBlocks.forEach((badBlock) => {
      const idx = blocks.findIndex(b => b.id === badBlock.id);
      if (idx === -1) return;

      const existing = clusters.find(
        c => Math.abs(c.centerIndex - idx) <= 30
      );

      if (existing) {
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
    });

    return clusters;
  }, [badBlocks, blocks]);

  const [badSectorNavIdx, setBadSectorNavIdx] = useState<number>(0);

  // Jump to specific bad block and automatically zoom into its LBA neighborhood
  const focusOnBlockWithZoom = (targetBlock: SectorBlock, targetZoom: ZoomLevel = 4) => {
    const idx = blocks.findIndex(b => b.id === targetBlock.id);
    if (idx !== -1) {
      setViewCenterIndex(idx);
      setZoomLevel(targetZoom);
      if (onSelectBlock) {
        onSelectBlock(targetBlock);
      }
    }
  };

  const handleNextBadSector = () => {
    if (badBlocks.length === 0) return;
    const nextIdx = (badSectorNavIdx + 1) % badBlocks.length;
    setBadSectorNavIdx(nextIdx);
    focusOnBlockWithZoom(badBlocks[nextIdx], zoomLevel === 1 ? 4 : zoomLevel);
  };

  const handlePrevBadSector = () => {
    if (badBlocks.length === 0) return;
    const prevIdx = (badSectorNavIdx - 1 + badBlocks.length) % badBlocks.length;
    setBadSectorNavIdx(prevIdx);
    focusOnBlockWithZoom(badBlocks[prevIdx], zoomLevel === 1 ? 4 : zoomLevel);
  };

  // Follow active scanning head if enabled
  useEffect(() => {
    if (followScanHead && zoomLevel > 1 && activeBlockIndex >= 0 && activeBlockIndex < blocks.length) {
      setViewCenterIndex(activeBlockIndex);
    }
  }, [activeBlockIndex, followScanHead, zoomLevel, blocks.length]);

  // When external selectedBlock changes (e.g. from ErrorLogStream), center viewport
  useEffect(() => {
    if (selectedBlock) {
      const idx = blocks.findIndex(b => b.id === selectedBlock.id);
      if (idx !== -1 && zoomLevel > 1) {
        setViewCenterIndex(idx);
      }
    }
  }, [selectedBlock, blocks, zoomLevel]);

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
    return visibleBlocks.filter(b => b.status === 'bad').length;
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
              총 {blocks.length.toLocaleString()}개 블록 중 {visibleBlocks.length}개 표시 중 · LBA 범위: #{visibleBlocks[0]?.lba.toLocaleString()} ~ #{visibleBlocks[visibleBlocks.length - 1]?.endLba.toLocaleString()}
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
          {badBlocks.length > 0 && (
            <div className="flex items-center gap-1 bg-red-950/30 border border-red-500/40 rounded-lg px-2 py-1 text-red-400">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-[11px] font-mono font-bold">
                배드 #{badSectorNavIdx + 1}/{badBlocks.length}
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
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                highlightFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setHighlightFilter('slow')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                highlightFilter === 'slow'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              지연만
            </button>
            <button
              onClick={() => setHighlightFilter('bad')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                highlightFilter === 'bad'
                  ? 'bg-white dark:bg-slate-800 text-red-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              배드만
            </button>
          </div>
        </div>
      </div>

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
              현재 뷰포트: #{windowStartIdx + 1} ~ #{windowEndIdx + 1} ({((visibleBlocks.length / blocks.length) * 100).toFixed(0)}% 영역)
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
              style={{ width: `${Math.min(100, (activeBlockIndex / blocks.length) * 100)}%` }}
            />

            {/* Individual Bad Sector Red Indicator Dots on Mini-Map */}
            {badBlocks.map((b) => {
              const bIdx = blocks.findIndex(item => item.id === b.id);
              if (bIdx === -1) return null;
              const leftPct = (bIdx / blocks.length) * 100;
              return (
                <div
                  key={`minimap-bad-${b.id}`}
                  className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,1)] z-10"
                  style={{ left: `${leftPct}%` }}
                />
              );
            })}

            {/* Active Head Position Marker */}
            {activeBlockIndex >= 0 && activeBlockIndex < blocks.length && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,1)] z-20 animate-pulse"
                style={{ left: `${(activeBlockIndex / blocks.length) * 100}%` }}
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
                left: `${(windowStartIdx / blocks.length) * 100}%`,
                width: `${Math.max(2, (visibleBlocks.length / blocks.length) * 100)}%`
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
              disabled={windowEndIdx === blocks.length - 1}
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
          {visibleBlocks.map((block) => {
            const actualIndex = blocks.findIndex(b => b.id === block.id);
            const isActive = actualIndex === activeBlockIndex;
            const isSelected = selectedBlock?.id === block.id;

            // Highlight filtering
            let opacity = 'opacity-100';
            if (highlightFilter === 'bad' && block.status !== 'bad') {
              opacity = 'opacity-10';
            } else if (highlightFilter === 'slow' && block.status !== 'slow' && block.status !== 'critical' && block.status !== 'bad') {
              opacity = 'opacity-10';
            }

            // High Density Block color styling
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

            if (isSelected) {
              colorClass += ' ring-2 ring-white ring-offset-2 ring-offset-slate-950 z-20';
            }

            // High Detail Tile Rendering for 4x and 8x Zoom Levels
            if (zoomLevel >= 4) {
              return (
                <div
                  key={block.id}
                  onMouseEnter={() => setHoveredBlock(block)}
                  onMouseLeave={() => setHoveredBlock(null)}
                  onClick={() => onSelectBlock && onSelectBlock(block)}
                  className={`rounded-md cursor-pointer transition-all duration-75 border p-1 sm:p-1.5 flex flex-col justify-between ${colorClass} ${opacity} hover:ring-2 hover:ring-white`}
                  title={`블록 #${block.id} (LBA: ${block.lba.toLocaleString()} ~ ${block.endLba.toLocaleString()}) - ${block.status.toUpperCase()}`}
                >
                  <div className="flex items-center justify-between font-mono text-[9px] sm:text-[10px] leading-tight">
                    <span className="font-bold truncate opacity-90">#{block.id}</span>
                    {block.status === 'bad' ? (
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

            // Compact / Standard Dot Rendering for 1x and 2x Zoom Levels
            return (
              <div
                key={block.id}
                onMouseEnter={() => setHoveredBlock(block)}
                onMouseLeave={() => setHoveredBlock(null)}
                onClick={() => onSelectBlock && onSelectBlock(block)}
                className={`aspect-square rounded-xs cursor-pointer transition-all duration-75 border ${colorClass} ${opacity} hover:ring-1 hover:ring-white`}
                title={`블록 #${block.id} (LBA: ${block.lba.toLocaleString()}) - ${block.status.toUpperCase()} ${block.responseTimeMs > 0 ? `(${block.responseTimeMs}ms)` : ''}`}
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
};
