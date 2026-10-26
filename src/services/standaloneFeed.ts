import bundledCloudFeedRaw from '../../scanner/cloud-feed.jsonl?raw';
import { FreelanceJob } from '../types';
import { categoryAiFit, categoryLabel, detectCategory } from '../../shared/taxonomy';
import { evaluateProjectRelevance } from '../../shared/relevanceEngine';
import { isNativeAndroidApp, isStandaloneClientMode } from './browserLLM';
import { fetchPageViaCloudRelay, readCloudSyncedRows, upsertCloudSyncedRows } from './cloudRelay';

export interface RawScannedRow {
  id: string;
  source: string;
  title: string;
  url: string;
  summary?: string;
  budget_text?: string;
  bids_text?: string;
  posted_text?: string;
  category?: string;
  tags_text?: string;
  scraped_at?: string;
}

const LOCAL_SCANNED_STORAGE_KEY = 'konklancer_native_scanned_rows_v2';
const LEGACY_SCANNED_STORAGE_KEY = 'konklancer_native_scanned_rows_v1';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const PERSIAN_WORDS: Record<string, number> = {
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هشت: 8,
  هفت: 7,
  نه: 9,
  ده: 10,
  یازده: 11,
  دوازده: 12,
  پانزده: 15,
  بیست: 20,
  سی: 30,
};

function toLatin(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const fa = FA_DIGITS.indexOf(d);
      if (fa >= 0) return String(fa);
      const ar = AR_DIGITS.indexOf(d);
      return ar >= 0 ? String(ar) : d;
    })
    .replace(/[,،٬]/g, '')
    .replace(/[٫.]/g, '.');
}

export function extractBudgetTomanClient(text?: string | null): number {
  if (!text) return 0;
  const normalized = toLatin(text);
  const isRial = /ریال/.test(normalized);
  const tokens: { value?: number; factor?: number }[] = [];
  const re = /(\d+(?:\.\d+)?)|(میلیارد|میلیون|هزار)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    if (m[1] !== undefined) tokens.push({ value: Number(m[1]) });
    else if (m[2] === 'میلیارد') tokens.push({ factor: 1_000_000_000 });
    else if (m[2] === 'میلیون') tokens.push({ factor: 1_000_000 });
    else if (m[2] === 'هزار') tokens.push({ factor: 1_000 });
  }
  const amounts: number[] = [];
  tokens.forEach((t, idx) => {
    if (t.value === undefined) return;
    const next = tokens[idx + 1];
    amounts.push(t.value * (next?.factor ?? 1));
  });
  if (!amounts.length) return 0;
  // برای بازه‌هایی مثل «۱۰,۰۰۰,۰۰۰ تا ۲۵,۰۰۰,۰۰۰ تومان»، میانگین واقع‌بینانه‌تر از سقف خام است
  const valid = amounts.filter((v) => v >= 50_000 && v <= 5_000_000_000);
  const chosen =
    valid.length >= 2 && normalized.includes(' تا ')
      ? Math.round((valid[0] + valid[valid.length - 1]) / 2)
      : Math.max(...(valid.length ? valid : amounts));
  return isRial ? Math.round(chosen / 10) : Math.round(chosen);
}

export function extractProposalsClient(text?: string | null): number {
  if (!text) return 0;
  const clean = toLatin(text).trim();
  if (!clean || /بدون\s*پیشنهاد|اولین\s*پیشنهاد/.test(clean)) return 0;
  const explicit = clean.match(/(\d+)\s*پیشنهاد/);
  if (explicit) return Number(explicit[1]);
  if (/^\d+$/.test(clean)) return Number(clean);
  if (/(دقیقه|ساعت|روز|هفته|ماه|سال)\s*پیش/.test(clean)) return 0;
  const num = clean.match(/\d+/);
  return num ? Number(num[0]) : 0;
}

function formatHoursFa(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60)).toLocaleString('fa-IR')} دقیقه پیش`;
  if (hours < 24) return `${Math.round(hours).toLocaleString('fa-IR')} ساعت پیش`;
  return `${Math.round(hours / 24).toLocaleString('fa-IR')} روز پیش`;
}

function parseAgeClient(posted?: string, bids?: string, scrapedAt?: string): { hours: number | null; label: string } {
  for (const raw of [posted, bids]) {
    if (!raw?.trim()) continue;
    const clean = toLatin(raw).trim();
    const iso = clean.match(/\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?/);
    if (iso) {
      const ts = Date.parse(iso[0]);
      if (!Number.isNaN(ts)) {
        const hrs = Math.max(0, (Date.now() - ts) / 3_600_000);
        return { hours: hrs, label: formatHoursFa(hrs) };
      }
    }
    const dm = clean.match(/(\d+)\s*(دقیقه|ساعت|روز|هفته|ماه|سال)\s*پیش/);
    if (dm) {
      const amt = Number(dm[1]);
      const unit = dm[2];
      const mult =
        unit === 'دقیقه' ? 1 / 60 : unit === 'ساعت' ? 1 : unit === 'روز' ? 24 : unit === 'هفته' ? 168 : unit === 'ماه' ? 720 : 8760;
      return { hours: amt * mult, label: `${amt.toLocaleString('fa-IR')} ${unit} پیش` };
    }
    for (const [word, amt] of Object.entries(PERSIAN_WORDS)) {
      const wm = clean.match(new RegExp(`(?:^|\\s)${word}(?:\\s+و\\s+\\S+)?\\s*(دقیقه|ساعت|روز|هفته|ماه|سال)\\s*پیش`));
      if (wm) {
        const unit = wm[1];
        const mult =
          unit === 'دقیقه' ? 1 / 60 : unit === 'ساعت' ? 1 : unit === 'روز' ? 24 : unit === 'هفته' ? 168 : unit === 'ماه' ? 720 : 8760;
        return { hours: amt * mult, label: wm[0].trim() };
      }
    }
  }
  if (scrapedAt) {
    const ts = Date.parse(scrapedAt);
    if (!Number.isNaN(ts)) {
      const hrs = Math.max(0, (Date.now() - ts) / 3_600_000);
      return { hours: hrs, label: formatHoursFa(hrs) };
    }
  }
  return { hours: null, label: 'تازه' };
}

function normalizeCanonicalProjectKey(url: string): string {
  try {
    const u = new URL(url);
    const ponishaMatch = u.pathname.match(/^\/project\/(\d+)/);
    if (u.hostname.includes('ponisha.ir') && ponishaMatch) {
      return `ponisha:${ponishaMatch[1]}`;
    }
    const parscodersMatch = u.pathname.match(/^\/project\/(\d+)/);
    if (u.hostname.includes('parscoders.com') && parscodersMatch) {
      return `parscoders:${parscodersMatch[1]}`;
    }
    return `${u.hostname.replace(/^www\./, '')}${decodeURIComponent(u.pathname).replace(/\/+$/, '')}`;
  } catch {
    return url.trim();
  }
}

function hashId(source: string, url: string): string {
  let h = 2166136261;
  const input = normalizeCanonicalProjectKey(url) || `${source}:${url}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${source.replace(/[^a-z0-9]/gi, '')}-${(h >>> 0).toString(16)}`;
}

export function parseJsonlRows(raw: string): RawScannedRow[] {
  const seen = new Set<string>();
  const rows: RawScannedRow[] = [];
  for (const line of (raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed) as RawScannedRow;
      if (!item?.id || !item?.title || seen.has(item.id)) continue;
      if (isStaleHistoricalRow(item)) continue;
      seen.add(item.id);
      rows.push(item);
    } catch {
      // skip invalid row
    }
  }
  return rows;
}

export function buildJobsFromRows(rows: RawScannedRow[]): { jobs: FreelanceJob[]; scannedAt: string | null } {
  const dedupedByUrl = new Map<string, RawScannedRow>();
  for (const r of rows) {
    if (!r?.title || !r?.url) continue;
    const canon = normalizeCanonicalProjectKey(r.url);
    const prev = dedupedByUrl.get(canon);
    if (!prev) {
      dedupedByUrl.set(canon, r);
    } else {
      // اگر نسخه جدیدتر بودجه یا توضیحات کامل‌تری دارد (مثلاً فید تلگرام پونیشا با بودجه دقیق)، ادغام کن
      dedupedByUrl.set(canon, {
        ...prev,
        ...r,
        id: prev.id,
        summary: (r.summary || '').length >= (prev.summary || '').length ? r.summary : prev.summary,
        budget_text: r.budget_text || prev.budget_text,
        bids_text: r.bids_text || prev.bids_text,
        posted_text: r.posted_text || prev.posted_text,
        tags_text: r.tags_text || prev.tags_text,
      });
    }
  }

  const jobs: (FreelanceJob & { _score: number; _scrapedAt: string })[] = [...dedupedByUrl.values()].map((row) => {
    const budget = extractBudgetTomanClient(row.budget_text);
    const proposalsCount = extractProposalsClient(row.bids_text);
    const { hours, label: postedTime } = parseAgeClient(row.posted_text, row.bids_text, row.scraped_at);

    // همیشه دسته‌بندی را با موتور وزن‌دار جدید (عنوان ۳.۵ برابر + تگ‌ها ۲.۲ برابر) محاسبه کن
    const det = detectCategory(row.title, row.summary || '', row.tags_text || '');
    const categoryKey = det.key;

    const kwTags = `${row.tags_text || ''} ${row.title} ${row.summary || ''}`
      .replace(/#/g, ' ')
      .split(/[\s،,()\-–—/:]+/)
      .filter((t) => t.length >= 3 && /[A-Za-z]/.test(t) && !['https', 'http', 'project', 'www', 'com'].includes(t.toLowerCase()))
      .slice(0, 5);

    const relevance = evaluateProjectRelevance(row.title, row.summary || '', categoryKey, kwTags);

    let score = 0;
    if (budget > 0) score += Math.min(38, (budget / 8_000_000) * 38);
    else score += 12; // پروژه‌های توافقی پونیشا جریمه شدید نشوند
    score += proposalsCount === 0 ? 22 : proposalsCount <= 3 ? 19 : proposalsCount <= 7 ? 14 : proposalsCount <= 15 ? 8 : 3;
    score += hours === null ? 8 : hours <= 6 ? 16 : hours <= 24 ? 13 : hours <= 72 ? 8 : hours <= 168 ? 4 : 0;
    score += Math.round(categoryAiFit(categoryKey) * 1.4);
    if (relevance.tier === 'prime') score += 10;
    if (relevance.tier === 'junk') score = Math.min(score, 15);
    score = Math.round(Math.min(100, score));

    const platformInfo =
      row.source === 'ponisha' || row.url.includes('ponisha.ir')
        ? { key: 'ponisha' as const, label: 'پونیشا' }
        : row.source === 'karlancer' || row.url.includes('karlancer.com')
          ? { key: 'karlancer' as const, label: 'کارلانسر' }
          : row.source.startsWith('telegram:')
            ? { key: 'global' as const, label: `تلگرام @${row.source.slice(9)}` }
            : { key: 'parskoders' as const, label: 'پارس‌کدرز' };

    const formattedBudgetText =
      row.budget_text && row.budget_text.includes('تا')
        ? row.budget_text.replace(/^بودجه\s*[:：]\s*/i, '').trim()
        : budget > 0
          ? `${budget.toLocaleString('fa-IR')} تومان`
          : 'بودجه توافقی';

    return {
      id: row.id,
      platform: platformInfo.label,
      platformKey: platformInfo.key,
      title: row.title.trim(),
      clientName: 'کارفرمای تأییدشده',
      clientRating: 0,
      clientReviews: 0,
      budget,
      budgetFormatted: formattedBudgetText,
      deadline: 'قابل توافق',
      postedTime,
      category: categoryLabel(categoryKey),
      categoryKey,
      tags: Array.from(new Set([categoryKey, ...kwTags])),
      description: (row.summary || '').trim() || row.title.trim(),
      proposalsCount,
      avgBid: budget > 0 ? Math.round(budget * 0.85) : 0,
      status: 'new' as const,
      priority: score >= 72 ? ('High' as const) : score >= 48 ? ('Medium' as const) : ('Low' as const),
      url: row.url,
      source: row.source,
      score,
      relevanceTier: relevance.tier,
      relevanceScore: relevance.relevanceScore,
      relevanceReason: relevance.reason,
      _score: score,
      _scrapedAt: row.scraped_at || '',
    };
  });

  jobs.sort((a, b) => b._score - a._score || b._scrapedAt.localeCompare(a._scrapedAt));
  const scrapedList = rows.map((r) => r.scraped_at || '').filter(Boolean).sort();
  const scannedAt = scrapedList.length > 0 ? scrapedList[scrapedList.length - 1] : null;
  return { jobs, scannedAt };
}

function readLocalSavedRows(): RawScannedRow[] {
  try {
    const v2 = localStorage.getItem(LOCAL_SCANNED_STORAGE_KEY);
    const v1 = localStorage.getItem(LEGACY_SCANNED_STORAGE_KEY);
    const list2 = v2 ? (JSON.parse(v2) as RawScannedRow[]) : [];
    const list1 = v1 ? (JSON.parse(v1) as RawScannedRow[]) : [];
    return [...list1, ...list2];
  } catch {
    return [];
  }
}

function isStaleHistoricalRow(r: RawScannedRow): boolean {
  const ageTxt = `${r.bids_text || ''} ${r.posted_text || ''}`;
  if (ageTxt.includes('سال پیش') || ageTxt.includes('ماه پیش')) return true;
  if (/^202[0-5]-/.test(String(r.posted_text || '').trim())) return true;
  return false;
}

function saveLocalRows(newRows: RawScannedRow[], cloudRows: RawScannedRow[] = []): RawScannedRow[] {
  const mergedMap = new Map<string, RawScannedRow>();
  for (const r of [...parseJsonlRows(bundledCloudFeedRaw), ...readLocalSavedRows(), ...cloudRows, ...newRows]) {
    if (!r || !r.id || isStaleHistoricalRow(r)) continue;
    const prev = mergedMap.get(r.id);
    if (!prev) {
      mergedMap.set(r.id, r);
    } else {
      mergedMap.set(r.id, {
        ...prev,
        ...r,
        summary: (r.summary || '').length >= (prev.summary || '').length ? r.summary : prev.summary,
        budget_text: r.budget_text || prev.budget_text,
      });
    }
  }
  const all = [...mergedMap.values()].slice(-1200);
  try {
    const customSaved = all.filter((r) => !bundledCloudFeedRaw.includes(r.id)).slice(-800);
    localStorage.setItem(LOCAL_SCANNED_STORAGE_KEY, JSON.stringify(customSaved));
  } catch {
    // ignore storage quota errors
  }
  return all;
}

/** استخراج کمترین شماره پست در صفحه تلگرام جهت صفحه‌بندی خودکار (?before=ID) */
export function extractMinTelegramPostId(html: string): number | null {
  const matches = [...html.matchAll(/data-post="[^/"]+\/(\d+)"/g)];
  if (!matches.length) return null;
  const nums = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 1);
  return nums.length ? Math.min(...nums) : null;
}

/** تجزیه عمیق و دقیق صفحات پونیشا (وب + تلگرام رسمی با بودجه دقیق)، پارس‌کدرز، کارلانسر و کانال‌های تلگرام */
export function parsePlatformHtmlClient(html: string, source: string, baseUrl: string): RawScannedRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nowIso = new Date().toISOString();
  const out: RawScannedRow[] = [];
  const seenUrls = new Set<string>();

  // ==================== ۱. پارسر اختصاصی کانال‌های تلگرام (شامل @ponisha_ir رسمی با بودجه و لینک مستقیم سایت!) ====================
  if (source.startsWith('telegram:') || baseUrl.includes('telegram.me/s/') || baseUrl.includes('t.me/s/')) {
    doc.querySelectorAll('div.tgme_widget_message').forEach((msg) => {
      const textEl = msg.querySelector('.tgme_widget_message_text');
      const dateLinkEl = msg.querySelector('a.tgme_widget_message_date');
      const inlineBtnEl = msg.querySelector('a.tgme_widget_message_inline_button.url_button');
      if (!textEl) return;

      // تبدیل تگ‌های <br> به خط جدید برای تفکیک دقیق عنوان، شرح، بودجه و هشتگ‌ها
      const clone = textEl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      const rawLines = (clone.textContent || '')
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const fullBody = rawLines.join('\n').trim();
      if (fullBody.length < 20) return;

      const directPlatformHref = inlineBtnEl?.getAttribute('href') || '';
      const fallbackTgHref = dateLinkEl?.getAttribute('href') || '';
      const targetHref = directPlatformHref || fallbackTgHref;
      if (!targetHref || seenUrls.has(targetHref)) return;
      seenUrls.add(targetHref);

      const timeEl = msg.querySelector('time');
      const hashtags = [...fullBody.matchAll(/#([A-Za-z0-9_\u0600-\u06FF]+)/g)].map((m) => m[1]).join(' ');

      // تشخیص قالب استاندارد پونیشا رسمی (@ponisha_ir): خط اول با 🔴 عنوان، خطوط 🔹 شرح، خط 💲 بودجه
      const budgetLineMatch = fullBody.match(/بودجه\s*[:：]\s*([^\n]+)/);
      let title = '';
      const explicitTitle = fullBody.match(/(?:عنوان|موضوع)\s*[:：]\s*([^\n]+)/);
      if (explicitTitle?.[1]) {
        title = explicitTitle[1].trim();
      } else {
        const firstLine = rawLines[0]
          .replace(/^[🔴🔵🟢🟡🟠🟣⚡📢💼📌🔹🔸•\-–—\s]+/u, '')
          .trim();
        title = firstLine;
      }

      const cleanedDescLines = rawLines
        .slice(explicitTitle ? 0 : 1)
        .filter(
          (l) =>
            !l.includes('@ponisha_ir') &&
            !l.includes('ترکیبی از قیمت و کیفیت اهمیت دارد') &&
            !l.startsWith('#'),
        )
        .map((l) => l.replace(/^[🔹🔸▪️•]+\s*/u, ''));

      const effectiveSource = targetHref.includes('ponisha.ir/')
        ? 'ponisha'
        : targetHref.includes('karlancer.com/')
          ? 'karlancer'
          : targetHref.includes('parscoders.com/')
            ? 'parscoders'
            : source;

      out.push({
        id: hashId(effectiveSource, targetHref),
        source: effectiveSource,
        title: title.slice(0, 200),
        url: targetHref,
        summary: (cleanedDescLines.join(' ').trim() || fullBody).slice(0, 1400),
        budget_text: budgetLineMatch ? `بودجه: ${budgetLineMatch[1].trim()}` : '',
        posted_text: timeEl?.getAttribute('datetime') || '',
        tags_text: hashtags,
        scraped_at: nowIso,
      });
    });
    return out;
  }

  // ==================== ۲. استخراج داده‌های JSON ساختاریافته (Next.js / Nuxt / Hydration) در کارلانسر و پونیشا ====================
  doc.querySelectorAll('script').forEach((scr) => {
    const raw = scr.textContent || '';
    if (raw.length < 200 || (!raw.includes('"projects"') && !raw.includes('"items"'))) return;
    try {
      const parsed = JSON.parse(raw);
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (typeof node.title === 'string' && node.title.length >= 5 && (node.slug || node.url || node.id)) {
          const slugOrId = node.url || (node.slug ? `/projects/${node.slug}` : null);
          if (slugOrId) {
            try {
              const fullUrl = new URL(String(slugOrId), baseUrl).toString();
              if (!seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                const minB = node.minBudget || node.min_budget || node.budgetMin || '';
                const maxB = node.maxBudget || node.max_budget || node.budgetMax || node.amount || '';
                const budgetStr =
                  minB && maxB
                    ? `${minB} تا ${maxB} تومان`
                    : maxB || minB
                      ? `${maxB || minB} تومان`
                      : '';
                const skills = Array.isArray(node.skills)
                  ? node.skills.map((s: any) => (typeof s === 'string' ? s : s?.name || s?.title || '')).join(' ')
                  : '';
                out.push({
                  id: hashId(source, fullUrl),
                  source,
                  title: node.title.trim().slice(0, 200),
                  url: fullUrl,
                  summary: String(node.description || node.summary || node.body || '').trim().slice(0, 1400),
                  budget_text: budgetStr,
                  bids_text: node.bidsCount !== undefined ? `${node.bidsCount} پیشنهاد` : '',
                  posted_text: String(node.createdAt || node.publishedAt || ''),
                  tags_text: skills,
                  scraped_at: nowIso,
                });
              }
            } catch {
              // skip invalid URL
            }
          }
        }
        Object.values(node).forEach(walk);
      };
      walk(parsed);
    } catch {
      // ignore non-JSON scripts
    }
  });

  // ==================== ۳. استخراج کامل DOM کارت‌های پارس‌کدرز، پونیشا و کارلانسر ====================
  const linkSelector =
    source === 'ponisha'
      ? "a[href*='/project/']"
      : source === 'karlancer'
        ? "a[href*='/projects/']"
        : "a[href*='/project/']";

  doc.querySelectorAll(linkSelector).forEach((anchor) => {
    const rawHref = anchor.getAttribute('href') || '';
    if (!rawHref) return;
    let fullUrl = rawHref;
    try {
      fullUrl = new URL(rawHref, baseUrl).toString();
    } catch {
      return;
    }
    const pathname = new URL(fullUrl).pathname;
    if (source === 'parscoders' && !/^\/project\/\d+\//.test(pathname)) return;
    if (source === 'ponisha' && !/^\/project\/\d+/.test(pathname)) return;
    if (source === 'karlancer' && !/^\/projects\/[^/]+/.test(pathname)) return;
    if (seenUrls.has(fullUrl)) return;

    const card =
      anchor.closest('app-sidebar-project-card, article, .project-item, .project-card, .panel-body, li, tr, div.card, div[class*="card"], div[class*="project"]') ||
      anchor.parentElement?.parentElement?.parentElement ||
      anchor.parentElement?.parentElement ||
      anchor;

    const titleEl =
      card.querySelector('h4, h3, h2, a[href*="/project/"] strong, span.MuiTypography-h4, .project-title') || anchor;
    const title = (titleEl.textContent || anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4 || title === 'مشاهده' || title === 'ارسال پیشنهاد') return;

    seenUrls.add(fullUrl);
    const cardText = (card.textContent || '').replace(/\s+/g, ' ').trim();
    const budgetMatch = cardText.match(
      /(?:حداکثر\s*بودجه\s*[:：]?\s*|بودجه\s*[:：]?\s*)?[\d۰-۹,،٬.]+(?:\s*تا\s*[\d۰-۹,،٬.]+)?\s*(?:میلیارد|میلیون|هزار)?\s*(?:تومان|ریال)/,
    );
    const bidsMatch = cardText.match(/[\d۰-۹]+\s*پیشنهاد/);
    const timeMatch = cardText.match(
      /(?:[\d۰-۹]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|دوازده|پانزده|بیست|سی)(?:\s+و\s+\S+)?\s*(?:دقیقه|ساعت|روز|هفته|ماه|سال)\s*پیش/,
    );

    // استخراج تگ‌های مهارت داخل کارت
    const skillBadges: string[] = [];
    card.querySelectorAll('a[href*="/skill/"], a[href*="/tag/"], .label, .badge, .chip, span[class*="tag"]').forEach((b) => {
      const txt = (b.textContent || '').trim();
      if (txt.length >= 2 && txt.length <= 35) skillBadges.push(txt);
    });

    const cleanSummary = cardText
      .replace(title, '')
      .replace(/ارسال پیشنهاد|مشاهده پروژه|ثبت پیشنهاد/g, '')
      .trim();

    out.push({
      id: hashId(source, fullUrl),
      source,
      title: title.slice(0, 200),
      url: fullUrl,
      summary: (cleanSummary || title).slice(0, 1000),
      budget_text: budgetMatch ? budgetMatch[0] : '',
      bids_text: [timeMatch?.[0], bidsMatch?.[0]].filter(Boolean).join(' با '),
      posted_text: timeMatch ? timeMatch[0] : '',
      tags_text: skillBadges.join(' '),
      scraped_at: nowIso,
    });
  });

  return out;
}

/** واکشی هوشمند HTML بدون محدودیت CORS (بومی اندروید برای سایت‌های ایرانی + رله آمریکا برای تلگرام و مرورگر) */
export async function fetchHtmlSmart(targetUrl: string): Promise<string> {
  if (isNativeAndroidApp() && !targetUrl.includes('t.me/') && !targetUrl.includes('telegram.me/')) {
    try {
      const res = await fetch(targetUrl, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (res.ok) {
        const txt = await res.text();
        if (txt && txt.length > 500) return txt;
      }
    } catch {
      // fall back to cloud relay
    }
  }
  const cloud = await fetchPageViaCloudRelay(targetUrl);
  return cloud.html || '';
}

/**
 * فید معتبر سرور (Express) را می‌خواند. اگر اپ به‌صورت آفلاین/فایل اجرا شود یا
 * سرور در دسترس نباشد، بی‌صدا به فید ابری/محلی برمی‌گردد.
 */
async function readServerFeedJobs(timeoutMs = 5000): Promise<{ jobs: FreelanceJob[]; scannedAt: string | null; total: number } | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch('/api/jobs', {
      headers: { Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const jobs: FreelanceJob[] = Array.isArray(data?.jobs) ? data.jobs : [];
    if (jobs.length === 0) return null;
    return {
      jobs,
      scannedAt: typeof data?.scannedAt === 'string' ? data.scannedAt : null,
      total: typeof data?.scannedProjects === 'number' ? data.scannedProjects : jobs.length,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadInitialFeedUnified(): Promise<{
  jobs: FreelanceJob[];
  source: 'scanner';
  scannedAt: string | null;
  scannedProjects: number;
}> {
  // ۱) فید رسمی سرور (منبع حقیقت) — وقتی اپ روی وب/دسکتاپ اجرا می‌شود
  const serverFeed = await readServerFeedJobs();
  if (serverFeed && serverFeed.jobs.length > 0) {
    return {
      jobs: serverFeed.jobs,
      source: 'scanner',
      scannedAt: serverFeed.scannedAt,
      scannedProjects: serverFeed.total,
    };
  }

  // ۲) حالت آفلاین/اندروید: ترکیب فید همراه، فید ابری و ردیف‌های ذخیره‌شده
  const cloudRows = await readCloudSyncedRows<RawScannedRow>();
  const allRows = saveLocalRows([], cloudRows);
  const { jobs, scannedAt } = buildJobsFromRows(allRows);
  return {
    jobs,
    source: 'scanner',
    scannedAt,
    scannedProjects: allRows.length,
  };
}

export async function syncCloudFeedDirectFromGitHub(_githubToken?: string): Promise<{
  ok: boolean;
  message: string;
  jobs: FreelanceJob[];
  total: number;
  scannedAt: string | null;
}> {
  const res = await loadInitialFeedUnified();
  const cleanCount = res.jobs.filter((j) => j.relevanceTier !== 'junk').length;
  return {
    ok: res.jobs.length > 0,
    message: `همگام‌سازی ابری کامل شد: ${cleanCount.toLocaleString('fa-IR')} پروژه معتبر آماده نمایش است.`,
    jobs: res.jobs,
    total: cleanCount,
    scannedAt: res.scannedAt,
  };
}

/**
 * اسکن عمیق چندصفحه‌ای (Deep Multi-Page Scanner):
 * - ۴ صفحه پارس‌کدرز + دسته‌های تخصصی برنامه‌نویسی، هوش مصنوعی و تولید محتوا (~۱۲۰ پروژه زنده)
 * - ۴ صفحه متوالی فید زنده رسمی پونیشا (@ponisha_ir با بودجه دقیق و لینک مستقیم سایت ~۸۰ پروژه تازه امروز)
 * - ۳ صفحه وب کارلانسر و پونیشا (مستقیم روی تبلت اندروید + همگام‌سازی ابری Supabase)
 * - کانال پروژه‌های مهندسی @workarc
 */
export async function runDirectTabletLiveScan(
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; added: number; total: number; jobs: FreelanceJob[]; scannedAt: string | null; summary: string }> {
  const beforeIds = new Set(saveLocalRows([]).map((r) => r.id));
  const collected: RawScannedRow[] = [];

  // فاز ۱: دریافت موازی صفحات اول پلتفرم‌ها + دسته‌های طلایی پارس‌کدرز + مخزن ابری
  onProgress?.('فاز ۱/۳: اسکن موازی صفحات اول پونیشا، پارس‌کدرز (۴ بخش)، کارلانسر و کلاد...');

  const wave1Targets = [
    { source: 'parscoders', url: 'https://parscoders.com/project/only-available' },
    { source: 'parscoders', url: 'https://parscoders.com/project/only-available?page=2' },
    { source: 'parscoders', url: 'https://parscoders.com/project/only-available?page=3' },
    { source: 'parscoders', url: 'https://parscoders.com/project/service/programming' },
    { source: 'parscoders', url: 'https://parscoders.com/project/service/artificial-intelligence' },
    { source: 'parscoders', url: 'https://parscoders.com/project/service/content-creation' },
    { source: 'telegram:ponisha_ir', url: 'https://telegram.me/s/ponisha_ir' },
    { source: 'telegram:workarc', url: 'https://telegram.me/s/workarc' },
  ];

  const [cloudRows, ...wave1Html] = await Promise.all([
    readCloudSyncedRows<RawScannedRow>(),
    ...wave1Targets.map((t) => fetchHtmlSmart(t.url)),
  ]);

  let ponishaMinPostId: number | null = null;
  wave1Targets.forEach((t, idx) => {
    const html = wave1Html[idx] || '';
    if (!html) return;
    if (t.source === 'telegram:ponisha_ir') {
      ponishaMinPostId = extractMinTelegramPostId(html);
    }
    collected.push(...parsePlatformHtmlClient(html, t.source, t.url));
  });

  // فاز ۲: صفحه‌بندی عمیق خودکار پونیشا (@ponisha_ir صفحات ۲، ۳ و ۴) + صفحات بعدی کارلانسر/پونیشا در اندروید
  onProgress?.('فاز ۲/۳: پیمایش عمیق صفحات ۲ تا ۴ پونیشا و کارلانسر برای استخراج کامل پروژه‌ها...');

  for (let step = 0; step < 3 && ponishaMinPostId && ponishaMinPostId > 20; step++) {
    const nextTgUrl = `https://telegram.me/s/ponisha_ir?before=${ponishaMinPostId}`;
    const html = await fetchHtmlSmart(nextTgUrl);
    if (!html) break;
    collected.push(...parsePlatformHtmlClient(html, 'telegram:ponisha_ir', nextTgUrl));
    ponishaMinPostId = extractMinTelegramPostId(html);
  }

  // اسکن مستقیم چندصفحه‌ای کارلانسر و پونیشا (به‌ویژه روی APK اندروید با IP ایران)
  const directIranTargets = [
    { source: 'karlancer', url: 'https://www.karlancer.com/search' },
    { source: 'karlancer', url: 'https://www.karlancer.com/search?page=2' },
    { source: 'karlancer', url: 'https://www.karlancer.com/search?page=3' },
    { source: 'ponisha', url: 'https://ponisha.ir/search/projects' },
    { source: 'ponisha', url: 'https://ponisha.ir/search/projects?page=2' },
  ];

  const wave3Html = await Promise.all(directIranTargets.map((t) => fetchHtmlSmart(t.url)));
  directIranTargets.forEach((t, idx) => {
    const html = wave3Html[idx] || '';
    if (!html) return;
    collected.push(...parsePlatformHtmlClient(html, t.source, t.url));
  });

  // فاز ۳: پالایش، دسته‌بندی دقیق و ذخیره‌سازی ابری فقط پروژه‌های غیرزباله
  onProgress?.('فاز ۳/۳: دسته‌بندی هوشمند، حذف آگهی‌های نامربوط و همگام‌سازی مخزن ابری...');

  const cleanRowsForCloud = collected.filter((r) => {
    const det = detectCategory(r.title, r.summary || '', r.tags_text || '');
    const rel = evaluateProjectRelevance(r.title, r.summary || '', det.key);
    return rel.tier !== 'junk';
  });

  if (cleanRowsForCloud.length > 0) {
    upsertCloudSyncedRows(cleanRowsForCloud);
  }

  const merged = saveLocalRows(collected, cloudRows);
  const added = merged.filter((r) => !beforeIds.has(r.id)).length;
  const { jobs } = buildJobsFromRows(merged);

  const byPlatform = {
    ponisha: jobs.filter((j) => j.platformKey === 'ponisha' && j.relevanceTier !== 'junk').length,
    karlancer: jobs.filter((j) => j.platformKey === 'karlancer' && j.relevanceTier !== 'junk').length,
    parskoders: jobs.filter((j) => j.platformKey === 'parskoders' && j.relevanceTier !== 'junk').length,
    prime: jobs.filter((j) => j.relevanceTier === 'prime').length,
  };

  return {
    ok: jobs.length > 0,
    added,
    total: jobs.filter((j) => j.relevanceTier !== 'junk').length,
    jobs,
    scannedAt: new Date().toISOString(),
    summary: `شکار طلایی: ${byPlatform.prime} · پونیشا: ${byPlatform.ponisha} · پارس‌کدرز: ${byPlatform.parskoders} · کارلانسر: ${byPlatform.karlancer}`,
  };
}
