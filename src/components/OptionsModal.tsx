import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Settings,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Zap,
  Check,
  Sliders,
  ShieldCheck,
  Play,
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Activity,
  RotateCcw,
  Plus,
  Trash2
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import {
  AppLocale,
  CustomSmartThresholdRule,
  DriveSmartAttribute,
  SavedScanRecord,
  SmartThresholdComparison
} from '../types';
import {
  buildMigrationBundle,
  DiskSentinelMigrationBundle,
  downloadMigrationJson,
  parseAndValidateMigrationJson
} from '../utils/dataMigration';
import {
  SMART_ATTRIBUTE_CATALOG,
  createDefaultSmartThresholdRules,
  formatHexAttributeId,
  isRuleModifiedFromDefault,
  parseAttributeIdInput,
  parseSmartAttributeNumericRaw,
  validateThresholdPair
} from '../utils/smartThresholds';

export type OptionsModalSubTab =
  | 'general'
  | 'audio'
  | 'notification'
  | 'diagnostic'
  | 'smart_thresholds'
  | 'migration';

export interface OptionsModalProps {
  isOpen: boolean;
  isInline?: boolean;
  onClose: () => void;
  initialSubTab?: OptionsModalSubTab;
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
  isAutoRepairMode?: boolean;
  onToggleAutoRepairMode?: () => void;
  customSmartThresholds?: CustomSmartThresholdRule[];
  onUpdateCustomSmartThresholds?: (rules: CustomSmartThresholdRule[]) => void;
  activeDriveSmartAttributes?: DriveSmartAttribute[];
  scanRecords: SavedScanRecord[];
  onImportMigration: (
    bundle: DiskSentinelMigrationBundle,
    strategy: 'merge' | 'replace'
  ) => void;
  locale?: AppLocale;
  onChangeLocale?: (locale: AppLocale) => void;
  minimizeToTray?: boolean;
  onToggleMinimizeToTray?: () => void;
  nativeOsNotificationsEnabled?: boolean;
  onToggleNativeOsNotifications?: () => void;
  onTestNativeOsNotification?: () => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  isOpen,
  isInline = false,
  onClose,
  initialSubTab = 'general',
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
  isAutoRepairMode = false,
  onToggleAutoRepairMode,
  customSmartThresholds = [],
  onUpdateCustomSmartThresholds,
  activeDriveSmartAttributes = [],
  scanRecords,
  onImportMigration,
  locale = 'ko',
  onChangeLocale,
  minimizeToTray = false,
  onToggleMinimizeToTray,
  nativeOsNotificationsEnabled = true,
  onToggleNativeOsNotifications,
  onTestNativeOsNotification
}) => {
  const [activeSubTab, setActiveSubTab] = useState<OptionsModalSubTab>(initialSubTab);
  const [volume, setVolume] = useState<number>(() => Math.round(soundManager.getVolume() * 100));

  useEffect(() => {
    if (isOpen && initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [isOpen, initialSubTab]);

  // Custom S.M.A.R.T. Threshold editor draft state
  const [rowDrafts, setRowDrafts] = useState<Record<string, { warning: string; critical: string }>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newRulePresetId, setNewRulePresetId] = useState<string>('');
  const [newAttrIdInput, setNewAttrIdInput] = useState<string>('');
  const [newAttrNameInput, setNewAttrNameInput] = useState<string>('');
  const [newAttrMode, setNewAttrMode] = useState<SmartThresholdComparison>('raw_above');
  const [newAttrWarning, setNewAttrWarning] = useState<string>('1');
  const [newAttrCritical, setNewAttrCritical] = useState<string>('10');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);

  // Migration state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    bundle: DiskSentinelMigrationBundle;
    skippedCount: number;
  } | null>(null);
  const [migrationFeedback, setMigrationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    soundManager.setVolume(newVol / 100);
  };

  const handleTestSound = (type: 'bad' | 'warn' | 'complete') => {
    if (type === 'bad') soundManager.playBadSectorAlert();
    else if (type === 'warn') soundManager.playWarningTone();
    else soundManager.playCompletionChime();
  };

  const handleTestNotification = () => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      notificationsEnabled
    ) {
      new Notification('Disk Bad Sector Scanner 검사 테스트 알림', {
        body: '정상적으로 데스크톱 푸시 알림이 작동하고 있습니다.',
        icon: '/favicon.ico'
      });
    } else {
      onRequestNotification();
    }
  };

  const effectiveNotificationsAllowed =
    notificationsEnabled && notificationPermission === 'granted';

  const handleExportMigration = () => {
    try {
      const bundle = buildMigrationBundle(
        {
          isDarkMode,
          isMuted,
          volumePercent: volume,
          notificationsAllowed: effectiveNotificationsAllowed,
          notificationPermissionState: notificationPermission,
          scanSpeedMultiplier,
          isAutoRepairMode,
          customSmartThresholds
        },
        scanRecords
      );
      const savedName = downloadMigrationJson(bundle);
      setMigrationFeedback({
        type: 'success',
        message: `설정 및 검사 기록 ${scanRecords.length}건이 '${savedName}' 파일로 내보내졌습니다.`
      });
    } catch {
      setMigrationFeedback({
        type: 'error',
        message: 'JSON 백업 파일 생성 중 오류가 발생했습니다.'
      });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setMigrationFeedback(null);
    setPendingImport(null);

    if (file.size > 25 * 1024 * 1024) {
      setMigrationFeedback({
        type: 'error',
        message: '백업 JSON 파일 크기가 너무 큽니다 (최대 25MB 지원).'
      });
      return;
    }

    try {
      const text = await file.text();
      const result = parseAndValidateMigrationJson(text);
      if (!result.valid || !result.bundle) {
        setMigrationFeedback({
          type: 'error',
          message: result.error || '유효하지 않은 백업 파일입니다.'
        });
        return;
      }

      setPendingImport({
        filename: file.name,
        bundle: result.bundle,
        skippedCount: result.skippedRecordsCount || 0
      });
    } catch {
      setMigrationFeedback({
        type: 'error',
        message: '선택한 파일을 읽는 데 실패했습니다.'
      });
    }
  };

  const handleApplyMigration = () => {
    if (!pendingImport) return;
    onImportMigration(pendingImport.bundle, importStrategy);
    setVolume(pendingImport.bundle.settings.volumePercent);
    const notifBlockedNote =
      pendingImport.bundle.settings.notificationsAllowed && notificationPermission === 'denied'
        ? ' (참고: 브라우저에서 알림이 차단되어 있어 푸시 알림은 브라우저 사이트 설정에서 직접 허용해야 활성화됩니다.)'
        : '';
    setMigrationFeedback({
      type: 'success',
      message: `'${pendingImport.filename}'에서 사용자 설정 및 검사 기록 ${pendingImport.bundle.scanRecords.length}건을 (${
        importStrategy === 'merge' ? '병합' : '덮어쓰기'
      }) 방식으로 성공적으로 복원했습니다.${notifBlockedNote}`
    });
    setPendingImport(null);
  };

  const existingIdSet = new Set(scanRecords.map(r => r.id));
  const newIncomingCount = pendingImport
    ? pendingImport.bundle.scanRecords.filter(r => !existingIdSet.has(r.id)).length
    : 0;

  // Helpers for S.M.A.R.T. Threshold Rules tab
  const parseDraftNum = (raw: string): { valid: boolean; value: number | null } => {
    const trimmed = raw.trim();
    if (trimmed === '') return { valid: true, value: null };
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return { valid: false, value: null };
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return { valid: false, value: null };
    return { valid: true, value: n };
  };

  const handleToggleRuleEnabled = (ruleId: string) => {
    if (!onUpdateCustomSmartThresholds) return;
    onUpdateCustomSmartThresholds(
      customSmartThresholds.map(r => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleChangeRuleMode = (ruleId: string, mode: SmartThresholdComparison) => {
    if (!onUpdateCustomSmartThresholds) return;
    const target = customSmartThresholds.find(r => r.id === ruleId);
    if (!target) return;

    const draft = rowDrafts[ruleId];
    const warnStr = draft ? draft.warning : target.warningThreshold?.toString() ?? '';
    const critStr = draft ? draft.critical : target.criticalThreshold?.toString() ?? '';
    const parsedW = parseDraftNum(warnStr);
    const parsedC = parseDraftNum(critStr);

    if (parsedW.valid && parsedC.valid) {
      const check = validateThresholdPair(mode, parsedW.value, parsedC.value);
      if (!check.valid) {
        setRowErrors(prev => ({ ...prev, [ruleId]: check.error || '임계치 관계가 올바르지 않습니다.' }));
      } else {
        setRowErrors(prev => {
          const next = { ...prev };
          delete next[ruleId];
          return next;
        });
      }
      onUpdateCustomSmartThresholds(
        customSmartThresholds.map(r =>
          r.id === ruleId
            ? {
                ...r,
                comparisonMode: mode,
                ...(check.valid
                  ? { warningThreshold: parsedW.value, criticalThreshold: parsedC.value }
                  : {})
              }
            : r
        )
      );
    } else {
      onUpdateCustomSmartThresholds(
        customSmartThresholds.map(r =>
          r.id === ruleId ? { ...r, comparisonMode: mode } : r
        )
      );
    }
  };

  const handleChangeRuleThresholdInput = (
    rule: CustomSmartThresholdRule,
    field: 'warning' | 'critical',
    rawValue: string
  ) => {
    const currentDraft = rowDrafts[rule.id] ?? {
      warning: rule.warningThreshold !== null ? String(rule.warningThreshold) : '',
      critical: rule.criticalThreshold !== null ? String(rule.criticalThreshold) : ''
    };
    const nextDraft = {
      ...currentDraft,
      [field]: rawValue
    };
    setRowDrafts(prev => ({ ...prev, [rule.id]: nextDraft }));

    const parsedW = parseDraftNum(nextDraft.warning);
    const parsedC = parseDraftNum(nextDraft.critical);
    if (!parsedW.valid || !parsedC.valid) {
      setRowErrors(prev => ({
        ...prev,
        [rule.id]: '0 이상의 유효한 숫자를 입력하거나 비워두십시오.'
      }));
      return;
    }

    const check = validateThresholdPair(rule.comparisonMode, parsedW.value, parsedC.value);
    if (!check.valid) {
      setRowErrors(prev => ({
        ...prev,
        [rule.id]: check.error || '주의/위험 임계치 순서가 올바르지 않습니다.'
      }));
      return;
    }

    setRowErrors(prev => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });

    if (onUpdateCustomSmartThresholds) {
      onUpdateCustomSmartThresholds(
        customSmartThresholds.map(r =>
          r.id === rule.id
            ? {
                ...r,
                warningThreshold: parsedW.value,
                criticalThreshold: parsedC.value
              }
            : r
        )
      );
    }
  };

  const handleResetSingleRule = (ruleId: string) => {
    if (!onUpdateCustomSmartThresholds) return;
    const rule = customSmartThresholds.find(r => r.id === ruleId);
    if (!rule) return;
    const catalog = SMART_ATTRIBUTE_CATALOG.find(c => c.id === rule.attributeId);
    const nextMode = catalog?.defaultMode ?? rule.comparisonMode;
    const nextWarn = catalog?.defaultWarning ?? rule.defaultWarning;
    const nextCrit = catalog?.defaultCritical ?? rule.defaultCritical;

    setRowDrafts(prev => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });
    setRowErrors(prev => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });

    onUpdateCustomSmartThresholds(
      customSmartThresholds.map(r =>
        r.id === ruleId
          ? {
              ...r,
              comparisonMode: nextMode,
              warningThreshold: nextWarn,
              criticalThreshold: nextCrit,
              enabled: true
            }
          : r
      )
    );
  };

  const handleDeleteCustomRule = (ruleId: string) => {
    if (!onUpdateCustomSmartThresholds) return;
    setRowDrafts(prev => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });
    setRowErrors(prev => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });
    onUpdateCustomSmartThresholds(customSmartThresholds.filter(r => r.id !== ruleId));
  };

  const handleResetAllRules = () => {
    if (!onUpdateCustomSmartThresholds) return;
    setRowDrafts({});
    setRowErrors({});
    onUpdateCustomSmartThresholds(createDefaultSmartThresholdRules());
  };

  const configuredAttrIdSet = new Set(customSmartThresholds.map(r => r.attributeId));
  const availablePresetsToAdd = (() => {
    const items: Array<{
      id: number;
      name: string;
      mode: SmartThresholdComparison;
      warn: number;
      crit: number;
      sourceLabel: string;
    }> = [];
    const seen = new Set<number>();

    for (const entry of SMART_ATTRIBUTE_CATALOG) {
      if (!configuredAttrIdSet.has(entry.id)) {
        seen.add(entry.id);
        items.push({
          id: entry.id,
          name: entry.name,
          mode: entry.defaultMode,
          warn: entry.defaultWarning ?? 1,
          crit: entry.defaultCritical ?? 10,
          sourceLabel: `${formatHexAttributeId(entry.id)} · ${entry.name} (${entry.nameKo})`
        });
      }
    }

    for (const attr of activeDriveSmartAttributes) {
      if (!configuredAttrIdSet.has(attr.id) && !seen.has(attr.id)) {
        seen.add(attr.id);
        items.push({
          id: attr.id,
          name: attr.name,
          mode: 'raw_above',
          warn: 1,
          crit: 10,
          sourceLabel: `${formatHexAttributeId(attr.id)} · ${attr.name} (현재 장치 감지됨)`
        });
      }
    }

    return items.sort((a, b) => a.id - b.id);
  })();

  const handleSelectNewRulePreset = (val: string) => {
    setNewRulePresetId(val);
    setNewRuleError(null);
    if (!val) return;
    const preset = availablePresetsToAdd.find(p => String(p.id) === val);
    if (!preset) return;
    setNewAttrIdInput(`0x${preset.id.toString(16).padStart(2, '0').toUpperCase()}`);
    setNewAttrNameInput(preset.name);
    setNewAttrMode(preset.mode);
    setNewAttrWarning(String(preset.warn));
    setNewAttrCritical(String(preset.crit));
  };

  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateCustomSmartThresholds) return;
    setNewRuleError(null);

    const parsedId = parseAttributeIdInput(newAttrIdInput);
    if (parsedId === null) {
      setNewRuleError('유효한 S.M.A.R.T. 속성 ID(1~255 또는 0x01~0xFF)를 입력하세요.');
      return;
    }

    if (configuredAttrIdSet.has(parsedId)) {
      setNewRuleError(
        `속성 ${formatHexAttributeId(parsedId)} 규칙이 이미 목록에 있습니다. 상단 목록에서 직접 임계치를 수정하세요.`
      );
      return;
    }

    const trimmedName = newAttrNameInput.trim();
    if (!trimmedName) {
      setNewRuleError('속성 이름(예: Seek Error Rate)을 입력하세요.');
      return;
    }

    const parsedW = parseDraftNum(newAttrWarning);
    const parsedC = parseDraftNum(newAttrCritical);
    if (!parsedW.valid || !parsedC.valid) {
      setNewRuleError('주의 및 위험 임계치는 0 이상의 숫자여야 합니다.');
      return;
    }
    if (parsedW.value === null && parsedC.value === null) {
      setNewRuleError('주의(Warning) 또는 위험(Critical) 임계치 중 최소 하나를 입력하세요.');
      return;
    }

    const pairValidation = validateThresholdPair(newAttrMode, parsedW.value, parsedC.value);
    if (!pairValidation.valid) {
      setNewRuleError(pairValidation.error || '주의/위험 임계치 설정이 올바르지 않습니다.');
      return;
    }

    const catalogMatch = SMART_ATTRIBUTE_CATALOG.find(c => c.id === parsedId);
    const createdRule: CustomSmartThresholdRule = {
      id: `smart-rule-custom-${parsedId}-${Date.now()}`,
      attributeId: parsedId,
      attributeName: trimmedName,
      comparisonMode: newAttrMode,
      defaultWarning: catalogMatch?.defaultWarning ?? null,
      defaultCritical: catalogMatch?.defaultCritical ?? null,
      warningThreshold: parsedW.value,
      criticalThreshold: parsedC.value,
      enabled: true,
      isCustomAttribute: true
    };

    onUpdateCustomSmartThresholds([...customSmartThresholds, createdRule]);
    setNewRulePresetId('');
    setNewAttrIdInput('');
    setNewAttrNameInput('');
    setNewAttrWarning('1');
    setNewAttrCritical('10');
  };

  const activeThresholdRuleCount = customSmartThresholds.filter(r => r.enabled).length;
  const modifiedThresholdRuleCount = customSmartThresholds.filter(r =>
    isRuleModifiedFromDefault(r)
  ).length;

  return (
    <div className={isInline ? 'w-full font-sans' : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200'}>
      <div className={isInline
        ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md w-full flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans'
        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans'
      }>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>프로그램 환경설정</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
                  OPTIONS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                디스플레이 테마, 알림, 자동 수복 및 JSON 데이터 마이그레이션 설정
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 bg-slate-50/50 dark:bg-slate-950/30 gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('general')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'general'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>일반 & 테마</span>
          </button>
          <button
            onClick={() => setActiveSubTab('audio')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'audio'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>오디오 & 사운드</span>
          </button>
          <button
            onClick={() => setActiveSubTab('notification')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'notification'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>데스크톱 알림</span>
          </button>
          <button
            onClick={() => setActiveSubTab('diagnostic')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'diagnostic'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>진단 및 수복</span>
          </button>
          <button
            onClick={() => setActiveSubTab('smart_thresholds')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'smart_thresholds'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>S.M.A.R.T. 임계치</span>
          </button>
          <button
            onClick={() => setActiveSubTab('migration')}
            className={`py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'migration'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>데이터 마이그레이션</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className={isInline ? 'p-4 sm:p-5 space-y-5 text-xs' : 'flex-1 overflow-y-auto p-5 space-y-5 text-xs'}>
          {/* TAB 1: General & Theme */}
          {activeSubTab === 'general' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {isDarkMode ? (
                        <Moon className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-500" />
                      )}
                      <span>화면 테마 모드</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      정밀 하드웨어 계측 및 LBA 블록 구분을 위해 다크 모드가 기본 권장됩니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleDarkMode}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>{isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">현재 활성 테마:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {isDarkMode ? '🌙 Dark Mode (고대비 계측기 뷰어)' : '☀️ Light Mode (오피스 주광 뷰어)'}
                  </span>
                </div>
              </div>

              {/* Language Selector */}
              {onChangeLocale && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        인터페이스 언어 (Language)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        한국어와 영문(English) 진단 UI 전환을 즉시 적용합니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChangeLocale('ko')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                          locale === 'ko'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        한국어 (KO)
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeLocale('en')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                          locale === 'en'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        English (EN)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scan Speed Default Multiplier */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>검사 속도 배율 기본값</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      I/O 프로빙 틱당 처리할 블록의 배속을 설정합니다.
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
                    {[1, 2, 5, 10].map(speed => (
                      <button
                        key={speed}
                        onClick={() => onChangeSpeedMultiplier(speed)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                          scanSpeedMultiplier === speed
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Audio & Sound */}
          {activeSubTab === 'audio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {!isMuted ? (
                        <Volume2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-slate-400" />
                      )}
                      <span>배드섹터 및 지연 감지 경고음</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      검사 중 결함 섹터 발견 시 고주파 비프 알림음을 출력합니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleMute}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0 ${
                      !isMuted
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{!isMuted ? '음소거하기' : '소리 켜기'}</span>
                  </button>
                </div>

                {/* Volume Slider */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>마스터 경고 음량</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={e => handleVolumeChange(Number(e.target.value))}
                    disabled={isMuted}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </div>

                {/* Sound Test Buttons */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    사운드 테스트:
                  </span>
                  <button
                    onClick={() => handleTestSound('bad')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-500/30 text-[11px] font-bold hover:bg-red-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>배드섹터 비프음</span>
                  </button>
                  <button
                    onClick={() => handleTestSound('warn')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold hover:bg-amber-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>지연 주의음</span>
                  </button>
                  <button
                    onClick={() => handleTestSound('complete')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>검사 완료음</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Desktop Notifications */}
          {activeSubTab === 'notification' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {effectiveNotificationsAllowed ? (
                        <Bell className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <BellOff className="w-4 h-4 text-slate-400" />
                      )}
                      <span>브라우저 웹 푸시 알림</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      창을 최소화하거나 다른 작업을 수행 중일 때 백그라운드에서 검사 완료 및 오류를 알립니다.
                    </p>
                  </div>

                  {notificationPermission === 'granted' ? (
                    <button
                      onClick={onToggleNotificationsEnabled}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs shrink-0 ${
                        notificationsEnabled
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {notificationsEnabled ? <Check className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                      <span>{notificationsEnabled ? '알림 허용됨 (ON)' : '알림 일시 중지 (OFF)'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={onRequestNotification}
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>알림 권한 요청</span>
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    현재 브라우저 권한 상태:{' '}
                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                      {notificationPermission}
                    </strong>
                    {notificationPermission === 'granted' && (
                      <span className="ml-2 font-mono text-slate-500">
                        ({notificationsEnabled ? '수신 활성' : '수신 끔'})
                      </span>
                    )}
                  </div>
                  {effectiveNotificationsAllowed && (
                    <button
                      onClick={handleTestNotification}
                      className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      테스트 알림 보내기
                    </button>
                  )}
                </div>
              </div>

              {/* Native OS Notification & Tauri System Tray Integration */}
              {(onToggleNativeOsNotifications || onToggleMinimizeToTray) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                  {onToggleNativeOsNotifications && (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Bell className="w-4 h-4 text-indigo-500" />
                          <span>OS 네이티브 데스크톱 알림 (Tauri / Windows Toast)</span>
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          데스크톱 앱 실행 시 배드섹터/온도 임계치/비트 부패 감지를 OS 알림 센터로 즉시 전송합니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onTestNativeOsNotification && (
                          <button
                            type="button"
                            onClick={onTestNativeOsNotification}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] cursor-pointer"
                          >
                            OS 테스트
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onToggleNativeOsNotifications}
                          className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                            nativeOsNotificationsEnabled
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {nativeOsNotificationsEnabled ? '활성 (ON)' : '꺼짐 (OFF)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {onToggleMinimizeToTray && (
                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          창 닫기 시 시스템 트레이 백그라운드 감시 유지
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          우측 상단 닫기(X) 클릭 시 종료 대신 시스템 트레이(Watchdog)로 숨겨 실시간 감시를 지속합니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleMinimizeToTray}
                        className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer shrink-0 ${
                          minimizeToTray
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {minimizeToTray ? '트레이 유지 (ON)' : '일반 종료 (OFF)'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Diagnostics & Auto-Repair Policy */}
          {activeSubTab === 'diagnostic' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>자동 복구 모드 (Auto-Repair Zero-Fill)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      검사 중 논리 배드섹터(UNC) 발견 시 사용자 확인 없이 즉시 S.M.A.R.T. Zero-Fill 05h 예비 트랙 재할당을 자동 실행합니다.
                    </p>
                  </div>

                  {onToggleAutoRepairMode && (
                    <button
                      onClick={onToggleAutoRepairMode}
                      className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs shrink-0 ${
                        isAutoRepairMode
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isAutoRepairMode ? '자동 수복 켜짐 (ON)' : '자동 수복 꺼짐 (OFF)'}
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAutoRepairMode
                    ? '✨ 배드섹터 발견 시 알림 출력과 함께 즉시 S.M.A.R.T. Write DMA 제로필 및 05h 치환이 자동으로 진행됩니다.'
                    : 'ℹ️ 배드섹터 발견 시 화면 경고음과 배너를 표시하고 사용자의 수동 수복 조치 명령을 대기합니다.'}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Custom S.M.A.R.T. Warning & Critical Thresholds */}
          {activeSubTab === 'smart_thresholds' && (
            <div className="space-y-4">
              {/* Top Section Header & Global Reset */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>S.M.A.R.T. 속성별 사용자 정의 임계치</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>활성 규칙 {activeThresholdRuleCount}개</span>
                    <span aria-hidden="true">·</span>
                    <span>사용자 변경 {modifiedThresholdRuleCount}건</span>
                    <span aria-hidden="true">·</span>
                    <span>펌웨어 안전 하한(Current ≤ Threshold) 초과 시 항상 위험 경보가 우선 적용됩니다</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetAllRules}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>기본값 전체 복원</span>
                </button>
              </div>

              {/* Configured Threshold Rules Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">활성</th>
                        <th className="px-3 py-2">속성 (ID · Name)</th>
                        <th className="px-3 py-2 w-36">판정 기준</th>
                        <th className="px-3 py-2 w-28">주의 (Warning)</th>
                        <th className="px-3 py-2 w-28">위험 (Critical)</th>
                        <th className="px-3 py-2 text-right w-20">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                      {customSmartThresholds.map(rule => {
                        const catalogInfo = SMART_ATTRIBUTE_CATALOG.find(
                          c => c.id === rule.attributeId
                        );
                        const liveAttr = activeDriveSmartAttributes.find(
                          a => a.id === rule.attributeId
                        );
                        const liveRaw = liveAttr ? parseSmartAttributeNumericRaw(liveAttr) : null;
                        const modified = isRuleModifiedFromDefault(rule);
                        const draft = rowDrafts[rule.id];
                        const warnValStr =
                          draft !== undefined
                            ? draft.warning
                            : rule.warningThreshold !== null
                            ? String(rule.warningThreshold)
                            : '';
                        const critValStr =
                          draft !== undefined
                            ? draft.critical
                            : rule.criticalThreshold !== null
                            ? String(rule.criticalThreshold)
                            : '';
                        const rowError = rowErrors[rule.id];

                        return (
                          <React.Fragment key={rule.id}>
                            <tr
                              className={`transition-colors ${
                                rule.enabled
                                  ? 'bg-white/70 dark:bg-slate-900/40'
                                  : 'bg-slate-100/60 dark:bg-slate-950/80 opacity-60'
                              }`}
                            >
                              <td className="px-3 py-2.5 text-center align-middle">
                                <input
                                  type="checkbox"
                                  checked={rule.enabled}
                                  onChange={() => handleToggleRuleEnabled(rule.id)}
                                  aria-label={`${formatHexAttributeId(rule.attributeId)} 규칙 활성화`}
                                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                />
                              </td>

                              <td className="px-3 py-2.5 align-middle min-w-[180px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                                    {formatHexAttributeId(rule.attributeId)}
                                  </span>
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {rule.attributeName}
                                  </span>
                                  {modified && (
                                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      · 사용자 수정
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                                  {catalogInfo && <span>{catalogInfo.nameKo}</span>}
                                  {(rule.defaultWarning !== null || rule.defaultCritical !== null) && (
                                    <>
                                      {catalogInfo && <span aria-hidden="true">·</span>}
                                      <span className="font-mono tabular-nums">
                                        기본 주의 {rule.defaultWarning ?? '-'} / 위험{' '}
                                        {rule.defaultCritical ?? '-'}
                                      </span>
                                    </>
                                  )}
                                  {liveAttr && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                        현재 Raw {liveRaw !== null ? liveRaw.toLocaleString() : liveAttr.raw} / 점수{' '}
                                        {liveAttr.current}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2.5 align-middle">
                                <select
                                  value={rule.comparisonMode}
                                  onChange={e =>
                                    handleChangeRuleMode(
                                      rule.id,
                                      e.target.value as SmartThresholdComparison
                                    )
                                  }
                                  aria-label={`${rule.attributeName} 비교 방식`}
                                  className="w-full px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="raw_above">원시값 ≥ (Raw)</option>
                                  <option value="normalized_below">점수 ≤ (Current)</option>
                                </select>
                              </td>

                              <td className="px-3 py-2.5 align-middle">
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={rule.comparisonMode === 'normalized_below' ? 255 : undefined}
                                    step="1"
                                    value={warnValStr}
                                    placeholder="미설정"
                                    onChange={e =>
                                      handleChangeRuleThresholdInput(rule, 'warning', e.target.value)
                                    }
                                    aria-label={`${rule.attributeName} 주의 임계치`}
                                    className={`w-full px-2.5 py-1.5 rounded-md border font-mono tabular-nums text-xs bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 font-semibold focus:outline-none focus:ring-2 ${
                                      rowError
                                        ? 'border-red-500 focus:ring-red-500'
                                        : 'border-amber-300/80 dark:border-amber-700/60 focus:ring-amber-500'
                                    }`}
                                  />
                                </div>
                              </td>

                              <td className="px-3 py-2.5 align-middle">
                                <div className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={rule.comparisonMode === 'normalized_below' ? 255 : undefined}
                                    step="1"
                                    value={critValStr}
                                    placeholder="미설정"
                                    onChange={e =>
                                      handleChangeRuleThresholdInput(rule, 'critical', e.target.value)
                                    }
                                    aria-label={`${rule.attributeName} 위험 임계치`}
                                    className={`w-full px-2.5 py-1.5 rounded-md border font-mono tabular-nums text-xs bg-white dark:bg-slate-950 text-red-700 dark:text-red-300 font-semibold focus:outline-none focus:ring-2 ${
                                      rowError
                                        ? 'border-red-500 focus:ring-red-500'
                                        : 'border-red-300/80 dark:border-red-700/60 focus:ring-red-500'
                                    }`}
                                  />
                                </div>
                              </td>

                              <td className="px-3 py-2.5 text-right align-middle">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {!rule.isCustomAttribute && modified && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetSingleRule(rule.id)}
                                      title="이 속성을 기본값으로 복원"
                                      className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {rule.isCustomAttribute && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCustomRule(rule.id)}
                                      title="사용자 추가 규칙 삭제"
                                      className="p-1.5 rounded-md border border-red-300/80 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {rowError && (
                              <tr className="bg-red-50/80 dark:bg-red-950/30">
                                <td colSpan={6} className="px-3 py-1.5 text-[11px] text-red-700 dark:text-red-300">
                                  <span className="inline-flex items-center gap-1.5 font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{rowError}</span>
                                  </span>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Custom S.M.A.R.T. Attribute Form */}
              <form
                onSubmit={handleAddCustomRule}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-indigo-500" />
                      <span>새 S.M.A.R.T. 속성 임계치 규칙 추가</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      표준 카탈로그 또는 연결된 디스크의 S.M.A.R.T. ID(16진수 0x07 또는 10진수 7)를 선택해 맞춤 경보를 추가합니다.
                    </p>
                  </div>

                  {availablePresetsToAdd.length > 0 && (
                    <select
                      value={newRulePresetId}
                      onChange={e => handleSelectNewRulePreset(e.target.value)}
                      aria-label="프리셋 S.M.A.R.T. 속성 선택"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">프리셋 속성 빠르게 채우기...</option>
                      {availablePresetsToAdd.map(p => (
                        <option key={p.id} value={String(p.id)}>
                          {p.sourceLabel}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {newRuleError && (
                  <div className="p-2.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{newRuleError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      속성 ID (Hex/Dec)
                    </label>
                    <input
                      type="text"
                      value={newAttrIdInput}
                      onChange={e => setNewAttrIdInput(e.target.value)}
                      placeholder="예: 0x07"
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      속성 이름
                    </label>
                    <input
                      type="text"
                      value={newAttrNameInput}
                      onChange={e => setNewAttrNameInput(e.target.value)}
                      placeholder="예: Seek Error Rate"
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      판정 기준
                    </label>
                    <select
                      value={newAttrMode}
                      onChange={e => setNewAttrMode(e.target.value as SmartThresholdComparison)}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="raw_above">원시값 ≥ (Raw)</option>
                      <option value="normalized_below">점수 ≤ (Current)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      주의 (Warning)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={newAttrMode === 'normalized_below' ? 255 : undefined}
                      value={newAttrWarning}
                      onChange={e => setNewAttrWarning(e.target.value)}
                      placeholder="1"
                      className="w-full px-2.5 py-1.5 rounded-md border border-amber-300/80 dark:border-amber-700/60 bg-white dark:bg-slate-900 font-mono tabular-nums text-xs text-amber-700 dark:text-amber-300 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-[10px] font-semibold text-red-700 dark:text-red-400">
                      위험 (Critical)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={newAttrMode === 'normalized_below' ? 255 : undefined}
                      value={newAttrCritical}
                      onChange={e => setNewAttrCritical(e.target.value)}
                      placeholder="10"
                      className="w-full px-2.5 py-1.5 rounded-md border border-red-300/80 dark:border-red-700/60 bg-white dark:bg-slate-900 font-mono tabular-nums text-xs text-red-700 dark:text-red-300 font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>임계치 규칙 추가</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: Data Migration (JSON Export / Import) */}
          {activeSubTab === 'migration' && (
            <div className="space-y-4">
              {migrationFeedback && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
                    migrationFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  }`}
                >
                  {migrationFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{migrationFeedback.message}</span>
                </div>
              )}

              {/* Export Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Download className="w-4 h-4 text-indigo-500" />
                      <span>전체 설정 및 검사 기록 내보내기 (JSON 백업)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      현재 환경설정과 누적 검사 히스토리를 단일 JSON 파일로 내려받아 다른 PC나 브라우저로 이전합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportMigration}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON 내보내기</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 font-mono text-[11px]">
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">화면 테마</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {isDarkMode ? '다크 모드' : '라이트 모드'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">알림 허용 여부</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {effectiveNotificationsAllowed ? '허용 (ON)' : '미허용/끔'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">자동 수복 모드</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {isAutoRepairMode ? '켜짐 (ON)' : '꺼짐 (OFF)'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">저장된 검사 기록</div>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
                      총 {scanRecords.length.toLocaleString()}건 · 임계치 {customSmartThresholds.length}건
                    </div>
                  </div>
                </div>
              </div>

              {/* Import Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span>JSON 백업 파일에서 가져오기 (복원)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      내보낸 <code>disksentinel-migration-*.json</code> 파일을 불러와 설정과 검사 이력을 복원합니다.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      <span>백업 JSON 선택</span>
                    </button>
                  </div>
                </div>

                {/* Merge vs Replace Strategy */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      검사 기록 가져오기 방식:
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setImportStrategy('merge')}
                        className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                          importStrategy === 'merge'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        기존 기록과 병합 (권장)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportStrategy('replace')}
                        className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                          importStrategy === 'replace'
                            ? 'bg-orange-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        기존 기록 덮어쓰기
                      </button>
                    </div>
                  </div>
                  {importStrategy === 'replace' && scanRecords.length > 0 && (
                    <div className="text-[11px] text-orange-700 dark:text-orange-300">
                      * 주의: 기존 저장된 검사 기록 {scanRecords.length.toLocaleString()}건이 삭제되고 백업 파일의 기록으로 교체됩니다.
                    </div>
                  )}
                </div>

                {/* Pending Import Validation Preview */}
                {pendingImport && (
                  <div className="p-3 rounded-lg border border-indigo-300 dark:border-indigo-700/70 bg-indigo-50/70 dark:bg-indigo-950/30 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                        <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-mono">{pendingImport.filename}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        백업 일시: {new Date(pendingImport.bundle.exportedAt).toLocaleString('ko-KR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div>
                        테마:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isDarkMode ? '다크 모드' : '라이트 모드'}
                        </strong>
                      </div>
                      <div>
                        알림:{' '}
                        <strong>
                          {pendingImport.bundle.settings.notificationsAllowed ? '허용' : '미허용'}
                        </strong>
                      </div>
                      <div>
                        자동 수복:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isAutoRepairMode ? 'ON' : 'OFF'}
                        </strong>
                      </div>
                      <div>
                        오디오:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isMuted
                            ? '음소거'
                            : `${pendingImport.bundle.settings.volumePercent}%`}
                        </strong>
                      </div>
                      <div>
                        배속: <strong>{pendingImport.bundle.settings.scanSpeedMultiplier}x</strong>
                      </div>
                      <div>
                        검사 기록:{' '}
                        <strong>
                          {pendingImport.bundle.scanRecords.length}건
                          {importStrategy === 'merge' ? ` (신규 ${newIncomingCount}건)` : ''}
                        </strong>
                      </div>
                    </div>

                    {pendingImport.skippedCount > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        * 스키마가 불완전한 레코드 {pendingImport.skippedCount}건은 안전을 위해 제외되었습니다.
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPendingImport(null)}
                        className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyMigration}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>설정 및 기록 복원 적용</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 font-mono">
            모든 설정은 브라우저 로컬 저장소에 안전하게 유지되며 JSON으로 언제든 백업할 수 있습니다.
          </span>
          {!isInline && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              확인 및 닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
