import React, { useState } from 'react';
import { PROJECT_INFO } from '../config/projectInfo';
import { 
  X, 
  Cpu, 
  Layers, 
  Code2, 
  Terminal, 
  Check, 
  Copy, 
  Zap, 
  ShieldCheck, 
  ArrowUpRight, 
  Binary, 
  FileText,
  Activity,
  HardDrive
} from 'lucide-react';

interface DllDocsModalProps {
  isOpen: boolean;
  isInline?: boolean;
  onClose: () => void;
}

export const DllDocsModal: React.FC<DllDocsModalProps> = ({
  isOpen,
  isInline = false,
  onClose
}) => {
  const [activeSection, setActiveSection] = useState<'architecture' | 'modules' | 'api' | 'usage' | 'audit'>('architecture');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const headerCodeSample = `// DiskSentinelEngine.h - Pure Creative DLL (DiskSentinelNativeCore.dll)
#include <stdint.h>
#include <stdbool.h>

// 1. OS 캐시 우회 다이렉트 디스크 핸들 획득 (DirectStorageRawIO)
DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize);

// 2. 마이크로초(µs) 단위 고정밀 단일/버스트 LBA 검사
DS_API bool  DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

// 3. [순수 창작] 적응형 버스트 점핑 & 이진 분할 미세 추적 스캔 (AdaptiveBurstSeeker)
DS_API bool  DS_CALL DS_AdaptiveScanChunk(void* hDrive, uint64_t chunkStartLba, uint32_t chunkSectorCount, uint32_t burstStep, DSBlockResult* outBadResults, uint32_t maxBadResults, uint32_t* outDetectedBadCount);

// 4. NVMe Log Page 02h & ATA Pass-Through 텔레메트리 파싱
DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries);

// 5. [순수 창작] 다변량 가중치 기반 수명 예측 및 신뢰도 지수 연산 (Weibull Hazard)
DS_API bool  DS_CALL DS_EvaluateDriveReliability(const DSSmartEntry* entries, int32_t entryCount, DSDriveHealthReport* outReport);

// 6. [순수 창작] 초고속 하드웨어 ECC 패리티 및 CRC32 생성기
DS_API bool  DS_CALL DS_CalculateParityChecksum(const uint8_t* pBuffer, uint32_t bufferLength, uint32_t* outCrc32, uint64_t* outEccParity);

// 7. 비파괴 소프트 배드섹터 안전 복구 및 재할당 트리거
DS_API bool  DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t count, uint32_t* outRecoveredStatus);

// 8. 디스크 핸들 및 4096B 정렬 메모리 해제
DS_API void  DS_CALL DS_CloseDrive(void* hDrive);

// 9. [Rust/C++] NVMe Log Page 02h 심층 텔레메트리 (Available Spare, TBW, 마모율)
DS_API bool  DS_CALL DS_GetNvmeDeepTelemetry(void* hDrive, DSNvmeHealthLog* outLog);

// 10. [Rust SIMD/AVX2] 초고속 256비트 벡터 제로 체크 및 패리티 검증
DS_API bool  DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(const uint8_t* pBuffer, uint32_t bufferLength, bool* outIsAllZeros, uint32_t* outCrc32, uint64_t* outAvxParity);

// 11. [Rust Rayon] Data Race 없는 초고속 다중 디스크 동시 병렬 스캐너
DS_API bool  DS_CALL DS_ScanMultipleDrivesParallel(const DSMultiDriveScanTarget* targets, uint32_t targetCount, DSMultiDriveScanSummary* outSummaries, uint32_t concurrencyLimit);

// 12. [Rust Guardian] 시스템 트레이 백그라운드 가디언 데몬 정책 설정
DS_API bool  DS_CALL DS_ConfigureTrayGuardian(uint32_t pollIntervalSec, uint32_t tempThresholdC, bool alertOnPendingSector);

// 13. [Rust Guardian] 트레이 상주 데몬 디스크 실시간 건전성 폴링
DS_API bool  DS_CALL DS_RunTrayGuardianCheck(DSTrayGuardianStatus* outStatus);

// 14. [Rust Bit Carving] 휴리스틱 매직 바이트 시그니처 분석 및 ECC 패리티 비트 카빙 수복
DS_API bool  DS_CALL DS_ExecuteBitCarvingRecovery(void* hDrive, uint64_t targetLba, uint32_t clusterSpan, DSCarvedSectorResult* outResult);

// 15. [고도화 하드웨어 정보 획득] 물리 디스크 열거 및 4K AF, TRIM, 지오메트리 심층 프로브
DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(DSPhysicalDriveDetail* outDrives, uint32_t maxDrives);

// 16~19. [하드웨어 검증 · 자가진단 · 단일 핸들 상세 조회]
DS_API bool DS_CALL DS_VerifyLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);
DS_API bool DS_CALL DS_StartSmartSelfTest(void* hDrive, uint32_t testTypeCode);
DS_API bool DS_CALL DS_GetSmartSelfTestStatus(void* hDrive, uint32_t* outExecCode, uint32_t* outProgressPct);
DS_API bool DS_CALL DS_GetDriveDetails(void* hDrive, DSPhysicalDriveDetail* outDetail);

// 20~25. [Memory-Mapped Zero-Copy & Direct DMA 파이프라인]
DS_API void* DS_CALL DS_OpenMappedTarget(const char* utf8Path, uint32_t sectorSize, uint32_t accessMode, uint64_t initialSizeBytes);
DS_API bool DS_CALL DS_MapSectorWindow(void* hMapped, uint64_t startLba, uint32_t sectorCount, DSMappedSectorWindow* outWindow);
DS_API bool DS_CALL DS_UnmapSectorWindow(DSMappedSectorWindow* window);
DS_API void DS_CALL DS_CloseMappedTarget(void* hMapped);
DS_API bool DS_CALL DS_ScanMappedLbaRange(void* hMapped, uint64_t startLba, uint64_t sectorCount, uint32_t windowSectors, uint32_t* outCrc32, uint64_t* outParity, uint64_t* outZeroSectors);
DS_API bool DS_CALL DS_CopyLbaRangeToMappedFile(void* hDrive, uint64_t startLba, uint64_t totalSectors, const char* destUtf8Path, uint64_t destStartLba, uint32_t chunkSectors, uint64_t* outBytesCopied, uint32_t* outWin32Error);

// ---------------------------------------------------------------------------
// DiskSentinelForensics.h - Pure Creative Compute & Forensics DLL (DiskSentinelForensics.dll)
// ---------------------------------------------------------------------------
DSF_API bool DSF_CALL DSF_GetForensicsEngineInfo(DSFEngineInfo* outInfo);
DSF_API bool DSF_CALL DSF_AnalyzeSectorTelemetryZScore(const DSFTelemetrySample* samples, uint32_t sampleCount, double baselineExpectedMs, uint32_t maxBlockIdGap, DSFZScoreReport* outReport, DSFContiguousZone* outZones, uint32_t maxZones, uint32_t* outWrittenZones);
DSF_API bool DSF_CALL DSF_ComputeExtentBadDensityHeatmap(const DSFExtentInput* extents, uint32_t extentCount, const uint64_t* badLbas, uint32_t badLbaCount, bool badLbasAlreadySorted, uint32_t cellCount, uint32_t* outCellBadCounts, double* outCellDensityPct, DSFHeatmapSummary* outSummary);
DSF_API bool DSF_CALL DSF_ComputeSectorEntropyAndPattern(const uint8_t* pBuffer, uint32_t bufferLength, DSFSectorEntropyResult* outResult);
DSF_API bool DSF_CALL DSF_InspectBootAndPartitionTable(const uint8_t* rawLbaBuffer, uint32_t bufferLength, uint32_t sectorSize, DSFPartitionTableReport* outReport, DSFPartitionRecord* outPartitions, uint32_t maxPartitions);
DSF_API bool DSF_CALL DSF_InspectVbrBootSector(const uint8_t* vbrSectorBuffer, uint32_t bufferLength, DSFVbrInfo* outInfo);

// ---------------------------------------------------------------------------
// DiskSentinelPredictive.h - Pure Creative Prognostic & Acoustic DLL (DiskSentinelPredictive.dll)
// ---------------------------------------------------------------------------
DSP_API bool DSP_CALL DSP_GetPredictiveEngineInfo(DSPEngineInfo* outInfo);
DSP_API bool DSP_CALL DSP_ComputeWeibullRul(const DSPWeibullInput* input, DSPWeibullRulReport* outReport);
DSP_API bool DSP_CALL DSP_AnalyzeAcousticSeekProfile(const DSPAcousticSample* samples, uint32_t sampleCount, uint32_t mediaType, DSPAcousticProfile* outProfile);
DSP_API bool DSP_CALL DSP_EvaluateThermalWearStress(const DSPThermalWearInput* input, DSPThermalWearReport* outReport);
DSP_API bool DSP_CALL DSP_ProjectSmartDegradationTrend(const DSPSmartHistoryPoint* points, uint32_t pointCount, double warningThreshold, double criticalThreshold, uint32_t lowerIsWorse, DSPSmartTrendProjection* outProjection);

// ---------------------------------------------------------------------------
// DiskSentinelRecovery.h - Pure Creative Deep Recovery & Verify DLL (DiskSentinelRecovery.dll)
// ---------------------------------------------------------------------------
DSR_API bool DSR_CALL DSR_GetRecoveryEngineInfo(DSREngineInfo* outInfo);
DSR_API bool DSR_CALL DSR_InspectRecoveryCarveBuffer(const uint8_t* pBuffer, uint32_t bufferLength, DSRCarveInspectionResult* outResult);
DSR_API bool DSR_CALL DSR_ParseNtfsMftRecord(uint8_t* recordBytes, uint32_t recordLength, uint32_t recordIndexHint, bool applyUsaFixupInPlace, DSRNtfsMftParsedRecord* outRecord, DSRNtfsDataRun* outRuns, uint32_t maxRuns);
DSR_API bool DSR_CALL DSR_ScanMftBufferForCluster(const uint8_t* mftBuffer, uint32_t bufferLength, uint32_t mftRecordSize, uint32_t firstRecordIndex, uint64_t batchStartLba, uint32_t sectorSize, uint64_t targetLba, uint64_t targetLcn, DSRNtfsMftParsedRecord* outMatchedRecords, uint32_t maxMatched, uint32_t* outMatchedCount, DSRNtfsDataRun* outRunsFlat, uint32_t maxRunsFlat, uint32_t* outWrittenRuns);
DSR_API bool DSR_CALL DSR_GenerateWipePatternBuffer(uint8_t* pOutBuffer, uint32_t bufferLength, uint32_t patternMode, uint8_t constantByte, uint64_t seed64, uint64_t lbaOffset, uint32_t* outCrc32);
DSR_API bool DSR_CALL DSR_VerifyWipedBuffer(const uint8_t* pBuffer, uint32_t bufferLength, uint32_t patternMode, uint8_t constantByte, uint64_t seed64, uint64_t lbaOffset, DSRWipeVerifyReport* outReport);
DSR_API bool DSR_CALL DSR_CoalesceAndPlanDdrescueIntervals(const DSRDdrescueIntervalC* inIntervals, uint32_t inCount, uint32_t chunkSectors, DSRDdrescueIntervalC* outCoalesced, uint32_t maxOut, DSRDdrescuePlanSummary* outSummary);

// ---------------------------------------------------------------------------
// DiskSentinelIntegrity.h - Pure Creative Bit-Rot, Correlation, Diff & Watchdog DLL (DiskSentinelIntegrity.dll)
// ---------------------------------------------------------------------------
DSI_API bool DSI_CALL DSI_GetIntegrityEngineInfo(DSIEngineInfo* outInfo);
DSI_API bool DSI_CALL DSI_Sha256Init(DSISha256Context* ctx);
DSI_API bool DSI_CALL DSI_Sha256Update(DSISha256Context* ctx, const uint8_t* pData, uint32_t dataLen);
DSI_API bool DSI_CALL DSI_Sha256Final(DSISha256Context* ctx, uint8_t outDigest[32], char* outHex65);
DSI_API bool DSI_CALL DSI_ComputeIntegrityDigest(const uint8_t* pData, uint32_t dataLen, DSIIntegrityDigestReport* outReport);
DSI_API bool DSI_CALL DSI_EvaluateExtentIntegrity(const DSIExtentInterval* extents, uint32_t extentCount, const uint64_t* badLbas, uint32_t badCount, const uint64_t* slowLbas, uint32_t slowCount, bool inputsSorted, bool hashMismatch, bool isUnreadable, bool isMissing, bool hasSha256, uint64_t* outBadHits, uint32_t maxBadHits, uint64_t* outSlowHits, uint32_t maxSlowHits, DSIExtentIntegrityReport* outReport);
DSI_API bool DSI_CALL DSI_ComputeScanSmartDiff(const DSIScanDiffInput* pInput, const DSISmartAttrSnapshot* pAttrs, uint32_t attrCount, DSISmartAttrDiffRow* outAttrRows, uint32_t maxAttrRows, DSIScanDiffSummary* outSummary);
DSI_API bool DSI_CALL DSI_EvaluateWatchdogMatrix(const DSIWatchdogDriveState* pDrives, uint32_t driveCount, const DSIWatchdogRuleInput* pRules, uint32_t ruleCount, int64_t nowMs, DSIWatchdogTriggerOut* outTriggers, uint32_t maxTriggers, uint32_t* outQuickScanDriveIndices, uint32_t maxQuickScanTargets, DSIWatchdogMatrixReport* outReport);`;

  return (
    <div className={isInline ? 'w-full font-sans' : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150'}>
      <div className={isInline
        ? 'relative w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col font-sans'
        : 'relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans'
      }>
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  DiskSentinel Penta-DLL 순수 창작 네이티브 엔진 기술 명세서
                </h2>
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap">
                  · Core + Forensics + Predictive + Recovery + Integrity
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Direct DMA/mmap · Welford/GPT 포렌식 · Weibull/RMSSD 예지 · 16종 카빙/MFT · SHA-256 Bit-Rot/Diff/Watchdog
              </p>
            </div>
          </div>

          {!isInline && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveSection('architecture')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'architecture'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            아키텍처 및 동작 원리
          </button>

          <button
            onClick={() => setActiveSection('modules')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'modules'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            창작 핵심 알고리즘
          </button>

          <button
            onClick={() => setActiveSection('audit')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'audit'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            오류 분석 및 개선 내역
          </button>

          <button
            onClick={() => setActiveSection('api')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'api'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            C/C++ API 명세 (51종)
          </button>

          <button
            onClick={() => setActiveSection('usage')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'usage'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            빌드 & FFI 연동
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className={isInline ? 'p-4 sm:p-5 space-y-4 text-xs text-slate-700 dark:text-slate-300' : 'flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs text-slate-700 dark:text-slate-300'}>
          
          {/* 1. Architecture Section */}
          {activeSection === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  순수 창작 DLL 개발 배경 및 해결 과제
                </h3>
                <p className="leading-relaxed text-[11px] text-slate-600 dark:text-slate-300">
                  일반 웹 및 상위 API는 OS의 **페이지 캐시(Page Cache)**와 버퍼링으로 인해 실제 디스크의 물리적 플래터 마모나 NAND 셀 지연시간을 100% 실측할 수 없습니다. <br />
                  <strong>DiskSentinelNativeCore.dll</strong>을 필두로 한 <strong>5-DLL(Penta-DLL) 순수 창작 네이티브 엔진</strong>은 Direct I/O, 포렌식, 예지 진단, 딥 리커버리, SHA-256 Bit-Rot/차분/워치독까지 C++ C ABI 네이티브 속도로 처리합니다.
                </p>
              </div>

              {/* Architecture Diagram */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 leading-snug">
                <div className="text-emerald-400 font-bold mb-2">┌── Penta-DLL Pure Creative Architecture (Core+Forensics+Predictive+Recovery+Integrity) ─┐</div>
                <div>│                                                                                      │</div>
                <div>│  <span className="text-blue-400">[DiskSentinelNativeCore.dll] Kernel Direct DMA &amp; mmap Engine</span>                       │</div>
                <div>│  └─ Physical: FILE_FLAG_NO_BUFFERING + Lazy VirtualAlloc MDL Buffers                 │</div>
                <div>│  └─ Image/Clone: CreateFileMappingW / MapViewOfFile Zero-Copy                        │</div>
                <div>│  └─ O(log K) AdaptiveBurstSeeker + Slicing-by-8 CRC32 + ATA 0xA0/NVMe IOCTL          │</div>
                <div>│                                                                                      │</div>
                <div>│  <span className="text-purple-400">[DiskSentinelForensics.dll] Zero-Handle Forensics Engine</span>                          │</div>
                <div>│  └─ Welford One-Pass Z-Score(N-1) &amp; Contiguous Cluster Detector                      │</div>
                <div>│  └─ O(N log M) Extent Heatmap + Shannon Entropy + 512B GPT CRC32/UTF-8 + VBR         │</div>
                <div>│                                                                                      │</div>
                <div>│  <span className="text-cyan-400">[DiskSentinelPredictive.dll] Pure Creative Prognostic Engine</span>                       │</div>
                <div>│  └─ Weibull Bathtub Conditional Failure &amp; Median RUL Estimator                       │</div>
                <div>│  └─ Acoustic Seek RMSSD Jitter, Resonance &amp; FTL GC Stall Profiler                    │</div>
                <div>│  └─ Arrhenius(0.7eV) Thermal Aging + Centered OLS S.M.A.R.T. Regressor (&gt;=1h guard)  │</div>
                <div>│                                                                                      │</div>
                <div>│  <span className="text-emerald-400">[DiskSentinelRecovery.dll] Deep Recovery, MFT &amp; Sanitize Verify DLL</span>                │</div>
                <div>│  └─ 16+ Signature Carver (UTF-8 aware) + EOF Boundary &amp; Hamming(1~2bit) Tolerance    │</div>
                <div>│  └─ NTFS $MFT USA Fixup + UTF-16LE Name + $DATA Non-Resident Runlist Decoder        │</div>
                <div>│  └─ NIST SP 800-88 Xoshiro256** Wipe Gen/Verify &amp; ddrescue Interval Planner          │</div>
                <div>│                                                                                      │</div>
                <div>│  <span className="text-amber-400">[DiskSentinelIntegrity.dll] Bit-Rot, Correlation, Diff &amp; Watchdog DLL (신규)</span>        │</div>
                <div>│  └─ Streaming FIPS 180-4 SHA-256 + FNV-1a64 + Slicing-by-8 IEEE 802.3 CRC32          │</div>
                <div>│  └─ O((E+B)log B) Physical Extent-vs-Bad/Slow LBA Risk &amp; Survivability Scorer        │</div>
                <div>│  └─ Scan A↔B Daily Degradation Velocity &amp; Fleet Watchdog SLA Matrix Evaluator        │</div>
                <div className="text-emerald-400 font-bold mt-2">└──────────────────────────────────────────────────────────────────────────────────────┘</div>
              </div>
            </div>
          )}

          {/* 2. 4 Modules Section */}
          {activeSection === 'modules' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 text-xs">
                  <HardDrive className="w-4 h-4 shrink-0" />
                  <span>1. Direct DMA &amp; Memory-Mapped Zero-Copy</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  물리 디스크는 `VirtualAlloc` 64KB 정렬 버퍼·`MaximumTransferLength` 스케일링·순차 시크 생략으로 Direct DMA를 극대화하고, 이미지/복제 파일은 `CreateFileMappingW`/`MapViewOfFile`(`mmap`)로 커널-유저 버퍼 복사를 제거합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400 text-xs">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>2. AdaptiveBurstSeeker (O(log K) 이진 분할)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  정상 영역은 하드웨어 최적 버스트 단위로 고속 통과하고, 응답 지연이나 CRC 에러 감지 시 반복 이진 분할(Binary Subdivision)로 정상 절반을 건너뛰며 1 LBA 결함을 최소 시스템 콜로 핀포인트합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-cyan-600 dark:text-cyan-400 text-xs">
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>3. SmartPassThroughDecoder</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  서드파티 드라이버 없이 `IOCTL_STORAGE_PROTOCOL_COMMAND`를 통해 NVMe 헬스 로그(Page 02h)와 SATA ATA S.M.A.R.T. 원시 레지스터를 실시간 디코딩합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>4. Non-Destructive Soft Repair</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  ECC 패리티 불일치로 인한 논리적 소프트 배드섹터에 대해 원자적 재기록 검증을 수행하여 드라이브 펌웨어의 자율 예비 블록 치환(Reallocation 0x05)을 유도합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-xs">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>5. Welford Z-Score &amp; 익스텐트 히트맵 (Forensics.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  단일 패스 Welford 점화식으로 대량 섹터 레이턴시의 평균·표준편차를 수치 안정적으로 계산해 연속 열화 클러스터를 탐지하고, O(N log M) 이진 탐색으로 파일 익스텐트 배드 밀도를 산출합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400 text-xs">
                  <Binary className="w-4 h-4 shrink-0" />
                  <span>6. 섀넌 엔트로피 &amp; GPT CRC32 검증 (Forensics.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  256-bin 엔트로피(0~8 bits/byte)와 0xFF 소거 NAND/반복 패턴을 분류하며, LBA 0~33 원시 버퍼에서 GPT 헤더 및 파티션 배열의 IEEE 802.3 CRC32(완전 UTF-16LE→UTF-8 라벨)와 NTFS/FAT32/exFAT VBR 구조를 검증합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-sky-600 dark:text-sky-400 text-xs">
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>7. Weibull RUL &amp; 음향 탐색 RMSSD 지터 (Predictive.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  매체별(HDD/SATA/NVMe/USB) 특성 수명(η)·형상 모수(β) 동적 보정으로 30/90/365일 조건부 고장 확률과 잔여 일수(RUL)를 추정하고, 연속 탐색 지연의 RMSSD 지터와 FTL 마이크로 스톨 버스트를 정밀 분리합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-teal-600 dark:text-teal-400 text-xs">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>8. Arrhenius 열가속 &amp; S.M.A.R.T. OLS 회귀 (Predictive.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  Ea=0.7 eV Arrhenius 열가속 방정식으로 35°C 기준 등가 노화 시간과 TBW 잔여 수명을 산출하며, 중심화 2-Pass OLS 회귀로 S.M.A.R.T. R²·30일 전망치·임계치 도달 예상 일수를 계산합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                  <Binary className="w-4 h-4 shrink-0" />
                  <span>9. 16종 카빙·Hamming 복원 &amp; NTFS MFT 디코더 (Recovery.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  16+ 파일 시그니처와 EOF 경계(FF D9/IEND/EOCD)를 검증하고 Hamming(1~2bit) 손상 헤더를 구출하며, NTFS $MFT 레코드 USA Fixup과 비거주 $DATA Runlist를 배치 고속 해독합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>10. NIST Xoshiro256** 소거 검증 &amp; ddrescue 플래너 (Recovery.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  SplitMix64+Xoshiro256** 결정적 PRNG와 IEEE CRC32로 소거 후 Read-Back 잔존 데이터(최초 불일치 오프셋)를 감사하고, ddrescue 도메인 구간을 병합·스케줄링합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>11. 스트리밍 SHA-256 &amp; 익스텐트 Bit-Rot 상관분석 (Integrity.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  64KB 청크 스트리밍 FIPS 180-4 SHA-256 + FNV-1a64 + Slicing-by-8 CRC32 지문을 생성하고, $O((E+B)\log B)$ 이진 탐색으로 중요 파일 물리 익스텐트의 배드·지연 LBA 중첩 및 생존율(%)을 산출합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 text-xs">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>12. 스캔 일일 열화 차분 &amp; 플릿 워치독 매트릭스 (Integrity.dll)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  두 스캔 시점 간 배드/건강도 일일 열화 속도(≥1h 가드) 및 S.M.A.R.T. 회귀 등급을 판별하고, 다중 드라이브 워치독 6종 규칙과 쿨다운 윈도우·Fleet Health Index를 고속 평가합니다.
                </p>
              </div>
            </div>
          )}

          {/* 3. Audit Findings & Improvements Section */}
          {activeSection === 'audit' && (
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  기존 DLL 코드 오류 정밀 감사 및 개선 사항 (v4.4.0)
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-rose-500 mr-2">[수정 완료]</span>
                    <strong className="text-slate-900 dark:text-slate-100">64비트 LBA 오버플로 취약점 차단:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      기존 <code>offset.QuadPart = (LONGLONG)(lba * ctx-&gt;sectorSize)</code>에서 4TB 이상 대용량 디스크 스캔 시 정수 오버플로가 발생할 수 있던 연산을 <code>((LONGLONG)lba) * ((LONGLONG)ctx-&gt;sectorSize)</code>로 명시적 64비트 캐스팅 처리하였습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-amber-500 mr-2">[수정 완료]</span>
                    <strong className="text-slate-900 dark:text-slate-100">크로스 컴파일러 호환성 확보:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      MSVC 전용인 `strcpy_s` 및 `_aligned_malloc`이 GCC/MinGW에서 컴파일 에러를 일으키는 문제를 해결하기 위해 이식성 높은 `safe_strncpy` 및 `DS_ALIGNED_ALLOC` 매크로를 구축했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-emerald-500 mr-2">[신규 구현]</span>
                    <strong className="text-slate-900 dark:text-slate-100">3대 순수 창작 알고리즘 완비:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      적응형 고속 버스트 및 1섹터 이진 분할 탐색기(`DS_AdaptiveScanChunk`), 하드웨어 CRC32 & 64비트 XOR 패리티 연산기(`DS_CalculateParityChecksum`), 다변량 수명 예측기(`DS_EvaluateDriveReliability`)를 순수 창작하여 네이티브 코어에 탑재했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-blue-500 mr-2">[도구 배치]</span>
                    <strong className="text-slate-900 dark:text-slate-100">원클릭 DLL 빌더(build-dll.bat):</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      MSVC(`cl.exe`) 또는 MinGW(`g++`)를 자동 감지하여 릴리스 최적화된 `DiskSentinelNativeCore.dll`을 생성하는 배치 스크립트를 제공합니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-teal-500 mr-2">[v4.5.0 고도화]</span>
                    <strong className="text-slate-900 dark:text-slate-100">32개 물리 드라이브 슬롯 전수 탐색 &amp; 볼륨 역매핑:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      기존 12~16개 탐색 제한을 32개(<code>PhysicalDrive0 ~ 31</code>)로 전면 확장하여 외장 USB 독/카드 리더기의 비연속 높은 슬롯 인덱스 장치를 완벽 검출하고, <code>FILE_SHARE_DELETE</code> 플래그를 추가해 OS 보안 프로세스 점유로 인한 공유 위반을 차단하며, <code>IOCTL_STORAGE_GET_DEVICE_NUMBER</code>로 Windows 볼륨 문자(C:, D:, E: 등)를 1:1 매핑합니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-cyan-500 mr-2">[v4.6.0 감사 수정]</span>
                    <strong className="text-slate-900 dark:text-slate-100">DS_GetDriveDetails 누락 익스포트 복구 · LUT CRC32 가속 · 경계 보안 강화:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      <code>DiskSentinelLauncher.cs</code>에서 호출하던 <code>DS_GetDriveDetails</code>가 DLL 헤더/구현에 누락되어 있던 결함을 공통 헬퍼(<code>PopulateDriveDetailFromHandle</code>)로 정식 구현·익스포트하고, 비트별 O(8N) CRC32를 256-엔트리 룩업 테이블 + 8바이트 언롤 패리티로 고속화했으며, <code>DS_GetNvmeDeepTelemetry</code> 사전 오프셋 경계 검증, <code>StorageAccessAlignmentProperty(6)</code>/<code>StorageDeviceWriteCacheProperty(4)</code> 실측 및 <code>DS_VerifyLbaBlock</code> DWORD 오버플로 청크 분할을 반영했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-purple-500 mr-2">[v4.6.0 신규 DLL]</span>
                    <strong className="text-slate-900 dark:text-slate-100">DiskSentinelForensics.dll 순수 창작 포렌식·수리연산 엔진 출범:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      커널 핸들 비의존 알고리즘(Welford Z-Score 군집 탐지, O(N log M) 익스텐트 히트맵, 섀넌 엔트로피·소거 NAND 판별, GPT IEEE 802.3 CRC32 검증, VBR 디코더) 6종 API를 독립 DLL로 분리해 런처(<code>/api/native/forensics/entropy</code>)와 Inno Setup 패키징에 통합했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-sky-500 mr-2">[v4.6.1 Zero-Copy DMA]</span>
                    <strong className="text-slate-900 dark:text-slate-100">Memory-Mapped Files &amp; Direct DMA 대용량 I/O 최적화 (C++ / Rust):</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      물리 드라이브 스캔에는 <code>VirtualAlloc</code> 64KB 정렬 스크래치 재사용, <code>StorageAdapterProperty</code>(<code>MaximumTransferLength</code>) 기반 1~4MB 버스트 스케일링, 순차 LBA 읽기 시 <code>SetFilePointerEx</code> 생략 및 <code>O(log K)</code> 이진 분할을 적용했습니다. 디스크 이미지/복제 경로에는 <code>CreateFileMappingW</code>/<code>MapViewOfFile</code>(POSIX <code>mmap</code>) 영속 섹션 매핑과 <code>ReadFile</code>→매핑 페이지 Direct DMA 기록(<code>DS_OpenMappedTarget</code>~<code>DS_CopyLbaRangeToMappedFile</code>, Rust <code>DS_CopyLbaRangeChunk</code>)을 탑재해 불필요한 버퍼 복사를 제거했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-rose-500 mr-2">[v4.6.2 전수 감사 수정]</span>
                    <strong className="text-slate-900 dark:text-slate-100">Core(C++/Rust) &amp; Forensics DLL 안전성·메모리·Slicing-by-8·Tauri 통합 패치:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      <code>DiskSentinelNativeCore</code>(C++/Rust <code>lib.rs</code>) 양측에 지연 DMA 버퍼 할당(유휴 메모리 절감), <code>StorageAccessAlignmentProperty(6)</code>/<code>StorageDeviceWriteCacheProperty(4)</code>/<code>GET_LENGTH_INFO</code> 실측, 64비트 <code>checked_mul</code> 오버플로 가드, 치명적 핸들 오류 즉시 중단, <code>0xA5</code> 센티넬 포이즈닝 청크 수복, <strong>Slicing-by-8 8배 가속 CRC32</strong>를 동시 적용했습니다. <code>DiskSentinelForensics.dll</code>은 EXFAT/FAT32 시프트 엄격 차단·UTF-16LE 서로게이트→UTF-8 디코딩 패치와 함께 Tauri <code>LoadLibraryW</code> 및 섹터 헥스·Z-Score 대시보드에 정식 연동했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-violet-500 mr-2">[v4.6.2 신규 DLL]</span>
                    <strong className="text-slate-900 dark:text-slate-100">DiskSentinelPredictive.dll 출범 &amp; Tauri 네이티브 통합:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      순수 창작 예지보전·음향/지터 엔진(2-파라미터 Weibull RUL + 90% 신뢰구간, RMSSD 음향 시크 지터 &amp; FTL 마이크로 스톨 버스트, Arrhenius 온도 가속 열화 계수, 시간축 중심화 OLS R² 회귀) 5대 C ABI API를 C++ DLL로 구축하고, Tauri <code>LoadLibraryW</code> 동적 FFI 및 GitHub Actions MSVC 빌드 파이프라인에 정식 통합했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-emerald-500 mr-2">[v4.6.0 감사 &amp; Quad-DLL]</span>
                    <strong className="text-slate-900 dark:text-slate-100">DiskSentinelRecovery.dll 출범 및 기존 3종 DLL 버그 전수 패치:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      (1) <code>DS_AdaptiveScanChunk</code> 내 <code>DS_ScanLbaBlock</code> 반환 규약으로 인한 치명 핸들 오류 데드코드 수정 및 <code>DS_VerifyLbaBlock</code>·<code>DS_CopyLbaRangeToMappedFile</code> 핸들/QPF 가드 추가, (2) <code>DSP_ComputeWeibullRul</code> NVMe <code>availableSparePct==0</code> 고갈 판정 보강, (3) TypeScript <code>DS_CalculateAvx2ChecksumAndZeroCheck</code> 룩업 테이블 가속 통일, (4) MFT/PE 헤더 32비트 정수 래핑 방어, (5) <code>tauri.conf.json</code> 리소스 번들 및 GitHub Actions 선행 DLL 스테이징과 함께 신규 <code>DiskSentinelRecovery.dll</code> 7대 API를 전 기능에 통합했습니다.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-blue-500 mr-2">[v4.6.3 Penta-DLL &amp; 심층 감사]</span>
                    <strong className="text-slate-900 dark:text-slate-100">제5 순수 창작 DLL(DiskSentinelIntegrity.dll) 출범 및 4대 DLL 결함 추가 패치:</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      (1) <code>Core</code>: <code>DS_ScanLbaBlock</code> 실패 시 <code>false</code> 반환 일관화, <code>DS_EvaluateDriveReliability</code> <code>0xC2</code>/<code>0xBE</code> 이중 온도 감점·<code>0xFF</code> 오감점 차단, ATA <code>0xA0</code> 우선 프로브 + 홀수 드라이브 <code>0xB0</code> 폴백(C++/Rust 동시 적용), (2) <code>Forensics</code>: GPT CRC 버퍼 <code>512B</code> 확장 및 LDM/LVM/LUKS/APFS GUID 추가, (3) <code>Predictive</code>: 1시간 미만 OLS 기울기 폭주 가드(C++/Rust/TS), (4) <code>Recovery</code>: UTF-8 한글 로그 오분류·MFT <code>targetLba==0</code> 오탐 차단, (5) 신규 <strong><code>DiskSentinelIntegrity.dll</code></strong> 8종 API 구축 및 스트리밍 SHA-256·LBA 무결성·스캔 속도 차분·워치독 매트릭스 전면 연동 완료.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. C/C++ API Section */}
          {activeSection === 'api' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-blue-500">
                  Core.h + Forensics.h + Predictive.h + Recovery.h + Integrity.h (Standard C ABI Export)
                </span>
                <button
                  onClick={() => copyToClipboard(headerCodeSample, 'header-code')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedCode === 'header-code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === 'header-code' ? '복사 완료' : '헤더 복사'}</span>
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-200 p-3.5 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 leading-relaxed">
                <code>{headerCodeSample}</code>
              </pre>
            </div>
          )}

          {/* 4. Usage & FFI Section */}
          {activeSection === 'usage' && (
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                타 언어 및 런타임 FFI 바인딩 가이드 (Penta-DLL Suite)
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                표준 <code>__stdcall</code> 및 C ABI(<code>#pragma pack(push, 8)</code>)를 따르므로 <strong>C# (.NET P/Invoke)</strong>, <strong>Python (ctypes)</strong>, <strong>Tauri / Rust (LoadLibraryW + FFI)</strong>에서 아무런 래퍼 라이브러리 없이 직접 호출할 수 있습니다.
              </p>

              <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] space-y-1 border border-slate-800 overflow-x-auto">
                <div className="text-slate-400">// Python ctypes 호출 예시 (Core + Forensics + Predictive + Recovery + Integrity):</div>
                <div>from ctypes import cdll, c_uint32, byref</div>
                <div>core_dll = cdll.LoadLibrary('./DiskSentinelNativeCore.dll')</div>
                <div>forensics_dll = cdll.LoadLibrary('./DiskSentinelForensics.dll')</div>
                <div>predictive_dll = cdll.LoadLibrary('./DiskSentinelPredictive.dll')</div>
                <div>recovery_dll = cdll.LoadLibrary('./DiskSentinelRecovery.dll')</div>
                <div>integrity_dll = cdll.LoadLibrary('./DiskSentinelIntegrity.dll')</div>
                <div>sector_size = c_uint32(0)</div>
                <div>h_drive = core_dll.DS_OpenDriveDirect(0, byref(sector_size))</div>
                <div># predictive_dll.DSP_ComputeWeibullRul(byref(weibull_in), byref(weibull_out))</div>
                <div># forensics_dll.DSF_ComputeSectorEntropyAndPattern(buf, 512, byref(entropy_res))</div>
                <div># recovery_dll.DSR_InspectRecoveryCarveBuffer(buf, 512, byref(carve_res))</div>
                <div># integrity_dll.DSI_ComputeIntegrityDigest(buf, len(buf), byref(digest_rep))</div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
            <span>Author: {PROJECT_INFO.developer.name}</span>
            <span>•</span>
            <span>License: Apache-2.0</span>
          </div>

          {!isInline && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-md transition-colors cursor-pointer"
            >
              닫기
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
