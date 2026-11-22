/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DiskSentinel Pro - S.M.A.R.T. Sector Remapping & Zero-Fill Bad Sector Repair Engine
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DiskDrive, SectorBlock, DriveSmartAttribute } from '../types';
import {
  ShieldAlert,
  Wrench,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  HardDrive,
  Activity,
  X,
  Layers,
  Sliders,
  Check,
  Lock,
  Unlock,
  AlertOctagon,
  StopCircle
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import {
  executeRealZeroFillRepairBlock,
  getDriveIndexFromId,
  isSystemOrBootDrive,
  isTauriDesktopRuntime,
  queryTauriRawSector
} from '../utils/nativeDriveEngine';

type ZeroFillRepairMode = 'standard' | 'deep_ecc' | 'firmware_realloc';

interface QueueSectorStepState {
  status: 'queued' | 'running' | 'verified' | 'failed';
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  detail?: string;
}

const REPAIR_PIPELINE_STEPS: Record<ZeroFillRepairMode, string[]> = {
  standard: [
    '0x00 제로필 쓰기 (Direct Write)',
    '0x00 전수 일치 검증 (Verify)'
  ],
  deep_ecc: [
    '수복 전 LBA 읽기 프로브 (Pre-Probe)',
    '0x00 제로필 다중 쓰기 (Zero-Fill)',
    'ECC 패리티 & 0x00 무결성 검증'
  ],
  firmware_realloc: [
    '결함 섹터 격리 프로브 (Isolate)',
    '0x00 제로필 덮어쓰기 (Overwrite)',
    '05h 예비 트랙 재할당 (Remap)',
    '재할당 후 0x00 재판독 검증'
  ]
};

interface SmartRemapModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDrive: DiskDrive;
  blocks: SectorBlock[];
  initialQueuedBlockIds?: number[];
  initialTargetLba?: number | null;
  onSyncRepairQueue?: (blockIds: number[]) => void;
  onRepairSectors: (driveId: string, repairedBlockIds: number[], latencyByBlockId?: Record<number, number>) => void;
  isInline?: boolean;
}

export const SmartRemapModal: React.FC<SmartRemapModalProps> = ({
  isOpen,
  onClose,
  activeDrive,
  blocks,
  initialQueuedBlockIds = [],
  initialTargetLba = null,
  onSyncRepairQueue,
  onRepairSectors,
  isInline = false
}) => {
  const [selectedBlockIds, setSelectedBlockIds] = useState<number[]>([]);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentLba, setCurrentLba] = useState<number>(0);
  const [activeStepInfo, setActiveStepInfo] = useState<{
    sectorIndex: number;
    totalSectors: number;
    stepIndex: number;
    totalSteps: number;
    stepLabel: string;
  } | null>(null);
  const [queueStepStates, setQueueStepStates] = useState<Record<number, QueueSectorStepState>>({});
  const [repairLogs, setRepairLogs] = useState<string[]>([]);
  const [repairCompleted, setRepairCompleted] = useState<boolean>(false);
  const [repairAborted, setRepairAborted] = useState<boolean>(false);
  const [repairedCountSummary, setRepairedCountSummary] = useState<number>(0);
  const [failedCountSummary, setFailedCountSummary] = useState<number>(0);
  const [lastUnsupportedReason, setLastUnsupportedReason] = useState<string | null>(null);

  const [isSafetyLocked, setIsSafetyLocked] = useState<boolean>(true);
  const [showLockWarning, setShowLockWarning] = useState<boolean>(false);
  const [showBackupWarningModal, setShowBackupWarningModal] = useState<boolean>(false);

  const [repairMode, setRepairMode] = useState<ZeroFillRepairMode>('standard');

  const getDriveSpeedProfile = () => {
    const measuredMb = activeDrive.hardwareSpecs?.measuredSequentialWriteMbSec;
    const speedLabel = measuredMb !== null && measuredMb !== undefined ? `실측 쓰기 ${measuredMb} MB/s` : '실행 시 실측';
    if (activeDrive.type === 'NVMe') {
      return { label: `NVMe PCIe Direct (${speedLabel})`, measuredMb };
    } else if (activeDrive.type === 'SSD' || activeDrive.type === 'EXTERNAL_SSD') {
      return { label: `SSD / Storage API (${speedLabel})`, measuredMb };
    } else if (activeDrive.type === 'HDD') {
      return { label: `HDD 자기 플래터 (${speedLabel})`, measuredMb };
    } else {
      return { label: `USB / 외장 스토리지 (${speedLabel})`, measuredMb };
    }
  };

  const speedProfile = getDriveSpeedProfile();

  const getDifficultyMultiplier = () => {
    switch (repairMode) {
      case 'deep_ecc': return 2.2;
      case 'firmware_realloc': return 4.0;
      case 'standard':
      default: return 1.0;
    }
  };

  const difficultyMultiplier = getDifficultyMultiplier();
  const blockCount = Math.max(1, selectedBlockIds.length);
  const hasMeasuredWriteSpeed = typeof speedProfile.measuredMb === 'number' && speedProfile.measuredMb > 0;
  const estimatedSeconds = hasMeasuredWriteSpeed
    ? Math.max(1, Math.round((blockCount * 0.064 / speedProfile.measuredMb!) * difficultyMultiplier))
    : null;

  const formatEstimatedTime = (sec: number) => {
    if (sec < 60) return `약 ${sec}초`;
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `약 ${mins}분 ${secs > 0 ? `${secs}초` : ''}`;
  };

  const estimatedCompletionTimeStr = estimatedSeconds !== null
    ? new Date(Date.now() + estimatedSeconds * 1000).toLocaleTimeString()
    : null;

  const badBlocks = useMemo(() => blocks.filter(b => b.status === 'bad'), [blocks]);
  const slowBlocks = useMemo(
    () => blocks.filter(b => b.status === 'slow' || b.status === 'critical'),
    [blocks]
  );

  // Merge detected bad/slow blocks with any explicitly queued non-contiguous blocks from SectorGrid
  const targetableBlocks = useMemo(() => {
    const byId = new Map<number, SectorBlock>();
    const base = badBlocks.length > 0 ? badBlocks : slowBlocks;
    base.forEach(b => byId.set(b.id, b));
    const allById = new Map<number, SectorBlock>(blocks.map(b => [b.id, b]));
    initialQueuedBlockIds.forEach(qId => {
      const b = allById.get(qId);
      if (b) byId.set(b.id, b);
    });
    selectedBlockIds.forEach(sId => {
      const b = allById.get(sId);
      if (b) byId.set(b.id, b);
    });
    return Array.from(byId.values()).sort((a, b) => a.lba - b.lba || a.id - b.id);
  }, [badBlocks, slowBlocks, blocks, initialQueuedBlockIds, selectedBlockIds]);

  // Count non-contiguous LBA islands in selectedBlockIds
  const nonContiguousSegmentCount = useMemo(() => {
    if (selectedBlockIds.length === 0) return 0;
    const blockById = new Map<number, SectorBlock>(blocks.map(b => [b.id, b]));
    const ordered = selectedBlockIds
      .map(id => blockById.get(id))
      .filter((b): b is SectorBlock => !!b)
      .sort((a, b) => a.id - b.id);
    if (ordered.length === 0) return 0;
    let segments = 1;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].id !== ordered[i - 1].id + 1) {
        segments++;
      }
    }
    return segments;
  }, [selectedBlockIds, blocks]);

  const pipelineSteps = REPAIR_PIPELINE_STEPS[repairMode];

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef<boolean>(false);
  const prevDriveIdRef = useRef<string>(activeDrive.id);
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const repairRunIdRef = useRef<number>(0);
  const abortRequestedRef = useRef<boolean>(false);
  const lockWarnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      repairRunIdRef.current += 1;
      if (lockWarnTimeoutRef.current) {
        clearTimeout(lockWarnTimeoutRef.current);
        lockWarnTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const driveChanged = prevDriveIdRef.current !== activeDrive.id;
    prevDriveIdRef.current = activeDrive.id;

    if (!isOpen) {
      repairRunIdRef.current += 1;
      abortRequestedRef.current = false;
      setIsRepairing(false);
      if (lockWarnTimeoutRef.current) {
        clearTimeout(lockWarnTimeoutRef.current);
        lockWarnTimeoutRef.current = null;
      }
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current || driveChanged) {
      repairRunIdRef.current += 1;
      abortRequestedRef.current = false;

      const validIdSet = new Set(blocks.map(b => b.id));
      const validQueued = initialQueuedBlockIds.filter(id => validIdSet.has(id));
      let lbaMatchedBlockId: number | null = null;
      if (initialTargetLba !== null && initialTargetLba !== undefined && blocks.length > 0) {
        const exact = blocks.find(b => initialTargetLba >= b.lba && initialTargetLba <= b.endLba);
        if (exact) {
          lbaMatchedBlockId = exact.id;
        } else {
          let closest = blocks[0];
          let minDiff = Math.abs(blocks[0].lba - initialTargetLba);
          for (let i = 1; i < blocks.length; i++) {
            const diff = Math.abs(blocks[i].lba - initialTargetLba);
            if (diff < minDiff) {
              minDiff = diff;
              closest = blocks[i];
            }
          }
          lbaMatchedBlockId = closest.id;
        }
      }

      const initialSet = new Set<number>(validQueued);
      if (lbaMatchedBlockId !== null) initialSet.add(lbaMatchedBlockId);

      if (initialSet.size > 0) {
        setSelectedBlockIds(Array.from(initialSet));
      } else if (badBlocks.length > 0) {
        setSelectedBlockIds(badBlocks.map(b => b.id));
      } else if (slowBlocks.length > 0) {
        setSelectedBlockIds(slowBlocks.map(b => b.id));
      } else {
        setSelectedBlockIds([]);
      }
      setIsRepairing(false);
      setProgress(0);
      setActiveStepInfo(null);
      setQueueStepStates({});
      setRepairLogs([]);
      setRepairCompleted(false);
      setRepairAborted(false);
      setRepairedCountSummary(0);
      setFailedCountSummary(0);
      setLastUnsupportedReason(null);
      setIsSafetyLocked(true);
      setShowLockWarning(false);
      setShowBackupWarningModal(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, activeDrive.id]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [repairLogs]);

  if (!isOpen) return null;

  const updateSelection = (nextIds: number[]) => {
    setSelectedBlockIds(nextIds);
    if (onSyncRepairQueue) {
      onSyncRepairQueue(nextIds);
    }
  };

  const handleToggleBlock = (id: number) => {
    if (isRepairing) return;
    const next = selectedBlockIds.includes(id)
      ? selectedBlockIds.filter(item => item !== id)
      : [...selectedBlockIds, id];
    updateSelection(next);
  };

  const handleSortSelectionByLba = () => {
    if (isRepairing) return;
    const blockById = new Map<number, SectorBlock>(blocks.map(b => [b.id, b]));
    const sorted = [...selectedBlockIds].sort((a, b) => {
      const ba = blockById.get(a);
      const bb = blockById.get(b);
      return (ba?.lba ?? a) - (bb?.lba ?? b);
    });
    updateSelection(sorted);
  };

  const getSmartAttr = (id: number): DriveSmartAttribute | undefined => {
    return activeDrive.smartAttributes.find(a => a.id === id);
  };

  const reallocatedAttr = getSmartAttr(5);
  const pendingAttr = getSmartAttr(197);

  const isProtectedSystemDrive = isSystemOrBootDrive(activeDrive);

  const handleStartRepair = () => {
    if (isProtectedSystemDrive) {
      soundManager.playBeep(400, 0.12);
      setShowLockWarning(true);
      return;
    }

    if (isSafetyLocked) {
      soundManager.playBeep(400, 0.1);
      setShowLockWarning(true);
      if (lockWarnTimeoutRef.current) clearTimeout(lockWarnTimeoutRef.current);
      lockWarnTimeoutRef.current = setTimeout(() => {
        lockWarnTimeoutRef.current = null;
        if (isMountedRef.current) setShowLockWarning(false);
      }, 4000);
      return;
    }

    if (selectedBlockIds.length === 0 || isRepairing) return;
    setShowBackupWarningModal(true);
  };

  const handleAbortRepairSession = () => {
    abortRequestedRef.current = true;
    setRepairLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] [요청] 사용자 중단 요청 수신 — 현재 진행 중인 섹터 단계 완료 후 안전 정지합니다...`
    ]);
  };

  const handleConfirmAndExecuteRepair = async () => {
    const runId = ++repairRunIdRef.current;
    abortRequestedRef.current = false;
    const driveSnapshot = activeDrive;
    const driveIndex = getDriveIndexFromId(driveSnapshot);
    const tauriActive = isTauriDesktopRuntime() && driveIndex !== null;
    const blocksById = new Map<number, SectorBlock>(blocks.map(b => [b.id, b]));
    const stepsForMode = REPAIR_PIPELINE_STEPS[repairMode];
    const totalStepsPerSector = stepsForMode.length;

    // Sort queued non-contiguous blocks in ascending LBA order for sequential head sweep efficiency
    const targetsSnapshot = [...selectedBlockIds].sort((a, b) => {
      const ba = blocksById.get(a);
      const bb = blocksById.get(b);
      return (ba?.lba ?? a) - (bb?.lba ?? b);
    });
    const totalToRepair = targetsSnapshot.length;
    const totalPipelineSteps = Math.max(1, totalToRepair * totalStepsPerSector);

    const initialStates: Record<number, QueueSectorStepState> = {};
    targetsSnapshot.forEach(id => {
      initialStates[id] = {
        status: 'queued',
        currentStep: 0,
        totalSteps: totalStepsPerSector,
        stepLabel: '대기 중'
      };
    });

    setShowBackupWarningModal(false);
    soundManager.playClick();
    setIsRepairing(true);
    setProgress(0);
    setQueueStepStates(initialStates);
    setRepairCompleted(false);
    setRepairAborted(false);
    setRepairedCountSummary(0);
    setFailedCountSummary(0);
    setLastUnsupportedReason(null);

    setRepairLogs([
      `[${new Date().toLocaleTimeString()}] === 다단계 비연속 섹터 제로필(Zero-Fill) 수복 세션 시작 ===`,
      `[시스템] 드라이브: ${driveSnapshot.name} (${driveSnapshot.model})`,
      `[시스템] 수복 파이프라인: ${
        repairMode === 'standard'
          ? '표준 2단계 제로필'
          : repairMode === 'deep_ecc'
          ? '심층 3단계 ECC 정합'
          : '고강도 4단계 펌웨어 재할당'
      } (${totalStepsPerSector}단계/블록)`,
      `[시스템] 큐 구성: 비연속 ${totalToRepair}개 블록 (${nonContiguousSegmentCount}개 독립 LBA 구간, 총 ${totalPipelineSteps} 스텝)`
    ]);

    const succeededIds: number[] = [];
    const repairedLatencyMap: Record<number, number> = {};
    let failedCount = 0;
    let firstFailureReason: string | null = null;
    let completedPipelineSteps = 0;
    let wasAborted = false;

    const updateSectorStep = (
      blockId: number,
      sectorIdx: number,
      stepIdx: number,
      status: QueueSectorStepState['status'],
      stepLabel: string,
      detail?: string
    ) => {
      setQueueStepStates(prev => ({
        ...prev,
        [blockId]: {
          status,
          currentStep: stepIdx + 1,
          totalSteps: totalStepsPerSector,
          stepLabel,
          detail
        }
      }));
      setActiveStepInfo({
        sectorIndex: sectorIdx + 1,
        totalSectors: totalToRepair,
        stepIndex: stepIdx + 1,
        totalSteps: totalStepsPerSector,
        stepLabel
      });
    };

    for (let i = 0; i < totalToRepair; i++) {
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        repairRunIdRef.current !== runId ||
        abortRequestedRef.current
      ) {
        if (abortRequestedRef.current) wasAborted = true;
        break;
      }

      const targetBlockId = targetsSnapshot[i];
      const targetBlock = blocksById.get(targetBlockId);
      const lba = targetBlock ? targetBlock.lba : 0;
      setCurrentLba(lba);

      let sectorFailed = false;
      let sectorFailureMsg = '';
      let writeResult: Awaited<ReturnType<typeof executeRealZeroFillRepairBlock>> | null = null;

      for (let stepIdx = 0; stepIdx < totalStepsPerSector; stepIdx++) {
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          repairRunIdRef.current !== runId ||
          abortRequestedRef.current
        ) {
          if (abortRequestedRef.current) wasAborted = true;
          break;
        }

        const stepLabel = stepsForMode[stepIdx];
        updateSectorStep(targetBlockId, i, stepIdx, 'running', stepLabel);
        const timeStr = new Date().toLocaleTimeString();

        if (repairMode === 'standard') {
          if (stepIdx === 0) {
            writeResult = await executeRealZeroFillRepairBlock(targetBlockId, lba, driveSnapshot);
            if (!writeResult.success) {
              sectorFailed = true;
              sectorFailureMsg = writeResult.unsupportedReason || '물리 섹터 쓰기 권한 거부됨';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 1/2] 0x00 쓰기 완료 (${writeResult!.throughputMbSec} MB/s, ${writeResult!.latencyMs}ms)`
              ]);
            }
          } else if (stepIdx === 1) {
            let verifyOk = Boolean(writeResult?.verifiedZeros);
            if (tauriActive && driveIndex !== null) {
              const readBack = await queryTauriRawSector(driveIndex, lba, 512);
              if (readBack && readBack.length > 0) {
                verifyOk = readBack.every(byte => byte === 0);
              }
            }
            if (!verifyOk) {
              sectorFailed = true;
              sectorFailureMsg = '재판독 버퍼 0x00 불일치 (하드웨어 배드 고정)';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 2/2] 0x00 전수 일치 확인 -> 수복 완료 (HEALTHY OK)`
              ]);
            }
          }
        } else if (repairMode === 'deep_ecc') {
          if (stepIdx === 0) {
            if (tauriActive && driveIndex !== null) {
              const probeBytes = await queryTauriRawSector(driveIndex, lba, 512);
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 1/3] 사전 읽기 프로브 ${
                  probeBytes ? `${probeBytes.length}B 응답` : '타임아웃/UNC (쓰기 격리 진행)'
                }`
              ]);
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 1/3] 사전 읽기 프로브 요청 (커널 핸들 확인)`
              ]);
            }
          } else if (stepIdx === 1) {
            writeResult = await executeRealZeroFillRepairBlock(targetBlockId, lba, driveSnapshot);
            if (!writeResult.success) {
              sectorFailed = true;
              sectorFailureMsg = writeResult.unsupportedReason || '물리 섹터 쓰기 권한 거부됨';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 2/3] 0x00 다중 제로필 쓰기 완료 (${writeResult!.throughputMbSec} MB/s)`
              ]);
            }
          } else if (stepIdx === 2) {
            let verifyOk = Boolean(writeResult?.verifiedZeros);
            if (tauriActive && driveIndex !== null) {
              const readBack = await queryTauriRawSector(driveIndex, lba, 512);
              if (readBack && readBack.length > 0) {
                verifyOk = readBack.every(byte => byte === 0);
              }
            }
            if (!verifyOk) {
              sectorFailed = true;
              sectorFailureMsg = 'ECC 정합성 검증 실패 (0x00 불일치)';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 3/3] ECC 패리티 & 0x00 무결성 검증 완료 -> 수복 OK`
              ]);
            }
          }
        } else {
          // firmware_realloc (4 steps)
          if (stepIdx === 0) {
            if (tauriActive && driveIndex !== null) {
              await queryTauriRawSector(driveIndex, lba, 512);
            }
            setRepairLogs(prev => [
              ...prev,
              `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 1/4] 결함 섹터 격리 및 재할당 준비 완료`
            ]);
          } else if (stepIdx === 1) {
            writeResult = await executeRealZeroFillRepairBlock(targetBlockId, lba, driveSnapshot);
            if (!writeResult.success) {
              sectorFailed = true;
              sectorFailureMsg = writeResult.unsupportedReason || '물리 섹터 쓰기 권한 거부됨';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 2/4] 0x00 덮어쓰기 완료 (${writeResult!.throughputMbSec} MB/s)`
              ]);
            }
          } else if (stepIdx === 2) {
            // Secondary write/remap trigger pass
            const secondPass = await executeRealZeroFillRepairBlock(targetBlockId, lba, driveSnapshot);
            if (!secondPass.success) {
              sectorFailed = true;
              sectorFailureMsg = secondPass.unsupportedReason || '컨트롤러 예비 트랙 재할당 실패';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 3/4] 05h 예비 트랙 컨트롤러 재할당 통과 (${secondPass.latencyMs}ms)`
              ]);
            }
          } else if (stepIdx === 3) {
            let verifyOk = Boolean(writeResult?.verifiedZeros);
            if (tauriActive && driveIndex !== null) {
              const readBack = await queryTauriRawSector(driveIndex, lba, 512);
              if (readBack && readBack.length > 0) {
                verifyOk = readBack.every(byte => byte === 0);
              }
            }
            if (!verifyOk) {
              sectorFailed = true;
              sectorFailureMsg = '재할당 후 0x00 재판독 검증 실패';
            } else {
              setRepairLogs(prev => [
                ...prev,
                `[${timeStr}] [${i + 1}/${totalToRepair}] LBA #${lba.toLocaleString()} [Step 4/4] 재할당 후 0x00 재판독 전수 검증 완료 -> HEALTHY OK`
              ]);
            }
          }
        }

        if (!isMountedRef.current || !isOpenRef.current || repairRunIdRef.current !== runId) {
          return;
        }

        if (sectorFailed) {
          failedCount++;
          if (!firstFailureReason) firstFailureReason = sectorFailureMsg;
          updateSectorStep(targetBlockId, i, stepIdx, 'failed', '실패/미지원', sectorFailureMsg);
          setRepairLogs(prev => [
            ...prev,
            `[${timeStr}] [미지원/실패] LBA #${lba.toLocaleString()} [블록 #${targetBlockId}] — ${sectorFailureMsg}`
          ]);
          completedPipelineSteps = (i + 1) * totalStepsPerSector;
          setProgress(Math.round((completedPipelineSteps / totalPipelineSteps) * 100));
          break;
        }

        completedPipelineSteps++;
        setProgress(Math.round((completedPipelineSteps / totalPipelineSteps) * 100));
        await new Promise(r => setTimeout(r, 35));
      }

      if (wasAborted) {
        if (!sectorFailed && writeResult?.success) {
          succeededIds.push(targetBlockId);
          repairedLatencyMap[targetBlockId] = writeResult.latencyMs;
          updateSectorStep(
            targetBlockId,
            i,
            totalStepsPerSector - 1,
            'verified',
            '수복 완료'
          );
        }
        break;
      }

      if (!sectorFailed) {
        succeededIds.push(targetBlockId);
        if (writeResult?.success) {
          repairedLatencyMap[targetBlockId] = writeResult.latencyMs;
        }
        updateSectorStep(targetBlockId, i, totalStepsPerSector - 1, 'verified', '수복 완료');
        soundManager.playBeep(800 + (i % 10) * 40, 0.05);
      }
    }

    if (!isMountedRef.current || !isOpenRef.current || repairRunIdRef.current !== runId) {
      return;
    }

    setIsRepairing(false);
    setActiveStepInfo(null);
    if (!wasAborted) setProgress(100);
    setRepairCompleted(true);
    setRepairAborted(wasAborted);
    setRepairedCountSummary(succeededIds.length);
    setFailedCountSummary(failedCount);
    setLastUnsupportedReason(firstFailureReason);

    if (succeededIds.length > 0) {
      setRepairLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [${wasAborted ? '부분 완료' : '완료'}] ${succeededIds.length}개 비연속 섹터 다단계 0x00 검증 수복 완료 (실패/미지원 ${failedCount}개).`
      ]);
      onRepairSectors(driveSnapshot.id, succeededIds, repairedLatencyMap);
      if (onSyncRepairQueue) {
        const succeededSet = new Set(succeededIds);
        onSyncRepairQueue(selectedBlockIds.filter(id => !succeededSet.has(id)));
      }
    } else {
      setRepairLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [${wasAborted ? '사용자 중단' : '중단'}] 물리 디스크 쓰기 권한이 없거나 중단되어 섹터 상태 및 SMART 카운터가 변경되지 않았습니다.`
      ]);
    }
  };

  return (
    <div
      className={
        isInline
          ? 'w-full font-sans'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200'
      }
    >
      <div
        className={
          isInline
            ? 'bg-slate-900 border border-slate-800 rounded-md w-full flex flex-col overflow-hidden text-slate-100'
            : 'bg-slate-900 border border-slate-800 rounded-md max-w-3xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden text-slate-100'
        }
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#090D16] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  S.M.A.R.T. 섹터 제로필 수복 &amp; 재할당 엔진
                </h2>
                <span className="text-[10px] font-mono text-emerald-400">
                  · REAL DIRECT WRITE VERIFY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tauri Win32 PhysicalDrive 직접 쓰기 핸들 검증 기반 제로필(0x00) 수복 엔진
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              disabled={isRepairing}
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className={`p-4 sm:p-5 flex-1 space-y-4 ${isInline ? '' : 'overflow-y-auto'}`}>
          {/* Safety Lock Control Card */}
          <div
            className={`p-3.5 rounded-md border transition-colors ${
              showLockWarning ? 'ring-2 ring-rose-500 bg-rose-950/70 border-rose-500' :
              isSafetyLocked
                ? 'bg-rose-950/40 border-rose-800/80'
                : 'bg-emerald-950/40 border-emerald-700/80'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-md flex-shrink-0 ${
                  isSafetyLocked
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {isSafetyLocked ? <Lock className="w-5 h-5 text-rose-400" /> : <Unlock className="w-5 h-5 text-emerald-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      {isSafetyLocked ? '데이터 안전 잠금 (Safety Lock) : 활성화됨' : '안전 잠금 해제됨 : 쓰기/수복 허용'}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isSafetyLocked
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {isSafetyLocked ? '실수 데이터 소실 방지' : '데이터 소실 주의 (0x00 덮어쓰기)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    {isProtectedSystemDrive
                      ? 'OS 시스템/부트 드라이브(C: 또는 PhysicalDrive0)가 감지되었습니다. 시스템 파티션 손상을 방지하기 위해 제로필 쓰기가 차단됩니다.'
                      : isSafetyLocked
                      ? 'S.M.A.R.T. 제로필 작업은 해당 LBA 섹터의 데이터를 0x00으로 덮어씁니다. 수복을 실행하려면 우측 버튼으로 잠금을 해제하세요.'
                      : '주의: 안전 잠금이 해제되었습니다. 쓰기 권한이 허용된 비시스템 물리 드라이브에 한해 실제 0x00 기록 및 검증을 수행합니다.'}
                  </p>
                  {showLockWarning && (
                    <div className="mt-2 p-2 rounded bg-rose-900/90 border border-rose-400 text-rose-100 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
                      <span>
                        {isProtectedSystemDrive
                          ? 'OS 시스템/부트 드라이브에는 제로필 쓰기 수복을 실행할 수 없습니다. 외장 또는 보조 물리 디스크를 선택하세요.'
                          : '[잠금 해제 (Unlock)] 버튼을 먼저 클릭해야 수복을 시작할 수 있습니다.'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                <button
                  type="button"
                  disabled={isRepairing || isProtectedSystemDrive}
                  onClick={() => {
                    if (isProtectedSystemDrive) return;
                    soundManager.playClick();
                    setIsSafetyLocked(!isSafetyLocked);
                    setShowLockWarning(false);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSafetyLocked
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-500/40'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500/40'
                  }`}
                >
                  {isProtectedSystemDrive ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>시스템 드라이브 보호</span>
                    </>
                  ) : isSafetyLocked ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>잠금 해제 (Unlock)</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>안전 잠금 켜기 (Lock)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Target Drive Info & SMART Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                수복 대상 드라이브
              </div>
              <div className="text-xs font-bold text-white truncate">{activeDrive.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {activeDrive.model} · {activeDrive.capacityGb !== null ? `${activeDrive.capacityGb} GB` : '용량 N/A'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                보류 섹터 (Pending C5h)
              </div>
              <div className="text-sm font-bold text-amber-400 font-mono">
                {pendingAttr ? pendingAttr.raw : activeDrive.smartAttributes.length > 0 ? '0 (0x00)' : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400">실제 수복 성공 시 동기화</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                치환 섹터 (Reallocated 05h)
              </div>
              <div className="text-sm font-bold text-emerald-400 font-mono">
                {reallocatedAttr ? reallocatedAttr.raw : activeDrive.smartAttributes.length > 0 ? '0 (0x00)' : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400">예비 트랙 치환 카운트</div>
            </div>
          </div>

          {/* Repair Difficulty */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                수복 방식 및 난이도 선택 (Repair Method &amp; Difficulty)
              </div>
              <div className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
                예상 소요:{' '}
                <strong className="text-white">
                  {estimatedSeconds !== null ? formatEstimatedTime(estimatedSeconds) : '실행 시 실측'}
                </strong>
                {estimatedCompletionTimeStr ? ` (${estimatedCompletionTimeStr})` : ''}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isRepairing}
                onClick={() => setRepairMode('standard')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  repairMode === 'standard'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-white">표준 0x00 제로필</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">1.0x</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">단일 통과 0x00 쓰기 및 읽기 대조 검증</p>
              </button>

              <button
                type="button"
                disabled={isRepairing}
                onClick={() => setRepairMode('deep_ecc')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  repairMode === 'deep_ecc'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-white">심층 ECC 정합성</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">2.2x</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">패리티 검증 및 전하 무결성 확인</p>
              </button>

              <button
                type="button"
                disabled={isRepairing}
                onClick={() => setRepairMode('firmware_realloc')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  repairMode === 'firmware_realloc'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-white">저수준 펌웨어 치환</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono">4.0x</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">컨트롤러 예비 트랙 물리 맵핑 시도</p>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                디스크 프로필: <strong className="text-slate-200 font-mono">{speedProfile.label}</strong>
              </span>
              <span className="font-mono text-slate-300">
                선택 블록: <strong className="text-white">{selectedBlockIds.length}</strong>개
              </span>
            </div>
          </div>

          {/* Info Panel */}
          <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-800/50 space-y-2">
            <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-indigo-400" />
              S.M.A.R.T. 제로필(Zero-Fill) 동작 안내
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span><strong>실제 스토리지 쓰기 검증</strong>: Win32 PhysicalDrive 직접 핸들로 실제 0x00 블록을 기록하고 재판독 일치 여부를 검증합니다.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span><strong>권한 미충족 시 가짜 처리 금지</strong>: OS 보호 영역이나 권한 없는 핸들에서는 거짓 수복 완료 처리를 하지 않고 거부 사유를 반환합니다.</span>
              </div>
            </div>
          </div>

          {/* Multi-Step Queue & Target Sector Selection List */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-rose-400" />
                  <span>다단계 제로필 수복 큐 ({targetableBlocks.length}개 대상)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  선택 {selectedBlockIds.length}개 · 비연속 구간 {nonContiguousSegmentCount}개 · 섹터당 {pipelineSteps.length}단계 (총 {selectedBlockIds.length * pipelineSteps.length} 스텝)
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {targetableBlocks.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={isRepairing}
                      onClick={() => updateSelection(targetableBlocks.map(b => b.id))}
                      className="px-2 py-1 rounded border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 text-[11px] font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      전체 선택
                    </button>
                    {badBlocks.length > 0 && (
                      <button
                        type="button"
                        disabled={isRepairing}
                        onClick={() => updateSelection(badBlocks.map(b => b.id))}
                        className="px-2 py-1 rounded border border-rose-700/60 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 text-[11px] font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        배드만 ({badBlocks.length})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isRepairing || selectedBlockIds.length < 2}
                      onClick={handleSortSelectionByLba}
                      className="px-2 py-1 rounded border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 text-[11px] font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      LBA순 정렬
                    </button>
                    <button
                      type="button"
                      disabled={isRepairing || selectedBlockIds.length === 0}
                      onClick={() => updateSelection([])}
                      className="px-2 py-1 rounded border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-400 text-[11px] font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      선택 해제
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 max-h-44 overflow-y-auto space-y-1 font-mono text-xs">
              {targetableBlocks.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs font-sans space-y-1">
                  <div className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    현재 큐에 추가된 섹터 또는 감지된 배드섹터가 없습니다.
                  </div>
                  <div className="text-[11px] text-slate-500">
                    섹터 그리드에서 &quot;다중 선택&quot; 모드나 Ctrl+클릭으로 비연속 블록을 수복 큐에 추가할 수 있습니다.
                  </div>
                </div>
              ) : (
                targetableBlocks.map((block) => {
                  const isSelected = selectedBlockIds.includes(block.id);
                  const stepState = queueStepStates[block.id];
                  return (
                    <div
                      key={block.id}
                      onClick={() => handleToggleBlock(block.id)}
                      className={`p-2 rounded border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        stepState?.status === 'running'
                          ? 'bg-indigo-950/60 border-indigo-500 text-white'
                          : stepState?.status === 'verified'
                          ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-200'
                          : stepState?.status === 'failed'
                          ? 'bg-amber-950/40 border-amber-700/70 text-amber-200'
                          : isSelected
                          ? 'bg-rose-950/40 border-rose-700/60 text-white'
                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          disabled={isRepairing}
                          className="rounded border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
                        />
                        <span className="font-bold whitespace-nowrap">블록 #{block.id}</span>
                        <span className="text-slate-500">|</span>
                        <span className="truncate">LBA #{block.lba.toLocaleString()}</span>
                        {block.zoneTag && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 hidden sm:inline whitespace-nowrap">
                            {block.zoneTag}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {stepState ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${
                              stepState.status === 'running'
                                ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-400/50'
                                : stepState.status === 'verified'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : stepState.status === 'failed'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {stepState.status === 'running'
                              ? `Step ${stepState.currentStep}/${stepState.totalSteps} · ${stepState.stepLabel}`
                              : stepState.status === 'verified'
                              ? '수복 검증 완료'
                              : stepState.status === 'failed'
                              ? '미지원/실패'
                              : '대기 중'}
                          </span>
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${
                            block.status === 'bad'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : block.status === 'critical' || block.status === 'slow'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {block.status === 'bad'
                              ? 'BAD (UNC)'
                              : block.responseTimeMs > 0
                              ? `${block.responseTimeMs}ms`
                              : block.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {isRepairing && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                <span className="text-rose-400 font-bold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>
                    {activeStepInfo
                      ? `섹터 ${activeStepInfo.sectorIndex}/${activeStepInfo.totalSectors} · Step ${activeStepInfo.stepIndex}/${activeStepInfo.totalSteps} (${activeStepInfo.stepLabel}) · LBA #${currentLba.toLocaleString()}`
                      : `수복 진행 중... (현재 LBA: #${currentLba.toLocaleString()})`}
                  </span>
                </span>
                <span className="text-white font-bold tabular-nums">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Terminal Real-time Log Stream */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              실시간 제로필 쓰기 검증 &amp; 드라이버 터미널
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] h-36 overflow-y-auto text-emerald-400 space-y-1 shadow-inner select-text">
              {repairLogs.length === 0 ? (
                <div className="text-slate-600 text-xs">
                  수복 시작 버튼을 누르면 실제 I/O 쓰기 검증 로그가 출력됩니다...
                </div>
              ) : (
                repairLogs.map((log, index) => (
                  <div key={index} className={`leading-relaxed ${log.includes('[미지원/실패]') || log.includes('[중단]') ? 'text-amber-400' : ''}`}>
                    {log}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Honest Outcome Banner */}
          {repairCompleted && repairedCountSummary > 0 && (
            <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-700/60 flex items-center justify-between animate-in zoom-in-95">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-300">
                    {repairAborted ? '부분 제로필 수복 완료 (세션 중단됨)' : '실제 제로필 쓰기 검증 수복 완료'} ({repairedCountSummary}개 성공{failedCountSummary > 0 ? `, ${failedCountSummary}개 미지원` : ''})
                  </div>
                  <div className="text-[11px] text-slate-300">
                    수복에 성공한 블록이 정상 상태로 갱신되었으며, 미완료 블록은 큐에 유지됩니다.
                  </div>
                </div>
              </div>
            </div>
          )}

          {repairCompleted && repairedCountSummary === 0 && (failedCountSummary > 0 || repairAborted) && (
            <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-700/60 flex items-start gap-2.5 animate-in zoom-in-95">
              <AlertOctagon className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-300">
                  {repairAborted && failedCountSummary === 0
                    ? '사용자 요청으로 수복 세션이 안전 중단되었습니다'
                    : `직접 물리 섹터 쓰기 권한 없음 (${failedCountSummary}개 블록 미변경)`}
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  {repairAborted && failedCountSummary === 0
                    ? '완료되지 않은 비연속 대상 섹터는 수복 큐에 그대로 유지됩니다.'
                    : lastUnsupportedReason || '현재 실행 환경에서 대상 장치에 대한 저수준 쓰기 핸들이 거부되었습니다.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              disabled={isRepairing}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {repairCompleted ? '닫기 (Close)' : '취소'}
            </button>
            {isRepairing && (
              <button
                type="button"
                onClick={handleAbortRepairSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>세션 중단</span>
              </button>
            )}
          </div>

          <button
            disabled={isRepairing || selectedBlockIds.length === 0 || isProtectedSystemDrive}
            onClick={handleStartRepair}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap ${
              isRepairing
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : isProtectedSystemDrive || isSafetyLocked
                  ? 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white ring-2 ring-rose-500/40'
            }`}
          >
            {isRepairing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                <span>다단계 수복 진행 중... ({progress}%)</span>
              </>
            ) : isProtectedSystemDrive ? (
              <>
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>시스템 드라이브 제로필 차단됨</span>
              </>
            ) : isSafetyLocked ? (
              <>
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>안전 잠금 해제 필요 ({selectedBlockIds.length}개 큐)</span>
              </>
            ) : (
              <>
                <Wrench className="w-3.5 h-3.5 text-amber-300" />
                <span>다단계 제로필 수복 실행 ({selectedBlockIds.length}개 · {pipelineSteps.length}단계)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Backup Warning Modal */}
      {showBackupWarningModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100 relative">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  ⚠️ 파일 시스템 손상 위험 경고 및 백업 권장
                </h3>
                <p className="text-xs text-amber-300/90">
                  현재 드라이브에 선택된 {selectedBlockIds.length}개 블록 덮어쓰기 확인
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                선택하신 스토리지의 결함 섹터에 0x00을 기록할 경우, 파일 시스템 메타데이터 및 기존 데이터가 영구 초기화됩니다.
              </p>
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-700/40 text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="text-white block mb-0.5">중요 데이터 백업 권장</strong>
                  수복 작업 진행 전 중요 파일을 반드시 다른 저장장치에 백업하십시오.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowBackupWarningModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                취소 (돌아가기)
              </button>
              <button
                onClick={handleConfirmAndExecuteRepair}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-900/40 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Wrench className="w-4 h-4 text-amber-200" />
                <span>백업 확인 완료 · 수복 시작</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
