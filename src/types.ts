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
  capacityGb: number;
  totalSectors: number; // e.g. 1,000,000,000
  interface: string;
  healthScore: number; // 0 - 100%
  temperatureC: number;
  powerOnHours: number;
  defaultBadSectorProbability: number;
  smartAttributes: DriveSmartAttribute[];
  seededBadSectors?: number[]; // indices of blocks that will be bad
  seededSlowSectors?: number[]; // indices of blocks that will be slow
  // External Storage Specific Fields
  isExternal?: boolean;
  isDemoPreset?: boolean;
  usedPercentage?: number;
  usedBytes?: number;
  connectionType?: 'internal' | 'usb' | 'thunderbolt' | 'sd_card';
  usbProtocol?: 'BOT (Bulk-Only Transport)' | 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)' | 'UASP (USB Attached SCSI Protocol)' | 'NVMe over USB (UASP 10Gbps)' | 'SDIO UHS-I' | 'Thunderbolt 4 / PCIe Direct';
  isUsb2?: boolean;
  bridgeChipset?: string; // e.g. 'ASMedia ASM2362', 'Realtek RTL9210B', 'JMicron JMS579', 'Alcor Micro AU6989'
  mountPoint?: string; // e.g. 'E:', 'F:', '/Volumes/SanDisk'
  fileSystem?: 'NTFS' | 'exFAT' | 'FAT32' | 'APFS' | 'ext4' | 'f2fs';
  isEjected?: boolean;
  attachedFile?: File;
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
  devicePhysicalPath?: string; // e.g. '\\\\.\\PhysicalDrive0', '/dev/nvme0n1'
  vendorName: string;
  modelNumber: string;
  serialNumber: string;
  firmwareRevision: string;
  busType: 'NVMe' | 'SATA' | 'USB' | 'PCIe' | 'SCSI' | 'ATAPI' | 'RAID' | 'Unknown';
  busInterfaceSpeed: string;
  formFactor: string;
  controllerVendor?: string;
  
  // Physical Geometry & Addressing
  totalCapacityBytes: number;
  totalCapacityGb: number;
  totalLbaSectors: number;
  logicalSectorSize: number; // 512 or 4096
  physicalSectorSize: number; // 4096 (4Kn or 512e Advanced Format)
  isAdvancedFormat: boolean;
  partitionStyle: 'GPT (GUID Partition Table)' | 'MBR (Master Boot Record)';
  alignmentStatus: 'Aligned (4K sector boundary)' | 'Misaligned';

  // Protocols & Capabilities
  mediaType: 'SSD (Non-Volatile NAND Flash)' | 'Mechanical HDD (Magnetic Platter)' | 'Flash Memory Card / USB BOT';
  rotationalSpeedRpm: number;
  trimSupported: boolean;
  trimActive: boolean;
  smartSupported: boolean;
  smartActive: boolean;
  ncqSupported: boolean;
  queueDepth: number;
  volatileWriteCache: boolean;
  writeCacheFlushSupported: boolean;
  readLookAheadSupported: boolean;
  apmAamSupported: boolean;

  // Real-time Reliability & Endurance
  hostReadsTb: number;
  hostWritesTb: number;
  percentageUsed: number;
  availableSparePercent: number;
  powerOnHours: number;
  powerCycles: number;
  unsafeShutdowns: number;
  mediaErrors: number;
  currentTempC: number;
  maxTempRecordedC: number;
  warningTempThresholdC: number;

  // Real Hardware Direct I/O Measurements
  measuredKernelLatencyUs: number;
  measuredSequentialReadMbSec: number;
  measuredSequentialWriteMbSec: number;
  measuredRandom4kReadIops: number;
  probeTimestamp: number;
  probeMethod: 'Native Direct Win32 IOCTL' | 'W3C StorageManager & OPFS Buffer Probe' | 'WebUSB Hardware Pipe' | 'Real File Slice Direct IO' | 'HTML5 Directory File Slicing & Storage Probe';

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
  status: 'slow' | 'critical' | 'bad';
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
  smartSnapshot: DriveSmartAttribute[];
  recommendation: string;
  mediaSpecificDiagnosis?: string;
}
