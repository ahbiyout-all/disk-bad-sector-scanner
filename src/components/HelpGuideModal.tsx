import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  BookOpen, 
  Layers, 
  AlertTriangle, 
  ShieldCheck, 
  Binary, 
  Keyboard, 
  ExternalLink, 
  Cpu, 
  Sparkles, 
  Terminal, 
  Info,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { PROJECT_INFO } from '../config/projectInfo';

export interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVendorDiagnostics?: () => void;
  onOpenSupportedCatalog?: () => void;
  onOpenDllDocs?: () => void;
  onOpenUpdateModal?: () => void;
  onOpenAboutModal?: () => void;
}

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenVendorDiagnostics,
  onOpenSupportedCatalog,
  onOpenDllDocs,
  onOpenUpdateModal,
  onOpenAboutModal
}) => {
  const [activeGuideTab, setActiveGuideTab] = useState<'methods' | 'sectors' | 'repair' | 'shortcuts'>('methods');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>디스크 진단 및 복구 도움말</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
                  USER GUIDE
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                표면 검사 알고리즘, 섹터 지연 기준, 배드섹터 수복 원리 및 단축키 안내
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
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 bg-slate-50/50 dark:bg-slate-950/30 gap-4 text-xs font-bold overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveGuideTab('methods')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeGuideTab === 'methods'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>검사 방식 비교</span>
          </button>
          <button
            onClick={() => setActiveGuideTab('sectors')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeGuideTab === 'sectors'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>섹터 상태 & 지연 기준</span>
          </button>
          <button
            onClick={() => setActiveGuideTab('repair')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeGuideTab === 'repair'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Binary className="w-3.5 h-3.5" />
            <span>배드섹터 수복 원리</span>
          </button>
          <button
            onClick={() => setActiveGuideTab('shortcuts')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeGuideTab === 'shortcuts'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>단축키 & 제어 팁</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">

          {/* TAB 1: Inspection Methods Guide */}
          {activeGuideTab === 'methods' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20 space-y-1.5">
                <h3 className="font-bold text-sm text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>스토리지 유형별 권장 검사 알고리즘</span>
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  스토리지 미디어의 물리적 구조(HDD의 플래터 헤드, SSD의 낸드 플래시 블록 및 FTL 계층)에 맞는 최적의 검사 알고리즘을 선택해야 정확한 결함 측정이 가능합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>1. 순차 전수 검사 (Sequential)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600">HDD / SSD 권장</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    LBA 0번부터 마지막 섹터까지 물리적 순서대로 블록을 순회하며 읽기 타임아웃과 전송 대역폭을 측정합니다. 전 영역에 걸친 배드섹터 전수 검출에 적합합니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>2. 빠른 간이 검사 (Quick Sample)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600">초고속 (수초 내)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    전체 블록 중 균일 간격의 샘플 섹터만을 고속 검사하여 드라이브의 전반적인 상태를 단시간에 진단합니다. 대용량 드라이브의 신속 점검에 유용합니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>3. 버터플라이 지터 탐색 (Butterfly)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-600">헤드 액추에이터</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    디스크의 안쪽 트랙과 바깥쪽 트랙을 교차 이동하며 헤드 시크 타임(Seek Time)과 액추에이터 모터의 물리적 흔들림(Jitter)을 집중 점검합니다.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                    <span>4. 실물 파일 슬라이스 (File Stream)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600">실제 파일 I/O</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    사용자가 지정한 실제 로컬 파일(.img, .iso, .vhd 또는 일반 파일)을 물리 청크 단위로 분할하여 브라우저 File API로 실제 읽기 무결성을 실시간 검증합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Sector Status & Latency Thresholds */}
          {activeGuideTab === 'sectors' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>블록 그리드 색상 및 레이턴시(응답시간) 판정 기준</span>
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  섹터 읽기 요청 후 응답이 반환되기까지의 지연 시간(ms)을 기준으로 블록의 물리적 건전성을 5단계로 분류합니다.
                </p>
              </div>

              <div className="space-y-2">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-emerald-500 shrink-0 shadow-xs" />
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>정상 섹터 (Good)</span>
                      <span className="font-mono text-emerald-600 font-bold">&lt; 3.0ms</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      정상 속도로 I/O가 처리되며 플래터나 낸드 셀에 아무런 물리적 손상이 없습니다.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-lime-500 shrink-0 shadow-xs" />
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>양호 섹터 (Normal)</span>
                      <span className="font-mono text-lime-600 font-bold">3.0ms ~ 15.0ms</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      컨트롤러 캐시 미스 또는 약간의 대기 지연이 있으나 완벽히 정상 작동하는 상태입니다.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-amber-500 shrink-0 shadow-xs" />
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>응답 지연 주의 (Slow)</span>
                      <span className="font-mono text-amber-600 font-bold">15.0ms ~ 50.0ms</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      내부 ECC 재시도가 발생하고 있는 구간으로 방치 시 향후 배드섹터로 전이될 가능성이 높습니다.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-orange-500 shrink-0 shadow-xs" />
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>치명적 지연 (Critical Latency)</span>
                      <span className="font-mono text-orange-600 font-bold">50.0ms ~ 250.0ms</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      하드웨어 레벨의 심각한 재시도 지연이 발생 중이며 운영체제 프리징의 원인이 됩니다.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-50/40 dark:bg-red-950/20 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-red-600 shrink-0 animate-pulse shadow-xs" />
                  <div className="flex-1">
                    <div className="font-bold text-red-600 dark:text-red-400 flex items-center justify-between">
                      <span>배드섹터 (Bad Sector / Uncorrectable)</span>
                      <span className="font-mono text-red-600 font-bold">I/O Timeout / CRC / UNC</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      데이터를 읽을 수 없거나 체크섬 복구가 불가능한 영구 결함 섹터입니다. 즉각적인 백업 및 수복 조치가 요구됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Bad Sector Repair Principles */}
          {activeGuideTab === 'repair' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-1.5">
                <h3 className="font-bold text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <Binary className="w-4 h-4" />
                  <span>논리 배드섹터 vs 물리 배드섹터 및 수복 기법</span>
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  배드섹터는 원인에 따라 소프트웨어적(논리적) 오류와 하드웨어적(물리적) 결함으로 나뉘며 적절한 해결 절차가 다릅니다.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>1. 논리 배드섹터 (Logical Bad Sector) & Zero-Fill Remap</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    갑작스러운 정전, 시스템 비정상 종료 등으로 인해 섹터의 데이터와 ECC 체크섬이 불일치하여 발생합니다. 물리적 플래터/낸드 셀은 손상되지 않았으므로, <strong>S.M.A.R.T. Zero-Fill (0x00 완전 덮어쓰기)</strong>를 수행하면 새로운 ECC가 생성되며 정상 섹터로 즉시 완벽 복원됩니다.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>2. 물리 배드섹터 (Physical Hard Bad Sector) & 예비 영역 치환</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    헤드 충돌(Head Crash), 자성체 박리, 낸드 셀의 절연막 절연 파괴로 인한 영구적인 손상입니다. 디스크 펌웨어는 결함 섹터를 숨겨진 <strong>예비 영역(Spare Area)</strong>으로 재할당(Reallocated Event)하여 더 이상 해당 주소에 접근하지 않도록 격리합니다. 예비 영역이 고갈되면 즉시 새 드라이브로 교체해야 합니다.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                  <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Binary className="w-4 h-4" />
                    <span>3. 휴리스틱 비트 카빙 (Bit Carving Recovery)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    파일 시스템 인덱스가 유실된 손상 섹터에서도 매직 바이트(Magic Bytes: PNG, JPEG, PDF, ZIP 등)를 휴리스틱 패턴 매칭하여 파일의 시작 지점을 특정하고 데이터를 안전한 외부 공간으로 복원 추출하는 고급 기능입니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Keyboard Shortcuts & Tips */}
          {activeGuideTab === 'shortcuts' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4 text-indigo-500" />
                  <span>효율적인 진단을 위한 조작 팁 & 단축키</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  키보드 조작을 통해 신속하게 검사를 제어하고 모달을 닫을 수 있습니다.
                </p>
              </div>

              <div className="space-y-2">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">검사 시작 / 일시정지 (Start / Pause)</span>
                  <kbd className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                    Space
                  </kbd>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">진단 세션 초기화 (Reset)</span>
                  <kbd className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                    R
                  </kbd>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">열려 있는 모든 모달 창 닫기</span>
                  <kbd className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                    Esc
                  </kbd>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">블록 선택 시 LBA 세부정보 표시</span>
                  <span className="text-slate-500 font-mono text-xs">그리드 셀 마우스 클릭</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Jump Action Links Section */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              전문가 도구 및 공식 정보 바로가기
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {onOpenSupportedCatalog && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSupportedCatalog();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group"
                >
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1 group-hover:text-blue-600">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>하드웨어 카탈로그</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">제조사 공식 툴 안내</div>
                </button>
              )}

              {onOpenDllDocs && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDllDocs();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group"
                >
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1 group-hover:text-indigo-600">
                    <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Rust DLL 명세서</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">코어 아키텍처</div>
                </button>
              )}

              {onOpenUpdateModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenUpdateModal();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group"
                >
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1 group-hover:text-amber-500">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>업데이트 확인</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">GitHub 최신 버전</div>
                </button>
              )}

              {onOpenAboutModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenAboutModal();
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group"
                >
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1 group-hover:text-slate-900 dark:group-hover:text-white">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>제작자 & 채널</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">CISNet / AhBiYout</div>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            {PROJECT_INFO.appName} {PROJECT_INFO.version} · Professional Storage Diagnostic Guide
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            가이드 닫기
          </button>
        </div>

      </div>
    </div>
  );
};
