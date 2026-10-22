// SPEC-006: every LLM call goes through the Konkred gateway (OpenAI-compatible
// /v1/chat/completions). Konklancer holds one gateway key and no provider keys.
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export type TaskType = 'general' | 'extraction' | 'summarization' | 'code-generation';

export type LLMErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM'
  | 'AI_BAD_RESPONSE';

export class LLMError extends Error {
  code: LLMErrorCode;
  status: number;
  constructor(code: LLMErrorCode, message: string, status: number) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
  }
}

export interface LLMConfig {
  gatewayUrl: string;
  apiKey: string;
  timeoutMs: number;
  privacy: 'private' | 'any';
  cacheDir: string;
  cacheTtlMs: number;
}

export interface LLMRequest {
  taskType: TaskType;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** When set, successful answers are cached on disk under sha256(cacheKey). */
  cacheKey?: string;
}

export interface LLMResult {
  text: string;
  model: string;
  provider: string;
  cached: boolean;
}

export function readLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const gatewayUrl = (env.KONKRED_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (env.KONKRED_API_KEY || '').trim();
  if (!gatewayUrl || !apiKey) return null;
  return {
    gatewayUrl,
    apiKey,
    timeoutMs: Number(env.KONKRED_TIMEOUT_MS) || 60_000,
    privacy: env.KONKRED_PRIVACY === 'private' ? 'private' : 'any',
    cacheDir: env.KONKRED_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'llm'),
    cacheTtlMs: (Number(env.KONKRED_CACHE_TTL_HOURS) || 168) * 3600_000,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A mock/simulator model means no live provider capacity. Never treat it as real output. */
export const isMockModel = (model: string) => model.trim().toLowerCase().startsWith('mock');

function retryDelayMs(res: Response): number {
  const header = res.headers.get('retry-after');
  const seconds = header !== null ? Number(header) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 5000;
  return Math.min(60_000, Math.max(0, ms));
}

function readCache(file: string, ttlMs: number): LLMResult | null {
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as LLMResult;
  } catch {
    return null;
  }
}

function writeCache(file: string, value: LLMResult) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  } catch (err) {
    console.warn('[llm] cache write failed:', (err as Error).message);
  }
}

export interface CustomLLMCallConfig {
  endpoint: string;
  apiKey: string;
  model?: string;
  provider?: 'openrouter' | 'gemini' | 'groq' | 'openai' | 'ollama' | 'custom' | string;
}

export interface ModelScanResultItem {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

export interface ModelScanResult {
  success: boolean;
  provider: string;
  endpoint: string;
  latencyMs: number;
  models: ModelScanResultItem[];
  defaultModel: string;
  error?: string;
}

/**
 * اسکن و استخراج مدل‌های در دسترس با مشخص‌کردن مدل‌های کاملاً رایگان [FREE]
 */
export async function scanModels(
  config: { endpoint?: string; apiKey: string; provider?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ModelScanResult> {
  const apiKey = (config.apiKey || '').trim();
  let provider = (config.provider || '').trim().toLowerCase();
  let endpoint = (config.endpoint || '').trim().replace(/\/+$/, '');

  // تشخیص خودکار ارائه‌دهنده از آدرس
  if (!provider) {
    if (endpoint.includes('openrouter.ai')) provider = 'openrouter';
    else if (endpoint.includes('generativelanguage.googleapis.com')) provider = 'gemini';
    else if (endpoint.includes('api.groq.com')) provider = 'groq';
    else if (endpoint.includes('api.openai.com')) provider = 'openai';
    else if (endpoint.includes('11434')) provider = 'ollama';
    else provider = 'custom';
  }

  // نشانی‌های پیش‌فرض
  if (!endpoint) {
    if (provider === 'openrouter') endpoint = 'https://openrouter.ai/api/v1';
    else if (provider === 'gemini') endpoint = 'https://generativelanguage.googleapis.com/v1beta';
    else if (provider === 'groq') endpoint = 'https://api.groq.com/openai/v1';
    else if (provider === 'openai') endpoint = 'https://api.openai.com/v1';
    else if (provider === 'ollama') endpoint = 'http://localhost:11434/v1';
    else endpoint = 'https://openrouter.ai/api/v1';
  }

  const startTime = Date.now();

  try {
    // ۱. ارائه‌دهنده Google Gemini
    if (provider === 'gemini' || endpoint.includes('generativelanguage.googleapis.com')) {
      const url = `${endpoint}/models?key=${apiKey}`;
      const res = await fetchImpl(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: 'کلید Google Gemini نامعتبر است یا دسترسی آن محدود شده است.' };
        }
        return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: `خطای Gemini API (${res.status}): ${errText.slice(0, 150)}` };
      }
      const data: any = await res.json();
      const rawList: any[] = Array.isArray(data?.models) ? data.models : [];
      const models: ModelScanResultItem[] = rawList
        .filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => {
          const id = m.name.replace(/^models\//, '');
          // مدل‌های Flash و سری 2.0/2.5 در AI Studio تایر رایگان (15 RPM) دارند
          const isFlash = id.includes('flash') || id.includes('exp');
          return {
            id,
            name: `${m.displayName || id}${isFlash ? ' [رایگان / Free]' : ''}`,
            isFree: isFlash,
            description: m.description || '',
          };
        });

      // مرتب‌سازی مدل‌ها: رایگان‌ها اول
      models.sort((a, b) => (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0));
      const defaultModel = models.find((m) => m.id.includes('gemini-2.5-flash'))?.id
        || models.find((m) => m.id.includes('gemini-2.0-flash'))?.id
        || models.find((m) => m.id.includes('gemini-1.5-flash'))?.id
        || models[0]?.id
        || 'gemini-2.5-flash';

      return { success: true, provider: 'gemini', endpoint, latencyMs, models, defaultModel };
    }

    // ۲. ارائه‌دهنده OpenRouter (دارای ده‌ها مدل کاملاً رایگان)
    if (provider === 'openrouter' || endpoint.includes('openrouter.ai')) {
      const url = `${endpoint}/models`;
      const res = await fetchImpl(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://freelanceflow.ai',
          'X-Title': 'FreelanceFlow AI',
        },
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: 'کلید OpenRouter نامعتبر است (خطای 401: Unauthorized).' };
        }
        return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: `خطای OpenRouter (${res.status})` };
      }
      const data: any = await res.json();
      const rawList: any[] = Array.isArray(data?.data) ? data.data : [];
      const models: ModelScanResultItem[] = rawList.map((m) => {
        const id = String(m.id || '');
        const pricing = m.pricing || {};
        const isFree = id.endsWith(':free') || id.includes(':free') ||
          (pricing && parseFloat(pricing.prompt || '1') === 0 && parseFloat(pricing.completion || '1') === 0);
        return {
          id,
          name: `${m.name || id}${isFree ? ' [رایگان / Free]' : ''}`,
          isFree,
          contextLength: m.context_length,
          description: m.description ? m.description.slice(0, 100) : '',
        };
      });

      // مرتب‌سازی: مدل‌های رایگان در بالا، سپس نام
      models.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.name.localeCompare(b.name);
      });

      const defaultModel = models.find((m) => m.id.includes('llama-3.3-70b-instruct:free'))?.id
        || models.find((m) => m.id.includes('gemini-2.0-flash-exp:free'))?.id
        || models.find((m) => m.id.includes(':free'))?.id
        || models[0]?.id
        || 'meta-llama/llama-3.3-70b-instruct:free';

      return { success: true, provider: 'openrouter', endpoint, latencyMs, models, defaultModel };
    }

    // ۳. ارائه‌دهنده Groq
    if (provider === 'groq' || endpoint.includes('groq.com')) {
      const url = `${endpoint}/models`;
      const res = await fetchImpl(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: 'کلید Groq API نامعتبر است.' };
        }
        return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: `خطای Groq (${res.status})` };
      }
      const data: any = await res.json();
      const rawList: any[] = Array.isArray(data?.data) ? data.data : [];
      const models: ModelScanResultItem[] = rawList.map((m) => {
        const id = String(m.id || '');
        // گروک برای مدل‌های استانداردی مثل llama-3.3-70b و llama-3.1-8b لایه رایگان دارد
        const isFree = id.includes('llama') || id.includes('gemma') || id.includes('mixtral');
        return {
          id,
          name: `${id}${isFree ? ' [رایگان / Free Tier]' : ''}`,
          isFree,
        };
      });
      models.sort((a, b) => (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0));
      const defaultModel = models.find((m) => m.id.includes('llama-3.3-70b'))?.id || models[0]?.id || 'llama-3.3-70b-versatile';
      return { success: true, provider: 'groq', endpoint, latencyMs, models, defaultModel };
    }

    // ۴. استاندارد OpenAI یا Ollama یا Custom
    const url = endpoint.endsWith('/models') ? endpoint : `${endpoint}/models`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    const latencyMs = Date.now() - startTime;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: 'کلید API توسط اندپوینت پذیرفته نشد (401 Unauthorized).' };
      }
      return { success: false, provider, endpoint, latencyMs, models: [], defaultModel: '', error: `خطای اندپوینت (${res.status})` };
    }
    const data: any = await res.json();
    const rawList: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
    const isLocal = provider === 'ollama' || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

    const models: ModelScanResultItem[] = rawList.map((m) => {
      const id = String(m.id || m.name || '');
      const isFree = isLocal || id.toLowerCase().includes('free');
      return {
        id,
        name: `${id}${isFree ? ' [رایگان / Free]' : ''}`,
        isFree,
      };
    });

    models.sort((a, b) => (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0));
    const defaultModel = models[0]?.id || 'gpt-4o-mini';
    return { success: true, provider: provider || 'custom', endpoint, latencyMs, models, defaultModel };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      provider,
      endpoint,
      latencyMs,
      models: [],
      defaultModel: '',
      error: `عدم برقراری ارتباط با اندپوینت: ${err.message || 'تایم‌اوت یا مسدود بودن شبکه'}`,
    };
  }
}

export async function callLLM(
  req: LLMRequest,
  cfg: LLMConfig | null = readLLMConfig(),
  fetchImpl: typeof fetch = fetch,
  customLLM?: CustomLLMCallConfig | null,
): Promise<LLMResult> {
  // ۱. اگر کاربر کلید و اندپوینت اختصاصی فرستاده باشد:
  if (customLLM && customLLM.apiKey) {
    let endpoint = (customLLM.endpoint || '').trim().replace(/\/+$/, '');
    const apiKey = customLLM.apiKey.trim();
    const model = customLLM.model || '';
    const provider = (customLLM.provider || '').toLowerCase();

    // مسیر Google Gemini مستقیم
    if (provider === 'gemini' || endpoint.includes('generativelanguage.googleapis.com')) {
      const cleanEndpoint = endpoint || 'https://generativelanguage.googleapis.com/v1beta';
      const targetModel = model || 'gemini-2.5-flash';
      const url = `${cleanEndpoint}/models/${targetModel}:generateContent?key=${apiKey}`;

      const contents = [
        {
          role: 'user',
          parts: [{ text: (req.system ? req.system + '\n\n' : '') + req.prompt }],
        },
      ];

      const body = JSON.stringify({
        contents,
        generationConfig: {
          temperature: req.temperature ?? 0.4,
          maxOutputTokens: req.maxTokens ?? 2048,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      });

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) {
          throw new LLMError('AI_AUTH', 'کلید Google Gemini معتبر نیست.', 401);
        }
        if (res.status === 429) {
          throw new LLMError('AI_RATE_LIMITED', 'محدودیت نرخ (Rate Limit) برای کلید Gemini شما اعمال شد.', 429);
        }
        throw new LLMError('AI_UPSTREAM', `Gemini API خطا داد (${res.status}): ${errText.slice(0, 150)}`, 502);
      }

      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || !text.trim()) {
        throw new LLMError('AI_BAD_RESPONSE', 'Gemini پاسخ متنی خالی برگرداند.', 502);
      }
      return { text, model: `gemini:${targetModel}`, provider: 'gemini', cached: false };
    }

    // مسیر OpenAI-compatible (OpenRouter, Groq, OpenAI, Ollama, Konkred)
    let chatUrl = endpoint;
    if (!chatUrl.endsWith('/chat/completions')) {
      chatUrl = `${chatUrl}/chat/completions`;
    }

    const messages: { role: string; content: string }[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });

    const targetModel = model || (provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o-mini');

    const body = JSON.stringify({
      model: targetModel,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.4,
      ...(req.json && !targetModel.includes(':free') ? { response_format: { type: 'json_object' } } : {}),
    });

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://freelanceflow.ai',
      'X-Title': 'FreelanceFlow AI',
    };

    const res = await fetchImpl(chatUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new LLMError('AI_AUTH', 'کلید API توسط سرور مدل پذیرفته نشد (401 Unauthorized).', 401);
      }
      if (res.status === 429) {
        throw new LLMError('AI_RATE_LIMITED', 'محدودیت نرخ (Rate Limit) برای مدل اعمال شد.', 429);
      }
      throw new LLMError('AI_UPSTREAM', `پاسخ خطا از اندپوینت (${res.status}): ${errText.slice(0, 150)}`, 502);
    }

    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      throw new LLMError('AI_BAD_RESPONSE', 'مدل هوش مصنوعی پاسخ خالی برگرداند.', 502);
    }
    return { text, model: targetModel, provider: provider || 'custom', cached: false };
  }

  // ۲. مسیر پیش‌فرض سیستم (گیت‌وی یا سرور)
  if (!cfg) {
    throw new LLMError('AI_NOT_CONFIGURED', 'کلید یا اندپوینت اختصاصی تنظیم نشده است؛ لطفاً در بخش تنظیمات کلید هوش مصنوعی خود را وارد کنید.', 503);
  }

  const cacheFile = req.cacheKey ? path.join(cfg.cacheDir, `${sha256(req.cacheKey)}.json`) : null;
  if (cacheFile) {
    const hit = readCache(cacheFile, cfg.cacheTtlMs);
    if (hit) return { ...hit, cached: true };
  }

  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  const body = JSON.stringify({
    taskType: req.taskType,
    messages,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.4,
    privacy: cfg.privacy,
  });

  const url = `${cfg.gatewayUrl}/v1/chat/completions`;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` };

  // One attempt, plus one retry for 429 (after Retry-After) and 5xx / network errors.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const last = attempt === 2;
    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (err) {
      if (!last) {
        await sleep(1000);
        continue;
      }
      throw new LLMError('AI_UPSTREAM', `gateway unreachable: ${(err as Error).message}`, 502);
    }

    if (res.status === 401 || res.status === 403) {
      throw new LLMError('AI_AUTH', 'gateway کلید KONKRED_API_KEY را نپذیرفت.', 502);
    }
    if (res.status === 429) {
      if (!last) {
        await sleep(retryDelayMs(res));
        continue;
      }
      throw new LLMError('AI_RATE_LIMITED', 'ظرفیت رایگان فعلاً پر است؛ بعداً دوباره تلاش کنید.', 429);
    }
    if (res.status >= 500) {
      if (!last) {
        await sleep(1000);
        continue;
      }
      throw new LLMError('AI_UPSTREAM', `gateway HTTP ${res.status}`, 502);
    }
    if (!res.ok) {
      throw new LLMError('AI_UPSTREAM', `gateway HTTP ${res.status}`, 502);
    }

    const data: any = await res.json().catch(() => null);
    const model = String(data?.model ?? '');
    if (isMockModel(model)) {
      throw new LLMError('AI_UNAVAILABLE', 'هیچ provider زنده‌ای در دسترس نیست (پاسخ شبیه‌ساز گیتوی).', 503);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new LLMError('AI_BAD_RESPONSE', 'gateway پاسخ خالی برگرداند.', 502);
    }

    const result: LLMResult = { text, model, provider: model.split(':')[0] || 'unknown', cached: false };
    if (cacheFile) writeCache(cacheFile, result);
    return result;
  }
  throw new LLMError('AI_UPSTREAM', 'unreachable', 502);
}

/** Parse JSON from model output that may be fenced or have surrounding prose. */
export function parseJsonLoose<T = any>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t) as T;
  } catch {
    // fall through
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}
