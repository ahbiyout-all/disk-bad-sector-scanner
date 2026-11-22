import {
  ErrorLogItem,
  IntegrityFileExtent,
  IntegrityProbeResult,
  IntegrityWatchEntry,
  IntegrityWatchStatus,
  SectorBlock
} from '../types';
import { buildHeatmapSearchIndex } from './fileLbaHeatmap';
import { safeStorage } from './safeStorage';

const INTEGRITY_WATCH_ROOTS_KEY = 'disksentinel_integrity_roots_v1';
const INTEGRITY_ENTRIES_KEY = 'disksentinel_integrity_entries_v1';

export function loadWatchRoots(): string[] {
  const raw = safeStorage.getItem(INTEGRITY_WATCH_ROOTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function saveWatchRoots(roots: string[]): void {
  try {
    const unique = Array.from(new Set(roots.map(r => r.trim()).filter(Boolean)));
    safeStorage.setItem(INTEGRITY_WATCH_ROOTS_KEY, JSON.stringify(unique));
  } catch {
    // Ignore storage error
  }
}

export function loadIntegrityEntries(): IntegrityWatchEntry[] {
  const raw = safeStorage.getItem(INTEGRITY_ENTRIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IntegrityWatchEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveIntegrityEntries(entries: IntegrityWatchEntry[]): void {
  try {
    safeStorage.setItem(INTEGRITY_ENTRIES_KEY, JSON.stringify(entries.slice(0, 1000)));
  } catch {
    // Ignore storage error
  }
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function normalizePathKey(p: string): string {
  return p.trim().replace(/[\\/]+/g, '\\').toLowerCase();
}

function findOverlappingLbas(
  extents: IntegrityFileExtent[],
  sortedLbas: number[]
): number[] {
  if (extents.length === 0 || sortedLbas.length === 0) return [];
  const hits: number[] = [];
  for (const ext of extents) {
    // Binary search first lba >= ext.startLba
    let lo = 0;
    let hi = sortedLbas.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedLbas[mid] < ext.startLba) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sortedLbas.length; i++) {
      const lba = sortedLbas[i];
      if (lba > ext.endLba) break;
      hits.push(lba);
      if (hits.length >= 32) return Array.from(new Set(hits));
    }
  }
  return Array.from(new Set(hits));
}

export function correlateIntegrityProbeResults(
  probeResults: IntegrityProbeResult[],
  existingEntries: IntegrityWatchEntry[],
  options: {
    watchRootResolver?: (filePath: string) => string;
    sectorBlocks?: SectorBlock[];
    errorLogs?: ErrorLogItem[];
    badLbaHistory?: number[];
    nowMs?: number;
    refreshBaseline?: boolean;
  } = {}
): {
  entries: IntegrityWatchEntry[];
  bitRotAlerts: IntegrityWatchEntry[];
  badLbaAlerts: IntegrityWatchEntry[];
} {
  const nowMs = options.nowMs ?? Date.now();
  const existingMap = new Map<string, IntegrityWatchEntry>(
    existingEntries.map(e => [normalizePathKey(e.filePath), e] as const)
  );

  const searchIdx = buildHeatmapSearchIndex({
    sectorBlocks: options.sectorBlocks,
    errorLogs: options.errorLogs,
    badLbaHistory: options.badLbaHistory
  });
  const badLbas = searchIdx.sortedBadLbas;
  const slowLbas = Array.from(
    new Set([...searchIdx.sortedCriticalLbas, ...searchIdx.sortedSlowLbas])
  ).sort((a, b) => a - b);

  const nextMap = new Map<string, IntegrityWatchEntry>(existingMap);
  const bitRotAlerts: IntegrityWatchEntry[] = [];
  const badLbaAlerts: IntegrityWatchEntry[] = [];

  for (const probe of probeResults) {
    if (!probe.filePath) continue;
    const key = normalizePathKey(probe.filePath);
    const prev = existingMap.get(key);
    const watchRoot = options.watchRootResolver
      ? options.watchRootResolver(probe.filePath)
      : prev?.watchRootPath || probe.filePath;

    const overlappingBadLbas = findOverlappingLbas(probe.extents, badLbas);
    const overlappingSlowLbas = findOverlappingLbas(probe.extents, slowLbas);

    let baselineSha256 = prev?.baselineSha256 ?? null;
    let baselineRecordedAt = prev?.baselineRecordedAt ?? nowMs;
    if (probe.sha256 && (!baselineSha256 || options.refreshBaseline)) {
      baselineSha256 = probe.sha256;
      baselineRecordedAt = nowMs;
    }

    let status: IntegrityWatchStatus = 'UNVERIFIED';
    if (probe.status === 'missing') {
      status = 'MISSING_FILE';
    } else if (probe.status === 'unreadable') {
      status = 'UNREADABLE';
    } else if (
      baselineSha256 &&
      probe.sha256 &&
      baselineSha256 !== probe.sha256 &&
      !options.refreshBaseline
    ) {
      status = 'HASH_MISMATCH';
    } else if (overlappingBadLbas.length > 0) {
      status = 'BAD_LBA_OVERLAP';
    } else if (overlappingSlowLbas.length > 0) {
      status = 'SLOW_LBA_OVERLAP';
    } else if (probe.sha256) {
      status = 'VERIFIED';
    }

    const entry: IntegrityWatchEntry = {
      id: prev?.id || `int-${Math.abs(key.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0))}-${key.length}`,
      watchRootPath: watchRoot,
      filePath: probe.filePath,
      fileName: fileNameFromPath(probe.filePath),
      driveIndex: probe.driveIndex ?? prev?.driveIndex ?? null,
      sizeBytes: probe.sizeBytes,
      modifiedMs: probe.modifiedMs,
      baselineSha256,
      currentSha256: probe.sha256,
      extents: probe.extents.length > 0 ? probe.extents : prev?.extents || [],
      status,
      overlappingBadLbas,
      overlappingSlowLbas,
      lastCheckedAt: nowMs,
      baselineRecordedAt,
      note: probe.note
    };

    nextMap.set(key, entry);

    if (status === 'HASH_MISMATCH') {
      bitRotAlerts.push(entry);
    } else if (status === 'BAD_LBA_OVERLAP') {
      badLbaAlerts.push(entry);
    }
  }

  const entries = Array.from(nextMap.values()).sort((a, b) => {
    const rank = (s: IntegrityWatchStatus) =>
      s === 'HASH_MISMATCH'
        ? 0
        : s === 'BAD_LBA_OVERLAP'
        ? 1
        : s === 'UNREADABLE'
        ? 2
        : s === 'MISSING_FILE'
        ? 3
        : s === 'SLOW_LBA_OVERLAP'
        ? 4
        : s === 'VERIFIED'
        ? 5
        : 6;
    const diff = rank(a.status) - rank(b.status);
    return diff !== 0 ? diff : a.filePath.localeCompare(b.filePath);
  });

  return { entries, bitRotAlerts, badLbaAlerts };
}
