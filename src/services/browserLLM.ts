import { Capacitor } from '@capacitor/core';
import { AIAnalysis, FreelanceJob } from '../types';
import {
  ActiveCustomLLM,
  getOrderedVaultCandidates,
  readStoredCustomLLM,
  switchActiveKeyOrModel,
} from '../utils/customLLMClient';
import { categoryPromptList } from '../../shared/taxonomy';
import { relayLLMRequestViaUS } from './cloudRelay';

export interface DiscoveredClientModel {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

const PROVIDER_DEFAULTS: Record<string, { endpoint: string; defaultModel: string }> = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  ollama: {
    endpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
  },
  custom: {
    endpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
};

export function hasConfiguredBrowserKey(): boolean {
  return Boolean(readStoredCustomLLM()?.apiKey?.trim());
}

export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isStandaloneClientMode(): boolean {
  if (isNativeAndroidApp()) return true;
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  if (proto === 'file:' || proto === 'content:' || !window.location.host) return true;
  const host = window.location.hostname || '';
  if (host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.netlify.app')) {
    return true;
  }
  return Boolean((window as any).__KONKLANCER_STANDALONE__);
}

/**
 * Tries fast direct browser/native fetch first; if blocked by Iran ISP / CORS / Geo-IP
 * (e.g. Gemini 400 "User location is not supported", Groq/OpenAI 403 Forbidden, or network TypeError),
 * seamlessly relays through KonkLancer's US-East-1 cloud relay over Cloudflare HTTPS.
 */
async function smartFetchLLM(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const method = init.method || 'GET';
  const headers = init.headers || {};

  let directRes: Response | null = null;
  try {
    directRes = await fetch(url, {
      method,
      headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    if (directRes.ok) return directRes;
    if (directRes.status !== 400 && directRes.status !== 403 && directRes.status < 500) {
      return directRes;
    }
  } catch {
    // Network / ISP filter / CORS error -> fall through to US-East-1 Cloud Relay
  }

  try {
    return await relayLLMRequestViaUS(url, method, headers, init.body);
  } catch {
    // fall back to direct response if any
  }

  if (directRes) return directRes;
  throw new Error('عدم برقراری ارتباط با سرویس هوش مصنوعی (مستقیم و رله ابری).');
}

export function detectProviderClient(endpoint?: string, explicitProvider?: string, apiKey?: string): string {
  const ep = (endpoint || '').trim().toLowerCase();
  const key = (apiKey || '').trim();
  if (key.startsWith('AIza')) return 'gemini';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (explicitProvider && explicitProvider !== 'custom') return explicitProvider;
  if (ep.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (ep.includes('openrouter.ai')) return 'openrouter';
  if (ep.includes('api.groq.com')) return 'groq';
  if (ep.includes('api.openai.com')) return 'openai';
  if (ep.includes(':11434')) return 'ollama';
  return explicitProvider || 'openrouter';
}

export function normalizeEndpointBaseClient(endpoint: string): string {
  let clean = endpoint.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) clean = clean.slice(0, -'/chat/completions'.length);
  if (clean.endsWith('/models')) clean = clean.slice(0, -'/models'.length);
  return clean;
}

export function resolveClientLLMConfig(raw?: Partial<ActiveCustomLLM> | null): ActiveCustomLLM | null {
  const source = raw?.apiKey ? raw : readStoredCustomLLM();
  if (!source || !source.apiKey?.trim()) return null;

  const provider = detectProviderClient(source.endpoint, source.provider, source.apiKey);
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openrouter;
  let model = (source.model || defaults.defaultModel).trim();
  if (provider === 'openrouter' && model === 'google/gemini-2.0-flash-lite-preview-02-05:free') {
    model = defaults.defaultModel;
  }

  return {
    id: source.id,
    label: source.label,
    provider,
    endpoint: (source.endpoint || defaults.endpoint).trim() || defaults.endpoint,
    apiKey: source.apiKey.trim(),
    model,
  };
}

export function parseJsonLooseClient<T = unknown>(raw: string): T | null {
  const cleaned = (raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  for (const candidate of [cleaned, extractBalancedBlock(cleaned)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function extractBalancedBlock(text: string): string | null {
  const startObj = text.indexOf('{');
  const startArr = text.indexOf('[');
  const start =
    startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const data: any = await res.json();
    return data?.error?.message || data?.message || JSON.stringify(data).slice(0, 220);
  } catch {
    try {
      return (await res.text()).slice(0, 220);
    } catch {
      return `HTTP ${res.status}`;
    }
  }
}

async function executeSingleKeyCall(
  cfg: ActiveCustomLLM,
  opts: {
    prompt: string;
    systemPrompt?: string;
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<{ text: string; model: string; provider: string; keyLabel?: string }> {
  const maxTokens = opts.maxTokens ?? 4096;
  const temperature = opts.temperature ?? 0.35;

  if (cfg.provider === 'gemini') {
    const cleanModel = cfg.model.startsWith('models/') ? cfg.model.slice(7) : cfg.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (opts.systemPrompt) {
      body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
    }

    const res = await smartFetchLLM(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await safeReadError(res);
      const err: any = new Error(`خطای Gemini (${res.status}): ${detail}`);
      err.status = res.status;
      throw err;
    }

    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => typeof p?.text === 'string' && !p?.thought)
      .map((p) => p.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error('پاسخ متنی از مدل Gemini دریافت نشد.');
    }
    return { text, model: cleanModel, provider: 'gemini', keyLabel: cfg.label };
  }

  const base = normalizeEndpointBaseClient(cfg.endpoint);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://konklancer.app';
    headers['X-Title'] = 'KonkLancer Studio';
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  messages.push({
    role: 'user',
    content: opts.json
      ? `${opts.prompt}\n\n[خروجی را حتماً و فقط به شکل یک شیء JSON معتبر بدون توضیحات اضافی بنویسید]`
      : opts.prompt,
  });

  const res = await smartFetchLLM(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const detail = await safeReadError(res);
    const err: any = new Error(`خطای سرویس هوش مصنوعی (${res.status}): ${detail}`);
    err.status = res.status;
    throw err;
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new Error('پاسخ خالی از مدل هوش مصنوعی دریافت شد.');
  }
  return { text, model: data?.model || cfg.model, provider: cfg.provider, keyLabel: cfg.label };
}

/**
 * اجرای هوشمند درخواست LLM با پشتیبانی از:
 * ۱. رله خودکار آمریکا (AWS us-east-1) بدون نیاز به VPN
 * ۲. چرخش خودکار بین کلیدهای ذخیره‌شده (Auto-Failover) در صورت خطای سهمیه 429 یا قطعی سرویس‌دهنده
 */
export async function callBrowserLLM(opts: {
  prompt: string;
  systemPrompt?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  overrideConfig?: Partial<ActiveCustomLLM>;
}): Promise<{ text: string; model: string; provider: string; keyLabel?: string }> {
  const rawCandidates = getOrderedVaultCandidates(opts.overrideConfig);
  const candidates = rawCandidates
    .map((c) => resolveClientLLMConfig(c))
    .filter((c): c is ActiveCustomLLM => Boolean(c));

  if (candidates.length === 0) {
    throw new Error(
      'کلید هوش مصنوعی تنظیم نشده است. از نوار بالا روی سوییچر مدل یا آیکون تنظیمات (چرخ‌دنده) بزنید و کلید API خود را وارد کنید.',
    );
  }

  let lastError: Error | null = null;
  for (let idx = 0; idx < candidates.length; idx++) {
    const cfg = candidates[idx];
    try {
      const result = await executeSingleKeyCall(cfg, opts);
      // اگر کلید اول خطا داد و کلید دوم در خزانه موفق شد، کلید سالم به عنوان کلید فعال انتخاب شود
      if (idx > 0 && cfg.id && !opts.overrideConfig) {
        switchActiveKeyOrModel(cfg.id);
      }
      return result;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // اگر کلیدهای جایگزین دیگری در خزانه داریم، روی خطای 429/401/402/5xx کلید بعدی را امتحان کن
      if (idx < candidates.length - 1) {
        continue;
      }
    }
  }

  throw lastError || new Error('خطا در اجرای درخواست هوش مصنوعی.');
}

export async function scanModelsDirect(raw: Partial<ActiveCustomLLM>): Promise<{
  success: boolean;
  models: DiscoveredClientModel[];
  defaultModel?: string;
  detectedProvider?: string;
  endpoint?: string;
  latencyMs?: number;
  error?: string;
}> {
  const cfg = resolveClientLLMConfig(raw);
  if (!cfg) {
    return { success: false, models: [], error: 'لطفاً ابتدا کلید API معتبر وارد کنید.' };
  }

  const start = Date.now();
  try {
    if (cfg.provider === 'gemini') {
      const res = await smartFetchLLM(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`,
        { method: 'GET' },
      );
      if (!res.ok) {
        const detail = await safeReadError(res);
        return { success: false, models: [], error: `خطای کلید Gemini (${res.status}): ${detail}` };
      }
      const data: any = await res.json();
      const models: DiscoveredClientModel[] = (data.models || [])
        .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: any) => {
          const id = String(m.name || '').replace(/^models\//, '');
          const isFree = id.includes('flash') || id.includes('gemma');
          return {
            id,
            name: `${m.displayName || id}${isFree ? ' [رایگان / Free]' : ''}`,
            isFree,
            contextLength: m.inputTokenLimit,
            description: m.description,
          };
        })
        .sort((a: DiscoveredClientModel, b: DiscoveredClientModel) => Number(b.isFree) - Number(a.isFree));

      const preferred =
        models.find((m) => m.id === 'gemini-2.5-flash') ||
        models.find((m) => m.id === 'gemini-2.0-flash') ||
        models[0];

      return {
        success: true,
        models,
        defaultModel: preferred?.id || 'gemini-2.5-flash',
        detectedProvider: 'gemini',
        endpoint: cfg.endpoint,
        latencyMs: Date.now() - start,
      };
    }

    const res = await smartFetchLLM(`${normalizeEndpointBaseClient(cfg.endpoint)}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      return { success: false, models: [], error: `خطا در دریافت لیست مدل‌ها (${res.status}): ${detail}` };
    }

    const data: any = await res.json();
    const rawList: any[] = data?.data || (Array.isArray(data) ? data : []);
    const isOpenRouter = cfg.provider === 'openrouter';
    const isGroq = cfg.provider === 'groq';

    const models: DiscoveredClientModel[] = rawList
      .map((m: any) => {
        const id = typeof m === 'string' ? m : m.id || m.name;
        const promptPrice = String(m?.pricing?.prompt ?? '1');
        const completionPrice = String(m?.pricing?.completion ?? '1');
        const isFree = isOpenRouter
          ? (promptPrice === '0' && completionPrice === '0') || String(id).endsWith(':free') || id === 'openrouter/free'
          : isGroq;
        return {
          id,
          name: `${m?.name || id}${isFree ? ' [رایگان / Free]' : ''}`,
          isFree,
          contextLength: m?.context_length || m?.context_window,
          description: m?.description,
        };
      })
      .sort((a, b) => Number(b.isFree) - Number(a.isFree));

    const preferred =
      models.find((m) => m.isFree && m.id.includes('llama-3.3-70b')) ||
      models.find((m) => m.isFree && m.id.includes('deepseek')) ||
      models.find((m) => m.isFree && m.id.includes('qwen')) ||
      models.find((m) => m.isFree) ||
      models[0];

    return {
      success: true,
      models,
      defaultModel: preferred?.id || cfg.model,
      detectedProvider: cfg.provider,
      endpoint: cfg.endpoint,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      models: [],
      error: `عدم ارتباط با سرویس (${err?.message || err}).`,
    };
  }
}

export async function testConnectionDirect(raw: Partial<ActiveCustomLLM>): Promise<{
  success: boolean;
  latencyMs: number;
  model: string;
  provider: string;
  reply: string;
}> {
  const start = Date.now();
  const res = await callBrowserLLM({
    prompt: 'فقط بنویس: اتصال برقرار شد',
    maxTokens: 256,
    temperature: 0.1,
    overrideConfig: raw,
  });
  return {
    success: true,
    latencyMs: Date.now() - start,
    model: res.model,
    provider: res.provider,
    reply: res.text,
  };
}

export async function analyzeJobDirect(job: FreelanceJob): Promise<AIAnalysis & { model: string }> {
  const prompt = `شما معمار ارشد سیستم‌های نرم‌افزاری، هوش مصنوعی و اتوماسیون تجاری هستید.
پروژه فریلنسری زیر از پلتفرم "${job.platform || 'فریلنسری'}" را به شکل عمیق، واقع‌بینانه و مهندسی تحلیل کنید:
عنوان: ${job.title}
دسته تشخیص‌داده‌شده: ${job.category}
توضیحات کامل کارفرما: ${job.description}
بودجه اعلامی کارفرما: ${job.budgetFormatted || job.budget || 'توافقی / نامشخص'}
تعداد پیشنهادهای فعلی رقبا: ${job.proposalsCount}

خروجی را دقیقاً در قالب JSON معتبر زیر برگردانید:
{
  "automatabilityScore": 92,
  "recommendedBid": 4200000,
  "suggestedDuration": "۶ ساعت کاری (تحویل ۲ روزه)",
  "technicalStack": ["Python 3.11", "FastAPI", "Structured Markdown Spec"],
  "feasibilityReason": "تحلیل دقیق ۳ خطی به زبان فارسی درباره معماری تحویل سریع با بالاترین کیفیت و کمترین نیاز به جلسات رفت‌وبرگشتی با کارفرما",
  "riskLevel": "low",
  "winProbability": "۸۵٪",
  "suggestedKicker": "قلاب فنی دقیق برای خط اول پیشنهاد (اشاره به یک ریسک یا نکته فنی ظریف در همین پروژه که نشان دهد شما معمار واقعی کار هستید)"
}`;

  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 1500 });
  const parsed = parseJsonLooseClient<any>(llm.text) ?? {};
  const recommendedBid = Number(parsed.recommendedBid) || (job.budget ? Math.round(job.budget * 0.85) : 3500000);

  return {
    model: llm.model,
    automatabilityScore: Number(parsed.automatabilityScore) || 90,
    recommendedBid,
    recommendedBidFormatted: `${recommendedBid.toLocaleString('fa-IR')} تومان`,
    suggestedDuration: parsed.suggestedDuration || '۱ الی ۲ روز کاری',
    technicalStack: Array.isArray(parsed.technicalStack) ? parsed.technicalStack : ['AI Architecture', 'Automation'],
    feasibilityReason:
      parsed.feasibilityReason || 'پروژه کاملاً دیجیتال بوده و با معماری ماژولار و مستندات مهندسی قابل تحویل یک‌ضرب است.',
    riskLevel: parsed.riskLevel === 'high' || parsed.riskLevel === 'medium' ? parsed.riskLevel : 'low',
    winProbability: parsed.winProbability || '۸۵٪',
    suggestedKicker: parsed.suggestedKicker || 'ارسال پیش‌طرح معماری و ساختار دقیق خروجی همزمان با ثبت پیشنهاد',
  };
}

export async function generateProposalDirect(
  job: FreelanceJob,
  tone: string,
  budget: number,
): Promise<{ proposal: string; proposedPrice: number; deliveryTime: string; model: string }> {
  const targetPrice = budget || (job.budget ? Math.round(job.budget * 0.85) : 3500000);
  const toneInstructionsMap: Record<string, string> = {
    friendly_expert: 'لحن: متخصص ارشد با تجربه کاری بین‌المللی، خوش‌فکر، شفاف، بدون اغراق و کاملاً مسلط به کار.',
    direct_urgent: 'لحن: بسیار موجز، نتیجه‌گرا و متمرکز بر تحویل سریع نسخه نهایی و تست‌شده.',
    technical_detailed: 'لحن: معمار فنی دقیق؛ ذکر صریح ساختار خروجی، استاندارد کیفیت و مستندات تحویل.',
  };

  const prompt = `شما یک مجری طراز اول در کارلانسر و پونیشا هستید که با ارسال پیشنهادهای فنی دقیق و غیرکلیشه‌ای، بالاترین نرخ برد پروژه را دارد.
عنوان پروژه: ${job.title}
شرح پروژه: ${job.description}
مبلغ پیشنهادی هدف: ${targetPrice} تومان
${toneInstructionsMap[tone] || toneInstructionsMap.friendly_expert}

قوانین طلایی:
۱. هرگز از جملات کلیشه‌ای مثل «سلام وقت بخیر پروژه شما را خواندم»، «با کمال میل»، «تضمین ۱۰۰٪» یا «در اسرع وقت» استفاده نکنید.
۲. در همان جمله اول مستقیماً سراغ اصل مسأله کارفرما بروید و بگویید دقیقاً چه ساختار/راه‌حلی برایش پیاده می‌کنید.
۳. در ۲-۳ بولت کوتاه بگویید دقیقاً چه فایل‌ها و مستندات تمیز و آماده‌ای تحویل می‌گیرد (تا خیالش راحت شود کار بدون رفت‌وبرگشت فرسایشی جمع می‌شود).
۴. در پایان یک سؤال فنی هوشمندانه و کوتاه بپرسید که کارفرما را ترغیب کند همین الان چت را با شما باز کند.

خروجی را فقط به صورت JSON برگردانید:
{
  "proposal": "متن کامل، خوش‌فرم و آماده کپی پروپوزال فارسی",
  "proposedPrice": ${targetPrice},
  "deliveryTime": "۲ روز کاری"
}`;

  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 1600 });
  const parsed = parseJsonLooseClient<any>(llm.text) ?? {};
  return {
    model: llm.model,
    proposal: parsed.proposal || llm.text,
    proposedPrice: Number(parsed.proposedPrice) || targetPrice,
    deliveryTime: parsed.deliveryTime || '۲ روز کاری',
  };
}

export async function generateSolutionDirect(
  job: FreelanceJob,
): Promise<{ files: Record<string, string>; model: string }> {
  const { generateEnterpriseDeliverablePackage } = await import('./deliveryEngine');
  const res = await generateEnterpriseDeliverablePackage(job);
  return { files: res.files, model: res.model };
}

export async function categorizeJobDirect(
  title: string,
  description: string,
  tags: string[] = [],
): Promise<string> {
  if (!readStoredCustomLLM()) return tags[0] || 'other';
  const prompt = `از بین کلیدهای زیر دقیق‌ترین دسته را برای این پروژه انتخاب کن:\n${categoryPromptList()}\nعنوان: ${title}\nتوضیح: ${description}\nفقط JSON برگردان: {"category":"key"}`;
  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 256, temperature: 0.1 });
  const parsed = parseJsonLooseClient<any>(llm.text);
  return parsed?.category || tags[0] || 'other';
}
