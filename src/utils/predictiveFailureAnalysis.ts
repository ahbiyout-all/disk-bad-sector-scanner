import * as d3 from 'd3';
import { SectorBlock } from '../types';

export interface PredictiveFailureOptions {
  latencyThresholdMs?: number;
  minContiguousCount?: number;
  scanMode?: 'quick' | 'full';
}

export interface ContiguousDegradationZone {
  /** Deterministic key for the start of a contiguous physical degradation run */
  warningKey: string;
  startBlockId: number;
  endBlockId: number;
  startLba: number;
  endLba: number;
  /** Number of threshold-exceeding scanned blocks in this contiguous range */
  blockCount: number;
  /** Physical block index span from startBlockId to endBlockId inclusive */
  physicalSpanBlocks: number;
  meanLatencyMs: number;
  maxLatencyMs: number;
  meanZScore: number;
  maxZScore: number;
  hasBadSector: boolean;
  firstBlock: SectorBlock;
}

export interface ZScoreBandSummary {
  normalWithin1Sigma: number;
  elevated1To2Sigma: number;
  warning2To3Sigma: number;
  outlierAbove3Sigma: number;
}

export interface PredictiveFailureReport {
  sampleCount: number;
  validLatencyCount: number;
  meanMs: number | null;
  stdDevMs: number;
  maxZScore: number | null;
  meanSlowZScore: number | null;
  elevatedZCount: number; // Z >= 2.0
  outlierZCount: number;  // Z >= 3.0
  zScoreByBlockId: Record<number, number>;
  zBands: ZScoreBandSummary;
  contiguousZones: ContiguousDegradationZone[];
  longestContiguousRun: number;
  degradationRiskScore: number; // 0 - 100
  riskLevel: 'idle' | 'nominal' | 'elevated' | 'high' | 'critical';
  shouldWarnDegradation: boolean;
}

/**
 * Predictive Failure Analysis (Z-Score & Contiguous Physical Range Detector)
 *
 * 1. Calculates per-sector latency Z-scores: Z_i = (x_i - mu) / sigma
 *    across all scanned valid-latency blocks.
 * 2. Scans sectors in ascending physical LBA / block ID order to detect
 *    contiguous physical ranges consistently exceeding the latency threshold (default 100ms).
 *    Quick scans sample every 4th block, so block index deltas <= 4 are treated as contiguous
 *    while Full scans enforce strict adjacent block deltas <= 1.
 */
export function analyzePredictiveFailure(
  blocks: SectorBlock[],
  options: PredictiveFailureOptions = {}
): PredictiveFailureReport {
  const latencyThresholdMs = options.latencyThresholdMs ?? 100;
  const minContiguousCount = options.minContiguousCount ?? 3;
  const scanMode = options.scanMode ?? 'full';
  const maxBlockIdGap = scanMode === 'quick' ? 4 : 1;

  const scannedSorted = blocks
    .filter(b => b.status !== 'unscanned')
    .sort((a, b) => a.id - b.id);

  if (scannedSorted.length === 0) {
    return {
      sampleCount: 0,
      validLatencyCount: 0,
      meanMs: null,
      stdDevMs: 0,
      maxZScore: null,
      meanSlowZScore: null,
      elevatedZCount: 0,
      outlierZCount: 0,
      zScoreByBlockId: {},
      zBands: {
        normalWithin1Sigma: 0,
        elevated1To2Sigma: 0,
        warning2To3Sigma: 0,
        outlierAbove3Sigma: 0
      },
      contiguousZones: [],
      longestContiguousRun: 0,
      degradationRiskScore: 0,
      riskLevel: 'idle',
      shouldWarnDegradation: false
    };
  }

  const validBlocks = scannedSorted.filter(
    b => b.status !== 'bad' && Number.isFinite(b.responseTimeMs) && b.responseTimeMs >= 0
  );
  const latencies = validBlocks.map(b => b.responseTimeMs);

  const meanMs = latencies.length > 0 ? (d3.mean(latencies) ?? null) : null;
  const rawStdDev = latencies.length > 1 ? (d3.deviation(latencies) ?? 0) : 0;
  const stdDevMs = Number.isFinite(rawStdDev) ? rawStdDev : 0;

  const zScoreByBlockId: Record<number, number> = {};
  const zBands: ZScoreBandSummary = {
    normalWithin1Sigma: 0,
    elevated1To2Sigma: 0,
    warning2To3Sigma: 0,
    outlierAbove3Sigma: 0
  };

  let maxZScore: number | null = null;
  let elevatedZCount = 0;
  let outlierZCount = 0;
  const overThresholdZScores: number[] = [];

  if (meanMs !== null) {
    for (const block of validBlocks) {
      let z = 0;
      if (stdDevMs > 1e-6) {
        z = (block.responseTimeMs - meanMs) / stdDevMs;
      } else if (block.responseTimeMs >= latencyThresholdMs && block.responseTimeMs > meanMs) {
        // Zero-variance edge case where every observed sample sits at the identical slow value
        z = 2.0;
      }

      zScoreByBlockId[block.id] = z;

      if (maxZScore === null || z > maxZScore) {
        maxZScore = z;
      }

      if (z <= 1) {
        zBands.normalWithin1Sigma += 1;
      } else if (z <= 2) {
        zBands.elevated1To2Sigma += 1;
      } else if (z <= 3) {
        zBands.warning2To3Sigma += 1;
        elevatedZCount += 1;
      } else {
        zBands.outlierAbove3Sigma += 1;
        elevatedZCount += 1;
        outlierZCount += 1;
      }

      if (block.responseTimeMs >= latencyThresholdMs) {
        overThresholdZScores.push(z);
      }
    }
  }

  // Detect contiguous physical ranges consistently exceeding latencyThresholdMs
  const contiguousZones: ContiguousDegradationZone[] = [];
  let currentRun: SectorBlock[] = [];

  const finalizeRun = () => {
    if (currentRun.length < minContiguousCount) {
      currentRun = [];
      return;
    }

    const firstBlock = currentRun[0];
    const lastBlock = currentRun[currentRun.length - 1];
    const validInRun = currentRun.filter(
      b => b.status !== 'bad' && Number.isFinite(b.responseTimeMs) && b.responseTimeMs >= 0
    );
    const hasBadSector = currentRun.some(b => b.status === 'bad' || b.responseTimeMs < 0);

    const runLatencies = validInRun.map(b => b.responseTimeMs);
    const meanLatencyMs =
      runLatencies.length > 0
        ? (d3.mean(runLatencies) ?? latencyThresholdMs)
        : latencyThresholdMs;
    const maxLatencyMs =
      runLatencies.length > 0
        ? (d3.max(runLatencies) ?? latencyThresholdMs)
        : latencyThresholdMs;

    const runZScores = validInRun
      .map(b => zScoreByBlockId[b.id])
      .filter((z): z is number => typeof z === 'number' && Number.isFinite(z));

    const fallbackZ = Math.max(2.0, maxZScore ?? 2.0);
    const zoneMeanZ = runZScores.length > 0 ? (d3.mean(runZScores) ?? fallbackZ) : fallbackZ;
    const zoneMaxZ = runZScores.length > 0 ? (d3.max(runZScores) ?? fallbackZ) : fallbackZ;

    contiguousZones.push({
      warningKey: `contig-${firstBlock.id}`,
      startBlockId: firstBlock.id,
      endBlockId: lastBlock.id,
      startLba: firstBlock.lba,
      endLba: lastBlock.endLba || lastBlock.lba,
      blockCount: currentRun.length,
      physicalSpanBlocks: lastBlock.id - firstBlock.id + 1,
      meanLatencyMs,
      maxLatencyMs,
      meanZScore: zoneMeanZ,
      maxZScore: zoneMaxZ,
      hasBadSector,
      firstBlock
    });

    currentRun = [];
  };

  for (const block of scannedSorted) {
    const exceedsThreshold =
      block.status === 'bad' ||
      (Number.isFinite(block.responseTimeMs) && block.responseTimeMs >= latencyThresholdMs);

    if (!exceedsThreshold) {
      finalizeRun();
      continue;
    }

    if (currentRun.length === 0) {
      currentRun.push(block);
      continue;
    }

    const prev = currentRun[currentRun.length - 1];
    if (block.id - prev.id <= maxBlockIdGap) {
      currentRun.push(block);
    } else {
      finalizeRun();
      currentRun.push(block);
    }
  }
  finalizeRun();

  const longestContiguousRun =
    contiguousZones.length > 0
      ? Math.max(...contiguousZones.map(z => z.blockCount))
      : 0;

  const meanSlowZScore =
    overThresholdZScores.length > 0 ? (d3.mean(overThresholdZScores) ?? null) : null;

  // Risk score synthesis combining Z-score outliers + contiguous physical range severity
  const zPeakComponent = maxZScore !== null ? Math.min(35, Math.max(0, maxZScore * 8)) : 0;
  const outlierRate = validBlocks.length > 0 ? (elevatedZCount / validBlocks.length) * 100 : 0;
  const outlierComponent = Math.min(25, outlierRate * 4);
  const contiguousComponent =
    contiguousZones.length > 0
      ? Math.min(40, 22 + contiguousZones.length * 6 + Math.max(0, longestContiguousRun - minContiguousCount) * 3)
      : 0;

  const degradationRiskScore = Math.round(
    Math.min(100, zPeakComponent + outlierComponent + contiguousComponent)
  );

  let riskLevel: PredictiveFailureReport['riskLevel'] = 'nominal';
  if (contiguousZones.some(z => z.hasBadSector || z.blockCount >= 5) || degradationRiskScore >= 75) {
    riskLevel = 'critical';
  } else if (contiguousZones.length > 0 || degradationRiskScore >= 50) {
    riskLevel = 'high';
  } else if (elevatedZCount > 0 || overThresholdZScores.length > 0 || degradationRiskScore >= 25) {
    riskLevel = 'elevated';
  }

  return {
    sampleCount: scannedSorted.length,
    validLatencyCount: validBlocks.length,
    meanMs,
    stdDevMs,
    maxZScore,
    meanSlowZScore,
    elevatedZCount,
    outlierZCount,
    zScoreByBlockId,
    zBands,
    contiguousZones,
    longestContiguousRun,
    degradationRiskScore,
    riskLevel,
    shouldWarnDegradation: contiguousZones.length > 0
  };
}
