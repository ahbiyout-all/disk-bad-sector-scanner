/**
 * @file predictiveAnalyticsBridge.ts
 * @brief TypeScript Bridge & Deterministic Parity Engine for DiskSentinelPredictive.dll
 *        Dispatches to Tauri IPC (`DiskSentinelPredictive.dll` Win32 LoadLibraryW / Rust parity)
 *        with exact TypeScript mathematical parity fallback when running outside Tauri desktop.
 * @license Apache-2.0
 */

import { DiskDrive, SectorBlock } from '../types';
import { isTauriDesktopRuntime } from './nativeDriveEngine';

export type PredictiveMediaTypeCode = 0 | 1 | 2 | 3; // 0: HDD, 1: SATA SSD, 2: NVMe SSD, 3: USB Flash

export interface PredictiveEngineStatus {
  dllLoaded: boolean;
  engineSource: 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';
  loadedPath: string | null;
  engineName: string;
  version: string;
  abiVersion: number;
  capabilitiesMask: number;
  selfTestPassed: boolean;
  weibullSelfTestError: number;
  olsSelfTestR2: number;
}

export interface WeibullRulInput {
  mediaType: PredictiveMediaTypeCode;
  powerOnHours: number;
  temperatureCelsius: number;
  percentageUsed: number;
  availableSparePct: number;
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableErrors: number;
  unsafeShutdowns: number;
  avgDailyPowerOnHours: number;
}

export interface WeibullRulReport {
  engineSource: 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';
  weibullShapeBeta: number;
  weibullScaleEtaHours: number;
  failureProb30dPct: number;
  failureProb90dPct: number;
  failureProb365dPct: number;
  hazardRatePer1kHours: number;
  reliabilityIndexPct: number;
  estimatedRulDays: number;
  riskGradeCode: 0 | 1 | 2 | 3 | 4;
  primaryRiskFactor: string;
}

export interface AcousticSampleInput {
  lba: number;
  latencyMs: number;
  statusCode: number; // 0=good, 1=normal, 2=slow, 3=critical, 4=bad
}

export interface AcousticProfileReport {
  engineSource: 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';
  validSampleCount: number;
  consecutiveStepCount: number;
  microStallBurstCount: number;
  strideJumpCount: number;
  acousticGradeCode: 0 | 1 | 2 | 3;
  rmssdJitterMs: number;
  meanStepDeltaMs: number;
  peakStepDeltaMs: number;
  sequentialJitterMs: number;
  randomSeekJitterMs: number;
  resonanceRatio: number;
  acousticInstabilityScore: number;
  diagnosticSummary: string;
}

export interface ThermalWearInput {
  mediaType: PredictiveMediaTypeCode;
  currentTempCelsius: number;
  peakTempCelsius: number;
  warningTempTimeMin: number;
  criticalTempTimeMin: number;
  powerOnHours: number;
  totalTbWritten: number;
  ratedTbwLimitTb: number;
}

export interface ThermalWearReport {
  engineSource: 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';
  arrheniusAccelerationFactor: number;
  sustainedThermalStressFactor: number;
  effectiveAgedHours: number;
  dailyTbwRateGb: number;
  estimatedTbwRemainingYears: number; // -1 if unavailable
  thermalStressScore: number;
  thermalGradeCode: 0 | 1 | 2 | 3 | 4;
  thermalSummary: string;
}

export interface SmartHistoryPointInput {
  timestampSec: number;
  value: number;
}

export interface SmartTrendProjectionReport {
  engineSource: 'native-cpp-dll' | 'rust-parity-fallback' | 'ts-parity';
  validPointCount: number;
  trendDirection: 0 | 1 | 2; // 0=Stable, 1=Degrading, 2=Improving
  isStatisticallySignificant: boolean;
  observationSpanDays: number;
  latestValue: number;
  slopePerDay: number;
  interceptValue: number;
  rSquared: number;
  projectedValue30d: number;
  projectedDaysToWarning: number;  // -1 if not trending toward warning, 0 if already breached
  projectedDaysToCritical: number; // -1 if not trending toward critical, 0 if already breached
}

function clamp(val: number, lo: number, hi: number): number {
  if (!Number.isFinite(val)) return lo;
  return Math.min(hi, Math.max(lo, val));
}

function weibullCondProb(t0Hours: number, deltaHours: number, beta: number, etaHours: number): number {
  if (etaHours <= 1 || deltaHours <= 0 || beta <= 0) return 0;
  const r0 = Math.min(50, t0Hours / etaHours);
  const r1 = Math.min(50, (t0Hours + deltaHours) / etaHours);
  const diff = Math.pow(r0, beta) - Math.pow(r1, beta);
  if (!Number.isFinite(diff)) return 1;
  if (diff >= 0) return 0;
  if (diff < -60) return 1;
  return clamp(1 - Math.exp(diff), 0, 1);
}

export function resolveDriveMediaTypeCode(drive: DiskDrive): PredictiveMediaTypeCode {
  if (drive.type === 'NVMe' || /nvme/i.test(drive.interface || '')) return 2;
  if (drive.type === 'SSD') return 1;
  if (drive.type === 'USB' || drive.isExternal) return 3;
  return 0;
}

function parseSmartRawInt(rawValue: string | undefined): number {
  if (!rawValue) return 0;
  const firstToken = String(rawValue).split(/[\s(/,:]+/)[0]?.replace(/,/g, '');
  const parsed = Number(firstToken ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function extractWeibullInputFromDrive(drive: DiskDrive): WeibullRulInput | null {
  const specs = drive.hardwareSpecs;
  const effectivePoh = drive.powerOnHours ?? specs?.powerOnHours ?? null;
  const hasTelemetry =
    effectivePoh !== null ||
    drive.smartAttributes.length > 0 ||
    specs?.nvmeLogAvailable === true ||
    specs?.percentageUsed !== null && specs?.percentageUsed !== undefined;

  if (!hasTelemetry) {
    return null;
  }

  let reallocated = 0;
  let pending = 0;
  let uncorrectable = 0;
  let smartUnsafeShutdowns = 0;

  for (const attr of drive.smartAttributes) {
    const val = parseSmartRawInt(attr.raw);
    if (attr.id === 0x05) reallocated += val;
    else if (attr.id === 0xc5) pending += val;
    else if (attr.id === 0xbb || attr.id === 0xc6) uncorrectable += val;
    else if (attr.id === 0xc0) smartUnsafeShutdowns = Math.max(smartUnsafeShutdowns, val);
  }

  if (specs?.mediaErrors !== null && specs?.mediaErrors !== undefined) {
    uncorrectable = Math.max(uncorrectable, specs.mediaErrors);
  }

  const effectiveTemp = drive.temperatureC ?? specs?.currentTempC ?? 0;

  return {
    mediaType: resolveDriveMediaTypeCode(drive),
    powerOnHours: Math.max(0, Math.round(effectivePoh ?? 0)),
    temperatureCelsius: effectiveTemp > 0 && effectiveTemp < 150 ? Math.round(effectiveTemp) : 0,
    percentageUsed: Math.max(0, Math.round(specs?.percentageUsed ?? 0)),
    availableSparePct: Math.max(0, Math.round(specs?.availableSparePercent ?? 100)),
    reallocatedSectors: Math.max(0, Math.round(reallocated)),
    pendingSectors: Math.max(0, Math.round(pending)),
    uncorrectableErrors: Math.max(0, Math.round(uncorrectable)),
    unsafeShutdowns: Math.max(0, Math.round(specs?.unsafeShutdowns ?? smartUnsafeShutdowns)),
    avgDailyPowerOnHours: 8.0
  };
}

export function extractThermalWearInputFromDrive(drive: DiskDrive): ThermalWearInput | null {
  const specs = drive.hardwareSpecs;
  const effectiveTemp = drive.temperatureC ?? specs?.currentTempC ?? null;
  const effectivePoh = drive.powerOnHours ?? specs?.powerOnHours ?? null;

  if (effectiveTemp === null || effectiveTemp <= 0 || effectiveTemp >= 150) {
    return null;
  }
  const curTemp = effectiveTemp;
  const peakTemp =
    specs?.maxTempRecordedC !== null && specs?.maxTempRecordedC !== undefined && specs.maxTempRecordedC > 0
      ? Math.max(curTemp, specs.maxTempRecordedC)
      : curTemp;
  const mediaType = resolveDriveMediaTypeCode(drive);
  const totalTbw = specs?.hostWritesTb ?? 0;
  const pctUsed = specs?.percentageUsed ?? 0;
  const ratedTbw =
    totalTbw > 0 && pctUsed >= 5
      ? Number(((totalTbw / pctUsed) * 100).toFixed(1))
      : 0;

  return {
    mediaType,
    currentTempCelsius: Math.max(0, Math.round(curTemp)),
    peakTempCelsius: Math.max(0, Math.round(peakTemp)),
    warningTempTimeMin: 0,
    criticalTempTimeMin: 0,
    powerOnHours: Math.max(0, Math.round(effectivePoh ?? 0)),
    totalTbWritten: Math.max(0, totalTbw),
    ratedTbwLimitTb: ratedTbw
  };
}

export function computeWeibullRul(input: WeibullRulInput): WeibullRulReport {
  const [baseEta, baseBeta] =
    input.mediaType === 2
      ? [75000, 1.25]
      : input.mediaType === 1
      ? [65000, 1.30]
      : input.mediaType === 3
      ? [25000, 1.45]
      : [50000, 1.40];

  const t0 = Math.max(0, input.powerOnHours);
  const avgDaily =
    Number.isFinite(input.avgDailyPowerOnHours) && input.avgDailyPowerOnHours > 0.25
      ? clamp(input.avgDailyPowerOnHours, 0.25, 24)
      : 8.0;

  let defectSeverity = 0;
  let maxWeight = 0;
  let primaryRiskFactor = 'Nominal Aging Baseline';

  if (input.pendingSectors > 0) {
    const w = 0.45 * Math.log1p(input.pendingSectors) + 0.06 * input.pendingSectors;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Pending Unstable Sectors (0xC5)';
    }
  }
  if (input.uncorrectableErrors > 0) {
    const w = 0.40 * Math.log1p(input.uncorrectableErrors) + 0.05 * input.uncorrectableErrors;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Uncorrectable Media Errors (0xBB/0xC6)';
    }
  }
  if (input.reallocatedSectors > 0) {
    const w = 0.28 * Math.log1p(input.reallocatedSectors) + 0.015 * input.reallocatedSectors;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Reallocated Spare Sectors (0x05)';
    }
  }
  const usedClamped = clamp(input.percentageUsed, 0, 200);
  if (usedClamped >= 70) {
    const w = (usedClamped - 65) * 0.025;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Flash Wear-Out Depletion (% Used)';
    }
  }
  if (
    (input.availableSparePct > 0 && input.availableSparePct < 40) ||
    (input.availableSparePct === 0 && (usedClamped >= 80 || input.uncorrectableErrors > 0))
  ) {
    const w = (40 - input.availableSparePct) * 0.04;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Low Available Spare Blocks';
    }
  }
  if (input.temperatureCelsius > 45 && input.temperatureCelsius < 150) {
    const w = (input.temperatureCelsius - 45) * 0.035;
    defectSeverity += w;
    if (w > maxWeight) {
      maxWeight = w;
      primaryRiskFactor = 'Elevated Operating Temperature Stress';
    }
  }
  if (input.unsafeShutdowns > 50) {
    defectSeverity += 0.08 * Math.log1p(input.unsafeShutdowns - 50);
  }

  const eta = Math.max(720, baseEta * Math.exp(-clamp(defectSeverity * 0.42, 0, 4.5)));
  const beta = clamp(baseBeta + defectSeverity * 0.35 + usedClamped * 0.005, 1.05, 3.8);

  const p30 = weibullCondProb(t0, 30 * avgDaily, beta, eta);
  const p90 = weibullCondProb(t0, 90 * avgDaily, beta, eta);
  const p365 = weibullCondProb(t0, 365 * avgDaily, beta, eta);

  const safeRatio = Math.min(20, t0 > 1 ? t0 / eta : 1 / eta);
  const hazardRatePer1kHours = clamp((beta / eta) * Math.pow(safeRatio, beta - 1) * 1000, 0, 1000);

  const baseCum = Math.pow(clamp(t0 / eta, 0, 50), beta);
  const targetTotal = eta * Math.pow(baseCum + Math.LN2, 1 / beta);
  const remHours = Math.max(0, targetTotal - t0);
  const estimatedRulDays = Math.round(clamp(remHours / avgDaily, 0, 3650));

  const reliabilityIndexPct = clamp((1 - p90) * 100 - clamp(defectSeverity * 12, 0, 65), 0, 100);

  let riskGradeCode: 0 | 1 | 2 | 3 | 4 = 0;
  if (p30 >= 0.25 || reliabilityIndexPct < 35 || estimatedRulDays <= 30) {
    riskGradeCode = 4;
  } else if (p90 >= 0.22 || reliabilityIndexPct < 60 || estimatedRulDays <= 120) {
    riskGradeCode = 3;
  } else if (p365 >= 0.25 || reliabilityIndexPct < 80 || defectSeverity > 0.35) {
    riskGradeCode = 2;
  } else if (reliabilityIndexPct < 93 || defectSeverity > 0.05) {
    riskGradeCode = 1;
  }

  return {
    engineSource: 'ts-parity',
    weibullShapeBeta: beta,
    weibullScaleEtaHours: eta,
    failureProb30dPct: p30 * 100,
    failureProb90dPct: p90 * 100,
    failureProb365dPct: p365 * 100,
    hazardRatePer1kHours,
    reliabilityIndexPct,
    estimatedRulDays,
    riskGradeCode,
    primaryRiskFactor
  };
}

export function analyzeAcousticSeekProfile(
  samples: AcousticSampleInput[],
  mediaType: PredictiveMediaTypeCode
): AcousticProfileReport {
  if (samples.length === 0) {
    return {
      engineSource: 'ts-parity',
      validSampleCount: 0,
      consecutiveStepCount: 0,
      microStallBurstCount: 0,
      strideJumpCount: 0,
      acousticGradeCode: 0,
      rmssdJitterMs: 0,
      meanStepDeltaMs: 0,
      peakStepDeltaMs: 0,
      sequentialJitterMs: 0,
      randomSeekJitterMs: 0,
      resonanceRatio: 0,
      acousticInstabilityScore: 0,
      diagnosticSummary: 'No sector latency samples available'
    };
  }

  const validLat: number[] = [];
  let badCount = 0;
  for (const s of samples) {
    if (s.statusCode >= 4 || !Number.isFinite(s.latencyMs) || s.latencyMs < 0) {
      badCount += 1;
    } else {
      validLat.push(s.latencyMs);
    }
  }

  if (validLat.length === 0) {
    return {
      engineSource: 'ts-parity',
      validSampleCount: 0,
      consecutiveStepCount: 0,
      microStallBurstCount: 0,
      strideJumpCount: 0,
      acousticGradeCode: badCount > 0 ? 3 : 0,
      rmssdJitterMs: 0,
      meanStepDeltaMs: 0,
      peakStepDeltaMs: 0,
      sequentialJitterMs: 0,
      randomSeekJitterMs: 0,
      resonanceRatio: 0,
      acousticInstabilityScore: badCount > 0 ? 95 : 0,
      diagnosticSummary:
        badCount > 0 ? 'All sampled blocks failed I/O (severe media fault)' : 'No valid latency readings'
    };
  }

  validLat.sort((a, b) => a - b);
  const medianMs = validLat[Math.floor(validLat.length / 2)];
  const isSolidState = mediaType === 1 || mediaType === 2;
  const stallThreshold = Math.max(medianMs * 3.0, isSolidState ? 15.0 : 35.0);

  let sumSqAll = 0;
  let sumAbsAll = 0;
  let peakDelta = 0;
  let sumSqSeq = 0;
  let sumSqRand = 0;
  let stepCount = 0;
  let seqCount = 0;
  let randCount = 0;
  let strideJumps = 0;
  let microStallBursts = 0;
  let currentStallRun = 0;

  let hasPrev = false;
  let prevLba = 0;
  let prevLat = 0;

  for (const s of samples) {
    if (s.statusCode >= 4 || !Number.isFinite(s.latencyMs) || s.latencyMs < 0) {
      if (currentStallRun >= 2) microStallBursts += 1;
      currentStallRun = 0;
      hasPrev = false;
      continue;
    }

    if (s.latencyMs >= stallThreshold) {
      currentStallRun += 1;
    } else {
      if (currentStallRun >= 2) microStallBursts += 1;
      currentStallRun = 0;
    }

    if (hasPrev) {
      const delta = Math.abs(s.latencyMs - prevLat);
      sumAbsAll += delta;
      sumSqAll += delta * delta;
      if (delta > peakDelta) peakDelta = delta;
      stepCount += 1;

      if (s.lba > prevLba && s.lba - prevLba <= 131072) {
        sumSqSeq += delta * delta;
        seqCount += 1;
      } else {
        sumSqRand += delta * delta;
        randCount += 1;
        strideJumps += 1;
      }
    }

    prevLba = s.lba;
    prevLat = s.latencyMs;
    hasPrev = true;
  }
  if (currentStallRun >= 2) microStallBursts += 1;

  const rmssdJitterMs = stepCount > 0 ? Math.sqrt(sumSqAll / stepCount) : 0;
  const meanStepDeltaMs = stepCount > 0 ? sumAbsAll / stepCount : 0;
  const sequentialJitterMs = seqCount > 0 ? Math.sqrt(sumSqSeq / seqCount) : rmssdJitterMs;
  const randomSeekJitterMs = randCount > 0 ? Math.sqrt(sumSqRand / randCount) : sequentialJitterMs;

  let resonanceRatio =
    randCount > 0
      ? randomSeekJitterMs / Math.max(0.25, sequentialJitterMs)
      : peakDelta / Math.max(0.25, medianMs);
  if (!Number.isFinite(resonanceRatio)) resonanceRatio = 1.0;

  const refJitter = isSolidState ? 6.0 : 18.0;
  const score = clamp(
    clamp((rmssdJitterMs / refJitter) * 42.0, 0, 55) +
      clamp(microStallBursts * 8.5, 0, 30) +
      clamp((peakDelta / (refJitter * 5.0)) * 15.0, 0, 15),
    0,
    100
  );

  let acousticGradeCode: 0 | 1 | 2 | 3 = 0;
  let diagnosticSummary = isSolidState
    ? 'Low NAND latency variance (FTL stable)'
    : 'Quiet sequential seek track profile';

  if (score >= 70) {
    acousticGradeCode = 3;
    diagnosticSummary = isSolidState
      ? 'Severe FTL GC/die-stall spikes detected'
      : 'Severe actuator seek settling oscillation detected';
  } else if (score >= 42) {
    acousticGradeCode = 2;
    diagnosticSummary = isSolidState
      ? 'Elevated NAND write-amplification / GC latency jitter'
      : 'Moderate mechanical seek-jitter / track retry resonance';
  } else if (score >= 18) {
    acousticGradeCode = 1;
    diagnosticSummary = isSolidState
      ? 'Mild controller queue jitter within normal tolerance'
      : 'Minor rotational seek step variance';
  }

  return {
    engineSource: 'ts-parity',
    validSampleCount: validLat.length,
    consecutiveStepCount: stepCount,
    microStallBurstCount: microStallBursts,
    strideJumpCount: strideJumps,
    acousticGradeCode,
    rmssdJitterMs,
    meanStepDeltaMs,
    peakStepDeltaMs: peakDelta,
    sequentialJitterMs,
    randomSeekJitterMs,
    resonanceRatio,
    acousticInstabilityScore: score,
    diagnosticSummary
  };
}

export function evaluateThermalWearStress(input: ThermalWearInput): ThermalWearReport {
  const eaOverKb = 8123.166;
  const tRefK = 35.0 + 273.15;
  const curC =
    input.currentTempCelsius > 0 && input.currentTempCelsius < 150 ? input.currentTempCelsius : 35.0;
  const tOpK = curC + 273.15;
  const af = Math.exp(clamp(eaOverKb * (1 / tRefK - 1 / tOpK), -5, 5));

  const totalMin = input.powerOnHours > 0 ? input.powerOnHours * 60 : 60;
  const warnRatio = clamp(input.warningTempTimeMin / totalMin, 0, 1);
  const critRatio = clamp(input.criticalTempTimeMin / totalMin, 0, 1);
  const excursionBoost = 1 + warnRatio * 1.4 + critRatio * 3.8;
  const sustainedFactor = clamp((0.65 * af + 0.35) * excursionBoost, 0.3, 12.0);
  const effectiveAgedHours = input.powerOnHours * sustainedFactor;

  let dailyTbwRateGb = 0;
  let estimatedTbwRemainingYears = -1;
  if (input.powerOnHours > 0 && Number.isFinite(input.totalTbWritten) && input.totalTbWritten > 0) {
    const daysActive = Math.max(0.05, input.powerOnHours / 24);
    dailyTbwRateGb = (input.totalTbWritten * 1000) / daysActive;
    if (Number.isFinite(input.ratedTbwLimitTb) && input.ratedTbwLimitTb > 0) {
      const remTb = input.ratedTbwLimitTb - input.totalTbWritten;
      if (remTb <= 0) {
        estimatedTbwRemainingYears = 0;
      } else if (dailyTbwRateGb > 0.001) {
        estimatedTbwRemainingYears = clamp((remTb * 1000) / dailyTbwRateGb / 365.25, 0, 99);
      }
    }
  }

  const wearPressure =
    Number.isFinite(input.ratedTbwLimitTb) &&
    input.ratedTbwLimitTb > 0 &&
    Number.isFinite(input.totalTbWritten) &&
    input.totalTbWritten > 0
      ? clamp((input.totalTbWritten / input.ratedTbwLimitTb) * 35, 0, 35)
      : 0;
  const thermalComp = clamp((sustainedFactor - 1) * 18 + (curC > 45 ? (curC - 45) * 1.8 : 0), 0, 65);
  const thermalStressScore = clamp(thermalComp + wearPressure, 0, 100);

  let thermalGradeCode: 0 | 1 | 2 | 3 | 4 = 0;
  let thermalSummary = 'Optimal thermal headroom (Arrhenius AF ~ 1.0x)';
  if (curC >= 65 || input.criticalTempTimeMin >= 15 || thermalStressScore >= 75) {
    thermalGradeCode = 4;
    thermalSummary = 'Critical thermal acceleration or TBW endurance saturation';
  } else if (curC >= 55 || input.warningTempTimeMin >= 60 || thermalStressScore >= 50) {
    thermalGradeCode = 3;
    thermalSummary = 'High sustained thermal stress accelerating cell/lubricant aging';
  } else if (curC >= 46 || thermalStressScore >= 25) {
    thermalGradeCode = 2;
    thermalSummary = 'Moderate thermal load; verify chassis airflow under sustained I/O';
  } else if (thermalStressScore >= 10) {
    thermalGradeCode = 1;
    thermalSummary = 'Acceptable thermal aging factor';
  }

  return {
    engineSource: 'ts-parity',
    arrheniusAccelerationFactor: af,
    sustainedThermalStressFactor: sustainedFactor,
    effectiveAgedHours,
    dailyTbwRateGb,
    estimatedTbwRemainingYears,
    thermalStressScore,
    thermalGradeCode,
    thermalSummary
  };
}

export function projectSmartDegradationTrend(
  points: SmartHistoryPointInput[],
  warningThreshold: number,
  criticalThreshold: number,
  lowerIsWorse: boolean
): SmartTrendProjectionReport {
  const finitePts = points.filter(p => Number.isFinite(p.timestampSec) && Number.isFinite(p.value));
  if (finitePts.length === 0) {
    return {
      engineSource: 'ts-parity',
      validPointCount: 0,
      trendDirection: 0,
      isStatisticallySignificant: false,
      observationSpanDays: 0,
      latestValue: 0,
      slopePerDay: 0,
      interceptValue: 0,
      rSquared: 0,
      projectedValue30d: 0,
      projectedDaysToWarning: -1,
      projectedDaysToCritical: -1
    };
  }

  let minTs = finitePts[0].timestampSec;
  let maxTs = finitePts[0].timestampSec;
  let latestTs = finitePts[0].timestampSec;
  let latestValue = finitePts[0].value;
  for (const p of finitePts) {
    if (p.timestampSec < minTs) minTs = p.timestampSec;
    if (p.timestampSec > maxTs) maxTs = p.timestampSec;
    if (p.timestampSec >= latestTs) {
      latestTs = p.timestampSec;
      latestValue = p.value;
    }
  }

  const observationSpanDays = Math.max(0, (maxTs - minTs) / 86400);
  if (finitePts.length < 2 || maxTs === minTs) {
    return {
      engineSource: 'ts-parity',
      validPointCount: finitePts.length,
      trendDirection: 0,
      isStatisticallySignificant: false,
      observationSpanDays,
      latestValue,
      slopePerDay: 0,
      interceptValue: latestValue,
      rSquared: 0,
      projectedValue30d: latestValue,
      projectedDaysToWarning: -1,
      projectedDaysToCritical: -1
    };
  }

  let meanX = 0;
  let meanY = 0;
  for (const p of finitePts) {
    meanX += (p.timestampSec - minTs) / 86400;
    meanY += p.value;
  }
  meanX /= finitePts.length;
  meanY /= finitePts.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of finitePts) {
    const dx = (p.timestampSec - minTs) / 86400 - meanX;
    const dy = p.value - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const slopePerDay = sxx > 1e-12 ? sxy / sxx : 0;
  const interceptValue = meanY - slopePerDay * meanX;
  const rSquared = sxx > 1e-12 && syy > 1e-12 ? clamp((sxy * sxy) / (sxx * syy), 0, 1) : 0;
  const projectedValue30d = latestValue + slopePerDay * 30;

  const eps = 1e-6;
  let trendDirection: 0 | 1 | 2 = 0;
  if (lowerIsWorse) {
    if (slopePerDay < -eps) trendDirection = 1;
    else if (slopePerDay > eps) trendDirection = 2;
  } else {
    if (slopePerDay > eps) trendDirection = 1;
    else if (slopePerDay < -eps) trendDirection = 2;
  }

  const computeDaysTo = (threshold: number): number => {
    if (!Number.isFinite(threshold) || threshold < 0) return -1;
    if (lowerIsWorse) {
      if (latestValue <= threshold) return 0;
      if (slopePerDay >= -eps) return -1;
      return Math.min(36500, (latestValue - threshold) / -slopePerDay);
    }
    if (latestValue >= threshold) return 0;
    if (slopePerDay <= eps) return -1;
    return Math.min(36500, (threshold - latestValue) / slopePerDay);
  };

  return {
    engineSource: 'ts-parity',
    validPointCount: finitePts.length,
    trendDirection,
    isStatisticallySignificant: finitePts.length >= 3 && rSquared >= 0.35 && Math.abs(slopePerDay) > eps,
    observationSpanDays,
    latestValue,
    slopePerDay,
    interceptValue,
    rSquared,
    projectedValue30d,
    projectedDaysToWarning: computeDaysTo(warningThreshold),
    projectedDaysToCritical: computeDaysTo(criticalThreshold)
  };
}

export async function queryPredictiveEngineStatus(): Promise<PredictiveEngineStatus | null> {
  if (!isTauriDesktopRuntime()) {
    return null;
  }
  try {
    const invoke = (window as any).__TAURI__.core.invoke;
    return (await invoke('inspect_predictive_dll_status')) as PredictiveEngineStatus;
  } catch {
    return null;
  }
}

export async function runPredictiveWeibullRul(input: WeibullRulInput): Promise<WeibullRulReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('compute_predictive_weibull_rul', { input })) as WeibullRulReport;
    } catch {
      // Fallback to TypeScript mathematical parity
    }
  }
  return computeWeibullRul(input);
}

export async function runAcousticSeekAnalysis(
  blocks: SectorBlock[],
  drive: DiskDrive
): Promise<AcousticProfileReport | null> {
  const scannedSorted = blocks
    .filter(b => b.status !== 'unscanned')
    .sort((a, b) => a.id - b.id);

  if (scannedSorted.length < 2) {
    return null;
  }

  const samples: AcousticSampleInput[] = scannedSorted.map(b => ({
    lba: b.lba,
    latencyMs: Number.isFinite(b.responseTimeMs) ? b.responseTimeMs : -1,
    statusCode:
      b.status === 'bad'
        ? 4
        : b.status === 'critical'
        ? 3
        : b.status === 'slow'
        ? 2
        : b.status === 'normal'
        ? 1
        : 0
  }));

  const mediaType = resolveDriveMediaTypeCode(drive);
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('analyze_acoustic_seek_profile', {
        samples,
        mediaType
      })) as AcousticProfileReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return analyzeAcousticSeekProfile(samples, mediaType);
}

export async function runThermalWearEvaluation(input: ThermalWearInput): Promise<ThermalWearReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('evaluate_thermal_wear_stress', { input })) as ThermalWearReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return evaluateThermalWearStress(input);
}

export async function runSmartTrendProjection(
  points: SmartHistoryPointInput[],
  warningThreshold: number,
  criticalThreshold: number,
  lowerIsWorse: boolean
): Promise<SmartTrendProjectionReport> {
  if (isTauriDesktopRuntime()) {
    try {
      const invoke = (window as any).__TAURI__.core.invoke;
      return (await invoke('project_smart_degradation_trend', {
        points,
        warningThreshold,
        criticalThreshold,
        lowerIsWorse
      })) as SmartTrendProjectionReport;
    } catch {
      // Fallback to TypeScript parity
    }
  }
  return projectSmartDegradationTrend(points, warningThreshold, criticalThreshold, lowerIsWorse);
}
