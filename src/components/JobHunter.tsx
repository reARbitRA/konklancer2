import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Sparkles,
  FileText,
  Clock,
  UserCheck,
  Plus,
  Globe,
  FileCode,
  RefreshCw,
  AlertCircle,
  Check,
  Link2,
  Pin,
  Trash2,
  Gem,
  Target,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';
import { ALL_CATEGORIES, categoryLabel, categoryAiFit, detectCategory } from '../../shared/taxonomy';
import { evaluateProjectRelevance } from '../../shared/relevanceEngine';
import { buildJobsFromRows, fetchHtmlSmart, parsePlatformHtmlClient } from '../services/standaloneFeed';

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
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onAddNewManualJob,
  onTogglePinJob,
  onDeleteManualJob,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilterMode>('relevant');
  const [showAddModal, setShowAddModal] = useState(false);

  const [modalTab, setModalTab] = useState<'url' | 'html' | 'manual'>('url');

  // URL Scraper state
  const [urlInput, setUrlInput] = useState('https://telegram.me/s/ponisha_ir');
  const [isUrlScraping, setIsUrlScraping] = useState(false);
  const [urlScrapeResult, setUrlScrapeResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
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
  const [manualBudget, setManualBudget] = useState('5000000');
  const [manualPlatform, setManualPlatform] = useState('پونیشا');

  // محاسبه لحظه‌ای تناسب اگر رکورد قدیمی فاقد فیلد باشد
  const enrichedJobs = jobs.map((job) => {
    if (job.relevanceTier) return job;
    const rel = evaluateProjectRelevance(job.title, job.description, job.categoryKey, job.tags);
    return {
      ...job,
      relevanceTier: rel.tier,
      relevanceScore: rel.relevanceScore,
      relevanceReason: rel.reason,
    };
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
    const matchesSearch =
      !q ||
      job.title.toLowerCase().includes(q) ||
      job.description.toLowerCase().includes(q) ||
      job.tags.some((t) => t.toLowerCase().includes(q)) ||
      job.category.toLowerCase().includes(q);

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
      id: `manual-${Date.now()}`,
      title: manualTitle.trim(),
      description: manualDesc.trim(),
      budget: budgetNum,
      budgetFormatted: `${budgetNum.toLocaleString('fa-IR')} تومان`,
      platform: manualPlatform,
      platformKey: manualPlatform.includes('کارلانسر')
        ? 'karlancer'
        : manualPlatform.includes('پارس')
          ? 'parskoders'
          : 'ponisha',
      clientName: 'کارفرمای اختصاصی',
      clientRating: 5.0,
      clientReviews: 10,
      deadline: 'امروز',
      postedTime: 'هم‌اکنون',
      category: categoryLabel(detected.key),
      categoryKey: detected.key,
      tags: [detected.key, 'Manual Vault'],
      proposalsCount: 0,
      avgBid: budgetNum,
      status: 'new',
      isManual: true,
      pinned: true,
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
      const targetUrl = urlInput.trim();
      const html = await fetchHtmlSmart(targetUrl);
      if (html) {
        const host = targetUrl.toLowerCase();
        const src = host.includes('ponisha_ir')
          ? 'telegram:ponisha_ir'
          : host.includes('ponisha')
            ? 'ponisha'
            : host.includes('karlancer')
              ? 'karlancer'
              : host.includes('t.me/') || host.includes('telegram.me/')
                ? `telegram:${targetUrl.split('/').filter(Boolean).pop()?.split('?')[0]}`
                : 'parscoders';
        const rows = parsePlatformHtmlClient(html, src, targetUrl);
        const { jobs: built } = buildJobsFromRows(rows);
        for (const j of built) {
          await onAddNewManualJob({
            ...j,
            isManual: true,
            pinned: true,
          });
        }
        setUrlScrapeResult({
          success: built.length > 0,
          count: built.length,
          message:
            built.length > 0
              ? `${built.length.toLocaleString('fa-IR')} پروژه استخراج و به گاوصندوق دائمی اضافه شد (در اسکن‌های بعدی هرگز پاک نمی‌شوند)!`
              : 'صفحه خوانده شد اما کارت پروژه‌ای تشخیص داده نشد؛ از تب «پیست سورس HTML» یا «ثبت دستی» استفاده کنید.',
          extractedTitles: built.map((p) => p.title),
        });
        return;
      }

      setUrlScrapeResult({
        success: false,
        message: 'اتصال مستقیم برقرار نشد؛ سورس صفحه را در تب ۲ پیست کنید یا دستی ثبت نمایید.',
      });
    } catch (err: any) {
      setUrlScrapeResult({
        success: false,
        message: err.message || 'خطا در استخراج نشانی اینترنتی',
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
      const base =
        htmlPlatform === 'ponisha'
          ? 'https://ponisha.ir'
          : htmlPlatform === 'karlancer'
            ? 'https://www.karlancer.com'
            : 'https://parscoders.com';
      const rows = parsePlatformHtmlClient(htmlInput.trim(), htmlPlatform, base);
      const { jobs: built } = buildJobsFromRows(rows);
      for (const j of built) {
        await onAddNewManualJob({
          ...j,
          isManual: true,
          pinned: true,
        });
      }
      setHtmlScrapeResult({
        success: built.length > 0,
        count: built.length,
        message:
          built.length > 0
            ? `${built.length.toLocaleString('fa-IR')} پروژه از سورس HTML استخراج و به صورت دائمی ذخیره شد!`
            : 'کارت پروژه‌ای در این HTML تشخیص داده نشد؛ اگر متن ساده یک آگهی است از تب «ثبت دستی» استفاده کنید.',
        extractedTitles: built.map((p) => p.title),
      });
      if (built.length > 0) setHtmlInput('');
    } catch (err: any) {
      setHtmlScrapeResult({
        success: false,
        message: err.message || 'خطا در پردازش سورس HTML',
      });
    } finally {
      setIsHtmlScraping(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            رادار شکار عمیق و دسته‌بندی هوشمند پروژه‌ها
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            اسکن چندصفحه‌ای پونیشا (با بودجه مخفی)، پارس‌کدرز و کارلانسر · حذف خودکار آگهی‌های نامربوط و حفاظت دائمی از پروژه‌های دستی
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setModalTab('url');
            setUrlScrapeResult(null);
            setHtmlScrapeResult(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950 transition-all active:scale-95 border border-emerald-400/30 self-start"
        >
          <Plus className="h-4 w-4" />
          <span>ثبت / استخراج دائمی پروژه جدید (URL · HTML · دستی)</span>
        </button>
      </div>

      {/* Smart Relevance Filter Bar */}
      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRelevanceFilter('relevant')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              relevanceFilter === 'relevant'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>فقط مرتبط با من ({relevantCount.toLocaleString('fa-IR')})</span>
          </button>

          <button
            type="button"
            onClick={() => setRelevanceFilter('prime')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              relevanceFilter === 'prime'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 text-amber-300 hover:bg-slate-800'
            }`}
          >
            <Gem className="w-3.5 h-3.5" />
            <span>شکار طلایی پرتناسب ({primeCount.toLocaleString('fa-IR')})</span>
          </button>

          <button
            type="button"
            onClick={() => setRelevanceFilter('saved')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              relevanceFilter === 'saved'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-indigo-300 hover:bg-slate-800'
            }`}
          >
            <Pin className="w-3.5 h-3.5" />
            <span>دستی و سنجاق‌شده دائمی ({savedCount.toLocaleString('fa-IR')})</span>
          </button>

          <button
            type="button"
            onClick={() => setRelevanceFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              relevanceFilter === 'all'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>نمایش خام همه ({enrichedJobs.length.toLocaleString('fa-IR')})</span>
          </button>
        </div>

        {hiddenJunkCount > 0 && relevanceFilter !== 'all' && (
          <span className="text-[11px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            ✓ {hiddenJunkCount.toLocaleString('fa-IR')} آگهی نامربوط/حضوری/تبلیغاتی خودکار حذف شد
          </span>
        )}
      </div>

      {/* Search & Platform Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-5 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان، پایتون، اتوماسیون، هوش مصنوعی، ترجمه، اسکرپینگ..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-9 pl-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        <div className="md:col-span-7 flex flex-wrap items-center gap-1.5 justify-start md:justify-end">
          <span className="text-[11px] text-slate-400 ml-1">پلتفرم:</span>
          {(
            [
              { key: 'all', label: 'همه پلتفرم‌ها' },
              { key: 'ponisha', label: 'پونیشا' },
              { key: 'karlancer', label: 'کارلانسر' },
              { key: 'parskoders', label: 'پارس‌کدرز' },
              { key: 'global', label: 'کانال‌ها / بین‌المللی' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setSelectedPlatform(item.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedPlatform === item.key
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 bg-slate-900/60 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400 ml-2">دسته‌بندی دقیق:</span>
        {[
          { key: 'all' as CategoryKey, label: 'همه دسته‌ها' },
          ...ALL_CATEGORIES.filter((c) => c.key !== 'other').map((c) => ({
            key: c.key as CategoryKey,
            label: c.fa,
          })),
        ].map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              selectedCategory === cat.key
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 bg-slate-900 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
            <p className="text-sm text-slate-400">هیچ پروژه‌ای مطابق این ترکیب فیلتر یافت نشد.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedPlatform('all');
                setSelectedCategory('all');
                setRelevanceFilter('relevant');
              }}
              className="mt-3 text-xs text-emerald-400 hover:underline"
            >
              بازنشانی فیلترها
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const isProtected = Boolean(job.isManual || job.pinned);
            return (
              <div
                key={job.id}
                className={`group border rounded-xl p-5 transition-all space-y-3.5 ${
                  isProtected
                    ? 'border-indigo-500/45 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/25'
                    : job.relevanceTier === 'prime'
                      ? 'border-emerald-500/30 bg-slate-900/80 hover:border-emerald-500/55'
                      : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                }`}
              >
                {/* Top metadata bar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {isProtected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold text-[11px]">
                        <ShieldCheck className="w-3 h-3" />
                        {job.isManual ? 'ثبت دستی دائمی' : 'سنجاق دائمی'}
                      </span>
                    )}
                    {job.relevanceTier === 'prime' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/35 font-bold text-[11px]">
                        <Gem className="w-3 h-3" /> شکار طلایی
                      </span>
                    )}
                    <span className="font-semibold text-slate-200">{job.platform}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {job.postedTime}
                    </span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
                      <UserCheck className="h-3 w-3" />
                      {job.clientName}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-indigo-500/10 text-indigo-200 border-indigo-500/30"
                      title={`تناسب هوش مصنوعی: ${categoryAiFit(job.categoryKey)}/10`}
                    >
                      {categoryLabel(job.categoryKey) || job.category}
                    </span>

                    <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                      {job.budgetFormatted}
                    </span>

                    {/* Pin / Unpin Button */}
                    <button
                      type="button"
                      onClick={() => onTogglePinJob(job.id)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        isProtected
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                          : 'bg-slate-800/80 border-slate-700/70 text-slate-400 hover:text-white'
                      }`}
                      title={isProtected ? 'محافظت دائمی فعال است' : 'سنجاق دائمی پروژه (هرگز در اسکن‌ها پاک نشود)'}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>

                    {isProtected && (
                      <button
                        type="button"
                        onClick={() => onDeleteManualJob(job.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400"
                        title="حذف از لیست دائمی"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {job.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300 line-clamp-3">
                    {job.description}
                  </p>
                </div>

                {/* Tags + Reason */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                  {job.relevanceReason && (
                    <span className="text-emerald-400/90 font-medium">✦ {job.relevanceReason}</span>
                  )}
                  {job.tags.slice(0, 5).map((tag, idx) => (
                    <span key={idx} className="font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {job.proposalsCount > 0 && (
                    <span className="mr-auto font-mono text-[11px] text-slate-400">
                      {job.proposalsCount.toLocaleString('fa-IR')} پیشنهاد ثبت‌شده
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onSelectJobForAnalysis(job)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                      <span>تحلیل و استراتژی برد</span>
                    </button>

                    <button
                      onClick={() => onSelectJobForProposal(job)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-400" />
                      <span>پروپوزال برنده</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                        <span>آگهی اصلی</span>
                      </a>
                    )}

                    <button
                      onClick={() => onSelectJobForCoding(job)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-95"
                    >
                      <span>🏛️ استودیو تحویل و مستندات فنی</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Permanent Ingestion Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    گاوصندوق ثبت و استخراج دائمی پروژه (بدون حذف در اسکن خودکار)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    هر پروژه‌ای که از این بخش اضافه شود برای همیشه در حافظه اختصاصی سنجاق می‌ماند
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2 gap-2 text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setModalTab('url')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg border-b-2 -mb-[1px] whitespace-nowrap ${
                  modalTab === 'url'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <Link2 className="h-3.5 w-3.5" /> ۱. استخراج از URL
              </button>
              <button
                type="button"
                onClick={() => setModalTab('html')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg border-b-2 -mb-[1px] whitespace-nowrap ${
                  modalTab === 'html'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" /> ۲. پیست سورس HTML
              </button>
              <button
                type="button"
                onClick={() => setModalTab('manual')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg border-b-2 -mb-[1px] whitespace-nowrap ${
                  modalTab === 'manual'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <Plus className="h-3.5 w-3.5" /> ۳. ثبت دستی تکی
              </button>
            </div>

            <div className="p-6">
              {modalTab === 'url' && (
                <form onSubmit={handleScrapeUrl} className="space-y-4">
                  <input
                    type="url"
                    required
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://telegram.me/s/ponisha_ir"
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'فید زنده پونیشا (با بودجه)', url: 'https://telegram.me/s/ponisha_ir' },
                      { label: 'پارس‌کدرز صفحه ۲', url: 'https://parscoders.com/project/only-available?page=2' },
                      { label: 'کارلانسر صفحه ۱', url: 'https://www.karlancer.com/search' },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setUrlInput(item.url)}
                        className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={isUrlScraping || !urlInput.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isUrlScraping ? 'animate-spin' : ''}`} />
                    <span>{isUrlScraping ? 'در حال استخراج و ذخیره دائمی...' : 'استخراج و افزودن دائمی'}</span>
                  </button>
                  {urlScrapeResult && (
                    <div
                      className={`p-3.5 rounded-xl text-xs ${
                        urlScrapeResult.success
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {urlScrapeResult.message}
                    </div>
                  )}
                </form>
              )}

              {modalTab === 'html' && (
                <form onSubmit={handleScrapeHtml} className="space-y-4">
                  <select
                    value={htmlPlatform}
                    onChange={(e) => setHtmlPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="ponisha">پونیشا (Ponisha)</option>
                    <option value="karlancer">کارلانسر (Karlancer)</option>
                    <option value="parscoders">پارس‌کدرز (Parscoders)</option>
                  </select>
                  <textarea
                    required
                    rows={6}
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    placeholder="سورس HTML صفحه را اینجا پیست کنید..."
                    dir="ltr"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300"
                  />
                  <button
                    type="submit"
                    disabled={isHtmlScraping || !htmlInput.trim()}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    تجزیه آنی و ذخیره دائمی در گاوصندوق
                  </button>
                  {htmlScrapeResult && (
                    <div
                      className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                        htmlScrapeResult.success
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {htmlScrapeResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      <span>{htmlScrapeResult.message}</span>
                    </div>
                  )}
                </form>
              )}

              {modalTab === 'manual' && (
                <form onSubmit={handleCreateManualJob} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">عنوان پروژه:</label>
                    <input
                      type="text"
                      required
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="مثال: طراحی سیستم اتوماسیون پردازش فاکتور با هوش مصنوعی"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">پلتفرم:</label>
                      <select
                        value={manualPlatform}
                        onChange={(e) => setManualPlatform(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="پونیشا">پونیشا</option>
                        <option value="کارلانسر">کارلانسر</option>
                        <option value="پارس‌کدرز">پارس‌کدرز</option>
                        <option value="بین‌المللی / مستقیم">بین‌المللی / مستقیم</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">بودجه (تومان):</label>
                      <input
                        type="number"
                        value={manualBudget}
                        onChange={(e) => setManualBudget(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">شرح کامل پروژه کارفرما:</label>
                    <textarea
                      required
                      rows={5}
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="شرح کامل نیازمندی‌های کارفرما را اینجا بنویسید یا پیست کنید تا موتور معماری و تحویل روی آن کار کند..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs"
                    >
                      ذخیره دائمی و رفتن به تحلیل
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
