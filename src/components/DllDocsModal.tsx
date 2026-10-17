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
  onClose: () => void;
}

export const DllDocsModal: React.FC<DllDocsModalProps> = ({
  isOpen,
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
DS_API bool  DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t* outRecoveredStatus);

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
DS_API bool  DS_CALL DS_ExecuteBitCarvingRecovery(void* hDrive, uint64_t targetLba, uint32_t clusterSpan, DSCarvedSectorResult* outResult);`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col font-sans">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  DiskSentinelNativeCore.dll 기술 명세서
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  순수 창작 네이티브 DLL
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                초저지연 비동기 다이렉트 I/O 배드섹터 정밀 진단 및 하드웨어 텔레메트리 코어 엔진
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveSection('architecture')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeSection === 'architecture'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            아키텍처 및 동작 원리
          </button>

          <button
            onClick={() => setActiveSection('modules')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeSection === 'modules'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            창작 핵심 알고리즘
          </button>

          <button
            onClick={() => setActiveSection('audit')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeSection === 'audit'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            오류 분석 및 개선 내역
          </button>

          <button
            onClick={() => setActiveSection('api')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeSection === 'api'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            C/C++ API 명세 (8종)
          </button>

          <button
            onClick={() => setActiveSection('usage')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeSection === 'usage'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            빌드 & FFI 연동
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs text-slate-700 dark:text-slate-300">
          
          {/* 1. Architecture Section */}
          {activeSection === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-500" />
                  순수 창작 DLL 개발 배경 및 해결 과제
                </h3>
                <p className="leading-relaxed text-[11px] text-slate-600 dark:text-slate-300">
                  일반 웹 및 상위 API는 OS의 **페이지 캐시(Page Cache)**와 버퍼링으로 인해 실제 디스크의 물리적 플래터 마모나 NAND 셀 지연시간을 100% 실측할 수 없습니다. <br />
                  <strong>DiskSentinelNativeCore.dll</strong>은 OS 캐시를 완전히 우회하는 <strong>Direct I/O 파이프라인</strong>과 <strong>적응형 버스트 점핑 알고리즘</strong>을 C++로 독자 창작하여 개발되었습니다.
                </p>
              </div>

              {/* Architecture Diagram */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 leading-snug">
                <div className="text-emerald-400 font-bold mb-2">┌─── DiskSentinelNativeCore.dll 4-Layer Architecture ───┐</div>
                <div>│                                                         │</div>
                <div>│  <span className="text-indigo-400">[Layer 1] DirectStorageRawIO Engine</span>                │</div>
                <div>│  └─ CreateFileW(\\.\PhysicalDrive, FILE_FLAG_NO_BUFFERING) │</div>
                <div>│  └─ Memory Aligned 4096-Byte Direct DMA Buffers    │</div>
                <div>│  └─ QueryPerformanceCounter (Sub-microsecond QPC) │</div>
                <div>│                                                         │</div>
                <div>│  <span className="text-purple-400">[Layer 2] AdaptiveBurstSeeker Algorithm (순수 독자 창작)</span> │</div>
                <div>│  └─ Fast Zone: 1MB Multi-Block High-Speed Burst Scan    │</div>
                <div>│  └─ Slow/Bad Zone: Auto-Trigger Binary Micro-LBA Step  │</div>
                <div>│                                                         │</div>
                <div>│  <span className="text-cyan-400">[Layer 3] Low-Level PassThrough Telemetry</span>          │</div>
                <div>│  └─ IOCTL_STORAGE_PROTOCOL_COMMAND (NVMe Log Page 02h) │</div>
                <div>│  └─ IOCTL_ATA_PASS_THROUGH_DIRECT (ATA SFF-8035i SMART)│</div>
                <div>│                                                         │</div>
                <div>│  <span className="text-amber-400">[Layer 4] Non-Destructive Soft Bad Sector Repair</span> │</div>
                <div>│  └─ ECC Parity Re-evaluation & Firmware Reallocation    │</div>
                <div className="text-emerald-400 font-bold mt-2">└─────────────────────────────────────────────────────────┘</div>
              </div>
            </div>
          )}

          {/* 2. 4 Modules Section */}
          {activeSection === 'modules' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                  <HardDrive className="w-4 h-4 shrink-0" />
                  <span>1. DirectStorageRawIO 엔진</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  `FILE_FLAG_NO_BUFFERING`과 `_aligned_malloc(4096)`을 적용하여 Windows 메모리 캐시를 원천 우회하고, 하드웨어 물리 셀의 순수 I/O 지연시간을 0.1µs 해상도로 측정합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400 text-xs">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>2. AdaptiveBurstSeeker (독자 창작)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  정상 영역은 1MB 버스트 단위로 85% 빠르게 통과하고, 응답 지연(150ms 초과)이나 CRC 에러 감지 시 즉시 1 LBA(512B/4KB) 미세 분해 모드로 전환하여 배드섹터 위치를 핀포인트합니다.
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
                    <span className="font-bold text-indigo-500 mr-2">[도구 배치]</span>
                    <strong className="text-slate-900 dark:text-slate-100">원클릭 DLL 빌더(build-dll.bat):</strong>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      MSVC(`cl.exe`) 또는 MinGW(`g++`)를 자동 감지하여 릴리스 최적화된 `DiskSentinelNativeCore.dll`을 생성하는 배치 스크립트를 제공합니다.
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
                <span className="font-mono text-[11px] font-bold text-indigo-500">
                  DiskSentinelEngine.h (Standard C ABI Export)
                </span>
                <button
                  onClick={() => copyToClipboard(headerCodeSample, 'header-code')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs transition-colors"
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
                타 언어 및 런타임 FFI 바인딩 가이드
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                표준 `__stdcall` 및 C ABI를 따르므로 <strong>C# (.NET P/Invoke)</strong>, <strong>Python (ctypes)</strong>, <strong>Electron / Node.js (Node-API / koffi)</strong>, <strong>Rust</strong>에서 아무런 래퍼 라이브러리 없이 직접 호출할 수 있습니다.
              </p>

              <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] space-y-1 border border-slate-800">
                <div className="text-slate-400">// Python ctypes 호출 예시:</div>
                <div>from ctypes import cdll, c_uint32, c_void_p, byref</div>
                <div>dll = cdll.LoadLibrary('./DiskSentinelNativeCore.dll')</div>
                <div>sector_size = c_uint32(0)</div>
                <div>h_drive = dll.DS_OpenDriveDirect(0, byref(sector_size))</div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
            <span>Author: {PROJECT_INFO.developer.name}</span>
            <span>•</span>
            <span>License: Apache-2.0</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded transition-colors"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
