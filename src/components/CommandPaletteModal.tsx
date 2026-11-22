import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppLocale, CommandPaletteAction } from '../types';
import { t } from '../utils/i18n';
import { Command, CornerDownLeft, Search, X } from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
  locale: AppLocale;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  actions,
  locale
}) => {
  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    const id = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(id);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = actions.filter(a => {
      if (!q) return true;
      const haystack = [a.label, a.description || '', ...(a.keywords || []), a.category]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    return list.slice(0, 40);
  }, [actions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const categoryLabels: Record<CommandPaletteAction['category'], string> =
    locale === 'en'
      ? {
          navigation: 'Views',
          tools: 'Diagnostics & Forensics',
          drive: 'Switch Drive',
          actions: 'Quick Actions'
        }
      : {
          navigation: '화면 전환',
          tools: '정밀 진단 · 복구 도구',
          drive: '드라이브 전환',
          actions: '빠른 실행'
        };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target && !target.disabled) {
        onClose();
        target.execute();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-3 bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'nav.commandPalette')}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-md shadow-xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Row */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16]">
          <Search className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t(locale, 'cmd.placeholder')}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[58vh] overflow-y-auto scrollbar-thin divide-y divide-slate-100 dark:divide-slate-800/80">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t(locale, 'cmd.empty')}
            </div>
          ) : (
            filtered.map((action, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    if (action.disabled) return;
                    onClose();
                    action.execute();
                  }}
                  className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-800 dark:text-blue-200'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0">
                        {categoryLabels[action.category]}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs font-bold truncate">{action.label}</span>
                    </div>
                    {action.description && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {action.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] tabular-nums">
                    {action.shortcut && (
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
                        {action.shortcut}
                      </span>
                    )}
                    {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          <div className="flex items-center gap-2">
            <Command className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>↑↓ Navigate · Enter Execute · Esc Close</span>
          </div>
          <span>{filtered.length} commands</span>
        </div>
      </div>
    </div>
  );
};
