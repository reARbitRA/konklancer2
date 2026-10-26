import React, { useState } from 'react';
import {
  Search, ExternalLink, Sparkles, FileText, Clock, UserCheck, Plus, Globe, FileCode, RefreshCw, Link2, Pin, Trash2, Gem, Target, Layers, ShieldCheck, Terminal, ChevronDown, ChevronUp, X, Filter, Tag, Hash, Zap, Eye, ArrowLeft, Copy, Check,
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';
import { ALL_CATEGORIES, categoryLabel, detectCategory } from '../../shared/taxonomy';
import { evaluateProjectRelevance } from '../../shared/relevanceEngine';
import { buildJobsFromRows, fetchHtmlSmart, parsePlatformHtmlClient } from '../services/standaloneFeed';
import { BrutalCollapsible } from './brutalist/Collapsible';

type RelevanceFilterMode = 'relevant' | 'prime' | 'saved' | 'all';

interface JobHunterProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onAddNewManualJob: (job: Partial<FreelanceJob>) => Promise<void> | void;
  onTogglePinJob: (jobId: string) => void;
  onDeleteManualJob: (jobId: string) => void;
}

export const JobHunter: React.FC<JobHunterProps> = ({
  jobs, onSelectJobForAnalysis, onSelectJobForProposal, onSelectJobForCoding, onAddNewManualJob, onTogglePinJob, onDeleteManualJob,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilterMode>('relevant');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab] = useState<'url' | 'html' | 'manual'>('url');
  const [urlInput, setUrlInput] = useState('https://ponisha.ir');
  const [isUrlScraping, setIsUrlScraping] = useState(false);
  const [urlScrapeResult, setUrlScrapeResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [htmlInput, setHtmlInput] = useState('');
  const [htmlPlatform, setHtmlPlatform] = useState('ponisha');
  const [isHtmlScraping, setIsHtmlScraping] = useState(false);
  const [htmlScrapeResult, setHtmlScrapeResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualBudget, setManualBudget] = useState('5000000');
  const [manualPlatform, setManualPlatform] = useState('پونیشا');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const enrichedJobs = jobs.map((job) => {
    if (job.relevanceTier) return job;
    const rel = evaluateProjectRelevance(job.title, job.description, job.categoryKey, job.tags);
    return { ...job, relevanceTier: rel.tier, relevanceScore: rel.relevanceScore, relevanceReason: rel.reason };
  });

  const hiddenJunkCount = enrichedJobs.filter((j) => !j.isManual && !j.pinned && j.relevanceTier === 'junk').length;
  const primeCount = enrichedJobs.filter((j) => j.isManual || j.pinned || j.relevanceTier === 'prime').length;
  const savedCount = enrichedJobs.filter((j) => j.isManual || j.pinned).length;
  const relevantCount = enrichedJobs.filter((j) => j.isManual || j.pinned || j.relevanceTier !== 'junk').length;

  const filteredJobs = enrichedJobs.filter((job) => {
    const isSaved = Boolean(job.isManual || job.pinned);
    if (relevanceFilter === 'saved' && !isSaved) return false;
    if (relevanceFilter === 'prime' && !isSaved && job.relevanceTier !== 'prime') return false;
    if (relevanceFilter === 'relevant' && !isSaved && job.relevanceTier === 'junk') return false;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || job.title.toLowerCase().includes(q) || job.description.toLowerCase().includes(q) || job.tags.some((t) => t.toLowerCase().includes(q)) || job.category.toLowerCase().includes(q);
    const matchesPlatform = selectedPlatform === 'all' || job.platformKey === selectedPlatform;
    const matchesCategory = selectedCategory === 'all' || job.categoryKey === selectedCategory;
    return matchesSearch && matchesPlatform && matchesCategory;
  });

  const handleCreateManualJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDesc.trim()) return;
    const budgetNum = parseInt(manualBudget, 10) || 5000000;
    const detected = detectCategory(manualTitle, manualDesc);
    onAddNewManualJob({
      id: `manual-${Date.now()}`, title: manualTitle.trim(), description: manualDesc.trim(), budget: budgetNum, budgetFormatted: `${budgetNum.toLocaleString('fa-IR')} تومان`,
      platform: manualPlatform, platformKey: manualPlatform.includes('کارلانسر') ? 'karlancer' : manualPlatform.includes('پارس') ? 'parskoders' : 'ponisha',
      clientName: 'کارفرمای اختصاصی', clientRating: 5.0, clientReviews: 10, deadline: 'امروز', postedTime: 'هم‌اکنون',
      category: categoryLabel(detected.key), categoryKey: detected.key, tags: [detected.key, 'Manual Vault'], proposalsCount: 0, avgBid: budgetNum, status: 'new', isManual: true, pinned: true,
    });
    setManualTitle(''); setManualDesc(''); setShowAddModal(false);
  };

  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault(); if (!urlInput.trim()) return;
    setIsUrlScraping(true); setUrlScrapeResult(null);
    try {
      const targetUrl = urlInput.trim();
      const html = await fetchHtmlSmart(targetUrl);
      if (html) {
        const host = targetUrl.toLowerCase();
        const src = host.includes('ponisha_ir') ? 'telegram:ponisha_ir' : host.includes('ponisha') ? 'ponisha' : host.includes('karlancer') ? 'karlancer' : host.includes('t.me/') || host.includes('telegram.me/') ? `telegram:${targetUrl.split('/').filter(Boolean).pop()?.split('?')[0]}` : 'parscoders';
        const rows = parsePlatformHtmlClient(html, src, targetUrl);
        const { jobs: built } = buildJobsFromRows(rows);
        for (const j of built) await onAddNewManualJob({ ...j, isManual: true, pinned: true });
        setUrlScrapeResult({ success: built.length > 0, count: built.length, message: built.length > 0 ? `${built.length.toLocaleString('fa-IR')} پروژه استخراج و به گاوصندوق دائمی اضافه شد!` : 'صفحه خوانده شد اما کارت پروژه‌ای یافت نشد؛ از تب ۲ یا ۳ استفاده کنید.' });
        return;
      }
      setUrlScrapeResult({ success: false, message: 'اتصال مستقیم برقرار نشد؛ لطفاً سورس HTML را در تب ۲ پیست کنید یا دستی ثبت نمایید.' });
    } catch (err: any) { setUrlScrapeResult({ success: false, message: err.message || 'خطا در استخراج' }); }
    finally { setIsUrlScraping(false); }
  };

  const handleScrapeHtml = async (e: React.FormEvent) => {
    e.preventDefault(); if (!htmlInput.trim()) return;
    setIsHtmlScraping(true); setHtmlScrapeResult(null);
    try {
      const base = htmlPlatform === 'ponisha' ? 'https://ponisha.ir' : htmlPlatform === 'karlancer' ? 'https://www.karlancer.com' : 'https://parscoders.com';
      const rows = parsePlatformHtmlClient(htmlInput.trim(), htmlPlatform, base);
      const { jobs: built } = buildJobsFromRows(rows);
      for (const j of built) await onAddNewManualJob({ ...j, isManual: true, pinned: true });
      setHtmlScrapeResult({ success: built.length > 0, count: built.length, message: built.length > 0 ? `${built.length.toLocaleString('fa-IR')} پروژه از HTML استخراج شد!` : 'کارت پروژه‌ای تشخیص داده نشد.' });
      if (built.length > 0) setHtmlInput('');
    } catch (err: any) { setHtmlScrapeResult({ success: false, message: err.message || 'خطا در پردازش HTML' }); }
    finally { setIsHtmlScraping(false); }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Brutal header stats */}
      <div className="brutal-panel">
        <div className="brutal-header brutal-header--ink">
          <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#FFDE03]" /> رادار هوشمند شکار و دسته‌بندی پروژه‌ها</span>
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2 py-1 bg-[#FFDE03] text-black border-[2px] border-white text-[11px] font-black">{filteredJobs.length.toLocaleString('fa-IR')} پروژه</span>
            <button onClick={() => setShowFilters(!showFilters)} className="px-2 py-1 bg-white text-black border-[2px] border-black text-[11px] font-black flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> {showFilters ? 'بستن فیلتر' : 'فیلترها'} {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </span>
        </div>
        <div className="p-3 bg-[#FFFBF0] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-[#333]">اسکن چندمنبعی با استخراج بودجه‌های پنهان، فیلتر نویز، و گاوصندوق دائمی</p>
          <button onClick={() => { setShowAddModal(true); setModalTab('url'); setUrlScrapeResult(null); setHtmlScrapeResult(null); }} className="brutal-btn brutal-btn--primary brutal-btn--sm gap-1.5">
            <Plus className="w-4 h-4" /> افزودن پروژه جدید
          </button>
        </div>
      </div>

      {/* Relevance filters - collapsible */}
      {showFilters && (
        <div className="overflow-hidden animate-brutal-in">
            <div className="space-y-3">
              <div className="brutal-panel p-3 bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { k: 'relevant', label: `مرتبط (${relevantCount})`, icon: Target, bg: 'bg-[#00E599]' },
                    { k: 'prime', label: `طلایی (${primeCount})`, icon: Gem, bg: 'bg-[#FFDE03]' },
                    { k: 'saved', label: `گاوصندوق (${savedCount})`, icon: Pin, bg: 'bg-[#8B5CF6] text-white' },
                    { k: 'all', label: `همه (${enrichedJobs.length})`, icon: Layers, bg: 'bg-white' },
                  ].map(f => (
                    <button key={f.k} onClick={() => setRelevanceFilter(f.k as any)} className={`flex items-center gap-1.5 px-3 py-2 border-[2.5px] border-[#0a0a0a] text-[12px] font-black uppercase tracking-wide transition-all ${relevanceFilter===f.k ? 'bg-[#0a0a0a] text-white shadow-[2px_2px_0px_0px_#0a0a0a]' : `${f.bg} text-black hover:shadow-[2px_2px_0px_0px_#0a0a0a]`}`}>
                      <f.icon className="w-3.5 h-3.5" /> {f.label}
                    </button>
                  ))}
                  {hiddenJunkCount>0 && relevanceFilter!=='all' && (
                    <span className="ml-auto px-3 py-2 bg-[#00E599] border-[2px] border-black text-[11px] font-black">✓ {hiddenJunkCount.toLocaleString('fa-IR')} نامربوط فیلتر شد</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5">
                  <div className="field-group">
                    <label className="field-group__label flex items-center gap-1.5"><Search className="w-3 h-3" /> جستجو در عنوان و مهارت‌ها</label>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black" />
                      <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="مثلاً: ربات تلگرام، FastAPI، Pandas..." className="brutal-input !border-0 !shadow-none !h-[42px] pr-10 rounded-none" />
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="field-group">
                    <label className="field-group__label">پلتفرم مبدا</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-white">
                      {([{key:'all', label:'همه'},{key:'ponisha', label:'پونیشا'},{key:'karlancer', label:'کارلانسر'},{key:'parskoders', label:'پارس‌کدرز'}] as const).map(item=>(
                        <button key={item.key} onClick={()=>setSelectedPlatform(item.key)} className={`px-2.5 py-1.5 border-[2px] border-black text-[11px] font-black uppercase ${selectedPlatform===item.key?'bg-black text-white':'bg-white hover:bg-[#FFDE03]'}`}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-group__label">دسته‌بندی تخصصی</label>
                    <div className="p-2 bg-white flex flex-wrap gap-1 max-h-[70px] overflow-y-auto">
                      {([{key:'all', label:'همه'} as any, ...ALL_CATEGORIES.filter(c=>c.key!=='other').map(c=>({key:c.key, label:c.fa}))]).map((cat:any)=>(
                        <button key={cat.key} onClick={()=>setSelectedCategory(cat.key)} className={`px-2 py-1 border-[1.5px] border-black text-[10px] font-bold ${selectedCategory===cat.key?'bg-[#FFDE03] text-black':'bg-white text-black/70 hover:bg-[#FFFBF0]'}`}>{cat.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Job grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length===0 ? (
          <div className="brutal-panel p-10 text-center bg-white">
            <div className="w-16 h-16 mx-auto bg-[#FFDE03] border-[2.5px] border-black flex items-center justify-center mb-4"><Search className="w-8 h-8" /></div>
            <p className="text-[14px] font-black">هیچ پروژه‌ای مطابق فیلترها یافت نشد</p>
            <button onClick={()=>{setSearchQuery(''); setSelectedPlatform('all'); setSelectedCategory('all'); setRelevanceFilter('relevant');}} className="mt-3 brutal-btn brutal-btn--sm">بازنشانی فیلترها</button>
          </div>
        ) : filteredJobs.map(job=>{
          const isProtected = Boolean(job.isManual || job.pinned);
          const expanded = expandedJobId===job.id;
          return (
            <div key={job.id} className={`job-brutal ${isProtected?'job-brutal--pinned':job.relevanceTier==='prime'?'job-brutal--prime':''}`}>
              {/* Top meta bar */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#FFFBF0] border-b-[2.5px] border-black text-[11px] font-bold">
                <div className="flex items-center gap-2">
                  {isProtected && <span className="brutal-badge brutal-badge--violet"><ShieldCheck className="w-3 h-3" /> دائمی</span>}
                  {job.relevanceTier==='prime' && <span className="brutal-badge brutal-badge--accent"><Gem className="w-3 h-3" /> طلایی</span>}
                  <span className="px-2 py-1 bg-black text-white border border-black font-black text-[11px]">{job.platform}</span>
                  <span className="hidden sm:flex items-center gap-1 font-mono text-[11px]"><Clock className="w-3 h-3" /> {job.postedTime}</span>
                </div>
                <div className="flex items-center gap-2 mr-auto">
                  <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] bg-white border-[2px] border-black px-2 py-1"><Hash className="w-3 h-3" /> {job.id.slice(0,12)}</span>
                  <span className="px-2.5 py-1 bg-white border-[2px] border-black text-[11px] font-black">{categoryLabel(job.categoryKey)||job.category}</span>
                  <span className="px-3 py-1 bg-[#FFDE03] border-[2.5px] border-black font-mono font-black text-[12px]">{job.budgetFormatted}</span>
                </div>
              </div>

              {/* Title row with expand toggle */}
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] sm:text-[16px] font-black leading-tight flex-1">
                    {job.title}
                    {job.relevanceReason && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-[#00E599] border border-black text-[10px] font-black uppercase">✦ {job.relevanceReason}</span>}
                  </h3>
                  <button onClick={()=>setExpandedJobId(expanded?null:job.id)} className={`shrink-0 w-8 h-8 border-[2px] border-black flex items-center justify-center ${expanded?'bg-black text-white':'bg-white hover:bg-[#FFDE03]'}`}>
                    {expanded? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {expanded ? (
                  <div className="overflow-hidden animate-brutal-in">
                    <p className="mt-3 text-[13px] leading-7 text-[#1a1a1a] bg-[#FFFBF0] border-[2px] border-black p-3">{job.description}</p>
                    {job.clientName && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] font-bold">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border-[2px] border-black"><UserCheck className="w-3.5 h-3.5" /> {job.clientName} ● {job.clientRating}★ ({job.clientReviews})</span>
                        <span className="px-2.5 py-1 bg-[#0066FF] text-white border-[2px] border-black font-mono">پیشنهادها: {job.proposalsCount}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] leading-6 text-[#333] line-clamp-2">{job.description}</p>
                )}

                {/* Tags */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {job.tags.slice(0,6).map((t, idx)=>(
                    <span key={idx} className="brutal-tag">{t}</span>
                  ))}
                  {job.tags.length>6 && <span className="text-[11px] font-mono font-bold">+{job.tags.length-6}</span>}
                  {job.proposalsCount>0 && <span className="mr-auto text-[11px] font-mono font-bold bg-black text-white px-2 py-1 border border-black">{job.proposalsCount.toLocaleString('fa-IR')} پیشنهاد</span>}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t-[2.5px] border-black">
                  <button onClick={()=>onSelectJobForAnalysis(job)} className="brutal-btn brutal-btn--sm bg-white hover:bg-[#0066FF] hover:text-white">
                    <Sparkles className="w-3.5 h-3.5" /> تحلیل
                  </button>
                  <button onClick={()=>onSelectJobForProposal(job)} className="brutal-btn brutal-btn--sm bg-white hover:bg-[#FFDE03]">
                    <FileText className="w-3.5 h-3.5" /> پروپوزال
                  </button>
                  {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="brutal-btn brutal-btn--sm brutal-btn--ghost border-[2px]"><ExternalLink className="w-3.5 h-3.5" /> آگهی</a>}
                  <div className="flex items-center gap-1.5 mr-auto">
                    <button onClick={()=>onTogglePinJob(job.id)} className={`w-8 h-8 border-[2px] border-black flex items-center justify-center ${isProtected?'bg-[#8B5CF6] text-white':'bg-white hover:bg-black hover:text-white'}`}><Pin className="w-4 h-4" /></button>
                    {isProtected && <button onClick={()=>onDeleteManualJob(job.id)} className="w-8 h-8 bg-[#FF3B30] text-white border-[2px] border-black flex items-center justify-center hover:bg-black"><Trash2 className="w-4 h-4" /></button>}
                    <button onClick={()=>onSelectJobForCoding(job)} className="brutal-btn brutal-btn--primary brutal-btn--sm gap-1"><Terminal className="w-3.5 h-3.5" /> استودیو کد <ArrowLeft className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Brutal Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-[720px] bg-white border-[3px] border-black shadow-[8px_8px_0px_0px_#000] overflow-hidden my-6 animate-brutal-in">
            <div className="h-12 bg-black text-white flex items-center justify-between px-4 border-b-[3px] border-black">
              <div className="flex items-center gap-2 font-black text-[13px] tracking-wide uppercase"><Globe className="w-5 h-5 text-[#FFDE03]" /> ثبت و استخراج دائمی — گاوصندوق</div>
              <button onClick={()=>setShowAddModal(false)} className="w-8 h-8 bg-white text-black border-[2px] border-white flex items-center justify-center hover:bg-[#FFDE03]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex border-b-[2.5px] border-black bg-[#FFFBF0] overflow-x-auto">
              {([
                { k: 'url', label: '۱. استخراج از URL', icon: Link2 },
                { k: 'html', label: '۲. پیست HTML', icon: FileCode },
                { k: 'manual', label: '۳. ثبت دستی', icon: Plus },
              ] as const).map(tab=>(
                <button key={tab.k} onClick={()=>setModalTab(tab.k)} className={`flex items-center gap-2 px-4 py-3 font-black text-[12px] uppercase whitespace-nowrap border-r-[2.5px] border-black last:border-0 ${modalTab===tab.k?'bg-[#FFDE03] text-black':'bg-white hover:bg-[#FFFBF0]'}`}>
                  <tab.icon className="w-4 h-4" /> {tab.label}
                </button>
              ))}
            </div>
            <div className="p-5">
              {modalTab==='url' && (
                <form onSubmit={handleScrapeUrl} className="space-y-3">
                  <div className="field-group">
                    <label className="field-group__label">نشانی اینترنتی هدف (URL)</label>
                    <input type="url" required value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://ponisha.ir/project/..." dir="ltr" className="brutal-input !border-0 !shadow-none font-mono text-[13px]" />
                  </div>
                  <button type="submit" disabled={isUrlScraping} className="w-full brutal-btn brutal-btn--primary">
                    <RefreshCw className={`w-4 h-4 ${isUrlScraping?'animate-spin':''}`} /> {isUrlScraping?'در حال استخراج...':'استخراج و ثبت در گاوصندوق'}
                  </button>
                  {urlScrapeResult && <div className={`p-3 border-[2.5px] border-black text-[12px] font-bold ${urlScrapeResult.success?'bg-[#00E599]':'bg-[#FF3B30] text-white'}`}>{urlScrapeResult.message}</div>}
                </form>
              )}
              {modalTab==='html' && (
                <form onSubmit={handleScrapeHtml} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase">پلتفرم سورس:</span>
                    <select value={htmlPlatform} onChange={e=>setHtmlPlatform(e.target.value)} className="brutal-select !h-[36px] !w-auto">
                      <option value="ponisha">پونیشا</option><option value="karlancer">کارلانسر</option><option value="parscoders">پارس‌کدرز</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-group__label">سورس HTML صفحه لیست پروژه‌ها</label>
                    <textarea rows={6} required value={htmlInput} onChange={e=>setHtmlInput(e.target.value)} placeholder="HTML را پیست کنید..." dir="ltr" className="brutal-input !border-0 !shadow-none font-mono text-[12px] min-h-[160px]" />
                  </div>
                  <button type="submit" disabled={isHtmlScraping} className="w-full brutal-btn brutal-btn--primary">
                    <RefreshCw className={`w-4 h-4 ${isHtmlScraping?'animate-spin':''}`} /> {isHtmlScraping?'در حال پردازش...':'استخراج از HTML'}
                  </button>
                  {htmlScrapeResult && <div className={`p-3 border-[2.5px] border-black text-[12px] font-bold ${htmlScrapeResult.success?'bg-[#00E599]':'bg-[#FF3B30] text-white'}`}>{htmlScrapeResult.message}</div>}
                </form>
              )}
              {modalTab==='manual' && (
                <form onSubmit={handleCreateManualJob} className="space-y-3">
                  <div className="field-group">
                    <label className="field-group__label">عنوان پروژه *</label>
                    <input type="text" required value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="مثلاً: طراحی بک‌اند ربات تلگرام..." className="brutal-input !border-0 !shadow-none text-[13px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field-group">
                      <label className="field-group__label">بودجه (تومان)</label>
                      <input type="number" required value={manualBudget} onChange={e=>setManualBudget(e.target.value)} className="brutal-input !border-0 !shadow-none font-mono" />
                    </div>
                    <div className="field-group">
                      <label className="field-group__label">پلتفرم</label>
                      <select value={manualPlatform} onChange={e=>setManualPlatform(e.target.value)} className="brutal-select !border-0 !shadow-none">
                        <option value="پونیشا">پونیشا</option><option value="کارلانسر">کارلانسر</option><option value="پارس‌کدرز">پارس‌کدرز</option><option value="کارفرمای مستقیم">مستقیم</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-group__label">شرح پروژه *</label>
                    <textarea rows={4} required value={manualDesc} onChange={e=>setManualDesc(e.target.value)} placeholder="توضیحات کارفرما..." className="brutal-input !border-0 !shadow-none min-h-[100px] text-[13px]" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>setShowAddModal(false)} className="flex-1 brutal-btn">انصراف</button>
                    <button type="submit" className="flex-1 brutal-btn brutal-btn--primary">ثبت در گاوصندوق</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
