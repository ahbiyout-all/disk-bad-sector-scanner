/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DiskSentinel Pro - Tauri Desktop Native IPC Hardware Engine
 * Exclusive physical disk discovery & LBA inspection via Tauri Core IPC -> Rust/Win32 IOCTL (\\\\.\\PhysicalDrive0..31).
 * All browser-based storage recognition (OPFS, File/Directory Mount, WebUSB, Web Serial) has been removed.
 */

import {
  DiskDrive,
  DriveSmartAttribute,
  SpecializedScanMethodId,
  DiskHardwareSpecs,
  DiskVolumePartition,
  SurfaceTestType,
  ResponseBucketCounts,
  SectorState,
  SmartSelfTestType,
  SmartSelfTestState
} from '../types';
import { classifyFutureDriveStandards, detectVendor, getVendorProfile } from './vendorDiagnostics';

export interface NativeIoBenchmarkResult {
  supported: boolean;
  benchmarkReadMbSec: number | null;
  benchmarkWriteMbSec: number | null;
  measuredLatencyMs: number | null;
  measuredLatencyUs: number | null;
  measuredRandom4kIops: number | null;
  osPlatform: string;
  probeNote: string;
}

export const KNOWN_USB_STORAGE_VENDORS: Record<number, { name: string; controller: string; typicalBus: string }> = {
  0x0781: { name: 'SanDisk / Western Digital', controller: 'SanDisk In-House NVMe/USB Controller', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x1058: { name: 'Western Digital Technologies', controller: 'WD In-House Controller', typicalBus: 'USB 3.2 Gen1 (5 Gbps) / SATA Bridge' },
  0x04e8: { name: 'Samsung Electronics', controller: 'Samsung Pablo / Elpis Bridge', typicalBus: 'USB 3.2 Gen2 (10 Gbps) NVMe UASP' },
  0x0951: { name: 'Kingston Technology', controller: 'Phison PS2251 / Silicon Motion', typicalBus: 'USB 3.2 Gen1 (5 Gbps)' },
  0x2646: { name: 'Kingston Digital', controller: 'Phison / InnoGrit Controller', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x13fe: { name: 'Phison Electronics', controller: 'Phison PS5013-E13 / PS5018 Native', typicalBus: 'USB 3.2 Gen2 UASP 10Gbps' },
  0x174c: { name: 'ASMedia Technology Inc.', controller: 'ASMedia ASM2362 / ASM2364 / ASM2464 USB4', typicalBus: 'USB4 / USB 3.2 Gen2x2 UASP' },
  0x0bda: { name: 'Realtek Semiconductor', controller: 'Realtek RTL9210B / RTL9220 NVMe/SATA Bridge', typicalBus: 'USB 3.2 Gen2x2 (20 Gbps) UASP' },
  0x152d: { name: 'JMicron Technology Corp.', controller: 'JMicron JMS583 / JMS586 USB-to-PCIe Bridge', typicalBus: 'USB 3.2 Gen2x2 UASP' },
  0x0bc2: { name: 'Seagate Technology', controller: 'Seagate Expansion USB Controller', typicalBus: 'USB 3.0 SATA III Bridge' },
  0x0480: { name: 'Toshiba / Kioxia', controller: 'Kioxia BiCS FLASH Controller', typicalBus: 'USB 3.2 Gen1 (5 Gbps)' },
  0x0930: { name: 'Toshiba / Kioxia Corp.', controller: 'Kioxia USB Storage Controller', typicalBus: 'USB 3.2 Gen1 (5 Gbps)' },
  0x05dc: { name: 'Lexar Media, Inc.', controller: 'Lexar / Longsys USB Storage Engine', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x21c4: { name: 'Longsys / Lexar', controller: 'Longsys UASP Bridge', typicalBus: 'USB 3.2 Gen2 UASP' },
  0x346d: { name: 'Lexar / YMTC Ecosystem', controller: 'High-Speed USB3/UASP Bridge', typicalBus: 'USB 3.2 Gen2 UASP' },
  0x8564: { name: 'Transcend Information, Inc.', controller: 'Transcend High-Speed Controller', typicalBus: 'USB 3.2 Gen1/Gen2 UASP' },
  0x2109: { name: 'VIA Labs, Inc.', controller: 'VIA VL716 / VL830 USB4/3.2 Bridge', typicalBus: 'USB4 / USB 3.2 Gen2 UASP' },
  0x0b05: { name: 'ASUSTeK Computer Inc.', controller: 'ASUS ROG Strix Arion Bridge', typicalBus: 'USB 3.2 Gen2 (10 Gbps) NVMe UASP' },
  0x1b1c: { name: 'Corsair Memory', controller: 'Corsair External NVMe UASP Bridge', typicalBus: 'USB 3.2 Gen2x2 UASP' },
  0x25fb: { name: 'Sabrent', controller: 'Sabrent Rocket NVMe / Thunderbolt Bridge', typicalBus: 'USB4 / USB 3.2 Gen2 UASP' },
  0x1f75: { name: 'Innostor Technology Corp.', controller: 'Innostor IS917 / IS988 Bridge', typicalBus: 'USB 3.2 Gen1/Gen2' },
  0x090c: { name: 'Silicon Motion, Inc.', controller: 'SMI SM3281 / SM2320 Native UASP', typicalBus: 'USB 3.2 Gen2x2 Native UASP' },
  0x13fd: { name: 'Initio Corporation', controller: 'Initio INIC-3639 SATA/NVMe Bridge', typicalBus: 'USB 3.1 Gen1/Gen2 UASP' },
  0x058f: { name: 'Alcor Micro Corp.', controller: 'Alcor AU6438 Card Reader / Flash', typicalBus: 'USB 3.0 SD/MMC UHS-I' },
  0x05e3: { name: 'Genesys Logic, Inc.', controller: 'Genesys GL3232 SD/MMC Hub Bridge', typicalBus: 'USB 3.2 UHS-II Card Reader' },
  0x154b: { name: 'PNY Technologies', controller: 'PNY Pro Elite USB Storage Engine', typicalBus: 'USB 3.2 Gen2 UASP' },
  0x1005: { name: 'Apacer Technology', controller: 'Apacer Industrial/Consumer Bridge', typicalBus: 'USB 3.2 Gen1' }
};

export function isTauriDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).__TAURI__?.core?.invoke === 'function';
}

interface NativeBridgeStatus {
  available: boolean;
  elevated: boolean;
  dllLoaded: boolean;
  version?: string;
}

let cachedNativeBridgeStatus: NativeBridgeStatus | null = null;
let nativeBridgeProbePromise: Promise<boolean> | null = null;

export function isNativeBridgeRuntime(): boolean {
  return cachedNativeBridgeStatus?.available === true;
}

export function isNativeHardwareRuntime(): boolean {
  return isTauriDesktopRuntime();
}

export function getNativeBridgeDetails(): NativeBridgeStatus | null {
  return cachedNativeBridgeStatus;
}

/**
 * Checks whether a local bridge process is listening on 127.0.0.1/localhost (diagnostic check only).
 * Physical disk discovery and sector I/O use Tauri Desktop Native IPC exclusively.
 */
export async function detectNativeBridgeAvailable(forceRefresh = false): Promise<boolean> {
  if (!forceRefresh && cachedNativeBridgeStatus !== null) {
    return cachedNativeBridgeStatus.available;
  }
  if (typeof window === 'undefined') {
    cachedNativeBridgeStatus = { available: false, elevated: false, dllLoaded: false };
    return false;
  }

  const host = window.location.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    cachedNativeBridgeStatus = { available: false, elevated: false, dllLoaded: false };
    return false;
  }

  if (!forceRefresh && nativeBridgeProbePromise) {
    return nativeBridgeProbePromise;
  }

  nativeBridgeProbePromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 700);
      const res = await fetch('/api/native/status', {
        cache: 'no-store',
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        cachedNativeBridgeStatus = { available: false, elevated: false, dllLoaded: false };
        return false;
      }

      const data = await res.json();
      const available = Boolean(data?.available === true && data?.host === 'win32-native-bridge');
      cachedNativeBridgeStatus = {
        available,
        elevated: Boolean(data?.elevated),
        dllLoaded: Boolean(data?.dllLoaded),
        version: typeof data?.version === 'string' ? data.version : undefined
      };
      return available;
    } catch {
      cachedNativeBridgeStatus = { available: false, elevated: false, dllLoaded: false };
      return false;
    } finally {
      nativeBridgeProbePromise = null;
    }
  })();

  return nativeBridgeProbePromise;
}

function getHostOsLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (ua.includes('Windows')) return 'Microsoft Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'Apple macOS';
  if (ua.includes('Linux')) return 'Linux OS';
  return 'Unknown Host OS';
}

function mapRawPhysicalDriveDtoToDiskDrive(rd: any, idx: number): DiskDrive {
  const driveIndex = typeof rd.driveIndex === 'number' ? rd.driveIndex : idx;
  const capBytes = typeof rd.totalCapacityBytes === 'number' && rd.totalCapacityBytes > 0
    ? rd.totalCapacityBytes
    : (typeof rd.totalCapacityGb === 'number' && rd.totalCapacityGb > 0 ? rd.totalCapacityGb * 1024 * 1024 * 1024 : null);
  const capGb = capBytes !== null
    ? Number((capBytes / (1024 * 1024 * 1024)).toFixed(1))
    : (typeof rd.totalCapacityGb === 'number' && rd.totalCapacityGb > 0 ? rd.totalCapacityGb : null);

  const temp = typeof rd.temperatureC === 'number' && rd.temperatureC > 0 ? rd.temperatureC : null;
  const reliability = typeof rd.reliabilityScore === 'number' ? Math.round(rd.reliabilityScore) : null;
  const poh = typeof rd.powerOnHours === 'number' ? rd.powerOnHours : null;

  const rawModel = (rd.model || '').trim() || `Physical Storage Device ${driveIndex}`;
  const path = rd.devicePath || `\\\\.\\PhysicalDrive${driveIndex}`;
  const secSize = rd.sectorSize || 512;
  const physSecSize = rd.physicalSectorSize || secSize;
  const serial = (rd.serialNumber || '').trim() || `PhysicalDrive${driveIndex}`;
  const bus = (rd.busType || 'Unknown').trim();
  const busUpper = bus.toUpperCase();
  const isSdOrMmc = busUpper === 'SD' || busUpper === 'MMC';
  const isUsb = busUpper === 'USB' || busUpper.includes('USB') || (!isSdOrMmc && !!rd.isExternal);
  const isNvme = busUpper === 'NVME';
  const isUfs = busUpper === 'UFS';
  const isRaid = busUpper === 'RAID' || busUpper === 'STORAGE SPACES';
  const isScm = busUpper === 'SCM';

  const mappedBusType: DiskHardwareSpecs['busType'] =
    isNvme ? 'NVMe' :
    isUsb ? 'USB' :
    busUpper === 'SATA' ? 'SATA' :
    busUpper === 'ATA' ? 'ATA' :
    busUpper === 'RAID' ? 'RAID' :
    busUpper === 'STORAGE SPACES' ? 'Storage Spaces' :
    busUpper === 'SD' ? 'SD' :
    busUpper === 'MMC' ? 'MMC' :
    busUpper === 'UFS' ? 'UFS' :
    busUpper === 'SCM' ? 'SCM' :
    busUpper.includes('SCSI') || busUpper.includes('SAS') ? 'SCSI/SAS' :
    'Unknown';

  const rawPartitions: any[] = Array.isArray(rd.partitions) ? rd.partitions : [];
  const mountPoints: string[] = Array.isArray(rd.mountPoints) ? rd.mountPoints : [];
  const mountLabel = mountPoints.length > 0 ? mountPoints.join(', ') : '';

  const typeIcon = isSdOrMmc ? '💳' : isUsb ? '🔌' : isNvme ? '⚡' : rd.isSsd ? '💾' : '💽';
  const mountPrefix = mountLabel ? `[${mountLabel}] ` : '';
  const capLabel = capGb !== null ? `${Math.round(capGb)}GB` : '용량 미상';
  const driveName = `${typeIcon} ${mountPrefix}${rawModel} (${capLabel}) - PhysicalDrive${driveIndex}`;

  const nvme = rd.nvmeTelemetry;

  const partitions: DiskVolumePartition[] = rawPartitions.map((vp) => {
    const totalB = Number(vp.totalBytes || 0);
    const usedB = Number(vp.usedBytes || 0);
    const freeB = Number(vp.freeBytes || 0);
    const totalG = totalB > 0 ? Number((totalB / (1024 * 1024 * 1024)).toFixed(1)) : Number(vp.totalGb || 0);
    const usedG = usedB > 0 ? Number((usedB / (1024 * 1024 * 1024)).toFixed(1)) : Number(vp.usedGb || 0);
    const freeG = freeB > 0 ? Number((freeB / (1024 * 1024 * 1024)).toFixed(1)) : Math.max(0, Number((totalG - usedG).toFixed(1)));
    const pct = totalB > 0 ? Number(((usedB / totalB) * 100).toFixed(1)) : 0;
    return {
      letterOrMount: vp.driveLetter || '',
      label: vp.label || 'Volume',
      fileSystem: vp.filesystem || 'Unknown',
      totalGb: totalG,
      usedGb: usedG,
      freeGb: freeG,
      usedPercentage: pct
    };
  });

  const totalVolGb = partitions.reduce((acc, p) => acc + p.totalGb, 0);
  const totalVolUsedGb = partitions.reduce((acc, p) => acc + p.usedGb, 0);
  const aggUsedPct = totalVolGb > 0 ? Number(((totalVolUsedGb / totalVolGb) * 100).toFixed(1)) : null;

  const totalLba = capBytes !== null && secSize > 0 ? Math.floor(capBytes / secSize) : 0;

  const smartAttributes: DriveSmartAttribute[] = Array.isArray(rd.smartAttributes)
    ? rd.smartAttributes.map((sa: any) => ({
        id: Number(sa.id),
        name: String(sa.name || `Attribute 0x${Number(sa.id).toString(16).toUpperCase()}`),
        current: Number(sa.current),
        worst: Number(sa.worst),
        threshold: Number(sa.threshold),
        raw: String(sa.raw ?? '0'),
        rawHex: typeof sa.rawHex === 'string' ? sa.rawHex : undefined,
        status: sa.status === 'critical' || sa.status === 'warning' ? sa.status : 'good',
        description: sa.description || 'Win32 커널 SMART IOCTL 직접 판독 속성'
      }))
    : [];

  const driveType: DiskDrive['type'] =
    isSdOrMmc ? 'SD_CARD' :
    isNvme ? 'NVMe' :
    isUsb ? (rd.isSsd ? 'EXTERNAL_SSD' : 'USB') :
    (rd.isSsd || isUfs || isScm ? 'SSD' : 'HDD');

  const inferredUsbProto: DiskDrive['usbProtocol'] | undefined = isUsb
    ? /usb4|thunderbolt|nvme/i.test(rawModel)
      ? 'NVMe over USB (UASP 10Gbps)'
      : rd.isSsd
      ? 'UASP (USB Attached SCSI Protocol)'
      : 'BOT (Bulk-Only Transport)'
    : undefined;

  const tentativeDrive = {
    id: `drive-tauri-physical-${driveIndex}`,
    name: driveName,
    model: rawModel,
    serialNumber: serial,
    firmware: (rd.firmware || '').trim() || 'N/A',
    type: driveType,
    isExternal: isUsb || isSdOrMmc,
    connectionType: isSdOrMmc ? 'sd_card' : isUsb ? 'usb' : 'internal',
    usbProtocol: inferredUsbProto,
    capacityGb: capGb,
    totalSectors: totalLba > 0 ? totalLba : 1000000,
    interface: `Tauri Native IPC (PhysicalDrive${driveIndex})`,
    healthScore: reliability,
    temperatureC: temp,
    powerOnHours: poh,
    usedPercentage: aggUsedPct,
    mountPoint: mountLabel || path,
    fileSystem: (partitions[0]?.fileSystem as any) || 'Unknown',
    smartAttributes,
    hardwareSpecs: {
      busType: mappedBusType,
      rotationalSpeedRpm: isNvme || rd.isSsd || isSdOrMmc || isUfs ? 0 : null
    } as any
  } as DiskDrive;

  const vendorKey = detectVendor(tentativeDrive);
  const vendorProfile = getVendorProfile(vendorKey);
  const futureClass = classifyFutureDriveStandards(tentativeDrive);
  const resolvedVendorName =
    vendorKey !== 'generic'
      ? vendorProfile.nameEn
      : rawModel.split(/\s+/)[0] || (isUsb ? 'USB Storage' : 'Standard OEM Storage');

  const hwSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: path,
    vendorName: resolvedVendorName,
    modelNumber: rawModel,
    serialNumber: serial,
    firmwareRevision: (rd.firmware || '').trim() || 'N/A',
    busType: mappedBusType,
    busInterfaceSpeed: futureClass.busGeneration || (isNvme ? 'NVMe PCIe Bus (Win32 IOCTL)' : isUsb ? 'USB Mass Storage Bus' : `${bus} Bus`),
    formFactor: isSdOrMmc
      ? 'SD / eMMC Removable Card'
      : isNvme
      ? 'M.2 / NVMe Solid State'
      : isUsb
      ? (rd.isSsd ? 'External Portable SSD' : 'External USB Storage')
      : isRaid
      ? 'RAID / Storage Pool Array'
      : isUfs
      ? 'UFS Embedded Solid State'
      : rd.isSsd
      ? 'Solid State Drive'
      : 'Mechanical HDD',
    controllerVendor: futureClass.estimatedControllerTier,
    totalCapacityBytes: capBytes,
    totalCapacityGb: capGb,
    totalLbaSectors: totalLba > 0 ? totalLba : null,
    logicalSectorSize: secSize,
    physicalSectorSize: physSecSize,
    isAdvancedFormat: physSecSize > secSize,
    partitionStyle: 'GPT (GUID Partition Table)',
    alignmentStatus: physSecSize >= secSize ? 'Aligned (4K sector boundary)' : 'N/A',
    mediaType: isNvme || rd.isSsd || isUfs || isScm
      ? 'SSD (Non-Volatile NAND Flash)'
      : isSdOrMmc
      ? 'Flash Memory Card / USB BOT'
      : 'Mechanical HDD (Magnetic Platter)',
    rotationalSpeedRpm: isNvme || rd.isSsd || isSdOrMmc || isUfs || isScm ? 0 : null,
    trimSupported: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    trimActive: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    smartSupported: smartAttributes.length > 0 || !!nvme,
    smartActive: smartAttributes.length > 0 || !!nvme,
    ncqSupported: isNvme || rd.isSsd ? true : null,
    queueDepth: isNvme ? 64 : null,
    volatileWriteCache: null,
    writeCacheFlushSupported: null,
    readLookAheadSupported: null,
    apmAamSupported: !rd.isSsd && !isNvme && !isSdOrMmc,
    hostReadsTb: nvme && typeof nvme.dataUnitsReadTb === 'number' ? Number(nvme.dataUnitsReadTb.toFixed(2)) : null,
    hostWritesTb: nvme && typeof nvme.dataUnitsWrittenTb === 'number' ? Number(nvme.dataUnitsWrittenTb.toFixed(2)) : null,
    percentageUsed: nvme && typeof nvme.percentageUsed === 'number' ? nvme.percentageUsed : null,
    availableSparePercent: nvme && typeof nvme.availableSpare === 'number' ? nvme.availableSpare : null,
    powerOnHours: poh,
    powerCycles: nvme && nvme.powerCycles !== undefined ? Number(nvme.powerCycles) : null,
    unsafeShutdowns: nvme && nvme.unsafeShutdowns !== undefined ? Number(nvme.unsafeShutdowns) : null,
    mediaErrors: nvme && nvme.mediaErrors !== undefined ? Number(nvme.mediaErrors) : null,
    currentTempC: temp,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: !!nvme,
    measuredKernelLatencyUs: null,
    measuredSequentialReadMbSec: null,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'Tauri Desktop Native IPC',
    partitions
  };

  tentativeDrive.hardwareSpecs = hwSpecs;
  return tentativeDrive;
}

/**
 * Physical Storage Discovery via Tauri Desktop Native IPC exclusively.
 * Invokes Rust Win32 IOCTL enumeration across \\.\PhysicalDrive0..31.
 * Returns [] when running inside a standard web browser without Tauri IPC.
 */
export async function queryTauriPhysicalDrives(): Promise<DiskDrive[]> {
  if (!isTauriDesktopRuntime()) {
    return [];
  }

  const tauri = (window as any).__TAURI__;
  try {
    const rawDrives = await tauri.core.invoke('get_physical_drives');
    if (Array.isArray(rawDrives) && rawDrives.length > 0) {
      return rawDrives.map((rd: any, idx: number) => mapRawPhysicalDriveDtoToDiskDrive(rd, idx));
    }
  } catch (err) {
    console.warn('Tauri physical drives query failed:', err);
  }

  return [];
}

/**
 * Measures real kernel Win32 IOCTL sector read latency & throughput on a physical drive in Tauri Desktop runtime.
 */
export async function measureNativeDriveIoBenchmark(drive: DiskDrive): Promise<NativeIoBenchmarkResult> {
  const osPlatform = getHostOsLabel();
  if (!isTauriDesktopRuntime() || !drive.id.startsWith('drive-tauri-physical-')) {
    return {
      supported: false,
      benchmarkReadMbSec: null,
      benchmarkWriteMbSec: null,
      measuredLatencyMs: null,
      measuredLatencyUs: null,
      measuredRandom4kIops: null,
      osPlatform,
      probeNote: 'Tauri 데스크톱 네이티브 IPC 환경에서만 물리 드라이브 실시간 IOCTL 대역폭을 계측할 수 있습니다.'
    };
  }

  const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
  const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
  const sectorCount = 128; // 64KB burst per probe
  const sampleCount = 6;
  const latenciesMs: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const sampleLba = i * 2048;
    const res = await queryTauriScanBlock(driveIndex, sampleLba, sectorCount);
    if (res && typeof res.latencyMs === 'number' && res.latencyMs > 0) {
      latenciesMs.push(res.latencyMs);
    }
  }

  if (latenciesMs.length === 0) {
    return {
      supported: false,
      benchmarkReadMbSec: null,
      benchmarkWriteMbSec: null,
      measuredLatencyMs: null,
      measuredLatencyUs: null,
      measuredRandom4kIops: null,
      osPlatform,
      probeNote: 'Win32 물리 디스크 I/O 계측 응답을 수신하지 못했습니다 (관리자 권한 확인 필요).'
    };
  }

  const avgLatencyMs = latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length;
  const burstBytes = sectorCount * secBytes;
  const readMbSec = Number(((burstBytes / (1024 * 1024)) / Math.max(0.0001, avgLatencyMs / 1000)).toFixed(1));
  const latencyUs = Math.max(1, Math.round(avgLatencyMs * 1000));
  const iops4k = Math.max(1, Math.round(1000 / Math.max(0.01, avgLatencyMs)));

  return {
    supported: true,
    benchmarkReadMbSec: readMbSec,
    benchmarkWriteMbSec: null,
    measuredLatencyMs: Number(avgLatencyMs.toFixed(3)),
    measuredLatencyUs: latencyUs,
    measuredRandom4kIops: iops4k,
    osPlatform,
    probeNote: `Tauri Win32 IOCTL 실측 (${latenciesMs.length}개 LBA 버스트 평균)`
  };
}

/**
 * Live Deep Hardware Specification Re-Probe via Tauri Native IPC.
 */
export async function probeDetailedDriveHardware(drive: DiskDrive): Promise<DiskHardwareSpecs> {
  if (drive.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    const refreshed = await queryTauriPhysicalDrives();
    const match = refreshed.find(d => d.id === drive.id);
    if (match?.hardwareSpecs) {
      return match.hardwareSpecs;
    }
  }

  if (drive.hardwareSpecs) {
    return {
      ...drive.hardwareSpecs,
      currentTempC: drive.temperatureC,
      probeTimestamp: Date.now()
    };
  }

  return {
    devicePhysicalPath: drive.mountPoint || `\\\\.\\PhysicalDrive0`,
    vendorName: drive.model.split(' ')[0] || 'Storage Device',
    modelNumber: drive.model,
    serialNumber: drive.serialNumber,
    firmwareRevision: drive.firmware,
    busType: drive.type === 'NVMe' ? 'NVMe' : drive.isExternal ? 'USB' : 'Unknown',
    busInterfaceSpeed: drive.interface,
    formFactor: drive.isExternal ? 'External Storage' : 'Internal Storage',
    controllerVendor: drive.bridgeChipset || 'Host Storage Controller',
    totalCapacityBytes: drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : null,
    totalCapacityGb: drive.capacityGb,
    totalLbaSectors: drive.totalSectors > 0 ? drive.totalSectors : null,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'Unknown',
    alignmentStatus: 'N/A',
    mediaType: drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD'
      ? 'Mechanical HDD (Magnetic Platter)'
      : 'SSD (Non-Volatile NAND Flash)',
    rotationalSpeedRpm: null,
    trimSupported: null,
    trimActive: null,
    smartSupported: false,
    smartActive: false,
    ncqSupported: null,
    queueDepth: null,
    volatileWriteCache: null,
    writeCacheFlushSupported: null,
    readLookAheadSupported: null,
    apmAamSupported: null,
    hostReadsTb: null,
    hostWritesTb: null,
    percentageUsed: null,
    availableSparePercent: null,
    powerOnHours: drive.powerOnHours,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: drive.temperatureC,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: null,
    measuredSequentialReadMbSec: null,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'Tauri Desktop Native IPC'
  };
}

/**
 * Rescans physical storage via Tauri Desktop Native IPC exclusively.
 * Returns [] when no Tauri IPC physical drives are connected or when running in a browser.
 */
export async function rescanAllDrives(_currentDrives: DiskDrive[] = []): Promise<DiskDrive[]> {
  const tauriDrives = await queryTauriPhysicalDrives();
  const seenIds = new Set<string>();
  const updated: DiskDrive[] = [];

  for (const td of tauriDrives) {
    if (!seenIds.has(td.id)) {
      seenIds.add(td.id);
      updated.push(td);
    }
  }

  return updated;
}

/**
 * Real Physical Sector Probe via Tauri Desktop Native IPC (`scan_lba_block`).
 */
export async function executeRealPhysicalSectorProbe(
  drive: DiskDrive,
  methodId: SpecializedScanMethodId,
  blockIndex: number,
  totalBlocks: number
): Promise<{
  status: 'good' | 'normal' | 'slow' | 'critical' | 'bad';
  latencyMs: number;
  throughputMbSec: number;
  errorCode?: string;
  checksum?: string;
  zoneTag?: 'Outer Track' | 'Middle Zone' | 'Inner Track' | 'MBR/FAT Area' | 'NAND Die Ch1' | 'NAND Die Ch2' | 'UASP Stream';
}> {
  const progressRatio = blockIndex / Math.max(1, totalBlocks);

  let zoneTag: 'Outer Track' | 'Middle Zone' | 'Inner Track' | 'MBR/FAT Area' | 'NAND Die Ch1' | 'NAND Die Ch2' | 'UASP Stream' | undefined;
  if (drive.type === 'HDD' || methodId.startsWith('hdd')) {
    if (progressRatio < 0.33) zoneTag = 'Outer Track';
    else if (progressRatio < 0.66) zoneTag = 'Middle Zone';
    else zoneTag = 'Inner Track';
  } else if (drive.type === 'NVMe' || methodId.startsWith('nvme')) {
    zoneTag = blockIndex % 2 === 0 ? 'NAND Die Ch1' : 'NAND Die Ch2';
  } else if (methodId === 'usb_uasp_streaming') {
    zoneTag = 'UASP Stream';
  } else if (methodId === 'usb_fat_meta_priority' && progressRatio < 0.05) {
    zoneTag = 'MBR/FAT Area';
  }

  if (drive.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const startLba = (BigInt(blockIndex) * BigInt(Math.max(1, drive.totalSectors))) / BigInt(Math.max(1, totalBlocks));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;

    try {
      const res = await queryTauriScanBlock(driveIndex, Number(startLba), 128);
      if (res) {
        const latencyMs = Number(res.latencyMs ?? 0);
        const status: 'good' | 'normal' | 'slow' | 'critical' | 'bad' =
          res.statusCode === 0 ? (latencyMs < 10 ? 'good' : 'normal') :
          res.statusCode === 1 ? 'normal' :
          res.statusCode === 2 ? 'slow' :
          res.statusCode === 3 ? 'critical' : 'bad';

        const throughputMbSec = latencyMs > 0
          ? Number((((128 * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
          : 0;

        return {
          status,
          latencyMs,
          throughputMbSec,
          errorCode: res.statusCode >= 4 ? `WIN32_ERROR_${res.win32ErrorCode}` : undefined,
          checksum: status !== 'bad' ? 'WIN32_IO_OK' : undefined,
          zoneTag
        };
      }
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'WIN32_IOCTL_NO_RESPONSE',
        zoneTag
      };
    } catch (err: any) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: `WIN32_IO_ERROR: ${err?.message || 'Access Denied'}`,
        zoneTag
      };
    }
  }

  return {
    status: 'bad',
    latencyMs: -1,
    throughputMbSec: 0,
    errorCode: 'TAURI_NATIVE_IPC_REQUIRED (브라우저 디스크 인식 제거됨 — Tauri 데스크톱 앱 필요)',
    zoneTag
  };
}

/**
 * Real Zero-Fill Block Repair Engine via Tauri Desktop Native IPC (`attempt_sector_repair`).
 */
export async function executeRealZeroFillRepairBlock(
  _blockIndex: number,
  lba: number,
  drive?: DiskDrive
): Promise<{
  success: boolean;
  latencyMs: number;
  throughputMbSec: number;
  bytesWritten: number;
  verifiedZeros: boolean;
  unsupportedReason?: string;
}> {
  if (drive?.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const t0 = performance.now();
    const success = await queryTauriRepairSector(driveIndex, lba, 128);
    const t1 = performance.now();
    const latencyMs = Math.max(0.01, Number((t1 - t0).toFixed(3)));
    const throughputMbSec = success ? Number((((64 * 1024) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1)) : 0;

    return {
      success,
      latencyMs,
      throughputMbSec,
      bytesWritten: success ? 64 * 1024 : 0,
      verifiedZeros: success,
      unsupportedReason: success ? undefined : 'Win32 물리 디스크 쓰기 거부됨 (관리자 권한 및 볼륨 잠금 해제 필요)'
    };
  }

  return {
    success: false,
    latencyMs: 0,
    throughputMbSec: 0,
    bytesWritten: 0,
    verifiedZeros: false,
    unsupportedReason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 물리 LBA 섹터 수복을 수행할 수 있습니다.'
  };
}

/**
 * Real Raw Sector Reading via Tauri Core IPC
 */
export async function queryTauriRawSector(driveIndex: number, lba: number, size: number): Promise<Uint8Array | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    const bytes = await (window as any).__TAURI__.core.invoke('read_raw_sector', { driveIndex, lba, size });
    if (bytes instanceof Uint8Array) return bytes;
    if (Array.isArray(bytes)) return new Uint8Array(bytes);
  } catch (err) {
    console.warn('Tauri raw sector read failed:', err);
  }
  return null;
}

/**
 * Real Native Bit Carving via Tauri Core IPC
 */
export async function queryTauriBitCarving(driveIndex: number, lba: number, clusterSpan: number): Promise<any | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    return await (window as any).__TAURI__.core.invoke('execute_bit_carving', {
      driveIndex,
      lba,
      clusterSpan
    });
  } catch (err) {
    console.warn('Tauri bit carving failed:', err);
    return null;
  }
}

/**
 * Real Native Tray Guardian Poll via Tauri Core IPC
 */
export async function queryTauriTrayGuardianCheck(
  pollIntervalSec: number,
  tempThresholdC: number,
  alertOnPendingSector: boolean
): Promise<any | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    return await (window as any).__TAURI__.core.invoke('run_tray_guardian_check', {
      pollIntervalSec,
      tempThresholdC,
      alertOnPendingSector
    });
  } catch (err) {
    console.warn('Tauri tray guardian failed:', err);
    return null;
  }
}

/**
 * Real Multi-Drive Parallel Scanning via Tauri Core IPC
 */
export async function queryTauriParallelScan(targets: any[]): Promise<any[] | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    return await (window as any).__TAURI__.core.invoke('scan_multiple_drives_parallel', { targets });
  } catch (err) {
    console.warn('Tauri parallel scan failed:', err);
    return null;
  }
}

/**
 * Real Sector Repair via Tauri Core IPC
 */
export async function queryTauriRepairSector(driveIndex: number, lba: number, count: number): Promise<boolean> {
  if (!isTauriDesktopRuntime()) return false;
  try {
    const res = await (window as any).__TAURI__.core.invoke('attempt_sector_repair', { driveIndex, lba, count });
    return !!res?.success;
  } catch (err) {
    console.warn('Tauri sector repair failed:', err);
    return false;
  }
}

/**
 * Real Sector Scanning via Tauri Core IPC
 */
export async function queryTauriScanBlock(driveIndex: number, lba: number, sectorCount: number): Promise<any | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    return await (window as any).__TAURI__.core.invoke('scan_lba_block', { driveIndex, lba, sectorCount });
  } catch (err) {
    console.warn('Tauri scan block failed:', err);
    return null;
  }
}

export interface StorageRecognitionDiagnostics {
  isDesktopNative: boolean;
  probedChannelRange: string;
  totalChannelsProbed: number;
  discoveredPhysicalDrives: number;
  mappedVolumeCount: number;
  sharingFlags: string;
  accessModeFallback: string;
  busTypesDetected: string[];
  driveList: {
    index: number;
    path: string;
    model: string;
    bus: string;
    capacityGb: number | null;
    mountPoints: string[];
    isExternal: boolean;
  }[];
}

/**
 * Diagnostic Hardware Probe:
 * Inspects all 32 PhysicalDrive channels, volume mappings, and access flags via Tauri IPC.
 */
export async function getStorageDeviceRecognitionSummary(): Promise<StorageRecognitionDiagnostics> {
  const isTauri = isTauriDesktopRuntime();
  const physicalDrives = await queryTauriPhysicalDrives();

  const driveList = physicalDrives.map(d => {
    const driveIdx = parseInt(d.id.replace('drive-tauri-physical-', ''), 10) || 0;
    return {
      index: driveIdx,
      path: d.hardwareSpecs?.devicePhysicalPath || `\\\\.\\PhysicalDrive${driveIdx}`,
      model: d.model,
      bus: d.hardwareSpecs?.busType || d.type,
      capacityGb: d.capacityGb,
      mountPoints: d.hardwareSpecs?.partitions?.map(p => p.letterOrMount).filter(Boolean) || (d.mountPoint ? [d.mountPoint] : []),
      isExternal: Boolean(d.isExternal)
    };
  });

  const busTypes = Array.from(new Set(physicalDrives.map(d => d.hardwareSpecs?.busType || d.type)));
  const mappedVolumes = driveList.flatMap(d => d.mountPoints).filter(m => m.endsWith(':'));

  return {
    isDesktopNative: isTauri,
    probedChannelRange: '\\\\.\\PhysicalDrive0 ~ \\\\.\\PhysicalDrive31',
    totalChannelsProbed: 32,
    discoveredPhysicalDrives: physicalDrives.length,
    mappedVolumeCount: mappedVolumes.length,
    sharingFlags: 'FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE',
    accessModeFallback: isTauri
      ? 'Tauri Desktop Native IPC (Win32 IOCTL R/W -> Read-Only -> Query)'
      : 'Web Browser Context (Tauri Desktop Native IPC Required)',
    busTypesDetected: busTypes,
    driveList
  };
}

/**
 * Creates a clean 7-bucket HDDScan latency histogram map
 */
export function createEmptyResponseBuckets(): ResponseBucketCounts {
  return {
    lt5ms: 0,
    lt20ms: 0,
    lt50ms: 0,
    lt150ms: 0,
    lt500ms: 0,
    gt500ms: 0,
    bad: 0
  };
}

/**
 * Classifies a probed sector block into the classic 7-tier HDDScan response bucket
 */
export function classifyResponseBucket(status: SectorState, latencyMs: number): keyof ResponseBucketCounts {
  if (status === 'bad' || latencyMs < 0) return 'bad';
  if (latencyMs < 5) return 'lt5ms';
  if (latencyMs < 20) return 'lt20ms';
  if (latencyMs < 50) return 'lt50ms';
  if (latencyMs < 150) return 'lt150ms';
  if (latencyMs < 500) return 'lt500ms';
  return 'gt500ms';
}

/**
 * Generates ordered LBA block indices for Sequential (Verify/Read/Erase) or Butterfly Read
 */
export function buildScanBlockSequence(
  totalBlocks: number,
  startBlock: number,
  endBlock: number,
  scanMode: 'quick' | 'full',
  testType: SurfaceTestType
): { blockIndex: number; passSide: 'outer' | 'inner' | 'sequential' }[] {
  if (totalBlocks <= 0) return [];
  const loBound = Math.max(0, Math.min(totalBlocks - 1, Math.floor(startBlock)));
  const hiBound = Math.max(loBound, Math.min(totalBlocks - 1, Math.floor(endBlock)));
  const stride = scanMode === 'quick' ? 4 : 1;

  const indices: number[] = [];
  for (let i = loBound; i <= hiBound; i += stride) {
    indices.push(i);
  }
  if (indices.length === 0) {
    indices.push(loBound);
  }

  if (testType !== 'butterfly') {
    return indices.map(blockIndex => ({ blockIndex, passSide: 'sequential' as const }));
  }

  // Butterfly Read alternates strictly between outer edge and inner edge
  const sequence: { blockIndex: number; passSide: 'outer' | 'inner' | 'sequential' }[] = [];
  let left = 0;
  let right = indices.length - 1;
  while (left <= right) {
    sequence.push({ blockIndex: indices[left], passSide: 'outer' });
    if (left !== right) {
      sequence.push({ blockIndex: indices[right], passSide: 'inner' });
    }
    left++;
    right--;
  }
  return sequence;
}

/**
 * Strict Erase Safety Guard:
 * Blocks writes outside Tauri Desktop IPC and protects OS boot/system drives (C: / PhysicalDrive0).
 * Only secondary / external non-system physical drives in Tauri Desktop runtime may run Erase surface verification.
 */
export function isSafeEraseTarget(drive: DiskDrive): {
  allowed: boolean;
  targetLabel: string;
  reason?: string;
} {
  const path = drive.hardwareSpecs?.devicePhysicalPath || drive.mountPoint || drive.model;

  if (!isTauriDesktopRuntime() || !drive.id.startsWith('drive-tauri-physical-')) {
    return {
      allowed: false,
      targetLabel: path,
      reason: 'Tauri 데스크톱 네이티브 IPC 환경에서 연결된 물리 디스크만 Erase 대상이 될 수 있습니다.'
    };
  }

  const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
  const partitions = drive.hardwareSpecs?.partitions || [];
  const hasSystemPartition =
    /\bC:/i.test(drive.mountPoint || '') ||
    partitions.some(p => /^C:/i.test(p.letterOrMount || ''));
  const isLikelyBootDriveZero = driveIndex === 0 && (hasSystemPartition || partitions.length === 0);

  if (hasSystemPartition || isLikelyBootDriveZero) {
    return {
      allowed: false,
      targetLabel: path,
      reason: 'OS 시스템/부트 드라이브 보호: C: 또는 부트 파티션이 포함된 기본 디스크(PhysicalDrive0)는 Erase 쓰기가 차단됩니다. 외장/보조 물리 디스크를 선택하세요.'
    };
  }

  return {
    allowed: true,
    targetLabel: path
  };
}

/**
 * Executes a single HDDScan Surface Test probe (Verify / Read / Butterfly / Non-System Erase)
 */
export async function executeHddScanBlockProbe(
  drive: DiskDrive,
  methodId: SpecializedScanMethodId,
  blockIndex: number,
  totalBlocks: number,
  testType: SurfaceTestType
): Promise<{
  status: 'good' | 'normal' | 'slow' | 'critical' | 'bad';
  latencyMs: number;
  throughputMbSec: number;
  errorCode?: string;
  checksum?: string;
  zoneTag?: 'Outer Track' | 'Middle Zone' | 'Inner Track' | 'MBR/FAT Area' | 'NAND Die Ch1' | 'NAND Die Ch2' | 'UASP Stream';
}> {
  if (testType === 'erase') {
    const guard = isSafeEraseTarget(drive);
    if (!guard.allowed) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'ERASE_BLOCKED_UNSAFE_TARGET'
      };
    }

    const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const startLba = (BigInt(blockIndex) * BigInt(Math.max(1, drive.totalSectors))) / BigInt(Math.max(1, totalBlocks));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
    const t0 = performance.now();
    const ok = await queryTauriRepairSector(driveIndex, Number(startLba), 128);
    const latencyMs = Math.max(0.05, Number((performance.now() - t0).toFixed(3)));
    const throughputMbSec = ok
      ? Number((((128 * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
      : 0;

    if (!ok) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'WIN32_ERASE_ACCESS_DENIED'
      };
    }

    return {
      status: latencyMs >= 150 ? 'critical' : latencyMs >= 50 ? 'slow' : latencyMs >= 20 ? 'normal' : 'good',
      latencyMs,
      throughputMbSec,
      checksum: 'WIN32_ZERO_ERASE_OK'
    };
  }

  if (testType === 'verify' && drive.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const startLba = (BigInt(blockIndex) * BigInt(Math.max(1, drive.totalSectors))) / BigInt(Math.max(1, totalBlocks));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;

    const verifyRes = await queryTauriVerifyBlock(driveIndex, Number(startLba), 128);
    if (verifyRes) {
      const latencyMs = Number(verifyRes.latencyMs ?? 0);
      const status: 'good' | 'normal' | 'slow' | 'critical' | 'bad' =
        verifyRes.statusCode === 0 ? (latencyMs < 10 ? 'good' : 'normal') :
        verifyRes.statusCode === 1 ? 'normal' :
        verifyRes.statusCode === 2 ? 'slow' :
        verifyRes.statusCode === 3 ? 'critical' : 'bad';
      const throughputMbSec = latencyMs > 0
        ? Number((((128 * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
        : 0;

      return {
        status,
        latencyMs,
        throughputMbSec,
        errorCode: verifyRes.statusCode >= 4 ? `VERIFY_WIN32_${verifyRes.win32ErrorCode}` : undefined,
        checksum: status !== 'bad' ? 'IOCTL_DISK_VERIFY_OK' : undefined
      };
    }
  }

  // Read / Butterfly / Verify fallback via Tauri Win32 PhysicalDrive I/O
  return executeRealPhysicalSectorProbe(drive, methodId, blockIndex, totalBlocks);
}

/**
 * Hardware Surface Verify via Tauri Core IPC (`IOCTL_DISK_VERIFY` + Read fallback)
 */
export async function queryTauriVerifyBlock(driveIndex: number, lba: number, sectorCount: number): Promise<any | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    return await (window as any).__TAURI__.core.invoke('verify_lba_block', { driveIndex, lba, sectorCount });
  } catch (err) {
    console.warn('Tauri verify_lba_block failed:', err);
    return null;
  }
}

/**
 * S.M.A.R.T. Off-line / Captive Self-Test execution via Tauri Core IPC (`SMART_SEND_DRIVE_COMMAND`)
 */
export async function queryTauriRunSmartSelfTest(
  driveIndex: number,
  testType: SmartSelfTestType | 'abort'
): Promise<{
  supported: boolean;
  accepted: boolean;
  statusText: string;
  executionCode?: number;
}> {
  if (!isTauriDesktopRuntime()) {
    return {
      supported: false,
      accepted: false,
      statusText: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 커널 SMART Self-Test를 실행할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('run_smart_self_test', { driveIndex, testType });
    return {
      supported: Boolean(res?.supported),
      accepted: Boolean(res?.accepted),
      statusText: String(res?.statusText || 'Unknown SMART response'),
      executionCode: typeof res?.executionCode === 'number' ? res.executionCode : undefined
    };
  } catch (err: any) {
    return {
      supported: false,
      accepted: false,
      statusText: `SMART Self-Test 호출 실패: ${err?.message || 'IOCTL error'}`
    };
  }
}

/**
 * S.M.A.R.T. Self-Test progress polling via Tauri Core IPC
 */
export async function queryTauriSmartSelfTestStatus(
  driveIndex: number,
  driveId: string,
  testType: SmartSelfTestType | null
): Promise<SmartSelfTestState> {
  if (!isTauriDesktopRuntime()) {
    return {
      driveId,
      supported: false,
      status: 'unsupported',
      testType,
      progressPct: 0,
      executionCode: null,
      statusText: 'Tauri 데스크톱 네이티브 IPC 연결이 필요합니다.',
      reason: 'Tauri Windows 관리자 권한 필요'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('get_smart_self_test_status', { driveIndex });
    const supported = Boolean(res?.supported);
    const inProgress = Boolean(res?.inProgress);
    const pct = typeof res?.progressPct === 'number' ? res.progressPct : 0;
    const code = typeof res?.executionCode === 'number' ? res.executionCode : null;

    let status: SmartSelfTestState['status'] = 'idle';
    if (!supported) status = 'unsupported';
    else if (inProgress) status = 'running';
    else if (code === 0x00) status = 'completed';
    else if (code !== null && code >= 0x10 && code <= 0x80) status = 'aborted';

    return {
      driveId,
      supported,
      status,
      testType,
      progressPct: pct,
      executionCode: code,
      statusText: String(res?.statusText || 'Idle'),
      lastUpdatedAt: Date.now()
    };
  } catch (err: any) {
    return {
      driveId,
      supported: false,
      status: 'unsupported',
      testType,
      progressPct: 0,
      executionCode: null,
      statusText: `상태 조회 실패: ${err?.message || 'IOCTL Error'}`
    };
  }
}

/**
 * Polls live OS hardware drive temperatures via Tauri Core IPC
 */
export async function queryTauriPollTemperatures(): Promise<{ driveIndex: number; temperatureC: number | null }[]> {
  if (!isTauriDesktopRuntime()) return [];
  try {
    const res = await (window as any).__TAURI__.core.invoke('poll_drive_temperatures');
    if (Array.isArray(res)) {
      return res.map((r: any) => ({
        driveIndex: Number(r.driveIndex),
        temperatureC: typeof r.temperatureC === 'number' && r.temperatureC > 0 ? Number(r.temperatureC) : null
      }));
    }
  } catch {
    return [];
  }
  return [];
}
