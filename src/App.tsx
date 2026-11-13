import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  DiskDrive,
  SectorBlock,
  ScanTelemetry,
  ErrorLogItem,
  SavedScanRecord,
  SpecializedScanMethodId,
  MainAppTab,
  SurfaceTestType,
  DiagnosticTask,
  SmartSelfTestState,
  SmartSelfTestType,
  ThermalHistoryPoint
} from './types';
import { generateBlocksForDrive, TOTAL_SCAN_BLOCKS } from './utils/drivePresets';
import { soundManager } from './utils/audio';
import { createScanRecordFromSession } from './utils/reportGenerator';
import { Navbar } from './components/Navbar';
import { SectorGrid } from './components/SectorGrid';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ErrorLogStream } from './components/ErrorLogStream';
import { HealthSummaryDashboard } from './components/HealthSummaryDashboard';
import { HistoryAndComparison } from './components/HistoryAndComparison';
import { ReportModal } from './components/ReportModal';
import { ExportModal } from './components/ExportModal';
import { AlertBanner } from './components/AlertBanner';
import { UpdateModal } from './components/UpdateModal';
import { AboutModal } from './components/AboutModal';
import { DllDocsModal } from './components/DllDocsModal';
import { ExternalDeviceModal } from './components/ExternalDeviceModal';
import { VendorDiagnosticsModal } from './components/VendorDiagnosticsModal';
import { SupportedProductsCatalogModal } from './components/SupportedProductsCatalogModal';
import { ParallelDriveScanModal } from './components/ParallelDriveScanModal';
import { TrayGuardianModal } from './components/TrayGuardianModal';
import { BitCarvingRecoveryModal } from './components/BitCarvingRecoveryModal';
import { DiskHardwareDetailsModal } from './components/DiskHardwareDetailsModal';
import { ScanCompletionSummaryModal } from './components/ScanCompletionSummaryModal';
import { OptionsModal } from './components/OptionsModal';
import { HelpGuideModal } from './components/HelpGuideModal';
import { ScanMethodSelector } from './components/ScanMethodSelector';
import { SmartRemapModal } from './components/SmartRemapModal';
import { LatencyHistogramDashboard } from './components/LatencyHistogramDashboard';
import { ResponseBucketsBar, BucketKey } from './components/ResponseBucketsBar';
import { LbaGraphView } from './components/LbaGraphView';
import { TaskManagerPanel } from './components/TaskManagerPanel';
import { ThermalMonitorWidget } from './components/ThermalMonitorWidget';
import { checkForGithubReleaseUpdate } from './utils/updater';
import { PROJECT_INFO, ReleaseInfo } from './config/projectInfo';
import { SCAN_METHOD_DEFINITIONS, getDefaultMethodForDrive } from './utils/scanProfiles';
import {
  createNativeHostDrive,
  createNativeDriveFromFile,
  createNativeDriveFromDirectoryHandle,
  createNativeDriveFromFolderFiles,
  executeRealZeroFillRepairBlock,
  rescanAllDrives,
  isTauriDesktopRuntime,
  isNativeHardwareRuntime,
  detectNativeBridgeAvailable,
  createEmptyResponseBuckets,
  classifyResponseBucket,
  buildScanBlockSequence,
  isSafeEraseTarget,
  provisionSafeEraseTargetFile,
  executeHddScanBlockProbe,
  queryTauriRunSmartSelfTest,
  queryTauriSmartSelfTestStatus,
  queryTauriPollTemperatures
} from './utils/nativeDriveEngine';
import { calculateHardwareVitals } from './utils/hardwareTelemetry';
import { safeStorage } from './utils/safeStorage';
import { DiskSentinelMigrationBundle, mergeScanRecords } from './utils/dataMigration';
import { ContiguousDegradationZone, PredictiveFailureReport, analyzePredictiveFailure } from './utils/predictiveFailureAnalysis';
import {
  Github,
  BookOpen,
  Building2,
  Sparkles,
  ShieldCheck,
  Cpu,
  Usb,
  HardDrive,
  Activity,
  Terminal,
  GitCompare,
  ArrowRight,
  ShieldAlert,
  Play,
  Layers,
  FilePlus2,
  SlidersHorizontal
} from 'lucide-react';

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = safeStorage.getItem('disk_scanner_dark_mode');
    if (saved !== null) return saved === 'true';
    return true; // Default to dark mode for diagnostic monitors
  });

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

  const dispatchNotification = useCallback((title: string, body: string) => {
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

const INITIAL_PROBING_DRIVE: DiskDrive = {
  id: 'drive-native-host-real',
  name: '스토리지 장치 탐색 중...',
  model: 'Probing Host Storage Hardware...',
  serialNumber: 'PROBING',
  firmware: 'N/A',
  type: 'SSD',
  isExternal: false,
  connectionType: 'internal',
  capacityGb: null,
  totalSectors: 0,
  interface: 'OPFS / Win32 IOCTL Probing',
  healthScore: null,
  temperatureC: null,
  powerOnHours: null,
  mountPoint: '...',
  fileSystem: 'Unknown',
  smartAttributes: []
};

  // Drive Selection & Management
  const [drives, setDrives] = useState<DiskDrive[]>([INITIAL_PROBING_DRIVE]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>('drive-native-host-real');
  const [isExternalModalOpen, setIsExternalModalOpen] = useState<boolean>(false);
  const activeDrive = drives.find(d => d.id === selectedDriveId) || drives[0];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Probe Real Native OS Hardware Storage on Mount (All 32 PhysicalDrive channels)
  useEffect(() => {
    let mounted = true;
    rescanAllDrives([]).then(allDrives => {
      if (mounted && allDrives.length > 0) {
        setDrives(allDrives);
        setSelectedDriveId(allDrives[0].id);
        setSelectedMethodId(getDefaultMethodForDrive(allDrives[0]));
        if (isNativeHardwareRuntime() || allDrives.some(d => d.id.startsWith('drive-tauri-physical-'))) {
          setIsNativeRuntime(true);
          setIsThermalPolling(true);
        }
      }
    }).catch(() => {
      createNativeHostDrive().then(nativeDrive => {
        if (mounted) {
          setDrives(prev => {
            const nonHostDrives = prev.filter(d => d.id !== 'drive-native-host-real' && d.id !== nativeDrive.id);
            return [nativeDrive, ...nonHostDrives];
          });
          setSelectedDriveId(nativeDrive.id);
          setSelectedMethodId(getDefaultMethodForDrive(nativeDrive));
        }
      }).catch(() => {});
    });

    detectNativeBridgeAvailable().then(bridgeOk => {
      if (mounted && (bridgeOk || isTauriDesktopRuntime())) {
        setIsNativeRuntime(true);
        setIsThermalPolling(true);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const handlePickDirectoryVolume = async () => {
    // Check if running inside cross-origin iframe (e.g. AI Studio preview)
    const isCrossOriginIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    // In cross-origin subframes, window.showDirectoryPicker is forbidden by browser security policy.
    // Trigger standard HTML5 folder or file picker directly to prevent SecurityError.
    if (isCrossOriginIframe) {
      if (folderInputRef.current) {
        folderInputRef.current.click();
      } else {
        fileInputRef.current?.click();
      }
      return;
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        // @ts-expect-error - W3C File System Access API
        const dirHandle = await window.showDirectoryPicker({
          id: 'disk-sentinel-volume-mount',
          mode: 'readwrite'
        });
        const realDrive = await createNativeDriveFromDirectoryHandle(dirHandle);
        handleAddDrive(realDrive);
        dispatchNotification('실제 로컬 볼륨 마운트 완료', `[${dirHandle.name}] 볼륨이 검사 장치로 마운트되었습니다.`);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        // Graceful fallback without throwing uncaught SecurityError
        if (folderInputRef.current) {
          folderInputRef.current.click();
        } else {
          fileInputRef.current?.click();
        }
      }
    } else {
      if (folderInputRef.current) {
        folderInputRef.current.click();
      } else {
        fileInputRef.current?.click();
      }
    }
  };

  const handleAddDrive = useCallback((newDrive: DiskDrive) => {
    setDrives(prev => {
      const exists = prev.some(d => d.id === newDrive.id);
      if (exists) return prev;
      return [newDrive, ...prev];
    });
    setSelectedDriveId(newDrive.id);
    setSelectedMethodId(getDefaultMethodForDrive(newDrive));
  }, []);

  // Real local file selection handler
  const handleSelectRealFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const realDrive = await createNativeDriveFromFile(file);
      handleAddDrive(realDrive);
      dispatchNotification('실제 파일 마운트 완료', `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB) 파일이 로드되었습니다.`);
    } catch (err: any) {
      console.error('File load error:', err);
    } finally {
      e.target.value = '';
    }
  };

  // Real local directory files selection handler (works inside cross-origin iframes)
  const handleSelectFolderFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const realDrive = await createNativeDriveFromFolderFiles(files);
      handleAddDrive(realDrive);
      dispatchNotification('실제 디렉토리 볼륨 마운트 완료', `${realDrive.name}이(가) 로드되었습니다.`);
    } catch (err: any) {
      console.error('Folder load error:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleEjectDrive = useCallback((ejectDriveId: string) => {
    setDrives(prev => {
      const remaining = prev.filter(d => d.id !== ejectDriveId);
      if (selectedDriveId === ejectDriveId && remaining.length > 0) {
        setSelectedDriveId(remaining[0].id);
      }
      return remaining;
    });
  }, [selectedDriveId]);

  // Hardware Details & Live Rescan State
  const [isHardwareDetailsOpen, setIsHardwareDetailsOpen] = useState<boolean>(false);
  const [isRescanningDrives, setIsRescanningDrives] = useState<boolean>(false);

  const handleRescanDrives = useCallback(async () => {
    setIsRescanningDrives(true);
    try {
      const updated = await rescanAllDrives(drives);
      setDrives(updated);
      if (!updated.some(d => d.id === selectedDriveId)) {
        setSelectedDriveId(updated[0].id);
      }
      soundManager.playClick();
      dispatchNotification('디스크 장치 재검색 완료', '로컬 스토리지 하드웨어 및 I/O 실측 프로브가 갱신되었습니다.');
    } catch (err) {
      console.error('Error rescanning drives:', err);
    } finally {
      setIsRescanningDrives(false);
    }
  }, [drives, selectedDriveId, dispatchNotification]);

  // Active Tab: 'scan' | 'logs' | 'health' | 'smart' | 'history'
  const [activeTab, setActiveTab] = useState<MainAppTab>('scan');

  // Storage Media Tailored Inspection Method State
  const [selectedMethodId, setSelectedMethodId] = useState<SpecializedScanMethodId>(() => getDefaultMethodForDrive(INITIAL_PROBING_DRIVE));

  // HDDScan Diagnostic Configuration State
  const [selectedTestType, setSelectedTestType] = useState<SurfaceTestType>('verify');
  const [rangeStartPct, setRangeStartPct] = useState<number>(0);
  const [rangeEndPct, setRangeEndPct] = useState<number>(100);
  const [scanViewMode, setScanViewMode] = useState<'split' | 'graph' | 'map'>('split');
  const [activeBucketFilter, setActiveBucketFilter] = useState<BucketKey | null>(null);
  const [isProvisioningErase, setIsProvisioningErase] = useState<boolean>(false);

  // Blank preview blocks for idle selected drive (before a task is started)
  const [idleBlocks, setIdleBlocks] = useState<SectorBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<SectorBlock | null>(null);
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

  // Initialize blank blocks preview when drive changes
  const initDriveBlocks = useCallback((drive: DiskDrive) => {
    const { blocks: initialBlocks } = generateBlocksForDrive(drive, TOTAL_SCAN_BLOCKS);
    lastInitializedDriveRef.current = { id: drive.id, totalSectors: drive.totalSectors };
    setIdleBlocks(initialBlocks);
    setSelectedBlock(null);
  }, []);

  // Focused task for active drive & inspector stage
  const activeTask = useMemo(() => {
    const exact = tasks.find(t => t.id === activeTaskId);
    if (exact && exact.driveId === activeDrive.id) return exact;
    const runningForDrive = tasks.find(t => t.driveId === activeDrive.id && t.status === 'running');
    if (runningForDrive) return runningForDrive;
    return tasks.find(t => t.driveId === activeDrive.id) || null;
  }, [tasks, activeTaskId, activeDrive.id]);

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

  // S.M.A.R.T Sector Remapping & Zero-Fill Repair Handler
  const handleRepairSectors = useCallback((driveId: string, repairedBlockIds: number[]) => {
    const patchBlocks = (list: SectorBlock[]) =>
      list.map(b =>
        repairedBlockIds.includes(b.id)
          ? {
              ...b,
              status: 'good' as const,
              responseTimeMs: 0.8,
              errorCode: undefined
            }
          : b
      );

    setIdleBlocks(prev => patchBlocks(prev));
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

    setDrives(prev => prev.map(d => {
      if (d.id === driveId) {
        const repairedCount = repairedBlockIds.length;
        const updatedSmart = d.smartAttributes.map(attr => {
          if (attr.id === 5) {
            const currentVal = parseInt(attr.raw, 10) || 0;
            const newVal = currentVal + repairedCount;
            return {
              ...attr,
              raw: `${newVal} (0x${newVal.toString(16).toUpperCase()})`,
              status: 'warning' as const
            };
          }
          if (attr.id === 197 || attr.id === 198) {
            return {
              ...attr,
              raw: '0 (0x00)',
              status: 'good' as const
            };
          }
          return attr;
        });

        const newHealth = d.healthScore !== null
          ? Math.min(100, Math.max(80, d.healthScore + 12))
          : null;

        return {
          ...d,
          healthScore: newHealth,
          smartAttributes: updatedSmart
        };
      }
      return d;
    }));

    const firstRepairedBlock = blocksRef.current.find(b => repairedBlockIds.includes(b.id));
    const newLog: ErrorLogItem = {
      id: `repair-log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      blockIndex: repairedBlockIds[0] || 0,
      lba: firstRepairedBlock ? firstRepairedBlock.lba : (repairedBlockIds[0] || 0) * 1000000,
      status: 'repaired',
      latencyMs: 0.8,
      errorCode: 'REPAIRED_ZEROFILL',
      description: `S.M.A.R.T. 제로필 수복 완료: ${repairedBlockIds.length}개 섹터 ATA Write DMA 강제 초기화 및 예비 트랙 치환(05h) 성공`,
      methodContext: 'S.M.A.R.T. Sector Remapping Engine'
    };

    setErrorLogs(prev => [newLog, ...prev]);
    soundManager.playSuccess();
  }, []);

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
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [isHelpGuideModalOpen, setIsHelpGuideModalOpen] = useState<boolean>(false);
  const [isSmartRemapOpen, setIsSmartRemapOpen] = useState<boolean>(false);

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
  const activeDriveRef = useRef<DiskDrive>(activeDrive);
  activeDriveRef.current = activeDrive;
  const drivesRef = useRef<DiskDrive[]>(drives);
  drivesRef.current = drives;
  const selectedMethodIdRef = useRef<SpecializedScanMethodId>(selectedMethodId);
  selectedMethodIdRef.current = selectedMethodId;
  const scanModeRef = useRef<'quick' | 'full'>(scanMode);
  scanModeRef.current = scanMode;

  // Derived counts
  const goodCount = blocks.filter(b => b.status === 'good').length;
  const normalCount = blocks.filter(b => b.status === 'normal').length;
  const slowCount = blocks.filter(b => b.status === 'slow').length;
  const criticalCount = blocks.filter(b => b.status === 'critical').length;
  const badCount = blocks.filter(b => b.status === 'bad').length;

  // Initialize blank blocks on drive change or capacity update
  useEffect(() => {
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
  const vitals = calculateHardwareVitals(activeDrive, telemetry, scanSpeedMultiplier);
  const currentTemp = vitals.temperatureC;

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
          status: 'critical' as any,
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
  const calculatedHealth: number | null =
    activeDrive.healthScore !== null
      ? Math.max(10, Math.round(activeDrive.healthScore - (badCount * 12) - (criticalCount * 2) - (slowCount * 0.4)))
      : totalScanned > 0
      ? Math.max(10, Math.round(100 - (badCount * 12) - (criticalCount * 2) - (slowCount * 0.4)))
      : null;

  // Poll OS Physical Drive Temperatures every 4s in Tauri Desktop runtime
  const handlePollTemperatures = useCallback(async () => {
    if (!isTauriRuntime) return;
    const readings = await queryTauriPollTemperatures();
    if (readings.length === 0) return;

    const now = Date.now();
    const label = new Date(now).toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setDrives(prev =>
      prev.map(d => {
        if (!d.id.startsWith('drive-tauri-physical-')) return d;
        const idx = parseInt(d.id.replace('drive-tauri-physical-', ''), 10);
        const hit = readings.find(r => r.driveIndex === idx);
        if (!hit || hit.temperatureC === null) return d;
        return {
          ...d,
          temperatureC: hit.temperatureC,
          hardwareSpecs: d.hardwareSpecs
            ? { ...d.hardwareSpecs, currentTempC: hit.temperatureC }
            : d.hardwareSpecs
        };
      })
    );

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
    const driveIdToPoll = targetDriveId || activeDriveRef.current.id;
    if (!driveIdToPoll.startsWith('drive-tauri-physical-')) return;
    const driveIndex = parseInt(driveIdToPoll.replace('drive-tauri-physical-', ''), 10);
    const existingType = smartSelfTestByDrive[driveIdToPoll]?.testType || null;
    const status = await queryTauriSmartSelfTestStatus(driveIndex, driveIdToPoll, existingType);
    setSmartSelfTestByDrive(prev => ({
      ...prev,
      [driveIdToPoll]: status
    }));
  }, [smartSelfTestByDrive]);

  const handleRunSmartSelfTest = useCallback(async (testType: SmartSelfTestType | 'abort') => {
    const target = activeDriveRef.current;
    if (!target.id.startsWith('drive-tauri-physical-')) return;
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
      soundManager.playCompletionChime();
      const badTotal = finishedTask.buckets.bad;
      dispatchNotification(
        `디스크 [${finishedTask.testType.toUpperCase()}] 검사 완료`,
        `${finishedTask.driveModel}: ${badTotal > 0 ? `⚠️ 배드섹터 ${badTotal}개 발견!` : '배드섹터 없음 (정상)'}`
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

        const step = task.stepSequence[task.completedSteps];
        const idx = step.blockIndex;
        inFlightDrivesRef.current.add(task.driveId);

        void (async () => {
          try {
            const probeResult = await executeHddScanBlockProbe(
              targetDrive,
              task.methodId,
              idx,
              task.blocks.length,
              task.testType
            );

            if (isCancelled) return;
            const latestTask = tasksRef.current.find(t => t.id === task.id);
            if (!latestTask || latestTask.status !== 'running') return;

            const { status, latencyMs, throughputMbSec, checksum, errorCode, zoneTag } = probeResult;
            const targetBlock = latestTask.blocks[idx];
            if (!targetBlock) return;
            const targetBlockLba = targetBlock.lba;
            const bucketKey = classifyResponseBucket(status, latencyMs);

            if (errorCode === 'ERASE_BLOCKED_UNSAFE_TARGET') {
              soundManager.playBadSectorAlert();
              const guardLog: ErrorLogItem = {
                id: `erase-guard-${Date.now()}-${idx}`,
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                blockIndex: idx,
                lba: targetBlockLba,
                status: 'bad',
                latencyMs: -1,
                errorCode,
                description: `안전 가드 차단: [${targetDrive.model}]은 물리 디스크 또는 읽기 전용 대상이므로 Erase 쓰기가 중단되었습니다.`,
                methodContext: 'Safe Erase Guard'
              };
              setErrorLogs(prev => [guardLog, ...prev.slice(0, 199)]);
              setTasks(prev =>
                prev.map(t => (t.id === task.id ? { ...t, status: 'aborted', finishedAt: Date.now() } : t))
              );
              return;
            }

            let resolvedStatus = status;
            let resolvedLatency = latencyMs;
            let resolvedErrorCode = errorCode;

            if (status === 'bad' && isAutoRepairModeRef.current && task.testType !== 'erase') {
              const repairRes = await executeRealZeroFillRepairBlock(idx, targetBlockLba, targetDrive);
              if (!isCancelled && repairRes.success) {
                resolvedStatus = 'good';
                resolvedLatency = 0.8;
                resolvedErrorCode = undefined;
                handleRepairSectors(targetDrive.id, [idx]);
              }
            }

            if (resolvedStatus === 'bad') {
              soundManager.playBadSectorAlert();
              setAlertBannerVisible(true);
              setLatestBadLba(targetBlockLba);
              const newLog: ErrorLogItem = {
                id: `log-${Date.now()}-${idx}`,
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                blockIndex: idx,
                lba: targetBlockLba,
                status: 'bad',
                latencyMs: -1,
                errorCode: resolvedErrorCode || 'UNC',
                description: `섹터 I/O 오류 [${task.testType.toUpperCase()}]: ${resolvedErrorCode || '판독/검증 실패'} (LBA #${targetBlockLba.toLocaleString()})`,
                methodContext: `${task.testType.toUpperCase()} Engine`
              };
              setErrorLogs(prev => [newLog, ...prev.slice(0, 199)]);
            } else if (resolvedStatus === 'critical' || resolvedStatus === 'slow') {
              soundManager.playWarningTone();
              const newLog: ErrorLogItem = {
                id: `log-${Date.now()}-${idx}`,
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                blockIndex: idx,
                lba: targetBlockLba,
                status: resolvedStatus,
                latencyMs: resolvedLatency,
                errorCode: resolvedErrorCode || 'LATENCY',
                description: `응답 지연 감지 (${resolvedLatency}ms) - [${task.testType.toUpperCase()}]`,
                methodContext: `${task.testType.toUpperCase()} Engine`
              };
              setErrorLogs(prev => [newLog, ...prev.slice(0, 199)]);
            }

            setTasks(prev =>
              prev.map(t => {
                if (t.id !== task.id || t.status !== 'running') return t;
                const nextBlocks = [...t.blocks];
                nextBlocks[idx] = {
                  ...nextBlocks[idx],
                  status: resolvedStatus,
                  responseTimeMs: resolvedLatency,
                  throughputMbSec,
                  checksum,
                  errorCode: resolvedErrorCode,
                  zoneTag,
                  timestamp: Date.now()
                };
                const finalBucket = classifyResponseBucket(resolvedStatus, resolvedLatency);
                const nextBuckets = {
                  ...t.buckets,
                  [finalBucket]: t.buckets[finalBucket] + 1
                };
                const nextTrace = [
                  ...t.lbaTrace,
                  {
                    seqIndex: t.completedSteps,
                    blockId: idx,
                    lba: targetBlockLba,
                    latencyMs: resolvedLatency,
                    throughputMbSec,
                    status: resolvedStatus,
                    passSide: step.passSide
                  }
                ];

                return {
                  ...t,
                  blocks: nextBlocks,
                  buckets: nextBuckets,
                  lbaTrace: nextTrace,
                  completedSteps: t.completedSteps + 1,
                  currentBlockIndex: idx,
                  currentLba: targetBlockLba,
                  speedMbPerSec: throughputMbSec > 0 ? throughputMbSec : t.speedMbPerSec
                };
              })
            );
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
    (startImmediately = true, forcedTestType?: SurfaceTestType) => {
      const targetDrive = activeDriveRef.current;
      const testTypeToRun = forcedTestType || selectedTestType;

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

      const stepSequence = buildScanBlockSequence(totalB, startBlock, endBlock, scanMode, testTypeToRun);
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
        scanMode,
        methodId: selectedMethodId,
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

      emittedDegradationKeysRef.current.clear();
      setActiveBucketFilter(null);
      setTasks(prev => [newTask, ...prev]);
      setActiveTaskId(newTask.id);
    },
    [selectedTestType, rangeStartPct, rangeEndPct, scanMode, selectedMethodId, scanSpeedMultiplier]
  );

  const handleProvisionSafeEraseTarget = useCallback(async () => {
    setIsProvisioningErase(true);
    try {
      const { drive: safeDrive, createdType } = await provisionSafeEraseTargetFile();
      setDrives(prev => {
        const filtered = prev.filter(d => d.id !== safeDrive.id);
        return [safeDrive, ...filtered];
      });
      setSelectedDriveId(safeDrive.id);
      setSelectedMethodId(getDefaultMethodForDrive(safeDrive));
      dispatchNotification(
        '안전한 Erase 테스트 영역 준비 완료',
        createdType === 'file_handle'
          ? `쓰기 가능한 로컬 테스트 파일(${safeDrive.model})이 준비되었습니다.`
          : '격리된 브라우저 OPFS 샌드박스 4MB 테스트 파일이 준비되었습니다.'
      );
    } catch (err: any) {
      const warnLog: ErrorLogItem = {
        id: `erase-provision-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
        blockIndex: 0,
        lba: 0,
        status: 'slow',
        latencyMs: 0,
        errorCode: 'ERASE_PROVISION_CANCELLED',
        description: err?.message || '테스트 파일 준비가 취소되었거나 지원되지 않습니다.',
        methodContext: 'Safe Erase Guard'
      };
      setErrorLogs(prev => [warnLog, ...prev]);
    } finally {
      setIsProvisioningErase(false);
    }
  }, [dispatchNotification]);

  const handlePauseTask = useCallback((taskId: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === taskId && t.status === 'running' ? { ...t, status: 'paused' } : t))
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

  const handleResetScan = () => {
    if (activeTask && (activeTask.status === 'running' || activeTask.status === 'paused')) {
      handleStopTask(activeTask.id);
    }
    setActiveTaskId(null);
    setActiveBucketFilter(null);
    setLatestBadLba(undefined);
    emittedDegradationKeysRef.current.clear();
    initDriveBlocks(activeDrive);
    setErrorLogs([]);
    setAlertBannerVisible(false);
  };

  const handleDriveChange = (driveId: string) => {
    setSelectedDriveId(driveId);
    const nextDrive = drives.find(d => d.id === driveId) || drives[0];
    setSelectedMethodId(getDefaultMethodForDrive(nextDrive));
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
    const record = createScanRecordFromSession(activeDrive, scanMode, blocks, elapsedSeconds, selectedMethodId);
    setActiveReportRecord(record);
  };

  // Open Export Modal (CSV / PDF / Print / JSON)
  const handleOpenExportModal = (record?: SavedScanRecord) => {
    if (record) {
      setExportTargetRecord(record);
    } else {
      const current = createScanRecordFromSession(activeDrive, scanMode, blocks, elapsedSeconds, selectedMethodId);
      setExportTargetRecord(current);
    }
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
        handleRescanDrives();
        return;
      }

      // Ctrl + O: Mount Volume
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handlePickDirectoryVolume();
        return;
      }

      // Ctrl + F: Open File
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        fileInputRef.current?.click();
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
        if (scanStatus === 'scanning') {
          handlePauseScan();
        } else if (scanStatus === 'paused') {
          handleResumeScan();
        } else {
          handleStartScan();
        }
        return;
      }

      // R: Reset
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleResetScan();
        return;
      }

      // 1 ~ 5: Tab Switching
      if (e.key === '1') setActiveTab('scan');
      if (e.key === '2') setActiveTab('logs');
      if (e.key === '3') setActiveTab('health');
      if (e.key === '4') setActiveTab('smart');
      if (e.key === '5') setActiveTab('history');
    };

    window.addEventListener('keydown', handleDesktopKeyDown);
    return () => window.removeEventListener('keydown', handleDesktopKeyDown);
  }, [scanStatus, handleRescanDrives, handlePickDirectoryVolume]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Hidden Real File & Directory Inputs (Always available across all tabs & iframes) */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleSelectRealFile} 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={folderInputRef} 
        {...({ webkitdirectory: '', directory: '' } as any)}
        multiple 
        onChange={handleSelectFolderFiles} 
        className="hidden" 
      />

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
        onOpenExternalDevicesModal={() => setIsExternalModalOpen(true)}
        onOpenVendorDiagnostics={() => setIsVendorModalOpen(true)}
        onOpenSupportedCatalog={() => setIsCatalogModalOpen(true)}
        onOpenParallelScanModal={() => setIsParallelScanOpen(true)}
        onOpenTrayGuardianModal={() => setIsTrayGuardianOpen(true)}
        onOpenBitCarvingModal={() => {
          const badLba = latestBadLba ?? (blocks.find(b => b.status === 'bad')?.lba) ?? (blocks[0]?.lba ?? 0);
          setBitCarvingTargetLba(badLba);
          setIsBitCarvingOpen(true);
        }}
        onPickDirectoryVolume={handlePickDirectoryVolume}
        onOpenRealFile={() => fileInputRef.current?.click()}
        onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
        onRescanDrives={handleRescanDrives}
        isRescanning={isRescanningDrives}
        onOpenOptionsModal={() => setIsOptionsModalOpen(true)}
        onOpenHelpGuideModal={() => setIsHelpGuideModalOpen(true)}
        onExportResults={() => handleOpenExportModal()}
        onResetScan={handleResetScan}
        onOpenReport={handleOpenCurrentReport}
        isAutoRepairMode={isAutoRepairMode}
        onToggleAutoRepairMode={handleToggleAutoRepairMode}
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

        {/* Sleek In-Page Segmented Tab Navigation Bar (5 Focused Modular Views) */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl mb-3 overflow-x-auto shadow-2xs">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'scan'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="실시간 표면 검사 및 블록 그리드 뷰어"
          >
            <Activity className="w-4 h-4" />
            <span>라이브 표면 검사</span>
            {telemetry.status === 'scanning' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="실시간 결함 감지 및 I/O 이벤트 로그 스트림"
          >
            <Terminal className="w-4 h-4" />
            <span>오류 & 이벤트 로그</span>
            {badCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-red-600 text-white animate-pulse">
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
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'health'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="종합 건강 점수, 응답 속도 분포 및 10분 온도 추이 차트"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>건강 & 발열 추이</span>
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
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'smart'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="S.M.A.R.T. 하드웨어 속성 원시 데이터 및 임계치 검증"
          >
            <HardDrive className="w-4 h-4" />
            <span>S.M.A.R.T. 정밀 속성</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="이전 검사와 최신 검사 간 대조 및 저장된 진단 이력"
          >
            <GitCompare className="w-4 h-4" />
            <span>검사 기록 & 대조</span>
            {scanRecords.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {scanRecords.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Live Surface Scan View — Compact Instrument Console */}
        {activeTab === 'scan' && (
          <div className="flex flex-col lg:flex-row gap-3 items-start">
            {/* Left Instrument Config & Queue Rail (~330px on lg+) */}
            <aside className="w-full lg:w-[330px] shrink-0 space-y-2.5">
              {/* Surface Test Configurator */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      표면 검사 구성 (Surface Test)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {activeDrive.type}
                  </span>
                </div>

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

                {/* Safe Erase Guard Callout */}
                {selectedTestType === 'erase' && (() => {
                  const guard = isSafeEraseTarget(activeDrive);
                  return (
                    <div
                      className={`p-2 rounded border text-[10px] space-y-1.5 ${
                        guard.allowed
                          ? 'border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                          : 'border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between gap-1">
                        <span>{guard.allowed ? '안전 쓰기 대상 확인됨' : 'Erase 안전 가드 활성'}</span>
                        <span className="font-mono text-[9px] truncate max-w-[130px]">{guard.targetLabel}</span>
                      </div>
                      {!guard.allowed && (
                        <>
                          <p className="leading-snug">{guard.reason}</p>
                          <button
                            type="button"
                            disabled={isProvisioningErase}
                            onClick={() => void handleProvisionSafeEraseTarget()}
                            className="w-full py-1 px-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <FilePlus2 className="w-3 h-3" />
                            <span>{isProvisioningErase ? '테스트 영역 준비 중...' : '안전한 OPFS / 쓰기 테스트 파일 준비'}</span>
                          </button>
                        </>
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
                onOpenFilePicker={() => fileInputRef.current?.click()}
                onOpenRemapModal={() => setIsSmartRemapOpen(true)}
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
                    TEST: {activeTask ? activeTask.testType.toUpperCase() : selectedTestType.toUpperCase()}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span>범위: {rangeStartPct}% ~ {rangeEndPct}%</span>
                  {activeBucketFilter && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                        포커스 버킷: {activeBucketFilter}
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
                  onTriggerBitCarving={lba => {
                    setBitCarvingTargetLba(lba);
                    setIsBitCarvingOpen(true);
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
                  <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">실시간 검출 요약:</span>
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
                  <span>상세 오류 및 시스템 로그 확인하기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Error Logs & Activity Stream View */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            <ErrorLogStream
              logs={errorLogs}
              onClearLogs={() => setErrorLogs([])}
              onSelectLogLba={(lba) => {
                const found = blocks.find(b => b.lba === lba);
                if (found) setSelectedBlock(found);
                setActiveTab('scan');
              }}
            />

            {/* Action Card when errors exist */}
            {badCount > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                    <span>배드섹터 {badCount}개에 대한 즉각 조치가 준비되어 있습니다</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    S.M.A.R.T. 제로필(Zero-Fill)로 논리 배드를 수복하거나, 휴리스틱 비트 카빙으로 손상된 섹터의 파일 헤더를 복구할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const badLba = latestBadLba || (blocks.find(b => b.status === 'bad')?.lba) || 1048576;
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
        {activeTab === 'health' && (
          <HealthSummaryDashboard
            drive={activeDrive}
            telemetry={telemetry}
            calculatedHealth={calculatedHealth}
            blocks={blocks}
            activeMethodId={selectedMethodId}
            scanMode={scanMode}
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
        {activeTab === 'smart' && (
          <div className="space-y-3">
            <HealthSummaryDashboard
              drive={activeDrive}
              telemetry={telemetry}
              calculatedHealth={calculatedHealth}
              onRefreshSmart={() => {
                void handleRescanDrives();
              }}
              onOpenVendorModal={() => setIsVendorModalOpen(true)}
              onOpenRemapModal={() => setIsSmartRemapOpen(true)}
              onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
              viewMode="smart_only"
              isTauriRuntime={isTauriRuntime}
              smartSelfTestState={smartSelfTestByDrive[activeDrive.id] || null}
              onRunSmartSelfTest={type => void handleRunSmartSelfTest(type)}
              onPollSmartSelfTest={() => void handlePollSmartSelfTest(activeDrive.id)}
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
      </main>

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
          onAddDrive={handleAddDrive}
          onEjectDrive={handleEjectDrive}
          onRescanDrives={handleRescanDrives}
        />
      )}

      {/* Vendor & Media Tailored Diagnostics Hub Modal */}
      {isVendorModalOpen && (
        <VendorDiagnosticsModal
          isOpen={isVendorModalOpen}
          onClose={() => setIsVendorModalOpen(false)}
          activeDrive={activeDrive}
          telemetry={telemetry}
          onOpenUsbModal={() => setIsExternalModalOpen(true)}
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
        />
      )}

      {/* Bit Carving & ECC Parity Recovery Engine Modal */}
      {isBitCarvingOpen && (
        <BitCarvingRecoveryModal
          isOpen={isBitCarvingOpen}
          onClose={() => setIsBitCarvingOpen(false)}
          initialLba={bitCarvingTargetLba}
          drive={activeDrive}
          driveModel={activeDrive.model}
        />
      )}

      {/* Advanced Disk Hardware Specification & Deep Diagnostics Modal */}
      {isHardwareDetailsOpen && (
        <DiskHardwareDetailsModal
          isOpen={isHardwareDetailsOpen}
          onClose={() => setIsHardwareDetailsOpen(false)}
          drive={activeDrive}
          onRescanHardware={handleRescanDrives}
        />
      )}

      {/* S.M.A.R.T. Sector Remapping & Zero-Fill Repair Center Modal (Root level so accessible from all tabs) */}
      <SmartRemapModal
        isOpen={isSmartRemapOpen}
        onClose={() => setIsSmartRemapOpen(false)}
        activeDrive={activeDrive}
        blocks={blocks}
        onRepairSectors={handleRepairSectors}
      />

      {/* Program Options & Preferences Modal */}
      {isOptionsModalOpen && (
        <OptionsModal
          isOpen={isOptionsModalOpen}
          onClose={() => setIsOptionsModalOpen(false)}
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
          scanRecords={scanRecords}
          onImportMigration={handleImportMigration}
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


      {/* High Density Footer with Creator & Official Channels */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-2.5 bg-slate-100/60 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          
          {/* Left: App & Version Specs */}
          <div className="flex items-center gap-2 text-center md:text-left">
            <span className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
              {PROJECT_INFO.appName} {PROJECT_INFO.version}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="font-mono text-[10px] text-slate-500">
              Node.js 22 LTS / 24 Compliant Release
            </span>
          </div>

          {/* Center: Official Channel Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <a
              href={PROJECT_INFO.developer.githubProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-mono transition-colors"
              title="GitHub: AhBiYout-all"
            >
              <Github className="w-3.5 h-3.5" />
              <span>{PROJECT_INFO.developer.githubUsername}</span>
            </a>

            <a
              href={PROJECT_INFO.developer.blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 font-mono transition-colors"
              title="Official Google Blog: ahbiyoutvibe.blogspot.com"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>Google Blog</span>
            </a>

            <a
              href={PROJECT_INFO.developer.affiliation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 font-mono transition-colors"
              title="Affiliation: cisnet.co.kr"
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-500" />
              <span>CISNet</span>
            </a>
          </div>

          {/* Right: Trigger Update Check, DLL Docs, External Diagnostics */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsHardwareDetailsOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-medium transition-colors cursor-pointer"
              title="디스크 장치 상세 스펙 및 하드웨어 텔레메트리"
            >
              <Cpu className="w-3 h-3 text-indigo-500" />
              <span>장치 스펙</span>
            </button>
            <button
              onClick={() => setIsVendorModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-medium transition-colors cursor-pointer"
              title="제조사 및 내/외부 매체 특성 진단 센터"
            >
              <Cpu className="w-3 h-3 text-blue-500" />
              <span>제조사 특성</span>
            </button>
            <button
              onClick={() => setIsExternalModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 font-medium transition-colors"
              title="외부 저장장치 연결 및 관리"
            >
              <Usb className="w-3 h-3 text-emerald-500" />
              <span>외장 저장장치</span>
            </button>
            <button
              onClick={() => setIsDllDocsOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-medium transition-colors"
            >
              <Cpu className="w-3 h-3 text-indigo-500" />
              <span>창작 DLL 명세</span>
            </button>
            <button
              onClick={() => checkUpdates(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>실시간 업데이트 확인</span>
            </button>
            <button
              onClick={() => setIsAboutModalOpen(true)}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              채널 안내
            </button>
          </div>

        </div>
      </footer>

      {/* Native Desktop Status Bar (Classic Professional Utility Style) */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 overflow-x-auto select-none shadow-inner">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              scanStatus === 'scanning' ? 'bg-indigo-500 animate-ping' :
              scanStatus === 'paused' ? 'bg-amber-500' :
              scanStatus === 'completed' ? 'bg-emerald-500' :
              'bg-slate-400'
            }`} />
            <span className="font-semibold text-slate-700 dark:text-slate-200 font-sans">
              {
                scanStatus === 'scanning' ? `검사 진행 중 (${scannedPercentage.toFixed(1)}%)` :
                scanStatus === 'paused' ? '일시 정지됨' :
                scanStatus === 'completed' ? '검사 완료 (정상)' :
                '대기 중 (Ready)'
              }
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="truncate max-w-[240px]">
            [{activeDrive.mountPoint || 'Host'}] {activeDrive.name} ({activeDrive.capacityGb !== null ? `${activeDrive.capacityGb} GB` : '용량 N/A'})
          </span>

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">LBA: 0 ~ {(activeDrive.totalSectors || 0).toLocaleString()}</span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden md:inline">I/O 채널: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeDrive.hardwareSpecs?.probeMethod || 'Direct I/O'}</strong></span>
          <span className="text-slate-300 dark:text-slate-700 hidden md:inline">|</span>
          <span>건강: <strong className={calculatedHealth === null ? 'text-slate-400' : calculatedHealth >= 80 ? 'text-emerald-500' : 'text-red-500'}>{calculatedHealth !== null ? `${calculatedHealth}%` : 'N/A'}</strong></span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span>온도: <strong>{currentTemp !== null ? `${currentTemp.toFixed(0)}°C` : 'N/A'}</strong></span>
          <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">|</span>
          <span className="hidden lg:inline text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-bold">
            DESKTOP PC EDITION
          </span>
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
  drives: DiskDrive[], 
  onUpdateDrives: (d: DiskDrive[]) => void,
  isActive: boolean 
}) {
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(async () => {
      try {
        const updated = await rescanAllDrives(drives);
        // Only update if there's an actual change in temperature or health to avoid unnecessary re-renders
        const hasChanged = updated.some((d, i) => 
          d.temperatureC !== drives[i]?.temperatureC || 
          d.healthScore !== drives[i]?.healthScore
        );
        
        if (hasChanged) {
          onUpdateDrives(updated);
        }
      } catch (err) {
        // Silent background error
      }
    }, 10000); // 10s polling

    return () => clearInterval(interval);
  }, [isActive, drives, onUpdateDrives]);

  return null;
}

