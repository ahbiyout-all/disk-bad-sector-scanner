import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiskDrive, DiskHardwareSpecs, DriveIdentifySnapshot, DriveIdentifyField } from '../types';
import { measureNativeDriveIoBenchmark, NativeIoBenchmarkResult, queryTauriDriveIdentify } from '../utils/nativeDriveEngine';
import { classifyFutureDriveStandards } from '../utils/vendorDiagnostics';
import {
  X,
  Cpu,
  Zap,
  Layers,
  ShieldCheck,
  Activity,
  RefreshCw,
  CheckCircle2,
  Database,
  Play,
  Info,
  Binary,
  Search,
  Copy,
  Check,
  Gauge,
  AlertTriangle
} from 'lucide-react';

interface DiskHardwareDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  onRescanHardware?: () => Promise<void>;
  onOpenBenchmarkProfiler?: () => void;
  onOpenHexInspector?: (lba?: number) => void;
  isInline?: boolean;
}

export const DiskHardwareDetailsModal: React.FC<DiskHardwareDetailsModalProps> = ({
  isOpen,
  onClose,
  drive,
  onRescanHardware,
  onOpenBenchmarkProfiler,
  onOpenHexInspector,
  isInline = false
}) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'geometry' | 'endurance' | 'benchmark' | 'identify'>('architecture');
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [rescanSuccess, setRescanSuccess] = useState<string | null>(null);
  const [liveBenchmark, setLiveBenchmark] = useState<NativeIoBenchmarkResult | null>(null);
  const [identifySnapshot, setIdentifySnapshot] = useState<DriveIdentifySnapshot | null>(null);
  const [identifyLoading, setIdentifyLoading] = useState<boolean>(false);
  const [identifyCategory, setIdentifyCategory] = useState<'ALL' | DriveIdentifyField['category']>('ALL');
  const [identifySearch, setIdentifySearch] = useState<string>('');
  const [selectedByteRange, setSelectedByteRange] = useState<{ start: number; length: number } | null>(null);
  const [hexCopied, setHexCopied] = useState<boolean>(false);

  const driveRef = useRef<DiskDrive>(drive);
  driveRef.current = drive;
  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const identifyReqIdRef = useRef<number>(0);
  const benchReqIdRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hexCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      identifyReqIdRef.current += 1;
      benchReqIdRef.current += 1;
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
      if (hexCopyTimeoutRef.current) {
        clearTimeout(hexCopyTimeoutRef.current);
        hexCopyTimeoutRef.current = null;
      }
    };
  }, []);

  const loadIdentifyData = useCallback(async () => {
    const reqId = ++identifyReqIdRef.current;
    const targetDrive = driveRef.current;
    const targetDriveId = targetDrive.id;
    setIdentifyLoading(true);
    try {
      const snap = await queryTauriDriveIdentify(targetDrive);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        identifyReqIdRef.current !== reqId
      ) {
        return;
      }
      setIdentifySnapshot(snap);
    } finally {
      if (
        isMountedRef.current &&
        activeDriveIdRef.current === targetDriveId &&
        identifyReqIdRef.current === reqId
      ) {
        setIdentifyLoading(false);
      }
    }
  }, [drive.id]);

  useEffect(() => {
    identifyReqIdRef.current += 1;
    benchReqIdRef.current += 1;
    if (!isOpen) {
      setIsRescanning(false);
      setIsBenchmarking(false);
      setIdentifyLoading(false);
      return;
    }
    setLiveBenchmark(null);
    setIdentifySnapshot(null);
    setRescanSuccess(null);
    let mounted = true;
    const reqDriveId = drive.id;
    measureNativeDriveIoBenchmark(driveRef.current).then(info => {
      if (mounted && isMountedRef.current && isOpenRef.current && activeDriveIdRef.current === reqDriveId) {
        setLiveBenchmark(info);
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen, drive.id]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'identify') return;
    setSelectedByteRange(null);
    void loadIdentifyData();
  }, [isOpen, activeTab, drive.id, loadIdentifyData]);

  if (!isOpen) return null;

  const futureClass = classifyFutureDriveStandards(drive);

  const getSmartRawNullable = (id: number): number | null => {
    const attr = drive.smartAttributes.find(a => a.id === id);
    if (!attr) return null;
    const s = String(attr.raw ?? '').trim();
    if (!s) return null;
    const headToken = s.split(/[\s(/,:]+/)[0] || '';
    const val = /^0x[0-9a-f]+$/i.test(headToken)
      ? parseInt(headToken, 16)
      : /^\d+$/.test(headToken)
      ? parseInt(headToken, 10)
      : NaN;
    return Number.isNaN(val) ? null : val;
  };

  const rawReadsVal = getSmartRawNullable(0xF2);
  const rawWritesVal = getSmartRawNullable(0xF1);
  const realReadsTb = rawReadsVal !== null ? Number((rawReadsVal / 2048 / 1024).toFixed(2)) : null;
  const realWritesTb = rawWritesVal !== null ? Number((rawWritesVal / 2048 / 1024).toFixed(2)) : null;

  const measuredLatencyUs = liveBenchmark?.measuredLatencyUs ?? drive.hardwareSpecs?.measuredKernelLatencyUs ?? null;
  const measuredReadMbSec = liveBenchmark?.benchmarkReadMbSec ?? drive.hardwareSpecs?.measuredSequentialReadMbSec ?? null;
  const measuredWriteMbSec = liveBenchmark?.benchmarkWriteMbSec ?? drive.hardwareSpecs?.measuredSequentialWriteMbSec ?? null;
  const measuredIops = liveBenchmark?.measuredRandom4kIops ?? drive.hardwareSpecs?.measuredRandom4kReadIops ?? null;

  const specs: DiskHardwareSpecs = drive.hardwareSpecs ? {
    ...drive.hardwareSpecs,
    currentTempC: drive.temperatureC,
    powerOnHours: drive.powerOnHours,
    measuredKernelLatencyUs: measuredLatencyUs,
    measuredSequentialReadMbSec: measuredReadMbSec,
    measuredSequentialWriteMbSec: measuredWriteMbSec,
    measuredRandom4kReadIops: measuredIops,
    probeTimestamp: liveBenchmark ? Date.now() : drive.hardwareSpecs.probeTimestamp
  } : {
    vendorName: drive.model.split(' ')[0] || 'Physical Storage',
    modelNumber: drive.model,
    serialNumber: drive.serialNumber,
    firmwareRevision: drive.firmware,
    busType: drive.type === 'NVMe' ? 'NVMe' : drive.isExternal ? 'USB' : 'Unknown',
    busInterfaceSpeed: drive.interface,
    formFactor: drive.type === 'NVMe' ? 'M.2 NVMe' : drive.isExternal ? 'Portable Storage' : 'Host Storage',
    controllerVendor: drive.bridgeChipset || 'N/A (커널 컨트롤러 미제공)',
    totalCapacityBytes: drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : null,
    totalCapacityGb: drive.capacityGb,
    totalLbaSectors: drive.totalSectors > 0 ? drive.totalSectors : null,
    logicalSectorSize: null,
    physicalSectorSize: null,
    isAdvancedFormat: null,
    partitionStyle: 'Unknown',
    alignmentStatus: 'N/A',
    mediaType: drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD'
      ? 'Mechanical HDD (Magnetic Platter)'
      : 'SSD (Non-Volatile NAND Flash)',
    rotationalSpeedRpm: drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD' ? null : 0,
    trimSupported: null,
    trimActive: null,
    smartSupported: drive.smartAttributes.length > 0,
    smartActive: drive.smartAttributes.length > 0,
    ncqSupported: null,
    queueDepth: null,
    volatileWriteCache: null,
    writeCacheFlushSupported: null,
    readLookAheadSupported: null,
    apmAamSupported: null,
    hostReadsTb: realReadsTb,
    hostWritesTb: realWritesTb,
    percentageUsed: null,
    availableSparePercent: null,
    powerOnHours: drive.powerOnHours,
    powerCycles: getSmartRawNullable(0x0C),
    unsafeShutdowns: getSmartRawNullable(0xAE),
    mediaErrors: null,
    currentTempC: drive.temperatureC,
    maxTempRecordedC: null,
    warningTempThresholdC: null,
    measuredKernelLatencyUs: measuredLatencyUs,
    measuredSequentialReadMbSec: measuredReadMbSec,
    measuredSequentialWriteMbSec: measuredWriteMbSec,
    measuredRandom4kReadIops: measuredIops,
    probeTimestamp: Date.now(),
    probeMethod: 'Tauri Desktop Native IPC'
  };

  const handleRescanClick = async () => {
    if (isRescanning) return;
    const reqId = ++benchReqIdRef.current;
    const reqDrive = drive;
    const reqDriveId = drive.id;
    setIsRescanning(true);
    setRescanSuccess(null);
    try {
      const [newBench] = await Promise.all([
        measureNativeDriveIoBenchmark(reqDrive),
        onRescanHardware ? onRescanHardware() : Promise.resolve()
      ]);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== reqDriveId ||
        benchReqIdRef.current !== reqId
      ) {
        return;
      }
      setLiveBenchmark(newBench);
      setRescanSuccess('디스크 장치 하드웨어 정보 및 실시간 Win32 IOCTL 프로브가 갱신되었습니다.');
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => {
        feedbackTimeoutRef.current = null;
        if (isMountedRef.current) setRescanSuccess(null);
      }, 3000);
    } catch {
      if (isMountedRef.current && isOpenRef.current && activeDriveIdRef.current === reqDriveId) {
        setRescanSuccess('하드웨어 재탐색 중 오류가 발생했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsRescanning(false);
      }
    }
  };

  const handleRunLiveBenchmark = async () => {
    if (isBenchmarking) return;
    const reqId = ++benchReqIdRef.current;
    const reqDrive = drive;
    const reqDriveId = drive.id;
    setIsBenchmarking(true);
    setRescanSuccess(null);
    try {
      const result = await measureNativeDriveIoBenchmark(reqDrive);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== reqDriveId ||
        benchReqIdRef.current !== reqId
      ) {
        return;
      }
      setLiveBenchmark(result);
      setRescanSuccess(result.probeNote);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => {
        feedbackTimeoutRef.current = null;
        if (isMountedRef.current) setRescanSuccess(null);
      }, 3500);
    } catch {
      if (isMountedRef.current && isOpenRef.current && activeDriveIdRef.current === reqDriveId) {
        setRescanSuccess('실측 벤치마크 실행 중 오류가 발생했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsBenchmarking(false);
      }
    }
  };

  const formatBoolNullable = (val: boolean | null | undefined, trueLabel: string, falseLabel: string) => {
    if (val === null || val === undefined) return 'N/A (미제공)';
    return val ? trueLabel : falseLabel;
  };

  return (
    <div
      className={
        isInline
          ? 'w-full font-sans'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs font-sans animate-in fade-in duration-150'
      }
    >
      <div
        className={
          isInline
            ? 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full flex flex-col overflow-hidden'
            : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full max-w-4xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden'
        }
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : true}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/25">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  디스크 장치 상세 스펙 &amp; 하드웨어 정보
                </h2>
                <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  · {specs.busType}
                </span>
                {specs.isAdvancedFormat === true && (
                  <span className="hidden sm:inline font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    · 4K AF ({specs.physicalSectorSize}B)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                {specs.devicePhysicalPath || drive.model} · {drive.capacityGb !== null ? `${drive.capacityGb} GB` : '용량 N/A'} · S/N: {specs.serialNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenHexInspector && (
              <button
                type="button"
                onClick={() => {
                  if (!isInline) onClose();
                  onOpenHexInspector(0);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                title="LBA 원시 섹터 헥스 및 MBR/GPT 파티션 테이블 검사 열기"
              >
                <Binary className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden md:inline">헥스/파티션</span>
              </button>
            )}
            {onRescanHardware && (
              <button
                onClick={handleRescanClick}
                disabled={isRescanning}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="실제 하드웨어 저장장치 및 I/O 실측 프로브 재실행"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">실시간 재탐색</span>
              </button>
            )}
            {!isInline && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {rescanSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{rescanSuccess}</span>
          </div>
        )}

        {/* Top Quick Status Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between gap-1">
              <span>인터페이스 대역폭</span>
              {specs.linkProbe?.isLinkDowngraded && (
                <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-bold">
                  저하됨
                </span>
              )}
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5" title={specs.busInterfaceSpeed}>
              {specs.linkProbe?.currentSpeedLabel || specs.busInterfaceSpeed}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">물리 섹터 규격</div>
            <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
              {specs.physicalSectorSize !== null
                ? `${specs.physicalSectorSize}B (${specs.isAdvancedFormat ? 'Advanced Format' : 'Standard'})`
                : 'N/A'}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TRIM / 명령 큐</div>
            <div className="font-mono font-bold text-blue-600 dark:text-blue-400 truncate mt-0.5">
              {specs.trimSupported === null ? 'N/A' : specs.trimSupported ? 'TRIM 활성' : '미지원'} · 큐 {specs.queueDepth !== null ? specs.queueDepth : 'N/A'}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">실측 I/O 지연율</div>
            <div className="font-mono font-bold text-sky-600 dark:text-sky-400 truncate mt-0.5">
              {specs.measuredKernelLatencyUs !== null
                ? `${specs.measuredKernelLatencyUs} µs (${specs.measuredRandom4kReadIops !== null ? `${specs.measuredRandom4kReadIops.toLocaleString()} IOPS` : 'IOPS N/A'})`
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'architecture'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>하드웨어 아키텍처</span>
          </button>

          <button
            onClick={() => setActiveTab('geometry')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'geometry'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>물리 지오메트리 & 파티션</span>
          </button>

          <button
            onClick={() => setActiveTab('endurance')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'endurance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>NAND 내구성 & S.M.A.R.T.</span>
          </button>

          <button
            onClick={() => setActiveTab('benchmark')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'benchmark'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>실측 스토리지 I/O 벤치마크</span>
          </button>

          <button
            onClick={() => setActiveTab('identify')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'identify'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Binary className="w-3.5 h-3.5" />
            <span>Identify (512B)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* TAB 1: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  <span>컨트롤러 및 장치 식별 정보</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">제조사 / 브랜드</span>
                    <span className="font-semibold font-mono text-slate-900 dark:text-slate-100">{specs.vendorName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">모델명 (Model Number)</span>
                    <span className="font-semibold font-mono text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{specs.modelNumber}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">일련번호 (Serial Number)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{specs.serialNumber}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">펌웨어 리비전 (Firmware)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{specs.firmwareRevision}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">스토리지 폼팩터</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{specs.formFactor}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">컨트롤러 칩셋 사양</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">{specs.controllerVendor || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">물리/가상 경로 (Device Path)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{specs.devicePhysicalPath || drive.mountPoint || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">스토리지 미디어 타입</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{specs.mediaType}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">자동 프로토콜 분류 ({futureClass.recognitionSource})</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400 truncate max-w-[230px]" title={futureClass.adaptiveNote}>
                      {futureClass.protocolStandard}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">실측 링크 협상 속도 (Current / Max)</span>
                    <span className={`font-mono font-semibold text-right truncate max-w-[240px] ${
                      specs.linkProbe?.isLinkDowngraded
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {specs.linkProbe?.currentSpeedLabel
                        ? `${specs.linkProbe.currentSpeedLabel}${specs.linkProbe.maxSpeedLabel ? ` / Max ${specs.linkProbe.maxSpeedLabel}` : ''}`
                        : specs.busInterfaceSpeed || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">컨트롤러 PCI ID / NVMe 규격</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
                      {specs.linkProbe
                        ? `${specs.linkProbe.pciVendorIdHex && specs.linkProbe.pciDeviceIdHex ? `${specs.linkProbe.pciVendorIdHex}:${specs.linkProbe.pciDeviceIdHex}` : 'PCI ID N/A'}${specs.linkProbe.nvmeSpecVersion ? ` · ${specs.linkProbe.nvmeSpecVersion}` : ''} (${specs.linkProbe.probeSource})`
                        : '커널 프로브 미수신 (N/A)'}
                    </span>
                  </div>
                </div>
                {specs.linkProbe?.isLinkDowngraded && (
                  <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>
                      장치 최대 지원 속도({specs.linkProbe.maxSpeedLabel || 'N/A'}) 대비 현재 협상 링크({specs.linkProbe.currentSpeedLabel || 'N/A'})가 다운그레이드되어 실행 중입니다. 슬롯 레인 공유, 케이블 또는 USB 허브 대역폭 병목을 점검하세요.
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>스토리지 기능 및 프로토콜 지원 상태</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">TRIM / UNMAP 명령</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${specs.trimSupported ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span>{formatBoolNullable(specs.trimSupported, '지원 (Active)', '미지원')}</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">S.M.A.R.T. 상태 모니터링</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${specs.smartSupported ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span>{specs.smartSupported ? '정상 활성화' : '미제공 (N/A)'}</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">하드웨어 큐 깊이 (Queue Depth)</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {specs.queueDepth !== null
                        ? `${specs.queueDepth} Commands (${specs.busType === 'NVMe' ? 'NVMe' : 'NCQ'})`
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">휘발성 쓰기 캐시 (Write Cache)</div>
                    <div className="font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {formatBoolNullable(specs.volatileWriteCache, '활성화 (Flush 지원)', '비활성')}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">선행 판독 (Read Look-Ahead)</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {formatBoolNullable(specs.readLookAheadSupported, '지원됨', '미지원')}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px]">고급 전원 관리 (APM / ASPM)</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {formatBoolNullable(specs.apmAamSupported, '지원됨', '미지원 / OS 제어')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GEOMETRY */}
          {activeTab === 'geometry' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-500" />
                  <span>물리 지오메트리 & 4K 섹터 정렬 사양</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">총 물리/할당 용량</span>
                    <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                      {specs.totalCapacityGb !== null ? `${specs.totalCapacityGb} GB` : 'N/A'}{' '}
                      ({specs.totalCapacityBytes !== null ? `${specs.totalCapacityBytes.toLocaleString()} Bytes` : 'Bytes N/A'})
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">총 LBA 섹터 수 (Sectors)</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      {specs.totalLbaSectors !== null ? `${specs.totalLbaSectors.toLocaleString()} LBA` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">물리 섹터 크기 (Physical Sector)</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {specs.physicalSectorSize !== null
                        ? `${specs.physicalSectorSize} Bytes (${specs.isAdvancedFormat ? '4Kn / 512e Advanced Format' : 'Standard'})`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">논리 섹터 크기 (Logical Sector)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {specs.logicalSectorSize !== null ? `${specs.logicalSectorSize} Bytes` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">4K 섹터 정렬 상태 (Alignment)</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{specs.alignmentStatus}</span>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">파티션 테이블 스타일</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{specs.partitionStyle}</span>
                  </div>
                </div>
              </div>

              {/* Partitions List */}
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-sky-500" />
                  <span>마운트된 논리 파티션 / 볼륨 목록</span>
                </h3>
                {specs.partitions && specs.partitions.length > 0 ? (
                  <div className="space-y-3">
                    {specs.partitions.map((part, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                              {part.letterOrMount}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{part.label}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-mono">({part.fileSystem})</span>
                          </div>
                          <span className="font-mono text-slate-600 dark:text-slate-300">
                            {part.usedGb} GB / {part.totalGb} GB ({part.usedPercentage}% 사용)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              part.usedPercentage > 90 ? 'bg-red-500' : part.usedPercentage > 75 ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, part.usedPercentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    매핑된 논리 볼륨 파티션 정보가 없습니다. ({drive.mountPoint || 'N/A'})
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ENDURANCE */}
          {activeTab === 'endurance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400">총 기록량 (TBW)</div>
                  <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                    {specs.hostWritesTb !== null ? `${specs.hostWritesTb.toFixed(1)} TBW` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    총 판독량: {specs.hostReadsTb !== null ? `${specs.hostReadsTb.toFixed(1)} TB` : 'N/A'}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400">NAND 수명 소모율</div>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    {specs.percentageUsed !== null
                      ? `${specs.percentageUsed}% 소모 (잔여 ${Math.max(0, 100 - specs.percentageUsed)}%)`
                      : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    가용 예비 블록: {specs.availableSparePercent !== null ? `${specs.availableSparePercent}%` : 'N/A'}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400">가동 시간 / 전원 인가</div>
                  <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
                    {specs.powerOnHours !== null ? `${specs.powerOnHours.toLocaleString()} 시간` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {specs.powerCycles !== null ? `${specs.powerCycles}회 전원 사이클` : '전원 사이클 N/A'} /{' '}
                    {specs.unsafeShutdowns !== null ? `비정상 종료 ${specs.unsafeShutdowns}회` : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>실시간 S.M.A.R.T. & NVMe 텔레메트리 센서 로그</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 font-normal">
                    최고 {specs.maxTempRecordedC !== null ? `${specs.maxTempRecordedC}°C` : 'N/A'} / 임계{' '}
                    {specs.warningTempThresholdC !== null ? `${specs.warningTempThresholdC}°C` : 'N/A'}
                  </span>
                </h3>

                {drive.smartAttributes.length === 0 ? (
                  <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 space-y-1">
                    <div className="flex items-center justify-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <Info className="w-4 h-4 text-blue-500" />
                      <span>S.M.A.R.T. 및 NVMe Log 02h 텔레메트리가 감지되지 않았습니다 (N/A)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      실제 낸드 마모율, TBW, 전원 인가 횟수는 Windows 관리자 권한의 Tauri 데스크톱 IOCTL 환경에서만 조회할 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs">
                    {drive.smartAttributes.map(attr => (
                      <div key={attr.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            attr.status === 'critical' ? 'bg-red-500' : attr.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          <span className="font-mono text-slate-400 text-[11px] w-6">0x{attr.id.toString(16).padStart(2, '0').toUpperCase()}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{attr.name}</span>
                          <span className="text-[10px] text-slate-400 hidden sm:inline">{attr.description}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{attr.raw}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BENCHMARK */}
          {activeTab === 'benchmark' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span>Tauri Win32 Direct IOCTL 실측 대역폭</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      실제 물리 디스크 LBA 버스트 읽기(64KB) 커널 응답 지연율 및 전송 대역폭을 직접 계측한 결과입니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={handleRunLiveBenchmark}
                      disabled={isBenchmarking || isRescanning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                      title="물리 디스크 Win32 IOCTL 읽기 지연율 즉시 계측"
                    >
                      <Play className={`w-3.5 h-3.5 ${isBenchmarking ? 'animate-spin' : 'fill-current'}`} />
                      <span>{isBenchmarking ? '실시간 계측 중...' : '실측 벤치마크 즉시 실행'}</span>
                    </button>
                    {onOpenBenchmarkProfiler && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenBenchmarkProfiler();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-bold transition-colors cursor-pointer"
                        title="디스크 전체 LBA 0~100% 구간 속도 커브 및 4K 랜덤 IOPS 프로파일러 열기"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span>전체 구간 커브 프로파일러...</span>
                      </button>
                    )}
                    {onRescanHardware && (
                      <button
                        onClick={handleRescanClick}
                        disabled={isRescanning || isBenchmarking}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                        title="장치 하드웨어 프로브 및 S.M.A.R.T. 전체 갱신"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                        <span>{isRescanning ? '재탐색 중...' : '하드웨어 재탐색'}</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">실측 순차 판독 전송률</div>
                    <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                      {specs.measuredSequentialReadMbSec !== null ? (
                        <>
                          {specs.measuredSequentialReadMbSec} <span className="text-xs font-sans text-slate-500">MB/s</span>
                        </>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">64KB Raw LBA Burst Read</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">비파괴 쓰기 대역폭</div>
                    <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                      {specs.measuredSequentialWriteMbSec !== null ? (
                        <>
                          {specs.measuredSequentialWriteMbSec} <span className="text-xs font-sans text-slate-500">MB/s</span>
                        </>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Read-Only Non-Destructive Mode</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">4KB 랜덤 블록 레이턴시</div>
                    <div className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                      {specs.measuredKernelLatencyUs !== null ? (
                        <>
                          {specs.measuredKernelLatencyUs} <span className="text-xs font-sans text-slate-500">µs</span>
                        </>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {specs.measuredRandom4kReadIops !== null ? `추정 ${specs.measuredRandom4kReadIops.toLocaleString()} IOPS` : 'IOPS N/A'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 text-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  프로브 메타데이터 & 측정 엔진
                </h3>
                <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between py-0.5">
                    <span>측정 엔진 규격</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{specs.probeMethod}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>마지막 프로브 갱신 시각</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{new Date(specs.probeTimestamp).toLocaleString('ko-KR')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: IDENTIFY (512B) */}
          {activeTab === 'identify' && (() => {
            const rawBytes = identifySnapshot?.rawBytes ?? [];
            const fields = identifySnapshot?.decodedFields ?? [];
            const q = identifySearch.trim().toLowerCase();
            const filteredFields = fields.filter(f => {
              if (identifyCategory !== 'ALL' && f.category !== identifyCategory) return false;
              if (!q) return true;
              return (
                f.name.toLowerCase().includes(q) ||
                f.wordIndex.toLowerCase().includes(q) ||
                f.decodedValue.toLowerCase().includes(q) ||
                f.rawHex.toLowerCase().includes(q)
              );
            });

            const handleCopyHexDump = () => {
              if (rawBytes.length === 0) return;
              const lines: string[] = [];
              for (let off = 0; off < rawBytes.length; off += 16) {
                const slice = rawBytes.slice(off, off + 16);
                const hexPart = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                const asciiPart = slice.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
                lines.push(`${off.toString(16).toUpperCase().padStart(4, '0')}: ${hexPart.padEnd(47, ' ')}  |${asciiPart}|`);
              }
              void navigator.clipboard?.writeText(lines.join('\n')).then(() => {
                if (!isMountedRef.current) return;
                setHexCopied(true);
                if (hexCopyTimeoutRef.current) clearTimeout(hexCopyTimeoutRef.current);
                hexCopyTimeoutRef.current = setTimeout(() => {
                  hexCopyTimeoutRef.current = null;
                  if (isMountedRef.current) setHexCopied(false);
                }, 2000);
              }).catch(() => {});
            };

            const isByteHighlighted = (idx: number) => {
              if (!selectedByteRange) return false;
              return idx >= selectedByteRange.start && idx < selectedByteRange.start + selectedByteRange.length;
            };

            return (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Binary className="w-4 h-4 text-blue-500" />
                        <span>Drive Identify 512바이트 원시 데이터 &amp; 워드 디코더</span>
                        {identifySnapshot?.supported && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {identifySnapshot.protocol}
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        ATA IDENTIFY DEVICE (0xEC) 또는 NVMe Identify Controller(CNS 01h) 원시 버퍼 디코딩 · 항목 클릭 시 하단 Hex 오프셋 강조
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void loadIdentifyData()}
                        disabled={identifyLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${identifyLoading ? 'animate-spin' : ''}`} />
                        <span>새로고침</span>
                      </button>
                      {rawBytes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleCopyHexDump}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                        >
                          {hexCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{hexCopied ? '복사됨' : 'Hex 복사'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!identifyLoading && identifySnapshot && !identifySnapshot.supported ? (
                    <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1 text-xs">
                      <div className="flex items-center justify-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span>512B Drive Identify 원시 버퍼 조회 불가</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {identifySnapshot.reason || 'Windows 관리자 권한의 Tauri 데스크톱 네이티브 IPC 환경에서 물리 디스크 Identify 구조를 직접 읽어 표시합니다.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Category Filters & Search */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1 flex-wrap text-[11px]">
                          {(['ALL', 'General', 'Geometry', 'Transfer', 'Power', 'Security'] as const).map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setIdentifyCategory(cat)}
                              className={`px-2 py-1 rounded border font-semibold cursor-pointer ${
                                identifyCategory === cat
                                  ? 'border-blue-500 bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {cat === 'ALL' ? '전체' : cat}
                            </button>
                          ))}
                        </div>
                        <div className="relative w-full sm:w-56">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={identifySearch}
                            onChange={e => setIdentifySearch(e.target.value)}
                            placeholder="Word / 필드 / 값 검색..."
                            className="w-full pl-8 pr-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Decoded Fields Table */}
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                            <tr>
                              <th className="px-2.5 py-1.5">Word / Offset</th>
                              <th className="px-2.5 py-1.5">분류</th>
                              <th className="px-2.5 py-1.5">항목</th>
                              <th className="px-2.5 py-1.5">Raw Hex</th>
                              <th className="px-2.5 py-1.5">디코딩 값</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-mono tabular-nums">
                            {filteredFields.map((field, idx) => {
                              const active =
                                selectedByteRange?.start === field.byteOffsetStart &&
                                selectedByteRange?.length === field.byteLength;
                              return (
                                <tr
                                  key={`${field.wordIndex}-${idx}`}
                                  onClick={() =>
                                    setSelectedByteRange(
                                      active ? null : { start: field.byteOffsetStart, length: field.byteLength }
                                    )
                                  }
                                  className={`cursor-pointer transition-colors ${
                                    active
                                      ? 'bg-blue-50 dark:bg-blue-950/60'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                  }`}
                                >
                                  <td className="px-2.5 py-1.5 text-blue-600 dark:text-blue-400 font-bold whitespace-nowrap">
                                    {field.wordIndex}
                                  </td>
                                  <td className="px-2.5 py-1.5 font-sans text-slate-500 dark:text-slate-400">
                                    {field.category}
                                  </td>
                                  <td className="px-2.5 py-1.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                                    {field.name}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {field.rawHex}
                                  </td>
                                  <td className="px-2.5 py-1.5 font-sans text-slate-900 dark:text-slate-100">
                                    {field.decodedValue}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 512-byte Hex + ASCII Viewer */}
                      {rawBytes.length > 0 && (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 p-3 overflow-x-auto">
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pb-2 mb-2 border-b border-slate-800">
                            <span>RAW IDENTIFY BUFFER ({rawBytes.length} BYTES · 16 BYTES/ROW)</span>
                            {selectedByteRange && (
                              <span className="text-blue-400 font-bold">
                                선택 영역: 0x{selectedByteRange.start.toString(16).toUpperCase().padStart(4, '0')} ({selectedByteRange.length}B)
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] leading-5 tabular-nums space-y-0.5 min-w-[640px]">
                            {Array.from({ length: Math.ceil(rawBytes.length / 16) }, (_, rowIdx) => {
                              const offset = rowIdx * 16;
                              const rowSlice = rawBytes.slice(offset, offset + 16);
                              return (
                                <div key={offset} className="flex items-center gap-3 hover:bg-slate-900/70 px-1 rounded">
                                  <span className="text-slate-500 w-12 shrink-0 select-none">
                                    0x{offset.toString(16).toUpperCase().padStart(4, '0')}
                                  </span>
                                  <div className="flex items-center gap-1 flex-1">
                                    {rowSlice.map((b, col) => {
                                      const absIdx = offset + col;
                                      const hi = isByteHighlighted(absIdx);
                                      return (
                                        <span
                                          key={absIdx}
                                          className={`px-0.5 rounded ${
                                            col === 8 ? 'ml-1.5 ' : ''
                                          }${
                                            hi
                                              ? 'bg-blue-600 text-white font-bold'
                                              : b === 0
                                              ? 'text-slate-600'
                                              : 'text-slate-200'
                                          }`}
                                        >
                                          {b.toString(16).toUpperCase().padStart(2, '0')}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <div className="text-emerald-400/90 border-l border-slate-800 pl-3 tracking-wider shrink-0">
                                    {rowSlice.map((b, col) => {
                                      const absIdx = offset + col;
                                      const ch = b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
                                      return (
                                        <span
                                          key={absIdx}
                                          className={isByteHighlighted(absIdx) ? 'bg-blue-600 text-white font-bold' : ''}
                                        >
                                          {ch}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            엔진: Disk Bad Sector Scanner v4.6.0 Hardware Probe Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
