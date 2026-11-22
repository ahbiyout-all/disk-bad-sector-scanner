import React, { useState, useEffect, useMemo } from 'react';
import {
  DiskDrive,
  FakeCapacityGuardReport,
  SpecializedScanMethodId
} from '../types';
import {
  getStorageDeviceRecognitionSummary,
  StorageRecognitionDiagnostics
} from '../utils/nativeDriveEngine';
import {
  USB_SCAN_MATRIX_CATALOG,
  isFakeCapacityTier2ProtectedOsDrive,
  resolveDriveUsbTopology,
  resolveUsbSurfaceScanPolicy,
  runFakeCapacityGuardScan
} from '../utils/usbScanMatrix';
import {
  X,
  Usb,
  HardDrive,
  Check,
  Zap,
  Lock,
  Info,
  Cpu,
  AlertTriangle,
  BatteryWarning,
  Gauge,
  RefreshCw,
  Layers,
  Activity,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal
} from 'lucide-react';

export type ExternalDeviceModalTab = 'connected' | 'probe32' | 'usb2guide' | 'matrix';

interface ExternalDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  onEjectDrive: (id: string) => Promise<{ success: boolean; message: string }> | void;
  onRescanDrives?: () => void;
  initialTab?: ExternalDeviceModalTab;
  usbPolicyOverrides?: Record<string, string>;
  onApplyUsbMatrixPolicy?: (
    driveId: string,
    profileKey: string | null,
    recommendedMethodId?: SpecializedScanMethodId
  ) => void;
}

export const ExternalDeviceModal: React.FC<ExternalDeviceModalProps> = ({
  isOpen,
  onClose,
  drives,
  selectedDriveId,
  onSelectDrive,
  onEjectDrive,
  onRescanDrives,
  initialTab = 'connected',
  usbPolicyOverrides = {},
  onApplyUsbMatrixPolicy
}) => {
  const [activeTab, setActiveTab] = useState<ExternalDeviceModalTab>(initialTab);
  const [ejectFeedback, setEjectFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ejectingDriveId, setEjectingDriveId] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [recognitionDiag, setRecognitionDiag] = useState<StorageRecognitionDiagnostics | null>(null);

  // USB Matrix & Fake-Capacity Guard state
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'legacy' | 'usb3' | 'usb4' | 'flash_sd'>('all');
  const [guardTier2Confirm, setGuardTier2Confirm] = useState<boolean>(false);
  const [isRunningGuard, setIsRunningGuard] = useState<boolean>(false);
  const [guardReport, setGuardReport] = useState<FakeCapacityGuardReport | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'probe32') return;
    let active = true;
    getStorageDeviceRecognitionSummary()
      .then(diag => {
        if (active) setRecognitionDiag(diag);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, activeTab, drives.length]);

  useEffect(() => {
    setGuardReport(null);
    setGuardTier2Confirm(false);
  }, [selectedDriveId]);

  const externalDrives = useMemo(() => drives.filter(d => d.isExternal), [drives]);
  const selectedDrive = useMemo(
    () => drives.find(d => d.id === selectedDriveId) || externalDrives[0] || drives[0],
    [drives, externalDrives, selectedDriveId]
  );

  const selectedTopology = useMemo(
    () => (selectedDrive ? resolveDriveUsbTopology(selectedDrive) : undefined),
    [selectedDrive]
  );

  const activeOverrideKey = selectedDrive ? usbPolicyOverrides[selectedDrive.id] || null : null;
  const activeResolvedPolicy = useMemo(
    () => (selectedDrive ? resolveUsbSurfaceScanPolicy(selectedDrive, undefined, activeOverrideKey) : undefined),
    [selectedDrive, activeOverrideKey]
  );

  const tier2Safety = useMemo(
    () => (selectedDrive ? isFakeCapacityTier2ProtectedOsDrive(selectedDrive) : { protected: true, reason: '대상 드라이브 없음' }),
    [selectedDrive]
  );

  const filteredMatrixRows = useMemo(() => {
    return USB_SCAN_MATRIX_CATALOG.filter(row => {
      if (matrixFilter === 'all') return true;
      if (matrixFilter === 'legacy') return row.generation === 'usb_1_1' || row.generation === 'usb_2_0';
      if (matrixFilter === 'usb3') {
        return (
          row.generation === 'usb_3_0_gen1' ||
          row.generation === 'usb_3_2_gen2' ||
          row.generation === 'usb_3_2_gen2x2'
        );
      }
      if (matrixFilter === 'usb4') return row.generation === 'usb4_tb';
      return row.deviceClass === 'flash_thumb' || row.deviceClass === 'sd_card_uhs';
    });
  }, [matrixFilter]);

  if (!isOpen) return null;

  // Handle Safe Eject (Real Win32 Lock/Dismount/Eject)
  const handleEject = async (drive: DiskDrive) => {
    if (ejectingDriveId) return;
    setEjectingDriveId(drive.id);
    try {
      const result = await onEjectDrive(drive.id);
      if (result && typeof result === 'object') {
        setEjectFeedback({
          type: result.success ? 'success' : 'error',
          message: result.message
        });
      }
      setTimeout(() => setEjectFeedback(null), 5000);
    } finally {
      setEjectingDriveId(null);
    }
  };

  // Handle Force Rescan of 32 PhysicalDrive slots
  const handleForceRescan = async () => {
    if (!onRescanDrives) return;
    setIsRescanning(true);
    try {
      await onRescanDrives();
      const diag = await getStorageDeviceRecognitionSummary().catch(() => null);
      if (diag) setRecognitionDiag(diag);
      setEjectFeedback({
        type: 'success',
        message: '32개 네이티브 물리 드라이브 슬롯(PhysicalDrive0~31) 및 USB 토폴로지 재탐색 완료'
      });
      setTimeout(() => setEjectFeedback(null), 3500);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleRunFakeCapacityGuard = async (tier: 'tier1_readonly_alias' | 'tier2_prng_roundtrip') => {
    if (!selectedDrive) return;
    setIsRunningGuard(true);
    try {
      const report = await runFakeCapacityGuardScan(selectedDrive, {
        tier,
        allowDestructiveWrite: tier === 'tier2_prng_roundtrip' ? guardTier2Confirm : false
      });
      setGuardReport(report);
    } finally {
      setIsRunningGuard(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0">
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  외부 저장장치 &amp; USB 매트릭스 엔진 (External Storage Manager)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 whitespace-nowrap shrink-0">
                  USB 1.1 ~ USB4 · BOT / UASP / PCIe
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                실시간 USB 세대/브릿지 프로빙, 세대별 LBA 블록 정책 제어 및 위조 용량 가드(H2testw LBA Verifier)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 sm:gap-2 px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('connected')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'connected'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            연결된 장치 ({externalDrives.length})
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'matrix'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-500" />
            USB 스캔 매트릭스 &amp; 위조 용량 가드
          </button>

          <button
            onClick={() => setActiveTab('probe32')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'probe32'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            32개 채널 탐색
          </button>

          <button
            onClick={() => setActiveTab('usb2guide')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'usb2guide'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Gauge className="w-3.5 h-3.5 text-amber-500" />
            USB 2.0 가이드
          </button>
        </div>

        {/* Eject / Action Feedback Banner */}
        {ejectFeedback && (
          <div
            className={`mx-5 mt-3 p-2.5 rounded border text-xs flex items-center gap-2 ${
              ejectFeedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-rose-500/30 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            }`}
          >
            {ejectFeedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{ejectFeedback.message}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Tab 1: Connected External Drives */}
          {activeTab === 'connected' && (
            <div className="space-y-3">
              {externalDrives.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-3">
                  <Usb className="w-9 h-9 mx-auto text-slate-500" />
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">현재 연결된 외장 저장장치가 없습니다.</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      USB 외장 SSD/HDD/메모리를 PC에 연결한 뒤 Tauri 데스크톱 네이티브 IPC로 32개 물리 슬롯을 재검색하세요.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => void handleForceRescan()}
                      disabled={isRescanning || !onRescanDrives}
                      className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                      <span>32개 물리 슬롯 재검색</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('matrix')}
                      className="px-3.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>USB 스캔 매트릭스 보기</span>
                    </button>
                  </div>
                </div>
              ) : (
                externalDrives.map(drive => {
                  const topo = resolveDriveUsbTopology(drive);
                  return (
                    <div
                      key={drive.id}
                      className={`p-3.5 rounded-lg border transition-colors ${
                        selectedDriveId === drive.id
                          ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                            drive.isUsb2
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                              : 'bg-indigo-50 dark:bg-slate-800 text-indigo-500'
                          }`}>
                            <Usb className="w-4 h-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                {drive.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0">
                                {drive.mountPoint || drive.hardwareSpecs?.devicePhysicalPath || 'N/A'}
                              </span>
                              {topo ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border whitespace-nowrap shrink-0 ${
                                  topo.generation === 'usb_1_1' || topo.generation === 'usb_2_0'
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                    : 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-500/30'
                                }`}>
                                  {topo.generationLabel} · {topo.transport}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                                  PnP 토폴로지 미수신 (N/A)
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 whitespace-nowrap shrink-0">
                                {drive.fileSystem && drive.fileSystem !== 'Unknown' ? drive.fileSystem : 'N/A (미인식/RAW)'}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 font-mono tabular-nums">
                              <span>용량: {drive.capacityGb !== null ? `${drive.capacityGb}GB` : 'N/A'}</span>
                              <span>·</span>
                              <span>인터페이스: {drive.interface}</span>
                              <span>·</span>
                              <span>건강도: {drive.healthScore !== null ? `${drive.healthScore}%` : 'N/A'}</span>
                            </div>

                            {(drive.bridgeChipset || topo?.vendorIdHex) && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 font-mono flex-wrap">
                                <Cpu className="w-3 h-3 text-cyan-500 shrink-0" />
                                <span>
                                  {drive.bridgeChipset || topo?.bridgeChipset || 'USB Storage Bridge'}
                                  {topo?.vendorIdHex ? ` (VID:${topo.vendorIdHex} PID:${topo.productIdHex || '0000'})` : ''}
                                </span>
                              </div>
                            )}

                            {topo?.bottleneckWarning && (
                              <div className="text-[10px] text-amber-700 dark:text-amber-300 font-mono">
                                [병목 경고] {topo.bottleneckWarning}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => {
                              onSelectDrive(drive.id);
                              setActiveTab('matrix');
                            }}
                            className="px-2.5 py-1 rounded border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 font-mono font-semibold text-[11px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            매트릭스 설정
                          </button>

                          {selectedDriveId !== drive.id ? (
                            <button
                              onClick={() => {
                                onSelectDrive(drive.id);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              검사 대상으로 선택
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center gap-1 whitespace-nowrap shrink-0">
                              <Check className="w-3.5 h-3.5" /> 선택됨
                            </span>
                          )}

                          <button
                            onClick={() => void handleEject(drive)}
                            disabled={ejectingDriveId === drive.id}
                            className="px-2.5 py-1 rounded border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            title="실제 Windows 볼륨 잠금 해제 및 장치 안전 분리"
                          >
                            {ejectingDriveId === drive.id ? '분리 중...' : '안전 제거'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: USB Version & Device-Class Matrix + Fake-Capacity Flash Guard */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {/* Target Drive Topology & Active Policy Readout */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      활성 장치 USB 토폴로지 &amp; 네이티브 파라미터 프로빙
                    </span>
                    {selectedDrive && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                        {selectedDrive.mountPoint || selectedDrive.model}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {drives.length > 1 && (
                      <select
                        value={selectedDrive?.id || ''}
                        onChange={e => onSelectDrive(e.target.value)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono text-slate-700 dark:text-slate-200"
                      >
                        {drives.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.mountPoint ? `[${d.mountPoint}] ` : ''}{d.model}
                          </option>
                        ))}
                      </select>
                    )}

                    {activeOverrideKey && selectedDrive && onApplyUsbMatrixPolicy && (
                      <button
                        onClick={() => onApplyUsbMatrixPolicy(selectedDrive.id, null)}
                        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        자동 매칭 복원
                      </button>
                    )}
                  </div>
                </div>

                {selectedTopology && activeResolvedPolicy ? (
                  <div className="p-3.5 space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                      <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                        <div className="text-[10px] text-slate-400">
                          {selectedTopology.probeSource === 'win32_pnp_hub'
                            ? '협상 USB 세대 (Win32 실측)'
                            : '프로브 미수신 (참고 프로파일)'}
                        </div>
                        <div className={`font-bold mt-0.5 truncate ${
                          selectedTopology.probeSource === 'win32_pnp_hub'
                            ? 'text-cyan-600 dark:text-cyan-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {selectedTopology.generationLabel}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {selectedTopology.probeSource === 'win32_pnp_hub'
                            ? `실효 상한 ~${selectedTopology.maxPracticalMbSec} MB/s`
                            : 'Win32 PnP 허브 디스크립터 대기'}
                        </div>
                      </div>

                      <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                        <div className="text-[10px] text-slate-400">전송 스택 / 드라이버</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                          {selectedTopology.transportLabel}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {selectedTopology.probeSource === 'win32_pnp_hub' ? 'Win32 PnP 실측' : 'Win32 PnP 미수신 (수동/기본 매칭)'}
                        </div>
                      </div>

                      <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                        <div className="text-[10px] text-slate-400">적용 청크 &amp; 임계치</div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {activeResolvedPolicy.chunkKb} KB ({activeResolvedPolicy.chunkSectors} sec)
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Slow {activeResolvedPolicy.slowThresholdMs}ms / Crit {activeResolvedPolicy.criticalThresholdMs}ms
                        </div>
                      </div>

                      <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                        <div className="text-[10px] text-slate-400">재시도 / 열 쿨다운</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {activeResolvedPolicy.maxRetries}x ({activeResolvedPolicy.retryDelayMs}ms)
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {activeResolvedPolicy.cooldownEveryNBlocks > 0
                            ? `${activeResolvedPolicy.cooldownEveryNBlocks}블록당 ${activeResolvedPolicy.cooldownMs}ms 휴지`
                            : '연속 무휴지 스트리밍'}
                        </div>
                      </div>
                    </div>

                    {selectedTopology.bottleneckWarning && (
                      <div className="p-2.5 rounded border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/25 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>{selectedTopology.bottleneckWarning}</span>
                      </div>
                    )}
                  </div>
                ) : selectedDrive?.isExternal ? (
                  <div className="p-3.5 space-y-2.5 text-[11px]">
                    <div className="text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        선택된 외장 장치({selectedDrive.model})의 Win32 PnP USB 허브 디스크립터가 아직 수신되지 않았습니다 (N/A).
                        Tauri 데스크톱 환경에서 물리 슬롯을 재탐색하거나 아래 매트릭스에서 수동 정책을 지정할 수 있습니다.
                      </span>
                    </div>
                    {activeResolvedPolicy && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                        <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                          <div className="text-[10px] text-slate-400">실측 USB 세대</div>
                          <div className="font-bold text-slate-500 dark:text-slate-400 mt-0.5">미수신 (N/A)</div>
                        </div>
                        <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                          <div className="text-[10px] text-slate-400">적용 스캔 프로파일</div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                            {activeOverrideKey ? '수동 지정 정책' : '안전 기본 정책'}
                          </div>
                        </div>
                        <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                          <div className="text-[10px] text-slate-400">적용 청크 &amp; 임계치</div>
                          <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {activeResolvedPolicy.chunkKb} KB ({activeResolvedPolicy.chunkSectors} sec)
                          </div>
                        </div>
                        <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                          <div className="text-[10px] text-slate-400">재시도 / 쿨다운</div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {activeResolvedPolicy.maxRetries}x / {activeResolvedPolicy.cooldownEveryNBlocks > 0 ? `${activeResolvedPolicy.cooldownMs}ms` : '없음'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
                    <span>
                      현재 선택된 장치({selectedDrive?.model || 'N/A'})는 내장 {selectedDrive?.type || '스토리지'}입니다.
                      외장 USB 장치를 선택하거나 아래 매트릭스 프로파일을 수동 테스트 정책으로 적용할 수 있습니다.
                    </span>
                    {activeResolvedPolicy && (
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                        수동 적용 정책: {activeResolvedPolicy.profileName}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Matrix Policy Table */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    USB 버전 × 장치군 표면검사 정책 매트릭스 (C++/Rust 동적 전달)
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-mono overflow-x-auto">
                    {[
                      { id: 'all', label: '전체' },
                      { id: 'legacy', label: 'USB 1.1/2.0' },
                      { id: 'usb3', label: 'USB 3.x (5~20G)' },
                      { id: 'usb4', label: 'USB4 (40G)' },
                      { id: 'flash_sd', label: 'Flash / SD' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setMatrixFilter(tab.id as any)}
                        className={`px-2 py-1 rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          matrixFilter === tab.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[10px] text-slate-500 uppercase">
                        <th className="py-2 px-3">세대 &amp; 장치 프로파일</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">프로토콜</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">청크 / 배치</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">Slow / Crit</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">재시도 / 쿨다운</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">스캔 적용</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredMatrixRows.map(row => {
                        const isMatched = activeResolvedPolicy?.profileKey === row.profileKey;
                        return (
                          <tr
                            key={row.profileKey}
                            className={
                              isMatched
                                ? 'bg-indigo-50/50 dark:bg-indigo-950/25'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }
                          >
                            <td className="py-2 px-3">
                              <div className="font-sans font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span>{row.generationLabel}</span>
                                {isMatched && (
                                  <span className="px-1 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-mono font-bold whitespace-nowrap shrink-0">
                                    {activeOverrideKey ? '수동 활성' : '자동 매칭'}
                                  </span>
                                )}
                              </div>
                              <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                                {row.deviceClassLabel}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                              {row.transport}
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap text-indigo-600 dark:text-indigo-400 font-semibold">
                              {row.chunkKb} KB / {row.batchSize}B
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap text-amber-600 dark:text-amber-400">
                              {row.slowThresholdMs} / {row.criticalThresholdMs} ms
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                              {row.maxRetries}x ({row.retryDelayMs}ms) ·{' '}
                              {row.cooldownEveryNBlocks > 0
                                ? `${row.cooldownEveryNBlocks}blk/${row.cooldownMs}ms`
                                : '0ms'}
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  if (selectedDrive && onApplyUsbMatrixPolicy) {
                                    onApplyUsbMatrixPolicy(selectedDrive.id, row.profileKey, row.methodId);
                                    setEjectFeedback({
                                      type: 'success',
                                      message: `[${selectedDrive.model}]에 '${row.profileName}' 정책(${row.chunkKb}KB, ${row.slowThresholdMs}/${row.criticalThresholdMs}ms)을 적용했습니다.`
                                    });
                                    setTimeout(() => setEjectFeedback(null), 3500);
                                  }
                                }}
                                disabled={!selectedDrive || !onApplyUsbMatrixPolicy}
                                className={`px-2 py-1 rounded text-[10px] font-sans font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                                  isMatched
                                    ? 'bg-indigo-600 text-white'
                                    : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {isMatched ? '적용 중' : '스캔에 적용'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fake-Capacity Flash Guard (H2testw Power-of-2 LBA Boundary Verifier) */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      위조 용량 판별 가드 (Fake-Capacity Flash Guard · H2testw 2^n LBA 경계 검증)
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    대상: {selectedDrive?.mountPoint || selectedDrive?.model || 'N/A'}
                  </span>
                </div>

                <div className="p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-3 rounded border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/15 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          Tier 1 · 비침습 읽기 에일리어싱 검사
                        </span>
                        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">READ-ONLY</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        512MiB~1TiB 2의 거듭제곱 LBA와 99.5% 끝단 경계에서 데이터를 전혀 쓰지 않고 CRC32 충돌(주소 순환 Wraparound)과 읽기 불가를 탐지합니다.
                      </p>
                      <button
                        onClick={() => void handleRunFakeCapacityGuard('tier1_readonly_alias')}
                        disabled={!selectedDrive || isRunningGuard}
                        className="w-full py-1.5 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer"
                      >
                        {isRunningGuard ? '경계 LBA 검사 실행 중...' : 'Tier 1 안전 읽기 경계 검사 실행'}
                      </button>
                    </div>

                    <div className="p-3 rounded border border-rose-500/30 bg-rose-50/30 dark:bg-rose-950/15 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-700 dark:text-rose-300">
                          Tier 2 · Xoshiro256** PRNG 왕복 검증
                        </span>
                        <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400">RAW R/W + RESTORE</span>
                      </div>
                      {tier2Safety.protected ? (
                        <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{tier2Safety.reason}</span>
                        </div>
                      ) : (
                        <>
                          <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={guardTier2Confirm}
                              onChange={e => setGuardTier2Confirm(e.target.checked)}
                              className="mt-0.5 rounded border-slate-400"
                            />
                            <span>
                              외장 비시스템 드라이브의 경계 4KB 섹터 PRNG 쓰기-재판독-원본복원 테스트 위험을 확인했습니다.
                            </span>
                          </label>
                          <button
                            onClick={() => void handleRunFakeCapacityGuard('tier2_prng_roundtrip')}
                            disabled={!selectedDrive || isRunningGuard || !guardTier2Confirm}
                            className="w-full py-1.5 px-3 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold text-xs transition-colors cursor-pointer"
                          >
                            Tier 2 PRNG 왕복 실증 검증 실행
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {guardReport && (
                    <div className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className={`px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono ${
                        guardReport.verdict === 'GENUINE_CAPACITY_VERIFIED'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                          : guardReport.verdict === 'SUSPECTED_FAKE_CAPACITY'
                          ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                      }`}>
                        <span className="font-bold">
                          판정: {guardReport.verdict}
                        </span>
                        <span className="font-sans text-[11px]">{guardReport.summary}</span>
                      </div>

                      {guardReport.checkpoints.length > 0 && (
                        <div className="overflow-x-auto max-h-56 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[10px] text-slate-500">
                                <th className="py-1.5 px-2.5">경계 지점</th>
                                <th className="py-1.5 px-2.5">LBA</th>
                                <th className="py-1.5 px-2.5">CRC32</th>
                                <th className="py-1.5 px-2.5">엔트로피</th>
                                <th className="py-1.5 px-2.5">응답</th>
                                <th className="py-1.5 px-2.5">결과 / 비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {guardReport.checkpoints.map((cp, idx) => (
                                <tr key={`${cp.label}-${idx}`}>
                                  <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{cp.label}</td>
                                  <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{cp.lba.toLocaleString()}</td>
                                  <td className="py-1.5 px-2.5 text-indigo-600 dark:text-indigo-400">0x{cp.crc32Hex}</td>
                                  <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{cp.entropyBits.toFixed(2)} b</td>
                                  <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{cp.latencyMs.toFixed(2)} ms</td>
                                  <td className="py-1.5 px-2.5 font-sans">
                                    <span className={`font-mono font-bold mr-1.5 ${
                                      cp.status === 'PASS'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : cp.status === 'WRITE_LOCKED'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                      [{cp.status}]
                                    </span>
                                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">{cp.note}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: 32 PhysicalDrive Exhaustive Channel Discovery & Volume Mapping */}
          {activeTab === 'probe32' && (
            <div className="space-y-4">
              {/* Top Banner & Force Rescan Action */}
              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-600 text-white uppercase tracking-wider">
                        Hardware IOCTL Engine
                      </span>
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                        Windows 32개 물리 드라이브 슬롯 전수 탐색 &amp; 볼륨 역매핑
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      기존 12~16개 탐색 한계를 32개(<span className="font-mono font-semibold">PhysicalDrive0 ~ PhysicalDrive31</span>)로 확장하고,
                      USB 허브나 외장 독에 할당된 비연속 인덱스 장치까지 전수 인식합니다.
                    </p>
                  </div>

                  <button
                    onClick={handleForceRescan}
                    disabled={isRescanning}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm cursor-pointer transition-all disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                    <span>32개 채널 즉각 전수 재탐색</span>
                  </button>
                </div>

                {/* Key Technical Tags */}
                <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/40 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                    탐색 범위: \\.\PhysicalDrive0 ~ 31
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold">
                    FILE_SHARE_DELETE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold">
                    IOCTL_STORAGE_GET_DEVICE_NUMBER
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 border border-purple-500/30 text-purple-700 dark:text-purple-300 font-bold">
                    백엔드: {recognitionDiag?.accessModeFallback || '확인 중...'}
                  </span>
                </div>
              </div>

              {recognitionDiag && !recognitionDiag.isDesktopNative && (
                <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-2.5 text-xs">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                    <div className="font-bold">Tauri 데스크톱 네이티브 IPC 연결 대기 상태입니다</div>
                    <p>
                      실제 장착된 SSD/HDD/USB 디스크 전체를 인식·검사하려면 Tauri 데스크톱 앱 또는 <code className="font-mono font-bold">DiskBadSectorScanner.exe</code>를 관리자 권한으로 실행하세요.
                    </p>
                  </div>
                </div>
              )}

              {/* Active Discovered Drives in 32 Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-indigo-500" />
                    <span>인식된 물리 스토리지 채널 목록</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    인식됨: {drives.length}개 드라이브
                  </span>
                </div>

                <div className="space-y-2">
                  {drives.map((drive) => {
                    const isSelected = drive.id === selectedDriveId;
                    const path = drive.hardwareSpecs?.devicePhysicalPath || drive.mountPoint || drive.interface;
                    const volumeList = drive.hardwareSpecs?.partitions?.map(p => p.letterOrMount).filter(Boolean) || [drive.mountPoint || 'C:'];
                    const bus = drive.hardwareSpecs?.busType || drive.type;
                    const isUsb = drive.isExternal || bus === 'USB';

                    return (
                      <div
                        key={drive.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg shrink-0 ${
                              isUsb
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                                : bus === 'NVMe'
                                ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400'
                                : 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                            }`}>
                              {isUsb ? <Usb className="w-5 h-5" /> : bus === 'NVMe' ? <Zap className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                            </div>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                  {drive.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                  {path}
                                </span>
                                {volumeList.length > 0 && volumeList.map((vol, vIdx) => (
                                  <span key={vIdx} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                    볼륨: {vol}
                                  </span>
                                ))}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isUsb
                                    ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 border border-amber-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}>
                                  {bus}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3 font-mono tabular-nums">
                                <span>용량: <strong className="text-slate-700 dark:text-slate-300 font-sans">{drive.capacityGb !== null ? `${drive.capacityGb} GB` : 'N/A'}</strong></span>
                                <span>S/N: {drive.serialNumber || 'N/A'}</span>
                                <span>F/W: {drive.firmware || 'N/A'}</span>
                                <span>온도: {drive.temperatureC !== null ? `${drive.temperatureC}°C` : 'N/A'}</span>
                                <span>신뢰도: {drive.healthScore !== null ? `${drive.healthScore}%` : 'N/A'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            {isSelected ? (
                              <span className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> 현재 검사 대상
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  onSelectDrive(drive.id);
                                  setEjectFeedback({
                                    type: 'success',
                                    message: `[${drive.mountPoint || path}] 검사 대상으로 전환되었습니다.`
                                  });
                                  setTimeout(() => setEjectFeedback(null), 3000);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white dark:text-slate-900 hover:text-white dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
                              >
                                검사 대상으로 선택
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 32 PhysicalDrive Channels Matrix (0 to 31) */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>전체 32개 물리 채널 실시간 상태 맵 (Channel 0 ~ 31)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    녹색: 활성 장치 / 회색: 유휴 채널
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-[10px] font-mono">
                  {Array.from({ length: 32 }, (_, i) => {
                    const matchedDrive = drives.find(d => {
                      if (d.id === `drive-tauri-physical-${i}`) return true;
                      if (d.hardwareSpecs?.devicePhysicalPath?.endsWith(`PhysicalDrive${i}`)) return true;
                      return false;
                    });
                    const isOccupied = !!matchedDrive;
                    const isCurrent = matchedDrive?.id === selectedDriveId;

                    return (
                      <div
                        key={i}
                        onClick={() => {
                          if (matchedDrive) {
                            onSelectDrive(matchedDrive.id);
                          }
                        }}
                        className={`p-1.5 rounded border text-center transition-all ${
                          isOccupied
                            ? isCurrent
                              ? 'bg-indigo-600 text-white border-indigo-500 font-bold cursor-pointer'
                              : 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold cursor-pointer hover:border-emerald-500'
                            : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'
                        }`}
                        title={isOccupied ? `클릭 시 ${matchedDrive.name} 검사 대상으로 전환` : `채널 ${i}: 유휴/미연결`}
                      >
                        <div className="truncate">#{i}</div>
                        <div className="text-[9px] truncate">
                          {isOccupied ? (matchedDrive.mountPoint || 'Disk') : 'Idle'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Technical Insight Box */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 space-y-2 text-xs">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-500" />
                  <span>SSD / HDD / USB 하드웨어 인식률 향상 핵심 알고리즘</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">1. 32개 비연속 인덱스 전수 탐색</strong>
                    USB 멀티 독이나 카드 리더기 사용 시 Windows PnP가 12 이상의 높은 인덱스를 부여해도 누락 없이 감지합니다.
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">2. 잠금 프로세스 공유 플래그</strong>
                    Windows Defender, 색인기, BitLocker 점유 충돌 방지를 위해 <code className="font-mono">FILE_SHARE_DELETE</code>를 적용합니다.
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">3. 볼륨-물리디스크 역매핑</strong>
                    <code className="font-mono">IOCTL_STORAGE_GET_DEVICE_NUMBER</code>를 통해 드라이브 문자의 물리 디스크 소속을 추적합니다.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: USB 2.0 Diagnostic & Compatibility Guide */}
          {activeTab === 'usb2guide' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  USB 2.0 외부 저장장치 정밀 검사 시 필수 고려 사항
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  USB 2.0은 2000년에 발표된 레거시 표준으로, 현대의 USB 3.x / Type-C UASP 장치와 비교하여 <strong>대역폭, 전력 공급, 전송 프로토콜</strong> 면에서 구조적 차이가 존재합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-amber-500">
                    <Gauge className="w-3.5 h-3.5" />
                    1. 전송 대역폭 한계 (480Mbps / ~35MB/s)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    이론상 최대 속도는 60MB/s이나 프로토콜 오버헤드로 인해 실효 속도는 약 25~42MB/s로 제한됩니다. USB 스캔 매트릭스에서 64KB 청크 + 180/600ms 완화 임계값을 자동 적용합니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-red-500">
                    <BatteryWarning className="w-3.5 h-3.5" />
                    2. 전력 공급 한계 (5V 500mA / 2.5W)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    2.5인치 외장 HDD 연결 시 전력 부족으로 헤드가 튀는 현상과 I/O 타임아웃이 발생하기 쉽습니다. 네이티브 엔진이 120ms 백오프 3회 재시도로 허위 배드를 걸러냅니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-purple-500">
                    <Cpu className="w-3.5 h-3.5" />
                    3. UASP 미지원 &amp; 단일 큐 BOT 방식
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    USB 2.0은 BOT(Bulk-Only Transport) 방식을 사용하여 한 번에 1개의 I/O 명령만 처리합니다. NCQ가 지원되지 않아 작은 블록 단위 순차 지연 관리가 필수입니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-cyan-500">
                    <Zap className="w-3.5 h-3.5" />
                    4. 구형 낸드 발열 &amp; 위조 용량 주의
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    저가형 USB 메모리는 열 스로틀링과 용량 변조(Fake-Capacity)에 취약합니다. 매트릭스 탭의 8블록당 20ms 쿨다운 및 Tier-1 H2testw 가드를 함께 활용하세요.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            USB 1.1 ~ USB4 Adaptive Matrix &amp; Fake-Capacity Flash Guard
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

