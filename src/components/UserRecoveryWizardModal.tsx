/**
 * @file UserRecoveryWizardModal.tsx
 * @brief Genuine User & Expert Data Recovery, Partition & Forensics Wizard.
 *        Operates directly on Tauri Win32 Physical Drives OR user-selected Local Disk Images / Files
 *        via File.slice() streaming, with real file extraction & JSON report downloads.
 * @license Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppLocale,
  DiskDrive,
  LbaFileTraceResult
} from '../types';
import {
  formatByteSize,
  RawMediaTarget,
  RealCloneRecoveryResult,
  RealPartitionRecoveryResult,
  RealSanitizeAuditResult,
  RecoveredFileArtifact,
  runExpertBitCarveReal,
  runWizardDdrescueCloneReal,
  runWizardSanitizeAuditReal,
  scanDeletedFilesReal,
  scanLostPartitionsReal,
  scanSignatureCarvingReal,
  traceLbaWizardReal,
  triggerBlobDownload
} from '../utils/realRecoveryEngine';
import { RecoveryCarveInspectionReport, WipePatternMode } from '../utils/recoveryDllBridge';
import { computeSectorEntropySync } from '../utils/forensicsDllBridge';
import { isTauriDesktopRuntime } from '../utils/nativeDriveEngine';
import {
  buildDiagnosticFat32DiskImageBytes,
  isBrowserMountedDrive
} from '../utils/browserImageMount';
import {
  RecoveryCompletionSummaryModal,
  RecoverySummaryData,
  RecoverySummaryItem
} from './RecoveryCompletionSummaryModal';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  Eraser,
  FileCheck,
  FileSearch,
  FolderTree,
  HardDrive,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
  Wand2,
  X
} from 'lucide-react';

interface UserRecoveryWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  selectedDriveId: string;
  locale: AppLocale;
}

type WizardScenario =
  | 'deleted_files'
  | 'formatted_drive'
  | 'lost_partition'
  | 'bad_sector_clone'
  | 'carving'
  | 'mft'
  | 'sanitize';

type WizardResultSummary =
  | {
      type: 'deleted_files' | 'formatted_drive';
      files: RecoveredFileArtifact[];
      detectedFilesystem?: string;
      scannedCount: number;
    }
  | {
      type: 'lost_partition';
      result: RealPartitionRecoveryResult;
    }
  | {
      type: 'bad_sector_clone';
      result: RealCloneRecoveryResult;
    }
  | {
      type: 'carving';
      report: RecoveryCarveInspectionReport;
      entropy: ReturnType<typeof computeSectorEntropySync>;
      rawBytes: Uint8Array;
    }
  | {
      type: 'mft';
      trace: LbaFileTraceResult;
    }
  | {
      type: 'sanitize';
      audit: RealSanitizeAuditResult;
    };

export const UserRecoveryWizardModal: React.FC<UserRecoveryWizardModalProps> = ({
  isOpen,
  onClose,
  drives,
  selectedDriveId,
  locale
}) => {
  const en = locale === 'en';
  const [activeScenario, setActiveScenario] = useState<WizardScenario>('deleted_files');
  const [step, setStep] = useState<number>(1);
  const [targetMode, setTargetMode] = useState<'drive' | 'file'>(() =>
    drives.length > 0 && isTauriDesktopRuntime() ? 'drive' : 'file'
  );
  const [targetDriveId, setTargetDriveId] = useState<string>(selectedDriveId || drives[0]?.id || '');
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localSectorSize, setLocalSectorSize] = useState<number>(512);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<WizardResultSummary | null>(null);
  const [recoveredArtifacts, setRecoveredArtifacts] = useState<RecoveredFileArtifact[]>([]);

  // Recovery Completion Summary Modal state
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState<boolean>(false);
  const [completionSummaryData, setCompletionSummaryData] = useState<RecoverySummaryData>({
    scenarioTitle: 'Data Recovery',
    driveModel: 'No Target',
    totalFilesScanCount: 0,
    recoveredFilesCount: 0,
    successRatePct: 0,
    totalBytesFormatted: '0 B',
    durationSeconds: 0,
    recoveredItemList: []
  });

  // Scenario-specific parameters
  const [fileFilterType, setFileFilterType] = useState<string>('all');
  const [maxScanMb, setMaxScanMb] = useState<number>(32);
  const [cloneStartLba, setCloneStartLba] = useState<number>(0);
  const [cloneSectorSpan, setCloneSectorSpan] = useState<number>(2048);
  const [carveTargetLba, setCarveTargetLba] = useState<number>(0);
  const [carveInputHex, setCarveInputHex] = useState<string>(
    '89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52 00 00 03 20 00 00 02 58 08 06 00 00 00'
  );
  const [mftTargetLba, setMftTargetLba] = useState<number>(2048);
  const [wipeMode, setWipeMode] = useState<WipePatternMode>(3);
  const [wipeSeedStr, setWipeSeedStr] = useState<string>('0x123456789ABCDEF0');
  const [wipeTargetLba, setWipeTargetLba] = useState<number>(0);

  useEffect(() => {
    const selectableDrives = drives.filter(d => isTauriDesktopRuntime() || isBrowserMountedDrive(d));
    if (selectableDrives.length > 0) {
      setTargetDriveId(prev =>
        selectableDrives.some(d => d.id === prev) ? prev : selectedDriveId || selectableDrives[0].id
      );
      if (!localFile) setTargetMode('drive');
    } else if (!localFile) {
      setTargetMode('file');
    }
  }, [drives, selectedDriveId, localFile]);

  const currentDrive = useMemo(() => {
    return drives.find(d => d.id === targetDriveId) || drives[0];
  }, [drives, targetDriveId]);

  if (!isOpen) return null;

  const canUseDrive = (d?: DiskDrive) => Boolean(d && (isTauriDesktopRuntime() || isBrowserMountedDrive(d)));

  const resolveMediaTarget = (): RawMediaTarget | null => {
    if (targetMode === 'drive' && canUseDrive(currentDrive) && currentDrive) {
      return { kind: 'tauri_drive', drive: currentDrive };
    }
    if (targetMode === 'file' && localFile) {
      return { kind: 'local_file', file: localFile, sectorSize: localSectorSize };
    }
    if (canUseDrive(currentDrive) && currentDrive) {
      return { kind: 'tauri_drive', drive: currentDrive };
    }
    return null;
  };

  const getTargetLabel = (): string => {
    if (targetMode === 'file' && localFile) {
      return `${localFile.name} (${formatByteSize(localFile.size)})`;
    }
    if (currentDrive) {
      return `${currentDrive.model} (${currentDrive.hardwareSpecs?.devicePhysicalPath || currentDrive.mountPoint || currentDrive.id})`;
    }
    if (activeScenario === 'carving') return 'Custom Hex Stream';
    if (activeScenario === 'sanitize') return 'NIST SP 800-88 Pattern Engine';
    return 'No Target Mounted';
  };

  const canProceedFromStep2 = (): boolean => {
    if (activeScenario === 'carving' || activeScenario === 'sanitize') {
      return true; // Can analyze hex stream / wipe pattern even without block device
    }
    return resolveMediaTarget() !== null;
  };

  const appendLog = (logs: string[], msg: string) => {
    logs.push(msg);
    setExecutionLog([...logs]);
  };

  const handleRunWizard = async () => {
    const mediaTarget = resolveMediaTarget();
    if (!mediaTarget && activeScenario !== 'carving' && activeScenario !== 'sanitize') {
      setExecutionError(
        en
          ? 'Please select a Tauri physical drive or mount a local disk image / binary file in Step 2.'
          : '2단계에서 물리 드라이브를 선택하거나 로컬 디스크 이미지(.img/.dd/.bin) 파일을 선택해 주세요.'
      );
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionLog([]);
    setResultSummary(null);
    setRecoveredArtifacts([]);

    const startTime = performance.now();
    const logs: string[] = [];
    const targetDesc = getTargetLabel();
    appendLog(logs, `[Wizard Init] Target: ${targetDesc}`);
    appendLog(logs, `[Scenario] ${activeScenario.toUpperCase()} Real Recovery Pipeline`);

    try {
      let summaryItems: RecoverySummaryItem[] = [];
      let totalScanned = 0;
      let recoveredCount = 0;
      let successRate = 0;
      let totalBytes = 0;
      let artifacts: RecoveredFileArtifact[] = [];

      if (activeScenario === 'deleted_files' && mediaTarget) {
        const res = await scanDeletedFilesReal(mediaTarget, {
          fileFilterType,
          onLog: m => appendLog(logs, m)
        });
        artifacts = res.files;
        totalScanned = res.totalEntriesScanned;
        recoveredCount = res.files.length;
        totalBytes = res.files.reduce((acc, f) => acc + f.sizeBytes, 0);
        const avgConf =
          res.files.length > 0
            ? res.files.reduce((acc, f) => acc + f.confidencePct, 0) / res.files.length
            : 0;
        successRate = Number(avgConf.toFixed(1));
        summaryItems = res.files.slice(0, 50).map(f => ({
          id: f.id,
          name: f.name,
          size: f.sizeFormatted,
          path: f.path,
          status: f.status,
          canDownload: true
        }));
        setRecoveredArtifacts(artifacts);
        setResultSummary({
          type: 'deleted_files',
          files: res.files,
          detectedFilesystem: res.detectedFilesystem,
          scannedCount: res.totalEntriesScanned
        });
      } else if (activeScenario === 'formatted_drive' && mediaTarget) {
        const res = await scanSignatureCarvingReal(mediaTarget, {
          fileFilterType,
          maxScanBytes: maxScanMb * 1024 * 1024,
          maxFiles: 120,
          onLog: m => appendLog(logs, m)
        });
        artifacts = res.files;
        totalScanned = res.sectorsScanned;
        recoveredCount = res.files.length;
        totalBytes = res.files.reduce((acc, f) => acc + f.sizeBytes, 0);
        const verifiedCount = res.files.filter(f => f.footerVerified).length;
        successRate =
          res.files.length > 0
            ? Number((((verifiedCount * 100 + (res.files.length - verifiedCount) * 72) / res.files.length)).toFixed(1))
            : 0;
        summaryItems = res.files.slice(0, 50).map(f => ({
          id: f.id,
          name: f.name,
          size: f.sizeFormatted,
          path: f.path,
          status: f.status,
          canDownload: true
        }));
        setRecoveredArtifacts(artifacts);
        setResultSummary({
          type: 'formatted_drive',
          files: res.files,
          scannedCount: res.sectorsScanned
        });
      } else if (activeScenario === 'lost_partition' && mediaTarget) {
        const res = await scanLostPartitionsReal(mediaTarget, m => appendLog(logs, m));
        totalScanned = res.scannedOffsetsCount;
        recoveredCount = res.partitions.length;
        totalBytes = res.partitions.reduce((acc, p) => acc + p.sectorCount * res.sectorSize, 0);
        const intactCount = res.partitions.filter(p => p.vbrValid || p.status.includes('Valid')).length;
        successRate =
          res.partitions.length > 0
            ? Number(((intactCount / res.partitions.length) * 100).toFixed(1))
            : res.mbrSignatureValid
            ? 100
            : 0;
        summaryItems = res.partitions.map(p => ({
          id: `part-${p.index}-${p.startLba}`,
          name: `Partition #${p.index} (${p.filesystem})`,
          size: p.sizeFormatted,
          path: `LBA ${p.startLba.toLocaleString()}~${p.endLba.toLocaleString()}`,
          status: p.status,
          canDownload: Boolean(p.headerBytes && p.headerBytes.length > 0)
        }));
        // Register partition VBR/table artifacts for export
        artifacts = res.partitions
          .filter(p => p.headerBytes && p.headerBytes.length > 0)
          .map(p => ({
            id: `part-${p.index}-${p.startLba}`,
            name: `Partition_${p.index}_LBA${p.startLba}_VBR.bin`,
            extension: 'bin',
            category: 'system' as const,
            sizeBytes: p.headerBytes!.length,
            sizeFormatted: formatByteSize(p.headerBytes!.length),
            path: `LBA ${p.startLba}`,
            offsetBytes: p.startLba * res.sectorSize,
            startLba: p.startLba,
            confidencePct: 100,
            status: p.status,
            sourceMethod: 'Partition Table / VBR',
            extractPayload: async () => p.headerBytes!
          }));
        setRecoveredArtifacts(artifacts);
        setResultSummary({ type: 'lost_partition', result: res });
      } else if (activeScenario === 'bad_sector_clone' && mediaTarget) {
        const res = await runWizardDdrescueCloneReal(mediaTarget, {
          startLba: cloneStartLba,
          maxSectors: cloneSectorSpan,
          chunkSectors: 128,
          onLog: m => appendLog(logs, m)
        });
        totalScanned = res.rangeEndLba - res.rangeStartLba + 1;
        recoveredCount = res.clonedBytesCount > 0 ? 1 : 0;
        totalBytes = res.clonedBytesCount;
        const okSectors = Math.max(0, totalScanned - res.badSectorsCount);
        successRate = totalScanned > 0 ? Number(((okSectors / totalScanned) * 100).toFixed(1)) : 0;

        const sliceArtifact: RecoveredFileArtifact = {
          id: `ddrescue-img-${res.rangeStartLba}-${res.rangeEndLba}`,
          name: `Clone_LBA_${res.rangeStartLba}_${res.rangeEndLba}.img`,
          extension: 'img',
          category: 'system',
          sizeBytes: res.clonedBytesCount,
          sizeFormatted: formatByteSize(res.clonedBytesCount),
          path: `LBA ${res.rangeStartLba}~${res.rangeEndLba}`,
          offsetBytes: res.rangeStartLba * res.sectorSize,
          startLba: res.rangeStartLba,
          confidencePct: successRate,
          status: res.badSectorsCount === 0 ? 'Imaged (0 Bad)' : `Imaged (${res.badSectorsCount} Bad)`,
          sourceMethod: 'ddrescue Multi-Pass Engine',
          extractPayload: async () => res.clonedSliceBytes ?? new Uint8Array(0)
        };
        const mapArtifact: RecoveredFileArtifact = {
          id: `ddrescue-map-${res.rangeStartLba}`,
          name: `Clone_LBA_${res.rangeStartLba}_${res.rangeEndLba}.map.json`,
          extension: 'json',
          category: 'docs',
          sizeBytes: res.mapJsonContent.length,
          sizeFormatted: formatByteSize(res.mapJsonContent.length),
          path: `${res.plan.intervals.length} domain intervals`,
          offsetBytes: 0,
          startLba: res.rangeStartLba,
          confidencePct: 100,
          status: 'Mapfile Ready',
          sourceMethod: res.plan.engineSource,
          extractPayload: async () => new TextEncoder().encode(res.mapJsonContent)
        };
        artifacts = [sliceArtifact, mapArtifact];
        summaryItems = artifacts.map(a => ({
          id: a.id,
          name: a.name,
          size: a.sizeFormatted,
          path: a.path,
          status: a.status,
          canDownload: true
        }));
        setRecoveredArtifacts(artifacts);
        setResultSummary({ type: 'bad_sector_clone', result: res });
      } else if (activeScenario === 'carving') {
        appendLog(logs, `[Bit Carver] Inspecting signature stream (${carveInputHex.trim() ? 'Hex Input' : `LBA #${carveTargetLba}`})...`);
        const carveRes = await runExpertBitCarveReal(mediaTarget, carveInputHex, carveTargetLba);
        totalScanned = carveRes.rawBytes.length;
        recoveredCount = carveRes.report.isZeroFilled ? 0 : 1;
        totalBytes = carveRes.rawBytes.length;
        successRate = carveRes.report.confidenceScore;

        const ext = carveRes.report.fileExtension || 'bin';
        const carvedArtifact: RecoveredFileArtifact = {
          id: `expert-carve-${carveTargetLba}`,
          name: `Carved_LBA${carveTargetLba}.${ext}`,
          extension: ext,
          category: 'other',
          sizeBytes: carveRes.rawBytes.length,
          sizeFormatted: formatByteSize(carveRes.rawBytes.length),
          path: `LBA #${carveTargetLba}`,
          offsetBytes: carveTargetLba * 512,
          startLba: carveTargetLba,
          confidencePct: carveRes.report.confidenceScore,
          status: `${carveRes.report.signatureName} (${carveRes.report.confidenceScore}%)`,
          sourceMethod: carveRes.report.engineSource,
          shannonEntropy: carveRes.report.shannonEntropy,
          crc32Hex: `0x${carveRes.report.crc32.toString(16).toUpperCase().padStart(8, '0')}`,
          footerVerified: carveRes.report.footerDetected,
          extractPayload: async () => carveRes.rawBytes
        };
        artifacts = [carvedArtifact];
        summaryItems = [
          {
            id: carvedArtifact.id,
            name: carvedArtifact.name,
            size: carvedArtifact.sizeFormatted,
            path: carvedArtifact.path,
            status: carvedArtifact.status,
            canDownload: true
          }
        ];
        appendLog(
          logs,
          `[Bit Carver] Signature=${carveRes.report.signatureName}, Confidence=${carveRes.report.confidenceScore}%, Entropy=${carveRes.report.shannonEntropy.toFixed(3)}, CRC32=0x${carveRes.report.crc32.toString(16).toUpperCase().padStart(8, '0')}`
        );
        setRecoveredArtifacts(artifacts);
        setResultSummary({ type: 'carving', ...carveRes });
      } else if (activeScenario === 'mft' && mediaTarget) {
        const trace = await traceLbaWizardReal(mediaTarget, mftTargetLba, m => appendLog(logs, m));
        totalScanned = trace.mftRecordsScanned;
        recoveredCount = trace.affectedFiles.length;
        totalBytes = trace.affectedFiles.reduce((acc, f) => acc + (f.fileSizeBytes || 0), 0);
        successRate = trace.supported ? (trace.affectedFiles.length > 0 ? 100 : 100) : 0;
        summaryItems = trace.affectedFiles.map((f, idx) => ({
          id: `mft-${f.mftRecordNumber ?? idx}`,
          name: f.fileName,
          size: formatByteSize(f.fileSizeBytes),
          path: f.fullPath,
          status: f.matchConfidence,
          canDownload: false
        }));
        appendLog(logs, `[MFT Tracer] ${trace.diagnosticNote}`);
        setResultSummary({ type: 'mft', trace });
      } else if (activeScenario === 'sanitize') {
        appendLog(logs, `[NIST SP 800-88] Generating pattern (mode=${wipeMode}) & auditing LBA #${wipeTargetLba}...`);
        const audit = await runWizardSanitizeAuditReal(mediaTarget, wipeMode, wipeSeedStr, wipeTargetLba);
        totalScanned = audit.auditedSourceBytesLen;
        recoveredCount = 1;
        totalBytes = audit.gen.bytes.length;
        const residualRatio =
          audit.verify.checkedBytes > 0
            ? audit.verify.residualNonMatchingBytes / audit.verify.checkedBytes
            : 0;
        successRate = audit.verify.verifiedClean ? 100 : Number(((1 - residualRatio) * 100).toFixed(1));

        const patternArtifact: RecoveredFileArtifact = {
          id: 'sanitize-pattern',
          name: `NIST_WipePattern_LBA${wipeTargetLba}.bin`,
          extension: 'bin',
          category: 'system',
          sizeBytes: audit.gen.bytes.length,
          sizeFormatted: formatByteSize(audit.gen.bytes.length),
          path: `LBA #${wipeTargetLba}`,
          offsetBytes: wipeTargetLba * audit.sectorSize,
          startLba: wipeTargetLba,
          confidencePct: 100,
          status: `CRC32 0x${audit.gen.crc32.toString(16).toUpperCase().padStart(8, '0')}`,
          sourceMethod: audit.gen.engineSource,
          extractPayload: async () => new Uint8Array(audit.gen.bytes)
        };
        const certArtifact: RecoveredFileArtifact = {
          id: 'sanitize-cert',
          name: `Sanitize_Audit_LBA${wipeTargetLba}.json`,
          extension: 'json',
          category: 'docs',
          sizeBytes: audit.certificateJson.length,
          sizeFormatted: formatByteSize(audit.certificateJson.length),
          path: `Residual ${(residualRatio * 100).toFixed(1)}%`,
          offsetBytes: 0,
          startLba: wipeTargetLba,
          confidencePct: successRate,
          status: audit.verify.verifiedClean ? 'Sanitize Verified' : 'Residual Data Found',
          sourceMethod: audit.verify.engineSource,
          extractPayload: async () => new TextEncoder().encode(audit.certificateJson)
        };
        artifacts = [certArtifact, patternArtifact];
        summaryItems = artifacts.map(a => ({
          id: a.id,
          name: a.name,
          size: a.sizeFormatted,
          path: a.path,
          status: a.status,
          canDownload: true
        }));
        appendLog(
          logs,
          `[NIST SP 800-88] Pattern CRC32=0x${audit.gen.crc32.toString(16).toUpperCase().padStart(8, '0')}, Sanitized=${audit.verify.verifiedClean}, Residual=${(residualRatio * 100).toFixed(2)}%`
        );
        setRecoveredArtifacts(artifacts);
        setResultSummary({ type: 'sanitize', audit });
      }

      const durationSec = Math.max(1, Math.round((performance.now() - startTime) / 1000));
      setCompletionSummaryData({
        scenarioTitle: activeScenario.toUpperCase().replace(/_/g, ' '),
        driveModel: targetDesc,
        totalFilesScanCount: totalScanned,
        recoveredFilesCount: recoveredCount,
        successRatePct: successRate,
        totalBytesFormatted: formatByteSize(totalBytes),
        durationSeconds: durationSec,
        recoveredItemList: summaryItems
      });

      appendLog(logs, `[Wizard Complete] Execution finished in ${durationSec}s.`);
      setIsExecuting(false);
      setStep(4);
      setIsCompletionModalOpen(true);
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Unknown error';
      appendLog(logs, `[Error] ${msg}`);
      setExecutionError(msg);
      setIsExecuting(false);
      setStep(4);
    }
  };

  const handleDownloadArtifact = async (artifact: RecoveredFileArtifact) => {
    const bytes = await artifact.extractPayload();
    if (bytes.length > 0) {
      triggerBlobDownload(bytes, artifact.name);
    }
  };

  const handleExportJsonReport = () => {
    const reportObj = {
      exportedAt: new Date().toISOString(),
      scenario: activeScenario,
      target: getTargetLabel(),
      summary: completionSummaryData,
      logs: executionLog
    };
    triggerBlobDownload(
      JSON.stringify(reportObj, null, 2),
      `DiskSentinel-Recovery-${activeScenario}-${Date.now()}.json`,
      'application/json'
    );
  };

  const handleBatchDownloadAll = async () => {
    const limit = Math.min(recoveredArtifacts.length, 10);
    for (let i = 0; i < limit; i++) {
      await handleDownloadArtifact(recoveredArtifacts[i]);
    }
  };

  const handleFileChosen = (file: File | null | undefined) => {
    if (!file) return;
    setLocalFile(file);
    setTargetMode('file');
    setExecutionError(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs select-none"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-4xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-md bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0">
                <Wand2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {en ? 'Comprehensive Data Recovery & Partition Wizard' : '통합 데이터 복구 및 파티션 마법사'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {en
                    ? 'Real binary extraction for physical drives and local disk image files (.img, .dd, .bin)'
                    : '물리 디스크 또는 로컬 디스크 이미지(.img, .dd, .bin) 대상 실제 바이너리 스캔 및 복구'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step Indicator Bar */}
          <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#0B101D] text-xs font-semibold">
            {[
              { s: 1, label: en ? '1. Scenario' : '1. 복구 시나리오' },
              { s: 2, label: en ? '2. Target Media' : '2. 대상 디스크/이미지' },
              { s: 3, label: en ? '3. Options' : '3. 상세 옵션' },
              { s: 4, label: en ? '4. Results & Save' : '4. 결과 및 추출' }
            ].map(item => (
              <div
                key={item.s}
                className={`py-3 px-3 text-center truncate border-r last:border-r-0 border-slate-200 dark:border-slate-800 ${
                  step === item.s
                    ? 'bg-blue-600 text-white font-bold'
                    : step > item.s
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-600/5'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </div>
            ))}
          </div>

          {/* Wizard Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {en ? 'Select Recovery Scenario' : '어떤 복구/분석 작업을 실행할까요?'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {[
                    {
                      id: 'deleted_files',
                      title: en ? 'Deleted File Recovery (MFT / FAT32)' : '삭제 파일 복구 (NTFS $MFT · FAT32)',
                      desc: en
                        ? 'Scan unlinked $MFT records & FAT32 0xE5 entries to extract recoverable files.'
                        : '삭제된 NTFS $MFT 레코드와 FAT32 0xE5 엔트리를 직접 스캔해 원본 파일을 추출합니다.',
                      icon: Trash2,
                      color: 'text-blue-500'
                    },
                    {
                      id: 'formatted_drive',
                      title: en ? 'Formatted Media Signature Carver' : '포맷된 미디어 시그니처 딥 카빙',
                      desc: en
                        ? 'Scan raw sectors/images for JPEG, PNG, PDF, ZIP, MP4, WAV, GIF headers & footers.'
                        : '포맷된 디스크나 이미지에서 JPEG/PNG/PDF/ZIP/MP4 헤더·푸터를 찾아 직접 추출합니다.',
                      icon: HardDrive,
                      color: 'text-sky-500'
                    },
                    {
                      id: 'lost_partition',
                      title: en ? 'Lost Partition & MBR/GPT Recovery' : '실종 파티션 및 MBR·GPT/VBR 복구',
                      desc: en
                        ? 'Inspect MBR/GPT, verify Backup GPT CRC, and discover orphaned NTFS/FAT32 VBRs.'
                        : 'LBA 0~33 MBR/GPT 검증과 미연결(Orphan) 볼륨 부트 레코드(VBR)를 탐색합니다.',
                      icon: RotateCcw,
                      color: 'text-blue-600'
                    },
                    {
                      id: 'bad_sector_clone',
                      title: en ? 'Bad Sector ddrescue Image Cloner' : '배드섹터 ddrescue 안전 이미징 & 맵 생성',
                      desc: en
                        ? 'Probe & clone LBA ranges while building a coalesced .map.json recovery plan.'
                        : 'LBA 범위를 판독해 .img 백업 슬라이스와 ddrescue 도메인 맵(.map.json)을 생성합니다.',
                      icon: Layers,
                      color: 'text-amber-500'
                    },
                    {
                      id: 'carving',
                      title: en ? '16+ Signature Bit Carving (Expert)' : '16+ 시그니처 비트 카빙 (전문가)',
                      desc: en
                        ? 'Analyze raw LBA or hex bytes with Hamming bit-flip correction, entropy & CRC32.'
                        : '원시 LBA 또는 헥스 스트림의 Hamming 비트 정정, Shannon 엔트로피, CRC32를 검증합니다.',
                      icon: FileSearch,
                      color: 'text-indigo-500'
                    },
                    {
                      id: 'mft',
                      title: en ? 'NTFS $MFT Extent Tracer (Expert)' : 'NTFS $MFT LBA 파일 역추적',
                      desc: en
                        ? 'Map a specific LBA to NTFS $MFT non-resident Data Runs and file hierarchy.'
                        : '특정 손상 LBA가 어느 파일의 $MFT 데이터 런(LCN)에 속하는지 역추적합니다.',
                      icon: FolderTree,
                      color: 'text-sky-600'
                    },
                    {
                      id: 'sanitize',
                      title: en ? 'NIST SP 800-88 Wipe & Audit' : 'NIST SP 800-88 패턴 생성 및 잔존 감사',
                      desc: en
                        ? 'Generate deterministic NIST wipe pattern & audit residual bytes on media/LBA.'
                        : 'Xoshiro256**/0x00 패턴을 생성하고 대상 LBA의 잔존 데이터 여부를 감사 리포트로 검증합니다.',
                      icon: Eraser,
                      color: 'text-emerald-500'
                    }
                  ].map(sc => {
                    const Icon = sc.icon;
                    const active = activeScenario === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => setActiveScenario(sc.id as WizardScenario)}
                        className={`p-3.5 rounded-md border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-600/10 dark:bg-blue-500/15 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50 dark:bg-[#090D16]'
                        }`}
                      >
                        <div className={`p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 ${sc.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">{sc.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{sc.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {en ? 'Select Physical Drive or Local Disk Image File' : '대상 물리 드라이브 또는 로컬 디스크 이미지 파일 선택'}
                  </h3>
                  {drives.some(d => isTauriDesktopRuntime() || isBrowserMountedDrive(d)) && (
                    <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setTargetMode('drive')}
                        className={`px-3 py-1 font-semibold cursor-pointer whitespace-nowrap ${
                          targetMode === 'drive'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {en ? 'Mounted / Physical Drive' : '연결 / 마운트 드라이브'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetMode('file')}
                        className={`px-3 py-1 font-semibold cursor-pointer whitespace-nowrap ${
                          targetMode === 'file'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {en ? 'Disk Image File' : '이미지 파일 (.img/.dd)'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Physical Drives List when available */}
                {targetMode === 'drive' && drives.length > 0 && (
                  <div className="space-y-2">
                    {drives.map(d => {
                      const physPath = d.hardwareSpecs?.devicePhysicalPath || d.mountPoint || d.id;
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center justify-between p-3.5 rounded-md border cursor-pointer transition-colors ${
                            targetDriveId === d.id
                              ? 'border-blue-600 bg-blue-600/10 dark:bg-blue-500/15'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="radio"
                              name="targetDrive"
                              checked={targetDriveId === d.id}
                              onChange={() => setTargetDriveId(d.id)}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                {d.mountPoint ? `[${d.mountPoint}] ` : ''}{d.model} ({physPath})
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {d.capacityGb !== null ? `${d.capacityGb} GB` : 'N/A'} · FileSystem: {d.fileSystem || 'Unknown'} · Sectors: {d.totalSectors.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-600/20 text-blue-600 dark:text-blue-300 shrink-0">
                            {d.isExternal ? 'EXTERNAL / USB' : 'INTERNAL'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Local Disk Image / Binary File Picker (Always usable in Web Browser AND Tauri) */}
                {(targetMode === 'file' || !drives.some(d => isTauriDesktopRuntime() || isBrowserMountedDrive(d))) && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-md bg-blue-600/10 border border-blue-600/30 text-xs text-blue-800 dark:text-blue-200 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold">
                            {en
                              ? 'Local Disk Image / File Target'
                              : '로컬 디스크 이미지 / 바이너리 파일 분석 모드'}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                            {en
                              ? 'Select a disk image (.img, .dd, .vhd, .bin) or generate a ready-to-scan 8MB FAT32 diagnostic image with deleted files.'
                              : 'PC의 디스크 이미지(.img, .dd, .bin)를 선택하거나, 삭제 파일과 MBR/FAT32 구조가 포함된 진단용 8MB 이미지를 즉시 생성해 복구를 실행하세요.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const bytes = buildDiagnosticFat32DiskImageBytes();
                          const copy = new Uint8Array(bytes.length);
                          copy.set(bytes);
                          const diagFile = new File([copy.buffer], 'DiskSentinel_Diag_8MB.img', {
                            type: 'application/octet-stream',
                            lastModified: Date.now()
                          });
                          setLocalSectorSize(512);
                          handleFileChosen(diagFile);
                        }}
                        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {en ? 'Load 8MB FAT32 Sample Image' : '8MB FAT32 진단 이미지 즉시 장착'}
                      </button>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={e => handleFileChosen(e.target.files?.[0])}
                    />

                    <div
                      onDragOver={e => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        handleFileChosen(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-6 rounded-md border-2 border-dashed text-center cursor-pointer transition-colors space-y-2 ${
                        isDraggingFile
                          ? 'border-blue-500 bg-blue-500/10'
                          : localFile
                          ? 'border-emerald-500/60 bg-emerald-500/5'
                          : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-[#090D16]'
                      }`}
                    >
                      <Upload className={`w-7 h-7 mx-auto ${localFile ? 'text-emerald-500' : 'text-blue-500'}`} />
                      {localFile ? (
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {localFile.name}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatByteSize(localFile.size)} ({Math.floor(localFile.size / localSectorSize).toLocaleString()} sectors @ {localSectorSize}B)
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {en ? 'Click or drop another file to replace' : '다른 파일을 드롭하거나 클릭하여 변경'}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {en
                              ? 'Click to browse or drag & drop disk image (.img, .dd, .vhd, .bin, or any file)'
                              : '디스크 이미지(.img, .dd, .vhd, .bin) 또는 분석할 파일을 클릭/드래그하여 선택'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {en
                              ? 'Streaming File.slice() reader — handles large images safely without loading entire file into RAM'
                              : 'File.slice() 스트리밍 판독 — 대용량 이미지도 메모리 과부하 없이 섹터 단위로 직접 스캔합니다'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <label className="text-slate-500 dark:text-slate-400 font-semibold">
                        {en ? 'Logical Sector Geometry:' : '논리 섹터 크기:'}
                      </label>
                      <select
                        value={localSectorSize}
                        onChange={e => setLocalSectorSize(Number(e.target.value))}
                        className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                      >
                        <option value={512}>512 Bytes / Sector (Standard)</option>
                        <option value={4096}>4096 Bytes / Sector (4Kn)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {en ? 'Configure Recovery Parameters' : '복구 세부 옵션 설정'}
                  </h3>
                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate max-w-[320px]">
                    {getTargetLabel()}
                  </span>
                </div>

                {executionError && (
                  <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{executionError}</span>
                  </div>
                )}

                {activeScenario === 'deleted_files' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {en ? 'Target File Category Filter' : '복구할 파일 종류 필터'}
                    </label>
                    <select
                      value={fileFilterType}
                      onChange={e => setFileFilterType(e.target.value)}
                      className="w-full p-2.5 rounded-md text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="all">{en ? 'All File Types' : '모든 파일 형식 (All File Types)'}</option>
                      <option value="photos">{en ? 'Photos & Images (.jpg, .png, .gif, .webp)' : '사진 및 이미지 (.jpg, .png, .gif, .webp)'}</option>
                      <option value="docs">{en ? 'Documents (.pdf, .docx, .xlsx, .txt)' : '문서 및 스프레드시트 (.pdf, .docx, .xlsx, .txt)'}</option>
                      <option value="videos">{en ? 'Videos & Audio (.mp4, .avi, .wav)' : '동영상 및 오디오 (.mp4, .avi, .wav)'}</option>
                    </select>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {en
                        ? 'Parses NTFS $MFT unlinked records and FAT32 0xE5 deleted directory entries, falling back to raw signature carving if filesystem metadata is missing.'
                        : 'NTFS $MFT 비할당 삭제 레코드 및 FAT32 0xE5 삭제 엔트리를 우선 분석하며, 파일시스템 헤더가 손상된 경우 시그니처 카빙으로 전환합니다.'}
                    </p>
                  </div>
                )}

                {activeScenario === 'formatted_drive' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {en ? 'File Type Filter' : '카빙 대상 파일 필터'}
                        </label>
                        <select
                          value={fileFilterType}
                          onChange={e => setFileFilterType(e.target.value)}
                          className="w-full p-2.5 rounded-md text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                        >
                          <option value="all">{en ? 'All Supported Signatures' : '전체 지원 시그니처'}</option>
                          <option value="photos">{en ? 'Photos (.jpg, .png, .gif, .webp)' : '사진/이미지'}</option>
                          <option value="docs">{en ? 'PDF & Office Archives' : 'PDF 및 문서/압축'}</option>
                          <option value="videos">{en ? 'MP4 / AVI / WAV Media' : '동영상 및 오디오'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {en ? 'Max Scan Window (MB)' : '스캔 윈도우 상한 (MB)'}
                        </label>
                        <select
                          value={maxScanMb}
                          onChange={e => setMaxScanMb(Number(e.target.value))}
                          className="w-full p-2.5 rounded-md text-xs font-mono bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                        >
                          <option value={8}>8 MB (Fast Scan)</option>
                          <option value={32}>32 MB (Standard)</option>
                          <option value={128}>128 MB (Deep Scan)</option>
                          <option value={512}>512 MB (Extended)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {activeScenario === 'lost_partition' && (
                  <div className="p-4 rounded-md bg-sky-600/10 border border-sky-600/30 text-xs space-y-2">
                    <div className="font-bold text-sky-800 dark:text-sky-300">
                      {en ? 'MBR/GPT & Orphan VBR Reconstruction Scan' : 'MBR/GPT 테이블 검증 및 실종 VBR 탐색'}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">
                      {en
                        ? 'Inspects LBA 0..33 partition headers, checks Backup GPT EFI PART signatures, and probes alignment boundaries up to 64 MB for unlinked NTFS/FAT32/exFAT VBRs.'
                        : 'LBA 0~33 MBR/GPT 헤더와 Backup GPT 무결성을 검증하고, 정렬 경계(최대 64 MB 구간)를 탐색해 테이블에서 누락된 NTFS/FAT32/exFAT 볼륨 부트 레코드를 찾아냅니다.'}
                    </p>
                  </div>
                )}

                {activeScenario === 'bad_sector_clone' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {en ? 'Start LBA' : '복제 시작 LBA'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={cloneStartLba}
                        onChange={e => setCloneStartLba(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {en ? 'Sector Span (128 Sectors = 64KB)' : '복제 섹터 수 (예: 2048 = 1MB)'}
                      </label>
                      <input
                        type="number"
                        min={16}
                        max={65536}
                        value={cloneSectorSpan}
                        onChange={e => setCloneSectorSpan(Math.max(16, Math.min(65536, Number(e.target.value) || 2048)))}
                        className="w-full p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                )}

                {activeScenario === 'carving' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {en ? 'Target LBA (used when Hex stream is empty)' : '대상 LBA 번호 (헥스 입력이 비어 있을 때 미디어에서 직접 판독)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={carveTargetLba}
                        onChange={e => setCarveTargetLba(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {en ? 'Hex Byte Stream Input (optional — leave blank to read target LBA)' : '대상 헥스 바이트 스트림 (비워 두면 선택한 디스크/이미지의 LBA를 읽음)'}
                      </label>
                      <textarea
                        rows={4}
                        value={carveInputHex}
                        onChange={e => setCarveInputHex(e.target.value)}
                        className="w-full p-3 rounded-md font-mono text-xs bg-slate-900 text-emerald-400 border border-slate-700 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}

                {activeScenario === 'mft' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {en ? 'Damaged / Target Physical LBA Number' : '추적할 손상/대상 LBA 번호'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={mftTargetLba}
                      onChange={e => setMftTargetLba(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                )}

                {activeScenario === 'sanitize' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {en ? 'NIST SP 800-88 PRNG Seed, Mode & Audit LBA' : 'NIST SP 800-88 PRNG 시드, 소거 모드 및 검증 대상 LBA'}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={wipeMode}
                        onChange={e => setWipeMode(Number(e.target.value) as WipePatternMode)}
                        className="p-2.5 rounded-md text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      >
                        <option value={3}>Xoshiro256** PRNG (NIST SP 800-88)</option>
                        <option value={0}>All Zeros (0x00)</option>
                        <option value={1}>All Ones (0xFF)</option>
                      </select>
                      <input
                        type="text"
                        value={wipeSeedStr}
                        onChange={e => setWipeSeedStr(e.target.value)}
                        placeholder="0x123456789ABCDEF0"
                        className="p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="number"
                        min={0}
                        value={wipeTargetLba}
                        onChange={e => setWipeTargetLba(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="LBA 0"
                        className="p-2.5 rounded-md font-mono text-xs bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                {isExecuting ? (
                  <div className="p-8 text-center space-y-4">
                    <Cpu className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {en ? 'Executing Real Binary Recovery Pipeline...' : '실제 바이너리 복구 및 포렌식 분석 실행 중...'}
                    </div>
                    <div className="max-w-lg mx-auto p-3 rounded bg-slate-900 text-emerald-400 font-mono text-[11px] text-left max-h-40 overflow-y-auto">
                      {executionLog.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border text-xs font-semibold ${
                        executionError
                          ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {executionError ? (
                          <AlertTriangle className="w-5 h-5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                        )}
                        <span>
                          {executionError
                            ? executionError
                            : en
                            ? `Analysis complete: ${completionSummaryData.recoveredFilesCount} item(s) ready`
                            : `복구 분석 완료: 총 ${completionSummaryData.recoveredFilesCount}건 식별됨`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCompletionModalOpen(true)}
                        className="px-3 h-7 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>{en ? 'Completion Summary' : '복구 완료 요약 보기'}</span>
                      </button>
                    </div>

                    {/* Per-Scenario Real Output Views */}
                    {(resultSummary?.type === 'deleted_files' || resultSummary?.type === 'formatted_drive') && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {en ? 'Extracted / Recoverable Files' : '식별 및 추출 가능한 파일 목록'} ({resultSummary.files.length})
                          </span>
                          {resultSummary.files.length > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleBatchDownloadAll()}
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>{en ? 'Save All (Up to 10)' : '일괄 다운로드 (최대 10건)'}</span>
                            </button>
                          )}
                        </div>
                        {resultSummary.files.length === 0 ? (
                          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-xs text-slate-500">
                            {en
                              ? 'No matching deleted entries or file signatures were detected in the scanned range.'
                              : '스캔된 구간에서 조건에 일치하는 삭제 파일 또는 시그니처가 검출되지 않았습니다.'}
                          </div>
                        ) : (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-56 overflow-y-auto">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-100 dark:bg-[#0B101D] text-slate-500 sticky top-0">
                                <tr>
                                  <th className="p-2">{en ? 'File' : '파일명'}</th>
                                  <th className="p-2">{en ? 'Size' : '크기'}</th>
                                  <th className="p-2">{en ? 'Location' : '위치 / LBA'}</th>
                                  <th className="p-2">{en ? 'Confidence' : '신뢰도'}</th>
                                  <th className="p-2 text-right">{en ? 'Action' : '추출'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {resultSummary.files.map(f => (
                                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                    <td className="p-2 font-bold text-blue-600 dark:text-blue-400">
                                      <div className="flex items-center gap-1.5 max-w-[180px]">
                                        <FileCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        <span className="truncate">{f.name}</span>
                                      </div>
                                    </td>
                                    <td className="p-2 tabular-nums whitespace-nowrap">{f.sizeFormatted}</td>
                                    <td className="p-2 text-slate-500 truncate max-w-[160px]">{f.path}</td>
                                    <td className="p-2 text-emerald-600 dark:text-emerald-400 tabular-nums">{f.confidencePct}%</td>
                                    <td className="p-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => void handleDownloadArtifact(f)}
                                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>{en ? 'Save' : '저장'}</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {resultSummary?.type === 'lost_partition' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold">
                            Scheme: {resultSummary.result.scheme} · MBR 0x55AA: {resultSummary.result.mbrSignatureValid ? 'Valid' : 'Invalid'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              triggerBlobDownload(
                                resultSummary.result.rawHeaderTableBytes,
                                `PartitionTable_LBA0_33_${Date.now()}.bin`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>{en ? 'Backup LBA 0..33 (.bin)' : '파티션 테이블 LBA 0..33 백업 (.bin)'}</span>
                          </button>
                        </div>
                        <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-52 overflow-y-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-slate-100 dark:bg-[#0B101D] text-slate-500">
                              <tr>
                                <th className="p-2">#</th>
                                <th className="p-2">Scheme / FS</th>
                                <th className="p-2">Start~End LBA</th>
                                <th className="p-2">Size</th>
                                <th className="p-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {resultSummary.result.partitions.map(p => (
                                <tr key={`${p.index}-${p.startLba}`}>
                                  <td className="p-2">{p.index}</td>
                                  <td className="p-2 font-bold text-blue-600 dark:text-blue-400">{p.filesystem}</td>
                                  <td className="p-2 tabular-nums">{p.startLba.toLocaleString()}~{p.endLba.toLocaleString()}</td>
                                  <td className="p-2 tabular-nums">{p.sizeFormatted}</td>
                                  <td className="p-2 text-emerald-600 dark:text-emerald-400">{p.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {resultSummary?.type === 'bad_sector_clone' && (
                      <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] space-y-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono font-bold tabular-nums">
                            LBA {resultSummary.result.rangeStartLba.toLocaleString()}~{resultSummary.result.rangeEndLba.toLocaleString()} ·{' '}
                            {formatByteSize(resultSummary.result.clonedBytesCount)} ({resultSummary.result.plan.intervals.length} intervals)
                          </div>
                          <div className="flex items-center gap-2">
                            {resultSummary.result.clonedSliceBytes && resultSummary.result.clonedSliceBytes.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  triggerBlobDownload(
                                    resultSummary.result.clonedSliceBytes!,
                                    `Clone_LBA_${resultSummary.result.rangeStartLba}_${resultSummary.result.rangeEndLba}.img`
                                  )
                                }
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>{en ? 'Download .img' : '이미지(.img) 저장'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                triggerBlobDownload(
                                  resultSummary.result.mapJsonContent,
                                  `Clone_LBA_${resultSummary.result.rangeStartLba}.map.json`,
                                  'application/json'
                                )
                              }
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>{en ? 'Download .map.json' : '도메인 맵(.map.json) 저장'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {resultSummary?.type === 'carving' && (
                      <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {resultSummary.report.signatureName} (.{resultSummary.report.fileExtension}) — {resultSummary.report.confidenceScore}%
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              triggerBlobDownload(
                                resultSummary.rawBytes,
                                `Carved_LBA${carveTargetLba}.${resultSummary.report.fileExtension || 'bin'}`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>{en ? 'Save Carved Binary' : '카빙 바이너리 저장'}</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 tabular-nums">
                          <div>Entropy: {resultSummary.report.shannonEntropy.toFixed(3)} bits/B</div>
                          <div>CRC32: 0x{resultSummary.report.crc32.toString(16).toUpperCase().padStart(8, '0')}</div>
                          <div>Hamming Bit Flips: {resultSummary.report.nearMatchBitFlips}</div>
                        </div>
                      </div>
                    )}

                    {resultSummary?.type === 'mft' && (
                      <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] space-y-2 text-xs">
                        <div className="font-semibold">{resultSummary.trace.diagnosticNote}</div>
                        {resultSummary.trace.affectedFiles.length > 0 && (
                          <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden max-h-40 overflow-y-auto font-mono">
                            {resultSummary.trace.affectedFiles.map((f, i) => (
                              <div key={i} className="p-2 border-b last:border-b-0 border-slate-200 dark:border-slate-800 flex justify-between gap-2">
                                <span className="font-bold text-blue-600 dark:text-blue-400 truncate">{f.fullPath}</span>
                                <span className="text-slate-500 tabular-nums shrink-0">{formatByteSize(f.fileSizeBytes)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {resultSummary?.type === 'sanitize' && (
                      <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] space-y-2 text-xs font-mono">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">
                            Sanitized:{' '}
                            {resultSummary.audit.verify.verifiedClean
                              ? 'PASS (0% Residual)'
                              : `Residual ${(
                                  (resultSummary.audit.verify.checkedBytes > 0
                                    ? resultSummary.audit.verify.residualNonMatchingBytes /
                                      resultSummary.audit.verify.checkedBytes
                                    : 0) * 100
                                ).toFixed(2)}%`}
                          </span>
                          <div className="flex items-center gap-2 font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                triggerBlobDownload(
                                  resultSummary.audit.certificateJson,
                                  `Sanitize_Audit_LBA${wipeTargetLba}.json`,
                                  'application/json'
                                )
                              }
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>{en ? 'Audit Certificate (.json)' : '감사 인증서 (.json)'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded bg-slate-900 text-slate-300 font-mono text-[11px] max-h-36 overflow-y-auto">
                      {executionLog.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Navigation Buttons */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
            <button
              type="button"
              onClick={() => setStep(prev => Math.max(1, prev - 1))}
              disabled={step === 1 || isExecuting}
              className="px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              {en ? 'Previous' : '이전'}
            </button>

            <div className="flex items-center gap-2">
              {step < 3 ? (
                <button
                  type="button"
                  disabled={step === 2 && !canProceedFromStep2()}
                  onClick={() => setStep(prev => prev + 1)}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                >
                  <span>{en ? 'Next' : '다음'}</span>
                </button>
              ) : step === 3 ? (
                <button
                  type="button"
                  onClick={() => void handleRunWizard()}
                  disabled={isExecuting}
                  className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{en ? 'Execute Recovery Scan' : '실제 복구 스캔 및 추출 실행'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {en ? 'Finish & Close' : '완료 및 닫기'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recovery Completion Summary Modal */}
      <RecoveryCompletionSummaryModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        locale={locale}
        summaryData={completionSummaryData}
        onExportReport={handleExportJsonReport}
        onOpenFolder={recoveredArtifacts.length > 0 ? () => void handleBatchDownloadAll() : undefined}
        onDownloadItem={
          recoveredArtifacts.length > 0
            ? async (_idx, item) => {
                const match = recoveredArtifacts.find(a => a.id === item.id || a.name === item.name);
                if (match) await handleDownloadArtifact(match);
              }
            : undefined
        }
      />
    </>
  );
};
