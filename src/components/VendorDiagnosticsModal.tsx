import React, { useState } from 'react';
import { DiskDrive, ScanTelemetry } from '../types';
import { 
  detectVendor, 
  getVendorProfile, 
  getDriveMediaAnalysis, 
  getTailoredActionMethods,
  StorageVendor,
  VendorProfileInfo
} from '../utils/vendorDiagnostics';
import { 
  X, 
  Cpu, 
  ShieldCheck, 
  ShieldAlert, 
  Wrench, 
  Zap, 
  HardDrive, 
  Usb, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  BatteryWarning, 
  Flame, 
  Download, 
  Info, 
  Sliders, 
  Layers, 
  ArrowRight,
  Sparkles,
  RefreshCw,
  FolderLock
} from 'lucide-react';

interface VendorDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDrive: DiskDrive;
  telemetry?: ScanTelemetry;
  onOpenRemapModal?: () => void;
  onOpenUsbModal?: () => void;
  onRefreshSmart?: () => void;
  onOpenCatalogModal?: () => void;
}

const ALL_VENDORS: StorageVendor[] = [
  'samsung',
  'seagate',
  'wd',
  'sandisk',
  'sk_hynix',
  'crucial',
  'apple',
  'toshiba'
];

export const VendorDiagnosticsModal: React.FC<VendorDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  activeDrive,
  telemetry,
  onOpenRemapModal,
  onOpenUsbModal,
  onRefreshSmart,
  onOpenCatalogModal
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'profile' | 'comparison' | 'all_vendors'>('actions');
  const [selectedBrowseVendor, setSelectedBrowseVendor] = useState<StorageVendor>(detectVendor(activeDrive));

  if (!isOpen) return null;

  const currentVendorKey = detectVendor(activeDrive);
  const currentVendorProfile = getVendorProfile(currentVendorKey);
  const mediaAnalysis = getDriveMediaAnalysis(activeDrive);
  const tailoredActions = getTailoredActionMethods(activeDrive, telemetry);

  const browseVendorProfile = getVendorProfile(selectedBrowseVendor);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white animate-pulse">CRITICAL (긴급)</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white">HIGH (높음)</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white">MEDIUM (보통)</span>;
      case 'INFO':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-600 text-white">INFO (권장)</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  제조사 & 매체별 특성 진단 및 차별화 조치 센터
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${currentVendorProfile.badgeColor}`}>
                  {currentVendorProfile.nameKo}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                  {activeDrive.isExternal ? '외부 저장장치 (External)' : '내부 저장장치 (Internal)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                대상: [{activeDrive.mountPoint || 'DRIVE'}] {activeDrive.name} ({activeDrive.model})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 sm:gap-2 px-5 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'actions'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            차별화 맞춤 조치 가이드 ({tailoredActions.length})
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            제조사 하드웨어 특징 & 툴
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'comparison'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            내부 vs 외부 매체 매트릭스
          </button>

          <button
            onClick={() => setActiveTab('all_vendors')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'all_vendors'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            전제 제조사 DB 탐색
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 text-xs space-y-4">

          {/* TAB 1: TAILORED ACTION METHODS */}
          {activeTab === 'actions' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-indigo-900 dark:text-indigo-200 text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>[{currentVendorProfile.nameKo}] 맞춤 분석 기반 단계별 해결책</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    현재 연결된 <strong>{activeDrive.model}</strong>의 인터페이스({activeDrive.interface}), 전력 상태, 그리고 S.M.A.R.T. 건강도에 기반한 가장 효과적인 차별화 조치 방법입니다.
                  </p>
                </div>
              </div>

              {/* Action Cards List */}
              <div className="space-y-3">
                {tailoredActions.map((act, index) => (
                  <div
                    key={act.id}
                    className={`p-4 rounded-xl border transition-all ${
                      act.priority === 'CRITICAL'
                        ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800/80 shadow-xs'
                        : act.priority === 'HIGH'
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                          {act.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {act.categoryKo}
                        </span>
                        {getPriorityBadge(act.priority)}
                      </div>
                    </div>

                    <p className="py-2.5 text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                      {act.description}
                    </p>

                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-lg p-2.5 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        세부 실행 절차 (Step-by-Step)
                      </div>
                      <ul className="space-y-1">
                        {act.actionSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Trigger Button if applicable */}
                    {act.buttonText && (
                      <div className="pt-2.5 flex justify-end">
                        <button
                          onClick={() => {
                            if (act.triggerActionId === 'open_remap_modal' && onOpenRemapModal) {
                              onClose();
                              onOpenRemapModal();
                            } else if (act.triggerActionId === 'open_usb_modal' && onOpenUsbModal) {
                              onClose();
                              onOpenUsbModal();
                            } else if (act.triggerActionId === 'open_smart_refresh' && onRefreshSmart) {
                              onRefreshSmart();
                            } else {
                              setActiveTab('profile');
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <span>{act.buttonText}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: VENDOR HARDWARE PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {currentVendorProfile.nameKo} 하드웨어 아키텍처
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${currentVendorProfile.badgeColor}`}>
                        {currentVendorProfile.vendor.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      주요 컨트롤러: {currentVendorProfile.controllerFamily}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">공식 진단 유틸리티</span>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                      {currentVendorProfile.officialToolName}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Core Highlights */}
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      제조사 독자 스토리지 기술
                    </h4>
                    <ul className="space-y-1 text-[11px]">
                      {currentVendorProfile.coreTechHighlights.map((tech, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <span>{tech}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Known Hardware Quirks */}
                  <div className="p-3 rounded-lg bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-1.5">
                    <h4 className="font-bold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      알려진 하드웨어 특성 & 동작 과부하
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {currentVendorProfile.knownHardwareTraits}
                    </p>
                  </div>
                </div>

                {/* Recommended Remediation */}
                <div className="p-3.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-1">
                  <div className="font-bold text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    제조사 권장 수복 & 유지보수 프로토콜
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                    {currentVendorProfile.recommendedRemediation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INTERNAL VS EXTERNAL MATRIX */}
          {activeTab === 'comparison' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  현재 장치 ({mediaAnalysis.connectionCategoryKo}) 인터페이스 사양 정밀 분석
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  내부 Direct 결착 매체와 외부 USB/Thunderbolt 브릿지 매체의 특성 차이점입니다.
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3 w-1/3">진단 항목</th>
                      <th className="p-3 w-2/3">현재 감지된 물리 특성</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        연결 매체 분류
                      </td>
                      <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">
                        {mediaAnalysis.connectionCategoryKo}
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        버스 대역폭 (Bandwidth)
                      </td>
                      <td className="p-3 font-mono">
                        {mediaAnalysis.busBandwidth}
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        전력 공급 & 안정성
                      </td>
                      <td className="p-3">
                        {mediaAnalysis.powerDelivery}
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        TRIM / Deallocate 지원
                      </td>
                      <td className="p-3">
                        {mediaAnalysis.trimSupportStatus}
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        발열 & 스로틀링 위험도
                      </td>
                      <td className="p-3 font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          mediaAnalysis.thermalThrottlingRisk === 'Critical' || mediaAnalysis.thermalThrottlingRisk === 'High'
                            ? 'bg-red-500 text-white'
                            : mediaAnalysis.thermalThrottlingRisk === 'Medium'
                            ? 'bg-amber-500 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}>
                          {mediaAnalysis.thermalThrottlingRisk} Risk
                        </span>
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        SMR / 캐시 감속 특성
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {mediaAnalysis.smrCacheBehavior}
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40">
                        케이블 / CRC 신호 신뢰성
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {mediaAnalysis.cableCrcVulnerability}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ALL VENDORS KNOWLEDGE DB */}
          {activeTab === 'all_vendors' && (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {ALL_VENDORS.map((v) => {
                  const prof = getVendorProfile(v);
                  const isSel = selectedBrowseVendor === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setSelectedBrowseVendor(v)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 cursor-pointer transition-all ${
                        isSel
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                      }`}
                    >
                      {prof.nameKo.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              {/* Browse Selected Vendor Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{browseVendorProfile.nameKo}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${browseVendorProfile.badgeColor}`}>
                        {browseVendorProfile.vendor.toUpperCase()}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      컨트롤러 칩셋: {browseVendorProfile.controllerFamily}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">공식 소프트웨어</span>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                      {browseVendorProfile.officialToolName}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                      핵심 기술 명세
                    </div>
                    <ul className="space-y-1">
                      {browseVendorProfile.coreTechHighlights.map((t, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
                    <div className="font-bold text-amber-900 dark:text-amber-300 mb-1">
                      하드웨어 특성 & 주의사항
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {browseVendorProfile.knownHardwareTraits}
                    </p>
                  </div>

                  <div className="p-3 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60">
                    <div className="font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                      권장 조치 프로토콜
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {browseVendorProfile.recommendedRemediation}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              Vendor Diagnostic Engine • ATA / NVMe / USB Class
            </span>
            {onOpenCatalogModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCatalogModal();
                }}
                className="px-2.5 py-1 rounded bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/30 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>정밀진단 지원 제품 전체 카탈로그 보기</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
