/**
 * @file recoveryDllBridge.ts
 * @brief TypeScript Bridge & Deterministic Parity Engine for DiskSentinelRecovery.dll
 *        Dispatches to Tauri IPC (`DiskSentinelRecovery.dll` Win32 LoadLibraryW / Rust parity)
 *        with exact TypeScript mathematical parity fallback when running outside Tauri desktop.
 * @license Apache-2.0
 */

import { LbaCloneDomainInterval } from '../types';
import { isTauriDesktopRuntime } from './nativeDriveEngine';

export type DdrescueInterval = LbaCloneDomainInterval;

export type RecoveryEngineSource = 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';

export interface RecoveryDllStatus {
  nativeDllLoaded: boolean;
  dllPath: string | null;
  version: string;
  capabilityMask: number;
  selfTestPassed: boolean;
  signatureRuleCount: number;
  selfTestCrc32: number;
  selfTestPrngSample: string;
}

export interface RecoveryCarveInspectionReport {
  engineSource: RecoveryEngineSource;
  inspectedBytes: number;
  signatureType: number;
  confidenceScore: number;
  footerDetected: boolean;
  isTruncated: boolean;
  isZeroFilled: boolean;
  estimatedPayloadBytes: number;
  crc32: number;
  nearMatchBitFlips: number;
  galoisParity64: string;
  shannonEntropy: number;
  printableRatio: number;
  signatureName: string;
  fileExtension: string;
  footerMarker: string;
}

export interface RecoveryNtfsDataRun {
  lcnStart: number;
  vcnStart: number;
  clusterCount: number;
}

export interface RecoveryNtfsMftRecord {
  recordNumber: number;
  parentRecordNumber: number;
  inUse: boolean;
  isDirectory: boolean;
  isResidentData: boolean;
  usaMismatchSectors: number;
  namespace: number;
  fileSizeBytes: number;
  creationTimestampMs: number | null;
  fileName: string;
  dataRuns: RecoveryNtfsDataRun[];
}

export interface RecoveryMftBatchScanResult {
  engineSource: RecoveryEngineSource;
  matchedRecords: RecoveryNtfsMftRecord[];
}

export type WipePatternMode = 0 | 1 | 2 | 3; // 0: 0x00, 1: 0xFF, 2: Constant, 3: Xoshiro256**

export interface RecoveryWipePatternResult {
  engineSource: RecoveryEngineSource;
  bufferLength: number;
  crc32: number;
  previewBytes: number[];
  bytes: number[];
}

export interface RecoveryWipeVerifyResult {
  engineSource: RecoveryEngineSource;
  checkedBytes: number;
  verifiedClean: boolean;
  patternMode: number;
  residualNonMatchingBytes: number;
  firstMismatchOffset: number;
  crc32: number;
}

export interface RecoveryDdrescuePlanResult {
  engineSource: RecoveryEngineSource;
  coalescedIntervalCount: number;
  suggestedPhase: 'copying' | 'trimming' | 'retrying' | 'completed';
  nextWorkStartLba: number;
  nextWorkSectorCount: number;
  hasNextWork: boolean;
  completed: boolean;
  totalSectors: number;
  finishedSectors: number;
  nonTriedSectors: number;
  nonTrimmedSectors: number;
  nonScrapedSectors: number;
  badSectors: number;
  intervals: DdrescueInterval[];
}

const DSR_MASK64 = 0xffffffffffffffffn;

const DSR_CRC32_TABLE: Uint32Array = (() => {
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

function dsrCrc32Ieee(bytes: Uint8Array | number[]): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = DSR_CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (~crc) >>> 0;
}

function dsrRotl64(x: bigint, k: number): bigint {
  const shiftL = BigInt(k);
  const shiftR = BigInt(64 - k);
  return ((x << shiftL) | (x >> shiftR)) & DSR_MASK64;
}

class DsrXoshiro256StarStar {
  private s: [bigint, bigint, bigint, bigint];

  constructor(seed64: bigint, lbaOffset: bigint) {
    let sm =
      (seed64 ^ ((lbaOffset * 0xd6e8feb86659fd93n) & DSR_MASK64) ^ 0xa0761d6478bd642fn) & DSR_MASK64;

    const splitmix = (): bigint => {
      sm = (sm + 0x9e3779b97f4a7c15n) & DSR_MASK64;
      let z = sm;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & DSR_MASK64;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & DSR_MASK64;
      return (z ^ (z >> 31n)) & DSR_MASK64;
    };

    const s0 = splitmix();
    const s1 = splitmix();
    const s2 = splitmix();
    const s3 = splitmix();
    if ((s0 | s1 | s2 | s3) === 0n) {
      this.s = [
        0x243f6a8885a308d3n,
        0x13198a2e03707344n,
        0xa4093822299f31d0n,
        0x082efa98ec4e6c89n
      ];
    } else {
      this.s = [s0, s1, s2, s3];
    }
  }

  next64(): bigint {
    const res = (dsrRotl64((this.s[1] * 5n) & DSR_MASK64, 7) * 9n) & DSR_MASK64;
    const t = (this.s[1] << 17n) & DSR_MASK64;
    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];
    this.s[2] ^= t;
    this.s[3] = dsrRotl64(this.s[3], 45);
    return res;
  }
}

function parseSeedBigInt(seedStr: string): bigint {
  try {
    const trimmed = seedStr.trim();
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed) & DSR_MASK64;
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed) & DSR_MASK64;
  } catch {
    // ignore malformed seed
  }
  return 0x202604060001n;
}

async function invokeTauriRecovery<T>(command: string, payload?: Record<string, unknown>): Promise<T | null> {
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
    // Transparent fallback to TypeScript mathematical parity
  }
  return null;
}

function popcount8(val: number): number {
  let v = val & 0xff;
  let c = 0;
  while (v !== 0) {
    c += v & 1;
    v >>>= 1;
  }
  return c;
}

function findSubseq(buf: Uint8Array, needle: number[], start: number): number {
  if (start < 0 || needle.length === 0 || buf.length - start < needle.length) return -1;
  const limit = buf.length - needle.length;
  for (let i = start; i <= limit; i++) {
    if (buf[i] !== needle[0]) continue;
    let ok = true;
    for (let k = 1; k < needle.length; k++) {
      if (buf[i + k] !== needle[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function readU32Le(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function matchAscii(buf: Uint8Array, off: number, str: string): boolean {
  if (off + str.length > buf.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (buf[off + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

export function inspectCarveBufferSync(raw: Uint8Array | number[]): RecoveryCarveInspectionReport | null {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const n = bytes.length;
  if (n === 0) return null;

  const hist = new Uint32Array(256);
  let printable = 0;
  let zeroAcc = 0;
  let parity64 = 0n;
  let idx = 0;
  while (idx < n) {
    const b = bytes[idx];
    hist[b]++;
    zeroAcc |= b;
    parity64 ^= BigInt(b) << BigInt((idx & 7) * 8);
    if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
      printable++;
      idx++;
    } else if (b >= 0xc2 && b <= 0xdf && idx + 1 < n && (bytes[idx + 1] & 0xc0) === 0x80) {
      const cb1 = bytes[idx + 1];
      hist[cb1]++;
      zeroAcc |= cb1;
      parity64 ^= BigInt(cb1) << BigInt(((idx + 1) & 7) * 8);
      printable += 2;
      idx += 2;
    } else if (
      b >= 0xe0 &&
      b <= 0xef &&
      idx + 2 < n &&
      (bytes[idx + 1] & 0xc0) === 0x80 &&
      (bytes[idx + 2] & 0xc0) === 0x80
    ) {
      for (let k = 1; k <= 2; k++) {
        const cb = bytes[idx + k];
        hist[cb]++;
        zeroAcc |= cb;
        parity64 ^= BigInt(cb) << BigInt(((idx + k) & 7) * 8);
      }
      printable += 3;
      idx += 3;
    } else if (
      b >= 0xf0 &&
      b <= 0xf4 &&
      idx + 3 < n &&
      (bytes[idx + 1] & 0xc0) === 0x80 &&
      (bytes[idx + 2] & 0xc0) === 0x80 &&
      (bytes[idx + 3] & 0xc0) === 0x80
    ) {
      for (let k = 1; k <= 3; k++) {
        const cb = bytes[idx + k];
        hist[cb]++;
        zeroAcc |= cb;
        parity64 ^= BigInt(cb) << BigInt(((idx + k) & 7) * 8);
      }
      printable += 4;
      idx += 4;
    } else {
      idx++;
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
  const printableRatio = printable / n;
  const crc32 = dsrCrc32Ieee(bytes);
  const galoisParity64 = parity64.toString();

  if (zeroAcc === 0) {
    return {
      engineSource: 'ts-parity',
      inspectedBytes: n,
      signatureType: 0,
      confidenceScore: 100,
      footerDetected: false,
      isTruncated: false,
      isZeroFilled: true,
      estimatedPayloadBytes: 0,
      crc32,
      nearMatchBitFlips: 0,
      galoisParity64,
      shannonEntropy: entropy,
      printableRatio,
      signatureName: 'Zero-Filled / Deallocated Sector',
      fileExtension: 'bin',
      footerMarker: ''
    };
  }

  let signatureType = 0;
  let signatureName = 'Raw Binary / Unmapped Sector';
  let fileExtension = 'bin';
  let confidenceScore = 0;
  let footerDetected = false;
  let isTruncated = false;
  let estimatedPayloadBytes = 0;
  let footerMarker = '';
  let nearMatchBitFlips = 0;

  if (n >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    signatureType = 1;
    signatureName = 'JPEG Image (EXIF/JFIF)';
    fileExtension = 'jpg';
    const pos = findSubseq(bytes, [0xff, 0xd9], 4);
    if (pos >= 0) {
      footerDetected = true;
      estimatedPayloadBytes = pos + 2;
      confidenceScore = 98;
      footerMarker = 'FF D9 (JPEG EOI)';
    } else {
      isTruncated = true;
      estimatedPayloadBytes = n;
      confidenceScore = 88;
    }
  } else if (
    n >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    signatureType = 2;
    signatureName = 'PNG Lossless Image';
    fileExtension = 'png';
    const pos = findSubseq(bytes, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 8);
    if (pos >= 0) {
      footerDetected = true;
      estimatedPayloadBytes = pos + 8;
      confidenceScore = 99;
      footerMarker = 'IEND (CRC32 OK)';
    } else {
      isTruncated = true;
      estimatedPayloadBytes = n;
      confidenceScore = 92;
    }
  } else if (n >= 5 && matchAscii(bytes, 0, '%PDF-')) {
    signatureType = 3;
    signatureName = 'PDF Portable Document';
    fileExtension = 'pdf';
    const pos = findSubseq(bytes, [0x25, 0x25, 0x45, 0x4f, 0x46], 5);
    if (pos >= 0) {
      footerDetected = true;
      estimatedPayloadBytes = pos + 5;
      confidenceScore = 97;
      footerMarker = '%%EOF Trailer';
    } else {
      isTruncated = true;
      estimatedPayloadBytes = n;
      confidenceScore = 90;
    }
  } else if (n >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    signatureType = 4;
    signatureName = 'ZIP / DOCX / XLSX Archive';
    fileExtension = 'zip';
    const pos = findSubseq(bytes, [0x50, 0x4b, 0x05, 0x06], 4);
    if (pos >= 0) {
      footerDetected = true;
      estimatedPayloadBytes = pos + 22;
      confidenceScore = 97;
      footerMarker = 'PK EOCD (0x06054B50)';
    } else {
      isTruncated = true;
      estimatedPayloadBytes = n;
      confidenceScore = 89;
    }
  } else if (n >= 8 && matchAscii(bytes, 4, 'ftyp')) {
    signatureType = 5;
    signatureName = 'MP4 / MOV / ISO BMFF Video';
    fileExtension = 'mp4';
    estimatedPayloadBytes = n;
    confidenceScore = 91;
  } else if (n >= 12 && matchAscii(bytes, 0, 'RIFF')) {
    signatureType = 7;
    estimatedPayloadBytes = readU32Le(bytes, 4) + 8;
    if (matchAscii(bytes, 8, 'WEBP')) {
      signatureName = 'RIFF WebP Image';
      fileExtension = 'webp';
    } else if (matchAscii(bytes, 8, 'WAVE')) {
      signatureName = 'RIFF WAV Audio';
      fileExtension = 'wav';
    } else {
      signatureName = 'RIFF Media Container (AVI/WAV)';
      fileExtension = 'avi';
    }
    footerDetected = estimatedPayloadBytes <= n;
    isTruncated = !footerDetected;
    confidenceScore = 93;
  } else if (n >= 6 && (matchAscii(bytes, 0, 'GIF87a') || matchAscii(bytes, 0, 'GIF89a'))) {
    signatureType = 8;
    signatureName = 'GIF Animated Image';
    fileExtension = 'gif';
    confidenceScore = 94;
    estimatedPayloadBytes = n;
  } else if (n >= 14 && bytes[0] === 0x42 && bytes[1] === 0x4d && readU32Le(bytes, 2) >= 26) {
    signatureType = 9;
    signatureName = 'BMP Bitmap Image';
    fileExtension = 'bmp';
    estimatedPayloadBytes = readU32Le(bytes, 2);
    footerDetected = estimatedPayloadBytes <= n;
    isTruncated = !footerDetected;
    confidenceScore = 87;
  } else if (
    n >= 6 &&
    bytes[0] === 0x37 &&
    bytes[1] === 0x7a &&
    bytes[2] === 0xbc &&
    bytes[3] === 0xaf &&
    bytes[4] === 0x27 &&
    bytes[5] === 0x1c
  ) {
    signatureType = 10;
    signatureName = '7-Zip Compressed Archive';
    fileExtension = '7z';
    confidenceScore = 96;
    estimatedPayloadBytes = n;
  } else if (
    n >= 7 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x21 &&
    bytes[4] === 0x1a &&
    bytes[5] === 0x07
  ) {
    signatureType = 11;
    signatureName = 'RAR Archive';
    fileExtension = 'rar';
    confidenceScore = 95;
    estimatedPayloadBytes = n;
  } else if (n >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    signatureType = 12;
    signatureName = 'GZIP Compressed Stream';
    fileExtension = 'gz';
    confidenceScore = 90;
    estimatedPayloadBytes = n;
  } else if (n >= 16 && matchAscii(bytes, 0, 'SQLite format 3') && bytes[15] === 0) {
    signatureType = 13;
    signatureName = 'SQLite 3 Database';
    fileExtension = 'sqlite';
    confidenceScore = 99;
    estimatedPayloadBytes = n;
  } else if (n >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    signatureType = 14;
    signatureName = 'ELF Executable / Shared Object';
    fileExtension = 'elf';
    confidenceScore = 95;
    estimatedPayloadBytes = n;
  } else if (
    n >= 64 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x5a &&
    readU32Le(bytes, 60) + 4 <= n &&
    bytes[readU32Le(bytes, 60)] === 0x50 &&
    bytes[readU32Le(bytes, 60) + 1] === 0x45 &&
    bytes[readU32Le(bytes, 60) + 2] === 0 &&
    bytes[readU32Le(bytes, 60) + 3] === 0
  ) {
    signatureType = 15;
    signatureName = 'Windows PE Executable / DLL';
    fileExtension = 'exe';
    confidenceScore = 96;
    estimatedPayloadBytes = n;
  } else if (n >= 512 && matchAscii(bytes, 3, 'NTFS    ') && bytes[510] === 0x55 && bytes[511] === 0xaa) {
    signatureType = 16;
    signatureName = 'NTFS Volume Boot Record ($Boot)';
    fileExtension = 'vbr';
    confidenceScore = 99;
    estimatedPayloadBytes = 512;
  } else {
    const nearCandidates: Array<{ st: number; name: string; ext: string; pat: number[] }> = [
      { st: 2, name: 'PNG Lossless Image (Bit-Flip Header)', ext: 'png', pat: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
      { st: 3, name: 'PDF Document (Bit-Flip Header)', ext: 'pdf', pat: [0x25, 0x50, 0x44, 0x46, 0x2d] },
      { st: 4, name: 'ZIP/OOXML Archive (Bit-Flip Header)', ext: 'zip', pat: [0x50, 0x4b, 0x03, 0x04] },
      { st: 13, name: 'SQLite 3 DB (Bit-Flip Header)', ext: 'sqlite', pat: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66] }
    ];
    let bestFlips = 99;
    for (const c of nearCandidates) {
      if (n < c.pat.length) continue;
      let flips = 0;
      for (let i = 0; i < c.pat.length; i++) {
        flips += popcount8(bytes[i] ^ c.pat[i]);
      }
      if (flips > 0 && flips <= 2 && flips < bestFlips) {
        bestFlips = flips;
        signatureType = c.st;
        signatureName = c.name;
        fileExtension = c.ext;
        nearMatchBitFlips = flips;
        confidenceScore = flips === 1 ? 72 : 58;
        estimatedPayloadBytes = n;
      }
    }
    if (nearMatchBitFlips === 0 && printableRatio >= 0.8) {
      signatureType = 6;
      signatureName = 'UTF-8 Source / System Log';
      fileExtension = 'txt';
      confidenceScore = Math.floor(printableRatio * 90);
      estimatedPayloadBytes = n;
    }
  }

  return {
    engineSource: 'ts-parity',
    inspectedBytes: n,
    signatureType,
    confidenceScore,
    footerDetected,
    isTruncated,
    isZeroFilled: false,
    estimatedPayloadBytes,
    crc32,
    nearMatchBitFlips,
    galoisParity64,
    shannonEntropy: entropy,
    printableRatio,
    signatureName,
    fileExtension,
    footerMarker
  };
}

export async function getRecoveryDllStatus(): Promise<RecoveryDllStatus> {
  const native = await invokeTauriRecovery<RecoveryDllStatus>('inspect_recovery_dll_status');
  if (native) return native;

  const crc = dsrCrc32Ieee([49, 50, 51, 52, 53, 54, 55, 56, 57]);
  const rng = new DsrXoshiro256StarStar(0x20260406n, 0n);
  const sample = rng.next64();
  return {
    nativeDllLoaded: false,
    dllPath: null,
    version: '4.6.0-ts-parity',
    capabilityMask: 0x0f,
    selfTestPassed: crc === 0xcbf43926,
    signatureRuleCount: 16,
    selfTestCrc32: crc,
    selfTestPrngSample: sample.toString()
  };
}

export async function runRecoveryCarveInspection(
  bytes: Uint8Array | number[]
): Promise<RecoveryCarveInspectionReport | null> {
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
  if (arr.length === 0) return null;

  const native = await invokeTauriRecovery<RecoveryCarveInspectionReport>(
    'analyze_recovery_carve_buffer',
    { bytes: arr }
  );
  if (native && typeof native.signatureType === 'number') {
    return native;
  }
  return inspectCarveBufferSync(arr);
}

export async function runRecoveryMftBatchScan(params: {
  mftBytes: Uint8Array | number[];
  mftRecordSize: number;
  firstRecordIndex: number;
  batchStartLba: number;
  sectorSize: number;
  targetLba: number;
  targetLcn: number;
}): Promise<RecoveryMftBatchScanResult | null> {
  const mftArr = Array.isArray(params.mftBytes)
    ? params.mftBytes
    : Array.from(params.mftBytes);
  return invokeTauriRecovery<RecoveryMftBatchScanResult>('parse_recovery_mft_batch', {
    mftBytes: mftArr,
    mftRecordSize: params.mftRecordSize,
    firstRecordIndex: params.firstRecordIndex,
    batchStartLba: params.batchStartLba,
    sectorSize: params.sectorSize,
    targetLba: params.targetLba,
    targetLcn: params.targetLcn
  });
}

export async function runRecoveryWipePatternGen(
  bufferLength: number,
  patternMode: WipePatternMode,
  constantByte: number,
  seedStr: string,
  lbaOffset: number
): Promise<RecoveryWipePatternResult> {
  const len = Math.max(64, Math.min(65536, Math.floor(bufferLength)));
  const native = await invokeTauriRecovery<RecoveryWipePatternResult>(
    'generate_recovery_wipe_pattern',
    {
      bufferLength: len,
      patternMode,
      constantByte: constantByte & 0xff,
      seedStr,
      lbaOffset
    }
  );
  if (native && Array.isArray(native.bytes)) {
    return native;
  }

  const out = new Uint8Array(len);
  if (patternMode === 0) {
    out.fill(0x00);
  } else if (patternMode === 1) {
    out.fill(0xff);
  } else if (patternMode === 2) {
    out.fill(constantByte & 0xff);
  } else {
    const rng = new DsrXoshiro256StarStar(parseSeedBigInt(seedStr), BigInt(Math.max(0, Math.floor(lbaOffset))));
    let idx = 0;
    while (idx < len) {
      const w = rng.next64();
      const take = Math.min(8, len - idx);
      for (let b = 0; b < take; b++) {
        out[idx + b] = Number((w >> BigInt(b * 8)) & 0xffn);
      }
      idx += take;
    }
  }
  const bytesArr = Array.from(out);
  return {
    engineSource: 'ts-parity',
    bufferLength: len,
    crc32: dsrCrc32Ieee(out),
    previewBytes: bytesArr.slice(0, Math.min(64, len)),
    bytes: bytesArr
  };
}

export async function runRecoveryWipeVerify(
  bytes: Uint8Array | number[],
  patternMode: WipePatternMode,
  constantByte: number,
  seedStr: string,
  lbaOffset: number
): Promise<RecoveryWipeVerifyResult | null> {
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
  if (arr.length === 0) return null;

  const native = await invokeTauriRecovery<RecoveryWipeVerifyResult>(
    'verify_recovery_wipe_buffer',
    {
      bytes: arr,
      patternMode,
      constantByte: constantByte & 0xff,
      seedStr,
      lbaOffset
    }
  );
  if (native && typeof native.verifiedClean === 'boolean') {
    return native;
  }

  let mismatches = 0;
  let firstOff = -1;
  if (patternMode === 0 || patternMode === 1 || patternMode === 2) {
    const exp = patternMode === 0 ? 0x00 : patternMode === 1 ? 0xff : constantByte & 0xff;
    for (let i = 0; i < arr.length; i++) {
      if ((arr[i] & 0xff) !== exp) {
        if (firstOff < 0) firstOff = i;
        mismatches++;
      }
    }
  } else {
    const rng = new DsrXoshiro256StarStar(parseSeedBigInt(seedStr), BigInt(Math.max(0, Math.floor(lbaOffset))));
    let idx = 0;
    while (idx < arr.length) {
      const w = rng.next64();
      const take = Math.min(8, arr.length - idx);
      for (let b = 0; b < take; b++) {
        const eb = Number((w >> BigInt(b * 8)) & 0xffn);
        if ((arr[idx + b] & 0xff) !== eb) {
          if (firstOff < 0) firstOff = idx + b;
          mismatches++;
        }
      }
      idx += take;
    }
  }

  return {
    engineSource: 'ts-parity',
    checkedBytes: arr.length,
    verifiedClean: mismatches === 0,
    patternMode,
    residualNonMatchingBytes: mismatches,
    firstMismatchOffset: firstOff,
    crc32: dsrCrc32Ieee(arr)
  };
}

export async function runRecoveryDdrescuePlan(
  intervals: DdrescueInterval[],
  chunkSectors: number
): Promise<RecoveryDdrescuePlanResult> {
  const native = await invokeTauriRecovery<RecoveryDdrescuePlanResult>(
    'plan_recovery_ddrescue_intervals',
    { intervals, chunkSectors }
  );
  if (native && Array.isArray(native.intervals)) {
    return native;
  }

  const valid = intervals.filter(iv => iv.sectorCount > 0).sort((a, b) => a.startLba - b.startLba);
  const coalesced: DdrescueInterval[] = [];
  for (const iv of valid) {
    const back = coalesced[coalesced.length - 1];
    if (
      back &&
      back.startLba + back.sectorCount === iv.startLba &&
      back.status === iv.status &&
      back.attempts === iv.attempts &&
      (back.lastErrorCode ?? 0) === (iv.lastErrorCode ?? 0)
    ) {
      back.sectorCount += iv.sectorCount;
    } else {
      coalesced.push({ ...iv });
    }
  }

  const safeChunk = Math.max(16, Math.min(2048, Math.floor(chunkSectors || 128)));
  const trimStep = Math.max(4, Math.min(16, Math.floor(safeChunk / 4)));
  let fin = 0;
  let nt = 0;
  let ntr = 0;
  let nsc = 0;
  let bad = 0;
  let firstNt: DdrescueInterval | null = null;
  let firstNtr: DdrescueInterval | null = null;
  let firstNsc: DdrescueInterval | null = null;

  for (const iv of coalesced) {
    if (iv.status === 'finished') fin += iv.sectorCount;
    else if (iv.status === 'non_tried') {
      nt += iv.sectorCount;
      if (!firstNt) firstNt = iv;
    } else if (iv.status === 'non_trimmed') {
      ntr += iv.sectorCount;
      if (!firstNtr) firstNtr = iv;
    } else if (iv.status === 'non_scraped') {
      nsc += iv.sectorCount;
      if (!firstNsc) firstNsc = iv;
    } else if (iv.status === 'bad_sector') {
      bad += iv.sectorCount;
    }
  }

  let suggestedPhase: RecoveryDdrescuePlanResult['suggestedPhase'] = 'completed';
  let nextWorkStartLba = 0;
  let nextWorkSectorCount = 0;
  let hasNextWork = false;
  let completed = true;

  if (firstNt) {
    suggestedPhase = 'copying';
    nextWorkStartLba = firstNt.startLba;
    nextWorkSectorCount = Math.min(safeChunk, firstNt.sectorCount);
    hasNextWork = true;
    completed = false;
  } else if (firstNtr) {
    suggestedPhase = 'trimming';
    nextWorkStartLba = firstNtr.startLba;
    nextWorkSectorCount = Math.min(trimStep, firstNtr.sectorCount);
    hasNextWork = true;
    completed = false;
  } else if (firstNsc) {
    suggestedPhase = 'retrying';
    nextWorkStartLba = firstNsc.startLba;
    nextWorkSectorCount = 1;
    hasNextWork = true;
    completed = false;
  }

  return {
    engineSource: 'ts-parity',
    coalescedIntervalCount: coalesced.length,
    suggestedPhase,
    nextWorkStartLba,
    nextWorkSectorCount,
    hasNextWork,
    completed,
    totalSectors: fin + nt + ntr + nsc + bad,
    finishedSectors: fin,
    nonTriedSectors: nt,
    nonTrimmedSectors: ntr,
    nonScrapedSectors: nsc,
    badSectors: bad,
    intervals: coalesced
  };
}
