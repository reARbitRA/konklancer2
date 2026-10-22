import { Capacitor } from '@capacitor/core';
import { AIAnalysis, FreelanceJob } from '../types';
import { readStoredCustomLLM, ActiveCustomLLM } from '../utils/customLLMClient';
import { categoryPromptList } from '../../shared/taxonomy';

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
  custom: {
    endpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
};

export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function sanitizeModelIdClient(rawModel?: string): string {
  if (!rawModel) return '';
  return rawModel
    .trim()
    .replace(/^⭐\s*/, '')
    .replace(/\s*\[رایگان[^\]]*\]\s*$/i, '')
    .trim();
}

export function normalizeEndpointBaseClient(rawEndpoint?: string): string {
  if (!rawEndpoint) return '';
  return rawEndpoint
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
}

export function normalizeClientLLMConfig(raw?: Partial<ActiveCustomLLM> | null): Required<ActiveCustomLLM> | null {
  const apiKey = (raw?.apiKey || '').trim();
  if (!apiKey) return null;

  let provider = (raw?.provider || '').trim().toLowerCase();
  const cleanEp = normalizeEndpointBaseClient(raw?.endpoint);

  if (apiKey.startsWith('AIza')) provider = 'gemini';
  else if (apiKey.startsWith('gsk_')) provider = 'groq';
  else if (apiKey.startsWith('sk-or-')) provider = 'openrouter';
  else if (cleanEp.includes('generativelanguage.googleapis.com')) provider = 'gemini';
  else if (cleanEp.includes('api.groq.com')) provider = 'groq';
  else if (cleanEp.includes('openrouter.ai')) provider = 'openrouter';
  else if (!provider) provider = 'openrouter';

  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openrouter;
  let endpoint = cleanEp || defaults.endpoint;
  if (provider === 'gemini' && !endpoint.includes('generativelanguage.googleapis.com')) {
    endpoint = PROVIDER_DEFAULTS.gemini.endpoint;
  } else if (provider === 'groq' && (endpoint.includes('openrouter.ai') || endpoint.includes('googleapis.com'))) {
    endpoint = PROVIDER_DEFAULTS.groq.endpoint;
  } else if (provider === 'openrouter' && (endpoint.includes('api.groq.com') || endpoint.includes('googleapis.com'))) {
    endpoint = PROVIDER_DEFAULTS.openrouter.endpoint;
  }

  let model = sanitizeModelIdClient(raw?.model);
  if (provider === 'gemini') {
    model = model.replace(/^models\//, '');
    if (!model || model.includes('/') || model.includes(':free') || !model.startsWith('gemini')) {
      model = PROVIDER_DEFAULTS.gemini.defaultModel;
    }
  } else if (provider === 'groq') {
    if (!model || model.includes(':free') || model.startsWith('meta-llama/') || model.startsWith('gemini-')) {
      model = PROVIDER_DEFAULTS.groq.defaultModel;
    }
  } else if (!model) {
    model = defaults.defaultModel;
  }

  return { provider, endpoint, apiKey, model };
}

export function parseJsonLooseClient<T = any>(raw: string): T | null {
  const trimmed = (raw || '').trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const sliceObj = (() => {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    return start >= 0 && end > start ? unfenced.slice(start, end + 1) : null;
  })();

  for (const candidate of [unfenced, sliceObj]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // continue
    }
  }
  return null;
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    try {
      const parsed = JSON.parse(txt);
      return parsed?.error?.message || parsed?.message || txt.slice(0, 200);
    } catch {
      return txt.slice(0, 200);
    }
  } catch {
    return '';
  }
}

/**
 * مستقیم از مرورگر تبلت یا لایه Native HTTP اندروید (CapacitorHttp بدون محدودیت CORS)
 * به OpenRouter / Groq / Google Gemini / OpenAI وصل می‌شود.
 */
export async function callBrowserLLM(params: {
  prompt: string;
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  overrideConfig?: Partial<ActiveCustomLLM> | null;
}): Promise<{ text: string; model: string; provider: string }> {
  const cfg = normalizeClientLLMConfig(params.overrideConfig ?? readStoredCustomLLM());
  if (!cfg) {
    throw new Error(
      'کلید هوش مصنوعی تنظیم نشده است. از دکمه چرخ‌دنده (تنظیمات ⬅ اتصال هوش مصنوعی) کلید رایگان Gemini، Groq یا OpenRouter خود را وارد و ذخیره کنید.',
    );
  }

  // 1. Google Gemini Native REST API (supports CORS directly + native Android HTTP)
  if (cfg.provider === 'gemini') {
    const modelName = cfg.model.replace(/^models\//, '') || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const isFlash25 = modelName.startsWith('gemini-2.5-flash');
    const payload = {
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      ...(params.system ? { systemInstruction: { parts: [{ text: params.system }] } } : {}),
      generationConfig: {
        temperature: params.temperature ?? 0.3,
        maxOutputTokens: Math.max(params.maxTokens ?? 2048, 512),
        ...(params.json ? { responseMimeType: 'application/json' } : {}),
        ...(isFlash25 && (params.maxTokens ?? 2048) <= 256 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new Error(`خطای Gemini (${res.status}): ${detail || 'کلید API یا محدودیت شبکه را بررسی کنید.'}`);
    }

    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => !p?.thought && typeof p?.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim();

    if (!text) {
      const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '';
      throw new Error(`پاسخ متنی Gemini خالی بود${reason ? ` (${reason})` : ''}.`);
    }

    return { text, model: modelName, provider: 'gemini' };
  }

  // 2. OpenRouter / Groq / OpenAI / Custom OpenAI-Compatible Direct Call
  const isOpenRouter = cfg.provider === 'openrouter' || cfg.endpoint.includes('openrouter.ai');
  const url = `${normalizeEndpointBaseClient(cfg.endpoint)}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = window.location.origin || 'https://konklancer.app';
    headers['X-Title'] = 'KonkLancer Studio';
  }

  const messages = [
    ...(params.system ? [{ role: 'system', content: params.system }] : []),
    { role: 'user', content: params.prompt },
  ];

  const candidates =
    isOpenRouter && (cfg.model.endsWith(':free') || cfg.model === 'openrouter/free')
      ? Array.from(
          new Set([
            cfg.model,
            'openrouter/free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen-2.5-72b-instruct:free',
          ]),
        )
      : [cfg.model];

  let lastErr: Error | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i];
    const isLast = i === candidates.length - 1;
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: Math.max(params.maxTokens ?? 2048, 256),
      ...(params.json && !modelId.endsWith(':free') && modelId !== 'openrouter/free'
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 401 || res.status === 403) {
        const detail = await safeReadError(res);
        throw new Error(`کلید API رد شد (HTTP ${res.status}): ${detail}`);
      }

      if (!res.ok) {
        const detail = await safeReadError(res);
        lastErr = new Error(`خطای سرویس هوش مصنوعی (${res.status}) روی مدل ${modelId}: ${detail}`);
        if (!isLast) continue;
        throw lastErr;
      }

      const data: any = await res.json();
      const msg = data?.choices?.[0]?.message;
      let text =
        typeof msg?.content === 'string' && msg.content.trim()
          ? msg.content
          : Array.isArray(msg?.content)
            ? msg.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('')
            : '';

      if (!text.trim() && typeof msg?.reasoning === 'string' && !params.json) {
        text = msg.reasoning;
      }

      if (!text.trim()) {
        lastErr = new Error(`پاسخ متنی مدل ${modelId} خالی بود.`);
        if (!isLast) continue;
        throw lastErr;
      }

      return {
        text: text.trim(),
        model: data?.model || modelId,
        provider: cfg.provider,
      };
    } catch (err: any) {
      if (String(err?.message || '').includes('کلید API رد شد')) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (isLast) throw lastErr;
    }
  }

  throw lastErr ?? new Error('پاسخی از سرویس هوش مصنوعی دریافت نشد.');
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
  const start = Date.now();
  const cfg = normalizeClientLLMConfig(raw);
  if (!cfg) {
    return { success: false, models: [], error: 'کلید API وارد نشده است.' };
  }

  try {
    if (cfg.provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`,
      );
      if (!res.ok) {
        const detail = await safeReadError(res);
        return { success: false, models: [], error: `خطا در احراز هویت Gemini (${res.status}): ${detail}` };
      }
      const data: any = await res.json();
      const models: DiscoveredClientModel[] = (data?.models || [])
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
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

    const res = await fetch(`${normalizeEndpointBaseClient(cfg.endpoint)}/models`, {
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
      error: `عدم ارتباط مستقیم با سرویس (${err?.message || err}). مطمئن شوید اینترنت/فیلترشکن روی تبلت متصل است.`,
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
  const prompt = `شما معمار ارشد سیستم‌های اتوماسیون هوش مصنوعی فریلنسری هستید.
پروژه فریلنسری زیر از پلتفرم "${job.platform || 'فریلنسری'}" را تحلیل فنی و اقتصادی کنید:
عنوان: ${job.title}
توضیحات: ${job.description}
بودجه کارفرما: ${job.budgetFormatted || job.budget || 'نامشخص'}

خروجی را دقیقاً در قالب JSON معتبر زیر بازگردانید:
{
  "automatabilityScore": 95,
  "recommendedBid": 2800000,
  "suggestedDuration": "۴ ساعت",
  "technicalStack": ["Python", "Playwright"],
  "feasibilityReason": "توضیح تحلیلی ۲ خطی به زبان فارسی درباره نحوه اجرای سریع پروژه",
  "riskLevel": "low",
  "winProbability": "۸۵٪",
  "suggestedKicker": "نکته کلیدی که باید در خط اول پیشنهاد به آن اشاره شود تا کارفرما متوجه شود پروژه دقیق خوانده شده است"
}`;

  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 1200 });
  const parsed = parseJsonLooseClient<any>(llm.text) ?? {};
  const recommendedBid = Number(parsed.recommendedBid) || (job.budget ? Math.round(job.budget * 0.85) : 3000000);

  return {
    model: llm.model,
    automatabilityScore: Number(parsed.automatabilityScore) || 90,
    recommendedBid,
    recommendedBidFormatted: `${recommendedBid.toLocaleString('fa-IR')} تومان`,
    suggestedDuration: parsed.suggestedDuration || '۴ ساعت',
    technicalStack: Array.isArray(parsed.technicalStack) ? parsed.technicalStack : ['Python', 'Automation'],
    feasibilityReason:
      parsed.feasibilityReason || 'پروژه دیجیتال بوده و با ورک‌فلوهای هوش مصنوعی به‌سرعت قابل پیاده‌سازی و تحویل است.',
    riskLevel: parsed.riskLevel === 'high' || parsed.riskLevel === 'medium' ? parsed.riskLevel : 'low',
    winProbability: parsed.winProbability || '۸۵٪',
    suggestedKicker: parsed.suggestedKicker || 'ارائه نمونه اولیه تست‌شده پیش از شروع رسمی',
  };
}

export async function generateProposalDirect(
  job: FreelanceJob,
  tone: string,
  budget: number,
): Promise<{ proposal: string; proposedPrice: number; deliveryTime: string; model: string }> {
  const targetPrice = budget || (job.budget ? Math.round(job.budget * 0.82) : 2500000);
  const toneInstructionsMap: Record<string, string> = {
    friendly_expert: 'لحن: یک مهندس نرم‌افزار حرفه‌ای، صمیمی، خاکی و قابل اعتماد.',
    direct_urgent: 'لحن: صریح، بسیار متمرکز بر زمان تحویل فوری زیر چند ساعت.',
    technical_detailed: 'لحن: فنی و آگاه به جزییات کتابخانه‌ها و معماری اجرای بدون باگ.',
  };

  const prompt = `شما یک مجری ارشد در بازار فریلنسری ایران هستید.
برای پروژه زیر یک پیشنهاد بسیار متقاعدکننده بنویسید که کارفرما بلافاصله پیام دهد.
عنوان پروژه: ${job.title}
توضیحات پروژه: ${job.description}
بودجه هدف: ${targetPrice} تومان
${toneInstructionsMap[tone] || 'لحن: حرفه‌ای و صمیمی'}

قوانین سخت‌گیرانه:
۱. واژه‌های کلیشه‌ای مثل "با کمال میل"، "تضمین ۱۰۰٪"، "در اسرع وقت" را هرگز به کار نبرید.
۲. طول متن: حداکثر ۳ الی ۴ جمله.
۳. در جمله اول دقیقاً به خواسته مشخص کارفرما در همین پروژه اشاره کنید.
۴. ذکر کنید نسخه تست‌شده همراه با مستند کامل فارسی تحویل داده می‌شود.

خروجی را فقط به صورت JSON برگردانید:
{
  "proposal": "متن فارسی پروپوزال",
  "proposedPrice": ${targetPrice},
  "deliveryTime": "۴ ساعت"
}`;

  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 1200 });
  const parsed = parseJsonLooseClient<any>(llm.text) ?? {};
  return {
    model: llm.model,
    proposal: parsed.proposal || llm.text,
    proposedPrice: Number(parsed.proposedPrice) || targetPrice,
    deliveryTime: parsed.deliveryTime || '۴ ساعت',
  };
}

export async function generateSolutionDirect(
  job: FreelanceJob,
): Promise<{ files: Record<string, string>; model: string }> {
  const prompt = `شما یک مهندس نرم‌افزار ارشد و ایجنت کدنویسی خودکار هستید.
برای این پروژه فریلنسری:
عنوان: ${job.title}
توضیحات: ${job.description}

یک پروژه کامل، قابل اجرا و آماده تحویل بسازید. خروجی را حتماً در قالب یک JSON معتبر برگردانید که کلیدهای آن نام فایل‌ها و مقادیر آن متن کامل فایل باشد:
{
  "files": {
    "main.py": "سورس کامل و اجرایی با مدیریت خطا",
    "requirements.txt": "وابستگی‌های دقیق",
    "README.md": "راهنمای گام‌به‌گام فارسی برای کارفرما",
    "test_suite.py": "تست‌های واحد"
  }
}`;

  const llm = await callBrowserLLM({ prompt, json: true, maxTokens: 6000 });
  const parsed = parseJsonLooseClient<any>(llm.text);
  if (parsed?.files && typeof parsed.files === 'object' && Object.keys(parsed.files).length > 0) {
    return { files: parsed.files, model: llm.model };
  }
  return {
    model: llm.model,
    files: {
      'solution.md': llm.text,
    },
  };
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
