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
  fileSystem?: 'NTFS' | 'exFAT' | 'FAT32' | 'APFS' | 'ext4' | 'f2fs' | 'Unknown';
  isEjected?: boolean;
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
  devicePhysicalPath?: string; // e.g. '\\\\.\\PhysicalDrive0'
  vendorName: string;
  modelNumber: string;
  serialNumber: string;
  firmwareRevision: string;
  busType:
    | 'NVMe'
    | 'SATA'
    | 'USB'
    | 'PCIe'
    | 'SCSI'
    | 'SCSI/SAS'
    | 'ATAPI'
    | 'ATA'
    | 'RAID'
    | 'SD'
    | 'MMC'
    | 'UFS'
    | 'Storage Spaces'
    | 'SCM'
    | 'Unknown';
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
  partitionStyle: 'GPT (GUID Partition Table)' | 'MBR (Master Boot Record)' | 'Unknown';
  alignmentStatus: 'Aligned (4K sector boundary)' | 'Misaligned' | 'N/A';

  // Protocols & Capabilities
  mediaType: 'SSD (Non-Volatile NAND Flash)' | 'Mechanical HDD (Magnetic Platter)' | 'Flash Memory Card / USB BOT' | 'Direct Hardware Peripheral' | 'Unknown';
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
    | 'Tauri Desktop Native IPC';

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

export type DrivePowerMode = 'active_idle' | 'standby' | 'sleep' | 'unknown';

export interface DriveFeatureStatus {
  driveIndex: number;
  protocol: 'ATA' | 'NVMe' | 'UNSUPPORTED';
  isAtaPassthroughAvailable: boolean;
  powerMode: DrivePowerMode;
  aamSupported: boolean;
  aamEnabled: boolean;
  aamCurrent: number | null;
  aamRecommended: number | null;
  apmSupported: boolean;
  apmEnabled: boolean;
  apmCurrent: number | null;
  pmSupported: boolean;
  writeCacheSupported: boolean;
  writeCacheEnabled: boolean;
  readLookAheadSupported: boolean;
  readLookAheadEnabled: boolean;
  reason?: string;
}

export interface DriveIdentifyField {
  wordIndex: string;
  byteOffsetStart: number;
  byteLength: number;
  name: string;
  rawHex: string;
  decodedValue: string;
  category: 'General' | 'Geometry' | 'Transfer' | 'Security' | 'Power';
}

export interface DriveIdentifySnapshot {
  supported: boolean;
  protocol: 'ATA' | 'NVMe' | 'UNSUPPORTED';
  rawBytes: number[];
  decodedFields: DriveIdentifyField[];
  reason?: string;
}

export interface SmartSelfTestLogEntry {
  index: number;
  testCode: number;
  testType: string;
  statusCode: number;
  statusText: string;
  remainingPct: number;
  lifeTimeHours: number;
  failingLba: number | null;
}

export interface SmartErrorLogEntry {
  errorNumber: number;
  lifeTimeHours: number;
  lba: number | null;
  statusFlags: number;
  errorFlags: number;
  errorMnemonic: string;
  commandReg: number;
}

export interface SmartExtendedLogsResponse {
  supported: boolean;
  protocol: 'ATA' | 'NVMe' | 'UNSUPPORTED';
  selfTestLogs: SmartSelfTestLogEntry[];
  errorLogs: SmartErrorLogEntry[];
  totalErrorCount: number;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Raw Sector Hex Viewer & MBR / GPT Partition Table Inspector Types
// ---------------------------------------------------------------------------
export interface RawSectorRangeResponse {
  supported: boolean;
  driveIndex: number;
  startLba: number;
  sectorCount: number;
  sectorSize: number;
  bytes: number[];
  reason?: string;
}

export interface PartitionEntryRecord {
  index: number;
  scheme: 'GPT' | 'MBR';
  typeName: string;
  typeCodeOrGuid: string;
  partitionGuid?: string;
  name: string;
  bootable: boolean;
  startLba: number;
  endLba: number;
  sectorCount: number;
  sizeGb: number;
  is4kAligned: boolean;
}

export interface ParsedPartitionTable {
  scheme: 'GPT' | 'MBR' | 'UNINITIALIZED';
  sectorSize: number;
  mbrSignatureHex: string;
  mbrSignatureValid: boolean;
  protectiveMbrDetected: boolean;
  gptHeaderSignature?: string;
  gptHeaderCrcValid?: boolean;
  gptDiskGuid?: string;
  gptPrimaryLba?: number;
  gptBackupLba?: number;
  gptFirstUsableLba?: number;
  gptLastUsableLba?: number;
  entries: PartitionEntryRecord[];
}

export interface VbrBootInfo {
  filesystem: string;
  oemId: string;
  bytesPerSector: number;
  sectorsPerCluster: number;
  clusterSizeBytes: number;
  signatureValid: boolean;
}

// ---------------------------------------------------------------------------
// Live LBA I/O Performance Benchmark & Profiler Types
// ---------------------------------------------------------------------------
export type BenchmarkProfilePreset = 'sequential_zone' | 'random_4k' | 'combined';

export interface BenchmarkSamplePoint {
  zoneIndex: number;
  positionPct: number;
  startLba: number;
  readMbSec: number;
  random4kIops: number | null;
  avgLatencyMs: number;
  p99LatencyMs: number;
  statusCode: number;
}

export interface BenchmarkRunResult {
  driveId: string;
  driveModel: string;
  preset: BenchmarkProfilePreset;
  completedAt: number;
  sampleCount: number;
  minMbSec: number;
  avgMbSec: number;
  maxMbSec: number;
  avgRandom4kIops: number | null;
  avgLatencyMs: number;
  p99LatencyMs: number;
  samples: BenchmarkSamplePoint[];
}

// ---------------------------------------------------------------------------
// Background Watchdog Scheduler & Persistent Alert Rules Types
// ---------------------------------------------------------------------------
export type WatchdogRuleMetric =
  | 'temp'
  | 'smart_05'
  | 'smart_c5'
  | 'health_score'
  | 'scheduled_quick_scan';

export interface WatchdogRule {
  id: string;
  name: string;
  driveId: string; // 'ALL' or specific DiskDrive.id
  metric: WatchdogRuleMetric;
  thresholdValue: number;
  intervalMinutes: number;
  cooldownMinutes: number;
  enabled: boolean;
  lastTriggeredAt?: number;
}

export interface WatchdogBaselineSnapshot {
  reallocated05: number;
  pendingC5: number;
  updatedAt: number;
}

export interface WatchdogTriggerEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: WatchdogRuleMetric;
  driveId: string;
  driveModel: string;
  severity: 'warning' | 'critical' | 'info';
  message: string;
  triggeredAt: number;
}

// ---------------------------------------------------------------------------
// ddrescue-Style Multi-Pass LBA Image Cloner Types
// ---------------------------------------------------------------------------
export type LbaCloneIntervalStatus = 'non_tried' | 'non_trimmed' | 'non_scraped' | 'bad_sector' | 'finished';

export type LbaClonePassPhase = 'copying' | 'trimming' | 'retrying' | 'idle' | 'completed' | 'paused';

export interface LbaCloneDomainInterval {
  startLba: number;
  sectorCount: number;
  status: LbaCloneIntervalStatus;
  attempts: number;
  lastErrorCode?: number;
}

export interface LbaCloneSessionState {
  version: number;
  driveId: string;
  driveModel: string;
  driveSerial: string;
  sectorSize: number;
  rangeStartLba: number;
  rangeEndLba: number;
  outputPath: string;
  mapPath: string;
  phase: LbaClonePassPhase;
  chunkSectors: number;
  copiedSectors: number;
  badSectors: number;
  retriedSectors: number;
  bytesWritten: number;
  startedAt: number;
  updatedAt: number;
  intervals: LbaCloneDomainInterval[];
}

export interface LbaCopyChunkResult {
  supported: boolean;
  success: boolean;
  startLba: number;
  sectorCount: number;
  bytesWritten: number;
  statusCode: number;
  win32ErrorCode: number;
  reason?: string;
}

export interface DdrescueRetryEvent {
  timestampMs: number;
  lba: number;
  sectorCount: number;
  phase: 'copying' | 'trimming' | 'retrying';
  attempt: number;
  maxRetries: number;
  outcome: 'recovered' | 'escalated' | 'permanent_bad';
  win32ErrorCode: number;
}

export interface DdrescueBackendStatus {
  isRunning: boolean;
  phase: 'idle' | 'copying' | 'trimming' | 'retrying' | 'paused' | 'completed' | 'error';
  driveIndex: number;
  driveModel: string;
  driveSerial: string;
  sectorSize: number;
  rangeStartLba: number;
  rangeEndLba: number;
  outputPath: string;
  mapPath: string;
  chunkSectors: number;
  maxRetries: number;
  zeroFillBad: boolean;
  totalSectors: number;
  finishedSectors: number;
  nonTriedSectors: number;
  nonTrimmedSectors: number;
  nonScrapedSectors: number;
  badSectors: number;
  pass1AttemptedSectors: number;
  pass1RescuedSectors: number;
  pass2AttemptedSectors: number;
  pass2RescuedSectors: number;
  pass3AttemptedSectors: number;
  pass3RescuedSectors: number;
  totalRetryAttempts: number;
  rescuedOnRetrySectors: number;
  bytesWritten: number;
  currentLba: number;
  throughputMbSec: number;
  elapsedMs: number;
  lastError?: string | null;
  intervals: LbaCloneDomainInterval[];
  recentEvents: DdrescueRetryEvent[];
}

// ---------------------------------------------------------------------------
// Damaged LBA Affected-File Tracer (MFT / FAT32 / exFAT) Types
// ---------------------------------------------------------------------------
export interface LbaFileExtent {
  startLba: number;
  endLba: number;
  vcnStart: number;
  lcnStart: number;
  clusterCount: number;
}

export interface LbaAffectedFileRecord {
  fileName: string;
  fullPath: string;
  filesystem: 'NTFS' | 'FAT32' | 'exFAT' | 'UNKNOWN';
  mftRecordNumber?: number;
  startCluster?: number;
  fileSizeBytes: number;
  isDirectory: boolean;
  isSystemMetafile: boolean;
  matchConfidence: 'exact_extent' | 'resident_mft' | 'metadata_zone' | 'unallocated_or_unknown';
  extents: LbaFileExtent[];
  creationTimestampMs?: number;
  note?: string;
}

export interface LbaFileTraceResult {
  supported: boolean;
  targetLba: number;
  sectorSize: number;
  partitionName: string;
  partitionStartLba: number;
  partitionEndLba: number;
  filesystem: 'NTFS' | 'FAT32' | 'exFAT' | 'UNKNOWN';
  clusterSizeBytes: number;
  sectorsPerCluster: number;
  targetLcn: number | null;
  mftRecordsScanned: number;
  elapsedMs: number;
  aborted: boolean;
  affectedFiles: LbaAffectedFileRecord[];
  diagnosticNote: string;
}

// ---------------------------------------------------------------------------
// NVMe/ATA Secure Erase (Sanitize/Format) & SSD TRIM Center Types
// ---------------------------------------------------------------------------
export type SanitizeActionId =
  | 'volume_trim'
  | 'nvme_format_user'
  | 'nvme_format_crypto'
  | 'ata_security_erase';

export interface DriveSanitizeCapability {
  supported: boolean;
  driveIndex: number;
  model: string;
  serialNumber: string;
  protocol: 'ATA' | 'NVMe' | 'UNSUPPORTED';
  isSystemDrive: boolean;
  mountedVolumes: string[];
  trimSupported: boolean;
  osTrimEnabled: boolean | null;
  ataSecurity: {
    supported: boolean;
    enabled: boolean;
    locked: boolean;
    frozen: boolean;
    countExpired: boolean;
    enhancedEraseSupported: boolean;
    eraseTimeMin: number;
    enhancedEraseTimeMin: number;
  };
  nvmeFormat: {
    formatSupported: boolean;
    cryptoEraseSupported: boolean;
    sanitizeBlockErase: boolean;
    sanitizeCryptoErase: boolean;
    sanitizeOverwrite: boolean;
    oacsRaw: number;
    fnaRaw: number;
    sanicapRaw: number;
  };
  reason?: string;
}

export interface SanitizeExecutionResult {
  success: boolean;
  action: SanitizeActionId | string;
  win32ErrorCode?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Multi-Drive Fleet Matrix & CLI Batch Automation Types
// ---------------------------------------------------------------------------
export type CliBatchAction = 'smart-snapshot' | 'quick-verify' | 'full-audit';

export interface FleetMatrixRow {
  driveId: string;
  driveIndex: number;
  model: string;
  serialNumber: string;
  busType: string;
  capacityGb: number | null;
  mountPoint: string;
  healthScore: number | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  reallocatedOrMediaErrors: number;
  pendingSectors: number;
  trimSupported: boolean | null;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
}
