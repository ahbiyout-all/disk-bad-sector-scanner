export type SectorState = 'unscanned' | 'good' | 'normal' | 'slow' | 'critical' | 'bad';

export type MainAppTab = 'scan' | 'logs' | 'health' | 'smart' | 'history';

export type StorageCategory = 'HDD' | 'SATA_SSD' | 'NVME_SSD' | 'USB_STORAGE' | 'SD_CARD';

export type SpecializedScanMethodId =
  // HDD Methods
  | 'hdd_sequential_zone'
  | 'hdd_butterfly_seek'
  | 'hdd_smart_targeted'
  // SATA SSD Methods
  | 'sata_block_aligned'
  | 'sata_phy_crc_retention'
  // NVMe SSD Methods
  | 'nvme_multiqueue_direct'
  | 'nvme_log02h_telemetry'
  // USB & External Storage Methods
  | 'usb_bot_jitter_filter'
  | 'usb_uasp_streaming'
  | 'usb_fat_meta_priority'
  | 'usb_power_glitch_recovery';

export interface ScanMethodDefinition {
  id: SpecializedScanMethodId;
  name: string;
  nameKo: string;
  category: StorageCategory;
  description: string;
  features: string[];
  targetMedia: string;
  typicalBlockLatency: string;
  slowThresholdMs: number;
  criticalThresholdMs: number;
  blockSizeKb: number;
  badgeColor: string;
  recommendedFor: string;
}

export interface SectorBlock {
  id: number;
  lba: number;
  endLba: number;
  status: SectorState;
  responseTimeMs: number; // e.g. 0.4, 1.2, 28, 160, 650, or -1 for error
  errorCode?: string; // e.g. 'UNC (Uncorrectable Data Error)', 'TIMEOUT', 'ABRT', 'IDNF'
  timestamp?: number;
  checksum?: string;
  throughputMbSec?: number;
  zoneTag?: 'Outer Track' | 'Middle Zone' | 'Inner Track' | 'MBR/FAT Area' | 'NAND Die Ch1' | 'NAND Die Ch2' | 'UASP Stream';
}

export interface DriveSmartAttribute {
  id: number;
  name: string;
  current: number;
  worst: number;
  threshold: number;
  raw: string;
  rawHex?: string;
  status: 'good' | 'warning' | 'critical';
  description: string;
}

export interface DiskDrive {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  firmware: string;
  type: 'SSD' | 'HDD' | 'NVMe' | 'USB' | 'SD_CARD' | 'EXTERNAL_HDD' | 'EXTERNAL_SSD';
  capacityGb: number | null;
  totalSectors: number; // Logical block span for scan mapping
  interface: string;
  healthScore: number | null; // 0 - 100%, or null when kernel S.M.A.R.T. unavailable
  temperatureC: number | null; // °C from hardware sensor, or null when unavailable
  powerOnHours: number | null; // POH from hardware firmware, or null when unavailable
  smartAttributes: DriveSmartAttribute[];
  // External / Attached Storage Fields
  isExternal?: boolean;
  usedPercentage?: number | null;
  usedBytes?: number | null;
  connectionType?: 'internal' | 'usb' | 'thunderbolt' | 'sd_card';
  usbProtocol?: 'BOT (Bulk-Only Transport)' | 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)' | 'UASP (USB Attached SCSI Protocol)' | 'NVMe over USB (UASP 10Gbps)' | 'SDIO UHS-I' | 'Thunderbolt 4 / PCIe Direct';
  isUsb2?: boolean;
  bridgeChipset?: string;
  mountPoint?: string;
  fileSystem?: 'NTFS' | 'exFAT' | 'FAT32' | 'APFS' | 'ext4' | 'f2fs' | 'OPFS' | 'Browser File API' | 'Unknown';
  isEjected?: boolean;
  attachedFile?: File;
  attachedFiles?: File[];
  attachedFileHandle?: any;
  hardwareSpecs?: DiskHardwareSpecs;
}

export interface DiskVolumePartition {
  letterOrMount: string;
  label: string;
  fileSystem: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usedPercentage: number;
}

export interface DiskHardwareSpecs {
  // Identification & Controller
  devicePhysicalPath?: string; // e.g. '\\\\.\\PhysicalDrive0', 'OPFS://origin'
  vendorName: string;
  modelNumber: string;
  serialNumber: string;
  firmwareRevision: string;
  busType: 'NVMe' | 'SATA' | 'USB' | 'PCIe' | 'SCSI' | 'ATAPI' | 'RAID' | 'Unknown';
  busInterfaceSpeed: string;
  formFactor: string;
  controllerVendor?: string;

  // Physical Geometry & Addressing (null when restricted by browser sandbox)
  totalCapacityBytes: number | null;
  totalCapacityGb: number | null;
  totalLbaSectors: number | null;
  logicalSectorSize: number; // 512 or 4096
  physicalSectorSize: number; // 4096
  isAdvancedFormat: boolean;
  partitionStyle: 'GPT (GUID Partition Table)' | 'MBR (Master Boot Record)' | 'N/A (Sandbox)';
  alignmentStatus: 'Aligned (4K sector boundary)' | 'Misaligned' | 'N/A';

  // Protocols & Capabilities
  mediaType: 'SSD (Non-Volatile NAND Flash)' | 'Mechanical HDD (Magnetic Platter)' | 'Flash Memory Card / USB BOT' | 'Sandbox Storage (OPFS / File API)' | 'Direct Hardware Peripheral';
  rotationalSpeedRpm: number | null;
  trimSupported: boolean | null;
  trimActive: boolean | null;
  smartSupported: boolean;
  smartActive: boolean;
  ncqSupported: boolean | null;
  queueDepth: number | null;
  volatileWriteCache: boolean | null;
  writeCacheFlushSupported: boolean | null;
  readLookAheadSupported: boolean | null;
  apmAamSupported: boolean | null;

  // Real-time Reliability & Endurance (null when kernel SMART/NVMe unavailable)
  hostReadsTb: number | null;
  hostWritesTb: number | null;
  percentageUsed: number | null;
  availableSparePercent: number | null;
  powerOnHours: number | null;
  powerCycles: number | null;
  unsafeShutdowns: number | null;
  mediaErrors: number | null;
  currentTempC: number | null;
  maxTempRecordedC: number | null;
  warningTempThresholdC: number | null;
  nvmeLogAvailable?: boolean;

  // Real Measured I/O Performance (null if not benchmarked)
  measuredKernelLatencyUs: number | null;
  measuredSequentialReadMbSec: number | null;
  measuredSequentialWriteMbSec: number | null;
  measuredRandom4kReadIops: number | null;
  probeTimestamp: number;
  probeMethod:
    | 'Native Direct Win32 IOCTL'
    | 'W3C OPFS & StorageManager Probe'
    | 'WebUSB Device Descriptor'
    | 'Web Serial Port Link'
    | 'Real File Slice Direct IO'
    | 'HTML5 Directory File Slicing & Storage Probe';

  // Optional Real USB Descriptor Metadata
  usbDeviceInfo?: {
    vendorId: number;
    productId: number;
    usbVersion?: string;
    deviceClass?: number;
  };

  // Partitions & Volumes
  partitions?: DiskVolumePartition[];
}

export interface ScanTelemetry {
  currentBlockIndex: number;
  totalBlocks: number;
  currentLba: number;
  scannedPercentage: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  scanSpeedBlocksPerSec: number;
  scanSpeedMbPerSec: number;
  goodCount: number;
  normalCount: number;
  slowCount: number;
  criticalCount: number;
  badCount: number;
  status: 'idle' | 'scanning' | 'paused' | 'completed' | 'aborted';
  activeMethodId?: SpecializedScanMethodId;
  activeMethodName?: string;
  adaptiveNote?: string;
}

export interface ErrorLogItem {
  id: string;
  timestamp: string;
  blockIndex: number;
  lba: number;
  status: 'slow' | 'critical' | 'bad' | 'repaired';
  latencyMs: number;
  errorCode: string;
  description: string;
  methodContext?: string;
}

export interface SavedScanRecord {
  id: string;
  driveId: string;
  driveModel: string;
  driveSerial: string;
  driveCapacityGb: number;
  date: string;
  timestamp: number;
  scanMode: 'quick' | 'full';
  scanMethodId?: SpecializedScanMethodId;
  scanMethodName?: string;
  totalBlocks: number;
  goodCount: number;
  normalCount: number;
  slowCount: number;
  criticalCount: number;
  badCount: number;
  badLbaList: number[];
  healthScore: number;
  durationSeconds: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  avgSpeedMbSec?: number;
  smartSnapshot: DriveSmartAttribute[];
  recommendation: string;
  mediaSpecificDiagnosis?: string;
}

export type SurfaceTestType = 'verify' | 'read' | 'butterfly' | 'erase';

export interface ResponseBucketCounts {
  lt5ms: number;
  lt20ms: number;
  lt50ms: number;
  lt150ms: number;
  lt500ms: number;
  gt500ms: number;
  bad: number;
}

export interface LbaTracePoint {
  seqIndex: number;
  blockId: number;
  lba: number;
  latencyMs: number;
  throughputMbSec: number;
  status: SectorState;
  passSide?: 'outer' | 'inner' | 'sequential';
}

export type DiagnosticTaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'aborted';

export interface DiagnosticTask {
  id: string;
  driveId: string;
  driveModel: string;
  driveType: DiskDrive['type'];
  testType: SurfaceTestType;
  scanMode: 'quick' | 'full';
  methodId: SpecializedScanMethodId;
  status: DiagnosticTaskStatus;
  startBlock: number;
  endBlock: number;
  stepSequence: { blockIndex: number; passSide: 'outer' | 'inner' | 'sequential' }[];
  completedSteps: number;
  currentBlockIndex: number;
  currentLba: number;
  speedMultiplier: number;
  speedMbPerSec: number;
  elapsedSeconds: number;
  buckets: ResponseBucketCounts;
  blocks: SectorBlock[];
  lbaTrace: LbaTracePoint[];
  eraseTargetLabel?: string;
  createdAt: number;
  finishedAt?: number;
}

export type SmartSelfTestType = 'short' | 'extended' | 'conveyance';

export interface SmartSelfTestState {
  driveId: string;
  supported: boolean;
  status: 'idle' | 'running' | 'completed' | 'aborted' | 'unsupported';
  testType: SmartSelfTestType | null;
  progressPct: number;
  executionCode: number | null;
  statusText: string;
  startedAt?: number;
  lastUpdatedAt?: number;
  reason?: string;
}

export interface ThermalHistoryPoint {
  timestamp: number;
  label: string;
  temperatureC: number;
}

