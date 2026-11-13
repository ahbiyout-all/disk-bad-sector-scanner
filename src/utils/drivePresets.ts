import { DiskDrive, SectorBlock } from '../types';

export const TOTAL_SCAN_BLOCKS = 1000;

export function generateBlocksForDrive(drive: DiskDrive, blockCount = TOTAL_SCAN_BLOCKS) {
  const blocks: SectorBlock[] = [];
  const safeTotalSectors = Math.max(blockCount, drive.totalSectors || blockCount);
  const lbaStep = Math.max(1, Math.floor(safeTotalSectors / blockCount));

  for (let i = 0; i < blockCount; i++) {
    const lba = i * lbaStep;
    const endLba = (i + 1) * lbaStep - 1;

    blocks.push({
      id: i,
      lba,
      endLba,
      status: 'unscanned',
      responseTimeMs: 0
    });
  }

  return { blocks };
}
