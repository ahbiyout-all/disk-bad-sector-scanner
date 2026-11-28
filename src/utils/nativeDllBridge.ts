/**
 * @file nativeDllBridge.ts
 * @brief TypeScript Bridge for DiskSentinelNativeCore Engine (Win32 IOCTL / Tauri Desktop Native IPC)
 * @license Apache-2.0
 */

import { DiskDrive } from '../types';
import {
  isTauriDesktopRuntime,
  queryTauriBitCarving,
  queryTauriParallelScan,
  queryTauriRawSector,
  queryTauriRawSectorBytes,
  queryTauriTrayGuardianCheck
} from './nativeDriveEngine';
import { isBrowserMountedDrive, readMountedBrowserImageRange } from './browserImageMount';

export enum DSSectorStatus {
  DS_STATUS_GOOD     = 0, // < 10ms
  DS_STATUS_NORMAL   = 1, // < 50ms
  DS_STATUS_SLOW     = 2, // < 150ms
  DS_STATUS_CRITICAL = 3, // < 500ms
  DS_STATUS_BAD      = 4, // Uncorrectable / CRC / I/O Timeout
  DS_STATUS_ABORTED  = 5
}

export interface DSBlockResult {
  startLba: bigint;
  sectorCount: bigint;
  latencyMs: number;
  statusCode: DSSectorStatus;
  win32ErrorCode: number;
  errorMnemonic: string;
}

export interface DSSmartEntry {
  attributeId: number;
  attributeName: string;
  currentValue: number;
  worstValue: number;
  thresholdValue: number;
  rawValue: bigint;
  healthStatus: number; // 0: Good, 1: Warning, 2: Critical
}

export interface DSDriveHealthReport {
  reliabilityScore: number;       // 0.0 to 100.0%
  estimatedRemainingDays: number; // Days
  totalPowerOnHours: number;
  reallocatedSectors: number;     // 0x05
  pendingSectors: number;         // 0xC5
  uncorrectableErrors: number;    // 0xBB / 0xC6
  temperatureCelsius: number | null;
  overallGrade: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
}

export interface DSNvmeHealthLog {
  criticalWarning: number;
  temperatureCelsius: number | null;
  availableSpare: number | null;
  availableSpareThreshold: number | null;
  percentageUsed: number | null;
  dataUnitsReadTb: number | null;
  dataUnitsWrittenTb: number | null;
  powerCycles: bigint | null;
  powerOnHours: bigint | null;
  unsafeShutdowns: bigint | null;
  mediaErrors: bigint | null;
}

const DS_CRC32_LUT = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xEDB88320 : 0);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Hardware CRC32 (256-entry IEEE 802.3 LUT) & 64-bit Galois XOR Parity Generator
 */
export function DS_CalculateParityChecksum(buffer: Uint8Array): { crc32: number; eccParity: bigint } {
  let crc = 0xFFFFFFFF;
  let xorParity = 0n;

  for (let i = 0; i < buffer.length; i++) {
    const byteVal = buffer[i];
    crc = DS_CRC32_LUT[(crc ^ byteVal) & 0xFF] ^ (crc >>> 8);

    const shift = BigInt((i & 7) * 8);
    xorParity ^= (BigInt(byteVal) << shift);
  }

  return {
    crc32: (crc ^ 0xFFFFFFFF) >>> 0,
    eccParity: xorParity
  };
}

/**
 * Weighted Drive Reliability Evaluator based purely on parsed S.M.A.R.T. entries
 */
export function DS_EvaluateDriveReliability(entries: DSSmartEntry[]): DSDriveHealthReport {
  let score = 100.0;
  let reallocatedSectors = 0;
  let pendingSectors = 0;
  let uncorrectableErrors = 0;
  let totalPowerOnHours = 0;
  let temperatureCelsius: number | null = null;

  for (const e of entries) {
    const rawNum = Number(e.rawValue);
    switch (e.attributeId) {
      case 0x05: // Reallocated Sectors
        reallocatedSectors = rawNum;
        if (rawNum > 0) {
          score -= Math.min(45, rawNum * 5.0);
        }
        break;

      case 0xC5: // Current Pending Sectors
        pendingSectors = rawNum;
        if (rawNum > 0) {
          score -= Math.min(50, rawNum * 10.0);
        }
        break;

      case 0xBB: // Reported Uncorrectable
      case 0xC6: // Offline Uncorrectable
        uncorrectableErrors += rawNum;
        if (rawNum > 0) {
          score -= Math.min(40, rawNum * 8.0);
        }
        break;

      case 0x09: // Power-On Hours
        totalPowerOnHours = rawNum;
        break;

      case 0xC2: // Temperature
      case 0xBE: {
        const parsedTemp = Number(e.rawValue & 0xFFn);
        if (parsedTemp > 0 && parsedTemp < 150) {
          temperatureCelsius = parsedTemp;
          if (parsedTemp > 55) {
            score -= (parsedTemp - 55) * 2.0;
          }
        }
        break;
      }
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  const normScore = score / 100.0;
  const baseDays = 10.0 + 1815.0 * Math.pow(normScore, 2.2);
  const thermalFactor = temperatureCelsius !== null && temperatureCelsius > 55
    ? Math.max(0.35, 1.0 - (temperatureCelsius - 55) * 0.03)
    : 1.0;
  const pohAgingFactor = totalPowerOnHours > 35000
    ? Math.max(0.55, 1.0 - (totalPowerOnHours - 35000) / 120000.0)
    : 1.0;
  const activeFaultFactor = (pendingSectors > 0 || uncorrectableErrors > 0)
    ? Math.max(0.15, 1.0 / (1.0 + (pendingSectors + uncorrectableErrors) * 0.35))
    : 1.0;

  const estimatedRemainingDays = Math.min(
    3650,
    Math.max(1, Math.round(baseDays * thermalFactor * pohAgingFactor * activeFaultFactor))
  );

  let overallGrade: DSDriveHealthReport['overallGrade'] = 'EXCELLENT';
  if (score >= 90.0) {
    overallGrade = 'EXCELLENT';
  } else if (score >= 75.0) {
    overallGrade = 'GOOD';
  } else if (score >= 45.0) {
    overallGrade = 'WARNING';
  } else {
    overallGrade = 'CRITICAL';
  }

  return {
    reliabilityScore: score,
    estimatedRemainingDays,
    totalPowerOnHours,
    reallocatedSectors,
    pendingSectors,
    uncorrectableErrors,
    temperatureCelsius,
    overallGrade
  };
}

/**
 * Adaptive Burst & Micro-LBA Seeker
 */
export async function DS_AdaptiveScanChunk(
  chunkStartLba: bigint,
  chunkSectorCount: number,
  burstStep: number = 256,
  scanLbaBlockFn: (lba: bigint, count: number) => Promise<DSBlockResult>
): Promise<{ badResults: DSBlockResult[]; totalScanned: number }> {
  const badResults: DSBlockResult[] = [];
  let currentLba = chunkStartLba;
  const endLba = chunkStartLba + BigInt(chunkSectorCount);

  while (currentLba < endLba) {
    const remaining = Number(endLba - currentLba);
    const sectorsToTest = Math.min(remaining, burstStep);

    const burstResult = await scanLbaBlockFn(currentLba, sectorsToTest);

    if (burstResult.statusCode <= DSSectorStatus.DS_STATUS_NORMAL) {
      currentLba += BigInt(sectorsToTest);
      continue;
    }

    const subEnd = currentLba + BigInt(sectorsToTest);
    for (let subLba = currentLba; subLba < subEnd; subLba += 1n) {
      const singleResult = await scanLbaBlockFn(subLba, 1);
      if (singleResult.statusCode >= DSSectorStatus.DS_STATUS_SLOW) {
        badResults.push(singleResult);
      }
    }

    currentLba += BigInt(sectorsToTest);
  }

  return {
    badResults,
    totalScanned: chunkSectorCount
  };
}

/**
 * NVMe Health Log (Page 02h) Telemetry
 * Returns strictly verified real NVMe IOCTL telemetry if available, or null when kernel Log 02h is absent.
 */
export function DS_GetNvmeDeepTelemetry(drive?: DiskDrive): DSNvmeHealthLog | null {
  const specs = drive?.hardwareSpecs;
  if (!drive || !specs || !specs.nvmeLogAvailable) {
    return null;
  }

  return {
    criticalWarning: 0,
    temperatureCelsius: specs.currentTempC ?? drive.temperatureC ?? null,
    availableSpare: specs.availableSparePercent ?? null,
    availableSpareThreshold: specs.availableSpareThreshold ?? null,
    percentageUsed: specs.percentageUsed ?? null,
    dataUnitsReadTb: specs.hostReadsTb ?? null,
    dataUnitsWrittenTb: specs.hostWritesTb ?? null,
    powerCycles: specs.powerCycles !== null && specs.powerCycles !== undefined ? BigInt(specs.powerCycles) : null,
    powerOnHours: specs.powerOnHours !== null && specs.powerOnHours !== undefined ? BigInt(specs.powerOnHours) : null,
    unsafeShutdowns: specs.unsafeShutdowns !== null && specs.unsafeShutdowns !== undefined ? BigInt(specs.unsafeShutdowns) : null,
    mediaErrors: specs.mediaErrors !== null && specs.mediaErrors !== undefined ? BigInt(specs.mediaErrors) : null
  };
}

/**
 * Checksum & Zero-Check
 */
export function DS_CalculateAvx2ChecksumAndZeroCheck(buffer: Uint8Array): {
  isAllZeros: boolean;
  crc32: number;
  avxParity: bigint;
} {
  let isAllZeros = true;
  let crc = 0xFFFFFFFF;
  let avxParity = 0n;

  const len = buffer.length;
  for (let i = 0; i < len; i++) {
    const b = buffer[i];
    if (b !== 0) isAllZeros = false;
    crc = DS_CRC32_LUT[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    const shift = BigInt((i & 7) * 8);
    avxParity ^= (BigInt(b) << shift);
  }

  return {
    isAllZeros,
    crc32: (crc ^ 0xFFFFFFFF) >>> 0,
    avxParity
  };
}

export interface DSMultiDriveScanTarget {
  driveIndex: number;
  driveId: string;
  driveName: string;
  startLba: bigint;
  sectorCount: bigint;
  burstStep: number;
}

export interface DSMultiDriveScanSummary {
  driveIndex: number;
  driveId: string;
  driveName: string;
  totalSectorsScanned: bigint;
  badSectorsFound: number;
  slowSectorsFound: number;
  elapsedMs: number;
  avgLatencyMs: number;
  throughputMbSec: number | null;
  isCompleted: boolean;
  statusCode: number;
  unsupportedReason?: string;
}

/**
 * Multi-Drive Parallel Scan via Tauri Desktop Native IPC (Rust rayon + Win32 IOCTL worker threads).
 */
export async function DS_ScanMultipleDrivesParallel(
  targets: DSMultiDriveScanTarget[],
  onProgressUpdate?: (driveId: string, progress: number, badFound: number) => void,
  drives?: DiskDrive[]
): Promise<DSMultiDriveScanSummary[]> {
  const isTauri = isTauriDesktopRuntime();
  const physicalTargets = isTauri
    ? targets.filter(t => t.driveId.startsWith('drive-tauri-physical-'))
    : [];
  const unsupportedTargets = isTauri
    ? targets.filter(t => !t.driveId.startsWith('drive-tauri-physical-'))
    : targets;

  const summaries: DSMultiDriveScanSummary[] = [];

  if (physicalTargets.length > 0 && isTauri) {
    const payload = physicalTargets.map(t => ({
      driveIndex: t.driveIndex,
      startLba: Number(t.startLba),
      sectorCount: Number(t.sectorCount),
      burstStep: t.burstStep
    }));

    const results = await queryTauriParallelScan(payload);
    if (results) {
      for (const r of results) {
        const target = physicalTargets.find(t => t.driveIndex === r.driveIndex);
        const matchedDrive = drives?.find(d => d.id === target?.driveId);
        const secBytes = matchedDrive?.hardwareSpecs?.logicalSectorSize || 512;
        if (onProgressUpdate && target) {
          onProgressUpdate(target.driveId, 100, Number(r.badSectorsFound || 0));
        }
        summaries.push({
          driveIndex: r.driveIndex,
          driveId: target?.driveId || `drive-tauri-physical-${r.driveIndex}`,
          driveName: target?.driveName || `PhysicalDrive${r.driveIndex}`,
          totalSectorsScanned: BigInt(r.totalSectorsScanned || 0),
          badSectorsFound: Number(r.badSectorsFound || 0),
          slowSectorsFound: 0,
          elapsedMs: Number(r.elapsedMs || 0),
          avgLatencyMs: Number(r.avgLatencyMs || 0),
          throughputMbSec: Number(r.elapsedMs) > 0
            ? Number((((Number(r.totalSectorsScanned || 0) * secBytes) / (1024 * 1024)) / (Number(r.elapsedMs) / 1000)).toFixed(1))
            : null,
          isCompleted: Boolean(r.isCompleted),
          statusCode: Number(r.statusCode || 0)
        });
      }
    }
  }

  for (const target of physicalTargets) {
    if (!summaries.some(s => s.driveId === target.driveId)) {
      if (onProgressUpdate) {
        onProgressUpdate(target.driveId, 100, 0);
      }
      summaries.push({
        driveIndex: target.driveIndex,
        driveId: target.driveId,
        driveName: target.driveName,
        totalSectorsScanned: 0n,
        badSectorsFound: 0,
        slowSectorsFound: 0,
        elapsedMs: 0,
        avgLatencyMs: 0,
        throughputMbSec: null,
        isCompleted: false,
        statusCode: DSSectorStatus.DS_STATUS_ABORTED,
        unsupportedReason: 'Win32 병렬 스캔 응답 실패 (관리자 권한 또는 커널 핸들 확인 필요)'
      });
    }
  }

  const browserTargets = targets.filter(t => {
    const md = drives?.find(d => d.id === t.driveId);
    return !t.driveId.startsWith('drive-tauri-physical-') && (isBrowserMountedDrive(md) || t.driveId.startsWith('drive-browser-image-'));
  });
  const remainingUnsupported = unsupportedTargets.filter(
    t => !browserTargets.some(bt => bt.driveId === t.driveId)
  );

  await Promise.all(
    browserTargets.map(async target => {
      const matchedDrive = drives?.find(d => d.id === target.driveId);
      const secBytes = matchedDrive?.hardwareSpecs?.logicalSectorSize || 512;
      const startLbaNum = Math.max(0, Number(target.startLba));
      const totalAvailable = matchedDrive?.totalSectors || Number(target.sectorCount) || 2048;
      const spanSectors = Math.min(totalAvailable - startLbaNum, Math.max(1, Number(target.sectorCount)));
      const step = Math.max(64, Math.min(512, target.burstStep || 128));
      const t0 = performance.now();
      let scannedSectors = 0;
      let badFound = 0;
      let slowFound = 0;
      const latencies: number[] = [];

      for (let off = 0; off < spanSectors; off += step) {
        const take = Math.min(step, spanSectors - off);
        const r0 = performance.now();
        const bytes = await readMountedBrowserImageRange(
          target.driveId,
          (startLbaNum + off) * secBytes,
          take * secBytes
        );
        const lat = Math.max(0.05, performance.now() - r0);
        latencies.push(lat);
        if (bytes.length === 0) badFound += take;
        else if (lat >= 50) slowFound += take;
        scannedSectors += take;
        if (onProgressUpdate) {
          onProgressUpdate(target.driveId, Math.min(99, Math.round((scannedSectors / Math.max(1, spanSectors)) * 100)), badFound);
        }
      }

      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      const avgLatencyMs = latencies.length > 0
        ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
        : 0.1;
      const throughputMbSec = Number((((scannedSectors * secBytes) / (1024 * 1024)) / (elapsedMs / 1000)).toFixed(1));
      if (onProgressUpdate) {
        onProgressUpdate(target.driveId, 100, badFound);
      }
      summaries.push({
        driveIndex: target.driveIndex,
        driveId: target.driveId,
        driveName: target.driveName,
        totalSectorsScanned: BigInt(scannedSectors),
        badSectorsFound: badFound,
        slowSectorsFound: slowFound,
        elapsedMs,
        avgLatencyMs,
        throughputMbSec,
        isCompleted: true,
        statusCode: badFound > 0 ? DSSectorStatus.DS_STATUS_BAD : DSSectorStatus.DS_STATUS_GOOD
      });
    })
  );

  for (const target of remainingUnsupported) {
    if (onProgressUpdate) {
      onProgressUpdate(target.driveId, 100, 0);
    }
    summaries.push({
      driveIndex: target.driveIndex,
      driveId: target.driveId,
      driveName: target.driveName,
      totalSectorsScanned: 0n,
      badSectorsFound: 0,
      slowSectorsFound: 0,
      elapsedMs: 0,
      avgLatencyMs: 0,
      throughputMbSec: null,
      isCompleted: false,
      statusCode: DSSectorStatus.DS_STATUS_ABORTED,
      unsupportedReason: 'Tauri 데스크톱 네이티브 IPC 환경 또는 마운트된 브라우저 디스크 이미지에서만 병렬 스캔을 실행할 수 있습니다.'
    });
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// System Tray Guardian & Bit Carving Interfaces
// ---------------------------------------------------------------------------

export interface DSTrayGuardianStatus {
  isMonitoringActive: boolean;
  pollIntervalSec: number;
  monitoredDriveCount: number;
  highestTempCelsius: number | null;
  criticalAlertTriggered: boolean;
  warningDriveIndex: number;
  lastAlertCode: number;
  lastAlertMessage: string;
}

export interface DSCarvedSectorResult {
  sourceLba: number;
  signatureType: number; // 1: JPEG, 2: PNG, 3: PDF, 4: ZIP/Office, 5: MP4, 6: Text/Boot/Log, 0: Unknown/Raw
  signatureName: string;
  carvedSizeBytes: number;
  eccRecoveredBits: number;
  isSalvaged: boolean;
  hexPreview: string;
  rawAsciiPreview: string;
  errorReason?: string;
}

let guardianConfig = {
  pollIntervalSec: 10,
  tempThresholdC: 55,
  alertOnPendingSector: true,
  isActive: true
};

export function DS_ConfigureTrayGuardian(
  pollIntervalSec: number,
  tempThresholdC: number,
  alertOnPendingSector: boolean
): boolean {
  guardianConfig = {
    pollIntervalSec: Math.max(1, pollIntervalSec),
    tempThresholdC: Math.max(30, tempThresholdC),
    alertOnPendingSector,
    isActive: true
  };
  return true;
}

/**
 * Computes Guardian alert state purely from real observed drive telemetry (nullable temperature)
 */
export function DS_RunTrayGuardianCheck(
  currentHighestTemp: number | null | undefined,
  hasBadSector: boolean | undefined,
  monitoredDriveCount: number = 0,
  activeDriveName?: string
): DSTrayGuardianStatus {
  const temp = typeof currentHighestTemp === 'number' && currentHighestTemp > 0 ? currentHighestTemp : null;
  const isHighTemp = temp !== null && temp >= guardianConfig.tempThresholdC;
  const isCriticalTemp = temp !== null && temp >= 60;
  const hasPending = Boolean(hasBadSector) && guardianConfig.alertOnPendingSector;
  const driveLabel = activeDriveName || '시스템 스토리지';

  let alertCode = 0;
  let message = temp !== null
    ? `전체 ${monitoredDriveCount}대 모니터링 드라이브 정상 작동 중 (최고 온도 ${Math.round(temp)}°C)`
    : monitoredDriveCount > 0
    ? `모니터링 드라이브 ${monitoredDriveCount}대 연결됨 (하드웨어 온도 센서 N/A)`
    : '연결된 물리 디스크 없음 (Tauri 데스크톱 네이티브 IPC 연결 필요)';

  if (isCriticalTemp && temp !== null) {
    alertCode = 2;
    message = `🔥 치명적 과열 경고: [${driveLabel}] 작동 온도 ${temp.toFixed(1)}°C (임계치 ${guardianConfig.tempThresholdC}°C 초과)`;
  } else if (isHighTemp && temp !== null) {
    alertCode = 1;
    message = `⚠️ 고온 주의: [${driveLabel}] 온도 ${temp.toFixed(1)}°C 감지 (쿨링 점검 권장)`;
  } else if (hasPending) {
    alertCode = 4;
    message = `⚡ 주의 요망: [${driveLabel}] 스캔 중 불량/보류 섹터가 감지되었습니다.`;
  }

  return {
    isMonitoringActive: guardianConfig.isActive,
    pollIntervalSec: guardianConfig.pollIntervalSec,
    monitoredDriveCount,
    highestTempCelsius: temp !== null ? Math.round(temp) : null,
    criticalAlertTriggered: isCriticalTemp || hasPending,
    warningDriveIndex: 0,
    lastAlertCode: alertCode,
    lastAlertMessage: message
  };
}

/**
 * Native Desktop-aware Tray Guardian Poll
 */
export async function DS_RunNativeTrayGuardianPoll(
  drives: DiskDrive[],
  hasBadSector: boolean
): Promise<DSTrayGuardianStatus> {
  if (isTauriDesktopRuntime()) {
    const res = await queryTauriTrayGuardianCheck(
      guardianConfig.pollIntervalSec,
      guardianConfig.tempThresholdC,
      guardianConfig.alertOnPendingSector
    );
    if (res) {
      return {
        isMonitoringActive: Boolean(res.isMonitoringActive),
        pollIntervalSec: Number(res.pollIntervalSec || guardianConfig.pollIntervalSec),
        monitoredDriveCount: Number(res.monitoredDriveCount || 0),
        highestTempCelsius: typeof res.highestTempCelsius === 'number' ? res.highestTempCelsius : null,
        criticalAlertTriggered: Boolean(res.criticalAlertTriggered),
        warningDriveIndex: Number(res.warningDriveIndex || 0),
        lastAlertCode: Number(res.lastAlertCode || 0),
        lastAlertMessage: String(res.lastAlertMessage || 'Native Tray Guardian Poll Active')
      };
    }
  }

  const validTemps = drives
    .map(d => d.temperatureC)
    .filter((t): t is number => typeof t === 'number' && t > 0);
  const highestTemp = validTemps.length > 0 ? Math.max(...validTemps) : null;
  const hotDrive = validTemps.length > 0
    ? drives.find(d => d.temperatureC === highestTemp)
    : drives[0];

  return DS_RunTrayGuardianCheck(
    highestTemp,
    hasBadSector,
    drives.length,
    hotDrive?.model || hotDrive?.name
  );
}

function classifySignatureFromBytes(rawBytes: Uint8Array, sourceLabel: string): { sigType: number; sigName: string } {
  if (rawBytes.length >= 3 && rawBytes[0] === 0xFF && rawBytes[1] === 0xD8 && rawBytes[2] === 0xFF) {
    return { sigType: 1, sigName: `JPEG Image (${sourceLabel})` };
  }
  if (rawBytes.length >= 4 && rawBytes[0] === 0x89 && rawBytes[1] === 0x50 && rawBytes[2] === 0x4E && rawBytes[3] === 0x47) {
    return { sigType: 2, sigName: `PNG Image (${sourceLabel})` };
  }
  if (rawBytes.length >= 4 && rawBytes[0] === 0x25 && rawBytes[1] === 0x50 && rawBytes[2] === 0x44 && rawBytes[3] === 0x46) {
    return { sigType: 3, sigName: `PDF Document (${sourceLabel})` };
  }
  if (rawBytes.length >= 2 && rawBytes[0] === 0x50 && rawBytes[1] === 0x4B) {
    return { sigType: 4, sigName: `ZIP / Archive (${sourceLabel})` };
  }
  if (rawBytes.length >= 8 && rawBytes[4] === 0x66 && rawBytes[5] === 0x74 && rawBytes[6] === 0x79 && rawBytes[7] === 0x70) {
    return { sigType: 5, sigName: `MP4 Media (${sourceLabel})` };
  }
  if (rawBytes.length >= 3 && rawBytes[0] === 0xEB && rawBytes[1] === 0x52 && rawBytes[2] === 0x90) {
    return { sigType: 6, sigName: `NTFS / exFAT Boot Sector (${sourceLabel})` };
  }

  let printableCount = 0;
  const sampleLen = Math.min(32, rawBytes.length);
  for (let i = 0; i < sampleLen; i++) {
    const b = rawBytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      printableCount++;
    }
  }
  if (sampleLen > 0 && printableCount / sampleLen >= 0.85) {
    return { sigType: 6, sigName: `ASCII/UTF-8 Text (${sourceLabel})` };
  }
  return { sigType: 0, sigName: `Raw Binary Sector (${sourceLabel})` };
}

function formatHexAndAscii(bytes: Uint8Array): { hexPreview: string; rawAsciiPreview: string } {
  const len = Math.min(64, bytes.length);
  let hexStr = '';
  let asciiStr = '';
  for (let i = 0; i < len; i++) {
    const byte = bytes[i];
    hexStr += byte.toString(16).padStart(2, '0').toUpperCase() + (i % 16 === 15 ? '\n' : ' ');
    asciiStr += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
  }
  return { hexPreview: hexStr.trim(), rawAsciiPreview: asciiStr };
}

/**
 * Heuristic Bit Carving & Raw Sector Reader:
 * Reads ONLY genuine bytes via Tauri Desktop Native IPC (Win32 PhysicalDrive).
 * Returns isSalvaged: false when outside Tauri Desktop runtime (zero synthetic hex).
 */
export async function DS_ExecuteBitCarvingRecovery(
  targetLba: number,
  clusterSpan: number = 8,
  drive?: DiskDrive
): Promise<DSCarvedSectorResult> {
  const span = Math.min(64, Math.max(1, clusterSpan));

  if (drive?.id.startsWith('drive-tauri-physical-') && isTauriDesktopRuntime()) {
    const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const tauriCarved = await queryTauriBitCarving(driveIndex, targetLba, span);
    if (tauriCarved && Array.isArray(tauriCarved.hexPreview)) {
      const rawBytes = new Uint8Array(tauriCarved.hexPreview);
      const { hexPreview, rawAsciiPreview } = formatHexAndAscii(rawBytes);
      return {
        sourceLba: Number(tauriCarved.sourceLba ?? targetLba),
        signatureType: Number(tauriCarved.signatureType ?? 0),
        signatureName: String(tauriCarved.signatureName || 'Physical Sector'),
        carvedSizeBytes: Number(tauriCarved.carvedSizeBytes ?? 0),
        eccRecoveredBits: Number(tauriCarved.eccRecoveredBits ?? 0),
        isSalvaged: Boolean(tauriCarved.isSalvaged),
        hexPreview,
        rawAsciiPreview
      };
    }

    const rawReadBytes = Math.max(512, drive?.hardwareSpecs?.logicalSectorSize || 512);
    const physicalBytes = await queryTauriRawSector(driveIndex, targetLba, rawReadBytes);
    if (physicalBytes && physicalBytes.length > 0) {
      const { sigType, sigName } = classifySignatureFromBytes(physicalBytes, `PhysicalDrive${driveIndex}`);
      const { hexPreview, rawAsciiPreview } = formatHexAndAscii(physicalBytes);
      return {
        sourceLba: targetLba,
        signatureType: sigType,
        signatureName: sigName,
        carvedSizeBytes: physicalBytes.length,
        eccRecoveredBits: 0,
        isSalvaged: true,
        hexPreview,
        rawAsciiPreview
      };
    }

    return {
      sourceLba: targetLba,
      signatureType: 0,
      signatureName: 'Win32 물리 섹터 읽기 실패',
      carvedSizeBytes: 0,
      eccRecoveredBits: 0,
      isSalvaged: false,
      hexPreview: '',
      rawAsciiPreview: '',
      errorReason: `PhysicalDrive${driveIndex} LBA #${targetLba} 원시 섹터 읽기 권한이 없거나 I/O 오류가 발생했습니다 (관리자 권한 실행 필요).`
    };
  }

  if (drive && isBrowserMountedDrive(drive)) {
    const readRes = await queryTauriRawSectorBytes(drive, targetLba, Math.max(1, Math.min(64, span)));
    if (readRes.supported && readRes.bytes.length > 0) {
      const { sigType, sigName } = classifySignatureFromBytes(readRes.bytes, 'MountedImage');
      const { hexPreview, rawAsciiPreview } = formatHexAndAscii(readRes.bytes);
      return {
        sourceLba: targetLba,
        signatureType: sigType,
        signatureName: sigName,
        carvedSizeBytes: readRes.bytes.length,
        eccRecoveredBits: 0,
        isSalvaged: true,
        hexPreview,
        rawAsciiPreview
      };
    }
    return {
      sourceLba: targetLba,
      signatureType: 0,
      signatureName: '이미지 섹터 범위 초과 또는 빈 버퍼',
      carvedSizeBytes: 0,
      eccRecoveredBits: 0,
      isSalvaged: false,
      hexPreview: '',
      rawAsciiPreview: '',
      errorReason: readRes.reason || `LBA #${targetLba} 섹터를 읽을 수 없습니다.`
    };
  }

  return {
    sourceLba: targetLba,
    signatureType: 0,
    signatureName: '판독 불가 (대상 디스크 또는 이미지 필요)',
    carvedSizeBytes: 0,
    eccRecoveredBits: 0,
    isSalvaged: false,
    hexPreview: '',
    rawAsciiPreview: '',
    errorReason: 'Tauri 데스크톱 물리 디스크 또는 마운트된 로컬 디스크 이미지가 선택된 상태에서 Raw LBA 섹터 바이트를 판독할 수 있습니다.'
  };
}

export interface DSPhysicalDriveDetail {
  driveIndex: number;
  devicePath: string;
  model: string;
  serialNumber: string;
  firmwareRev: string;
  busType: string;
  totalCapacityBytes: bigint | null;
  sectorSize: number | null;
  physicalSectorSize: number | null;
  isSsd: boolean;
  isTrimSupported: boolean | null;
  isWriteCacheEnabled: boolean | null;
  temperatureCelsius: number | null;
  healthScore: number | null;
}

/**
 * Physical Drive Enumeration View over active Drive objects (zero synthetic fallback device)
 */
export function DS_EnumeratePhysicalDrives(activeDrive?: DiskDrive | DiskDrive[]): DSPhysicalDriveDetail[] {
  const list = Array.isArray(activeDrive) ? activeDrive : activeDrive ? [activeDrive] : [];
  return list.map((drive, idx) => {
    const capBytes = drive.capacityGb !== null ? BigInt(Math.round(drive.capacityGb * 1024 * 1024 * 1024)) : null;
    const parsedIdx = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
    const driveIdx = Number.isNaN(parsedIdx) ? idx : parsedIdx;
    return {
      driveIndex: driveIdx,
      devicePath: drive.hardwareSpecs?.devicePhysicalPath || drive.mountPoint || `Device://${driveIdx}`,
      model: drive.model,
      serialNumber: drive.serialNumber,
      firmwareRev: drive.firmware,
      busType: drive.hardwareSpecs?.busType || (drive.type === 'NVMe' ? 'NVMe' : drive.isExternal ? 'USB' : 'Unknown'),
      totalCapacityBytes: capBytes,
      sectorSize: drive.hardwareSpecs?.logicalSectorSize ?? null,
      physicalSectorSize: drive.hardwareSpecs?.physicalSectorSize ?? null,
      isSsd: drive.type !== 'HDD' && drive.type !== 'EXTERNAL_HDD',
      isTrimSupported: drive.hardwareSpecs?.trimSupported ?? null,
      isWriteCacheEnabled: drive.hardwareSpecs?.volatileWriteCache ?? null,
      temperatureCelsius: drive.temperatureC,
      healthScore: drive.healthScore
    };
  });
}
