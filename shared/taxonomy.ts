// دسته‌بندی مشترک (سرور + کلاینت). منبع واحد حقیقت: shared/taxonomy.json
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

/** یکسان‌سازی حروف عربی/فارسی، نیم‌فاصله (ZWNJ) و اعراب برای تطبیق دقیق عناوین پلتفرم‌های ایرانی */
export function normalizePersianText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '') // حذف اعراب و تنوین و همزه بالای ه
    .replace(/ي|ئ/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة|ۀ/g, 'ه')
    .replace(/أ|إ/g, 'ا')
    .replace(/[\u200c\u200f\u200e\u00a0]+/g, ' ') // تبدیل نیم‌فاصله به فاصله معمولی
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPersian(input: string): string {
  return input.replace(/\s+/g, '');
}

/** کلیدواژه‌های لاتین با مرز کلمه؛ فارسی با تطبیق نرمال‌شده و مقاوم در برابر نیم‌فاصله/چسبیدگی */
export function matchesKeywordNormalized(normSpaced: string, normCompact: string, keyword: string): boolean {
  const raw = keyword.trim().toLowerCase();
  if (!raw) return false;
  if (/^[\x20-\x7e]+$/.test(raw)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${raw.replace(ESCAPE, '\\$&')}([^a-z0-9]|$)`, 'i');
    return pattern.test(normSpaced);
  }
  const kwNorm = normalizePersianText(raw);
  if (!kwNorm) return false;
  if (normSpaced.includes(kwNorm)) return true;
  // برای عبارات چندواژه‌ای یا مرکب فارسی (مثل وب‌سایت / وبسایت / وب سایت، کپی‌رایتینگ / کپیرایتینگ)
  const kwCompact = compactPersian(kwNorm);
  if (kwCompact.length >= 5 && normCompact.includes(kwCompact)) return true;
  return false;
}

export const STRONG_KEYWORD_WEIGHT = 8;

export function keywordWeight(keyword: string): number {
  return 1 + keyword.split(/\s+/).filter(Boolean).length;
}

export function categoryScore(category: CategoryMeta, text: string): number {
  const normSpaced = normalizePersianText(text);
  const normCompact = compactPersian(normSpaced);
  if (!normSpaced) return 0;

  let total = 0;
  for (const keyword of category.keywords) {
    if (matchesKeywordNormalized(normSpaced, normCompact, keyword)) {
      total += keywordWeight(keyword);
    }
  }
  for (const keyword of category.strong ?? []) {
    if (matchesKeywordNormalized(normSpaced, normCompact, keyword)) {
      total += STRONG_KEYWORD_WEIGHT;
    }
  }
  return total;
}

/**
 * امتیازدهی چندبخشی وزن‌دار:
 * - بخش اول (عنوان پروژه): ضریب ۳.۵ برابر (مهم‌ترین شاخص ماهیت واقعی خروجی کارفرما)
 * - بخش دوم (توضیحات بدنه): ضریب ۱.۰ برابر
 * - بخش سوم به بعد (هشتگ‌ها و مهارت‌ها): ضریب ۲.۲ برابر
 */
export function categoryScores(...parts: Array<string | undefined | null>): Record<string, number> {
  const scores: Record<string, number> = {};
  if (parts.length === 0) return scores;

  const weights = [3.5, 1.0, 2.2, 2.2];
  parts.forEach((part, idx) => {
    const clean = (part || '').trim();
    if (!clean) return;
    const mult = weights[idx] ?? 1.0;
    for (const category of CATEGORIES) {
      const partScore = categoryScore(category, clean);
      if (partScore > 0) {
        scores[category.key] = Math.round((scores[category.key] || 0) + partScore * mult);
      }
    }
  });

  return scores;
}

/**
 * دسته‌ی غالب یک پروژه بر پایه‌ی مجموع وزن کلیدواژه‌های منطبق (با اولویت قوی به عنوان پروژه).
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

export const categoryPromptList = (): string =>
  ALL_CATEGORIES.map((category) => `${category.key} (${category.fa})`).join(' · ');
