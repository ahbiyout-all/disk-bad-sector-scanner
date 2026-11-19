import {
  CustomSmartThresholdRule,
  DriveSmartAttribute,
  SmartThresholdComparison
} from '../types';
import { safeStorage } from './safeStorage';

const CUSTOM_SMART_THRESHOLDS_STORAGE_KEY = 'disk_custom_smart_thresholds_v1';

export interface SmartAttributeCatalogEntry {
  id: number;
  name: string;
  nameKo: string;
  defaultMode: SmartThresholdComparison;
  defaultWarning: number | null;
  defaultCritical: number | null;
  note: string;
}

export const SMART_ATTRIBUTE_CATALOG: SmartAttributeCatalogEntry[] = [
  {
    id: 1,
    name: 'Raw Read Error Rate',
    nameKo: '원시 읽기 오류율',
    defaultMode: 'normalized_below',
    defaultWarning: 55,
    defaultCritical: 35,
    note: '정규화 점수(Current) 하락 기준으로 평가 (Seagate 48-bit 패킹 Raw 값 오탐 방지)'
  },
  {
    id: 5,
    name: 'Reallocated Sector Count',
    nameKo: '치환 섹터 수',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 16,
    note: '예비 트랙으로 재매핑된 불량 섹터 누적 카운트'
  },
  {
    id: 7,
    name: 'Seek Error Rate',
    nameKo: '탐색 오류율',
    defaultMode: 'normalized_below',
    defaultWarning: 55,
    defaultCritical: 35,
    note: 'HDD 헤드 탐색 정밀도 정규화 점수'
  },
  {
    id: 10,
    name: 'Spin Retry Count',
    nameKo: '스핀 재시도 횟수',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 5,
    note: 'HDD 스핀들 모터 기동 재시도 횟수'
  },
  {
    id: 177,
    name: 'Wear Leveling Count',
    nameKo: 'SSD 웨어 레벨링 횟수',
    defaultMode: 'normalized_below',
    defaultWarning: 25,
    defaultCritical: 10,
    note: 'NAND 플래시 P/E 사이클 잔여 수명 백분율'
  },
  {
    id: 187,
    name: 'Reported Uncorrectable Errors',
    nameKo: '보고된 복구 불가 오류',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 10,
    note: '하드웨어 ECC로 복구되지 않은 읽기 오류 수'
  },
  {
    id: 188,
    name: 'Command Timeout',
    nameKo: '명령 타임아웃 횟수',
    defaultMode: 'raw_above',
    defaultWarning: 3,
    defaultCritical: 15,
    note: '디스크 응답 시간 초과(Timeout) 중단 횟수'
  },
  {
    id: 194,
    name: 'Temperature Celsius',
    nameKo: '디스크 작동 온도 (°C)',
    defaultMode: 'raw_above',
    defaultWarning: 50,
    defaultCritical: 60,
    note: '드라이브 내부 온도 센서 섭씨(°C) 기준'
  },
  {
    id: 196,
    name: 'Reallocation Event Count',
    nameKo: '재할당 이벤트 횟수',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 16,
    note: '섹터 재할당 시도 총 이벤트 횟수'
  },
  {
    id: 197,
    name: 'Current Pending Sector Count',
    nameKo: '보류 섹터 수',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 8,
    note: '불안정하여 재매핑 대기 중인 섹터 수'
  },
  {
    id: 198,
    name: 'Uncorrectable Sector Count',
    nameKo: '복구 불가 섹터 수',
    defaultMode: 'raw_above',
    defaultWarning: 1,
    defaultCritical: 5,
    note: '오프라인 검사에서 복구 실패한 영구 손상 섹터 수'
  },
  {
    id: 199,
    name: 'UltraDMA CRC Error Count',
    nameKo: 'UDMA CRC 전송 오류',
    defaultMode: 'raw_above',
    defaultWarning: 5,
    defaultCritical: 50,
    note: 'SATA 케이블/포트 신호 무결성 CRC 오류 누적'
  },
  {
    id: 231,
    name: 'SSD Life Left',
    nameKo: 'SSD 잔여 수명 (%)',
    defaultMode: 'normalized_below',
    defaultWarning: 20,
    defaultCritical: 10,
    note: '잔여 수명 점수 하락 기준 경보'
  },
  {
    id: 233,
    name: 'Media Wearout Indicator',
    nameKo: '미디어 마모 지표',
    defaultMode: 'normalized_below',
    defaultWarning: 20,
    defaultCritical: 10,
    note: 'Intel/NVMe/SATA SSD NAND 마모 잔여치'
  }
];

const DEFAULT_RULE_IDS = [1, 5, 197, 198, 187, 199, 10, 194, 231];

export function createDefaultSmartThresholdRules(): CustomSmartThresholdRule[] {
  return DEFAULT_RULE_IDS.map(id => {
    const entry = SMART_ATTRIBUTE_CATALOG.find(c => c.id === id)!;
    return {
      id: `smart-rule-${entry.id}`,
      attributeId: entry.id,
      attributeName: entry.name,
      comparisonMode: entry.defaultMode,
      defaultWarning: entry.defaultWarning,
      defaultCritical: entry.defaultCritical,
      warningThreshold: entry.defaultWarning,
      criticalThreshold: entry.defaultCritical,
      enabled: true,
      isCustomAttribute: false
    };
  });
}

export const DEFAULT_SMART_THRESHOLD_RULES: CustomSmartThresholdRule[] =
  createDefaultSmartThresholdRules();

export function formatHexAttributeId(id: number): string {
  return `${Math.max(0, Math.min(255, Math.round(id)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}h`;
}

export function parseAttributeIdInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed = NaN;
  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    parsed = parseInt(trimmed.slice(2), 16);
  } else if (/^[0-9a-fA-F]+h$/i.test(trimmed)) {
    parsed = parseInt(trimmed.slice(0, -1), 16);
  } else if (/^\d+$/.test(trimmed)) {
    parsed = parseInt(trimmed, 10);
  } else if (/^[0-9a-fA-F]{1,2}$/.test(trimmed) && /[a-fA-F]/.test(trimmed)) {
    parsed = parseInt(trimmed, 16);
  }

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 255) {
    return null;
  }
  return parsed;
}

export function parseSmartAttributeNumericRaw(attr?: DriveSmartAttribute): number | null {
  if (!attr) return null;
  const rawStr = String(attr.raw ?? '').trim();

  if (rawStr) {
    const hexMatch = rawStr.match(/^0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      const parsedHex = parseInt(hexMatch[1], 16);
      if (Number.isFinite(parsedHex)) return parsedHex;
    }

    const headToken = rawStr.split(/[(/:\s°℃]+/)[0]?.replace(/,/g, '') ?? '';
    if (/^-?\d+(\.\d+)?$/.test(headToken)) {
      const parsedDec = Number(headToken);
      if (Number.isFinite(parsedDec)) return Math.max(0, parsedDec);
    }
  }

  if (attr.rawHex) {
    const cleanHex = attr.rawHex.trim().replace(/^0x/i, '');
    if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
      const parsed = parseInt(cleanHex, 16);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

export function validateThresholdPair(
  mode: SmartThresholdComparison,
  warningThreshold: number | null,
  criticalThreshold: number | null
): { valid: boolean; error?: string } {
  if (warningThreshold !== null) {
    if (!Number.isFinite(warningThreshold) || warningThreshold < 0) {
      return { valid: false, error: '주의(Warning) 임계치는 0 이상의 숫자여야 합니다.' };
    }
    if (mode === 'normalized_below' && warningThreshold > 255) {
      return { valid: false, error: '정규화 점수 임계치는 0 ~ 255 범위여야 합니다.' };
    }
  }

  if (criticalThreshold !== null) {
    if (!Number.isFinite(criticalThreshold) || criticalThreshold < 0) {
      return { valid: false, error: '위험(Critical) 임계치는 0 이상의 숫자여야 합니다.' };
    }
    if (mode === 'normalized_below' && criticalThreshold > 255) {
      return { valid: false, error: '정규화 점수 임계치는 0 ~ 255 범위여야 합니다.' };
    }
  }

  if (warningThreshold !== null && criticalThreshold !== null) {
    if (mode === 'raw_above' && criticalThreshold < warningThreshold) {
      return {
        valid: false,
        error: '원시값 증가(≥) 모드에서는 위험(Critical) 임계치가 주의(Warning)보다 크거나 같아야 합니다.'
      };
    }
    if (mode === 'normalized_below' && criticalThreshold > warningThreshold) {
      return {
        valid: false,
        error: '정규화 점수 하락(≤) 모드에서는 위험(Critical) 임계치가 주의(Warning)보다 작거나 같아야 합니다.'
      };
    }
  }

  return { valid: true };
}

export function normalizeCustomSmartThresholdRules(raw: unknown): CustomSmartThresholdRule[] {
  const defaults = createDefaultSmartThresholdRules();
  if (!Array.isArray(raw)) return defaults;

  const byAttrId = new Map<number, CustomSmartThresholdRule>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const attrId = Number(r.attributeId);
    if (!Number.isInteger(attrId) || attrId < 1 || attrId > 255) continue;

    const catalogEntry = SMART_ATTRIBUTE_CATALOG.find(c => c.id === attrId);
    const mode: SmartThresholdComparison =
      r.comparisonMode === 'normalized_below' ? 'normalized_below' : 'raw_above';

    const warn =
      r.warningThreshold === null || r.warningThreshold === undefined || r.warningThreshold === ''
        ? null
        : Number(r.warningThreshold);
    const crit =
      r.criticalThreshold === null || r.criticalThreshold === undefined || r.criticalThreshold === ''
        ? null
        : Number(r.criticalThreshold);

    const safeWarn = warn !== null && Number.isFinite(warn) && warn >= 0 ? warn : null;
    const safeCrit = crit !== null && Number.isFinite(crit) && crit >= 0 ? crit : null;

    const validation = validateThresholdPair(mode, safeWarn, safeCrit);
    const defaultWarning =
      typeof r.defaultWarning === 'number' && Number.isFinite(r.defaultWarning)
        ? r.defaultWarning
        : catalogEntry?.defaultWarning ?? null;
    const defaultCritical =
      typeof r.defaultCritical === 'number' && Number.isFinite(r.defaultCritical)
        ? r.defaultCritical
        : catalogEntry?.defaultCritical ?? null;

    byAttrId.set(attrId, {
      id: typeof r.id === 'string' && r.id.trim() ? r.id : `smart-rule-${attrId}`,
      attributeId: attrId,
      attributeName:
        typeof r.attributeName === 'string' && r.attributeName.trim()
          ? r.attributeName.trim()
          : catalogEntry?.name || `Attribute ${formatHexAttributeId(attrId)}`,
      comparisonMode: mode,
      defaultWarning,
      defaultCritical,
      warningThreshold: validation.valid ? safeWarn : defaultWarning,
      criticalThreshold: validation.valid ? safeCrit : defaultCritical,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      isCustomAttribute:
        typeof r.isCustomAttribute === 'boolean'
          ? r.isCustomAttribute
          : !DEFAULT_RULE_IDS.includes(attrId)
    });
  }

  // Ensure built-in defaults are always present unless explicitly edited; preserve order
  const merged: CustomSmartThresholdRule[] = defaults.map(def => byAttrId.get(def.attributeId) || def);
  byAttrId.forEach((rule, attrId) => {
    if (!DEFAULT_RULE_IDS.includes(attrId)) {
      merged.push(rule);
    }
  });

  return merged;
}

export function loadCustomSmartThresholds(): CustomSmartThresholdRule[] {
  const raw = safeStorage.getItem(CUSTOM_SMART_THRESHOLDS_STORAGE_KEY);
  if (!raw) return createDefaultSmartThresholdRules();
  try {
    return normalizeCustomSmartThresholdRules(JSON.parse(raw));
  } catch {
    return createDefaultSmartThresholdRules();
  }
}

export function saveCustomSmartThresholds(rules: CustomSmartThresholdRule[]): void {
  const normalized = normalizeCustomSmartThresholdRules(rules);
  safeStorage.setItem(CUSTOM_SMART_THRESHOLDS_STORAGE_KEY, JSON.stringify(normalized));
}

export function isRuleModifiedFromDefault(rule: CustomSmartThresholdRule): boolean {
  if (rule.isCustomAttribute) return true;
  const catalogEntry = SMART_ATTRIBUTE_CATALOG.find(c => c.id === rule.attributeId);
  if (!catalogEntry) return true;
  return (
    rule.comparisonMode !== catalogEntry.defaultMode ||
    rule.warningThreshold !== rule.defaultWarning ||
    rule.criticalThreshold !== rule.defaultCritical ||
    !rule.enabled
  );
}

export interface SmartAttributeEvaluationResult {
  severity: 'good' | 'warning' | 'critical';
  isBreached: boolean;
  isFirmwareBreach: boolean;
  isCustomThresholdTrigger: boolean;
  isModifiedRule: boolean;
  reason: string;
  matchedRule?: CustomSmartThresholdRule;
  evaluatedNumericValue: number | null;
}

export function evaluateSmartAttributeThreshold(
  attr: DriveSmartAttribute,
  rules: CustomSmartThresholdRule[]
): SmartAttributeEvaluationResult {
  const rawNumeric = parseSmartAttributeNumericRaw(attr);

  // 1. Hard firmware safety floor (Current <= Vendor Threshold)
  if (attr.threshold > 0 && attr.current > 0 && attr.current <= attr.threshold) {
    const matchedRule = rules.find(r => r.attributeId === attr.id);
    return {
      severity: 'critical',
      isBreached: true,
      isFirmwareBreach: true,
      isCustomThresholdTrigger: false,
      isModifiedRule: matchedRule ? isRuleModifiedFromDefault(matchedRule) : false,
      reason: `현재 정규화 값(${attr.current})이 제조사 안전 임계치(${attr.threshold}) 이하로 떨어져 하드웨어 고장 한계를 초과했습니다.`,
      matchedRule,
      evaluatedNumericValue: attr.current
    };
  }

  // 2. Match enabled custom/configurable rule
  const rule = rules.find(r => r.enabled && r.attributeId === attr.id);
  if (rule && (rule.warningThreshold !== null || rule.criticalThreshold !== null)) {
    const modified = isRuleModifiedFromDefault(rule);
    const val = rule.comparisonMode === 'raw_above' ? rawNumeric : attr.current;

    if (val !== null && Number.isFinite(val)) {
      const critHit =
        rule.criticalThreshold !== null &&
        (rule.comparisonMode === 'raw_above'
          ? val >= rule.criticalThreshold
          : val <= rule.criticalThreshold);

      if (critHit) {
        const opLabel = rule.comparisonMode === 'raw_above' ? '≥' : '≤';
        const metricLabel =
          rule.comparisonMode === 'raw_above' ? `원시값(${val.toLocaleString()})` : `정규화 점수(${val})`;
        return {
          severity: 'critical',
          isBreached: true,
          isFirmwareBreach: false,
          isCustomThresholdTrigger: true,
          isModifiedRule: modified,
          reason: `${metricLabel}이 ${modified ? '사용자 지정 ' : ''}위험 임계치(${opLabel} ${rule.criticalThreshold!.toLocaleString()})에 도달했습니다.`,
          matchedRule: rule,
          evaluatedNumericValue: val
        };
      }

      const warnHit =
        rule.warningThreshold !== null &&
        (rule.comparisonMode === 'raw_above'
          ? val >= rule.warningThreshold
          : val <= rule.warningThreshold);

      if (warnHit) {
        const opLabel = rule.comparisonMode === 'raw_above' ? '≥' : '≤';
        const metricLabel =
          rule.comparisonMode === 'raw_above' ? `원시값(${val.toLocaleString()})` : `정규화 점수(${val})`;
        return {
          severity: 'warning',
          isBreached: true,
          isFirmwareBreach: false,
          isCustomThresholdTrigger: true,
          isModifiedRule: modified,
          reason: `${metricLabel}이 ${modified ? '사용자 지정 ' : ''}주의 임계치(${opLabel} ${rule.warningThreshold!.toLocaleString()})에 도달했습니다.`,
          matchedRule: rule,
          evaluatedNumericValue: val
        };
      }

      // Custom rule active and value is within configured Warning/Critical bounds
      return {
        severity: 'good',
        isBreached: false,
        isFirmwareBreach: false,
        isCustomThresholdTrigger: false,
        isModifiedRule: modified,
        reason: '',
        matchedRule: rule,
        evaluatedNumericValue: val
      };
    }
  }

  // 3. Fallback to firmware-reported status when no active rule matches
  if (attr.status === 'critical') {
    return {
      severity: 'critical',
      isBreached: true,
      isFirmwareBreach: true,
      isCustomThresholdTrigger: false,
      isModifiedRule: false,
      reason: `하드웨어 커널 보고 임계 상태(Critical)입니다 (Raw: ${attr.raw}).`,
      evaluatedNumericValue: rawNumeric
    };
  }

  if (attr.status === 'warning') {
    return {
      severity: 'warning',
      isBreached: false,
      isFirmwareBreach: false,
      isCustomThresholdTrigger: false,
      isModifiedRule: false,
      reason: `주의 관찰 대상 속성입니다 (Raw: ${attr.raw}).`,
      evaluatedNumericValue: rawNumeric
    };
  }

  return {
    severity: 'good',
    isBreached: false,
    isFirmwareBreach: false,
    isCustomThresholdTrigger: false,
    isModifiedRule: false,
    reason: '',
    evaluatedNumericValue: rawNumeric
  };
}
