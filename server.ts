import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import { callLLM, LLMError, parseJsonLoose, readLLMConfig, scanModels, type CustomLLMCallConfig } from './server/llm';
import { checkContent } from './server/contentFilter';
import { ALL_CATEGORIES, categoryLabel, categoryPromptList } from './shared/taxonomy';
import { fetchAndParseUrl, parseHtmlProjects } from './server/urlScraper';
import { getBidStore } from './server/store';
import { registerBidRoutes } from './server/bidRoutes';
import { ScanScheduler } from './server/scheduler';
import { createApiTokenGuard, describeApiAuth, readApiToken } from './server/apiAuth';
import { extractBearerJwt, verifySupabaseJwt } from './server/supabaseJwt';
import { createTelegramAuthHandler } from './server/telegramAuth';
import { notifyNotableJobs, readAlertConfig } from './server/notifier';
import {
  buildFeed,
  categorize,
  fetchCloudFeedText,
  fetchCloudStatus,
  readCloudFeedConfig,
  requestCloudScan,
  syncCloudFeed,
  waitForCloudScan,
  describeCategories,
  readProjects,
  readScanConfig,
  readScanTargets,
  runScanner,
  scannerBusy,
  type FeedJob,
  type ScannedProject,
  cloudTransport,
} from './server/scannerBridge';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Setup Socket.io Server attached to HTTP Server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json({ limit: '10mb' }));

// احراز هویت اختیاری API (SPEC-003 R5): با تنظیم KONKLANCER_API_TOKEN همه‌ی
// درخواست‌های /api به هدر x-api-token نیاز دارند. بدون آن، رفتار قبلی حفظ می‌شود.
const API_TOKEN = readApiToken(process.env);
const sendApiTokenHeader = (res: Response) => res.setHeader('x-api-auth', API_TOKEN ? 'required' : 'off');
const tokenGuard = createApiTokenGuard(API_TOKEN);
/**
 * راه دوم احراز هویت: توکن Supabase (Bearer JWT).
 * اگر توکن معتبر باشد، حتی وقتی `KONKLANCER_API_TOKEN` تنظیم شده هم عبور می‌کند
 * تا کاربرها بتوانند با حساب Google/GitHub/Telegram لاگین کنند و از همان نشست
 * API را صدا بزنند. هدر `x-konklancer-user` شناسه‌ی کاربر را برای لاگ/UI می‌فرستد.
 */
app.use('/api', (req: Request, res: Response, next) => {
  sendApiTokenHeader(res);
  const jwt = extractBearerJwt(req.headers.authorization);
  if (jwt) {
    const result = verifySupabaseJwt(jwt);
    if (result.ok) {
      res.setHeader('x-konklancer-user', result.claims.sub);
      (req as Request & { user?: { id: string; email?: string; provider?: string } }).user = {
        id: result.claims.sub,
        email: result.claims.email,
        provider: result.claims.app_metadata?.provider ?? result.claims.user_metadata?.user_name,
      };
      return next();
    }
    res.setHeader('x-konklancer-jwt', result.reason);
  }
  return tokenGuard(req, res, next);
});

// ورود تلگرام (سرور خودمیزبان؛ هم‌ارز Edge Function `telegram-auth`).
// GET وضعیت پیکربندی، POST بررسی امضای ویجت و صدور token_hash.
app.get('/api/auth/telegram', createTelegramAuthHandler());
app.post('/api/auth/telegram', createTelegramAuthHandler());

/** احراز هویت آماری برای UI: کدام راه‌ها فعال‌اند. */
app.get('/api/auth/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    apiToken: describeApiAuth(API_TOKEN),
    supabaseJwt: {
      enabled: true,
      signatureChecked: Boolean((process.env.SUPABASE_JWT_SECRET ?? '').trim()),
      trustUnsigned: process.env.KONKLANCER_TRUST_SUPABASE_JWT === 'true',
      header: 'authorization',
    },
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'konklancer',
    time: new Date().toISOString(),
    apiAuth: describeApiAuth(API_TOKEN),
  });
});

// Direct one-tap download route for the compiled Android Tablet APK
app.get('/download/KonkLancer-Studio.apk', (_req: Request, res: Response) => {
  const apkPath = path.resolve(__dirname, 'release', 'KonkLancer-Studio.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).send('فایل APK هنوز در پوشه release قرار نگرفته است.');
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="KonkLancer-Studio.apk"');
  return res.sendFile(apkPath);
});

// AI access: see server/llm.ts (SPEC-006). No provider SDK is used here.

// Initial jobs catalog
const DEFAULT_JOBS = [
  {
    id: 'kar-8812',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    title: 'ربات تلگرام پیشرفته فوروارد خودکار و حذف تبلیغات بین چند کانال VIP',
    clientName: 'مهرداد رضایی',
    clientRating: 4.7,
    clientReviews: 28,
    budget: 5000000,
    budgetFormatted: '۵,۰۰۰,۰۰۰ تومان',
    deadline: '۲ روز',
    postedTime: '۲۷ دقیقه پیش',
    category: 'ربات تلگرام / پایتون',
    categoryKey: 'automation',
    tags: ['Telegram Bot', 'python-telegram-bot', 'Asyncio', 'Regex'],
    description: 'رباتی نیاز دارم که به عنوان ادمین در ۲ کانال مبدا عضو باشد و به محض ارسال پست، متن آن را بررسی کند، لینک‌های آیدی و تبلیغات متنی را فیلتر کند و در کانال مقصد قرار دهد. سورس مرتب و کامنت‌گذاری شده همراه با داک اجرای لوکال نیاز دارم.',
    proposalsCount: 9,
    avgBid: 4400000,
    status: 'new'
  },
  {
    id: 'par-1044',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    title: 'اسکریپت تجمیع و پاکسازی دیتای چند فایل اکسل بزرگ با کتابخانه Pandas',
    clientName: 'شرکت فناوران آریا',
    clientRating: 5.0,
    clientReviews: 42,
    budget: 2800000,
    budgetFormatted: '۲,۸۰۰,۰۰۰ تومان',
    deadline: '۱۲ ساعت',
    postedTime: '۴۲ دقیقه پیش',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Pandas', 'Excel Automation', 'Python', 'Data Cleaning'],
    description: '۴ فایل اکسل با فرمت‌های کمی متفاوت شامل اطلاعات فاکتورهای فروش سال ۱۴۰۳ داریم. اسکریپتی می‌خواهیم که ستون‌های تکراری را حذف، فرمت تاریخ‌ها را یکسان و یک خروجی یکدست و شسته‌رفته بسازد. زمان تحویل بسیار مهم است.',
    proposalsCount: 4,
    avgBid: 2500000,
    status: 'new'
  },
  {
    id: 'pon-9430',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    title: 'اتصال وب‌هوک پرداخت زرین‌پال و پیامک کاوه‌نگار به اسکریپت فست‌اِی‌پی‌آی (FastAPI)',
    clientName: 'علیرضا ر.',
    clientRating: 4.8,
    clientReviews: 11,
    budget: 4200000,
    budgetFormatted: '۴,۲۰۰,۰۰۰ تومان',
    deadline: '۱ روز',
    postedTime: '۱ ساعت پیش',
    category: 'توسعه API / بک‌اند',
    categoryKey: 'dev',
    tags: ['FastAPI', 'Zarinpal', 'Kavenegar SMS', 'Webhook'],
    description: 'یک مینی‌سرویس پایتون با فست‌ای‌پی‌آی داریم که می‌خواهیم بعد از کال‌بک موفقیت‌آمیز زرین‌پال، پترن پیامکی کاوه‌نگار را برای خریدار شلیک کند و کد سفارش را در دیتابیس لاگ بیندازد.',
    proposalsCount: 7,
    avgBid: 3900000,
    status: 'new'
  },
  {
    id: 'kar-8825',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    title: 'ربات رصد لحظه‌ای تخفیف‌ها و کالاهای شگفت‌انگیز دیجی‌کالا و ارسال هشدار',
    clientName: 'فروشگاه تیک‌بای',
    clientRating: 4.6,
    clientReviews: 8,
    budget: 6500000,
    budgetFormatted: '۶,۵۰۰,۰۰۰ تومان',
    deadline: '۲ روز',
    postedTime: '۱ ساعت پیش',
    category: 'وب اسکرپینگ / پایتون',
    categoryKey: 'automation',
    tags: ['Python', 'Requests', 'Telegram Notifications', 'Scheduler'],
    description: 'می‌خواهیم یک اسکریپت سبک روی سرور لینوکس اجرا شود و هر ۵ دقیقه لیست تخفیف‌های بالای ۴۰ درصد در دسته‌های خاص را استخراج و به کانال شخصی ما فوروارد کند.',
    proposalsCount: 12,
    avgBid: 5800000,
    status: 'new'
  },
  {
    id: 'par-1052',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    title: 'نوشتن اسکریپت تبدیل فایل‌های صوتی به متن با پایتون و مدل Whisper محلی',
    clientName: 'دکتر صابری',
    clientRating: 5.0,
    clientReviews: 19,
    budget: 4000000,
    budgetFormatted: '۴,۰۰۰,۰۰۰ تومان',
    deadline: '۱ روز',
    postedTime: '۲ ساعت پیش',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Python', 'OpenAI Whisper', 'Audio Processing', 'CLI Tool'],
    description: 'یک برنامه ساده پایتون که فولدری از فایل‌های صوتی ضبط شده (mp3 یا ogg) را بخواند و متن فارسی پیاده‌سازی شده را با فرمت txt در کنار هر فایل ذخیره کند.',
    proposalsCount: 5,
    avgBid: 3600000,
    status: 'new'
  }
];

// Demo-only feed. SPEC-004 R1: fabricated jobs are emitted only when KONKLANCER_DEMO=1.
const DEMO_FEED = process.env.KONKLANCER_DEMO === '1';
// Bridge Feed Pool for real-time live push updates
const BRIDGE_FEED_POOL = [
  {
    title: 'اسکریپت پایتون استخراج دیتای ترب و باسلام همراه با خروجی اکسل و سورس مرتب',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    category: 'وب اسکرپینگ / پایتون',
    categoryKey: 'automation',
    tags: ['Python', 'Torob API', 'Pandas', 'Web Scraping'],
    budget: 4800000,
    deadline: '۱ روز',
    clientName: 'توسعه بازار نوین',
    description: 'اسکریپتی نیاز داریم که به صورت دوره‌ای قیمت و موجودی یک لیست ۵۰۰ تایی کالا را از موتورهای ترب و باسلام استخراج کرده و کمترین قیمت بازار را همراه با نام فروشگاه در یک فایل اکسل گزارش کند.'
  },
  {
    title: 'ربات تلگرام دانلود خودکار ویدیوهای یوتیوب و اینستاگرام با کیفیت‌های مختلف',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    category: 'ربات تلگرام / پایتون',
    categoryKey: 'automation',
    tags: ['Telegram Bot', 'yt-dlp', 'Asyncio', 'FFmpeg'],
    budget: 6200000,
    deadline: '۲ روز',
    clientName: 'سینا محمدی',
    description: 'رباتی تحت پایتون که کاربر با ارسال لینک اینستاگرام یا یوتیوب، مستقیماً فایل ویدیویی یا صوتی را با فرمت فشرده و بهینه‌شده دریافت کند. سورس کد همراه با راهنمای ران کردن روی داکر لینوکس نیاز است.'
  },
  {
    title: 'اسکریپت اتوماسیون پاکسازی و دسته‌بندی دیتابیس مشتریان با کتابخانه Polars',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Python', 'Polars', 'Data Cleaning', 'Regex'],
    budget: 3700000,
    deadline: '۱۲ ساعت',
    clientName: 'داده‌پردازان افق',
    description: 'یک فایل حجیم ۲۰۰ هزار ردیفی اطلاعات فاکتور داریم که فرمت شماره موبایل‌ها، کدهای پستی و مبالغ در آن دچار بی‌نظمی است. اسکریپت پایتون سریع برای تصحیح مقادیر نامعتبر و خروجی پارکت/اکسل لازم داریم.'
  },
  {
    title: 'اتصال خودکار ووکامرس به سیستم صدور فاکتور رسمی و ارسال پیامک اعتباری',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    category: 'توسعه API / بک‌اند',
    categoryKey: 'dev',
    tags: ['WooCommerce API', 'FastAPI', 'SMS Webhook', 'Python'],
    budget: 5400000,
    deadline: '۱ روز',
    clientName: 'آقای کاظمیان',
    description: 'می‌خواهیم پس از ثبت سفارش در ووکامرس، وب‌هوک به اسکریپت پایتون ما ارسال شود، پیش‌فاکتور PDF تولید گردد و لینک دانلود آن از طریق الگو پیامکی کاوه‌نگار برای خریدار فرستاده شود.'
  },
  {
    title: 'ربات رصد لحظه‌ای بلیت‌های کنسرت و پروازهای چارتری و رزرو خودکار',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    category: 'اتوماسیون / اسکریپت',
    categoryKey: 'automation',
    tags: ['Python', 'Playwright', 'FastAPI', 'Automation'],
    budget: 7500000,
    deadline: '۲ روز',
    clientName: 'سفرگشت آریا',
    description: 'اسکریپتی که به محض باز شدن ظرفیت پروازهای مسیر خاص، ظرف کمتر از ۱۰ ثانیه نوتیفیکیشن تلگرامی فرستاده و مشخصات مسافر را به طور خودکار تکمیل کند.'
  }
];

let feedIndex = 0;

// ---------------------------------------------------------------------------
// SPEC-004 — فید واقعی از اسکنر فقط‌خواندنی (scanner/out/projects.jsonl)
// ---------------------------------------------------------------------------
const SCAN_CONFIG = readScanConfig();

/** اگر scanner/out/projects.jsonl هنوز ساخته نشده ولی scanner/cloud-feed.jsonl در مخزن هست، همان فید واقعی را بارگذاری اولیه می‌کند. */
function ensureSeedFeedFromCloudFile(outFile: string, cwd: string): void {
  try {
    const bundledCloudFeed = path.resolve(cwd, 'scanner', 'cloud-feed.jsonl');
    if (!fs.existsSync(bundledCloudFeed)) return;
    const needSync =
      !fs.existsSync(outFile) ||
      fs.statSync(outFile).size === 0 ||
      fs.statSync(bundledCloudFeed).mtimeMs > fs.statSync(outFile).mtimeMs;
    if (!needSync) return;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.copyFileSync(bundledCloudFeed, outFile);
  } catch {
    // non-fatal
  }
}

function detectGitHubRepoSlug(cwd: string): string | null {
  try {
    const gitCfgPath = path.resolve(cwd, '.git', 'config');
    if (!fs.existsSync(gitCfgPath)) return null;
    const raw = fs.readFileSync(gitCfgPath, 'utf8');
    const m = raw.match(/github\.com[:/]([^/\s]+\/[^/\s.]+?)(?:\.git)?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function detectCurrentGitBranch(cwd: string): string | null {
  try {
    const headPath = path.resolve(cwd, '.git', 'HEAD');
    if (!fs.existsSync(headPath)) return null;
    const raw = fs.readFileSync(headPath, 'utf8').trim();
    const m = raw.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

ensureSeedFeedFromCloudFile(SCAN_CONFIG.outFile, SCAN_CONFIG.cwd);

const effectiveCloudEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...(process.env.KONKLANCER_CLOUD_FEED_REPO
    ? {}
    : (() => {
        const slug = detectGitHubRepoSlug(process.cwd());
        return slug ? { KONKLANCER_CLOUD_FEED_REPO: slug } : {};
      })()),
  ...(process.env.KONKLANCER_CLOUD_FEED_REF
    ? {}
    : (() => {
        const branch = detectCurrentGitBranch(process.cwd());
        return branch ? { KONKLANCER_CLOUD_FEED_REF: branch } : {};
      })()),
};

/** فید ابری (اسکن روی رانرهای گیت‌هاب) — از env یا از remote مخزن گیت‌هاب تشخیص داده می‌شود. */
const CLOUD_CONFIG = readCloudFeedConfig(effectiveCloudEnv, process.cwd(), SCAN_CONFIG.outFile);
/** شناسه پروژه‌هایی که یک‌بار به UI پوش شده‌اند؛ برای جلوگیری از پوش تکراری. */
const emittedJobIds = new Set<string>();
// پروژه‌هایی که اعلانشان یک بار فرستاده شده تا اسپم نشود (SPEC-004 R7)
const alertSent = new Set<string>();

function emitBridgeLog(message: string, type: 'scan' | 'bid' | 'code' | 'github' | 'payment' = 'scan') {
  io.emit('bridge:log', {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type,
    message,
  });
}

/** فید فعلی را از خروجی JSONL اسکنر می‌سازد (بدون هیچ تماس شبکه‌ای). */
function loadFeedJobs() {
  const projects = readProjects(SCAN_CONFIG.outFile);
  const feed = buildFeed(projects, {
    include: SCAN_CONFIG.include,
    exclude: SCAN_CONFIG.exclude,
    // خالی بودن یعنی هیچ دسته‌ای محدود نشود: ترجمه، گرافیک، ویدیو، صدا و ... همه در فید می‌آیند.
    categories: SCAN_CONFIG.categories,
    minScore: SCAN_CONFIG.minScore,
  });
  return { projects, jobs: feed.jobs as FeedJob[], scannedAt: feed.scannedAt };
}

/**
 * ذخیره و ادغام پروژه‌های استخراج‌شده در فایل فید ماندگار
 */
function appendProjectsToFeed(outFile: string, projects: ScannedProject[]): number {
  if (!projects.length) return 0;
  const existing = readProjects(outFile);
  const map = new Map<string, ScannedProject>();
  for (const p of existing) map.set(p.id, p);
  let added = 0;
  for (const p of projects) {
    if (!map.has(p.id)) {
      map.set(p.id, p);
      added++;
    }
  }
  const rows = [...map.values()];
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  return added;
}

/**
 * استخراج پیکربندی اختصاصی مدل هوش مصنوعی از هدر یا بدنه درخواست
 */
function extractCustomLLM(req: Request): CustomLLMCallConfig | null {
  let custom: any = req.body?.customLLM ?? null;
  if (!custom && req.headers['x-custom-llm-b64']) {
    try {
      const decoded = Buffer.from(String(req.headers['x-custom-llm-b64']), 'base64').toString('utf8');
      custom = JSON.parse(decoded);
    } catch {
      custom = null;
    }
  }
  if (!custom && req.headers['x-custom-llm']) {
    try {
      custom = JSON.parse(String(req.headers['x-custom-llm']));
    } catch {
      custom = null;
    }
  }
  if (custom && typeof custom === 'object' && custom.apiKey) {
    return {
      endpoint: String(custom.endpoint || ''),
      apiKey: String(custom.apiKey || '').trim(),
      model: custom.selectedModel || custom.model,
      provider: custom.provider,
    };
  }
  return null;
}

function enabledTargets() {
  return readScanTargets(SCAN_CONFIG.cwd).filter((target) => target.enabled);
}

interface ScanOutcome {
  ok: boolean;
  added: number;
  total: number;
  scannedAt: string | null;
  message: string;
  output?: string;
}

/** یک اسکن واقعی: CLI اسکنر را اجرا می‌کند، فید را می‌خواند و پروژه‌های تازه را پوش می‌کند. */
/**
 * ارسال اعلان تلگرام برای پروژه‌های بالای آستانه (SPEC-004 R7).
 * اگر پیکربندی نباشد هیچ درخواستی به بیرون نمی‌رود؛ خطا فقط لاگ می‌شود.
 */
async function dispatchAlerts(jobs: { id: string; title: string; platform?: string; budgetFormatted?: string; score?: number; url?: string }[]) {
  const config = readAlertConfig(process.env);
  if (!config.enabled || jobs.length === 0) return;
  try {
    const result = await notifyNotableJobs(jobs, config, fetch as any, alertSent);
    if (result.sent > 0) {
      emitBridgeLog(`اعلان تلگرام برای ${result.sent} پروژه‌ی بالای آستانه ${config.threshold} ارسال شد.`);
    }
    if (result.error) {
      console.warn('[alerts] telegram notification failed:', result.error);
    }
  } catch (err: any) {
    console.warn('[alerts] unexpected failure:', err?.message ?? err);
  }
}

async function performScan(): Promise<ScanOutcome> {
  if (scannerBusy()) {
    return { ok: false, added: 0, total: 0, scannedAt: null, message: 'یک اسکن دیگر در حال اجراست؛ لطفاً چند لحظه بعد تلاش کنید.' };
  }
  const enabled = enabledTargets();
  if (SCAN_CONFIG.platforms.length === 0 && !SCAN_CONFIG.telegram) {
    return {
      ok: false,
      added: 0,
      total: 0,
      scannedAt: null,
      message: 'منبعی برای اسکن تنظیم نشده است: KONKLANCER_SCAN_PLATFORMS یا KONKLANCER_SCAN_TELEGRAM=1 را در .env بگذارید.',
    };
  }
  if (enabled.length === 0) {
    return {
      ok: false,
      added: 0,
      total: 0,
      scannedAt: null,
      message: 'هیچ پلتفرم/کانالی فعال نیست. برای تلگرام: scan_enabled کانال را true کنید؛ برای پلتفرم: ابتدا انتخابگرهای CSS را کالیبره کنید (docs/PERSONAL-SETUP.md).',
    };
  }

  emitBridgeLog(`اجرای اسکن فقط‌خواندنی روی ${enabled.length} منبع فعال...`);
  const run = await runScanner(SCAN_CONFIG);
  if (!run.ok) {
    const tail = run.output.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
    const message = run.timedOut
      ? 'اسکن به مهلت زمانی نرسید و متوقف شد.'
      : tail || 'اسکن ناموفق بود.';
    emitBridgeLog(`اسکن متوقف شد: ${message}`);
    return { ok: false, added: 0, total: 0, scannedAt: null, message, output: run.output };
  }

  const { jobs, scannedAt, projects } = loadFeedJobs();
  const fresh = jobs.filter((job) => !emittedJobIds.has(job.id));
  for (const job of fresh) {
    emittedJobIds.add(job.id);
    io.emit('job:new', job);
  }
  const message = `اسکن تمام شد: ${fresh.length} پروژه جدید از ${projects.length} پروژه در فید.`;
  emitBridgeLog(message);
  void dispatchAlerts(fresh.map((job) => ({
    id: job.id,
    title: job.title,
    platform: job.platform,
    budgetFormatted: job.budgetFormatted,
    score: job.score,
    url: job.url,
  })));
  return { ok: true, added: fresh.length, total: projects.length, scannedAt, message, output: run.output };
}

// ── زمان‌بند اسکن دوره‌ای (از UI کنترل می‌شود؛ پیش‌فرض از .env) ──────────
const SCHEDULER_KEY = 'scan_scheduler';
function readPersistedScheduler(): { enabled?: boolean; intervalMinutes?: number } {
  try {
    const raw = getBidStore().getSetting(SCHEDULER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : undefined,
      intervalMinutes: Number.isFinite(Number(parsed?.intervalMinutes)) ? Number(parsed.intervalMinutes) : undefined,
    };
  } catch {
    return {};
  }
}
const persistedScheduler = readPersistedScheduler();
const scanScheduler = new ScanScheduler({
  scan: () => performScan(),
  log: (message) => emitBridgeLog(message),
  persist: (state) => getBidStore().setSetting(SCHEDULER_KEY, JSON.stringify(state)),
  initial: {
    enabled: persistedScheduler.enabled ?? SCAN_CONFIG.intervalMinutes > 0,
    intervalMinutes: persistedScheduler.intervalMinutes ?? (SCAN_CONFIG.intervalMinutes > 0 ? SCAN_CONFIG.intervalMinutes : 30),
  },
});



/**
 * دسته‌بندی یک پروژه به یکی از دسته‌های مشترک (shared/taxonomy.json).
 * قبلاً فقط Frontend/Backend/DevOps/Design بود و کارهای ترجمه/گرافیک/صدا دسته‌ی درست نمی‌گرفتند.
 */
async function categorizeJobServer(
  title: string,
  description: string,
  customLLM?: CustomLLMCallConfig | null,
): Promise<string> {
  const fallback = categorize(title, description).key;
  const serverCfg = readLLMConfig();
  if (!serverCfg && !customLLM) return fallback;
  try {
    const prompt = `دسته‌ی این پروژه‌ی فریلنسری را دقیقاً یکی از دسته‌های زیر انتخاب کن:
${categoryPromptList()}

عنوان: ${title}
توضیحات: ${description}

فقط JSON برگردان:
{"category": "<key>"}`;
    const llm = await callLLM(
      { taskType: 'extraction', prompt, json: true, maxTokens: 64, temperature: 0 },
      serverCfg,
      fetch,
      customLLM,
    );
    const parsed = parseJsonLoose(llm.text) ?? {};
    const valid = ALL_CATEGORIES.map((category) => category.key);
    return valid.includes(parsed.category) ? (parsed.category as string) : fallback;
  } catch (err: any) {
    console.warn('AI categorization unavailable, using keyword rules:', err?.message ?? err);
    return fallback;
  }
}

// Uniform error mapping for AI endpoints (SPEC-006 R5, R10).
function sendLLMError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof LLMError) {
    return res.status(err.status).json({ success: false, aiAvailable: false, code: err.code, error: err.message });
  }
  return res.status(500).json({ success: false, aiAvailable: false, code: 'AI_UPSTREAM', error: fallbackMessage });
}

async function broadcastNewJob(customPayload?: any) {
  const template = customPayload || BRIDGE_FEED_POOL[feedIndex % BRIDGE_FEED_POOL.length];
  feedIndex++;

  const newJobId = `live-${template.platformKey || 'feed'}-${Date.now().toString().slice(-4)}`;
  const budget = template.budget || 4000000;

  // Determine initial priority based on budget and complexity
  const priority = budget >= 6000000 ? 'High' : budget >= 4000000 ? 'Medium' : 'Low';
  
  // دسته‌بندی با تاکسونومی مشترک (بدون فراخوانی شبکه‌ای؛ برچسب فارسی از همان منبع)
  const categoryKey = template.categoryKey || categorize(template.title, template.description).key;
  const categorizedTag = categoryLabel(categoryKey);

  const newJob = {
    id: newJobId,
    platform: template.platform,
    platformKey: template.platformKey || 'ponisha',
    title: template.title,
    clientName: template.clientName || 'کارفرمای تاییدشده',
    clientRating: 4.9,
    clientReviews: 16,
    budget,
    budgetFormatted: `${budget.toLocaleString('fa-IR')} تومان`,
    deadline: template.deadline || '۱ روز',
    postedTime: 'هم‌اکنون (لحظه‌ای)',
    category: categoryLabel(categoryKey),
    categoryKey: template.categoryKey || 'automation',
    tags: template.tags ? [...template.tags, String(categorizedTag)] : ['Python', String(categorizedTag)],
    description: template.description,
    proposalsCount: 1,
    avgBid: Math.round(budget * 0.9),
    status: 'new',
    priority,
    categorizedTag
  };

  io.emit('job:new', newJob);
  io.emit('bridge:log', {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type: 'scan',
    message: `[Socket.io Push] پروژه جدید با تگ ${newJob.categorizedTag} و اولویت ${newJob.priority} از ${newJob.platform} دریافت شد: "${newJob.title}"`,
    jobId: newJob.id,
  });

  return newJob;
}

// Socket.io Bridge Connection Management
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Send initial connection handshake
  socket.emit('bridge:status', {
    connected: true,
    activePlatforms: enabledTargets().map((target) => ({ name: target.name, status: 'active', latency: '—' })),
    source: loadFeedJobs().projects.length > 0 ? 'scanner' : DEMO_FEED ? 'demo' : 'empty',
    clientsCount: io.engine.clientsCount,
  });

  socket.emit('bridge:log', {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type: 'scan',
    message: 'اتصال فعال وب‌سوکت Socket.io به بریج دریافت آنی پروژه‌ها برقرار شد.',
  });

  // Client requests a scan of the real, read-only scanner (SPEC-004).
  socket.on('scan:trigger', async () => {
    emitBridgeLog('درخواست اسکن زنده از رابط کاربری دریافت شد...');
    const outcome = await performScan();
    if (!outcome.ok) {
      socket.emit('bridge:log', {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        type: 'scan',
        message: outcome.message,
      });
      return;
    }
    socket.emit('scan:done', { added: outcome.added, total: outcome.total, scannedAt: outcome.scannedAt });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Periodic background poller pushing new opportunities to connected clients
if (DEMO_FEED) {
  setInterval(() => {
    if (io.engine.clientsCount > 0) {
      broadcastNewJob();
    }
  }, 45000);
}

// Endpoint: run one real, read-only scan of the configured sources (SPEC-004).
app.post('/api/bridge/trigger-scan', async (_req: Request, res: Response) => {
  const outcome = await performScan();
  res.status(outcome.ok ? 200 : 502).json({ ...outcome, success: outcome.ok, job: null });
});

// Endpoint: وضعیت فید ابری (اسکن روی رانرهای گیت‌هاب)
app.get('/api/bridge/cloud', async (_req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.json({
      success: true,
      enabled: false,
      message: 'فید ابری تنظیم نشده است؛ KONKLANCER_CLOUD_FEED_REPO را در .env بگذارید.',
    });
  }
  try {
    const status = await fetchCloudStatus(CLOUD_CONFIG);
    const feedText = await fetchCloudFeedText(CLOUD_CONFIG);
    return res.json({
      success: true,
      enabled: true,
      repo: CLOUD_CONFIG.repo,
      ref: CLOUD_CONFIG.ref,
      hasToken: Boolean(CLOUD_CONFIG.token),
      cloudProjects: feedText ? feedText.split('\n').filter(Boolean).length : 0,
      // روشی که واقعاً استفاده شد: fetch نود یا CLI گیت‌هاب (محیط‌های با گواهی سفارشی)
      transport: cloudTransport(),
      status,
    });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'خطای خواندن وضعیت ابری' });
  }
});

// Endpoint: همگام‌سازی فید محلی با آخرین فید ابری (بدون اجرای اسکن)
app.post('/api/bridge/sync-feed', async (_req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.status(400).json({ success: false, error: 'فید ابری تنظیم نشده است.' });
  }
  try {
    const result = await syncCloudFeed(CLOUD_CONFIG);
    if (result.written) {
      emitBridgeLog(`فید ابری همگام شد: ${result.cloudProjects} پروژه‌ی ابری · کل ${result.totalProjects}`, 'scan');
    }
    return res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'همگام‌سازی فید ابری ناموفق بود' });
  }
});

// Endpoint: درخواست اسکن ابری (اجرای اسکنر واقعی روی رانر گیت‌هاب) و سپس همگام‌سازی فید
app.post('/api/bridge/cloud-scan', async (req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.status(400).json({ success: false, error: 'فید ابری تنظیم نشده است.' });
  }
  try {
    const since = new Date().toISOString();
    const request = await requestCloudScan(CLOUD_CONFIG, {
      platforms: typeof req.body?.platforms === 'string' ? req.body.platforms : undefined,
      pages: Number(req.body?.pages) || undefined,
      telegram: req.body?.telegram === undefined ? undefined : Boolean(req.body.telegram),
    });
    if (!request.ok) return res.status(400).json({ success: false, ...request });

    emitBridgeLog(request.message, 'scan');
    res.status(202).json({ success: true, queued: true, message: request.message });

    void (async () => {
      try {
        const status = await waitForCloudScan(CLOUD_CONFIG, since);
        const synced = await syncCloudFeed(CLOUD_CONFIG);
        emitBridgeLog(
          synced.ok
            ? `اسکن ابری تمام شد: ${synced.cloudProjects} پروژه‌ی ابری (${status?.projects_this_run ?? 0} در این اجرا)`
            : `اسکن ابری تمام شد ولی فید تازه‌ای منتشر نشد: ${synced.message}`,
          'scan',
        );
        io.emit('scan:done', {
          added: status?.projects_this_run ?? synced.cloudProjects,
          total: status?.projects_in_feed ?? synced.totalProjects,
          scannedAt: status?.finished_at ?? new Date().toISOString(),
          source: 'cloud',
        });
      } catch (error: any) {
        emitBridgeLog(`پیگیری اسکن ابری ناموفق بود: ${error?.message ?? error}`, 'scan');
      }
    })();
    return;
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'درخواست اسکن ابری ناموفق بود' });
  }
});

// Endpoint: دسته‌بندی پروژه با دسته‌های مشترک (shared/taxonomy.json)
app.post('/api/categorize-job', async (req: Request, res: Response) => {
  try {
    const { title = '', description = '' } = req.body;
    const customLLM = extractCustomLLM(req);
    const tag = await categorizeJobServer(title, description, customLLM);
    res.json({ success: true, tag });
  } catch (error: any) {
    console.error('Error in categorize-job:', error);
    return sendLLMError(res, error, 'Failed to categorize job');
  }
});

// Endpoint: Get the live job feed (SPEC-004).
// منبع واقعی، خروجی JSONL اسکنر است. داده‌ی ساختگی فقط با KONKLANCER_DEMO=1 سرو می‌شود.
app.get('/api/jobs', (_req: Request, res: Response) => {
  const { projects, jobs, scannedAt } = loadFeedJobs();
  if (projects.length > 0) {
    jobs.forEach((job) => emittedJobIds.add(job.id));
    return res.json({
      success: true,
      source: 'scanner',
      scannedAt,
      scannedProjects: projects.length,
      minScore: SCAN_CONFIG.minScore,
      categories: SCAN_CONFIG.categories,
      // همه‌ی دسته‌های تاکسونومی (سطح داده، نه فیلتر) تا UI بتواند هر نوع کاری را نشان دهد.
      availableCategories: describeCategories(),
      // وقتی فهرست دسته خالی است، هیچ دسته‌ای حذف نمی‌شود (شامل کارهای غیرکدنویسی).
      categoryFilter: SCAN_CONFIG.categories.length > 0 ? 'explicit' : 'all',
      jobs,
    });
  }
  if (DEMO_FEED) {
    return res.json({ success: true, source: 'demo', scannedAt: null, jobs: DEFAULT_JOBS });
  }
  return res.json({
    success: true,
    source: 'empty',
    scannedAt: null,
    scannedProjects: 0,
    jobs: [],
    message: 'هنوز هیچ پروژه‌ای اسکن نشده است؛ راه‌اندازی: docs/PERSONAL-SETUP.md',
  });
});

// Endpoint: Get real-time bridge status (وضعیت واقعی: کدام منبع فعال است و فید از کجاست)
app.get('/api/bridge/status', (_req: Request, res: Response) => {
  const { projects, jobs, scannedAt } = loadFeedJobs();
  const targets = readScanTargets(SCAN_CONFIG.cwd);
  const active = targets.filter((target) => target.enabled);
  res.json({
    success: true,
    status: {
      connected: true,
      source: projects.length > 0 ? 'scanner' : DEMO_FEED ? 'demo' : 'empty',
      scannedProjects: projects.length,
      feedJobs: jobs.length,
      scannedAt,
      scannerBusy: scannerBusy(),
      scanPlatforms: SCAN_CONFIG.platforms,
      scanTelegram: SCAN_CONFIG.telegram,
      scanCategories: SCAN_CONFIG.categories,
      autoCalibrate: SCAN_CONFIG.autoCalibrate,
      cloudFeed: CLOUD_CONFIG
        ? { enabled: true, repo: CLOUD_CONFIG.repo, ref: CLOUD_CONFIG.ref, hasToken: Boolean(CLOUD_CONFIG.token) }
        : { enabled: false },
      categories: describeCategories(),
      includeKeywords: SCAN_CONFIG.include,
      // سازگاری با پنل: فقط منابع فعال گزارش می‌شوند (بدون latency ساختگی)
      activePlatforms: active.map((target) => ({ name: target.name, status: 'active', latency: '—' })),
      inactivePlatforms: targets
        .filter((target) => !target.enabled)
        .map((target) => ({ name: target.name, reason: target.reason, kind: target.kind })),
      clientsCount: io.engine.clientsCount,
      scheduler: scanScheduler.getState(),
    },
  });
});

// Endpoint: AI Analysis using Gemini 3.8 Flash / Custom LLM
app.post('/api/analyze-job', async (req: Request, res: Response) => {
  try {
    const { title, description, budget, platform } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Job title and description are required' });
    }

    const customLLM = extractCustomLLM(req);
    const serverCfg = readLLMConfig();
    if (!serverCfg && !customLLM) {
      return sendLLMError(
        res,
        new LLMError('AI_NOT_CONFIGURED', 'کلید هوش مصنوعی اختصاصی تنظیم نشده است؛ لطفاً در بخش تنظیمات کلید خود را وارد کنید.', 503),
        'AI not configured',
      );
    }

    const prompt = `شما معمار ارشد سیستم‌های اتوماسیون هوش مصنوعی فریلنسری هستید.
پروژه فریلنسری زیر از پلتفرم "${platform || 'فریلنسری'}" را تحلیل فنی و اقتصادی کنید:
عنوان: ${title}
توضیحات: ${description}
بودجه کارفرما: ${budget || 'نامشخص'}

وظیفه شما ارزیابی دقیق است. خروجی را دقیقاً در قالب فرمت JSON معتبر زیر بازگردانید:
{
  "automatabilityScore": 95,
  "recommendedBid": 2800000,
  "suggestedDuration": "۴ ساعت",
  "technicalStack": ["Python", "Playwright"],
  "feasibilityReason": "توضیح تحلیلی ۲ خطی به زبان فارسی درباره چرایی امکان اجرای ۱۰۰٪ خودکار توسط ایجنت هوش مصنوعی",
  "riskLevel": "low",
  "winProbability": "۸۵٪",
  "suggestedKicker": "نکته کلیدی که باید در خط اول پیشنهاد به آن اشاره شود تا کارفرما متوجه شود پروژه دقیق خوانده شده است"
}`;

    const llm = await callLLM(
      { taskType: 'general', prompt, json: true, cacheKey: `analyze:${platform}|${title}|${description}|${budget}` },
      serverCfg,
      fetch,
      customLLM,
    );
    const parsed = parseJsonLoose(llm.text) ?? {};
    const recommendedBid = parsed.recommendedBid || (budget ? Math.round(budget * 0.85) : 3000000);

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      automatabilityScore: parsed.automatabilityScore || 92,
      recommendedBid,
      recommendedBidFormatted: recommendedBid.toLocaleString('fa-IR') + ' تومان',
      suggestedDuration: parsed.suggestedDuration || '۴ ساعت',
      technicalStack: parsed.technicalStack || ['Python', 'Asyncio'],
      feasibilityReason: parsed.feasibilityReason || 'پروژه دیجیتال و الگوریتمی بوده و قابلیت پیاده‌سازی سریع با ایجنت را دارد.',
      riskLevel: parsed.riskLevel || 'low',
      winProbability: parsed.winProbability || '۸۵٪',
      suggestedKicker: parsed.suggestedKicker || 'اشاره به استراتژی حل سریع مسئله',
    });
  } catch (error: any) {
    console.error('Error in analyze-job:', error);
    return sendLLMError(res, error, 'Failed to analyze job');
  }
});

// Endpoint: Generate authentic Persian proposal tailored to employer
app.post('/api/generate-proposal', async (req: Request, res: Response) => {
  try {
    const { title, description, budget, tone = 'friendly_expert' } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Job title and description are required' });
    }

    const targetPrice = budget ? Math.round(budget * 0.82) : 2500000;
    const customLLM = extractCustomLLM(req);
    const serverCfg = readLLMConfig();
    if (!serverCfg && !customLLM) {
      return sendLLMError(
        res,
        new LLMError('AI_NOT_CONFIGURED', 'کلید هوش مصنوعی اختصاصی تنظیم نشده است؛ لطفاً در بخش تنظیمات کلید خود را وارد کنید.', 503),
        'AI not configured',
      );
    }

    const toneInstructionsMap: Record<string, string> = {
      friendly_expert: 'لحن: یک مهندس نرم‌افزار حرفه‌ای، صمیمی، خاکی و قابل اعتماد.',
      direct_urgent: 'لحن: صریح، بسیار متمرکز بر زمان تحویل فوری زیر چند ساعت.',
      technical_detailed: 'لحن: فنی و آگاه به جزییات کتابخانه‌ها و معماری اجرای بدون باگ.',
    };
    const toneInstructions = toneInstructionsMap[String(tone)] || 'لحن: حرفه‌ای و صمیمی';

    const prompt = `شما یک برنامه‌نویس ارشد ایرانی در بازار فریلنسری هستید.
می‌خواهید برای پروژه زیر یک پروپوزال (پیشنهاد) بسیار متقاعدکننده بنویسید که کارفرما بلافاصله پیام دهد.
عنوان پروژه: ${title}
توضیحات پروژه: ${description}
بودجه کارفرما: ${budget || 'متغیر'}
${toneInstructions}

قوانین سخت‌گیرانه:
۱. اصلاً نباید شبیه متون تکراری یا هوش مصنوعی باشد. واژه‌های کلیشه‌ای مثل "با کمال میل"، "تضمین ۱۰۰٪"، "در اسرع وقت" را هرگز به کار نبرید.
۲. طول متن: حداکثر ۳ الی ۴ جمله.
۳. در جمله اول دقیقاً به یکی از چالش‌ها یا بخش‌های خاص خواسته کارفرما اشاره کنید تا ثابت شود متن را با دقت خوانده‌اید.
۴. ذکر کنید که کدها تست‌شده با راهنمای اجرای فارسی روی گیت‌هاب تحویل خواهد شد.

خروجی را در قالب JSON زیر تحویل دهید:
{
  "proposal": "متن فارسی پروپوزال",
  "proposedPrice": ${targetPrice},
  "deliveryTime": "۴ ساعت"
}`;

    const llm = await callLLM({ taskType: 'general', prompt, json: true }, serverCfg, fetch, customLLM);
    const parsed = parseJsonLoose(llm.text) ?? {};

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      proposal: parsed.proposal,
      proposedPrice: parsed.proposedPrice || targetPrice,
      proposedPriceFormatted: (parsed.proposedPrice || targetPrice).toLocaleString('fa-IR') + ' تومان',
      deliveryTime: parsed.deliveryTime || '۴ ساعت',
    });
  } catch (error: any) {
    console.error('Error in generate-proposal:', error);
    return sendLLMError(res, error, 'Failed to generate proposal');
  }
});

// Endpoint: Autonomous Code Solution Generator
app.post('/api/generate-solution', async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    const customLLM = extractCustomLLM(req);
    const serverCfg = readLLMConfig();
    if (!serverCfg && !customLLM) {
      return sendLLMError(
        res,
        new LLMError('AI_NOT_CONFIGURED', 'کلید هوش مصنوعی اختصاصی تنظیم نشده است؛ لطفاً در بخش تنظیمات کلید خود را وارد کنید.', 503),
        'AI not configured',
      );
    }

    const prompt = `شما یک مهندس نرم‌افزار ارشد و ایجنت کدنویسی خودکار هستید.
برای این پروژه فریلنسری:
عنوان: ${title}
توضیحات: ${description}

وظیفه شما تولید یک پروژه کامل، بدون نقص، کامپایل‌پذیر و آماده تحویل است.
کدها باید دارای لاگین تمیز، ترای/اکسپت کامل و داکیومنت فارسی برای کارفرما باشد.

خروجی را حتماً در قالب یک JSON معتبر برگردانید که کلیدهای آن نام فایل‌ها و مقادیر آن سورس کامل فایل باشد:
{
  "files": {
    "main.py": "سورس کامل کد اصلی پایتون با همه توابع واقعی",
    "requirements.txt": "لیست کتابخانه‌های مورد نیاز",
    "README.md": "راهنمای کامل و گام‌به‌گام فارسی برای کارفرما جهت نحوه نصب و اجرای پروژه",
    "test_suite.py": "تست‌های اعتبارسنجی با unittest"
  }
}`;

    const llm = await callLLM(
      { taskType: 'coding', prompt, json: true, maxTokens: 8000 },
      serverCfg,
      fetch,
      customLLM,
    );
    const parsed = parseJsonLoose(llm.text) ?? {};

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      files: parsed.files || {},
    });
  } catch (error: any) {
    console.error('Error in generate-solution:', error);
    return sendLLMError(res, error, 'Failed to generate solution');
  }
});

// Endpoint: اسکن و استخراج مدل‌های اندپوینت هوش مصنوعی با مشخص‌کردن مدل‌های رایگان
app.post('/api/llm/scan', async (req: Request, res: Response) => {
  try {
    const { endpoint, apiKey, provider } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ success: false, error: 'لطفاً کلید API را وارد کنید.' });
    }
    const result = await scanModels({ endpoint, apiKey, provider });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'خطا در اسکن مدل‌ها' });
  }
});

// Endpoint: تست اتصال زنده به مدل هوش مصنوعی انتخابی
app.post('/api/llm/test', async (req: Request, res: Response) => {
  try {
    const { endpoint, apiKey, model, provider } = req.body || {};
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'کلید API الزامی است.' });
    }
    const startTime = Date.now();
    const result = await callLLM(
      {
        taskType: 'general',
        prompt: 'فقط بنویس: اتصال برقرار شد',
        maxTokens: 256,
        temperature: 0.1,
      },
      null,
      fetch,
      { endpoint, apiKey, model, provider },
    );
    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      latencyMs,
      model: result.model,
      provider: result.provider,
      reply: result.text.trim(),
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: err.message || 'خطا در تست اتصال به مدل',
    });
  }
});

// ── رله عمومی LLM (fallback روی خودِ سرور؛ مشابه Supabase Edge Relay)
// اگر کلاینت نخواهد مستقیماً با گوگل صحبت کند (یا IP ایران بلاک شده)، درخواست را
// از همین سرور (Vercel/US) فوروارد می‌کنیم. فقط هاست‌های allow-list قبول می‌شوند تا SSRF بسته بماند.
const LLM_RELAY_ALLOWED_HOSTS = new Set([
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.openai.com',
  'api.openrouter.ai',
  'openrouter.ai',
  'api.deepseek.com',
  'api.anthropic.com',
  'api.cohere.ai',
  'api.mistral.ai',
  'generativelanguage.googleapis.com',
]);
const LLM_RELAY_ALLOWED_SUFFIXES = ['.googleapis.com', '.openai.azure.com'];
function isLLMRelayAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (LLM_RELAY_ALLOWED_HOSTS.has(h)) return true;
  return LLM_RELAY_ALLOWED_SUFFIXES.some((s) => h.endsWith(s));
}
app.post('/api/llm/relay', async (req: Request, res: Response) => {
  try {
    const targetUrl: string = (req.body?.target_url || req.body?.targetUrl || '').trim?.() || '';
    if (!targetUrl) return res.status(400).json({ ok: false, error: 'target_url required' });
    let parsed: URL;
    try { parsed = new URL(targetUrl); } catch { return res.status(400).json({ ok: false, error: 'Invalid target_url' }); }
    if (!isLLMRelayAllowed(parsed.hostname)) {
      return res.status(403).json({ ok: false, error: `Host not allow-listed: ${parsed.hostname}` });
    }
    const reqMethod: string = (req.body?.req_method || req.body?.method || 'POST').toUpperCase();
    const reqHeadersIn: Record<string, string> = req.body?.req_headers || req.body?.headers || {};
    const reqBody: string | null = req.body?.req_body ?? req.body?.body ?? null;
    const forwardHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(reqHeadersIn)) {
      const lk = k.toLowerCase();
      if (lk === 'host' || lk === 'content-length' || lk === 'connection') continue;
      forwardHeaders[k] = String(v);
    }
    if (!forwardHeaders['Content-Type'] && !forwardHeaders['content-type']) forwardHeaders['Content-Type'] = 'application/json';

    const upstream = await fetch(targetUrl, {
      method: reqMethod,
      headers: forwardHeaders,
      body: reqBody != null ? reqBody : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    const bodyText = await upstream.text();
    return res.json({ ok: upstream.ok, status: upstream.status, bodyText, headers: Object.fromEntries(upstream.headers.entries()) });
  } catch (e: any) {
    return res.status(502).json({ ok: false, status: 0, bodyText: '', error: e?.message || String(e) });
  }
});

// Endpoint: واکشی مستقیم URL و استخراج خودکار پروژه‌ها
app.post('/api/scraper/fetch-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'نشانی اینترنتی (URL) الزامی است.' });
    }
    emitBridgeLog(`درخواست واکشی زنده پروژه‌ها از نشانی: ${url.trim()}`);
    const result = await fetchAndParseUrl(url.trim());
    if (!result.success) {
      return res.status(result.cloudflareBlocked ? 403 : 422).json(result);
    }

    const scannedRows: ScannedProject[] = result.projects.map((p) => ({
      id: p.id,
      source: p.platformKey,
      title: p.title,
      url: p.url,
      summary: p.description,
      budget_text: p.budgetFormatted,
      bids_text: `${p.proposalsCount} پیشنهاد`,
      category: p.categoryKey,
      scraped_at: new Date().toISOString(),
    }));

    appendProjectsToFeed(SCAN_CONFIG.outFile, scannedRows);

    for (const job of result.projects) {
      emittedJobIds.add(job.id);
      io.emit('job:new', job);
    }

    emitBridgeLog(`استخراج موفق: ${result.projects.length} پروژه از ${result.url} استخراج و به فید زنده اضافه شد.`);
    io.emit('scan:done', {
      added: result.projects.length,
      total: readProjects(SCAN_CONFIG.outFile).length,
      scannedAt: new Date().toISOString(),
      source: 'url_scraper',
    });

    return res.json({
      success: true,
      count: result.projects.length,
      url: result.url,
      projects: result.projects,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'خطای غیرمنتظره در واکشی URL' });
  }
});

// Endpoint: تجزیه مستقیم سورس HTML ارسالی کاربر (پونیشا و سایر پلتفرم‌ها)
app.post('/api/scraper/parse-html', async (req: Request, res: Response) => {
  try {
    const { html, url = 'https://ponisha.ir/search/projects', platform } = req.body || {};
    if (!html || typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ success: false, error: 'محتوای HTML الزامی است.' });
    }

    const projects = parseHtmlProjects(html, url, platform);
    if (projects.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'پروژه‌ای در متن یا سورس ارسالی یافت نشد. لطفاً مطمئن شوید سورس کامل صفحه را کپی کرده‌اید.',
      });
    }

    const scannedRows: ScannedProject[] = projects.map((p) => ({
      id: p.id,
      source: p.platformKey,
      title: p.title,
      url: p.url,
      summary: p.description,
      budget_text: p.budgetFormatted,
      bids_text: `${p.proposalsCount} پیشنهاد`,
      category: p.categoryKey,
      scraped_at: new Date().toISOString(),
    }));

    appendProjectsToFeed(SCAN_CONFIG.outFile, scannedRows);

    for (const job of projects) {
      emittedJobIds.add(job.id);
      io.emit('job:new', job);
    }

    emitBridgeLog(`تجزیه مستقیم سورس HTML: ${projects.length} پروژه شناسایی و در رادار قرار گرفت.`);
    io.emit('scan:done', {
      added: projects.length,
      total: readProjects(SCAN_CONFIG.outFile).length,
      scannedAt: new Date().toISOString(),
      source: 'html_parser',
    });

    return res.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'خطا در تجزیه سورس HTML' });
  }
});

// ---------------------------------------------------------------------------
// پیشنهادها و نتیجه‌ها (SPEC-005) — ثبت دستی، بدون هیچ ارسال خودکار.
// منطق در server/bidRoutes.ts است تا با HTTP واقعی تست شود.
// ---------------------------------------------------------------------------
registerBidRoutes(app, {
  store: getBidStore(),
  log: (message, type) => emitBridgeLog(message, type),
  emit: (event, payload) => io.emit(event, payload),
  alertSentCount: () => alertSent.size,
});

// کنترل زمان‌بند اسکن از UI (SPEC-007 §2.2) — قبلاً فقط در بوت قابل تنظیم بود
app.get('/api/scheduler', (_req: Request, res: Response) => {
  res.json({ success: true, scheduler: scanScheduler.getState() });
});

app.post('/api/scheduler', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const state = scanScheduler.configure({
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      intervalMinutes: body.intervalMinutes === undefined ? undefined : Number(body.intervalMinutes),
    });
    io.emit('scheduler:changed', state);
    return res.json({ success: true, scheduler: scanScheduler.getState() });
  } catch (err: any) {
    return res.status(400).json({ success: false, code: 'INVALID_SCHEDULE', error: err?.message ?? 'تنظیم نامعتبر' });
  }
});

app.post('/api/scheduler/run-now', async (_req: Request, res: Response) => {
  const result = await scanScheduler.tick(true);
  return res.json({ success: result !== 'error', result, scheduler: scanScheduler.getState() });
});

// Start Express server and connect Vite in development
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    // HMR websockets cannot be proxied reliably by the preview host and file
    // watching is intentionally disabled here, so keep a single listening port.
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Vite 8: `server.ws: false` is what actually stops the websocket
        // server from grabbing the default HMR port (24678) that Express needs.
        hmr: false,
        ws: false,
        // Watch files even without HMR so a browser reload always reflects the
        // latest source. (No extra port is opened: hmr/ws are disabled.)
        watch: {},
        // Allow any host (including AI Studio preview domains)
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  if (!readLLMConfig()) console.warn('[llm] KONKRED_GATEWAY_URL / KONKRED_API_KEY not set: AI endpoints return 503 AI_NOT_CONFIGURED');

  // وضعیت اسکنر را در همان لحظه‌ی راه‌اندازی گزارش می‌دهیم تا برای استفاده‌ی شخصی معلوم باشد
  // چه چیزی اسکن می‌شود و فید از کجاست (SPEC-004).
  const enabled = enabledTargets();
  const feed = loadFeedJobs();
  console.log(
    `[scanner] فید: ${SCAN_CONFIG.outFile} · ${feed.projects.length} پروژه در فایل · ${enabled.length} منبع فعال`,
  );
  if (CLOUD_CONFIG) {
    console.log(
      `[scanner] فید ابری فعال: ${CLOUD_CONFIG.repo}@${CLOUD_CONFIG.ref || 'default'} · توکن: ${CLOUD_CONFIG.token ? 'دارد' : 'ندارد'}`,
    );
    // اگر فید محلی خالی بود، یک‌بار از فید ابری پر می‌شود (شخصی‌سازی: بدون تنظیم دستی).
    if (feed.projects.length === 0 && CLOUD_CONFIG.token) {
      void syncCloudFeed(CLOUD_CONFIG)
        .then((result) => {
          console.log(`[scanner] ${result.message}`);
          if (result.written) emitBridgeLog(`فید ابری در راه‌اندازی همگام شد: ${result.cloudProjects} پروژه`, 'scan');
        })
        .catch((error) => console.warn(`[scanner] همگام‌سازی فید ابری در راه‌اندازی ناموفق بود: ${error?.message ?? error}`));
    }
  }
  if (enabled.length > 0) {
    console.log(`[scanner] منابع فعال: ${enabled.map((t) => t.name).join(' · ')}`);
  } else if (feed.projects.length > 0) {
    // فایل فید از قبل داده دارد؛ فقط اسکن خودکار خاموش است (یا منابعش فعال نشده‌اند).
    console.warn(
      '[scanner] اسکن خودکار فعال نیست؛ فید فعلی فقط از فایل خوانده می‌شود. ' +
        'برای افزودن داده‌ی تازه: docs/PERSONAL-SETUP.md (بخش‌های ۴ و ۵).',
    );
  } else {
    console.warn(
      '[scanner] هیچ منبعی فعال نیست و فایل فید هم خالی است؛ UI خالی می‌ماند. ' +
        'راهنمای راه‌اندازی شخصی: docs/PERSONAL-SETUP.md',
    );
  }
  if (SCAN_CONFIG.intervalMinutes > 0) {
    console.log(`[scanner] اسکن خودکار هر ${SCAN_CONFIG.intervalMinutes} دقیقه فعال است.`);
  }

  // ── Resilient listen ────────────────────────────────────────────────
  // The preview supervisor may briefly hold the port while restarting a
  // previous instance, so retry with backoff instead of crashing the process.
  let listenAttempt = 0;
  const maxListenAttempts = 8;
  const onListening = () => {
    console.log(`Konklancer server & Socket.io bridge running at http://localhost:${PORT}`);
  };
  const tryListen = () => {
    listenAttempt += 1;
    httpServer.listen(PORT, '0.0.0.0', onListening);
  };
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && listenAttempt < maxListenAttempts) {
      console.warn(`[server] پورت ${PORT} موقتاً در اشغال است (تلاش ${listenAttempt}/${maxListenAttempts}) — تلاش مجدد...`);
      setTimeout(tryListen, 700);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.warn(`[server] پورت ${PORT} در حال استفاده است؛ یک نمونهٔ دیگر از سرور در حال سرویس‌دهی است.`);
      process.exit(0);
    }
    console.error('[server] listen error', err);
    process.exit(1);
  });
  tryListen();
}

startServer();
