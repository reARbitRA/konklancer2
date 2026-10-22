import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  Sparkles, 
  FileText, 
  Code2, 
  Clock, 
  UserCheck, 
  Plus, 
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Globe,
  FileCode,
  RefreshCw,
  AlertCircle,
  Check,
  Link2,
  HelpCircle,
  Copy
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';
import { ALL_CATEGORIES, categoryLabel, categoryAiFit, detectCategory } from '../../shared/taxonomy';

interface JobHunterProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onAddNewManualJob: (job: Partial<FreelanceJob>) => void;
}

export const JobHunter: React.FC<JobHunterProps> = ({
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onAddNewManualJob,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Tab: 'url' | 'html' | 'manual'
  const [modalTab, setModalTab] = useState<'url' | 'html' | 'manual'>('url');

  // URL Scraper state
  const [urlInput, setUrlInput] = useState('https://ponisha.ir/search/projects');
  const [isUrlScraping, setIsUrlScraping] = useState(false);
  const [urlScrapeResult, setUrlScrapeResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
    cloudflareBlocked?: boolean;
    extractedTitles?: string[];
  } | null>(null);

  // HTML Source Scraper state
  const [htmlInput, setHtmlInput] = useState('');
  const [htmlPlatform, setHtmlPlatform] = useState('ponisha');
  const [isHtmlScraping, setIsHtmlScraping] = useState(false);
  const [htmlScrapeResult, setHtmlScrapeResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
    extractedTitles?: string[];
  } | null>(null);

  // Manual job form state
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualBudget, setManualBudget] = useState('3000000');
  const [manualPlatform, setManualPlatform] = useState('پونیشا');

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPlatform =
      selectedPlatform === 'all' || job.platformKey === selectedPlatform;

    const matchesCategory =
      selectedCategory === 'all' || job.categoryKey === selectedCategory;

    return matchesSearch && matchesPlatform && matchesCategory;
  });

  const handleCreateManualJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDesc.trim()) return;

    const budgetNum = parseInt(manualBudget) || 3000000;
    onAddNewManualJob({
      id: `custom-${Date.now()}`,
      title: manualTitle,
      description: manualDesc,
      budget: budgetNum,
      budgetFormatted: `${budgetNum.toLocaleString('fa-IR')} تومان`,
      platform: manualPlatform,
      platformKey: manualPlatform.includes('کارلانسر') ? 'karlancer' : manualPlatform.includes('پارسکدرز') ? 'parskoders' : 'ponisha',
      clientName: 'کارفرمای اختصاصی',
      clientRating: 5.0,
      clientReviews: 10,
      deadline: 'امروز',
      postedTime: 'هم‌اکنون',
      category: categoryLabel(detectCategory(manualTitle, manualDesc).key),
      categoryKey: detectCategory(manualTitle, manualDesc).key,
      tags: ['Custom Job', 'Instant AI'],
      proposalsCount: 1,
      avgBid: budgetNum,
      status: 'new',
    });

    setManualTitle('');
    setManualDesc('');
    setShowAddModal(false);
  };

  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsUrlScraping(true);
    setUrlScrapeResult(null);

    try {
      const res = await fetch('/api/scraper/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUrlScrapeResult({
          success: false,
          message: data.error || 'خطا در واکشی نشانی اینترنتی.',
          cloudflareBlocked: Boolean(data.cloudflareBlocked),
        });
        return;
      }

      const projects = data.projects || [];
      projects.forEach((p: any) => {
        onAddNewManualJob({
          id: p.id,
          title: p.title,
          description: p.description,
          budget: p.budget,
          budgetFormatted: p.budgetFormatted,
          platform: p.platform,
          platformKey: p.platformKey,
          url: p.url,
          category: p.category,
          categoryKey: p.categoryKey,
          tags: p.tags,
          proposalsCount: p.bidsCount,
          avgBid: p.budget,
          status: 'new',
          postedTime: 'هم‌اکنون',
          clientName: 'کارفرمای فریلنسری',
          clientRating: 4.9,
          clientReviews: 8,
          deadline: '۳ روز',
        });
      });

      setUrlScrapeResult({
        success: true,
        count: projects.length,
        message: `${projects.length} پروژه با موفقیت از نشانی ${data.url} استخراج شد و به رادار افزوده شد!`,
        extractedTitles: projects.map((p: any) => p.title),
      });
    } catch (err: any) {
      setUrlScrapeResult({
        success: false,
        message: err.message || 'خطا در برقراری ارتباط با سرور',
      });
    } finally {
      setIsUrlScraping(false);
    }
  };

  const handleScrapeHtml = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!htmlInput.trim()) return;

    setIsHtmlScraping(true);
    setHtmlScrapeResult(null);

    try {
      const res = await fetch('/api/scraper/parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: htmlInput.trim(),
          platform: htmlPlatform,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setHtmlScrapeResult({
          success: false,
          message: data.error || 'خطا در تجزیه سورس صفحه.',
        });
        return;
      }

      const projects = data.projects || [];
      projects.forEach((p: any) => {
        onAddNewManualJob({
          id: p.id,
          title: p.title,
          description: p.description,
          budget: p.budget,
          budgetFormatted: p.budgetFormatted,
          platform: p.platform,
          platformKey: p.platformKey,
          url: p.url,
          category: p.category,
          categoryKey: p.categoryKey,
          tags: p.tags,
          proposalsCount: p.bidsCount,
          avgBid: p.budget,
          status: 'new',
          postedTime: 'هم‌اکنون',
          clientName: 'کارفرمای فریلنسری',
          clientRating: 4.9,
          clientReviews: 8,
          deadline: '۳ روز',
        });
      });

      setHtmlScrapeResult({
        success: true,
        count: projects.length,
        message: `${projects.length} پروژه با موفقیت از سورس کپی‌شده استخراج شد و به رادار پیوست!`,
        extractedTitles: projects.map((p: any) => p.title),
      });
      setHtmlInput('');
    } catch (err: any) {
      setHtmlScrapeResult({
        success: false,
        message: err.message || 'خطا در ارتباط با سرور',
      });
    } finally {
      setIsHtmlScraping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editorial headline & quick metrics bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            شکار هوشمند پروژه‌های فریلنسری
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            پایش لحظه‌ای پونیشا، کارلانسر و پارسکدرز · فیلتر پروژه‌های ۱۰۰٪ قابل انجام با هوش مصنوعی
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowAddModal(true);
              setModalTab('url');
              setUrlScrapeResult(null);
              setHtmlScrapeResult(null);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl text-xs shadow-md shadow-emerald-950 transition-all active:scale-95 border border-emerald-400/30"
          >
            <Globe className="h-4 w-4" />
            <span>استخراج و شکار پروژه (URL / سورس / دستی)</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Search */}
        <div className="md:col-span-5 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان، پایتون، وب اسکرپینگ، ربات تلگرام..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-9 pl-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        {/* Platform segmented buttons */}
        <div className="md:col-span-7 flex flex-wrap items-center gap-1.5 justify-start md:justify-end">
          <span className="text-[11px] text-slate-400 ml-1">پلتفرم:</span>
          {(
            [
              { key: 'all', label: 'همه پلتفرم‌ها' },
              { key: 'ponisha', label: 'پونیشا' },
              { key: 'karlancer', label: 'کارلانسر' },
              { key: 'parskoders', label: 'پارسکدرز' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setSelectedPlatform(item.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedPlatform === item.key
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 bg-slate-900/60 hover:text-slate-200 border border-slate-850'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter Pills — از shared/taxonomy.json ساخته می‌شود: هر چیزی که AI می‌تواند تولید کند */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-slate-400 ml-2">دسته‌بندی کارها:</span>
        {[
          { key: 'all' as CategoryKey, label: 'همه' },
          ...ALL_CATEGORIES.filter((category) => category.key !== 'other').map((category) => ({
            key: category.key as CategoryKey,
            label: category.fa,
            aiFit: category.aiFit,
          })),
        ].map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              selectedCategory === cat.key
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 bg-slate-900 hover:text-slate-300 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
            <p className="text-sm text-slate-400">هیچ پروژه‌ای مطابق فیلترهای انتخاب شده یافت نشد.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedPlatform('all');
                setSelectedCategory('all');
              }}
              className="mt-3 text-xs text-emerald-400 hover:underline"
            >
              پاک‌سازی فیلترها
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              className="group border border-slate-800 bg-slate-900/70 hover:border-slate-700/80 rounded-xl p-5 transition-all space-y-4"
            >
              {/* Header row: Platform, timing, and budget */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">{job.platform}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {job.postedTime}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    {job.clientName} ({job.clientRating} ★)
                  </span>
                </div>

                {/* Budget, Priority and Categorized Tag */}
                <div className="flex items-center gap-2">
                  {job.priority && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        job.priority === 'High'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : job.priority === 'Medium'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {job.priority === 'High' ? 'بالا' : job.priority === 'Medium' ? 'متوسط' : 'پایین'}
                    </span>
                  )}

                  {(job.categoryKey || job.category) && (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] border bg-indigo-500/10 text-indigo-200 border-indigo-500/30"
                      title={`دسته‌ی کار · تناسب با AI: ${categoryAiFit(job.categoryKey)}/10`}
                    >
                      {categoryLabel(job.categoryKey) || job.category}
                    </span>
                  )}

                  {typeof job.score === 'number' && (
                    <span
                      title={job.scoreReasons?.join(' · ') ?? undefined}
                      className="rounded border border-slate-700/80 bg-slate-800/70 px-2 py-0.5 font-mono text-[10px] text-slate-300"
                    >
                      امتیاز فید: {job.score.toLocaleString('fa-IR')}
                    </span>
                  )}

                  <span className="text-xs text-slate-400">بودجه کارفرما:</span>
                  <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                    {job.budgetFormatted}
                  </span>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <h3 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  {job.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300 line-clamp-2">
                  {job.description}
                </p>
              </div>

              {/* Tags unboxed text metadata */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1">
                <span className="text-slate-400">تکنولوژی‌های پروژه:</span>
                {job.tags.map((tag, idx) => (
                  <span key={idx} className="font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
                <span className="mr-auto font-mono text-[11px] text-slate-400">
                  {job.proposalsCount} پیشنهاد ثبت‌شده · میانگین: {job.avgBid.toLocaleString('fa-IR')} تومان
                </span>
              </div>

              {/* Action Buttons row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  {/* Analysis Button */}
                  <button
                    onClick={() => onSelectJobForAnalysis(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                    <span>تحلیل هوش مصنوعی</span>
                  </button>

                  {/* Proposal Button */}
                  <button
                    onClick={() => onSelectJobForProposal(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-400" />
                    <span>نگارش پروپوزال</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Open the original listing (SPEC-004: پروژه‌ها از اسکنر عمومی می‌آیند) */}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      <span>صفحه‌ی پروژه</span>
                    </a>
                  )}

                  {/* Start Agent Code Solution */}
                  <button
                    onClick={() => onSelectJobForCoding(job)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-lg text-xs shadow-sm transition-all active:scale-95"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>کدنویسی خودکار با ایجنت</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Comprehensive Project Extraction & Ingestion Studio */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>استخراج و شکار پروژه (پونیشا، کارلانسر، پارسکدرز)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      Live Ingest
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    استخراج خودکار از آدرس اینترنتی، پیست مستقیم سورس HTML یا ثبت دستی پروژه
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setModalTab('url')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
                  modalTab === 'url'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span>۱. استخراج از آدرس صفحه (URL)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('html')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
                  modalTab === 'html'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>۲. پیست سورس HTML (تضمینی پونیشا)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('manual')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
                  modalTab === 'manual'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>۳. ثبت دستی تکی پروژه</span>
              </button>
            </div>

            <div className="p-6">
              {/* TAB 1: URL Scraper */}
              {modalTab === 'url' && (
                <form onSubmit={handleScrapeUrl} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>آدرس اینترنتی صفحه پروژه‌ها یا تک‌پروژه:</span>
                      </span>
                    </label>
                    <input
                      type="url"
                      required
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://ponisha.ir/search/projects"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500 shadow-inner"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 block">نمونه آدرس‌های آماده برای تست سریع:</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'پونیشا: پروژه‌ها', url: 'https://ponisha.ir/search/projects' },
                        { label: 'کارلانسر: پروژه‌ها', url: 'https://karlancer.com/projects' },
                        { label: 'پارسکدرز: پروژه‌ها', url: 'https://parscoders.com/project' },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setUrlInput(item.url);
                            setUrlScrapeResult(null);
                          }}
                          className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700/80 transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isUrlScraping || !urlInput.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white disabled:opacity-50 transition-all shadow-md shadow-emerald-950"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isUrlScraping ? 'animate-spin' : ''}`} />
                      <span>{isUrlScraping ? 'در حال اتصال به سایت و استخراج پروژه‌ها...' : 'شکار و استخراج هوشمند پروژه‌ها'}</span>
                    </button>
                  </div>

                  {/* Scrape Result Alert */}
                  {urlScrapeResult && (
                    <div
                      className={`p-4 rounded-xl text-xs space-y-2 ${
                        urlScrapeResult.success
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                          : urlScrapeResult.cloudflareBlocked
                          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {urlScrapeResult.success ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <p className="font-semibold leading-relaxed">{urlScrapeResult.message}</p>
                          {urlScrapeResult.cloudflareBlocked && (
                            <div className="pt-2 text-slate-300 space-y-2">
                              <p className="text-[11px] leading-relaxed text-amber-300">
                                💡 سایت مقصد به دلیل تدابیر ضدبات/کلودفلر، دسترسی سرور را مسدود کرده است.
                                <strong> بهترین و سریع‌ترین راهکار بدون مسدودی:</strong> به تب «۲. پیست سورس HTML» بروید؛ کافیست در مرورگر خود صفحه پونیشا را باز کرده، Ctrl+U را بزنید، سورس صفحه را کپی و پیست کنید تا پروژه‌ها در یک ثانیه روی رادار قرار گیرند!
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalTab('html');
                                  setHtmlPlatform('ponisha');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all"
                              >
                                انتقال به تب پیست سورس HTML ←
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {urlScrapeResult.extractedTitles && urlScrapeResult.extractedTitles.length > 0 && (
                        <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                          <span className="text-[10px] text-emerald-400 block font-semibold">پروژه‌های اضافه‌شده به رادار:</span>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300 max-h-32 overflow-y-auto">
                            {urlScrapeResult.extractedTitles.map((t, idx) => (
                              <li key={idx} className="truncate">{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}

              {/* TAB 2: HTML Source Paste (Guaranteed for Ponisha) */}
              {modalTab === 'html' && (
                <form onSubmit={handleScrapeHtml} className="space-y-4">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      <span>راهکار ۱۰۰٪ تضمینی برای پونیشا، کارلانسر و پارسکدرز:</span>
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      ۱. در مرورگر خود صفحه پروژه‌های پونیشا (<a href="https://ponisha.ir/search/projects" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">ponisha.ir</a>) را باز کنید.
                      <br />
                      ۲. کلیدهای <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">Ctrl+U</kbd> یا کلیک راست روی صفحه و گزینه <strong>View Page Source</strong> را بزنید.
                      <br />
                      ۳. کل متن را با <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">Ctrl+A</kbd> و سپس <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">Ctrl+C</kbd> کپی کرده و در کادر زیر پیست کنید:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">پلتفرم مبدأ:</label>
                      <select
                        value={htmlPlatform}
                        onChange={(e) => setHtmlPlatform(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="ponisha">پونیشا (Ponisha)</option>
                        <option value="karlancer">کارلانسر (Karlancer)</option>
                        <option value="parscoders">پارسکدرز (Parscoders)</option>
                        <option value="generic">سایر سایت‌های فریلنسری</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 block">سورس HTML یا متن کامل صفحه:</label>
                    <textarea
                      required
                      rows={6}
                      value={htmlInput}
                      onChange={(e) => setHtmlInput(e.target.value)}
                      placeholder="<!DOCTYPE html> ... سورس کامل صفحه را اینجا پیست کنید ..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 dir-ltr text-left focus:outline-none focus:border-emerald-500 shadow-inner"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isHtmlScraping || !htmlInput.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white disabled:opacity-50 transition-all shadow-md shadow-indigo-950"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isHtmlScraping ? 'animate-spin' : ''}`} />
                      <span>{isHtmlScraping ? 'در حال پردازش سورس و استخراج پروژه‌ها...' : 'تجزیه و استخراج پروژه‌ها'}</span>
                    </button>
                  </div>

                  {htmlScrapeResult && (
                    <div
                      className={`p-4 rounded-xl text-xs space-y-2 ${
                        htmlScrapeResult.success
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {htmlScrapeResult.success ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-rose-400" />
                        )}
                        <span className="font-semibold">{htmlScrapeResult.message}</span>
                      </div>

                      {htmlScrapeResult.extractedTitles && htmlScrapeResult.extractedTitles.length > 0 && (
                        <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                          <span className="text-[10px] text-emerald-400 block font-semibold">پروژه‌های کشف‌شده:</span>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300 max-h-32 overflow-y-auto">
                            {htmlScrapeResult.extractedTitles.map((t, idx) => (
                              <li key={idx} className="truncate">{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}

              {/* TAB 3: Manual Single Project Entry */}
              {modalTab === 'manual' && (
                <form onSubmit={handleCreateManualJob} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">عنوان پروژه:</label>
                    <input
                      type="text"
                      required
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="مثال: اسکریپت استخراج محصولات دیجی‌کالا با پایتون"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">پلتفرم مبدا:</label>
                      <select
                        value={manualPlatform}
                        onChange={(e) => setManualPlatform(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="پونیشا">پونیشا</option>
                        <option value="کارلانسر">کارلانسر</option>
                        <option value="پارسکدرز">پارسکدرز</option>
                        <option value="آپ‌ورک / بین‌المللی">آپ‌ورک / بین‌المللی</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">بودجه تقریبی (تومان):</label>
                      <input
                        type="number"
                        value={manualBudget}
                        onChange={(e) => setManualBudget(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">توضیحات کامل کارفرما:</label>
                    <textarea
                      required
                      rows={4}
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="متن کامل پروژه را از سایت فریلنسری کپی و اینجا پیست کنید..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-xl text-xs shadow-md shadow-emerald-950 transition-all"
                    >
                      افزودن و آنالیز فوری
                    </button>
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
