import React, { useRef, useState } from 'react';
import {
  X,
  Settings,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Zap,
  Check,
  Sliders,
  ShieldCheck,
  Play,
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileJson
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import { SavedScanRecord } from '../types';
import {
  buildMigrationBundle,
  DiskSentinelMigrationBundle,
  downloadMigrationJson,
  parseAndValidateMigrationJson
} from '../utils/dataMigration';

export interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  notificationPermission: NotificationPermission;
  notificationsEnabled: boolean;
  onRequestNotification: () => void;
  onToggleNotificationsEnabled: () => void;
  scanSpeedMultiplier: number;
  onChangeSpeedMultiplier: (speed: number) => void;
  isAutoRepairMode?: boolean;
  onToggleAutoRepairMode?: () => void;
  scanRecords: SavedScanRecord[];
  onImportMigration: (
    bundle: DiskSentinelMigrationBundle,
    strategy: 'merge' | 'replace'
  ) => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleDarkMode,
  isMuted,
  onToggleMute,
  notificationPermission,
  notificationsEnabled,
  onRequestNotification,
  onToggleNotificationsEnabled,
  scanSpeedMultiplier,
  onChangeSpeedMultiplier,
  isAutoRepairMode = false,
  onToggleAutoRepairMode,
  scanRecords,
  onImportMigration
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'general' | 'audio' | 'notification' | 'diagnostic' | 'migration'
  >('general');
  const [volume, setVolume] = useState<number>(() => Math.round(soundManager.getVolume() * 100));

  // Migration state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    bundle: DiskSentinelMigrationBundle;
    skippedCount: number;
  } | null>(null);
  const [migrationFeedback, setMigrationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      notificationsEnabled
    ) {
      new Notification('Disk Bad Sector Scanner 검사 테스트 알림', {
        body: '정상적으로 데스크톱 푸시 알림이 작동하고 있습니다.',
        icon: '/favicon.ico'
      });
    } else {
      onRequestNotification();
    }
  };

  const effectiveNotificationsAllowed =
    notificationsEnabled && notificationPermission === 'granted';

  const handleExportMigration = () => {
    try {
      const bundle = buildMigrationBundle(
        {
          isDarkMode,
          isMuted,
          volumePercent: volume,
          notificationsAllowed: effectiveNotificationsAllowed,
          notificationPermissionState: notificationPermission,
          scanSpeedMultiplier,
          isAutoRepairMode
        },
        scanRecords
      );
      const savedName = downloadMigrationJson(bundle);
      setMigrationFeedback({
        type: 'success',
        message: `설정 및 검사 기록 ${scanRecords.length}건이 '${savedName}' 파일로 내보내졌습니다.`
      });
    } catch {
      setMigrationFeedback({
        type: 'error',
        message: 'JSON 백업 파일 생성 중 오류가 발생했습니다.'
      });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setMigrationFeedback(null);
    setPendingImport(null);

    if (file.size > 25 * 1024 * 1024) {
      setMigrationFeedback({
        type: 'error',
        message: '백업 JSON 파일 크기가 너무 큽니다 (최대 25MB 지원).'
      });
      return;
    }

    try {
      const text = await file.text();
      const result = parseAndValidateMigrationJson(text);
      if (!result.valid || !result.bundle) {
        setMigrationFeedback({
          type: 'error',
          message: result.error || '유효하지 않은 백업 파일입니다.'
        });
        return;
      }

      setPendingImport({
        filename: file.name,
        bundle: result.bundle,
        skippedCount: result.skippedRecordsCount || 0
      });
    } catch {
      setMigrationFeedback({
        type: 'error',
        message: '선택한 파일을 읽는 데 실패했습니다.'
      });
    }
  };

  const handleApplyMigration = () => {
    if (!pendingImport) return;
    onImportMigration(pendingImport.bundle, importStrategy);
    setVolume(pendingImport.bundle.settings.volumePercent);
    const notifBlockedNote =
      pendingImport.bundle.settings.notificationsAllowed && notificationPermission === 'denied'
        ? ' (참고: 브라우저에서 알림이 차단되어 있어 푸시 알림은 브라우저 사이트 설정에서 직접 허용해야 활성화됩니다.)'
        : '';
    setMigrationFeedback({
      type: 'success',
      message: `'${pendingImport.filename}'에서 사용자 설정 및 검사 기록 ${pendingImport.bundle.scanRecords.length}건을 (${
        importStrategy === 'merge' ? '병합' : '덮어쓰기'
      }) 방식으로 성공적으로 복원했습니다.${notifBlockedNote}`
    });
    setPendingImport(null);
  };

  const existingIdSet = new Set(scanRecords.map(r => r.id));
  const newIncomingCount = pendingImport
    ? pendingImport.bundle.scanRecords.filter(r => !existingIdSet.has(r.id)).length
    : 0;

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
                디스플레이 테마, 알림, 자동 수복 및 JSON 데이터 마이그레이션 설정
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
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-5 bg-slate-50/50 dark:bg-slate-950/30 gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('general')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'diagnostic'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>진단 및 수복</span>
          </button>
          <button
            onClick={() => setActiveSubTab('migration')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'migration'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>데이터 마이그레이션</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* TAB 1: General & Theme */}
          {activeSubTab === 'general' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {isDarkMode ? (
                        <Moon className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-500" />
                      )}
                      <span>화면 테마 모드</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      정밀 하드웨어 계측 및 LBA 블록 구분을 위해 다크 모드가 기본 권장됩니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleDarkMode}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs shrink-0"
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
                <div className="flex items-center justify-between gap-3">
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
                    {[1, 2, 5, 10].map(speed => (
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {!isMuted ? (
                        <Volume2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-slate-400" />
                      )}
                      <span>배드섹터 및 지연 감지 경고음</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      검사 중 결함 섹터 발견 시 고주파 비프 알림음을 출력합니다.
                    </p>
                  </div>

                  <button
                    onClick={onToggleMute}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0 ${
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
                    onChange={e => handleVolumeChange(Number(e.target.value))}
                    disabled={isMuted}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </div>

                {/* Sound Test Buttons */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    사운드 테스트:
                  </span>
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {effectiveNotificationsAllowed ? (
                        <Bell className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <BellOff className="w-4 h-4 text-slate-400" />
                      )}
                      <span>브라우저 웹 푸시 알림</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      창을 최소화하거나 다른 작업을 수행 중일 때 백그라운드에서 검사 완료 및 오류를 알립니다.
                    </p>
                  </div>

                  {notificationPermission === 'granted' ? (
                    <button
                      onClick={onToggleNotificationsEnabled}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs shrink-0 ${
                        notificationsEnabled
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {notificationsEnabled ? <Check className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                      <span>{notificationsEnabled ? '알림 허용됨 (ON)' : '알림 일시 중지 (OFF)'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={onRequestNotification}
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>알림 권한 요청</span>
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    현재 브라우저 권한 상태:{' '}
                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                      {notificationPermission}
                    </strong>
                    {notificationPermission === 'granted' && (
                      <span className="ml-2 font-mono text-slate-500">
                        ({notificationsEnabled ? '수신 활성' : '수신 끔'})
                      </span>
                    )}
                  </div>
                  {effectiveNotificationsAllowed && (
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

          {/* TAB 4: Diagnostics & Auto-Repair Policy */}
          {activeSubTab === 'diagnostic' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>자동 복구 모드 (Auto-Repair Zero-Fill)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      검사 중 논리 배드섹터(UNC) 발견 시 사용자 확인 없이 즉시 S.M.A.R.T. Zero-Fill 05h 예비 트랙 재할당을 자동 실행합니다.
                    </p>
                  </div>

                  {onToggleAutoRepairMode && (
                    <button
                      onClick={onToggleAutoRepairMode}
                      className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer shadow-xs shrink-0 ${
                        isAutoRepairMode
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isAutoRepairMode ? '자동 수복 켜짐 (ON)' : '자동 수복 꺼짐 (OFF)'}
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAutoRepairMode
                    ? '✨ 배드섹터 발견 시 알림 출력과 함께 즉시 S.M.A.R.T. Write DMA 제로필 및 05h 치환이 자동으로 진행됩니다.'
                    : 'ℹ️ 배드섹터 발견 시 화면 경고음과 배너를 표시하고 사용자의 수동 수복 조치 명령을 대기합니다.'}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Data Migration (JSON Export / Import) */}
          {activeSubTab === 'migration' && (
            <div className="space-y-4">
              {migrationFeedback && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
                    migrationFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  }`}
                >
                  {migrationFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{migrationFeedback.message}</span>
                </div>
              )}

              {/* Export Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Download className="w-4 h-4 text-indigo-500" />
                      <span>전체 설정 및 검사 기록 내보내기 (JSON 백업)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      현재 환경설정과 누적 검사 히스토리를 단일 JSON 파일로 내려받아 다른 PC나 브라우저로 이전합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportMigration}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON 내보내기</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 font-mono text-[11px]">
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">화면 테마</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {isDarkMode ? '다크 모드' : '라이트 모드'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">알림 허용 여부</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {effectiveNotificationsAllowed ? '허용 (ON)' : '미허용/끔'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">자동 수복 모드</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {isAutoRepairMode ? '켜짐 (ON)' : '꺼짐 (OFF)'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">저장된 검사 기록</div>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      총 {scanRecords.length.toLocaleString()}건
                    </div>
                  </div>
                </div>
              </div>

              {/* Import Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span>JSON 백업 파일에서 가져오기 (복원)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      내보낸 <code>disksentinel-migration-*.json</code> 파일을 불러와 설정과 검사 이력을 복원합니다.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      <span>백업 JSON 선택</span>
                    </button>
                  </div>
                </div>

                {/* Merge vs Replace Strategy */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      검사 기록 가져오기 방식:
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setImportStrategy('merge')}
                        className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                          importStrategy === 'merge'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        기존 기록과 병합 (권장)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportStrategy('replace')}
                        className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                          importStrategy === 'replace'
                            ? 'bg-orange-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        기존 기록 덮어쓰기
                      </button>
                    </div>
                  </div>
                  {importStrategy === 'replace' && scanRecords.length > 0 && (
                    <div className="text-[11px] text-orange-700 dark:text-orange-300">
                      * 주의: 기존 저장된 검사 기록 {scanRecords.length.toLocaleString()}건이 삭제되고 백업 파일의 기록으로 교체됩니다.
                    </div>
                  )}
                </div>

                {/* Pending Import Validation Preview */}
                {pendingImport && (
                  <div className="p-3 rounded-lg border border-indigo-300 dark:border-indigo-700/70 bg-indigo-50/70 dark:bg-indigo-950/30 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                        <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-mono">{pendingImport.filename}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        백업 일시: {new Date(pendingImport.bundle.exportedAt).toLocaleString('ko-KR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div>
                        테마:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isDarkMode ? '다크 모드' : '라이트 모드'}
                        </strong>
                      </div>
                      <div>
                        알림:{' '}
                        <strong>
                          {pendingImport.bundle.settings.notificationsAllowed ? '허용' : '미허용'}
                        </strong>
                      </div>
                      <div>
                        자동 수복:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isAutoRepairMode ? 'ON' : 'OFF'}
                        </strong>
                      </div>
                      <div>
                        오디오:{' '}
                        <strong>
                          {pendingImport.bundle.settings.isMuted
                            ? '음소거'
                            : `${pendingImport.bundle.settings.volumePercent}%`}
                        </strong>
                      </div>
                      <div>
                        배속: <strong>{pendingImport.bundle.settings.scanSpeedMultiplier}x</strong>
                      </div>
                      <div>
                        검사 기록:{' '}
                        <strong>
                          {pendingImport.bundle.scanRecords.length}건
                          {importStrategy === 'merge' ? ` (신규 ${newIncomingCount}건)` : ''}
                        </strong>
                      </div>
                    </div>

                    {pendingImport.skippedCount > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        * 스키마가 불완전한 레코드 {pendingImport.skippedCount}건은 안전을 위해 제외되었습니다.
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPendingImport(null)}
                        className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyMigration}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>설정 및 기록 복원 적용</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            모든 설정은 브라우저 로컬 저장소에 안전하게 유지되며 JSON으로 언제든 백업할 수 있습니다.
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
