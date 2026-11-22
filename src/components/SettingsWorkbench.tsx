import React from 'react';
import {
  AppLocale,
  CustomSmartThresholdRule,
  DriveSmartAttribute,
  SavedScanRecord,
  SettingsPanelTab
} from '../types';
import { DiskSentinelMigrationBundle } from '../utils/dataMigration';
import { Cpu, HelpCircle, Info, Settings } from 'lucide-react';
import { OptionsModal, OptionsModalSubTab } from './OptionsModal';
import { DllDocsModal } from './DllDocsModal';
import { HelpGuideModal } from './HelpGuideModal';
import { AboutModal } from './AboutModal';

export interface SettingsWorkbenchProps {
  activePanel: SettingsPanelTab;
  onSelectPanel: (panel: SettingsPanelTab) => void;
  optionsInitialSubTab: OptionsModalSubTab;
  locale: AppLocale;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  notificationPermission: NotificationPermission;
  notificationsEnabled: boolean;
  onRequestNotification: () => void;
  onToggleNotificationsEnabled: () => void;
  scanSpeedMultiplier: number;
  onChangeSpeedMultiplier: (speed: number) => void;
  isAutoRepairMode: boolean;
  onToggleAutoRepairMode: () => void;
  customSmartThresholds: CustomSmartThresholdRule[];
  onUpdateCustomSmartThresholds: (rules: CustomSmartThresholdRule[]) => void;
  activeDriveSmartAttributes: DriveSmartAttribute[];
  scanRecords: SavedScanRecord[];
  onImportMigration: (
    bundle: DiskSentinelMigrationBundle,
    strategy: 'merge' | 'replace'
  ) => void;
  onChangeLocale: (locale: AppLocale) => void;
  minimizeToTray: boolean;
  onToggleMinimizeToTray: () => void;
  nativeOsNotificationsEnabled: boolean;
  onToggleNativeOsNotifications: () => void;
  onTestNativeOsNotification: () => void;
  onOpenVendorDiagnostics: () => void;
  onOpenSupportedCatalog: () => void;
  onOpenUpdateModal: () => void;
}

export const SettingsWorkbench: React.FC<SettingsWorkbenchProps> = ({
  activePanel,
  onSelectPanel,
  optionsInitialSubTab,
  locale,
  isDarkMode,
  onToggleDarkMode,
  isMuted,
  onToggleMute,
  notificationPermission,
  notificationsEnabled,
  onRequestNotification,
  onToggleNotificationsEnabled,
  scanSpeedMultiplier,
  onChangeSpeedMultiplier,
  isAutoRepairMode,
  onToggleAutoRepairMode,
  customSmartThresholds,
  onUpdateCustomSmartThresholds,
  activeDriveSmartAttributes,
  scanRecords,
  onImportMigration,
  onChangeLocale,
  minimizeToTray,
  onToggleMinimizeToTray,
  nativeOsNotificationsEnabled,
  onToggleNativeOsNotifications,
  onTestNativeOsNotification,
  onOpenVendorDiagnostics,
  onOpenSupportedCatalog,
  onOpenUpdateModal
}) => {
  const en = locale === 'en';

  const panels: {
    id: SettingsPanelTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'options',
      label: en ? 'Preferences' : '환경설정',
      icon: <Settings className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'dlldocs',
      label: en ? 'Native DLL Specs' : 'DLL 기술 명세',
      icon: <Cpu className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'guide',
      label: en ? 'User Guide' : '도움말',
      icon: <HelpCircle className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'about',
      label: en ? 'About' : '정보',
      icon: <Info className="w-3.5 h-3.5 shrink-0" />
    }
  ];

  return (
    <div className="space-y-3">
      {/* Compact Horizontal Sub-Tab Bar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md px-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-thin">
        <nav aria-label="Settings and Documentation" className="flex items-center gap-1">
          {panels.map(panel => {
            const active = activePanel === panel.id;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => onSelectPanel(panel.id)}
                className={`h-10 px-3 border-b-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {panel.icon}
                <span>{panel.label}</span>
              </button>
            );
          })}
        </nav>

        <span className="hidden md:inline text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
          {en ? 'Ctrl+, Settings · F1 Guide' : 'Ctrl+, 설정 · F1 도움말'}
        </span>
      </div>

      {/* Active Inline Settings Panel */}
      <div>
        {activePanel === 'options' && (
          <OptionsModal
            isOpen={true}
            isInline={true}
            onClose={() => {}}
            initialSubTab={optionsInitialSubTab}
            isDarkMode={isDarkMode}
            onToggleDarkMode={onToggleDarkMode}
            isMuted={isMuted}
            onToggleMute={onToggleMute}
            notificationPermission={notificationPermission}
            notificationsEnabled={notificationsEnabled}
            onRequestNotification={onRequestNotification}
            onToggleNotificationsEnabled={onToggleNotificationsEnabled}
            scanSpeedMultiplier={scanSpeedMultiplier}
            onChangeSpeedMultiplier={onChangeSpeedMultiplier}
            isAutoRepairMode={isAutoRepairMode}
            onToggleAutoRepairMode={onToggleAutoRepairMode}
            customSmartThresholds={customSmartThresholds}
            onUpdateCustomSmartThresholds={onUpdateCustomSmartThresholds}
            activeDriveSmartAttributes={activeDriveSmartAttributes}
            scanRecords={scanRecords}
            onImportMigration={onImportMigration}
            locale={locale}
            onChangeLocale={onChangeLocale}
            minimizeToTray={minimizeToTray}
            onToggleMinimizeToTray={onToggleMinimizeToTray}
            nativeOsNotificationsEnabled={nativeOsNotificationsEnabled}
            onToggleNativeOsNotifications={onToggleNativeOsNotifications}
            onTestNativeOsNotification={onTestNativeOsNotification}
          />
        )}

        {activePanel === 'dlldocs' && (
          <DllDocsModal
            isOpen={true}
            isInline={true}
            onClose={() => {}}
          />
        )}

        {activePanel === 'guide' && (
          <HelpGuideModal
            isOpen={true}
            isInline={true}
            onClose={() => {}}
            onOpenVendorDiagnostics={onOpenVendorDiagnostics}
            onOpenSupportedCatalog={onOpenSupportedCatalog}
            onOpenDllDocs={() => onSelectPanel('dlldocs')}
            onOpenUpdateModal={onOpenUpdateModal}
            onOpenAboutModal={() => onSelectPanel('about')}
          />
        )}

        {activePanel === 'about' && (
          <AboutModal
            isOpen={true}
            isInline={true}
            onClose={() => {}}
            onCheckUpdates={onOpenUpdateModal}
          />
        )}
      </div>
    </div>
  );
};
