import { DriveSmartAttribute, SavedScanRecord } from '../types';
import { PROJECT_INFO } from '../config/projectInfo';

export interface MigrationUserSettings {
  isDarkMode: boolean;
  isMuted: boolean;
  volumePercent: number;
  notificationsAllowed: boolean;
  notificationPermissionState: NotificationPermission;
  scanSpeedMultiplier: number;
  isAutoRepairMode: boolean;
}

export interface DiskSentinelMigrationBundle {
  schema: 'disksentinel-migration-v1';
  appName: string;
  appVersion: string;
  exportedAt: string;
  settings: MigrationUserSettings;
  scanRecords: SavedScanRecord[];
}

export interface MigrationValidationResult {
  valid: boolean;
  bundle?: DiskSentinelMigrationBundle;
  error?: string;
  skippedRecordsCount?: number;
}

export function buildMigrationBundle(
  settings: MigrationUserSettings,
  scanRecords: SavedScanRecord[]
): DiskSentinelMigrationBundle {
  return {
    schema: 'disksentinel-migration-v1',
    appName: PROJECT_INFO.appName,
    appVersion: PROJECT_INFO.versionNumber,
    exportedAt: new Date().toISOString(),
    settings: {
      isDarkMode: Boolean(settings.isDarkMode),
      isMuted: Boolean(settings.isMuted),
      volumePercent: Math.max(0, Math.min(100, Math.round(settings.volumePercent))),
      notificationsAllowed: Boolean(settings.notificationsAllowed),
      notificationPermissionState: settings.notificationPermissionState,
      scanSpeedMultiplier: [1, 2, 5, 10].includes(settings.scanSpeedMultiplier)
        ? settings.scanSpeedMultiplier
        : 2,
      isAutoRepairMode: Boolean(settings.isAutoRepairMode)
    },
    scanRecords: scanRecords
      .filter(rec => rec.id !== 'scan-baseline-seagate')
      .map(rec => ({ ...rec }))
  };
}

export function downloadMigrationJson(bundle: DiskSentinelMigrationBundle): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `disksentinel-migration-v${PROJECT_INFO.versionNumber}-${stamp}.json`;

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}

function toFiniteNumber(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSmartAttribute(attr: unknown): DriveSmartAttribute | null {
  if (!attr || typeof attr !== 'object') return null;
  const a = attr as Record<string, unknown>;
  if (typeof a.id !== 'number' || typeof a.name !== 'string') return null;
  const status =
    a.status === 'good' || a.status === 'warning' || a.status === 'critical'
      ? a.status
      : 'good';
  return {
    id: a.id,
    name: a.name,
    current: toFiniteNumber(a.current, 100),
    worst: toFiniteNumber(a.worst, 100),
    threshold: toFiniteNumber(a.threshold, 0),
    raw: typeof a.raw === 'string' ? a.raw : '0',
    status,
    description: typeof a.description === 'string' ? a.description : ''
  };
}

function normalizeScanRecord(item: unknown): SavedScanRecord | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    r.id.trim().length === 0 ||
    r.id === 'scan-baseline-seagate' ||
    typeof r.driveModel !== 'string' ||
    typeof r.timestamp !== 'number' ||
    !Number.isFinite(r.timestamp) ||
    typeof r.totalBlocks !== 'number' ||
    !Number.isFinite(r.totalBlocks) ||
    typeof r.healthScore !== 'number' ||
    !Number.isFinite(r.healthScore)
  ) {
    return null;
  }

  const safeBadLbaList = Array.isArray(r.badLbaList)
    ? r.badLbaList.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];

  const safeSmartSnapshot = Array.isArray(r.smartSnapshot)
    ? r.smartSnapshot
        .map(normalizeSmartAttribute)
        .filter((v): v is DriveSmartAttribute => v !== null)
    : [];

  return {
    id: r.id.trim(),
    driveId: typeof r.driveId === 'string' ? r.driveId : 'migrated-drive',
    driveModel: r.driveModel,
    driveSerial: typeof r.driveSerial === 'string' ? r.driveSerial : 'N/A',
    driveCapacityGb: toFiniteNumber(r.driveCapacityGb, 0),
    date:
      typeof r.date === 'string' && r.date.length > 0
        ? r.date
        : new Date(r.timestamp).toLocaleString('ko-KR'),
    timestamp: r.timestamp,
    scanMode: r.scanMode === 'quick' ? 'quick' : 'full',
    scanMethodId: typeof r.scanMethodId === 'string' ? (r.scanMethodId as SavedScanRecord['scanMethodId']) : undefined,
    scanMethodName: typeof r.scanMethodName === 'string' ? r.scanMethodName : undefined,
    totalBlocks: Math.max(0, Math.round(r.totalBlocks)),
    goodCount: Math.max(0, Math.round(toFiniteNumber(r.goodCount, 0))),
    normalCount: Math.max(0, Math.round(toFiniteNumber(r.normalCount, 0))),
    slowCount: Math.max(0, Math.round(toFiniteNumber(r.slowCount, 0))),
    criticalCount: Math.max(0, Math.round(toFiniteNumber(r.criticalCount, 0))),
    badCount: Math.max(0, Math.round(toFiniteNumber(r.badCount, safeBadLbaList.length))),
    badLbaList: safeBadLbaList,
    healthScore: Math.max(0, Math.min(100, Math.round(r.healthScore))),
    durationSeconds: Math.max(0, toFiniteNumber(r.durationSeconds, 0)),
    avgLatencyMs: Math.max(0, toFiniteNumber(r.avgLatencyMs, 0)),
    maxLatencyMs: Math.max(0, toFiniteNumber(r.maxLatencyMs, 0)),
    avgSpeedMbSec:
      typeof r.avgSpeedMbSec === 'number' && Number.isFinite(r.avgSpeedMbSec)
        ? r.avgSpeedMbSec
        : undefined,
    smartSnapshot: safeSmartSnapshot,
    recommendation:
      typeof r.recommendation === 'string'
        ? r.recommendation
        : '마이그레이션 파일에서 복원된 검사 기록입니다.',
    mediaSpecificDiagnosis:
      typeof r.mediaSpecificDiagnosis === 'string' ? r.mediaSpecificDiagnosis : undefined
  };
}

export function parseAndValidateMigrationJson(rawText: string): MigrationValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      valid: false,
      error: '올바른 JSON 형식이 아닙니다. 파일이 손상되었거나 텍스트 포맷이 잘못되었습니다.'
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      error: '마이그레이션 파일 루트 객체가 올바르지 않습니다.'
    };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.schema !== 'disksentinel-migration-v1') {
    return {
      valid: false,
      error: '지원되지 않는 마이그레이션 스키마입니다. DiskSentinel 백업 JSON 파일을 선택하세요.'
    };
  }

  if (!obj.settings || typeof obj.settings !== 'object' || Array.isArray(obj.settings)) {
    return {
      valid: false,
      error: '백업 파일에 사용자 환경설정(settings) 섹션이 누락되어 있습니다.'
    };
  }

  const rawSettings = obj.settings as Record<string, unknown>;
  const rawRecords = Array.isArray(obj.scanRecords) ? obj.scanRecords : [];
  const validRecords = rawRecords
    .map(normalizeScanRecord)
    .filter((rec): rec is SavedScanRecord => rec !== null);
  const skippedRecordsCount = rawRecords.length - validRecords.length;

  const permRaw = rawSettings.notificationPermissionState;
  const validPerm: NotificationPermission =
    permRaw === 'granted' || permRaw === 'denied' || permRaw === 'default'
      ? permRaw
      : rawSettings.notificationsAllowed
        ? 'granted'
        : 'default';

  const speedRaw = Number(rawSettings.scanSpeedMultiplier);
  const scanSpeedMultiplier = [1, 2, 5, 10].includes(speedRaw) ? speedRaw : 2;

  const volRaw = Number(rawSettings.volumePercent);
  const volumePercent = Number.isFinite(volRaw) ? Math.max(0, Math.min(100, Math.round(volRaw))) : 50;

  return {
    valid: true,
    skippedRecordsCount,
    bundle: {
      schema: 'disksentinel-migration-v1',
      appName: typeof obj.appName === 'string' ? obj.appName : PROJECT_INFO.appName,
      appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : PROJECT_INFO.versionNumber,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      settings: {
        isDarkMode: typeof rawSettings.isDarkMode === 'boolean' ? rawSettings.isDarkMode : true,
        isMuted: typeof rawSettings.isMuted === 'boolean' ? rawSettings.isMuted : false,
        volumePercent,
        notificationsAllowed:
          typeof rawSettings.notificationsAllowed === 'boolean'
            ? rawSettings.notificationsAllowed
            : validPerm === 'granted',
        notificationPermissionState: validPerm,
        scanSpeedMultiplier,
        isAutoRepairMode:
          typeof rawSettings.isAutoRepairMode === 'boolean' ? rawSettings.isAutoRepairMode : false
      },
      scanRecords: validRecords
    }
  };
}

export function mergeScanRecords(
  existing: SavedScanRecord[],
  incoming: SavedScanRecord[],
  strategy: 'merge' | 'replace'
): SavedScanRecord[] {
  if (strategy === 'replace') {
    return incoming
      .filter(r => r.id !== 'scan-baseline-seagate')
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  const byId = new Map<string, SavedScanRecord>();
  existing.forEach(rec => {
    if (rec.id !== 'scan-baseline-seagate') byId.set(rec.id, rec);
  });
  incoming.forEach(rec => {
    if (rec.id !== 'scan-baseline-seagate' && !byId.has(rec.id)) {
      byId.set(rec.id, rec);
    }
  });

  return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
}
