import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, FileText, Search, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { FreelanceJob, PriorityLevel } from '../types';

const stages: { key: FreelanceJob['status']; label: string; en: string }[] = [
  { key:'new', label:'بررسی نشده', en:'INBOX' },
  { key:'bidded', label:'پیشنهاد شده', en:'PROPOSED' },
  { key:'in_progress', label:'در حال اجرا', en:'IN PROGRESS' },
  { key:'ready', label:'آماده تحویل', en:'READY' },
  { key:'completed', label:'تکمیل شده', en:'COMPLETED' },
];
const fa = (n: number) => n.toLocaleString('fa-IR');
interface Props {
  jobs: FreelanceJob[];
  onMove: (id: string, status: FreelanceJob['status']) => void;
  onPriority: (id: string, priority: PriorityLevel) => void;
  onAnalyze: (job: FreelanceJob) => void;
  onProposal: (job: FreelanceJob) => void;
  onStudio: (job: FreelanceJob) => void;
  advanced: React.ReactNode;
}
export function PipelineWorkspace({ jobs, onMove, onPriority, onAnalyze, onProposal, onStudio, advanced }: Props) {
  const [params, setParams] = useSearchParams();
  const stage = stages.find(s => s.key === params.get('stage')) || stages[0];
  const q = params.get('q') || '';
  const advancedOpen = params.get('advanced') === '1';
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key,value); else next.delete(key); setParams(next); };
  const counts = useMemo(() => Object.fromEntries(stages.map(s => [s.key, jobs.filter(j => j.status === s.key).length])) as Record<FreelanceJob['status'], number>, [jobs]);
  const filtered = useMemo(() => jobs.filter(j => j.status === stage.key && (!q.trim() || `${j.title} ${j.platform} ${j.category}`.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()))), [jobs, stage.key, q]);
  if (advancedOpen) return <section className="opportunity-tools"><div className="opportunity-tools-head"><div><span>PIPELINE / ADVANCED</span><h2>گزارش و نمای کامل</h2><p>نمودارها و ابزارهای پیشرفته پایپ‌لاین</p></div><button className="ow-button" onClick={() => set('advanced','')}><ArrowLeft size={16}/> بازگشت به پایپ‌لاین</button></div>{advanced}</section>;
  return <section className="pipeline-workspace" aria-label="مدیریت پایپ‌لاین">
    <div className="pw-summary"><div><div className="ow-kicker"><span className="ow-pulse"/> YOUR WORK / PIPELINE</div><h2>کارها را جلو ببرید.</h2><p>از اولین بررسی تا تحویل، وضعیت هر پروژه را در یک فضای متمرکز مدیریت کنید.</p></div><div className="pw-summary-count"><span>ACTIVE PROJECTS</span><strong>{fa(counts.bidded + counts.in_progress + counts.ready)}</strong><small>پیشنهاد شده تا آماده تحویل</small></div></div>
    <div className="ow-section-top"><div><div className="ow-overline">02 / PIPELINE</div><h2>جریان کار</h2><p>مرحله‌ای را انتخاب کنید تا فقط کارهای مربوط به آن را ببینید.</p></div><button className="ow-button" onClick={() => set('advanced','1')}><Workflow size={16}/> نمودار و نمای کامل <ArrowUpRight size={14}/></button></div>
    <div className="pw-stages" aria-label="مرحله پروژه">{stages.map((s,i) => <button key={s.key} onClick={() => set('stage',s.key)} aria-pressed={stage.key === s.key} className={stage.key === s.key ? 'is-active' : ''}><span className="pw-stage-top"><span>0{i+1} / {s.en}</span><strong>{fa(counts[s.key])}</strong></span><span className="pw-stage-label">{s.label}<ArrowLeft size={15}/></span></button>)}</div>
    <div className="pw-list-header"><div><span className="ow-overline">{stage.en}</span><h3>{stage.label} <span>{fa(filtered.length)}</span></h3></div><label className="ow-search"><Search size={17}/><span className="sr-only">جستجو در پایپ‌لاین</span><input value={q} onChange={e => set('q',e.target.value)} placeholder="جستجو در این مرحله..."/></label></div>
    <div className="pw-list">{filtered.length ? filtered.map(job => <article className="pw-row" key={job.id}><div className="pw-job"><span className="pw-job-icon"><Workflow size={17}/></span><div><h4>{job.title}</h4><p>{job.platform} <span> / </span> {job.category || 'بدون دسته'} <span> / </span> {job.postedTime || 'زمان نامشخص'}</p></div></div><div className="pw-budget"><small>بودجه پروژه</small><strong>{job.budget ? job.budgetFormatted : 'توافقی'}</strong></div><label className="pw-select"><span>اولویت</span><select value={job.priority || 'Medium'} onChange={e => onPriority(job.id,e.target.value as PriorityLevel)} aria-label={`اولویت ${job.title}`}><option value="High">بالا</option><option value="Medium">متوسط</option><option value="Low">پایین</option></select></label><label className="pw-select"><span>انتقال به</span><select value={job.status} onChange={e => onMove(job.id,e.target.value as FreelanceJob['status'])} aria-label={`وضعیت ${job.title}`}>{stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label><div className="pw-actions"><button onClick={() => onAnalyze(job)} aria-label={`تحلیل ${job.title}`} title="تحلیل"><Sparkles size={16}/></button><button onClick={() => onProposal(job)} aria-label={`پیشنهاد ${job.title}`} title="پیشنهاد"><FileText size={16}/></button><button onClick={() => onStudio(job)} aria-label={`استودیو ${job.title}`} title="استودیو"><Terminal size={16}/></button></div></article>) : <div className="ow-empty"><Workflow size={22}/><strong>در این مرحله پروژه‌ای نیست</strong><p>مرحله دیگری را انتخاب کنید یا از صفحه پروژه‌ها شروع کنید.</p></div>}</div>
  </section>;
}
