// SPEC-006: client for a Konkred-compatible AI gateway (Konkred's POST /api/v1/ai/run
// contract), direct env provider keys (GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY /
// OPENAI_API_KEY), and user-supplied custom LLM keys (OpenRouter, Groq, Google Gemini, Custom).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type TaskType = 'general' | 'coding' | 'code-generation' | 'analysis' | 'creative' | 'extraction';
export type Privacy = 'any' | 'strict';
export type ProviderKind = 'gateway' | 'openrouter' | 'groq' | 'gemini' | 'custom';

export interface CustomLLMInput {
  provider?: 'openrouter' | 'groq' | 'gemini' | 'custom' | string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export type CustomLLMCallConfig = CustomLLMInput;

export interface LLMConfig {
  gatewayUrl: string;
  apiKey: string;
  timeoutMs: number;
  privacy: Privacy;
  cacheDir: string | null;
  cacheTtlMs: number;
  directCustom?: CustomLLMInput;
}

export const PROVIDER_DEFAULTS: Record<Exclude<ProviderKind, 'gateway'>, { endpoint: string; defaultModel: string }> = {
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
  custom: {
    endpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
};

export function sanitizeModelId(rawModel?: string): string {
  if (!rawModel) return '';
  return rawModel
    .trim()
    .replace(/^⭐\s*/, '')
    .replace(/\s*\[رایگان\s*\/\s*Free\]\s*$/i, '')
    .trim();
}

export function normalizeEndpointBase(rawEndpoint?: string): string {
  if (!rawEndpoint) return '';
  return rawEndpoint
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
}

export function detectProviderFromKeyOrEndpoint(
  rawProvider?: string,
  rawEndpoint?: string,
  rawApiKey?: string,
): Exclude<ProviderKind, 'gateway'> {
  const key = (rawApiKey || '').trim();
  const ep = normalizeEndpointBase(rawEndpoint);
  const prov = (rawProvider || '').trim().toLowerCase();

  // Key prefixes are unambiguous and fix the common case where a user pastes a Gemini/Groq/OpenRouter
  // key without switching the dropdown first.
  if (key.startsWith('AIza')) return 'gemini';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';

  if (ep.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (ep.includes('api.groq.com')) return 'groq';
  if (ep.includes('openrouter.ai')) return 'openrouter';

  if (prov === 'gemini' || prov === 'groq' || prov === 'openrouter' || prov === 'custom') {
    return prov;
  }
  return 'openrouter';
}

export function normalizeCustomLLM(custom?: CustomLLMInput | null): Required<CustomLLMInput> | null {
  if (!custom?.apiKey || !custom.apiKey.trim()) return null;
  const apiKey = custom.apiKey.trim();
  const provider = detectProviderFromKeyOrEndpoint(custom.provider, custom.endpoint, apiKey);
  const rawEp = normalizeEndpointBase(custom.endpoint);

  // If the user switched key types (e.g. AIza... while endpoint still said openrouter.ai), reset endpoint to match provider.
  let endpoint = rawEp || PROVIDER_DEFAULTS[provider].endpoint;
  if (provider === 'gemini' && !endpoint.includes('generativelanguage.googleapis.com')) {
    endpoint = PROVIDER_DEFAULTS.gemini.endpoint;
  } else if (provider === 'groq' && (endpoint.includes('openrouter.ai') || endpoint.includes('googleapis.com'))) {
    endpoint = PROVIDER_DEFAULTS.groq.endpoint;
  } else if (provider === 'openrouter' && (endpoint.includes('api.groq.com') || endpoint.includes('googleapis.com'))) {
    endpoint = PROVIDER_DEFAULTS.openrouter.endpoint;
  }

  let model = sanitizeModelId(custom.model);
  if (provider === 'gemini') {
    model = model.replace(/^models\//, '');
    // Guard against stale OpenRouter/Groq model IDs stored in localStorage
    if (!model || model.includes('/') || model.includes(':free') || !model.startsWith('gemini')) {
      model = PROVIDER_DEFAULTS.gemini.defaultModel;
    }
  } else if (provider === 'groq') {
    if (!model || model.includes(':free') || model.startsWith('meta-llama/') || model.startsWith('gemini-')) {
      model = PROVIDER_DEFAULTS.groq.defaultModel;
    }
  } else if (!model) {
    model = PROVIDER_DEFAULTS[provider].defaultModel;
  }

  return { provider, endpoint, apiKey, model };
}

export function readLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const timeoutMs = Math.max(1000, Number(env.KONKRED_TIMEOUT_MS) || 45_000);
  const privacy: Privacy = env.KONKRED_PRIVACY === 'strict' ? 'strict' : 'any';
  const cacheDir = env.KONKRED_CACHE_DIR === '' ? null : env.KONKRED_CACHE_DIR || path.join('data', 'ai-cache');
  const cacheTtlMs = Math.max(0, (Number(env.KONKRED_CACHE_TTL_MINUTES) ?? 1440) * 60_000);

  const gatewayKey = env.KONKRED_API_KEY?.trim();
  if (gatewayKey) {
    return {
      gatewayUrl: (env.KONKRED_GATEWAY_URL || 'http://127.0.0.1:3001').replace(/\/+$/, ''),
      apiKey: gatewayKey,
      timeoutMs,
      privacy,
      cacheDir,
      cacheTtlMs,
    };
  }

  // Fallback to direct provider keys injected by AI Studio / VPS .env when KONKRED_API_KEY is not set
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim();
  if (geminiKey) {
    return {
      gatewayUrl: PROVIDER_DEFAULTS.gemini.endpoint,
      apiKey: geminiKey,
      timeoutMs,
      privacy,
      cacheDir,
      cacheTtlMs,
      directCustom: {
        provider: 'gemini',
        endpoint: PROVIDER_DEFAULTS.gemini.endpoint,
        apiKey: geminiKey,
        model: env.GEMINI_MODEL?.trim() || PROVIDER_DEFAULTS.gemini.defaultModel,
      },
    };
  }

  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      gatewayUrl: PROVIDER_DEFAULTS.openrouter.endpoint,
      apiKey: openRouterKey,
      timeoutMs,
      privacy,
      cacheDir,
      cacheTtlMs,
      directCustom: {
        provider: 'openrouter',
        endpoint: PROVIDER_DEFAULTS.openrouter.endpoint,
        apiKey: openRouterKey,
        model: env.OPENROUTER_MODEL?.trim() || PROVIDER_DEFAULTS.openrouter.defaultModel,
      },
    };
  }

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      gatewayUrl: PROVIDER_DEFAULTS.groq.endpoint,
      apiKey: groqKey,
      timeoutMs,
      privacy,
      cacheDir,
      cacheTtlMs,
      directCustom: {
        provider: 'groq',
        endpoint: PROVIDER_DEFAULTS.groq.endpoint,
        apiKey: groqKey,
        model: env.GROQ_MODEL?.trim() || PROVIDER_DEFAULTS.groq.defaultModel,
      },
    };
  }

  const openAIKey = env.OPENAI_API_KEY?.trim();
  if (openAIKey) {
    return {
      gatewayUrl: PROVIDER_DEFAULTS.custom.endpoint,
      apiKey: openAIKey,
      timeoutMs,
      privacy,
      cacheDir,
      cacheTtlMs,
      directCustom: {
        provider: 'custom',
        endpoint: normalizeEndpointBase(env.OPENAI_BASE_URL) || PROVIDER_DEFAULTS.custom.endpoint,
        apiKey: openAIKey,
        model: env.OPENAI_MODEL?.trim() || PROVIDER_DEFAULTS.custom.defaultModel,
      },
    };
  }

  return null;
}

export type LLMErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH'
  | 'AI_RATE_LIMIT'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'AI_BAD_RESPONSE';

export class LLMError extends Error {
  public readonly httpStatus: number;
  public readonly status: number;
  public readonly retryAfterSeconds?: number;

  constructor(
    public readonly code: LLMErrorCode,
    httpStatusOrMessage: number | string,
    messageOrHttpStatus?: string | number,
    retryAfterSeconds?: number,
  ) {
    const resolvedStatus =
      typeof httpStatusOrMessage === 'number'
        ? httpStatusOrMessage
        : typeof messageOrHttpStatus === 'number'
          ? messageOrHttpStatus
          : 502;
    const resolvedMessage =
      typeof httpStatusOrMessage === 'string'
        ? httpStatusOrMessage
        : typeof messageOrHttpStatus === 'string'
          ? messageOrHttpStatus
          : String(code);
    super(resolvedMessage);
    this.httpStatus = resolvedStatus;
    this.status = resolvedStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LLMRequest {
  taskType: TaskType;
  prompt: string;
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
}

export interface LLMResult {
  text: string;
  model: string;
  cached: boolean;
  provider?: string;
}

const MAX_RETRIES = 2;

export async function callLLM(
  req: LLMRequest,
  cfg: LLMConfig | null,
  fetchImpl: typeof fetch = fetch,
  customLLM?: CustomLLMInput | null,
): Promise<LLMResult> {
  const normalizedCustom = normalizeCustomLLM(customLLM) ?? normalizeCustomLLM(cfg?.directCustom);
  const useCustom = Boolean(normalizedCustom);

  if (!useCustom && !cfg) {
    throw new LLMError(
      'AI_NOT_CONFIGURED',
      503,
      'کلید هوش مصنوعی تنظیم نشده است. از بخش «تنظیمات ⬅ اتصال هوش مصنوعی» کلید رایگان (OpenRouter / Groq / Gemini) خود را وارد کنید یا GEMINI_API_KEY / KONKRED_API_KEY را در سرور تنظیم کنید.',
    );
  }

  const effectiveTimeout = cfg?.timeoutMs || 45_000;
  const effectiveCacheDir = cfg?.cacheDir === undefined ? path.join('data', 'ai-cache') : cfg.cacheDir;
  const effectiveCacheTtl = cfg?.cacheTtlMs ?? 1440 * 60_000;

  const modelCacheSalt = normalizedCustom ? `${normalizedCustom.provider}:${normalizedCustom.model}` : 'gateway';
  const cached = req.cacheKey ? readCache(effectiveCacheDir, `${modelCacheSalt}:${req.cacheKey}`, effectiveCacheTtl) : null;
  if (cached) return { ...cached, cached: true, provider: normalizedCustom?.provider ?? 'gateway' };

  // Google Gemini Native API path
  if (normalizedCustom && normalizedCustom.provider === 'gemini') {
    const result = await callGeminiNative(req, normalizedCustom, effectiveTimeout, fetchImpl);
    if (req.cacheKey) writeCache(effectiveCacheDir, `${modelCacheSalt}:${req.cacheKey}`, result);
    return { ...result, cached: false, provider: 'gemini' };
  }

  const isOpenRouter = Boolean(normalizedCustom && normalizedCustom.provider === 'openrouter');
  let url: string;
  let headers: Record<string, string>;

  if (normalizedCustom) {
    const base = normalizeEndpointBase(normalizedCustom.endpoint);
    url = `${base}/chat/completions`;
    headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${normalizedCustom.apiKey}`,
    };
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://konklancer.local';
      headers['X-Title'] = 'KonkLancer Studio';
    }
  } else {
    url = `${cfg!.gatewayUrl}/api/v1/ai/run`;
    headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg!.apiKey}`,
    };
  }

  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.prompt },
  ];

  // Candidate models: for OpenRouter `:free` requests, provide automatic fallback free models if the chosen upstream is overloaded/404.
  const primaryModel = normalizedCustom?.model || 'meta-llama/llama-3.3-70b-instruct:free';
  const modelCandidates =
    isOpenRouter && (primaryModel.endsWith(':free') || primaryModel === 'openrouter/free')
      ? Array.from(
          new Set([
            primaryModel,
            'openrouter/free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen-2.5-72b-instruct:free',
          ]),
        )
      : [primaryModel];

  let lastError: LLMError | null = null;

  for (let mIdx = 0; mIdx < modelCandidates.length; mIdx++) {
    const candidateModel = modelCandidates[mIdx];
    const isLastCandidate = mIdx === modelCandidates.length - 1;

    // Reasoning/free models need enough token headroom to emit final content after chain-of-thought.
    const safeMaxTokens = normalizedCustom
      ? Math.max(req.maxTokens ?? 2048, isOpenRouter || /r1|reason|qwq|o1|o3/i.test(candidateModel) ? 256 : req.maxTokens ?? 256)
      : req.maxTokens;

    const body: Record<string, unknown> = normalizedCustom
      ? {
          model: candidateModel,
          messages,
          temperature: req.temperature ?? 0.3,
          ...(safeMaxTokens ? { max_tokens: safeMaxTokens } : {}),
          ...(req.json && !candidateModel.endsWith(':free') && candidateModel !== 'openrouter/free'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }
      : {
          taskType: req.taskType,
          privacy: cfg!.privacy,
          messages,
          temperature: req.temperature ?? 0.3,
          ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(effectiveTimeout),
        });
      } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        if (!timedOut && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new LLMError(
          timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE',
          504,
          timedOut ? `پاسخ هوش مصنوعی بیش از ${effectiveTimeout}ms طول کشید.` : `ارتباط با سرور هوش مصنوعی برقرار نشد (${e?.message || e}).`,
        );
      }

      if (res.status === 401 || res.status === 403) {
        const errTxt = await safeErrorMessage(res);
        throw new LLMError(
          'AI_AUTH',
          502,
          `کلید API هوش مصنوعی رد شد (HTTP ${res.status})${errTxt ? `: ${errTxt}` : ''}. کلید خود را بررسی کنید.`,
        );
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) || undefined;
        if (attempt < 1) {
          await sleep((retryAfter ? Math.min(retryAfter, 5) : 1) * 1000);
          continue;
        }
        const errTxt = await safeErrorMessage(res);
        lastError = new LLMError(
          'AI_RATE_LIMIT',
          429,
          `سقف درخواست مدل (${candidateModel}) پر شده است.${errTxt ? ` (${errTxt})` : ''}`,
          retryAfter,
        );
        if (!isLastCandidate) break;
        throw lastError;
      }

      if (res.status === 404 && !isLastCandidate) {
        lastError = new LLMError('AI_UNAVAILABLE', 502, `مدل ${candidateModel} در دسترس نیست (HTTP 404).`);
        break;
      }

      if (res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        const detail = await safeErrorMessage(res);
        lastError = new LLMError('AI_UNAVAILABLE', 502, `سرور هوش مصنوعی خطای ${res.status} برگرداند.${detail ? ` (${detail})` : ''}`);
        if (!isLastCandidate) break;
        throw lastError;
      }

      if (!res.ok) {
        const detail = await safeErrorMessage(res);
        lastError = new LLMError(
          'AI_UNAVAILABLE',
          502,
          `پاسخ غیرمنتظره (${res.status}) از سرور هوش مصنوعی.${detail ? ` جزئیات: ${detail}` : ''}`,
        );
        if (!isLastCandidate) break;
        throw lastError;
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new LLMError('AI_BAD_RESPONSE', 502, 'پاسخ JSON معتبر نبود.');
      }

      const model: string = data?.model || candidateModel || 'unknown';
      if (!normalizedCustom && model.startsWith('mock:')) {
        throw new LLMError(
          'AI_UNAVAILABLE',
          503,
          'درگاه Konkred به شبیه‌ساز آفلاین (mock) افتاده است؛ خروجی واقعی نیست و نمایش داده نمی‌شود.',
        );
      }

      const rawMsg = data?.choices?.[0]?.message;
      let text: string | undefined =
        typeof rawMsg?.content === 'string' && rawMsg.content.trim()
          ? rawMsg.content
          : Array.isArray(rawMsg?.content)
            ? rawMsg.content
                .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
                .join('')
            : undefined;

      // Fallback if a reasoning model placed plain answer in reasoning field when max_tokens clipped early
      if ((!text || !text.trim()) && typeof rawMsg?.reasoning === 'string' && rawMsg.reasoning.trim() && !req.json) {
        text = rawMsg.reasoning.trim();
      }

      if (!text || !text.trim()) {
        lastError = new LLMError('AI_BAD_RESPONSE', 502, `پاسخ متنی مدل (${model}) خالی بود.`);
        if (!isLastCandidate) break;
        throw lastError;
      }

      if (req.cacheKey) writeCache(effectiveCacheDir, `${modelCacheSalt}:${req.cacheKey}`, { text, model });
      return { text, model, cached: false, provider: normalizedCustom?.provider ?? 'gateway' };
    }
  }

  throw lastError ?? new LLMError('AI_UNAVAILABLE', 502, 'پاسخی از سرویس هوش مصنوعی دریافت نشد.');
}

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw);
      return parsed?.error?.message || parsed?.message || raw.slice(0, 180);
    } catch {
      return raw.slice(0, 180);
    }
  } catch {
    return '';
  }
}

export interface DiscoveredModel {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

export async function scanModels(
  custom: CustomLLMInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ success: boolean; models: DiscoveredModel[]; defaultModel?: string; detectedProvider?: string; endpoint?: string; error?: string }> {
  const normalized = normalizeCustomLLM(custom);
  if (!normalized) {
    return { success: false, models: [], error: 'کلید API وارد نشده است.' };
  }

  const { provider, endpoint, apiKey } = normalized;

  try {
    // 1. Google Gemini Native Models Scan
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        const err = await safeErrorMessage(res);
        return { success: false, models: [], error: `خطا در احراز هویت Gemini (${res.status}): ${err}` };
      }
      const data: any = await res.json();
      const rawModels: any[] = data?.models || [];
      const models: DiscoveredModel[] = rawModels
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => {
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
        .sort((a, b) => Number(b.isFree) - Number(a.isFree));

      const preferred =
        models.find((m) => m.id === 'gemini-2.5-flash') ||
        models.find((m) => m.id === 'gemini-2.0-flash') ||
        models.find((m) => m.isFree) ||
        models[0];

      return {
        success: true,
        models,
        defaultModel: preferred?.id || 'gemini-2.5-flash',
        detectedProvider: provider,
        endpoint,
      };
    }

    // 2. OpenRouter Models Scan (detect `:free` and pricing === "0")
    if (provider === 'openrouter') {
      const res = await fetchImpl(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const err = await safeErrorMessage(res);
        return { success: false, models: [], error: `خطا از OpenRouter (${res.status}): ${err}` };
      }
      const data: any = await res.json();
      const rawModels: any[] = data?.data || [];
      const models: DiscoveredModel[] = rawModels
        .map((m) => {
          const promptPrice = String(m?.pricing?.prompt ?? '1');
          const completionPrice = String(m?.pricing?.completion ?? '1');
          const isFree =
            (promptPrice === '0' && completionPrice === '0') ||
            String(m.id).endsWith(':free') ||
            String(m.id) === 'openrouter/free';
          return {
            id: m.id,
            name: `${m.name || m.id}${isFree ? ' [رایگان / Free]' : ''}`,
            isFree,
            contextLength: m.context_length,
            description: m.description,
          };
        })
        .sort((a, b) => {
          if (a.isFree !== b.isFree) return Number(b.isFree) - Number(a.isFree);
          return a.name.localeCompare(b.name);
        });

      const preferred =
        models.find((m) => m.isFree && m.id.includes('llama-3.3-70b')) ||
        models.find((m) => m.isFree && m.id.includes('qwen')) ||
        models.find((m) => m.isFree && m.id.includes('gemini')) ||
        models.find((m) => m.isFree) ||
        models[0];

      return {
        success: true,
        models,
        defaultModel: preferred?.id,
        detectedProvider: provider,
        endpoint,
      };
    }

    // 3. Groq / OpenAI / Compatible Endpoint Scan
    const res = await fetchImpl(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await safeErrorMessage(res);
      return { success: false, models: [], error: `خطا در اسکن مدل‌ها (${res.status}): ${err}` };
    }
    const data: any = await res.json();
    const rawModels: any[] = data?.data || (Array.isArray(data) ? data : []);
    const isGroq = provider === 'groq';
    const models: DiscoveredModel[] = rawModels.map((m) => {
      const id = typeof m === 'string' ? m : m.id || m.name;
      return {
        id,
        name: `${id}${isGroq ? ' [رایگان در پلن Groq / Free Tier]' : ''}`,
        isFree: isGroq,
        contextLength: m?.context_window || m?.context_length,
      };
    });

    const preferred =
      models.find((m) => m.id.includes('llama-3.3-70b')) ||
      models.find((m) => m.id.includes('gpt-4o-mini')) ||
      models[0];

    return {
      success: true,
      models,
      defaultModel: preferred?.id,
      detectedProvider: provider,
      endpoint,
    };
  } catch (e: any) {
    return {
      success: false,
      models: [],
      error: `عدم برقراری ارتباط با Endpoint: ${e?.message || e}`,
    };
  }
}

async function callGeminiNative(
  req: LLMRequest,
  custom: Required<CustomLLMInput>,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ text: string; model: string }> {
  const modelName = sanitizeModelId(custom.model).replace(/^models\//, '') || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(custom.apiKey)}`;

  // Prevent Gemini 2.5 thinking tokens from consuming the entire small maxOutputTokens budget (e.g. maxTokens: 60 / 64).
  const isFlash25 = modelName.startsWith('gemini-2.5-flash');
  const generationConfig: Record<string, unknown> = {
    temperature: req.temperature ?? 0.3,
    maxOutputTokens: Math.max(req.maxTokens ?? 2048, 512),
    ...(req.json ? { responseMimeType: 'application/json' } : {}),
    ...(isFlash25 && (req.maxTokens ?? 2048) <= 256 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  };

  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    generationConfig,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e: any) {
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      if (!timedOut && attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new LLMError(
        timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE',
        504,
        timedOut ? `پاسخ Gemini بیش از ${timeoutMs}ms طول کشید.` : `عدم ارتباط با Gemini (${e?.message || e}).`,
      );
    }

    if (res.status === 401 || res.status === 403 || res.status === 400) {
      const errTxt = await safeErrorMessage(res);
      if (res.status === 400 && !errTxt.toLowerCase().includes('api key')) {
        throw new LLMError('AI_UNAVAILABLE', 502, `خطای پارامتر Gemini (${modelName}): ${errTxt}`);
      }
      throw new LLMError('AI_AUTH', 502, `کلید API گوگل Gemini نامعتبر است یا دسترسی ندارد: ${errTxt}`);
    }

    if (res.status === 429) {
      if (attempt < 1) {
        await sleep(1000);
        continue;
      }
      throw new LLMError('AI_RATE_LIMIT', 429, 'سقف رایگان Gemini موقتاً پر شده است؛ چند ثانیه صبر کنید.');
    }

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(backoffMs(attempt));
      continue;
    }

    if (!res.ok) {
      const errTxt = await safeErrorMessage(res);
      throw new LLMError('AI_UNAVAILABLE', 502, `خطای Gemini (${res.status}): ${errTxt}`);
    }

    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => !p?.thought && typeof p?.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim();

    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '';
      throw new LLMError(
        'AI_BAD_RESPONSE',
        502,
        `Gemini پاسخ متنی خالی برگرداند${blockReason ? ` (${blockReason})` : ''}.`,
      );
    }

    return { text, model: modelName };
  }

  throw new LLMError('AI_UNAVAILABLE', 502, 'پاسخی از Gemini دریافت نشد.');
}

// Models frequently wrap JSON in ```json fences or add a sentence around it even with json mode.
export function parseJsonLoose<T = any>(raw: string): T | null {
  const trimmed = raw.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  for (const candidate of [unfenced, sliceFirstObject(unfenced)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

function sliceFirstObject(s: string): string | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  return start >= 0 && end > start ? s.slice(start, end + 1) : null;
}

function cachePath(dir: string, key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return path.join(dir, `${hash}.json`);
}

function readCache(dir: string | null, key: string, ttlMs: number): { text: string; model: string } | null {
  if (!dir || ttlMs <= 0) return null;
  try {
    const file = cachePath(dir, key);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (typeof parsed?.text === 'string' && typeof parsed?.model === 'string') return parsed;
  } catch {
    /* miss */
  }
  return null;
}

function writeCache(dir: string | null, key: string, value: { text: string; model: string }): void {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath(dir, key), JSON.stringify(value), 'utf-8');
  } catch {
    /* cache is best-effort */
  }
}

const backoffMs = (attempt: number) => 400 * Math.pow(2, attempt);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
