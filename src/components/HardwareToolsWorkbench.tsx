import React from 'react';
import {
  AppLocale,
  DiskDrive,
  DiskHardwareSpecs,
  HardwareToolTab,
  ScanTelemetry,
  SpecializedScanMethodId,
  WatchdogRule,
  WatchdogTriggerEvent
} from '../types';
import { t } from '../utils/i18n';
import {
  Activity,
  Award,
  BookOpen,
  Cpu,
  Gauge,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Usb
} from 'lucide-react';
import { DiskHardwareDetailsModal } from './DiskHardwareDetailsModal';
import { DiskBenchmarkProfilerModal } from './DiskBenchmarkProfilerModal';
import { ExternalDeviceModal, ExternalDeviceModalTab } from './ExternalDeviceModal';
import { ParallelDriveScanModal } from './ParallelDriveScanModal';
import { TrayGuardianModal } from './TrayGuardianModal';
import { DriveFeaturesModal } from './DriveFeaturesModal';
import { VendorDiagnosticsModal } from './VendorDiagnosticsModal';
import { SupportedProductsCatalogModal } from './SupportedProductsCatalogModal';

export interface HardwareToolsWorkbenchProps {
  activeTool: HardwareToolTab;
  onSelectTool: (tool: HardwareToolTab) => void;
  drives: DiskDrive[];
  activeDrive?: DiskDrive;
  selectedDriveId: string;
  telemetry: ScanTelemetry;
  locale: AppLocale;
  highestTemp: number | null;
  hasBadSector: boolean;
  externalTab?: ExternalDeviceModalTab;
  usbPolicyOverrides: Record<string, string>;
  watchdogRules: WatchdogRule[];
  watchdogEvents: WatchdogTriggerEvent[];
  onSelectDrive: (id: string) => void;
  onEjectDrive: (id: string) => Promise<{ success: boolean; message: string }> | void;
  onRescanDrives: () => Promise<void>;
  isRescanning?: boolean;
  onApplyUsbMatrixPolicy: (
    driveId: string,
    profileKey: string | null,
    recommendedMethodId?: SpecializedScanMethodId
  ) => void;
  onBenchmarkComplete: (driveId: string, specsPatch: Partial<DiskHardwareSpecs>) => void;
  onTriggerNotification: (
    title: string,
    body: string,
    severity?: 'info' | 'warning' | 'critical'
  ) => void;
  onUpdateWatchdogRules: (rules: WatchdogRule[]) => void;
  onClearWatchdogEvents: () => void;
  onRunWatchdogNow: () => void;
  onOpenHexInspector: (lba?: number) => void;
  onOpenRemapModal: () => void;
  onOpenSanitizeTrim: () => void;
  onMountOpfsDiagnosticDrive?: () => Promise<void> | void;
  onMountLocalImage?: () => void;
}

export const HardwareToolsWorkbench: React.FC<HardwareToolsWorkbenchProps> = ({
  activeTool,
  onSelectTool,
  drives,
  activeDrive,
  selectedDriveId,
  telemetry,
  locale,
  highestTemp,
  hasBadSector,
  externalTab = 'connected',
  usbPolicyOverrides,
  watchdogRules,
  watchdogEvents,
  onSelectDrive,
  onEjectDrive,
  onRescanDrives,
  isRescanning = false,
  onApplyUsbMatrixPolicy,
  onBenchmarkComplete,
  onTriggerNotification,
  onUpdateWatchdogRules,
  onClearWatchdogEvents,
  onRunWatchdogNow,
  onOpenHexInspector,
  onOpenRemapModal,
  onOpenSanitizeTrim,
  onMountOpfsDiagnosticDrive,
  onMountLocalImage
}) => {
  const en = locale === 'en';

  const tools: {
    id: HardwareToolTab;
    label: string;
    icon: React.ReactNode;
    driveRequired: boolean;
    badge?: string;
  }[] = [
    {
      id: 'specs',
      label: en ? 'Specs & Link' : '스펙·링크',
      icon: <Cpu className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: true
    },
    {
      id: 'benchmark',
      label: en ? 'I/O Benchmark' : 'I/O 벤치마크',
      icon: <Gauge className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: true
    },
    {
      id: 'usb',
      label: en ? 'External & USB' : '외장·USB',
      icon: <Usb className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: false
    },
    {
      id: 'parallel',
      label: en ? 'Parallel Scan' : '병렬 스캔',
      icon: <Layers className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: false
    },
    {
      id: 'watchdog',
      label: en ? 'Watchdog' : '워치독',
      icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: false,
      badge: watchdogEvents.length > 0 ? String(watchdogEvents.length) : undefined
    },
    {
      id: 'features',
      label: en ? 'AAM / APM' : '기능 제어',
      icon: <Sliders className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: true
    },
    {
      id: 'vendor',
      label: en ? 'Vendor Suite' : '제조사 진단',
      icon: <Award className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: true
    },
    {
      id: 'catalog',
      label: en ? 'Catalog' : '지원 목록',
      icon: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
      driveRequired: false
    }
  ];

  const activeConfig = tools.find(item => item.id === activeTool) || tools[0];
  const needsDrive = activeConfig.driveRequired && !activeDrive;

  return (
    <div className="space-y-3">
      {/* Compact Horizontal Sub-Tab Bar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md px-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-thin">
        <nav aria-label="Hardware and Watchdog Tools" className="flex items-center gap-1">
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
                  <span className="font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {tool.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
          <Activity className="w-3.5 h-3.5 text-blue-500" />
          <span>{drives.length} {en ? 'Drives' : '대 연결'}</span>
        </div>
      </div>

      {/* Drive-Required Guardrail or Active Inline Tool */}
      {needsDrive ? (
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
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
            {onMountOpfsDiagnosticDrive && (
              <button
                type="button"
                onClick={() => void onMountOpfsDiagnosticDrive()}
                className="h-8 px-3.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{en ? 'Mount 8MB OPFS Image' : '진단용 이미지 마운트 (OPFS 8MB)'}</span>
              </button>
            )}
            {onMountLocalImage && (
              <button
                type="button"
                onClick={onMountLocalImage}
                className="h-8 px-3.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{en ? 'Load .img/.dd File' : '로컬 이미지 마운트'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void onRescanDrives()}
              disabled={isRescanning}
              className="h-8 px-3.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
              <span>{t(locale, 'nav.rescan')}</span>
            </button>
          </div>
        </section>
      ) : (
        <div>
          {activeTool === 'specs' && activeDrive && (
            <DiskHardwareDetailsModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              onRescanHardware={onRescanDrives}
              onOpenBenchmarkProfiler={() => onSelectTool('benchmark')}
              onOpenHexInspector={onOpenHexInspector}
            />
          )}

          {activeTool === 'benchmark' && activeDrive && (
            <DiskBenchmarkProfilerModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              onBenchmarkComplete={onBenchmarkComplete}
            />
          )}

          {activeTool === 'usb' && (
            <ExternalDeviceModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drives={drives}
              selectedDriveId={selectedDriveId}
              onSelectDrive={onSelectDrive}
              onEjectDrive={onEjectDrive}
              onRescanDrives={onRescanDrives}
              initialTab={externalTab}
              usbPolicyOverrides={usbPolicyOverrides}
              onApplyUsbMatrixPolicy={onApplyUsbMatrixPolicy}
            />
          )}

          {activeTool === 'parallel' && (
            <ParallelDriveScanModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drives={drives}
            />
          )}

          {activeTool === 'watchdog' && (
            <TrayGuardianModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drives={drives}
              highestTemp={highestTemp}
              hasBadSector={hasBadSector}
              onTriggerNotification={(title, body) => onTriggerNotification(title, body, 'warning')}
              watchdogRules={watchdogRules}
              onUpdateWatchdogRules={onUpdateWatchdogRules}
              watchdogEvents={watchdogEvents}
              onClearWatchdogEvents={onClearWatchdogEvents}
              onRunWatchdogNow={onRunWatchdogNow}
            />
          )}

          {activeTool === 'features' && activeDrive && (
            <DriveFeaturesModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              onOpenSanitizeTrim={onOpenSanitizeTrim}
            />
          )}

          {activeTool === 'vendor' && activeDrive && (
            <VendorDiagnosticsModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              activeDrive={activeDrive}
              telemetry={telemetry}
              onOpenUsbModal={() => onSelectTool('usb')}
              onOpenCatalogModal={() => onSelectTool('catalog')}
              onOpenRemapModal={onOpenRemapModal}
              onRefreshSmart={() => {
                void onRescanDrives();
              }}
            />
          )}

          {activeTool === 'catalog' && (
            <SupportedProductsCatalogModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              onSelectVendorForDiagnostic={() => onSelectTool('vendor')}
            />
          )}
        </div>
      )}
    </div>
  );
};
