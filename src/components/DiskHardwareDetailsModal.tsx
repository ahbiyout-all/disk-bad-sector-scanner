import React, { useState, useEffect } from 'react';
import { DiskDrive, DiskHardwareSpecs } from '../types';
import { probeNativeSystemStorage, NativeSystemStorageInfo } from '../utils/nativeDriveEngine';
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
  Info
} from 'lucide-react';

interface DiskHardwareDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  onRescanHardware?: () => Promise<void>;
}

export const DiskHardwareDetailsModal: React.FC<DiskHardwareDetailsModalProps> = ({
  isOpen,
  onClose,
  drive,
  onRescanHardware
}) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'geometry' | 'endurance' | 'benchmark'>('architecture');
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [rescanSuccess, setRescanSuccess] = useState<string | null>(null);
  const [liveBenchmark, setLiveBenchmark] = useState<NativeSystemStorageInfo | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    probeNativeSystemStorage().then(info => {
      if (mounted) {
        setLiveBenchmark(info);
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen, drive.id]);

  if (!isOpen) return null;

  const getSmartRawNullable = (id: number): number | null => {
    const attr = drive.smartAttributes.find(a => a.id === id);
    if (!attr) return null;
    const val = parseInt(attr.raw.replace(/[^0-9]/g, ''), 10);
    return isNaN(val) ? null : val;
  };

  const rawReadsVal = getSmartRawNullable(0xF2);
  const rawWritesVal = getSmartRawNullable(0xF1);
  const realReadsTb = rawReadsVal !== null ? Number((rawReadsVal / 2048 / 1024).toFixed(2)) : null;
  const realWritesTb = rawWritesVal !== null ? Number((rawWritesVal / 2048 / 1024).toFixed(2)) : null;

  const isFileDrive = Boolean(drive.attachedFile);
  const measuredLatencyUs = isFileDrive
    ? (drive.hardwareSpecs?.measuredKernelLatencyUs ?? null)
    : (liveBenchmark?.measuredLatencyUs ?? drive.hardwareSpecs?.measuredKernelLatencyUs ?? null);
  const measuredReadMbSec = isFileDrive
    ? (drive.hardwareSpecs?.measuredSequentialReadMbSec ?? null)
    : (liveBenchmark?.benchmarkReadMbSec ?? drive.hardwareSpecs?.measuredSequentialReadMbSec ?? null);
  const measuredWriteMbSec = isFileDrive
    ? (drive.hardwareSpecs?.measuredSequentialWriteMbSec ?? null)
    : (liveBenchmark?.benchmarkWriteMbSec ?? drive.hardwareSpecs?.measuredSequentialWriteMbSec ?? null);
  const measuredIops = isFileDrive
    ? (drive.hardwareSpecs?.measuredRandom4kReadIops ?? null)
    : (liveBenchmark?.measuredRandom4kIops ?? drive.hardwareSpecs?.measuredRandom4kReadIops ?? null);

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
    controllerVendor: drive.bridgeChipset || 'Host Storage Controller',
    totalCapacityBytes: drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : null,
    totalCapacityGb: drive.capacityGb,
    totalLbaSectors: drive.totalSectors > 0 ? drive.totalSectors : null,
    logicalSectorSize: 512,
    physicalSectorSize: 4096,
    isAdvancedFormat: true,
    partitionStyle: 'N/A (Sandbox)',
    alignmentStatus: 'N/A',
    mediaType: drive.type === 'HDD' ? 'Mechanical HDD (Magnetic Platter)' : 'Sandbox Storage (OPFS / File API)',
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
    probeMethod: 'W3C OPFS & StorageManager Probe'
  };

  const handleRescanClick = async () => {
    if (isRescanning) return;
    setIsRescanning(true);
    setRescanSuccess(null);
    try {
      const [newBench] = await Promise.all([
        probeNativeSystemStorage(),
        onRescanHardware ? onRescanHardware() : Promise.resolve()
      ]);
      setLiveBenchmark(newBench);
      setRescanSuccess('디스크 장치 하드웨어 정보 및 실시간 I/O 프로브가 갱신되었습니다.');
      setTimeout(() => setRescanSuccess(null), 3000);
    } catch {
      setRescanSuccess('하드웨어 재탐색 중 오류가 발생했습니다.');
    } finally {
      setIsRescanning(false);
    }
  };

  const handleRunLiveBenchmark = async () => {
    if (isBenchmarking) return;
    setIsBenchmarking(true);
    setRescanSuccess(null);
    try {
      const result = await probeNativeSystemStorage();
      setLiveBenchmark(result);
      setRescanSuccess(
        result.opfsSupported
          ? '실시간 OPFS 디스크 쓰기/플러시/읽기 벤치마크가 완료되었습니다.'
          : '현재 브라우저 컨텍스트에서 OPFS 직접 쓰기 벤치마크가 제한되어 있습니다.'
      );
      setTimeout(() => setRescanSuccess(null), 3500);
    } catch {
      setRescanSuccess('실측 벤치마크 실행 중 오류가 발생했습니다.');
    } finally {
      setIsBenchmarking(false);
    }
  };

  const formatBoolNullable = (val: boolean | null | undefined, trueLabel: string, falseLabel: string) => {
    if (val === null || val === undefined) return 'N/A (미제공)';
    return val ? trueLabel : falseLabel;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs font-sans animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-indigo-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  디스크 장치 상세 스펙 & 하드웨어 정보
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                  {specs.busType}
                </span>
                {specs.isAdvancedFormat && (
                  <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    4K AF (4096B)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                {specs.devicePhysicalPath || drive.model} · {drive.capacityGb !== null ? `${drive.capacityGb} GB` : '용량 N/A'} · S/N: {specs.serialNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRescanHardware && (
              <button
                onClick={handleRescanClick}
                disabled={isRescanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                title="실제 하드웨어 저장장치 및 I/O 실측 프로브 재실행"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">실시간 재탐색</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
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
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">인터페이스 대역폭</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              {specs.busInterfaceSpeed}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">물리 섹터 규격</div>
            <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
              {specs.physicalSectorSize}B ({specs.isAdvancedFormat ? 'Advanced Format' : 'Standard'})
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TRIM / 명령 큐</div>
            <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate mt-0.5">
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
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
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
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
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
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
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
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>실측 스토리지 I/O 벤치마크</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* TAB 1: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-indigo-500" />
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
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{specs.controllerVendor || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">물리/가상 경로 (Device Path)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{specs.devicePhysicalPath || drive.mountPoint || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">스토리지 미디어 타입</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{specs.mediaType}</span>
                  </div>
                </div>
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
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-1">
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
                  <Layers className="w-4 h-4 text-indigo-500" />
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
                      {specs.physicalSectorSize} Bytes ({specs.isAdvancedFormat ? '4Kn / 512e Advanced Format' : 'Standard'})
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500">논리 섹터 크기 (Logical Sector)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{specs.logicalSectorSize} Bytes</span>
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
                            <span className="font-bold font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
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
                              part.usedPercentage > 90 ? 'bg-red-500' : part.usedPercentage > 75 ? 'bg-amber-500' : 'bg-indigo-500'
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
                  <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
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
                      <Info className="w-4 h-4 text-indigo-500" />
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
                      <Activity className="w-4 h-4 text-indigo-500" />
                      <span>실시간 OPFS / Direct File I/O 실측 대역폭</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      실제 512KB W3C OPFS 디스크 쓰기·플러시·읽기 검증 및 4KB 랜덤 슬라이스 레이턴시를 직접 계측한 결과입니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleRunLiveBenchmark}
                      disabled={isBenchmarking || isRescanning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                      title="실제 OPFS 디스크 I/O 실측 벤치마크 즉시 수행"
                    >
                      <Play className={`w-3.5 h-3.5 ${isBenchmarking ? 'animate-spin' : 'fill-current'}`} />
                      <span>{isBenchmarking ? '실시간 계측 중...' : '실측 벤치마크 즉시 실행'}</span>
                    </button>
                    {onRescanHardware && (
                      <button
                        onClick={handleRescanClick}
                        disabled={isRescanning || isBenchmarking}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
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
                    <div className="text-[10px] text-slate-400 mt-1">512KB Real Storage Read</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">실측 순차 쓰기 전송률</div>
                    <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                      {specs.measuredSequentialWriteMbSec !== null ? (
                        <>
                          {specs.measuredSequentialWriteMbSec} <span className="text-xs font-sans text-slate-500">MB/s</span>
                        </>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">OPFS Writable Flush Stream</div>
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

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            엔진: Disk Bad Sector Scanner v4.6.0 Hardware Probe Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
