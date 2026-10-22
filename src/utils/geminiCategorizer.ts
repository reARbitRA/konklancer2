import { JobCategoryTag } from '../types';
import { ALL_CATEGORIES, detectCategory, type CategoryMeta } from '../../shared/taxonomy';

/**
 * دسته‌بندی زنده‌ی پروژه با دو مسیر: سرور (AI/قاعده‌محور مشترک) و fallback محلی با همان تاکسونومی.
 * خروجی، کلید دسته از shared/taxonomy.json است (translation, graphic, video, audio, docs, writing,
 * marketing, data, image, uiux, automation, dev, other) — نه فقط چهار تگ کدنویسی.
 */
export async function categorizeJobWithGemini(
  title: string,
  description: string
): Promise<JobCategoryTag> {
  const cleanTitle = (title || '').trim();
  const cleanDesc = (description || '').trim();
  const keys = ALL_CATEGORIES.map((category: CategoryMeta) => category.key);
  const local = detectCategory(cleanTitle, cleanDesc).key;

  // ۱) مسیر سرور (که خودش هم تاکسونومی مشترک را برمی‌گرداند)
  try {
    const response = await fetch('/api/categorize-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: cleanTitle, description: cleanDesc }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.tag && keys.includes(data.tag)) return data.tag as JobCategoryTag;
    }
  } catch (error) {
    console.warn('[Categorizer] Server API request failed, using local taxonomy:', error);
  }

  // ۲) fallback محلی با همان کلیدواژه‌های تاکسونومی (بدون هم‌پوشانی با سرور)
  return local;
}
