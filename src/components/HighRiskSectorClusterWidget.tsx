import React, { useState } from 'react';
import { ErrorLogItem } from '../types';
import { AlertOctagon, AlertTriangle, Layers, FileSearch, Binary, HardDriveDownload, ArrowRight, ShieldAlert, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface HighRiskCluster {
  id: string;
  startLba: number;
  endLba: number;
  spanSectors: number;
  eventCount: number;
  badCount: number;
  slowCount: number;
  maxLatencyMs: number;
  riskPattern: 'surface_scratch' | 'head_degradation' | 'dense_bad_cluster' | 'scattered_wear';
  patternNameKo: string;
  severity: 'critical' | 'high' | 'warning';
}

interface HighRiskSectorClusterWidgetProps {
  logs: ErrorLogItem[];
  onSelectLba?: (lba: number) => void;
  onTraceRange?: (startLba: number, endLba: number) => void;
  onCloneRange?: (startLba: number, endLba: number) => void;
  onOpenHex?: (lba: number) => void;
}

export const HighRiskSectorClusterWidget: React.FC<HighRiskSectorClusterWidgetProps> = ({
  logs,
  onSelectLba,
  onTraceRange,
  onCloneRange,
  onOpenHex
}) => {
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);

  // Filter only error / bad / slow / critical logs with valid LBA
  const anomalyLogs = React.useMemo(() => {
    return logs
      .filter(l => l.lba >= 0 && (l.status === 'bad' || l.status === 'slow' || l.status === 'critical' || l.errorCode === 'DEGRADATION_WARNING'))
      .sort((a, b) => a.lba - b.lba);
  }, [logs]);

  // Cluster algorithm: group logs within 16,384 LBA sectors (~8MB) into a cluster
  const clusters = React.useMemo<HighRiskCluster[]>(() => {
    if (anomalyLogs.length === 0) return [];

    const clusterWindow = 16384; // LBA window for clustering
    const rawClusters: { logs: ErrorLogItem[]; startLba: number; endLba: number }[] = [];

    let currentGroup: ErrorLogItem[] = [anomalyLogs[0]];
    let groupStart = anomalyLogs[0].lba;
    let groupEnd = anomalyLogs[0].lba;

    for (let i = 1; i < anomalyLogs.length; i++) {
      const item = anomalyLogs[i];
      if (item.lba - groupEnd <= clusterWindow) {
        currentGroup.push(item);
        groupEnd = item.lba;
      } else {
        rawClusters.push({ logs: currentGroup, startLba: groupStart, endLba: groupEnd });
        currentGroup = [item];
        groupStart = item.lba;
        groupEnd = item.lba;
      }
    }
    rawClusters.push({ logs: currentGroup, startLba: groupStart, endLba: groupEnd });

    // Map raw groups to HighRiskCluster with pattern diagnosis
    return rawClusters.map((rc, idx) => {
      const badCount = rc.logs.filter(l => l.status === 'bad' || l.errorCode === 'DEGRADATION_WARNING').length;
      const slowCount = rc.logs.filter(l => l.status === 'slow' || l.status === 'critical').length;
      const spanSectors = Math.max(1, rc.endLba - rc.startLba + 1);
      const maxLatency = Math.max(0, ...rc.logs.map(l => l.latencyMs));
      const densityRatio = badCount / Math.max(1, spanSectors / 1000); // concentration metric

      let riskPattern: HighRiskCluster['riskPattern'] = 'scattered_wear';
      let patternNameKo = '분산형 미디어 마모 (Scattered Wear)';
      let severity: HighRiskCluster['severity'] = 'warning';

      if (spanSectors < 500 && badCount >= 3) {
        riskPattern = 'dense_bad_cluster';
        patternNameKo = '고밀도 배드섹터 군집 (Dense Bad Cluster)';
        severity = 'critical';
      } else if (spanSectors >= 500 && spanSectors < 10000 && badCount >= 2) {
        riskPattern = 'surface_scratch';
        patternNameKo = '디스크 서피스 스크래치 의심 (Surface Scratch)';
        severity = 'critical';
      } else if (maxLatency > 400 || densityRatio > 5) {
        riskPattern = 'head_degradation';
        patternNameKo = '자기헤드 열화 및 지연 집중 (Head Degradation)';
        severity = 'high';
      }

      return {
        id: `cluster-${idx}-${rc.startLba}`,
        startLba: rc.startLba,
        endLba: rc.endLba,
        spanSectors,
        eventCount: rc.logs.length,
        badCount,
        slowCount,
        maxLatencyMs: maxLatency,
        riskPattern,
        patternNameKo,
        severity
      };
    }).sort((a, b) => b.badCount - a.badCount || b.spanSectors - a.spanSectors);
  }, [anomalyLogs]);

  if (clusters.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-emerald-500" />
            고위험군 섹터군 자동 탐지 대시보드
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-semibold">
            정상 (위험 군집 없음)
          </span>
        </div>
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          <p className="font-medium">탐지된 고위험 배드섹터 군집(Cluster)이 없습니다.</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            표면 검사 또는 오류 로그가 누적되면 밀집된 LBA 패턴을 자동으로 분석하여 고위험군 섹터군을 시각화합니다.
          </p>
        </div>
      </div>
    );
  }

  const criticalClustersCount = clusters.filter(c => c.severity === 'critical').length;
  const totalBadInClusters = clusters.reduce((acc, c) => acc + c.badCount, 0);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-xs space-y-3">
      {/* Widget Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-red-500/10 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-500/30">
            <AlertOctagon className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <span>고위험군 섹터군 자동 감지 대시보드</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-bold">
                {clusters.length}개 군집 발견
              </span>
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              오류 로그 패턴 및 LBA 밀집도를 분석하여 물리적 손상 위험 구간을 실시간 군집화합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            치명/위험 군집: <strong className="text-red-500">{criticalClustersCount}</strong>
          </span>
          <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            총 손상 블록: <strong className="text-red-500">{totalBadInClusters}개</strong>
          </span>
        </div>
      </div>

      {/* Cluster Cards List */}
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
        {clusters.map((cluster, index) => {
          const isExpanded = expandedClusterId === cluster.id;
          const isCritical = cluster.severity === 'critical';

          return (
            <div
              key={cluster.id}
              className={`rounded-lg border transition-all ${
                isCritical
                  ? 'border-red-500/40 bg-red-50/40 dark:bg-red-950/20'
                  : 'border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20'
              } p-3 text-xs`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`p-1.5 rounded shrink-0 font-bold font-mono text-white text-[11px] mt-0.5 ${
                      isCritical ? 'bg-red-600' : 'bg-amber-600'
                    }`}
                  >
                    #{index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {cluster.patternNameKo}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                          isCritical
                            ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                            : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                        }`}
                      >
                        {isCritical ? 'CRITICAL RISK' : 'HIGH WARNING'}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                      <span>LBA 구간: <strong className="text-slate-900 dark:text-slate-100">#{cluster.startLba.toLocaleString()} ~ #{cluster.endLba.toLocaleString()}</strong></span>
                      <span>•</span>
                      <span>구간 크기: <strong className="text-slate-900 dark:text-slate-100">{cluster.spanSectors.toLocaleString()} 섹터</strong></span>
                      <span>•</span>
                      <span>손상/지연: <strong className="text-red-600 dark:text-red-400">{cluster.badCount}개 배드</strong> / {cluster.slowCount}개 지연</span>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {onOpenHex && (
                    <button
                      type="button"
                      onClick={() => onOpenHex(cluster.startLba)}
                      className="px-2 py-1 rounded bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="시작 LBA 원시 헥스 바이트 검사"
                    >
                      <Binary className="w-3 h-3 text-blue-400" />
                      <span>Hex 검사</span>
                    </button>
                  )}
                  {onTraceRange && (
                    <button
                      type="button"
                      onClick={() => onTraceRange(cluster.startLba, cluster.endLba)}
                      className="px-2 py-1 rounded bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/30 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="이 고위험 구간에 걸친 손상 파일 추적"
                    >
                      <FileSearch className="w-3 h-3" />
                      <span>파일 영향 추적</span>
                    </button>
                  )}
                  {onCloneRange && (
                    <button
                      type="button"
                      onClick={() => onCloneRange(cluster.startLba, cluster.endLba)}
                      className="px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="이 고위험 구간을 ddrescue 이미지 백업 대상 영역으로 지정"
                    >
                      <HardDriveDownload className="w-3 h-3" />
                      <span>구간 백업</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedClusterId(isExpanded ? null : cluster.id)}
                    className="p-1 rounded bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-red-500/20 dark:border-red-900/40 space-y-2 text-[11px] font-mono">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-1.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 font-sans">최대 I/O 지연</div>
                      <div className="font-bold text-red-600 dark:text-red-400 mt-0.5">{cluster.maxLatencyMs > 0 ? `${cluster.maxLatencyMs}ms` : 'TIMEOUT'}</div>
                    </div>
                    <div className="p-1.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 font-sans">군집 이벤트 수</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{cluster.eventCount}건</div>
                    </div>
                    <div className="p-1.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 font-sans">손상 밀도율</div>
                      <div className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">{((cluster.badCount / cluster.spanSectors) * 100).toFixed(3)}%</div>
                    </div>
                    <div className="p-1.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 font-sans">권장 조치</div>
                      <div className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">영역 스킵 복제</div>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                    이 고위험군 섹터군은 물리적 헤드가 해당 트랙을 지날 때 연속적인 읽기 실패 또는 응답 지연을 유발하고 있습니다. 강제 덮어쓰기나 일반 포맷보다는 <strong>ddrescue 기반 무손실 우회 복제</strong> 및 파일 단위 추적을 통한 핵심 데이터 우선 백업을 강력히 권장합니다.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
