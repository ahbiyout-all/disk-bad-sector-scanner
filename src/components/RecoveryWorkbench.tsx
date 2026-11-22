import React from 'react';
import {
  AppLocale,
  DiskDrive,
  ErrorLogItem,
  RecoveryToolTab,
  SavedScanRecord,
  SectorBlock
} from '../types';
import { t } from '../utils/i18n';
import {
  Binary,
  Eraser,
  FileSearch,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench
} from 'lucide-react';
import { SectorHexPartitionModal } from './SectorHexPartitionModal';
import { BitCarvingRecoveryModal } from './BitCarvingRecoveryModal';
import { LbaFileTracerModal } from './LbaFileTracerModal';
import { SmartRemapModal } from './SmartRemapModal';
import { LbaImageClonerModal } from './LbaImageClonerModal';
import { SanitizeTrimModal } from './SanitizeTrimModal';

export interface RecoveryWorkbenchProps {
  activeTool: RecoveryToolTab;
  onSelectTool: (tool: RecoveryToolTab) => void;
  activeDrive?: DiskDrive;
  blocks: SectorBlock[];
  errorLogs: ErrorLogItem[];
  scanRecords: SavedScanRecord[];
  locale: AppLocale;
  hexInspectorTargetLba: number;
  bitCarvingTargetLba: number;
  fileTracerTargetLba: number;
  smartRemapTargetLba: number | null;
  queuedRepairBlockIds: number[];
  lbaClonerRange: { startLba: number; endLba: number } | null;
  onSyncRepairQueue: (blockIds: number[]) => void;
  onRepairSectors: (
    driveId: string,
    repairedBlockIds: number[],
    latencyByBlockId?: Record<number, number>
  ) => void;
  onOpenHexInspector: (lba: number) => void;
  onOpenLbaCloner: (range: { startLba: number; endLba: number }) => void;
  onRefreshHardware: () => Promise<void> | void;
  onRescanDrives: () => Promise<void>;
  isRescanning?: boolean;
}

export const RecoveryWorkbench: React.FC<RecoveryWorkbenchProps> = ({
  activeTool,
  onSelectTool,
  activeDrive,
  blocks,
  errorLogs,
  scanRecords,
  locale,
  hexInspectorTargetLba,
  bitCarvingTargetLba,
  fileTracerTargetLba,
  smartRemapTargetLba,
  queuedRepairBlockIds,
  lbaClonerRange,
  onSyncRepairQueue,
  onRepairSectors,
  onOpenHexInspector,
  onOpenLbaCloner,
  onRefreshHardware,
  onRescanDrives,
  isRescanning = false
}) => {
  const en = locale === 'en';

  const tools: {
    id: RecoveryToolTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: 'hex',
      label: en ? 'Hex & GPT' : 'Hex & GPT',
      icon: <Binary className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'carving',
      label: en ? 'Bit Carving' : '비트 카빙',
      icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'tracer',
      label: en ? 'File Tracer' : '파일 추적',
      icon: <FileSearch className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'remap',
      label: en ? 'SMART Remap' : 'SMART 리맵',
      icon: <Wrench className="w-3.5 h-3.5 shrink-0" />,
      badge: queuedRepairBlockIds.length > 0 ? String(queuedRepairBlockIds.length) : undefined
    },
    {
      id: 'cloner',
      label: en ? 'ddrescue Clone' : 'ddrescue 클로닝',
      icon: <HardDrive className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'sanitize',
      label: en ? 'Sanitize & TRIM' : 'Sanitize & TRIM',
      icon: <Eraser className="w-3.5 h-3.5 shrink-0" />
    }
  ];

  return (
    <div className="space-y-3">
      {/* Compact Horizontal Sub-Tab Bar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md px-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-thin">
        <nav aria-label="Recovery Workbench Tools" className="flex items-center gap-1">
          {tools.map(tool => {
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id)}
                className={`h-10 px-3 border-b-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tool.icon}
                <span>{tool.label}</span>
                {tool.badge && (
                  <span className="font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-red-600/15 text-red-600 dark:text-red-400">
                    {tool.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {activeDrive && (
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
            <span className="truncate max-w-[180px]">{activeDrive.model}</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>{activeDrive.capacityGb !== null ? `${activeDrive.capacityGb} GB` : 'N/A'}</span>
          </div>
        )}
      </div>

      {/* Drive-Required Guardrail or Active Inline Tool */}
      {!activeDrive ? (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t(locale, 'workbench.needDriveTitle')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                {t(locale, 'workbench.needDriveDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRescanDrives()}
            disabled={isRescanning}
            className="h-8 px-3.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
            <span>{t(locale, 'nav.rescan')}</span>
          </button>
        </section>
      ) : (
        <div>
          {activeTool === 'hex' && (
            <SectorHexPartitionModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialLba={hexInspectorTargetLba}
            />
          )}

          {activeTool === 'carving' && (
            <BitCarvingRecoveryModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              initialLba={bitCarvingTargetLba}
              drive={activeDrive}
              driveModel={activeDrive.model}
            />
          )}

          {activeTool === 'tracer' && (
            <LbaFileTracerModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialLba={fileTracerTargetLba}
              sectorBlocks={blocks}
              errorLogs={errorLogs}
              badLbaHistory={scanRecords
                .filter(r => r.driveId === activeDrive.id)
                .flatMap(r => r.badLbaList || [])}
              onOpenHexInspector={onOpenHexInspector}
              onOpenLbaCloner={onOpenLbaCloner}
              onRepairSectors={onRepairSectors}
            />
          )}

          {activeTool === 'remap' && (
            <SmartRemapModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              activeDrive={activeDrive}
              blocks={blocks}
              initialQueuedBlockIds={queuedRepairBlockIds}
              initialTargetLba={smartRemapTargetLba}
              onSyncRepairQueue={onSyncRepairQueue}
              onRepairSectors={onRepairSectors}
            />
          )}

          {activeTool === 'cloner' && (
            <LbaImageClonerModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialRange={lbaClonerRange}
            />
          )}

          {activeTool === 'sanitize' && (
            <SanitizeTrimModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              onRefreshHardware={onRefreshHardware}
            />
          )}
        </div>
      )}
    </div>
  );
};
