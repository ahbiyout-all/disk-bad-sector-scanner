import React, { useState, useRef } from 'react';
import { DiskDrive } from '../types';
import { 
  createNativeDriveFromDirectoryHandle, 
  createNativeDriveFromFolderFiles,
  createNativeDriveFromFile, 
  requestPhysicalWebUsbDevice, 
  requestPhysicalWebSerialDevice 
} from '../utils/nativeDriveEngine';
import { 
  X, 
  Usb, 
  HardDrive, 
  Plus, 
  Check, 
  Zap, 
  ShieldCheck, 
  FolderOpen, 
  ExternalLink, 
  AlertCircle,
  Info,
  Cpu,
  Trash2,
  Lock,
  ArrowRight,
  AlertTriangle,
  BatteryWarning,
  Gauge,
  RefreshCw,
  Layers,
  Activity
} from 'lucide-react';

interface ExternalDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  onAddDrive: (newDrive: DiskDrive) => void;
  onEjectDrive: (id: string) => void;
  onRescanDrives?: () => void;
}

export const ExternalDeviceModal: React.FC<ExternalDeviceModalProps> = ({
  isOpen,
  onClose,
  drives,
  selectedDriveId,
  onSelectDrive,
  onAddDrive,
  onEjectDrive,
  onRescanDrives
}) => {
  const [activeTab, setActiveTab] = useState<'connected' | 'probe32' | 'mount' | 'usb2guide'>('connected');
  const [ejectSuccessMsg, setEjectSuccessMsg] = useState<string | null>(null);
  const [fsPickerError, setFsPickerError] = useState<string | null>(null);
  const [fsPickerLoading, setFsPickerLoading] = useState<boolean>(false);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const externalDrives = drives.filter(d => d.isExternal);

  // Handle Safe Eject
  const handleEject = (drive: DiskDrive) => {
    onEjectDrive(drive.id);
    setEjectSuccessMsg(`[${drive.mountPoint || 'USB'}] ${drive.name} 안전 제거 완료 (캐시 플러시 정상 처리)`);
    setTimeout(() => setEjectSuccessMsg(null), 3500);
  };

  // Handle Web File System Access API (Actual USB / External Storage selection)
  const handlePickLocalDirectory = async () => {
    setFsPickerError(null);
    setFsPickerLoading(true);

    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    // In cross-origin iframes (like web sandboxes), showDirectoryPicker is forbidden.
    // Immediately open standard HTML5 directory input safely without throwing SecurityError.
    if (isInIframe) {
      setFsPickerLoading(false);
      folderInputRef.current?.click();
      return;
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        // @ts-expect-error - standard browser API
        const dirHandle = await window.showDirectoryPicker({
          id: 'external-storage-picker',
          mode: 'readwrite'
        });

        const newDrive = await createNativeDriveFromDirectoryHandle(dirHandle);

        onAddDrive(newDrive);
        onSelectDrive(newDrive.id);
        setEjectSuccessMsg(`실제 외장 볼륨 [${dirHandle.name || 'Local'}]이(가) 검사 장치로 마운트되었습니다!`);
        setTimeout(() => setEjectSuccessMsg(null), 3500);
        setActiveTab('connected');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        // Graceful fallback to standard directory input
        folderInputRef.current?.click();
      } finally {
        setFsPickerLoading(false);
      }
    } else {
      setFsPickerLoading(false);
      folderInputRef.current?.click();
    }
  };

  // Handle standard folder files selection (works reliably in all browsers and iframes)
  const handleFolderFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFsPickerError(null);
    setFsPickerLoading(true);
    try {
      const newDrive = await createNativeDriveFromFolderFiles(files);
      onAddDrive(newDrive);
      onSelectDrive(newDrive.id);
      setEjectSuccessMsg(`로컬 디렉토리 [${newDrive.name}]이(가) 마운트되었습니다!`);
      setTimeout(() => setEjectSuccessMsg(null), 3500);
      setActiveTab('connected');
    } catch (err: any) {
      setFsPickerError(`디렉토리 볼륨 마운트 실패: ${err?.message || '알 수 없는 오류'}`);
    } finally {
      setFsPickerLoading(false);
      e.target.value = '';
    }
  };

  // Handle Real File Selection (Universal support across PC browsers & native host)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFsPickerError(null);
    setFsPickerLoading(true);
    try {
      const newDrive = await createNativeDriveFromFile(file);
      onAddDrive(newDrive);
      onSelectDrive(newDrive.id);
      setEjectSuccessMsg(`실제 파일 [${file.name}]이(가) 바이트 단위 직접 검사 드라이브로 마운트되었습니다!`);
      setTimeout(() => setEjectSuccessMsg(null), 3500);
      setActiveTab('connected');
    } catch (err: any) {
      setFsPickerError(`파일 마운트 실패: ${err?.message || '알 수 없는 오류'}`);
    } finally {
      setFsPickerLoading(false);
      // Reset input value so same file can be reselected
      e.target.value = '';
    }
  };

  // Handle Real WebUSB Device Direct Pairing
  const handlePairWebUsb = async () => {
    setFsPickerError(null);
    setFsPickerLoading(true);
    try {
      const newDrive = await requestPhysicalWebUsbDevice();
      if (newDrive) {
        onAddDrive(newDrive);
        onSelectDrive(newDrive.id);
        setEjectSuccessMsg(`물리 USB 기기 [${newDrive.name}] 하드웨어 연결 성공!`);
        setTimeout(() => setEjectSuccessMsg(null), 3500);
        setActiveTab('connected');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'NotFoundError') {
        setFsPickerError(`WebUSB 연결 오류: ${err?.message || '지원되지 않는 장치'}`);
      }
    } finally {
      setFsPickerLoading(false);
    }
  };

  // Handle Real Web Serial Device Direct Pairing
  const handlePairWebSerial = async () => {
    setFsPickerError(null);
    setFsPickerLoading(true);
    try {
      const newDrive = await requestPhysicalWebSerialDevice();
      if (newDrive) {
        onAddDrive(newDrive);
        onSelectDrive(newDrive.id);
        setEjectSuccessMsg(`물리 시리얼 기기 [${newDrive.name}] 통신 연결 완료!`);
        setTimeout(() => setEjectSuccessMsg(null), 3500);
        setActiveTab('connected');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'NotFoundError') {
        setFsPickerError(`Web Serial 연결 오류: ${err?.message || '지원되지 않는 포트'}`);
      }
    } finally {
      setFsPickerLoading(false);
    }
  };

  // Handle Force Rescan of 32 PhysicalDrive slots
  const handleForceRescan = async () => {
    if (!onRescanDrives) return;
    setIsRescanning(true);
    try {
      await onRescanDrives();
      setEjectSuccessMsg('32개 네이티브 물리 드라이브 슬롯(PhysicalDrive0~31) 및 볼륨 문자 전수 재탐색 완료!');
      setTimeout(() => setEjectSuccessMsg(null), 3500);
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  외부 저장장치 관리자 (External Storage Manager)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                  USB 2.0 / 3.2 & UASP 전 기종 지원
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                외장 SSD, 2.5" 외장 HDD, USB 2.0/3.0 메모리, SD 카드 핫플러그 및 정밀 표면 검사 지원
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 sm:gap-2 px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('connected')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'connected'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            연결된 장치 ({externalDrives.length})
          </button>

          <button
            onClick={() => setActiveTab('probe32')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'probe32'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            32개 채널 전수 탐색 & 볼륨 매핑
          </button>

          <button
            onClick={() => setActiveTab('mount')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'mount'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
            실제 하드웨어 & 로컬 미디어 마운트
          </button>

          <button
            onClick={() => setActiveTab('usb2guide')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'usb2guide'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Gauge className="w-3.5 h-3.5 text-amber-500" />
            USB 2.0 특성 & 진단 가이드
          </button>
        </div>

        {/* Eject / Success Toast */}
        {ejectSuccessMsg && (
          <div className="mx-5 mt-3 p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{ejectSuccessMsg}</span>
          </div>
        )}

        {/* Tab 1: Connected External Drives */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 text-xs">
          {activeTab === 'connected' && (
            <div className="space-y-3">
              {externalDrives.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-3">
                  <Usb className="w-9 h-9 mx-auto text-slate-500" />
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">현재 연결된 외장 저장장치가 없습니다.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">PC에 연결된 실제 USB 메모리, 외장 하드/SSD, 볼륨 또는 가상 디스크 이미지를 마운트하세요.</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => setActiveTab('mount')}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>실제 외장 볼륨 / USB 마운트</span>
                    </button>
                  </div>
                </div>
              ) : (
                externalDrives.map(drive => (
                  <div
                    key={drive.id}
                    className={`p-3.5 rounded-lg border transition-all ${
                      selectedDriveId === drive.id
                        ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-xs'
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
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {drive.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                              {drive.mountPoint || 'EXT:'}
                            </span>
                            {drive.isUsb2 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                USB 2.0 (480Mbps)
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {drive.fileSystem || 'exFAT'}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                            <span>용량: {drive.capacityGb !== null ? `${drive.capacityGb}GB` : 'N/A'}</span>
                            <span>•</span>
                            <span>인터페이스: {drive.interface}</span>
                            <span>•</span>
                            <span>건강도: {drive.healthScore !== null ? `${drive.healthScore}%` : 'N/A'}</span>
                          </div>

                          {drive.bridgeChipset && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-mono">
                              <Cpu className="w-3 h-3 text-cyan-500" />
                              <span>브릿지 칩셋: {drive.bridgeChipset}</span>
                              {drive.usbProtocol && (
                                <span className={drive.isUsb2 ? 'text-amber-500 ml-1' : 'text-emerald-500 ml-1'}>
                                  ({drive.usbProtocol})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {selectedDriveId !== drive.id ? (
                          <button
                            onClick={() => {
                              onSelectDrive(drive.id);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
                          >
                            검사 대상으로 선택
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> 현재 선택됨
                          </span>
                        )}

                        <button
                          onClick={() => handleEject(drive)}
                          className="px-2.5 py-1 rounded border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs transition-colors"
                          title="안전 제거 (캐시 플러시 후 분리)"
                        >
                          안전 제거
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: 32 PhysicalDrive Exhaustive Channel Discovery & Volume Mapping */}
          {activeTab === 'probe32' && (
            <div className="space-y-4">
              
              {/* Top Banner & Force Rescan Action */}
              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-purple-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-purple-950/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-600 text-white uppercase tracking-wider">
                        Hardware IOCTL Engine
                      </span>
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                        Windows 32개 물리 드라이브 슬롯 전수 탐색 & 볼륨 역매핑
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

                {/* Key Technical Badges */}
                <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/40 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                    탐색 범위: \\.\PhysicalDrive0 ~ 31 (32개 슬롯)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold">
                    FILE_SHARE_DELETE (잠금/보안 프로세스 충돌 방지)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold">
                    IOCTL_STORAGE_GET_DEVICE_NUMBER (볼륨 문자 매핑)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 border border-purple-500/30 text-purple-700 dark:text-purple-300 font-bold">
                    권한 폴백: R/W ➔ Read-Only ➔ Query(0)
                  </span>
                </div>
              </div>

              {/* Active Discovered Drives in 32 Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-indigo-500" />
                    <span>인식된 물리 스토리지 채널 목록</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    인식됨: {drives.filter(d => !d.attachedFile && !d.attachedFileHandle).length}개 드라이브
                  </span>
                </div>

                <div className="space-y-2">
                  {drives.filter(d => !d.attachedFile && !d.attachedFileHandle).map((drive) => {
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
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs ring-1 ring-indigo-500/40'
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

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3 font-mono">
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
                              <span className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs">
                                <Check className="w-3.5 h-3.5" /> 현재 검사 대상
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  onSelectDrive(drive.id);
                                  setEjectSuccessMsg(`[${drive.mountPoint || path}] 검사 대상으로 전환되었습니다.`);
                                  setTimeout(() => setEjectSuccessMsg(null), 3000);
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
                      if (i === 0 && d.id === 'drive-native-host-real') return true;
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
                              ? 'bg-indigo-600 text-white border-indigo-500 font-bold shadow-xs cursor-pointer'
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
                    USB 멀티 독이나 카드 리더기 사용 시 Windows PnP가 12 이상의 높은 인덱스(PhysicalDrive15 등)를 부여해도 누락 없이 감지합니다.
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">2. 잠금 프로세스 공유 플래그</strong>
                    Windows Defender, 색인기, BitLocker 점유로 인한 <code className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">ERROR_SHARING_VIOLATION</code>을 방지하기 위해 <code className="font-mono">FILE_SHARE_DELETE</code>를 적용합니다.
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">3. 볼륨-물리디스크 역매핑</strong>
                    <code className="font-mono">IOCTL_STORAGE_GET_DEVICE_NUMBER</code>를 통해 C:, D:, E: 드라이브 문자가 어떤 물리 디스크 번호에 소속되어 있는지 정확하게 추적합니다.
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* End of probe32 tab */}

          {/* Tab 3: USB 2.0 Diagnostic & Compatibility Guide */}
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
                {/* 1. Bandwidth */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-amber-500">
                    <Gauge className="w-3.5 h-3.5" />
                    1. 전송 대역폭 한계 (480Mbps / ~35MB/s)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    이론상 최대 속도는 60MB/s이나 프로토콜 오버헤드로 인해 실효 속도는 약 25~42MB/s로 제한됩니다. 고용량(500GB 이상) 검사 시 스캔 시간이 수 시간 소요될 수 있습니다.
                  </p>
                </div>

                {/* 2. Power Supply */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-red-500">
                    <BatteryWarning className="w-3.5 h-3.5" />
                    2. 전력 공급 한계 (5V 500mA / 2.5W)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    2.5인치 외장 HDD 연결 시 전력 부족으로 헤드가 튀는 현상(Click of Death), I/O 타임아웃, 논리적 불안정 섹터(Pending Sector)가 발생하기 쉽습니다. (보조 전원 Y-케이블 권장)
                  </p>
                </div>

                {/* 3. Lack of UASP */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-purple-500">
                    <Cpu className="w-3.5 h-3.5" />
                    3. UASP 미지원 & 단일 큐 BOT 방식
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    USB 2.0은 BOT(Bulk-Only Transport) 방식을 사용하여 한 번에 1개의 I/O 명령만 처리합니다. NCQ(명령어 대기열)가 지원되지 않아 무작위 엑세스 지연시간이 증가합니다.
                  </p>
                </div>

                {/* 4. Flash Wear */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-cyan-500">
                    <Zap className="w-3.5 h-3.5" />
                    4. 구형 2D 낸드 마모 & 읽기 간섭
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                    구형 USB 2.0 메모리는 DRAM-less 저가형 컨트롤러와 2D 플래시 셀을 사용하여 P/E Cycle 수명이 짧고 읽기 간섭(Read Disturb)으로 인한 데이터 오류에 취약합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Native Real Hardware & Storage Mount */}
          {activeTab === 'mount' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-500" />
                  실제 물리 하드웨어 & 로컬 미디어 직접 마운트
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  브라우저의 최신 표준 API(File System Access, HTML5 File API, WebUSB, Web Serial)를 통하여 실제 외장 드라이브, 대용량 파일(.img, .iso 등), USB 기기를 직접 연결하여 바이트 단위로 검사합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Real File Picker */}
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                      <HardDrive className="w-4 h-4 text-emerald-500" />
                      실제 파일 / 디스크 이미지 열기
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      PC 및 워크스테이션의 모든 파일(.iso, .img, .vhd, 압축파일 등)을 선택하여 바이트 단위 I/O 속도와 체크섬 무결성을 직접 스캔합니다.
                    </p>
                  </div>
                  <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs cursor-pointer transition-colors">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>실제 파일 선택 (.iso, .img 등)</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={handleFileChange} 
                    />
                  </label>
                </div>

                {/* 2. Real Directory / Volume Picker */}
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                      <FolderOpen className="w-4 h-4 text-indigo-500" />
                      로컬 드라이브 / 폴더 볼륨 마운트
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      File System Access API로 외장 하드 루트(E:\, F:\) 또는 폴더를 선택하여 색인 지연 및 I/O 권한을 진단합니다.
                    </p>
                  </div>
                  <button
                    onClick={handlePickLocalDirectory}
                    disabled={fsPickerLoading}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs cursor-pointer transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{fsPickerLoading ? '선택창 대기 중...' : '로컬 폴더 / 볼륨 열기'}</span>
                  </button>
                  <input
                    type="file"
                    ref={folderInputRef}
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    multiple
                    className="hidden"
                    onChange={handleFolderFilesChange}
                  />
                </div>

                {/* 3. Real WebUSB Direct Pairing */}
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                      <Usb className="w-4 h-4 text-cyan-500" />
                      물리 USB 저장장치 직접 페어링
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      WebUSB를 통해 컴퓨터에 연결된 USB 플래시 메모리, 외장 SSD, SD 카드 리더기의 물리 디스크립터를 직접 조회합니다.
                    </p>
                  </div>
                  <button
                    onClick={handlePairWebUsb}
                    disabled={fsPickerLoading}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-xs cursor-pointer transition-colors"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span>실제 USB 장치 검색 (WebUSB)</span>
                  </button>
                </div>

                {/* 4. Real Web Serial Direct Pairing */}
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                      <Zap className="w-4 h-4 text-amber-500" />
                      물리 COM / 시리얼 포트 연결
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Web Serial API로 아두이노, 임베디드 스토리지 컨트롤러, USB-UART 직렬 통신 포트를 직접 페어링합니다.
                    </p>
                  </div>
                  <button
                    onClick={handlePairWebSerial}
                    disabled={fsPickerLoading}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-xs cursor-pointer transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>시리얼 포트 검색 (Web Serial)</span>
                  </button>
                </div>
              </div>

              {/* Mobile Devices Notice */}
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    스마트폰 및 모바일 기기 내부 저장소 안내
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    스마트폰·태블릿(Android/iOS) 내부 저장소(UFS/eMMC)는 OS 보안 및 MTP(미디어 전송 프로토콜) 구조상 PC에서 물리 LBA 블록 및 S.M.A.R.T. 센서에 직접 접근할 수 없습니다. 본 소프트웨어는 순수 PC 전용 물리 저장장치(내장 NVMe, SATA SSD, HDD, 외장 USB 드라이브, SD 카드) 진단 전용입니다.
                  </p>
                </div>
              </div>

              {fsPickerError && (
                <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fsPickerError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            USB 2.0 / 3.0 / 3.2 / UASP Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded transition-colors"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
