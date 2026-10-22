// SPEC-004 — پل بین اسکنر فقط‌خواندنی (scanner/) و رابط کاربری.
//
// این ماژول:
//   1. خروجی JSONL اسکنر (`scanner/out/projects.jsonl`) را می‌خواند،
//   2. هر `Project` را به شکلی که فرانت‌اند می‌فهمد (`FeedJob`) نگاشت می‌کند،
//      شامل استخراج بودجه از متن فارسی/لاتین و تعداد پیشنهادها،
//   3. امتیاز پیش‌فیلتر (SPEC-004 R5) را پیش از هر تماس AI حساب می‌کند،
//   4. یک اجرای اسکن را با قفل درون‌فرایندی راه می‌اندازد.
//
// هیچ ورود، POST یا دور زدن ضدربات اینجا نیست؛ فقط خواندن فایل و اجرای CLI اسکنر.

import { spawn } from 'child_process';
import { execFileSync } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// مدل داده
// ---------------------------------------------------------------------------
import { ALL_CATEGORIES, CATEGORY_KEYS, categoryAiFit, categoryLabel, detectCategory } from '../shared/taxonomy';

export interface ScannedProject {
  id: string;
  source: string;
  title: string;
  url: string;
  summary?: string;
  budget_text?: string;
  bids_text?: string;
  posted_text?: string;
  /** کلید دسته از shared/taxonomy.json؛ اسکنر آن را روی هر رکورد می‌نویسد. */
  category?: string;
  scraped_at?: string;
}

export type FeedPlatformKey = 'ponisha' | 'karlancer' | 'parskoders' | 'global';
// کلید دسته = کلیدهای shared/taxonomy.json (ترجمه، گرافیک، ویدیو، صدا، کدنویسی و ...)
export type FeedCategoryKey = string;

export interface FeedJob {
  id: string;
  platform: string;
  platformKey: FeedPlatformKey;
  title: string;
  clientName: string;
  clientRating: number;
  clientReviews: number;
  budget: number;
  budgetFormatted: string;
  deadline: string;
  postedTime: string;
  category: string;
  categoryKey: FeedCategoryKey;
  tags: string[];
  description: string;
  proposalsCount: number;
  avgBid: number;
  status: 'new';
  priority: 'High' | 'Medium' | 'Low';
  url: string;
  source: string;
  scrapedAt: string;
  score: number;
  scoreReasons: string[];
}

// ---------------------------------------------------------------------------
// اعداد و متن‌های فارسی
// ---------------------------------------------------------------------------
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی/عربی و جداکننده‌های هزار را به شکل قابل‌محاسبه درمی‌آورد. */
export function toLatinDigits(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const fa = FA_DIGITS.indexOf(d);
      if (fa >= 0) return String(fa);
      const ar = AR_DIGITS.indexOf(d);
      return ar >= 0 ? String(ar) : d;
    })
    .replace(/[,،٬]/g, '') // جداکننده‌های هزار: , ، ٬
    .replace(/[٫.]/g, '.');
}

const MAGNITUDES: { pattern: RegExp; factor: number }[] = [
  { pattern: /میلیارد/, factor: 1_000_000_000 },
  { pattern: /میلیون/, factor: 1_000_000 },
  { pattern: /هزار/, factor: 1_000 },
];

/**
 * بودجه را از متن آزاد فارسی بیرون می‌کشد و به تومان برمی‌گرداند.
 * مثال‌ها: «حداکثر ۵۰۰ هزار تومان» → 500000 ، «۲,۵۰۰,۰۰۰ تومان» → 2500000 ،
 * «۳ تا ۵ میلیون» → 5000000 (سقف بازه) ، «۱٫۵ میلیارد ریال» → 150000000 تومان ،
 * «توافقی» → 0 (نامشخص).
 */
export function extractBudgetToman(text?: string | null): number {
  if (!text) return 0;
  const normalized = toLatinDigits(text);
  const isRial = /ریال/.test(normalized);
  const tokens: { value?: number; factor?: number }[] = [];
  const tokenRe = /(\d+(?:\.\d+)?)|(میلیارد|میلیون|هزار)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(normalized)) !== null) {
    if (match[1] !== undefined) tokens.push({ value: Number(match[1]) });
    else {
      const magnitude = MAGNITUDES.find((m) => m.pattern.test(match![2]));
      if (magnitude) tokens.push({ factor: magnitude.factor });
    }
  }

  const amounts: number[] = [];
  tokens.forEach((token, index) => {
    if (token.value === undefined) return;
    const next = tokens[index + 1];
    const factor = next && next.factor !== undefined ? next.factor : 1;
    amounts.push(token.value * factor);
  });
  if (amounts.length === 0) return 0;

  const toman = Math.max(...amounts);
  return isRial ? Math.round(toman / 10) : Math.round(toman);
}

/** تعداد پیشنهادهای ثبت‌شده را از متن می‌خواند؛ «۳ پیشنهاد» → 3 ، «بدون پیشنهاد» → 0. */
export function extractProposalsCount(text?: string | null): number {
  if (!text) return 0;
  const found = toLatinDigits(text).match(/\d+/);
  return found ? Number(found[0]) : 0;
}

export function formatToman(amount: number): string {
  return amount > 0 ? `${amount.toLocaleString('fa-IR')} تومان` : 'بودجه نامشخص';
}

// ---------------------------------------------------------------------------
// نگاشت پلتفرم و دسته‌بندی
// ---------------------------------------------------------------------------
const PLATFORM_LABELS: Record<string, string> = {
  ponisha: 'پونیشا',
  karlancer: 'کارلانسر',
  parscoders: 'پارس‌کدرز',
};

export function platformOf(source: string): { key: FeedPlatformKey; label: string } {
  if (source.startsWith('telegram:')) {
    return { key: 'global', label: `تلگرام @${source.slice('telegram:'.length)}` };
  }
  const key: FeedPlatformKey =
    source === 'ponisha' ? 'ponisha' : source === 'karlancer' ? 'karlancer' : 'parskoders';
  return { key, label: PLATFORM_LABELS[source] ?? source };
}

/**
 * دسته‌ی پروژه = همان دسته‌بندی مشترک (shared/taxonomy.json).
 * قبلاً اینجا فقط پنج دسته‌ی کدنویسی وجود داشت و کارهای ترجمه/طراحی/گرافیک درست دسته‌بندی نمی‌شدند.
 */
export function categorize(title: string, summary = ''): { key: FeedCategoryKey; label: string; aiFit: number } {
  const category = detectCategory(title, summary);
  return { key: category.key, label: category.fa, aiFit: category.aiFit };
}

/** آیا این کلید، یکی از دسته‌های رسمی تاکسونومی است؟ */
export const isKnownCategory = (key?: string): boolean => Boolean(key) && CATEGORY_KEYS.includes(key as string);

export const allCategoryKeys = (): string[] => [...CATEGORY_KEYS];

export const describeCategories = (): Array<{ key: string; label: string; aiFit: number }> =>
  ALL_CATEGORIES.map((category) => ({ key: category.key, label: categoryLabel(category.key), aiFit: categoryAiFit(category.key) }));

// ---------------------------------------------------------------------------
// امتیاز پیش‌فیلتر (SPEC-004 R5 / SPEC-006 R8)
// ---------------------------------------------------------------------------
export interface ScoreOptions {
  include?: string[];
  /** محدودکردن صریح به این دسته‌ها؛ خالی یعنی همه‌ی دسته‌ها (پیش‌فرض) */
  categories?: string[];
  now?: number;
}

function postedAgeHours(posted?: string, scrapedAt?: string, now = Date.now()): number | null {
  if (!posted) return null;
  const iso = posted.match(/\d{4}-\d{2}-\d{2}T[\d:.]+/);
  if (iso) {
    const ts = Date.parse(iso[0]);
    if (!Number.isNaN(ts)) return Math.max(0, (now - ts) / 3_600_000);
  }
  const relative = toLatinDigits(posted).match(/(\d+)\s*(دقیقه|ساعت|روز|هفته)/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    if (unit === 'دقیقه') return amount / 60;
    if (unit === 'ساعت') return amount;
    if (unit === 'روز') return amount * 24;
    if (unit === 'هفته') return amount * 24 * 7;
  }
  if (scrapedAt) {
    const ts = Date.parse(scrapedAt);
    if (!Number.isNaN(ts)) return Math.max(0, (now - ts) / 3_600_000);
  }
  return null;
}

/**
 * امتیاز ۰ تا ۱۰۰ بر پایه‌ی بودجه، رقابت (تعداد پیشنهاد)، تازگی و هم‌پوشانی کلیدواژه.
 * این تابع عمداً هیچ تماس AI ندارد تا هم رایگان باشد و هم پیش از `callLLM` اجرا شود.
 */
/** امتیاز خنثی وقتی کلیدواژه‌های دلخواه مطابقت ندارند (پروژه نامرتبط نیست، فقط بی‌کلیدواژه است). */
export const NEUTRAL_KEYWORD_BONUS = 8;

export function scoreProject(project: ScannedProject, options: ScoreOptions = {}) {
  const now = options.now ?? Date.now();
  const reasons: string[] = [];
  const budget = extractBudgetToman(project.budget_text);
  const proposals = extractProposalsCount(project.bids_text);
  const ageHours = postedAgeHours(project.posted_text, project.scraped_at, now);

  let score = 0;

  if (budget > 0) {
    const budgetPoints = Math.min(40, (budget / 6_000_000) * 40);
    score += budgetPoints;
    reasons.push(`بودجه ${formatToman(budget)}`);
  } else {
    reasons.push('بودجه نامشخص');
  }

  if (proposals === 0) {
    score += 25;
    reasons.push('بدون پیشنهاد تا این لحظه');
  } else if (proposals <= 3) {
    score += 20;
    reasons.push(`رقابت کم (${proposals} پیشنهاد)`);
  } else if (proposals <= 7) {
    score += 14;
  } else if (proposals <= 15) {
    score += 8;
  } else {
    score += 3;
    reasons.push(`رقابت سنگین (${proposals} پیشنهاد)`);
  }

  if (ageHours === null) {
    score += 6;
  } else if (ageHours <= 6) {
    score += 15;
    reasons.push('تازه‌منتشرشده (زیر ۶ ساعت)');
  } else if (ageHours <= 24) {
    score += 12;
  } else if (ageHours <= 72) {
    score += 8;
  } else if (ageHours <= 168) {
    score += 4;
  }

  const haystack = `${project.title} ${project.summary ?? ''}`.toLowerCase();
  const keywords = (options.include ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  const hits = keywords.filter((k) => haystack.includes(k));
  if (hits.length > 0) {
    score += Math.min(20, hits.length * 8);
    reasons.push(`هم‌پوشانی کلیدواژه: ${hits.join('، ')}`);
  }

  // هیچ کلیدواژه‌ای نباید پروژه را بی‌ارزش کند: وقتی فهرست دلخواه داده شده ولی مطابقت ندارد،
  // امتیاز خنثی داده می‌شود و پروژه حذف نمی‌شود (اسکن همه‌ی دسته‌ها، نه فقط کدنویسی).
  const category = categorize(project.title, project.summary);
  const explicitKeywords = keywords.length > 0;
  if (explicitKeywords && hits.length === 0) {
    score += NEUTRAL_KEYWORD_BONUS;
    reasons.push('کلیدواژه‌ی دلخواه مطابقت نداشت؛ امتیاز خنثی (پروژه کنار گذاشته نمی‌شود)');
  }

  // تناسب دسته با AI: کاری که هوش مصنوعی می‌تواند تولید کند کمی جلوتر می‌افتد.
  const fitPoints = Math.round(category.aiFit / 2);
  if (fitPoints > 0) {
    score += fitPoints;
    reasons.push(`دسته: ${category.label} (تناسب با AI: ${category.aiFit}/10)`);
  }

  return {
    score: Math.round(Math.min(100, score)),
    reasons,
    budget,
    proposals,
    ageHours,
    categoryKey: category.key,
    categoryLabel: category.label,
    categoryAiFit: category.aiFit,
  };
}

export function priorityFromScore(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// خواندن JSONL و ساختن فید
// ---------------------------------------------------------------------------
/** خطوط JSONL را می‌خواند، خط‌های خراب را رد می‌کند و بر پایه `id` یکتا می‌کند (SPEC-004 R2). */
export function readProjects(file: string): ScannedProject[] {
  if (!fs.existsSync(file)) return [];
  const seen = new Set<string>();
  const projects: ScannedProject[] = [];
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as ScannedProject;
      if (!parsed || typeof parsed.id !== 'string' || !parsed.id || seen.has(parsed.id)) continue;
      if (typeof parsed.title !== 'string' || !parsed.title.trim()) continue;
      seen.add(parsed.id);
      projects.push(parsed);
    } catch {
      // خط ناقص/خراب: نادیده گرفته می‌شود تا یک نوشتن نیمه‌کاره کل فید را از کار نیندازد.
    }
  }
  return projects;
}

export function matchesFilters(
  project: ScannedProject,
  include: string[],
  exclude: string[],
  categories: string[] = [],
): boolean {
  const blob = `${project.title} ${project.summary ?? ''}`.toLowerCase();
  if (exclude.filter(Boolean).some((word) => blob.includes(word.toLowerCase()))) return false;
  const words = include.filter(Boolean);
  if (words.length > 0 && !words.some((word) => blob.includes(word.toLowerCase()))) return false;
  // دسته فقط وقتی محدود می‌کند که کاربر صریحاً دسته‌ها را انتخاب کرده باشد.
  const wanted = categories.filter(Boolean);
  if (wanted.length > 0 && !wanted.includes(projectCategoryKey(project))) return false;
  return true;
}

/** کلید دسته‌ی پروژه: مقدار اسکنر اگر معتبر باشد، وگرنه تشخیص محلی با همان تاکسونومی. */
export function projectCategoryKey(project: ScannedProject): string {
  if (isKnownCategory(project.category)) return project.category as string;
  return categorize(project.title, project.summary).key;
}

export function mapProjectToJob(project: ScannedProject, scoreOptions: ScoreOptions = {}): FeedJob {
  const { key: platformKey, label: platform } = platformOf(project.source);
  const { score, reasons, budget, proposals } = scoreProject(project, scoreOptions);
  const category = categorize(project.title, project.summary);
  const categoryKey = projectCategoryKey(project);
  const summary = (project.summary ?? '').trim();
  const description = summary || project.title;
  const tags = new Set<string>([category.key]);
  const keywordTags = `${project.title} ${summary}`
    .split(/[\s،,()\-–—/:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && /[A-Za-z]/.test(t))
    .slice(0, 4);
  keywordTags.forEach((tag) => tags.add(tag));

  return {
    id: project.id,
    platform,
    platformKey,
    title: project.title,
    clientName: 'نامشخص (از فهرست عمومی)',
    clientRating: 0,
    clientReviews: 0,
    budget,
    budgetFormatted: formatToman(budget),
    deadline: 'نامشخص',
    postedTime: project.posted_text?.trim() || 'تازه اسکن‌شده',
    category: categoryLabel(categoryKey),
    categoryKey,
    tags: [...tags],
    description,
    proposalsCount: proposals,
    avgBid: budget > 0 ? Math.round(budget * 0.85) : 0,
    status: 'new',
    priority: priorityFromScore(score),
    url: project.url,
    source: project.source,
    scrapedAt: project.scraped_at ?? '',
    score,
    scoreReasons: reasons,
  };
}

export interface FeedOptions extends ScoreOptions {
  /** فقط پروژه‌هایی با امتیاز مساوی یا بالاتر از این آستانه برمی‌گردند (SPEC-004 R5). */
  minScore?: number;
  exclude?: string[];
  include?: string[];
  categories?: string[];
}

export function buildFeed(projects: ScannedProject[], options: FeedOptions = {}) {
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  const categories = options.categories ?? [];
  const minScore = options.minScore ?? 0;

  const jobs = projects
    .filter((p) => matchesFilters(p, include, exclude, categories))
    .map((p) => mapProjectToJob(p, { include, categories, now: options.now }))
    .filter((job) => job.score >= minScore)
    .sort((a, b) => b.score - a.score || (b.scrapedAt || '').localeCompare(a.scrapedAt || ''));

  const scannedAt =
    jobs.map((j) => j.scrapedAt).filter(Boolean).sort().at(-1) ??
    projects.map((p) => p.scraped_at ?? '').filter(Boolean).sort().at(-1) ??
    null;

  return { jobs, scannedAt };
}

export function readScanTargets(cwd = process.cwd()): ScanTarget[] {
  const targets: ScanTarget[] = [];
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(cwd, 'scanner', 'platforms.json'), 'utf8'));
    for (const platform of registry.platforms ?? []) {
      const hasSelectors = Boolean(platform.scan_selectors);
      const hasCandidates = Boolean(platform.listing_url_candidates?.length) || hasSelectors;
      const ready = Boolean(platform.scan_enabled) && hasCandidates;
      // دلیل غیرفعال بودن باید قابل‌اقدام باشد، نه یک پیام کلی.
      const reason = ready
        ? undefined
        : !platform.scan_enabled
          ? `scan_enabled=false؛ با enable --platform ${platform.id} فعال کنید`
          : `نشانی/انتخابگر ثبت نشده؛ با autodetect --platform ${platform.id} --save کالیبره کنید`;
      targets.push({
        id: platform.id,
        name: platform.name ?? platform.id,
        kind: 'platform',
        enabled: ready,
        reason,
      });
    }
  } catch {
    // فایل رجیستری نبود: فقط کانال‌های تلگرام گزارش می‌شوند.
  }
  try {
    const telegram = JSON.parse(fs.readFileSync(path.join(cwd, 'scanner', 'telegram_sources.json'), 'utf8'));
    for (const channel of telegram.channels ?? []) {
      targets.push({
        id: `telegram:${channel.username}`,
        name: channel.title ? `${channel.title} (@${channel.username})` : `@${channel.username}`,
        kind: 'telegram',
        enabled: Boolean(channel.scan_enabled),
        reason: channel.scan_enabled ? undefined : 'scan_enabled=false',
      });
    }
  } catch {
    // فهرست کانال‌ها نبود: نادیده گرفته می‌شود.
  }
  return targets;
}

// ---------------------------------------------------------------------------
// اجرای اسکنر
// ---------------------------------------------------------------------------
export interface ScanConfig {
  python: string;
  platforms: string[];
  telegram: boolean;
  pages: number;
  delay: number;
  include: string[];
  exclude: string[];
  /** دسته‌های مجاز؛ خالی یعنی همه (پیش‌فرض) */
  categories: string[];
  /** کالیبراسیون خودکار ساختار صفحه در زمان اسکن (`scan --auto`) */
  autoCalibrate: boolean;
  minScore: number;
  outFile: string;
  intervalMinutes: number;
  timeoutMs: number;
  cwd: string;
}

export interface ScanTarget {
  id: string;
  name: string;
  kind: 'platform' | 'telegram';
  enabled: boolean;
  reason?: string;
}

const csv = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export function defaultFeedFile(cwd = process.cwd()): string {
  return path.join(cwd, 'scanner', 'out', 'projects.jsonl');
}

export function readScanConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): ScanConfig {
  return {
    python: (env.KONKLANCER_PYTHON || 'python3').trim(),
    platforms: csv(env.KONKLANCER_SCAN_PLATFORMS),
    telegram: env.KONKLANCER_SCAN_TELEGRAM === '1',
    pages: Number(env.KONKLANCER_SCAN_PAGES) || 1,
    delay: Number(env.KONKLANCER_SCAN_DELAY) || 8,
    include: csv(env.KONKLANCER_SCAN_INCLUDE),
    exclude: csv(env.KONKLANCER_SCAN_EXCLUDE),
    categories: csv(env.KONKLANCER_SCAN_CATEGORIES),
    autoCalibrate: env.KONKLANCER_SCAN_AUTO !== '0',
    minScore: Number(env.KONKLANCER_SCAN_MIN_SCORE) || 0,
    outFile: (env.KONKLANCER_PROJECTS_FILE || '').trim() || defaultFeedFile(cwd),
    intervalMinutes: Number(env.KONKLANCER_SCAN_INTERVAL_MIN) || 0,
    timeoutMs: Number(env.KONKLANCER_SCAN_TIMEOUT_MS) || 180_000,
    cwd,
  };
}

/** آرگومان‌های CLI اسکنر؛ جدا از `runScanner` تست می‌شود. */
export function buildScanArgs(config: ScanConfig): string[] {
  const args = ['-m', 'scanner.konklancer_scan', 'scan'];
  config.platforms.forEach((platform) => args.push('--platform', platform));
  if (config.telegram) args.push('--telegram');
  args.push('--pages', String(config.pages));
  args.push('--delay', String(config.delay));
  if (config.include.length) args.push('--include', config.include.join(','));
  if (config.exclude.length) args.push('--exclude', config.exclude.join(','));
  if (config.categories?.length) args.push('--categories', config.categories.join(','));
  // بدون --auto، پلتفرم‌های بدون انتخابگر هیچ‌وقت پروژه‌ای برنمی‌گردانند؛ پیش‌فرض روشن است.
  if (config.autoCalibrate !== false) args.push('--auto');
  args.push('--out', config.outFile);
  return args;
}

export interface ScanRunResult {
  ok: boolean;
  code: number | null;
  output: string;
  timedOut: boolean;
}

let scanning = false;
export const scannerBusy = () => scanning;

/** یک اجرای اسکن با قفل درون‌فرایندی؛ هرگز هم‌زمان دو اسکن اجرا نمی‌شود. */
export async function runScanner(config: ScanConfig): Promise<ScanRunResult> {
  if (scanning) {
    return { ok: false, code: null, output: 'یک اسکن دیگر در حال اجراست؛ این درخواست رد شد.', timedOut: false };
  }
  scanning = true;
  const args = buildScanArgs(config);
  try {
    return await new Promise<ScanRunResult>((resolve) => {
      const child = spawn(config.python, args, { cwd: config.cwd });
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, config.timeoutMs);

      child.stdout.on('data', (chunk) => (output += chunk.toString()));
      child.stderr.on('data', (chunk) => (output += chunk.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, code: null, output: `اجرای مفسر پایتون ناموفق بود: ${err.message}`, timedOut: false });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && !timedOut,
          code,
          output: output.trim().slice(-4000),
          timedOut,
        });
      });
    });
  } finally {
    scanning = false;
  }
}


// ---------------------------------------------------------------------------
// فید ابری (اسکن روی رانرهای گیت‌هاب)
// ---------------------------------------------------------------------------
// چرا لازم است: محیط‌هایی مثل سندباکس/مرورگر به سایت‌های فریلنسری دسترسی TCP ندارند.
// ورک‌فلوی .github/workflows/scanner-feed.yml همان اسکنر واقعی را روی رانر گیت‌هاب
// اجرا می‌کند و نتیجه را در scanner/cloud-feed.jsonl می‌گذارد. این ماژول با GitHub API
// (فقط https://api.github.com) فید و وضعیت را می‌خواند، درخواست اسکن می‌دهد و محلی ذخیره می‌کند.

export interface CloudFeedConfig {
  repo: string;
  ref: string;
  requestPath: string;
  feedPath: string;
  statusPath: string;
  outFile: string;
  token: string;
  pollTimeoutMs: number;
}

export interface CloudFetchOptions {
  /** برای تست؛ پیش‌فرض fetch جهانی است. */
  fetchImpl?: typeof fetch;
}

const CLOUD_DEFAULTS = {
  ref: '',
  requestPath: 'scanner/scan-request.json',
  feedPath: 'scanner/cloud-feed.jsonl',
  statusPath: 'scanner/cloud-status.json',
};

function ghToken(): string {
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN']) {
    const value = (process.env[key] || '').trim();
    if (value) return value;
  }
  // اگر کاربر با gh CLI لاگین است، همان توکن استفاده می‌شود (بدون ذخیره‌سازی).
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 8000 }).trim();
  } catch {
    return '';
  }
}

/** اگر KONKLANCER_CLOUD_FEED_REPO تنظیم شده باشد، فید ابری فعال است. */
export function readCloudFeedConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  defaultOutFile = defaultFeedFile(cwd),
): CloudFeedConfig | null {
  const repo = (env.KONKLANCER_CLOUD_FEED_REPO || '').trim();
  if (!repo.includes('/')) return null;
  return {
    repo,
    ref: (env.KONKLANCER_CLOUD_FEED_REF || CLOUD_DEFAULTS.ref).trim(),
    requestPath: (env.KONKLANCER_CLOUD_REQUEST_PATH || CLOUD_DEFAULTS.requestPath).trim(),
    feedPath: (env.KONKLANCER_CLOUD_FEED_PATH || CLOUD_DEFAULTS.feedPath).trim(),
    statusPath: (env.KONKLANCER_CLOUD_STATUS_PATH || CLOUD_DEFAULTS.statusPath).trim(),
    outFile: (env.KONKLANCER_PROJECTS_FILE || '').trim() || defaultOutFile,
    token: (env.KONKLANCER_CLOUD_TOKEN || '').trim() || ghToken(),
    pollTimeoutMs: Number(env.KONKLANCER_CLOUD_POLL_MS) || 300_000,
  };
}

// ---------------------------------------------------------------------------
// دسترسی به GitHub API — با پشتیبان `gh`
// ---------------------------------------------------------------------------
// چرا: در بعضی محیط‌ها (سندباکس، پروکسی سازمانی، گواهی TLS سفارشی) `fetch` نود با خطای
// «unable to verify the first certificate» شکست می‌خورد، در حالی که `gh` سالم کار می‌کند.
// در آن حالت‌ها همان درخواست با `gh api` انجام می‌شود تا «اسکن ابری» واقعاً کار کند.
// در محیط عادی (بدون مشکل گواهی) مسیر از ابتدا `fetch` است و gh اصلاً صدا زده نمی‌شود.

export type CloudTransport = 'node-fetch' | 'gh-cli';

let lastTransport: CloudTransport | null = null;

/** آخرین روش ارتباطی موفق با GitHub (برای نمایش در وضعیت/عیب‌یابی). */
export const cloudTransport = (): CloudTransport | null => lastTransport;

function responseLike(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body || 'null'),
    text: async () => body,
  } as unknown as Response;
}

/** همان درخواست، این‌بار از طریق CLI رسمی گیت‌هاب. */
async function viaGhCli(url: string, init: RequestInit): Promise<Response | null> {
  const marker = `/repos/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const apiPath = url.slice(index + 1); // repos/<owner>/<repo>/...?ref=…
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : undefined;
  const args = ['api', apiPath, '-X', method];
  if (body) args.push('-H', 'content-type: application/json', '--input', '-');
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = execFile('gh', args, { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(Object.assign(error, { stdout })); else resolve({ stdout: String(stdout) });
      });
      if (body) {
        child.stdin?.end(body);
      }
    });
    lastTransport = 'gh-cli';
    return responseLike(200, stdout);
  } catch (error: any) {
    const stderr = String(error?.stderr ?? error?.message ?? '');
    const status = stderr.match(/HTTP (\d{3})/);
    if (status) {
      lastTransport = 'gh-cli';
      return responseLike(Number(status[1]), stderr);
    }
    return null;
  }
}

/** fetch با مسیر پشتیبان؛ اگر خطای گواهی/شبکه بود، `gh api` جایگزین می‌شود. */
async function resilientFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(url, init);
    lastTransport = 'node-fetch';
    return res;
  } catch (error: any) {
    const message = String(error?.cause?.message ?? error?.message ?? error);
    const recoverable = /certificate|unable to verify|self.signed|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
    if (!recoverable) throw error;
    const fallback = await viaGhCli(url, init);
    if (!fallback) throw error;
    return fallback;
  }
}

function resolveFetch(options: CloudFetchOptions = {}): typeof fetch {
  return (options.fetchImpl ?? resilientFetch) as typeof fetch;
}

function ghHeaders(config: CloudFeedConfig): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'konklancer-cloud-feed',
  };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  return headers;
}

function ghUrl(config: CloudFeedConfig, suffix: string, ref?: string): string {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  return `https://api.github.com/repos/${config.repo}/${suffix}${query}`;
}

async function ghGetFile(
  config: CloudFeedConfig,
  filePath: string,
  options: CloudFetchOptions = {},
): Promise<{ text: string; sha: string } | null> {
  const doFetch = resolveFetch(options);
  const res = await doFetch(ghUrl(config, `contents/${filePath}`, config.ref), { headers: ghHeaders(config) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} برای ${filePath}`);
  const payload = (await res.json()) as { content?: string; encoding?: string; sha?: string };
  const text = payload.content ? Buffer.from(payload.content, 'base64').toString('utf8') : '';
  return { text, sha: payload.sha ?? '' };
}

export async function fetchCloudStatus(
  config: CloudFeedConfig,
  options: CloudFetchOptions = {},
): Promise<Record<string, any> | null> {
  const file = await ghGetFile(config, config.statusPath, options);
  if (!file) return null;
  try {
    return JSON.parse(file.text);
  } catch {
    return null;
  }
}

/** متن فید ابری (JSONL) را می‌خواند؛ null یعنی هنوز منتشر نشده. */
export async function fetchCloudFeedText(
  config: CloudFeedConfig,
  options: CloudFetchOptions = {},
): Promise<string | null> {
  const file = await ghGetFile(config, config.feedPath, options);
  return file ? file.text : null;
}

/**
 * فید ابری را می‌گیرد و با فید محلی ادغام می‌کند (کلید = id، نسخه‌ی ابری برنده).
 * خروجی: تعداد رکوردهای ابری، کل رکوردهای نوشته‌شده و وضعیت اسکن.
 */
export async function syncCloudFeed(
  config: CloudFeedConfig,
  options: CloudFetchOptions = {},
): Promise<{ ok: boolean; cloudProjects: number; totalProjects: number; written: boolean; status: Record<string, any> | null; message: string }> {
  const text = await fetchCloudFeedText(config, options);
  const status = await fetchCloudStatus(config, options);
  if (text === null) {
    return {
      ok: false,
      cloudProjects: 0,
      totalProjects: readProjects(config.outFile).length,
      written: false,
      status,
      message: 'فید ابری هنوز منتشر نشده است؛ یک اسکن ابری درخواست کنید.',
    };
  }

  const cloudRows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ScannedProject;
      } catch {
        return null;
      }
    })
    .filter((row): row is ScannedProject => Boolean(row && row.id && row.title && row.url));

  const merged = new Map<string, ScannedProject>();
  for (const project of readProjects(config.outFile)) merged.set(project.id, project);
  for (const project of cloudRows) merged.set(project.id, project);

  const rows = [...merged.values()];
  fs.mkdirSync(path.dirname(config.outFile), { recursive: true });
  fs.writeFileSync(config.outFile, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');

  return {
    ok: true,
    cloudProjects: cloudRows.length,
    totalProjects: rows.length,
    written: true,
    status,
    message: `${cloudRows.length} رکورد ابری خوانده و در ${config.outFile} ادغام شد.`,
  };
}

/**
 * درخواست اسکن ابری: فایل scanner/scan-request.json را با پارامترهای تازه به‌روزرسانی می‌کند
 * (همین تغییر، ورک‌فلوی اسکن را روی گیت‌هاب اجرا می‌کند).
 */
export async function requestCloudScan(
  config: CloudFeedConfig,
  params: { platforms?: string; pages?: number; delay?: number; telegram?: boolean } = {},
  options: CloudFetchOptions = {},
): Promise<{ ok: boolean; message: string }> {
  if (!config.token) {
    return { ok: false, message: 'توکن گیت‌هاب موجود نیست؛ GITHUB_TOKEN یا gh auth login لازم است.' };
  }
  const doFetch = resolveFetch(options);
  const existing = await ghGetFile(config, config.requestPath, options);
  const current = existing ? (JSON.parse(existing.text || '{}') as Record<string, unknown>) : {};
  const next = {
    _comment: current._comment ?? 'برای درخواست اسکن تازه، یکی از مقدارها را تغییر دهید و کامیت کنید؛ ورک‌فلوی scanner-feed اجرا می‌شود.',
    platforms: params.platforms ?? current.platforms ?? 'parscoders,ponisha,karlancer',
    pages: params.pages ?? current.pages ?? 1,
    delay: params.delay ?? current.delay ?? 8,
    telegram: params.telegram === undefined ? (current.telegram ?? 1) : params.telegram ? 1 : 0,
    requested_at: new Date().toISOString(),
  };
  const res = await doFetch(ghUrl(config, `contents/${config.requestPath}`), {
    method: 'PUT',
    headers: { ...ghHeaders(config), 'content-type': 'application/json' },
    body: JSON.stringify({
      // نکته‌ی باگ‌یافته: پیام کامیت نباید `[skip ci]` داشته باشد، وگرنه گیت‌هاب ورک‌فلو
      // اسکن را اصلاً اجرا نمی‌کند و دکمه‌ی «اسکن ابری» بی‌اثر می‌شود.
      message: 'data(scan): درخواست اسکن زنده از کنکلنسر',
      content: Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf8').toString('base64'),
      branch: config.ref || undefined,
      sha: existing?.sha || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, message: `درخواست اسکن ابری ثبت نشد (HTTP ${res.status}): ${body.slice(0, 200)}` };
  }
  return { ok: true, message: `درخواست اسکن ابری برای ${config.repo} ثبت شد؛ رانر گیت‌هاب در حال اجراست.` };
}

/** تا وقتی وضعیت ابری «finished» تازه‌ای نیامده صبر می‌کند (با سقف زمانی). */
export async function waitForCloudScan(
  config: CloudFeedConfig,
  sinceIso: string,
  options: CloudFetchOptions = {},
): Promise<Record<string, any> | null> {
  const deadline = Date.now() + config.pollTimeoutMs;
  let latest: Record<string, any> | null = null;
  while (Date.now() < deadline) {
    try {
      latest = await fetchCloudStatus(config, options);
      if (latest && latest.phase === 'finished' && String(latest.finished_at ?? '') >= sinceIso) return latest;
    } catch {
      // خطای موقت شبکه: دوباره تلاش می‌کنیم.
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  return latest;
}
