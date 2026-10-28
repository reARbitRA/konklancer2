// SPEC-006: every production LLM request goes through the Konkred gateway.
// Provider selection, keys, quotas, failover, caching, and model routing belong
// to the gateway; Konklancer stores only the gateway credential on its server.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type TaskType = 'extraction' | 'summarization' | 'general' | 'code-generation';
export type Privacy = 'any' | 'strict';

export interface LLMConfig {
  gatewayUrl: string;
  apiKey: string;
  timeoutMs: number;
  privacy: Privacy;
  cacheDir: string | null;
  cacheTtlMs: number;
}

export function readLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const apiKey = env.KONKRED_API_KEY?.trim();
  if (!apiKey) return null;

  const timeoutMs = Math.max(1_000, Number(env.KONKRED_TIMEOUT_MS) || 45_000);
  const privacy: Privacy = env.KONKRED_PRIVACY === 'strict' ? 'strict' : 'any';
  const cacheDir = env.KONKRED_CACHE_DIR === '' ? null : env.KONKRED_CACHE_DIR || path.join('data', 'ai-cache');
  const configuredTtlMinutes = Number(env.KONKRED_CACHE_TTL_MINUTES);
  const cacheTtlMs = Math.max(0, (Number.isFinite(configuredTtlMinutes) ? configuredTtlMinutes : 1_440) * 60_000);

  return {
    gatewayUrl: (env.KONKRED_GATEWAY_URL || 'https://api.konkred.xyz').trim().replace(/\/+$/, ''),
    apiKey,
    timeoutMs,
    privacy,
    cacheDir,
    cacheTtlMs,
  };
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
    this.name = 'LLMError';
    this.httpStatus = resolvedStatus;
    this.status = resolvedStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LLMRequest {
  taskType: TaskType;
  user: string;
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
  privacy?: Privacy;
}

export interface LLMResult {
  text: string;
  model: string;
  cached: boolean;
  provider?: string;
  attempts: number;
}

const MAX_RETRIES = 1;
const GATEWAY_MODELS_TIMEOUT_MS = 15_000;

export async function callLLM(
  req: LLMRequest,
  cfg: LLMConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<LLMResult> {
  if (!cfg) {
    throw new LLMError(
      'AI_NOT_CONFIGURED',
      503,
      'درگاه هوش مصنوعی تنظیم نشده است؛ KONKRED_GATEWAY_URL و KONKRED_API_KEY را در محیط امن سرور تنظیم کنید.',
    );
  }
  if (!isTaskType(req.taskType) || typeof req.user !== 'string' || !req.user.trim()) {
    throw new LLMError('AI_BAD_RESPONSE', 400, 'درخواست هوش مصنوعی معتبر نیست.');
  }

  const effectiveCacheDir = cfg.cacheDir === undefined ? path.join('data', 'ai-cache') : cfg.cacheDir;
  const effectiveCacheTtl = cfg.cacheTtlMs ?? 1_440 * 60_000;
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${req.taskType}\0${req.system ?? ''}\0${req.user}\0${req.json ? 'json' : 'text'}`)
    .digest('hex');
  const cacheKey = `${req.taskType}:${req.cacheKey ?? ''}:${fingerprint}`;
  const cached = readCache(effectiveCacheDir, cacheKey, effectiveCacheTtl);
  if (cached) return { ...cached, cached: true, provider: 'gateway', attempts: 0 };

  const url = `${cfg.gatewayUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.user },
  ];
  const payload = {
    taskType: req.taskType,
    privacy: req.privacy ?? cfg.privacy,
    messages,
    temperature: req.temperature ?? 0.3,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (error: any) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new LLMError(
        timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE',
        timedOut ? 504 : 502,
        timedOut
          ? `پاسخ درگاه هوش مصنوعی بیش از ${cfg.timeoutMs} میلی‌ثانیه طول کشید.`
          : `ارتباط با درگاه هوش مصنوعی برقرار نشد (${error?.message || error}).`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await safeErrorMessage(response);
      throw new LLMError(
        'AI_AUTH',
        401,
        `اعتبار دسترسی به درگاه Konkred رد شد${detail ? `: ${detail}` : ''}. تنظیم KONKRED_API_KEY را بررسی کنید.`,
      );
    }

    if (response.status === 429) {
      const detail = await readErrorPayload(response);
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), detail?.retryAfterSec);
      if (attempt < MAX_RETRIES) {
        await sleep(retryAfter * 1_000);
        continue;
      }
      throw new LLMError(
        'AI_RATE_LIMIT',
        429,
        detail?.message || 'سقف درخواست درگاه هوش مصنوعی پر شده است.',
        retryAfter,
      );
    }

    if (response.status >= 500) {
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const detail = await safeErrorMessage(response);
      throw new LLMError(
        'AI_UNAVAILABLE',
        502,
        `درگاه هوش مصنوعی خطای ${response.status} برگرداند${detail ? `: ${detail}` : ''}.`,
      );
    }

    if (!response.ok) {
      const detail = await safeErrorMessage(response);
      throw new LLMError(
        'AI_UNAVAILABLE',
        502,
        `پاسخ غیرمنتظره (${response.status}) از درگاه هوش مصنوعی${detail ? `: ${detail}` : ''}.`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new LLMError('AI_BAD_RESPONSE', 502, 'پاسخ درگاه Konkred JSON معتبر نبود.');
    }

    const model = typeof data?.model === 'string' && data.model.trim() ? data.model.trim() : 'unknown';
    const provider = typeof data?.provider === 'string' ? data.provider.toLowerCase() : '';
    if (model.toLowerCase().startsWith('mock:') || provider === 'mock') {
      throw new LLMError(
        'AI_UNAVAILABLE',
        503,
        'درگاه Konkred فقط پاسخ شبیه‌ساز آفلاین برگرداند؛ این خروجی به‌عنوان تحلیل نمایش داده نمی‌شود.',
      );
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part: any) => typeof part === 'string' ? part : part?.text || '').join('').trim()
        : '';
    if (!text) throw new LLMError('AI_BAD_RESPONSE', 502, `پاسخ متنی مدل (${model}) خالی بود.`);

    const result = { text, model, cached: false, provider: provider || providerFromModel(model), attempts: attempt + 1 };
    writeCache(effectiveCacheDir, cacheKey, result);
    return result;
  }

  throw new LLMError('AI_UNAVAILABLE', 502, 'پاسخی از درگاه هوش مصنوعی دریافت نشد.');
}

export interface DiscoveredModel {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

/** Models are discovered from the gateway, but selection remains its job. */
export async function scanModels(
  cfg: LLMConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ success: boolean; models: DiscoveredModel[]; error?: string }> {
  if (!cfg) return { success: false, models: [], error: 'درگاه Konkred تنظیم نشده است.' };
  try {
    const response = await fetchImpl(`${cfg.gatewayUrl.replace(/\/+$/, '')}/v1/models`, {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(GATEWAY_MODELS_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await safeErrorMessage(response);
      return { success: false, models: [], error: `خطای درگاه (${response.status}): ${detail}` };
    }
    const data: any = await response.json();
    const rawModels: any[] = Array.isArray(data?.data) ? data.data : [];
    return {
      success: true,
      models: rawModels
        .filter((model) => typeof model?.id === 'string')
        .map((model) => ({ id: model.id, name: model.id, isFree: false })),
    };
  } catch (error: any) {
    return { success: false, models: [], error: error?.message || 'عدم ارتباط با درگاه Konkred.' };
  }
}

async function readErrorPayload(response: Response): Promise<{ message?: string; retryAfterSec?: number }> {
  try {
    const payload: any = await response.clone().json();
    return {
      message: payload?.error?.message || payload?.message,
      retryAfterSec: Number(payload?.error?.retryAfterSec ?? payload?.retryAfterSec) || undefined,
    };
  } catch {
    return {};
  }
}

async function safeErrorMessage(response: Response): Promise<string> {
  const detail = await readErrorPayload(response);
  if (detail.message) return detail.message.slice(0, 240);
  try {
    return (await response.clone().text()).slice(0, 240);
  } catch {
    return '';
  }
}

function parseRetryAfter(headerValue: string | null, bodyValue?: number): number {
  const headerSeconds = headerValue ? Number(headerValue) : Number.NaN;
  const selected = Number.isFinite(headerSeconds) && headerSeconds >= 0 ? headerSeconds : Number(bodyValue);
  return Number.isFinite(selected) && selected >= 0 ? Math.min(60, selected) : 1;
}

function isTaskType(value: string): value is TaskType {
  return value === 'extraction' || value === 'summarization' || value === 'general' || value === 'code-generation';
}

function providerFromModel(model: string): string {
  const separator = model.indexOf(':');
  return separator > 0 ? model.slice(0, separator) : 'gateway';
}

// Models frequently wrap JSON in ```json fences or add a sentence around it even with JSON mode.
export function parseJsonLoose<T = any>(raw: string): T | null {
  const trimmed = raw.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  for (const candidate of [unfenced, sliceFirstObject(unfenced)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function sliceFirstObject(source: string): string | null {
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  return start >= 0 && end > start ? source.slice(start, end + 1) : null;
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
    // Cache miss.
  }
  return null;
}

function writeCache(dir: string | null, key: string, value: { text: string; model: string; cached?: boolean; provider?: string }): void {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath(dir, key), JSON.stringify(value), 'utf-8');
  } catch {
    // Cache is best-effort; inference should still succeed.
  }
}

const backoffMs = (attempt: number) => 400 * Math.pow(2, attempt);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
