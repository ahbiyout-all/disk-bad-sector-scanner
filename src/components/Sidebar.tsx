import React from 'react';
import { AppLocale, MainAppTab } from '../types';
import { PROJECT_INFO } from '../config/projectInfo';
import { t } from '../utils/i18n';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FolderLock,
  GitCompare,
  HardDrive,
  LayoutGrid,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  X
} from 'lucide-react';

export interface SidebarProps {
  activeTab: MainAppTab;
  onSelectTab: (tab: MainAppTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  locale: AppLocale;
  drivesCount: number;
  badCount: number;
  errorLogCount: number;
  scanRecordsCount: number;
  isScanning: boolean;
  healthScore: number | null;
  isNativeReady: boolean;
  watchdogRuleCount: number;
  watchdogAlertCount: number;
  hasUpdate: boolean;
  latestVersion?: string;
  onOpenWatchdog: () => void;
  onOpenUpdateModal: () => void;
}

interface SidebarNavItem {
  id: MainAppTab;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  rightText?: string;
  rightTone?: 'neutral' | 'danger' | 'good' | 'cobalt';
  activeDot?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  locale,
  drivesCount,
  badCount,
  errorLogCount,
  scanRecordsCount,
  isScanning,
  healthScore,
  isNativeReady,
  watchdogRuleCount,
  watchdogAlertCount,
  hasUpdate,
  latestVersion,
  onOpenWatchdog,
  onOpenUpdateModal
}) => {
  const groups: { title: string; items: SidebarNavItem[] }[] = [
    {
      title: t(locale, 'sidebar.group.workspace'),
      items: [
        {
          id: 'fleet',
          label: t(locale, 'tab.fleet'),
          shortcut: '1',
          icon: <LayoutGrid className="w-4 h-4 shrink-0" />,
          rightText: String(drivesCount),
          rightTone: 'neutral'
        },
        {
          id: 'scan',
          label: t(locale, 'tab.scan'),
          shortcut: '2',
          icon: <Activity className="w-4 h-4 shrink-0" />,
          rightText: isScanning ? 'RUN' : undefined,
          rightTone: 'cobalt',
          activeDot: isScanning
        },
        {
          id: 'integrity',
          label: t(locale, 'tab.integrity'),
          shortcut: '7',
          icon: <FolderLock className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      title: t(locale, 'sidebar.group.telemetry'),
      items: [
        {
          id: 'logs',
          label: t(locale, 'tab.logs'),
          shortcut: '3',
          icon: <Terminal className="w-4 h-4 shrink-0" />,
          rightText: badCount > 0 ? `${badCount} BAD` : errorLogCount > 0 ? String(errorLogCount) : undefined,
          rightTone: badCount > 0 ? 'danger' : 'neutral'
        },
        {
          id: 'health',
          label: t(locale, 'tab.health'),
          shortcut: '4',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
          rightText: healthScore !== null ? `${healthScore}%` : 'N/A',
          rightTone: healthScore === null ? 'neutral' : healthScore >= 80 ? 'good' : 'danger'
        },
        {
          id: 'smart',
          label: t(locale, 'tab.smart'),
          shortcut: '5',
          icon: <HardDrive className="w-4 h-4 shrink-0" />
        },
        {
          id: 'history',
          label: t(locale, 'tab.history'),
          shortcut: '6',
          icon: <GitCompare className="w-4 h-4 shrink-0" />,
          rightText: scanRecordsCount > 0 ? String(scanRecordsCount) : undefined,
          rightTone: 'neutral'
        }
      ]
    },
    {
      title: t(locale, 'sidebar.group.workbenches'),
      items: [
        {
          id: 'recovery',
          label: t(locale, 'tab.recovery'),
          shortcut: '8',
          icon: <Wrench className="w-4 h-4 shrink-0" />
        },
        {
          id: 'tools',
          label: t(locale, 'tab.tools'),
          shortcut: '9',
          icon: <Cpu className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      title: t(locale, 'sidebar.group.system'),
      items: [
        {
          id: 'settings',
          label: t(locale, 'tab.settings'),
          shortcut: '0',
          icon: <Settings className="w-4 h-4 shrink-0" />
        }
      ]
    }
  ];

  const handleSelect = (tab: MainAppTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const renderRightMeta = (item: SidebarNavItem) => {
    if (!item.rightText) return null;
    const toneClass =
      item.rightTone === 'danger'
        ? 'text-red-600 dark:text-red-400'
        : item.rightTone === 'good'
        ? 'text-emerald-600 dark:text-emerald-400'
        : item.rightTone === 'cobalt'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-500 dark:text-slate-400';

    return (
      <span className={`font-mono text-[10px] font-bold tabular-nums shrink-0 ${toneClass}`}>
        {item.rightText}
      </span>
    );
  };

  const renderRailContent = (isCompact: boolean, isDrawer = false) => (
    <div className="flex flex-col h-full bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 select-none">
      {/* Brand Header */}
      <div
        className={`h-12 flex items-center border-b border-slate-200 dark:border-slate-800 shrink-0 ${
          isCompact ? 'justify-center px-2' : 'justify-between px-3.5'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center font-mono font-bold text-xs shrink-0">
            DS
          </div>
          {!isCompact && (
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {PROJECT_INFO.appName}
              </div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {PROJECT_INFO.version} · Win32/Tauri
              </div>
            </div>
          )}
        </div>

        {isDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation drawer"
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          !isCompact && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={t(locale, 'sidebar.collapse')}
              aria-label={t(locale, 'sidebar.collapse')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      {/* Expand toggle when compact */}
      {isCompact && !isDrawer && (
        <div className="flex justify-center py-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleCollapse}
            title={t(locale, 'sidebar.expand')}
            aria-label={t(locale, 'sidebar.expand')}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto scrollbar-thin py-2.5 px-2 space-y-4">
        {groups.map(group => (
          <div key={group.title} className="space-y-0.5">
            {!isCompact && (
              <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
            )}
            {group.items.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  title={`${item.label} (${item.shortcut})`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-full h-9 rounded-md flex items-center transition-colors cursor-pointer whitespace-nowrap ${
                    isCompact ? 'justify-center px-1.5' : 'justify-between px-2.5 gap-2'
                  } ${
                    isActive
                      ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold border border-blue-600/25 dark:border-blue-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-600 dark:bg-blue-400"
                    />
                  )}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}>
                      {item.icon}
                    </span>
                    {!isCompact && (
                      <span className="text-xs truncate">{item.label}</span>
                    )}
                  </div>

                  {!isCompact && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderRightMeta(item)}
                      <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {item.shortcut}
                      </span>
                    </div>
                  )}

                  {isCompact && item.activeDot && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Engine / Watchdog / Update Strip */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-1.5 shrink-0 bg-slate-50/70 dark:bg-[#090D16]/60">
        <button
          type="button"
          onClick={() => {
            onOpenWatchdog();
            onCloseMobile();
          }}
          title={`${t(locale, 'sidebar.watchdog')} · ${watchdogRuleCount} rules`}
          className={`w-full h-8 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center text-xs transition-colors cursor-pointer ${
            isCompact ? 'justify-center px-1' : 'justify-between px-2.5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {watchdogAlertCount > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            {!isCompact && (
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                {t(locale, 'sidebar.watchdog')}
              </span>
            )}
          </div>
          {!isCompact && (
            <span className="font-mono text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
              {watchdogAlertCount > 0 ? `${watchdogAlertCount} !` : `${watchdogRuleCount} ON`}
            </span>
          )}
        </button>

        {hasUpdate && (
          <button
            type="button"
            onClick={() => {
              onOpenUpdateModal();
              onCloseMobile();
            }}
            title={t(locale, 'sidebar.updateAvailable')}
            className={`w-full h-8 rounded-md border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/15 text-blue-700 dark:text-blue-300 flex items-center text-[11px] font-semibold cursor-pointer ${
              isCompact ? 'justify-center px-1' : 'justify-between px-2.5'
            }`}
          >
            <span className="truncate">{isCompact ? 'NEW' : t(locale, 'sidebar.updateAvailable')}</span>
            {!isCompact && latestVersion && (
              <span className="font-mono text-[10px] font-bold tabular-nums">{latestVersion}</span>
            )}
          </button>
        )}

        {!isCompact && (
          <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span className="truncate">
              {isNativeReady ? t(locale, 'sidebar.ipcReady') : t(locale, 'sidebar.ipcStandby')}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isNativeReady ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Rail */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-[width] duration-150 ${
          collapsed ? 'w-16' : 'w-[228px]'
        }`}
      >
        {renderRailContent(collapsed, false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-slate-950/70"
          onClick={onCloseMobile}
        >
          <aside
            className="w-[248px] max-w-[85vw] h-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {renderRailContent(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
