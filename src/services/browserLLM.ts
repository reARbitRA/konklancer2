import { callGatewayAI, readManagedModel } from './managedLLM';
import { Capacitor } from '@capacitor/core';
import { AIAnalysis, FreelanceJob } from '../types';
import {
  ActiveCustomLLM,
  getOrderedVaultCandidates,
  readStoredCustomLLM,
  switchActiveKeyOrModel,
} from '../utils/customLLMClient';
import { categoryPromptList } from '../../shared/taxonomy';
import {
  analysisPrompt, proposalPrompt, triagePrompt,
  type AiTask, type PromptPack,
} from '../../shared/prompts';

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

/** Direct browser-to-provider request. No Konkred or Supabase relay is used. */
export async function smartFetchLLM(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = 60_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers || {},
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('زمان اتصال به سرویس هوش مصنوعی پایان یافت. ورودی شما حفظ شده است؛ دوباره تلاش کنید.');
    }
    // Network errors can include provider URLs and credentials (e.g. Gemini query keys).
    throw new Error('Failed to fetch: اتصال به سرویس برقرار نشد. شبکه، CORS و آدرس سرویس را بررسی کنید.');
  } finally {
    clearTimeout(timer);
  }
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

// Provider payloads may echo credentials or prompts. Never display them in the UI.
async function safeReadError(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403) return 'کلید یا دسترسی سرویس را بررسی کنید.';
  if (res.status === 402) return 'اعتبار یا وضعیت پرداخت سرویس را بررسی کنید.';
  if (res.status === 404) return 'مدل یا آدرس سرویس پیدا نشد؛ شناسه مدل و دسترسی حساب را بررسی کنید.';
  if (res.status === 429) return 'سهمیه یا محدودیت درخواست سرویس تمام شده است؛ کمی بعد دوباره تلاش کنید.';
  if (res.status >= 500) return 'سرویس موقتاً در دسترس نیست؛ دوباره تلاش کنید.';
  return 'تنظیمات مدل و درخواست را بررسی کنید.';
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

export interface BrowserLLMOptions {
  prompt: string;
  systemPrompt?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** SPEC-013 task routing hint for the gateway (triage/analysis/proposal/code/...). */
  task?: AiTask;
  overrideConfig?: Partial<ActiveCustomLLM>;
}

/**
 * SPEC-013 call order (one path, no warning spam):
 *  1) explicit override profile (Settings "test this device key") -> direct, as before;
 *  2) personal gateway `/api/ai` (server-side keys outside Iran, Auto free routing or picked model);
 *  3) device-stored direct keys, only as offline/APK fallback;
 *  4) one clear error. Output is never fabricated.
 */
export async function callBrowserLLM(opts: BrowserLLMOptions): Promise<{ text: string; model: string; provider: string; keyLabel?: string }> {
  const candidates = getOrderedVaultCandidates(opts.overrideConfig)
    .map((candidate) => resolveClientLLMConfig(candidate))
    .filter((candidate): candidate is ActiveCustomLLM => Boolean(candidate));

  let gatewayError: Error | null = null;
  if (!opts.overrideConfig) {
    try {
      const managed = readManagedModel();
      const r = await callGatewayAI({
        task: opts.task || 'general',
        prompt: opts.prompt,
        systemPrompt: opts.systemPrompt,
        json: opts.json,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        model: managed,
      });
      return { text: r.text, model: r.model, provider: r.provider };
    } catch (error) {
      gatewayError = error instanceof Error ? error : new Error(String(error));
      if (candidates.length === 0) throw gatewayError;
      // Device keys exist: fall through and try them before giving up.
    }
  }

  if (candidates.length === 0) {
    throw gatewayError || new Error('درگاه AI در دسترس نیست و کلید مستقیمی روی این دستگاه ذخیره نشده است. نسخه وبِ مستقرشده را باز کنید یا در تنظیمات، «کلید مستقیم روی دستگاه» را به‌عنوان پشتیبان وارد کنید.');
  }

  let lastError: Error | null = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const config = candidates[index];
    try {
      const result = await executeSingleKeyCall(config, opts);
      if (index > 0 && config.id && !opts.overrideConfig) switchActiveKeyOrModel(config.id);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw gatewayError || lastError || new Error('درخواست AI ناموفق بود.');
}

/** Run a SPEC-013 prompt-library pack through the same single path. */
export async function callPromptPack(
  pack: PromptPack,
  overrides?: Partial<BrowserLLMOptions>,
): Promise<{ text: string; model: string; provider: string; keyLabel?: string }> {
  return callBrowserLLM({
    prompt: pack.user,
    systemPrompt: pack.system,
    task: pack.task,
    json: pack.json,
    temperature: pack.temperature,
    maxTokens: pack.maxTokens,
    ...overrides,
  });
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

const clampScore = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
};
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : undefined;

export async function analyzeJobDirect(job: FreelanceJob): Promise<AIAnalysis & { model: string }> {
  const llm = await callPromptPack(analysisPrompt(job));
  const parsed = parseJsonLooseClient<any>(llm.text);
  if (!parsed || typeof parsed !== 'object') {
    // Never fabricate an analysis (SPEC-013): a malformed model answer is an error, not a default score.
    throw new Error('پاسخ مدل ساختار تحلیل معتبر نداشت؛ دوباره تلاش کنید یا از سوییچر مدل، مدل دیگری انتخاب کنید.');
  }
  const recommendedBidRaw = Number(parsed.recommendedBid);
  const recommendedBid = Number.isFinite(recommendedBidRaw) && recommendedBidRaw > 0
    ? Math.round(recommendedBidRaw)
    : job.budget ? Math.round(job.budget * 0.9) : 3_500_000;
  const pr = parsed.priceRange && typeof parsed.priceRange === 'object' ? parsed.priceRange : null;
  const eh = parsed.effortHours && typeof parsed.effortHours === 'object' ? parsed.effortHours : null;

  return {
    model: llm.model,
    automatabilityScore: clampScore(parsed.automatabilityScore) ?? clampScore(parsed.aiDoablePercent) ?? 50,
    aiDoablePercent: clampScore(parsed.aiDoablePercent),
    clarityScore: clampScore(parsed.clarityScore),
    goNoGo: parsed.goNoGo === 'caution' || parsed.goNoGo === 'no-go' ? parsed.goNoGo : 'go',
    recommendedBid,
    recommendedBidFormatted: `${recommendedBid.toLocaleString('fa-IR')} تومان`,
    priceRange: pr ? {
      min: Number(pr.min) || recommendedBid,
      max: Number(pr.max) || recommendedBid,
      walkAway: Number(pr.walkAway) || Math.round(recommendedBid * 0.7),
    } : undefined,
    effortHours: eh ? { ai: Number(eh.ai) || 0, humanReview: Number(eh.humanReview) || 0 } : undefined,
    suggestedDuration: typeof parsed.suggestedDuration === 'string' && parsed.suggestedDuration.trim() ? parsed.suggestedDuration : 'نامشخص — پس از پاسخ سؤال‌های شفاف‌ساز',
    technicalStack: strArray(parsed.technicalStack) || [],
    deliverables: strArray(parsed.deliverables),
    feasibilityReason: typeof parsed.feasibilityReason === 'string' ? parsed.feasibilityReason : '',
    hiddenRequirements: strArray(parsed.hiddenRequirements),
    redFlags: strArray(parsed.redFlags),
    clarifyingQuestions: strArray(parsed.clarifyingQuestions),
    assumptions: strArray(parsed.assumptions),
    riskLevel: parsed.riskLevel === 'high' || parsed.riskLevel === 'medium' ? parsed.riskLevel : 'low',
    winProbability: typeof parsed.winProbability === 'string' && parsed.winProbability.trim() ? parsed.winProbability : 'نامشخص',
    competitionNote: typeof parsed.competitionNote === 'string' ? parsed.competitionNote : undefined,
    suggestedKicker: typeof parsed.suggestedKicker === 'string' ? parsed.suggestedKicker : '',
    proposalAngle: typeof parsed.proposalAngle === 'string' ? parsed.proposalAngle : undefined,
  };
}

export async function generateProposalDirect(
  job: FreelanceJob,
  tone: string,
  budget: number,
): Promise<{
  proposal: string;
  shortProposal?: string;
  proposedPrice: number;
  deliveryTime: string;
  clarifyingQuestion?: string;
  milestones?: Array<{ title: string; deliverable: string; days: number }>;
  model: string;
}> {
  const targetPrice = budget || job.aiAnalysis?.recommendedBid || (job.budget ? Math.round(job.budget * 0.9) : 3_500_000);
  const llm = await callPromptPack(proposalPrompt(job, {
    tone,
    targetPrice,
    analysis: job.aiAnalysis ? {
      suggestedKicker: job.aiAnalysis.suggestedKicker,
      deliverables: job.aiAnalysis.deliverables,
      clarifyingQuestions: job.aiAnalysis.clarifyingQuestions,
      suggestedDuration: job.aiAnalysis.suggestedDuration,
    } : undefined,
  }));
  const parsed = parseJsonLooseClient<any>(llm.text) ?? {};
  return {
    model: llm.model,
    proposal: typeof parsed.proposal === 'string' && parsed.proposal.trim() ? parsed.proposal : llm.text,
    shortProposal: typeof parsed.shortProposal === 'string' ? parsed.shortProposal : undefined,
    proposedPrice: Number(parsed.proposedPrice) || targetPrice,
    deliveryTime: typeof parsed.deliveryTime === 'string' && parsed.deliveryTime.trim() ? parsed.deliveryTime : (job.aiAnalysis?.suggestedDuration || 'طبق توافق در چت'),
    clarifyingQuestion: typeof parsed.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion : undefined,
    milestones: Array.isArray(parsed.milestones)
      ? parsed.milestones.filter((m: any) => m && typeof m.title === 'string').map((m: any) => ({ title: m.title, deliverable: String(m.deliverable || ''), days: Number(m.days) || 1 }))
      : undefined,
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
  // Gateway-first (SPEC-013): works with zero device keys; any failure degrades to tags.
  try {
    const llm = await callPromptPack(triagePrompt({ title, description }, categoryPromptList()));
    const parsed = parseJsonLooseClient<any>(llm.text);
    return typeof parsed?.category === 'string' && parsed.category ? parsed.category : tags[0] || 'other';
  } catch {
    return tags[0] || 'other';
  }
}
