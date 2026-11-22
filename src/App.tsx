import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import {
  AppLocale,
  CommandPaletteAction,
  DiskDrive,
  SectorBlock,
  ScanTelemetry,
  ErrorLogItem,
  SavedScanRecord,
  SpecializedScanMethodId,
  MainAppTab,
  SurfaceScanCheckpoint,
  SurfaceTestType,
  DiagnosticTask,
  SmartSelfTestState,
  SmartSelfTestType,
  ThermalHistoryPoint,
  DiskHardwareSpecs,
  WatchdogRule,
  WatchdogBaselineSnapshot,
  WatchdogTriggerEvent,
  SmartHistorySnapshot,
  CustomSmartThresholdRule,
  UsbSurfaceScanPolicy
} from './types';
import { generateBlocksForDrive, TOTAL_SCAN_BLOCKS } from './utils/drivePresets';
import { soundManager } from './utils/audio';
import { createScanRecordFromSession } from './utils/reportGenerator';
import {
  loadSmartHistorySnapshots,
  recordSmartSnapshotForDrive
} from './utils/smartHistoryStore';
import {
  loadCustomSmartThresholds,
  saveCustomSmartThresholds
} from './utils/smartThresholds';
import type { OptionsModalSubTab } from './components/OptionsModal';
import type { ExternalDeviceModalTab } from './components/ExternalDeviceModal';
import { resolveUsbSurfaceScanPolicy } from './utils/usbScanMatrix';
import { Navbar } from './components/Navbar';
import { SectorGrid } from './components/SectorGrid';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ErrorLogStream } from './components/ErrorLogStream';
import { HealthSummaryDashboard } from './components/HealthSummaryDashboard';
import { HistoryAndComparison } from './components/HistoryAndComparison';
import { AlertBanner } from './components/AlertBanner';
import { ScanMethodSelector } from './components/ScanMethodSelector';
import { LatencyHistogramDashboard } from './components/LatencyHistogramDashboard';
import { ResponseBucketsBar, BucketKey } from './components/ResponseBucketsBar';
import { LbaGraphView } from './components/LbaGraphView';
import { TaskManagerPanel } from './components/TaskManagerPanel';
import { ThermalMonitorWidget } from './components/ThermalMonitorWidget';

const ReportModal = React.lazy(() => import('./components/ReportModal').then(m => ({ default: m.ReportModal })));
const ExportModal = React.lazy(() => import('./components/ExportModal').then(m => ({ default: m.ExportModal })));
const UpdateModal = React.lazy(() => import('./components/UpdateModal').then(m => ({ default: m.UpdateModal })));
const AboutModal = React.lazy(() => import('./components/AboutModal').then(m => ({ default: m.AboutModal })));
const DllDocsModal = React.lazy(() => import('./components/DllDocsModal').then(m => ({ default: m.DllDocsModal })));
const ExternalDeviceModal = React.lazy(() => import('./components/ExternalDeviceModal').then(m => ({ default: m.ExternalDeviceModal })));
const VendorDiagnosticsModal = React.lazy(() => import('./components/VendorDiagnosticsModal').then(m => ({ default: m.VendorDiagnosticsModal })));
const SupportedProductsCatalogModal = React.lazy(() => import('./components/SupportedProductsCatalogModal').then(m => ({ default: m.SupportedProductsCatalogModal })));
const ParallelDriveScanModal = React.lazy(() => import('./components/ParallelDriveScanModal').then(m => ({ default: m.ParallelDriveScanModal })));
const TrayGuardianModal = React.lazy(() => import('./components/TrayGuardianModal').then(m => ({ default: m.TrayGuardianModal })));
const BitCarvingRecoveryModal = React.lazy(() => import('./components/BitCarvingRecoveryModal').then(m => ({ default: m.BitCarvingRecoveryModal })));
const DiskHardwareDetailsModal = React.lazy(() => import('./components/DiskHardwareDetailsModal').then(m => ({ default: m.DiskHardwareDetailsModal })));
const DriveFeaturesModal = React.lazy(() => import('./components/DriveFeaturesModal').then(m => ({ default: m.DriveFeaturesModal })));
const SectorHexPartitionModal = React.lazy(() => import('./components/SectorHexPartitionModal').then(m => ({ default: m.SectorHexPartitionModal })));
const DiskBenchmarkProfilerModal = React.lazy(() => import('./components/DiskBenchmarkProfilerModal').then(m => ({ default: m.DiskBenchmarkProfilerModal })));
const LbaImageClonerModal = React.lazy(() => import('./components/LbaImageClonerModal').then(m => ({ default: m.LbaImageClonerModal })));
const LbaFileTracerModal = React.lazy(() => import('./components/LbaFileTracerModal').then(m => ({ default: m.LbaFileTracerModal })));
const SanitizeTrimModal = React.lazy(() => import('./components/SanitizeTrimModal').then(m => ({ default: m.SanitizeTrimModal })));
const ScanCompletionSummaryModal = React.lazy(() => import('./components/ScanCompletionSummaryModal').then(m => ({ default: m.ScanCompletionSummaryModal })));
const OptionsModal = React.lazy(() => import('./components/OptionsModal').then(m => ({ default: m.OptionsModal })));
const HelpGuideModal = React.lazy(() => import('./components/HelpGuideModal').then(m => ({ default: m.HelpGuideModal })));
const SmartRemapModal = React.lazy(() => import('./components/SmartRemapModal').then(m => ({ default: m.SmartRemapModal })));
const FleetOverviewDashboard = React.lazy(() => import('./components/FleetOverviewDashboard').then(m => ({ default: m.FleetOverviewDashboard })));
const FolderLbaIntegrityPanel = React.lazy(() => import('./components/FolderLbaIntegrityPanel').then(m => ({ default: m.FolderLbaIntegrityPanel })));
const CommandPaletteModal = React.lazy(() => import('./components/CommandPaletteModal').then(m => ({ default: m.CommandPaletteModal })));
import { loadSavedLocale, saveLocale, t } from './utils/i18n';
import {
  buildCheckpointFromTask,
  clearScanCheckpoint,
  loadScanCheckpoint,
  restoreTaskFromCheckpoint,
  saveScanCheckpoint
} from './utils/scanCheckpoint';
import {
  evaluateWatchdogRules,
  loadWatchdogBaselines,
  loadWatchdogEvents,
  loadWatchdogRules,
  saveWatchdogBaselines,
  saveWatchdogEvents,
  saveWatchdogRules
} from './utils/watchdogEngine';
import { checkForGithubReleaseUpdate } from './utils/updater';
import { PROJECT_INFO, ReleaseInfo } from './config/projectInfo';
import { SCAN_METHOD_DEFINITIONS, getDefaultMethodForDrive } from './utils/scanProfiles';
import {
  executeRealZeroFillRepairBlock,
  rescanAllDrives,
  isTauriDesktopRuntime,
  isNativeHardwareRuntime,
  detectNativeBridgeAvailable,
  createEmptyResponseBuckets,
  classifyResponseBucket,
  buildScanBlockSequence,
  isSafeEraseTarget,
  executeHddScanBlockBatch,
  queryTauriRunSmartSelfTest,
  queryTauriSmartSelfTestStatus,
  queryTauriPollTemperatures,
  invokeTauriEjectPhysicalDrive,
  invokeTauriSyncTrayState,
  invokeTauriNativeNotification,
  isSystemOrBootDrive
} from './utils/nativeDriveEngine';
import { calculateHardwareVitals } from './utils/hardwareTelemetry';
import { classifyFutureDriveStandards } from './utils/vendorDiagnostics';
import { safeStorage } from './utils/safeStorage';
import { DiskSentinelMigrationBundle, mergeScanRecords } from './utils/dataMigration';
import { ContiguousDegradationZone, PredictiveFailureReport, analyzePredictiveFailure } from './utils/predictiveFailureAnalysis';
import {
  Github,
  BookOpen,
  Building2,
  Sparkles,
  ShieldCheck,
  Usb,
  HardDrive,
  Activity,
  Terminal,
  GitCompare,
  ArrowRight,
  ShieldAlert,
  Play,
  Layers,
  SlidersHorizontal,
  RefreshCw,
  Zap,
  LayoutGrid,
  FolderLock,
  RotateCcw
} from 'lucide-react';

export default function App() {
  // Theme & Locale state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = safeStorage.getItem('disk_scanner_dark_mode');
    if (saved !== null) return saved === 'true';
    return true; // Default to dark mode for diagnostic monitors
  });
  const [locale, setLocale] = useState<AppLocale>(() => loadSavedLocale());
  const handleChangeLocale = useCallback((nextLocale: AppLocale) => {
    setLocale(nextLocale);
    saveLocale(nextLocale);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    safeStorage.setItem('disk_scanner_dark_mode', String(isDarkMode));
  }, [isDarkMode]);

  // Audio mute state
  const [isMuted, setIsMuted] = useState<boolean>(() => soundManager.getMuted());
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundManager.setMuted(nextMuted);
  };

  // Browser Notification state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    const saved = safeStorage.getItem('disk_scanner_notifications_enabled');
    if (saved !== null) return saved === 'true';
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  useEffect(() => {
    safeStorage.setItem('disk_scanner_notifications_enabled', String(notificationsEnabled));
  }, [notificationsEnabled]);

  const handleRequestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          new Notification('디스크 배드섹터 검사기 알림 활성화', {
            body: '배드섹터 및 심각한 디스크 오류 검출 시 즉각 알림이 전송됩니다.',
            icon: '/favicon.ico'
          });
        }
      } catch (err) {
        console.error('Notification permission request error:', err);
      }
    }
  };

  const handleToggleNotificationsEnabled = useCallback(() => {
    if (notificationPermission !== 'granted') {
      void handleRequestNotification();
      return;
    }
    setNotificationsEnabled(prev => !prev);
  }, [notificationPermission]);

  // Native OS Notification & Tauri System Tray Preferences
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => {
    return safeStorage.getItem('disk_scanner_minimize_to_tray') === 'true';
  });
  useEffect(() => {
    safeStorage.setItem('disk_scanner_minimize_to_tray', String(minimizeToTray));
  }, [minimizeToTray]);

  const [nativeOsNotificationsEnabled, setNativeOsNotificationsEnabled] = useState<boolean>(() => {
    return safeStorage.getItem('disk_scanner_native_os_notifications') !== 'false';
  });
  useEffect(() => {
    safeStorage.setItem('disk_scanner_native_os_notifications', String(nativeOsNotificationsEnabled));
  }, [nativeOsNotificationsEnabled]);
  const nativeOsNotificationsRef = useRef<boolean>(nativeOsNotificationsEnabled);
  nativeOsNotificationsRef.current = nativeOsNotificationsEnabled;

  const dispatchNotification = useCallback((title: string, body: string, severity: 'info' | 'warning' | 'critical' = 'info') => {
    if (nativeOsNotificationsRef.current) {
      void invokeTauriNativeNotification(title, body, severity);
    }
    if (
      notificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico'
        });
      } catch {
        // Ignore fallback
      }
    }
  }, [notificationsEnabled]);

  // Drive Selection & Management (Tauri Native IPC Exclusive)
  const [drives, setDrives] = useState<DiskDrive[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>('');
  const [isInitialProbing, setIsInitialProbing] = useState<boolean>(true);
  const [isExternalModalOpen, setIsExternalModalOpen] = useState<boolean>(false);
  const [externalModalTab, setExternalModalTab] = useState<ExternalDeviceModalTab>('connected');
  const [usbPolicyOverrides, setUsbPolicyOverrides] = useState<Record<string, string>>({});
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState<{
    tauriAvailable: boolean;
    bridgeReachable: boolean;
    bridgeElevated: boolean;
    checkedAt: number | null;
    checking: boolean;
  }>(() => ({
    tauriAvailable: isTauriDesktopRuntime(),
    bridgeReachable: false,
    bridgeElevated: false,
    checkedAt: null,
    checking: true
  }));

  const activeDrive: DiskDrive | undefined = drives.find(d => d.id === selectedDriveId) || drives[0];

  // Hardware Details, Features Control & Live Rescan State
  const [isHardwareDetailsOpen, setIsHardwareDetailsOpen] = useState<boolean>(false);
  const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState<boolean>(false);
  const [smartLogRefreshSignal, setSmartLogRefreshSignal] = useState<number>(0);
  const [isRescanningDrives, setIsRescanningDrives] = useState<boolean>(false);

  // Active Tab: 'scan' | 'logs' | 'health' | 'smart' | 'history'
  const [activeTab, setActiveTab] = useState<MainAppTab>('scan');

  // Storage Media Tailored Inspection Method State
  const [selectedMethodId, setSelectedMethodId] = useState<SpecializedScanMethodId>('nvme_multiqueue_direct');

  const activeUsbPolicy: UsbSurfaceScanPolicy | undefined = useMemo(() => {
    if (!activeDrive) return undefined;
    return resolveUsbSurfaceScanPolicy(
      activeDrive,
      selectedMethodId,
      usbPolicyOverrides[activeDrive.id]
    );
  }, [activeDrive, selectedMethodId, usbPolicyOverrides]);

  const openExternalDeviceModal = useCallback((tab: ExternalDeviceModalTab = 'connected') => {
    setExternalModalTab(tab);
    setIsExternalModalOpen(true);
  }, []);

  const handleApplyUsbMatrixPolicy = useCallback(
    (
      driveId: string,
      profileKey: string | null,
      recommendedMethodId?: SpecializedScanMethodId
    ) => {
      setUsbPolicyOverrides(prev => {
        const next = { ...prev };
        if (profileKey === null) {
          delete next[driveId];
        } else {
          next[driveId] = profileKey;
        }
        return next;
      });
      if (recommendedMethodId && activeDrive?.id === driveId) {
        setSelectedMethodId(recommendedMethodId);
      }
    },
    [activeDrive?.id]
  );

  // HDDScan Diagnostic Configuration State
  const [selectedTestType, setSelectedTestType] = useState<SurfaceTestType>('verify');
  const [rangeStartPct, setRangeStartPct] = useState<number>(0);
  const [rangeEndPct, setRangeEndPct] = useState<number>(100);
  const [scanViewMode, setScanViewMode] = useState<'split' | 'graph' | 'map'>('split');
  const [activeBucketFilter, setActiveBucketFilter] = useState<BucketKey | null>(null);

  // Blank preview blocks for idle selected drive (before a task is started)
  const [idleBlocks, setIdleBlocks] = useState<SectorBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<SectorBlock | null>(null);
  const [queuedRepairBlockIds, setQueuedRepairBlockIds] = useState<number[]>([]);
  const lastInitializedDriveRef = useRef<{ id: string; totalSectors: number } | null>(null);

  // Multi-Task Queue Manager State
  const [tasks, setTasks] = useState<DiagnosticTask[]>([]);
  const tasksRef = useRef<DiagnosticTask[]>(tasks);
  tasksRef.current = tasks;
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(activeTaskId);
  activeTaskIdRef.current = activeTaskId;

  // Live Thermal Monitor & SMART Self-Test State
  const [isNativeRuntime, setIsNativeRuntime] = useState<boolean>(() => isNativeHardwareRuntime());
  const isTauriRuntime = isNativeRuntime;
  const [isThermalPolling, setIsThermalPolling] = useState<boolean>(() => isNativeHardwareRuntime());
  const [thermalHistoryByDrive, setThermalHistoryByDrive] = useState<Record<string, ThermalHistoryPoint[]>>({});
  const [smartSelfTestByDrive, setSmartSelfTestByDrive] = useState<Record<string, SmartSelfTestState>>({});

  const checkNativeEngineConnection = useCallback(async () => {
    setBridgeDiagnostics(prev => ({ ...prev, checking: true }));
    try {
      const [allDrives, bridgeOk] = await Promise.all([
        rescanAllDrives([]),
        detectNativeBridgeAvailable(true)
      ]);
      const tauriOk = isTauriDesktopRuntime();

      setDrives(allDrives);
      if (allDrives.length > 0) {
        setSelectedDriveId(prevId =>
          allDrives.some(d => d.id === prevId) ? prevId : allDrives[0].id
        );
        setSelectedMethodId(getDefaultMethodForDrive(allDrives[0]));
      } else {
        setSelectedDriveId('');
      }

      const nativeActive =
        tauriOk ||
        isNativeHardwareRuntime() ||
        allDrives.some(d => d.id.startsWith('drive-tauri-physical-'));

      setIsNativeRuntime(nativeActive);
      if (nativeActive) {
        setIsThermalPolling(true);
      } else {
        setIsThermalPolling(false);
      }

      setBridgeDiagnostics({
        tauriAvailable: tauriOk,
        bridgeReachable: bridgeOk,
        bridgeElevated: bridgeOk || nativeActive,
        checkedAt: Date.now(),
        checking: false
      });
      return allDrives;
    } catch {
      setBridgeDiagnostics({
        tauriAvailable: isTauriDesktopRuntime(),
        bridgeReachable: false,
        bridgeElevated: false,
        checkedAt: Date.now(),
        checking: false
      });
      return [] as DiskDrive[];
    } finally {
      setIsInitialProbing(false);
    }
  }, []);

  // Probe Real Native OS Hardware Storage on Mount (Tauri Desktop IPC)
  useEffect(() => {
    void checkNativeEngineConnection();
  }, [checkNativeEngineConnection]);

  // Keep local 127.0.0.1 Win32 launcher HTTP server alive while the UI tab remains open
  useEffect(() => {
    if (!bridgeDiagnostics.bridgeReachable || typeof window === 'undefined') return;
    const host = window.location.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return;

    let stopped = false;
    const sendHeartbeat = () => {
      if (stopped) return;
      void fetch('/api/native/heartbeat', {
        cache: 'no-store',
        keepalive: true
      }).catch(() => {});
    };

    sendHeartbeat();
    const timerId = window.setInterval(sendHeartbeat, 15000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bridgeDiagnostics.bridgeReachable]);

  const handleRescanDrives = useCallback(async () => {
    setIsRescanningDrives(true);
    try {
      const updated = await checkNativeEngineConnection();
      soundManager.playClick();
      if (updated.length > 0) {
        dispatchNotification('디스크 장치 재검색 완료', `물리 스토리지 ${updated.length}대가 Tauri 네이티브 엔진에 인식되었습니다.`);
      }
    } catch (err) {
      console.error('Error rescanning drives:', err);
    } finally {
      setIsRescanningDrives(false);
    }
  }, [checkNativeEngineConnection, dispatchNotification]);

  const handleEjectDrive = useCallback(async (ejectDriveId: string): Promise<{ success: boolean; message: string }> => {
    const targetDrive = drivesRef.current.find(d => d.id === ejectDriveId);
    if (!targetDrive) {
      return { success: false, message: '대상 드라이브를 찾을 수 없습니다.' };
    }
    if (isSystemOrBootDrive(targetDrive)) {
      return {
        success: false,
        message: 'OS 시스템/부트 드라이브(C: 또는 PhysicalDrive0)는 안전상 분리할 수 없습니다.'
      };
    }
    const res = await invokeTauriEjectPhysicalDrive(targetDrive);
    if (!res.success) {
      return { success: false, message: res.message };
    }
    setDrives(prev => {
      const remaining = prev.filter(d => d.id !== ejectDriveId);
      if (selectedDriveId === ejectDriveId) {
        setSelectedDriveId(remaining[0]?.id ?? '');
      }
      return remaining;
    });
    return { success: true, message: res.message };
  }, [selectedDriveId]);

  // Initialize blank blocks preview when drive changes
  const initDriveBlocks = useCallback((drive: DiskDrive) => {
    const { blocks: initialBlocks } = generateBlocksForDrive(drive, TOTAL_SCAN_BLOCKS);
    lastInitializedDriveRef.current = { id: drive.id, totalSectors: drive.totalSectors };
    setIdleBlocks(initialBlocks);
    setSelectedBlock(null);
  }, []);

  // Focused task for active drive & inspector stage
  const activeTask = useMemo(() => {
    if (!activeDrive) return null;
    const exact = tasks.find(t => t.id === activeTaskId);
    if (exact && exact.driveId === activeDrive.id) return exact;
    const runningForDrive = tasks.find(t => t.driveId === activeDrive.id && t.status === 'running');
    if (runningForDrive) return runningForDrive;
    return tasks.find(t => t.driveId === activeDrive.id) || null;
  }, [tasks, activeTaskId, activeDrive]);

  const blocks = useMemo(
    () => (activeTask ? activeTask.blocks : idleBlocks),
    [activeTask, idleBlocks]
  );
  const blocksRef = useRef<SectorBlock[]>(blocks);
  blocksRef.current = blocks;

  const activeBlockIndex = activeTask ? activeTask.currentBlockIndex : -1;
  const scanStatus: ScanTelemetry['status'] = activeTask
    ? activeTask.status === 'running'
      ? 'scanning'
      : activeTask.status === 'queued'
      ? 'paused'
      : activeTask.status
    : 'idle';
  const elapsedSeconds = activeTask ? activeTask.elapsedSeconds : 0;

  // Non-contiguous Bulk Repair Queue Handlers
  const handleToggleRepairQueueBlock = useCallback((blockId: number) => {
    setQueuedRepairBlockIds(prev =>
      prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]
    );
  }, []);

  const handleBulkSelectRepairBlocks = useCallback((blockIds: number[], mode: 'add' | 'replace' | 'remove') => {
    if (mode === 'replace') {
      setQueuedRepairBlockIds(Array.from(new Set(blockIds)));
      return;
    }
    if (mode === 'add') {
      setQueuedRepairBlockIds(prev => {
        const next = new Set(prev);
        blockIds.forEach(id => next.add(id));
        return Array.from(next);
      });
      return;
    }
    const removeSet = new Set(blockIds);
    setQueuedRepairBlockIds(prev => prev.filter(id => !removeSet.has(id)));
  }, []);

  const handleClearRepairQueue = useCallback(() => {
    setQueuedRepairBlockIds([]);
  }, []);

  // S.M.A.R.T Sector Remapping & Zero-Fill Repair Handler (Preserves measured I/O latency & triggers real firmware re-read)
  const handleRepairSectors = useCallback((
    driveId: string,
    repairedBlockIds: number[],
    latencyByBlockId?: Record<number, number>
  ) => {
    if (repairedBlockIds.length === 0) return;
    const uniqueIds = Array.from(new Set(repairedBlockIds));
    const repairedIdSet = new Set(uniqueIds);

    const patchBlocks = (list: SectorBlock[]) =>
      list.map(b =>
        repairedIdSet.has(b.id)
          ? {
              ...b,
              status: 'good' as const,
              responseTimeMs: latencyByBlockId?.[b.id] ?? (b.responseTimeMs > 0 ? b.responseTimeMs : 0),
              errorCode: undefined
            }
          : b
      );

    if (activeDriveRef.current?.id === driveId) {
      setIdleBlocks(prev => patchBlocks(prev));
      setQueuedRepairBlockIds(prev => prev.filter(id => !repairedIdSet.has(id)));
    }
    setTasks(prev =>
      prev.map(t =>
        t.driveId === driveId
          ? {
              ...t,
              blocks: patchBlocks(t.blocks)
            }
          : t
      )
    );

    const driveTask = tasksRef.current.find(t => t.driveId === driveId);
    const sourceBlocks = driveTask ? driveTask.blocks : blocksRef.current;
    const firstRepairedBlock = sourceBlocks.find(b => repairedIdSet.has(b.id));
    const firstBlockLatency = firstRepairedBlock
      ? (latencyByBlockId?.[firstRepairedBlock.id] ?? (firstRepairedBlock.responseTimeMs > 0 ? firstRepairedBlock.responseTimeMs : 0))
      : 0;
    const newLog: ErrorLogItem = {
      id: `repair-log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      blockIndex: uniqueIds[0] || 0,
      lba: firstRepairedBlock?.lba ?? 0,
      status: 'repaired',
      latencyMs: firstBlockLatency,
      errorCode: 'REPAIRED_ZEROFILL',
      description: `0x00 제로필 덮어쓰기 및 검증 완료 (${uniqueIds.length}개 블록), 하드웨어 S.M.A.R.T. 카운터 재조회 요청`,
      methodContext: 'S.M.A.R.T. Sector Remapping Engine'
    };

    setErrorLogs(prev => [newLog, ...prev]);
    soundManager.playSuccess();
    void handleRescanDrives();
  }, [handleRescanDrives]);

  // Telemetry & Scan Settings
  const [scanMode, setScanMode] = useState<'quick' | 'full'>('full');
  const [scanSpeedMultiplier, setScanSpeedMultiplier] = useState<number>(() => {
    const saved = Number(safeStorage.getItem('disk_scanner_speed_multiplier'));
    return [1, 2, 5, 10].includes(saved) ? saved : 2;
  });
  useEffect(() => {
    safeStorage.setItem('disk_scanner_speed_multiplier', String(scanSpeedMultiplier));
  }, [scanSpeedMultiplier]);

  // Live Error Log Stream & Preemptive Degradation Warning Deduplication
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);
  const emittedDegradationKeysRef = useRef<Set<string>>(new Set());

  const handleDegradationWarning = useCallback(
    (zone: ContiguousDegradationZone, report: PredictiveFailureReport) => {
      const currentDrive = activeDriveRef.current;
      if (!currentDrive) return;
      const scopedKey = `${currentDrive.id}:${zone.warningKey}`;
      if (emittedDegradationKeysRef.current.has(scopedKey)) {
        return;
      }
      emittedDegradationKeysRef.current.add(scopedKey);

      soundManager.playWarningTone();
      const newLog: ErrorLogItem = {
        id: `degradation-${Date.now()}-${zone.startBlockId}`,
        timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
        blockIndex: zone.startBlockId,
        lba: zone.startLba,
        status: 'critical',
        latencyMs: Number(zone.meanLatencyMs.toFixed(1)),
        errorCode: 'DEGRADATION_WARNING',
        description: `Degradation Warning: 연속 물리 구간 LBA #${zone.startLba.toLocaleString()}~#${zone.endLba.toLocaleString()} (${zone.blockCount}개 섹터 연속 ≥100ms, 평균 ${zone.meanLatencyMs.toFixed(1)}ms, 최대 Z=${zone.maxZScore.toFixed(2)}σ, 위험도 ${report.degradationRiskScore}/100)`,
        methodContext: 'Predictive Failure Analysis (Z-Score)'
      };
      setErrorLogs(prev => [newLog, ...prev.slice(0, 199)]);

      dispatchNotification(
        '⚠️ 선제적 물리 열화 경고 (Degradation Warning)',
        `LBA #${zone.startLba.toLocaleString()}~#${zone.endLba.toLocaleString()} 연속 ${zone.blockCount}개 섹터가 100ms 임계치를 초과했습니다 (최대 Z=${zone.maxZScore.toFixed(2)}σ).`
      );
    },
    [dispatchNotification]
  );

  // Maintain preemptive Degradation Warning monitoring when user switches away from the Scan tab mid-scan
  useEffect(() => {
    if (scanStatus !== 'scanning' || activeTab === 'scan') return;
    const report = analyzePredictiveFailure(blocks, {
      latencyThresholdMs: 100,
      minContiguousCount: 3,
      scanMode
    });
    for (const zone of report.contiguousZones) {
      handleDegradationWarning(zone, report);
    }
  }, [activeTab, blocks, scanMode, scanStatus, handleDegradationWarning]);

  // Alert Banner State
  const [alertBannerVisible, setAlertBannerVisible] = useState<boolean>(false);
  const [latestBadLba, setLatestBadLba] = useState<number | undefined>(undefined);

  // Overheat Banner Dismissal State
  const [isOverheatDismissed, setIsOverheatDismissed] = useState<boolean>(false);

  // Auto-Repair Mode State (Persisted in safeStorage)
  const [isAutoRepairMode, setIsAutoRepairMode] = useState<boolean>(() => {
    const saved = safeStorage.getItem('disk_scanner_auto_repair_mode');
    return saved === 'true';
  });
  const isAutoRepairModeRef = useRef<boolean>(isAutoRepairMode);

  useEffect(() => {
    isAutoRepairModeRef.current = isAutoRepairMode;
    safeStorage.setItem('disk_scanner_auto_repair_mode', String(isAutoRepairMode));
  }, [isAutoRepairMode]);

  const handleToggleAutoRepairMode = useCallback(() => {
    setIsAutoRepairMode(prev => !prev);
  }, []);

  // Scan History & Report State (Stores only genuine user-performed scan records)
  const [scanRecords, setScanRecords] = useState<SavedScanRecord[]>(() => {
    const saved = safeStorage.getItem('disk_scan_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(r => r.id !== 'scan-baseline-seagate');
        }
      } catch {
        // parse error
      }
    }
    return [];
  });

  useEffect(() => {
    safeStorage.setItem('disk_scan_records', JSON.stringify(scanRecords));
  }, [scanRecords]);

  // Persistent genuine S.M.A.R.T. snapshot history for long-term degradation charts
  const [smartSnapshots, setSmartSnapshots] = useState<SmartHistorySnapshot[]>(() =>
    loadSmartHistorySnapshots()
  );

  useEffect(() => {
    if (drives.length === 0) return;
    setSmartSnapshots(prev => {
      let next = prev;
      for (const d of drives) {
        if (d.smartAttributes.length > 0) {
          next = recordSmartSnapshotForDrive(next, d, 'auto-poll');
        }
      }
      return next;
    });
  }, [drives]);

  const handleRecordSmartSnapshot = useCallback((drive: DiskDrive) => {
    setSmartSnapshots(prev => recordSmartSnapshotForDrive(prev, drive, 'manual'));
  }, []);

  const handleImportMigration = useCallback(
    (bundle: DiskSentinelMigrationBundle, strategy: 'merge' | 'replace') => {
      setIsDarkMode(bundle.settings.isDarkMode);
      setIsMuted(bundle.settings.isMuted);
      soundManager.setMuted(bundle.settings.isMuted);
      soundManager.setVolume(bundle.settings.volumePercent / 100);
      setScanSpeedMultiplier(bundle.settings.scanSpeedMultiplier);
      setIsAutoRepairMode(bundle.settings.isAutoRepairMode);

      if (bundle.settings.notificationsAllowed) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          void Notification.requestPermission().then(perm => {
            setNotificationPermission(perm);
            setNotificationsEnabled(perm === 'granted');
          });
        } else {
          setNotificationsEnabled(
            typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
          );
        }
      } else {
        setNotificationsEnabled(false);
      }

      setScanRecords(prev => mergeScanRecords(prev, bundle.scanRecords, strategy));
      if (Array.isArray(bundle.settings.customSmartThresholds)) {
        setCustomSmartThresholds(bundle.settings.customSmartThresholds);
        saveCustomSmartThresholds(bundle.settings.customSmartThresholds);
      }
    },
    []
  );

  // Active Report Modal
  const [activeReportRecord, setActiveReportRecord] = useState<SavedScanRecord | null>(null);
  const [exportTargetRecord, setExportTargetRecord] = useState<SavedScanRecord | null>(null);
  const [completedSummaryRecord, setCompletedSummaryRecord] = useState<SavedScanRecord | null>(null);

  // GitHub Real-time Update System State
  const [updateRelease, setUpdateRelease] = useState<ReleaseInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [updateSource, setUpdateSource] = useState<'github-live' | 'error'>('error');
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | undefined>(undefined);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isDllDocsOpen, setIsDllDocsOpen] = useState<boolean>(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState<boolean>(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState<boolean>(false);
  const [isParallelScanOpen, setIsParallelScanOpen] = useState<boolean>(false);
  const [isTrayGuardianOpen, setIsTrayGuardianOpen] = useState<boolean>(false);
  const [isBitCarvingOpen, setIsBitCarvingOpen] = useState<boolean>(false);
  const [bitCarvingTargetLba, setBitCarvingTargetLba] = useState<number>(0);
  const [isHexInspectorOpen, setIsHexInspectorOpen] = useState<boolean>(false);
  const [hexInspectorTargetLba, setHexInspectorTargetLba] = useState<number>(0);
  const [isBenchmarkProfilerOpen, setIsBenchmarkProfilerOpen] = useState<boolean>(false);
  const [isLbaClonerOpen, setIsLbaClonerOpen] = useState<boolean>(false);
  const [lbaClonerRange, setLbaClonerRange] = useState<{ startLba: number; endLba: number } | null>(null);
  const [isFileTracerOpen, setIsFileTracerOpen] = useState<boolean>(false);
  const [fileTracerTargetLba, setFileTracerTargetLba] = useState<number>(0);
  const [isSanitizeTrimOpen, setIsSanitizeTrimOpen] = useState<boolean>(false);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [optionsModalInitialTab, setOptionsModalInitialTab] = useState<OptionsModalSubTab>('general');
  const [customSmartThresholds, setCustomSmartThresholds] = useState<CustomSmartThresholdRule[]>(() =>
    loadCustomSmartThresholds()
  );
  const handleUpdateCustomSmartThresholds = useCallback((nextRules: CustomSmartThresholdRule[]) => {
    setCustomSmartThresholds(nextRules);
    saveCustomSmartThresholds(nextRules);
  }, []);
  const [isHelpGuideModalOpen, setIsHelpGuideModalOpen] = useState<boolean>(false);
  const [isSmartRemapOpen, setIsSmartRemapOpen] = useState<boolean>(false);
  const [smartRemapTargetLba, setSmartRemapTargetLba] = useState<number | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [resumableCheckpoint, setResumableCheckpoint] = useState<SurfaceScanCheckpoint | null>(null);
  const abortedTaskIdsRef = useRef<Set<string>>(new Set());

  // Persistent Background Watchdog Rules, SMART Baselines & Event Feed
  const [watchdogRules, setWatchdogRules] = useState<WatchdogRule[]>(() => loadWatchdogRules());
  const [watchdogBaselines, setWatchdogBaselines] = useState<Record<string, WatchdogBaselineSnapshot>>(() =>
    loadWatchdogBaselines()
  );
  const [watchdogEvents, setWatchdogEvents] = useState<WatchdogTriggerEvent[]>(() => loadWatchdogEvents());
  const watchdogRulesRef = useRef<WatchdogRule[]>(watchdogRules);
  watchdogRulesRef.current = watchdogRules;
  const watchdogBaselinesRef = useRef<Record<string, WatchdogBaselineSnapshot>>(watchdogBaselines);
  watchdogBaselinesRef.current = watchdogBaselines;

  const handleUpdateWatchdogRules = useCallback((nextRules: WatchdogRule[]) => {
    setWatchdogRules(nextRules);
    saveWatchdogRules(nextRules);
  }, []);

  const handleClearWatchdogEvents = useCallback(() => {
    setWatchdogEvents([]);
    saveWatchdogEvents([]);
  }, []);

  // Real-time Update Checker
  const checkUpdates = useCallback(async (manual = false) => {
    try {
      const result = await checkForGithubReleaseUpdate();
      setUpdateRelease(result.release);
      setHasUpdate(result.hasUpdate);
      setUpdateSource(result.source);
      setUpdateErrorMessage(result.errorMessage);
      if (manual || result.hasUpdate) {
        setIsUpdateModalOpen(true);
      }
    } catch {
      setUpdateSource('error');
      setUpdateErrorMessage('업데이트 서버 연결 중 오류가 발생했습니다.');
      if (manual) {
        setIsUpdateModalOpen(true);
      }
    }
  }, []);

  // Run update check on mount with automatic notification popup
  useEffect(() => {
    // Check GitHub releases after a short gentle delay on app load
    const timer = setTimeout(() => {
      checkUpdates(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [checkUpdates]);

  // Refs for multi-task execution loop
  const scanLoopRef = useRef<NodeJS.Timeout | null>(null);
  const timerLoopRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightDrivesRef = useRef<Set<string>>(new Set());
  const activeDriveRef = useRef<DiskDrive | undefined>(activeDrive);
  activeDriveRef.current = activeDrive;
  const drivesRef = useRef<DiskDrive[]>(drives);
  drivesRef.current = drives;
  const selectedMethodIdRef = useRef<SpecializedScanMethodId>(selectedMethodId);
  selectedMethodIdRef.current = selectedMethodId;
  const scanModeRef = useRef<'quick' | 'full'>(scanMode);
  scanModeRef.current = scanMode;

  // Derived counts (single-pass memoized)
  const { goodCount, normalCount, slowCount, criticalCount, badCount } = useMemo(() => {
    let good = 0;
    let normal = 0;
    let slow = 0;
    let critical = 0;
    let bad = 0;
    for (let i = 0; i < blocks.length; i++) {
      const s = blocks[i].status;
      if (s === 'good') good++;
      else if (s === 'normal') normal++;
      else if (s === 'slow') slow++;
      else if (s === 'critical') critical++;
      else if (s === 'bad') bad++;
    }
    return {
      goodCount: good,
      normalCount: normal,
      slowCount: slow,
      criticalCount: critical,
      badCount: bad
    };
  }, [blocks]);

  // Initialize blank blocks on drive change or capacity update
  useEffect(() => {
    if (!activeDrive) {
      setIdleBlocks([]);
      setSelectedBlock(null);
      lastInitializedDriveRef.current = null;
      return;
    }
    const last = lastInitializedDriveRef.current;
    const driveChanged = !last || last.id !== activeDrive.id;
    const capacityUpdatedWhileIdle =
      !activeTask &&
      last?.totalSectors !== activeDrive.totalSectors;

    if (driveChanged || capacityUpdatedWhileIdle) {
      initDriveBlocks(activeDrive);
    }
  }, [activeDrive, activeTask, initDriveBlocks]);

  // Real-time speed calculation
  const totalScanned = goodCount + normalCount + slowCount + criticalCount + badCount;
  const scannedPercentage = activeTask && activeTask.stepSequence.length > 0
    ? (activeTask.completedSteps / activeTask.stepSequence.length) * 100
    : blocks.length > 0
    ? (totalScanned / blocks.length) * 100
    : 0;
  const currentLba = activeTask
    ? activeTask.currentLba
    : blocks[0]?.lba || 0;

  const blocksPerSecond = elapsedSeconds > 0 ? totalScanned / elapsedSeconds : 0;
  const remainingSteps = activeTask
    ? Math.max(0, activeTask.stepSequence.length - activeTask.completedSteps)
    : Math.max(0, blocks.length - totalScanned);
  const remainingSeconds = blocksPerSecond > 0 ? Math.ceil(remainingSteps / blocksPerSecond) : 0;
  const scanSpeedMbPerSec = scanStatus === 'scanning' && activeTask ? activeTask.speedMbPerSec : 0;

  const telemetry: ScanTelemetry = {
    currentBlockIndex: activeBlockIndex >= 0 ? activeBlockIndex : 0,
    totalBlocks: blocks.length,
    currentLba,
    scannedPercentage,
    elapsedSeconds,
    remainingSeconds,
    scanSpeedBlocksPerSec: Number(blocksPerSecond.toFixed(1)),
    scanSpeedMbPerSec,
    goodCount,
    normalCount,
    slowCount,
    criticalCount,
    badCount,
    status: scanStatus,
    activeMethodId: activeTask?.methodId || selectedMethodId,
    activeMethodName: SCAN_METHOD_DEFINITIONS[activeTask?.methodId || selectedMethodId]?.nameKo
  };

  // Real-time Hardware Vitals (strictly nullable when sensors unavailable)
  const vitals = activeDrive ? calculateHardwareVitals(activeDrive, telemetry, scanSpeedMultiplier) : null;
  const currentTemp = vitals ? vitals.temperatureC : null;

  const notifiedOverheatRef = useRef<boolean>(false);

  // Real-time Overheat Warning Monitor (Threshold: 60°C, active only with real temp sensor)
  useEffect(() => {
    if (currentTemp !== null && currentTemp > 60) {
      if (!notifiedOverheatRef.current) {
        notifiedOverheatRef.current = true;
        soundManager.playWarningTone();

        const newLog: ErrorLogItem = {
          id: `overheat-log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
          blockIndex: activeBlockIndex >= 0 ? activeBlockIndex : 0,
          lba: currentLba,
          status: 'critical',
          latencyMs: 0,
          errorCode: 'OVERHEAT_ALERT',
          description: `🚨 [과열 경고] 현재 저장장치 내부 온도가 ${currentTemp.toFixed(1)}°C에 도달하여 안전 임계치(60.0°C)를 초과했습니다! 수명 단축 및 스로틀링 유발 위험이 있습니다.`,
          methodContext: 'Hardware Thermal Monitor'
        };
        setErrorLogs(prev => [newLog, ...prev]);

        dispatchNotification(
          '🔥 디스크 과열 위험 경고!',
          `현재 드라이브 온도가 안전 한계치인 60°C를 초과한 ${currentTemp.toFixed(1)}°C입니다. 즉각적인 조치 또는 쿨링을 권장합니다.`
        );
      }
    } else {
      notifiedOverheatRef.current = false;
    }
  }, [currentTemp, activeBlockIndex, currentLba, dispatchNotification]);

  useEffect(() => {
    if (currentTemp === null || currentTemp <= 60) {
      setIsOverheatDismissed(false);
    }
  }, [currentTemp]);

  // Dynamic health score calculation (null until hardware health or scan samples exist)
  const calculatedHealth: number | null = !activeDrive
    ? null
    : activeDrive.healthScore !== null
    ? Math.max(10, Math.round(activeDrive.healthScore - (badCount * 12) - (criticalCount * 2) - (slowCount * 0.4)))
    : totalScanned > 0
    ? Math.max(10, Math.round(100 - (badCount * 12) - (criticalCount * 2) - (slowCount * 0.4)))
    : null;

  // Sync Tauri v2 System Tray Tooltip & Close-to-Tray Preference
  useEffect(() => {
    if (!isTauriRuntime) return;
    const activeSummary = activeDrive
      ? `${activeDrive.model} (${calculatedHealth !== null ? `${calculatedHealth}%` : 'N/A'}, ${currentTemp !== null ? `${currentTemp.toFixed(0)}°C` : 'N/A'}, BAD:${badCount})`
      : 'No drive selected';
    const tooltip = `DiskSentinel Pro · ${drives.length} Drives · ${activeSummary}`;
    void invokeTauriSyncTrayState(tooltip, minimizeToTray);
  }, [isTauriRuntime, drives.length, activeDrive, calculatedHealth, currentTemp, badCount, minimizeToTray]);

  // Refresh resumable scan checkpoint whenever active drive changes
  useEffect(() => {
    if (!activeDrive) {
      setResumableCheckpoint(null);
      return;
    }
    setResumableCheckpoint(loadScanCheckpoint(activeDrive.id));
  }, [activeDrive?.id]);

  // Save resumable checkpoints on unload for running/paused tasks
  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const task of tasksRef.current) {
        if ((task.status === 'running' || task.status === 'paused') && task.completedSteps > 0) {
          saveScanCheckpoint(buildCheckpointFromTask(task));
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Poll OS Physical Drive Temperatures every 4s in Tauri Desktop runtime
  const handlePollTemperatures = useCallback(async () => {
    if (!isTauriRuntime) return;
    const knownIndices = drivesRef.current
      .filter(d => d.id.startsWith('drive-tauri-physical-'))
      .map(d => parseInt(d.id.replace('drive-tauri-physical-', ''), 10))
      .filter(n => Number.isFinite(n) && n >= 0);
    const readings = await queryTauriPollTemperatures(knownIndices.length > 0 ? knownIndices : undefined);
    if (readings.length === 0) return;

    const now = Date.now();
    const label = new Date(now).toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setDrives(prev => {
      let mutated = false;
      const next = prev.map(d => {
        if (!d.id.startsWith('drive-tauri-physical-')) return d;
        const idx = parseInt(d.id.replace('drive-tauri-physical-', ''), 10);
        const hit = readings.find(r => r.driveIndex === idx);
        if (!hit || hit.temperatureC === null || hit.temperatureC === d.temperatureC) return d;
        mutated = true;
        return {
          ...d,
          temperatureC: hit.temperatureC,
          hardwareSpecs:
            d.hardwareSpecs && d.hardwareSpecs.currentTempC == null
              ? { ...d.hardwareSpecs, currentTempC: hit.temperatureC }
              : d.hardwareSpecs
        };
      });
      return mutated ? next : prev;
    });

    setThermalHistoryByDrive(prev => {
      const next = { ...prev };
      for (const r of readings) {
        if (r.temperatureC === null) continue;
        const dId = `drive-tauri-physical-${r.driveIndex}`;
        const existing = next[dId] || [];
        next[dId] = [...existing.slice(-59), { timestamp: now, label, temperatureC: r.temperatureC }];
      }
      return next;
    });
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || !isThermalPolling) return;
    void handlePollTemperatures();
    const timer = setInterval(() => {
      void handlePollTemperatures();
    }, 4000);
    return () => clearInterval(timer);
  }, [isTauriRuntime, isThermalPolling, handlePollTemperatures]);

  // S.M.A.R.T. Self-Test Runner & Polling
  const handlePollSmartSelfTest = useCallback(async (targetDriveId?: string) => {
    const driveIdToPoll = targetDriveId || activeDriveRef.current?.id;
    if (!driveIdToPoll || !driveIdToPoll.startsWith('drive-tauri-physical-')) return;
    const driveIndex = parseInt(driveIdToPoll.replace('drive-tauri-physical-', ''), 10);
    const prevEntry = smartSelfTestByDrive[driveIdToPoll];
    const existingType = prevEntry?.testType || null;
    const status = await queryTauriSmartSelfTestStatus(driveIndex, driveIdToPoll, existingType);
    setSmartSelfTestByDrive(prev => ({
      ...prev,
      [driveIdToPoll]: status
    }));
    if (
      prevEntry?.status === 'running' &&
      (status.status === 'completed' || status.status === 'aborted')
    ) {
      setSmartLogRefreshSignal(prev => prev + 1);
    }
  }, [smartSelfTestByDrive]);

  const handleRunSmartSelfTest = useCallback(async (testType: SmartSelfTestType | 'abort') => {
    const target = activeDriveRef.current;
    if (!target || !target.id.startsWith('drive-tauri-physical-')) return;
    const driveIndex = parseInt(target.id.replace('drive-tauri-physical-', ''), 10);
    const res = await queryTauriRunSmartSelfTest(driveIndex, testType);

    setSmartSelfTestByDrive(prev => ({
      ...prev,
      [target.id]: {
        driveId: target.id,
        supported: res.supported,
        status: !res.supported ? 'unsupported' : testType === 'abort' ? 'aborted' : res.accepted ? 'running' : 'idle',
        testType: testType === 'abort' ? null : testType,
        progressPct: testType === 'abort' ? 0 : 5,
        executionCode: res.executionCode ?? null,
        statusText: res.statusText,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now()
      }
    }));

    if (res.accepted && testType !== 'abort') {
      void handlePollSmartSelfTest(target.id);
    }
  }, [handlePollSmartSelfTest]);

  useEffect(() => {
    const runningEntries = (Object.values(smartSelfTestByDrive) as SmartSelfTestState[]).filter(
      s => s.status === 'running'
    );
    if (runningEntries.length === 0) return;

    const timer = setInterval(() => {
      for (const entry of runningEntries) {
        void handlePollSmartSelfTest(entry.driveId);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [smartSelfTestByDrive, handlePollSmartSelfTest]);

  // Elapsed timer loop for all running tasks
  const hasRunningTask = tasks.some(t => t.status === 'running');
  useEffect(() => {
    if (!hasRunningTask) {
      if (timerLoopRef.current) {
        clearInterval(timerLoopRef.current);
        timerLoopRef.current = null;
      }
      return;
    }

    timerLoopRef.current = setInterval(() => {
      setTasks(prev =>
        prev.map(t => (t.status === 'running' ? { ...t, elapsedSeconds: t.elapsedSeconds + 1 } : t))
      );
    }, 1000);

    return () => {
      if (timerLoopRef.current) {
        clearInterval(timerLoopRef.current);
        timerLoopRef.current = null;
      }
    };
  }, [hasRunningTask]);

  // Promote queued tasks whenever no task is currently running for their driveId
  useEffect(() => {
    const hasPromotable = tasks.some(t => {
      if (t.status !== 'queued') return false;
      const busyDrive = tasks.some(other => other.driveId === t.driveId && other.status === 'running');
      return !busyDrive;
    });
    if (!hasPromotable) return;

    setTasks(prev => {
      const busyDrives = new Set(prev.filter(t => t.status === 'running').map(t => t.driveId));
      return prev.map(t => {
        if (t.status === 'queued' && !busyDrives.has(t.driveId)) {
          busyDrives.add(t.driveId);
          return { ...t, status: 'running' };
        }
        return t;
      });
    });
  }, [tasks]);

  // Multi-Task Concurrent Execution Loop (parallel across drives, strictly serialized per drive)
  useEffect(() => {
    if (!hasRunningTask) {
      if (scanLoopRef.current) {
        clearInterval(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      return;
    }

    const stepInterval = Math.max(4, Math.floor(30 / scanSpeedMultiplier));
    let isCancelled = false;

    const finalizeTask = async (finishedTask: DiagnosticTask) => {
      clearScanCheckpoint(finishedTask.driveId);
      if (activeDriveRef.current?.id === finishedTask.driveId) {
        setResumableCheckpoint(null);
      }
      soundManager.playCompletionChime();
      const badTotal = finishedTask.buckets.bad;
      dispatchNotification(
        `디스크 [${finishedTask.testType.toUpperCase()}] 검사 완료`,
        `${finishedTask.driveModel}: ${badTotal > 0 ? `⚠️ 배드섹터 ${badTotal}개 발견!` : '배드섹터 없음 (정상)'}`,
        badTotal > 0 ? 'critical' : 'info'
      );

      const finalDrives = await rescanAllDrives(drivesRef.current);
      if (isCancelled) return;
      setDrives(finalDrives);
      const finalDrive = finalDrives.find(d => d.id === finishedTask.driveId) || drivesRef.current.find(d => d.id === finishedTask.driveId);
      if (!finalDrive) return;

      const newRecord = createScanRecordFromSession(
        finalDrive,
        finishedTask.scanMode,
        finishedTask.blocks,
        finishedTask.elapsedSeconds,
        finishedTask.methodId
      );
      setScanRecords(prev => [newRecord, ...prev]);
      setCompletedSummaryRecord(newRecord);
    };

    scanLoopRef.current = setInterval(() => {
      if (isCancelled) return;
      const runningTasks = tasksRef.current.filter(t => t.status === 'running');

      for (const task of runningTasks) {
        if (inFlightDrivesRef.current.has(task.driveId)) continue;

        if (task.completedSteps >= task.stepSequence.length) {
          inFlightDrivesRef.current.add(task.driveId);
          setTasks(prev =>
            prev.map(t =>
              t.id === task.id && t.status === 'running'
                ? { ...t, status: 'completed', finishedAt: Date.now() }
                : t
            )
          );
          void finalizeTask(task).finally(() => {
            inFlightDrivesRef.current.delete(task.driveId);
          });
          continue;
        }

        const targetDrive = drivesRef.current.find(d => d.id === task.driveId);
        if (!targetDrive) {
          setTasks(prev =>
            prev.map(t => (t.id === task.id ? { ...t, status: 'aborted', finishedAt: Date.now() } : t))
          );
          continue;
        }

        const taskUsbPolicy = resolveUsbSurfaceScanPolicy(
          targetDrive,
          task.methodId,
          usbPolicyOverrides[targetDrive.id]
        );

        const batchSize =
          task.testType === 'erase'
            ? 1
            : targetDrive.id.startsWith('drive-tauri-physical-')
            ? taskUsbPolicy
              ? scanSpeedMultiplier >= 4
                ? Math.min(16, Math.max(2, taskUsbPolicy.batchSize * 2))
                : taskUsbPolicy.batchSize
              : scanSpeedMultiplier >= 4
              ? 16
              : 8
            : scanSpeedMultiplier >= 4
            ? 8
            : 4;
        const batchStartStep = task.completedSteps;
        const batchSteps = task.stepSequence.slice(
          batchStartStep,
          batchStartStep + batchSize
        );
        if (batchSteps.length === 0) continue;

        const batchIndices = batchSteps.map(s => s.blockIndex);
        inFlightDrivesRef.current.add(task.driveId);

        void (async () => {
          try {
            const batchResults = await executeHddScanBlockBatch(
              targetDrive,
              task.methodId,
              batchIndices,
              task.blocks.length,
              task.testType,
              taskUsbPolicy
            );

            if (isCancelled || abortedTaskIdsRef.current.has(task.id)) return;
            const latestTask = tasksRef.current.find(t => t.id === task.id);
            if (!latestTask || latestTask.status !== 'running' || latestTask.completedSteps !== batchStartStep) return;

            const unsafeResult = batchResults.find(r => r.errorCode === 'ERASE_BLOCKED_UNSAFE_TARGET');
            if (unsafeResult) {
              const targetBlockLba = latestTask.blocks[unsafeResult.blockIndex]?.lba ?? 0;
              soundManager.playBadSectorAlert();
              const guardLog: ErrorLogItem = {
                id: `erase-guard-${Date.now()}-${unsafeResult.blockIndex}`,
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                blockIndex: unsafeResult.blockIndex,
                lba: targetBlockLba,
                status: 'bad',
                latencyMs: -1,
                errorCode: unsafeResult.errorCode,
                description: `안전 가드 차단: [${targetDrive.model}]은 OS 시스템/부트 드라이브 보호 대상이거나 비Tauri 대상이므로 Erase 쓰기가 중단되었습니다.`,
                methodContext: 'Safe Erase Guard'
              };
              setErrorLogs(prev => [guardLog, ...prev.slice(0, 199)]);
              setTasks(prev =>
                prev.map(t => (t.id === task.id ? { ...t, status: 'aborted', finishedAt: Date.now() } : t))
              );
              return;
            }

            const timestampStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
            const nowMs = Date.now();
            const newLogs: ErrorLogItem[] = [];
            const repairedIndices: number[] = [];
            const repairedLatencies: Record<number, number> = {};
            let hasBadInBatch = false;
            let hasWarnInBatch = false;
            let lastBadLbaInBatch: number | null = null;

            const resolvedItems: Array<{
              idx: number;
              passSide: 'outer' | 'inner' | 'sequential';
              targetBlockLba: number;
              resolvedStatus: 'good' | 'normal' | 'slow' | 'critical' | 'bad';
              resolvedLatency: number;
              throughputMbSec: number;
              checksum?: string;
              resolvedErrorCode?: string;
              zoneTag?: typeof batchResults[number]['zoneTag'];
            }> = [];

            const count = Math.min(batchSteps.length, batchResults.length);
            for (let i = 0; i < count; i++) {
              const step = batchSteps[i];
              const probeResult = batchResults[i];
              const idx = step.blockIndex;
              const targetBlock = latestTask.blocks[idx];
              if (!targetBlock) continue;

              const targetBlockLba = targetBlock.lba;
              let resolvedStatus = probeResult.status;
              let resolvedLatency = probeResult.latencyMs;
              let resolvedErrorCode = probeResult.errorCode;

              if (resolvedStatus === 'bad' && isAutoRepairModeRef.current && task.testType !== 'erase') {
                const repairRes = await executeRealZeroFillRepairBlock(idx, targetBlockLba, targetDrive);
                if (!isCancelled && repairRes.success) {
                  resolvedStatus = 'good';
                  resolvedLatency = repairRes.latencyMs;
                  resolvedErrorCode = undefined;
                  repairedIndices.push(idx);
                  repairedLatencies[idx] = repairRes.latencyMs;
                }
              }

              if (resolvedStatus === 'bad') {
                hasBadInBatch = true;
                lastBadLbaInBatch = targetBlockLba;
                newLogs.push({
                  id: `log-${nowMs}-${idx}`,
                  timestamp: timestampStr,
                  blockIndex: idx,
                  lba: targetBlockLba,
                  status: 'bad',
                  latencyMs: -1,
                  errorCode: resolvedErrorCode || 'UNC',
                  description: `섹터 I/O 오류 [${task.testType.toUpperCase()}]: ${resolvedErrorCode || '판독/검증 실패'} (LBA #${targetBlockLba.toLocaleString()})`,
                  methodContext: `${task.testType.toUpperCase()} Engine`
                });
              } else if (resolvedStatus === 'critical' || resolvedStatus === 'slow') {
                hasWarnInBatch = true;
                newLogs.push({
                  id: `log-${nowMs}-${idx}`,
                  timestamp: timestampStr,
                  blockIndex: idx,
                  lba: targetBlockLba,
                  status: resolvedStatus,
                  latencyMs: resolvedLatency,
                  errorCode: resolvedErrorCode || 'LATENCY',
                  description: `응답 지연 감지 (${resolvedLatency}ms) - [${task.testType.toUpperCase()}]`,
                  methodContext: `${task.testType.toUpperCase()} Engine`
                });
              }

              resolvedItems.push({
                idx,
                passSide: step.passSide,
                targetBlockLba,
                resolvedStatus,
                resolvedLatency,
                throughputMbSec: probeResult.throughputMbSec,
                checksum: probeResult.checksum,
                resolvedErrorCode,
                zoneTag: probeResult.zoneTag
              });
            }

            if (isCancelled) return;
            if (repairedIndices.length > 0) {
              handleRepairSectors(targetDrive.id, repairedIndices, repairedLatencies);
            }
            if (hasBadInBatch) {
              soundManager.playBadSectorAlert();
              setAlertBannerVisible(true);
              if (lastBadLbaInBatch !== null) {
                setLatestBadLba(lastBadLbaInBatch);
              }
            } else if (hasWarnInBatch) {
              soundManager.playWarningTone();
            }
            if (newLogs.length > 0) {
              setErrorLogs(prev => [...newLogs.reverse(), ...prev].slice(0, 200));
            }

            if (resolvedItems.length > 0) {
              setTasks(prev =>
                prev.map(t => {
                  if (t.id !== task.id || t.status !== 'running' || t.completedSteps !== batchStartStep) return t;
                  const nextBlocks = [...t.blocks];
                  const nextBuckets = { ...t.buckets };
                  const baseSeq = t.completedSteps;
                  const appendedTrace = resolvedItems.map((item, offset) => {
                    nextBlocks[item.idx] = {
                      ...nextBlocks[item.idx],
                      status: item.resolvedStatus,
                      responseTimeMs: item.resolvedLatency,
                      throughputMbSec: item.throughputMbSec,
                      checksum: item.checksum,
                      errorCode: item.resolvedErrorCode,
                      zoneTag: item.zoneTag,
                      timestamp: nowMs
                    };
                    const finalBucket = classifyResponseBucket(item.resolvedStatus, item.resolvedLatency);
                    nextBuckets[finalBucket] = nextBuckets[finalBucket] + 1;
                    return {
                      seqIndex: baseSeq + offset,
                      blockId: item.idx,
                      lba: item.targetBlockLba,
                      latencyMs: item.resolvedLatency,
                      throughputMbSec: item.throughputMbSec,
                      status: item.resolvedStatus,
                      passSide: item.passSide
                    };
                  });
                  const lastItem = resolvedItems[resolvedItems.length - 1];
                  const updatedTask: DiagnosticTask = {
                    ...t,
                    blocks: nextBlocks,
                    buckets: nextBuckets,
                    lbaTrace: [...t.lbaTrace, ...appendedTrace],
                    completedSteps: t.completedSteps + resolvedItems.length,
                    currentBlockIndex: lastItem.idx,
                    currentLba: lastItem.targetBlockLba,
                    speedMbPerSec: lastItem.throughputMbSec > 0 ? lastItem.throughputMbSec : t.speedMbPerSec
                  };
                  if (updatedTask.completedSteps % 15 < resolvedItems.length) {
                    saveScanCheckpoint(buildCheckpointFromTask(updatedTask));
                  }
                  return updatedTask;
                })
              );
            }
          } finally {
            inFlightDrivesRef.current.delete(task.driveId);
          }
        })();
      }
    }, stepInterval);

    return () => {
      isCancelled = true;
      if (scanLoopRef.current) {
        clearInterval(scanLoopRef.current);
        scanLoopRef.current = null;
      }
    };
  }, [hasRunningTask, scanSpeedMultiplier, dispatchNotification, handleRepairSectors]);

  // Task & Scan Controls
  const createAndEnqueueTask = useCallback(
    (
      startImmediately = true,
      forcedTestType?: SurfaceTestType,
      options?: { overrideDriveId?: string; overrideScanMode?: 'quick' | 'full' }
    ) => {
      const targetDrive = options?.overrideDriveId
        ? drivesRef.current.find(d => d.id === options.overrideDriveId)
        : activeDriveRef.current;
      if (!targetDrive) return;
      const testTypeToRun = forcedTestType || selectedTestType;
      const modeToRun = options?.overrideScanMode || scanMode;

      if (testTypeToRun === 'erase') {
        const guard = isSafeEraseTarget(targetDrive);
        if (!guard.allowed) {
          const warnLog: ErrorLogItem = {
            id: `erase-blocked-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
            blockIndex: 0,
            lba: 0,
            status: 'bad',
            latencyMs: -1,
            errorCode: 'ERASE_SAFETY_GUARD',
            description: guard.reason || '안전 가드: 물리 드라이브에는 Erase 작업을 시작할 수 없습니다.',
            methodContext: 'Safe Erase Guard'
          };
          setErrorLogs(prev => [warnLog, ...prev]);
          return;
        }
      }

      const { blocks: initialBlocks } = generateBlocksForDrive(targetDrive, TOTAL_SCAN_BLOCKS);
      const totalB = initialBlocks.length;
      const clampedStartPct = Math.max(0, Math.min(95, rangeStartPct));
      const clampedEndPct = Math.max(clampedStartPct + 1, Math.min(100, rangeEndPct));
      const startBlock = Math.floor((clampedStartPct / 100) * (totalB - 1));
      const endBlock = Math.max(startBlock, Math.floor((clampedEndPct / 100) * (totalB - 1)));

      const stepSequence = buildScanBlockSequence(totalB, startBlock, endBlock, modeToRun, testTypeToRun);
      const safeGuard = testTypeToRun === 'erase' ? isSafeEraseTarget(targetDrive) : undefined;

      const driveBusy = tasksRef.current.some(t => t.driveId === targetDrive.id && t.status === 'running');
      const initialStatus: DiagnosticTask['status'] =
        startImmediately && !driveBusy ? 'running' : 'queued';

      const newTask: DiagnosticTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        driveId: targetDrive.id,
        driveModel: targetDrive.model,
        driveType: targetDrive.type,
        testType: testTypeToRun,
        scanMode: modeToRun,
        methodId: options?.overrideDriveId ? getDefaultMethodForDrive(targetDrive) : selectedMethodId,
        status: initialStatus,
        startBlock,
        endBlock,
        stepSequence,
        completedSteps: 0,
        currentBlockIndex: stepSequence[0]?.blockIndex ?? 0,
        currentLba: initialBlocks[stepSequence[0]?.blockIndex ?? 0]?.lba ?? 0,
        speedMultiplier: scanSpeedMultiplier,
        speedMbPerSec: 0,
        elapsedSeconds: 0,
        buckets: createEmptyResponseBuckets(),
        blocks: initialBlocks,
        lbaTrace: [],
        eraseTargetLabel: safeGuard?.targetLabel,
        createdAt: Date.now()
      };

      if (!options?.overrideDriveId || options.overrideDriveId === activeDriveRef.current?.id) {
        emittedDegradationKeysRef.current.clear();
        setActiveBucketFilter(null);
        setActiveTaskId(newTask.id);
      }
      setTasks(prev => [newTask, ...prev]);
    },
    [selectedTestType, rangeStartPct, rangeEndPct, scanMode, selectedMethodId, scanSpeedMultiplier]
  );

  // Background Anomaly Watchdog Evaluation & Scheduled Quick Scan Dispatcher
  const runWatchdogEvaluation = useCallback(() => {
    const currentDrives = drivesRef.current;
    if (currentDrives.length === 0) return;

    const evalRes = evaluateWatchdogRules(
      currentDrives,
      watchdogRulesRef.current,
      watchdogBaselinesRef.current,
      Date.now()
    );

    if (evalRes.baselinesChanged) {
      setWatchdogBaselines(evalRes.updatedBaselines);
      saveWatchdogBaselines(evalRes.updatedBaselines);
    }

    if (evalRes.rulesChanged) {
      setWatchdogRules(evalRes.updatedRules);
      saveWatchdogRules(evalRes.updatedRules);
    }

    if (evalRes.triggeredEvents.length > 0) {
      setWatchdogEvents(prev => {
        const next = [...evalRes.triggeredEvents, ...prev].slice(0, 100);
        saveWatchdogEvents(next);
        return next;
      });

      const alertLogs: ErrorLogItem[] = evalRes.triggeredEvents.map(ev => ({
        id: `log-${ev.id}`,
        timestamp: new Date(ev.triggeredAt).toLocaleTimeString('ko-KR', { hour12: false }),
        blockIndex: 0,
        lba: 0,
        status: ev.severity === 'critical' ? 'critical' : 'slow',
        latencyMs: 0,
        errorCode: `WATCHDOG_${ev.metric.toUpperCase()}`,
        description: ev.message,
        methodContext: `Watchdog (${ev.ruleName})`
      }));
      setErrorLogs(prev => [...alertLogs, ...prev]);

      const hasCritical = evalRes.triggeredEvents.some(e => e.severity === 'critical');
      if (hasCritical) {
        soundManager.playWarningTone();
      }

      const first = evalRes.triggeredEvents[0];
      dispatchNotification(`🛡️ 가디언 워치독: ${first.ruleName}`, first.message);
    }

    for (const targetDriveId of evalRes.quickScanTargetDriveIds) {
      createAndEnqueueTask(true, 'verify', {
        overrideDriveId: targetDriveId,
        overrideScanMode: 'quick'
      });
    }
  }, [createAndEnqueueTask, dispatchNotification]);

  const hasDrivesForWatchdog = drives.length > 0;
  useEffect(() => {
    if (!hasDrivesForWatchdog) return;
    runWatchdogEvaluation();
    const interval = setInterval(runWatchdogEvaluation, 60_000);
    return () => clearInterval(interval);
  }, [hasDrivesForWatchdog, runWatchdogEvaluation]);

  const handleBenchmarkComplete = useCallback(
    (driveId: string, specsPatch: Partial<DiskHardwareSpecs>) => {
      setDrives(prev =>
        prev.map(d =>
          d.id === driveId && d.hardwareSpecs
            ? {
                ...d,
                hardwareSpecs: {
                  ...d.hardwareSpecs,
                  ...specsPatch
                }
              }
            : d
        )
      );
    },
    []
  );

  const handlePauseTask = useCallback((taskId: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id === taskId && t.status === 'running') {
          const paused = { ...t, status: 'paused' as const };
          if (paused.completedSteps > 0) {
            const cp = buildCheckpointFromTask(paused);
            saveScanCheckpoint(cp);
            if (activeDriveRef.current?.id === paused.driveId) {
              setResumableCheckpoint(cp);
            }
          }
          return paused;
        }
        return t;
      })
    );
  }, []);

  const handleResumeTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === taskId);
      if (!target) return prev;
      const driveBusy = prev.some(t => t.id !== taskId && t.driveId === target.driveId && t.status === 'running');
      return prev.map(t =>
        t.id === taskId ? { ...t, status: driveBusy ? 'queued' : 'running' } : t
      );
    });
  }, []);

  const handleStopTask = useCallback((taskId: string) => {
    abortedTaskIdsRef.current.add(taskId);
    const target = tasksRef.current.find(t => t.id === taskId);
    if (target) {
      clearScanCheckpoint(target.driveId);
      if (activeDriveRef.current?.id === target.driveId) {
        setResumableCheckpoint(null);
      }
    }
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId && (t.status === 'running' || t.status === 'paused' || t.status === 'queued')
          ? { ...t, status: 'aborted', finishedAt: Date.now() }
          : t
      )
    );
  }, []);

  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (activeTaskIdRef.current === taskId) {
      setActiveTaskId(null);
    }
  }, []);

  const handleClearFinishedTasks = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'aborted'));
  }, []);

  const handleStartScan = () => {
    if (activeTask && activeTask.status === 'paused') {
      handleResumeTask(activeTask.id);
      return;
    }
    createAndEnqueueTask(true);
  };

  const handlePauseScan = () => {
    if (activeTask) handlePauseTask(activeTask.id);
  };

  const handleResumeScan = () => {
    if (activeTask) handleResumeTask(activeTask.id);
  };

  const handleStopScan = () => {
    if (activeTask) handleStopTask(activeTask.id);
  };

  const handleResumeFromCheckpoint = useCallback(() => {
    if (!activeDrive || !resumableCheckpoint) return;
    const restoredTask = restoreTaskFromCheckpoint(activeDrive, resumableCheckpoint, scanSpeedMultiplier, true);
    setSelectedMethodId(restoredTask.methodId);
    setSelectedTestType(restoredTask.testType);
    setScanMode(restoredTask.scanMode);
    setRangeStartPct(Math.round((restoredTask.startBlock / Math.max(1, restoredTask.blocks.length - 1)) * 100));
    setRangeEndPct(Math.round((restoredTask.endBlock / Math.max(1, restoredTask.blocks.length - 1)) * 100));
    setActiveTaskId(restoredTask.id);
    setResumableCheckpoint(null);
    setTasks(prev => [restoredTask, ...prev.filter(t => t.driveId !== activeDrive.id || t.status === 'completed')]);
  }, [activeDrive, resumableCheckpoint]);

  const handleDiscardCheckpoint = useCallback(() => {
    if (!activeDrive) return;
    clearScanCheckpoint(activeDrive.id);
    setResumableCheckpoint(null);
  }, [activeDrive]);

  const handleResetScan = () => {
    const driveIdToReset = activeDrive?.id;
    const taskToResetId = activeTask?.id;
    if (activeTask && (activeTask.status === 'running' || activeTask.status === 'paused' || activeTask.status === 'queued')) {
      handleStopTask(activeTask.id);
    }
    if (driveIdToReset) {
      clearScanCheckpoint(driveIdToReset);
      setResumableCheckpoint(null);
      setTasks(prev =>
        prev.filter(
          t =>
            !(
              t.driveId === driveIdToReset &&
              (t.id === taskToResetId || t.status === 'aborted' || t.status === 'completed' || t.status === 'paused')
            )
        )
      );
    }
    setActiveTaskId(null);
    setActiveBucketFilter(null);
    setQueuedRepairBlockIds([]);
    setLatestBadLba(undefined);
    emittedDegradationKeysRef.current.clear();
    if (activeDrive) {
      initDriveBlocks(activeDrive);
    } else {
      setIdleBlocks([]);
    }
    setErrorLogs([]);
    setAlertBannerVisible(false);
  };

  const handleDriveChange = (driveId: string) => {
    setSelectedDriveId(driveId);
    setQueuedRepairBlockIds([]);
    const nextDrive = drives.find(d => d.id === driveId) || drives[0];
    if (nextDrive) {
      setSelectedMethodId(getDefaultMethodForDrive(nextDrive));
    }
    const existingTaskForDrive =
      tasks.find(t => t.driveId === driveId && t.status === 'running') ||
      tasks.find(t => t.driveId === driveId);
    setActiveTaskId(existingTaskForDrive ? existingTaskForDrive.id : null);
    setActiveBucketFilter(null);
  };

  const handleSelectBucket = useCallback(
    (bucket: BucketKey | null) => {
      setActiveBucketFilter(bucket);
      if (!bucket) return;
      const match = blocksRef.current.find(b => {
        if (b.status === 'unscanned') return false;
        return classifyResponseBucket(b.status, b.responseTimeMs) === bucket;
      });
      if (match) {
        setSelectedBlock(match);
      }
    },
    []
  );

  // Open Current Live Diagnostic Report
  const handleOpenCurrentReport = () => {
    if (!activeDrive) return;
    const record = createScanRecordFromSession(activeDrive, scanMode, blocks, elapsedSeconds, selectedMethodId);
    setActiveReportRecord(record);
  };

  // Open Export Modal (CSV / PDF / Print / JSON)
  const handleOpenExportModal = (record?: SavedScanRecord) => {
    if (record) {
      setExportTargetRecord(record);
    } else {
      if (!activeDrive) return;
      const current = createScanRecordFromSession(activeDrive, scanMode, blocks, elapsedSeconds, selectedMethodId);
      setExportTargetRecord(current);
    }
  };

  const shortcutHandlersRef = useRef({
    handleStartScan,
    handlePauseScan,
    handleResumeScan,
    handleResetScan
  });
  shortcutHandlersRef.current = {
    handleStartScan,
    handlePauseScan,
    handleResumeScan,
    handleResetScan
  };

  // Native Desktop Keyboard Shortcuts Handler
  useEffect(() => {
    const handleDesktopKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // F1: Help Guide
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpGuideModalOpen(prev => !prev);
        return;
      }

      // F5: Hardware Rescan
      if (e.key === 'F5') {
        e.preventDefault();
        void handleRescanDrives();
        return;
      }

      // Ctrl + K / Cmd + K : Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      if (e.key === 'Escape' && isCommandPaletteOpen) {
        e.preventDefault();
        setIsCommandPaletteOpen(false);
        return;
      }

      // Ctrl + , : Options Modal
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsOptionsModalOpen(prev => !prev);
        return;
      }

      // Space: Start/Pause Scan
      if (e.code === 'Space') {
        e.preventDefault();
        if (!activeDriveRef.current) return;
        if (scanStatus === 'scanning') {
          shortcutHandlersRef.current.handlePauseScan();
        } else if (scanStatus === 'paused') {
          shortcutHandlersRef.current.handleResumeScan();
        } else {
          shortcutHandlersRef.current.handleStartScan();
        }
        return;
      }

      // R: Reset
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!activeDriveRef.current) return;
        shortcutHandlersRef.current.handleResetScan();
        return;
      }

      // 1 ~ 7: Tab Switching
      if (e.key === '1') setActiveTab('scan');
      if (e.key === '2') setActiveTab('logs');
      if (e.key === '3') setActiveTab('health');
      if (e.key === '4') setActiveTab('smart');
      if (e.key === '5') setActiveTab('history');
      if (e.key === '6') setActiveTab('fleet');
      if (e.key === '7') setActiveTab('integrity');
    };

    window.addEventListener('keydown', handleDesktopKeyDown);
    return () => window.removeEventListener('keydown', handleDesktopKeyDown);
  }, [scanStatus, handleRescanDrives, isCommandPaletteOpen]);

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(() => {
    const en = locale === 'en';
    const actions: CommandPaletteAction[] = [
      { id: 'tab-scan', label: t(locale, 'tab.scan'), description: en ? 'Surface scan & LBA map' : '실시간 표면 검사 및 LBA 맵', category: 'navigation', shortcut: '1', keywords: ['surface', 'lba', 'verify', 'read'], execute: () => setActiveTab('scan') },
      { id: 'tab-logs', label: t(locale, 'tab.logs'), description: en ? 'Real-time error & delay stream' : '결함 및 지연 이벤트 로그', category: 'navigation', shortcut: '2', keywords: ['log', 'error', 'unc'], execute: () => setActiveTab('logs') },
      { id: 'tab-health', label: t(locale, 'tab.health'), description: en ? 'Health score & thermal chart' : '종합 건강도 및 발열 추이', category: 'navigation', shortcut: '3', keywords: ['temp', 'thermal', 'health'], execute: () => setActiveTab('health') },
      { id: 'tab-smart', label: t(locale, 'tab.smart'), description: en ? 'S.M.A.R.T. attributes & self-test' : 'S.M.A.R.T. 속성 및 자가진단', category: 'navigation', shortcut: '4', keywords: ['smart', 'attribute', 'nvme'], execute: () => setActiveTab('smart') },
      { id: 'tab-history', label: t(locale, 'tab.history'), description: en ? 'Scan history & SMART attribute diff' : '검사 기록 및 SMART 변화 대조', category: 'navigation', shortcut: '5', keywords: ['history', 'diff', 'compare'], execute: () => setActiveTab('history') },
      { id: 'tab-fleet', label: t(locale, 'tab.fleet'), description: en ? 'Multi-drive fleet dashboard & audit' : '전체 디스크 플릿 비교 대시보드', category: 'navigation', shortcut: '6', keywords: ['fleet', 'all', 'disks'], execute: () => setActiveTab('fleet') },
      { id: 'tab-integrity', label: t(locale, 'tab.integrity'), description: en ? 'Folder LBA mapping & SHA-256 bit-rot' : '중요 폴더 LBA 매핑 및 비트 부패 감시', category: 'navigation', shortcut: '7', keywords: ['integrity', 'sha256', 'bitrot', 'folder'], execute: () => setActiveTab('integrity') },
      { id: 'tool-hw', label: en ? 'Hardware Architecture & Link Speed' : '하드웨어 상세 스펙 및 링크 속도', category: 'tools', keywords: ['pcie', 'sata', 'controller', 'identify'], disabled: !activeDrive, execute: () => setIsHardwareDetailsOpen(true) },
      { id: 'tool-features', label: en ? 'ATA/NVMe Hardware Features (AAM/APM)' : 'ATA/NVMe 기능 제어 (AAM/APM)', category: 'tools', keywords: ['aam', 'apm', 'cache'], disabled: !activeDrive, execute: () => setIsFeaturesModalOpen(true) },
      { id: 'tool-hex', label: en ? 'Raw LBA Hex & MBR/GPT Inspector' : 'LBA 헥스 뷰어 & MBR/GPT 파티션', category: 'tools', keywords: ['hex', 'mbr', 'gpt', 'sector'], disabled: !activeDrive, execute: () => { setHexInspectorTargetLba(selectedBlock?.lba ?? 0); setIsHexInspectorOpen(true); } },
      { id: 'tool-bench', label: en ? 'LBA Zone I/O Benchmark Profiler' : '실측 스토리지 I/O 벤치마크 프로파일러', category: 'tools', keywords: ['benchmark', 'iops', 'throughput'], disabled: !activeDrive, execute: () => setIsBenchmarkProfilerOpen(true) },
      { id: 'tool-cloner', label: en ? 'ddrescue LBA Image Cloner' : 'ddrescue LBA 구간 안전 이미지 백업', category: 'tools', keywords: ['clone', 'ddrescue', 'backup'], disabled: !activeDrive, execute: () => { setLbaClonerRange(selectedBlock ? { startLba: selectedBlock.lba, endLba: selectedBlock.endLba } : null); setIsLbaClonerOpen(true); } },
      { id: 'tool-tracer', label: en ? 'Affected File Tracer (MFT/FAT)' : '손상 LBA 영향 파일 추적기', category: 'tools', keywords: ['file', 'mft', 'ntfs', 'tracer'], disabled: !activeDrive, execute: () => { setFileTracerTargetLba(selectedBlock?.lba ?? latestBadLba ?? 0); setIsFileTracerOpen(true); } },
      { id: 'tool-carving', label: en ? 'Bit Carving & ECC Recovery' : '비트 카빙 & ECC 패리티 수복', category: 'tools', keywords: ['carving', 'recovery', 'ecc'], disabled: !activeDrive, execute: () => { setBitCarvingTargetLba(latestBadLba ?? selectedBlock?.lba ?? 0); setIsBitCarvingOpen(true); } },
      { id: 'tool-remap', label: en ? 'S.M.A.R.T. Remap & Zero-Fill Repair' : 'S.M.A.R.T. 섹터 재매핑 & 제로필 수복', category: 'tools', keywords: ['remap', 'zerofill', 'repair'], disabled: !activeDrive, execute: () => setIsSmartRemapOpen(true) },
      { id: 'tool-sanitize', label: en ? 'NVMe/ATA Sanitize & TRIM' : 'NVMe/ATA 보안 삭제 & SSD TRIM', category: 'tools', keywords: ['trim', 'sanitize', 'erase'], disabled: !activeDrive, execute: () => setIsSanitizeTrimOpen(true) },
      { id: 'tool-usb', label: en ? 'External Storage & USB Scan Matrix' : '외장 장치 및 USB 표면검사 매트릭스', category: 'tools', keywords: ['usb', 'uasp', 'bot', 'external'], execute: () => openExternalDeviceModal('matrix') },
      { id: 'tool-parallel', label: en ? 'Parallel Multi-Drive Scanner' : '병렬 다중 드라이브 스캐너', category: 'tools', keywords: ['parallel', 'rayon', 'multi'], execute: () => setIsParallelScanOpen(true) },
      { id: 'tool-tray', label: en ? 'Background Watchdog & Tray Guardian' : '백그라운드 워치독 & 트레이 가디언', category: 'tools', keywords: ['watchdog', 'tray', 'alert'], execute: () => setIsTrayGuardianOpen(true) },
      { id: 'tool-vendor', label: en ? 'Vendor Specific Diagnostics' : '제조사 특화 펌웨어 진단', category: 'tools', keywords: ['vendor', 'samsung', 'wd'], disabled: !activeDrive, execute: () => setIsVendorModalOpen(true) },
      { id: 'tool-catalog', label: en ? 'Supported Hardware Catalog' : '지원 하드웨어 카탈로그', category: 'tools', keywords: ['catalog', 'hardware'], execute: () => setIsCatalogModalOpen(true) },
      { id: 'tool-dlldoc', label: en ? 'Native Core & DLL Technical Docs' : '네이티브 코어 & DLL 기술 명세', category: 'tools', keywords: ['dll', 'api', 'docs'], execute: () => setIsDllDocsOpen(true) },
      { id: 'act-rescan', label: en ? 'Rescan Physical Drives' : '물리 드라이브 전체 재검색', category: 'actions', shortcut: 'F5', keywords: ['rescan', 'refresh'], execute: () => { void handleRescanDrives(); } },
      { id: 'act-report', label: en ? 'Open Diagnostic Report' : '현재 세션 진단 보고서 열기', category: 'actions', keywords: ['report', 'pdf', 'print'], disabled: !activeDrive, execute: handleOpenCurrentReport },
      { id: 'act-export', label: en ? 'Export Results (CSV/JSON/PDF)' : '진단 결과 내보내기 (CSV/JSON/PDF)', category: 'actions', keywords: ['export', 'csv'], disabled: !activeDrive, execute: () => handleOpenExportModal() },
      { id: 'act-options', label: en ? 'Preferences & Thresholds' : '환경설정 및 SMART 임계치', category: 'actions', shortcut: 'Ctrl+,', keywords: ['options', 'settings', 'threshold'], execute: () => { setOptionsModalInitialTab('general'); setIsOptionsModalOpen(true); } },
      { id: 'act-theme', label: isDarkMode ? (en ? 'Switch to Light Mode' : '라이트 모드로 전환') : (en ? 'Switch to Dark Mode' : '다크 모드로 전환'), category: 'actions', keywords: ['theme', 'dark', 'light'], execute: () => setIsDarkMode(p => !p) },
      { id: 'act-locale', label: locale === 'ko' ? 'Switch UI Language to English (EN)' : '인터페이스 언어를 한국어(KO)로 전환', category: 'actions', keywords: ['language', 'english', 'korean'], execute: () => handleChangeLocale(locale === 'ko' ? 'en' : 'ko') }
    ];

    drives.forEach(d => {
      actions.push({
        id: `drive-${d.id}`,
        label: `${d.model} (${d.mountPoint || d.hardwareSpecs?.busType || d.type})`,
        description: `${d.capacityGb !== null ? `${d.capacityGb} GB` : 'N/A'} · ${d.healthScore !== null ? `${d.healthScore}%` : 'N/A'}`,
        category: 'drive',
        keywords: [d.model, d.serialNumber, d.type, d.mountPoint || ''],
        execute: () => handleDriveChange(d.id)
      });
    });

    return actions;
  }, [locale, activeDrive, drives, selectedBlock, latestBadLba, isDarkMode, handleRescanDrives, handleChangeLocale]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Navigation */}
      <Navbar
        drives={drives}
        selectedDriveId={selectedDriveId}
        onSelectDrive={handleDriveChange}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        notificationPermission={notificationPermission}
        notificationsEnabled={notificationsEnabled}
        onRequestNotification={handleRequestNotification}
        onToggleNotificationsEnabled={handleToggleNotificationsEnabled}
        currentHealthScore={calculatedHealth}
        badCount={badCount}
        hasUpdate={hasUpdate}
        latestVersion={updateRelease?.version}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        onOpenAboutModal={() => setIsAboutModalOpen(true)}
        onOpenDllDocs={() => setIsDllDocsOpen(true)}
        onOpenExternalDevicesModal={() => openExternalDeviceModal('connected')}
        onOpenVendorDiagnostics={() => { if (activeDrive) setIsVendorModalOpen(true); }}
        onOpenSupportedCatalog={() => setIsCatalogModalOpen(true)}
        onOpenParallelScanModal={() => setIsParallelScanOpen(true)}
        onOpenTrayGuardianModal={() => setIsTrayGuardianOpen(true)}
        onOpenBitCarvingModal={() => {
          if (!activeDrive) return;
          const badLba = latestBadLba ?? (blocks.find(b => b.status === 'bad')?.lba) ?? (blocks[0]?.lba ?? 0);
          setBitCarvingTargetLba(badLba);
          setIsBitCarvingOpen(true);
        }}
        onOpenHardwareDetails={() => { if (activeDrive) setIsHardwareDetailsOpen(true); }}
        onOpenFeaturesModal={() => { if (activeDrive) setIsFeaturesModalOpen(true); }}
        onOpenHexInspector={() => {
          if (!activeDrive) return;
          setHexInspectorTargetLba(selectedBlock?.lba ?? 0);
          setIsHexInspectorOpen(true);
        }}
        onOpenBenchmarkProfiler={() => { if (activeDrive) setIsBenchmarkProfilerOpen(true); }}
        onOpenLbaCloner={() => {
          if (!activeDrive) return;
          setLbaClonerRange(selectedBlock ? { startLba: selectedBlock.lba, endLba: selectedBlock.endLba } : null);
          setIsLbaClonerOpen(true);
        }}
        onOpenFileTracer={() => {
          if (!activeDrive) return;
          const targetLba = selectedBlock?.lba ?? latestBadLba ?? (blocks.find(b => b.status === 'bad')?.lba) ?? 0;
          setFileTracerTargetLba(targetLba);
          setIsFileTracerOpen(true);
        }}
        onOpenSanitizeTrim={() => { if (activeDrive) setIsSanitizeTrimOpen(true); }}
        onRescanDrives={handleRescanDrives}
        isRescanning={isRescanningDrives}
        onOpenOptionsModal={() => {
          setOptionsModalInitialTab('general');
          setIsOptionsModalOpen(true);
        }}
        onOpenHelpGuideModal={() => setIsHelpGuideModalOpen(true)}
        onExportResults={() => handleOpenExportModal()}
        onResetScan={handleResetScan}
        onOpenReport={handleOpenCurrentReport}
        isAutoRepairMode={isAutoRepairMode}
        onToggleAutoRepairMode={handleToggleAutoRepairMode}
        locale={locale}
        onChangeLocale={handleChangeLocale}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-4 py-2.5 sm:py-3">
        {/* Real-time Alert Banner when Bad Sectors are detected */}
        <AlertBanner
          badCount={badCount}
          latestBadLba={latestBadLba}
          visible={alertBannerVisible}
          onOpenReport={handleOpenCurrentReport}
          onDismiss={() => setAlertBannerVisible(false)}
          notificationPermission={notificationPermission}
          onRequestNotification={handleRequestNotification}
        />

        {/* Sleek In-Page Segmented Tab Navigation Bar (7 Modular Views) */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl mb-3 overflow-x-auto shadow-2xs">
          <button
            onClick={() => setActiveTab('scan')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'scan'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="실시간 표면 검사 및 블록 그리드 뷰어"
          >
            <Activity className="w-4 h-4" />
            <span>{t(locale, 'tab.scan')}</span>
            {telemetry.status === 'scanning' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="실시간 결함 감지 및 I/O 이벤트 로그 스트림"
          >
            <Terminal className="w-4 h-4" />
            <span>{t(locale, 'tab.logs')}</span>
            {badCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-red-600 text-white">
                {badCount} BAD
              </span>
            ) : errorLogs.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {errorLogs.length}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'health'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="종합 건강 점수, 응답 속도 분포 및 10분 온도 추이 차트"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{t(locale, 'tab.health')}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
              calculatedHealth === null
                ? 'bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                : calculatedHealth >= 80
                ? 'bg-emerald-500/20 text-emerald-500'
                : 'bg-red-500/20 text-red-500'
            }`}>
              {calculatedHealth !== null ? `${calculatedHealth}%` : 'N/A'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('smart')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'smart'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="S.M.A.R.T. 하드웨어 속성 원시 데이터 및 임계치 검증"
          >
            <HardDrive className="w-4 h-4" />
            <span>{t(locale, 'tab.smart')}</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="이전 검사와 최신 검사 간 대조 및 저장된 진단 이력"
          >
            <GitCompare className="w-4 h-4" />
            <span>{t(locale, 'tab.history')}</span>
            {scanRecords.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {scanRecords.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('fleet')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'fleet'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="연결된 모든 디스크 상태 비교 및 일괄 감사"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>{t(locale, 'tab.fleet')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {drives.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('integrity')}
            className={`min-h-[40px] flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'integrity'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="중요 폴더·파일 물리 LBA 매핑 및 SHA-256 비트 부패 감시"
          >
            <FolderLock className="w-4 h-4" />
            <span>{t(locale, 'tab.integrity')}</span>
          </button>
        </div>

        {/* Browser Empty State & Native Tauri / Local Bridge Launch Guide when no physical disk is attached */}
        {activeTab !== 'history' && activeTab !== 'fleet' && activeTab !== 'integrity' && !activeDrive && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-7 space-y-5">
            {isInitialProbing ? (
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-2.5">
                <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  물리 드라이브 확인 중...
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      연결된 물리 디스크 없음
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      실제 내·외장 디스크(<code className="font-mono text-slate-800 dark:text-slate-200">\\.\PhysicalDrive0~31</code>) 인식 및 Verify·Read·Butterfly·Erase 검사는 Tauri 데스크톱 앱에서 실행하세요.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void checkNativeEngineConnection()}
                      disabled={bridgeDiagnostics.checking}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${bridgeDiagnostics.checking ? 'animate-spin' : ''}`} />
                      <span>연결 재확인</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternalDeviceModal('connected')}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>장치 슬롯 보기</span>
                    </button>
                  </div>
                </div>

                {/* Live Runtime Connection Diagnostic Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                  <div className="p-3 space-y-0.5">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tauri 데스크톱 IPC</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {bridgeDiagnostics.tauriAvailable ? '연결됨' : '미감지'}
                    </div>
                  </div>
                  <div className="p-3 space-y-0.5">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">로컬 Win32 브릿지</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {bridgeDiagnostics.bridgeReachable ? '연결됨' : '미연결'}
                    </div>
                  </div>
                  <div className="p-3 space-y-0.5">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">확인 시각</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {bridgeDiagnostics.checkedAt
                        ? new Date(bridgeDiagnostics.checkedAt).toLocaleTimeString('ko-KR', { hour12: false })
                        : '-'}
                    </div>
                  </div>
                </div>

                {/* Concise Native Launch Instructions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      1. Tauri 데스크톱 앱 실행
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">DiskBadSectorScanner.exe</code>를 관리자 권한으로 실행하세요.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      2. 개발 환경 실행
                    </div>
                    <pre className="px-2.5 py-1.5 rounded bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                      npm run tauri:dev
                    </pre>
                  </div>
                </div>

                {scanRecords.length > 0 && (
                  <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      저장된 검사 기록 <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">{scanRecords.length}건</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      <span>기록 보기</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Tab 1: Live Surface Scan View — Compact Instrument Console */}
        {activeTab === 'scan' && activeDrive && (
          <div className="flex flex-col lg:flex-row gap-3 items-start">
            {/* Left Instrument Config & Queue Rail (~330px on lg+) */}
            <aside className="w-full lg:w-[330px] shrink-0 space-y-2.5">
              {/* Surface Test Configurator */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      표면 검사
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {activeDrive.hardwareSpecs?.busType || activeDrive.type}
                  </span>
                </div>

                {/* Target Internal / External Drive Quick Selector */}
                {(() => {
                  const stdClass = classifyFutureDriveStandards(activeDrive);
                  return (
                    <div className="space-y-1.5 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold uppercase tracking-wider">대상 디스크 ({drives.length}대)</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleRescanDrives()}
                            disabled={isRescanningDrives}
                            className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                            title="내·외장 물리 디스크(PhysicalDrive0~31) 재검색"
                          >
                            <RefreshCw className={`w-2.5 h-2.5 ${isRescanningDrives ? 'animate-spin' : ''}`} />
                            <span>재검색</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openExternalDeviceModal('connected')}
                            className="px-1.5 py-0.5 rounded border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-[10px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="외부 장치 & 32채널 탐색 진단 열기"
                          >
                            <Usb className="w-2.5 h-2.5" />
                            <span>외장</span>
                          </button>
                        </div>
                      </div>
                      <select
                        value={selectedDriveId}
                        onChange={e => handleDriveChange(e.target.value)}
                        aria-label="표면 검사 대상 디스크 선택"
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {drives.map(d => (
                          <option key={d.id} value={d.id}>
                            [{d.isExternal ? '외장' : '내장'} · {d.hardwareSpecs?.busType || d.type}] {d.model} ({d.capacityGb !== null ? `${d.capacityGb}GB` : 'N/A'})
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span className="truncate" title={stdClass.adaptiveNote}>
                          {stdClass.vendorDisplayName} · {stdClass.protocolStandard}
                        </span>
                        <span className="shrink-0 text-indigo-600 dark:text-indigo-400 font-semibold">
                          {stdClass.recognitionSource === 'Standard Protocol Classifier' ? '표준 추론' : '모델 인식'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 4-Mode HDDScan Surface Test Selector */}
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'verify', label: 'Verify', sub: 'IOCTL 검증' },
                      { id: 'read', label: 'Read', sub: '순차 읽기' },
                      { id: 'butterfly', label: 'Butterfly', sub: '외곽↔내곽 탐색' },
                      { id: 'erase', label: 'Erase', sub: '안전 쓰기 검증' }
                    ] as { id: SurfaceTestType; label: string; sub: string }[]
                  ).map(mode => {
                    const selected = selectedTestType === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSelectedTestType(mode.id)}
                        className={`text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="text-[11px] font-mono font-bold leading-tight">{mode.label}</div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400">{mode.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* LBA Start / End Range (%) */}
                <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>검사 LBA 구간 (%)</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRangeStartPct(0);
                          setRangeEndPct(100);
                        }}
                        className="px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeStartPct(0);
                          setRangeEndPct(25);
                        }}
                        className="px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        초반 25%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeStartPct(75);
                          setRangeEndPct(100);
                        }}
                        className="px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        후반 25%
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums">
                    <label className="flex items-center justify-between px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                      <span className="text-slate-500 text-[10px]">Start</span>
                      <input
                        type="number"
                        min={0}
                        max={95}
                        value={rangeStartPct}
                        onChange={e => setRangeStartPct(Math.max(0, Math.min(95, Number(e.target.value) || 0)))}
                        className="w-12 bg-transparent text-right font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center justify-between px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                      <span className="text-slate-500 text-[10px]">End</span>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={rangeEndPct}
                        onChange={e => setRangeEndPct(Math.max(5, Math.min(100, Number(e.target.value) || 100)))}
                        className="w-12 bg-transparent text-right font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>

                {/* Quick Scan Toggle (Every 10th Block Sampling) */}
                {(() => {
                  const isQuick = scanMode === 'quick';
                  const clampedStartPct = Math.max(0, Math.min(95, rangeStartPct));
                  const clampedEndPct = Math.max(clampedStartPct + 1, Math.min(100, rangeEndPct));
                  const startB = Math.floor((clampedStartPct / 100) * (TOTAL_SCAN_BLOCKS - 1));
                  const endB = Math.max(startB, Math.floor((clampedEndPct / 100) * (TOTAL_SCAN_BLOCKS - 1)));
                  const rangeBlockTotal = endB - startB + 1;
                  const targetBlockCount = isQuick
                    ? Math.floor((endB - startB) / 10) + 1
                    : rangeBlockTotal;

                  return (
                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isQuick}
                        aria-label="Quick Scan 토글 (매 10번째 블록 샘플링)"
                        onClick={() => setScanMode(prev => (prev === 'quick' ? 'full' : 'quick'))}
                        className={`w-full px-2.5 py-2 rounded border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isQuick
                            ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/45'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Zap className={`w-3.5 h-3.5 shrink-0 ${isQuick ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                            <span className={`text-[11px] font-bold ${isQuick ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                              Quick Scan
                            </span>
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                            {isQuick
                              ? `10블록 간격 (${targetBlockCount.toLocaleString()} / ${rangeBlockTotal.toLocaleString()})`
                              : `전체 블록 (${rangeBlockTotal.toLocaleString()})`}
                          </div>
                        </div>

                        <span
                          aria-hidden="true"
                          className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors ${
                            isQuick ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform ${
                              isQuick ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  );
                })()}

                {/* Safe Erase Guard Callout */}
                {selectedTestType === 'erase' && (() => {
                  const guard = isSafeEraseTarget(activeDrive);
                  return (
                    <div
                      className={`p-2 rounded border text-[10px] space-y-1 ${
                        guard.allowed
                          ? 'border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                          : 'border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between gap-1">
                        <span>{guard.allowed ? '쓰기 검증 가능' : '시스템 디스크 Erase 차단'}</span>
                        <span className="font-mono text-[9px] truncate max-w-[130px]">{guard.targetLabel}</span>
                      </div>
                      {!guard.allowed && (
                        <p className="leading-snug">{guard.reason}</p>
                      )}
                    </div>
                  );
                })()}

                {/* Enqueue / Start Action Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    disabled={selectedTestType === 'erase' && !isSafeEraseTarget(activeDrive).allowed}
                    onClick={() => createAndEnqueueTask(true)}
                    className="py-1.5 px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>즉시 실행</span>
                  </button>
                  <button
                    type="button"
                    disabled={selectedTestType === 'erase' && !isSafeEraseTarget(activeDrive).allowed}
                    onClick={() => createAndEnqueueTask(false)}
                    className="py-1.5 px-2.5 rounded border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Layers className="w-3 h-3" />
                    <span>큐에 추가</span>
                  </button>
                </div>
              </div>

              {/* Multi-Task Queue Manager */}
              <TaskManagerPanel
                tasks={tasks}
                activeTaskId={activeTask?.id || null}
                onSelectTask={taskId => {
                  const found = tasks.find(t => t.id === taskId);
                  setActiveTaskId(taskId);
                  if (found && found.driveId !== selectedDriveId) {
                    setSelectedDriveId(found.driveId);
                  }
                }}
                onPauseTask={handlePauseTask}
                onResumeTask={handleResumeTask}
                onStopTask={handleStopTask}
                onRemoveTask={handleRemoveTask}
                onClearFinished={handleClearFinishedTasks}
              />

              {/* Live Hardware Thermal Monitor */}
              <ThermalMonitorWidget
                drives={drives}
                activeDriveId={activeDrive.id}
                historyByDrive={thermalHistoryByDrive}
                isTauriRuntime={isTauriRuntime}
                isPollingEnabled={isThermalPolling}
                onTogglePolling={() => setIsThermalPolling(prev => !prev)}
                onPollNow={() => void handlePollTemperatures()}
              />
            </aside>

            {/* Right Main Telemetry & Map Stage */}
            <div className="flex-1 min-w-0 w-full space-y-2.5">
              {/* Storage Media Tailored Inspection Method Selector */}
              <ScanMethodSelector
                activeDrive={activeDrive}
                activeMethodId={selectedMethodId}
                onSelectMethod={setSelectedMethodId}
                isScanning={scanStatus === 'scanning'}
                blocks={blocks}
                onRepairSectors={handleRepairSectors}
                onOpenRemapModal={() => setIsSmartRemapOpen(true)}
                activeUsbPolicy={activeUsbPolicy}
                isUsbPolicyManual={Boolean(usbPolicyOverrides[activeDrive.id])}
                onOpenUsbMatrix={() => openExternalDeviceModal('matrix')}
              />

              {/* Top Telemetry & Control Center */}
              <TelemetryPanel
                drive={activeDrive}
                telemetry={telemetry}
                scanMode={scanMode}
                onChangeScanMode={setScanMode}
                scanSpeedMultiplier={scanSpeedMultiplier}
                onChangeSpeedMultiplier={setScanSpeedMultiplier}
                onStart={handleStartScan}
                onPause={handlePauseScan}
                onResume={handleResumeScan}
                onStop={handleStopScan}
                onReset={handleResetScan}
                onOpenReport={handleOpenCurrentReport}
                onExportResults={() => handleOpenExportModal()}
                activeUsbPolicy={activeUsbPolicy}
              />

              {/* Classic HDDScan 7-Bucket Latency Counter Bar */}
              <ResponseBucketsBar
                buckets={activeTask ? activeTask.buckets : createEmptyResponseBuckets()}
                activeBucket={activeBucketFilter}
                onSelectBucket={handleSelectBucket}
              />

              {/* Viewport Mode Bar */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-[11px]">
                <div className="flex items-center gap-2 font-mono text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {activeTask ? activeTask.testType.toUpperCase() : selectedTestType.toUpperCase()}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{rangeStartPct}~{rangeEndPct}%</span>
                  {activeBucketFilter && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                        {activeBucketFilter}
                      </span>
                    </>
                  )}
                </div>

                <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                  {(
                    [
                      { id: 'split', label: 'Graph + Map' },
                      { id: 'graph', label: 'LBA Graph' },
                      { id: 'map', label: 'Sector Map' }
                    ] as const
                  ).map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setScanViewMode(v.id)}
                      className={`px-2 py-0.5 text-[10px] font-semibold cursor-pointer ${
                        scanViewMode === v.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resumable Scan Checkpoint Banner */}
              {!activeTask && resumableCheckpoint && (
                <div className="p-3 rounded-lg border border-indigo-300 dark:border-indigo-700/70 bg-indigo-50/70 dark:bg-indigo-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t(locale, 'checkpoint.found')}</span>
                    </div>
                    <div className="text-[11px] font-mono text-indigo-700/80 dark:text-indigo-300/80 tabular-nums">
                      {resumableCheckpoint.testType.toUpperCase()} ({resumableCheckpoint.scanMode}) ·{' '}
                      {Math.round((resumableCheckpoint.completedSteps / Math.max(1, resumableCheckpoint.totalSteps)) * 100)}% ({resumableCheckpoint.completedSteps}/{resumableCheckpoint.totalSteps}) ·{' '}
                      {new Date(resumableCheckpoint.savedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleResumeFromCheckpoint}
                      className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                    >
                      {t(locale, 'checkpoint.resume')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardCheckpoint}
                      className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                    >
                      {t(locale, 'checkpoint.discard')}
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time LBA Latency / Throughput Oscilloscope */}
              {(scanViewMode === 'split' || scanViewMode === 'graph') && (
                <LbaGraphView
                  trace={activeTask ? activeTask.lbaTrace : []}
                  blocks={blocks}
                  testType={activeTask ? activeTask.testType : selectedTestType}
                  totalSectors={activeDrive.totalSectors || 0}
                  onSelectBlock={b => setSelectedBlock(b)}
                />
              )}

              {/* Interactive Sector Grid Visualizer */}
              {(scanViewMode === 'split' || scanViewMode === 'map') && (
                <SectorGrid
                  blocks={blocks}
                  activeBlockIndex={activeBlockIndex}
                  selectedBlock={selectedBlock}
                  onSelectBlock={b => setSelectedBlock(b)}
                  queuedRepairBlockIds={queuedRepairBlockIds}
                  onToggleQueueBlock={handleToggleRepairQueueBlock}
                  onBulkSelectRepairBlocks={handleBulkSelectRepairBlocks}
                  onClearRepairQueue={handleClearRepairQueue}
                  onOpenRemapWithQueue={() => {
                    setSmartRemapTargetLba(null);
                    setIsSmartRemapOpen(true);
                  }}
                  onTriggerBitCarving={lba => {
                    setBitCarvingTargetLba(lba);
                    setIsBitCarvingOpen(true);
                  }}
                  onOpenHexInspector={lba => {
                    setHexInspectorTargetLba(lba);
                    setIsHexInspectorOpen(true);
                  }}
                  onTraceLbaFile={lba => {
                    setFileTracerTargetLba(lba);
                    setIsFileTracerOpen(true);
                  }}
                  onCloneLbaRange={range => {
                    setLbaClonerRange(range);
                    setIsLbaClonerOpen(true);
                  }}
                  onOpenRemapForBlock={(blockId, lba) => {
                    setQueuedRepairBlockIds(prev => (prev.includes(blockId) ? prev : [...prev, blockId]));
                    setSmartRemapTargetLba(lba);
                    setIsSmartRemapOpen(true);
                  }}
                />
              )}

              {/* D3 Real-Time Read Speed & I/O Latency Histogram + Z-Score Predictive Analysis */}
              <LatencyHistogramDashboard
                blocks={blocks}
                drive={activeDrive}
                activeMethodId={selectedMethodId}
                scanMode={scanMode}
                isScanning={scanStatus === 'scanning'}
                onSelectBlock={b => setSelectedBlock(b)}
                onStartScan={handleStartScan}
                onOpenRemapModal={() => setIsSmartRemapOpen(true)}
                onDegradationWarning={handleDegradationWarning}
              />

              {/* Quick Summary Strip & Link to Error Logs */}
              <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2 flex-wrap font-mono tabular-nums">
                  <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">요약:</span>
                  <span className={`font-bold ${badCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {badCount} BAD
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-amber-500 font-bold">{slowCount + criticalCount} 지연</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-emerald-500 font-bold">{goodCount + normalCount} 정상</span>
                </div>
                <button
                  onClick={() => setActiveTab('logs')}
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 cursor-pointer transition-colors"
                >
                  <span>오류 로그 보기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Error Logs & Activity Stream View */}
        {activeTab === 'logs' && activeDrive && (
          <div className="space-y-3">
            <ErrorLogStream
              logs={errorLogs}
              onClearLogs={() => setErrorLogs([])}
              onSelectLogLba={(lba) => {
                const found = blocks.find(b => b.lba === lba);
                if (found) setSelectedBlock(found);
                setActiveTab('scan');
              }}
              onTraceLogLba={(lba) => {
                setFileTracerTargetLba(lba);
                setIsFileTracerOpen(true);
              }}
              onOpenHexLogLba={(lba) => {
                setHexInspectorTargetLba(lba);
                setIsHexInspectorOpen(true);
              }}
              onCloneLogLba={(lba) => {
                setLbaClonerRange({ startLba: lba, endLba: lba + 2048 });
                setIsLbaClonerOpen(true);
              }}
            />

            {/* Action Card when errors exist */}
            {badCount > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                    <span>배드섹터 {badCount}개 검출</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    제로필 수복 또는 비트 카빙 복구를 실행할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const badLba = latestBadLba ?? blocks.find(b => b.status === 'bad')?.lba ?? blocks[0]?.lba ?? 0;
                      setBitCarvingTargetLba(badLba);
                      setIsBitCarvingOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors cursor-pointer"
                  >
                    비트 카빙 수복
                  </button>
                  <button
                    onClick={() => setIsSmartRemapOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors cursor-pointer"
                  >
                    S.M.A.R.T. 제로필 재할당
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Health Summary & Temperature Trend Dashboard */}
        {activeTab === 'health' && activeDrive && (
          <HealthSummaryDashboard
            drive={activeDrive}
            telemetry={telemetry}
            calculatedHealth={calculatedHealth}
            blocks={blocks}
            activeMethodId={selectedMethodId}
            scanMode={scanMode}
            scanRecords={scanRecords}
            smartSnapshots={smartSnapshots}
            customSmartThresholds={customSmartThresholds}
            onRecordSmartSnapshot={handleRecordSmartSnapshot}
            onOpenThresholdSettings={() => {
              setOptionsModalInitialTab('smart_thresholds');
              setIsOptionsModalOpen(true);
            }}
            onSelectBlock={(b) => {
              setSelectedBlock(b);
              setActiveTab('scan');
            }}
            onStartScan={() => {
              setActiveTab('scan');
              handleStartScan();
            }}
            onRefreshSmart={() => {
              void handleRescanDrives();
            }}
            onOpenVendorModal={() => setIsVendorModalOpen(true)}
            onOpenRemapModal={() => setIsSmartRemapOpen(true)}
            onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
            viewMode="health_only"
          />
        )}

        {/* Tab 4: S.M.A.R.T. Attributes & Hardware Self-Test View */}
        {activeTab === 'smart' && activeDrive && (
          <div className="space-y-3">
            <HealthSummaryDashboard
              drive={activeDrive}
              telemetry={telemetry}
              calculatedHealth={calculatedHealth}
              scanRecords={scanRecords}
              smartSnapshots={smartSnapshots}
              customSmartThresholds={customSmartThresholds}
              onRecordSmartSnapshot={handleRecordSmartSnapshot}
              onOpenThresholdSettings={() => {
                setOptionsModalInitialTab('smart_thresholds');
                setIsOptionsModalOpen(true);
              }}
              onStartScan={() => {
                setActiveTab('scan');
                handleStartScan();
              }}
              onRefreshSmart={() => {
                void handleRescanDrives();
                setSmartLogRefreshSignal(prev => prev + 1);
              }}
              onOpenVendorModal={() => setIsVendorModalOpen(true)}
              onOpenRemapModal={() => setIsSmartRemapOpen(true)}
              onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
              onOpenFeaturesModal={() => setIsFeaturesModalOpen(true)}
              viewMode="smart_only"
              isTauriRuntime={isTauriRuntime}
              smartSelfTestState={smartSelfTestByDrive[activeDrive.id] || null}
              onRunSmartSelfTest={type => void handleRunSmartSelfTest(type)}
              onPollSmartSelfTest={() => void handlePollSmartSelfTest(activeDrive.id)}
              smartLogRefreshSignal={smartLogRefreshSignal}
            />
          </div>
        )}

        {/* Tab 5: History & Comparison Dashboard */}
        {activeTab === 'history' && (
          <HistoryAndComparison
            records={scanRecords}
            onDeleteRecord={(id) => {
              setScanRecords(prev => prev.filter(r => r.id !== id));
            }}
            onClearAll={() => {
              setScanRecords([]);
            }}
            onViewRecordReport={(record) => {
              setActiveReportRecord(record);
            }}
            onExportRecord={(record) => {
              handleOpenExportModal(record);
            }}
          />
        )}

        {/* Tab 6: Multi-Drive Fleet Overview Dashboard */}
        {activeTab === 'fleet' && (
          <Suspense fallback={null}>
            <FleetOverviewDashboard
              drives={drives}
              selectedDriveId={selectedDriveId}
              locale={locale}
              isRescanning={isRescanningDrives}
              onRescanDrives={handleRescanDrives}
              onSelectDriveForScan={(driveId) => {
                handleDriveChange(driveId);
                setActiveTab('scan');
              }}
              onOpenHardwareDetails={(driveId) => {
                handleDriveChange(driveId);
                setIsHardwareDetailsOpen(true);
              }}
              onOpenUsbMatrix={(driveId) => {
                handleDriveChange(driveId);
                openExternalDeviceModal('matrix');
              }}
              onBatchQuickAudit={(driveIds) => {
                driveIds.forEach(dId => {
                  createAndEnqueueTask(true, 'verify', { overrideDriveId: dId, overrideScanMode: 'quick' });
                });
                setActiveTab('scan');
              }}
              onOpenParallelScan={() => setIsParallelScanOpen(true)}
            />
          </Suspense>
        )}

        {/* Tab 7: Critical Folder LBA Mapping & SHA-256 Bit-Rot Integrity Watch */}
        {activeTab === 'integrity' && (
          <Suspense fallback={null}>
            <FolderLbaIntegrityPanel
              drives={drives}
              activeDrive={activeDrive}
              sectorBlocks={blocks}
              errorLogs={errorLogs}
              badLbaHistory={scanRecords.flatMap(r => r.badLbaList || [])}
              locale={locale}
              onNotifyIntegrityAlert={(title, body, severity) => dispatchNotification(title, body, severity)}
              onOpenHexInspector={(lba) => {
                setHexInspectorTargetLba(lba);
                setIsHexInspectorOpen(true);
              }}
              onOpenLbaCloner={(range) => {
                setLbaClonerRange(range);
                setIsLbaClonerOpen(true);
              }}
              onOpenFileTracer={(lba) => {
                setFileTracerTargetLba(lba);
                setIsFileTracerOpen(true);
              }}
            />
          </Suspense>
        )}
      </main>

      <Suspense fallback={null}>
      {/* Comprehensive Diagnostic Report Modal */}
      {activeReportRecord && (
        <ReportModal
          record={activeReportRecord}
          badBlocks={blocks.filter(b => b.status === 'bad')}
          onClose={() => setActiveReportRecord(null)}
        />
      )}

      {/* Scan Completion Summary Card Popup Modal */}
      {completedSummaryRecord && (
        <ScanCompletionSummaryModal
          isOpen={!!completedSummaryRecord}
          record={completedSummaryRecord}
          onClose={() => setCompletedSummaryRecord(null)}
          onOpenFullReport={(rec) => {
            setActiveReportRecord(rec);
          }}
          onOpenRepair={() => {
            setIsSmartRemapOpen(true);
          }}
        />
      )}

      {/* Export Diagnostic Results Modal (CSV / PDF / Print / JSON) */}
      {exportTargetRecord && (
        <ExportModal
          isOpen={!!exportTargetRecord}
          record={exportTargetRecord}
          badBlocks={blocks.filter(b => b.status === 'bad')}
          onClose={() => setExportTargetRecord(null)}
        />
      )}

      {/* GitHub Releases Real-time Update Alert Popup */}
      {isUpdateModalOpen && (
        <UpdateModal
          isOpen={isUpdateModalOpen}
          release={updateRelease}
          currentVersion={PROJECT_INFO.version}
          source={updateSource}
          errorMessage={updateErrorMessage}
          onClose={() => setIsUpdateModalOpen(false)}
          onCheckAgain={() => checkUpdates(true)}
        />
      )}

      {/* Creator & Official Channels Guide Modal */}
      {isAboutModalOpen && (
        <AboutModal
          isOpen={isAboutModalOpen}
          onClose={() => setIsAboutModalOpen(false)}
          onCheckUpdates={() => {
            setIsAboutModalOpen(false);
            setIsUpdateModalOpen(true);
          }}
        />
      )}

      {/* Pure Creative DLL Technical Documentation Modal */}
      {isDllDocsOpen && (
        <DllDocsModal
          isOpen={isDllDocsOpen}
          onClose={() => setIsDllDocsOpen(false)}
        />
      )}

      {/* External Storage Device Management Modal */}
      {isExternalModalOpen && (
        <ExternalDeviceModal
          isOpen={isExternalModalOpen}
          onClose={() => setIsExternalModalOpen(false)}
          drives={drives}
          selectedDriveId={selectedDriveId}
          onSelectDrive={handleDriveChange}
          onEjectDrive={handleEjectDrive}
          onRescanDrives={handleRescanDrives}
          initialTab={externalModalTab}
          usbPolicyOverrides={usbPolicyOverrides}
          onApplyUsbMatrixPolicy={handleApplyUsbMatrixPolicy}
        />
      )}

      {/* Vendor & Media Tailored Diagnostics Hub Modal */}
      {isVendorModalOpen && activeDrive && (
        <VendorDiagnosticsModal
          isOpen={isVendorModalOpen}
          onClose={() => setIsVendorModalOpen(false)}
          activeDrive={activeDrive}
          telemetry={telemetry}
          onOpenUsbModal={() => openExternalDeviceModal('connected')}
          onOpenCatalogModal={() => setIsCatalogModalOpen(true)}
          onOpenRemapModal={() => {
            setIsVendorModalOpen(false);
            setIsSmartRemapOpen(true);
          }}
          onRefreshSmart={() => {
            void handleRescanDrives();
          }}
        />
      )}

      {/* Supported Products & Manufacturers Precision Diagnostic Catalog Modal */}
      {isCatalogModalOpen && (
        <SupportedProductsCatalogModal
          isOpen={isCatalogModalOpen}
          onClose={() => setIsCatalogModalOpen(false)}
          onSelectVendorForDiagnostic={(vendor) => {
            setIsCatalogModalOpen(false);
            setIsVendorModalOpen(true);
          }}
        />
      )}

      {/* Rayon Multi-Drive Parallel Scanner Modal */}
      {isParallelScanOpen && (
        <ParallelDriveScanModal
          isOpen={isParallelScanOpen}
          onClose={() => setIsParallelScanOpen(false)}
          drives={drives}
        />
      )}

      {/* Background Telemetry Refresh for Tray Guardian & Dashboard */}
      <BackgroundTelemetryRefresher 
        drives={drives} 
        onUpdateDrives={setDrives} 
        isActive={isTrayGuardianOpen || activeTab === 'health' || activeTab === 'smart'} 
      />

      {/* System Tray Lightweight Guardian Daemon Modal */}
      {isTrayGuardianOpen && (
        <TrayGuardianModal
          isOpen={isTrayGuardianOpen}
          onClose={() => setIsTrayGuardianOpen(false)}
          drives={drives}
          highestTemp={currentTemp}
          hasBadSector={badCount > 0}
          onTriggerNotification={dispatchNotification}
          watchdogRules={watchdogRules}
          onUpdateWatchdogRules={handleUpdateWatchdogRules}
          watchdogEvents={watchdogEvents}
          onClearWatchdogEvents={handleClearWatchdogEvents}
          onRunWatchdogNow={runWatchdogEvaluation}
        />
      )}

      {/* Bit Carving & ECC Parity Recovery Engine Modal */}
      {isBitCarvingOpen && activeDrive && (
        <BitCarvingRecoveryModal
          isOpen={isBitCarvingOpen}
          onClose={() => setIsBitCarvingOpen(false)}
          initialLba={bitCarvingTargetLba}
          drive={activeDrive}
          driveModel={activeDrive.model}
        />
      )}

      {/* Advanced Disk Hardware Specification & Deep Diagnostics Modal */}
      {isHardwareDetailsOpen && activeDrive && (
        <DiskHardwareDetailsModal
          isOpen={isHardwareDetailsOpen}
          onClose={() => setIsHardwareDetailsOpen(false)}
          drive={activeDrive}
          onRescanHardware={handleRescanDrives}
          onOpenBenchmarkProfiler={() => setIsBenchmarkProfilerOpen(true)}
          onOpenHexInspector={(lba = 0) => {
            setHexInspectorTargetLba(lba);
            setIsHexInspectorOpen(true);
          }}
        />
      )}

      {/* ATA / NVMe Hardware Features Control Modal (AAM, APM, Standby, Cache) */}
      {isFeaturesModalOpen && activeDrive && (
        <DriveFeaturesModal
          isOpen={isFeaturesModalOpen}
          onClose={() => setIsFeaturesModalOpen(false)}
          drive={activeDrive}
          onOpenSanitizeTrim={() => setIsSanitizeTrimOpen(true)}
        />
      )}

      {/* Read-Only Raw Sector Hex Viewer & MBR/GPT Partition Table Modal */}
      {isHexInspectorOpen && activeDrive && (
        <SectorHexPartitionModal
          isOpen={isHexInspectorOpen}
          onClose={() => setIsHexInspectorOpen(false)}
          drive={activeDrive}
          initialLba={hexInspectorTargetLba}
        />
      )}

      {/* Live LBA I/O Zone Benchmark & 4K IOPS Profiler Modal */}
      {isBenchmarkProfilerOpen && activeDrive && (
        <DiskBenchmarkProfilerModal
          isOpen={isBenchmarkProfilerOpen}
          onClose={() => setIsBenchmarkProfilerOpen(false)}
          drive={activeDrive}
          onBenchmarkComplete={handleBenchmarkComplete}
        />
      )}

      {/* ddrescue-style Multi-Pass LBA Image Cloner & Bad Sector Recovery Modal */}
      {isLbaClonerOpen && activeDrive && (
        <LbaImageClonerModal
          isOpen={isLbaClonerOpen}
          onClose={() => setIsLbaClonerOpen(false)}
          drive={activeDrive}
          initialRange={lbaClonerRange}
        />
      )}

      {/* Damaged LBA Affected File Tracer (NTFS MFT / FAT32 / exFAT) Modal */}
      {isFileTracerOpen && activeDrive && (
        <LbaFileTracerModal
          isOpen={isFileTracerOpen}
          onClose={() => setIsFileTracerOpen(false)}
          drive={activeDrive}
          initialLba={fileTracerTargetLba}
          sectorBlocks={blocks}
          errorLogs={errorLogs}
          badLbaHistory={scanRecords
            .filter(r => r.driveId === activeDrive.id)
            .flatMap(r => r.badLbaList || [])}
          onOpenHexInspector={(lba) => {
            setIsFileTracerOpen(false);
            setHexInspectorTargetLba(lba);
            setIsHexInspectorOpen(true);
          }}
          onOpenLbaCloner={(range) => {
            setIsFileTracerOpen(false);
            setLbaClonerRange(range);
            setIsLbaClonerOpen(true);
          }}
          onRepairSectors={handleRepairSectors}
        />
      )}

      {/* NVMe/ATA Secure Erase (Sanitize/Format) & SSD TRIM Center Modal */}
      {isSanitizeTrimOpen && activeDrive && (
        <SanitizeTrimModal
          isOpen={isSanitizeTrimOpen}
          onClose={() => setIsSanitizeTrimOpen(false)}
          drive={activeDrive}
          onRefreshHardware={handleRescanDrives}
        />
      )}

      {/* S.M.A.R.T. Sector Remapping & Zero-Fill Repair Center Modal (Root level so accessible from all tabs) */}
      {isSmartRemapOpen && activeDrive && (
        <SmartRemapModal
          isOpen={isSmartRemapOpen}
          onClose={() => {
            setIsSmartRemapOpen(false);
            setSmartRemapTargetLba(null);
          }}
          activeDrive={activeDrive}
          blocks={blocks}
          initialQueuedBlockIds={queuedRepairBlockIds}
          initialTargetLba={smartRemapTargetLba}
          onSyncRepairQueue={setQueuedRepairBlockIds}
          onRepairSectors={handleRepairSectors}
        />
      )}

      {/* Program Options & Preferences Modal */}
      {isOptionsModalOpen && (
        <OptionsModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
          initialSubTab={optionsModalInitialTab}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          notificationPermission={notificationPermission}
          notificationsEnabled={notificationsEnabled}
          onRequestNotification={handleRequestNotification}
          onToggleNotificationsEnabled={handleToggleNotificationsEnabled}
          scanSpeedMultiplier={scanSpeedMultiplier}
          onChangeSpeedMultiplier={setScanSpeedMultiplier}
          isAutoRepairMode={isAutoRepairMode}
          onToggleAutoRepairMode={handleToggleAutoRepairMode}
          customSmartThresholds={customSmartThresholds}
          onUpdateCustomSmartThresholds={handleUpdateCustomSmartThresholds}
          activeDriveSmartAttributes={activeDrive?.smartAttributes || []}
          scanRecords={scanRecords}
          onImportMigration={handleImportMigration}
          locale={locale}
          onChangeLocale={handleChangeLocale}
          minimizeToTray={minimizeToTray}
          onToggleMinimizeToTray={() => setMinimizeToTray(p => !p)}
          nativeOsNotificationsEnabled={nativeOsNotificationsEnabled}
          onToggleNativeOsNotifications={() => setNativeOsNotificationsEnabled(p => !p)}
          onTestNativeOsNotification={() => {
            void invokeTauriNativeNotification(
              'DiskSentinel Pro Test Alert',
              locale === 'en'
                ? 'Native OS Watchdog notification channel is active.'
                : '네이티브 OS 워치독 알림 채널이 정상 작동 중입니다.',
              'info'
            );
          }}
        />
      )}

      {/* Global Ctrl+K Command Palette */}
      {isCommandPaletteOpen && (
        <CommandPaletteModal
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          actions={commandPaletteActions}
          locale={locale}
        />
      )}

      {/* Comprehensive Diagnostic & User Guide Modal */}
      {isHelpGuideModalOpen && (
        <HelpGuideModal
          isOpen={isHelpGuideModalOpen}
          onClose={() => setIsHelpGuideModalOpen(false)}
          onOpenVendorDiagnostics={() => setIsVendorModalOpen(true)}
          onOpenSupportedCatalog={() => setIsCatalogModalOpen(true)}
          onOpenDllDocs={() => setIsDllDocsOpen(true)}
          onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
          onOpenAboutModal={() => setIsAboutModalOpen(true)}
        />
      )}
      </Suspense>


      {/* Compact Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-2 bg-slate-100/60 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
            {PROJECT_INFO.appName} v{PROJECT_INFO.version}
          </span>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <a
              href={PROJECT_INFO.developer.githubProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-mono transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span>{PROJECT_INFO.developer.githubUsername}</span>
            </a>
            <a
              href={PROJECT_INFO.developer.blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 font-mono transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>Blog</span>
            </a>
            <a
              href={PROJECT_INFO.developer.affiliation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 font-mono transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-500" />
              <span>CISNet</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => checkUpdates(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>업데이트 확인</span>
            </button>
            <button
              onClick={() => setIsAboutModalOpen(true)}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              정보
            </button>
          </div>
        </div>
      </footer>

      {/* Bottom Status Bar */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 overflow-x-auto select-none">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              !activeDrive ? 'bg-amber-500' :
              scanStatus === 'scanning' ? 'bg-indigo-500 animate-ping' :
              scanStatus === 'paused' ? 'bg-amber-500' :
              scanStatus === 'completed' ? 'bg-emerald-500' :
              'bg-slate-400'
            }`} />
            <span className="font-semibold text-slate-700 dark:text-slate-200 font-sans">
              {
                !activeDrive ? 'Tauri IPC 대기' :
                scanStatus === 'scanning' ? `검사 중 (${scannedPercentage.toFixed(1)}%)` :
                scanStatus === 'paused' ? '일시 정지' :
                scanStatus === 'completed' ? '완료' :
                '대기'
              }
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="truncate max-w-[240px]">
            {activeDrive
              ? `${activeDrive.name} (${activeDrive.capacityGb !== null ? `${activeDrive.capacityGb} GB` : 'N/A'})`
              : '연결된 디스크 없음'}
          </span>

          {activeDrive && (
            <>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
              <span className="hidden sm:inline">LBA 0~{(activeDrive.totalSectors || 0).toLocaleString()}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden md:inline text-emerald-600 dark:text-emerald-400 font-semibold">
            {activeDrive?.hardwareSpecs?.probeMethod || 'Tauri IPC'}
          </span>
          <span className="text-slate-300 dark:text-slate-700 hidden md:inline">|</span>
          <span>건강: <strong className={calculatedHealth === null ? 'text-slate-400' : calculatedHealth >= 80 ? 'text-emerald-500' : 'text-red-500'}>{calculatedHealth !== null ? `${calculatedHealth}%` : 'N/A'}</strong></span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span>온도: <strong>{currentTemp !== null ? `${currentTemp.toFixed(0)}°C` : 'N/A'}</strong></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight background component that periodically polls physical hardware 
 * for fresh temperature and S.M.A.R.T. status.
 */
function BackgroundTelemetryRefresher({
  drives,
  onUpdateDrives,
  isActive
}: {
  drives: DiskDrive[];
  onUpdateDrives: React.Dispatch<React.SetStateAction<DiskDrive[]>>;
  isActive: boolean;
}) {
  const drivesRef = useRef<DiskDrive[]>(drives);
  drivesRef.current = drives;
  const hasDrives = drives.length > 0;

  useEffect(() => {
    if (!isActive || !hasDrives) return;

    const interval = setInterval(async () => {
      try {
        const snapshot = drivesRef.current;
        if (snapshot.length === 0) return;
        const updated = await rescanAllDrives(snapshot);
        if (updated.length === 0) return;

        onUpdateDrives(prev => {
          const prevById = new Map<string, DiskDrive>(prev.map(d => [d.id, d] as const));
          let hasChanged = updated.length !== prev.length;

          const merged = updated.map(nextDrive => {
            const existing = prevById.get(nextDrive.id);
            if (!existing) {
              hasChanged = true;
              return nextDrive;
            }
            const smartSig = (d: DiskDrive) =>
              d.smartAttributes.map(a => `${a.id}:${a.current}:${a.raw}`).join('|');

            if (
              existing.temperatureC !== nextDrive.temperatureC ||
              existing.healthScore !== nextDrive.healthScore ||
              existing.powerOnHours !== nextDrive.powerOnHours ||
              smartSig(existing) !== smartSig(nextDrive)
            ) {
              hasChanged = true;
            }

            return {
              ...nextDrive,
              hardwareSpecs: nextDrive.hardwareSpecs
                ? {
                    ...nextDrive.hardwareSpecs,
                    currentTempC:
                      existing.hardwareSpecs?.currentTempC ?? nextDrive.hardwareSpecs.currentTempC,
                    measuredKernelLatencyUs:
                      existing.hardwareSpecs?.measuredKernelLatencyUs ??
                      nextDrive.hardwareSpecs.measuredKernelLatencyUs,
                    measuredSequentialReadMbSec:
                      existing.hardwareSpecs?.measuredSequentialReadMbSec ??
                      nextDrive.hardwareSpecs.measuredSequentialReadMbSec,
                    measuredSequentialWriteMbSec:
                      existing.hardwareSpecs?.measuredSequentialWriteMbSec ??
                      nextDrive.hardwareSpecs.measuredSequentialWriteMbSec,
                    measuredRandom4kReadIops:
                      existing.hardwareSpecs?.measuredRandom4kReadIops ??
                      nextDrive.hardwareSpecs.measuredRandom4kReadIops
                  }
                : existing.hardwareSpecs
            };
          });

          return hasChanged ? merged : prev;
        });
      } catch {
        // Silent background error
      }
    }, 10000); // 10s polling

    return () => clearInterval(interval);
  }, [isActive, hasDrives, onUpdateDrives]);

  return null;
}

