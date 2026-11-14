import React, { useState, useEffect } from 'react';
import {
  X,
  Wrench,
  Download,
  CheckCircle2,
  AlertCircle,
  Binary,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  DS_ExecuteBitCarvingRecovery,
  DSCarvedSectorResult
} from '../utils/nativeDllBridge';
import { isNativeHardwareRuntime, queryTauriRawSector } from '../utils/nativeDriveEngine';
import { DiskDrive } from '../types';

interface BitCarvingRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLba?: number;
  drive?: DiskDrive;
  driveModel?: string;
}

export const BitCarvingRecoveryModal: React.FC<BitCarvingRecoveryModalProps> = ({
  isOpen,
  onClose,
  initialLba = 0,
  drive,
  driveModel,
}) => {
  const [targetLba, setTargetLba] = useState<number>(initialLba);
  const [clusterSpan, setClusterSpan] = useState<number>(8);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<DSCarvedSectorResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetLba(initialLba);
      setResult(null);
    }
  }, [isOpen, initialLba, drive?.id]);

  const secSize = drive?.hardwareSpecs?.logicalSectorSize || 512;
  const effectiveDriveModel = drive?.model || drive?.name || driveModel || '물리 디스크 미선택';

  if (!isOpen) return null;

  const handleStartCarving = async () => {
    setIsProcessing(true);
    setResult(null);

    const carved = await DS_ExecuteBitCarvingRecovery(targetLba, clusterSpan, drive);
    setResult(carved);
    setIsProcessing(false);
  };

  const handleExportCarvedData = async () => {
    if (!result || !result.isSalvaged) return;

    let blobPayload: Uint8Array | null = null;
    if (drive?.id.startsWith('drive-tauri-physical-') && isNativeHardwareRuntime()) {
      const driveIndex = parseInt(drive.id.replace('drive-tauri-physical-', ''), 10);
      const exportBytes = Math.min(64 * 4096, Math.max(secSize, result.carvedSizeBytes));
      const rawTauriBytes = await queryTauriRawSector(driveIndex, targetLba, exportBytes);
      if (rawTauriBytes && rawTauriBytes.length > 0) {
        blobPayload = rawTauriBytes;
      }
    }

    if (!blobPayload) {
      // Parse validated hex dump tokens into raw bytes
      const hexTokens = result.hexPreview.trim().split(/\s+/).filter(Boolean);
      blobPayload = new Uint8Array(hexTokens.map(h => parseInt(h, 16) || 0));
    }

    const safeCopy = new Uint8Array(blobPayload.byteLength);
    safeCopy.set(blobPayload);
    const blob = new Blob([safeCopy], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = result.signatureType === 1 ? 'jpg' :
                result.signatureType === 2 ? 'png' :
                result.signatureType === 3 ? 'pdf' :
                result.signatureType === 4 ? 'zip' :
                result.signatureType === 5 ? 'mp4' : 'bin';
    a.download = `DiskSentinel-Carved-LBA${targetLba}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs">
              <Binary className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  비트 카빙 심층 복구 엔진 (Bit Carving &amp; Signature Scanner)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                  Raw LBA Salvager
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tauri 데스크톱 네이티브 IPC를 통해 물리 디스크 Raw LBA 섹터에서 매직 바이트 시그니처를 직접 판독하여 복구합니다
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">

          {/* Target LBA & Span Config */}
          <div className="p-3.5 rounded-lg border bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-indigo-500" />
                수복 대상 물리 섹터 (Physical LBA) 및 탐색 클러스터 범위
              </div>
              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                {isNativeHardwareRuntime() ? 'Tauri Win32 Raw LBA Active' : 'Tauri IPC 연결 필요'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                  대상 LBA 번호
                </label>
                <input
                  type="number"
                  value={targetLba}
                  onChange={(e) => setTargetLba(Math.max(0, Number(e.target.value) || 0))}
                  disabled={isProcessing}
                  className="w-full text-xs font-mono p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                  클러스터 탐색 스팬 (섹터 수)
                </label>
                <select
                  value={clusterSpan}
                  onChange={(e) => setClusterSpan(Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value={4}>4개 섹터 (2 KB 단일 블록)</option>
                  <option value={8}>8개 섹터 (4 KB 표준 클러스터)</option>
                  <option value={16}>16개 섹터 (8 KB 확장 클러스터)</option>
                  <option value={32}>32개 섹터 (16 KB 미디어 블록)</option>
                  <option value={64}>64개 섹터 (32 KB 심층 탐색)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleStartCarving}
                  disabled={isProcessing}
                  className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      비트 카빙 분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      비트 카빙 실행
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              대상 장치: {effectiveDriveModel} | 오프셋: {(targetLba * secSize).toLocaleString()} 바이트 위치 ({secSize}B/섹터)
            </div>
          </div>

          {/* Recovery Results Section */}
          {result && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {result.isSalvaged ? (
                <>
                  <div className="p-3.5 rounded-lg border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/50 text-emerald-800 dark:text-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="font-bold text-sm">
                          {result.signatureName} 식별 및 수복 완료
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap">
                        <span>판독 클러스터 크기: <b className="font-mono">{(result.carvedSizeBytes / 1024).toFixed(2)} KB</b></span>
                        <span>ECC 교정 비트: <b className="font-mono text-indigo-600 dark:text-indigo-400">{result.eccRecoveredBits}비트</b></span>
                      </div>
                    </div>

                    <button
                      onClick={handleExportCarvedData}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shrink-0 shadow-sm transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      복구 바이너리 저장
                    </button>
                  </div>

                  {result.hexPreview && (
                    <div className="p-3 rounded-lg border bg-slate-900 border-slate-800 text-slate-100 font-mono text-[11px] space-y-1.5 overflow-hidden">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-1">
                        <span>Raw Sector Binary Hex Dump (LBA {result.sourceLba})</span>
                        <span className="text-emerald-400">Real Bytes Read</span>
                      </div>

                      <div className="overflow-x-auto py-1">
                        <pre className="text-emerald-400 font-mono text-[11px] leading-relaxed">
                          {result.hexPreview}
                        </pre>
                      </div>

                      <div className="border-t border-slate-800 pt-1 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>ASCII 디코딩 미리보기:</span>
                        <span className="text-slate-200 font-mono truncate max-w-[400px]">
                          {result.rawAsciiPreview}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-500/40 text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{result.signatureName}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    {result.errorReason || '직접 섹터 핸들 권한이 없어 비트 카빙을 수행할 수 없습니다. 가짜 바이너리 덤프는 생성되지 않습니다.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Informational Guidelines */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              비트 카빙(Bit Carving) 동작 기준 안내
            </div>
            <p>
              1. <strong>물리 Raw LBA 직독</strong>: Windows 관리자 권한의 Tauri 데스크톱 앱에서 물리 디스크(<code className="font-mono">\\.\PhysicalDriveN</code>)의 지정된 LBA 오프셋 바이트를 직접 판독하여 JPEG, PNG, PDF, ZIP, MP4, NTFS 부트 시그니처를 식별합니다.
            </p>
            <p>
              2. <strong>무가공 원칙</strong>: Tauri 네이티브 IPC 연결이 없는 웹 브라우저 환경에서는 가짜 섹터 Hex 데이터를 생성하지 않고 네이티브 권한 필요 상태를 명확히 보고합니다.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
