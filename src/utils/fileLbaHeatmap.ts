import { ErrorLogItem, LbaAffectedFileRecord, LbaFileExtent, SectorBlock } from '../types';

export type HeatmapSeverity =
  | 'gap'
  | 'unscanned'
  | 'healthy'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export interface IndexedExtent {
  extentIndex: number;
  extent: LbaFileExtent;
}

export interface FileLbaZoneGroup {
  groupIndex: number;
  startLba: number;
  endLba: number;
  spanSectors: number;
  allocatedSectors: number;
  gapSectorsFromPrev: number;
  extents: IndexedExtent[];
  containsTargetLba: boolean;
  scanned: boolean;
  badCount: number;
  criticalCount: number;
  slowCount: number;
  badDensityPct: number;
  severity: Exclude<HeatmapSeverity, 'gap'>;
}

export interface LbaHeatmapCell {
  cellIndex: number;
  startLba: number;
  endLba: number;
  sectorCount: number;
  occupiesFileExtent: boolean;
  overlappingExtentIndices: number[];
  containsTargetLba: boolean;
  scanned: boolean;
  badCount: number;
  criticalCount: number;
  slowCount: number;
  badDensityPct: number;
  severity: HeatmapSeverity;
}

export interface FileLbaHeatmapSummary {
  globalStartLba: number;
  globalEndLba: number;
  totalSpanSectors: number;
  allocatedSectors: number;
  fragmentCount: number;
  isResidentFallbackSpan: boolean;
  groups: FileLbaZoneGroup[];
  cells: LbaHeatmapCell[];
  totalBadHits: number;
  totalCriticalHits: number;
  totalSlowHits: number;
  overallBadDensityPct: number;
  scannedCoveragePct: number;
  hottestGroupIndex: number | null;
}

export interface HeatmapSearchIndex {
  sortedBlocks: SectorBlock[];
  prefixMaxEndLba: number[];
  sortedBadLbas: number[];
  sortedCriticalLbas: number[];
  sortedSlowLbas: number[];
}

export interface HeatmapComputeOptions {
  targetLba: number;
  sectorsPerCluster: number;
  sectorBlocks?: SectorBlock[];
  errorLogs?: ErrorLogItem[];
  badLbaHistory?: number[];
  cellCount?: number;
  searchIndex?: HeatmapSearchIndex;
}

function lowerBoundNumber(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundNumber(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function countSortedInRange(arr: number[], loVal: number, hiVal: number): number {
  if (arr.length === 0 || loVal > hiVal) return 0;
  const lo = lowerBoundNumber(arr, loVal);
  if (lo >= arr.length || arr[lo] > hiVal) return 0;
  const hi = upperBoundNumber(arr, hiVal);
  return Math.max(0, hi - lo);
}

function toSortedUniqueArray(set: Set<number>): number[] {
  if (set.size === 0) return [];
  const arr = Array.from(set);
  arr.sort((a, b) => a - b);
  return arr;
}

export function buildHeatmapSearchIndex({
  sectorBlocks = [],
  errorLogs = [],
  badLbaHistory = []
}: {
  sectorBlocks?: SectorBlock[];
  errorLogs?: ErrorLogItem[];
  badLbaHistory?: number[];
}): HeatmapSearchIndex {
  const badSet = new Set<number>();
  const criticalSet = new Set<number>();
  const slowSet = new Set<number>();

  for (let i = 0; i < badLbaHistory.length; i++) {
    badSet.add(badLbaHistory[i]);
  }
  for (let i = 0; i < errorLogs.length; i++) {
    const log = errorLogs[i];
    if (log.status === 'bad') badSet.add(log.lba);
    else if (log.status === 'critical') criticalSet.add(log.lba);
    else if (log.status === 'slow') slowSet.add(log.lba);
  }

  const sortedBlocks: SectorBlock[] = [];
  for (let i = 0; i < sectorBlocks.length; i++) {
    const b = sectorBlocks[i];
    if (b.status !== 'unscanned') {
      sortedBlocks.push(b);
    }
  }
  sortedBlocks.sort((a, b) => a.lba - b.lba);

  const prefixMaxEndLba = new Array<number>(sortedBlocks.length);
  let runningMax = -Infinity;
  for (let i = 0; i < sortedBlocks.length; i++) {
    if (sortedBlocks[i].endLba > runningMax) {
      runningMax = sortedBlocks[i].endLba;
    }
    prefixMaxEndLba[i] = runningMax;
  }

  return {
    sortedBlocks,
    prefixMaxEndLba,
    sortedBadLbas: toSortedUniqueArray(badSet),
    sortedCriticalLbas: toSortedUniqueArray(criticalSet),
    sortedSlowLbas: toSortedUniqueArray(slowSet)
  };
}

function classifySeverity(
  scanned: boolean,
  badDensityPct: number,
  containsTargetLba: boolean,
  occupiesFileExtent = true
): HeatmapSeverity {
  if (!occupiesFileExtent && badDensityPct === 0 && !containsTargetLba) {
    return 'gap';
  }
  if (!scanned && badDensityPct === 0 && !containsTargetLba) {
    return 'unscanned';
  }
  if (badDensityPct >= 70) return 'critical';
  if (badDensityPct >= 40) return 'high';
  if (badDensityPct >= 15 || containsTargetLba) return 'medium';
  if (badDensityPct > 0) return 'low';
  return 'healthy';
}

interface IntervalTelemetry {
  scanned: boolean;
  scannedSectors: number;
  badCount: number;
  criticalCount: number;
  slowCount: number;
  badDensityPct: number;
}

function evaluateRangeTelemetry(
  rangeStart: number,
  rangeEnd: number,
  containsTargetLba: boolean,
  index: HeatmapSearchIndex
): IntervalTelemetry {
  const sectorCount = Math.max(1, rangeEnd - rangeStart + 1);

  const exactBadHits = countSortedInRange(index.sortedBadLbas, rangeStart, rangeEnd);
  const exactCriticalHits = countSortedInRange(index.sortedCriticalLbas, rangeStart, rangeEnd);
  const exactSlowHits = countSortedInRange(index.sortedSlowLbas, rangeStart, rangeEnd);

  let scannedSectors = 0;
  let badOverlapSectors = 0;
  let criticalOverlapSectors = 0;
  let slowOverlapSectors = 0;
  let blockBadCount = 0;
  let blockCriticalCount = 0;
  let blockSlowCount = 0;

  const { sortedBlocks, prefixMaxEndLba } = index;
  if (sortedBlocks.length > 0) {
    let startIdx = lowerBoundNumber(prefixMaxEndLba, rangeStart);
    for (let i = startIdx; i < sortedBlocks.length; i++) {
      const blk = sortedBlocks[i];
      if (blk.lba > rangeEnd) break;
      if (blk.endLba < rangeStart) continue;

      const ovStart = rangeStart > blk.lba ? rangeStart : blk.lba;
      const ovEnd = rangeEnd < blk.endLba ? rangeEnd : blk.endLba;
      if (ovStart > ovEnd) continue;

      const overlapLen = ovEnd - ovStart + 1;
      scannedSectors += overlapLen;

      if (blk.status === 'bad') {
        badOverlapSectors += overlapLen;
        blockBadCount++;
      } else if (blk.status === 'critical') {
        criticalOverlapSectors += overlapLen;
        blockCriticalCount++;
      } else if (blk.status === 'slow') {
        slowOverlapSectors += overlapLen;
        blockSlowCount++;
      }
    }
  }

  const clampedScannedSectors = Math.min(sectorCount, scannedSectors);
  const scanned = clampedScannedSectors > 0 || exactBadHits > 0 || exactCriticalHits > 0 || exactSlowHits > 0;

  const rawAreaDensityPct = Math.min(
    100,
    ((badOverlapSectors + criticalOverlapSectors * 0.55 + slowOverlapSectors * 0.2) / sectorCount) * 100
  );

  const pointPenaltyPct = Math.min(
    100,
    exactBadHits * 35 +
      exactCriticalHits * 20 +
      exactSlowHits * 10 +
      (containsTargetLba && exactBadHits === 0 && badOverlapSectors === 0 ? 35 : 0)
  );

  const badDensityPct = Math.min(100, Math.round(Math.max(rawAreaDensityPct, pointPenaltyPct)));

  return {
    scanned,
    scannedSectors: clampedScannedSectors,
    badCount: Math.max(exactBadHits, blockBadCount),
    criticalCount: Math.max(exactCriticalHits, blockCriticalCount),
    slowCount: Math.max(exactSlowHits, blockSlowCount),
    badDensityPct
  };
}

export function computeFileLbaHeatmap(
  file: LbaAffectedFileRecord,
  options: HeatmapComputeOptions
): FileLbaHeatmapSummary {
  const {
    targetLba,
    sectorsPerCluster,
    sectorBlocks = [],
    errorLogs = [],
    badLbaHistory = [],
    cellCount = 48,
    searchIndex
  } = options;

  const spc = Math.max(1, sectorsPerCluster || 8);
  const isResidentFallbackSpan = file.extents.length === 0;

  const indexedExtents: IndexedExtent[] = isResidentFallbackSpan
    ? [
        {
          extentIndex: 0,
          extent: {
            startLba: Math.max(0, targetLba - 3),
            endLba: targetLba + 4,
            vcnStart: 0,
            lcnStart: 0,
            clusterCount: 1
          }
        }
      ]
    : file.extents
        .map((extent, extentIndex) => ({ extentIndex, extent }))
        .sort((a, b) => a.extent.startLba - b.extent.startLba);

  const globalStartLba = indexedExtents[0].extent.startLba;
  let globalEndLba = indexedExtents[0].extent.endLba;
  let allocatedSectors = 0;
  for (let i = 0; i < indexedExtents.length; i++) {
    const ext = indexedExtents[i].extent;
    if (ext.endLba > globalEndLba) globalEndLba = ext.endLba;
    allocatedSectors += Math.max(1, ext.endLba - ext.startLba + 1);
  }
  const totalSpanSectors = Math.max(1, globalEndLba - globalStartLba + 1);

  const resolvedIndex =
    searchIndex ??
    buildHeatmapSearchIndex({
      sectorBlocks,
      errorLogs,
      badLbaHistory
    });

  // 1. Group physically contiguous/nearby extents into LBA Zone Groups
  const gapThreshold = Math.max(spc * 32, Math.floor(totalSpanSectors * 0.03), 256);
  const rawGroups: Array<{
    startLba: number;
    endLba: number;
    allocatedSectors: number;
    gapSectorsFromPrev: number;
    extents: IndexedExtent[];
  }> = [];

  for (const item of indexedExtents) {
    const extLen = Math.max(1, item.extent.endLba - item.extent.startLba + 1);
    const prevGroup = rawGroups[rawGroups.length - 1];
    if (!prevGroup) {
      rawGroups.push({
        startLba: item.extent.startLba,
        endLba: item.extent.endLba,
        allocatedSectors: extLen,
        gapSectorsFromPrev: 0,
        extents: [item]
      });
    } else if (item.extent.startLba - prevGroup.endLba <= gapThreshold) {
      prevGroup.endLba = Math.max(prevGroup.endLba, item.extent.endLba);
      prevGroup.allocatedSectors += extLen;
      prevGroup.extents.push(item);
    } else {
      rawGroups.push({
        startLba: item.extent.startLba,
        endLba: item.extent.endLba,
        allocatedSectors: extLen,
        gapSectorsFromPrev: Math.max(0, item.extent.startLba - prevGroup.endLba - 1),
        extents: [item]
      });
    }
  }

  const groups: FileLbaZoneGroup[] = rawGroups.map((g, idx) => {
    const containsTargetLba = targetLba >= g.startLba && targetLba <= g.endLba;
    const telemetry = evaluateRangeTelemetry(
      g.startLba,
      g.endLba,
      containsTargetLba,
      resolvedIndex
    );
    const severity = classifySeverity(
      telemetry.scanned,
      telemetry.badDensityPct,
      containsTargetLba,
      true
    ) as Exclude<HeatmapSeverity, 'gap'>;

    return {
      groupIndex: idx + 1,
      startLba: g.startLba,
      endLba: g.endLba,
      spanSectors: Math.max(1, g.endLba - g.startLba + 1),
      allocatedSectors: g.allocatedSectors,
      gapSectorsFromPrev: g.gapSectorsFromPrev,
      extents: g.extents,
      containsTargetLba,
      scanned: telemetry.scanned,
      badCount: telemetry.badCount,
      criticalCount: telemetry.criticalCount,
      slowCount: telemetry.slowCount,
      badDensityPct: telemetry.badDensityPct,
      severity
    };
  });

  // 2. Build uniform LBA Heatmap Cells across [globalStartLba, globalEndLba]
  const actualCells = Math.max(1, Math.min(cellCount, totalSpanSectors));
  const cells: LbaHeatmapCell[] = [];
  let totalScannedCellSectors = 0;

  for (let i = 0; i < actualCells; i++) {
    const startOffset = Math.floor((i * totalSpanSectors) / actualCells);
    const nextOffset = Math.floor(((i + 1) * totalSpanSectors) / actualCells);
    const cellStartLba = globalStartLba + startOffset;
    const cellEndLba = Math.max(cellStartLba, globalStartLba + nextOffset - 1);
    const cellSectorCount = Math.max(1, cellEndLba - cellStartLba + 1);

    const overlappingExtentIndices: number[] = [];
    for (const item of indexedExtents) {
      if (item.extent.startLba > cellEndLba) break;
      if (item.extent.endLba >= cellStartLba) {
        overlappingExtentIndices.push(item.extentIndex);
      }
    }
    const occupiesFileExtent = overlappingExtentIndices.length > 0;
    const containsTargetLba = targetLba >= cellStartLba && targetLba <= cellEndLba;

    const telemetry = evaluateRangeTelemetry(
      cellStartLba,
      cellEndLba,
      containsTargetLba,
      resolvedIndex
    );
    totalScannedCellSectors += telemetry.scannedSectors;

    const severity = classifySeverity(
      telemetry.scanned,
      telemetry.badDensityPct,
      containsTargetLba,
      occupiesFileExtent
    );

    cells.push({
      cellIndex: i,
      startLba: cellStartLba,
      endLba: cellEndLba,
      sectorCount: cellSectorCount,
      occupiesFileExtent,
      overlappingExtentIndices,
      containsTargetLba,
      scanned: telemetry.scanned,
      badCount: telemetry.badCount,
      criticalCount: telemetry.criticalCount,
      slowCount: telemetry.slowCount,
      badDensityPct: telemetry.badDensityPct,
      severity
    });
  }

  const globalTelemetry = evaluateRangeTelemetry(
    globalStartLba,
    globalEndLba,
    targetLba >= globalStartLba && targetLba <= globalEndLba,
    resolvedIndex
  );

  let hottestGroupIndex: number | null = null;
  let maxGroupDensity = -1;
  for (const g of groups) {
    const score = g.badDensityPct + (g.containsTargetLba ? 0.5 : 0);
    if (score > maxGroupDensity) {
      maxGroupDensity = score;
      hottestGroupIndex = g.groupIndex;
    }
  }

  return {
    globalStartLba,
    globalEndLba,
    totalSpanSectors,
    allocatedSectors,
    fragmentCount: indexedExtents.length,
    isResidentFallbackSpan,
    groups,
    cells,
    totalBadHits: globalTelemetry.badCount,
    totalCriticalHits: globalTelemetry.criticalCount,
    totalSlowHits: globalTelemetry.slowCount,
    overallBadDensityPct: globalTelemetry.badDensityPct,
    scannedCoveragePct: Math.min(100, Math.round((totalScannedCellSectors / totalSpanSectors) * 100)),
    hottestGroupIndex
  };
}
