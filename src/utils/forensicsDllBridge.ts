/**
 * @file forensicsDllBridge.ts
 * @brief TypeScript Bridge & Deterministic Parity Engine for DiskSentinelForensics.dll
 *        Dispatches to Tauri IPC (`DiskSentinelForensics.dll` Win32 LoadLibraryW / Rust parity)
 *        with exact TypeScript mathematical parity fallback when running outside Tauri desktop.
 * @license Apache-2.0
 */

import { DiskDrive, ParsedPartitionTable, SectorBlock, VbrBootInfo } from '../types';
import { isTauriDesktopRuntime } from './nativeDriveEngine';
import { detectVbrBootInfo, parsePartitionTableFromRawBytes } from './partitionParser';

export type ForensicsEngineSource = 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';

export interface ForensicsEngineStatus {
  dllLoaded: boolean;
  engineSource: ForensicsEngineSource;
  loadedPath: string | null;
  engineName: string;
  version: string;
  capabilitiesMask: number;
  crc32SelfTestValue: number;
  crc32SelfTestPassed: boolean;
}

export interface ForensicsSectorEntropyReport {
  engineSource: ForensicsEngineSource;
  inspectedBytes: number;
  crc32: number;
  repeatingWord32: number;
  sectorClass: 0 | 1 | 2 | 3 | 4 | 5;
  shannonEntropy: number;
  zeroByteRatio: number;
  ffByteRatio: number;
  printableRatio: number;
  hasRepeatingPattern: boolean;
  isAllZero: boolean;
  isAllFF: boolean;
  classificationLabel: string;
}

export interface ForensicsContiguousZoneResult {
  startLba: number;
  endLba: number;
  startBlockId: number;
  endBlockId: number;
  blockCount: number;
  badCount: number;
  avgLatencyMs: number;
  peakLatencyMs: number;
  peakZScore: number;
  severity: number;
}

export interface ForensicsZScoreReport {
  engineSource: ForensicsEngineSource;
  totalSamples: number;
  slowOrBadCount: number;
  within1SigmaCount: number;
  sigma1To2Count: number;
  sigma2To3Count: number;
  over3SigmaCount: number;
  contiguousZoneCount: number;
  longestRunBlocks: number;
  riskLevel: 0 | 1 | 2 | 3 | 4;
  meanMs: number;
  stdDevMs: number;
  maxLatencyMs: number;
  degradationRiskScore: number;
  zones: ForensicsContiguousZoneResult[];
}

export interface ForensicsExtentHeatmapReport {
  engineSource: ForensicsEngineSource;
  totalExtents: number;
  impactedExtentCount: number;
  peakCellIndex: number;
  totalBadHits: number;
  totalSectorsMapped: number;
  peakCellDensityPct: number;
  fragmentationSpreadScore: number;
  cellBadCounts: number[];
  cellDensityPct: number[];
}

export interface ForensicsPartitionInspection {
  engineSource: ForensicsEngineSource;
  parsed: ParsedPartitionTable;
  gptEntriesCrcValid?: boolean;
  storedHeaderCrc32?: number;
  computedHeaderCrc32?: number;
  storedEntriesCrc32?: number;
  computedEntriesCrc32?: number;
}

export interface ForensicsVbrInspection {
  engineSource: ForensicsEngineSource;
  vbr: VbrBootInfo | null;
  totalSectors?: number;
  reservedSectors?: number;
  rootCluster?: number;
  mftStartLcn?: number;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32IeeeFast(bytes: Uint8Array | number[]): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (~crc) >>> 0;
}

async function invokeTauriForensics<T>(command: string, payload?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriDesktopRuntime()) return null;
  try {
    const win = window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<T> };
      __TAURI__?: { core?: { invoke?: (cmd: string, args?: unknown) => Promise<T> } };
    };
    const invoker = win.__TAURI_INTERNALS__?.invoke ?? win.__TAURI__?.core?.invoke;
    if (typeof invoker === 'function') {
      return await invoker(command, payload);
    }
  } catch {
    // Fall back transparently to synchronous TypeScript mathematical parity
  }
  return null;
}

export function computeSectorEntropySync(bytes: number[]): ForensicsSectorEntropyReport | null {
  if (!bytes || bytes.length === 0) return null;
  const n = bytes.length;
  const hist = new Uint32Array(256);
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i] & 0xff;
    hist[b]++;
    if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
      printable++;
    }
  }

  let entropy = 0;
  for (let k = 0; k < 256; k++) {
    const cnt = hist[k];
    if (cnt > 0) {
      const p = cnt / n;
      entropy -= p * Math.log2(p);
    }
  }
  if (entropy < 0) entropy = 0;

  const isAllZero = hist[0] === n;
  const isAllFF = hist[0xff] === n;

  let hasRepeatingPattern = false;
  let repeatingWord32 = 0;
  if (n >= 8) {
    repeatingWord32 =
      ((bytes[0] & 0xff) |
        ((bytes[1] & 0xff) << 8) |
        ((bytes[2] & 0xff) << 16) |
        ((bytes[3] & 0xff) << 24)) >>>
      0;
    hasRepeatingPattern = true;
    const limit4 = n & ~3;
    for (let i = 4; i < limit4; i += 4) {
      const w =
        ((bytes[i] & 0xff) |
          ((bytes[i + 1] & 0xff) << 8) |
          ((bytes[i + 2] & 0xff) << 16) |
          ((bytes[i + 3] & 0xff) << 24)) >>>
        0;
      if (w !== repeatingWord32) {
        hasRepeatingPattern = false;
        break;
      }
    }
    if (hasRepeatingPattern) {
      for (let i = limit4; i < n; i++) {
        const expectedByte = (repeatingWord32 >>> ((i & 3) * 8)) & 0xff;
        if ((bytes[i] & 0xff) !== expectedByte) {
          hasRepeatingPattern = false;
          break;
        }
      }
    }
  }

  const zeroByteRatio = hist[0] / n;
  const ffByteRatio = hist[0xff] / n;
  const printableRatio = printable / n;

  let sectorClass: 0 | 1 | 2 | 3 | 4 | 5 = 4;
  let classificationLabel = 'Structured Binary / Filesystem Metadata';

  if (isAllZero) {
    sectorClass = 0;
    classificationLabel = 'Zero-Filled / TRIM-Deallocated Sector';
  } else if (isAllFF) {
    sectorClass = 1;
    classificationLabel = 'Erased NAND / All-0xFF Sector';
  } else if (hasRepeatingPattern) {
    sectorClass = 2;
    classificationLabel = 'Repeating Wipe / Poison Word Pattern';
  } else if (printableRatio >= 0.85 && entropy <= 6.2) {
    sectorClass = 3;
    classificationLabel = 'UTF-8 / ASCII Text or System Log';
  } else if (entropy >= 7.5) {
    sectorClass = 5;
    classificationLabel = 'High-Entropy Encrypted / Compressed Data';
  }

  return {
    engineSource: 'ts-parity',
    inspectedBytes: n,
    crc32: crc32IeeeFast(bytes),
    repeatingWord32,
    sectorClass,
    shannonEntropy: entropy,
    zeroByteRatio,
    ffByteRatio,
    printableRatio,
    hasRepeatingPattern,
    isAllZero,
    isAllFF,
    classificationLabel
  };
}

export async function runForensicsSectorEntropy(bytes: number[]): Promise<ForensicsSectorEntropyReport | null> {
  if (!bytes || bytes.length === 0) return null;
  const native = await invokeTauriForensics<ForensicsSectorEntropyReport>(
    'compute_forensics_sector_entropy',
    { bytes }
  );
  if (native && typeof native.shannonEntropy === 'number') {
    return native;
  }
  return computeSectorEntropySync(bytes);
}

export async function runForensicsPartitionInspection(
  bytes: number[],
  sectorSize: number
): Promise<ForensicsPartitionInspection> {
  const tsParsed = parsePartitionTableFromRawBytes(bytes, sectorSize);
  const native = await invokeTauriForensics<{
    engineSource: ForensicsEngineSource;
    sectorSize: number;
    partitionCount: number;
    hasMbrSignature: boolean;
    hasGptHeader: boolean;
    gptHeaderCrcValid: boolean;
    gptEntriesCrcValid: boolean;
    isProtectiveMbr: boolean;
    storedHeaderCrc32: number;
    computedHeaderCrc32: number;
    storedEntriesCrc32: number;
    computedEntriesCrc32: number;
    firstUsableLba: number;
    lastUsableLba: number;
    schemeName: string;
    partitions: Array<{
      index: number;
      sectorAligned4K: boolean;
      startLba: number;
      endLba: number;
      sectorCount: number;
      sizeBytes: number;
      mbrTypeByte: number;
      isBootable: boolean;
      isGpt: boolean;
      typeLabel: string;
      nameUtf8: string;
    }>;
  }>('inspect_forensics_partition_table', { bytes, sectorSize });

  if (!native) {
    return { engineSource: 'ts-parity', parsed: tsParsed };
  }

  const mergedEntries =
    native.partitions.length > 0 && tsParsed.entries.length === native.partitions.length
      ? tsParsed.entries.map((entry, idx) => ({
          ...entry,
          name: native.partitions[idx]?.nameUtf8 || entry.name,
          is4kAligned: native.partitions[idx]?.sectorAligned4K ?? entry.is4kAligned
        }))
      : native.partitions.length > 0
      ? native.partitions.map(p => ({
          index: p.index,
          scheme: (p.isGpt ? 'GPT' : 'MBR') as 'GPT' | 'MBR',
          typeName: p.typeLabel,
          typeCodeOrGuid: p.isGpt
            ? 'GPT Entry'
            : `0x${p.mbrTypeByte.toString(16).toUpperCase().padStart(2, '0')}`,
          name: p.nameUtf8 || `Partition #${p.index}`,
          bootable: p.isBootable,
          startLba: p.startLba,
          endLba: p.endLba,
          sectorCount: p.sectorCount,
          sizeGb: Number((p.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)),
          is4kAligned: p.sectorAligned4K
        }))
      : tsParsed.entries;

  const scheme: ParsedPartitionTable['scheme'] =
    native.schemeName === 'GPT'
      ? 'GPT'
      : native.schemeName === 'MBR'
      ? 'MBR'
      : 'UNINITIALIZED';

  return {
    engineSource: native.engineSource,
    parsed: {
      ...tsParsed,
      scheme,
      sectorSize: native.sectorSize || tsParsed.sectorSize,
      mbrSignatureValid: native.hasMbrSignature,
      protectiveMbrDetected: native.isProtectiveMbr,
      gptHeaderCrcValid: native.hasGptHeader ? native.gptHeaderCrcValid : tsParsed.gptHeaderCrcValid,
      gptFirstUsableLba: native.firstUsableLba || tsParsed.gptFirstUsableLba,
      gptLastUsableLba: native.lastUsableLba || tsParsed.gptLastUsableLba,
      entries: mergedEntries
    },
    gptEntriesCrcValid: native.hasGptHeader ? native.gptEntriesCrcValid : undefined,
    storedHeaderCrc32: native.storedHeaderCrc32,
    computedHeaderCrc32: native.computedHeaderCrc32,
    storedEntriesCrc32: native.storedEntriesCrc32,
    computedEntriesCrc32: native.computedEntriesCrc32
  };
}

export async function runForensicsVbrInspection(bytes: number[]): Promise<ForensicsVbrInspection> {
  const tsVbr = detectVbrBootInfo(bytes);
  if (bytes.length < 512) {
    return { engineSource: 'ts-parity', vbr: tsVbr };
  }
  const native = await invokeTauriForensics<{
    detected: boolean;
    engineSource?: ForensicsEngineSource;
    fsType?: number;
    bytesPerSector?: number;
    sectorsPerCluster?: number;
    clusterSizeBytes?: number;
    reservedSectors?: number;
    rootCluster?: number;
    totalSectors?: number;
    mftStartLcn?: number;
    hasBootSignature?: boolean;
    oemId?: string;
  }>('inspect_forensics_vbr_sector', { bytes: bytes.slice(0, 512) });

  if (!native || !native.detected) {
    return { engineSource: 'ts-parity', vbr: tsVbr };
  }

  const fsLabel =
    native.fsType === 1 ? 'NTFS' : native.fsType === 2 ? 'FAT32' : native.fsType === 3 ? 'exFAT' : 'UNKNOWN';

  return {
    engineSource: native.engineSource || 'rust-parity-fallback',
    vbr: {
      filesystem: fsLabel,
      oemId: native.oemId || tsVbr?.oemId || fsLabel,
      bytesPerSector: native.bytesPerSector || 512,
      sectorsPerCluster: native.sectorsPerCluster || 8,
      clusterSizeBytes: native.clusterSizeBytes || 4096,
      signatureValid: native.hasBootSignature ?? tsVbr?.signatureValid ?? false
    },
    totalSectors: native.totalSectors,
    reservedSectors: native.reservedSectors,
    rootCluster: native.rootCluster,
    mftStartLcn: native.mftStartLcn
  };
}

export async function runForensicsZScoreAnalysis(
  blocks: SectorBlock[],
  drive: DiskDrive,
  scanMode: 'quick' | 'full'
): Promise<ForensicsZScoreReport | null> {
  const scannedSorted = blocks
    .filter(b => b.status !== 'unscanned')
    .sort((a, b) => a.id - b.id);
  if (scannedSorted.length < 2) return null;

  const isSolidState =
    drive.type.includes('NVMe') ||
    drive.type.includes('SSD') ||
    (drive.hardwareSpecs?.mediaType.includes('SSD') ?? false) ||
    drive.hardwareSpecs?.busType === 'NVMe';
  const baselineExpectedMs = isSolidState ? 2.0 : 12.0;
  const maxBlockIdGap = scanMode === 'quick' ? 10 : 1;

  const samples = scannedSorted.map(b => ({
    lba: b.lba,
    blockId: b.id,
    statusCode:
      b.status === 'bad'
        ? 4
        : b.status === 'critical'
        ? 3
        : b.status === 'slow'
        ? 2
        : b.status === 'normal'
        ? 1
        : 0,
    latencyMs: Number.isFinite(b.responseTimeMs) ? b.responseTimeMs : -1
  }));

  const native = await invokeTauriForensics<ForensicsZScoreReport>(
    'analyze_forensics_sector_zscore',
    {
      samples,
      baselineExpectedMs,
      maxBlockIdGap
    }
  );
  return native;
}

export async function runForensicsExtentHeatmap(
  extents: Array<{ startLba: number; sectorCount: number }>,
  badLbas: number[],
  cellCount = 64
): Promise<ForensicsExtentHeatmapReport | null> {
  return invokeTauriForensics<ForensicsExtentHeatmapReport>('compute_forensics_extent_heatmap', {
    extents,
    badLbas,
    cellCount
  });
}

export async function queryForensicsEngineStatus(): Promise<ForensicsEngineStatus> {
  const native = await invokeTauriForensics<ForensicsEngineStatus>('inspect_forensics_dll_status');
  if (native) return native;
  const checkVec = [49, 50, 51, 52, 53, 54, 55, 56, 57]; // "123456789"
  const crc = crc32IeeeFast(checkVec);
  return {
    dllLoaded: false,
    engineSource: 'ts-parity',
    loadedPath: null,
    engineName: 'DiskSentinelForensics TypeScript Parity',
    version: '4.6.0',
    capabilitiesMask: 0b11111,
    crc32SelfTestValue: crc,
    crc32SelfTestPassed: crc === 0xcbf43926
  };
}
