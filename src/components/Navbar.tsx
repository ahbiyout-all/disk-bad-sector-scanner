import React from 'react';
import { AppLocale, DiskDrive, MainAppTab } from '../types';
import { t } from '../utils/i18n';
import {
  Bell,
  BellOff,
  Download,
  FileCheck,
  HardDrive,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Usb,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';

export interface NavbarProps {
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  activeTab: MainAppTab;
  onToggleMobileMenu: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  notificationPermission: NotificationPermission;
  notificationsEnabled?: boolean;
  onRequestNotification: () => void;
  onToggleNotificationsEnabled?: () => void;
  currentHealthScore: number | null;
  onRescanDrives: () => Promise<void>;
  isRescanning?: boolean;
  onExportResults: () => void;
  onOpenReport: () => void;
  locale: AppLocale;
  onChangeLocale: (locale: AppLocale) => void;
  onOpenCommandPalette: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  drives,
  selectedDriveId,
  onSelectDrive,
  activeTab,
  onToggleMobileMenu,
  isDarkMode,
  onToggleDarkMode,
  isMuted,
  onToggleMute,
  notificationPermission,
  notificationsEnabled = true,
  onRequestNotification,
  onToggleNotificationsEnabled,
  currentHealthScore,
  onRescanDrives,
  isRescanning = false,
  onExportResults,
  onOpenReport,
  locale,
  onChangeLocale,
  onOpenCommandPalette
}) => {
  const currentDrive = drives.find(d => d.id === selectedDriveId) || drives[0];
  const temp = currentDrive?.temperatureC ?? currentDrive?.hardwareSpecs?.currentTempC ?? null;

  const getTabTitle = (tab: MainAppTab): string => {
    switch (tab) {
      case 'fleet':
        return t(locale, 'tab.fleet');
      case 'scan':
        return t(locale, 'tab.scan');
      case 'logs':
        return t(locale, 'tab.logs');
      case 'integrity':
        return t(locale, 'tab.integrity');
      case 'health':
        return t(locale, 'tab.health');
      case 'smart':
        return t(locale, 'tab.smart');
      case 'history':
        return t(locale, 'tab.history');
      case 'recovery':
        return t(locale, 'tab.recovery');
      case 'tools':
        return t(locale, 'tab.tools');
      case 'settings':
        return t(locale, 'tab.settings');
    }
  };

  const getDriveTypeIcon = (drive?: DiskDrive) => {
    if (!drive) return <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    if (drive.isExternal) return <Usb className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    if (drive.type === 'NVMe') return <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    return <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
  };

  const isNotifActive = notificationPermission === 'granted' && notificationsEnabled;

  return (
    <header className="sticky top-0 z-30 h-12 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 flex items-center justify-between gap-2 select-none">
      {/* Zone 1: Left — Mobile Drawer Trigger + Section Breadcrumb + Drive Selector */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="hidden xl:flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0 whitespace-nowrap">
          <span>{getTabTitle(activeTab)}</span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
        </div>

        {/* Active Physical Drive Selector */}
        <div className="flex items-center gap-1.5 min-w-0 max-w-[360px] flex-1 sm:flex-initial">
          <div className="flex items-center gap-1.5 px-2 h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D16] focus-within:border-blue-600">
            {getDriveTypeIcon(currentDrive)}
            <select
              value={currentDrive?.id || ''}
              onChange={e => onSelectDrive(e.target.value)}
              disabled={drives.length === 0}
              aria-label={t(locale, 'nav.selectDrive')}
              className="w-full min-w-[140px] sm:min-w-[210px] bg-transparent text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer disabled:opacity-50 truncate"
            >
              {drives.length === 0 ? (
                <option value="">{t(locale, 'nav.noDrive')}</option>
              ) : (
                drives.map(d => (
                  <option
                    key={d.id}
                    value={d.id}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {d.mountPoint ? `[${d.mountPoint}] ` : ''}{d.model} · {d.capacityGb !== null ? `${d.capacityGb}GB` : 'N/A'}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Plain Text Concise Hardware Telemetry (Zero Pills) */}
        {currentDrive && (
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
            <span>{currentDrive.hardwareSpecs?.busType || currentDrive.type}</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className={temp !== null && temp >= 55 ? 'text-amber-500 font-bold' : ''}>
              {temp !== null ? `${temp.toFixed(0)}°C` : '--°C'}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span
              className={`font-bold ${
                currentHealthScore === null
                  ? 'text-slate-400'
                  : currentHealthScore >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : currentHealthScore >= 50
                  ? 'text-amber-500'
                  : 'text-red-500'
              }`}
            >
              {currentHealthScore !== null ? `${currentHealthScore}%` : 'N/A'}
            </span>
          </div>
        )}
      </div>

      {/* Zone 2: Center — Global Command Palette Trigger */}
      <div className="hidden sm:flex items-center justify-center shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="h-8 px-2.5 lg:w-56 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D16] hover:border-blue-500/60 text-slate-500 dark:text-slate-400 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors"
          title={`${t(locale, 'nav.commandPalette')} (Ctrl+K)`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{t(locale, 'nav.commandPalette')}</span>
          </span>
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 shrink-0">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Zone 3: Right — Report / Export + Utility Toggles + Single Primary Cobalt CTA */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Compact Command Palette trigger on < sm screens */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label={t(locale, 'nav.commandPalette')}
          className="sm:hidden h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {/* Report & Export Quick Actions */}
        <button
          type="button"
          disabled={!currentDrive}
          onClick={onOpenReport}
          title={t(locale, 'nav.report')}
          className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <FileCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{t(locale, 'nav.report')}</span>
        </button>

        <button
          type="button"
          disabled={!currentDrive}
          onClick={onExportResults}
          title={t(locale, 'nav.export')}
          className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{t(locale, 'nav.export')}</span>
        </button>

        {/* Segmented Compact Controls Group */}
        <div className="flex items-center h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#090D16] divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? 'Unmute audio alerts' : 'Mute audio alerts'}
            aria-label={isMuted ? 'Unmute audio alerts' : 'Mute audio alerts'}
            className="h-full px-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (notificationPermission === 'granted' && onToggleNotificationsEnabled) {
                onToggleNotificationsEnabled();
              } else {
                onRequestNotification();
              }
            }}
            title={isNotifActive ? 'Desktop notifications active' : 'Enable desktop notifications'}
            aria-label={isNotifActive ? 'Disable desktop notifications' : 'Enable desktop notifications'}
            className="h-full px-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center"
          >
            {isNotifActive ? (
              <Bell className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <BellOff className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeLocale(locale === 'ko' ? 'en' : 'ko')}
            title="Switch KO / EN"
            className="h-full px-2 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            {locale === 'ko' ? 'KO' : 'EN'}
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="h-full px-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center"
          >
            {isDarkMode ? (
              <Moon className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
          </button>
        </div>

        {/* Single Primary Topbar CTA */}
        <button
          type="button"
          onClick={() => void onRescanDrives()}
          disabled={isRescanning}
          title={`${t(locale, 'nav.rescan')} (F5)`}
          className="h-8 px-2.5 sm:px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t(locale, 'nav.rescan')}</span>
        </button>
      </div>
    </header>
  );
};
