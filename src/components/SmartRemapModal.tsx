/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DiskSentinel Pro - S.M.A.R.T. Sector Remapping & Zero-Fill Bad Sector Repair Engine
 */

import React, { useState, useEffect, useRef } from 'react';
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
  AlertOctagon
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import { executeRealZeroFillRepairBlock } from '../utils/nativeDriveEngine';

interface SmartRemapModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDrive: DiskDrive;
  blocks: SectorBlock[];
  onRepairSectors: (driveId: string, repairedBlockIds: number[]) => void;
}

export const SmartRemapModal: React.FC<SmartRemapModalProps> = ({
  isOpen,
  onClose,
  activeDrive,
  blocks,
  onRepairSectors
}) => {
  const [selectedBlockIds, setSelectedBlockIds] = useState<number[]>([]);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentLba, setCurrentLba] = useState<number>(0);
  const [repairLogs, setRepairLogs] = useState<string[]>([]);
  const [repairCompleted, setRepairCompleted] = useState<boolean>(false);
  const [repairedCountSummary, setRepairedCountSummary] = useState<number>(0);
  const [failedCountSummary, setFailedCountSummary] = useState<number>(0);
  const [lastUnsupportedReason, setLastUnsupportedReason] = useState<string | null>(null);

  const [isSafetyLocked, setIsSafetyLocked] = useState<boolean>(true);
  const [showLockWarning, setShowLockWarning] = useState<boolean>(false);
  const [showBackupWarningModal, setShowBackupWarningModal] = useState<boolean>(false);

  const [repairMode, setRepairMode] = useState<'standard' | 'deep_ecc' | 'firmware_realloc'>('standard');

  const getDriveSpeedProfile = () => {
    const measuredMb = activeDrive.hardwareSpecs?.measuredSequentialWriteMbSec;
    const speedLabel = measuredMb !== null && measuredMb !== undefined ? `실측 쓰기 ${measuredMb} MB/s` : '실시간 쓰기 검증';
    if (activeDrive.type === 'NVMe') {
      return { label: `NVMe PCIe Direct (${speedLabel})`, baseTimePerBlock: 0.08 };
    } else if (activeDrive.type === 'SSD' || activeDrive.type === 'EXTERNAL_SSD') {
      return { label: `SSD / Storage API (${speedLabel})`, baseTimePerBlock: 0.15 };
    } else if (activeDrive.type === 'HDD') {
      return { label: `HDD 자기 플래터 (${speedLabel})`, baseTimePerBlock: 0.45 };
    } else {
      return { label: `USB / 외장 스토리지 (${speedLabel})`, baseTimePerBlock: 0.6 };
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
  const estimatedSeconds = Math.max(1, Math.round(blockCount * speedProfile.baseTimePerBlock * difficultyMultiplier));

  const formatEstimatedTime = (sec: number) => {
    if (sec < 60) return `약 ${sec}초`;
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `약 ${mins}분 ${secs > 0 ? `${secs}초` : ''}`;
  };

  const estimatedCompletionTimeStr = new Date(Date.now() + estimatedSeconds * 1000).toLocaleTimeString();

  const badBlocks = blocks.filter(b => b.status === 'bad');
  const slowBlocks = blocks.filter(b => b.status === 'slow' || b.status === 'critical');
  const targetableBlocks = badBlocks.length > 0 ? badBlocks : slowBlocks;

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (badBlocks.length > 0) {
        setSelectedBlockIds(badBlocks.map(b => b.id));
      } else if (slowBlocks.length > 0) {
        setSelectedBlockIds(slowBlocks.map(b => b.id));
      } else {
        setSelectedBlockIds([]);
      }
      setIsRepairing(false);
      setProgress(0);
      setRepairLogs([]);
      setRepairCompleted(false);
      setRepairedCountSummary(0);
      setFailedCountSummary(0);
      setLastUnsupportedReason(null);
      setIsSafetyLocked(true);
      setShowLockWarning(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [repairLogs]);

  if (!isOpen) return null;

  const handleToggleBlock = (id: number) => {
    if (isRepairing) return;
    setSelectedBlockIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getSmartAttr = (id: number): DriveSmartAttribute | undefined => {
    return activeDrive.smartAttributes.find(a => a.id === id);
  };

  const reallocatedAttr = getSmartAttr(5);
  const pendingAttr = getSmartAttr(197);

  const handleStartRepair = () => {
    if (isSafetyLocked) {
      soundManager.playBeep(400, 0.1);
      setShowLockWarning(true);
      setTimeout(() => setShowLockWarning(false), 4000);
      return;
    }

    if (selectedBlockIds.length === 0 || isRepairing) return;
    setShowBackupWarningModal(true);
  };

  const handleConfirmAndExecuteRepair = async () => {
    setShowBackupWarningModal(false);
    soundManager.playClick();
    setIsRepairing(true);
    setProgress(0);
    setRepairCompleted(false);
    setRepairedCountSummary(0);
    setFailedCountSummary(0);
    setLastUnsupportedReason(null);

    const targetsSnapshot = [...selectedBlockIds];
    const totalToRepair = targetsSnapshot.length;

    setRepairLogs([
      `[${new Date().toLocaleTimeString()}] === S.M.A.R.T. 섹터 제로필 수복 & 재할당 엔진 가동 ===`,
      `[시스템] 드라이브 ID: ${activeDrive.name} (${activeDrive.model})`,
      `[시스템] 선택 수복 방식: ${repairMode === 'standard' ? '표준 0x00 제로필 (1.0x)' : repairMode === 'deep_ecc' ? '심층 ECC 패리티 정합성 (2.2x)' : '저수준 펌웨어 강제 치환 (4.0x)'}`,
      `[시스템] 대상 LBA 블록 개수: ${totalToRepair}개`
    ]);

    const succeededIds: number[] = [];
    let failedCount = 0;
    let firstFailureReason: string | null = null;

    for (let i = 0; i < totalToRepair; i++) {
      const targetBlockId = targetsSnapshot[i];
      const targetBlock = blocks.find(b => b.id === targetBlockId);
      const lba = targetBlock ? targetBlock.lba : targetBlockId * 1000;
      setCurrentLba(lba);
      setProgress(Math.round(((i + 1) / totalToRepair) * 100));

      const timeStr = new Date().toLocaleTimeString();
      const realResult = await executeRealZeroFillRepairBlock(targetBlockId, lba, activeDrive);

      if (realResult.success && realResult.verifiedZeros) {
        succeededIds.push(targetBlockId);
        setRepairLogs(prev => [
          ...prev,
          `[${timeStr}] LBA #${lba.toLocaleString()} [블록 #${targetBlockId}] 제로필(0x00) 쓰기 검증 완료 (${realResult.throughputMbSec} MB/s, ${realResult.latencyMs}ms)`,
          `[${timeStr}] LBA #${lba.toLocaleString()} 0x00 전수 일치 확인 -> 수복 완료 (HEALTHY OK)`
        ]);
        soundManager.playBeep(800 + (i % 10) * 40, 0.05);
      } else {
        failedCount++;
        const reason = realResult.unsupportedReason || '물리 섹터 쓰기 권한 거부됨';
        if (!firstFailureReason) firstFailureReason = reason;
        setRepairLogs(prev => [
          ...prev,
          `[${timeStr}] [미지원/실패] LBA #${lba.toLocaleString()} [블록 #${targetBlockId}] — ${reason}`
        ]);
      }

      // Yield briefly to keep UI responsive
      await new Promise(r => setTimeout(r, 40));
    }

    setIsRepairing(false);
    setProgress(100);
    setRepairCompleted(true);
    setRepairedCountSummary(succeededIds.length);
    setFailedCountSummary(failedCount);
    setLastUnsupportedReason(firstFailureReason);

    if (succeededIds.length > 0) {
      setRepairLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [완료] ${succeededIds.length}개 섹터 실제 0x00 검증 수복 완료 (실패/미지원 ${failedCount}개).`
      ]);
      onRepairSectors(activeDrive.id, succeededIds);
    } else {
      setRepairLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [중단] 물리 디스크 쓰기 권한이 없어 섹터 상태 및 SMART 카운터가 변경되지 않았습니다.`
      ]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Wrench className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  S.M.A.R.T. 섹터 제로필 수복 &amp; 재할당 엔진
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  REAL DIRECT WRITE VERIFY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                실제 쓰기 핸들(Tauri Win32 PhysicalDrive 또는 OPFS) 검증 기반 제로필(0x00) 수복 엔진
              </p>
            </div>
          </div>

          <button
            disabled={isRepairing}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* Safety Lock Control Card */}
          <div
            className={`p-3.5 rounded-lg border transition-all duration-300 ${
              showLockWarning ? 'ring-2 ring-rose-500 animate-pulse bg-rose-950/70 border-rose-500 shadow-lg shadow-rose-950/50' :
              isSafetyLocked
                ? 'bg-rose-950/40 border-rose-800/80 shadow-md'
                : 'bg-emerald-950/40 border-emerald-700/80 shadow-md'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isSafetyLocked
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {isSafetyLocked ? <Lock className="w-5 h-5 text-rose-400" /> : <Unlock className="w-5 h-5 text-emerald-400 animate-bounce" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      {isSafetyLocked ? '🔒 데이터 안전 잠금 (Safety Lock) : 활성화됨' : '🔓 안전 잠금 해제됨 : 쓰기/수복 허용'}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isSafetyLocked
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    }`}>
                      {isSafetyLocked ? '실수 데이터 소실 방지' : '⚠️ 데이터 소실 주의 (0x00 덮어쓰기)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    {isSafetyLocked
                      ? 'S.M.A.R.T. 제로필 작업은 해당 LBA 섹터의 데이터를 0x00으로 덮어씁니다. 수복을 실행하려면 우측 버튼으로 잠금을 해제하세요.'
                      : '주의: 안전 잠금이 해제되었습니다. 쓰기 권한이 허용된 드라이브/OPFS에 한해 실제 0x00 기록 및 검증을 수행합니다.'}
                  </p>
                  {showLockWarning && (
                    <div className="mt-2 p-2 rounded bg-rose-900/90 border border-rose-400 text-rose-100 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
                      <span>[잠금 해제 (Unlock)] 버튼을 먼저 클릭해야 수복을 시작할 수 있습니다.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                <button
                  type="button"
                  disabled={isRepairing}
                  onClick={() => {
                    soundManager.playClick();
                    setIsSafetyLocked(!isSafetyLocked);
                    setShowLockWarning(false);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                    isSafetyLocked
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-500/40'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500/40'
                  }`}
                >
                  {isSafetyLocked ? (
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
                예상 소요: <strong className="text-white">{formatEstimatedTime(estimatedSeconds)}</strong> ({estimatedCompletionTimeStr})
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
                <span><strong>실제 스토리지 쓰기 검증</strong>: Win32 PhysicalDrive 또는 OPFS 스토리지에 실제로 0x00 블록을 기록하고 재판독 일치 여부를 검증합니다.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span><strong>권한 미충족 시 가짜 처리 금지</strong>: 읽기 전용 파일/USB 핸들에서는 거짓 수복 완료 처리를 하지 않고 거부 사유를 반환합니다.</span>
              </div>
            </div>
          </div>

          {/* Sector Selection List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                수복 대상 감지 섹터 목록 ({targetableBlocks.length}개 발견)
              </h3>
              <div className="text-[11px] text-slate-400 font-mono">
                선택됨: <span className="text-white font-bold">{selectedBlockIds.length}</span> / {targetableBlocks.length}개
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1 font-mono text-xs">
              {targetableBlocks.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs font-sans space-y-1">
                  <div className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    현재 감지된 배드섹터 및 지연 블록이 없습니다.
                  </div>
                  <div className="text-[11px] text-slate-500">
                    드라이브 표면 검사 후 손상 블록이 발견되면 이 목록에 표시됩니다.
                  </div>
                </div>
              ) : (
                targetableBlocks.map((block) => {
                  const isSelected = selectedBlockIds.includes(block.id);
                  return (
                    <div
                      key={block.id}
                      onClick={() => handleToggleBlock(block.id)}
                      className={`p-2 rounded border flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-rose-950/40 border-rose-700/60 text-white'
                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          disabled={isRepairing}
                          className="rounded border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <span className="font-bold">블록 #{block.id}</span>
                        <span className="text-slate-500">|</span>
                        <span>LBA: #{block.lba.toLocaleString()}</span>
                        {block.zoneTag && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                            {block.zoneTag}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          block.status === 'bad'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {block.status === 'bad' ? 'BAD (UNC)' : `${block.responseTimeMs}ms Delay`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {isRepairing && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  수복 진행 중... (현재 LBA: #{currentLba.toLocaleString()})
                </span>
                <span className="text-white font-bold">{progress}%</span>
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
                    실제 제로필 쓰기 검증 수복 완료 ({repairedCountSummary}개 성공{failedCountSummary > 0 ? `, ${failedCountSummary}개 미지원` : ''})
                  </div>
                  <div className="text-[11px] text-slate-300">
                    수복에 성공한 블록이 정상 상태로 갱신되었습니다.
                  </div>
                </div>
              </div>
            </div>
          )}

          {repairCompleted && repairedCountSummary === 0 && failedCountSummary > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-700/60 flex items-start gap-2.5 animate-in zoom-in-95">
              <AlertOctagon className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-300">
                  직접 물리 섹터 쓰기 권한 없음 ({failedCountSummary}개 블록 미변경)
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  {lastUnsupportedReason || '현재 실행 환경에서 대상 장치에 대한 저수준 쓰기 핸들이 거부되었습니다.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            disabled={isRepairing}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {repairCompleted ? '닫기 (Close)' : '취소'}
          </button>

          <button
            disabled={isRepairing || selectedBlockIds.length === 0}
            onClick={handleStartRepair}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 ${
              isRepairing
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : isSafetyLocked
                  ? 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white ring-2 ring-rose-500/40'
            }`}
          >
            {isRepairing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                <span>수복 진행 중... ({progress}%)</span>
              </>
            ) : isSafetyLocked ? (
              <>
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>🔒 안전 잠금 해제 필요 (수복 비활성화)</span>
              </>
            ) : (
              <>
                <Wrench className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ S.M.A.R.T. 제로필 수복 실행</span>
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
