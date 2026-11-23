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
  SmartSelfTestState,
  DriveFeatureStatus,
  DriveIdentifyField,
  DriveIdentifySnapshot,
  SmartExtendedLogsResponse,
  RawSectorRangeResponse,
  UsbSurfaceScanPolicy,
  UsbTopologyMetadata,
  DriveBusLinkProbe,
  IntegrityProbeResult
} from '../types';
import { detectVendor, getVendorProfile } from './vendorDiagnostics';
import { parseRawUsbTopologyToMetadata, resolveUsbSurfaceScanPolicy } from './usbScanMatrix';
import { parsePartitionTableFromRawBytes } from './partitionParser';

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
  forensicsDllLoaded?: boolean;
  integrityDllLoaded?: boolean;
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
        forensicsDllLoaded: Boolean(data?.forensicsDllLoaded),
        integrityDllLoaded: Boolean(data?.integrityDllLoaded),
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

export function mapRawPhysicalDriveDtoToDiskDrive(rd: any, idx: number): DiskDrive {
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
  const secSize: number | null = typeof rd.sectorSize === 'number' && rd.sectorSize > 0 ? rd.sectorSize : null;
  const physSecSize: number | null =
    typeof rd.physicalSectorSize === 'number' && rd.physicalSectorSize > 0 ? rd.physicalSectorSize : secSize;
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

  const totalLba = capBytes !== null && secSize !== null && secSize > 0 ? Math.floor(capBytes / secSize) : 0;

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

  const parsedUsbTopology: UsbTopologyMetadata | undefined = parseRawUsbTopologyToMetadata(rd.usbTopology, {
    model: rawModel,
    name: driveName,
    type: driveType,
    isExternal: isUsb || isSdOrMmc,
    connectionType: isSdOrMmc ? 'sd_card' : isUsb ? 'usb' : 'internal',
    hardwareSpecs: { busType: mappedBusType } as any
  });

  const inferredUsbProto: DiskDrive['usbProtocol'] | undefined = parsedUsbTopology
    ? (parsedUsbTopology.generation === 'usb4_tb'
        ? 'Thunderbolt 4 / PCIe Direct'
        : parsedUsbTopology.transport === 'UASP' && parsedUsbTopology.negotiatedSpeedMbps >= 10000
        ? 'NVMe over USB (UASP 10Gbps)'
        : parsedUsbTopology.transport === 'UASP'
        ? 'UASP (USB Attached SCSI Protocol)'
        : parsedUsbTopology.generation === 'usb_2_0'
        ? 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)'
        : parsedUsbTopology.transport === 'SDIO'
        ? 'SDIO UHS-I'
        : 'BOT (Bulk-Only Transport)')
    : undefined;

  const isUsb2Flag = parsedUsbTopology
    ? parsedUsbTopology.generation === 'usb_2_0' || parsedUsbTopology.generation === 'usb_1_1'
    : undefined;

  const tentativeDrive = {
    id: `drive-tauri-physical-${driveIndex}`,
    name: driveName,
    model: rawModel,
    serialNumber: serial,
    firmware: (rd.firmware || '').trim() || 'N/A',
    type: driveType,
    isExternal: isUsb || isSdOrMmc || !!parsedUsbTopology,
    connectionType: parsedUsbTopology?.generation === 'usb4_tb'
      ? 'thunderbolt'
      : isSdOrMmc
      ? 'sd_card'
      : (isUsb || parsedUsbTopology)
      ? 'usb'
      : 'internal',
    usbProtocol: inferredUsbProto,
    isUsb2: isUsb2Flag,
    bridgeChipset: parsedUsbTopology?.bridgeChipset,
    usbTopology: parsedUsbTopology,
    capacityGb: capGb,
    totalSectors: totalLba > 0 ? totalLba : 0,
    interface: parsedUsbTopology
      ? `${parsedUsbTopology.generationLabel} · ${parsedUsbTopology.transport}`
      : `Tauri Native IPC (PhysicalDrive${driveIndex})`,
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
  const resolvedVendorName =
    vendorKey !== 'generic'
      ? vendorProfile.nameEn
      : rawModel.split(/\s+/)[0] || (isUsb ? 'USB Storage' : 'Standard OEM Storage');

  const resolvedPartitionStyle: DiskHardwareSpecs['partitionStyle'] =
    rd.partitionStyle === 'GPT (GUID Partition Table)' || rd.partitionStyle === 'GPT'
      ? 'GPT (GUID Partition Table)'
      : rd.partitionStyle === 'MBR (Master Boot Record)' || rd.partitionStyle === 'MBR'
      ? 'MBR (Master Boot Record)'
      : 'Unknown';
  const resolvedAlignmentStatus: DiskHardwareSpecs['alignmentStatus'] =
    rd.alignmentStatus === 'Aligned (4K sector boundary)' || rd.alignmentStatus === 'Misaligned'
      ? rd.alignmentStatus
      : 'N/A';

  const rawLinkProbe = rd.linkProbe;
  const parsedLinkProbe: DriveBusLinkProbe | null =
    rawLinkProbe && typeof rawLinkProbe === 'object'
      ? {
          linkType:
            rawLinkProbe.linkType === 'PCIe' ||
            rawLinkProbe.linkType === 'SATA' ||
            rawLinkProbe.linkType === 'USB'
              ? rawLinkProbe.linkType
              : 'Unknown',
          currentSpeedLabel:
            typeof rawLinkProbe.currentSpeedLabel === 'string' && rawLinkProbe.currentSpeedLabel.trim()
              ? rawLinkProbe.currentSpeedLabel.trim()
              : null,
          maxSpeedLabel:
            typeof rawLinkProbe.maxSpeedLabel === 'string' && rawLinkProbe.maxSpeedLabel.trim()
              ? rawLinkProbe.maxSpeedLabel.trim()
              : null,
          currentWidth: typeof rawLinkProbe.currentWidth === 'number' ? rawLinkProbe.currentWidth : null,
          maxWidth: typeof rawLinkProbe.maxWidth === 'number' ? rawLinkProbe.maxWidth : null,
          pcieCurrentGen: typeof rawLinkProbe.pcieCurrentGen === 'number' ? rawLinkProbe.pcieCurrentGen : null,
          pcieMaxGen: typeof rawLinkProbe.pcieMaxGen === 'number' ? rawLinkProbe.pcieMaxGen : null,
          sataCurrentGen: typeof rawLinkProbe.sataCurrentGen === 'number' ? rawLinkProbe.sataCurrentGen : null,
          sataMaxGen: typeof rawLinkProbe.sataMaxGen === 'number' ? rawLinkProbe.sataMaxGen : null,
          nvmeSpecVersion:
            typeof rawLinkProbe.nvmeSpecVersion === 'string' && rawLinkProbe.nvmeSpecVersion.trim()
              ? rawLinkProbe.nvmeSpecVersion.trim()
              : null,
          effectiveBandwidthGbps:
            typeof rawLinkProbe.effectiveBandwidthGbps === 'number' && rawLinkProbe.effectiveBandwidthGbps > 0
              ? Number(rawLinkProbe.effectiveBandwidthGbps.toFixed(2))
              : null,
          isLinkDowngraded:
            typeof rawLinkProbe.isLinkDowngraded === 'boolean' ? rawLinkProbe.isLinkDowngraded : null,
          pciVendorIdHex:
            typeof rawLinkProbe.pciVendorIdHex === 'string' ? rawLinkProbe.pciVendorIdHex : null,
          pciDeviceIdHex:
            typeof rawLinkProbe.pciDeviceIdHex === 'string' ? rawLinkProbe.pciDeviceIdHex : null,
          controllerName:
            typeof rawLinkProbe.controllerName === 'string' && rawLinkProbe.controllerName.trim()
              ? rawLinkProbe.controllerName.trim()
              : null,
          probeSource:
            rawLinkProbe.probeSource === 'win32_cfgmgr32_pci' ||
            rawLinkProbe.probeSource === 'ata_identify' ||
            rawLinkProbe.probeSource === 'nvme_identify'
              ? rawLinkProbe.probeSource
              : 'unavailable'
        }
      : null;

  const resolvedBusInterfaceSpeed = parsedUsbTopology
    ? `${parsedUsbTopology.generationLabel} (${parsedUsbTopology.transport})`
    : parsedLinkProbe?.currentSpeedLabel
    ? parsedLinkProbe.isLinkDowngraded && parsedLinkProbe.maxSpeedLabel
      ? `${parsedLinkProbe.currentSpeedLabel} (Max ${parsedLinkProbe.maxSpeedLabel} - 링크 저하)`
      : parsedLinkProbe.nvmeSpecVersion
      ? `${parsedLinkProbe.currentSpeedLabel} · ${parsedLinkProbe.nvmeSpecVersion}`
      : parsedLinkProbe.currentSpeedLabel
    : isNvme
    ? parsedLinkProbe?.nvmeSpecVersion
      ? `PCIe ${parsedLinkProbe.nvmeSpecVersion} (레인 폭 미제공)`
      : 'PCIe NVMe (커널 링크 속도 미제공)'
    : isUsb
    ? 'USB Mass Storage (Win32 PnP 속도 미수신)'
    : `${mappedBusType} (커널 링크 속도 미제공)`;

  const resolvedControllerVendor =
    parsedUsbTopology?.bridgeChipset ||
    parsedLinkProbe?.controllerName ||
    'N/A (커널 컨트롤러 미제공)';

  const hwSpecs: DiskHardwareSpecs = {
    devicePhysicalPath: path,
    vendorName: resolvedVendorName,
    modelNumber: rawModel,
    serialNumber: serial,
    firmwareRevision: (rd.firmware || '').trim() || 'N/A',
    busType: mappedBusType,
    busInterfaceSpeed: resolvedBusInterfaceSpeed,
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
    controllerVendor: resolvedControllerVendor,
    linkProbe: parsedLinkProbe,
    totalCapacityBytes: capBytes,
    totalCapacityGb: capGb,
    totalLbaSectors: totalLba > 0 ? totalLba : null,
    logicalSectorSize: secSize,
    physicalSectorSize: physSecSize,
    isAdvancedFormat: physSecSize !== null && secSize !== null ? physSecSize > secSize : null,
    partitionStyle: resolvedPartitionStyle,
    alignmentStatus: resolvedAlignmentStatus,
    mediaType: isNvme || rd.isSsd || isUfs || isScm
      ? 'SSD (Non-Volatile NAND Flash)'
      : isSdOrMmc
      ? 'Flash Memory Card / USB BOT'
      : 'Mechanical HDD (Magnetic Platter)',
    rotationalSpeedRpm:
      typeof rd.rotationalSpeedRpm === 'number'
        ? rd.rotationalSpeedRpm
        : isNvme || rd.isSsd || isSdOrMmc || isUfs || isScm
        ? 0
        : null,
    trimSupported: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    trimActive: typeof rd.isTrimSupported === 'boolean' ? rd.isTrimSupported : null,
    smartSupported: smartAttributes.length > 0 || !!nvme,
    smartActive: smartAttributes.length > 0 || !!nvme,
    ncqSupported: typeof rd.ncqSupported === 'boolean' ? rd.ncqSupported : null,
    queueDepth: typeof rd.queueDepth === 'number' && rd.queueDepth > 0 ? rd.queueDepth : null,
    volatileWriteCache:
      typeof rd.volatileWriteCache === 'boolean'
        ? rd.volatileWriteCache
        : typeof rd.isWriteCacheEnabled === 'boolean'
        ? rd.isWriteCacheEnabled
        : null,
    writeCacheFlushSupported: typeof rd.writeCacheFlushSupported === 'boolean' ? rd.writeCacheFlushSupported : null,
    readLookAheadSupported: typeof rd.readLookAheadSupported === 'boolean' ? rd.readLookAheadSupported : null,
    apmAamSupported: typeof rd.apmAamSupported === 'boolean' ? rd.apmAamSupported : null,
    hostReadsTb: nvme && typeof nvme.dataUnitsReadTb === 'number' ? Number(nvme.dataUnitsReadTb.toFixed(2)) : null,
    hostWritesTb: nvme && typeof nvme.dataUnitsWrittenTb === 'number' ? Number(nvme.dataUnitsWrittenTb.toFixed(2)) : null,
    percentageUsed: nvme && typeof nvme.percentageUsed === 'number' ? nvme.percentageUsed : null,
    availableSparePercent: nvme && typeof nvme.availableSpare === 'number' ? nvme.availableSpare : null,
    availableSpareThreshold: nvme && typeof nvme.availableSpareThreshold === 'number' ? nvme.availableSpareThreshold : null,
    powerOnHours: poh,
    powerCycles: nvme && nvme.powerCycles !== undefined ? Number(nvme.powerCycles) : null,
    unsafeShutdowns: nvme && nvme.unsafeShutdowns !== undefined ? Number(nvme.unsafeShutdowns) : null,
    mediaErrors: nvme && nvme.mediaErrors !== undefined ? Number(nvme.mediaErrors) : null,
    currentTempC: temp,
    maxTempRecordedC: null,
    warningTempThresholdC:
      typeof rd.warningTempThresholdC === 'number' && rd.warningTempThresholdC > 0
        ? rd.warningTempThresholdC
        : null,
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

  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null || drive.totalSectors <= 0) {
    return {
      supported: false,
      benchmarkReadMbSec: null,
      benchmarkWriteMbSec: null,
      measuredLatencyMs: null,
      measuredLatencyUs: null,
      measuredRandom4kIops: null,
      osPlatform,
      probeNote: '물리 디스크 전체 LBA 지오메트리 정보를 확인할 수 없어 대역폭 계측을 건너뛰었습니다.'
    };
  }

  const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
  const maxSectorBurst = 128; // up to 64KB burst per probe
  const sampleCount = 6;
  const latenciesMs: number[] = [];
  const probedBytes: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const sampleLba = Math.min(drive.totalSectors - 1, i * 2048);
    if (sampleLba < 0 || sampleLba >= drive.totalSectors) continue;
    const burstSectors = Math.max(1, Math.min(maxSectorBurst, drive.totalSectors - sampleLba));
    const res = await queryTauriScanBlock(driveIndex, sampleLba, burstSectors);
    if (res && typeof res.latencyMs === 'number' && res.latencyMs > 0 && res.statusCode < 4) {
      latenciesMs.push(res.latencyMs);
      probedBytes.push(burstSectors * secBytes);
    }
    if (sampleLba + burstSectors >= drive.totalSectors) break;
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
  const avgBurstBytes = probedBytes.reduce((a, b) => a + b, 0) / probedBytes.length;
  const readMbSec = Number(((avgBurstBytes / (1024 * 1024)) / Math.max(0.0001, avgLatencyMs / 1000)).toFixed(1));
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
      let specs = match.hardwareSpecs;
      if (specs.partitionStyle === 'Unknown') {
        const rawSec = await queryTauriRawSectorBytes(match, 0, 34).catch(() => null);
        if (rawSec && rawSec.supported && rawSec.bytes.length >= 512) {
          const parsed = parsePartitionTableFromRawBytes(Array.from(rawSec.bytes), rawSec.sectorSize || 512);
          const derivedStyle: DiskHardwareSpecs['partitionStyle'] =
            parsed.scheme === 'GPT'
              ? 'GPT (GUID Partition Table)'
              : parsed.scheme === 'MBR'
              ? 'MBR (Master Boot Record)'
              : 'Unknown';
          const derivedAlign: DiskHardwareSpecs['alignmentStatus'] =
            parsed.entries.length === 0
              ? 'N/A'
              : parsed.entries.every(e => e.is4kAligned)
              ? 'Aligned (4K sector boundary)'
              : 'Misaligned';
          specs = {
            ...specs,
            partitionStyle: derivedStyle,
            alignmentStatus: derivedAlign
          };
        }
      }
      return specs;
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
    devicePhysicalPath: drive.mountPoint || undefined,
    vendorName: drive.model.split(' ')[0] || 'Storage Device',
    modelNumber: drive.model,
    serialNumber: drive.serialNumber,
    firmwareRevision: drive.firmware,
    busType: drive.type === 'NVMe' ? 'NVMe' : drive.isExternal ? 'USB' : 'Unknown',
    busInterfaceSpeed: drive.interface,
    formFactor: drive.isExternal ? 'External Storage' : 'Internal Storage',
    controllerVendor: drive.bridgeChipset || undefined,
    totalCapacityBytes: drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : null,
    totalCapacityGb: drive.capacityGb,
    totalLbaSectors: drive.totalSectors > 0 ? drive.totalSectors : null,
    logicalSectorSize: null,
    physicalSectorSize: null,
    isAdvancedFormat: null,
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
    if (drive.totalSectors <= 0) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'UNKNOWN_DISK_GEOMETRY',
        zoneTag
      };
    }

    const driveIndex = getDriveIndexFromId(drive);
    if (driveIndex === null) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'INVALID_DRIVE_INDEX',
        zoneTag
      };
    }
    const startLba = (BigInt(blockIndex) * BigInt(drive.totalSectors)) / BigInt(Math.max(1, totalBlocks));
    const startLbaNum = Math.min(drive.totalSectors - 1, Number(startLba));
    const sectorCount = Math.max(1, Math.min(128, drive.totalSectors - startLbaNum));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;

    try {
      const res = await queryTauriScanBlock(driveIndex, startLbaNum, sectorCount);
      if (res) {
        const latencyMs = Number(res.latencyMs ?? 0);
        const status: 'good' | 'normal' | 'slow' | 'critical' | 'bad' =
          res.statusCode === 0 ? (latencyMs < 10 ? 'good' : 'normal') :
          res.statusCode === 1 ? 'normal' :
          res.statusCode === 2 ? 'slow' :
          res.statusCode === 3 ? 'critical' : 'bad';

        const throughputMbSec = latencyMs > 0
          ? Number((((sectorCount * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
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
  const driveIndex = drive ? getDriveIndexFromId(drive) : null;
  if (drive && driveIndex !== null && isTauriDesktopRuntime()) {
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
    const remainingSectors = drive.totalSectors > 0 ? Math.max(1, drive.totalSectors - lba) : 128;
    const sectorCount = Math.max(1, Math.min(128, remainingSectors));
    const bytesWrittenTotal = sectorCount * secBytes;
    const t0 = performance.now();
    const repairRes = await queryTauriRepairSectorDetailed(driveIndex, lba, sectorCount);
    const t1 = performance.now();
    const success = repairRes.success;
    const latencyMs =
      typeof repairRes.latencyMs === 'number' && repairRes.latencyMs > 0
        ? repairRes.latencyMs
        : Math.max(0.01, Number((t1 - t0).toFixed(3)));
    const throughputMbSec = success
      ? Number(((bytesWrittenTotal / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
      : 0;

    return {
      success,
      latencyMs,
      throughputMbSec,
      bytesWritten: success ? bytesWrittenTotal : 0,
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
 * Real Sector Repair via Tauri Core IPC (with measured Win32 repair latencyMs)
 */
export async function queryTauriRepairSectorDetailed(
  driveIndex: number,
  lba: number,
  count: number
): Promise<{ success: boolean; latencyMs: number | null }> {
  if (!isTauriDesktopRuntime()) return { success: false, latencyMs: null };
  try {
    const res = await (window as any).__TAURI__.core.invoke('attempt_sector_repair', { driveIndex, lba, count });
    return {
      success: !!res?.success,
      latencyMs: typeof res?.latencyMs === 'number' && Number.isFinite(res.latencyMs) ? res.latencyMs : null
    };
  } catch (err) {
    console.warn('Tauri sector repair failed:', err);
    return { success: false, latencyMs: null };
  }
}

export async function queryTauriRepairSector(driveIndex: number, lba: number, count: number): Promise<boolean> {
  const res = await queryTauriRepairSectorDetailed(driveIndex, lba, count);
  return res.success;
}

/**
 * Real Windows Hardware Safe Eject (FSCTL_LOCK_VOLUME + FSCTL_DISMOUNT_VOLUME + IOCTL_STORAGE_EJECT_MEDIA + CM_Request_Device_EjectW)
 */
export async function invokeTauriEjectPhysicalDrive(
  drive: DiskDrive
): Promise<{ success: boolean; message: string; win32ErrorCode?: number }> {
  const driveIndex = getDriveIndexFromId(drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      success: false,
      message: '하드웨어 안전 제거는 Tauri Windows 데스크톱 네이티브 IPC 환경에서만 실행할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('eject_physical_drive', { driveIndex });
    return {
      success: Boolean(res?.success),
      message: String(res?.message || (res?.success ? '장치 안전 제거 완료' : '하드웨어 안전 제거 실패')),
      win32ErrorCode: typeof res?.win32ErrorCode === 'number' ? res.win32ErrorCode : undefined
    };
  } catch (err: any) {
    return {
      success: false,
      message: `하드웨어 안전 제거 IPC 오류: ${err?.message || String(err) || 'Unknown Error'}`
    };
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
 * Generates ordered LBA block indices for Sequential (Verify/Read/Erase) or Butterfly Read.
 * Quick Scan samples every 10th block (stride = 10) for rapid drive health overview.
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
  const stride = scanMode === 'quick' ? 10 : 1;

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

    if (drive.totalSectors <= 0) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'UNKNOWN_DISK_GEOMETRY'
      };
    }

    const driveIndex = getDriveIndexFromId(drive);
    if (driveIndex === null) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'INVALID_DRIVE_INDEX'
      };
    }
    const startLba = (BigInt(blockIndex) * BigInt(drive.totalSectors)) / BigInt(Math.max(1, totalBlocks));
    const startLbaNum = Math.min(drive.totalSectors - 1, Number(startLba));
    const sectorCount = Math.max(1, Math.min(128, drive.totalSectors - startLbaNum));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
    const t0 = performance.now();
    const repairRes = await queryTauriRepairSectorDetailed(driveIndex, startLbaNum, sectorCount);
    const ok = repairRes.success;
    const latencyMs =
      typeof repairRes.latencyMs === 'number' && repairRes.latencyMs > 0
        ? repairRes.latencyMs
        : Math.max(0.05, Number((performance.now() - t0).toFixed(3)));
    const throughputMbSec = ok
      ? Number((((sectorCount * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
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
    if (drive.totalSectors <= 0) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'UNKNOWN_DISK_GEOMETRY'
      };
    }

    const driveIndex = getDriveIndexFromId(drive);
    if (driveIndex === null) {
      return {
        status: 'bad',
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'INVALID_DRIVE_INDEX'
      };
    }
    const startLba = (BigInt(blockIndex) * BigInt(drive.totalSectors)) / BigInt(Math.max(1, totalBlocks));
    const startLbaNum = Math.min(drive.totalSectors - 1, Number(startLba));
    const sectorCount = Math.max(1, Math.min(128, drive.totalSectors - startLbaNum));
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;

    const verifyRes = await queryTauriVerifyBlock(driveIndex, startLbaNum, sectorCount);
    if (verifyRes) {
      const latencyMs = Number(verifyRes.latencyMs ?? 0);
      const status: 'good' | 'normal' | 'slow' | 'critical' | 'bad' =
        verifyRes.statusCode === 0 ? (latencyMs < 10 ? 'good' : 'normal') :
        verifyRes.statusCode === 1 ? 'normal' :
        verifyRes.statusCode === 2 ? 'slow' :
        verifyRes.statusCode === 3 ? 'critical' : 'bad';
      const throughputMbSec = latencyMs > 0
        ? Number((((sectorCount * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
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

export interface HddScanBlockProbeResult {
  blockIndex: number;
  status: 'good' | 'normal' | 'slow' | 'critical' | 'bad';
  latencyMs: number;
  throughputMbSec: number;
  errorCode?: string;
  checksum?: string;
  zoneTag?: 'Outer Track' | 'Middle Zone' | 'Inner Track' | 'MBR/FAT Area' | 'NAND Die Ch1' | 'NAND Die Ch2' | 'UASP Stream';
}

function computeZoneTagForBlock(
  drive: DiskDrive,
  methodId: SpecializedScanMethodId,
  blockIndex: number,
  totalBlocks: number
): HddScanBlockProbeResult['zoneTag'] {
  const progressRatio = blockIndex / Math.max(1, totalBlocks);
  if (drive.type === 'HDD' || methodId.startsWith('hdd')) {
    if (progressRatio < 0.33) return 'Outer Track';
    if (progressRatio < 0.66) return 'Middle Zone';
    return 'Inner Track';
  }
  if (drive.type === 'NVMe' || methodId.startsWith('nvme')) {
    return blockIndex % 2 === 0 ? 'NAND Die Ch1' : 'NAND Die Ch2';
  }
  if (methodId === 'usb_uasp_streaming') {
    return 'UASP Stream';
  }
  if (methodId === 'usb_fat_meta_priority' && progressRatio < 0.05) {
    return 'MBR/FAT Area';
  }
  return undefined;
}

/**
 * Executes a batch of HDDScan Surface Test probes in a single Tauri Core IPC call.
 */
export async function executeHddScanBlockBatch(
  drive: DiskDrive,
  methodId: SpecializedScanMethodId,
  blockIndices: number[],
  totalBlocks: number,
  testType: SurfaceTestType,
  usbPolicy?: UsbSurfaceScanPolicy
): Promise<HddScanBlockProbeResult[]> {
  if (blockIndices.length === 0) return [];

  if (testType === 'erase') {
    const guard = isSafeEraseTarget(drive);
    if (!guard.allowed) {
      return [
        {
          blockIndex: blockIndices[0],
          status: 'bad',
          latencyMs: -1,
          throughputMbSec: 0,
          errorCode: 'ERASE_BLOCKED_UNSAFE_TARGET'
        }
      ];
    }
    const results: HddScanBlockProbeResult[] = [];
    for (const blockIndex of blockIndices) {
      const res = await executeHddScanBlockProbe(drive, methodId, blockIndex, totalBlocks, testType);
      results.push({ blockIndex, ...res });
    }
    return results;
  }

  const effectivePolicy = usbPolicy ?? resolveUsbSurfaceScanPolicy(drive, methodId);

  if (drive.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    if (drive.totalSectors <= 0) {
      return blockIndices.map(blockIndex => ({
        blockIndex,
        status: 'bad' as const,
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'UNKNOWN_DISK_GEOMETRY',
        zoneTag: computeZoneTagForBlock(drive, methodId, blockIndex, totalBlocks)
      }));
    }

    const driveIndex = getDriveIndexFromId(drive);
    if (driveIndex === null) {
      return blockIndices.map(blockIndex => ({
        blockIndex,
        status: 'bad' as const,
        latencyMs: -1,
        throughputMbSec: 0,
        errorCode: 'INVALID_DRIVE_INDEX',
        zoneTag: computeZoneTagForBlock(drive, methodId, blockIndex, totalBlocks)
      }));
    }
    const secBytes = drive.hardwareSpecs?.logicalSectorSize || 512;
    const safeTotalBlocks = Math.max(1, totalBlocks);
    const verifyMode = testType === 'verify';
    const targetChunkSectors = effectivePolicy
      ? Math.max(1, Math.min(4096, effectivePolicy.chunkSectors))
      : 128;

    const items = blockIndices.slice(0, 128).map(blockIndex => {
      const startLba = (BigInt(blockIndex) * BigInt(drive.totalSectors)) / BigInt(safeTotalBlocks);
      const startLbaNum = Math.min(drive.totalSectors - 1, Number(startLba));
      const sectorCount = Math.max(1, Math.min(targetChunkSectors, drive.totalSectors - startLbaNum));
      return {
        blockId: blockIndex,
        lba: startLbaNum,
        sectorCount
      };
    });

    const nativePolicyArg = effectivePolicy
      ? {
          slowThresholdMs: effectivePolicy.slowThresholdMs,
          criticalThresholdMs: effectivePolicy.criticalThresholdMs,
          maxRetries: effectivePolicy.maxRetries,
          retryDelayMs: effectivePolicy.retryDelayMs,
          cooldownEveryNBlocks: effectivePolicy.cooldownEveryNBlocks,
          cooldownMs: effectivePolicy.cooldownMs
        }
      : null;

    try {
      const batchRes = await (window as any).__TAURI__.core.invoke('scan_lba_batch', {
        driveIndex,
        items,
        verifyMode,
        policy: nativePolicyArg
      });

      if (Array.isArray(batchRes) && batchRes.length > 0) {
        const itemsById = new Map(items.map(item => [item.blockId, item]));
        return batchRes.map((res: any, i: number) => {
          const fallbackItem =
            typeof res?.blockId === 'number'
              ? itemsById.get(res.blockId) ?? items[i]
              : items[i];
          const blockIndex = typeof res?.blockId === 'number' ? res.blockId : (fallbackItem?.blockId ?? i);
          const sectorCount = typeof res?.sectorCount === 'number' ? res.sectorCount : (fallbackItem?.sectorCount ?? targetChunkSectors);
          const latencyMs = Number(res?.latencyMs ?? 0);
          const statusCode = Number(res?.statusCode ?? 4);
          const win32ErrorCode = Number(res?.win32ErrorCode ?? 0);
          const status: 'good' | 'normal' | 'slow' | 'critical' | 'bad' =
            statusCode === 0 ? (effectivePolicy || latencyMs < 10 ? 'good' : 'normal') :
            statusCode === 1 ? 'normal' :
            statusCode === 2 ? 'slow' :
            statusCode === 3 ? 'critical' : 'bad';
          const throughputMbSec = latencyMs > 0
            ? Number((((sectorCount * secBytes) / (1024 * 1024)) / (latencyMs / 1000)).toFixed(1))
            : 0;

          return {
            blockIndex,
            status,
            latencyMs,
            throughputMbSec,
            errorCode: statusCode >= 4
              ? `${verifyMode ? 'VERIFY_WIN32_' : 'WIN32_ERROR_'}${win32ErrorCode}`
              : undefined,
            checksum: status !== 'bad'
              ? (verifyMode ? 'IOCTL_DISK_VERIFY_OK' : 'WIN32_IO_OK')
              : undefined,
            zoneTag: verifyMode ? undefined : computeZoneTagForBlock(drive, methodId, blockIndex, totalBlocks)
          };
        });
      }
    } catch (err) {
      console.warn('Tauri scan_lba_batch failed, falling back to single-block probes:', err);
    }
  }

  const fallbackResults: HddScanBlockProbeResult[] = [];
  for (const blockIndex of blockIndices) {
    const res = await executeHddScanBlockProbe(drive, methodId, blockIndex, totalBlocks, testType);
    fallbackResults.push({ blockIndex, ...res });
  }
  return fallbackResults;
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

    const statusNibble = code !== null ? (code >> 4) & 0x0F : null;
    let status: SmartSelfTestState['status'] = 'idle';
    if (!supported) status = 'unsupported';
    else if (inProgress || statusNibble === 0x0F) status = 'running';
    else if (code === 0x00) status = 'completed';
    else if (statusNibble !== null && statusNibble >= 1 && statusNibble <= 8) status = 'aborted';

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
export async function queryTauriPollTemperatures(
  driveIndices?: number[]
): Promise<{ driveIndex: number; temperatureC: number | null }[]> {
  if (!isTauriDesktopRuntime()) return [];
  try {
    const validIndices = driveIndices?.filter(n => Number.isInteger(n) && n >= 0);
    const res = await (window as any).__TAURI__.core.invoke('poll_drive_temperatures', {
      driveIndices: validIndices && validIndices.length > 0 ? validIndices : null
    });
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

/**
 * Checks whether a physical drive contains the OS system/boot volume (C: or PhysicalDrive0).
 */
export function isSystemOrBootDrive(drive: DiskDrive): boolean {
  const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
  const partitions = drive.hardwareSpecs?.partitions || [];
  const hasSystemPartition =
    /\bC:/i.test(drive.mountPoint || '') ||
    partitions.some(p => /^C:/i.test(p.letterOrMount || ''));
  return hasSystemPartition || (driveIndex === 0 && (hasSystemPartition || partitions.length === 0));
}

export function getDriveIndexFromId(drive: DiskDrive): number | null {
  if (!drive.id.startsWith('drive-tauri-physical-')) return null;
  const idx = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

function readAtaAsciiString(bytes: number[], startWord: number, wordCount: number): string {
  const chars: string[] = [];
  for (let w = 0; w < wordCount; w++) {
    const idx = (startWord + w) * 2;
    if (idx + 1 >= bytes.length) break;
    // ATA ASCII strings swap high and low bytes within each 16-bit word
    const c1 = bytes[idx + 1];
    const c2 = bytes[idx];
    if (c1 >= 32 && c1 <= 126) chars.push(String.fromCharCode(c1));
    if (c2 >= 32 && c2 <= 126) chars.push(String.fromCharCode(c2));
  }
  return chars.join('').trim();
}

function readLeU16(bytes: number[], wordIndex: number): number {
  const idx = wordIndex * 2;
  if (idx + 1 >= bytes.length) return 0;
  return (bytes[idx] | (bytes[idx + 1] << 8)) >>> 0;
}

function formatWordHex(val: number): string {
  return `0x${val.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function decodeAtaIdentifyBytes(bytes: number[]): DriveIdentifyField[] {
  if (bytes.length < 512) return [];
  const fields: DriveIdentifyField[] = [];

  const w0 = readLeU16(bytes, 0);
  const w47 = readLeU16(bytes, 47);
  const w49 = readLeU16(bytes, 49);
  const w53 = readLeU16(bytes, 53);
  const w63 = readLeU16(bytes, 63);
  const w69 = readLeU16(bytes, 69);
  const w75 = readLeU16(bytes, 75);
  const w76 = readLeU16(bytes, 76);
  const w78 = readLeU16(bytes, 78);
  const w80 = readLeU16(bytes, 80);
  const w82 = readLeU16(bytes, 82);
  const w83 = readLeU16(bytes, 83);
  const w85 = readLeU16(bytes, 85);
  const w86 = readLeU16(bytes, 86);
  const w88 = readLeU16(bytes, 88);
  const w91 = readLeU16(bytes, 91);
  const w94 = readLeU16(bytes, 94);
  const w106 = readLeU16(bytes, 106);
  const w128 = readLeU16(bytes, 128);
  const w169 = readLeU16(bytes, 169);
  const w217 = readLeU16(bytes, 217);

  // LBA48 total sectors (Words 100..103) and LBA28 fallback (Words 60..61)
  let lba48 = 0n;
  for (let i = 0; i < 4; i++) {
    lba48 |= BigInt(readLeU16(bytes, 100 + i)) << BigInt(i * 16);
  }
  const lba28 = BigInt((readLeU16(bytes, 60) | (readLeU16(bytes, 61) << 16)) >>> 0);
  const effectiveLba = lba48 > 0n ? lba48 : lba28;

  // Serial (10..19), Firmware (23..26), Model (27..46)
  const serial = readAtaAsciiString(bytes, 10, 10) || 'N/A';
  const firmware = readAtaAsciiString(bytes, 23, 4) || 'N/A';
  const model = readAtaAsciiString(bytes, 27, 20) || 'N/A';

  // WWN (Words 108..111)
  const wwnWords = [108, 109, 110, 111].map(w => readLeU16(bytes, w).toString(16).toUpperCase().padStart(4, '0'));

  // ATA Major Version (Word 80)
  let ataStd = 'ATA/ATAPI';
  if ((w80 & (1 << 11)) !== 0) ataStd = 'ACS-4 (ATA-11)';
  else if ((w80 & (1 << 10)) !== 0) ataStd = 'ACS-3 (ATA-10)';
  else if ((w80 & (1 << 9)) !== 0) ataStd = 'ACS-2 (ATA-9)';
  else if ((w80 & (1 << 8)) !== 0) ataStd = 'ATA8-ACS';
  else if ((w80 & (1 << 7)) !== 0) ataStd = 'ATA/ATAPI-7';

  // SATA speed (Word 76)
  const sataRates: string[] = [];
  if ((w76 & (1 << 1)) !== 0) sataRates.push('Gen1 (1.5Gb/s)');
  if ((w76 & (1 << 2)) !== 0) sataRates.push('Gen2 (3.0Gb/s)');
  if ((w76 & (1 << 3)) !== 0) sataRates.push('Gen3 (6.0Gb/s)');
  const ncqSupported = (w76 & (1 << 8)) !== 0;
  const ncqDepth = ncqSupported ? (w75 & 0x1F) + 1 : 0;

  // UDMA Modes (Word 88)
  const udmaSupportedMask = w88 & 0xFF;
  const udmaActiveMask = (w88 >> 8) & 0xFF;
  let maxUdma = -1;
  let activeUdma = -1;
  for (let b = 0; b <= 6; b++) {
    if ((udmaSupportedMask & (1 << b)) !== 0) maxUdma = b;
    if ((udmaActiveMask & (1 << b)) !== 0) activeUdma = b;
  }

  // Sector geometry (Word 106)
  const physPerLogicalExp = (w106 & 0xC000) === 0x4000 && (w106 & (1 << 13)) !== 0 ? (w106 & 0x0F) : 0;
  const logicalPerSector = (w106 & (1 << 12)) !== 0
    ? ((readLeU16(bytes, 117) | (readLeU16(bytes, 118) << 16)) >>> 0) * 2
    : 512;
  const physicalSectorBytes = logicalPerSector * Math.pow(2, physPerLogicalExp);

  // RPM (Word 217)
  const rpmLabel =
    w217 === 0x0001
      ? 'Non-Rotating Media (SSD / Flash)'
      : w217 > 0x0400 && w217 !== 0xFFFF
      ? `${w217.toLocaleString()} RPM`
      : 'Not Reported';

  fields.push(
    {
      wordIndex: '0',
      byteOffsetStart: 0,
      byteLength: 2,
      name: 'General Configuration',
      rawHex: formatWordHex(w0),
      decodedValue: (w0 & 0x8000) === 0 ? `ATA Device · ${(w0 & 0x0080) !== 0 ? 'Removable' : 'Fixed Media'}` : 'Non-ATA / ATAPI',
      category: 'General'
    },
    {
      wordIndex: '10..19',
      byteOffsetStart: 20,
      byteLength: 20,
      name: 'Serial Number (ATA ASCII)',
      rawHex: bytes.slice(20, 24).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: serial,
      category: 'General'
    },
    {
      wordIndex: '23..26',
      byteOffsetStart: 46,
      byteLength: 8,
      name: 'Firmware Revision',
      rawHex: bytes.slice(46, 54).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: firmware,
      category: 'General'
    },
    {
      wordIndex: '27..46',
      byteOffsetStart: 54,
      byteLength: 40,
      name: 'Model Number',
      rawHex: bytes.slice(54, 58).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: model,
      category: 'General'
    },
    {
      wordIndex: '108..111',
      byteOffsetStart: 216,
      byteLength: 8,
      name: 'World Wide Name (WWN)',
      rawHex: wwnWords.join('-'),
      decodedValue: `IEEE OUI-64: ${wwnWords.join('')}`,
      category: 'General'
    },
    {
      wordIndex: '80',
      byteOffsetStart: 160,
      byteLength: 2,
      name: 'ATA/ATAPI Major Version',
      rawHex: formatWordHex(w80),
      decodedValue: ataStd,
      category: 'General'
    },
    {
      wordIndex: '217',
      byteOffsetStart: 434,
      byteLength: 2,
      name: 'Nominal Media Rotation Rate',
      rawHex: formatWordHex(w217),
      decodedValue: rpmLabel,
      category: 'Geometry'
    },
    {
      wordIndex: lba48 > 0n ? '100..103' : '60..61',
      byteOffsetStart: lba48 > 0n ? 200 : 120,
      byteLength: lba48 > 0n ? 8 : 4,
      name: lba48 > 0n ? '48-bit LBA Addressable Sectors' : '28-bit LBA Addressable Sectors',
      rawHex: `0x${effectiveLba.toString(16).toUpperCase()}`,
      decodedValue: `${effectiveLba.toLocaleString()} sectors (${((Number(effectiveLba) * logicalPerSector) / (1024 ** 3)).toFixed(2)} GiB)`,
      category: 'Geometry'
    },
    {
      wordIndex: '106',
      byteOffsetStart: 212,
      byteLength: 2,
      name: 'Physical / Logical Sector Size',
      rawHex: formatWordHex(w106),
      decodedValue: `Logical ${logicalPerSector}B · Physical ${physicalSectorBytes}B`,
      category: 'Geometry'
    },
    {
      wordIndex: '47 / 49',
      byteOffsetStart: 94,
      byteLength: 6,
      name: 'Multiple R/W & DMA / LBA Caps',
      rawHex: `${formatWordHex(w47)} / ${formatWordHex(w49)}`,
      decodedValue: `Max ${w47 & 0xFF} sec/DRQ · DMA:${(w49 & (1 << 8)) !== 0 ? 'Yes' : 'No'} · LBA:${(w49 & (1 << 9)) !== 0 ? 'Yes' : 'No'}`,
      category: 'Transfer'
    },
    {
      wordIndex: '76 / 75',
      byteOffsetStart: 150,
      byteLength: 4,
      name: 'SATA Signaling & NCQ Depth',
      rawHex: `${formatWordHex(w76)} / ${formatWordHex(w75)}`,
      decodedValue: `${sataRates.length > 0 ? sataRates.join(', ') : 'Parallel/Bridge'} · NCQ: ${ncqSupported ? `Supported (QD ${ncqDepth})` : 'No'}`,
      category: 'Transfer'
    },
    {
      wordIndex: '78',
      byteOffsetStart: 156,
      byteLength: 2,
      name: 'SATA Capabilities (DIPM / SSP)',
      rawHex: formatWordHex(w78),
      decodedValue: `Device Initiated PM: ${(w78 & (1 << 3)) !== 0 ? 'Yes' : 'No'} · DevSleep: ${(w78 & (1 << 8)) !== 0 ? 'Yes' : 'No'}`,
      category: 'Power'
    },
    {
      wordIndex: '88 / 63',
      byteOffsetStart: 176,
      byteLength: 2,
      name: 'UltraDMA & Multiword DMA Modes',
      rawHex: `${formatWordHex(w88)} / ${formatWordHex(w63)}`,
      decodedValue: maxUdma >= 0 ? `Max UDMA${maxUdma} · Active ${activeUdma >= 0 ? `UDMA${activeUdma}` : 'None'}` : 'PIO / Non-UDMA',
      category: 'Transfer'
    },
    {
      wordIndex: '169 / 69',
      byteOffsetStart: 338,
      byteLength: 2,
      name: 'Data Set Management (TRIM)',
      rawHex: `${formatWordHex(w169)} / ${formatWordHex(w69)}`,
      decodedValue: `TRIM: ${(w169 & 1) !== 0 ? 'Supported' : 'No'} · RZAT/DRAT: ${(w69 & (1 << 5)) !== 0 ? 'Zero-Read' : (w69 & (1 << 14)) !== 0 ? 'Deterministic' : 'Standard'}`,
      category: 'Transfer'
    },
    {
      wordIndex: '82 / 85',
      byteOffsetStart: 164,
      byteLength: 2,
      name: 'SMART, Write Cache & Look-Ahead',
      rawHex: `${formatWordHex(w82)} / ${formatWordHex(w85)}`,
      decodedValue: `SMART: ${(w82 & 1) !== 0 ? ((w85 & 1) !== 0 ? 'Enabled' : 'Disabled') : 'Unsupported'} · Cache: ${(w82 & (1 << 5)) !== 0 ? ((w85 & (1 << 5)) !== 0 ? 'Enabled' : 'Disabled') : 'Unsupported'} · Look-Ahead: ${(w82 & (1 << 6)) !== 0 ? ((w85 & (1 << 6)) !== 0 ? 'Enabled' : 'Disabled') : 'Unsupported'}`,
      category: 'Power'
    },
    {
      wordIndex: '83 / 86',
      byteOffsetStart: 166,
      byteLength: 2,
      name: 'AAM, APM & 48-bit LBA Feature Set',
      rawHex: `${formatWordHex(w83)} / ${formatWordHex(w86)}`,
      decodedValue: `AAM: ${(w83 & (1 << 9)) !== 0 ? ((w86 & (1 << 9)) !== 0 ? 'Enabled' : 'Disabled') : 'Unsupported'} · APM: ${(w83 & (1 << 3)) !== 0 ? ((w86 & (1 << 3)) !== 0 ? 'Enabled' : 'Disabled') : 'Unsupported'}`,
      category: 'Power'
    },
    {
      wordIndex: '91',
      byteOffsetStart: 182,
      byteLength: 2,
      name: 'Current APM Level',
      rawHex: formatWordHex(w91),
      decodedValue: (w83 & (1 << 3)) !== 0 ? `0x${(w91 & 0xFF).toString(16).toUpperCase().padStart(2, '0')} (${w91 & 0xFF})` : 'N/A (APM Unsupported)',
      category: 'Power'
    },
    {
      wordIndex: '94',
      byteOffsetStart: 188,
      byteLength: 2,
      name: 'Current / Recommended AAM Value',
      rawHex: formatWordHex(w94),
      decodedValue: (w83 & (1 << 9)) !== 0
        ? `Current: 0x${(w94 & 0xFF).toString(16).toUpperCase().padStart(2, '0')} (${w94 & 0xFF}) · Vendor Rec: 0x${((w94 >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`
        : 'N/A (AAM Unsupported)',
      category: 'Power'
    },
    {
      wordIndex: '128',
      byteOffsetStart: 256,
      byteLength: 2,
      name: 'Security Status & Freeze Lock',
      rawHex: formatWordHex(w128),
      decodedValue: `Supported: ${(w128 & 1) !== 0 ? 'Yes' : 'No'} · Enabled: ${(w128 & (1 << 1)) !== 0 ? 'Locked' : 'Unlocked'} · Frozen: ${(w128 & (1 << 3)) !== 0 ? 'Frozen' : 'Not Frozen'} · Enhanced Erase: ${(w128 & (1 << 5)) !== 0 ? 'Yes' : 'No'}`,
      category: 'Security'
    }
  );

  void w53;
  return fields;
}

export function decodeNvmeIdentifyBytes(bytes: number[]): DriveIdentifyField[] {
  if (bytes.length < 512) return [];
  const asciiSlice = (start: number, len: number) =>
    bytes
      .slice(start, start + len)
      .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ''))
      .join('')
      .trim();
  const u16At = (off: number) => ((bytes[off] || 0) | ((bytes[off + 1] || 0) << 8)) >>> 0;
  const u32At = (off: number) =>
    ((bytes[off] || 0) | ((bytes[off + 1] || 0) << 8) | ((bytes[off + 2] || 0) << 16) | ((bytes[off + 3] || 0) << 24)) >>> 0;

  const vid = u16At(0);
  const ssvid = u16At(2);
  const serial = asciiSlice(4, 20) || 'N/A';
  const model = asciiSlice(24, 40) || 'N/A';
  const fw = asciiSlice(64, 8) || 'N/A';
  const ver = u32At(80);
  const verMajor = (ver >> 16) & 0xFFFF;
  const verMinor = (ver >> 8) & 0xFF;
  const verTert = ver & 0xFF;
  const mdts = bytes[77] || 0;
  const wctempK = u16At(266);
  const cctempK = u16At(268);
  const npss = bytes[263] || 0;
  const apsta = bytes[265] || 0;
  const oncs = u16At(520); // may be beyond 512 preview, safely 0 if truncated

  return [
    {
      wordIndex: '0x00..0x03',
      byteOffsetStart: 0,
      byteLength: 4,
      name: 'PCI Vendor / Subsystem VID',
      rawHex: `0x${vid.toString(16).toUpperCase().padStart(4, '0')} / 0x${ssvid.toString(16).toUpperCase().padStart(4, '0')}`,
      decodedValue: `VID 0x${vid.toString(16).toUpperCase().padStart(4, '0')} · SSVID 0x${ssvid.toString(16).toUpperCase().padStart(4, '0')}`,
      category: 'General'
    },
    {
      wordIndex: '0x04..0x17',
      byteOffsetStart: 4,
      byteLength: 20,
      name: 'Serial Number (SN)',
      rawHex: bytes.slice(4, 8).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: serial,
      category: 'General'
    },
    {
      wordIndex: '0x18..0x3F',
      byteOffsetStart: 24,
      byteLength: 40,
      name: 'Model Number (MN)',
      rawHex: bytes.slice(24, 28).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: model,
      category: 'General'
    },
    {
      wordIndex: '0x40..0x47',
      byteOffsetStart: 64,
      byteLength: 8,
      name: 'Firmware Revision (FR)',
      rawHex: bytes.slice(64, 72).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      decodedValue: fw,
      category: 'General'
    },
    {
      wordIndex: '0x50..0x53',
      byteOffsetStart: 80,
      byteLength: 4,
      name: 'NVMe Spec Version (VER)',
      rawHex: `0x${ver.toString(16).toUpperCase().padStart(8, '0')}`,
      decodedValue: ver > 0 ? `NVMe ${verMajor}.${verMinor}.${verTert}` : 'N/A',
      category: 'Transfer'
    },
    {
      wordIndex: '0x4D',
      byteOffsetStart: 77,
      byteLength: 1,
      name: 'Max Data Transfer Size (MDTS)',
      rawHex: `0x${mdts.toString(16).toUpperCase().padStart(2, '0')}`,
      decodedValue: mdts > 0 ? `2^${mdts} pages (${Math.pow(2, mdts) * 4} KiB max)` : 'Unlimited',
      category: 'Transfer'
    },
    {
      wordIndex: '0x107..0x109',
      byteOffsetStart: 263,
      byteLength: 3,
      name: 'Power States (NPSS / APSTA)',
      rawHex: `${npss} / 0x${apsta.toString(16).toUpperCase().padStart(2, '0')}`,
      decodedValue: `${npss + 1} Power States · APST: ${(apsta & 1) !== 0 ? 'Supported' : 'No'}`,
      category: 'Power'
    },
    {
      wordIndex: '0x10A..0x10D',
      byteOffsetStart: 266,
      byteLength: 4,
      name: 'Warning / Critical Composite Temp',
      rawHex: `0x${wctempK.toString(16).toUpperCase()} / 0x${cctempK.toString(16).toUpperCase()}`,
      decodedValue: `${wctempK >= 273 ? `${wctempK - 273}°C` : 'N/A'} warn / ${cctempK >= 273 ? `${cctempK - 273}°C` : 'N/A'} critical`,
      category: 'Power'
    }
  ];

  void oncs;
}

export async function queryTauriDriveIdentify(drive: DiskDrive): Promise<DriveIdentifySnapshot> {
  const driveIndex = getDriveIndexFromId(drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      supported: false,
      protocol: 'UNSUPPORTED',
      rawBytes: [],
      decodedFields: [],
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 512바이트 Drive Identify 원시 데이터를 조회할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('get_drive_identify_data', { driveIndex });
    const supported = Boolean(res?.supported);
    const protocol: DriveIdentifySnapshot['protocol'] =
      res?.protocol === 'ATA' || res?.protocol === 'NVMe' ? res.protocol : 'UNSUPPORTED';
    const rawBytes: number[] = Array.isArray(res?.rawBytes) ? res.rawBytes.map((n: any) => Number(n) & 0xFF) : [];
    const decodedFields =
      supported && protocol === 'ATA'
        ? decodeAtaIdentifyBytes(rawBytes)
        : supported && protocol === 'NVMe'
        ? decodeNvmeIdentifyBytes(rawBytes)
        : [];
    return {
      supported,
      protocol,
      rawBytes,
      decodedFields,
      reason: typeof res?.reason === 'string' ? res.reason : undefined
    };
  } catch (err: any) {
    return {
      supported: false,
      protocol: 'UNSUPPORTED',
      rawBytes: [],
      decodedFields: [],
      reason: `Identify 조회 실패: ${err?.message || 'IOCTL Error'}`
    };
  }
}

export async function queryTauriDriveFeatures(drive: DiskDrive): Promise<DriveFeatureStatus> {
  const driveIndex = getDriveIndexFromId(drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      driveIndex: driveIndex ?? 0,
      protocol: 'UNSUPPORTED',
      isAtaPassthroughAvailable: false,
      powerMode: 'unknown',
      aamSupported: false,
      aamEnabled: false,
      aamCurrent: null,
      aamRecommended: null,
      apmSupported: false,
      apmEnabled: false,
      apmCurrent: null,
      pmSupported: false,
      writeCacheSupported: false,
      writeCacheEnabled: false,
      readLookAheadSupported: false,
      readLookAheadEnabled: false,
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 ATA/NVMe 하드웨어 기능 제어를 사용할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('get_drive_features', { driveIndex });
    return {
      driveIndex,
      protocol: res?.protocol === 'ATA' || res?.protocol === 'NVMe' ? res.protocol : 'UNSUPPORTED',
      isAtaPassthroughAvailable: Boolean(res?.isAtaPassthroughAvailable),
      powerMode:
        res?.powerMode === 'active_idle' || res?.powerMode === 'standby' || res?.powerMode === 'sleep'
          ? res.powerMode
          : 'unknown',
      aamSupported: Boolean(res?.aamSupported),
      aamEnabled: Boolean(res?.aamEnabled),
      aamCurrent: typeof res?.aamCurrent === 'number' ? res.aamCurrent : null,
      aamRecommended: typeof res?.aamRecommended === 'number' ? res.aamRecommended : null,
      apmSupported: Boolean(res?.apmSupported),
      apmEnabled: Boolean(res?.apmEnabled),
      apmCurrent: typeof res?.apmCurrent === 'number' ? res.apmCurrent : null,
      pmSupported: Boolean(res?.pmSupported),
      writeCacheSupported: Boolean(res?.writeCacheSupported),
      writeCacheEnabled: Boolean(res?.writeCacheEnabled),
      readLookAheadSupported: Boolean(res?.readLookAheadSupported),
      readLookAheadEnabled: Boolean(res?.readLookAheadEnabled),
      reason: typeof res?.reason === 'string' ? res.reason : undefined
    };
  } catch (err: any) {
    return {
      driveIndex,
      protocol: 'UNSUPPORTED',
      isAtaPassthroughAvailable: false,
      powerMode: 'unknown',
      aamSupported: false,
      aamEnabled: false,
      aamCurrent: null,
      aamRecommended: null,
      apmSupported: false,
      apmEnabled: false,
      apmCurrent: null,
      pmSupported: false,
      writeCacheSupported: false,
      writeCacheEnabled: false,
      readLookAheadSupported: false,
      readLookAheadEnabled: false,
      reason: `하드웨어 기능 조회 실패: ${err?.message || 'IOCTL Error'}`
    };
  }
}

async function invokeFeatureCommand(command: string, args: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  if (!isTauriDesktopRuntime()) {
    return {
      success: false,
      message: 'Tauri 데스크톱 네이티브 IPC 환경이 필요합니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke(command, args);
    return {
      success: Boolean(res?.success),
      message: String(res?.message || (res?.success ? '명령 실행 완료' : '컨트롤러가 명령을 거부했습니다.'))
    };
  } catch (err: any) {
    return {
      success: false,
      message: `명령 전송 오류: ${err?.message || 'IOCTL Error'}`
    };
  }
}

export async function invokeTauriSetAam(drive: DiskDrive, enable: boolean, level: number) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('set_drive_aam', { driveIndex, enable, level: Math.max(0x80, Math.min(0xFE, Math.round(level))) });
}

export async function invokeTauriSetApm(drive: DiskDrive, enable: boolean, level: number) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('set_drive_apm', { driveIndex, enable, level: Math.max(0x01, Math.min(0xFE, Math.round(level))) });
}

export async function invokeTauriSetWriteCache(drive: DiskDrive, enable: boolean) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('set_drive_write_cache', { driveIndex, enable });
}

export async function invokeTauriSetReadLookAhead(drive: DiskDrive, enable: boolean) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('set_drive_read_look_ahead', { driveIndex, enable });
}

export async function invokeTauriSetStandbyTimer(drive: DiskDrive, timerCode: number) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('set_drive_standby_timer', { driveIndex, timerCode: Math.max(0, Math.min(255, Math.round(timerCode))) });
}

export async function invokeTauriSpindownNow(drive: DiskDrive) {
  const driveIndex = getDriveIndexFromId(drive);
  if (driveIndex === null) return { success: false, message: '물리 디스크 핸들이 아닙니다.' };
  return invokeFeatureCommand('spindown_drive_now', { driveIndex });
}

export async function queryTauriSmartExtendedLogs(drive: DiskDrive): Promise<SmartExtendedLogsResponse> {
  const driveIndex = getDriveIndexFromId(drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      supported: false,
      protocol: 'UNSUPPORTED',
      selfTestLogs: [],
      errorLogs: [],
      totalErrorCount: 0,
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 펌웨어 Self-Test / 오류 로그(06h/01h)를 조회할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('get_smart_extended_logs', { driveIndex });
    return {
      supported: Boolean(res?.supported),
      protocol: res?.protocol === 'ATA' || res?.protocol === 'NVMe' ? res.protocol : 'UNSUPPORTED',
      selfTestLogs: Array.isArray(res?.selfTestLogs) ? res.selfTestLogs : [],
      errorLogs: Array.isArray(res?.errorLogs) ? res.errorLogs : [],
      totalErrorCount: typeof res?.totalErrorCount === 'number' ? res.totalErrorCount : 0,
      reason: typeof res?.reason === 'string' ? res.reason : undefined
    };
  } catch (err: any) {
    return {
      supported: false,
      protocol: 'UNSUPPORTED',
      selfTestLogs: [],
      errorLogs: [],
      totalErrorCount: 0,
      reason: `확장 로그 조회 실패: ${err?.message || 'IOCTL Error'}`
    };
  }
}

export interface TauriLbaBenchmarkSample {
  supported: boolean;
  startLba: number;
  blockBytes: number;
  iterations: number;
  throughputMbSec: number;
  iops: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  p99LatencyMs: number;
  statusCode: number;
  win32ErrorCode: number;
  reason?: string;
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export interface RawSectorBytesResponse {
  supported: boolean;
  driveIndex: number;
  startLba: number;
  sectorCount: number;
  sectorSize: number;
  bytes: Uint8Array;
  reason?: string;
}

export async function queryTauriRawSectorBytes(
  drive: DiskDrive,
  startLba: number,
  sectorCount = 1
): Promise<RawSectorBytesResponse> {
  const driveIndex = getDriveIndexFromId(drive);
  const safeLba = Math.max(0, Math.floor(startLba));
  const safeCount = Math.max(1, Math.min(2048, Math.floor(sectorCount)));
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      supported: false,
      driveIndex: driveIndex ?? -1,
      startLba: safeLba,
      sectorCount: safeCount,
      sectorSize: drive.hardwareSpecs?.logicalSectorSize || 512,
      bytes: new Uint8Array(0),
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 물리 디스크의 원시 LBA 섹터 덤프를 직접 읽을 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('read_raw_sector_range_b64', {
      driveIndex,
      startLba: safeLba,
      sectorCount: safeCount
    });
    const bytes = typeof res?.bytesBase64 === 'string'
      ? decodeBase64ToUint8Array(res.bytesBase64)
      : new Uint8Array(0);
    return {
      supported: bytes.length > 0,
      driveIndex,
      startLba: typeof res?.startLba === 'number' ? res.startLba : safeLba,
      sectorCount: typeof res?.sectorCount === 'number' ? res.sectorCount : safeCount,
      sectorSize: typeof res?.sectorSize === 'number' ? res.sectorSize : 512,
      bytes,
      reason: bytes.length === 0 ? '섹터 버퍼가 비어 있습니다.' : undefined
    };
  } catch {
    // Fallback to legacy JSON array command if older backend binary is present
    try {
      const legacyCount = Math.min(64, safeCount);
      const res = await (window as any).__TAURI__.core.invoke('read_raw_sector_range', {
        driveIndex,
        startLba: safeLba,
        sectorCount: legacyCount
      });
      const bytes = Array.isArray(res?.bytes) ? Uint8Array.from(res.bytes, (b: unknown) => Number(b) & 0xff) : new Uint8Array(0);
      return {
        supported: bytes.length > 0,
        driveIndex,
        startLba: typeof res?.startLba === 'number' ? res.startLba : safeLba,
        sectorCount: typeof res?.sectorCount === 'number' ? res.sectorCount : legacyCount,
        sectorSize: typeof res?.sectorSize === 'number' ? res.sectorSize : 512,
        bytes,
        reason: bytes.length === 0 ? '섹터 버퍼가 비어 있습니다.' : undefined
      };
    } catch (err: any) {
      return {
        supported: false,
        driveIndex,
        startLba: safeLba,
        sectorCount: safeCount,
        sectorSize: drive.hardwareSpecs?.logicalSectorSize || 512,
        bytes: new Uint8Array(0),
        reason: `원시 섹터 읽기 실패 (LBA #${safeLba}): ${err?.message || String(err) || 'IOCTL Error'}`
      };
    }
  }
}

export async function queryTauriRawSectorRange(
  drive: DiskDrive,
  startLba: number,
  sectorCount = 1
): Promise<RawSectorRangeResponse> {
  const res = await queryTauriRawSectorBytes(drive, startLba, sectorCount);
  return {
    supported: res.supported,
    driveIndex: res.driveIndex,
    startLba: res.startLba,
    sectorCount: res.sectorCount,
    sectorSize: res.sectorSize,
    bytes: Array.from(res.bytes),
    reason: res.reason
  };
}

export async function queryTauriLbaBenchmarkSample(
  drive: DiskDrive,
  startLba: number,
  blockBytes = 1048576,
  mode: 0 | 1 = 0,
  iterations = 4
): Promise<TauriLbaBenchmarkSample> {
  const driveIndex = getDriveIndexFromId(drive);
  const safeLba = Math.max(0, Math.floor(startLba));
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      supported: false,
      startLba: safeLba,
      blockBytes,
      iterations,
      throughputMbSec: 0,
      iops: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      p99LatencyMs: 0,
      statusCode: 0,
      win32ErrorCode: 0,
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 실시간 Win32 Direct I/O 구간 벤치마크를 계측할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('run_lba_benchmark_sample', {
      driveIndex,
      startLba: safeLba,
      blockBytes,
      mode,
      iterations
    });
    return {
      supported: true,
      startLba: typeof res?.startLba === 'number' ? res.startLba : safeLba,
      blockBytes: typeof res?.blockBytes === 'number' ? res.blockBytes : blockBytes,
      iterations: typeof res?.iterations === 'number' ? res.iterations : iterations,
      throughputMbSec: typeof res?.throughputMbSec === 'number' ? res.throughputMbSec : 0,
      iops: typeof res?.iops === 'number' ? res.iops : 0,
      avgLatencyMs: typeof res?.avgLatencyMs === 'number' ? res.avgLatencyMs : 0,
      minLatencyMs: typeof res?.minLatencyMs === 'number' ? res.minLatencyMs : 0,
      p99LatencyMs: typeof res?.p99LatencyMs === 'number' ? res.p99LatencyMs : 0,
      statusCode: typeof res?.statusCode === 'number' ? res.statusCode : 0,
      win32ErrorCode: typeof res?.win32ErrorCode === 'number' ? res.win32ErrorCode : 0
    };
  } catch (err: any) {
    return {
      supported: false,
      startLba: safeLba,
      blockBytes,
      iterations,
      throughputMbSec: 0,
      iops: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      p99LatencyMs: 0,
      statusCode: 0,
      win32ErrorCode: 0,
      reason: `벤치마크 샘플링 오류 (LBA #${safeLba}): ${err?.message || String(err) || 'IOCTL Error'}`
    };
  }
}

export async function invokeTauriCopyLbaChunk(
  drive: DiskDrive,
  startLba: number,
  sectorCount: number,
  outputPath: string,
  destByteOffset: number,
  fillZeroOnly = false
): Promise<{
  supported: boolean;
  success: boolean;
  startLba: number;
  sectorCount: number;
  bytesWritten: number;
  statusCode: number;
  win32ErrorCode: number;
  reason?: string;
}> {
  const driveIndex = getDriveIndexFromId(drive);
  const safeLba = Math.max(0, Math.floor(startLba));
  const safeCount = Math.max(1, Math.floor(sectorCount));
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      supported: false,
      success: false,
      startLba: safeLba,
      sectorCount: safeCount,
      bytesWritten: 0,
      statusCode: 4,
      win32ErrorCode: 0,
      reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 섹터 이미지 파일 복제를 실행할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('copy_lba_range_to_file', {
      driveIndex,
      startLba: safeLba,
      sectorCount: safeCount,
      outputPath,
      destByteOffset: Math.max(0, Math.floor(destByteOffset)),
      fillZeroOnly
    });
    return {
      supported: true,
      success: Boolean(res?.success),
      startLba: typeof res?.startLba === 'number' ? res.startLba : safeLba,
      sectorCount: typeof res?.sectorCount === 'number' ? res.sectorCount : safeCount,
      bytesWritten: typeof res?.bytesWritten === 'number' ? res.bytesWritten : 0,
      statusCode: typeof res?.statusCode === 'number' ? res.statusCode : 4,
      win32ErrorCode: typeof res?.win32ErrorCode === 'number' ? res.win32ErrorCode : 0
    };
  } catch (err: any) {
    return {
      supported: true,
      success: false,
      startLba: safeLba,
      sectorCount: safeCount,
      bytesWritten: 0,
      statusCode: 4,
      win32ErrorCode: 0,
      reason: err?.message || String(err) || 'LBA Copy IPC Failed'
    };
  }
}

export async function invokeTauriSaveCloneMap(mapPath: string, jsonContent: string): Promise<{ ok: boolean; error?: string }> {
  if (!isTauriDesktopRuntime()) {
    return { ok: false, error: 'Tauri 데스크톱 환경이 아닙니다.' };
  }
  try {
    await (window as any).__TAURI__.core.invoke('save_lba_clone_map', { mapPath, jsonContent });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function invokeTauriLoadCloneMap(mapPath: string): Promise<{ ok: boolean; jsonContent?: string; error?: string }> {
  if (!isTauriDesktopRuntime()) {
    return { ok: false, error: 'Tauri 데스크톱 환경이 아닙니다.' };
  }
  try {
    const content = await (window as any).__TAURI__.core.invoke('load_lba_clone_map', { mapPath });
    return { ok: true, jsonContent: String(content) };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function invokeTauriStartDdrescueBackup(params: {
  drive: DiskDrive;
  rangeStartLba: number;
  rangeEndLba: number;
  outputPath: string;
  mapPath: string;
  chunkSectors: number;
  maxRetries: number;
  zeroFillBad: boolean;
  resumeIntervals?: { startLba: number; sectorCount: number; status: string; attempts: number; lastErrorCode?: number }[];
}): Promise<{ ok: boolean; status?: import('../types').DdrescueBackendStatus; error?: string }> {
  const driveIndex = getDriveIndexFromId(params.drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      ok: false,
      error: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 ddrescue 백업 엔진을 실행할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('start_ddrescue_backup', {
      driveIndex,
      rangeStartLba: Math.max(0, Math.floor(params.rangeStartLba)),
      rangeEndLba: Math.max(0, Math.floor(params.rangeEndLba)),
      outputPath: params.outputPath,
      mapPath: params.mapPath,
      chunkSectors: Math.max(16, Math.floor(params.chunkSectors)),
      maxRetries: Math.max(1, Math.min(5, Math.floor(params.maxRetries))),
      zeroFillBad: Boolean(params.zeroFillBad),
      resumeIntervalsJson: params.resumeIntervals ? JSON.stringify(params.resumeIntervals) : null
    });
    return { ok: true, status: res as import('../types').DdrescueBackendStatus };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) || 'ddrescue 백업 시작 실패' };
  }
}

export async function queryTauriDdrescueBackupStatus(): Promise<import('../types').DdrescueBackendStatus | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    const res = await (window as any).__TAURI__.core.invoke('get_ddrescue_backup_status');
    return res as import('../types').DdrescueBackendStatus;
  } catch {
    return null;
  }
}

export async function invokeTauriPauseDdrescueBackup(): Promise<{ ok: boolean; status?: import('../types').DdrescueBackendStatus }> {
  if (!isTauriDesktopRuntime()) return { ok: false };
  try {
    const res = await (window as any).__TAURI__.core.invoke('pause_ddrescue_backup');
    return { ok: true, status: res as import('../types').DdrescueBackendStatus };
  } catch {
    return { ok: false };
  }
}

export async function queryTauriSanitizeCapabilities(drive: DiskDrive): Promise<{
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
}> {
  const driveIndex = getDriveIndexFromId(drive);
  const empty = {
    supported: false,
    driveIndex: driveIndex ?? 0,
    model: drive.model,
    serialNumber: drive.serialNumber,
    protocol: 'UNSUPPORTED' as const,
    isSystemDrive: Boolean(
      /\bC:/i.test(drive.mountPoint || '') ||
        drive.hardwareSpecs?.partitions?.some(p => /^C:/i.test(p.letterOrMount || ''))
    ),
    mountedVolumes: drive.hardwareSpecs?.partitions?.map(p => p.letterOrMount).filter(Boolean) || [],
    trimSupported: Boolean(drive.hardwareSpecs?.trimSupported),
    osTrimEnabled: null,
    ataSecurity: {
      supported: false,
      enabled: false,
      locked: false,
      frozen: false,
      countExpired: false,
      enhancedEraseSupported: false,
      eraseTimeMin: 0,
      enhancedEraseTimeMin: 0
    },
    nvmeFormat: {
      formatSupported: false,
      cryptoEraseSupported: false,
      sanitizeBlockErase: false,
      sanitizeCryptoErase: false,
      sanitizeOverwrite: false,
      oacsRaw: 0,
      fnaRaw: 0,
      sanicapRaw: 0
    },
    reason: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 보안 삭제 및 TRIM 제어 상태를 조회할 수 있습니다.'
  };

  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return empty;
  }

  try {
    const res = await (window as any).__TAURI__.core.invoke('inspect_sanitize_capabilities', { driveIndex });
    return {
      supported: Boolean(res?.supported),
      driveIndex: typeof res?.driveIndex === 'number' ? res.driveIndex : driveIndex,
      model: String(res?.model || drive.model),
      serialNumber: String(res?.serialNumber || drive.serialNumber),
      protocol: res?.protocol === 'ATA' || res?.protocol === 'NVMe' ? res.protocol : 'UNSUPPORTED',
      isSystemDrive: Boolean(res?.isSystemDrive),
      mountedVolumes: Array.isArray(res?.mountedVolumes) ? res.mountedVolumes : [],
      trimSupported: Boolean(res?.trimSupported),
      osTrimEnabled: typeof res?.osTrimEnabled === 'boolean' ? res.osTrimEnabled : null,
      ataSecurity: {
        supported: Boolean(res?.ataSecurity?.supported),
        enabled: Boolean(res?.ataSecurity?.enabled),
        locked: Boolean(res?.ataSecurity?.locked),
        frozen: Boolean(res?.ataSecurity?.frozen),
        countExpired: Boolean(res?.ataSecurity?.countExpired),
        enhancedEraseSupported: Boolean(res?.ataSecurity?.enhancedEraseSupported),
        eraseTimeMin: Number(res?.ataSecurity?.eraseTimeMin || 0),
        enhancedEraseTimeMin: Number(res?.ataSecurity?.enhancedEraseTimeMin || 0)
      },
      nvmeFormat: {
        formatSupported: Boolean(res?.nvmeFormat?.formatSupported),
        cryptoEraseSupported: Boolean(res?.nvmeFormat?.cryptoEraseSupported),
        sanitizeBlockErase: Boolean(res?.nvmeFormat?.sanitizeBlockErase),
        sanitizeCryptoErase: Boolean(res?.nvmeFormat?.sanitizeCryptoErase),
        sanitizeOverwrite: Boolean(res?.nvmeFormat?.sanitizeOverwrite),
        oacsRaw: Number(res?.nvmeFormat?.oacsRaw || 0),
        fnaRaw: Number(res?.nvmeFormat?.fnaRaw || 0),
        sanicapRaw: Number(res?.nvmeFormat?.sanicapRaw || 0)
      }
    };
  } catch (err: any) {
    return {
      ...empty,
      reason: `하드웨어 보안/TRIM 기능 조회 실패: ${err?.message || String(err)}`
    };
  }
}

export async function invokeTauriSanitizeOrTrim(
  drive: DiskDrive,
  action: 'volume_trim' | 'nvme_format_user' | 'nvme_format_crypto' | 'ata_security_erase',
  confirmationSerial?: string,
  volumeLetter?: string
): Promise<{ success: boolean; action: string; win32ErrorCode?: number; message: string }> {
  const driveIndex = getDriveIndexFromId(drive);
  if (!isTauriDesktopRuntime() || driveIndex === null) {
    return {
      success: false,
      action,
      message: 'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 실행할 수 있습니다.'
    };
  }
  try {
    const res = await (window as any).__TAURI__.core.invoke('execute_sanitize_or_trim', {
      driveIndex,
      action,
      confirmationSerial: confirmationSerial || null,
      volumeLetter: volumeLetter || null
    });
    return {
      success: Boolean(res?.success),
      action: String(res?.action || action),
      win32ErrorCode: typeof res?.win32ErrorCode === 'number' ? res.win32ErrorCode : undefined,
      message: String(res?.message || '명령 응답 없음')
    };
  } catch (err: any) {
    return {
      success: false,
      action,
      message: `명령 실행 실패: ${err?.message || String(err)}`
    };
  }
}

export interface NativeForensicsEntropyResponse {
  ok: boolean;
  source?: string;
  inspectedBytes?: number;
  crc32?: string;
  sectorClass?: number;
  shannonEntropy?: number;
  zeroByteRatio?: number;
  ffByteRatio?: number;
  printableRatio?: number;
  hasRepeatingPattern?: boolean;
  repeatingWord32?: string;
  classificationLabel?: string;
  error?: string;
}

/**
 * Queries DiskSentinelForensics.dll (via local Win32 Native Bridge /api/native/forensics/entropy)
 * for Shannon entropy, erased-NAND 0xFF ratio, poison pattern detection, and IEEE 802.3 CRC32.
 */
export async function queryNativeForensicsEntropy(
  driveIndex: number,
  lba: number,
  size = 512
): Promise<NativeForensicsEntropyResponse | null> {
  if (!isNativeBridgeRuntime()) return null;
  try {
    const res = await fetch('/api/native/forensics/entropy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveIndex, lba, size })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.ok !== 'boolean') return null;
    return data as NativeForensicsEntropyResponse;
  } catch {
    return null;
  }
}

/**
 * Probes Win32 USB Host/Hub descriptor topology across all 32 physical slots.
 */
export async function queryTauriUsbTopologyAll(): Promise<any[]> {
  if (!isTauriDesktopRuntime()) return [];
  try {
    const res = await (window as any).__TAURI__.core.invoke('probe_usb_topology_all');
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

/**
 * Probes physical disk LBA extents (Win32 FSCTL_GET_RETRIEVAL_POINTERS + IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS)
 * and computes streaming FIPS 180-4 SHA-256 hashes for critical folder/file integrity monitoring.
 * Returns null when running outside Tauri Desktop IPC.
 */
export async function queryTauriProbePathsIntegrity(
  paths: string[],
  maxFiles = 200,
  maxFileBytes = 512 * 1024 * 1024
): Promise<IntegrityProbeResult[] | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    const res = await (window as any).__TAURI__.core.invoke('probe_paths_lba_integrity', {
      paths,
      maxFiles,
      maxFileBytes
    });
    if (!Array.isArray(res)) return [];
    return res.map((item: any) => ({
      filePath: String(item?.filePath || ''),
      status:
        item?.status === 'ok' ||
        item?.status === 'missing' ||
        item?.status === 'skipped_too_large' ||
        item?.status === 'unreadable'
          ? item.status
          : 'unreadable',
      sizeBytes: typeof item?.sizeBytes === 'number' ? item.sizeBytes : 0,
      modifiedMs: typeof item?.modifiedMs === 'number' ? item.modifiedMs : null,
      sha256: typeof item?.sha256 === 'string' ? item.sha256 : null,
      driveIndex: typeof item?.driveIndex === 'number' ? item.driveIndex : null,
      extents: Array.isArray(item?.extents)
        ? item.extents.map((e: any) => ({
            startLba: Number(e?.startLba || 0),
            endLba: Number(e?.endLba || 0),
            sectorCount: Number(e?.sectorCount || 0)
          }))
        : [],
      note: typeof item?.note === 'string' ? item.note : undefined
    }));
  } catch {
    return null;
  }
}

/**
 * Opens native Win32 folder or multi-file picker dialog for selecting integrity watch targets.
 * Returns null when running outside Tauri Desktop IPC.
 */
export async function queryTauriPickIntegrityPaths(pickFolder: boolean): Promise<string[] | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    const res = await (window as any).__TAURI__.core.invoke('pick_integrity_paths', {
      pickFolder
    });
    return Array.isArray(res) ? res.map(String).filter(Boolean) : [];
  } catch {
    return null;
  }
}

/**
 * Updates Tauri System Tray tooltip and minimize-on-close daemon behavior.
 */
export async function invokeTauriSyncTrayState(
  tooltip: string,
  minimizeOnClose: boolean
): Promise<boolean> {
  if (!isTauriDesktopRuntime()) return false;
  try {
    const res = await (window as any).__TAURI__.core.invoke('sync_tray_guardian_state', {
      tooltip,
      minimizeOnClose
    });
    return Boolean(res);
  } catch {
    return false;
  }
}

/**
 * Sends a native Windows OS Balloon/Toast notification via Tauri Win32 backend.
 */
export async function invokeTauriNativeNotification(
  title: string,
  body: string,
  severity: 'info' | 'warning' | 'critical' = 'info'
): Promise<boolean> {
  if (!isTauriDesktopRuntime()) return false;
  try {
    const res = await (window as any).__TAURI__.core.invoke('send_native_os_notification', {
      title,
      body,
      severity
    });
    return Boolean(res);
  } catch {
    return false;
  }
}


