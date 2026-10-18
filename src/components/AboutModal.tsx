import React from 'react';
import { PROJECT_INFO } from '../config/projectInfo';
import { 
  X, 
  Github, 
  BookOpen, 
  Building2, 
  ArrowUpRight, 
  HardDrive, 
  Cpu, 
  Usb,
  Layers, 
  Sparkles, 
  Download,
  Terminal,
  FileCode2,
  ShieldCheck,
  Activity,
  Lock,
  Scale
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckUpdates: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  onCheckUpdates
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              D
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {PROJECT_INFO.appName}
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  {PROJECT_INFO.version}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {PROJECT_INFO.appKoreanName} · High Density Diagnostic Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          
          {/* Creator & Official Channels Guide */}
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                제작자 및 공식 채널 안내
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Node.js 22 LTS / 24 Compliant
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* GitHub */}
              <a
                href={PROJECT_INFO.developer.githubProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:shadow-xs transition-all group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <Github className="w-5 h-5 text-slate-900 dark:text-white" />
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">GitHub 저장소</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{PROJECT_INFO.developer.githubUsername}</div>
                  <div className="text-[10px] text-indigo-500 truncate font-mono mt-0.5">AhBiYout-all</div>
                </div>
              </a>

              {/* Official Google Blog */}
              <a
                href={PROJECT_INFO.developer.blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 hover:shadow-xs transition-all group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <BookOpen className="w-5 h-5 text-amber-500" />
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition-colors" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">공식 구글 블로그</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">AhBiYout Vibe</div>
                  <div className="text-[10px] text-amber-500 truncate font-mono mt-0.5">ahbiyoutvibe.blogspot.com</div>
                </div>
              </a>

              {/* CISNet Affiliation */}
              <a
                href={PROJECT_INFO.developer.affiliation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500 hover:shadow-xs transition-all group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <Building2 className="w-5 h-5 text-cyan-500" />
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">소속 정보</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{PROJECT_INFO.developer.affiliation.name}</div>
                  <div className="text-[10px] text-cyan-500 truncate font-mono mt-0.5">www.cisnet.co.kr</div>
                </div>
              </a>
            </div>
          </div>

          {/* 2026 Latest Online Telemetry Insights & Improvements */}
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-500" />
              2026 최신 디스크 진단 표준 및 매체별 맞춤 검사 고도화
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-indigo-500">
                  <Cpu className="w-3.5 h-3.5" />
                  NVMe & SATA SSD 낸드 맞춤형 검사
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[10px]">
                  NVMe 64-Queue 병렬 다이렉트 I/O와 SATA 128KB Erase Block 단위 정렬 검사로 FTL 가비지 컬렉션 간섭 없이 순수 플래시 셀 건강도를 계측합니다.
                </p>
              </div>

              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-sky-500">
                  <HardDrive className="w-3.5 h-3.5" />
                  기계식 HDD 플래터 & 헤드 스트레스 분석
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[10px]">
                  플래터 외주/내주 ZBR 감속 곡선 추적, 버터플라이 시크(VCM 헤드 스윙), S.M.A.R.T. 05h/C5h/C6h 물리 매핑을 지원합니다.
                </p>
              </div>

              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-cyan-500">
                  <Usb className="w-3.5 h-3.5" />
                  USB 2.0 BOT 지터 보정 & UASP 고속 스트리밍
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[10px]">
                  USB 2.0 480Mbps 대역폭 오버헤드 지연을 정상으로 판정하는 동적 필터와 FAT32/exFAT MBR 선제 검사로 오탐지를 방지합니다.
                </p>
              </div>



              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 col-span-1 sm:col-span-2">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-rose-500">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  S.M.A.R.T. 배드섹터 제로필 수복 & 하드웨어 예비 트랙 재할당(Remap) 엔진
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[10px]">
                  단순 경고를 넘어 ATA WRITE DMA / NVMe Write Zeroes 제로필로 논리적 ECC 패리티/CRC 오류를 초기화 수복하고, 응답 불능 물리 섹터는 컨트롤러 레벨에서 Spare Reserve Track(ID 05h/C5h)으로 즉시 재할당 처리합니다.
                </p>
              </div>
            </div>
          </div>

          {/* Copyright & Legal Compliance Strategy */}
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg p-3.5 space-y-2">
            <h3 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-500" />
              저작권 침해 방지 및 오픈 표준 준수 정책 (IP & Legal Policy)
            </h3>

            <ul className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">1.</span>
                <span><strong>퍼블릭 도메인 오픈 표준 규격 준수</strong>: ATA SFF-8035i 및 NVM Express Inc.의 공식 공개 스펙(NVMe 2.0 Spec) 기반으로 알고리즘을 독자 구현하여 상용 툴(CrystalDiskInfo, HD Tune, Victoria 등)의 역공학이나 독점 코드 침해를 원천 방지합니다.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">2.</span>
                <span><strong>정품 오픈소스 라이선스 (Apache 2.0)</strong>: 모든 소스코드, 에셋, 워크플로 스크립트는 Apache 2.0 라이선스로 배포되며, 서드파티 라이브러리 라이선스(Lucide ISC 등)를 철저히 준수합니다.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">3.</span>
                <span><strong>상표권 중립성(Trademark Neutrality)</strong>: 타사 상용 소프트웨어의 고유 등록상표를 침해하지 않는 독자적인 브랜드명(DiskSentinel Pro)을 사용합니다.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">4.</span>
                <span><strong>완전한 데이터 프라이버시(Zero Data Telemetry)</strong>: 사용자 드라이브의 실제 파일 내용이나 개인정보는 일절 수집·전송하지 않으며, 오직 LBA 메타데이터 및 물리 하드웨어 텔레메트리만 안전하게 처리합니다.</span>
              </li>
            </ul>
          </div>

          {/* GitHub Release & Packaging Specification */}
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-indigo-500" />
              GitHub 자동 배포 & 릴리스 정책 준수 사항
            </h3>

            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>Node.js 22 LTS / 24 차세대 런타임 적용</strong>: Node.js 20 EOL 대응 완료 (.github/workflows).</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>자동 인스톨러 패키징</strong>: GitHub Releases에 PC, Android APK, iOS 전용 설치 자산 자동 첨부.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>실시간 자동 업데이트 알림</strong>: 새 릴리스 발행 시 앱 내 실시간 감지 및 알림 팝업.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              onClose();
              onCheckUpdates();
            }}
            className="px-3 py-1.5 rounded border border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>최신 업데이트 확인하기</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded transition-colors"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
