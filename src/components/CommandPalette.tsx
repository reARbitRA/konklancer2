import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Command, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';
import type { FreelanceJob } from '../types';

export interface PaletteAction { id: string; label: string; hint?: string; icon: React.ElementType; run: ()=>void; }
interface CommandPaletteProps { open: boolean; onClose: ()=>void; jobs: FreelanceJob[]; actions: PaletteAction[]; onSelectJob: (job: FreelanceJob)=>void; }

const normalize = (v:string)=> v.toLowerCase().replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, jobs, actions, onSelectJob }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement|null>(null);
  const listRef = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{ if(!open) return; setQuery(''); setCursor(0); const t=setTimeout(()=>inputRef.current?.focus(),30); return()=>clearTimeout(t); }, [open]);
  const filteredActions = useMemo(()=>{ const n=normalize(query.trim()); if(!n) return actions.slice(0,7); return actions.filter(a=>normalize(`${a.label} ${a.hint??''}`).includes(n)).slice(0,7); }, [actions, query]);
  const filteredJobs = useMemo(()=>{ const n=normalize(query.trim()); if(!n) return jobs.slice(0,6); return jobs.filter(j=> normalize(`${j.title} ${j.description} ${j.platform} ${j.tags?.join(' ')??''} ${j.category??''}`).includes(n)).slice(0,8); }, [jobs, query]);
  const total = filteredActions.length + filteredJobs.length;
  useEffect(()=> setCursor(c=> Math.min(c, Math.max(0, total-1))), [total]);
  useEffect(()=>{ const node=listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`); node?.scrollIntoView({ block:'nearest' }); }, [cursor]);

  if(!open) return null;
  const runAt = (idx:number)=>{ if(idx < filteredActions.length){ filteredActions[idx]?.run(); } else { const j=filteredJobs[idx-filteredActions.length]; if(j) onSelectJob(j); } onClose(); };
  const handleKeyDown = (e:React.KeyboardEvent)=>{ if(e.key==='Escape'){ e.preventDefault(); onClose(); } else if(e.key==='ArrowDown'){ e.preventDefault(); setCursor(c=> total===0?0:(c+1)%total); } else if(e.key==='ArrowUp'){ e.preventDefault(); setCursor(c=> total===0?0:(c-1+total)%total); } else if(e.key==='Enter'){ e.preventDefault(); runAt(cursor); } };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div dir="rtl" className="w-full max-w-xl bg-white border-[3px] border-black shadow-[8px_8px_0px_0px_#000] overflow-hidden" onMouseDown={e=>e.stopPropagation()} onKeyDown={handleKeyDown} role="dialog" aria-modal="true">
        <div className="flex items-center gap-2 border-b-[3px] border-black px-4 py-3 bg-[#FFDE03]">
          <Search className="w-4 h-4 shrink-0" />
          <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value); setCursor(0);}} placeholder="جست‌وجوی پروژه، دستور، تنظیمات..." className="flex-1 bg-transparent text-[13px] font-bold placeholder:text-black/50 focus:outline-none" />
          <span className="px-2 py-1 bg-black text-white text-[10px] font-mono font-black">ESC</span>
          <button onClick={onClose} className="w-7 h-7 bg-white border-[2px] border-black flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2 bg-[#FFFBF0] brutal-scroll">
          {filteredActions.length>0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest bg-black text-white inline-block">دستورها</p>
              <div className="mt-1 space-y-1">
                {filteredActions.map((a,i)=>{ const Icon=a.icon; return (
                  <button key={a.id} data-index={i} onMouseEnter={()=>setCursor(i)} onClick={()=>runAt(i)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-[2px] text-right ${cursor===i?'bg-black text-white border-black':'bg-white text-black border-black hover:bg-[#FFDE03]'}`}>
                    <span className={`w-7 h-7 border-[2px] flex items-center justify-center shrink-0 ${cursor===i?'bg-white text-black border-white':'bg-black text-white border-black'}`}><Icon className="w-4 h-4" /></span>
                    <span className="flex-1 truncate text-[12px] font-black text-right">{a.label}</span>
                    {a.hint && <span className="hidden sm:inline text-[10px] font-mono opacity-60 truncate">{a.hint}</span>}
                  </button>
                );})}
              </div>
            </div>
          )}
          {filteredJobs.length>0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest bg-[#0066FF] text-white inline-block">پروژه‌ها</p>
              <div className="mt-1 space-y-1">
                {filteredJobs.map((job, idx)=>{ const gi=filteredActions.length+idx; return (
                  <button key={job.id} data-index={gi} onMouseEnter={()=>setCursor(gi)} onClick={()=>runAt(gi)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-[2px] text-right ${cursor===gi?'bg-[#0066FF] text-white border-black':'bg-white border-black hover:bg-[#FFFBF0]'}`}>
                    <span className="w-7 h-7 bg-black text-white border-[2px] border-black flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0 text-right">
                      <span className="block truncate text-[12px] font-black">{job.title}</span>
                      <span className="block truncate text-[11px] font-mono opacity-70">{job.platform} ● {job.budgetFormatted}</span>
                    </span>
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                  </button>
                );})}
              </div>
            </div>
          )}
          {total===0 && <div className="px-4 py-10 text-center text-[12px] font-bold opacity-50">چیزی پیدا نشد</div>}
        </div>
        <div className="flex items-center justify-between border-t-[2.5px] border-black bg-black text-white px-3 py-2 text-[10px] font-mono font-bold">
          <span className="flex items-center gap-2"><span className="flex items-center gap-1">↑ ↓ حرکت</span><span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> انتخاب</span></span>
          <span className="flex items-center gap-1"><Command className="w-3 h-3" /> CTRL+K</span>
        </div>
      </div>
    </div>
  );
};
