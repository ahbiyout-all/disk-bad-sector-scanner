/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DiskSentinel Pro - Native Hardware Direct Probe Engine
 * Real Tauri Win32 IOCTL, W3C OPFS / StorageManager API,
 * HTML5 File/Directory Slicing, WebUSB & Web Serial Hardware Probes.
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

export interface NativeSystemStorageInfo {
  quotaBytes: number;
  usageBytes: number;
  quotaGb: number;
  usageGb: number;
  usedPercentage: number;
  isPersistent: boolean;
  opfsSupported: boolean;
  benchmarkReadMbSec: number | null;
  benchmarkWriteMbSec: number | null;
  measuredLatencyMs: number | null;
  measuredLatencyUs: number | null;
  measuredRandom4kIops: number | null;
  cpuCores: number | null;
  deviceMemoryGb?: number;
  osPlatform: string;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
}

export const KNOWN_USB_STORAGE_VENDORS: Record<number, { name: string; controller: string; typicalBus: string }> = {
  0x0781: { name: 'SanDisk / Western Digital', controller: 'SanDisk In-House NVMe/USB Controller', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x1058: { name: 'Western Digital Technologies', controller: 'WD In-House Controller', typicalBus: 'USB 3.2 Gen1 (5 Gbps) / SATA Bridge' },
  0x04e8: { name: 'Samsung Electronics', controller: 'Samsung Pablo / Elpis Bridge', typicalBus: 'USB 3.2 Gen2 (10 Gbps) NVMe UASP' },
  0x0951: { name: 'Kingston Technology', controller: 'Phison PS2251 / Silicon Motion', typicalBus: 'USB 3.2 Gen1 (5 Gbps)' },
  0x2646: { name: 'Kingston Digital', controller: 'Phison / InnoGrit Controller', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x13fe: { name: 'Phison Electronics', controller: 'Phison PS5013-E13 / PS5018 Native', typicalBus: 'USB 3.2 Gen2 UASP 10Gbps' },
  0x174c: { name: 'ASMedia Technology Inc.', controller: 'ASMedia ASM2362 / ASM2364 NVMe Bridge', typicalBus: 'USB 3.2 Gen2x2 (20 Gbps) UASP' },
  0x0bda: { name: 'Realtek Semiconductor', controller: 'Realtek RTL9210B NVMe/SATA Bridge', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x152d: { name: 'JMicron Technology Corp.', controller: 'JMicron JMS583 USB-to-PCIe Bridge', typicalBus: 'USB 3.2 Gen2 (10 Gbps) UASP' },
  0x0bc2: { name: 'Seagate Technology', controller: 'Seagate Expansion USB Controller', typicalBus: 'USB 3.0 SATA III Bridge' },
  0x0480: { name: 'Toshiba / Kioxia', controller: 'Kioxia BiCS FLASH Controller', typicalBus: 'USB 3.2 Gen1 (5 Gbps)' },
  0x05dc: { name: 'Lexar Media, Inc.', controller: 'Lexar USB Storage Engine', typicalBus: 'USB 3.1 Gen1' },
  0x8564: { name: 'Transcend Information, Inc.', controller: 'Transcend High-Speed Controller', typicalBus: 'USB 3.1 Gen1' }
};

const OPFS_PROBE_FILENAME = '__disksentinel_io_probe__.bin';
const OPFS_ERASE_TEST_FILENAME = '__disksentinel_erase_test__.bin';
const SAFE_ERASE_FILE_BYTES = 4 * 1024 * 1024; // 4 MB safe writable test surface

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
let nativeBridgeHeartbeatTimer: number | null = null;

export function isNativeBridgeRuntime(): boolean {
  return cachedNativeBridgeStatus?.available === true;
}

export function isNativeHardwareRuntime(): boolean {
  return isTauriDesktopRuntime() || isNativeBridgeRuntime();
}

export function getNativeBridgeDetails(): NativeBridgeStatus | null {
  return cachedNativeBridgeStatus;
}

/**
 * Probes the local Windows Desktop Host bridge (DiskSentinelLauncher.cs on http://127.0.0.1:<port>/api/native/status).
 * Only attempts probing on localhost/127.0.0.1 so web sandboxes / remote origins resolve immediately with false.
 */
export async function detectNativeBridgeAvailable(): Promise<boolean> {
  if (cachedNativeBridgeStatus !== null) {
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

  if (nativeBridgeProbePromise) {
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

      if (available && nativeBridgeHeartbeatTimer === null) {
        nativeBridgeHeartbeatTimer = window.setInterval(() => {
          fetch('/api/native/heartbeat', { method: 'POST', cache: 'no-store' }).catch(() => {});
        }, 15000);
      }

      return available;
    } catch {
      cachedNativeBridgeStatus = { available: false, elevated: false, dllLoaded: false };
      return false;
    }
  })();

  return nativeBridgeProbePromise;
}

/**
 * Real Origin Private File System (OPFS) Disk I/O Benchmark Probe
 * Performs actual filesystem write, flush/close, and read-back verification in the browser sandbox.
 */
async function benchmarkRealOpfsIo(): Promise<{
  opfsSupported: boolean;
  readMbSec: number | null;
  writeMbSec: number | null;
  latencyMs: number | null;
  latencyUs: number | null;
  random4kIops: number | null;
}> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
    return {
      opfsSupported: false,
      readMbSec: null,
      writeMbSec: null,
      latencyMs: null,
      latencyUs: null,
      random4kIops: null
    };
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(OPFS_PROBE_FILENAME, { create: true });

    const testSize = 512 * 1024; // 512 KB real OPFS file payload
    const payload = new Uint8Array(testSize);
    for (let i = 0; i < testSize; i++) {
      payload[i] = (i * 131 + 17) & 0xff;
    }

    // Real OPFS Write + Flush
    const tw0 = performance.now();
    const writable = await fileHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    const tw1 = performance.now();
    const writeMs = Math.max(0.05, tw1 - tw0);

    // Real OPFS Sequential Read
    const tr0 = performance.now();
    const file = await fileHandle.getFile();
    const readBuf = await file.arrayBuffer();
    const readView = new Uint8Array(readBuf);
    let checksum = 0;
    for (let i = 0; i < readView.length; i += 512) {
      checksum ^= readView[i];
    }
    const tr1 = performance.now();
    void checksum;
    const readMs = Math.max(0.05, tr1 - tr0);

    // Real 4KB Random Offset Slices inside OPFS File
    const chunkCount = 8;
    const t4k0 = performance.now();
    for (let c = 0; c < chunkCount; c++) {
      const offset = ((c * 61440) % Math.max(4096, testSize - 4096));
      const sliceBuf = await file.slice(offset, offset + 4096).arrayBuffer();
      if (sliceBuf.byteLength === 0) break;
    }
    const t4k1 = performance.now();
    const avg4kMs = Math.max(0.01, (t4k1 - t4k0) / chunkCount);

    const writeMbSec = Number(((testSize / (1024 * 1024)) / (writeMs / 1000)).toFixed(1));
    const readMbSec = Number(((readView.length / (1024 * 1024)) / (readMs / 1000)).toFixed(1));
    const measuredLatencyMs = Number(avg4kMs.toFixed(3));
    const measuredLatencyUs = Math.max(1, Math.round(avg4kMs * 1000));
    const random4kIops = Math.max(1, Math.round(1000 / avg4kMs));

    return {
      opfsSupported: true,
      readMbSec,
      writeMbSec,
      latencyMs: measuredLatencyMs,
      latencyUs: measuredLatencyUs,
      random4kIops
    };
  } catch {
    return {
      opfsSupported: false,
      readMbSec: null,
      writeMbSec: null,
      latencyMs: null,
      latencyUs: null,
      random4kIops: null
    };
  }
}

/**
 * Real Native Web Storage & OPFS I/O Probe
 */
export async function probeNativeSystemStorage(): Promise<NativeSystemStorageInfo> {
  let quotaBytes = 0;
  let usageBytes = 0;
  let isPersistent = false;

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota || 0;
      usageBytes = estimate.usage || 0;
    } catch {
      // Restricted context
    }

    if (navigator.storage.persisted) {
      try {
        isPersistent = await navigator.storage.persisted();
      } catch {
        // Restricted context
      }
    }
  }

  const opfsBench = await benchmarkRealOpfsIo();

  const quotaGb = Number((quotaBytes / (1024 * 1024 * 1024)).toFixed(1));
  const usageGb = Number((usageBytes / (1024 * 1024 * 1024)).toFixed(2));
  const usedPercentage = quotaBytes > 0 ? Number(((usageBytes / quotaBytes) * 100).toFixed(1)) : 0;

  const cpuCores = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;
  const deviceMemoryGb = typeof navigator !== 'undefined' && 'deviceMemory' in navigator
    ? (navigator as any).deviceMemory
    : undefined;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isWindows = ua.includes('Windows');
  const isMac = ua.includes('Macintosh') || ua.includes('Mac OS');
  const isLinux = ua.includes('Linux') && !ua.includes('Android');
  const osPlatform = isWindows
    ? 'Microsoft Windows'
    : isMac
    ? 'Apple macOS'
    : isLinux
    ? 'Linux OS'
    : 'Browser Host OS';

  return {
    quotaBytes,
    usageBytes,
    quotaGb,
    usageGb,
    usedPercentage,
    isPersistent,
    opfsSupported: opfsBench.opfsSupported,
    benchmarkReadMbSec: opfsBench.readMbSec,
    benchmarkWriteMbSec: opfsBench.writeMbSec,
    measuredLatencyMs: opfsBench.latencyMs,
    measuredLatencyUs: opfsBench.latencyUs,
    measuredRandom4kIops: opfsBench.random4kIops,
    cpuCores,
    deviceMemoryGb,
    osPlatform,
    isWindows,
    isMac,
    isLinux
  };
}

/**
 * Real WebUSB hardware device enumeration probe
 */
export async function probeWebUsbDevices(): Promise<{
  vendorId: number;
  productId: number;
  deviceName: string;
  manufacturerName?: string;
  serialNumber?: string;
  usbVersionMajor?: number;
  usbVersionMinor?: number;
  deviceClass?: number;
}[]> {
  if (typeof navigator !== 'undefined' && 'usb' in navigator) {
    try {
      const devices = await (navigator as any).usb.getDevices();
      return devices.map((d: any) => ({
        vendorId: d.vendorId,
        productId: d.productId,
        deviceName: d.productName || `USB Device (${d.vendorId.toString(16).padStart(4, '0')}:${d.productId.toString(16).padStart(4, '0')})`,
        manufacturerName: d.manufacturerName,
        serialNumber: d.serialNumber,
        usbVersionMajor: d.usbVersionMajor,
        usbVersionMinor: d.usbVersionMinor,
        deviceClass: d.deviceClass
      }));
    } catch {
      return [];
    }
  }
  return [];
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
  const isUsb = busUpper === 'USB' || !!rd.isExternal;
  const isNvme = busUpper === 'NVME';

  const rawPartitions: any[] = Array.isArray(rd.partitions) ? rd.partitions : [];
  const mountPoints: string[] = Array.isArray(rd.mountPoints) ? rd.mountPoints : [];
  const mountLabel = mountPoints.length > 0 ? mountPoints.join(', ') : '';

  const typeIcon = isUsb ? '🔌' : isNvme ? '⚡' : rd.isSsd ? '💾' : '💽';
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

  // Aggregate real volume usage if partitions are present
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

  const hwSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: path,
    vendorName: rawModel.split(' ')[0] || (isUsb ? 'USB Storage' : 'Physical Storage'),
    modelNumber: rawModel,
    serialNumber: serial,
    firmwareRevision: (rd.firmware || '').trim() || 'N/A',
    busType: isUsb ? 'USB' : isNvme ? 'NVMe' : busUpper === 'SATA' ? 'SATA' : (bus as any),
    busInterfaceSpeed: isNvme ? 'NVMe PCIe Bus (Win32 IOCTL)' : isUsb ? 'USB Mass Storage Bus' : `${bus} Bus`,
    formFactor: isNvme ? 'M.2 / NVMe Solid State' : isUsb ? 'External USB Storage' : (rd.isSsd ? 'Solid State Drive' : 'Mechanical HDD'),
    controllerVendor: 'Win32 Native Storage Subsystem',
    totalCapacityBytes: capBytes,
    totalCapacityGb: capGb,
    totalLbaSectors: totalLba > 0 ? totalLba : null,
    logicalSectorSize: secSize,
    physicalSectorSize: physSecSize,
    isAdvancedFormat: physSecSize > secSize,
    partitionStyle: 'GPT (GUID Partition Table)',
    alignmentStatus: physSecSize >= secSize ? 'Aligned (4K sector boundary)' : 'N/A',
    mediaType: isNvme || rd.isSsd ? 'SSD (Non-Volatile NAND Flash)' : 'Mechanical HDD (Magnetic Platter)',
    rotationalSpeedRpm: isNvme || rd.isSsd ? 0 : null,
    trimSupported: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    trimActive: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    smartSupported: smartAttributes.length > 0 || !!nvme,
    smartActive: smartAttributes.length > 0 || !!nvme,
    ncqSupported: isNvme || rd.isSsd ? true : null,
    queueDepth: isNvme ? 64 : null,
    volatileWriteCache: null,
    writeCacheFlushSupported: null,
    readLookAheadSupported: null,
    apmAamSupported: !rd.isSsd,
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
    probeMethod: 'Native Direct Win32 IOCTL',
    partitions
  };

  const driveType: DiskDrive['type'] = isNvme ? 'NVMe' : isUsb ? 'USB' : (rd.isSsd ? 'SSD' : 'HDD');
  const primaryFs = partitions[0]?.fileSystem;

  return {
    id: `drive-tauri-physical-${driveIndex}`,
    name: driveName,
    model: rawModel,
    serialNumber: serial,
    firmware: hwSpecs.firmwareRevision,
    type: driveType,
    isExternal: isUsb,
    connectionType: isUsb ? 'usb' : 'internal',
    capacityGb: capGb,
    totalSectors: totalLba > 0 ? totalLba : 1000000,
    interface: `Native Direct IOCTL (PhysicalDrive${driveIndex})`,
    healthScore: reliability,
    temperatureC: temp,
    powerOnHours: poh,
    usedPercentage: aggUsedPct,
    mountPoint: mountLabel || path,
    fileSystem: (primaryFs as any) || 'Unknown',
    smartAttributes,
    hardwareSpecs: hwSpecs
  } as DiskDrive;
}

/**
 * Real Physical Storage Discovery via Tauri Core IPC or Windows Native Bridge (DiskBadSectorScanner.exe)
 * Queries raw physical drives (\\\\.\\PhysicalDrive0..31) from Windows Win32 IOCTL
 */
export async function queryTauriPhysicalDrives(): Promise<DiskDrive[]> {
  if (isTauriDesktopRuntime()) {
    const tauri = (window as any).__TAURI__;
    try {
      const rawDrives = await tauri.core.invoke('get_physical_drives');
      if (Array.isArray(rawDrives) && rawDrives.length > 0) {
        return rawDrives.map((rd: any, idx: number) => mapRawPhysicalDriveDtoToDiskDrive(rd, idx));
      }
    } catch (err) {
      console.warn('Tauri physical drives query skipped:', err);
    }
  }

  const bridgeAvailable = await detectNativeBridgeAvailable();
  if (bridgeAvailable) {
    try {
      const res = await fetch('/api/native/drives', { cache: 'no-store' });
      if (res.ok) {
        const rawDrives = await res.json();
        if (Array.isArray(rawDrives) && rawDrives.length > 0) {
          return rawDrives.map((rd: any, idx: number) => mapRawPhysicalDriveDtoToDiskDrive(rd, idx));
        }
      }
    } catch (err) {
      console.warn('Win32 Native Bridge drives query failed:', err);
    }
  }

  return [];
}

/**
 * Creates a real Host Storage DiskDrive object based on Tauri Win32 IOCTL (desktop)
 * or W3C OPFS + StorageManager API (browser sandbox, zero synthetic sensors).
 */
export async function createNativeHostDrive(): Promise<DiskDrive> {
  const tauriDrives = await queryTauriPhysicalDrives();
  if (tauriDrives.length > 0) {
    return tauriDrives[0];
  }

  const sysInfo = await probeNativeSystemStorage();
  const osName = sysInfo.isWindows ? 'Windows' : sysInfo.isMac ? 'macOS' : sysInfo.isLinux ? 'Linux' : 'Browser';
  const opfsLabel = sysInfo.opfsSupported ? 'OPFS & StorageManager' : 'StorageManager Quota Only';

  const hasQuota = sysInfo.quotaBytes > 0;
  const quotaCapGb = hasQuota ? Number((sysInfo.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)) : null;
  const totalSectors = hasQuota ? Math.max(1024, Math.floor(sysInfo.quotaBytes / 512)) : 65536;

  const partitions: DiskVolumePartition[] = hasQuota
    ? [
        {
          letterOrMount: 'OPFS://origin',
          label: 'Browser Sandbox Storage Quota',
          fileSystem: 'OPFS',
          totalGb: sysInfo.quotaGb,
          usedGb: sysInfo.usageGb,
          freeGb: Number(Math.max(0, sysInfo.quotaGb - sysInfo.usageGb).toFixed(2)),
          usedPercentage: sysInfo.usedPercentage
        }
      ]
    : [];

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: 'OPFS://origin-sandbox',
    vendorName: 'Browser Storage Subsystem',
    modelNumber: `${osName} Host Sandbox (${opfsLabel})`,
    serialNumber: 'SANDBOX-NO-KERNEL-SERIAL',
    firmwareRevision: 'W3C-OPFS',
    busType: 'Unknown',
    busInterfaceSpeed: sysInfo.benchmarkReadMbSec !== null
      ? `OPFS 실측 ${sysInfo.benchmarkReadMbSec} MB/s Read / ${sysInfo.benchmarkWriteMbSec} MB/s Write`
      : '웹 샌드박스 제한 (OPFS 비활성)',
    formFactor: 'Origin Private File System Sandbox (No Raw Disk Handle)',
    controllerVendor: `${sysInfo.osPlatform} (${sysInfo.cpuCores ?? '?'} Threads)`,
    totalCapacityBytes: hasQuota ? sysInfo.quotaBytes : null,
    totalCapacityGb: quotaCapGb,
    totalLbaSectors: hasQuota ? totalSectors : null,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Sandbox Storage (OPFS / File API)',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: sysInfo.measuredLatencyUs,
    measuredSequentialReadMbSec: sysInfo.benchmarkReadMbSec,
    measuredSequentialWriteMbSec: sysInfo.benchmarkWriteMbSec,
    measuredRandom4kReadIops: sysInfo.measuredRandom4kIops,
    probeTimestamp: Date.now(),
    probeMethod: 'W3C OPFS & StorageManager Probe',
    partitions
  };

  return {
    id: 'drive-native-host-real',
    name: quotaCapGb !== null
      ? `🖥️ [브라우저 OPFS] ${osName} 호스트 스토리지 (할당 ${quotaCapGb}GB)`
      : `🖥️ [브라우저] ${osName} 호스트 스토리지 (센서 미제공)`,
    model: `${osName} Host Sandbox (${opfsLabel})`,
    serialNumber: 'SANDBOX-NO-KERNEL-SERIAL',
    firmware: 'W3C-OPFS',
    type: 'SSD',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: quotaCapGb,
    totalSectors,
    interface: sysInfo.opfsSupported
      ? 'W3C OPFS Direct Storage Engine (No Raw SMART)'
      : 'Browser StorageManager (Limited Access)',
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    mountPoint: 'OPFS://',
    fileSystem: 'OPFS',
    smartAttributes: [],
    usedPercentage: sysInfo.usedPercentage,
    usedBytes: sysInfo.usageBytes,
    hardwareSpecs
  };
}

/**
 * Recursively collects real files and total byte size from a DirectoryHandle (bounded for responsiveness).
 */
async function collectDirectoryEntries(
  dirHandle: any,
  collectedFiles: File[],
  state: { count: number; totalBytes: number },
  maxEntries = 1500
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    if (state.count >= maxEntries) break;
    state.count++;
    if (entry.kind === 'file') {
      try {
        const f = await entry.getFile();
        state.totalBytes += f.size;
        if (collectedFiles.length < 256) {
          collectedFiles.push(f);
        }
      } catch {
        // Ignore unreadable file permission
      }
    } else if (entry.kind === 'directory') {
      try {
        await collectDirectoryEntries(entry, collectedFiles, state, maxEntries);
      } catch {
        // Ignore locked subdir
      }
    }
  }
}

/**
 * Creates a real DiskDrive object from a DirectoryHandle selected via Web File System Access API
 */
export async function createNativeDriveFromDirectoryHandle(dirHandle: any): Promise<DiskDrive> {
  const folderName = dirHandle.name || 'Local_Volume';
  const t0 = performance.now();
  const collectedFiles: File[] = [];
  const state = { count: 0, totalBytes: 0 };

  try {
    await collectDirectoryEntries(dirHandle, collectedFiles, state, 1500);
  } catch {
    // Ignore top-level permission issue
  }
  const traversalLatencyMs = Math.max(0.05, Number((performance.now() - t0).toFixed(2)));

  // Pick largest file for direct byte slicing
  const sampleFile = collectedFiles.length > 0
    ? collectedFiles.reduce((max, f) => (f.size > max.size ? f : max), collectedFiles[0])
    : undefined;

  let measuredReadMbSec: number | null = null;
  let sampleSliceLatencyMs = traversalLatencyMs;
  if (sampleFile && sampleFile.size > 0) {
    const sliceLen = Math.min(sampleFile.size, 256 * 1024);
    const ts0 = performance.now();
    try {
      await sampleFile.slice(0, sliceLen).arrayBuffer();
      const dt = Math.max(0.02, performance.now() - ts0);
      sampleSliceLatencyMs = Number(dt.toFixed(2));
      measuredReadMbSec = Number(((sliceLen / (1024 * 1024)) / (dt / 1000)).toFixed(1));
    } catch {
      // Ignore read failure
    }
  }

  const totalBytes = state.totalBytes;
  const totalSectors = Math.max(1, Math.ceil(totalBytes / 512));
  const capacityGb = totalBytes > 0 ? Number((totalBytes / (1024 * 1024 * 1024)).toFixed(3)) : null;

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: `Volume://FSA/${folderName}`,
    vendorName: 'Host File System Volume',
    modelNumber: `Directory: ${folderName} (${collectedFiles.length} Files)`,
    serialNumber: 'SANDBOX-FSA-DIR',
    firmwareRevision: 'W3C-FSA',
    busType: 'Unknown',
    busInterfaceSpeed: measuredReadMbSec !== null ? `File Slice 실측 ${measuredReadMbSec} MB/s` : 'Direct File System Access',
    formFactor: 'Mounted Local Folder Volume',
    controllerVendor: 'W3C File System Access API',
    totalCapacityBytes: totalBytes,
    totalCapacityGb: capacityGb,
    totalLbaSectors: totalSectors,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Sandbox Storage (OPFS / File API)',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: Math.round(sampleSliceLatencyMs * 1000),
    measuredSequentialReadMbSec: measuredReadMbSec,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'HTML5 Directory File Slicing & Storage Probe',
    partitions: [
      {
        letterOrMount: `${folderName}/`,
        label: `${collectedFiles.length} Files Scanned`,
        fileSystem: 'Browser File API',
        totalGb: capacityGb ?? 0,
        usedGb: capacityGb ?? 0,
        freeGb: 0,
        usedPercentage: 100
      }
    ]
  };

  return {
    id: `drive-native-fsa-${Date.now()}`,
    name: `📁 ${folderName} (실제 폴더 볼륨, ${collectedFiles.length}개 파일)`,
    model: `Directory Volume: ${folderName}`,
    serialNumber: 'SANDBOX-FSA-DIR',
    firmware: 'W3C-FSA',
    type: 'EXTERNAL_SSD',
    isExternal: true,
    connectionType: 'usb',
    mountPoint: `${folderName}/`,
    fileSystem: 'Browser File API',
    capacityGb,
    totalSectors,
    usedBytes: totalBytes,
    interface: 'W3C File System Access API (Direct File Slicing)',
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    attachedFile: sampleFile,
    attachedFiles: collectedFiles,
    attachedFileHandle: dirHandle,
    smartAttributes: [],
    hardwareSpecs
  };
}

/**
 * Creates a real DiskDrive object from standard HTML5 FileList (webkitdirectory folder selection)
 */
export async function createNativeDriveFromFolderFiles(files: FileList | File[]): Promise<DiskDrive> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    throw new Error('선택된 폴더에 접근 가능한 파일이 없습니다.');
  }

  const firstPath = fileArray[0].webkitRelativePath || '';
  const folderName = firstPath ? firstPath.split('/')[0] : 'Local_Folder_Volume';

  let totalBytes = 0;
  for (const f of fileArray) {
    totalBytes += f.size;
  }

  const sampleFile = fileArray.reduce((max, f) => (f.size > max.size ? f : max), fileArray[0]);

  const t0 = performance.now();
  let readMbSec: number | null = null;
  try {
    const sliceLen = Math.min(sampleFile.size, 256 * 1024);
    if (sliceLen > 0) {
      await sampleFile.slice(0, sliceLen).arrayBuffer();
      const dt = Math.max(0.02, performance.now() - t0);
      readMbSec = Number(((sliceLen / (1024 * 1024)) / (dt / 1000)).toFixed(1));
    }
  } catch {
    // Ignore read error
  }
  const latency = Math.max(0.01, Number((performance.now() - t0).toFixed(2)));

  const totalSectors = Math.max(1, Math.ceil(totalBytes / 512));
  const capacityGb = totalBytes > 0 ? Number((totalBytes / (1024 * 1024 * 1024)).toFixed(3)) : 0;

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: `Folder://${folderName}`,
    vendorName: 'Local Directory Files',
    modelNumber: `Folder: ${folderName.slice(0, 28)} (${fileArray.length} Files)`,
    serialNumber: 'SANDBOX-DIR-FILES',
    firmwareRevision: 'HTML5-FILE-API',
    busType: 'Unknown',
    busInterfaceSpeed: readMbSec !== null ? `File Slice 실측 ${readMbSec} MB/s` : 'HTML5 File Slice Stream',
    formFactor: 'Mounted Local Directory File Set',
    controllerVendor: 'W3C HTML5 File Slicing Engine',
    totalCapacityBytes: totalBytes,
    totalCapacityGb: capacityGb,
    totalLbaSectors: totalSectors,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Sandbox Storage (OPFS / File API)',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: Math.round(latency * 1000),
    measuredSequentialReadMbSec: readMbSec,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'HTML5 Directory File Slicing & Storage Probe',
    partitions: [
      {
        letterOrMount: `${folderName}/`,
        label: `${fileArray.length} Files (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
        fileSystem: 'Browser File API',
        totalGb: capacityGb,
        usedGb: capacityGb,
        freeGb: 0,
        usedPercentage: 100
      }
    ]
  };

  return {
    id: `drive-native-folder-${Date.now()}`,
    name: `📁 ${folderName} (폴더 마운트, ${fileArray.length}개 파일)`,
    model: `DirVolume-${folderName.slice(0, 24)}`,
    serialNumber: 'SANDBOX-DIR-FILES',
    firmware: 'HTML5-FILE-API',
    type: 'EXTERNAL_SSD',
    isExternal: true,
    connectionType: 'usb',
    mountPoint: `${folderName}/`,
    fileSystem: 'Browser File API',
    capacityGb,
    totalSectors,
    usedBytes: totalBytes,
    interface: 'HTML5 File Slice Stream I/O',
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    attachedFile: sampleFile,
    attachedFiles: fileArray,
    smartAttributes: [],
    hardwareSpecs
  };
}

/**
 * Creates a real DiskDrive object from a User-Selected File (.img, .iso, .vhd, or any file)
 * Reads actual bytes block-by-block during scanning!
 */
export async function createNativeDriveFromFile(file: File): Promise<DiskDrive> {
  const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));
  const sizeGb = Number((file.size / (1024 * 1024 * 1024)).toFixed(3));
  const displayCap = sizeGb >= 1 ? `${sizeGb} GB` : `${sizeMb} MB`;

  const t0 = performance.now();
  let readMbSec: number | null = null;
  try {
    const sliceSize = Math.min(file.size, 256 * 1024);
    if (sliceSize > 0) {
      const slice = file.slice(0, sliceSize);
      const buf = await slice.arrayBuffer();
      const dt = Math.max(0.02, performance.now() - t0);
      readMbSec = Number(((buf.byteLength / (1024 * 1024)) / (dt / 1000)).toFixed(1));
    }
  } catch {
    // Ignore read error
  }
  const probeLatency = Math.max(0.01, Number((performance.now() - t0).toFixed(2)));

  const totalSectors = Math.max(1, Math.ceil(file.size / 512));
  const capacityGb = Number((file.size / (1024 * 1024 * 1024)).toFixed(3));

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: `File://${file.name}`,
    vendorName: 'Mounted Disk Image / File',
    modelNumber: file.name,
    serialNumber: `FILE-${Math.abs(file.lastModified).toString(16).toUpperCase()}`,
    firmwareRevision: 'FILE-SLICE-IO',
    busType: 'Unknown',
    busInterfaceSpeed: readMbSec !== null ? `File Slice 실측 ${readMbSec} MB/s` : 'Direct File ArrayBuffer Slice',
    formFactor: 'Raw Disk Image / Local File Byte Stream',
    controllerVendor: 'W3C File.slice() Stream Reader',
    totalCapacityBytes: file.size,
    totalCapacityGb: capacityGb,
    totalLbaSectors: totalSectors,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Sandbox Storage (OPFS / File API)',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: Math.round(probeLatency * 1000),
    measuredSequentialReadMbSec: readMbSec,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'Real File Slice Direct IO',
    partitions: [
      {
        letterOrMount: 'FILE:',
        label: file.name,
        fileSystem: 'Browser File API',
        totalGb: capacityGb,
        usedGb: capacityGb,
        freeGb: 0,
        usedPercentage: 100
      }
    ]
  };

  return {
    id: `drive-native-file-${Date.now()}`,
    name: `📄 ${file.name} (${displayCap})`,
    model: file.name,
    serialNumber: hardwareSpecs.serialNumber,
    firmware: 'FILE-SLICE-IO',
    type: 'EXTERNAL_SSD',
    isExternal: true,
    connectionType: 'usb',
    mountPoint: 'FILE:',
    fileSystem: 'Browser File API',
    capacityGb,
    totalSectors,
    usedBytes: file.size,
    interface: 'Web File.slice() Direct Byte Stream',
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    attachedFile: file,
    smartAttributes: [],
    hardwareSpecs
  };
}

/**
 * Prompts user to connect a REAL physical USB device via WebUSB
 */
export async function requestPhysicalWebUsbDevice(): Promise<DiskDrive | null> {
  if (typeof navigator === 'undefined' || !('usb' in navigator)) {
    throw new Error('이 브라우저는 WebUSB API를 지원하지 않습니다.');
  }

  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  if (!device) return null;

  try {
    await device.open();
  } catch {
    // OS-claimed mass storage interfaces often restrict .open() in WebUSB; descriptor metadata remains accessible.
  }

  const vendorHex = device.vendorId.toString(16).padStart(4, '0').toUpperCase();
  const prodHex = device.productId.toString(16).padStart(4, '0').toUpperCase();
  const known = KNOWN_USB_STORAGE_VENDORS[device.vendorId];
  const mfr = device.manufacturerName || (known ? known.name : `USB Vendor 0x${vendorHex}`);
  const devName = device.productName || `USB Device [0x${vendorHex}:0x${prodHex}]`;
  const serial = device.serialNumber || `USB-${vendorHex}-${prodHex}`;
  const isUsb3 = typeof device.usbVersionMajor === 'number' ? device.usbVersionMajor >= 3 : undefined;
  const usbVer = typeof device.usbVersionMajor === 'number'
    ? `${device.usbVersionMajor}.${device.usbVersionMinor ?? 0}`
    : undefined;
  const bridge = known ? known.controller : `${mfr} USB Interface`;
  const busSpeed = known
    ? known.typicalBus
    : isUsb3 === true
    ? `USB ${usbVer} SuperSpeed`
    : isUsb3 === false
    ? `USB ${usbVer} High-Speed`
    : 'USB Peripheral Link';

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: `USB://VID_${vendorHex}&PID_${prodHex}`,
    vendorName: mfr,
    modelNumber: `${mfr} ${devName}`,
    serialNumber: serial,
    firmwareRevision: typeof device.deviceVersionMajor === 'number'
      ? `${device.deviceVersionMajor}.${device.deviceVersionMinor ?? 0}`
      : 'N/A',
    busType: 'USB',
    busInterfaceSpeed: busSpeed,
    formFactor: 'WebUSB Connected Peripheral',
    controllerVendor: bridge,
    totalCapacityBytes: null,
    totalCapacityGb: null,
    totalLbaSectors: null,
    logicalSectorSize: 512,
    physicalSectorSize: 512,
    isAdvancedFormat: false,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Direct Hardware Peripheral',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: null,
    measuredSequentialReadMbSec: null,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'WebUSB Device Descriptor',
    usbDeviceInfo: {
      vendorId: device.vendorId,
      productId: device.productId,
      usbVersion: usbVer,
      deviceClass: device.deviceClass
    },
    partitions: []
  };

  return {
    id: `drive-usb-real-${device.vendorId}-${device.productId}-${Date.now()}`,
    name: `🔌 ${devName} (VID:0x${vendorHex} PID:0x${prodHex})`,
    model: `${mfr} ${devName}`,
    serialNumber: serial,
    firmware: hardwareSpecs.firmwareRevision,
    type: 'USB',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: isUsb3 ? 'UASP (USB Attached SCSI Protocol)' : 'BOT (Bulk-Only Transport)',
    isUsb2: isUsb3 === false,
    bridgeChipset: bridge,
    mountPoint: `VID_${vendorHex}&PID_${prodHex}`,
    fileSystem: 'Unknown',
    capacityGb: null,
    totalSectors: 0,
    interface: `WebUSB Descriptor (${busSpeed})`,
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    smartAttributes: [],
    hardwareSpecs
  };
}

/**
 * Prompts user to connect a REAL physical Serial / COM port device via Web Serial API
 */
export async function requestPhysicalWebSerialDevice(): Promise<DiskDrive | null> {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    throw new Error('이 브라우저는 Web Serial API를 지원하지 않습니다.');
  }

  const port = await (navigator as any).serial.requestPort();
  if (!port) return null;

  const info = port.getInfo ? port.getInfo() : {};
  const usbVendor = info.usbVendorId ? info.usbVendorId.toString(16).padStart(4, '0').toUpperCase() : 'N/A';
  const usbProd = info.usbProductId ? info.usbProductId.toString(16).padStart(4, '0').toUpperCase() : 'N/A';

  const hardwareSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: `SERIAL://VID_${usbVendor}&PID_${usbProd}`,
    vendorName: usbVendor !== 'N/A' ? `USB-UART 0x${usbVendor}` : 'Serial COM Port',
    modelNumber: `Serial Bridge (0x${usbVendor}:0x${usbProd})`,
    serialNumber: `SERIAL-${usbVendor}-${usbProd}`,
    firmwareRevision: 'N/A',
    busType: 'USB',
    busInterfaceSpeed: 'Web Serial COM Interface',
    formFactor: 'Serial Hardware Link',
    controllerVendor: 'Web Serial Port API',
    totalCapacityBytes: null,
    totalCapacityGb: null,
    totalLbaSectors: null,
    logicalSectorSize: 512,
    physicalSectorSize: 512,
    isAdvancedFormat: false,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Direct Hardware Peripheral',
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
    powerOnHours: null,
    powerCycles: null,
    unsafeShutdowns: null,
    mediaErrors: null,
    currentTempC: null,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    nvmeLogAvailable: false,
    measuredKernelLatencyUs: null,
    measuredSequentialReadMbSec: null,
    measuredSequentialWriteMbSec: null,
    measuredRandom4kReadIops: null,
    probeTimestamp: Date.now(),
    probeMethod: 'Web Serial Port Link',
    usbDeviceInfo: info.usbVendorId
      ? {
          vendorId: info.usbVendorId,
          productId: info.usbProductId || 0
        }
      : undefined,
    partitions: []
  };

  return {
    id: `drive-serial-real-${Date.now()}`,
    name: `⚡ COM Serial Port [VID:0x${usbVendor} PID:0x${usbProd}]`,
    model: `Serial Hardware Bridge (0x${usbVendor}:0x${usbProd})`,
    serialNumber: hardwareSpecs.serialNumber,
    firmware: 'N/A',
    type: 'USB',
    isExternal: true,
    connectionType: 'usb',
    mountPoint: 'COM:',
    fileSystem: 'Unknown',
    capacityGb: null,
    totalSectors: 0,
    interface: 'Web Serial Port Link',
    healthScore: null,
    temperatureC: null,
    powerOnHours: null,
    smartAttributes: [],
    hardwareSpecs
  };
}

/**
 * Live Deep Hardware Specification Re-Probe:
 * Refreshes real native Tauri IOCTL drives or OPFS/File metrics without fabricating kernel stats.
 */
export async function probeDetailedDriveHardware(drive: DiskDrive): Promise<DiskHardwareSpecs> {
  if (drive.id.startsWith('drive-tauri-physical-')) {
    const refreshed = await queryTauriPhysicalDrives();
    const match = refreshed.find(d => d.id === drive.id);
    if (match?.hardwareSpecs) {
      return match.hardwareSpecs;
    }
  }

  const sysInfo = await probeNativeSystemStorage();

  if (drive.hardwareSpecs) {
    const isFile = Boolean(drive.attachedFile);
    return {
      ...drive.hardwareSpecs,
      measuredKernelLatencyUs: isFile ? drive.hardwareSpecs.measuredKernelLatencyUs : sysInfo.measuredLatencyUs,
      measuredSequentialReadMbSec: isFile ? drive.hardwareSpecs.measuredSequentialReadMbSec : sysInfo.benchmarkReadMbSec,
      measuredSequentialWriteMbSec: isFile ? drive.hardwareSpecs.measuredSequentialWriteMbSec : sysInfo.benchmarkWriteMbSec,
      measuredRandom4kReadIops: isFile ? drive.hardwareSpecs.measuredRandom4kReadIops : sysInfo.measuredRandom4kIops,
      currentTempC: drive.temperatureC,
      probeTimestamp: Date.now()
    };
  }

  return {
    devicePhysicalPath: drive.isExternal ? `Device://${drive.id}` : 'OPFS://origin-sandbox',
    vendorName: drive.model.split(' ')[0] || 'Storage Device',
    modelNumber: drive.model,
    serialNumber: drive.serialNumber,
    firmwareRevision: drive.firmware,
    busType: drive.type === 'NVMe' ? 'NVMe' : drive.isExternal ? 'USB' : 'Unknown',
    busInterfaceSpeed: drive.interface,
    formFactor: drive.isExternal ? 'External Storage' : 'Host Storage',
    controllerVendor: drive.bridgeChipset || 'Host Storage Controller',
    totalCapacityBytes: drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : null,
    totalCapacityGb: drive.capacityGb,
    totalLbaSectors: drive.totalSectors > 0 ? drive.totalSectors : null,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: 'Sandbox Storage (OPFS / File API)',
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
    measuredKernelLatencyUs: sysInfo.measuredLatencyUs,
    measuredSequentialReadMbSec: sysInfo.benchmarkReadMbSec,
    measuredSequentialWriteMbSec: sysInfo.benchmarkWriteMbSec,
    measuredRandom4kReadIops: sysInfo.measuredRandom4kIops,
    probeTimestamp: Date.now(),
    probeMethod: 'W3C OPFS & StorageManager Probe'
  };
}

/**
 * Rescans all system storage and updates drive list live
 */
export async function rescanAllDrives(currentDrives: DiskDrive[]): Promise<DiskDrive[]> {
  const tauriDrives = await queryTauriPhysicalDrives();
  const usbDevices = await probeWebUsbDevices();

  const updated: DiskDrive[] = [];
  const seenIds = new Set<string>();

  if (tauriDrives.length > 0) {
    for (const td of tauriDrives) {
      if (!seenIds.has(td.id)) {
        seenIds.add(td.id);
        updated.push(td);
      }
    }
  } else {
    const newHostDrive = await createNativeHostDrive();
    if (!seenIds.has(newHostDrive.id)) {
      seenIds.add(newHostDrive.id);
      updated.push(newHostDrive);
    }
  }

  // Preserve user-mounted files, folders, and connected USB/Serial handles
  for (const d of currentDrives) {
    if (d.id === 'drive-native-host-real') continue;
    if (d.id.startsWith('drive-tauri-physical-')) continue;
    if (!seenIds.has(d.id)) {
      seenIds.add(d.id);
      updated.push(d);
    }
  }

  for (const usb of usbDevices) {
    const existing = updated.find(d => d.id.includes(`${usb.vendorId}-${usb.productId}`));
    if (!existing) {
      const known = KNOWN_USB_STORAGE_VENDORS[usb.vendorId];
      const mfr = usb.manufacturerName || (known ? known.name : 'USB Device');
      const vendorHex = usb.vendorId.toString(16).padStart(4, '0').toUpperCase();
      const prodHex = usb.productId.toString(16).padStart(4, '0').toUpperCase();
      const isUsb3 = typeof usb.usbVersionMajor === 'number' ? usb.usbVersionMajor >= 3 : undefined;

      updated.push({
        id: `drive-usb-real-${usb.vendorId}-${usb.productId}-${Date.now()}`,
        name: `🔌 ${usb.deviceName} (VID:0x${vendorHex} PID:0x${prodHex})`,
        model: `${mfr} ${usb.deviceName}`,
        serialNumber: usb.serialNumber || `USB-${vendorHex}-${prodHex}`,
        firmware: typeof usb.usbVersionMajor === 'number' ? `USB ${usb.usbVersionMajor}.${usb.usbVersionMinor ?? 0}` : 'N/A',
        type: 'USB',
        isExternal: true,
        connectionType: 'usb',
        usbProtocol: isUsb3 ? 'UASP (USB Attached SCSI Protocol)' : 'BOT (Bulk-Only Transport)',
        bridgeChipset: known ? known.controller : 'USB Hardware Interface',
        mountPoint: `VID_${vendorHex}&PID_${prodHex}`,
        fileSystem: 'Unknown',
        capacityGb: null,
        totalSectors: 0,
        interface: 'WebUSB Descriptor (No Raw Block Access)',
        healthScore: null,
        temperatureC: null,
        powerOnHours: null,
        smartAttributes: [],
        hardwareSpecs: {
          devicePhysicalPath: `USB://VID_${vendorHex}&PID_${prodHex}`,
          vendorName: mfr,
          modelNumber: `${mfr} ${usb.deviceName}`,
          serialNumber: usb.serialNumber || `USB-${vendorHex}-${prodHex}`,
          firmwareRevision: 'N/A',
          busType: 'USB',
          busInterfaceSpeed: known ? known.typicalBus : 'USB Peripheral Link',
          formFactor: 'WebUSB Hardware Peripheral',
          controllerVendor: known ? known.controller : 'WebUSB Driver',
          totalCapacityBytes: null,
          totalCapacityGb: null,
          totalLbaSectors: null,
          logicalSectorSize: 512,
          physicalSectorSize: 512,
          isAdvancedFormat: false,
          partitionStyle: 'N/A (Sandbox)',
          alignmentStatus: 'N/A',
          mediaType: 'Direct Hardware Peripheral',
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
          powerOnHours: null,
          powerCycles: null,
          unsafeShutdowns: null,
          mediaErrors: null,
          currentTempC: null,
          maxTempRecordedC: null,
          warningTempThresholdC: null,
          nvmeLogAvailable: false,
          measuredKernelLatencyUs: null,
          measuredSequentialReadMbSec: null,
          measuredSequentialWriteMbSec: null,
          measuredRandom4kReadIops: null,
          probeTimestamp: Date.now(),
          probeMethod: 'WebUSB Device Descriptor',
          usbDeviceInfo: {
            vendorId: usb.vendorId,
            productId: usb.productId,
            usbVersion: typeof usb.usbVersionMajor === 'number' ? `${usb.usbVersionMajor}.${usb.usbVersionMinor ?? 0}` : undefined,
            deviceClass: usb.deviceClass
          },
          partitions: []
        }
      });
    }
  }

  return updated;
}

/**
 * Helper to resolve a File + byte offset across either single attachedFile or folder attachedFiles.
 */
function resolveFileTargetForBlock(
  drive: DiskDrive,
  blockIndex: number,
  totalBlocks: number
): { file: File; offset: number; chunkSize: number } | null {
  const files = drive.attachedFiles && drive.attachedFiles.length > 0
    ? drive.attachedFiles
    : drive.attachedFile
    ? [drive.attachedFile]
    : [];

  if (files.length === 0) return null;

  const nonEmpty = files.filter(f => f.size > 0);
  if (nonEmpty.length === 0) {
    return { file: files[0], offset: 0, chunkSize: 0 };
  }

  const totalBytes = nonEmpty.reduce((acc, f) => acc + f.size, 0);
  const targetBytePos = Math.floor((blockIndex / Math.max(1, totalBlocks)) * totalBytes);

  let cursor = 0;
  for (const f of nonEmpty) {
    if (targetBytePos < cursor + f.size) {
      const localOffset = targetBytePos - cursor;
      const chunkSize = Math.min(256 * 1024, Math.max(512, f.size - localOffset));
      return { file: f, offset: localOffset, chunkSize };
    }
    cursor += f.size;
  }

  const last = nonEmpty[nonEmpty.length - 1];
  const chunkSize = Math.min(256 * 1024, last.size);
  return { file: last, offset: Math.max(0, last.size - chunkSize), chunkSize };
}

/**
 * Real Physical Sector Probe:
 * - Tauri Desktop: Real Win32 ReadFile / LBA scan via `scan_lba_block`
 * - Mounted File / Folder: Real `File.slice()` read + Adler-32 checksum + measured latency
 * - Host Browser Drive: Real OPFS write/read/verify block probe
 * - Restricted / No Handle: Honest error code (never invents RAM benchmark fake disk speeds)
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

  // 0. Native Tauri Win32 Physical Drive I/O
  if (drive.id.startsWith('drive-tauri-physical-')) {
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

  // 1. Real Attached File / Mounted Directory File Slicing
  const fileTarget = resolveFileTargetForBlock(drive, blockIndex, totalBlocks);
  if (fileTarget) {
    const { file, offset, chunkSize } = fileTarget;
    const t0 = performance.now();
    try {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const u8 = new Uint8Array(buffer);

      let a = 1;
      let b = 0;
      const step = Math.max(1, Math.floor(u8.length / 256));
      for (let i = 0; i < u8.length; i += step) {
        a = (a + u8[i]) % 65521;
        b = (b + a) % 65521;
      }
      const checksumVal = ((b << 16) | a) >>> 0;
      const checksum = `0x${checksumVal.toString(16).padStart(8, '0').toUpperCase()}`;

      const t1 = performance.now();
      const latencyMs = Math.max(0.02, Number((t1 - t0).toFixed(3)));
      const throughputMbSec = u8.length > 0
        ? Number(((u8.length / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
        : 0;

      if (latencyMs > 250) {
        return { status: 'critical', latencyMs, throughputMbSec, errorCode: 'CRITICAL I/O LATENCY', checksum, zoneTag };
      }
      if (latencyMs > 100) {
        return { status: 'slow', latencyMs, throughputMbSec, errorCode: 'SLOW FILE READ DELAY', checksum, zoneTag };
      }
      return {
        status: latencyMs > 25 ? 'normal' : 'good',
        latencyMs,
        throughputMbSec,
        checksum,
        zoneTag
      };
    } catch (err: any) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: `FILE_IO_ERROR: ${err?.message || 'Read Failure'}`,
        zoneTag
      };
    }
  }

  // 2. Host Origin Storage: Real OPFS Read/Verify Probe
  if (drive.id === 'drive-native-host-real' && typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(OPFS_PROBE_FILENAME, { create: true });
      let file = await fh.getFile();
      if (file.size < 65536) {
        const initBuf = new Uint8Array(65536);
        for (let i = 0; i < initBuf.length; i++) initBuf[i] = (i * 13 + 7) & 0xff;
        const w = await fh.createWritable();
        await w.write(initBuf);
        await w.close();
        file = await fh.getFile();
      }

      const sliceLen = Math.min(65536, file.size);
      const offset = file.size > sliceLen ? (blockIndex * 4096) % (file.size - sliceLen) : 0;

      const t0 = performance.now();
      const buf = await file.slice(offset, offset + sliceLen).arrayBuffer();
      const u8 = new Uint8Array(buf);
      let a = 1;
      let b = 0;
      const step = Math.max(1, Math.floor(u8.length / 256));
      for (let i = 0; i < u8.length; i += step) {
        a = (a + u8[i]) % 65521;
        b = (b + a) % 65521;
      }
      const t1 = performance.now();
      const latencyMs = Math.max(0.02, Number((t1 - t0).toFixed(3)));
      const throughputMbSec = Number(((u8.length / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1));
      const checksum = `0x${((((b << 16) | a) >>> 0)).toString(16).padStart(8, '0').toUpperCase()}`;

      return {
        status: latencyMs > 150 ? 'slow' : latencyMs > 25 ? 'normal' : 'good',
        latencyMs,
        throughputMbSec,
        checksum,
        zoneTag
      };
    } catch (err: any) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: `OPFS_ACCESS_DENIED: ${err?.message || 'Storage sandbox blocked'}`,
        zoneTag
      };
    }
  }

  // 3. Devices without raw block handles in Browser Sandbox (e.g. WebUSB/WebSerial descriptor-only handles)
  return {
    status: 'bad',
    latencyMs: -1,
    throughputMbSec: 0,
    errorCode: 'KERNEL_HANDLE_REQUIRED (브라우저에서는 RAW LBA 직접 읽기 불가 - 파일 마운트 또는 Tauri 앱 필요)',
    zoneTag
  };
}

/**
 * Real Zero-Fill Block Repair Engine:
 * - Tauri Desktop: Calls Win32 DeviceIoControl / WriteFile sector repair
 * - OPFS / Writable FileHandle: Writes real zero buffer & verifies read-back bytes
 * - Read-only Web File / Restricted Hardware: Explicitly reports unsupported instead of faking RAM zeroing
 */
export async function executeRealZeroFillRepairBlock(
  blockIndex: number,
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
  if (drive?.id.startsWith('drive-tauri-physical-')) {
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

  // Real OPFS Zero-Fill Write + Read-Back Verify for sandbox host drive
  if (drive?.id === 'drive-native-host-real' && typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(OPFS_PROBE_FILENAME, { create: true });
      const blockSize = 64 * 1024;
      const zeros = new Uint8Array(blockSize);

      const t0 = performance.now();
      const writable = await fh.createWritable();
      await writable.write({ type: 'write', position: 0, data: zeros });
      await writable.close();

      // Verify written bytes on disk are 0x00
      const verifyFile = await fh.getFile();
      const verifyBuf = new Uint8Array(await verifyFile.slice(0, blockSize).arrayBuffer());
      let verified = verifyBuf.byteLength === blockSize;
      for (let i = 0; i < verifyBuf.length; i += 64) {
        if (verifyBuf[i] !== 0) {
          verified = false;
          break;
        }
      }
      const t1 = performance.now();
      const latencyMs = Math.max(0.05, Number((t1 - t0).toFixed(3)));
      const throughputMbSec = Number(((blockSize / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1));

      return {
        success: verified,
        latencyMs,
        throughputMbSec,
        bytesWritten: blockSize,
        verifiedZeros: verified
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: 0,
        throughputMbSec: 0,
        bytesWritten: 0,
        verifiedZeros: false,
        unsupportedReason: `OPFS 쓰기 실패: ${err?.message || 'Permission denied'}`
      };
    }
  }

  return {
    success: false,
    latencyMs: 0,
    throughputMbSec: 0,
    bytesWritten: 0,
    verifiedZeros: false,
    unsupportedReason: '브라우저 읽기 전용 파일/USB 핸들에서는 물리 LBA 섹터 덮어쓰기가 허용되지 않습니다. 데스크톱 관리자 권한(Tauri Win32)에서 실행하세요.'
  };
}

/**
 * Real Raw Sector Reading via Tauri Core IPC or Windows Native Bridge
 */
export async function queryTauriRawSector(driveIndex: number, lba: number, size: number): Promise<Uint8Array | null> {
  if (isTauriDesktopRuntime()) {
    try {
      const bytes = await (window as any).__TAURI__.core.invoke('read_raw_sector', { driveIndex, lba, size });
      if (bytes instanceof Uint8Array) return bytes;
      if (Array.isArray(bytes)) return new Uint8Array(bytes);
    } catch (err) {
      console.warn('Tauri raw sector read failed:', err);
    }
  }

  if (await detectNativeBridgeAvailable()) {
    try {
      const res = await fetch('/api/native/read-sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveIndex, lba, size })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.bytes)) {
          return new Uint8Array(data.bytes);
        }
      }
    } catch (err) {
      console.warn('Win32 bridge raw sector read failed:', err);
    }
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
 * Real Sector Repair via Tauri Core IPC or Windows Native Bridge
 */
export async function queryTauriRepairSector(driveIndex: number, lba: number, count: number): Promise<boolean> {
  if (isTauriDesktopRuntime()) {
    try {
      const res = await (window as any).__TAURI__.core.invoke('attempt_sector_repair', { driveIndex, lba, count });
      return !!res?.success;
    } catch (err) {
      console.warn('Tauri sector repair failed:', err);
      return false;
    }
  }

  if (await detectNativeBridgeAvailable()) {
    try {
      const res = await fetch('/api/native/repair-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveIndex, lba, count })
      });
      if (res.ok) {
        const data = await res.json();
        return !!data?.success;
      }
    } catch (err) {
      console.warn('Win32 bridge sector repair failed:', err);
    }
  }

  return false;
}

/**
 * Real Sector Scanning via Tauri Core IPC or Windows Native Bridge
 */
export async function queryTauriScanBlock(driveIndex: number, lba: number, sectorCount: number): Promise<any | null> {
  if (isTauriDesktopRuntime()) {
    try {
      return await (window as any).__TAURI__.core.invoke('scan_lba_block', { driveIndex, lba, sectorCount });
    } catch (err) {
      console.warn('Tauri scan block failed:', err);
      return null;
    }
  }

  if (await detectNativeBridgeAvailable()) {
    try {
      const res = await fetch('/api/native/scan-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveIndex, lba, sectorCount })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Win32 bridge scan block failed:', err);
    }
  }

  return null;
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
 * Inspects all 32 PhysicalDrive channels, volume mappings, and access flags
 */
export async function getStorageDeviceRecognitionSummary(): Promise<StorageRecognitionDiagnostics> {
  const isTauri = isTauriDesktopRuntime();
  const isBridge = !isTauri && (await detectNativeBridgeAvailable());
  const isNative = isTauri || isBridge;
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
    isDesktopNative: isNative,
    probedChannelRange: '\\\\.\\PhysicalDrive0 ~ \\\\.\\PhysicalDrive31',
    totalChannelsProbed: 32,
    discoveredPhysicalDrives: physicalDrives.length,
    mappedVolumeCount: mappedVolumes.length,
    sharingFlags: 'FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE',
    accessModeFallback: isTauri
      ? 'Tauri Win32 IOCTL (R/W -> Read-Only -> Query Access)'
      : isBridge
      ? `Win32 Native Bridge EXE${cachedNativeBridgeStatus?.elevated ? ' (Admin UAC)' : ' (Query Access)'}`
      : 'Browser Sandbox OPFS Only (Raw \\\\.\\PhysicalDrive blocked by browser)',
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
 * Safety guard enforcing that destructive Erase probes ONLY execute on isolated OPFS sandbox
 * or explicitly user-authorized writable test files — NEVER raw OS PhysicalDriveN hardware.
 */
export function isSafeEraseTarget(drive: DiskDrive): {
  allowed: boolean;
  targetLabel: string;
  reason?: string;
} {
  if (drive.id.startsWith('drive-tauri-physical-')) {
    return {
      allowed: false,
      targetLabel: drive.hardwareSpecs?.devicePhysicalPath || drive.model,
      reason: '시스템/물리 디스크 보호: 데이터 손실 방지를 위해 Raw PhysicalDrive에는 Erase 쓰기가 차단됩니다. OPFS 샌드박스 또는 전용 테스트 파일을 선택하세요.'
    };
  }

  if (
    drive.attachedFileHandle &&
    drive.attachedFileHandle.kind === 'file' &&
    typeof drive.attachedFileHandle.createWritable === 'function'
  ) {
    return {
      allowed: true,
      targetLabel: `FileHandle://${drive.model}`
    };
  }

  if (drive.id === 'drive-native-host-real' && typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
    return {
      allowed: true,
      targetLabel: `OPFS://${OPFS_ERASE_TEST_FILENAME}`
    };
  }

  return {
    allowed: false,
    targetLabel: drive.model,
    reason: '선택된 대상은 읽기 전용 핸들(HTML5 File / WebUSB)입니다. OPFS 샌드박스 또는 쓰기 가능한 테스트 파일을 준비해 주세요.'
  };
}

/**
 * Provisions a dedicated 4MB writable test file (File System Access writable handle when permitted,
 * otherwise isolated OPFS test file) for real measured Erase tests.
 */
export async function provisionSafeEraseTargetFile(): Promise<{
  drive: DiskDrive;
  createdType: 'file_handle' | 'opfs';
}> {
  const isCrossOriginIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const payload = new Uint8Array(SAFE_ERASE_FILE_BYTES);
  for (let i = 0; i < payload.length; i += 4096) {
    payload[i] = (i >> 12) & 0xff;
  }

  if (!isCrossOriginIframe && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      // @ts-expect-error - File System Access API
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: 'DiskSentinel_EraseTest_4MB.bin',
        types: [
          {
            description: 'DiskSentinel Erase Test Image (.bin)',
            accept: { 'application/octet-stream': ['.bin'] }
          }
        ]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      const file = await fileHandle.getFile();
      const baseDrive = await createNativeDriveFromFile(file);
      return {
        createdType: 'file_handle',
        drive: {
          ...baseDrive,
          id: `drive-erase-writable-${Date.now()}`,
          name: `🧪 [쓰기 테스트 파일] ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
          attachedFileHandle: fileHandle,
          fileSystem: 'Browser File API'
        }
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('테스트 파일 생성이 취소되었습니다.');
      }
      // Fall through to OPFS sandbox test file creation
    }
  }

  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('이 브라우저는 쓰기 가능한 OPFS/파일 핸들을 지원하지 않습니다.');
  }

  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(OPFS_ERASE_TEST_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(payload);
  await writable.close();
  const opfsFile = await fh.getFile();

  const opfsDrive = await createNativeHostDrive();
  return {
    createdType: 'opfs',
    drive: {
      ...opfsDrive,
      id: 'drive-native-host-real',
      attachedFile: opfsFile,
      attachedFileHandle: fh
    }
  };
}

/**
 * Executes a single HDDScan Surface Test probe (Verify / Read / Butterfly / Safe Erase)
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

    const writeChunkBytes = 64 * 1024;
    const fillByte = blockIndex % 2 === 0 ? 0x00 : 0x55;
    const writeBuf = new Uint8Array(writeChunkBytes);
    writeBuf.fill(fillByte);

    try {
      let fh: any = null;
      if (
        drive.attachedFileHandle &&
        drive.attachedFileHandle.kind === 'file' &&
        typeof drive.attachedFileHandle.createWritable === 'function'
      ) {
        fh = drive.attachedFileHandle;
      } else if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        fh = await root.getFileHandle(OPFS_ERASE_TEST_FILENAME, { create: true });
      }

      if (!fh) {
        return {
          status: 'bad',
          latencyMs: -1,
          throughputMbSec: 0,
          errorCode: 'ERASE_HANDLE_UNAVAILABLE'
        };
      }

      let currentFile = await fh.getFile();
      if (currentFile.size < writeChunkBytes) {
        const seed = new Uint8Array(SAFE_ERASE_FILE_BYTES);
        const wInit = await fh.createWritable();
        await wInit.write(seed);
        await wInit.close();
        currentFile = await fh.getFile();
      }

      const maxSlots = Math.max(1, Math.floor(currentFile.size / writeChunkBytes));
      const writeOffset = (blockIndex % maxSlots) * writeChunkBytes;

      const t0 = performance.now();
      const writable = await fh.createWritable({ keepExistingData: true });
      await writable.write({ type: 'write', position: writeOffset, data: writeBuf });
      await writable.close();

      // Read-back byte pattern verification
      const updatedFile = await fh.getFile();
      const verifyBuf = new Uint8Array(
        await updatedFile.slice(writeOffset, writeOffset + writeChunkBytes).arrayBuffer()
      );
      let verified = verifyBuf.byteLength === writeChunkBytes;
      if (verified) {
        for (let i = 0; i < verifyBuf.length; i += 256) {
          if (verifyBuf[i] !== fillByte) {
            verified = false;
            break;
          }
        }
      }
      const t1 = performance.now();

      const latencyMs = Math.max(0.05, Number((t1 - t0).toFixed(3)));
      const throughputMbSec = Number(((writeChunkBytes / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1));

      if (!verified) {
        return {
          status: 'bad',
          latencyMs,
          throughputMbSec: 0,
          errorCode: 'ERASE_VERIFY_MISMATCH'
        };
      }

      return {
        status: latencyMs >= 150 ? 'critical' : latencyMs >= 50 ? 'slow' : latencyMs >= 20 ? 'normal' : 'good',
        latencyMs,
        throughputMbSec,
        checksum: `ERASE_0x${fillByte.toString(16).padStart(2, '0').toUpperCase()}_OK`
      };
    } catch (err: any) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: `ERASE_IO_ERROR: ${err?.message || 'Write failed'}`
      };
    }
  }

  if (testType === 'verify' && drive.id.startsWith('drive-tauri-physical-')) {
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

  // Read / Butterfly / Fallback Verify via real physical or file slice engine
  return executeRealPhysicalSectorProbe(drive, methodId, blockIndex, totalBlocks);
}

/**
 * Hardware Surface Verify via Tauri Core IPC or Windows Native Bridge (`IOCTL_DISK_VERIFY` + Read fallback)
 */
export async function queryTauriVerifyBlock(driveIndex: number, lba: number, sectorCount: number): Promise<any | null> {
  if (isTauriDesktopRuntime()) {
    try {
      return await (window as any).__TAURI__.core.invoke('verify_lba_block', { driveIndex, lba, sectorCount });
    } catch (err) {
      console.warn('Tauri verify_lba_block failed:', err);
      return null;
    }
  }

  if (await detectNativeBridgeAvailable()) {
    try {
      const res = await fetch('/api/native/verify-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveIndex, lba, sectorCount })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Win32 bridge verify_lba_block failed:', err);
    }
  }

  return null;
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
      statusText: isNativeBridgeRuntime()
        ? 'Native Bridge 모드에서는 ATA Pass-Through SMART Self-Test가 제한됩니다. Tauri 관리자 앱에서 지원됩니다.'
        : '웹 브라우저 보안 샌드박스에서는 커널 SMART Self-Test 패스스루 명령을 전송할 수 없습니다. Windows 데스크톱 관리자 권한에서 실행하세요.'
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
      statusText: isNativeBridgeRuntime()
        ? 'Native Bridge 모드에서는 S.M.A.R.T. 상태 폴링이 지원되지 않습니다 (Tauri 관리자 앱 필요).'
        : '브라우저 샌드박스에서는 커널 S.M.A.R.T. Self-Test를 조회할 수 없습니다.',
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
 * Polls live OS hardware drive temperatures via Tauri Core IPC or Windows Native Bridge
 */
export async function queryTauriPollTemperatures(): Promise<{ driveIndex: number; temperatureC: number | null }[]> {
  if (isTauriDesktopRuntime()) {
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
  }

  if (await detectNativeBridgeAvailable()) {
    try {
      const res = await fetch('/api/native/temperatures', { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          return list.map((r: any) => ({
            driveIndex: Number(r.driveIndex),
            temperatureC: typeof r.temperatureC === 'number' && r.temperatureC > 0 ? Number(r.temperatureC) : null
          }));
        }
      }
    } catch {
      return [];
    }
  }

  return [];
}
