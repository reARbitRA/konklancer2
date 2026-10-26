import React, { useState, useMemo } from 'react';
import {
  Search, ExternalLink, Sparkles, FileText, Clock, UserCheck, Plus, Globe, FileCode, RefreshCw, Link2, Pin, Trash2, Gem, Target, Layers, ShieldCheck, Terminal, ChevronDown, ChevronUp, X, Filter, Tag, Hash, Zap, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeft, DollarSign, Calendar, TrendingUp, Star, Eye, EyeOff, Copy, Check,
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';
import { ALL_CATEGORIES, categoryLabel, detectCategory } from '../../shared/taxonomy';
import { evaluateProjectRelevance } from '../../shared/relevanceEngine';
import { buildJobsFromRows, fetchHtmlSmart, parsePlatformHtmlClient } from '../services/standaloneFeed';
import { BrutalCollapsible } from './brutalist/Collapsible';

type RelevanceFilterMode = 'relevant' | 'prime' | 'saved' | 'all';
type SortBy = 'default' | 'time' | 'price' | 'type';
type SortDir = 'asc' | 'desc';
type SortConfig = { by: SortBy; dir: SortDir };

interface JobHunterProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onAddNewManualJob: (job: Partial<FreelanceJob>) => Promise<void> | void;
  onTogglePinJob: (jobId: string) => void;
  onDeleteManualJob: (jobId: string) => void;
}

// ──────────────────────────────────────────────────────────────
// SORT HELPERS — Time / Type / Price
// ──────────────────────────────────────────────────────────────
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function faToEn(str: string): string {
  return str.replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)));
}
function parsePostedTimeMinutes(postedTime: string, scrapedAt?: string): number {
  const raw = faToEn(postedTime || '').trim().toLowerCase();
  if (!raw) {
    if (scrapedAt) {
      const t = Date.parse(scrapedAt);
      if (!Number.isNaN(t)) return Math.max(0, Math.round((Date.now() - t) / 60000));
    }
    return 999999;
  }
  if (raw.includes('هم‌اکنون') || raw.includes('همین حالا') || raw.includes('لحظاتی پیش') || raw === 'الان') return 0;
  if (raw.includes('امروز')) return 5;
  if (raw.includes('دیروز')) return 1440;
  // e.g. "۲۷ دقیقه پیش" / "3 ساعت پیش" / "2 روز پیش"
  const numMatch = raw.match(/(\d+(?:\.\d+)?)/);
  const num = numMatch ? parseFloat(numMatch[1]) : 0;
  if (raw.includes('ثانیه')) return Math.max(0, num / 60);
  if (raw.includes('دقیقه')) return num;
  if (raw.includes('ساعت')) return num * 60;
  if (raw.includes('روز')) return num * 1440;
  if (raw.includes('هفته')) return num * 10080;
  if (raw.includes('ماه')) return num * 43200;
  // fallback: try to parse absolute date like "1403/07/12"
  if (scrapedAt) {
    const t = Date.parse(scrapedAt);
    if (!Number.isNaN(t)) return Math.max(0, Math.round((Date.now() - t) / 60000));
  }
  return 999999;
}

function getTypeRank(job: FreelanceJob): string {
  // Sortable string: platformKey + categoryKey ensures stable grouping
  return `${job.platformKey}__${job.categoryKey}__${job.categorizedTag || ''}`.toLowerCase();
}

function formatRelativeMinutes(mins: number): string {
  if (mins < 1) return 'هم‌اکنون';
  if (mins < 60) return `${Math.round(mins).toLocaleString('fa-IR')} دقیقه پیش`;
  if (mins < 1440) return `${Math.round(mins / 60).toLocaleString('fa-IR')} ساعت پیش`;
  return `${Math.round(mins / 1440).toLocaleString('fa-IR')} روز پیش`;
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
  const [expandedAll, setExpandedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── SORTING SYSTEM ──
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    try {
      const saved = localStorage.getItem('konklancer_sort_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { by: 'default', dir: 'desc' };
  });

  const setSort = (by: SortBy, dir?: SortDir) => {
    setSortConfig(prev => {
      const nextDir = dir ?? (prev.by === by ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc');
      const next = { by, dir: nextDir };
      try { localStorage.setItem('konklancer_sort_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const enrichedJobs = jobs.map((job) => {
    if (job.relevanceTier) return job;
    const rel = evaluateProjectRelevance(job.title, job.description, job.categoryKey, job.tags);
    return { ...job, relevanceTier: rel.tier, relevanceScore: rel.relevanceScore, relevanceReason: rel.reason };
  });

  const hiddenJunkCount = enrichedJobs.filter((j) => !j.isManual && !j.pinned && j.relevanceTier === 'junk').length;
  const primeCount = enrichedJobs.filter((j) => j.isManual || j.pinned || j.relevanceTier === 'prime').length;
  const savedCount = enrichedJobs.filter((j) => j.isManual || j.pinned).length;
  const relevantCount = enrichedJobs.filter((j) => j.isManual || j.pinned || j.relevanceTier !== 'junk').length;

  const filteredJobs = useMemo(() => enrichedJobs.filter((job) => {
    const isSaved = Boolean(job.isManual || job.pinned);
    if (relevanceFilter === 'saved' && !isSaved) return false;
    if (relevanceFilter === 'prime' && !isSaved && job.relevanceTier !== 'prime') return false;
    if (relevanceFilter === 'relevant' && !isSaved && job.relevanceTier === 'junk') return false;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || job.title.toLowerCase().includes(q) || job.description.toLowerCase().includes(q) || job.tags.some((t) => t.toLowerCase().includes(q)) || job.category.toLowerCase().includes(q);
    const matchesPlatform = selectedPlatform === 'all' || job.platformKey === selectedPlatform;
    const matchesCategory = selectedCategory === 'all' || job.categoryKey === selectedCategory;
    return matchesSearch && matchesPlatform && matchesCategory;
  }), [enrichedJobs, relevanceFilter, searchQuery, selectedPlatform, selectedCategory]);

  // ── SORTED JOBS ──
  const sortedJobs = useMemo(() => {
    if (sortConfig.by === 'default') return filteredJobs;
    const arr = [...filteredJobs];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortConfig.by === 'time') {
        const ta = parsePostedTimeMinutes(a.postedTime, a.scrapedAt);
        const tb = parsePostedTimeMinutes(b.postedTime, b.scrapedAt);
        cmp = ta - tb; // smaller = newer
      } else if (sortConfig.by === 'price') {
        cmp = (a.budget || 0) - (b.budget || 0);
      } else if (sortConfig.by === 'type') {
        const ra = getTypeRank(a);
        const rb = getTypeRank(b);
        cmp = ra.localeCompare(rb, 'fa');
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredJobs, sortConfig]);

  const handleCopyId = async (id: string) => {
    try { await navigator.clipboard.writeText(id); } catch { const ta = document.createElement('textarea'); ta.value = id; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setCopiedId(id); setTimeout(() => setCopiedId(null), 1500);
  };

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

  // Sorting label helper
  const sortLabel: Record<SortBy, string> = { default: 'پیش‌فرض', time: 'زمان', price: 'قیمت', type: 'نوع' };
  const activeSortCount = sortConfig.by !== 'default' ? `● ${sortLabel[sortConfig.by]} ${sortConfig.dir === 'desc' ? '↓' : '↑'}` : '';

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Brutal header stats */}
      <div className="brutal-panel">
        <div className="brutal-header brutal-header--ink">
          <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#FFDE03]" /> رادار هوشمند شکار و دسته‌بندی پروژه‌ها</span>
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2 py-1 bg-[#FFDE03] text-black border-[2px] border-white text-[11px] font-black">{sortedJobs.length.toLocaleString('fa-IR')} پروژه {activeSortCount && <span className="mr-1 opacity-70">{activeSortCount}</span>}</span>
            <button onClick={() => setShowFilters(!showFilters)} className="px-2 py-1 bg-white text-black border-[2px] border-black text-[11px] font-black flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> {showFilters ? 'بستن فیلتر' : 'فیلترها'} {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </span>
        </div>
        <div className="p-3 bg-[#FFFBF0] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-[#333]">اسکن چندمنبعی با استخراج بودجه‌های پنهان، فیلتر نویز، و گاوصندوق دائمی</p>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 text-[11px] font-mono bg-white border-[2px] border-black px-2 py-1">
              <span className="opacity-60">مرتب‌سازی:</span> <span className="font-black">{sortLabel[sortConfig.by]}</span> <ArrowUpDown className="w-3 h-3" />
            </div>
            <button onClick={() => { setShowAddModal(true); setModalTab('url'); setUrlScrapeResult(null); setHtmlScrapeResult(null); }} className="brutal-btn brutal-btn--primary brutal-btn--sm gap-1.5">
              <Plus className="w-4 h-4" /> افزودن پروژه جدید
            </button>
          </div>
        </div>
      </div>

      {/* SORTING SYSTEM — Adjustable by Time / Type / Price */}
      <div className="brutal-panel overflow-hidden">
        <div className="brutal-header bg-[#FFDE03] text-black flex items-center justify-between">
          <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> سیستم مرتب‌سازی هوشمند — قابل تنظیم بر اساس زمان / نوع / قیمت</span>
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline text-[10px] font-mono bg-black text-white px-2 py-1 border border-black">FRONTEND SORT ● BACKEND SAFE</span>
            {sortConfig.by !== 'default' && (
              <button onClick={() => setSort('default')} className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-black hover:bg-black hover:text-white">بازنشانی</button>
            )}
          </div>
        </div>
        <div className="p-3 bg-white grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Time */}
          <button
            onClick={() => setSort('time')}
            className={`flex items-center justify-between p-3 border-[2.5px] border-black text-right transition-all ${sortConfig.by === 'time' ? 'bg-black text-white shadow-[3px_3px_0px_0px_#000]' : 'bg-[#FFFBF0] hover:bg-[#FFDE03] text-black'}`}
          >
            <div>
              <div className="flex items-center gap-2 text-[12px] font-black"><Clock className="w-4 h-4" /> زمان انتشار</div>
              <div className="text-[11px] opacity-70 font-medium mt-0.5">جدیدترین → قدیمی‌ترین</div>
            </div>
            <div className={`w-8 h-8 border-[2px] flex items-center justify-center shrink-0 ${sortConfig.by === 'time' ? 'bg-[#FFDE03] text-black border-white' : 'bg-white border-black'}`}>
              {sortConfig.by === 'time' ? (sortConfig.dir === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />) : <Calendar className="w-4 h-4" />}
            </div>
          </button>
          {/* Type */}
          <button
            onClick={() => setSort('type')}
            className={`flex items-center justify-between p-3 border-[2.5px] border-black text-right transition-all ${sortConfig.by === 'type' ? 'bg-[#0066FF] text-white shadow-[3px_3px_0px_0px_#000]' : 'bg-[#FFFBF0] hover:bg-[#E8F0FF] text-black'}`}
          >
            <div>
              <div className="flex items-center gap-2 text-[12px] font-black"><Tag className="w-4 h-4" /> نوع / دسته‌بندی</div>
              <div className="text-[11px] opacity-70 font-medium mt-0.5">پلتفرم + دسته (الفبا)</div>
            </div>
            <div className={`w-8 h-8 border-[2px] flex items-center justify-center shrink-0 ${sortConfig.by === 'type' ? 'bg-white text-black border-white' : 'bg-white border-black'}`}>
              {sortConfig.by === 'type' ? (sortConfig.dir === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />) : <Layers className="w-4 h-4" />}
            </div>
          </button>
          {/* Price */}
          <button
            onClick={() => setSort('price')}
            className={`flex items-center justify-between p-3 border-[2.5px] border-black text-right transition-all ${sortConfig.by === 'price' ? 'bg-[#00E599] text-black shadow-[3px_3px_0px_0px_#000]' : 'bg-[#FFFBF0] hover:bg-[#E0FFF5] text-black'}`}
          >
            <div>
              <div className="flex items-center gap-2 text-[12px] font-black"><DollarSign className="w-4 h-4" /> قیمت / بودجه</div>
              <div className="text-[11px] opacity-70 font-medium mt-0.5">کم → زیاد / زیاد → کم</div>
            </div>
            <div className={`w-8 h-8 border-[2px] flex items-center justify-center shrink-0 ${sortConfig.by === 'price' ? 'bg-black text-white border-white' : 'bg-white border-black'}`}>
              {sortConfig.by === 'price' ? (sortConfig.dir === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />) : <TrendingUp className="w-4 h-4" />}
            </div>
          </button>
        </div>
        {/* Quick dir toggle + expand all */}
        <div className="px-3 pb-3 bg-white flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <span className="px-2 py-1 bg-black text-white border border-black">جهت:</span>
            <button onClick={() => setSortConfig(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))} className="px-3 py-1 bg-white border-[2px] border-black hover:bg-black hover:text-white flex items-center gap-1">
              {sortConfig.dir === 'desc' ? <><ArrowDown className="w-3.5 h-3.5" /> نزولی (زیاد → کم)</> : <><ArrowUp className="w-3.5 h-3.5" /> صعودی (کم → زیاد)</>}
            </button>
          </div>
          <div className="flex items-center gap-1 mr-auto">
            <button onClick={() => setExpandedAll(!expandedAll)} className="px-3 py-1.5 bg-white border-[2px] border-black text-[11px] font-black flex items-center gap-1 hover:bg-[#FFDE03]">
              {expandedAll ? <><EyeOff className="w-3.5 h-3.5" /> بستن همه</> : <><Eye className="w-3.5 h-3.5" /> بازکردن همه جزئیات</>}
            </button>
            <span className="hidden sm:inline text-[11px] font-mono bg-[#FFFBF0] border border-black px-2 py-1">{sortedJobs.length.toLocaleString('fa-IR')} مورد مرتب‌شده</span>
          </div>
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

      {/* Efficient Project Grid — 1 col mobile, 2 col desktop, expandable details */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {sortedJobs.length===0 ? (
          <div className="xl:col-span-2 brutal-panel p-10 text-center bg-white">
            <div className="w-16 h-16 mx-auto bg-[#FFDE03] border-[2.5px] border-black flex items-center justify-center mb-4"><Search className="w-8 h-8" /></div>
            <p className="text-[14px] font-black">هیچ پروژه‌ای مطابق فیلترها یافت نشد</p>
            <button onClick={()=>{setSearchQuery(''); setSelectedPlatform('all'); setSelectedCategory('all'); setRelevanceFilter('relevant');}} className="mt-3 brutal-btn brutal-btn--sm">بازنشانی فیلترها</button>
          </div>
        ) : sortedJobs.map(job=>{
          const isProtected = Boolean(job.isManual || job.pinned);
          const isExpanded = expandedAll || expandedJobId===job.id;
          const timeMins = parsePostedTimeMinutes(job.postedTime, job.scrapedAt);
          return (
            <div key={job.id} className={`job-brutal flex flex-col ${isProtected?'job-brutal--pinned':job.relevanceTier==='prime'?'job-brutal--prime':''} ${isExpanded ? 'xl:col-span-2' : ''}`}>
              {/* Compact Header — always visible */}
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-[#FFFBF0] border-b-[2.5px] border-black text-[11px] font-bold leading-none">
                <span className="px-2 py-1 bg-black text-white border border-black text-[10px]">{job.platform}</span>
                <span className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-black truncate max-w-[140px]">{categoryLabel(job.categoryKey)||job.category}</span>
                {isProtected && <span className="brutal-badge brutal-badge--violet !h-[20px] !px-1.5"><ShieldCheck className="w-3 h-3" /> دائمی</span>}
                {job.relevanceTier==='prime' && <span className="brutal-badge brutal-badge--accent !h-[20px]"><Gem className="w-3 h-3" /> طلایی</span>}
                <span className="hidden sm:flex items-center gap-1 font-mono text-[10px] bg-white border border-black px-1.5 py-1"><Clock className="w-3 h-3" /> {job.postedTime}</span>
                <span className="mr-auto px-2.5 py-1 bg-[#FFDE03] border-[2px] border-black font-mono font-black text-[11px]">{job.budgetFormatted}</span>
              </div>

              {/* Title + quick meta — efficient */}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13px] font-black leading-5 line-clamp-2 flex-1">
                    {job.title}
                    {job.relevanceReason && <span className="mr-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#00E599] border border-black text-[9px] font-black uppercase align-middle">✦ {job.relevanceReason}</span>}
                  </h3>
                  <button
                    onClick={()=> setExpandedJobId(isExpanded && !expandedAll ? null : job.id)}
                    className={`shrink-0 w-7 h-7 border-[2px] border-black flex items-center justify-center ${isExpanded?'bg-black text-white':'bg-white hover:bg-[#FFDE03]'}`}
                    title={isExpanded ? 'بستن جزئیات' : 'نمایش جزئیات کامل'}
                  >
                    {isExpanded? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Compact tags row */}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {job.tags.slice(0, 4).map((t, idx)=>(
                    <span key={idx} className="brutal-tag !h-[18px] !text-[10px] !px-1.5">{t}</span>
                  ))}
                  {job.tags.length>4 && <span className="text-[10px] font-mono font-bold">+{job.tags.length-4}</span>}
                  <span className="mr-auto flex items-center gap-1">
                    <span className="text-[10px] font-mono bg-black text-white px-1.5 py-0.5 border border-black">{job.proposalsCount.toLocaleString('fa-IR')} پیشنهاد</span>
                    <span className="hidden sm:inline text-[10px] font-mono bg-white border border-black px-1.5 py-0.5">{timeMins < 1440 ? formatRelativeMinutes(timeMins) : job.postedTime}</span>
                  </span>
                </div>

                {/* Collapsed preview line */}
                {!isExpanded && (
                  <p className="mt-2 text-[12px] leading-5 text-[#333] line-clamp-2 bg-white/50">{job.description}</p>
                )}

                {/* Expanded Details — full efficiency */}
                {isExpanded && (
                  <div className="mt-3 space-y-3 animate-brutal-in">
                    <p className="text-[13px] leading-7 text-[#1a1a1a] bg-[#FFFBF0] border-[2px] border-black p-3 whitespace-pre-wrap">{job.description}</p>

                    {/* Backend-safe metadata grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-white border-[2px] border-black p-2">
                        <div className="font-black flex items-center gap-1"><UserCheck className="w-3 h-3" /> کارفرما</div>
                        <div className="font-bold mt-1 truncate">{job.clientName}</div>
                        <div className="flex items-center gap-1 mt-1"><Star className="w-3 h-3 fill-black" /> {job.clientRating} <span className="opacity-60">({job.clientReviews})</span></div>
                      </div>
                      <div className="bg-white border-[2px] border-black p-2">
                        <div className="font-black flex items-center gap-1"><Clock className="w-3 h-3" /> مهلت</div>
                        <div className="font-mono font-bold mt-1">{job.deadline}</div>
                        <div className="text-[10px] opacity-60 mt-1">ارسال: {job.postedTime}</div>
                      </div>
                      <div className="bg-white border-[2px] border-black p-2">
                        <div className="font-black flex items-center gap-1"><DollarSign className="w-3 h-3" /> بودجه</div>
                        <div className="font-mono font-black mt-1">{job.budgetFormatted}</div>
                        <div className="text-[10px] opacity-60 mt-1">میانگین: {job.avgBid.toLocaleString('fa-IR')} ت</div>
                      </div>
                      <div className="bg-white border-[2px] border-black p-2">
                        <div className="font-black flex items-center gap-1"><Hash className="w-3 h-3" /> شناسه</div>
                        <div className="font-mono text-[10px] mt-1 truncate flex items-center gap-1">
                          {job.id.slice(0, 16)}
                          <button onClick={() => handleCopyId(job.id)} className="p-0.5 border border-black bg-white hover:bg-black hover:text-white">
                            {copiedId === job.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="text-[10px] opacity-60 mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {job.proposalsCount} پیشنهاد</div>
                      </div>
                    </div>

                    {/* Tags full + deadline + source */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {job.tags.map((t, idx)=>(
                        <span key={idx} className="brutal-tag">{t}</span>
                      ))}
                      {job.score !== undefined && <span className="px-2 py-1 bg-[#FFDE03] border-[2px] border-black text-[11px] font-black">امتیاز: {job.score}</span>}
                      {job.source && <span className="px-2 py-1 bg-white border border-black text-[10px] font-mono">منبع: {job.source}</span>}
                      {job.url && <span className="px-2 py-1 bg-[#0066FF] text-white border border-black text-[10px] font-bold truncate max-w-[200px]">لینک: {job.url.slice(0, 32)}…</span>}
                    </div>

                    {/* Client extra */}
                    {job.clientName && (
                      <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border-[2px] border-black"><UserCheck className="w-3.5 h-3.5" /> {job.clientName} ● {job.clientRating}★ ({job.clientReviews})</span>
                        <span className="px-2.5 py-1 bg-[#0066FF] text-white border-[2px] border-black font-mono">پیشنهادها: {job.proposalsCount}</span>
                        <span className="px-2.5 py-1 bg-black text-white border-[2px] border-black font-mono text-[11px]">ددلاین: {job.deadline}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions — always visible, compact */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t-[2.5px] border-black">
                  <button onClick={()=>onSelectJobForAnalysis(job)} className="brutal-btn brutal-btn--sm !h-[30px] !px-2 !text-[11px] bg-white hover:bg-[#0066FF] hover:text-white">
                    <Sparkles className="w-3.5 h-3.5" /> تحلیل
                  </button>
                  <button onClick={()=>onSelectJobForProposal(job)} className="brutal-btn brutal-btn--sm !h-[30px] !px-2 !text-[11px] bg-white hover:bg-[#FFDE03]">
                    <FileText className="w-3.5 h-3.5" /> پروپوزال
                  </button>
                  {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="brutal-btn brutal-btn--sm brutal-btn--ghost !h-[30px] !px-2 !text-[11px] border-[2px]"><ExternalLink className="w-3.5 h-3.5" /> آگهی</a>}
                  <div className="flex items-center gap-1 mr-auto">
                    <button onClick={()=>onTogglePinJob(job.id)} className={`w-7 h-7 border-[2px] border-black flex items-center justify-center ${isProtected?'bg-[#8B5CF6] text-white':'bg-white hover:bg-black hover:text-white'}`} title={isProtected ? 'برداشتن سنجاق' : 'سنجاق دائمی'}><Pin className="w-3.5 h-3.5" /></button>
                    {isProtected && <button onClick={()=>onDeleteManualJob(job.id)} className="w-7 h-7 bg-[#FF3B30] text-white border-[2px] border-black flex items-center justify-center hover:bg-black"><Trash2 className="w-3.5 h-3.5" /></button>}
                    <button onClick={()=>onSelectJobForCoding(job)} className="brutal-btn brutal-btn--primary brutal-btn--sm !h-[30px] !px-2.5 !text-[11px] gap-1"><Terminal className="w-3.5 h-3.5" /> استودیو <ArrowLeft className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Brutal Add Modal — untouched, backend-safe */}
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
