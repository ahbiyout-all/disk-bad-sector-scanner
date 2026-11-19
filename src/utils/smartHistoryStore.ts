import { DiskDrive, DriveSmartAttribute, SmartHistorySnapshot } from '../types';
import { safeStorage } from './safeStorage';

const SMART_HISTORY_STORAGE_KEY = 'disk_smart_history_v1';
const MAX_TOTAL_SNAPSHOTS = 240;
const KEY_MONITORED_IDS = new Set([1, 5, 10, 187, 197, 198, 199]);
const GENERIC_SERIALS = new Set(['', 'N/A', 'UNKNOWN', 'NONE', '00000000']);

export function normalizeDriveSerial(serial?: string | null): string {
  return (serial || '').trim().toUpperCase();
}

export function matchesDriveRecord(
  recordMeta: { driveId: string; driveModel: string; driveSerial?: string | null },
  drive: DiskDrive
): boolean {
  const activeSerial = normalizeDriveSerial(drive.serialNumber);
  const recSerial = normalizeDriveSerial(recordMeta.driveSerial);
  if (!GENERIC_SERIALS.has(activeSerial) && !GENERIC_SERIALS.has(recSerial)) {
    return recSerial === activeSerial;
  }
  return recordMeta.driveId === drive.id && recordMeta.driveModel === drive.model;
}

export function loadSmartHistorySnapshots(): SmartHistorySnapshot[] {
  const raw = safeStorage.getItem(SMART_HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SmartHistorySnapshot =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.driveId === 'string' &&
        typeof item.driveModel === 'string' &&
        typeof item.timestamp === 'number' &&
        Array.isArray(item.smartAttributes)
    );
  } catch {
    return [];
  }
}

export function saveSmartHistorySnapshots(snapshots: SmartHistorySnapshot[]): void {
  safeStorage.setItem(SMART_HISTORY_STORAGE_KEY, JSON.stringify(snapshots));
}

function buildKeySignature(attrs: DriveSmartAttribute[]): string {
  return attrs
    .filter(a => KEY_MONITORED_IDS.has(a.id))
    .sort((a, b) => a.id - b.id)
    .map(a => `${a.id}:${a.current}:${a.raw}`)
    .join('|');
}

export function recordSmartSnapshotForDrive(
  existing: SmartHistorySnapshot[],
  drive: DiskDrive,
  source: SmartHistorySnapshot['source'],
  minIntervalMs = 15 * 60 * 1000
): SmartHistorySnapshot[] {
  // Never fabricate S.M.A.R.T. history when no genuine hardware attributes are present
  if (!drive.smartAttributes || drive.smartAttributes.length === 0) {
    return existing;
  }

  const now = Date.now();
  const driveSnapshots = existing
    .filter(s => matchesDriveRecord(s, drive))
    .sort((a, b) => a.timestamp - b.timestamp);

  const latest = driveSnapshots[driveSnapshots.length - 1];
  if (latest && source !== 'manual') {
    const elapsed = now - latest.timestamp;
    const prevSig = buildKeySignature(latest.smartAttributes);
    const nextSig = buildKeySignature(drive.smartAttributes);
    if (prevSig === nextSig && elapsed < minIntervalMs) {
      return existing;
    }
    // Avoid ultra-tight duplicates even if attributes jitter within 5 seconds
    if (elapsed < 5000 && prevSig === nextSig) {
      return existing;
    }
  }

  const snapshot: SmartHistorySnapshot = {
    id: `smart-snap-${now}-${Math.random().toString(36).slice(2, 7)}`,
    driveId: drive.id,
    driveModel: drive.model,
    driveSerial: drive.serialNumber,
    timestamp: now,
    source,
    healthScore: drive.healthScore,
    temperatureC: drive.temperatureC,
    powerOnHours: drive.powerOnHours,
    smartAttributes: drive.smartAttributes.map(a => ({ ...a }))
  };

  const nextList = [...existing, snapshot]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_TOTAL_SNAPSHOTS);

  saveSmartHistorySnapshots(nextList);
  return nextList;
}
