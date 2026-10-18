import React, { useState, useRef, useEffect } from 'react';
import { DiskDrive } from '../types';
import { PROJECT_INFO } from '../config/projectInfo';
import { 
  Bell, 
  BellOff, 
  Volume2, 
  VolumeX, 
  Moon, 
  Sun, 
  ShieldCheck, 
  Activity, 
  GitCompare, 
  Sparkles, 
  Info,
  ExternalLink,
  Cpu,
  Usb,
  Smartphone,
  Menu,
  X,
  ChevronDown,
  HardDrive,
  Zap,
  Check,
  Layers,
  Shield,
  Binary,
  FolderOpen,
  FileText,
  Sliders,
  Wrench,
  HelpCircle,
  RefreshCw,
  Terminal
} from 'lucide-react';

interface NavbarProps {
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  activeTab: 'scan' | 'health' | 'history';
  onSelectTab: (tab: 'scan' | 'health' | 'history') => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  currentHealthScore: number;
  badCount?: number;
  hasUpdate?: boolean;
  latestVersion?: string;
  onOpenUpdateModal: () => void;
  onOpenAboutModal: () => void;
  onOpenDllDocs: () => void;
  onOpenExternalDevicesModal: () => void;
  onOpenMobileDiagnostics: () => void;
  onOpenVendorDiagnostics?: () => void;
  onOpenSupportedCatalog?: () => void;
  onOpenParallelScanModal?: () => void;
  onOpenTrayGuardianModal?: () => void;
  onOpenBitCarvingModal?: () => void;
  showDemoPresets?: boolean;
  onToggleDemoPresets?: () => void;
  onPickDirectoryVolume?: () => void;
  onOpenRealFile?: () => void;
  onOpenHardwareDetails?: () => void;
  onRescanDrives?: () => Promise<void>;
  isRescanning?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  drives,
  selectedDriveId,
  onSelectDrive,
  activeTab,
  onSelectTab,
  isDarkMode,
  onToggleDarkMode,
  isMuted,
  onToggleMute,
  notificationPermission,
  onRequestNotification,
  currentHealthScore,
  badCount = 0,
  hasUpdate = false,
  latestVersion,
  onOpenUpdateModal,
  onOpenAboutModal,
  onOpenDllDocs,
  onOpenExternalDevicesModal,
  onOpenMobileDiagnostics,
  onOpenVendorDiagnostics,
  onOpenSupportedCatalog,
  onOpenParallelScanModal,
  onOpenTrayGuardianModal,
  onOpenBitCarvingModal,
  showDemoPresets = false,
  onToggleDemoPresets,
  onPickDirectoryVolume,
  onOpenRealFile,
  onOpenHardwareDetails,
  onRescanDrives,
  isRescanning = false,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isSystemDropdownOpen, setIsSystemDropdownOpen] = useState(false);

  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const systemDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
      if (systemDropdownRef.current && !systemDropdownRef.current.contains(e.target as Node)) {
        setIsSystemDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsToolsDropdownOpen(false);
        setIsSystemDropdownOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Categorize drives: real host storage, real mounted files/volumes, and demo simulation presets
  const realHostDrives = drives.filter(d => !d.isDemoPreset && !d.attachedFile && !d.attachedFileHandle);
  const realFileAndVolumeDrives = drives.filter(d => !d.isDemoPreset && (d.attachedFile || d.attachedFileHandle));
  const demoDrives = drives.filter(d => d.isDemoPreset);

  // Active drive metadata
  const currentDrive = drives.find(d => d.id === selectedDriveId) || drives[0];

  const getDriveTypeIcon = (drive?: DiskDrive) => {
    if (!drive) return <HardDrive className="w-3.5 h-3.5 text-slate-500" />;
    if (drive.isExternal) {
      return <Usb className="w-3.5 h-3.5 text-indigo-500" />;
    }
    if (drive.type === 'NVMe') {
      return <Zap className="w-3.5 h-3.5 text-violet-500" />;
    }
    return <HardDrive className="w-3.5 h-3.5 text-sky-500" />;
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors shadow-2xs font-sans">
      
      {/* ============================================================== */}
      {/* 1. TOP PRIMARY NAVIGATION BAR (Desktop md and up) */}
      {/* ============================================================== */}
      <div className="hidden md:block w-full px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          
          {/* Left: Brand Identity & Target Drive Selector Pulldown */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-xs ring-2 ring-indigo-500/20">
                D
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {PROJECT_INFO.appName}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold">
                  {PROJECT_INFO.version}
                </span>
              </div>
            </div>

            {/* Target Drive Dropdown Container */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 shadow-2xs">
              <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {getDriveTypeIcon(currentDrive)}
                <span>Drive:</span>
              </div>
              <select
                value={selectedDriveId}
                onChange={(e) => onSelectDrive(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer truncate max-w-[220px]"
                aria-label="대상 드라이브 선택"
              >
                {realFileAndVolumeDrives.length > 0 && (
                  <optgroup label="📂 실제 마운트 볼륨 & 파일 (Direct I/O)" className="bg-white dark:bg-slate-900 text-emerald-600 font-bold">
                    {realFileAndVolumeDrives.map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                        [📂 실제] {d.name} ({d.capacityGb}GB)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="🖥️ 실제 로컬 저장장치 (Physical Storage)" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                  {realHostDrives.map((d) => (
                    <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                      [{d.type} {d.mountPoint || ''}] {d.name} ({d.capacityGb}GB)
                    </option>
                  ))}
                </optgroup>
                {showDemoPresets && demoDrives.length > 0 && (
                  <optgroup label="🧪 가상 시뮬레이션 데모 프리셋 (Demo Presets)" className="bg-white dark:bg-slate-900 text-amber-600 font-bold">
                    {demoDrives.map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-600 dark:text-slate-400 font-sans font-normal">
                        [가상 데모] {d.name} ({d.capacityGb}GB)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {onRescanDrives && (
                <button
                  onClick={() => onRescanDrives()}
                  disabled={isRescanning}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  title="디스크 장치 재검색 및 실시간 하드웨어 프로브 갱신"
                  aria-label="장치 재검색"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                </button>
              )}
            </div>

            {/* Quick Mount & Hardware Specs Action Chips */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              {onOpenHardwareDetails && (
                <button
                  onClick={onOpenHardwareDetails}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="선택된 디스크의 상세 하드웨어 스펙, 4K 정렬, 컨트롤러 및 낸드 내구성 정보"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>장치 스펙</span>
                </button>
              )}

              {onPickDirectoryVolume && (
                <button
                  onClick={onPickDirectoryVolume}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="실제 로컬 디렉토리/폴더 볼륨 마운트"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>볼륨 마운트</span>
                </button>
              )}

              {onOpenRealFile && (
                <button
                  onClick={onOpenRealFile}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="실제 이미지 또는 디스크 파일 직접 열기 (.img, .iso, .vhd)"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>파일 열기</span>
                </button>
              )}
            </div>
          </div>

          {/* Center: Main View Segmented Control Tabs */}
          <nav className="flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 p-0.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 shadow-inner">
            <button
              onClick={() => onSelectTab('scan')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'scan'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>표면 검사</span>
            </button>

            <button
              onClick={() => onSelectTab('health')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'health'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>건강 요약</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                activeTab === 'health'
                  ? 'bg-indigo-800 text-white'
                  : currentHealthScore >= 80
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-500/20'
              }`}>
                {currentHealthScore}%
              </span>
            </button>

            <button
              onClick={() => onSelectTab('history')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>기록 비교</span>
            </button>
          </nav>

          {/* Right: Dropdowns & Utility Controls */}
          <div className="flex items-center gap-2 shrink-0">
            
            {/* 1. Advanced Tools Pulldown Menu (고급 진단 도구) */}
            <div className="relative" ref={toolsDropdownRef}>
              <button
                onClick={() => {
                  setIsToolsDropdownOpen(!isToolsDropdownOpen);
                  setIsSystemDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  isToolsDropdownOpen
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70'
                }`}
                title="다중 병렬 스캔, 트레이 가디언, 비트 카빙, 외장 스토리지 및 제조사 진단 센터"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                <span>고급 도구</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Tools Pulldown Menu Dropdown Card */}
              {isToolsDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>전문가용 진단 & 수복 도구</span>
                    <span className="text-[10px] font-mono text-indigo-500">PRO TOOLS</span>
                  </div>

                  {/* Detailed Hardware Specifications */}
                  {onOpenHardwareDetails && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenHardwareDetails();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">하드웨어 상세 스펙 분석기</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            {currentDrive.hardwareSpecs?.busType || 'NVMe'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          4K AF, TRIM, 컨트롤러, 파티션 및 낸드 내구성
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Rayon Multi-Drive Parallel Scan */}
                  {onOpenParallelScanModal && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenParallelScanModal();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Rayon 다중 병렬 스캔</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                            {drives.length}대
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          멀티스레드 기반 전 드라이브 동시 표면 검사
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Lightweight System Tray Guardian */}
                  {onOpenTrayGuardianModal && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenTrayGuardianModal();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">시스템 트레이 가디언</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          S.M.A.R.T. 및 발열 실시간 백그라운드 상주 감시
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Heuristic Bit Carving Recovery Engine */}
                  {onOpenBitCarvingModal && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenBitCarvingModal();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Binary className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">휴리스틱 비트 카빙 수복</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          손상 섹터 매직 바이트 분석 및 ECC 비트 복구
                        </p>
                      </div>
                    </button>
                  )}

                  {/* External Storage Device Manager */}
                  <button
                    onClick={() => {
                      setIsToolsDropdownOpen(false);
                      onOpenExternalDevicesModal();
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      <Usb className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">외장 저장장치 관리자</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                          {drives.filter(d => d.isExternal).length}대
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        USB 2.0 / 3.2, UASP, SD 카드 핫플러그 지원
                      </p>
                    </div>
                  </button>

                  {/* Vendor Specific Diagnostics */}
                  {onOpenVendorDiagnostics && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenVendorDiagnostics();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">제조사별 특성 & 조치 센터</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          삼성, 시게이트, WD, SK하이닉스 등 전용 프로토콜
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Supported Hardware Catalog */}
                  {onOpenSupportedCatalog && (
                    <button
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        onOpenSupportedCatalog();
                      }}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-md bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">지원 하드웨어 카탈로그</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          제조사별 제품군 및 공식 유틸리티 연동
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 2. System & Help Pulldown Menu (시스템 및 정보) */}
            <div className="relative" ref={systemDropdownRef}>
              <button
                onClick={() => {
                  setIsSystemDropdownOpen(!isSystemDropdownOpen);
                  setIsToolsDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  isSystemDropdownOpen
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70'
                }`}
                title="Rust Native Core DLL 명세서, GitHub 릴리즈 업데이트 및 제작자 정보"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                <span>시스템</span>
                {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isSystemDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* System Pulldown Menu Dropdown Card */}
              {isSystemDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    시스템 & 릴리즈 정보
                  </div>

                  {/* GitHub Real-time Live Updates */}
                  <button
                    onClick={() => {
                      setIsSystemDropdownOpen(false);
                      onOpenUpdateModal();
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">GitHub 자동 업데이트</span>
                        {hasUpdate && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-bold animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {hasUpdate ? `최신 v${latestVersion} 다운로드 가능` : '현재 최신 버전 유지 중'}
                      </p>
                    </div>
                  </button>

                  {/* Rust Native DLL Specification */}
                  <button
                    onClick={() => {
                      setIsSystemDropdownOpen(false);
                      onOpenDllDocs();
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      <Terminal className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Rust 네이티브 코어 명세</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Direct I/O 및 SIMD 알고리즘
                      </p>
                    </div>
                  </button>

                  {/* Developer & Channels About */}
                  <button
                    onClick={() => {
                      setIsSystemDropdownOpen(false);
                      onOpenAboutModal();
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      <Info className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">제작자 & 공식 채널</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {PROJECT_INFO.developer.name} · CISNet
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Status / Hardware Toggles */}
            <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
              {/* Notification Permission Toggle */}
              <button
                onClick={onRequestNotification}
                className={`p-1.5 rounded-lg border transition-colors relative cursor-pointer ${
                  notificationPermission === 'granted'
                    ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={notificationPermission === 'granted' ? '웹 알림 활성화됨' : '오류 발생 시 브라우저 알림 켜기'}
              >
                {notificationPermission === 'granted' ? (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  </>
                ) : (
                  <BellOff className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Audio Alert Mute Toggle */}
              <button
                onClick={onToggleMute}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  !isMuted
                    ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isMuted ? '배드섹터 경고음 켜기' : '경고음 음소거'}
              >
                {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Dark Mode Toggle */}
              <button
                onClick={onToggleDarkMode}
                className="p-1.5 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TOP SUB-HEADER: QUICK SELECT CHIPS BAR (상단 퀵 셀렉트 칩 바) */}
      {/* ============================================================== */}
      <div className="w-full bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/70 dark:border-slate-800/70 px-3 sm:px-6 py-1.5">
        <div className="flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          
          {/* Active Drive Quick Vitals Chip */}
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hidden sm:inline">
              Active:
            </span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-mono">
              {getDriveTypeIcon(currentDrive)}
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px] sm:max-w-[240px]">
                {currentDrive?.name || 'Local Host Storage'}
              </span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span className="text-slate-600 dark:text-slate-300 font-semibold">{currentDrive?.capacityGb}GB</span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span className={`font-bold ${
                (currentDrive?.healthScore || 100) >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
              }`}>
                {currentDrive?.healthScore}%
              </span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span className="text-slate-600 dark:text-slate-400">{currentDrive?.temperatureC || 36}°C</span>
            </div>
          </div>

          {/* Quick Action Chips Group (퀵 셀렉트 칩 그룹) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Chip 0: Hardware Specs */}
            {onOpenHardwareDetails && (
              <button
                onClick={onOpenHardwareDetails}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                title="선택된 디스크의 상세 하드웨어 스펙 및 4K 정렬 상태 열기"
              >
                <Cpu className="w-3 h-3 text-indigo-500" />
                <span>장치 스펙</span>
                <span className="px-1 rounded-full bg-indigo-200/80 dark:bg-indigo-900 text-[9px] font-mono">
                  {currentDrive?.hardwareSpecs?.busType || currentDrive?.type || 'NVMe'}
                </span>
              </button>
            )}

            {/* Quick Chip 1: Parallel Scan */}
            {onOpenParallelScanModal && (
              <button
                onClick={onOpenParallelScanModal}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-orange-500/40 bg-orange-50/80 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                title="Rayon 기반 다중 디스크 동시 병렬 스캔 열기"
              >
                <Layers className="w-3 h-3 text-orange-500" />
                <span>병렬 스캔</span>
                <span className="px-1 rounded-full bg-orange-200 dark:bg-orange-900 text-[9px] font-mono">
                  {drives.length}
                </span>
              </button>
            )}

            {/* Quick Chip 2: System Tray Guardian */}
            {onOpenTrayGuardianModal && (
              <button
                onClick={onOpenTrayGuardianModal}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                title="경량 시스템 트레이 가디언 데몬 상주 상태 열기"
              >
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>트레이 가디언</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            )}

            {/* Quick Chip 3: Bit Carving */}
            {onOpenBitCarvingModal && (
              <button
                onClick={onOpenBitCarvingModal}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                title="손상 섹터 매직 바이트 비트 카빙 & ECC 수복 엔진 열기"
              >
                <Binary className="w-3 h-3 text-indigo-500" />
                <span>비트 카빙</span>
              </button>
            )}

            {/* Quick Chip 4: External Device Manager */}
            <button
              onClick={onOpenExternalDevicesModal}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-blue-500/40 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
              title="외장 드라이브 및 USB 관리자 열기"
            >
              <Usb className="w-3 h-3 text-blue-500" />
              <span>외장 관리</span>
              <span className="px-1 rounded-full bg-blue-200 dark:bg-blue-900 text-[9px] font-mono">
                {drives.filter(d => d.isExternal).length}
              </span>
            </button>

            {/* Quick Chip 5: Vendor Specific Diagnostics */}
            {onOpenVendorDiagnostics && (
              <button
                onClick={onOpenVendorDiagnostics}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-50/80 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                title="제조사 전용 특성 및 조치 센터"
              >
                <Cpu className="w-3 h-3 text-purple-500" />
                <span>제조사 특성</span>
              </button>
            )}

            {/* Quick Chip 6: Demo Preset Toggle */}
            {onToggleDemoPresets && (
              <button
                onClick={onToggleDemoPresets}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all cursor-pointer shadow-2xs ${
                  showDemoPresets
                    ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={showDemoPresets ? '가상 시뮬레이션 데모 프리셋 숨기기 (실제 장치만 보기)' : '가상 시뮬레이션 데모 프리셋 표시 (테스트용)'}
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>가상 데모: {showDemoPresets ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. MOBILE ADAPTIVE BAR (< md) */}
      {/* ============================================================== */}
      <div className="block md:hidden w-full">
        {/* Mobile Row 1: Brand & Core Controls */}
        <div className="flex items-center justify-between h-12 px-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs">
              D
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                DiskSentinel
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                {PROJECT_INFO.version}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onToggleMute}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isMuted ? '음소거 해제' : '음소거'}
            >
              {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>

            <button
              onClick={onToggleDarkMode}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isDarkMode ? '라이트 모드' : '다크 모드'}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-0.5"
              aria-label="메뉴 열기/닫기"
            >
              {isMobileMenuOpen ? (
                <X className="w-4.5 h-4.5" />
              ) : (
                <>
                  <Menu className="w-4.5 h-4.5" />
                  {hasUpdate && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Row 2: Target Drive Selector & Volume Mount Button */}
        <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 shadow-2xs">
            <div className="shrink-0">
              {getDriveTypeIcon(currentDrive)}
            </div>
            <select
              value={selectedDriveId}
              onChange={(e) => onSelectDrive(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer truncate"
              aria-label="검사 대상 드라이브 선택"
            >
              {realFileAndVolumeDrives.length > 0 && (
                <optgroup label="📂 실제 마운트 볼륨 & 파일" className="bg-white dark:bg-slate-900 text-emerald-600 font-bold">
                  {realFileAndVolumeDrives.map((d) => (
                    <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                      [📂] {d.name} ({d.capacityGb}GB)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="🖥️ 실제 로컬 저장장치" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                {realHostDrives.map((d) => (
                  <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                    [{d.type} {d.mountPoint || ''}] {d.name} ({d.capacityGb}GB)
                  </option>
                ))}
              </optgroup>
              {showDemoPresets && demoDrives.length > 0 && (
                <optgroup label="🧪 가상 데모 프리셋 (시뮬레이션)" className="bg-white dark:bg-slate-900 text-amber-600 font-bold">
                  {demoDrives.map((d) => (
                    <option key={d.id} value={d.id} className="text-slate-600 dark:text-slate-400">
                      [가상 데모] {d.name} ({d.capacityGb}GB)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {onPickDirectoryVolume && (
            <button
              onClick={onPickDirectoryVolume}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0"
              title="실제 디렉토리 볼륨 마운트"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span>마운트</span>
            </button>
          )}
        </div>

        {/* Mobile Row 3: Segmented Tab Bar */}
        <div className="grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
          <button
            onClick={() => onSelectTab('scan')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all min-h-[36px] ${
              activeTab === 'scan'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>표면 검사</span>
          </button>

          <button
            onClick={() => onSelectTab('health')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all min-h-[36px] ${
              activeTab === 'health'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>건강 {currentHealthScore}%</span>
          </button>

          <button
            onClick={() => onSelectTab('history')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all min-h-[36px] ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>기록 비교</span>
          </button>
        </div>

        {/* Mobile Slide-Down Quick Menu Sheet */}
        {isMobileMenuOpen && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">전문가 도구 및 시스템 설정</span>
              <span className="font-mono text-[11px] text-slate-400">{PROJECT_INFO.developer.name} · {PROJECT_INFO.version}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Rayon Parallel Scan */}
              {onOpenParallelScanModal && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenParallelScanModal();
                  }}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">다중 병렬 스캔</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{drives.length}대 동시 검사</div>
                  </div>
                </button>
              )}

              {/* System Tray Guardian */}
              {onOpenTrayGuardianModal && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenTrayGuardianModal();
                  }}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">트레이 가디언</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">상시 감시 데몬</div>
                  </div>
                </button>
              )}

              {/* Bit Carving Recovery */}
              {onOpenBitCarvingModal && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenBitCarvingModal();
                  }}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <Binary className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">비트 카빙 수복</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">매직 바이트 복원</div>
                  </div>
                </button>
              )}

              {/* External Devices */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenExternalDevicesModal();
                }}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Usb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">외장 저장장치</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">USB/UASP/SD 관리</div>
                </div>
              </button>

              {/* Vendor Diagnostics */}
              {onOpenVendorDiagnostics && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenVendorDiagnostics();
                  }}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <Cpu className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">제조사 특성 센터</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">맞춤 조치 가이드</div>
                  </div>
                </button>
              )}

              {/* GitHub Updates */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenUpdateModal();
                }}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    <span>자동 업데이트</span>
                    {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {hasUpdate ? `v${latestVersion} 가능` : '최신 버전 유지'}
                  </div>
                </div>
              </button>

              {/* Rust DLL Docs */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenDllDocs();
                }}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">Rust DLL 명세</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">코어 아키텍처</div>
                </div>
              </button>

              {/* About CISNet */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAboutModal();
                }}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">제작자 & 채널</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">AhBiYout / CISNet</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
