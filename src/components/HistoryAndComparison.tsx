import React, { useState } from 'react';
import { SavedScanRecord } from '../types';
import { History, GitCompare, Trash2, ArrowUpRight, ArrowDownRight, Minus, FileText, CheckCircle2, AlertTriangle, ShieldAlert, Share2 } from 'lucide-react';

interface HistoryAndComparisonProps {
  records: SavedScanRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onViewRecordReport: (record: SavedScanRecord) => void;
  onExportRecord?: (record: SavedScanRecord) => void;
}

export const HistoryAndComparison: React.FC<HistoryAndComparisonProps> = ({
  records,
  onDeleteRecord,
  onClearAll,
  onViewRecordReport,
  onExportRecord
}) => {
  const [selectedScanAId, setSelectedScanAId] = useState<string>(records[1]?.id || records[0]?.id || '');
  const [selectedScanBId, setSelectedScanBId] = useState<string>(records[0]?.id || '');

  const scanA = records.find(r => r.id === selectedScanAId);
  const scanB = records.find(r => r.id === selectedScanBId);

  // Delta calculations between Scan A (Older/Base) and Scan B (Newer/Target)
  const badDelta = scanA && scanB ? scanB.badCount - scanA.badCount : 0;
  const healthDelta = scanA && scanB ? scanB.healthScore - scanA.healthScore : 0;
  const slowDelta = scanA && scanB ? (scanB.slowCount + scanB.criticalCount) - (scanA.slowCount + scanA.criticalCount) : 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Comparison Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 mb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5 text-indigo-500" />
              Scan Comparison & Degradation Trends
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              이전 검사 결과와 최신 검사 결과를 대조하여 배드섹터 확산 및 열화 추세를 분석합니다.
            </p>
          </div>

          {/* Selectors for Comparison */}
          {records.length >= 2 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-slate-400">Scan A:</span>
                <select
                  value={selectedScanAId}
                  onChange={(e) => setSelectedScanAId(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-0.5 text-slate-800 dark:text-slate-200 font-mono text-xs"
                >
                  {records.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.date} ({r.healthScore}%)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-slate-400">Scan B:</span>
                <select
                  value={selectedScanBId}
                  onChange={(e) => setSelectedScanBId(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-0.5 text-slate-800 dark:text-slate-200 font-mono text-xs"
                >
                  {records.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.date} ({r.healthScore}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {records.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 dark:bg-slate-950 rounded border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
            <GitCompare className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
            <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs">저장된 실제 검사 기록이 없습니다.</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              상단 [라이브 표면 검사] 탭에서 검사를 시작하시면 완료 시 진단 결과와 S.M.A.R.T. 상태가 로컬에 자동 보관됩니다.
            </p>
          </div>
        ) : records.length === 1 ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    1차 실제 검사 기록 보관 중: {records[0].driveName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    검사 일시: {records[0].date} · 건강도: {records[0].healthScore}% · 배드섹터: {records[0].badCount}개
                  </div>
                </div>
              </div>
              <button
                onClick={() => onViewRecordReport(records[0])}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-2xs"
              >
                1차 검사 상세 보고서 열기
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800">
              💡 <strong>비교 분석 안내:</strong> 추가 검사를 1회 더 수행하시면 첫 번째 검사와 신규 검사 간의 배드섹터 확산 추세(Delta), 응답 지연 블록 변화 및 건강도 감점 추이가 실시간 차트와 지표로 자동 대조 분석됩니다.
            </p>
          </div>
        ) : scanA && scanB ? (
          <div className="space-y-3">
            {/* Delta Comparison Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Bad Sector Delta */}
              <div className={`p-3 rounded-lg border ${
                badDelta > 0
                  ? 'bg-red-950/20 border-red-500/30 text-red-300'
                  : badDelta < 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-200'
              }`}>
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Bad Sector Delta</div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-mono">
                    {badDelta > 0 ? `+${badDelta}` : badDelta}
                  </span>
                  {badDelta > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-red-900/50 text-red-300 border border-red-700/50">
                      <ArrowUpRight className="w-3 h-3" />
                      악화 (배드 증가)
                    </span>
                  ) : badDelta < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                      <ArrowDownRight className="w-3 h-3" />
                      재할당/정리됨
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      <Minus className="w-3 h-3" />
                      변동 없음
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  Scan A: {scanA.badCount} → Scan B: {scanB.badCount}
                </div>
              </div>

              {/* Health Score Delta */}
              <div className={`p-3 rounded-lg border ${
                healthDelta < 0
                  ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-200'
              }`}>
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Health Score Delta</div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-mono">
                    {healthDelta > 0 ? `+${healthDelta}` : healthDelta}%
                  </span>
                  {healthDelta < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50">
                      <ArrowDownRight className="w-3 h-3" />
                      하락
                    </span>
                  ) : healthDelta > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                      <ArrowUpRight className="w-3 h-3" />
                      상승
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      <Minus className="w-3 h-3" />
                      유지됨
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  Scan A: {scanA.healthScore}% → Scan B: {scanB.healthScore}%
                </div>
              </div>

              {/* Latency / Slow Sectors Delta */}
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Slow Sectors (&gt;150ms)</div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                    {slowDelta > 0 ? `+${slowDelta}` : slowDelta}
                  </span>
                  {slowDelta > 0 && (
                    <span className="text-[10px] text-amber-400 font-medium">표면 열화 의심</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  Scan A: {scanA.slowCount + scanA.criticalCount} → Scan B: {scanB.slowCount + scanB.criticalCount}
                </div>
              </div>
            </div>

            {/* Side-by-side Table Comparison */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-2.5 py-2 rounded-l">검사 항목</th>
                    <th className="px-2.5 py-2 font-mono">기준 (Scan A)</th>
                    <th className="px-2.5 py-2 font-mono">대조 (Scan B)</th>
                    <th className="px-2.5 py-2 rounded-r">차이 분석 및 진단 결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  <tr>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">검사 일시</td>
                    <td className="px-2.5 py-2 text-slate-500">{scanA.date}</td>
                    <td className="px-2.5 py-2 text-slate-500">{scanB.date}</td>
                    <td className="px-2.5 py-2 font-sans text-slate-500">시간 경과에 따른 변화 측정</td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">배드섹터 개수</td>
                    <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-slate-100">{scanA.badCount}개</td>
                    <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-slate-100">{scanB.badCount}개</td>
                    <td className="px-2.5 py-2 font-sans">
                      {badDelta > 0 ? (
                        <span className="text-red-400 font-semibold">
                          ⚠️ 배드섹터가 {badDelta}개 추가 발생하여 물리적/논리적 손상이 확산 중입니다.
                        </span>
                      ) : (
                        <span className="text-emerald-400">
                          배드섹터 추가 번짐 없이 안정적으로 유지 중입니다.
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">평균 응답 지연</td>
                    <td className="px-2.5 py-2 text-slate-500">{scanA.avgLatencyMs} ms</td>
                    <td className="px-2.5 py-2 text-slate-500">{scanB.avgLatencyMs} ms</td>
                    <td className="px-2.5 py-2 font-sans text-slate-500">
                      최대 지연: Scan A ({scanA.maxLatencyMs}ms) vs Scan B ({scanB.maxLatencyMs}ms)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">종합 권장 사항</td>
                    <td className="px-2.5 py-2 font-sans text-slate-500">{scanA.healthScore >= 80 ? '정상' : '주의'}</td>
                    <td className="px-2.5 py-2 font-sans text-slate-500">{scanB.healthScore >= 80 ? '정상' : '주의'}</td>
                    <td className="px-2.5 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                      {scanB.recommendation}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* History Records Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs transition-colors">
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Saved Scan Records
            </h3>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              {records.length} Total
            </span>
          </div>

          {records.length > 0 && (
            <button
              onClick={onClearAll}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              전체 초기화
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            저장된 검사 기록이 없습니다. 검사를 완료하면 자동으로 기록이 보존됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="px-2.5 py-2 rounded-l">검사 일시</th>
                  <th className="px-2.5 py-2">드라이브 모델</th>
                  <th className="px-2.5 py-2">검사 모드</th>
                  <th className="px-2.5 py-2 text-center">건강 지수</th>
                  <th className="px-2.5 py-2 text-center">배드섹터</th>
                  <th className="px-2.5 py-2 text-center">지연 섹터</th>
                  <th className="px-2.5 py-2 text-center">소요 시간</th>
                  <th className="px-2.5 py-2 text-right rounded-r">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {records.map((r) => {
                  const isBad = r.badCount > 0;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="px-2.5 py-2 font-sans font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {r.driveModel}
                      </td>
                      <td className="px-2.5 py-2 font-sans">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                          {r.scanMode === 'quick' ? '빠른 검사' : '정밀 검사'}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center font-bold">
                        <span className={r.healthScore >= 80 ? 'text-emerald-400' : r.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}>
                          {r.healthScore}%
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {isBad ? (
                          <span className="text-red-400 font-bold">
                            {r.badCount}개
                          </span>
                        ) : (
                          <span className="text-emerald-400">0개</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center text-slate-500">
                        {r.slowCount + r.criticalCount}개
                      </td>
                      <td className="px-2.5 py-2 text-center text-slate-500">
                        {Math.floor(r.durationSeconds / 60)}분 {Math.floor(r.durationSeconds % 60)}초
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {onExportRecord && (
                            <button
                              onClick={() => onExportRecord(r)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 transition-colors border border-emerald-200 dark:border-emerald-800/60 cursor-pointer"
                              title="CSV/PDF 파일로 내보내기"
                            >
                              <Share2 className="w-3 h-3" />
                              내보내기
                            </button>
                          )}
                          <button
                            onClick={() => onViewRecordReport(r)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 transition-colors border border-indigo-200 dark:border-indigo-800/60 cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            보고서
                          </button>
                          <button
                            onClick={() => onDeleteRecord(r.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="기록 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
