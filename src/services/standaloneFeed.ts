import bundledCloudFeedRaw from '../../scanner/cloud-feed.jsonl?raw';
import { FreelanceJob } from '../types';
import { categoryAiFit, categoryLabel, CATEGORY_KEYS, detectCategory } from '../../shared/taxonomy';
import { isNativeAndroidApp } from './browserLLM';

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
  scraped_at?: string;
}

const LOCAL_SCANNED_STORAGE_KEY = 'konklancer_native_scanned_rows_v1';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const PERSIAN_WORDS: Record<string, number> = {
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هفت: 7,
  هشت: 8,
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
  const maxVal = Math.max(...amounts);
  return isRial ? Math.round(maxVal / 10) : Math.round(maxVal);
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
      return { hours: hrs, label: `اسکن ${formatHoursFa(hrs)}` };
    }
  }
  return { hours: null, label: 'تازه' };
}

function hashId(source: string, url: string): string {
  let h = 2166136261;
  const input = `${source}:${url}`;
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
      const ageTxt = `${item.bids_text || ''} ${item.posted_text || ''}`;
      if (ageTxt.includes('سال پیش') || ageTxt.includes('ماه پیش')) continue;
      seen.add(item.id);
      rows.push(item);
    } catch {
      // skip invalid row
    }
  }
  return rows;
}

export function buildJobsFromRows(rows: RawScannedRow[]): { jobs: FreelanceJob[]; scannedAt: string | null } {
  const jobs: (FreelanceJob & { _score: number; _scrapedAt: string })[] = rows.map((row) => {
    const budget = extractBudgetTomanClient(row.budget_text);
    const proposalsCount = extractProposalsClient(row.bids_text);
    const { hours, label: postedTime } = parseAgeClient(row.posted_text, row.bids_text, row.scraped_at);
    const det = detectCategory(row.title, row.summary || '');
    const categoryKey = (row.category && CATEGORY_KEYS.includes(row.category) ? row.category : det.key) as any;

    let score = 0;
    if (budget > 0) score += Math.min(40, (budget / 6_000_000) * 40);
    score += proposalsCount === 0 ? 25 : proposalsCount <= 3 ? 20 : proposalsCount <= 7 ? 14 : proposalsCount <= 15 ? 8 : 3;
    score += hours === null ? 6 : hours <= 6 ? 15 : hours <= 24 ? 12 : hours <= 72 ? 8 : hours <= 168 ? 4 : 0;
    score += Math.round(categoryAiFit(categoryKey) / 2);
    score = Math.round(Math.min(100, score));

    const platformInfo = row.source.startsWith('telegram:')
      ? { key: 'global' as const, label: `تلگرام @${row.source.slice(9)}` }
      : row.source === 'ponisha'
        ? { key: 'ponisha' as const, label: 'پونیشا' }
        : row.source === 'karlancer'
          ? { key: 'karlancer' as const, label: 'کارلانسر' }
          : { key: 'parskoders' as const, label: 'پارس‌کدرز' };

    const kwTags = `${row.title} ${row.summary || ''}`
      .split(/[\s،,()\-–—/:]+/)
      .filter((t) => t.length >= 3 && /[A-Za-z]/.test(t))
      .slice(0, 4);

    return {
      id: row.id,
      platform: platformInfo.label,
      platformKey: platformInfo.key,
      title: row.title.trim(),
      clientName: 'کارفرمای تأییدشده',
      clientRating: 0,
      clientReviews: 0,
      budget,
      budgetFormatted: budget > 0 ? `${budget.toLocaleString('fa-IR')} تومان` : 'بودجه نامشخص',
      deadline: 'نامشخص',
      postedTime,
      category: categoryLabel(categoryKey),
      categoryKey,
      tags: Array.from(new Set([categoryKey, ...kwTags])),
      description: (row.summary || '').trim() || row.title.trim(),
      proposalsCount,
      avgBid: budget > 0 ? Math.round(budget * 0.85) : 0,
      status: 'new' as const,
      priority: score >= 70 ? ('High' as const) : score >= 45 ? ('Medium' as const) : ('Low' as const),
      url: row.url,
      _score: score,
      _scrapedAt: row.scraped_at || '',
    };
  });

  jobs.sort((a, b) => b._score - a._score || b._scrapedAt.localeCompare(a._scrapedAt));
  const scannedAt = rows.map((r) => r.scraped_at || '').filter(Boolean).sort().at(-1) || null;
  return { jobs, scannedAt };
}

function readLocalSavedRows(): RawScannedRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_SCANNED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RawScannedRow[]) : [];
  } catch {
    return [];
  }
}

function saveLocalRows(newRows: RawScannedRow[]): RawScannedRow[] {
  const mergedMap = new Map<string, RawScannedRow>();
  for (const r of [...parseJsonlRows(bundledCloudFeedRaw), ...readLocalSavedRows(), ...newRows]) {
    const ageTxt = `${r.bids_text || ''} ${r.posted_text || ''}`;
    if (ageTxt.includes('سال پیش') || ageTxt.includes('ماه پیش')) continue;
    mergedMap.set(r.id, r);
  }
  const all = [...mergedMap.values()].slice(-500);
  try {
    localStorage.setItem(LOCAL_SCANNED_STORAGE_KEY, JSON.stringify(all.filter((r) => !bundledCloudFeedRaw.includes(r.id))));
  } catch {
    // ignore storage quota errors
  }
  return all;
}

/** تجزیه مستقیم DOM صفحات پارس‌کدرز، پونیشا، کارلنسر و تلگرام داخل مرورگر/APK اندروید */
export function parsePlatformHtmlClient(html: string, source: string, baseUrl: string): RawScannedRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nowIso = new Date().toISOString();
  const out: RawScannedRow[] = [];
  const seenUrls = new Set<string>();

  if (source.startsWith('telegram:')) {
    const channel = source.slice(9);
    doc.querySelectorAll('div.tgme_widget_message').forEach((msg) => {
      const textEl = msg.querySelector('.tgme_widget_message_text');
      const linkEl = msg.querySelector('a.tgme_widget_message_date');
      const body = (textEl?.textContent || '').replace(/\s+/g, ' ').trim();
      const href = linkEl?.getAttribute('href') || '';
      if (body.length < 20 || !href || seenUrls.has(href)) return;
      seenUrls.add(href);
      const timeEl = msg.querySelector('time');
      const titleMatch = body.match(/(?:عنوان|موضوع)\s*[:：]\s*(.+?)(?:\s*(?:شرح|توضیح|بودجه|دسته)|$)/);
      const title = (titleMatch?.[1]?.trim() || body).slice(0, 180);
      out.push({
        id: hashId(source, href),
        source,
        title,
        url: href,
        summary: body.slice(0, 900),
        posted_text: timeEl?.getAttribute('datetime') || '',
        scraped_at: nowIso,
      });
    });
    return out;
  }

  // Generic + Verified Selectors for Parscoders, Ponisha, Karlancer
  const linkSelector =
    source === 'ponisha'
      ? "a[href^='/project/']"
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
      anchor.closest('app-sidebar-project-card, article, .project-item, .project-card, li, tr, div.card') ||
      anchor.parentElement?.parentElement ||
      anchor;

    const titleEl =
      card.querySelector('h4, h3, h2, span.MuiTypography-h4, .project-title') || anchor;
    const title = (titleEl.textContent || anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 5) return;

    seenUrls.add(fullUrl);
    const cardText = (card.textContent || '').replace(/\s+/g, ' ').trim();
    const budgetMatch = cardText.match(/(?:حداکثر\s*بودجه\s*[:：]?\s*)?[\d۰-۹,،٬.]+\s*(?:میلیارد|میلیون|هزار)?\s*(?:تومان|ریال)/);
    const bidsMatch = cardText.match(/[\d۰-۹]+\s*پیشنهاد/);
    const timeMatch = cardText.match(/(?:[\d۰-۹]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|دوازده|بیست|سی)\s*(?:دقیقه|ساعت|روز|هفته|ماه|سال)\s*پیش/);

    out.push({
      id: hashId(source, fullUrl),
      source,
      title: title.slice(0, 200),
      url: fullUrl,
      summary: cardText.slice(0, 500),
      budget_text: budgetMatch ? budgetMatch[0] : '',
      bids_text: [timeMatch?.[0], bidsMatch?.[0]].filter(Boolean).join(' با '),
      posted_text: timeMatch ? timeMatch[0] : '',
      scraped_at: nowIso,
    });
  });

  return out;
}

/** بارگذاری اولیه فید: ابتدا سرور محلی اگر فعال باشد، و در APK اندروید یا حالت استاتیک از فید تعبیه‌شده + اسکن محلی */
export async function loadInitialFeedUnified(): Promise<{
  jobs: FreelanceJob[];
  source: 'scanner';
  scannedAt: string | null;
  scannedProjects: number;
}> {
  if (!isNativeAndroidApp()) {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.jobs) && data.jobs.length > 0) {
          return {
            jobs: data.jobs,
            source: 'scanner',
            scannedAt: data.scannedAt ?? null,
            scannedProjects: data.scannedProjects ?? data.jobs.length,
          };
        }
      }
    } catch {
      // Static / APK standalone mode — fall through to embedded + local feed
    }
  }

  const allRows = saveLocalRows([]);
  const { jobs, scannedAt } = buildJobsFromRows(allRows);
  return {
    jobs,
    source: 'scanner',
    scannedAt,
    scannedProjects: allRows.length,
  };
}

/**
 * اسکن مستقیم زنده روی خود تبلت اندروید (از طریق CapacitorHttp بدون هیچ سرور واسطه و بدون محدودیت CORS)
 */
export async function runDirectTabletLiveScan(
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; added: number; total: number; jobs: FreelanceJob[]; scannedAt: string | null; summary: string }> {
  const targets = [
    { source: 'parscoders', label: 'پارس‌کدرز', url: 'https://parscoders.com/project/only-available' },
    { source: 'ponisha', label: 'پونیشا', url: 'https://ponisha.ir/search/projects' },
    { source: 'karlancer', label: 'کارلانسر', url: 'https://www.karlancer.com/search' },
    { source: 'telegram:workarc', label: 'تلگرام @workarc', url: 'https://t.me/s/workarc' },
    { source: 'telegram:freelancer_projects', label: 'تلگرام @freelancer_projects', url: 'https://t.me/s/freelancer_projects' },
  ];

  const beforeIds = new Set(saveLocalRows([]).map((r) => r.id));
  const collected: RawScannedRow[] = [];
  const stats: string[] = [];

  for (const t of targets) {
    try {
      onProgress?.(`در حال دریافت زنده از ${t.label}...`);
      const res = await fetch(t.url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        stats.push(`${t.label}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const parsed = parsePlatformHtmlClient(html, t.source, t.url);
      collected.push(...parsed);
      stats.push(`${t.label}: ${parsed.length} پروژه`);
    } catch {
      stats.push(`${t.label}: عدم دسترسی شبکه`);
    }
  }

  const merged = saveLocalRows(collected);
  const added = merged.filter((r) => !beforeIds.has(r.id)).length;
  const { jobs, scannedAt } = buildJobsFromRows(merged);

  return {
    ok: collected.length > 0,
    added,
    total: merged.length,
    jobs,
    scannedAt,
    summary: stats.join(' · '),
  };
}

/** همگام‌سازی مستقیم فید ابری گیت‌هاب از داخل APK/مرورگر (اگر کاربر توکن گیت‌هاب داده باشد) */
export async function syncCloudFeedDirectFromGitHub(githubToken?: string): Promise<{
  ok: boolean;
  message: string;
  jobs?: FreelanceJob[];
  scannedAt?: string | null;
  total?: number;
}> {
  if (!isNativeAndroidApp()) {
    try {
      const res = await fetch('/api/bridge/sync-feed', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data?.ok) {
        return { ok: true, message: data.message || `همگام‌سازی انجام شد (${data.totalProjects} پروژه).` };
      }
    } catch {
      // fall through
    }
  }

  if (!githubToken?.trim()) {
    // در حالت بدون توکن گیت‌هاب روی APK، مستقیماً اسکن زنده بومی تبلت را اجرا کن!
    const scan = await runDirectTabletLiveScan();
    return {
      ok: scan.ok,
      message: scan.ok
        ? `اسکن مستقیم روی تبلت انجام شد (${scan.summary})`
        : 'برای همگام‌سازی ابری مخزن خصوصی گیت‌هاب، یا اینترنت پلتفرم‌ها را وصل کنید یا PAT گیت‌هاب را در تنظیمات بگذارید.',
      jobs: scan.jobs,
      scannedAt: scan.scannedAt,
      total: scan.total,
    };
  }

  const res = await fetch('https://api.github.com/repos/reARbitRA/konklancer2/contents/scanner/cloud-feed.jsonl?ref=main', {
    headers: {
      Authorization: `Bearer ${githubToken.trim()}`,
      Accept: 'application/vnd.github.raw+json',
    },
  });
  if (!res.ok) {
    return { ok: false, message: `خطا در خواندن فید از گیت‌هاب (HTTP ${res.status}).` };
  }
  const text = await res.text();
  const cloudRows = parseJsonlRows(text);
  const merged = saveLocalRows(cloudRows);
  const { jobs, scannedAt } = buildJobsFromRows(merged);
  return {
    ok: true,
    message: `فید ابری گیت‌هاب همگام شد (${cloudRows.length} پروژه تازه در مجموع ${merged.length} پروژه).`,
    jobs,
    scannedAt,
    total: merged.length,
  };
}
