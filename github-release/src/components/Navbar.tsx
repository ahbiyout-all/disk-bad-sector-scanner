import React, { useState } from 'react';
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
  Check
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
  onOpenSupportedCatalog
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* ============================================================== */}
      {/* DESKTOP TOP BAR (md and up) */}
      {/* ============================================================== */}
      <div className="hidden md:block w-full px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          
          {/* Logo & Drive Selector */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
              D
            </div>

            <div className="min-w-0 flex items-center gap-2.5">
              <div className="flex items-baseline gap-1.5">
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                  {PROJECT_INFO.appName}
                </h1>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                  {PROJECT_INFO.version}
                </span>
              </div>

              {/* Target Drive Dropdown */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 rounded px-2 py-0.5">
                <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 shrink-0">Drive:</span>
                <select
                  value={selectedDriveId}
                  onChange={(e) => onSelectDrive(e.target.value)}
                  className="bg-transparent text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer truncate max-w-[190px]"
                >
                  {drives.filter(d => d.attachedFile || d.attachedFileHandle).length > 0 && (
                    <optgroup label="📂 실제 로컬 파일 & 볼륨 (Direct File I/O)" className="bg-white dark:bg-slate-900 text-emerald-600 font-bold">
                      {drives.filter(d => d.attachedFile || d.attachedFileHandle).map((d) => (
                        <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                          [📂 실제] {d.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="내장 저장장치 (Internal Storage)" className="bg-white dark:bg-slate-900 text-slate-500 font-semibold">
                    {drives.filter(d => !d.isExternal && !d.attachedFile && !d.attachedFileHandle).map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                        [{d.type} {d.mountPoint || ''}] {d.name} ({d.capacityGb}GB)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="외장 저장장치 (External USB / SD)" className="bg-white dark:bg-slate-900 text-indigo-500 font-semibold">
                    {drives.filter(d => d.isExternal && !d.attachedFile && !d.attachedFileHandle).map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                        [외장 {d.mountPoint || 'USB'}] {d.name} ({d.capacityGb}GB)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* External Device Manager Quick Button */}
              <button
                onClick={onOpenExternalDevicesModal}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[10px] font-semibold transition-colors shrink-0 cursor-pointer"
                title="외장 저장장치 연결 및 관리 (USB / 외장 SSD / SD 카드)"
              >
                <Usb className="w-3 h-3 text-indigo-500" />
                <span className="hidden xl:inline">외장 관리</span>
                <span className="px-1 rounded bg-indigo-200/80 dark:bg-indigo-800 text-[9px] font-mono">
                  {drives.filter(d => d.isExternal).length}
                </span>
              </button>

              {/* Vendor & Media Diagnostic Quick Button */}
              {onOpenVendorDiagnostics && (
                <button
                  onClick={onOpenVendorDiagnostics}
                  className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-[10px] font-semibold transition-colors shrink-0 cursor-pointer"
                  title="제조사 및 내/외부 매체 특성 진단 & 차별화 조치 센터"
                >
                  <Cpu className="w-3 h-3 text-blue-500" />
                  <span>제조사 특성</span>
                </button>
              )}

              {/* Supported Products Catalog Button */}
              {onOpenSupportedCatalog && (
                <button
                  onClick={onOpenSupportedCatalog}
                  className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[10px] font-semibold transition-colors shrink-0 cursor-pointer"
                  title="정밀진단 지원 제조사 및 제품 카탈로그"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>지원 제품 목록</span>
                </button>
              )}
            </div>
          </div>

          {/* Center Tab Navigation */}
          <nav className="flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 p-0.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              onClick={() => onSelectTab('scan')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors cursor-pointer ${
                activeTab === 'scan'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              표면 검사
            </button>

            <button
              onClick={() => onSelectTab('health')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors cursor-pointer ${
                activeTab === 'health'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              건강 요약
              <span className={`px-1 rounded text-[10px] font-mono ${
                activeTab === 'health'
                  ? 'bg-indigo-800/80 text-white'
                  : currentHealthScore >= 80
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
              }`}>
                {currentHealthScore}%
              </span>
            </button>

            <button
              onClick={() => onSelectTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              기록 비교
            </button>
          </nav>

          {/* Right Utility & Update Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Real-time GitHub Update Indicator Button */}
            <button
              onClick={onOpenUpdateModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                hasUpdate
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white animate-pulse shadow-xs'
                  : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={hasUpdate ? `새로운 버전 (${latestVersion}) 설치 가능` : 'GitHub Releases 업데이트 확인'}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="hidden xl:inline">
                {hasUpdate ? `업데이트 (${latestVersion})` : '업데이트 확인'}
              </span>
              {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 xl:hidden"></span>}
            </button>

            {/* Developer & Channels Info */}
            <button
              onClick={onOpenAboutModal}
              className="p-1.5 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors flex items-center gap-1 cursor-pointer"
              title="제작자 및 공식 채널 정보 (AhBiYout / AhBiYout-all)"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono hidden xl:inline">{PROJECT_INFO.developer.name}</span>
            </button>

            {/* Pure Creative DLL Specification Button */}
            <button
              onClick={onOpenDllDocs}
              className="px-2 py-1 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="순수 창작 DiskSentinelNativeCore.dll 기술 명세서 열기"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[11px] hidden sm:inline">창작 DLL 명세</span>
            </button>

            {/* Notification Permission Toggle */}
            <button
              onClick={onRequestNotification}
              className={`p-1.5 rounded border transition-colors relative cursor-pointer ${
                notificationPermission === 'granted'
                  ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={
                notificationPermission === 'granted'
                  ? '웹 알림 활성화됨'
                  : '오류 발생 시 브라우저 알림 켜기'
              }
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
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
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
              className="p-1.5 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MOBILE CLEAN ORGANIZED TOP BAR (< md) */}
      {/* ============================================================== */}
      <div className="block md:hidden w-full">
        {/* Mobile Row 1: Brand Header & Core Toggles */}
        <div className="flex items-center justify-between h-12 px-3 border-b border-slate-100 dark:border-slate-800/80">
          {/* Logo & Brand Name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs">
              D
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
                DiskSentinel
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                {PROJECT_INFO.version}
              </span>
            </div>
          </div>

          {/* Right Action Icons (Mute, Theme, Hamburger Menu) */}
          <div className="flex items-center gap-1">
            {/* Audio Toggle */}
            <button
              onClick={onToggleMute}
              className="w-8 h-8 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isMuted ? '음소거 해제' : '음소거'}
              aria-label="음소거 토글"
            >
              {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={onToggleDarkMode}
              className="w-8 h-8 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isDarkMode ? '라이트 모드' : '다크 모드'}
              aria-label="다크 모드 토글"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="relative w-8 h-8 rounded flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-0.5"
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

        {/* Mobile Row 2: Dedicated Device & Drive Selector Bar */}
        <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
          {/* Active Drive Dropdown Container */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 shadow-2xs">
            <div className="shrink-0">
              {getDriveTypeIcon(currentDrive)}
            </div>
            <select
              value={selectedDriveId}
              onChange={(e) => onSelectDrive(e.target.value)}
              className="w-full bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer truncate"
              aria-label="검사 대상 드라이브 선택"
            >
              {drives.filter(d => d.attachedFile || d.attachedFileHandle).length > 0 && (
                <optgroup label="📂 실제 파일 & 볼륨" className="bg-white dark:bg-slate-900 text-emerald-600 font-bold">
                  {drives.filter(d => d.attachedFile || d.attachedFileHandle).map((d) => (
                    <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100 font-sans font-normal">
                      [📂] {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="내장 저장장치" className="bg-white dark:bg-slate-900 text-slate-500 font-semibold">
                {drives.filter(d => !d.isExternal && !d.attachedFile && !d.attachedFileHandle).map((d) => (
                  <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100">
                    [{d.type} {d.mountPoint || ''}] {d.name} ({d.capacityGb}GB)
                  </option>
                ))}
              </optgroup>
              <optgroup label="외장 저장장치 (USB/SD)" className="bg-white dark:bg-slate-900 text-indigo-600 font-semibold">
                {drives.filter(d => d.isExternal && !d.attachedFile && !d.attachedFileHandle).map((d) => (
                  <option key={d.id} value={d.id} className="text-slate-900 dark:text-slate-100">
                    [외장 {d.mountPoint || 'USB'}] {d.name} ({d.capacityGb}GB)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Quick Shortcuts: External Tools */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenExternalDevicesModal}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold active:bg-indigo-100 dark:active:bg-indigo-900/60 transition-colors"
              title="외장 드라이브 관리"
            >
              <Usb className="w-3 h-3 text-indigo-500" />
              <span>외장 관리</span>
            </button>
          </div>
        </div>

        {/* Mobile Row 3: Segmented Tab Bar */}
        <div className="grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
          <button
            onClick={() => onSelectTab('scan')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded transition-all min-h-[36px] ${
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
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded transition-all min-h-[36px] ${
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
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded transition-all min-h-[36px] ${
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
            {/* Quick Title & Version Status */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">빠른 메뉴 & 도구함</span>
              <span className="font-mono text-[11px] text-slate-400">{PROJECT_INFO.developer.name} · {PROJECT_INFO.version}</span>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Update Check */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenUpdateModal();
                }}
                className={`p-2 rounded-lg border text-left flex items-start gap-2 transition-colors cursor-pointer ${
                  hasUpdate
                    ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold flex items-center gap-1">
                    업데이트 확인
                    {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {hasUpdate ? `최신 v${latestVersion}` : '현재 최신 버전'}
                  </div>
                </div>
              </button>

              {/* DLL Spec */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenDllDocs();
                }}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Cpu className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">창작 DLL 명세</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    NativeCore 기술 명세
                  </div>
                </div>
              </button>

              {/* Mobile Device Diagnostics */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenMobileDiagnostics();
                }}
                className="p-2 rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/30 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-purple-950 dark:text-purple-200">모바일 정밀 진단</div>
                  <div className="text-[10px] text-purple-700/80 dark:text-purple-400 mt-0.5">
                    UFS/eMMC/배터리
                  </div>
                </div>
              </button>

              {/* External Storage Manager */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenExternalDevicesModal();
                }}
                className="p-2 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Usb className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-indigo-950 dark:text-indigo-200">외장 장치 관리</div>
                  <div className="text-[10px] text-indigo-700/80 dark:text-indigo-400 mt-0.5">
                    USB / 외장 SSD / SD
                  </div>
                </div>
              </button>

              {/* Vendor Diagnostics */}
              {onOpenVendorDiagnostics && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenVendorDiagnostics();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <Cpu className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">제조사 특성 진단</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      미디어별 최적 조치
                    </div>
                  </div>
                </button>
              )}

              {/* Supported Products Catalog */}
              {onOpenSupportedCatalog && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenSupportedCatalog();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">지원 제품 목록</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      제조사별 카탈로그
                    </div>
                  </div>
                </button>
              )}

              {/* Notification Permission */}
              <button
                onClick={() => {
                  onRequestNotification();
                }}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                {notificationPermission === 'granted' ? (
                  <Bell className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                ) : (
                  <BellOff className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">웹 경고 알림</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {notificationPermission === 'granted' ? '알림 활성화됨' : '알림 켜기'}
                  </div>
                </div>
              </button>

              {/* About & Channels */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAboutModal();
                }}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">제작자 & 공식 채널</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    GitHub 및 구글 블로그
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
