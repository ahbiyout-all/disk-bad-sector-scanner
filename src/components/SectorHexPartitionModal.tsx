import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  Binary,
  HardDrive,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  RefreshCw,
  Info,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';
import { DiskDrive, ParsedPartitionTable, RawSectorRangeResponse, VbrBootInfo } from '../types';
import { queryTauriRawSectorRange } from '../utils/nativeDriveEngine';
import {
  computeSectorEntropySync,
  ForensicsPartitionInspection,
  ForensicsSectorEntropyReport,
  ForensicsVbrInspection,
  runForensicsPartitionInspection,
  runForensicsSectorEntropy,
  runForensicsVbrInspection
} from '../utils/forensicsDllBridge';

interface SectorHexPartitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  drive: DiskDrive;
  initialLba?: number;
  isInline?: boolean;
}

function parseSearchPattern(query: string): { mode: 'hex' | 'ascii'; pattern: number[] } {
  const trimmed = query.trim();
  if (!trimmed) return { mode: 'ascii', pattern: [] };

  // Treat as space-separated or compact hex bytes when prefixed with 0x or purely valid hex pairs
  const compact = trimmed.replace(/^0x/i, '').replace(/\s+/g, '');
  if (/^[0-9a-fA-F]{2,}$/.test(compact) && compact.length % 2 === 0 && (trimmed.includes(' ') || /^0x/i.test(trimmed))) {
    const pattern: number[] = [];
    for (let i = 0; i < compact.length; i += 2) {
      pattern.push(parseInt(compact.slice(i, i + 2), 16));
    }
    return { mode: 'hex', pattern };
  }

  const pattern = Array.from(trimmed).map(ch => ch.charCodeAt(0) & 0xff);
  return { mode: 'ascii', pattern };
}

export const SectorHexPartitionModal: React.FC<SectorHexPartitionModalProps> = ({
  isOpen,
  onClose,
  drive,
  initialLba = 0,
  isInline = false
}) => {
  const [activeTab, setActiveTab] = useState<'hex' | 'partition'>('hex');
  const [currentLba, setCurrentLba] = useState<number>(Math.max(0, Math.floor(initialLba)));
  const [lbaInput, setLbaInput] = useState<string>(String(Math.max(0, Math.floor(initialLba))));
  const [sectorSpan, setSectorSpan] = useState<1 | 4 | 8>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedHex, setCopiedHex] = useState<boolean>(false);

  const [hexLoading, setHexLoading] = useState<boolean>(false);
  const [hexResponse, setHexResponse] = useState<RawSectorRangeResponse | null>(null);
  const [nativeEntropy, setNativeEntropy] = useState<ForensicsSectorEntropyReport | null>(null);
  const [nativeVbr, setNativeVbr] = useState<ForensicsVbrInspection | null>(null);

  const [partitionLoading, setPartitionLoading] = useState<boolean>(false);
  const [partitionTable, setPartitionTable] = useState<ParsedPartitionTable | null>(null);
  const [partitionMeta, setPartitionMeta] = useState<ForensicsPartitionInspection | null>(null);
  const [partitionError, setPartitionError] = useState<string | null>(null);

  const maxLba = Math.max(0, (drive.totalSectors || 0) - 1);

  const isMountedRef = useRef<boolean>(true);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const activeDriveIdRef = useRef<string>(drive.id);
  activeDriveIdRef.current = drive.id;
  const hexReqIdRef = useRef<number>(0);
  const partReqIdRef = useRef<number>(0);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDriveIdRef = useRef<string>(drive.id);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      hexReqIdRef.current += 1;
      partReqIdRef.current += 1;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  const loadHexSector = useCallback(
    async (lba: number, span: number) => {
      const reqId = ++hexReqIdRef.current;
      const targetDriveId = drive.id;
      const safeLba = Math.max(0, Math.floor(lba));
      setHexLoading(true);
      try {
        const res = await queryTauriRawSectorRange(drive, safeLba, span);
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          activeDriveIdRef.current !== targetDriveId ||
          hexReqIdRef.current !== reqId
        ) {
          return;
        }
        setHexResponse(res);
      } finally {
        if (
          isMountedRef.current &&
          hexReqIdRef.current === reqId &&
          activeDriveIdRef.current === targetDriveId
        ) {
          setHexLoading(false);
        }
      }
    },
    [drive]
  );

  const loadPartitionTable = useCallback(async () => {
    const reqId = ++partReqIdRef.current;
    const targetDriveId = drive.id;
    setPartitionLoading(true);
    setPartitionError(null);
    try {
      const res = await queryTauriRawSectorRange(drive, 0, 34);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        partReqIdRef.current !== reqId
      ) {
        return;
      }
      if (!res.supported || res.bytes.length < 512) {
        setPartitionTable(null);
        setPartitionMeta(null);
        setPartitionError(
          res.reason || '물리 디스크 LBA 0~33 영역을 읽을 수 없어 파티션 테이블을 디코딩하지 못했습니다.'
        );
        return;
      }
      const inspection = await runForensicsPartitionInspection(res.bytes, res.sectorSize || 512);
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        partReqIdRef.current !== reqId
      ) {
        return;
      }
      setPartitionMeta(inspection);
      setPartitionTable(inspection.parsed);
    } catch (err: any) {
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        activeDriveIdRef.current !== targetDriveId ||
        partReqIdRef.current !== reqId
      ) {
        return;
      }
      setPartitionTable(null);
      setPartitionMeta(null);
      setPartitionError(err?.message || '파티션 테이블 조회 중 오류가 발생했습니다.');
    } finally {
      if (
        isMountedRef.current &&
        partReqIdRef.current === reqId &&
        activeDriveIdRef.current === targetDriveId
      ) {
        setPartitionLoading(false);
      }
    }
  }, [drive]);

  useEffect(() => {
    if (prevDriveIdRef.current !== drive.id) {
      prevDriveIdRef.current = drive.id;
      partReqIdRef.current += 1;
      setPartitionTable(null);
      setPartitionError(null);
      setPartitionLoading(false);
    }
    if (!isOpen) {
      hexReqIdRef.current += 1;
      partReqIdRef.current += 1;
      setHexLoading(false);
      setPartitionLoading(false);
      return;
    }
    const safeInitial = Math.max(0, Math.floor(initialLba));
    setCurrentLba(safeInitial);
    setLbaInput(String(safeInitial));
    void loadHexSector(safeInitial, sectorSpan);
  }, [isOpen, initialLba, drive.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'partition' && !partitionTable && !partitionLoading && !partitionError) {
      void loadPartitionTable();
    }
  }, [isOpen, activeTab, partitionTable, partitionLoading, partitionError, loadPartitionTable]);

  const bytes = hexResponse?.bytes ?? [];
  const sectorSize = hexResponse?.sectorSize || drive.hardwareSpecs?.logicalSectorSize || 512;

  const syncEntropy = useMemo(
    () => (bytes.length > 0 ? computeSectorEntropySync(bytes) : null),
    [bytes]
  );

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || bytes.length === 0) {
      setNativeEntropy(null);
      setNativeVbr(null);
      return;
    }
    void runForensicsSectorEntropy(bytes).then(res => {
      if (!cancelled && isMountedRef.current && res) {
        setNativeEntropy(res);
      }
    });
    if (bytes.length >= 512) {
      void runForensicsVbrInspection(bytes).then(res => {
        if (!cancelled && isMountedRef.current) {
          setNativeVbr(res);
        }
      });
    } else {
      setNativeVbr(null);
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, bytes]);

  const entropyReport = nativeEntropy ?? syncEntropy;
  const vbrInfo: VbrBootInfo | null = nativeVbr?.vbr ?? null;

  const { matchedIndices, matchCount } = useMemo(() => {
    const { pattern } = parseSearchPattern(searchQuery);
    const set = new Set<number>();
    let hits = 0;
    if (pattern.length === 0 || bytes.length < pattern.length) {
      return { matchedIndices: set, matchCount: 0 };
    }
    for (let i = 0; i <= bytes.length - pattern.length; i++) {
      let ok = true;
      for (let j = 0; j < pattern.length; j++) {
        if (bytes[i + j] !== pattern[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        hits += 1;
        for (let j = 0; j < pattern.length; j++) {
          set.add(i + j);
        }
      }
    }
    return { matchedIndices: set, matchCount: hits };
  }, [bytes, searchQuery]);

  if (!isOpen) return null;

  const jumpToLba = (nextLba: number, nextSpan = sectorSpan) => {
    const bounded = maxLba > 0 ? Math.max(0, Math.min(maxLba, Math.floor(nextLba))) : Math.max(0, Math.floor(nextLba));
    setCurrentLba(bounded);
    setLbaInput(String(bounded));
    void loadHexSector(bounded, nextSpan);
  };

  const handleLbaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(lbaInput.replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    jumpToLba(parsed);
  };

  const handleSpanChange = (nextSpan: 1 | 4 | 8) => {
    setSectorSpan(nextSpan);
    void loadHexSector(currentLba, nextSpan);
  };

  const handleCopyHex = () => {
    if (bytes.length === 0) return;
    const lines: string[] = [];
    for (let off = 0; off < bytes.length; off += 16) {
      const slice = bytes.slice(off, off + 16);
      const hexPart = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      const asciiPart = slice.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      lines.push(`0x${off.toString(16).toUpperCase().padStart(6, '0')}: ${hexPart.padEnd(47, ' ')}  |${asciiPart}|`);
    }
    void navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      if (!isMountedRef.current) return;
      setCopiedHex(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        copyTimeoutRef.current = null;
        if (isMountedRef.current) setCopiedHex(false);
      }, 1800);
    }).catch(() => {});
  };

  const handleExportBin = () => {
    if (bytes.length === 0) return;
    const uint8 = new Uint8Array(bytes);
    const blob = new Blob([uint8], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `raw_lba_${currentLba}_${sectorSpan}sec.bin`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={
        isInline
          ? 'w-full font-sans'
          : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs font-sans animate-in fade-in duration-150'
      }
    >
      <div
        className={
          isInline
            ? 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full flex flex-col overflow-hidden'
            : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md w-full max-w-5xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden'
        }
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : true}
        aria-label="원시 섹터 헥스 뷰어 및 파티션 테이블 분석"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/25">
              <Binary className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  원시 섹터 헥스 뷰어 &amp; MBR/GPT 파티션 인스펙터
                </h2>
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  · READ-ONLY
                </span>
              </div>
              <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                {drive.hardwareSpecs?.devicePhysicalPath || drive.model} · Sector {sectorSize}B · Total LBA{' '}
                {drive.totalSectors.toLocaleString()}
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Segmented Sub-Tabs */}
        <div className="px-4 sm:px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex p-0.5 rounded-md bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('hex')}
              className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'hex'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Binary className="w-3.5 h-3.5" />
              <span>원시 LBA 헥스 뷰어</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('partition')}
              className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'partition'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>MBR / GPT 파티션 테이블</span>
            </button>
          </div>

          {activeTab === 'hex' && (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={handleCopyHex}
                disabled={bytes.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer disabled:opacity-40"
              >
                {copiedHex ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedHex ? '복사됨' : 'Hex 복사'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportBin}
                disabled={bytes.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.BIN 저장</span>
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 text-xs">
          {activeTab === 'hex' && (
            <>
              {/* LBA Navigation & Search Toolbar */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <form onSubmit={handleLbaSubmit} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">LBA 주소</span>
                  <button
                    type="button"
                    onClick={() => jumpToLba(currentLba - sectorSpan)}
                    disabled={hexLoading || currentLba <= 0}
                    className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                    title="이전 섹터"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    value={lbaInput}
                    onChange={e => setLbaInput(e.target.value)}
                    className="w-36 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    placeholder="0"
                    aria-label="이동할 LBA 주소"
                  />
                  <button
                    type="button"
                    onClick={() => jumpToLba(currentLba + sectorSpan)}
                    disabled={hexLoading || (maxLba > 0 && currentLba >= maxLba)}
                    className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                    title="다음 섹터"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="submit"
                    disabled={hexLoading}
                    className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    이동
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToLba(0)}
                    disabled={hexLoading}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    LBA 0 (MBR)
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToLba(1)}
                    disabled={hexLoading}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    LBA 1 (GPT)
                  </button>
                </form>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                    {([1, 4, 8] as const).map(span => (
                      <button
                        key={span}
                        type="button"
                        onClick={() => handleSpanChange(span)}
                        className={`px-2 py-1 text-[11px] font-mono font-semibold cursor-pointer ${
                          sectorSpan === span
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {span}섹터
                      </button>
                    ))}
                  </div>

                  <div className="relative w-48 sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Hex(예: 55 AA) / ASCII 검색"
                      className="w-full pl-8 pr-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {searchQuery.trim() && (
                    <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                      {matchCount}건 일치
                    </span>
                  )}
                </div>
              </div>

              {/* Inline Forensics Entropy & CRC32 Strip */}
              {entropyReport && (
                <div className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono tabular-nums">
                  <div className="flex items-center gap-2 flex-wrap text-slate-700 dark:text-slate-300">
                    <span className="font-sans font-semibold text-blue-600 dark:text-blue-400">
                      {entropyReport.classificationLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      엔트로피 {entropyReport.shannonEntropy.toFixed(3)} bits/B
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      CRC32 0x{(entropyReport.crc32 >>> 0).toString(16).toUpperCase().padStart(8, '0')}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>Zero {(entropyReport.zeroByteRatio * 100).toFixed(1)}%</span>
                    <span aria-hidden="true">·</span>
                    <span>0xFF {(entropyReport.ffByteRatio * 100).toFixed(1)}%</span>
                    <span aria-hidden="true">·</span>
                    <span>{entropyReport.engineSource === 'native-cpp-dll' ? 'Forensics DLL' : 'Parity Core'}</span>
                  </div>
                </div>
              )}

              {/* VBR Boot Info Banner if detected */}
              {vbrInfo && (
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>VBR 부트 섹터 시그니처 감지: {vbrInfo.filesystem} ({vbrInfo.oemId})</span>
                  </div>
                  <div className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    Sector {vbrInfo.bytesPerSector}B · Cluster {vbrInfo.clusterSizeBytes.toLocaleString()}B ({vbrInfo.sectorsPerCluster} sectors)
                    {nativeVbr?.mftStartLcn ? ` · $MFT LCN ${nativeVbr.mftStartLcn.toLocaleString()}` : ''} ·{' '}
                    {vbrInfo.signatureValid ? '0x55AA VALID' : '0x55AA MISSING'}
                  </div>
                </div>
              )}

              {/* Hex Dump Viewport or Unavailable State */}
              {hexLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span>Win32 Direct IOCTL로 LBA #{currentLba.toLocaleString()} 섹터 버퍼를 읽는 중...</span>
                </div>
              ) : !hexResponse || !hexResponse.supported || bytes.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-center space-y-2">
                  <div className="flex items-center justify-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <Info className="w-4 h-4 text-indigo-500" />
                    <span>원시 LBA 섹터 데이터를 읽을 수 없습니다</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                    {hexResponse?.reason ||
                      'Windows 관리자 권한의 Tauri 데스크톱 앱에서만 물리 디스크의 원시 LBA 바이트 버퍼를 직접 덤프합니다.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950 text-slate-200 p-3 overflow-x-auto">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pb-2 mb-2 border-b border-slate-800">
                    <span>
                      LBA #{hexResponse.startLba.toLocaleString()} ~ #{(hexResponse.startLba + hexResponse.sectorCount - 1).toLocaleString()} (
                      {bytes.length.toLocaleString()} BYTES · {hexResponse.sectorCount} × {sectorSize}B)
                    </span>
                    <span>OFFSET | 00..0F HEX | ASCII</span>
                  </div>

                  <div className="font-mono text-[11px] leading-5 tabular-nums space-y-0.5 min-w-[680px]">
                    {Array.from({ length: Math.ceil(bytes.length / 16) }, (_, rowIdx) => {
                      const offset = rowIdx * 16;
                      const rowSlice = bytes.slice(offset, offset + 16);
                      const isSectorBoundary = offset > 0 && offset % sectorSize === 0;
                      return (
                        <React.Fragment key={offset}>
                          {isSectorBoundary && (
                            <div className="py-0.5 px-1 text-[10px] text-indigo-400 border-t border-slate-800/90">
                              ── LBA #{(hexResponse.startLba + Math.floor(offset / sectorSize)).toLocaleString()} ──
                            </div>
                          )}
                          <div className="flex items-center gap-3 hover:bg-slate-900/75 px-1 rounded">
                            <span className="text-slate-500 w-16 shrink-0 select-none">
                              0x{offset.toString(16).toUpperCase().padStart(6, '0')}
                            </span>
                            <div className="flex items-center gap-1 flex-1">
                              {rowSlice.map((b, col) => {
                                const absIdx = offset + col;
                                const isMatch = matchedIndices.has(absIdx);
                                return (
                                  <span
                                    key={absIdx}
                                    className={`px-0.5 rounded ${col === 8 ? 'ml-1.5 ' : ''}${
                                      isMatch
                                        ? 'bg-amber-500 text-slate-950 font-bold'
                                        : b === 0
                                        ? 'text-slate-600'
                                        : 'text-slate-200'
                                    }`}
                                  >
                                    {b.toString(16).toUpperCase().padStart(2, '0')}
                                  </span>
                                );
                              })}
                            </div>
                            <div className="text-emerald-400/90 border-l border-slate-800 pl-3 tracking-wider shrink-0">
                              {rowSlice.map((b, col) => {
                                const absIdx = offset + col;
                                const ch = b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
                                return (
                                  <span
                                    key={absIdx}
                                    className={matchedIndices.has(absIdx) ? 'bg-amber-500 text-slate-950 font-bold' : ''}
                                  >
                                    {ch}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'partition' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  LBA 0~33 MBR / GPT 파티션 테이블 구조 분석
                </div>
                <button
                  type="button"
                  onClick={() => void loadPartitionTable()}
                  disabled={partitionLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${partitionLoading ? 'animate-spin' : ''}`} />
                  <span>재분석</span>
                </button>
              </div>

              {partitionLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span>MBR 및 GPT 헤더(LBA 0~33)를 파싱하는 중...</span>
                </div>
              ) : partitionError || !partitionTable ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-center space-y-2">
                  <div className="flex items-center justify-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <Info className="w-4 h-4 text-indigo-500" />
                    <span>파티션 테이블 원시 판독 불가</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                    {partitionError || 'Tauri 데스크톱 관리자 권한 환경에서 LBA 0~33을 직접 읽어 MBR/GPT 구조를 분석합니다.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Scheme Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">파티션 규격</div>
                      <div className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {partitionTable.scheme}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        MBR Sig: {partitionTable.mbrSignatureHex} ({partitionTable.mbrSignatureValid ? 'OK' : 'INVALID'})
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">섹터 크기</div>
                      <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {partitionTable.sectorSize} Bytes
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {partitionTable.protectiveMbrDetected ? 'Protective MBR (0xEE)' : 'Standard MBR'}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">GPT 헤더 · 배열 무결성</div>
                      <div className="text-sm font-mono font-bold mt-0.5 flex items-center gap-1">
                        {partitionTable.scheme === 'GPT' ? (
                          partitionTable.gptHeaderCrcValid && (partitionMeta?.gptEntriesCrcValid ?? true) ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <ShieldCheck className="w-4 h-4" /> CRC32 정상
                            </span>
                          ) : (
                            <span className="text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" /> CRC32 불일치
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500">N/A (MBR)</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                        {partitionTable.gptHeaderSignature || 'Legacy Boot'} · {partitionMeta?.engineSource === 'native-cpp-dll' ? 'Forensics DLL' : 'Parity Core'}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Disk GUID</div>
                      <div
                        className="text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200 truncate mt-1"
                        title={partitionTable.gptDiskGuid || '-'}
                      >
                        {partitionTable.gptDiskGuid || 'MBR Disk'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        항목 {partitionTable.entries.length}개
                      </div>
                    </div>
                  </div>

                  {/* Entries Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">이름 / 유형</th>
                          <th className="px-3 py-2">Start LBA</th>
                          <th className="px-3 py-2">End LBA</th>
                          <th className="px-3 py-2">용량</th>
                          <th className="px-3 py-2">4K 정렬</th>
                          <th className="px-3 py-2 text-right">검사</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px] tabular-nums">
                        {partitionTable.entries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-slate-500 font-sans">
                              할당된 파티션 엔트리가 발견되지 않았습니다.
                            </td>
                          </tr>
                        ) : (
                          partitionTable.entries.map(entry => (
                            <tr
                              key={`${entry.scheme}-${entry.index}`}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="px-3 py-2 text-slate-500">#{entry.index}</td>
                              <td className="px-3 py-2 font-sans">
                                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <span>{entry.name}</span>
                                  {entry.bootable && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {entry.typeName} · <span className="font-mono">{entry.typeCodeOrGuid}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                                {entry.startLba.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {entry.endLba.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                                {entry.sizeGb.toFixed(2)} GB
                              </td>
                              <td className="px-3 py-2">
                                {entry.is4kAligned ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Aligned</span>
                                ) : (
                                  <span className="text-amber-500 font-bold">Misaligned</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-sans">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('hex');
                                    jumpToLba(entry.startLba);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <span>Hex 이동</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            비파괴 읽기 전용(Read-Only) Win32 Direct PhysicalDrive IOCTL 검사기
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
