import React, { useState } from 'react';
import { 
  SUPPORTED_VENDOR_CATALOG, 
  filterSupportedCatalog, 
  SupportedProductSeries 
} from '../utils/supportedProductsData';
import { StorageVendor, getVendorProfile } from '../utils/vendorDiagnostics';
import { 
  X, 
  Search, 
  Cpu, 
  HardDrive, 
  Usb, 
  ShieldCheck, 
  Zap, 
  Wrench, 
  Sparkles, 
  Sliders, 
  CheckCircle2, 
  ExternalLink,
  Layers,
  Activity,
  Download,
  Info,
  Filter
} from 'lucide-react';

interface SupportedProductsCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVendorForDiagnostic?: (vendor: StorageVendor) => void;
}

export const SupportedProductsCatalogModal: React.FC<SupportedProductsCatalogModalProps> = ({
  isOpen,
  onClose,
  onSelectVendorForDiagnostic
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [selectedProductDetails, setSelectedProductDetails] = useState<SupportedProductSeries | null>(null);

  if (!isOpen) return null;

  const filteredCatalog = filterSupportedCatalog(searchQuery, selectedCategory, selectedVendor);

  const categories = [
    { id: 'ALL', label: '전체 매체 (All)', icon: Layers },
    { id: 'INTERNAL_NVME', label: '내장 NVMe', icon: Cpu },
    { id: 'INTERNAL_SATA', label: '내장 SATA', icon: HardDrive },
    { id: 'EXTERNAL_SSD', label: '외장 SSD', icon: Usb },
    { id: 'EXTERNAL_HDD', label: '외장 HDD', icon: HardDrive },
    { id: 'SD_FLASH', label: 'SD / 플래시', icon: Activity }
  ];

  const vendorsList = [
    { id: 'ALL', label: '전체 제조사' },
    { id: 'samsung', label: '삼성전자' },
    { id: 'seagate', label: '씨게이트' },
    { id: 'wd', label: '웨스턴디지털(WD)' },
    { id: 'sandisk', label: '샌디스크' },
    { id: 'sk_hynix', label: 'SK하이닉스' },
    { id: 'crucial', label: '마이크론/크루셜' },
    { id: 'toshiba', label: '도시바/키옥시아' },
    { id: 'apple', label: '애플' },
    { id: 'kingston', label: '킹스톤' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  정밀진단 지원 제조사 및 제품 목록 카탈로그
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                  총 {SUPPORTED_VENDOR_CATALOG.length}개 핵심 라인업 / 50+ 지원 모델
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                제조사 독자 커스텀 명령, S.M.A.R.T. 심층 속성 파싱, 발열/수명 모니터링 및 섹터 재할당 수복이 가능한 정밀 진단 대상 카탈로그입니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="제품명, 모델명(예: 990 PRO, ST2000, Canvio, SN850X), 기능 검색..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>

          {/* Vendor Filter Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-semibold text-[11px]">제조사:</span>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-medium text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-5 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-x-auto text-xs">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSel = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 cursor-pointer ${
                  isSel
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-xs space-y-4">
          
          {filteredCatalog.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Info className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                검색 조건에 일치하는 지원 제품 라인업이 없습니다.
              </p>
              <p className="text-xs text-slate-500">
                검색어를 변경하거나 필터를 '전체'로 재설정해 보세요.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setSelectedVendor('ALL');
                }}
                className="mt-2 px-3 py-1.5 rounded bg-indigo-600 text-white font-semibold cursor-pointer"
              >
                검색 조건 초기화
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCatalog.map((item) => {
                const vendorProf = getVendorProfile(item.vendor);
                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-indigo-500/50 transition-all shadow-xs"
                  >
                    <div className="space-y-2.5">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${vendorProf.badgeColor}`}>
                          {item.vendorNameKo}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {item.categoryKo}
                        </span>
                      </div>

                      {/* Series Title */}
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>{item.seriesName}</span>
                      </h3>

                      {/* Supported Models List */}
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                          대표 호환 모델 번호
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.supportedModels.map((m, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px] border border-slate-200 dark:border-slate-800">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Precision Diagnostic Features */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          정밀진단 지원 특화 기능
                        </div>
                        <ul className="space-y-1">
                          {item.precisionDiagnosticFeatures.map((feat, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Monitored SMART Attributes */}
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          추적 모니터링 S.M.A.R.T. 지표
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.smartMonitoringIds.map((attr) => (
                            <span
                              key={attr.id}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60"
                              title={attr.targetMetric}
                            >
                              ID #{attr.id}: {attr.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer / Actions */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        공식 툴: <span className="font-semibold text-slate-800 dark:text-slate-200">{item.officialTool}</span>
                      </div>

                      {onSelectVendorForDiagnostic && (
                        <button
                          onClick={() => {
                            onClose();
                            onSelectVendorForDiagnostic(item.vendor);
                          }}
                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>제조사 특성 열기</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>하드웨어 레벨 커스텀 마이크로코드 및 ATA / NVMe Pass-Through 인터페이스 완벽 지원</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
