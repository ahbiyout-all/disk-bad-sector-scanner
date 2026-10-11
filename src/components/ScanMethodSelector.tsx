/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Storage Media Tailored Inspection Method Selector Component
 */

import React, { useState } from 'react';
import { DiskDrive, SectorBlock, SpecializedScanMethodId } from '../types';
import { 
  SCAN_METHOD_DEFINITIONS, 
  getAvailableMethodsForDrive, 
  getDriveStorageCategory 
} from '../utils/scanProfiles';
import { SmartRemapModal } from './SmartRemapModal';
import { 
  Layers, 
  Cpu, 
  HardDrive, 
  Usb, 
  Zap, 
  Check, 
  Info, 
  ShieldCheck, 
  ShieldAlert,
  Wrench,
  ChevronDown, 
  Sliders, 
  Activity, 
  ArrowRight,
  Gauge,
  Sparkles,
  FolderOpen
} from 'lucide-react';

interface ScanMethodSelectorProps {
  activeDrive: DiskDrive;
  activeMethodId: SpecializedScanMethodId;
  onSelectMethod: (methodId: SpecializedScanMethodId) => void;
  isScanning: boolean;
  blocks?: SectorBlock[];
  onRepairSectors?: (driveId: string, repairedBlockIds: number[]) => void;
  onOpenFilePicker?: () => void;
}

export const ScanMethodSelector: React.FC<ScanMethodSelectorProps> = ({
  activeDrive,
  activeMethodId,
  onSelectMethod,
  isScanning,
  blocks = [],
  onRepairSectors,
  onOpenFilePicker
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRemapModal, setShowRemapModal] = useState(false);

  const availableMethods = getAvailableMethodsForDrive(activeDrive);
  const currentMethod = SCAN_METHOD_DEFINITIONS[activeMethodId] || availableMethods[0];
  const storageCategory = getDriveStorageCategory(activeDrive);

  const badBlocksCount = blocks.filter(b => b.status === 'bad').length;

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'NVME_SSD':
        return <Zap className="w-4 h-4 text-violet-500" />;
      case 'SATA_SSD':
        return <Cpu className="w-4 h-4 text-teal-500" />;
      case 'HDD':
        return <HardDrive className="w-4 h-4 text-sky-500" />;
      case 'USB_STORAGE':
      default:
        return <Usb className="w-4 h-4 text-cyan-500" />;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'NVME_SSD':
        return 'NVMe SSD 전용';
      case 'SATA_SSD':
        return 'SATA SSD 전용';
      case 'HDD':
        return '기계식 HDD 전용';
      case 'USB_STORAGE':
      default:
        return 'USB/외장 드라이브 전용';
    }
  };

  return (
    <div className="relative">
      {/* Main Bar / Pill Display */}
      <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 sm:p-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex-shrink-0">
            {getCategoryIcon(storageCategory)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {getCategoryLabel(storageCategory)} 맞춤 검사
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                블록 크기: {currentMethod.blockSizeKb}KB · 기준 지연: {currentMethod.typicalBlockLatency}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate mt-0.5">
              <span>{currentMethod.nameKo}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full md:w-auto flex items-center justify-end gap-1.5 sm:gap-2 flex-wrap pt-1 sm:pt-0 border-t border-slate-200/60 dark:border-slate-800/60 md:border-t-0">
          {/* Real File Direct Open Button */}
          {onOpenFilePicker && (
            <button
              onClick={onOpenFilePicker}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer min-h-[34px]"
              title="실제 파일(.img, .iso, .vhd, 모든 파일)을 선택하여 바이트 단위 직접 검사를 수행합니다."
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">실제 파일 열기</span>
              <span className="sm:hidden">파일</span>
            </button>
          )}

          {/* S.M.A.R.T. Sector Remapping & Zero-Fill Bad Sector Repair Engine Button */}
          <button
            onClick={() => setShowRemapModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded text-xs font-bold bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-xs transition-all cursor-pointer relative group min-h-[34px]"
            title="S.M.A.R.T. 논리 배드섹터 제로필 수복 & 예비 트랙 섹터 재할당(Remap) 실행"
          >
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">S.M.A.R.T. 수복</span>
            {badBlocksCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-600 font-extrabold text-[10px] animate-pulse shrink-0">
                {badBlocksCount} BAD
              </span>
            )}
          </button>

          <button
            onClick={() => setShowDetailModal(true)}
            className="inline-flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs min-h-[34px]"
            title="맞춤 알고리즘 동작 원리 확인"
          >
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="hidden sm:inline">알고리즘 상세</span>
            <span className="sm:hidden">상세</span>
          </button>

          <div className="relative flex-1 sm:flex-none">
            <button
              disabled={isScanning}
              onClick={() => setIsOpen(!isOpen)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-xs transition-colors cursor-pointer min-h-[34px]"
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">방식 변경</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50 p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    {activeDrive.name} 지원 검사 프로파일
                  </div>

                  {availableMethods.map((m) => {
                    const isSelected = m.id === activeMethodId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelectMethod(m.id);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-md transition-colors border cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700/60'
                            : 'bg-slate-50/50 dark:bg-slate-950/40 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5 mb-1">
                          <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {getCategoryIcon(m.category)}
                            <span>{m.nameKo}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mb-1.5">
                          {m.description}
                        </p>

                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                            블록 {m.blockSizeKb}KB
                          </span>
                          <span>기준: {m.typicalBlockLatency}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Algorithm Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-5 sm:p-6 text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold">
                  저장장치별 맞춤형 배드섹터 검사 알고리즘 명세
                </h3>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs sm:text-sm">
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  현재 선택된 프로파일: {currentMethod.nameKo}
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  {currentMethod.description}
                </p>
              </div>

              {/* Grid of parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">대상 하드웨어</div>
                  <div className="font-semibold text-xs mt-0.5">{currentMethod.targetMedia}</div>
                </div>
                <div className="p-2.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">I/O 블록 크기 정렬</div>
                  <div className="font-semibold text-xs mt-0.5 font-mono">{currentMethod.blockSizeKb} KB Direct Buffer</div>
                </div>
                <div className="p-2.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">지연 판정 기준 (Slow / Crit)</div>
                  <div className="font-semibold text-xs mt-0.5 font-mono text-amber-500">
                    &gt;{currentMethod.slowThresholdMs}ms / &gt;{currentMethod.criticalThresholdMs}ms
                  </div>
                </div>
              </div>

              {/* Core Features list */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">
                  주요 특화 진단 기능
                </h4>
                <ul className="space-y-1.5">
                  {currentMethod.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Overview of all 4 media types */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">
                  전체 매체별(HDD / SATA / NVMe / USB) 최적화 비교
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2">
                    <HardDrive className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-sky-400">일반 HDD</strong>: 회전 플래터 외주/내주 ZBR 속도 감속 곡선 분석, 버터플라이 시크 모터 스트레스 검사, S.M.A.R.T. 05h/C5h/C6h 치환/보류 섹터 물리적 매핑.
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2">
                    <Cpu className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-teal-400">SATA SSD</strong>: 128KB 낸드 Erase Block 경계 정렬로 FTL 가비지 컬렉션 간섭 배제, SATA PHY CRC 케이블 에러(ID 199) 분리 판별 및 장기 데이터 전하 보존력(Retention) 측정.
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-violet-400">NVMe SSD</strong>: 64-Queue 병렬 다이렉트 I/O(서브 밀리초 계측), NVMe Log 02h(Available Spare, Percentage Used, Media Errors) 네이티브 연동 및 70°C+ 써멀 스로틀링 자동 보정.
                    </div>
                  </div>

                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2">
                    <Usb className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-cyan-400">USB & 외장 기기</strong>: USB 2.0 BOT(480Mbps) 대역폭 병목 지터 보정(오탐지 방지), UASP 10Gbps 고속 스트리밍, FAT32/exFAT MBR/FAT 테이블 선제 검사, 전력 강하 회복 프로토콜.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                >
                  확인 (Close)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* S.M.A.R.T. Sector Remapping & Zero-Fill Repair Modal */}
      <SmartRemapModal
        isOpen={showRemapModal}
        onClose={() => setShowRemapModal(false)}
        activeDrive={activeDrive}
        blocks={blocks}
        onRepairSectors={(driveId, repairedBlockIds) => {
          if (onRepairSectors) {
            onRepairSectors(driveId, repairedBlockIds);
          }
        }}
      />
    </div>
  );
};
