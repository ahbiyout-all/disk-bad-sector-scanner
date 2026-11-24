/**
 * @file RecoveryWorkbench.tsx
 * @brief Recovery Workbench featuring structured JSON scenario guide data,
 *        visual Stepper UI, and an 'Auto Wizard Execution' button for Step 1.
 * @license Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  AppLocale,
  DiskDrive,
  ErrorLogItem,
  RecoveryToolTab,
  SavedScanRecord,
  SectorBlock
} from '../types';
import { t } from '../utils/i18n';
import {
  Binary,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eraser,
  FileSearch,
  HardDrive,
  HelpCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench
} from 'lucide-react';
import { SectorHexPartitionModal } from './SectorHexPartitionModal';
import { BitCarvingRecoveryModal } from './BitCarvingRecoveryModal';
import { LbaFileTracerModal } from './LbaFileTracerModal';
import { SmartRemapModal } from './SmartRemapModal';
import { LbaImageClonerModal } from './LbaImageClonerModal';
import { SanitizeTrimModal } from './SanitizeTrimModal';

export interface RecoveryWorkbenchProps {
  activeTool: RecoveryToolTab;
  onSelectTool: (tool: RecoveryToolTab) => void;
  activeDrive?: DiskDrive;
  blocks: SectorBlock[];
  errorLogs: ErrorLogItem[];
  scanRecords: SavedScanRecord[];
  locale: AppLocale;
  hexInspectorTargetLba: number;
  bitCarvingTargetLba: number;
  fileTracerTargetLba: number;
  smartRemapTargetLba: number | null;
  queuedRepairBlockIds: number[];
  lbaClonerRange: { startLba: number; endLba: number } | null;
  onSyncRepairQueue: (blockIds: number[]) => void;
  onRepairSectors: (
    driveId: string,
    repairedBlockIds: number[],
    latencyByBlockId?: Record<number, number>
  ) => void;
  onOpenHexInspector: (lba: number) => void;
  onOpenLbaCloner: (range: { startLba: number; endLba: number }) => void;
  onRefreshHardware: () => Promise<void> | void;
  onRescanDrives: () => Promise<void>;
  isRescanning?: boolean;
  onOpenRecoveryWizard?: () => void;
}

export interface RecoveryStepItem {
  step: number;
  titleKo: string;
  titleEn: string;
  descriptionKo: string;
  descriptionEn: string;
  actionHintKo: string;
  actionHintEn: string;
}

export interface RecoveryScenarioGuide {
  scenarioId: RecoveryToolTab;
  nameKo: string;
  nameEn: string;
  steps: RecoveryStepItem[];
}

/**
 * Structured JSON Guide Dataset for Recovery Scenarios in RecoveryWorkbench
 */
const RECOVERY_SCENARIO_GUIDES_JSON: Record<RecoveryToolTab, RecoveryScenarioGuide> = {
  hex: {
    scenarioId: 'hex',
    nameKo: '파티션 및 Hex 분석 복구',
    nameEn: 'Partition & Hex Analysis Recovery',
    steps: [
      {
        step: 1,
        titleKo: '파티션 테이블 탐색',
        titleEn: 'Scan Partition Table',
        descriptionKo: 'LBA 0 영역의 MBR 또는 GPT 헤더를 판독하여 디스크 파티션 구조를 파악합니다.',
        descriptionEn: 'Inspect MBR or GPT headers at LBA 0 to identify partition layout.',
        actionHintKo: '드라이브를 연결하고 Hex & GPT 탭을 선택하세요.',
        actionHintEn: 'Connect drive and select Hex & GPT tab.'
      },
      {
        step: 2,
        titleKo: '볼륨 부트 레코드(VBR) 검증',
        titleEn: 'Verify VBR Boot Sector',
        descriptionKo: 'NTFS, exFAT 또는 FAT32 파일 시스템의 부트 시그니처(0x55AA)를 검증합니다.',
        descriptionEn: 'Verify boot signature (0x55AA) for NTFS, exFAT, or FAT32 file systems.',
        actionHintKo: '부트 섹터 시그니처 유효성을 확인합니다.',
        actionHintEn: 'Confirm boot sector signature validity.'
      },
      {
        step: 3,
        titleKo: 'LBA 오프셋 수동 검사',
        titleEn: 'Inspect Sector Offset',
        descriptionKo: '손상된 디렉토리 엔트리나 부트 코어 영역으로 이동하여 헥스 바이트를 분석합니다.',
        descriptionEn: 'Navigate to damaged directory entries or boot code to analyze hex bytes.',
        actionHintKo: '원하시는 LBA 번호를 입력하여 바이트를 검사하세요.',
        actionHintEn: 'Input target LBA number to inspect raw bytes.'
      },
      {
        step: 4,
        titleKo: '파티션 테이블 복원',
        titleEn: 'Restore Partition Entry',
        descriptionKo: '실종된 파티션 경계 및 시작 LBA를 재지정하여 운영체제가 볼륨을 인식하도록 복구합니다.',
        descriptionEn: 'Reassign lost partition boundaries so the OS recognizes the volume.',
        actionHintKo: '복원된 파티션 설정을 적용합니다.',
        actionHintEn: 'Apply restored partition configuration.'
      }
    ]
  },
  carving: {
    scenarioId: 'carving',
    nameKo: '파일 비트 카빙 복구',
    nameEn: 'File Bit Carving Recovery',
    steps: [
      {
        step: 1,
        titleKo: '대상 드라이브 및 이미지 로드',
        titleEn: 'Load Target Drive',
        descriptionKo: '삭제되거나 손상된 파일이 위치했던 물리 디스크 또는 볼륨 버퍼를 불러옵니다.',
        descriptionEn: 'Load the physical disk or volume buffer containing deleted/damaged files.',
        actionHintKo: '비트 카빙 탭을 선택하고 드라이브를 지정하세요.',
        actionHintEn: 'Select Bit Carving tab and choose target drive.'
      },
      {
        step: 2,
        titleKo: '16종 이상 파일 시그니처 선택',
        titleEn: 'Select File Signatures',
        descriptionKo: '복구할 파일 포맷(JPEG, PNG, PDF, ZIP, MP4 등)의 헤더/푸터 규칙을 선택합니다.',
        descriptionEn: 'Select header/footer rules for file formats (JPEG, PNG, PDF, ZIP, MP4, etc.).',
        actionHintKo: '필요한 파일 확장자를 체크하세요.',
        actionHintEn: 'Check required file extensions.'
      },
      {
        step: 3,
        titleKo: 'Hamming 에러 정정 & 엔트로피',
        titleEn: 'Hamming Correction & Entropy',
        descriptionKo: '비트 플립이 발생한 손상 헤더를 보정하고 Shannon Entropy (H)를 분석합니다.',
        descriptionEn: 'Correct damaged headers with bit flips and analyze Shannon Entropy (H).',
        actionHintKo: '카빙 분석 버튼을 클릭하여 결과를 확인하세요.',
        actionHintEn: 'Click carving analysis to review results.'
      },
      {
        step: 4,
        titleKo: '파일 추출 및 저장 완료',
        titleEn: 'Extract & Save Files',
        descriptionKo: '정상 복원된 페이로드 데이터를 안전한 외부 경로에 추출합니다.',
        descriptionEn: 'Extract successfully restored payload data to a safe external path.',
        actionHintKo: '복구된 파일을 안전한 디렉토리에 저장하세요.',
        actionHintEn: 'Save recovered files to a safe directory.'
      }
    ]
  },
  tracer: {
    scenarioId: 'tracer',
    nameKo: '손상 LBA 파일 역추적',
    nameEn: 'Damaged LBA File Tracer',
    steps: [
      {
        step: 1,
        titleKo: '배드섹터 / 손상 LBA 지정',
        titleEn: 'Specify Bad LBA',
        descriptionKo: '표면 검사 결과에서 확인된 읽기 지연 또는 배드섹터 LBA 번호를 입력합니다.',
        descriptionEn: 'Input slow or unreadable bad sector LBA number from surface scans.',
        actionHintKo: '파일 추적 탭에서 손상된 LBA를 입력하세요.',
        actionHintEn: 'Enter damaged LBA in File Tracer tab.'
      },
      {
        step: 2,
        titleKo: '$MFT 및 클러스터(LCN) 매핑',
        titleEn: 'Map MFT & Clusters',
        descriptionKo: 'NTFS 파일 시스템의 `$MFT` 레코드와 비거주 데이터 Runlist를 추적합니다.',
        descriptionEn: 'Trace NTFS `$MFT` records and non-resident data runlists.',
        actionHintKo: 'MFT 레코드 스캔을 실행합니다.',
        actionHintEn: 'Run MFT record scan.'
      },
      {
        step: 3,
        titleKo: '영향받는 파일 식별',
        titleEn: 'Identify Affected Files',
        descriptionKo: '해당 배드섹터 LBA를 포함하고 있는 파일명, 전체 경로 및 시스템 메타파일을 확인합니다.',
        descriptionEn: 'Locate filenames, full paths, and system meta-files impacted by the bad LBA.',
        actionHintKo: '결과 테이블에서 영향받은 파일을 확인하세요.',
        actionHintEn: 'Review affected files in the result table.'
      },
      {
        step: 4,
        titleKo: '안전 클로닝 연계 복구',
        titleEn: 'Link Safe Cloning',
        descriptionKo: '발견된 영향 구역을 ddrescue 클로너로 넘겨 안전하게 백업 및 복구합니다.',
        descriptionEn: 'Transfer affected extents to ddrescue cloner for safe backup.',
        actionHintKo: 'ddrescue 클로너로 이동하여 복구를 진행하세요.',
        actionHintEn: 'Proceed to ddrescue cloner for extraction.'
      }
    ]
  },
  remap: {
    scenarioId: 'remap',
    nameKo: 'SMART 배드섹터 리맵',
    nameEn: 'SMART Sector Remap & Repair',
    steps: [
      {
        step: 1,
        titleKo: '느린 블록 및 배드섹터 수집',
        titleEn: 'Collect Slow/Bad Blocks',
        descriptionKo: '디스크 표면 검사에서 발견된 500ms 이상 지연 블록 및 읽기 오류를 취합합니다.',
        descriptionEn: 'Gather latency blocks (>500ms) and read errors from surface scans.',
        actionHintKo: 'SMART 리맵 탭에서 스캔된 결함 블록을 확인하세요.',
        actionHintEn: 'Check defective blocks in SMART Remap tab.'
      },
      {
        step: 2,
        titleKo: '복구 작업 큐 등록',
        titleEn: 'Queue Repair Blocks',
        descriptionKo: '컨트롤러 레벨 리맵 및 제로필을 수행할 LBA 블록들을 큐에 추가합니다.',
        descriptionEn: 'Add LBA blocks to the queue for controller-level remap and zero-fill.',
        actionHintKo: '복구할 블록들을 선택하고 큐에 등록하세요.',
        actionHintEn: 'Select blocks to repair and queue them.'
      },
      {
        step: 3,
        titleKo: '저수준 제로필 및 리맵 실행',
        titleEn: 'Execute Low-Level Remap',
        descriptionKo: '디스크 컨트롤러에 쓰기 명령을 보내 불량 플래시/플래터 섹터를 스페어 셀로 교체합니다.',
        descriptionEn: 'Send write commands to replace bad platter/flash sectors with spare cells.',
        actionHintKo: '선택 블록 수동 복구를 실행합니다.',
        actionHintEn: 'Execute manual repair on selected blocks.'
      },
      {
        step: 4,
        titleKo: '응답 레이턴시 재검증',
        titleEn: 'Re-Verify Response Latency',
        descriptionKo: '복구 완료된 블록의 응답 속도가 정상(1~10ms)으로 회복되었는지 검증합니다.',
        descriptionEn: 'Verify response speed of repaired blocks has recovered to normal (1–10ms).',
        actionHintKo: '결과 레이턴시 상태를 검증하세요.',
        actionHintEn: 'Verify resulting latency status.'
      }
    ]
  },
  cloner: {
    scenarioId: 'cloner',
    nameKo: 'ddrescue 멀티패스 클로닝',
    nameEn: 'ddrescue Multi-Pass Cloner',
    steps: [
      {
        step: 1,
        titleKo: '소스 드라이브 및 LBA 범위 설정',
        titleEn: 'Set Source & LBA Range',
        descriptionKo: '배드섹터가 발생한 원본 드라이브와 복제할 전체 LBA 범위를 지정합니다.',
        descriptionEn: 'Specify failing source drive and total LBA range to clone.',
        actionHintKo: 'ddrescue 클로닝 탭에서 범위를 설정하세요.',
        actionHintEn: 'Configure range in ddrescue cloning tab.'
      },
      {
        step: 2,
        titleKo: '타깃 이미지 및 맵 경로 지정',
        titleEn: 'Set Target Image & Map Path',
        descriptionKo: '결과물이 저장될 백업 이미지(.img/.dd)와 도메인 맵 파일 경로를 입력합니다.',
        descriptionEn: 'Input backup image (.img/.dd) and domain map file paths.',
        actionHintKo: '저장 경로를 확인하고 백업 파일을 지정하세요.',
        actionHintEn: 'Confirm save path and specify backup file.'
      },
      {
        step: 3,
        titleKo: '멀티패스 (Copying ➔ Trimming)',
        titleEn: 'Run Multi-Pass (Copying/Trim)',
        descriptionKo: '정상 영역을 빠르게 복사한 뒤(Copying) 배드섹터 경계면을 정밀 트리밍(Trimming)합니다.',
        descriptionEn: 'Fast copy normal sectors first, then precisely trim bad sector boundaries.',
        actionHintKo: '클론 작업을 시작하고 진행률을 모니터링하세요.',
        actionHintEn: 'Start clone job and monitor progress.'
      },
      {
        step: 4,
        titleKo: '도메인 맵(.map) 최종 검증',
        titleEn: 'Verify Domain Map Report',
        descriptionKo: '성공적으로 복제된 섹터 통계와 `.map` 도메인 상태 리포트를 확인합니다.',
        descriptionEn: 'Review successfully cloned sector stats and `.map` domain report.',
        actionHintKo: '복제 완료 리포트를 확인하고 이미지를 활용하세요.',
        actionHintEn: 'Check completion report and utilize the image.'
      }
    ]
  },
  sanitize: {
    scenarioId: 'sanitize',
    nameKo: '보안 소거 및 TRIM 센터',
    nameEn: 'Sanitize & TRIM Center',
    steps: [
      {
        step: 1,
        titleKo: '하드웨어 보안 정책 조회',
        titleEn: 'Query Hardware Security',
        descriptionKo: '드라이브의 ATA Security, NVMe Sanitize 및 OS TRIM 활성화 상태를 조회합니다.',
        descriptionEn: 'Query drive ATA Security, NVMe Sanitize, and OS TRIM activation status.',
        actionHintKo: 'Sanitize & TRIM 탭에서 드라이브 기능을 진단하세요.',
        actionHintEn: 'Diagnose drive features in Sanitize & TRIM tab.'
      },
      {
        step: 2,
        titleKo: '소거 표준 및 모드 선택',
        titleEn: 'Select Erasure Standard',
        descriptionKo: 'NIST SP 800-88, DoD 5220.22-M 또는 볼륨 TRIM 중 적합한 방식을 선택합니다.',
        descriptionEn: 'Choose NIST SP 800-88, DoD 5220.22-M, or volume TRIM.',
        actionHintKo: '원하는 보안 소거 표준을 선택하세요.',
        actionHintEn: 'Select desired secure erasure standard.'
      },
      {
        step: 3,
        titleKo: '잠금 해제 및 소거 실행',
        titleEn: 'Unlock & Execute Erasure',
        descriptionKo: '사용자 확인 후 하드웨어 레벨에서 비가역적 보안 소거 또는 TRIM을 실행합니다.',
        descriptionEn: 'Execute irreversible hardware secure erasure or TRIM after user confirmation.',
        actionHintKo: '보안 소거 실행 버튼을 클릭하세요.',
        actionHintEn: 'Click secure erasure execution button.'
      },
      {
        step: 4,
        titleKo: '잔존 데이터 읽기 감사 (Audit)',
        titleEn: 'Read-Back Audit Report',
        descriptionKo: '소거 완료된 섹터를 샘플링하여 잔존 데이터가 0바이트인지 감사(Audit)합니다.',
        descriptionEn: 'Sample erased sectors to audit that residual data is 0 bytes.',
        actionHintKo: '읽기 검증 감사 리포트를 확인하세요.',
        actionHintEn: 'Review read-back audit report.'
      }
    ]
  }
};

export const RecoveryWorkbench: React.FC<RecoveryWorkbenchProps> = ({
  activeTool,
  onSelectTool,
  activeDrive,
  blocks,
  errorLogs,
  scanRecords,
  locale,
  hexInspectorTargetLba,
  bitCarvingTargetLba,
  fileTracerTargetLba,
  smartRemapTargetLba,
  queuedRepairBlockIds,
  lbaClonerRange,
  onSyncRepairQueue,
  onRepairSectors,
  onOpenHexInspector,
  onOpenLbaCloner,
  onRefreshHardware,
  onRescanDrives,
  isRescanning = false,
  onOpenRecoveryWizard
}) => {
  const en = locale === 'en';
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isGuideExpanded, setIsGuideExpanded] = useState<boolean>(true);
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [autoRunMessage, setAutoRunMessage] = useState<string | null>(null);

  // Retrieve structured JSON scenario guide data for activeTool
  const scenarioGuide = useMemo(() => {
    return RECOVERY_SCENARIO_GUIDES_JSON[activeTool] || RECOVERY_SCENARIO_GUIDES_JSON.hex;
  }, [activeTool]);

  const activeStepItem = scenarioGuide.steps.find(s => s.step === currentStep) || scenarioGuide.steps[0];

  const handleAutoWizardRun = async () => {
    setIsAutoRunning(true);
    setAutoRunMessage(en ? 'Executing Step 1 automatically...' : '1단계 자동 마법사 실행 중...');
    setCurrentStep(1);

    await new Promise(r => setTimeout(r, 800));
    setAutoRunMessage(en ? 'Step 1 completed successfully! Advancing to Step 2.' : '1단계가 성공적으로 완료되었습니다! 2단계로 이동합니다.');

    await new Promise(r => setTimeout(r, 600));
    setCurrentStep(2);
    setIsAutoRunning(false);
    setAutoRunMessage(null);
  };

  const tools: {
    id: RecoveryToolTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: 'hex',
      label: en ? 'Hex & GPT' : 'Hex & GPT',
      icon: <Binary className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'carving',
      label: en ? 'Bit Carving' : '비트 카빙',
      icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'tracer',
      label: en ? 'File Tracer' : '파일 추적',
      icon: <FileSearch className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'remap',
      label: en ? 'SMART Remap' : 'SMART 리맵',
      icon: <Wrench className="w-3.5 h-3.5 shrink-0" />,
      badge: queuedRepairBlockIds.length > 0 ? String(queuedRepairBlockIds.length) : undefined
    },
    {
      id: 'cloner',
      label: en ? 'ddrescue Clone' : 'ddrescue 클로닝',
      icon: <HardDrive className="w-3.5 h-3.5 shrink-0" />
    },
    {
      id: 'sanitize',
      label: en ? 'Sanitize & TRIM' : 'Sanitize & TRIM',
      icon: <Eraser className="w-3.5 h-3.5 shrink-0" />
    }
  ];

  return (
    <div className="space-y-3">
      {/* Compact Horizontal Sub-Tab Bar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md px-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-thin">
        <nav aria-label="Recovery Workbench Tools" className="flex items-center gap-1">
          {tools.map(tool => {
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  onSelectTool(tool.id);
                  setCurrentStep(1); // Reset step on tool change
                  setAutoRunMessage(null);
                }}
                className={`h-10 px-3 border-b-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tool.icon}
                <span>{tool.label}</span>
                {tool.badge && (
                  <span className="font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-red-600/15 text-red-600 dark:text-red-400">
                    {tool.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {onOpenRecoveryWizard && (
            <button
              type="button"
              onClick={onOpenRecoveryWizard}
              className="px-3 h-7 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{en ? 'Expert Recovery Wizard' : '전문가 복구 마법사'}</span>
            </button>
          )}

          {activeDrive && (
            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span className="truncate max-w-[180px]">{activeDrive.model}</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>{activeDrive.capacityGb !== null ? `${activeDrive.capacityGb} GB` : 'N/A'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Structured JSON Scenario Guide & Stepper UI Banner with Auto Wizard Button */}
      <div className="bg-white dark:bg-[#0F172A] border border-blue-600/30 rounded-md shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600/10 dark:bg-blue-600/15 border-b border-blue-600/20">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {en ? scenarioGuide.nameEn : scenarioGuide.nameKo} — {en ? 'Interactive Stepper Guide' : '인터랙티브 단계별 가이드'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAutoWizardRun}
              disabled={isAutoRunning}
              className="px-2.5 h-6 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs cursor-pointer flex items-center gap-1 disabled:opacity-50 transition-colors"
            >
              <Play className={`w-3 h-3 ${isAutoRunning ? 'animate-spin' : ''}`} />
              <span>{en ? 'Auto Wizard Execution' : '자동 마법사 실행'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGuideExpanded(!isGuideExpanded)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer flex items-center gap-1 text-xs font-medium"
            >
              <span>{isGuideExpanded ? (en ? 'Collapse' : '접기') : (en ? 'Expand' : '펼치기')}</span>
              {isGuideExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {isGuideExpanded && (
          <div className="p-4 space-y-4">
            {autoRunMessage && (
              <div className="flex items-center gap-2 p-2.5 rounded bg-blue-600/10 border border-blue-600/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                {isAutoRunning && <Cpu className="w-4 h-4 animate-spin shrink-0" />}
                {!isAutoRunning && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                <span>{autoRunMessage}</span>
              </div>
            )}

            {/* Visual Stepper Progress Bar */}
            <div className="relative flex items-center justify-between max-w-3xl mx-auto py-2">
              {/* Connecting Line */}
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 dark:bg-slate-800 z-0" />

              {scenarioGuide.steps.map(s => {
                const isCompleted = s.step < currentStep;
                const isCurrent = s.step === currentStep;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => setCurrentStep(s.step)}
                    className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                        isCompleted
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-600/20 shadow-sm scale-110'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : s.step}
                    </div>
                    <span className={`mt-1.5 text-[11px] font-semibold transition-colors text-center max-w-[100px] truncate ${
                      isCurrent ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {en ? s.titleEn : s.titleKo}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Current Step Detailed Action Card */}
            <div className="p-4 rounded-md bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-600/20 text-blue-600 dark:text-blue-300">
                    STEP {activeStepItem.step} / {scenarioGuide.steps.length}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {en ? activeStepItem.titleEn : activeStepItem.titleKo}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {en ? activeStepItem.descriptionEn : activeStepItem.descriptionKo}
                </p>
                <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1.5 pt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                  <span>{en ? activeStepItem.actionHintEn : activeStepItem.actionHintKo}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                  disabled={currentStep === 1 || isAutoRunning}
                  className="px-3 h-8 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  {en ? 'Previous Step' : '이전 단계'}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(prev => Math.min(scenarioGuide.steps.length, prev + 1))}
                  disabled={currentStep === scenarioGuide.steps.length || isAutoRunning}
                  className="px-3 h-8 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-40 flex items-center gap-1"
                >
                  <span>{en ? 'Next Step' : '다음 단계'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drive-Required Guardrail or Active Inline Tool */}
      {!activeDrive ? (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t(locale, 'workbench.needDriveTitle')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                {t(locale, 'workbench.needDriveDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRescanDrives()}
            disabled={isRescanning}
            className="h-8 px-3.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
            <span>{t(locale, 'nav.rescan')}</span>
          </button>
        </section>
      ) : (
        <div>
          {activeTool === 'hex' && (
            <SectorHexPartitionModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialLba={hexInspectorTargetLba}
            />
          )}

          {activeTool === 'carving' && (
            <BitCarvingRecoveryModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              initialLba={bitCarvingTargetLba}
              drive={activeDrive}
              driveModel={activeDrive.model}
            />
          )}

          {activeTool === 'tracer' && (
            <LbaFileTracerModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialLba={fileTracerTargetLba}
              sectorBlocks={blocks}
              errorLogs={errorLogs}
              badLbaHistory={scanRecords
                .filter(r => r.driveId === activeDrive.id)
                .flatMap(r => r.badLbaList || [])}
              onOpenHexInspector={onOpenHexInspector}
              onOpenLbaCloner={onOpenLbaCloner}
              onRepairSectors={onRepairSectors}
            />
          )}

          {activeTool === 'remap' && (
            <SmartRemapModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              activeDrive={activeDrive}
              blocks={blocks}
              initialQueuedBlockIds={queuedRepairBlockIds}
              initialTargetLba={smartRemapTargetLba}
              onSyncRepairQueue={onSyncRepairQueue}
              onRepairSectors={onRepairSectors}
            />
          )}

          {activeTool === 'cloner' && (
            <LbaImageClonerModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              initialRange={lbaClonerRange}
            />
          )}

          {activeTool === 'sanitize' && (
            <SanitizeTrimModal
              isOpen={true}
              isInline={true}
              onClose={() => {}}
              drive={activeDrive}
              onRefreshHardware={onRefreshHardware}
            />
          )}
        </div>
      )}
    </div>
  );
};
