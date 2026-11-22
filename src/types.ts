export type SectorState = 'unscanned' | 'good' | 'normal' | 'slow' | 'critical' | 'bad';

export type MainAppTab = 'fleet' | 'scan' | 'logs' | 'integrity' | 'health' | 'smart' | 'history';

export type AppLocale = 'ko' | 'en';

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
  | 'usb_power_glitch_recovery'
  | 'usb_usb4_pcie_direct'
  | 'usb_fake_capacity_guard';

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
  usbTopology?: UsbTopologyMetadata;
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
  logicalSectorSize: number | null; // 512 or 4096 when reported by OS/IOCTL
  physicalSectorSize: number | null; // 4096 or 512 when reported by OS/IOCTL
  isAdvancedFormat: boolean | null;
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
  availableSpareThreshold?: number | null;
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

  // Real PCIe / SATA Negotiated vs. Max Link Speed & Controller Probe
  linkProbe?: DriveBusLinkProbe | null;

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
  healthScore: number | null;
  durationSeconds: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  avgSpeedMbSec?: number;
  smartSnapshot: DriveSmartAttribute[];
  recommendation: string;
  mediaSpecificDiagnosis?: string;
}

export interface SmartHistorySnapshot {
  id: string;
  driveId: string;
  driveModel: string;
  driveSerial: string;
  timestamp: number;
  source: 'auto-poll' | 'manual' | 'scan';
  healthScore: number | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  smartAttributes: DriveSmartAttribute[];
}

export type SmartThresholdComparison = 'raw_above' | 'normalized_below';

export interface CustomSmartThresholdRule {
  id: string;
  attributeId: number;
  attributeName: string;
  comparisonMode: SmartThresholdComparison;
  defaultWarning: number | null;
  defaultCritical: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  enabled: boolean;
  isCustomAttribute?: boolean;
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

// ---------------------------------------------------------------------------
// USB Version & Device-Class Adaptive Surface Scan Matrix & Fake-Capacity Guard
// ---------------------------------------------------------------------------
export type UsbGenerationId =
  | 'usb_1_1'
  | 'usb_2_0'
  | 'usb_3_0_gen1'
  | 'usb_3_2_gen2'
  | 'usb_3_2_gen2x2'
  | 'usb4_tb';

export type UsbTransportProtocol =
  | 'BOT'
  | 'UASP'
  | 'PCIe_Tunnel'
  | 'SDIO';

export type UsbDeviceClassId =
  | 'flash_thumb'
  | 'sd_card_uhs'
  | 'external_hdd'
  | 'external_sata_ssd'
  | 'external_nvme_ssd';

export interface UsbTopologyMetadata {
  generation: UsbGenerationId;
  generationCode: number; // 11 | 20 | 30 | 31 | 32 | 40
  generationLabel: string;
  negotiatedSpeedMbps: number;
  maxPracticalMbSec: number;
  transport: UsbTransportProtocol;
  transportCode: number; // 1=BOT, 2=UASP, 3=PCIe, 4=SDIO
  transportLabel: string;
  deviceClass: UsbDeviceClassId;
  deviceClassLabel: string;
  driverService: string;
  vendorIdHex?: string;
  productIdHex?: string;
  bcdUsbHex?: string;
  portNumber?: number;
  bridgeChipset?: string;
  pnpDeviceId?: string;
  probeSource: 'win32_pnp_hub' | 'manual_override';
  bottleneckWarning?: string;
}

export interface UsbSurfaceScanPolicy {
  profileKey: string;
  profileName: string;
  generation: UsbGenerationId;
  generationLabel: string;
  transport: UsbTransportProtocol;
  deviceClass: UsbDeviceClassId;
  deviceClassLabel: string;
  methodId: SpecializedScanMethodId;
  chunkKb: number;
  chunkSectors: number;
  batchSize: number;
  slowThresholdMs: number;
  criticalThresholdMs: number;
  ioTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  cooldownEveryNBlocks: number;
  cooldownMs: number;
  thermalCapC: number;
  rationale: string;
}

export interface FakeCapacityCheckpointResult {
  label: string;
  lba: number;
  offsetBytes: number;
  crc32Hex: string;
  entropyBits: number;
  isAllZero: boolean;
  latencyMs: number;
  status: 'PASS' | 'ALIAS_COLLISION' | 'UNREACHABLE' | 'WRITE_CORRUPTION' | 'WRITE_LOCKED';
  note: string;
}

export interface FakeCapacityGuardReport {
  driveId: string;
  driveIndex: number | null;
  tier: 'tier1_readonly_alias' | 'tier2_prng_roundtrip';
  reportedCapacityBytes: number;
  verifiedBoundaryBytes: number;
  verdict: 'GENUINE_CAPACITY_VERIFIED' | 'SUSPECTED_FAKE_CAPACITY' | 'SIMULATION_UNAVAILABLE';
  summary: string;
  checkpoints: FakeCapacityCheckpointResult[];
  executedAt: number;
}

// ---------------------------------------------------------------------------
// Real PCIe / SATA Link Speed & Controller Identification Probe
// ---------------------------------------------------------------------------
export interface DriveBusLinkProbe {
  linkType: 'PCIe' | 'SATA' | 'USB' | 'Unknown';
  currentSpeedLabel: string | null;
  maxSpeedLabel: string | null;
  currentWidth: number | null;
  maxWidth: number | null;
  pcieCurrentGen: number | null;
  pcieMaxGen: number | null;
  sataCurrentGen: number | null;
  sataMaxGen: number | null;
  nvmeSpecVersion: string | null;
  effectiveBandwidthGbps: number | null;
  isLinkDowngraded: boolean | null;
  pciVendorIdHex: string | null;
  pciDeviceIdHex: string | null;
  controllerName: string | null;
  probeSource: 'win32_cfgmgr32_pci' | 'ata_identify' | 'nvme_identify' | 'unavailable';
}

// ---------------------------------------------------------------------------
// Persistent Surface Scan Checkpoints (Pause/Resume & Restart Safety)
// ---------------------------------------------------------------------------
export interface SurfaceScanCheckpointBlockPatch {
  id: number;
  status: SectorState;
  responseTimeMs: number;
  throughputMbSec?: number;
  errorCode?: string;
}

export interface SurfaceScanCheckpoint {
  version: number;
  driveId: string;
  driveModel: string;
  driveSerial: string;
  totalBlocks: number;
  testType: SurfaceTestType;
  scanMode: 'quick' | 'full';
  methodId: SpecializedScanMethodId;
  startBlock: number;
  endBlock: number;
  completedSteps: number;
  totalSteps: number;
  currentBlockIndex: number;
  currentLba: number;
  elapsedSeconds: number;
  speedMbPerSec: number;
  buckets: ResponseBucketCounts;
  scannedBlocks: SurfaceScanCheckpointBlockPatch[];
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Critical Folder / File LBA Mapping & Bit-Rot Integrity Watch
// ---------------------------------------------------------------------------
export interface IntegrityFileExtent {
  startLba: number;
  endLba: number;
  sectorCount: number;
}

export type IntegrityWatchStatus =
  | 'VERIFIED'
  | 'HASH_MISMATCH'
  | 'BAD_LBA_OVERLAP'
  | 'SLOW_LBA_OVERLAP'
  | 'MISSING_FILE'
  | 'UNREADABLE'
  | 'UNVERIFIED';

export interface IntegrityProbeResult {
  filePath: string;
  status: 'ok' | 'missing' | 'skipped_too_large' | 'unreadable';
  sizeBytes: number;
  modifiedMs: number | null;
  sha256: string | null;
  driveIndex: number | null;
  extents: IntegrityFileExtent[];
  note?: string;
}

export interface IntegrityWatchEntry {
  id: string;
  watchRootPath: string;
  filePath: string;
  fileName: string;
  driveIndex: number | null;
  sizeBytes: number;
  modifiedMs: number | null;
  baselineSha256: string | null;
  currentSha256: string | null;
  extents: IntegrityFileExtent[];
  status: IntegrityWatchStatus;
  overlappingBadLbas: number[];
  overlappingSlowLbas: number[];
  lastCheckedAt: number;
  baselineRecordedAt: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Scan & S.M.A.R.T. Attribute Diff Row
// ---------------------------------------------------------------------------
export interface ScanSmartDiffRow {
  attributeId: number;
  attributeName: string;
  rawA: string | null;
  rawB: string | null;
  numericRawA: number | null;
  numericRawB: number | null;
  rawDelta: number | null;
  currentA: number | null;
  currentB: number | null;
  currentDelta: number | null;
  statusA: DriveSmartAttribute['status'] | null;
  statusB: DriveSmartAttribute['status'] | null;
  worsened: boolean;
  improved: boolean;
}

// ---------------------------------------------------------------------------
// Global Command Palette Action Model
// ---------------------------------------------------------------------------
export interface CommandPaletteAction {
  id: string;
  category: 'navigation' | 'tools' | 'drive' | 'actions';
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  execute: () => void;
}


