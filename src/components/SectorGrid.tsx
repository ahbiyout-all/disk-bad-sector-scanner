import React, { useState, useMemo } from 'react';
import { SectorBlock } from '../types';
import { ShieldAlert, Crosshair, ChevronLeft, ChevronRight, Eye, Info } from 'lucide-react';

interface SectorGridProps {
  blocks: SectorBlock[];
  activeBlockIndex: number;
  onSelectBlock?: (block: SectorBlock) => void;
  selectedBlock?: SectorBlock | null;
}

export const SectorGrid: React.FC<SectorGridProps> = ({
  blocks,
  activeBlockIndex,
  onSelectBlock,
  selectedBlock
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<SectorBlock | null>(null);
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'bad' | 'slow'>('all');

  const inspectedBlock = hoveredBlock || selectedBlock;

  // Bad sectors list for quick navigation
  const badBlocks = useMemo(() => {
    return blocks.filter(b => b.status === 'bad');
  }, [blocks]);

  const [badSectorNavIdx, setBadSectorNavIdx] = useState<number>(0);

  const handleNextBadSector = () => {
    if (badBlocks.length === 0) return;
    const nextIdx = (badSectorNavIdx + 1) % badBlocks.length;
    setBadSectorNavIdx(nextIdx);
    if (onSelectBlock) {
      onSelectBlock(badBlocks[nextIdx]);
    }
  };

  const handlePrevBadSector = () => {
    if (badBlocks.length === 0) return;
    const prevIdx = (badSectorNavIdx - 1 + badBlocks.length) % badBlocks.length;
    setBadSectorNavIdx(prevIdx);
    if (onSelectBlock) {
      onSelectBlock(badBlocks[prevIdx]);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs transition-colors">
      {/* Header with Navigation & View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-indigo-500" />
            Sector Map
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] font-normal normal-case">
              (Total {blocks.length.toLocaleString()} Blocks · Each dot represents ~2GB)
            </span>
          </h2>
        </div>

        {/* Action Controls: Bad sector jumper & highlight toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {badBlocks.length > 0 && (
            <div className="flex items-center gap-1 bg-red-950/30 border border-red-500/30 rounded px-2 py-0.5 text-red-400">
              <span className="text-[11px] font-mono font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-red-500" />
                Bad #{badSectorNavIdx + 1}/{badBlocks.length}
              </span>
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={handlePrevBadSector}
                  className="p-0.5 hover:bg-red-900/50 rounded text-red-300"
                  title="이전 배드섹터로 이동"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={handleNextBadSector}
                  className="p-0.5 hover:bg-red-900/50 rounded text-red-300"
                  title="다음 배드섹터로 이동"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center bg-slate-100 dark:bg-slate-950 rounded p-0.5 text-[11px] font-medium border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setHighlightFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                highlightFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setHighlightFilter('slow')}
              className={`px-2 py-0.5 rounded transition-colors ${
                highlightFilter === 'slow'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              지연만
            </button>
            <button
              onClick={() => setHighlightFilter('bad')}
              className={`px-2 py-0.5 rounded transition-colors ${
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

      {/* Grid Canvas / Visualizer */}
      <div className="relative bg-slate-950 rounded border border-slate-800/90 p-2 sm:p-2.5 select-none overflow-hidden">
        {/* CSS Grid of Sectors */}
        <div
          className="grid gap-[2px] sm:gap-[2.5px]"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(13px, 1fr))'
          }}
        >
          {blocks.map((block, idx) => {
            const isActive = idx === activeBlockIndex;
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
              colorClass = 'bg-emerald-500/75 hover:bg-emerald-400 border-emerald-500/40';
            } else if (block.status === 'normal') {
              colorClass = 'bg-lime-500/75 hover:bg-lime-400 border-lime-500/40';
            } else if (block.status === 'slow') {
              colorClass = 'bg-amber-500/85 hover:bg-amber-400 border-amber-500/40';
            } else if (block.status === 'critical') {
              colorClass = 'bg-orange-500 hover:bg-orange-400 border-orange-500/50';
            } else if (block.status === 'bad') {
              colorClass = 'bg-red-500 hover:bg-red-400 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse';
            }

            if (isActive) {
              colorClass = 'bg-indigo-500 border-indigo-300 ring-1 ring-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)] z-10';
            }

            if (isSelected) {
              colorClass += ' ring-2 ring-white ring-offset-1 ring-offset-slate-950 z-20';
            }

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

      {/* Sector Legend & Inspector Bar */}
      <div className="mt-2.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        {/* High Density Legend */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Healthy (&lt;10ms)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Reading</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-lime-500" />
            <span>Normal (&lt;50ms)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Pending (&gt;150ms)</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
            <span>Bad (UNC)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700" />
            <span>Queued</span>
          </div>
        </div>

        {/* Live Block Inspector */}
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
            <span>LBA: #{inspectedBlock.lba.toLocaleString()}</span>
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
                <span className="text-red-400">
                  BAD ({inspectedBlock.errorCode || 'UNC'})
                </span>
              ) : (
                <span className={inspectedBlock.responseTimeMs > 150 ? 'text-amber-400' : 'text-emerald-400'}>
                  {inspectedBlock.responseTimeMs} ms
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            <Info className="w-3 h-3 text-slate-500" />
            <span>Hover/Click block for exact LBA, Zone tag, and latency breakdown</span>
          </div>
        )}
      </div>
    </div>
  );
};
