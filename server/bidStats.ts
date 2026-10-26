/**
 * انباشت و تحلیل نتیجه‌ی پیشنهادها (SPEC-005).
 * همه‌ی محاسبات خالص‌اند تا بدون دیتابیس/شبکه قابل تست باشند.
 */
import type { BidRecord } from './store';

/** حداقل نمونه برای اینکه نرخ برد «قابل استناد» باشد (SPEC-005 R2). */
export const MIN_CLOSED_SAMPLE = 30;

export interface StatsBucket {
  key: string;
  label: string;
  total: number;
  sent: number;
  won: number;
  lost: number;
  noReply: number;
  withdrawn: number;
  /** پیشنهادهای بسته‌شده = won + lost + no_reply (+ withdrawn) */
  closed: number;
  /** نرخ برد واقعی: won / closed — اگر نمونه ناکافی باشد همچنان محاسبه می‌شود ولی برچسب می‌گیرد. */
  winRate: number | null;
  replyRate: number | null;
  insufficientSample: boolean;
  sampleNote: string;
}

export interface BidStats {
  generatedAt: string;
  minSample: number;
  overall: StatsBucket;
  byPlatform: StatsBucket[];
  byCategory: StatsBucket[];
  byBudgetBand: StatsBucket[];
  recent: BidRecord[];
  /** برای کالیبراسیون امتیازدهی (SPEC-005 R3) */
  calibration: { baseRate: number | null; usable: boolean; closed: number };
}

export const BUDGET_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'under-5m', label: 'زیر ۵ میلیون', min: 0, max: 5_000_000 },
  { key: '5m-10m', label: '۵ تا ۱۰ میلیون', min: 5_000_000, max: 10_000_000 },
  { key: '10m-20m', label: '۱۰ تا ۲۰ میلیون', min: 10_000_000, max: 20_000_000 },
  { key: '20m-50m', label: '۲۰ تا ۵۰ میلیون', min: 20_000_000, max: 50_000_000 },
  { key: 'over-50m', label: 'بالای ۵۰ میلیون', min: 50_000_000, max: Number.POSITIVE_INFINITY },
];

const CLOSED_STATUSES = new Set(['won', 'lost', 'no_reply', 'withdrawn']);

export function isClosed(bid: Pick<BidRecord, 'status'>): boolean {
  return CLOSED_STATUSES.has(bid.status);
}

function emptyBucket(key: string, label: string, minSample: number): StatsBucket {
  return {
    key,
    label,
    total: 0,
    sent: 0,
    won: 0,
    lost: 0,
    noReply: 0,
    withdrawn: 0,
    closed: 0,
    winRate: null,
    replyRate: null,
    insufficientSample: true,
    sampleNote: `نمونه ناکافی (۰ از ${minSample})`,
  };
}

function accumulate(bucket: StatsBucket, bid: BidRecord): void {
  bucket.total += 1;
  if (bid.status === 'sent') bucket.sent += 1;
  if (bid.status === 'won') bucket.won += 1;
  if (bid.status === 'lost') bucket.lost += 1;
  if (bid.status === 'no_reply') bucket.noReply += 1;
  if (bid.status === 'withdrawn') bucket.withdrawn += 1;
}

function finalize(bucket: StatsBucket, minSample: number): StatsBucket {
  bucket.closed = bucket.won + bucket.lost + bucket.noReply + bucket.withdrawn;
  bucket.winRate = bucket.closed > 0 ? round3(bucket.won / bucket.closed) : null;
  const answered = bucket.won + bucket.lost;
  bucket.replyRate = bucket.closed > 0 ? round3(answered / bucket.closed) : null;
  bucket.insufficientSample = bucket.closed < minSample;
  bucket.sampleNote = bucket.insufficientSample
    ? `تخمین اولیه، نمونه ناکافی (${bucket.closed} از ${minSample})`
    : `کالیبره‌شده با ${bucket.closed} نتیجه‌ی ثبت‌شده`;
  return bucket;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export function budgetBandOf(amount: number): (typeof BUDGET_BANDS)[number] {
  const value = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return BUDGET_BANDS.find((band) => value >= band.min && value < band.max) ?? BUDGET_BANDS[BUDGET_BANDS.length - 1];
}

export function computeBidStats(
  bids: BidRecord[],
  options: { minSample?: number; now?: Date; recentLimit?: number } = {},
): BidStats {
  const minSample = Math.max(1, Number(options.minSample ?? MIN_CLOSED_SAMPLE));
  const now = options.now ?? new Date();
  const recentLimit = Math.max(1, Number(options.recentLimit ?? 10));

  const overall = emptyBucket('all', 'همه‌ی پیشنهادها', minSample);
  const platformMap = new Map<string, StatsBucket>();
  const categoryMap = new Map<string, StatsBucket>();
  const bandMap = new Map<string, StatsBucket>();

  for (const bid of bids) {
    accumulate(overall, bid);

    const platformKey = (bid.platform || 'نامشخص').trim() || 'نامشخص';
    if (!platformMap.has(platformKey)) platformMap.set(platformKey, emptyBucket(platformKey, platformKey, minSample));
    accumulate(platformMap.get(platformKey) as StatsBucket, bid);

    const categoryKey = (bid.category || 'نامشخص').trim() || 'نامشخص';
    if (!categoryMap.has(categoryKey)) categoryMap.set(categoryKey, emptyBucket(categoryKey, categoryKey, minSample));
    accumulate(categoryMap.get(categoryKey) as StatsBucket, bid);

    const band = budgetBandOf(bid.budgetBid);
    if (!bandMap.has(band.key)) bandMap.set(band.key, emptyBucket(band.key, band.label, minSample));
    accumulate(bandMap.get(band.key) as StatsBucket, bid);
  }

  finalize(overall, minSample);
  for (const bucket of platformMap.values()) finalize(bucket, minSample);
  for (const bucket of categoryMap.values()) finalize(bucket, minSample);
  for (const bucket of bandMap.values()) finalize(bucket, minSample);

  const recent = [...bids]
    .sort((a, b) => (a.bidAt < b.bidAt ? 1 : a.bidAt > b.bidAt ? -1 : 0))
    .slice(0, recentLimit);

  return {
    generatedAt: now.toISOString(),
    minSample,
    overall,
    byPlatform: sortBuckets([...platformMap.values()]),
    byCategory: sortBuckets([...categoryMap.values()]),
    byBudgetBand: BUDGET_BANDS.map((band) => bandMap.get(band.key)).filter((bucket): bucket is StatsBucket => Boolean(bucket)),
    recent,
    calibration: {
      baseRate: overall.winRate,
      usable: !overall.insufficientSample,
      closed: overall.closed,
    },
  };
}

function sortBuckets(buckets: StatsBucket[]): StatsBucket[] {
  return buckets.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** ارقام لاتین → فارسی برای نمایش یکدست در UI. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** درصد نمایشی امن (بدون NaN یا Infinity). */
export function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${toPersianDigits(Math.round(value * 100))}٪`;
}
