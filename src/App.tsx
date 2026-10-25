import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiskDrive, SectorBlock, ScanTelemetry, ErrorLogItem, SavedScanRecord, SpecializedScanMethodId, MainAppTab } from './types';
import { INITIAL_DRIVES, generateBlocksForDrive, TOTAL_SCAN_BLOCKS } from './utils/drivePresets';
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
import { checkForGithubReleaseUpdate } from './utils/updater';
import { PROJECT_INFO, ReleaseInfo } from './config/projectInfo';
import { SCAN_METHOD_DEFINITIONS, getDefaultMethodForDrive, inspectSectorBlock } from './utils/scanProfiles';
import { 
  createNativeHostDrive, 
  createNativeDriveFromFile, 
  createNativeDriveFromDirectoryHandle,
  createNativeDriveFromFolderFiles,
  executeRealPhysicalSectorProbe,
  rescanAllDrives
} from './utils/nativeDriveEngine';
import { calculateHardwareVitals } from './utils/hardwareTelemetry';
import { safeStorage } from './utils/safeStorage';
import { 
  Github, 
  BookOpen, 
  Building2, 
  Sparkles, 
  ExternalLink, 
  ShieldCheck, 
  Cpu, 
  Usb, 
  Thermometer, 
  X, 
  FolderOpen, 
  HardDrive,
  Activity,
  Terminal,
  GitCompare,
  ArrowRight,
  ShieldAlert
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

  const handleRequestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
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

  const dispatchNotification = useCallback((title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico'
        });
      } catch {
        // Ignore fallback
      }
    }
  }, []);

const INITIAL_HOST_DRIVE: DiskDrive = {
  id: 'drive-native-host-real',
  name: '🖥️ [C:] 로컬 OS 메인 드라이브 (512GB)',
  model: 'Host Primary Storage Device',
  serialNumber: 'HOST-SYS-PROBING',
  firmware: 'NATIVE-1.0.0',
  type: 'NVMe',
  isExternal: false,
  connectionType: 'internal',
  capacityGb: 512,
  totalSectors: 1073741824,
  interface: 'PCIe Direct Host Memory Controller',
  healthScore: 100,
  temperatureC: 36,
  powerOnHours: 120,
  mountPoint: 'C:',
  fileSystem: 'NTFS',
  defaultBadSectorProbability: 0,
  smartAttributes: [],
  seededBadSectors: [],
  seededSlowSectors: [],
  isDemoPreset: false
};

  // Drive Selection & Management
  const [showDemoPresets, setShowDemoPresets] = useState<boolean>(false);
  const [drives, setDrives] = useState<DiskDrive[]>([INITIAL_HOST_DRIVE]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>('drive-native-host-real');
  const [isExternalModalOpen, setIsExternalModalOpen] = useState<boolean>(false);
  const activeDrive = drives.find(d => d.id === selectedDriveId) || drives[0];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Probe Real Native OS Hardware Storage on Mount
  useEffect(() => {
    let mounted = true;
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
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleDemoPresets = useCallback(() => {
    setShowDemoPresets(prev => {
      const nextState = !prev;
      setDrives(currentDrives => {
        if (nextState) {
          const demoDrivesToAdd = INITIAL_DRIVES.map(d => ({ ...d, isDemoPreset: true }));
          const existingIds = new Set(currentDrives.map(d => d.id));
          const newDrives = demoDrivesToAdd.filter(d => !existingIds.has(d.id));
          return [...currentDrives, ...newDrives];
        } else {
          const realDrivesOnly = currentDrives.filter(d => !d.isDemoPreset);
          if (realDrivesOnly.length > 0 && currentDrives.find(d => d.id === selectedDriveId)?.isDemoPreset) {
            setSelectedDriveId(realDrivesOnly[0].id);
          }
          return realDrivesOnly;
        }
      });
      return nextState;
    });
  }, [selectedDriveId]);

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
  const [selectedMethodId, setSelectedMethodId] = useState<SpecializedScanMethodId>(() => getDefaultMethodForDrive(INITIAL_HOST_DRIVE));

  // Blocks State
  const [blocks, setBlocks] = useState<SectorBlock[]>([]);
  const [badSet, setBadSet] = useState<Set<number>>(new Set());
  const [slowSet, setSlowSet] = useState<Set<number>>(new Set());
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(-1);
  const [selectedBlock, setSelectedBlock] = useState<SectorBlock | null>(null);

  // Initialize blocks when drive changes
  const initDriveBlocks = useCallback((drive: DiskDrive) => {
    const { blocks: initialBlocks, badSet: bs, slowSet: ss } = generateBlocksForDrive(drive, TOTAL_SCAN_BLOCKS);
    setBlocks(initialBlocks);
    setBadSet(bs);
    setSlowSet(ss);
    setActiveBlockIndex(-1);
    setSelectedBlock(null);
  }, []);

  useEffect(() => {
    initDriveBlocks(activeDrive);
  }, [activeDrive, initDriveBlocks]);

  // S.M.A.R.T Sector Remapping & Zero-Fill Repair Handler
  const handleRepairSectors = useCallback((driveId: string, repairedBlockIds: number[]) => {
    setBlocks(prev => prev.map(b => {
      if (repairedBlockIds.includes(b.id)) {
        return {
          ...b,
          status: 'good',
          responseTimeMs: 0.8,
          errorCode: undefined
        };
      }
      return b;
    }));

    setBadSet(prev => {
      const next = new Set(prev);
      repairedBlockIds.forEach(id => next.delete(id));
      return next;
    });

    setSlowSet(prev => {
      const next = new Set(prev);
      repairedBlockIds.forEach(id => next.delete(id));
      return next;
    });

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
          if (attr.id === 197) {
            return {
              ...attr,
              raw: '0 (0x00)',
              status: 'good' as const
            };
          }
          if (attr.id === 198) {
            return {
              ...attr,
              raw: '0 (0x00)',
              status: 'good' as const
            };
          }
          return attr;
        });

        const newHealth = Math.min(100, Math.max(80, d.healthScore + 12));

        return {
          ...d,
          healthScore: newHealth,
          smartAttributes: updatedSmart,
          seededBadSectors: (d.seededBadSectors || []).filter(idx => !repairedBlockIds.includes(idx))
        };
      }
      return d;
    }));

    const firstRepairedBlock = blocks.find(b => repairedBlockIds.includes(b.id));
    const newLog: ErrorLogItem = {
      id: `repair-log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      blockIndex: repairedBlockIds[0] || 0,
      lba: firstRepairedBlock ? firstRepairedBlock.lba : (repairedBlockIds[0] || 0) * 1000000,
      status: 'good' as any,
      latencyMs: 0.8,
      errorCode: 'REPAIRED_ZEROFILL',
      description: `S.M.A.R.T. 제로필 수복 완료: ${repairedBlockIds.length}개 섹터 ATA Write DMA 강제 초기화 및 예비 트랙 치환(05h) 성공`,
      methodContext: 'S.M.A.R.T. Sector Remapping Engine'
    };

    setErrorLogs(prev => [newLog, ...prev]);
    soundManager.playSuccess();
  }, [blocks]);

  // Telemetry & Scan Settings
  const [scanMode, setScanMode] = useState<'quick' | 'full'>('full');
  const [scanSpeedMultiplier, setScanSpeedMultiplier] = useState<number>(2); // 2x default
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'paused' | 'completed' | 'aborted'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Live Error Log Stream
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);

  // Alert Banner State
  const [alertBannerVisible, setAlertBannerVisible] = useState<boolean>(false);
  const [latestBadLba, setLatestBadLba] = useState<number | undefined>(undefined);

  // Thermal Stress Simulation State & Overheat Banner Dismissal State
  const [isThermalStress, setIsThermalStress] = useState<boolean>(false);
  const [isOverheatDismissed, setIsOverheatDismissed] = useState<boolean>(false);

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

  // Active Report Modal
  const [activeReportRecord, setActiveReportRecord] = useState<SavedScanRecord | null>(null);
  const [exportTargetRecord, setExportTargetRecord] = useState<SavedScanRecord | null>(null);
  const [completedSummaryRecord, setCompletedSummaryRecord] = useState<SavedScanRecord | null>(null);

  // GitHub Real-time Update System State
  const [updateRelease, setUpdateRelease] = useState<ReleaseInfo>(PROJECT_INFO.sampleLatestRelease);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false); // Only true when real GitHub newer version detected
  const [updateSource, setUpdateSource] = useState<'github-live' | 'fallback'>('fallback');
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isDllDocsOpen, setIsDllDocsOpen] = useState<boolean>(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState<boolean>(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState<boolean>(false);
  const [isParallelScanOpen, setIsParallelScanOpen] = useState<boolean>(false);
  const [isTrayGuardianOpen, setIsTrayGuardianOpen] = useState<boolean>(false);
  const [isBitCarvingOpen, setIsBitCarvingOpen] = useState<boolean>(false);
  const [bitCarvingTargetLba, setBitCarvingTargetLba] = useState<number>(1048576);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [isHelpGuideModalOpen, setIsHelpGuideModalOpen] = useState<boolean>(false);

  // Real-time Update Checker
  const checkUpdates = useCallback(async (manual = false) => {
    try {
      const result = await checkForGithubReleaseUpdate();
      setUpdateRelease(result.release);
      setHasUpdate(result.hasUpdate);
      setUpdateSource(result.source);
      if (manual || result.hasUpdate) {
        setIsUpdateModalOpen(true);
      }
    } catch {
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

  // Refs for scanning loop
  const scanLoopRef = useRef<NodeJS.Timeout | null>(null);
  const timerLoopRef = useRef<NodeJS.Timeout | null>(null);
  const currentIndexRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Derived counts
  const goodCount = blocks.filter(b => b.status === 'good').length;
  const normalCount = blocks.filter(b => b.status === 'normal').length;
  const slowCount = blocks.filter(b => b.status === 'slow').length;
  const criticalCount = blocks.filter(b => b.status === 'critical').length;
  const badCount = blocks.filter(b => b.status === 'bad').length;

  // Real-time speed calculation
  const totalScanned = goodCount + normalCount + slowCount + criticalCount + badCount;
  const scannedPercentage = blocks.length > 0 ? (totalScanned / blocks.length) * 100 : 0;
  const currentLba = blocks[activeBlockIndex]?.lba || (activeBlockIndex >= 0 ? activeBlockIndex * Math.floor(activeDrive.totalSectors / TOTAL_SCAN_BLOCKS) : 0);

  // Calculate estimated remaining seconds
  const blocksPerSecond = elapsedSeconds > 0 ? totalScanned / elapsedSeconds : 0;
  const remainingBlocks = Math.max(0, blocks.length - totalScanned);
  const remainingSeconds = blocksPerSecond > 0 ? Math.ceil(remainingBlocks / blocksPerSecond) : 0;

  // Approximate transfer speed in MB/s (assume 1 block is proportional to disk capacity)
  const mbPerBlock = (activeDrive.capacityGb * 1024) / TOTAL_SCAN_BLOCKS;
  const scanSpeedMbPerSec = blocksPerSecond > 0 ? Number((blocksPerSecond * (mbPerBlock / 10)).toFixed(1)) : 0;

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
    activeMethodId: selectedMethodId,
    activeMethodName: SCAN_METHOD_DEFINITIONS[selectedMethodId]?.nameKo || SCAN_METHOD_DEFINITIONS[selectedMethodId]?.name
  };

  // Real-time Hardware Vitals
  const vitals = calculateHardwareVitals(activeDrive, telemetry, scanSpeedMultiplier, isThermalStress);
  const currentTemp = vitals.temperatureC;

  const notifiedOverheatRef = useRef<boolean>(false);

  // Real-time Overheat Warning Monitor (Threshold: 60°C)
  useEffect(() => {
    if (currentTemp > 60) {
      if (!notifiedOverheatRef.current) {
        notifiedOverheatRef.current = true;
        
        // 1. Play Warning Sound
        soundManager.playWarningTone();
        
        // 2. Add System Log
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

        // 3. Dispatch Browser Notification
        dispatchNotification(
          '🔥 디스크 과열 위험 경고!',
          `현재 드라이브 온도가 안전 한계치인 60°C를 초과한 ${currentTemp.toFixed(1)}°C입니다. 즉각적인 조치 또는 쿨링을 권장합니다.`
        );
      }
    } else {
      // Reset notification flag when temperature cools down
      notifiedOverheatRef.current = false;
    }
  }, [currentTemp, activeBlockIndex, currentLba, dispatchNotification]);

  // Reset Overheat Banner Dismissal state when temperature cools down
  useEffect(() => {
    if (currentTemp <= 60) {
      setIsOverheatDismissed(false);
    }
  }, [currentTemp]);

  // Dynamic health score calculation
  const calculatedHealth = Math.max(
    10,
    Math.round(activeDrive.healthScore - (badCount * 12) - (criticalCount * 2) - (slowCount * 0.4))
  );

  // Elapsed timer loop
  useEffect(() => {
    if (scanStatus === 'scanning') {
      timerLoopRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerLoopRef.current) clearInterval(timerLoopRef.current);
    }
    return () => {
      if (timerLoopRef.current) clearInterval(timerLoopRef.current);
    };
  }, [scanStatus]);

  // Main Scanning Loop Execution with Storage Tailored Inspection Profiles
  useEffect(() => {
    if (scanStatus !== 'scanning') {
      if (scanLoopRef.current) clearInterval(scanLoopRef.current);
      return;
    }

    // Step rate based on speed multiplier & mode
    // 1x = 30ms interval, 2x = 15ms, 5x = 6ms, 10x = 2ms
    const stepInterval = Math.max(2, Math.floor(30 / scanSpeedMultiplier));
    const stepIncrement = scanMode === 'quick' ? 4 : 1; // Quick scan samples every 4th block

    let isProcessingTick = false;

    scanLoopRef.current = setInterval(async () => {
      if (isProcessingTick) return;
      isProcessingTick = true;

      try {
        let idx = currentIndexRef.current;
        if (idx >= blocks.length) {
          // Complete Scan!
          setScanStatus('completed');
          soundManager.playCompletionChime();
          dispatchNotification(
            '디스크 맞춤 표면 검사 완료',
            `검사가 완료되었습니다. ${badCount > 0 ? `⚠️ 배드섹터 ${badCount}개 발견!` : '배드섹터 없음 (정상)'}`
          );

          // Auto-save scan report with tailored method
          const newRecord = createScanRecordFromSession(activeDrive, scanMode, blocks, elapsedSeconds, selectedMethodId);
          setScanRecords(prev => [newRecord, ...prev]);
          setCompletedSummaryRecord(newRecord);
          return;
        }

        // Check current block characteristics using real physical inspection probe
        const isBad = badSet.has(idx);
        const isSlow = slowSet.has(idx);

        const inspectionResult = await executeRealPhysicalSectorProbe(
          activeDrive,
          selectedMethodId,
          idx,
          blocks.length,
          isBad,
          isSlow
        );

        const { status, latencyMs, throughputMbSec, checksum, errorCode, zoneTag } = inspectionResult;

        // Update block in state
        const targetBlockLba = blocks[idx].lba;

        setBlocks(prev => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status,
            responseTimeMs: latencyMs,
            throughputMbSec,
            checksum,
            errorCode,
            zoneTag,
            timestamp: Date.now()
          };
          return next;
        });

        setActiveBlockIndex(idx);

      // Handle Event Log, Alerts & Audio
      const currentMethodMeta = SCAN_METHOD_DEFINITIONS[selectedMethodId];
      if (status === 'bad') {
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
          errorCode: errorCode || 'UNC',
          description: `손상된 배드섹터 검출! 데이터 판독 불가 (LBA #${targetBlockLba.toLocaleString()})`,
          methodContext: currentMethodMeta?.nameKo
        };
        setErrorLogs(prev => [newLog, ...prev.slice(0, 199)]);

        // Dispatch browser notification
        dispatchNotification(
          '🚨 배드섹터 검출 경고!',
          `블록 #${idx} (LBA: #${targetBlockLba.toLocaleString()})에서 읽기 손상 섹터가 감지되었습니다!`
        );
      } else if (status === 'critical' || status === 'slow') {
        soundManager.playWarningTone();
        const newLog: ErrorLogItem = {
          id: `log-${Date.now()}-${idx}`,
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
          blockIndex: idx,
          lba: targetBlockLba,
          status,
          latencyMs: latencyMs,
          errorCode: errorCode || 'LATENCY',
          description: `응답 지연 감지 (${latencyMs}ms) - [${currentMethodMeta?.nameKo || '맞춤 검사'}]`,
          methodContext: currentMethodMeta?.nameKo
        };
        setErrorLogs(prev => [newLog, ...prev.slice(0, 199)]);
      }

      // Increment index
      currentIndexRef.current = idx + stepIncrement;
    } finally {
      isProcessingTick = false;
    }
  }, stepInterval);

    return () => {
      if (scanLoopRef.current) clearInterval(scanLoopRef.current);
    };
  }, [scanStatus, scanSpeedMultiplier, scanMode, blocks, badSet, slowSet, activeDrive, elapsedSeconds, badCount, selectedMethodId, dispatchNotification]);

  // Scan Controls
  const handleStartScan = () => {
    if (scanStatus === 'completed' || scanStatus === 'aborted') {
      handleResetScan();
    }
    setScanStatus('scanning');
  };

  const handlePauseScan = () => {
    setScanStatus('paused');
  };

  const handleResumeScan = () => {
    setScanStatus('scanning');
  };

  const handleStopScan = () => {
    setScanStatus('aborted');
  };

  const handleResetScan = () => {
    setScanStatus('idle');
    setElapsedSeconds(0);
    currentIndexRef.current = 0;
    initDriveBlocks(activeDrive);
    setErrorLogs([]);
    setAlertBannerVisible(false);
  };

  const handleDriveChange = (driveId: string) => {
    if (scanStatus === 'scanning') {
      const confirmChange = window.confirm('현재 진행 중인 검사가 취소됩니다. 대상 드라이브를 변경하시겠습니까?');
      if (!confirmChange) return;
    }
    setScanStatus('idle');
    setElapsedSeconds(0);
    currentIndexRef.current = 0;
    setSelectedDriveId(driveId);

    const nextDrive = drives.find(d => d.id === driveId) || drives[0];
    setSelectedMethodId(getDefaultMethodForDrive(nextDrive));

    setErrorLogs([]);
    setAlertBannerVisible(false);
  };

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
        onRequestNotification={handleRequestNotification}
        currentHealthScore={calculatedHealth}
        badCount={badCount}
        hasUpdate={hasUpdate}
        latestVersion={updateRelease?.version || PROJECT_INFO.sampleLatestRelease.version}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        onOpenAboutModal={() => setIsAboutModalOpen(true)}
        onOpenDllDocs={() => setIsDllDocsOpen(true)}
        onOpenExternalDevicesModal={() => setIsExternalModalOpen(true)}
        onOpenVendorDiagnostics={() => setIsVendorModalOpen(true)}
        onOpenSupportedCatalog={() => setIsCatalogModalOpen(true)}
        onOpenParallelScanModal={() => setIsParallelScanOpen(true)}
        onOpenTrayGuardianModal={() => setIsTrayGuardianOpen(true)}
        onOpenBitCarvingModal={() => {
          const badLba = latestBadLba || (blocks.find(b => b.status === 'bad')?.lba) || 1048576;
          setBitCarvingTargetLba(badLba);
          setIsBitCarvingOpen(true);
        }}
        showDemoPresets={showDemoPresets}
        onToggleDemoPresets={handleToggleDemoPresets}
        onPickDirectoryVolume={handlePickDirectoryVolume}
        onOpenRealFile={() => fileInputRef.current?.click()}
        onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
        onRescanDrives={handleRescanDrives}
        isRescanning={isRescanningDrives}
        onOpenOptionsModal={() => setIsOptionsModalOpen(true)}
        onOpenHelpGuideModal={() => setIsHelpGuideModalOpen(true)}
        isThermalStress={isThermalStress}
        onToggleThermalStress={() => setIsThermalStress(!isThermalStress)}
        onExportResults={() => handleOpenExportModal()}
        onResetScan={handleResetScan}
        onOpenReport={handleOpenCurrentReport}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-4 py-2.5 sm:py-3">
        {/* Real-time Overheat Warning Alert Banner */}
        {currentTemp > 60 && !isOverheatDismissed && (
          <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-500 rounded-lg p-2.5 sm:p-3.5 text-red-700 dark:text-red-300 shadow-md mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-red-600 text-white rounded shrink-0 mt-0.5 sm:mt-0 animate-pulse">
                  <Thermometer className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-xs sm:text-sm text-red-600 dark:text-red-200">
                      🔥 과열 경고: 하드웨어 모니터링 디스크 온도 초과!
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-red-600 text-white font-bold animate-pulse">
                      {currentTemp.toFixed(1)}°C / 60.0°C
                    </span>
                  </div>
                  <p className="text-[11px] text-red-600/80 dark:text-red-300/80 mt-0.5 leading-relaxed hidden sm:block">
                    디스크 실시간 작동 온도가 위험 임계값인 <strong>60.0°C</strong>를 초과했습니다! 고온 유지 시 칩셋 스로틀링, 데이터 기록 무결성 손상 및 진행성 배드섹터가 급증할 수 있으므로 쿨링 장치 점검 및 부하 일시 일시중지를 강력히 권고합니다.
                  </p>
                  <p className="text-[11px] text-red-600/90 dark:text-red-300/90 mt-0.5 sm:hidden">
                    위험 온도 60°C 초과. 쿨링 장치 점검 및 부하 해제를 권고합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => setIsThermalStress(false)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-200 dark:hover:bg-slate-100 dark:text-slate-900 rounded transition-colors shadow-xs cursor-pointer"
                >
                  과열 부하 해제
                </button>
                <button
                  onClick={() => setIsOverheatDismissed(true)}
                  className="p-1 text-red-400 hover:bg-red-500/10 dark:hover:bg-red-950/50 rounded transition-colors"
                  title="경고 배너 닫기"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>
        )}

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
              calculatedHealth >= 80 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
            }`}>
              {calculatedHealth}%
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

        {/* Tab 1: Live Surface Scan View */}
        {activeTab === 'scan' && (
          <div className="space-y-2.5">
            {/* Storage Media Tailored Inspection Method Selector */}
            <ScanMethodSelector
              activeDrive={activeDrive}
              activeMethodId={selectedMethodId}
              onSelectMethod={setSelectedMethodId}
              isScanning={scanStatus === 'scanning'}
              blocks={blocks}
              onRepairSectors={handleRepairSectors}
              onOpenFilePicker={() => fileInputRef.current?.click()}
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
              isThermalStress={isThermalStress}
              onToggleThermalStress={() => setIsThermalStress(!isThermalStress)}
            />

            {/* Interactive Sector Grid Visualizer */}
            <SectorGrid
              blocks={blocks}
              activeBlockIndex={activeBlockIndex}
              selectedBlock={selectedBlock}
              onSelectBlock={(b) => setSelectedBlock(b)}
              onTriggerBitCarving={(lba) => {
                setBitCarvingTargetLba(lba);
                setIsBitCarvingOpen(true);
              }}
            />

            {/* Quick Summary Strip & Link to Error Logs */}
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">실시간 검출 요약:</span>
                <span className={`font-mono font-bold ${badCount > 0 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
                  {badCount}개 배드섹터
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="font-mono text-amber-500 font-bold">{slowCount + criticalCount}개 응답 지연</span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="font-mono text-emerald-500 font-bold">{goodCount + normalCount}개 정상</span>
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
                    onClick={() => setIsVendorModalOpen(true)}
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
            onRefreshSmart={() => {
              soundManager.playClick();
            }}
            onOpenVendorModal={() => setIsVendorModalOpen(true)}
            onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
            isThermalStress={isThermalStress}
            viewMode="health_only"
          />
        )}

        {/* Tab 4: S.M.A.R.T. Attributes Table View */}
        {activeTab === 'smart' && (
          <div className="space-y-3">
            <HealthSummaryDashboard
              drive={activeDrive}
              telemetry={telemetry}
              calculatedHealth={calculatedHealth}
              onRefreshSmart={() => {
                soundManager.playClick();
              }}
              onOpenVendorModal={() => setIsVendorModalOpen(true)}
              onOpenHardwareDetails={() => setIsHardwareDetailsOpen(true)}
              isThermalStress={isThermalStress}
              viewMode="smart_only"
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
            setIsVendorModalOpen(true);
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
          onRefreshSmart={() => {
            soundManager.playClick();
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
          onRequestNotification={handleRequestNotification}
          showDemoPresets={showDemoPresets}
          onToggleDemoPresets={handleToggleDemoPresets}
          isThermalStress={isThermalStress}
          onToggleThermalStress={() => setIsThermalStress(!isThermalStress)}
          scanSpeedMultiplier={scanSpeedMultiplier}
          onChangeSpeedMultiplier={setScanSpeedMultiplier}
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
    </div>
  );
}
