import {
  DiagnosticTask,
  DiskDrive,
  SectorBlock,
  SurfaceScanCheckpoint,
  SurfaceScanCheckpointBlockPatch
} from '../types';
import { generateBlocksForDrive, TOTAL_SCAN_BLOCKS } from './drivePresets';
import { buildScanBlockSequence, classifyResponseBucket, createEmptyResponseBuckets } from './nativeDriveEngine';
import { safeStorage } from './safeStorage';

const CHECKPOINT_STORAGE_KEY = 'disksentinel_scan_checkpoints_v1';
const CHECKPOINT_VERSION = 1;

function readAllCheckpoints(): Record<string, SurfaceScanCheckpoint> {
  const raw = safeStorage.getItem(CHECKPOINT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const valid: Record<string, SurfaceScanCheckpoint> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v === 'object' &&
        (v as SurfaceScanCheckpoint).version === CHECKPOINT_VERSION &&
        typeof (v as SurfaceScanCheckpoint).driveId === 'string' &&
        typeof (v as SurfaceScanCheckpoint).completedSteps === 'number'
      ) {
        valid[k] = v as SurfaceScanCheckpoint;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function writeAllCheckpoints(map: Record<string, SurfaceScanCheckpoint>): void {
  try {
    safeStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function buildCheckpointFromTask(task: DiagnosticTask, driveSerial = ''): SurfaceScanCheckpoint {
  const scannedBlocks: SurfaceScanCheckpointBlockPatch[] = [];
  for (let i = 0; i < task.blocks.length; i++) {
    const b = task.blocks[i];
    if (b.status !== 'unscanned') {
      scannedBlocks.push({
        id: b.id,
        status: b.status,
        responseTimeMs: b.responseTimeMs,
        throughputMbSec: b.throughputMbSec,
        errorCode: b.errorCode
      });
    }
  }

  return {
    version: CHECKPOINT_VERSION,
    driveId: task.driveId,
    driveModel: task.driveModel,
    driveSerial,
    totalBlocks: task.blocks.length,
    testType: task.testType,
    scanMode: task.scanMode,
    methodId: task.methodId,
    startBlock: task.startBlock,
    endBlock: task.endBlock,
    completedSteps: task.completedSteps,
    totalSteps: task.stepSequence.length,
    currentBlockIndex: task.currentBlockIndex,
    currentLba: task.currentLba,
    elapsedSeconds: task.elapsedSeconds,
    speedMbPerSec: task.speedMbPerSec,
    buckets: { ...task.buckets },
    scannedBlocks,
    savedAt: Date.now()
  };
}

export function saveScanCheckpoint(checkpoint: SurfaceScanCheckpoint): void {
  if (!checkpoint.driveId || checkpoint.completedSteps <= 0) return;
  if (checkpoint.completedSteps >= checkpoint.totalSteps) {
    clearScanCheckpoint(checkpoint.driveId);
    return;
  }
  const map = readAllCheckpoints();
  map[checkpoint.driveId] = checkpoint;
  writeAllCheckpoints(map);
}

export function loadScanCheckpoint(driveId: string): SurfaceScanCheckpoint | null {
  if (!driveId) return null;
  const map = readAllCheckpoints();
  const hit = map[driveId];
  if (!hit) return null;
  if (hit.completedSteps <= 0 || hit.completedSteps >= hit.totalSteps) return null;
  return hit;
}

export function listScanCheckpoints(): SurfaceScanCheckpoint[] {
  const map = readAllCheckpoints();
  return Object.values(map)
    .filter(c => c.completedSteps > 0 && c.completedSteps < c.totalSteps)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function clearScanCheckpoint(driveId: string): void {
  if (!driveId) return;
  const map = readAllCheckpoints();
  if (driveId in map) {
    delete map[driveId];
    writeAllCheckpoints(map);
  }
}

export function restoreTaskFromCheckpoint(
  drive: DiskDrive,
  checkpoint: SurfaceScanCheckpoint,
  speedMultiplier = 2,
  autoStart = false
): DiagnosticTask {
  const blockCount = checkpoint.totalBlocks > 0 ? checkpoint.totalBlocks : TOTAL_SCAN_BLOCKS;
  const { blocks } = generateBlocksForDrive(drive, blockCount);
  const stepSequence = buildScanBlockSequence(
    blocks.length,
    checkpoint.startBlock,
    checkpoint.endBlock,
    checkpoint.scanMode,
    checkpoint.testType
  );

  const patchById = new Map<number, SurfaceScanCheckpointBlockPatch>(
    checkpoint.scannedBlocks.map(p => [p.id, p] as const)
  );
  const recalculatedBuckets = createEmptyResponseBuckets();
  const patchedBlocks: SectorBlock[] = blocks.map(b => {
    const patch = patchById.get(b.id);
    if (!patch) return b;
    const bucket = classifyResponseBucket(patch.status, patch.responseTimeMs);
    recalculatedBuckets[bucket] = recalculatedBuckets[bucket] + 1;
    return {
      ...b,
      status: patch.status,
      responseTimeMs: patch.responseTimeMs,
      throughputMbSec: patch.throughputMbSec,
      errorCode: patch.errorCode
    };
  });

  const safeCompleted = Math.min(checkpoint.completedSteps, stepSequence.length);
  const restoredTrace = stepSequence.slice(0, safeCompleted).map((step, seqIdx) => {
    const blk = patchedBlocks[step.blockIndex];
    return {
      seqIndex: seqIdx,
      blockId: step.blockIndex,
      lba: blk?.lba ?? 0,
      latencyMs: blk?.responseTimeMs ?? 0,
      throughputMbSec: blk?.throughputMbSec ?? checkpoint.speedMbPerSec ?? 0,
      status: blk?.status ?? 'unscanned',
      passSide: step.passSide
    };
  });

  return {
    id: `task-resumed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    driveId: drive.id,
    driveModel: drive.model,
    driveType: drive.type,
    testType: checkpoint.testType,
    scanMode: checkpoint.scanMode,
    methodId: checkpoint.methodId,
    status: autoStart ? 'running' : 'paused',
    startBlock: checkpoint.startBlock,
    endBlock: checkpoint.endBlock,
    stepSequence,
    completedSteps: safeCompleted,
    currentBlockIndex: checkpoint.currentBlockIndex,
    currentLba: checkpoint.currentLba,
    speedMultiplier,
    speedMbPerSec: checkpoint.speedMbPerSec,
    elapsedSeconds: checkpoint.elapsedSeconds,
    buckets: recalculatedBuckets,
    blocks: patchedBlocks,
    lbaTrace: restoredTrace,
    createdAt: Date.now()
  };
}
