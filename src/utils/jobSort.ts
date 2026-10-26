/**
 * jobSort.ts — Project sorting engine (Time / Type / Price)
 *
 * Pure, dependency-free helpers used by the Jobs (Hunt) page.
 * Everything here is deterministic and unit-tested in server/jobSort.test.ts,
 * so the UI never has to guess how a Persian timestamp is parsed.
 */

export type SortBy = 'default' | 'time' | 'price' | 'type';
export type SortDir = 'asc' | 'desc';
export interface SortConfig {
  by: SortBy;
  dir: SortDir;
}

export const SORT_OPTIONS: { key: Exclude<SortBy, 'default'>; label: string; hint: string }[] = [
  { key: 'time', label: 'زمان انتشار', hint: 'جدیدترین ↔ قدیمی‌ترین' },
  { key: 'type', label: 'نوع / دسته‌بندی', hint: 'پلتفرم و دسته‌بندی (الفبایی)' },
  { key: 'price', label: 'قیمت / بودجه', hint: 'کم ↔ زیاد' },
];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert Persian/Arabic-Indic digits to ASCII digits and normalize ZWNJ/spaces. */
export function normalizeDigits(input: string): string {
  return (input || '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[\u0660-\u0669]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Persian number words → numeric value (covers 0–100 and common compounds). */
const WORD_NUMBERS: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16,
  هفده: 17, هیفده: 17, هجده: 18, هیجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50,
  شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100, نیم: 0.5,
};

/** Parse a numeric quantity written with digits or Persian words (e.g. "بیست و سه"). */
export function parseFaQuantity(raw: string): number | null {
  const text = normalizeDigits(raw).replace(/[،,]/g, ' ').trim();
  if (!text) return null;
  const digitMatch = text.match(/\d+(?:\.\d+)?/);
  if (digitMatch) return parseFloat(digitMatch[0]);
  const words = text.split(' ').filter(Boolean);
  let total = 0;
  let found = false;
  for (const w of words) {
    if (w === 'و') continue;
    const val = WORD_NUMBERS[w];
    if (val === undefined) continue;
    found = true;
    if (val === 0.5) { total = (total || 0) + 0.5; continue; }
    total += val;
  }
  return found ? total : null;
}

const MINUTE = 1;
const HOUR = 60;
const DAY = 1440;

/**
 * Convert a human "posted time" string into an age in minutes.
 * Smaller = newer. Unparseable values sort last.
 */
export function parsePostedTimeMinutes(postedTime: string, scrapedAt?: string, now: number = Date.now()): number {
  const fallback = (): number => {
    if (!scrapedAt) return Number.MAX_SAFE_INTEGER - 1;
    const t = Date.parse(scrapedAt);
    if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER - 1;
    return Math.max(0, Math.round((now - t) / 60000));
  };

  let raw = normalizeDigits(postedTime || '').toLowerCase();
  if (!raw) return fallback();

  // strip scanner prefixes such as "اسکن ..." or "آخرین بروزرسانی ..."
  raw = raw.replace(/^(اسکن|آخرین بروزرسانی|بروزرسانی|ثبت شده در)\s*/u, '').trim();
  if (!raw) return fallback();

  if (/هم\s*اکنون|همین حالا|همین الان|لحظاتی پیش|لغظاتی پیش|الان|just now/u.test(raw)) return 0;
  if (/پریروز/u.test(raw)) return 2 * DAY;
  if (/دیروز/u.test(raw)) return DAY;
  if (/امروز/u.test(raw)) return 5;

  const unit = ((): { factor: number } | null => {
    if (/ثانیه/u.test(raw)) return { factor: 1 / 60 };
    if (/دقیقه/u.test(raw)) return { factor: MINUTE };
    if (/ساعت/u.test(raw)) return { factor: HOUR };
    if (/روز/u.test(raw)) return { factor: DAY };
    if (/هفته/u.test(raw)) return { factor: 7 * DAY };
    if (/ماه/u.test(raw)) return { factor: 30 * DAY };
    if (/سال/u.test(raw)) return { factor: 365 * DAY };
    return null;
  })();

  if (!unit) return fallback();

  // the quantity is whatever precedes the unit word
  const head = raw.slice(0, raw.search(/ثانیه|دقیقه|ساعت|روز|هفته|ماه|سال/u));
  const qty = parseFaQuantity(head);
  if (qty === null || Number.isNaN(qty)) return fallback();
  return qty * unit.factor;
}

/** Stable, locale-aware sort key for the "type" column: platform + category. */
export function getTypeRank(job: {
  platformKey?: string;
  categoryKey?: string;
  category?: string;
  categorizedTag?: string;
}): string {
  const platform = (job.platformKey || '').toLowerCase();
  const category = (job.categoryKey || job.category || '').toLowerCase();
  const tag = (job.categorizedTag || '').toLowerCase();
  return `${platform}__${category}__${tag}`;
}

export function formatRelativeMinutes(mins: number): string {
  if (!Number.isFinite(mins)) return '—';
  if (mins < 1) return 'هم‌اکنون';
  if (mins < 60) return `${Math.round(mins).toLocaleString('fa-IR')} دقیقه پیش`;
  if (mins < DAY) return `${Math.round(mins / HOUR).toLocaleString('fa-IR')} ساعت پیش`;
  return `${Math.round(mins / DAY).toLocaleString('fa-IR')} روز پیش`;
}

interface SortableJob {
  postedTime: string;
  scrapedAt?: string;
  budget: number;
  platformKey?: string;
  categoryKey?: string;
  category?: string;
  categorizedTag?: string;
}

/** Compare two jobs for the given sort config. */
export function compareJobs(a: SortableJob, b: SortableJob, cfg: SortConfig, now: number = Date.now()): number {
  let cmp = 0;
  switch (cfg.by) {
    case 'time': {
      // "value" = freshness: newer ⇒ larger, so dir=desc means newest first
      const ta = parsePostedTimeMinutes(a.postedTime, a.scrapedAt, now);
      const tb = parsePostedTimeMinutes(b.postedTime, b.scrapedAt, now);
      cmp = tb - ta;
      break;
    }
    case 'price': {
      const pa = Number.isFinite(a.budget) ? a.budget : 0;
      const pb = Number.isFinite(b.budget) ? b.budget : 0;
      cmp = pa - pb;
      break;
    }
    case 'type': {
      cmp = getTypeRank(a).localeCompare(getTypeRank(b), 'fa');
      break;
    }
    default:
      return 0;
  }
  return cfg.dir === 'asc' ? cmp : -cmp;
}

/** Non-mutating sort (returns a new array). */
export function sortJobs<T extends SortableJob>(jobs: T[], cfg: SortConfig, now: number = Date.now()): T[] {
  if (cfg.by === 'default') return jobs.slice();
  return jobs.slice().sort((a, b) => compareJobs(a, b, cfg, now));
}

/** Toggle direction, or switch column and start with a sensible default. */
export function nextSortConfig(current: SortConfig, by: SortBy): SortConfig {
  if (by === 'default') return { by: 'default', dir: 'desc' };
  if (current.by === by) return { by, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  // time → newest first; price → highest budget first; type → A→Z
  return { by, dir: by === 'type' ? 'asc' : 'desc' };
}

export const DEFAULT_SORT: SortConfig = { by: 'default', dir: 'desc' };

export function readStoredSort(storage: Pick<Storage, 'getItem'> | null | undefined): SortConfig {
  try {
    const raw = storage?.getItem('konklancer_sort_v1');
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortConfig>;
    const by: SortBy = parsed?.by === 'time' || parsed?.by === 'price' || parsed?.by === 'type' ? parsed.by : 'default';
    const dir: SortDir = parsed?.dir === 'asc' ? 'asc' : 'desc';
    return { by, dir };
  } catch {
    return DEFAULT_SORT;
  }
}

export function writeStoredSort(storage: Pick<Storage, 'setItem'> | null | undefined, cfg: SortConfig): void {
  try {
    storage?.setItem('konklancer_sort_v1', JSON.stringify(cfg));
  } catch {
    /* storage may be unavailable (private mode / file://) — sorting still works in memory */
  }
}
