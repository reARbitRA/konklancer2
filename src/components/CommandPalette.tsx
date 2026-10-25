import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Command, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';
import type { FreelanceJob } from '../types';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  jobs: FreelanceJob[];
  actions: PaletteAction[];
  onSelectJob: (job: FreelanceJob) => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

const normalize = (value: string) => value.toLowerCase().replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک');

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, jobs, actions, onSelectJob }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredActions = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return actions.slice(0, 7);
    return actions
      .filter((action) => normalize(`${action.label} ${action.hint ?? ''}`).includes(needle))
      .slice(0, 7);
  }, [actions, query]);

  const filteredJobs = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return jobs.slice(0, 6);
    return jobs
      .filter((job) =>
        normalize(`${job.title} ${job.description} ${job.platform} ${job.tags?.join(' ') ?? ''} ${job.category ?? ''}`).includes(
          needle,
        ),
      )
      .slice(0, 8);
  }, [jobs, query]);

  const total = filteredActions.length + filteredJobs.length;

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, total - 1)));
  }, [total]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const runAt = (index: number) => {
    if (index < filteredActions.length) {
      filteredActions[index]?.run();
    } else {
      const job = filteredJobs[index - filteredActions.length];
      if (job) onSelectJob(job);
    }
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (total === 0 ? 0 : (current + 1) % total));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (total === 0 ? 0 : (current - 1 + total) % total));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runAt(cursor);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        dir="rtl"
        className="animate-scale-in w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl shadow-black/60"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="جست‌وجوی سراسری"
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="جست‌وجوی پروژه، دستور یا تنظیمات…"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="kbd">ESC</kbd>
          <button onClick={onClose} className="icon-btn" aria-label="بستن">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {filteredActions.length > 0 && (
            <div className="mb-1">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">دستورها</p>
              {filteredActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    data-index={index}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAt(index)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right transition-colors ${
                      cursor === index ? 'bg-emerald-500/12 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                        cursor === index
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700/70 bg-slate-800/50 text-slate-400'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{action.label}</span>
                    {action.hint && <span className="shrink-0 font-mono text-[10px] text-slate-500">{action.hint}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {filteredJobs.length > 0 && (
            <div>
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">پروژه‌ها</p>
              {filteredJobs.map((job, index) => {
                const globalIndex = filteredActions.length + index;
                return (
                  <button
                    key={job.id}
                    data-index={globalIndex}
                    onMouseEnter={() => setCursor(globalIndex)}
                    onClick={() => runAt(globalIndex)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right transition-colors ${
                      cursor === globalIndex ? 'bg-sky-500/10 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/50 text-sky-300">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{job.title}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {job.platform} · {job.budgetFormatted}
                        {typeof job.score === 'number' ? ` · امتیاز ${job.score.toLocaleString('fa-IR')}` : ''}
                      </span>
                    </span>
                    <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  </button>
                );
              })}
            </div>
          )}

          {total === 0 && (
            <div className="px-4 py-10 text-center text-xs text-slate-500">
              چیزی پیدا نشد. عبارت دیگری امتحان کنید.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/50 px-3 py-1.5 text-[10px] text-slate-500">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd>
              حرکت
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> انتخاب
            </span>
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Command className="h-3 w-3" /> {isMac ? '⌘' : 'Ctrl'}+K
          </span>
        </div>
      </div>
    </div>
  );
};
