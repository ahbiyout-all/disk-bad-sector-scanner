import React, { useState } from 'react';
import { DiskDrive } from '../types';
import { EXTERNAL_DRIVE_PRESETS } from '../utils/drivePresets';
import { 
  createNativeDriveFromDirectoryHandle, 
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
  Cpu,
  Trash2,
  Lock,
  ArrowRight,
  AlertTriangle,
  BatteryWarning,
  Gauge
} from 'lucide-react';

interface ExternalDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  onAddDrive: (newDrive: DiskDrive) => void;
  onEjectDrive: (id: string) => void;
}

export const ExternalDeviceModal: React.FC<ExternalDeviceModalProps> = ({
  isOpen,
  onClose,
  drives,
  selectedDriveId,
  onSelectDrive,
  onAddDrive,
  onEjectDrive
}) => {
  const [activeTab, setActiveTab] = useState<'connected' | 'mount' | 'presets' | 'usb2guide'>('connected');
  const [ejectSuccessMsg, setEjectSuccessMsg] = useState<string | null>(null);
  const [fsPickerError, setFsPickerError] = useState<string | null>(null);
  const [fsPickerLoading, setFsPickerLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const externalDrives = drives.filter(d => d.isExternal);

  // Handle Safe Eject
  const handleEject = (drive: DiskDrive) => {
    onEjectDrive(drive.id);
    setEjectSuccessMsg(`[${drive.mountPoint || 'USB'}] ${drive.name} 안전 제거 완료 (캐시 플러시 정상 처리)`);
    setTimeout(() => setEjectSuccessMsg(null), 3500);
  };

  // Handle Hot-Plug Preset Drive
  const handleAddPreset = (preset: typeof EXTERNAL_DRIVE_PRESETS[0]) => {
    const newDrive: DiskDrive = {
      ...preset,
      id: `drive-ext-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      isDemoPreset: true
    };
    onAddDrive(newDrive);
    onSelectDrive(newDrive.id);
    setEjectSuccessMsg(`새 외장 저장장치가 연결되었습니다: ${newDrive.name}`);
    setTimeout(() => setEjectSuccessMsg(null), 3500);
    setActiveTab('connected');
  };

  // Handle Web File System Access API (Actual USB / External Storage selection)
  const handlePickLocalDirectory = async () => {
    setFsPickerError(null);
    setFsPickerLoading(true);

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
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setFsPickerError('디렉토리 선택 중 오류가 발생했거나 권한이 거부되었습니다.');
        }
      } finally {
        setFsPickerLoading(false);
      }
    } else {
      setFsPickerLoading(false);
      setFsPickerError('현재 브라우저에서는 showDirectoryPicker가 지원되지 않거나 iframe 제한이 있습니다. 아래 [실제 파일 직접 열기]를 이용해 주세요.');
    }
  };

  // Handle Real File Selection (Universal support across all desktop & mobile browsers!)
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
            onClick={() => setActiveTab('presets')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'presets'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            핫플러그 장치 추가
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

          <button
            onClick={() => setActiveTab('mount')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'mount'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            실제 디렉토리 마운트
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
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <Usb className="w-8 h-8 mx-auto text-slate-500" />
                  <p>현재 연결된 외장 저장장치가 없습니다.</p>
                  <button
                    onClick={() => setActiveTab('presets')}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    외장 장치 핫플러그 연결하기
                  </button>
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
                            <span>용량: {drive.capacityGb}GB</span>
                            <span>•</span>
                            <span>인터페이스: {drive.interface}</span>
                            <span>•</span>
                            <span>건강도: {drive.healthScore}%</span>
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

          {/* Tab 2: Hot-Plug Presets */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-500">
                아래 프리셋 중 원하는 외장 기기를 클릭하여 즉시 핫플러그(Hot-Plug) 연결하세요:
              </div>

              <div className="space-y-2">
                {EXTERNAL_DRIVE_PRESETS.map((preset, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500/50 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                        preset.isUsb2 
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-500' 
                          : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500'
                      }`}>
                        <Usb className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate flex items-center gap-1.5">
                          <span>{preset.name}</span>
                          {preset.isUsb2 && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                              USB 2.0
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {preset.capacityGb}GB • {preset.interface} • {preset.fileSystem}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddPreset(preset)}
                      className="shrink-0 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>연결</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      PC/모바일의 모든 파일(.iso, .img, .vhd, 압축파일 등)을 선택하여 바이트 단위 I/O 속도와 체크섬 무결성을 직접 스캔합니다.
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
                </div>

                {/* 3. Real WebUSB Direct Pairing */}
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                      <Usb className="w-4 h-4 text-cyan-500" />
                      물리 USB 하드웨어 직접 페어링
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      WebUSB를 통해 컴퓨터에 연결된 USB 메모리, 외장 DAC, 스마트폰 등의 물리 하드웨어 디스크립터를 직접 조회합니다.
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
