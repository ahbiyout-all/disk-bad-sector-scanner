import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiskDrive, SmartExtendedLogsResponse } from '../types';
import { queryTauriSmartExtendedLogs } from '../utils/nativeDriveEngine';
import {
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock
} from 'lucide-react';

interface SmartExtendedLogsPanelProps {
  drive: DiskDrive;
  isTauriRuntime?: boolean;
  refreshSignal?: number;
}

export const SmartExtendedLogsPanel: React.FC<SmartExtendedLogsPanelProps> = ({
  drive,
  isTauriRuntime = false,
  refreshSignal = 0
}) => {
  const [activeLogTab, setActiveLogTab] = useState<'selftest' | 'error'>('selftest');
  const [logs, setLogs] = useState<SmartExtendedLogsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const driveRef = useRef<DiskDrive>(drive);
  driveRef.current = drive;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const isMountedRef = useRef<boolean>(true);
  const reqIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      reqIdRef.current += 1;
    };
  }, []);

  const loadLogs = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    const targetDrive = driveRef.current;
    const targetDriveId = targetDrive.id;
    setLoading(true);
    try {
      const res = await queryTauriSmartExtendedLogs(targetDrive);
      if (
        !isMountedRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        reqIdRef.current !== reqId
      ) {
        return;
      }
      setLogs(res);
    } finally {
      if (
        isMountedRef.current &&
        activeDriveIdRef.current === targetDriveId &&
        reqIdRef.current === reqId
      ) {
        setLoading(false);
      }
    }
  }, [drive.id]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs, refreshSignal]);

  const selfTestLogs = logs?.selfTestLogs ?? [];
  const errorLogs = logs?.errorLogs ?? [];

  const getStatusBadge = (statusCode: number, statusText: string) => {
    if (statusCode === 0x00) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          <span>{statusText}</span>
        </span>
      );
    }
    if (statusCode === 0x0F) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          <Clock className="w-3 h-3" />
          <span>{statusText}</span>
        </span>
      );
    }
    if (statusCode === 0x01 || statusCode === 0x02) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3 h-3" />
          <span>{statusText}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
        <AlertOctagon className="w-3 h-3" />
        <span>{statusText}</span>
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span>S.M.A.R.T. 펌웨어 확장 로그 (Self-Test 06h · Error Log 01h)</span>
            </h3>
            {logs?.supported && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {logs.protocol}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            드라이브 펌웨어 비휘발성 로그 페이지에 저장된 하드웨어 Self-Test 실행 이력 및 컨트롤러 오류 레지스터 조회
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setActiveLogTab('selftest')}
              className={`px-2.5 py-1 font-semibold cursor-pointer ${
                activeLogTab === 'selftest'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Self-Test 이력 ({selfTestLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveLogTab('error')}
              className={`px-2.5 py-1 font-semibold cursor-pointer ${
                activeLogTab === 'error'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              펌웨어 오류 ({logs?.totalErrorCount ?? errorLogs.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {!isTauriRuntime || (logs && !logs.supported) ? (
        <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Info className="w-4 h-4 text-indigo-500" />
            <span>S.M.A.R.T. 확장 로그 미지원 또는 커널 핸들 필요</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {logs?.reason ||
              'Windows 관리자 권한의 Tauri 데스크톱 네이티브 IPC 환경에서 SMART Log 0x06 / 0x01 및 NVMe Log Page 0x01을 직접 읽어 표시합니다.'}
          </p>
        </div>
      ) : activeLogTab === 'selftest' ? (
        selfTestLogs.length === 0 ? (
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-center text-xs text-slate-500 dark:text-slate-400">
            펌웨어에 기록된 실행된 Self-Test 기록 없음
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="px-2.5 py-2">#</th>
                  <th className="px-2.5 py-2">테스트 유형</th>
                  <th className="px-2.5 py-2">실행 상태</th>
                  <th className="px-2.5 py-2 text-right">잔여(%)</th>
                  <th className="px-2.5 py-2 text-right">누적 가동(POH)</th>
                  <th className="px-2.5 py-2 text-right">실패 LBA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px] tabular-nums">
                {selfTestLogs.map(entry => (
                  <tr key={entry.index} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-2.5 py-2 text-slate-500">#{entry.index}</td>
                    <td className="px-2.5 py-2 font-sans font-semibold text-slate-800 dark:text-slate-200">
                      {entry.testType}
                    </td>
                    <td className="px-2.5 py-2 font-sans">{getStatusBadge(entry.statusCode, entry.statusText)}</td>
                    <td className="px-2.5 py-2 text-right text-slate-600 dark:text-slate-300">
                      {entry.remainingPct}%
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-700 dark:text-slate-300">
                      {entry.lifeTimeHours.toLocaleString()}h
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      {entry.failingLba !== null ? (
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {entry.failingLba.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : errorLogs.length === 0 ? (
        <div className="p-4 rounded-lg border border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-center text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>기록된 펌웨어 오류 없음 (Total Logged Errors: {logs?.totalErrorCount ?? 0})</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
              <tr>
                <th className="px-2.5 py-2">오류 번호</th>
                <th className="px-2.5 py-2">오류 코드 / 니모닉</th>
                <th className="px-2.5 py-2 text-right">발생 가동시간</th>
                <th className="px-2.5 py-2 text-right">관련 LBA</th>
                <th className="px-2.5 py-2 text-right">Status / Error / Cmd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px] tabular-nums">
              {errorLogs.map((entry, i) => (
                <tr key={`${entry.errorNumber}-${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-2.5 py-2 font-bold text-red-600 dark:text-red-400">
                    #{entry.errorNumber}
                  </td>
                  <td className="px-2.5 py-2 font-semibold text-slate-800 dark:text-slate-200">
                    {entry.errorMnemonic}
                  </td>
                  <td className="px-2.5 py-2 text-right text-slate-600 dark:text-slate-300">
                    {entry.lifeTimeHours.toLocaleString()}h
                  </td>
                  <td className="px-2.5 py-2 text-right text-slate-800 dark:text-slate-200">
                    {entry.lba !== null ? entry.lba.toLocaleString() : '-'}
                  </td>
                  <td className="px-2.5 py-2 text-right text-slate-500 dark:text-slate-400">
                    0x{entry.statusFlags.toString(16).toUpperCase().padStart(2, '0')} / 0x
                    {entry.errorFlags.toString(16).toUpperCase().padStart(2, '0')} / 0x
                    {entry.commandReg.toString(16).toUpperCase().padStart(2, '0')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
