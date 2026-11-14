import React, { useState, useRef, useEffect } from 'react';
import { DiskDrive, MainAppTab } from '../types';
import { PROJECT_INFO } from '../config/projectInfo';
import { 
  Bell, 
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
  ChevronDown,
  HardDrive,
  Zap,
  Check,
  Layers,
  Shield,
  Binary,
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
  notificationsEnabled?: boolean;
  onRequestNotification: () => void;
  onToggleNotificationsEnabled?: () => void;
  currentHealthScore: number | null;
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
  onOpenHardwareDetails?: () => void;
  onRescanDrives?: () => Promise<void>;
  isRescanning?: boolean;
  onOpenOptionsModal?: () => void;
  onOpenHelpGuideModal?: () => void;
  onExportResults?: () => void;
  onResetScan?: () => void;
  onOpenReport?: () => void;
  isAutoRepairMode?: boolean;
  onToggleAutoRepairMode?: () => void;
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
  notificationsEnabled = true,
  onRequestNotification,
  onToggleNotificationsEnabled,
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
  onOpenHardwareDetails,
  onRescanDrives,
  isRescanning = false,
  onOpenOptionsModal,
  onOpenHelpGuideModal,
  onExportResults,
  onResetScan,
  onOpenReport,
  isAutoRepairMode = false,
  onToggleAutoRepairMode
}) => {
  const [activeMenu, setActiveMenu] = useState<ActivePulldown>(null);
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
    <header className="sticky top-0 z-40 bg-white/98 dark:bg-slate-900/98 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors shadow-2xs font-sans select-none">
      
      {/* ============================================================== */}
      {/* DESKTOP NATIVE APPLICATION TOP MENU BAR                        */}
      {/* ============================================================== */}
      <div className="w-full px-3 sm:px-5">
        <div className="flex items-center justify-between h-12 gap-3">
          
          {/* Left: Brand Identity + Standard Pull-down Menu Bar */}
          <div className="flex items-center gap-3 min-w-0" ref={menuBarRef}>
            
            {/* Logo and Desktop PC Edition Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-6.5 h-6.5 bg-indigo-600 rounded-md flex items-center justify-center text-white font-black text-xs shadow-xs ring-1 ring-indigo-500/30">
                D
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {PROJECT_INFO.appName}
                </span>
                <span className="hidden sm:inline-flex text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold uppercase tracking-wider">
                  DESKTOP PC
                </span>
              </div>
            </div>

            {/* Classical Desktop Pull-down Menu Bar */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/90 dark:border-slate-700/80 text-xs font-semibold">
              
              {/* 1. 파일 (File) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('file')}
                  onMouseEnter={() => handleMenuHover('file')}
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
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
                      물리 장치 및 진단 제어
                    </div>

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
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
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
                      <span className="text-[10px] text-slate-400 font-mono">1</span>
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
                        <span className="text-[10px] text-slate-400 font-mono">2</span>
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
                          {currentHealthScore !== null ? `${currentHealthScore}%` : 'N/A'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">3</span>
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
                      <span className="text-[10px] text-slate-400 font-mono">4</span>
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
                      <span className="text-[10px] text-slate-400 font-mono">5</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. 도구 (Tools) Pulldown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu('tools')}
                  onMouseEnter={() => handleMenuHover('tools')}
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
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
                          {currentDrive?.hardwareSpecs?.busType || 'N/A'}
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
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">ACTIVE</span>
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
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
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
                      onClick={() => {
                        if (notificationPermission === 'granted' && onToggleNotificationsEnabled) {
                          onToggleNotificationsEnabled();
                        } else {
                          onRequestNotification();
                        }
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Bell className={`w-4 h-4 ${notificationPermission === 'granted' && notificationsEnabled ? 'text-emerald-500' : 'text-indigo-500'}`} />
                        <span>데스크톱 웹 푸시 알림</span>
                      </div>
                      <span className={`text-[11px] font-bold ${
                        notificationPermission === 'granted' && notificationsEnabled
                          ? 'text-emerald-500'
                          : notificationPermission === 'granted'
                          ? 'text-amber-500'
                          : 'text-slate-400'
                      }`}>
                        {notificationPermission === 'granted'
                          ? notificationsEnabled
                            ? '허용됨'
                            : '일시 중지'
                          : '설정하기'}
                      </span>
                    </button>

                    {/* Auto-Repair option follows */}

                    {onToggleAutoRepairMode && (
                      <button
                        onClick={onToggleAutoRepairMode}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-emerald-500" />
                          <span>논리 배드섹터 자동 수복</span>
                        </div>
                        <span className={`text-[11px] font-bold ${isAutoRepairMode ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {isAutoRepairMode ? 'ON (자동)' : 'OFF (수동)'}
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
                          <span className="text-[10px] text-slate-400 font-mono">Ctrl+,</span>
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
                  className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
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

          {/* Right: Target Drive Selector Dropdown & Desktop Vitals */}
          <div className="flex items-center gap-2 shrink-0">
            
            {/* Target Drive Selector Pulldown */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 py-0.5 shadow-2xs">
              <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {getDriveTypeIcon(currentDrive)}
                <span className="hidden sm:inline">Drive:</span>
              </div>
              <select
                value={drives.length > 0 ? selectedDriveId : ''}
                disabled={drives.length === 0}
                onChange={(e) => onSelectDrive(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed truncate max-w-[190px] sm:max-w-[280px]"
                aria-label="대상 드라이브 선택"
              >
                {drives.length === 0 ? (
                  <option value="" className="bg-white dark:bg-slate-900 text-slate-500">
                    네이티브 장치 미연결 (Tauri IPC 필요)
                  </option>
                ) : (
                  <optgroup label="내·외장 물리 저장장치 (Tauri IPC)" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                    {drives.map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                        [{d.hardwareSpecs?.busType || d.type} {d.isExternal ? '외장' : '내장'} {d.mountPoint || ''}] {d.model} ({d.capacityGb !== null ? `${d.capacityGb}GB` : 'N/A'})
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
            <div className="flex items-center gap-1 font-mono text-xs font-bold">
              <span className={`px-2 py-0.5 rounded-md border text-[11px] ${
                currentHealthScore === null
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  : currentHealthScore >= 80
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/60 border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                {currentHealthScore !== null ? `${currentHealthScore}%` : 'N/A'}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px]">
                {currentDrive?.temperatureC !== null && currentDrive?.temperatureC !== undefined
                  ? `${currentDrive.temperatureC}°C`
                  : 'N/A'}
              </span>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
