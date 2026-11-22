import {
  DiskDrive,
  WatchdogBaselineSnapshot,
  WatchdogRule,
  WatchdogTriggerEvent
} from '../types';
import {
  evaluateWatchdogMatrixNative,
  WatchdogMatrixReport
} from './integrityDllBridge';

const RULES_STORAGE_KEY = 'disksentinel_watchdog_rules_v1';
const BASELINES_STORAGE_KEY = 'disksentinel_watchdog_baselines_v1';
const EVENTS_STORAGE_KEY = 'disksentinel_watchdog_events_v1';

export const DEFAULT_WATCHDOG_RULES: WatchdogRule[] = [
  {
    id: 'rule-default-temp-55',
    name: '고온 과열 임계치 경보 (55°C+)',
    driveId: 'ALL',
    metric: 'temp',
    thresholdValue: 55,
    intervalMinutes: 1,
    cooldownMinutes: 15,
    enabled: true
  },
  {
    id: 'rule-default-smart-c5',
    name: '현재 보류 섹터(C5h) 발생 감시',
    driveId: 'ALL',
    metric: 'smart_c5',
    thresholdValue: 1,
    intervalMinutes: 1,
    cooldownMinutes: 30,
    enabled: true
  },
  {
    id: 'rule-default-smart-05-delta',
    name: '치환 섹터(05h) 증가 감시',
    driveId: 'ALL',
    metric: 'smart_05',
    thresholdValue: 1,
    intervalMinutes: 1,
    cooldownMinutes: 30,
    enabled: true
  },
  {
    id: 'rule-default-health-75',
    name: '드라이브 건강도 저하 경보 (≤75%)',
    driveId: 'ALL',
    metric: 'health_score',
    thresholdValue: 75,
    intervalMinutes: 1,
    cooldownMinutes: 60,
    enabled: true
  }
];

export function loadWatchdogRules(): WatchdogRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_WATCHDOG_RULES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_WATCHDOG_RULES;
}

export function saveWatchdogRules(rules: WatchdogRule[]): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore storage errors
  }
}

export function loadWatchdogBaselines(): Record<string, WatchdogBaselineSnapshot> {
  try {
    const raw = localStorage.getItem(BASELINES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWatchdogBaselines(map: Record<string, WatchdogBaselineSnapshot>): void {
  try {
    localStorage.setItem(BASELINES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function loadWatchdogEvents(): WatchdogTriggerEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWatchdogEvents(events: WatchdogTriggerEvent[]): void {
  try {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, 100)));
  } catch {
    // ignore storage errors
  }
}

function getSmartNumericRaw(drive: DiskDrive, attrId: number): number | null {
  const attr = drive.smartAttributes.find(a => a.id === attrId);
  if (!attr) return null;
  const rawStr = String(attr.raw ?? '').trim();
  if (rawStr) {
    const hexMatch = rawStr.match(/^0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      const parsedHex = parseInt(hexMatch[1], 16);
      if (Number.isFinite(parsedHex)) return parsedHex;
    }
    const headToken = rawStr.split(/[(/:\s]/)[0]?.replace(/,/g, '') ?? '';
    if (/^-?\d+$/.test(headToken)) {
      const parsedDec = Number(headToken);
      if (Number.isFinite(parsedDec)) return Math.max(0, parsedDec);
    }
  }
  return null;
}

export interface WatchdogEvaluationResult {
  triggeredEvents: WatchdogTriggerEvent[];
  updatedRules: WatchdogRule[];
  updatedBaselines: Record<string, WatchdogBaselineSnapshot>;
  quickScanTargetDriveIds: string[];
  rulesChanged: boolean;
  baselinesChanged: boolean;
}

/**
 * Evaluates active WatchdogRules against live drives and baseline snapshots.
 * Honors rule cooldown windows and emits Quick Scan drive IDs when scheduled intervals elapse.
 */
export function evaluateWatchdogRules(
  drives: DiskDrive[],
  rules: WatchdogRule[],
  baselines: Record<string, WatchdogBaselineSnapshot>,
  now = Date.now()
): WatchdogEvaluationResult {
  const triggeredEvents: WatchdogTriggerEvent[] = [];
  const quickScanTargetDriveIds: string[] = [];
  const nextBaselines: Record<string, WatchdogBaselineSnapshot> = { ...baselines };
  let baselinesChanged = false;
  let rulesChanged = false;

  // Update SMART baselines first and capture deltas
  const delta05ByDrive = new Map<string, number>();
  for (const drive of drives) {
    const val05 = getSmartNumericRaw(drive, 5);
    const valC5 = getSmartNumericRaw(drive, 197);
    const prevBase = baselines[drive.id];

    if (!prevBase && (val05 !== null || valC5 !== null)) {
      nextBaselines[drive.id] = {
        reallocated05: val05 ?? 0,
        pendingC5: valC5 ?? 0,
        updatedAt: now
      };
      baselinesChanged = true;
    } else if (prevBase) {
      let nextReallocated = prevBase.reallocated05;
      let nextPending = prevBase.pendingC5;
      let dirty = false;

      if (val05 !== null && val05 > prevBase.reallocated05) {
        delta05ByDrive.set(drive.id, val05 - prevBase.reallocated05);
        nextReallocated = val05;
        dirty = true;
      }
      if (valC5 !== null && valC5 !== prevBase.pendingC5) {
        nextPending = valC5;
        dirty = true;
      }

      if (dirty) {
        nextBaselines[drive.id] = {
          reallocated05: nextReallocated,
          pendingC5: nextPending,
          updatedAt: now
        };
        baselinesChanged = true;
      }
    }
  }

  const updatedRules = rules.map(rule => {
    if (!rule.enabled) return rule;
    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    const lastFired = rule.lastTriggeredAt ?? 0;

    if (rule.metric === 'scheduled_quick_scan') {
      const intervalMs = Math.max(5, rule.intervalMinutes) * 60_000;
      if (now - lastFired >= intervalMs && drives.length > 0) {
        const targets =
          rule.driveId === 'ALL' ? drives : drives.filter(d => d.id === rule.driveId);
        if (targets.length > 0) {
          for (const target of targets) {
            if (!quickScanTargetDriveIds.includes(target.id)) {
              quickScanTargetDriveIds.push(target.id);
            }
            triggeredEvents.push({
              id: `wd-${now}-${rule.id}-${target.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              metric: rule.metric,
              driveId: target.id,
              driveModel: target.model,
              severity: 'info',
              message: `정기 빠른 검사(Quick Scan) 예약 실행: [${target.model}] (${rule.intervalMinutes}분 주기)`,
              triggeredAt: now
            });
          }
          rulesChanged = true;
          return { ...rule, lastTriggeredAt: now };
        }
      }
      return rule;
    }

    if (lastFired > 0 && now - lastFired < cooldownMs) {
      return rule;
    }

    const targets =
      rule.driveId === 'ALL' ? drives : drives.filter(d => d.id === rule.driveId);
    let firedThisRule = false;

    for (const drive of targets) {
      if (rule.metric === 'temp' && drive.temperatureC !== null && drive.temperatureC >= rule.thresholdValue) {
        firedThisRule = true;
        triggeredEvents.push({
          id: `wd-${now}-${rule.id}-${drive.id}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metric: 'temp',
          driveId: drive.id,
          driveModel: drive.model,
          severity: drive.temperatureC >= rule.thresholdValue + 5 ? 'critical' : 'warning',
          message: `온도 임계치 초과: [${drive.model}] 현재 ${drive.temperatureC}°C (설정 상한 ${rule.thresholdValue}°C)`,
          triggeredAt: now
        });
      } else if (rule.metric === 'smart_c5') {
        const pendingVal = getSmartNumericRaw(drive, 197);
        if (pendingVal !== null && pendingVal >= Math.max(1, rule.thresholdValue)) {
          firedThisRule = true;
          triggeredEvents.push({
            id: `wd-${now}-${rule.id}-${drive.id}`,
            ruleId: rule.id,
            ruleName: rule.name,
            metric: 'smart_c5',
            driveId: drive.id,
            driveModel: drive.model,
            severity: 'critical',
            message: `보류 섹터(C5h) 경보: [${drive.model}] 현재 ${pendingVal}개 감지 (기준 ${rule.thresholdValue}개 이상)`,
            triggeredAt: now
          });
        }
      } else if (rule.metric === 'smart_05') {
        const delta = delta05ByDrive.get(drive.id) ?? 0;
        if (delta >= Math.max(1, rule.thresholdValue)) {
          firedThisRule = true;
          triggeredEvents.push({
            id: `wd-${now}-${rule.id}-${drive.id}`,
            ruleId: rule.id,
            ruleName: rule.name,
            metric: 'smart_05',
            driveId: drive.id,
            driveModel: drive.model,
            severity: 'critical',
            message: `치환 섹터(05h) 신규 증가: [${drive.model}] 이전 기록 대비 +${delta}개 증가`,
            triggeredAt: now
          });
        }
      } else if (
        rule.metric === 'health_score' &&
        drive.healthScore !== null &&
        drive.healthScore <= rule.thresholdValue
      ) {
        firedThisRule = true;
        triggeredEvents.push({
          id: `wd-${now}-${rule.id}-${drive.id}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metric: 'health_score',
          driveId: drive.id,
          driveModel: drive.model,
          severity: drive.healthScore <= 50 ? 'critical' : 'warning',
          message: `드라이브 건강도 하락: [${drive.model}] 현재 ${drive.healthScore}% (임계치 ${rule.thresholdValue}% 이하)`,
          triggeredAt: now
        });
      }
    }

    if (firedThisRule) {
      rulesChanged = true;
      return { ...rule, lastTriggeredAt: now };
    }
    return rule;
  });

  return {
    triggeredEvents,
    updatedRules,
    updatedBaselines: nextBaselines,
    quickScanTargetDriveIds,
    rulesChanged,
    baselinesChanged
  };
}

/**
 * Evaluates fleet Watchdog matrix through DiskSentinelIntegrity.dll (or deterministic parity fallback),
 * returning both the standard WatchdogEvaluationResult and the fleetHealthIndex matrix telemetry.
 */
export async function evaluateWatchdogRulesNative(
  drives: DiskDrive[],
  rules: WatchdogRule[],
  baselines: Record<string, WatchdogBaselineSnapshot>,
  now = Date.now()
): Promise<WatchdogEvaluationResult & { matrixReport: WatchdogMatrixReport }> {
  const result = evaluateWatchdogRules(drives, rules, baselines, now);
  const matrixReport = await evaluateWatchdogMatrixNative(drives, rules, baselines, now);
  return {
    ...result,
    matrixReport
  };
}
