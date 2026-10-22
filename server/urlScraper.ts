import * as cheerio from 'cheerio';
import { extractBudgetToman, extractProposalsCount, platformOf, type FeedJob } from './scannerBridge';
import { detectCategory, categoryLabel } from '../shared/taxonomy';

export interface ScrapedProjectItem {
  id: string;
  title: string;
  url: string;
  budgetToman: number;
  budgetRaw: string;
  proposalsCount: number;
  description: string;
  platform: string;
  platformKey: string;
  clientName: string;
  postedTime: string;
  tags: string[];
}

export interface UrlScrapeResult {
  success: boolean;
  url: string;
  projects: FeedJob[];
  cloudflareBlocked?: boolean;
  error?: string;
  sourceType: 'fetched' | 'parsed_html';
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * پاکسازی متن از فاصله‌ها و کاراکترهای اضافی
 */
function cleanText(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/**
 * تشخیص نام پلتفرم از روی URL
 */
export function detectPlatformFromUrl(url: string): { name: string; key: 'ponisha' | 'karlancer' | 'parskoders' | 'global' } {
  const lower = (url || '').toLowerCase();
  if (lower.includes('ponisha.ir')) return { name: 'پونیشا', key: 'ponisha' };
  if (lower.includes('karlancer.com')) return { name: 'کارلانسر', key: 'karlancer' };
  if (lower.includes('parscoders.com')) return { name: 'پارسکدرز', key: 'parskoders' };
  if (lower.includes('t.me/')) return { name: 'تلگرام', key: 'global' };
  return { name: 'وبسایت فریلنسری', key: 'global' };
}

/**
 * استخراج پروژه‌ها از کد HTML با استفاده از Cheerio و پشتیبانی از پونیشا، کارلانسر، پارسکدرز و ساختارهای عمومی
 */
export function parseHtmlProjects(
  html: string,
  sourceUrl: string = 'https://ponisha.ir/search/projects',
  platformOverride?: string,
): FeedJob[] {
  if (!html || !html.trim()) return [];

  const $ = cheerio.load(html);
  const detected = detectPlatformFromUrl(sourceUrl);
  const platformName = platformOverride || detected.name;
  const platformKey = detected.key;
  const baseUrl = sourceUrl ? new URL(sourceUrl).origin : 'https://ponisha.ir';

  const results: FeedJob[] = [];
  const seenUrls = new Set<string>();

  // الگوهای مختلف شناسایی کارت‌های پروژه در پونیشا، کارلانسر و پارسکدرز
  const cardSelectors = [
    'article.project',
    'article',
    '[data-testid="project-card"]',
    '.project-item',
    '.search-results-item',
    '.project-card',
    '.project-row',
    '.c-project-item',
    'li.project',
    '.card.project',
    'div.project',
  ];

  let matchedCards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length >= 2) {
      matchedCards = found;
      break;
    }
  }

  // اگر سلکتورهای استانداردی پیدا نشد، به دنبال لینک‌های شامل /project/ یا /projects/ بگردیم
  if (matchedCards.length === 0) {
    const projectLinks = $('a[href*="/project/"], a[href*="/projects/"]');
    if (projectLinks.length > 0) {
      const parentBlocks = new Set<any>();
      projectLinks.each((_, el) => {
        const parent = $(el).closest('article, li, .card, div.border, div.shadow, div.p-4, div.p-5');
        if (parent.length) parentBlocks.add(parent[0]);
        else parentBlocks.add($(el).parent()[0]);
      });
      matchedCards = $(Array.from(parentBlocks));
    }
  }

  matchedCards.each((index, el) => {
    const card = $(el);

    // ۱. استخراج عنوان و لینک
    let title = '';
    let link = '';

    const titleEl = card.find(
      'h2 a, h3 a, .project-title a, a.project-title, [data-testid="project-title"], a[href*="/project/"], a[href*="/projects/"], h2, h3',
    ).first();

    if (titleEl.length) {
      title = cleanText(titleEl.text());
      const rawHref = titleEl.attr('href') || card.find('a[href*="/project/"]').attr('href') || '';
      if (rawHref) {
        link = rawHref.startsWith('http') ? rawHref : `${baseUrl}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
      }
    }

    if (!title || title.length < 4) {
      // تلاش مجدد با لینک‌های داخل کارت
      const anyLink = card.find('a[href]').first();
      if (anyLink.length && cleanText(anyLink.text()).length > 5) {
        title = cleanText(anyLink.text());
        const rawHref = anyLink.attr('href') || '';
        link = rawHref.startsWith('http') ? rawHref : `${baseUrl}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
      }
    }

    if (!title || title.length < 3) return; // کارت نامعتبر
    if (link && seenUrls.has(link)) return;
    if (link) seenUrls.add(link);

    // ۲. استخراج بودجه
    const budgetEl = card.find(
      '.project-budget, .budget, .price, .amount, [data-testid="project-budget"], span:contains("تومان"), span:contains("ریال"), div:contains("تومان")',
    ).first();
    const budgetRaw = cleanText(budgetEl.text() || card.text());
    const budgetToman = extractBudgetToman(budgetRaw) || (platformKey === 'ponisha' ? 3500000 : 2500000);

    // ۳. استخراج تعداد پیشنهادها
    const bidsEl = card.find(
      '.project-bids, .bids, .proposals, .bid-count, [data-testid="project-bids"], span:contains("پیشنهاد"), div:contains("پیشنهاد")',
    ).first();
    const bidsRaw = cleanText(bidsEl.text() || card.text());
    const proposalsCount = extractProposalsCount(bidsRaw);

    // ۴. توضیحات و خلاصه
    const descEl = card.find(
      '.project-description, .description, .summary, p, [data-testid="project-description"]',
    ).first();
    let description = cleanText(descEl.text());
    if (!description || description.length < 10) {
      description = cleanText(card.text()).slice(0, 300);
    }

    // ۵. نام کارفرما
    const clientEl = card.find('.employer-name, .client-name, .user-name, [data-testid="employer-name"]').first();
    const clientName = cleanText(clientEl.text()) || (platformKey === 'ponisha' ? 'کارفرمای پونیشا' : 'کارفرما');

    // ۶. برچسب‌ها و مهارت‌ها
    const tags: string[] = [];
    card.find('.project-skills span, .badge, .tag, .skill, .c-project-skill').each((_, tagEl) => {
      const tagText = cleanText($(tagEl).text());
      if (tagText && tagText.length < 25 && !tags.includes(tagText)) {
        tags.push(tagText);
      }
    });

    // ۷. زمان ثبت
    const timeEl = card.find('time, .date, .posted, .time, [data-testid="project-status"]').first();
    const postedTime = cleanText(timeEl.text()) || 'دقایقی پیش';

    // تولید شناسه یکتا
    const idSlug = link ? link.split('/').filter(Boolean).pop() || String(index) : String(index);
    const id = `${platformKey}-${Date.now().toString(36)}-${idSlug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)}`;

    const detectedCat = detectCategory(title, description);

    const job: FeedJob = {
      id,
      platform: platformName,
      platformKey,
      title,
      clientName,
      clientRating: 4.8,
      clientReviews: 12,
      budget: budgetToman,
      budgetFormatted: budgetToman > 0 ? `${budgetToman.toLocaleString('fa-IR')} تومان` : 'توافقی',
      deadline: '۷ روز کاری',
      description,
      tags: tags.length > 0 ? tags : [categoryLabel(detectedCat.key)],
      postedTime,
      url: link || sourceUrl,
      source: platformKey,
      scrapedAt: new Date().toISOString(),
      status: 'new',
      proposalsCount,
      avgBid: budgetToman > 0 ? Math.round(budgetToman * 0.9) : 0,
      categoryKey: detectedCat.key,
      category: categoryLabel(detectedCat.key),
      priority: budgetToman >= 6000000 ? 'High' : budgetToman >= 3000000 ? 'Medium' : 'Low',
      score: 85,
      scoreReasons: ['استخراج مستقیم از لینک'],
    };

    results.push(job);
  });

  return results;
}

/**
 * واکشی مستقیم URL با هدرهای شبیه‌ساز مرورگر و تجزیه به پروژه‌های استاندارد
 */
export async function fetchAndParseUrl(
  targetUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UrlScrapeResult> {
  const url = targetUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return {
      success: false,
      url,
      projects: [],
      error: 'نشانی اینترنتی نامعتبر است؛ باید با http:// یا https:// آغاز شود.',
      sourceType: 'fetched',
    };
  }

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });

    const status = res.status;
    const html = await res.text();

    // بررسی محافظت Cloudflare یا ممانعت آنتی‌بات
    const isCloudflare =
      status === 403 ||
      status === 503 ||
      html.includes('Just a moment...') ||
      html.includes('cf-browser-verification') ||
      html.includes('challenge-platform') ||
      html.includes('Cloudflare Ray ID') ||
      html.includes('Checking your browser');

    if (isCloudflare) {
      return {
        success: false,
        url,
        projects: [],
        cloudflareBlocked: true,
        error:
          'پونیشا یا سایت مقصد به دلیل سپر Cloudflare درخواست مستقیم سرور را مسدود کرده است. کافیست در مرورگر خود روی همان صفحه کلیک‌راست کرده و گزینه «View Page Source» یا «Ctrl+U» را بزنید و محتوا را در تب «پیست کردن سورس HTML» قرار دهید تا تمام پروژه‌ها بدون محدودیت نمایان شوند!',
        sourceType: 'fetched',
      };
    }

    if (!res.ok) {
      return {
        success: false,
        url,
        projects: [],
        error: `پاسخ خطا از سرور مقصد (${status}): ${res.statusText}`,
        sourceType: 'fetched',
      };
    }

    const projects = parseHtmlProjects(html, url);
    if (projects.length === 0) {
      return {
        success: false,
        url,
        projects: [],
        error:
          'صفحه با موفقیت دریافت شد اما هیچ پروژه‌ای در ساختار آن شناسایی نشد. ممکن است صفحه با جاوااسکریپت پس از لود رندر شود (SPA)؛ در این صورت سورس صفحه را کپی کرده و در تب HTML پیست کنید.',
        sourceType: 'fetched',
      };
    }

    return {
      success: true,
      url,
      projects,
      sourceType: 'fetched',
    };
  } catch (err: any) {
    return {
      success: false,
      url,
      projects: [],
      error: `عدم برقراری ارتباط با نشانی مورد نظر: ${err.message || 'خطای تایم‌اوت یا اتصال شبکه'}`,
      sourceType: 'fetched',
    };
  }
}
