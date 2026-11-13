import React from 'react';
import { DiagnosticTask } from '../types';
import { Pause, Play, Square, Trash2, Layers } from 'lucide-react';

interface TaskManagerPanelProps {
  tasks: DiagnosticTask[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onStopTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onClearFinished: () => void;
}

const TEST_BADGE: Record<DiagnosticTask['testType'], { label: string; cls: string }> = {
  verify: {
    label: 'VERIFY',
    cls: 'text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60'
  },
  read: {
    label: 'READ',
    cls: 'text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60'
  },
  butterfly: {
    label: 'BFLY',
    cls: 'text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60'
  },
  erase: {
    label: 'ERASE',
    cls: 'text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60'
  }
};

const STATUS_LABEL: Record<DiagnosticTask['status'], { text: string; cls: string }> = {
  running: { text: 'RUN', cls: 'text-emerald-600 dark:text-emerald-400' },
  queued: { text: 'QUEUE', cls: 'text-amber-600 dark:text-amber-400' },
  paused: { text: 'PAUSE', cls: 'text-sky-600 dark:text-sky-400' },
  completed: { text: 'DONE', cls: 'text-slate-500 dark:text-slate-400' },
  aborted: { text: 'STOP', cls: 'text-red-500' }
};

export const TaskManagerPanel: React.FC<TaskManagerPanelProps> = ({
  tasks,
  activeTaskId,
  onSelectTask,
  onPauseTask,
  onResumeTask,
  onStopTask,
  onRemoveTask,
  onClearFinished
}) => {
  const hasFinished = tasks.some(t => t.status === 'completed' || t.status === 'aborted');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            작업 큐 (Task Manager)
          </span>
          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            ({tasks.length})
          </span>
        </div>
        {hasFinished && (
          <button
            type="button"
            onClick={onClearFinished}
            className="text-[10px] font-mono text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            완료 정리
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="py-4 px-2 text-center text-[11px] text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-950/40">
          실행 중이거나 대기 중인 진단 작업이 없습니다.
          <div className="text-[10px] text-slate-400 mt-0.5">
            동일 드라이브 작업은 자동 직렬 큐잉되며, 다른 드라이브는 동시 실행됩니다.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
          {tasks.map(task => {
            const totalSteps = Math.max(1, task.stepSequence.length);
            const pct = Math.min(100, (task.completedSteps / totalSteps) * 100);
            const isSelected = task.id === activeTaskId;
            const testMeta = TEST_BADGE[task.testType];
            const stMeta = STATUS_LABEL[task.status];
            const badTotal = task.buckets.bad;

            return (
              <div
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/35'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`px-1 py-0.2 text-[9px] font-mono font-bold border rounded-xs shrink-0 ${testMeta.cls}`}>
                      {testMeta.label}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {task.driveModel}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold shrink-0 ${stMeta.cls}`}>
                    {stMeta.text}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      badTotal > 0
                        ? 'bg-red-500'
                        : task.status === 'running'
                        ? 'bg-indigo-500'
                        : task.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    {pct.toFixed(1)}% · LBA {task.currentLba.toLocaleString()}
                    {badTotal > 0 && <strong className="text-red-500 ml-1">({badTotal} BAD)</strong>}
                  </span>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {task.status === 'running' && (
                      <button
                        type="button"
                        onClick={() => onPauseTask(task.id)}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-500 cursor-pointer"
                        title="일시 정지"
                      >
                        <Pause className="w-3 h-3" />
                      </button>
                    )}
                    {(task.status === 'paused' || task.status === 'queued') && (
                      <button
                        type="button"
                        onClick={() => onResumeTask(task.id)}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-500 cursor-pointer"
                        title="재개"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    {(task.status === 'running' || task.status === 'paused' || task.status === 'queued') && (
                      <button
                        type="button"
                        onClick={() => onStopTask(task.id)}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-red-500 cursor-pointer"
                        title="중지"
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    )}
                    {(task.status === 'completed' || task.status === 'aborted') && (
                      <button
                        type="button"
                        onClick={() => onRemoveTask(task.id)}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 cursor-pointer"
                        title="목록에서 제거"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
