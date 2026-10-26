import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Target,
  Layers,
  Wallet,
  Trophy,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  BellRing,
  Server,
} from 'lucide-react';
import { BrutalCollapsible } from './brutalist/Collapsible';
import {
  ApiError,
  BID_STATUS_LABEL,
  fetchAlertsStatus,
  fetchStats,
  formatPercent,
  listBids,
  toPersianDigits,
  updateBid,
  deleteBid,
  type AlertsStatus,
  type BidRecord,
  type BidStats,
  type BidStatus,
  type StatsBucket,
} from '../services/outcomeApi';

const BUCKET_ICON: Record<string, React.ElementType> = {
  byPlatform: Layers,
  byCategory: Target,
  byBudgetBand: Wallet,
};

const STATUS_STYLE: Record<BidStatus, string> = {
  sent: 'bg-white text-[#0a0a0a]',
  won: 'bg-[#00E599] text-[#0a0a0a]',
  lost: 'bg-[#FF3B30] text-white',
  no_reply: 'bg-[#FFDE03] text-[#0a0a0a]',
  withdrawn: 'bg-[#E8E6E0] text-[#555555]',
};

function RateBar({ bucket }: { bucket: StatsBucket }) {
  const pct = bucket.winRate === null ? 0 : Math.round(bucket.winRate * 100);
  return (
    <div className="h-[10px] w-full border-[2px] border-[#0a0a0a] bg-white" role="img" aria-label={`نرخ برد ${bucket.label}: ${formatPercent(bucket.winRate)}`}>
      <div
        className={`h-full ${bucket.winRate === null ? 'bg-[#E8E6E0]' : pct >= 50 ? 'bg-[#00E599]' : pct >= 25 ? 'bg-[#FFDE03]' : 'bg-[#FF3B30]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BucketTable({ title, buckets, icon }: { title: string; buckets: StatsBucket[]; icon: React.ElementType }) {
  if (buckets.length === 0) {
    return (
      <div className="p-3 text-[11px] font-bold text-[#555]">
        هنوز داده‌ای در این دسته‌بندی نیست. با ثبت پیشنهاد و نتیجه‌اش، جدول پر می‌شود.
      </div>
    );
  }
  const Icon = icon;
  return (
    <div className="overflow-x-auto brutal-scroll">
      <table className="w-full border-collapse text-[11.5px]" data-testid={`stats-table-${title}`}>
        <thead>
          <tr className="bg-[#0a0a0a] text-[#FFFBF0]">
            <th className="border-[2px] border-[#0a0a0a] px-2 py-1.5 text-right font-black"><span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {title}</span></th>
            <th className="border-[2px] border-[#0a0a0a] px-2 py-1.5 font-black">کل</th>
            <th className="border-[2px] border-[#0a0a0a] px-2 py-1.5 font-black">برنده</th>
            <th className="border-[2px] border-[#0a0a0a] px-2 py-1.5 font-black">نرخ برد</th>
            <th className="border-[2px] border-[#0a0a0a] px-2 py-1.5 font-black w-[120px]">نمودار</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key} className="odd:bg-white even:bg-[#FFFBF0]">
              <td className="border-[2px] border-[#0a0a0a] px-2 py-1.5 font-bold">
                <span className="inline-flex items-center gap-1">
                  {bucket.label}
                  {bucket.insufficientSample && (
                    <span className="border-[2px] border-[#0a0a0a] bg-[#FFDE03] px-1 text-[9px] font-black" title={bucket.sampleNote}>نمونه ناکافی</span>
                  )}
                </span>
              </td>
              <td className="border-[2px] border-[#0a0a0a] px-2 py-1.5 text-center font-mono font-black">{toPersianDigits(bucket.total)}</td>
              <td className="border-[2px] border-[#0a0a0a] px-2 py-1.5 text-center font-mono font-black">{toPersianDigits(bucket.won)}</td>
              <td className="border-[2px] border-[#0a0a0a] px-2 py-1.5 text-center font-mono font-black">{formatPercent(bucket.winRate)}</td>
              <td className="border-[2px] border-[#0a0a0a] px-2 py-1.5"><RateBar bucket={bucket} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const OutcomeAnalytics: React.FC<{ apiTokenConfigured?: boolean }> = () => {
  const [stats, setStats] = useState<BidStats | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | BidStatus>('all');
  const [showRecent, setShowRecent] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextBids, nextAlerts] = await Promise.all([
        fetchStats(),
        listBids(),
        fetchAlertsStatus().catch(() => null),
      ]);
      setStats(nextStats);
      setBids(nextBids);
      setAlerts(nextAlerts);
    } catch (err: any) {
      const message = err instanceof ApiError && err.status === 401
        ? 'این سرور API را با توکن محافظت می‌کند. توکن را در تنظیمات → امنیت وارد کنید.'
        : err?.message || 'خطا در دریافت آمار';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleBids = useMemo(
    () => (filter === 'all' ? bids : bids.filter((bid) => bid.status === filter)),
    [bids, filter],
  );

  const applyStatus = async (bid: BidRecord, status: BidStatus) => {
    setBusyId(bid.id);
    setError(null);
    try {
      const updated = await updateBid(bid.id, { status });
      setBids((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      const nextStats = await fetchStats();
      setStats(nextStats);
    } catch (err: any) {
      setError(err?.message || 'خطا در ثبت نتیجه');
    } finally {
      setBusyId(null);
    }
  };

  const removeBid = async (bid: BidRecord) => {
    setBusyId(bid.id);
    try {
      await deleteBid(bid.id);
      setBids((prev) => prev.filter((item) => item.id !== bid.id));
      setStats(await fetchStats());
    } catch (err: any) {
      setError(err?.message || 'خطا در حذف پیشنهاد');
    } finally {
      setBusyId(null);
    }
  };

  const overall = stats?.overall;

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto" data-testid="outcome-analytics">
      <BrutalCollapsible title="کارنامه‌ی پیشنهادها و کالیبراسیون" icon={BarChart3} variant="ink" defaultOpen storageKey="analytics-overview">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="brutal-badge brutal-badge--accent">ثبت دستی، بدون ارسال خودکار</span>
            {overall && (
              <span className={`brutal-badge ${overall.insufficientSample ? 'brutal-badge--ink' : 'brutal-badge--mint'}`}>
                {overall.insufficientSample ? 'تخمین اولیه، نمونه ناکافی' : 'کالیبره‌شده با داده‌ی واقعی'}
              </span>
            )}
            <button onClick={() => void load()} disabled={loading} className="brutal-btn brutal-btn--ghost border-[2px] ml-auto">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} بازخوانی
            </button>
          </div>

          {error && (
            <div className="flex items-start justify-between gap-2 border-[2.5px] border-black bg-[#FF3B30] px-3 py-2 text-[12px] font-bold text-white">
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="بستن خطا"><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { label: 'کل پیشنهادها', value: overall ? toPersianDigits(overall.total) : '—', icon: Layers, bg: 'bg-white' },
              { label: 'بسته‌شده', value: overall ? toPersianDigits(overall.closed) : '—', icon: Check, bg: 'bg-[#E8E6E0]' },
              { label: 'برنده', value: overall ? toPersianDigits(overall.won) : '—', icon: Trophy, bg: 'bg-[#00E599]' },
              { label: 'نرخ برد', value: overall ? formatPercent(overall.winRate) : '—', icon: Target, bg: 'bg-[#FFDE03]' },
            ].map((card) => (
              <div key={card.label} className={`border-[2.5px] border-black ${card.bg} p-3 shadow-[3px_3px_0px_0px_#000]`}>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#333]">
                  <card.icon className="w-3.5 h-3.5" /> {card.label}
                </div>
                <div className="mt-1 font-mono text-[22px] font-black leading-none">{card.value}</div>
              </div>
            ))}
          </div>

          {overall && overall.insufficientSample && (
            <div className="flex items-start gap-2 border-[2.5px] border-black bg-[#FFDE03] px-3 py-2 text-[11.5px] font-bold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                برای کالیبره‌کردن نرخ برد به حداقل {toPersianDigits(stats?.minSample ?? 30)} نتیجه‌ی ثبت‌شده نیاز است؛
                اکنون {toPersianDigits(overall.closed)} نتیجه ثبت شده. تا آن زمان این عدد فقط «تخمین اولیه» است.
              </span>
            </div>
          )}
        </div>
      </BrutalCollapsible>

      <BrutalCollapsible title="تفکیک بر پایه‌ی پلتفرم، دسته و بودجه" icon={Target} variant="accent" defaultOpen storageKey="analytics-breakdown">
        <div className="space-y-3">
          <BucketTable title="پلتفرم" buckets={stats?.byPlatform ?? []} icon={BUCKET_ICON.byPlatform} />
          <BucketTable title="دسته" buckets={stats?.byCategory ?? []} icon={BUCKET_ICON.byCategory} />
          <BucketTable title="بازه‌ی بودجه" buckets={stats?.byBudgetBand ?? []} icon={BUCKET_ICON.byBudgetBand} />
        </div>
      </BrutalCollapsible>

      <BrutalCollapsible title={`پیشنهادهای ثبت‌شده (${toPersianDigits(bids.length)})`} icon={Trophy} variant="ink" defaultOpen storageKey="analytics-bids">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {(['all', 'sent', 'won', 'lost', 'no_reply', 'withdrawn'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`border-[2px] border-[#0a0a0a] px-2 py-1 text-[11px] font-black ${filter === key ? 'bg-[#0a0a0a] text-white' : 'bg-white hover:bg-[#FFDE03]'}`}
              >
                {key === 'all' ? 'همه' : BID_STATUS_LABEL[key]} ({toPersianDigits(key === 'all' ? bids.length : bids.filter((b) => b.status === key).length)})
              </button>
            ))}
            <button onClick={() => setShowRecent((v) => !v)} className="ml-auto flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-white px-2 py-1 text-[11px] font-black">
              {showRecent ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} جزئیات
            </button>
          </div>

          {visibleBids.length === 0 && (
            <div className="border-[2px] border-dashed border-[#0a0a0a] bg-[#FFFBF0] p-4 text-center text-[11.5px] font-bold text-[#555]">
              پیشنهادی با این فیلتر نیست. از صفحه‌ی قیف، روی یک پروژه «ثبت پیشنهاد» بزنید.
            </div>
          )}

          {visibleBids.length > 0 && (
            <div className="space-y-1" data-testid="bids-list">
              {visibleBids.map((bid) => (
                <div key={bid.id} className="border-[2px] border-[#0a0a0a] bg-white">
                  <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                    <span className={`border-[2px] border-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-black ${STATUS_STYLE[bid.status]}`}>{BID_STATUS_LABEL[bid.status]}</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold" title={bid.title || bid.projectId}>{bid.title || bid.projectId}</span>
                    <span className="font-mono text-[10px] text-[#555]" dir="ltr">{bid.platform || '—'}</span>
                    <span className="font-mono text-[10px] text-[#555]">{bid.budgetBid ? `${toPersianDigits(bid.budgetBid.toLocaleString('en-US'))} تومان` : '—'}</span>
                    <span className="font-mono text-[10px] text-[#777]" dir="ltr">{bid.bidAt.slice(0, 10)}</span>
                  </div>
                  {showRecent && (
                    <div className="flex flex-wrap items-center gap-1 border-t-[2px] border-[#0a0a0a] bg-[#FFFBF0] px-2 py-1.5">
                      {(['won', 'lost', 'no_reply', 'withdrawn'] as BidStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => void applyStatus(bid, status)}
                          disabled={busyId === bid.id || bid.status === status}
                          className={`border-[2px] border-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-black disabled:opacity-40 ${STATUS_STYLE[status]}`}
                        >
                          {BID_STATUS_LABEL[status]}
                        </button>
                      ))}
                      {bid.notes && <span className="text-[10px] text-[#555] truncate max-w-[280px]">{bid.notes}</span>}
                      <button
                        onClick={() => void removeBid(bid)}
                        disabled={busyId === bid.id}
                        aria-label={`حذف پیشنهاد ${bid.title || bid.projectId}`}
                        className="ml-auto border-[2px] border-[#0a0a0a] bg-white p-1 hover:bg-[#FF3B30] hover:text-white disabled:opacity-40"
                      >
                        {busyId === bid.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </BrutalCollapsible>

      <BrutalCollapsible title="اعلان‌ها و اتصال سرور" icon={BellRing} variant="accent" defaultOpen={false} storageKey="analytics-alerts">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] font-bold">
          <div className={`border-[2px] border-[#0a0a0a] p-2 ${alerts?.enabled ? 'bg-[#00E599]' : 'bg-[#FFDE03]'}`}>
            <div className="flex items-center gap-1 font-black"><BellRing className="w-3.5 h-3.5" /> اعلان تلگرام</div>
            <div className="mt-1">
              {alerts?.enabled
                ? `فعال — آستانه ${toPersianDigits(alerts.threshold)}، ارسال‌شده در این نشست: ${toPersianDigits(alerts.sentCount)}`
                : alerts?.reason || 'وضعیت اعلان نامشخص است.'}
            </div>
          </div>
          <div className="border-[2px] border-[#0a0a0a] bg-white p-2">
            <div className="flex items-center gap-1 font-black"><Server className="w-3.5 h-3.5" /> ذخیره‌سازی</div>
            <div className="mt-1">SQLite روی سرور (<span dir="ltr" className="font-mono">data/konklancer.db</span>) — نه فقط مرورگر.</div>
            {stats && <div className="mt-1 font-mono text-[10px] text-[#555]" dir="ltr">updated: {stats.generatedAt.slice(0, 19)}</div>}
          </div>
        </div>
      </BrutalCollapsible>
    </div>
  );
};
