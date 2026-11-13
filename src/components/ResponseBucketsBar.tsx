import React from 'react';
import { ResponseBucketCounts } from '../types';

export type BucketKey = keyof ResponseBucketCounts;

interface ResponseBucketsBarProps {
  buckets: ResponseBucketCounts;
  activeBucket: BucketKey | null;
  onSelectBucket: (bucket: BucketKey | null) => void;
}

interface BucketMeta {
  key: BucketKey;
  label: string;
  dotClass: string;
  textClass: string;
  activeClass: string;
}

const BUCKET_META: BucketMeta[] = [
  {
    key: 'lt5ms',
    label: '< 5ms',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    activeClass: 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15'
  },
  {
    key: 'lt20ms',
    label: '< 20ms',
    dotClass: 'bg-teal-500',
    textClass: 'text-teal-700 dark:text-teal-400',
    activeClass: 'border-teal-500 bg-teal-500/10 dark:bg-teal-500/15'
  },
  {
    key: 'lt50ms',
    label: '< 50ms',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-700 dark:text-sky-400',
    activeClass: 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/15'
  },
  {
    key: 'lt150ms',
    label: '< 150ms',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
    activeClass: 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15'
  },
  {
    key: 'lt500ms',
    label: '< 500ms',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-700 dark:text-orange-400',
    activeClass: 'border-orange-500 bg-orange-500/10 dark:bg-orange-500/15'
  },
  {
    key: 'gt500ms',
    label: '> 500ms',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-700 dark:text-rose-400',
    activeClass: 'border-rose-500 bg-rose-500/10 dark:bg-rose-500/15'
  },
  {
    key: 'bad',
    label: 'Bads',
    dotClass: 'bg-red-600',
    textClass: 'text-red-700 dark:text-red-400',
    activeClass: 'border-red-600 bg-red-600/10 dark:bg-red-600/20'
  }
];

export const ResponseBucketsBar: React.FC<ResponseBucketsBarProps> = ({
  buckets,
  activeBucket,
  onSelectBucket
}) => {
  const totalCount =
    buckets.lt5ms +
    buckets.lt20ms +
    buckets.lt50ms +
    buckets.lt150ms +
    buckets.lt500ms +
    buckets.gt500ms +
    buckets.bad;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            응답 지연 분포 버킷 (HDDScan Map)
          </span>
          {activeBucket && (
            <button
              onClick={() => onSelectBucket(null)}
              className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              필터 해제
            </button>
          )}
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          계측 블록: <strong className="text-slate-900 dark:text-slate-100">{totalCount.toLocaleString()}</strong>
        </span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {BUCKET_META.map(meta => {
          const count = buckets[meta.key];
          const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0.0';
          const isActive = activeBucket === meta.key;

          return (
            <button
              key={meta.key}
              type="button"
              onClick={() => onSelectBucket(isActive ? null : meta.key)}
              className={`text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                isActive
                  ? meta.activeClass
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
              title={`${meta.label} 구간 블록 필터링`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-2 h-2 rounded-xs shrink-0 ${meta.dotClass}`} />
                  <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 truncate">
                    {meta.label}
                  </span>
                </div>
                <span className="text-[9px] font-mono tabular-nums text-slate-400">
                  {pct}%
                </span>
              </div>
              <div className={`mt-0.5 text-sm font-mono font-bold tabular-nums leading-tight ${
                count > 0 ? meta.textClass : 'text-slate-400 dark:text-slate-600'
              }`}>
                {count.toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
