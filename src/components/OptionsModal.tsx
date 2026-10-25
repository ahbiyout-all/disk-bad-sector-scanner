import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Moon, 
  Sun, 
  Volume2, 
  VolumeX, 
  Bell, 
  BellOff, 
  Sparkles, 
  Thermometer, 
  Zap, 
  RotateCcw, 
  Check, 
  Sliders, 
  ShieldCheck, 
  Play
} from 'lucide-react';
import { soundManager } from '../utils/audio';

export interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  notificationPermission: NotificationPermission;
  onRequestNotification: () => void;
  showDemoPresets: boolean;
  onToggleDemoPresets?: () => void;
  isThermalStress: boolean;
  onToggleThermalStress: () => void;
  scanSpeedMultiplier: number;
  onChangeSpeedMultiplier: (speed: number) => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleDarkMode,
  isMuted,
  onToggleMute,
  notificationPermission,
  onRequestNotification,
  showDemoPresets,
  onToggleDemoPresets,
  isThermalStress,
  onToggleThermalStress,
  scanSpeedMultiplier,
  onChangeSpeedMultiplier,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'audio' | 'notification' | 'diagnostic'>('general');
  const [volume, setVolume] = useState<number>(() => Math.round(soundManager.getVolume() * 100));

  if (!isOpen) return null;

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    soundManager.setVolume(newVol / 100);
  };

  const handleTestSound = (type: 'bad' | 'warn' | 'complete') => {
    if (type === 'bad') soundManager.playBadSectorAlert();
    else if (type === 'warn') soundManager.playWarningTone();
    else soundManager.playCompletionChime();
  };

  const handleTestNotification = () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('DiskSentinel 검사 테스트 알림', {
        body: '정상적으로 데스크톱 푸시 알림이 작동하고 있습니다.',
        icon: '/favicon.ico'
      });
    } else {
      onRequestNotification();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>프로그램 환경설정</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                  OPTIONS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                디스플레이 테마, 비프음 경고, 시스템 알림 및 하드웨어 시뮬레이션 설정
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 bg-slate-50/50 dark:bg-slate-950/30 gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('general')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'general'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>일반 & 테마</span>
          </button>
          <button
            onClick={() => setActiveSubTab('audio')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'audio'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>오디오 & 사운드</span>
          </button>
          <button
            onClick={() => setActiveSubTab('notification')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'notification'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>데스크톱 알림</span>
          </button>
          <button
            onClick={() => setActiveSubTab('diagnostic')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'diagnostic'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>진단 & 가상 데모</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          
          {/* TAB 1: General & Theme */}
          {activeSubTab === 'general' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                      <span>화면 테마 모드</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      정밀 하드웨어 계측 및 LBA 블록 구분을 위해 다크 모드가 기본 권장됩니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleDarkMode}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs"
                  >
                    {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>{isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">현재 활성 테마:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {isDarkMode ? '🌙 Dark Mode (고대비 계측기 뷰어)' : '☀️ Light Mode (오피스 주광 뷰어)'}
                  </span>
                </div>
              </div>

              {/* Scan Speed Default Multiplier */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>검사 속도 배율 기본값</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      I/O 프로빙 틱당 처리할 블록의 배속을 설정합니다.
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
                    {[1, 2, 5, 10].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => onChangeSpeedMultiplier(speed)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                          scanSpeedMultiplier === speed
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Audio & Sound */}
          {activeSubTab === 'audio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {!isMuted ? <Volume2 className="w-4 h-4 text-emerald-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                      <span>배드섹터 및 지연 감지 경고음</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      검사 중 결함 섹터 발견 시 고주파 비프 알림음을 출력합니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleMute}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
                      !isMuted
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{!isMuted ? '음소거하기' : '소리 켜기'}</span>
                  </button>
                </div>

                {/* Volume Slider */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>마스터 경고 음량</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    disabled={isMuted}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </div>

                {/* Sound Test Buttons */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">사운드 테스트:</span>
                  <button
                    onClick={() => handleTestSound('bad')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-500/30 text-[11px] font-bold hover:bg-red-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>배드섹터 비프음</span>
                  </button>
                  <button
                    onClick={() => handleTestSound('warn')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold hover:bg-amber-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>지연 주의음</span>
                  </button>
                  <button
                    onClick={() => handleTestSound('complete')}
                    disabled={isMuted}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-200 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>검사 완료음</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Desktop Notifications */}
          {activeSubTab === 'notification' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-500" />
                      <span>브라우저 웹 푸시 알림</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      창을 최소화하거나 다른 작업을 수행 중일 때 백그라운드에서 검사 완료 및 오류를 알립니다.
                    </p>
                  </div>

                  {notificationPermission === 'granted' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                      <Check className="w-3.5 h-3.5" />
                      <span>알림 활성화됨</span>
                    </span>
                  ) : (
                    <button
                      onClick={onRequestNotification}
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>알림 권한 요청</span>
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    현재 브라우저 권한 상태: <strong className="font-mono text-slate-800 dark:text-slate-200">{notificationPermission}</strong>
                  </div>
                  {notificationPermission === 'granted' && (
                    <button
                      onClick={handleTestNotification}
                      className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      테스트 알림 보내기
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Diagnostics & Virtual Demo */}
          {activeSubTab === 'diagnostic' && (
            <div className="space-y-4">
              {/* Virtual Demo Presets Toggle */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>가상 시뮬레이션 데모 프리셋 표시</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      실제 하드웨어 손상 없이 다양한 결함(배드섹터 드라이브, 과열 NVMe, 불량 SATA)을 시뮬레이션합니다.
                    </p>
                  </div>

                  {onToggleDemoPresets && (
                    <button
                      onClick={onToggleDemoPresets}
                      className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs ${
                        showDemoPresets
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {showDemoPresets ? '데모 표시 중 (ON)' : '데모 숨김 (OFF)'}
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {showDemoPresets 
                    ? '현재 데모 드라이브(WD Black, Crucial, Seagate 등)가 드라이브 선택기에 포함되어 있습니다.' 
                    : '현재 실제 로컬 OS 드라이브 및 직접 마운트한 실제 파일/볼륨만 표시됩니다.'}
                </div>
              </div>

              {/* Thermal Stress Simulation */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-red-500" />
                      <span>인위적 발열 스트레스 모드 (Thermal Stress)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      60°C 초과 과열 경보 시스템과 쿨링 경고 배너 동작을 점검할 수 있습니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleThermalStress}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs ${
                      isThermalStress
                        ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {isThermalStress ? '과열 부하 켜짐 (ON)' : '발열 테스트 (OFF)'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            모든 설정은 브라우저 로컬 저장소에 안전하게 유지됩니다.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            확인 및 닫기
          </button>
        </div>

      </div>
    </div>
  );
};
