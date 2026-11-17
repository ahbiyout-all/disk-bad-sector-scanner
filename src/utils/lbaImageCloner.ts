import {
  DiskDrive,
  LbaCloneDomainInterval,
  LbaCloneIntervalStatus,
  LbaClonePassPhase,
  LbaCloneSessionState
} from '../types';

export interface CloneWorkUnit {
  phase: 'copying' | 'trimming' | 'retrying';
  startLba: number;
  sectorCount: number;
}

export function getDefaultClonePaths(drive: DiskDrive, startLba: number, endLba: number): {
  outputPath: string;
  mapPath: string;
  safeFolderHint: string;
} {
  const driveIdx = drive.id.startsWith('drive-tauri-physical-')
    ? parseInt(drive.id.replace('drive-tauri-physical-', ''), 10) || 0
    : 0;
  const mounted = (drive.hardwareSpecs?.partitions || [])
    .map(p => (p.letterOrMount || '').trim().toUpperCase())
    .filter(Boolean);

  // Choose a different drive letter than the source drive when possible
  const candidateLetters = ['D:', 'E:', 'F:', 'C:'];
  const safeLetter = candidateLetters.find(l => !mounted.includes(l)) || 'D:';
  const baseName = `PhysicalDrive${driveIdx}_LBA_${startLba}_${endLba}`;
  const outputPath = `${safeLetter}\\DiskSentinel_Recovery\\${baseName}.img`;
  const mapPath = `${outputPath}.map.json`;
  return {
    outputPath,
    mapPath,
    safeFolderHint: `${safeLetter}\\DiskSentinel_Recovery`
  };
}

export function validateCloneOutputPath(
  drive: DiskDrive,
  outputPath: string
): { valid: boolean; reason?: string } {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return { valid: false, reason: '출력 이미지(.img) 파일 경로를 입력하세요.' };
  }

  const mountedLetters = (drive.hardwareSpecs?.partitions || [])
    .map(p => (p.letterOrMount || '').trim().toUpperCase())
    .filter(Boolean);

  const match = /^([A-Za-z]:)/.exec(trimmed);
  if (match) {
    const targetLetter = match[1].toUpperCase();
    if (mountedLetters.includes(targetLetter)) {
      return {
        valid: false,
        reason: `안전 가드: 원본 드라이브에 마운트된 볼륨(${targetLetter})과 동일한 드라이브에는 복제 이미지를 저장할 수 없습니다. 다른 물리 드라이브 경로를 지정하세요.`
      };
    }
  }

  return { valid: true };
}

export function coalesceCloneIntervals(
  intervals: LbaCloneDomainInterval[]
): LbaCloneDomainInterval[] {
  if (intervals.length <= 1) return intervals.slice();
  const sorted = intervals
    .filter(iv => iv.sectorCount > 0)
    .slice()
    .sort((a, b) => a.startLba - b.startLba);

  const merged: LbaCloneDomainInterval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.startLba + last.sectorCount === iv.startLba &&
      last.status === iv.status &&
      last.attempts === iv.attempts &&
      last.lastErrorCode === iv.lastErrorCode
    ) {
      last.sectorCount += iv.sectorCount;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

export function applyCloneIntervalUpdate(
  intervals: LbaCloneDomainInterval[],
  updateStartLba: number,
  updateSectorCount: number,
  nextStatus: LbaCloneIntervalStatus,
  attemptsIncrement = 1,
  lastErrorCode?: number
): LbaCloneDomainInterval[] {
  if (updateSectorCount <= 0) return intervals;
  const updateEnd = updateStartLba + updateSectorCount;
  const result: LbaCloneDomainInterval[] = [];

  for (const iv of intervals) {
    const ivStart = iv.startLba;
    const ivEnd = iv.startLba + iv.sectorCount;

    if (ivEnd <= updateStartLba || ivStart >= updateEnd) {
      result.push(iv);
      continue;
    }

    if (ivStart < updateStartLba) {
      result.push({
        startLba: ivStart,
        sectorCount: updateStartLba - ivStart,
        status: iv.status,
        attempts: iv.attempts,
        lastErrorCode: iv.lastErrorCode
      });
    }

    const overlapStart = Math.max(ivStart, updateStartLba);
    const overlapEnd = Math.min(ivEnd, updateEnd);
    if (overlapEnd > overlapStart) {
      result.push({
        startLba: overlapStart,
        sectorCount: overlapEnd - overlapStart,
        status: nextStatus,
        attempts: iv.attempts + attemptsIncrement,
        lastErrorCode
      });
    }

    if (ivEnd > updateEnd) {
      result.push({
        startLba: updateEnd,
        sectorCount: ivEnd - updateEnd,
        status: iv.status,
        attempts: iv.attempts,
        lastErrorCode: iv.lastErrorCode
      });
    }
  }

  return coalesceCloneIntervals(result);
}

export function createInitialCloneSession(
  drive: DiskDrive,
  rangeStartLba: number,
  rangeEndLba: number,
  outputPath: string,
  mapPath: string,
  chunkSectors = 128
): LbaCloneSessionState {
  const safeStart = Math.max(0, Math.floor(rangeStartLba));
  const safeEnd = Math.max(safeStart, Math.floor(rangeEndLba));
  const sectorCount = safeEnd - safeStart + 1;
  const now = Date.now();

  return {
    version: 1,
    driveId: drive.id,
    driveModel: drive.model,
    driveSerial: drive.serialNumber,
    sectorSize: drive.hardwareSpecs?.logicalSectorSize || 512,
    rangeStartLba: safeStart,
    rangeEndLba: safeEnd,
    outputPath: outputPath.trim(),
    mapPath: mapPath.trim() || `${outputPath.trim()}.map.json`,
    phase: 'idle',
    chunkSectors: Math.max(1, Math.min(2048, chunkSectors)),
    copiedSectors: 0,
    badSectors: 0,
    retriedSectors: 0,
    bytesWritten: 0,
    startedAt: now,
    updatedAt: now,
    intervals: [
      {
        startLba: safeStart,
        sectorCount,
        status: 'non_tried',
        attempts: 0
      }
    ]
  };
}

/**
 * Selects the next LBA work unit according to ddrescue's multi-pass algorithm:
 * 1) Copying: read fast coarse chunks from `non_tried`.
 * 2) Trimming: split failed coarse regions (`non_trimmed`) into finer 16-sector chunks.
 * 3) Scraping/Retrying: isolate single-sector reads from `non_scraped` before marking `bad_sector`.
 */
export function pickNextCloneWorkUnit(session: LbaCloneSessionState): CloneWorkUnit | null {
  // Pass 1: Copying (non_tried -> large chunks)
  const nonTried = session.intervals.find(iv => iv.status === 'non_tried');
  if (nonTried) {
    return {
      phase: 'copying',
      startLba: nonTried.startLba,
      sectorCount: Math.min(session.chunkSectors, nonTried.sectorCount)
    };
  }

  // Pass 2: Trimming (non_trimmed -> medium 16-sector sub-chunks)
  const nonTrimmed = session.intervals.find(iv => iv.status === 'non_trimmed');
  if (nonTrimmed) {
    const trimStep = Math.max(4, Math.min(16, Math.floor(session.chunkSectors / 4)));
    return {
      phase: 'trimming',
      startLba: nonTrimmed.startLba,
      sectorCount: Math.min(trimStep, nonTrimmed.sectorCount)
    };
  }

  // Pass 3: Scraping / Retrying (non_scraped -> single-sector isolation)
  const nonScraped = session.intervals.find(iv => iv.status === 'non_scraped');
  if (nonScraped) {
    return {
      phase: 'retrying',
      startLba: nonScraped.startLba,
      sectorCount: 1
    };
  }

  return null;
}

export function summarizeCloneStats(session: LbaCloneSessionState): {
  totalSectors: number;
  finishedSectors: number;
  nonTriedSectors: number;
  nonTrimmedSectors: number;
  nonScrapedSectors: number;
  badSectors: number;
  rescuedPct: number;
  completed: boolean;
  suggestedPhase: LbaClonePassPhase;
} {
  let totalSectors = 0;
  let finishedSectors = 0;
  let nonTriedSectors = 0;
  let nonTrimmedSectors = 0;
  let nonScrapedSectors = 0;
  let badSectors = 0;

  for (const iv of session.intervals) {
    totalSectors += iv.sectorCount;
    if (iv.status === 'finished') finishedSectors += iv.sectorCount;
    else if (iv.status === 'non_tried') nonTriedSectors += iv.sectorCount;
    else if (iv.status === 'non_trimmed') nonTrimmedSectors += iv.sectorCount;
    else if (iv.status === 'non_scraped') nonScrapedSectors += iv.sectorCount;
    else if (iv.status === 'bad_sector') badSectors += iv.sectorCount;
  }

  const completed = nonTriedSectors === 0 && nonTrimmedSectors === 0 && nonScrapedSectors === 0;
  const resolved = finishedSectors + badSectors;
  const rescuedPct = totalSectors > 0 ? Number(((resolved / totalSectors) * 100).toFixed(2)) : 0;

  let suggestedPhase: LbaClonePassPhase = 'completed';
  if (nonTriedSectors > 0) suggestedPhase = 'copying';
  else if (nonTrimmedSectors > 0) suggestedPhase = 'trimming';
  else if (nonScrapedSectors > 0) suggestedPhase = 'retrying';

  return {
    totalSectors,
    finishedSectors,
    nonTriedSectors,
    nonTrimmedSectors,
    nonScrapedSectors,
    badSectors,
    rescuedPct,
    completed,
    suggestedPhase
  };
}

export function serializeCloneMapJson(session: LbaCloneSessionState): string {
  return JSON.stringify(session, null, 2);
}

export function parseCloneMapJson(raw: string): LbaCloneSessionState | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.rangeStartLba !== 'number' ||
      typeof parsed.rangeEndLba !== 'number' ||
      !Array.isArray(parsed.intervals)
    ) {
      return null;
    }
    return parsed as LbaCloneSessionState;
  } catch {
    return null;
  }
}
