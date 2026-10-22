// دسته‌بندی مشترک (سرور + کلاینت). منبع واحد حقیقت: shared/taxonomy.json
// هم اسکنر (Python) و هم بک‌اند/فرانت‌اند (TypeScript) از همین فایل می‌خوانند تا از هم جدا نشوند.
import taxonomy from '../shared/taxonomy.json';

export interface CategoryMeta {
  key: string;
  fa: string;
  aiFit: number;
  keywords: string[];
  strong?: string[];
}

const CATEGORIES: CategoryMeta[] = (taxonomy.categories as CategoryMeta[]).map((category) => ({
  ...category,
  keywords: category.keywords ?? [],
  strong: category.strong ?? [],
}));

export const FALLBACK_CATEGORY: CategoryMeta = {
  ...(taxonomy.fallback as Omit<CategoryMeta, 'keywords' | 'strong'>),
  keywords: [],
  strong: [],
};

export const ALL_CATEGORIES: CategoryMeta[] = [...CATEGORIES, FALLBACK_CATEGORY];

export const CATEGORY_KEYS = ALL_CATEGORIES.map((category) => category.key);
export type CategoryId = string;

export const categoryLabel = (key: string): string =>
  ALL_CATEGORIES.find((category) => category.key === key)?.fa ?? FALLBACK_CATEGORY.fa;

export const categoryAiFit = (key: string): number =>
  ALL_CATEGORIES.find((category) => category.key === key)?.aiFit ?? FALLBACK_CATEGORY.aiFit;

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** کلیدواژه‌های لاتین با مرز کلمه، فارسی/عربی به شکل زیررشته. */
function matchesKeyword(text: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return false;
  if (/^[\x20-\x7e]+$/.test(needle)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(ESCAPE, '\\$&')}([^a-z0-9]|$)`, 'i');
    return pattern.test(text);
  }
  return text.includes(needle);
}

/** کلیدواژه‌ی «قوی» = نام خودِ محصول قابل‌تحویل (ترجمه، لوگو، گویندگی...). مشابه scanner/taxonomy.py */
export const STRONG_KEYWORD_WEIGHT = 8;

/** وزن کلیدواژه = ۱ + تعداد واژه‌ها (عبارت‌های بلندتر خاص‌ترند). مشابه scanner/taxonomy.py */
export function keywordWeight(keyword: string): number {
  return 1 + keyword.split(/\s+/).filter(Boolean).length;
}

/** امتیاز یک دسته = مجموع وزن کلیدواژه‌های معمولی + وزن قوی برای کلیدواژه‌های strong */
export function categoryScore(category: CategoryMeta, text: string): number {
  let total = 0;
  for (const keyword of category.keywords) {
    if (matchesKeyword(text, keyword)) total += keywordWeight(keyword);
  }
  for (const keyword of category.strong ?? []) {
    if (matchesKeyword(text, keyword)) total += STRONG_KEYWORD_WEIGHT;
  }
  return total;
}

export function categoryScores(...parts: Array<string | undefined | null>): Record<string, number> {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  const scores: Record<string, number> = {};
  if (!text.trim()) return scores;
  for (const category of CATEGORIES) {
    const total = categoryScore(category, text);
    if (total > 0) scores[category.key] = total;
  }
  return scores;
}

/**
 * دسته‌ی غالب یک پروژه بر پایه‌ی مجموع وزن کلیدواژه‌های منطبق.
 * در تساوی، ترتیب فایل taxonomy (خاص‌تر اول) تعیین‌کننده است.
 */
export function detectCategory(...parts: Array<string | undefined | null>): CategoryMeta {
  const scores = categoryScores(...parts);
  const keys = Object.keys(scores);
  if (keys.length === 0) return FALLBACK_CATEGORY;
  const bestKey = keys.reduce((best, key) => {
    if (scores[key] > scores[best]) return key;
    if (scores[key] === scores[best]) {
      return CATEGORIES.findIndex((c) => c.key === key) < CATEGORIES.findIndex((c) => c.key === best) ? key : best;
    }
    return best;
  });
  return ALL_CATEGORIES.find((category) => category.key === bestKey) ?? FALLBACK_CATEGORY;
}

/** برای پرامپت AI: فهرست دسته‌ها با برچسب فارسی. */
export const categoryPromptList = (): string =>
  ALL_CATEGORIES.map((category) => `${category.key} (${category.fa})`).join(' · ');
