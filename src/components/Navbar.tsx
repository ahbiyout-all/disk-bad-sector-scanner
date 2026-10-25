import React, { useState, useRef, useEffect } from 'react';
import { DiskDrive, MainAppTab } from '../types';
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
  Cpu,
  Usb,
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
  HelpCircle,
  RefreshCw,
  Terminal,
  Settings,
  BookOpen,
  Thermometer,
  ArrowRight,
  Download,
  RotateCcw,
  FileCheck
} from 'lucide-react';

export interface NavbarProps {
  drives: DiskDrive[];
  selectedDriveId: string;
  onSelectDrive: (id: string) => void;
  activeTab: MainAppTab;
  onSelectTab: (tab: MainAppTab) => void;
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
  onOpenOptionsModal?: () => void;
  onOpenHelpGuideModal?: () => void;
  isThermalStress?: boolean;
  onToggleThermalStress?: () => void;
  onExportResults?: () => void;
  onResetScan?: () => void;
  onOpenReport?: () => void;
}

type ActivePulldown = 'file' | 'view' | 'tools' | 'options' | 'help' | null;

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
  onOpenOptionsModal,
  onOpenHelpGuideModal,
  isThermalStress = false,
  onToggleThermalStress,
  onExportResults,
  onResetScan,
  onOpenReport
}) => {
  const [activeMenu, setActiveMenu] = useState<ActivePulldown>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close active pulldown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
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

  const toggleMenu = (menu: ActivePulldown) => {
    setActiveMenu(prev => prev === menu ? null : menu);
  };

  const handleMenuHover = (menu: ActivePulldown) => {
    if (activeMenu !== null) {
      setActiveMenu(menu);
    }
  };

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
      {/* 1. DESKTOP TOP PULDOWN MENU BAR (파일, 보기, 도구, 옵션, 도움말) */}
      {/* ============================================================== */}
      <div className="hidden md:block w-full px-4 sm:px-6">
        <div className="flex items-center justify-between h-12 gap-3">
          
          {/* Left: Brand Identity + Standard Pull-down Menu Bar */}
          <div className="flex items-center gap-4 min-w-0" ref={menuBarRef}>
            
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-xs ring-2 ring-indigo-500/20">
                D
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {PROJECT_INFO.appName}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold">
                  {PROJECT_INFO.version}
                </span>
              </div>
            </div>

            {/* Classical Desktop Pull-down Menu Bar */}
            <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/60 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold">
              
              {/* 1. 파일 (File) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('file')}
                  onMouseEnter={() => handleMenuHover('file')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    activeMenu === 'file'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>파일(F)</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeMenu === 'file' ? 'rotate-180' : ''}`} />
                </button>

                {activeMenu === 'file' && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      스토리지 파일 및 볼륨
                    </div>

                    {onPickDirectoryVolume && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onPickDirectoryVolume();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-emerald-500" />
                          <span>실제 로컬 볼륨 마운트...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Direct I/O</span>
                      </button>
                    )}

                    {onOpenRealFile && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenRealFile();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span>실물 디스크 파일 열기...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">.img/.iso</span>
                      </button>
                    )}

                    {onRescanDrives && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onRescanDrives();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-indigo-500" />
                          <span>하드웨어 재검색 갱신</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">F5</span>
                      </button>
                    )}

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                    {onOpenReport && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenReport();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-purple-500" />
                          <span>진단 보고서 생성 및 열기...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Report</span>
                      </button>
                    )}

                    {onExportResults && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onExportResults();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Download className="w-4 h-4 text-indigo-500" />
                          <span>검사 결과 내보내기...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">CSV/PDF</span>
                      </button>
                    )}

                    {onResetScan && (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            onResetScan();
                          }}
                          className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                        >
                          <div className="flex items-center gap-2">
                            <RotateCcw className="w-4 h-4 text-amber-500" />
                            <span>현재 검사 세션 초기화</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">R</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 2. 보기 (View) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('view')}
                  onMouseEnter={() => handleMenuHover('view')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    activeMenu === 'view'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>보기(V)</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeMenu === 'view' ? 'rotate-180' : ''}`} />
                </button>

                {activeMenu === 'view' && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      화면 탭 전환
                    </div>

                    <button
                      onClick={() => {
                        onSelectTab('scan');
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        <span className={activeTab === 'scan' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                          1. 라이브 표면 검사
                        </span>
                      </div>
                      {activeTab === 'scan' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>

                    <button
                      onClick={() => {
                        onSelectTab('logs');
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-indigo-500" />
                        <span className={activeTab === 'logs' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                          2. 오류 & 이벤트 로그
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {badCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-red-600 text-white font-bold">
                            {badCount}
                          </span>
                        )}
                        {activeTab === 'logs' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        onSelectTab('health');
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span className={activeTab === 'health' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                          3. 건강 & 발열 추이
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {currentHealthScore}%
                        </span>
                        {activeTab === 'health' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        onSelectTab('smart');
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-indigo-500" />
                        <span className={activeTab === 'smart' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                          4. S.M.A.R.T. 정밀 속성
                        </span>
                      </div>
                      {activeTab === 'smart' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>

                    <button
                      onClick={() => {
                        onSelectTab('history');
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <GitCompare className="w-4 h-4 text-purple-500" />
                        <span className={activeTab === 'history' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                          5. 검사 기록 & 대조
                        </span>
                      </div>
                      {activeTab === 'history' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  </div>
                )}
              </div>

              {/* 3. 도구 (Tools) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('tools')}
                  onMouseEnter={() => handleMenuHover('tools')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    activeMenu === 'tools'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>도구(T)</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeMenu === 'tools' ? 'rotate-180' : ''}`} />
                </button>

                {activeMenu === 'tools' && (
                  <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      전문가용 진단 & 수복 도구
                    </div>

                    {onOpenHardwareDetails && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenHardwareDetails();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-indigo-500" />
                          <span>하드웨어 상세 스펙 분석기</span>
                        </div>
                        <span className="text-[10px] font-mono text-indigo-500 font-bold">
                          {currentDrive.hardwareSpecs?.busType || 'NVMe'}
                        </span>
                      </button>
                    )}

                    {onOpenParallelScanModal && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenParallelScanModal();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-orange-500" />
                          <span>Rayon 다중 병렬 스캔</span>
                        </div>
                        <span className="text-[10px] font-mono bg-orange-100 dark:bg-orange-950 text-orange-600 px-1.5 py-0.2 rounded font-bold">
                          {drives.length}대
                        </span>
                      </button>
                    )}

                    {onOpenTrayGuardianModal && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenTrayGuardianModal();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-emerald-500" />
                          <span>시스템 트레이 가디언</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </button>
                    )}

                    {onOpenBitCarvingModal && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenBitCarvingModal();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Binary className="w-4 h-4 text-indigo-500" />
                          <span>휴리스틱 비트 카빙 수복</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">ECC</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        onOpenExternalDevicesModal();
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Usb className="w-4 h-4 text-blue-500" />
                        <span>외장 저장장치 관리자</span>
                      </div>
                      <span className="text-[10px] font-mono text-blue-500 font-bold">
                        {drives.filter(d => d.isExternal).length}대
                      </span>
                    </button>

                    {onOpenVendorDiagnostics && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenVendorDiagnostics();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-purple-500" />
                          <span>제조사별 특성 & 조치 센터</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Vendors</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 4. 옵션 (Options) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('options')}
                  onMouseEnter={() => handleMenuHover('options')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    activeMenu === 'options'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>옵션(O)</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeMenu === 'options' ? 'rotate-180' : ''}`} />
                </button>

                {activeMenu === 'options' && (
                  <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      프로그램 환경설정
                    </div>

                    <button
                      onClick={onToggleDarkMode}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                        <span>화면 테마 모드</span>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                        {isDarkMode ? '다크 모드' : '라이트 모드'}
                      </span>
                    </button>

                    <button
                      onClick={onToggleMute}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        {!isMuted ? <Volume2 className="w-4 h-4 text-emerald-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                        <span>배드섹터 경고 사운드</span>
                      </div>
                      <span className={`text-[11px] font-bold ${!isMuted ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {!isMuted ? '소리 켬' : '음소거'}
                      </span>
                    </button>

                    <button
                      onClick={onRequestNotification}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-indigo-500" />
                        <span>데스크톱 웹 푸시 알림</span>
                      </div>
                      <span className={`text-[11px] font-bold ${notificationPermission === 'granted' ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {notificationPermission === 'granted' ? '허용됨' : '설정하기'}
                      </span>
                    </button>

                    {onToggleDemoPresets && (
                      <button
                        onClick={onToggleDemoPresets}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>가상 시뮬레이션 데모</span>
                        </div>
                        <span className={`text-[11px] font-bold ${showDemoPresets ? 'text-amber-500' : 'text-slate-400'}`}>
                          {showDemoPresets ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}

                    {onToggleThermalStress && (
                      <button
                        onClick={onToggleThermalStress}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4 text-red-500" />
                          <span>60°C 과열 경보 테스트</span>
                        </div>
                        <span className={`text-[11px] font-bold ${isThermalStress ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                          {isThermalStress ? '과열 부하' : '정상'}
                        </span>
                      </button>
                    )}

                    {onOpenOptionsModal && (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button
                          onClick={() => {
                            setActiveMenu(null);
                            onOpenOptionsModal();
                          }}
                          className="w-full px-3 py-2 flex items-center justify-between hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-left transition-colors cursor-pointer text-indigo-600 dark:text-indigo-400 font-bold"
                        >
                          <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            <span>전체 환경설정 상세창...</span>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 5. 도움말 (Help) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('help')}
                  onMouseEnter={() => handleMenuHover('help')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                    activeMenu === 'help'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>도움말(H)</span>
                  {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeMenu === 'help' ? 'rotate-180' : ''}`} />
                </button>

                {activeMenu === 'help' && (
                  <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      사용자 가이드 & 정보
                    </div>

                    {onOpenHelpGuideModal && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenHelpGuideModal();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-blue-500" />
                          <span>검사 및 섹터 진단 가이드...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">F1</span>
                      </button>
                    )}

                    {onOpenSupportedCatalog && (
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onOpenSupportedCatalog();
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-teal-500" />
                          <span>지원 하드웨어 카탈로그...</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Tools</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        onOpenDllDocs();
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-indigo-500" />
                        <span>Rust 네이티브 코어 명세서...</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">DLL</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        onOpenUpdateModal();
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span>GitHub 자동 업데이트 확인...</span>
                      </div>
                      {hasUpdate ? (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-bold animate-pulse">
                          NEW
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">v{PROJECT_INFO.version}</span>
                      )}
                    </button>

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        onOpenAboutModal();
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-400" />
                        <span>프로그램 정보 및 공식 채널...</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">About</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right: Target Drive Selector Dropdown & Hardware Vitals */}
          <div className="flex items-center gap-2.5 shrink-0">
            
            {/* Target Drive Selector Pulldown */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 shadow-2xs">
              <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {getDriveTypeIcon(currentDrive)}
                <span>Drive:</span>
              </div>
              <select
                value={selectedDriveId}
                onChange={(e) => onSelectDrive(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer truncate max-w-[210px]"
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
                  title="디스크 장치 재검색 및 실시간 하드웨어 프로브 갱신 (F5)"
                  aria-label="장치 재검색"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                </button>
              )}
            </div>

            {/* Quick Health & Temperature Badges */}
            <div className="hidden lg:flex items-center gap-1.5 font-mono text-xs font-bold">
              <span className={`px-2 py-0.5 rounded-md border ${
                currentHealthScore >= 80 
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/60 border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                건강도: {currentHealthScore}%
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                {currentDrive?.temperatureC || 36}°C
              </span>
            </div>

          </div>

        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. MOBILE ADAPTIVE BAR (< md) */}
      {/* ============================================================== */}
      <div className="md:hidden">
        {/* Mobile Row 1: Logo & Target Drive & Hamburger Toggle */}
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

          <div className="flex items-center gap-1.5">
            {onOpenOptionsModal && (
              <button
                onClick={onOpenOptionsModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="옵션 설정"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {onOpenHelpGuideModal && (
              <button
                onClick={onOpenHelpGuideModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="도움말 가이드"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-0.5"
              aria-label="풀다운 메뉴 열기/닫기"
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

        {/* Mobile Slide-Down Pulldown Menu Sheet */}
        {isMobileMenuOpen && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3.5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            
            {/* Group 1: 파일(F) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>파일 메뉴 (File)</span>
                <FolderOpen className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {onPickDirectoryVolume && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onPickDirectoryVolume();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">볼륨 마운트</span>
                  </button>
                )}

                {onOpenRealFile && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenRealFile();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">파일 열기</span>
                  </button>
                )}

                {onOpenReport && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenReport();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-center gap-2"
                  >
                    <FileCheck className="w-4 h-4 text-purple-500 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">진단 리포트</span>
                  </button>
                )}

                {onExportResults && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onExportResults();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">내보내기</span>
                  </button>
                )}
              </div>
            </div>

            {/* Group 2: 도구(T) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>전문가 도구 (Tools)</span>
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {onOpenParallelScanModal && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenParallelScanModal();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-start gap-2"
                  >
                    <Layers className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">다중 병렬 스캔</div>
                      <div className="text-[10px] text-slate-400">{drives.length}대 동시 검사</div>
                    </div>
                  </button>
                )}

                {onOpenTrayGuardianModal && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenTrayGuardianModal();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-start gap-2"
                  >
                    <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">트레이 가디언</div>
                      <div className="text-[10px] text-slate-400">상시 감시 데몬</div>
                    </div>
                  </button>
                )}

                {onOpenBitCarvingModal && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenBitCarvingModal();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-start gap-2"
                  >
                    <Binary className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">비트 카빙 수복</div>
                      <div className="text-[10px] text-slate-400">매직 바이트 복원</div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenExternalDevicesModal();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-start gap-2"
                >
                  <Usb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">외장 저장장치</div>
                    <div className="text-[10px] text-slate-400">USB/UASP/SD</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Group 3: 옵션(O) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>프로그램 옵션 (Options)</span>
                <Settings className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={onToggleDarkMode}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center justify-between"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">테마</span>
                  <span className="font-mono text-indigo-500 font-bold">{isDarkMode ? '🌙 Dark' : '☀️ Light'}</span>
                </button>

                <button
                  onClick={onToggleMute}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center justify-between"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">경고음</span>
                  <span className={`font-bold ${!isMuted ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {!isMuted ? '켬' : '음소거'}
                  </span>
                </button>

                {onOpenOptionsModal && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenOptionsModal();
                    }}
                    className="col-span-2 py-2 px-3 rounded-lg bg-indigo-600 text-white font-bold text-center flex items-center justify-center gap-1.5"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>환경설정 상세창 열기</span>
                  </button>
                )}
              </div>
            </div>

            {/* Group 4: 도움말(H) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>도움말 (Help)</span>
                <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {onOpenHelpGuideModal && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenHelpGuideModal();
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">진단 가이드</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenUpdateModal();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">업데이트 확인</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenDllDocs();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">Rust DLL 명세</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenAboutModal();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-left flex items-center gap-1.5"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">제작자 & 채널</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </header>
  );
};
