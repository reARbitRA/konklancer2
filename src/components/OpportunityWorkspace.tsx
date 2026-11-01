import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Layers, Search, SlidersHorizontal, Sparkles, Terminal, X } from 'lucide-react';
import type { FreelanceJob } from '../types';
import type { FeedSource } from './FeedStatusBar';
import { sortJobs, type SortConfig } from '../utils/jobSort';

interface Props {
  jobs: FreelanceJob[];
  source: FeedSource;
  scannedAt: string | null;
  onAnalyze: (job: FreelanceJob) => void;
  onProposal: (job: FreelanceJob) => void;
  onStudio: (job: FreelanceJob) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  legacyTools: React.ReactNode;
}
const PAGE_SIZE = 30;
const fa = (n: number) => n.toLocaleString('fa-IR');
const statusLabels: Record<FreelanceJob['status'], string> = { new: 'جدید', bidded: 'پیشنهاد شده', in_progress: 'در حال انجام', ready: 'آماده تحویل', completed: 'تکمیل شده' };
function safeLink(value?: string) {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function OpportunityWorkspace({ jobs, source, scannedAt, onAnalyze, onProposal, onStudio, onPin, onDelete, legacyTools }: Props) {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const view = params.get('view') || 'relevant';
  const platform = params.get('platform') || 'all';
  const sort = params.get('sort') || 'recent';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const selectedId = params.get('job');
  const toolsOpen = params.get('tools') === '1';
  const update = (key: string, value: string, resetPage = false) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (resetPage) next.delete('page');
    setParams(next);
  };
  const counts = useMemo(() => ({
    all: jobs.length,
    relevant: jobs.filter(j => j.isManual || j.pinned || j.relevanceTier !== 'junk').length,
    saved: jobs.filter(j => j.isManual || j.pinned).length,
    prime: jobs.filter(j => j.relevanceTier === 'prime').length,
  }), [jobs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const items = jobs.filter(j => {
      if (view === 'relevant' && !j.isManual && !j.pinned && j.relevanceTier === 'junk') return false;
      if (view === 'saved' && !j.isManual && !j.pinned) return false;
      if (view === 'prime' && j.relevanceTier !== 'prime') return false;
      if (platform !== 'all' && j.platformKey !== platform) return false;
      return !q || [j.title, j.description, j.category, j.platform, ...(j.tags || [])].some(v => (v || '').toLocaleLowerCase().includes(q));
    });
    const config: SortConfig = sort === 'budget' ? { by: 'price', dir: 'desc' } : sort === 'oldest' ? { by: 'time', dir: 'asc' } : { by: 'time', dir: 'desc' };
    return sortJobs(items, config);
  }, [jobs, query, view, platform, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = selectedId ? jobs.find(j => j.id === selectedId) : null;
  const link = safeLink(selected?.url);
  const sources = [{ value: 'all', label: 'همه منابع' }, { value: 'ponisha', label: 'پونیشا' }, { value: 'karlancer', label: 'کارلنسر' }, { value: 'parskoders', label: 'پارس‌کدرز' }, { value: 'global', label: 'سایر' }];

  if (toolsOpen) return <section className="opportunity-tools"><div className="opportunity-tools-head"><div><span>WORKSPACE / ADVANCED</span><h2>ابزارهای پروژه</h2><p>ورود دستی، دریافت از آدرس و ابزارهای پیشرفته فید</p></div><button className="ow-button" onClick={() => update('tools', '')}><ArrowLeft size={16}/> بازگشت به پروژه‌ها</button></div>{legacyTools}</section>;
  return <section className="opportunity-workspace" aria-label="مرور پروژه‌ها">
    <div className="ow-intro"><div><div className="ow-kicker"><span className="ow-pulse"/> OPPORTUNITY FEED <span className="ow-divider">/</span> {source === 'demo' ? 'DEMO' : source === 'scanner' ? 'SCANNER' : 'WAITING'}</div><h2>فرصت بعدی،<br/><em>همین‌جاست.</em></h2><p>پروژه‌های مناسب را پیدا کنید، جزئیات را بررسی کنید و کار را به جریان بیندازید.</p><div className="ow-intro-meta"><span><span className="ow-meta-dot"/> {fa(counts.all)} پروژه در فید</span><span>آخرین اسکن: {scannedAt ? new Date(scannedAt).toLocaleDateString('fa-IR') : 'نامشخص'}</span></div></div><div className="ow-intro-side"><span>YOUR WORKSPACE</span><div className="ow-orbit" aria-hidden="true"><div className="ow-orbit-inner"><span>✳</span></div><i/><b/></div><div className="ow-intro-side-bottom"><span>FIND THE RIGHT WORK</span><span>01 — 05</span></div></div></div>
    <div className="ow-section-top"><div><div className="ow-overline">01 / DISCOVER</div><h2>پروژه‌ها <span>{fa(filtered.length)}</span></h2><p>از فید تا اولین قدم، همه چیز در یک نگاه.</p></div><button className="ow-button" onClick={() => update('tools', '1')}><SlidersHorizontal size={16}/> ورود و ابزارهای پیشرفته <ArrowUpRight size={14}/></button></div>
    <div className="ow-tabs" role="group" aria-label="نمای پروژه‌ها">{([{ id: 'relevant', label: 'مرتبط', count: counts.relevant }, { id: 'all', label: 'همه پروژه‌ها', count: counts.all }, { id: 'prime', label: 'منتخب', count: counts.prime }, { id: 'saved', label: 'ذخیره‌شده', count: counts.saved }] as const).map(tab => <button key={tab.id} className={view === tab.id ? 'is-active' : ''} onClick={() => update('view', tab.id, true)} aria-pressed={view === tab.id}>{tab.label}<span>{fa(tab.count)}</span></button>)}</div>
    <div className="ow-toolbar"><label className="ow-search"><Search size={17}/><span className="sr-only">جستجوی پروژه‌ها</span><input value={query} onChange={e => update('q', e.target.value, true)} placeholder="جستجو در پروژه‌ها و مهارت‌ها..."/></label><label className="ow-select"><span>منبع</span><select value={platform} onChange={e => update('platform', e.target.value, true)}>{sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label><label className="ow-select"><span>مرتب‌سازی</span><select value={sort} onChange={e => update('sort', e.target.value, true)}><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="budget">بیشترین بودجه</option></select></label></div>
    <div className={`ow-body ${selected ? 'has-detail' : ''}`}><div className="ow-list"><div className="ow-list-head"><span>پروژه / منبع</span><span>بودجه</span><span>انتشار</span><span/></div>{rows.length ? rows.map((job, index) => <button key={job.id} className={`ow-row ${selectedId === job.id ? 'is-selected' : ''}`} onClick={() => update('job', job.id)} aria-label={`بررسی ${job.title}`}><span className="ow-row-main"><span className="ow-row-number">{String((currentPage - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</span><span className="ow-row-copy"><strong>{job.title}</strong><span><b>{job.platform}</b><i/> {job.category || 'دسته‌بندی نشده'}{job.pinned && <> <i/> ذخیره‌شده</>}</span></span></span><span className="ow-row-budget">{job.budget ? job.budgetFormatted : 'توافقی'}</span><span className="ow-row-time">{job.postedTime || 'نامشخص'}</span><ArrowLeft className="ow-row-arrow" size={16}/></button>) : <div className="ow-empty"><Search size={22}/><strong>پروژه‌ای پیدا نشد</strong><p>جستجو یا فیلترها را تغییر دهید، یا از ابزارهای ورود پروژه استفاده کنید.</p><button onClick={() => setParams({})}>پاک کردن فیلترها</button></div>}
      <div className="ow-pagination"><span>{filtered.length ? `${fa((currentPage - 1) * PAGE_SIZE + 1)}–${fa(Math.min(currentPage * PAGE_SIZE, filtered.length))} از ${fa(filtered.length)}` : '۰ پروژه'}</span><div><button disabled={currentPage <= 1} onClick={() => update('page', String(currentPage - 1))} aria-label="صفحه قبل"><ChevronRight size={16}/></button><span>{fa(currentPage)} / {fa(pages)}</span><button disabled={currentPage >= pages} onClick={() => update('page', String(currentPage + 1))} aria-label="صفحه بعد"><ChevronLeft size={16}/></button></div></div></div>
      {selected && <aside className="ow-detail" aria-label="جزئیات پروژه"><div className="ow-detail-top"><span>PROJECT DETAILS / {selected.platform}</span><button onClick={() => update('job', '')} aria-label="بستن جزئیات"><X size={18}/></button></div><div className="ow-detail-inner"><div className="ow-detail-tag"><span className="ow-meta-dot"/> {statusLabels[selected.status] || selected.status}</div><h3>{selected.title}</h3><div className="ow-detail-source">{selected.platform} <span>/</span> {selected.category || 'بدون دسته'}</div><div className="ow-detail-metrics"><div><span>بودجه</span><strong>{selected.budget ? selected.budgetFormatted : 'توافقی'}</strong></div><div><span>زمان انتشار</span><strong>{selected.postedTime || 'نامشخص'}</strong></div><div><span>پیشنهادها</span><strong>{fa(selected.proposalsCount || 0)}</strong></div><div><span>وضعیت</span><strong>{statusLabels[selected.status] || selected.status}</strong></div></div><div className="ow-detail-label">شرح پروژه <span>DESCRIPTION</span></div><p className="ow-description">{selected.description || 'برای این پروژه توضیحی ثبت نشده است.'}</p>{selected.tags?.length > 0 && <div className="ow-tags">{selected.tags.slice(0, 8).map((tag, i) => <span key={`${tag}-${i}`}>{tag}</span>)}</div>}<div className="ow-detail-actions"><button className="ow-action-primary" onClick={() => onAnalyze(selected)}><Sparkles size={17}/> تحلیل پروژه <ArrowLeft size={16}/></button><button onClick={() => onProposal(selected)}><FileText size={16}/> ساخت پیشنهاد</button><button onClick={() => onStudio(selected)}><Terminal size={16}/> باز کردن در استودیو</button><button onClick={() => onPin(selected.id)}>{selected.pinned ? <Check size={16}/> : <Bookmark size={16}/>} {selected.pinned ? 'ذخیره شده' : 'ذخیره پروژه'}</button>{link && <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> مشاهده منبع</a>}{selected.isManual && <button onClick={() => { if (window.confirm('این پروژه دستی حذف شود؟')) { onDelete(selected.id); update('job', ''); } }}>حذف پروژه دستی</button>}</div></div></aside>}
      {!selected && <aside className="ow-detail ow-detail-placeholder"><div className="ow-detail-top"><span>PROJECT DETAILS</span><Layers size={15}/></div><div className="ow-placeholder-inner"><div className="ow-placeholder-icon"><ArrowUpRight size={23}/></div><strong>یک پروژه را انتخاب کنید</strong><p>جزئیات، بودجه و اقدام‌های بعدی اینجا نمایش داده می‌شوند.</p><span>SELECT AN OPPORTUNITY ↗</span></div></aside>}</div>
  </section>;
}
