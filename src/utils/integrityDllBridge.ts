/**
 * @file integrityDllBridge.ts
 * @brief TypeScript Bridge & Deterministic Parity Engine for DiskSentinelIntegrity.dll
 *        Dispatches to Tauri IPC (`DiskSentinelIntegrity.dll` Win32 LoadLibraryW / Rust parity)
 *        with exact TypeScript mathematical parity fallback when running outside Tauri desktop.
 * @license Apache-2.0
 */

import {
  DiskDrive,
  IntegrityFileExtent,
  SavedScanRecord,
  WatchdogBaselineSnapshot,
  WatchdogRule
} from '../types';
import { isTauriDesktopRuntime } from './nativeDriveEngine';
import { parseSmartAttributeNumericRaw } from './smartThresholds';

export type IntegrityEngineSource = 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';

export interface IntegrityEngineStatus {
  nativeDllLoaded: boolean;
  dllPath: string | null;
  version: string;
  capabilityMask: number;
  selfTestPassed: boolean;
  sha256KatPassed: boolean;
  extentKatPassed: boolean;
  diffKatPassed: boolean;
  selfTestCrc32: number;
  selfTestFnv1a64: string;
  sha256KatHex: string;
}

export interface IntegrityDigestReport {
  engineSource: IntegrityEngineSource;
  inspectedBytes: number;
  crc32: number;
  fnv1a64: string;
  sha256Hex: string;
}

export interface ExtentIntegrityReport {
  engineSource: IntegrityEngineSource;
  extentCount: number;
  statusCode: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  badHitCount: number;
  slowHitCount: number;
  affectedBadSectors: number;
  affectedSlowSectors: number;
  totalMappedSectors: number;
  riskScore: number;
  survivabilityPct: number;
  badHits: number[];
  slowHits: number[];
}

export interface ScanSmartVelocityReport {
  engineSource: IntegrityEngineSource;
  elapsedDays: number;
  badDelta: number;
  slowCriticalDelta: number;
  healthDelta: number;
  latencyDeltaMs: number;
  badSectorsPerDay: number;
  healthLossPerDay: number;
  worsenedAttrCount: number;
  improvedAttrCount: number;
  regressionGradeCode: 0 | 1 | 2 | 3; // 0=IMPROVED, 1=STABLE, 2=DEGRADING, 3=CRITICAL
  regressionScore: number;
}

export interface WatchdogTriggerMatrixItem {
  ruleIndex: number;
  driveIndex: number;
  metricCode: number;
  severityCode: 0 | 1 | 2;
  observedValue: number;
  thresholdValue: number;
}

export interface WatchdogMatrixReport {
  engineSource: IntegrityEngineSource;
  evaluatedDriveCount: number;
  evaluatedRuleCount: number;
  triggeredCount: number;
  quickScanTargetCount: number;
  worstDriveIndex: number;
  fleetHealthIndex: number;
  triggers: WatchdogTriggerMatrixItem[];
  quickScanDriveIndices: number[];
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// ===========================================================================
// 1. Slicing-by-1 IEEE 802.3 CRC32 + FNV-1a64 + FIPS 180-4 SHA-256 (TS Parity)
// ===========================================================================

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[i] = c >>> 0;
  }
  crcTable = tbl;
  return tbl;
}

function dsiCrc32Ieee(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const tbl = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = tbl[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dsiFnv1a64(bytes: Uint8Array): string {
  let h = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * prime) & mask;
  }
  return h.toString();
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256HexSync(data: Uint8Array): string {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  const len = data.length;
  const bitLen = BigInt(len) * 8n;
  const totalPadded = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(totalPadded);
  padded.set(data, 0);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalPadded - 8, Number((bitLen >> 32n) & 0xffffffffn), false);
  view.setUint32(totalPadded - 4, Number(bitLen & 0xffffffffn), false);

  const w = new Uint32Array(64);
  for (let off = 0; off < totalPadded; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(off + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += state[i].toString(16).padStart(8, '0');
  }
  return hex;
}

export function computeBufferIntegrityDigestSync(raw: Uint8Array | number[]): IntegrityDigestReport {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  return {
    engineSource: 'ts-parity',
    inspectedBytes: bytes.length,
    crc32: dsiCrc32Ieee(bytes),
    fnv1a64: dsiFnv1a64(bytes),
    sha256Hex: sha256HexSync(bytes)
  };
}

// ===========================================================================
// 2. O((E + B) log B) Extent Integrity & Survivability Scorer (TS Parity)
// ===========================================================================

export function evaluateExtentIntegritySync(
  extents: IntegrityFileExtent[],
  badLbas: number[],
  slowLbas: number[],
  flags: {
    hashMismatch?: boolean;
    isUnreadable?: boolean;
    isMissing?: boolean;
    hasSha256?: boolean;
  } = {}
): ExtentIntegrityReport {
  const sortedBad = [...badLbas].sort((a, b) => a - b);
  const sortedSlow = [...slowLbas].sort((a, b) => a - b);

  const collectHits = (sorted: number[]): { hits: number[]; spanCount: number } => {
    if (extents.length === 0 || sorted.length === 0) return { hits: [], spanCount: 0 };
    const hitSet = new Set<number>();
    let spanCount = 0;
    for (const ext of extents) {
      if (ext.endLba < ext.startLba) continue;
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] < ext.startLba) lo = mid + 1;
        else hi = mid;
      }
      let prev = -1;
      for (let i = lo; i < sorted.length && sorted[i] <= ext.endLba; i++) {
        const lba = sorted[i];
        if (lba !== prev) {
          spanCount++;
          prev = lba;
          if (hitSet.size < 256) hitSet.add(lba);
        }
      }
    }
    return {
      hits: Array.from(hitSet).sort((a, b) => a - b),
      spanCount
    };
  };

  const badRes = collectHits(sortedBad);
  const slowRes = collectHits(sortedSlow);

  let mappedSectors = 0;
  for (const ext of extents) {
    if (ext.endLba >= ext.startLba) {
      mappedSectors += ext.endLba - ext.startLba + 1;
    }
  }

  let statusCode: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1;
  if (flags.isMissing) statusCode = 6;
  else if (flags.isUnreadable) statusCode = 5;
  else if (flags.hashMismatch) statusCode = 4;
  else if (badRes.hits.length > 0) statusCode = 3;
  else if (slowRes.hits.length > 0) statusCode = 2;
  else if (flags.hasSha256) statusCode = 0;

  let risk = 0;
  if (flags.isMissing) {
    risk = 100;
  } else {
    if (flags.hashMismatch) risk += 78;
    if (flags.isUnreadable) risk += 85;
    if (badRes.hits.length > 0) risk += 55 + clamp(badRes.hits.length * 6.5, 0, 35);
    if (slowRes.hits.length > 0) risk += 18 + clamp(slowRes.hits.length * 2.5, 0, 22);
    if (extents.length > 32) risk += clamp((extents.length - 32) * 0.25, 0, 10);
  }
  const riskScore = clamp(risk, 0, 100);

  return {
    engineSource: 'ts-parity',
    extentCount: extents.length,
    statusCode,
    badHitCount: badRes.hits.length,
    slowHitCount: slowRes.hits.length,
    affectedBadSectors: badRes.spanCount,
    affectedSlowSectors: slowRes.spanCount,
    totalMappedSectors: mappedSectors,
    riskScore,
    survivabilityPct: clamp(100 - riskScore, 0, 100),
    badHits: badRes.hits,
    slowHits: slowRes.hits
  };
}

// ===========================================================================
// 3. Scan-vs-Scan & S.M.A.R.T. Snapshot Daily Velocity Scorer (TS Parity)
// ===========================================================================

const STATUS_SEV: Record<'good' | 'warning' | 'critical', number> = {
  good: 0,
  warning: 1,
  critical: 2
};

export function computeScanSmartDiffWithVelocitySync(
  scanA: SavedScanRecord,
  scanB: SavedScanRecord
): ScanSmartVelocityReport {
  const deltaMs = scanB.timestamp - scanA.timestamp;
  const elapsedDays = deltaMs > 0 ? deltaMs / 86_400_000 : 0;
  const badDelta = scanB.badCount - scanA.badCount;
  const slowCriticalDelta =
    scanB.slowCount + scanB.criticalCount - (scanA.slowCount + scanA.criticalCount);
  const healthDelta =
    scanA.healthScore !== null && scanB.healthScore !== null
      ? scanB.healthScore - scanA.healthScore
      : 0;
  const latencyDeltaMs = scanB.avgLatencyMs - scanA.avgLatencyMs;

  const badSectorsPerDay = elapsedDays >= 1 / 24 ? badDelta / elapsedDays : 0;
  const healthLossPerDay = elapsedDays >= 1 / 24 ? -healthDelta / elapsedDays : 0;

  const mapA = new Map(scanA.smartSnapshot.map(a => [a.id, a] as const));
  const mapB = new Map(scanB.smartSnapshot.map(b => [b.id, b] as const));
  let worsenedAttrCount = 0;
  let improvedAttrCount = 0;
  for (const id of new Set([...mapA.keys(), ...mapB.keys()])) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    if (a && b) {
      if (STATUS_SEV[b.status] > STATUS_SEV[a.status]) worsenedAttrCount++;
      else if (STATUS_SEV[b.status] < STATUS_SEV[a.status]) improvedAttrCount++;
    }
  }

  let regScore = 0;
  if (badDelta > 0) regScore += 42 + clamp(badDelta * 4.5, 0, 28);
  if (slowCriticalDelta > 0) regScore += clamp(slowCriticalDelta * 1.2, 0, 16);
  if (healthDelta < 0) regScore += clamp(-healthDelta * 1.5, 0, 22);
  if (latencyDeltaMs > 5) regScore += clamp((latencyDeltaMs - 5) * 0.4, 0, 12);
  regScore += worsenedAttrCount * 8.5 - improvedAttrCount * 4.0;
  const regressionScore = clamp(regScore, 0, 100);

  let regressionGradeCode: 0 | 1 | 2 | 3 = 1;
  if (badDelta >= 5 || worsenedAttrCount >= 2 || healthDelta <= -15 || regressionScore >= 55) {
    regressionGradeCode = 3;
  } else if (
    badDelta > 0 ||
    slowCriticalDelta > 0 ||
    worsenedAttrCount > 0 ||
    healthDelta <= -3 ||
    regressionScore >= 20
  ) {
    regressionGradeCode = 2;
  } else if (badDelta < 0 || improvedAttrCount > 0 || healthDelta >= 3) {
    regressionGradeCode = 0;
  }

  return {
    engineSource: 'ts-parity',
    elapsedDays,
    badDelta,
    slowCriticalDelta,
    healthDelta,
    latencyDeltaMs,
    badSectorsPerDay,
    healthLossPerDay,
    worsenedAttrCount,
    improvedAttrCount,
    regressionGradeCode,
    regressionScore
  };
}

// ===========================================================================
// 4. Fleet Watchdog Matrix Evaluator (TS Parity + Tauri IPC)
// ===========================================================================

function resolveDriveIndexFromId(drive: DiskDrive, fallbackIdx: number): number {
  const m = drive.id.match(/(\d+)$/);
  return m ? Number(m[1]) : fallbackIdx;
}

function metricToCode(metric: WatchdogRule['metric']): number {
  switch (metric) {
    case 'temp':
      return 0;
    case 'smart_05':
      return 1;
    case 'smart_c5':
      return 2;
    case 'health_score':
      return 3;
    case 'scheduled_quick_scan':
      return 4;
    default:
      return 0;
  }
}

export function evaluateWatchdogMatrixSync(
  drives: DiskDrive[],
  rules: WatchdogRule[],
  baselines: Record<string, WatchdogBaselineSnapshot>,
  nowMs = Date.now()
): WatchdogMatrixReport {
  let healthSum = 0;
  let healthCnt = 0;
  let worstDriveIndex = -1;
  let worstHealth = 101;

  drives.forEach((d, idx) => {
    const dIdx = resolveDriveIndexFromId(d, idx);
    if (d.healthScore !== null && Number.isFinite(d.healthScore) && d.healthScore >= 0) {
      const hc = clamp(d.healthScore, 0, 100);
      healthSum += hc;
      healthCnt++;
      if (hc < worstHealth) {
        worstHealth = hc;
        worstDriveIndex = dIdx;
      }
    }
  });

  const fleetHealthIndex = healthCnt > 0 ? healthSum / healthCnt : 100;
  const triggers: WatchdogTriggerMatrixItem[] = [];
  const quickScanDriveIndices: number[] = [];

  rules.forEach((rule, rIdx) => {
    if (!rule.enabled) return;
    const metricCode = metricToCode(rule.metric);
    if (rule.metric === 'scheduled_quick_scan') {
      const intervalMs = Math.max(5, rule.intervalMinutes) * 60_000;
      if (nowMs - (rule.lastTriggeredAt ?? 0) >= intervalMs) {
        drives.forEach((d, dPos) => {
          if (rule.driveId !== 'ALL' && rule.driveId !== d.id) return;
          const dIdx = resolveDriveIndexFromId(d, dPos);
          if (!quickScanDriveIndices.includes(dIdx)) quickScanDriveIndices.push(dIdx);
          triggers.push({
            ruleIndex: rIdx,
            driveIndex: dIdx,
            metricCode,
            severityCode: 0,
            observedValue: rule.intervalMinutes,
            thresholdValue: rule.intervalMinutes
          });
        });
      }
      return;
    }

    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    const lastFired = rule.lastTriggeredAt ?? 0;
    if (lastFired > 0 && nowMs - lastFired < cooldownMs) return;

    drives.forEach((d, dPos) => {
      if (rule.driveId !== 'ALL' && rule.driveId !== d.id) return;
      const dIdx = resolveDriveIndexFromId(d, dPos);
      const a05 = d.smartAttributes.find(a => a.id === 5);
      const aC5 = d.smartAttributes.find(a => a.id === 197);
      const raw05 = a05 ? parseSmartAttributeNumericRaw(a05) : null;
      const rawC5 = aC5 ? parseSmartAttributeNumericRaw(aC5) : null;
      const base05 = baselines[d.id]?.reallocated05 ?? null;

      if (rule.metric === 'temp' && d.temperatureC !== null && d.temperatureC >= rule.thresholdValue) {
        triggers.push({
          ruleIndex: rIdx,
          driveIndex: dIdx,
          metricCode: 0,
          severityCode: d.temperatureC >= rule.thresholdValue + 5 ? 2 : 1,
          observedValue: d.temperatureC,
          thresholdValue: rule.thresholdValue
        });
      } else if (
        rule.metric === 'smart_c5' &&
        rawC5 !== null &&
        rawC5 >= Math.max(1, rule.thresholdValue)
      ) {
        triggers.push({
          ruleIndex: rIdx,
          driveIndex: dIdx,
          metricCode: 2,
          severityCode: 2,
          observedValue: rawC5,
          thresholdValue: rule.thresholdValue
        });
      } else if (
        rule.metric === 'smart_05' &&
        raw05 !== null &&
        base05 !== null &&
        raw05 > base05 &&
        raw05 - base05 >= Math.max(1, rule.thresholdValue)
      ) {
        triggers.push({
          ruleIndex: rIdx,
          driveIndex: dIdx,
          metricCode: 1,
          severityCode: 2,
          observedValue: raw05 - base05,
          thresholdValue: rule.thresholdValue
        });
      } else if (
        rule.metric === 'health_score' &&
        d.healthScore !== null &&
        d.healthScore <= rule.thresholdValue
      ) {
        triggers.push({
          ruleIndex: rIdx,
          driveIndex: dIdx,
          metricCode: 3,
          severityCode: d.healthScore <= 50 ? 2 : 1,
          observedValue: d.healthScore,
          thresholdValue: rule.thresholdValue
        });
      }
    });
  });

  return {
    engineSource: 'ts-parity',
    evaluatedDriveCount: drives.length,
    evaluatedRuleCount: rules.length,
    triggeredCount: triggers.length,
    quickScanTargetCount: quickScanDriveIndices.length,
    worstDriveIndex,
    fleetHealthIndex,
    triggers,
    quickScanDriveIndices
  };
}

// ===========================================================================
// 5. Async Tauri IPC Dispatchers (DiskSentinelIntegrity.dll + Parity Fallback)
// ===========================================================================

export async function queryIntegrityEngineStatus(): Promise<IntegrityEngineStatus | null> {
  if (!isTauriDesktopRuntime()) {
    return null;
  }
  try {
    const invoke = (window as any).__TAURI__.core.invoke;
    return (await invoke('inspect_integrity_dll_status')) as IntegrityEngineStatus;
  } catch {
    return null;
  }
}

export async function computeBufferIntegrityDigest(
  raw: Uint8Array | number[]
): Promise<IntegrityDigestReport> {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('compute_integrity_digest', {
        bytes: Array.from(bytes)
      })) as IntegrityDigestReport;
    } catch {
      // Fallback to TypeScript mathematical parity
    }
  }
  return computeBufferIntegrityDigestSync(bytes);
}

export async function evaluateExtentIntegrityNative(
  extents: IntegrityFileExtent[],
  badLbas: number[],
  slowLbas: number[],
  flags: {
    hashMismatch?: boolean;
    isUnreadable?: boolean;
    isMissing?: boolean;
    hasSha256?: boolean;
  } = {}
): Promise<ExtentIntegrityReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('evaluate_extent_integrity', {
        extents: extents.map(e => ({ startLba: e.startLba, endLba: e.endLba })),
        badLbas,
        slowLbas,
        hashMismatch: Boolean(flags.hashMismatch),
        isUnreadable: Boolean(flags.isUnreadable),
        isMissing: Boolean(flags.isMissing),
        hasSha256: Boolean(flags.hasSha256)
      })) as ExtentIntegrityReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return evaluateExtentIntegritySync(extents, badLbas, slowLbas, flags);
}

export async function computeScanSmartDiffWithVelocity(
  scanA: SavedScanRecord,
  scanB: SavedScanRecord
): Promise<ScanSmartVelocityReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const mapA = new Map(scanA.smartSnapshot.map(a => [a.id, a] as const));
      const mapB = new Map(scanB.smartSnapshot.map(b => [b.id, b] as const));
      const attrs = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
        .sort((x, y) => x - y)
        .map(id => {
          const a = mapA.get(id);
          const b = mapB.get(id);
          return {
            attributeId: id,
            currentA: a ? clamp(a.current, 0, 255) : 0,
            currentB: b ? clamp(b.current, 0, 255) : 0,
            statusA: a ? STATUS_SEV[a.status] : 255,
            statusB: b ? STATUS_SEV[b.status] : 255,
            rawA: a ? Math.max(0, Math.round(parseSmartAttributeNumericRaw(a) ?? 0)) : 0,
            rawB: b ? Math.max(0, Math.round(parseSmartAttributeNumericRaw(b) ?? 0)) : 0,
            presentA: Boolean(a),
            presentB: Boolean(b)
          };
        });

      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('compute_scan_smart_diff', {
        timestampAMs: Math.round(scanA.timestamp),
        timestampBMs: Math.round(scanB.timestamp),
        badSectorsA: Math.max(0, Math.round(scanA.badCount)),
        badSectorsB: Math.max(0, Math.round(scanB.badCount)),
        slowCriticalA: Math.max(0, Math.round(scanA.slowCount + scanA.criticalCount)),
        slowCriticalB: Math.max(0, Math.round(scanB.slowCount + scanB.criticalCount)),
        healthScoreA: scanA.healthScore ?? -1,
        healthScoreB: scanB.healthScore ?? -1,
        avgReadLatencyMsA: scanA.avgLatencyMs,
        avgReadLatencyMsB: scanB.avgLatencyMs,
        attrs
      })) as ScanSmartVelocityReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return computeScanSmartDiffWithVelocitySync(scanA, scanB);
}

export async function evaluateWatchdogMatrixNative(
  drives: DiskDrive[],
  rules: WatchdogRule[],
  baselines: Record<string, WatchdogBaselineSnapshot>,
  nowMs = Date.now()
): Promise<WatchdogMatrixReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      const drivePayload = drives.map((d, idx) => {
        const dIdx = resolveDriveIndexFromId(d, idx);
        const a05 = d.smartAttributes.find(a => a.id === 5);
        const aC5 = d.smartAttributes.find(a => a.id === 197);
        const raw05 = a05 ? parseSmartAttributeNumericRaw(a05) : null;
        const rawC5 = aC5 ? parseSmartAttributeNumericRaw(aC5) : null;
        const base05 = baselines[d.id]?.reallocated05 ?? null;
        return {
          driveIndex: dIdx,
          temperatureC: d.temperatureC !== null ? Math.round(d.temperatureC) : null,
          healthScore: d.healthScore,
          smart05Raw: raw05 !== null ? Math.max(0, Math.round(raw05)) : null,
          smart05Baseline: base05 !== null ? Math.max(0, Math.round(base05)) : null,
          smartC5Raw: rawC5 !== null ? Math.max(0, Math.round(rawC5)) : null,
          isLinkDowngraded: Boolean(d.hardwareSpecs?.linkProbe?.isLinkDowngraded)
        };
      });

      const rulePayload = rules.map((r, rIdx) => {
        const matchedDriveIdx =
          r.driveId === 'ALL'
            ? -1
            : (() => {
                const pos = drives.findIndex(d => d.id === r.driveId);
                return pos >= 0 ? resolveDriveIndexFromId(drives[pos], pos) : -1;
              })();
        return {
          ruleIndex: rIdx,
          targetDriveIndex: matchedDriveIdx,
          metricCode: metricToCode(r.metric),
          intervalMinutes: Math.max(1, Math.round(r.intervalMinutes)),
          thresholdValue: r.thresholdValue,
          cooldownMinutes: Math.max(1, Math.round(r.cooldownMinutes)),
          enabled: r.enabled,
          lastTriggeredMs: Math.round(r.lastTriggeredAt ?? 0)
        };
      });

      return (await invoke('evaluate_fleet_watchdog', {
        drives: drivePayload,
        rules: rulePayload,
        nowMs: Math.round(nowMs)
      })) as WatchdogMatrixReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return evaluateWatchdogMatrixSync(drives, rules, baselines, nowMs);
}
