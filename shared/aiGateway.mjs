// SPEC-013 — Personal AI gateway core (zero dependencies, plain ESM).
// Used by api/ai.js (Vercel), api/models.js (compat shim) and server.ts (Express /api/ai).
// Server-side only: provider keys live in env vars, are never returned, logged, or echoed in errors.
import { randomUUID, timingSafeEqual } from 'node:crypto';

/* ============================== Provider registry ============================== */
// Adding a new OpenAI-compatible provider = one line here.
// tier: 'free-pool' | 'free-tier' | 'free' | 'free-credits' | 'paid-cheap' | 'subscription' | 'keyless'
// freeTier: models are reachable on a no-cost tier of the owner's account (routing hint only;
//           priceCategory stays honest per-model, see classifyModel).
export const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', kind: 'openai', tier: 'free-pool', freeTier: true,
    envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS'],
    curated: [
      { id: 'openrouter/free', name: 'OpenRouter Free Router' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', context: 131072 },
      { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', context: 262144 },
      { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (free)', context: 131072 },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', context: 163840 },
      { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (free)', context: 131072 },
    ] },
  { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', kind: 'openai', tier: 'free-tier', freeTier: true, jsonNative: true,
    envKeys: ['GROQ_API_KEY', 'GROQ_API_KEYS'],
    curated: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', context: 131072 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: 131072 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', context: 131072 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', context: 131072 },
    ] },
  { id: 'cerebras', label: 'Cerebras', base: 'https://api.cerebras.ai/v1', kind: 'openai', tier: 'free-tier', freeTier: true, jsonNative: true,
    envKeys: ['CEREBRAS_API_KEY', 'CEREBRAS_API_KEYS'],
    curated: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', context: 131072 },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', context: 131072 },
      { id: 'qwen-3-32b', name: 'Qwen3 32B', context: 131072 },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B', context: 131072 },
    ] },
  { id: 'gemini', label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini', tier: 'free-tier', freeTier: true,
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY_P1', 'GEMINI_KEY_P2', 'GEMINI_KEY_P3', 'GEMINI_API_KEYS'],
    curated: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1048576 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', context: 1048576 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1048576 },
      { id: 'gemma-3-27b-it', name: 'Gemma 3 27B', context: 131072 },
    ], imageModels: ['gemini-2.5-flash-image'] },
  { id: 'agnes', label: 'Agnes AI', base: 'https://apihub.agnes-ai.com/v1', kind: 'openai', tier: 'free', freeTier: true, allFree: true,
    envKeys: ['AGNES_API_KEY', 'AGNES_API_KEYS'],
    curated: [
      { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash', context: 524288 },
      { id: 'agnes-2.0-flash', name: 'Agnes 2.0 Flash', context: 1048576 },
    ], imageModels: ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'] },
  { id: 'mistral', label: 'Mistral', base: 'https://api.mistral.ai/v1', kind: 'openai', tier: 'free-tier', freeTier: true, jsonNative: true,
    envKeys: ['MISTRAL_API_KEY', 'MISTRAL_API_KEYS'],
    curated: [
      { id: 'mistral-small-latest', name: 'Mistral Small', context: 131072 },
      { id: 'codestral-latest', name: 'Codestral', context: 256000 },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo', context: 131072 },
      { id: 'magistral-small-latest', name: 'Magistral Small (reasoning)', context: 131072 },
    ] },
  { id: 'huggingface', label: 'Hugging Face', base: 'https://router.huggingface.co/v1', kind: 'openai', tier: 'free-credits', freeTier: true,
    envKeys: ['HUGGINGFACE_API_KEY', 'HF_TOKEN', 'HUGGING_FACE_API_KEY'],
    curated: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (HF)', context: 131072 },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen2.5 Coder 32B (HF)', context: 131072 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (HF)', context: 163840 },
    ] },
  { id: 'github', label: 'GitHub Models', base: 'https://models.github.ai/inference', kind: 'openai', tier: 'free-tier', freeTier: true,
    envKeys: ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN'],
    curated: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini (GitHub)', context: 131072 },
      { id: 'meta/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (GitHub)', context: 131072 },
    ] },
  { id: 'nvidia', label: 'NVIDIA NIM', base: 'https://integrate.api.nvidia.com/v1', kind: 'openai', tier: 'free-credits', freeTier: true,
    envKeys: ['NVIDIA_API_KEY'],
    curated: [
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (NVIDIA)', context: 131072 },
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1 (NVIDIA)', context: 131072 },
    ] },
  { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', kind: 'openai', tier: 'paid-cheap', freeTier: false, jsonNative: true,
    envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEYS'],
    curated: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', context: 131072 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', context: 131072 },
    ] },
  { id: 'fireworks', label: 'Fireworks', base: 'https://api.fireworks.ai/inference/v1', kind: 'openai', tier: 'paid-cheap', freeTier: false, jsonNative: true,
    envKeys: ['FIREWORKS_API_KEY', 'FIREWORK_API_KEY', 'FIREWORKS_API_KEYS'],
    curated: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B (Fireworks)', context: 131072 },
      { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3 (Fireworks)', context: 163840 },
    ] },
  { id: 'apmix', label: 'ApMix', base: 'https://api.apmix.ai/v1', kind: 'openai', tier: 'subscription', freeTier: false,
    envKeys: ['APMIX_API_KEY', 'APIMIX_API_KEY'],
    curated: [] }, // plan-scoped catalog: discovery only
  { id: 'pollinations', label: 'Pollinations (keyless)', base: 'https://text.pollinations.ai/openai', kind: 'openai', tier: 'keyless', freeTier: true, allFree: true, keyless: true, lastResort: true,
    envKeys: [],
    curated: [{ id: 'openai', name: 'Pollinations OpenAI (keyless)' }] },
];
export const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/* ============================== Task profiles ============================== */
export const TASK_PROFILES = {
  triage:      { temperature: 0.1,  maxTokens: 900,  caps: ['fast'], timeoutMs: 30_000 },
  analysis:    { temperature: 0.3,  maxTokens: 2800, caps: ['reasoning', 'long-context'], timeoutMs: 50_000 },
  proposal:    { temperature: 0.55, maxTokens: 2600, caps: ['writing'], timeoutMs: 50_000 },
  code:        { temperature: 0.2,  maxTokens: 8192, caps: ['code', 'reasoning'], timeoutMs: 55_000 },
  writing:     { temperature: 0.6,  maxTokens: 6000, caps: ['writing', 'long-context'], timeoutMs: 55_000 },
  translation: { temperature: 0.3,  maxTokens: 6000, caps: ['writing', 'long-context'], timeoutMs: 55_000 },
  slides:      { temperature: 0.45, maxTokens: 5000, caps: ['writing'], timeoutMs: 55_000 },
  'image-prompt': { temperature: 0.7, maxTokens: 1400, caps: ['vision', 'writing'], timeoutMs: 40_000 },
  qa:          { temperature: 0.2,  maxTokens: 3200, caps: ['reasoning'], timeoutMs: 50_000 },
  reasoning:   { temperature: 0.3,  maxTokens: 6000, caps: ['reasoning'], timeoutMs: 55_000 },
  general:     { temperature: 0.4,  maxTokens: 3000, caps: [], timeoutMs: 50_000 },
};
export function taskProfile(task) {
  return TASK_PROFILES[task] || TASK_PROFILES.general;
}

export class GatewayError extends Error {
  constructor(code, status, messageFa, attempts = []) {
    super(messageFa);
    this.code = code; this.status = status; this.attempts = attempts;
  }
}

/* ============================== Keys & auth ============================== */
const splitKeys = (v) => String(v || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

/** All keys configured for a provider, incl. `*_API_KEYS` lists and numbered `_2`/`_P2` extras. */
export function collectKeys(provider, env = process.env) {
  if (provider.keyless) return ['']; // single placeholder "key" so rotation logic still works
  const out = [];
  const push = (v) => { for (const k of splitKeys(v)) if (!out.includes(k)) out.push(k); };
  for (const name of provider.envKeys) push(env[name]);
  // numbered extras: e.g. OPENROUTER_API_KEY_2, GEMINI_KEY_P4
  const stems = [...new Set(provider.envKeys.map((n) => n.replace(/_(P?\d+|KEYS)$/i, '')))];
  for (const name of Object.keys(env)) {
    if (stems.some((s) => name.startsWith(`${s}_`)) && /_(P?\d+)$/i.test(name)) push(env[name]);
  }
  return out;
}

export function configuredProviders(env = process.env) {
  return PROVIDERS.filter((p) => (env.AI_DISABLE_KEYLESS !== '1' || !p.keyless) && collectKeys(p, env).length > 0);
}

const OWNER_TOKEN_NAMES = ['KONKLANCER_OWNER_TOKEN', 'AI_GATEWAY_TOKEN', 'KONKLANCER_API_TOKEN'];
export function ownerToken(env = process.env) {
  for (const n of OWNER_TOKEN_NAMES) {
    const v = String(env[n] || '').trim();
    if (v.length >= 8) return v;
  }
  return '';
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
/** Single-owner gate. No token configured -> open personal mode (free-only auto-routing). */
export function checkOwner(headers = {}, env = process.env) {
  const expected = ownerToken(env);
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v;
  const presented = String(h['x-owner-token'] || h['x-api-token'] || (/^Bearer (\S+)$/.exec(String(h.authorization || ''))?.[1] ?? '')).trim();
  if (!expected) return { ok: true, mode: 'open', authenticated: false };
  const ok = presented.length >= 8 && safeEqual(presented, expected);
  return { ok, mode: 'token', authenticated: ok };
}

/** Health: booleans and counts only — never values. */
export function gatewayHealth(env = process.env) {
  const providers = PROVIDERS.map((p) => {
    const keys = p.keyless ? 0 : collectKeys(p, env).length;
    return { provider: p.id, label: p.label, tier: p.tier, configured: p.keyless ? env.AI_DISABLE_KEYLESS !== '1' : keys > 0, keyCount: keys };
  });
  return {
    ok: true,
    authMode: ownerToken(env) ? 'owner-token' : 'open-personal',
    configuredCount: providers.filter((p) => p.configured && p.provider !== 'pollinations').length,
    providers,
  };
}

/* ============================== Model classification ============================== */
const NON_CHAT = /(embed|embedding|whisper|asr|transcrib|tts|text-to-speech|speech-|rerank|moderation|guard|bge-|e5-|clip|ocr$)/i;
const IMAGE_GEN = /(image|flux|stable-diffusion|sdxl|sd3|dall|midjourney|imagen|seedream|ideogram|recraft)/i;

export function parameterBillions(id = '') {
  const s = String(id).toLowerCase();
  if (/\d+x\d+(?:\.\d+)?b/.test(s)) return null; // MoE marketing counts
  const m = s.match(/(?:^|[\/_:.-])(\d{1,3}(?:\.\d+)?)b(?:$|[\/_:.-])/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function capabilitiesFor(id = '', raw = {}) {
  const s = String(id).toLowerCase();
  const caps = new Set();
  const inputMods = raw?.architecture?.input_modalities;
  if (Array.isArray(inputMods) && inputMods.includes('image')) caps.add('vision');
  if (/vision|[-_/]vl[-_/]|qwen[0-9.]*-vl|llava|pixtral|gemini|gemma-3|gpt-4o|claude|agnes/.test(s)) caps.add('vision');
  if (/coder|codestral|devstral|deepseek|qwen|starcoder|code/.test(s)) caps.add('code');
  if (/r1|reason|thinking|qwq|(^|[\/_-])o[134]([\/_-]|$)|gpt-oss|magistral|deepseek-r/.test(s)) caps.add('reasoning');
  if (/flash|instant|lite|mini|haiku|small|8b|7b|nemo|turbo/.test(s)) caps.add('fast');
  const ctx = Number(raw?.context_length ?? raw?.context_window ?? raw?.max_model_len ?? raw?.inputTokenLimit ?? 0) || 0;
  if (ctx >= 200_000) caps.add('long-context');
  caps.add('writing'); // any chat model writes; size scoring differentiates quality
  return [...caps];
}

export function classifyModel(provider, raw = {}) {
  if (!raw || (typeof raw !== 'object' && typeof raw !== 'string')) return null;
  if (typeof raw === 'string') raw = { id: raw };
  const id = provider.kind === 'gemini'
    ? String(raw.name || raw.id || '').replace(/^models\//, '')
    : String(typeof raw === 'string' ? raw : raw.id || '');
  if (!id || id.length > 300) return null;
  if (provider.kind === 'gemini' && Array.isArray(raw.supportedGenerationMethods)
      && !raw.supportedGenerationMethods.includes('generateContent')) return null;
  const s = id.toLowerCase();
  const outputMods = raw?.architecture?.output_modalities;
  const imageOnly = (Array.isArray(outputMods) && outputMods.includes('image') && !outputMods.includes('text'))
    || (IMAGE_GEN.test(s) && !/gemini|gpt-4o/.test(s));
  const chat = !NON_CHAT.test(s) && !imageOnly;
  let priceCategory = 'unknown';
  const pp = raw?.pricing?.prompt, pc = raw?.pricing?.completion;
  if (provider.allFree || s.endsWith(':free') || s === 'openrouter/free') priceCategory = 'free';
  else if (pp != null && pc != null) priceCategory = Number(pp) === 0 && Number(pc) === 0 ? 'free' : 'paid';
  else if (provider.tier === 'paid-cheap' || provider.tier === 'subscription') priceCategory = 'paid';
  const context = Number(raw?.context_length ?? raw?.context_window ?? raw?.max_model_len ?? raw?.inputTokenLimit ?? raw?.context ?? 0) || undefined;
  return {
    provider: provider.id, id,
    name: String(raw.displayName || raw.name && provider.kind !== 'gemini' ? raw.name : id).slice(0, 300),
    priceCategory,
    freeTier: Boolean(provider.freeTier),
    capabilities: capabilitiesFor(id, { ...raw, ...(context ? { context_length: context } : {}) }),
    ...(context ? { context } : {}),
    paramsB: parameterBillions(id),
    chat, image: imageOnly || IMAGE_GEN.test(s),
  };
}

/* ============================== Discovery ============================== */
let modelCache = { at: 0, key: '', value: null };
export function clearModelCache() { modelCache = { at: 0, key: '', value: null }; }

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const res = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) { const e = new Error(`provider_${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function discoverProvider(provider, env, fetchImpl) {
  const keys = collectKeys(provider, env);
  const base = { provider: provider.id, label: provider.label, tier: provider.tier, configured: provider.keyless ? env.AI_DISABLE_KEYLESS !== '1' : keys.length > 0, models: [] };
  const curated = () => (provider.curated || []).map((m) => ({ ...classifyModel(provider, m), source: 'curated' })).filter(Boolean);
  if (!base.configured) return { ...base, models: [], error: 'not_configured' };
  if (provider.keyless) return { ...base, models: curated(), source: 'curated' };
  try {
    let rawList = [];
    if (provider.kind === 'gemini') {
      let pageToken = '';
      for (let i = 0; i < 10; i++) {
        const url = new URL(`${provider.base}/models`);
        url.searchParams.set('pageSize', '200');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const data = await fetchJson(fetchImpl, String(url), { headers: { 'x-goog-api-key': keys[0] } }, 12_000);
        if (!Array.isArray(data.models)) throw new Error('invalid_response');
        rawList.push(...data.models);
        pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken) break;
      }
    } else {
      const data = await fetchJson(fetchImpl, `${provider.base}/models`, { headers: { Authorization: `Bearer ${keys[0]}` } }, 12_000);
      rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;
      if (!rawList) throw new Error('invalid_response');
    }
    const models = rawList.slice(0, 2000).map((m) => classifyModel(provider, m)).filter(Boolean);
    if (!models.length) return { ...base, models: curated(), source: 'curated', error: 'empty_catalogue' };
    return { ...base, models, source: 'live' };
  } catch (e) {
    // Discovery down != generation down: curated defaults keep the chain usable.
    return { ...base, models: curated(), source: 'curated', error: e?.status ? `provider_${e.status}` : 'provider_unreachable' };
  }
}

export async function listAllModels({ env = process.env, fetchImpl = fetch, force = false } = {}) {
  const cacheKey = PROVIDERS.map((p) => `${p.id}:${collectKeys(p, env).length}`).join('|');
  if (!force && modelCache.value && modelCache.key === cacheKey && Date.now() - modelCache.at < 10 * 60_000) return modelCache.value;
  const providers = await Promise.all(PROVIDERS.map((p) => discoverProvider(p, env, fetchImpl)));
  const value = { providers, generatedAt: new Date().toISOString() };
  modelCache = { at: Date.now(), key: cacheKey, value };
  return value;
}

/* ============================== Routing ============================== */
export function scoreModel(model, task) {
  const p = PROVIDER_MAP[model.provider] || {};
  let score = model.priceCategory === 'free' ? 0
    : model.freeTier ? 12
    : model.priceCategory === 'paid' ? (p.tier === 'paid-cheap' ? 55 : 70)
    : 35;
  if (p.lastResort) score += 90;
  const wanted = taskProfile(task).caps;
  if (wanted.some((c) => model.capabilities?.includes(c))) score -= 18;
  const b = model.paramsB;
  if (b != null) {
    if (task === 'triage') score += b < 15 ? -6 : 4;
    else if (b >= 70) score -= 10; else if (b >= 30) score -= 7; else if (b >= 12) score -= 4; else if (b < 4) score += 16;
  }
  if ((task === 'analysis' || task === 'code' || task === 'translation') && (model.context || 0) >= 200_000) score -= 4;
  if (model.source === 'curated') score += 3; // live-verified ids first
  return score;
}

/** Free-first, task-fit candidate chain, interleaved across providers. */
export function buildCandidates(catalog, { task = 'general', freeOnly = false, limit = 7 } = {}) {
  const flat = (catalog?.providers || []).flatMap((g) => (g.configured ? g.models : []))
    .filter((m) => m.chat)
    .filter((m) => !freeOnly || m.priceCategory === 'free' || m.freeTier || PROVIDER_MAP[m.provider]?.keyless);
  const byProvider = new Map();
  for (const m of flat) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider).push(m);
  }
  for (const list of byProvider.values()) list.sort((a, b2) => scoreModel(a, task) - scoreModel(b2, task) || a.id.localeCompare(b2.id));
  const groups = [...byProvider.values()].sort((g1, g2) => scoreModel(g1[0], task) - scoreModel(g2[0], task));
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let took = false;
    for (const g of groups) { if (g[i]) { out.push(g[i]); took = true; if (out.length >= limit) break; } }
    if (!took) break;
  }
  return out;
}

/* ============================== Generation ============================== */
const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
const backoff = (attempt) => 350 * 2 ** attempt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function errorCodeForStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'upstream';
  if (status >= 400) return 'bad_request';
  return 'upstream';
}

async function attemptOpenAI(provider, key, { model, prompt, system, json, temperature, maxTokens }, fetchImpl, timeoutMs, env) {
  const user = json ? `${prompt}\n\n[Respond with valid JSON only — no markdown fences, no extra text.]` : prompt;
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }];
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = env.AI_HTTP_REFERER || 'https://konklancer2.vercel.app';
    headers['X-Title'] = 'KonkLancer Studio (personal)';
  }
  const body = {
    model, messages, temperature, max_tokens: maxTokens,
    ...(json && provider.jsonNative ? { response_format: { type: 'json_object' } } : {}),
  };
  const res = await fetchImpl(`${provider.base}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) { const e = new Error('upstream'); e.status = res.status; e.code = errorCodeForStatus(res.status); throw e; }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  let text = typeof msg?.content === 'string' ? msg.content
    : Array.isArray(msg?.content) ? msg.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('') : '';
  if (!text.trim() && !json && typeof msg?.reasoning === 'string') text = msg.reasoning;
  text = stripThink(text);
  if (!text) { const e = new Error('empty'); e.code = 'empty'; throw e; }
  return { text, model: typeof data?.model === 'string' ? data.model : model };
}

async function attemptGemini(provider, key, { model, prompt, system, json, temperature, maxTokens }, fetchImpl, timeoutMs) {
  const clean = String(model).replace(/^models\//, '');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature, maxOutputTokens: Math.max(maxTokens, 256),
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const res = await fetchImpl(`${provider.base}/models/${encodeURIComponent(clean)}:generateContent`, {
    method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) { const e = new Error('upstream'); e.status = res.status; e.code = errorCodeForStatus(res.status); throw e; }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = stripThink(parts.filter((p) => !p?.thought && typeof p?.text === 'string').map((p) => p.text).join(''));
  if (!text) { const e = new Error('empty'); e.code = 'empty'; throw e; }
  return { text, model: clean };
}

export async function generateText(opts = {}) {
  const {
    env = process.env, fetchImpl = fetch,
    task = 'general', prompt = '', system = '', json = false,
    provider: wantProvider = '', model: wantModel = '', strict = false,
    freeOnly = false, budgetMs = 55_000, maxAttempts = 14, candidateLimit = 7,
  } = opts;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 60_000 || (system && (typeof system !== 'string' || system.length > 12_000))) {
    throw new GatewayError('AI_BAD_REQUEST', 400, 'درخواست نامعتبر است (متن خالی یا بیش از حد طولانی).');
  }
  const profile = taskProfile(task);
  const temperature = Number.isFinite(opts.temperature) ? opts.temperature : profile.temperature;
  const maxTokens = Math.max(64, Math.min(8192, Number.isFinite(opts.maxTokens) ? Math.floor(opts.maxTokens) : profile.maxTokens));
  const started = Date.now();
  const remaining = () => budgetMs - (Date.now() - started);
  const attempts = [];
  let attemptCount = 0;

  async function tryCandidate(candidate) {
    const provider = PROVIDER_MAP[candidate.provider];
    if (!provider) return null;
    const keys = collectKeys(provider, env);
    if (!keys.length) return null;
    for (let ki = 0; ki < keys.length; ki++) {
      let retried = false;
      while (attemptCount < maxAttempts && remaining() > 1500) {
        attemptCount++;
        const timeoutMs = Math.min(profile.timeoutMs, Math.max(3000, remaining() - 500));
        try {
          const args = { model: candidate.id, prompt, system, json, temperature, maxTokens };
          const r = provider.kind === 'gemini'
            ? await attemptGemini(provider, keys[ki], args, fetchImpl, timeoutMs)
            : await attemptOpenAI(provider, keys[ki], args, fetchImpl, timeoutMs, env);
          return { text: r.text, provider: provider.id, model: r.model, attempts, latencyMs: Date.now() - started, task: TASK_PROFILES[task] ? task : 'general' };
        } catch (e) {
          const code = e?.code || (e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network');
          attempts.push({ provider: provider.id, model: candidate.id, keyIndex: ki + 1, ...(e?.status ? { status: e.status } : {}), error: code });
          if (code === 'auth' || code === 'rate_limit') break;          // -> rotate key
          if ((code === 'upstream' || code === 'timeout' || code === 'network') && !retried && remaining() > 6000) {
            retried = true; await sleep(backoff(ki)); continue;        // -> one retry, same key
          }
          return null;                                                  // -> next candidate
        }
      }
      if (attemptCount >= maxAttempts || remaining() <= 1500) return null;
    }
    return null;
  }

  // Explicit pick first.
  if (wantProvider && wantModel && PROVIDER_MAP[wantProvider]) {
    const explicit = { provider: wantProvider, id: wantModel, chat: true, capabilities: capabilitiesFor(wantModel), priceCategory: 'unknown' };
    const hit = await tryCandidate(explicit);
    if (hit) return hit;
    if (strict) throw new GatewayError('AI_UNAVAILABLE', 502, `مدل انتخابی (${wantProvider} / ${wantModel}) پاسخ نداد. جزئیات تلاش‌ها در پاسخ آمده است.`, attempts);
  } else if (wantProvider && !PROVIDER_MAP[wantProvider]) {
    throw new GatewayError('AI_BAD_REQUEST', 400, 'سرویس‌دهنده انتخابی شناخته‌شده نیست.');
  }

  const catalog = await listAllModels({ env, fetchImpl });
  const candidates = buildCandidates(catalog, { task, freeOnly, limit: candidateLimit })
    .filter((c) => !(c.provider === wantProvider && c.id === wantModel));
  if (!candidates.length && !attempts.length) {
    throw new GatewayError('AI_NOT_CONFIGURED', 503, 'هیچ سرویس AI روی سرور تنظیم نشده است. راهنمای docs/AI-GATEWAY-FA.md را ببینید.', attempts);
  }
  for (const c of candidates) {
    if (attemptCount >= maxAttempts || remaining() <= 1500) break;
    const hit = await tryCandidate(c);
    if (hit) return hit;
  }
  throw new GatewayError('AI_UNAVAILABLE', 502, 'همه سرویس‌های AI فعلاً پاسخ ندادند (سهمیه/شبکه/ازدحام). یک دقیقه دیگر دوباره تلاش کنید؛ جزئیات تلاش‌ها در پاسخ آمده است.', attempts);
}

/* ============================== Image generation ============================== */
export async function generateImage(opts = {}) {
  const { env = process.env, fetchImpl = fetch, prompt = '', size = '1024x1024' } = opts;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {
    throw new GatewayError('AI_BAD_REQUEST', 400, 'شرح تصویر نامعتبر است.');
  }
  const attempts = [];
  const [w, h] = String(size).split('x').map((n) => Math.max(256, Math.min(1792, parseInt(n, 10) || 1024)));
  // 1) Agnes image (free, OpenAI-style)
  const agnes = PROVIDER_MAP.agnes;
  for (const [i, key] of collectKeys(agnes, env).entries()) {
    try {
      const res = await fetchImpl(`${agnes.base}/images/generations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: agnes.imageModels[0], prompt, size: `${w}x${h}` }),
        redirect: 'error', signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) { attempts.push({ provider: 'agnes', keyIndex: i + 1, status: res.status, error: errorCodeForStatus(res.status) }); continue; }
      const data = await res.json();
      const item = data?.data?.[0] || {};
      if (item.url) return { provider: 'agnes', model: agnes.imageModels[0], url: item.url, attempts };
      if (item.b64_json) return { provider: 'agnes', model: agnes.imageModels[0], dataUrl: `data:image/png;base64,${item.b64_json}`, attempts };
      attempts.push({ provider: 'agnes', keyIndex: i + 1, error: 'empty' });
    } catch { attempts.push({ provider: 'agnes', keyIndex: i + 1, error: 'network' }); }
  }
  // 2) Gemini image (free tier)
  const gemini = PROVIDER_MAP.gemini;
  for (const [i, key] of collectKeys(gemini, env).entries()) {
    try {
      const res = await fetchImpl(`${gemini.base}/models/${gemini.imageModels[0]}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
        redirect: 'error', signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) { attempts.push({ provider: 'gemini', keyIndex: i + 1, status: res.status, error: errorCodeForStatus(res.status) }); continue; }
      const data = await res.json();
      const part = (data?.candidates?.[0]?.content?.parts || []).find((p) => p?.inlineData?.data);
      if (part) return { provider: 'gemini', model: gemini.imageModels[0], dataUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`, attempts };
      attempts.push({ provider: 'gemini', keyIndex: i + 1, error: 'empty' });
    } catch { attempts.push({ provider: 'gemini', keyIndex: i + 1, error: 'network' }); }
  }
  // 3) Pollinations (keyless) — fetched server-side so the browser in Iran only talks to this app.
  if (env.AI_DISABLE_KEYLESS !== '1') {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
      const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(55_000) });
      const type = String(res.headers?.get?.('content-type') || '');
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= 6_000_000) return { provider: 'pollinations', model: 'flux', dataUrl: `data:${type.split(';')[0]};base64,${buf.toString('base64')}`, attempts };
      }
      attempts.push({ provider: 'pollinations', ...(res.status ? { status: res.status } : {}), error: 'upstream' });
    } catch { attempts.push({ provider: 'pollinations', error: 'network' }); }
  }
  throw new GatewayError('AI_UNAVAILABLE', 502, 'هیچ سرویس تصویری پاسخ نداد. جزئیات تلاش‌ها در پاسخ آمده است.', attempts);
}

/* ============================== HTTP handler ============================== */
export function createRateLimiter({ windowMs = 60_000, max = 90 } = {}) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) hits.clear();
    return list.length <= max;
  };
}
const defaultLimiter = createRateLimiter();

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    return s ? JSON.parse(s) : {};
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 512_000) throw new GatewayError('AI_BAD_REQUEST', 413, 'حجم درخواست بیش از حد مجاز است.'); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

/** compat=true emulates the legacy /api/models shapes ({providers} / {text,model,provider}). */
export async function handleAiHttp(req, res, { env = process.env, fetchImpl = fetch, compat = false, limiter = defaultLimiter } = {}) {
  res.setHeader('X-Request-ID', randomUUID());
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-owner-token, x-api-token');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(''); return; }

  const auth = checkOwner(req.headers, env);
  if (!auth.ok) return sendJson(res, 401, { error: 'توکن مالک (Owner Token) نامعتبر یا خالی است. آن را یک بار در تنظیمات اپ وارد کنید.', code: 'AI_AUTH' });
  if (!auth.authenticated) {
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
    if (!limiter(ip)) return sendJson(res, 429, { error: 'تعداد درخواست‌ها زیاد شد؛ یک دقیقه صبر کنید.', code: 'AI_RATE_LIMIT' });
  }

  const url = new URL(req.url || '/api/ai', 'http://local');
  const action = url.searchParams.get('action') || (req.method === 'GET' ? (compat ? 'models' : 'health') : 'generate');
  try {
    if (req.method === 'GET') {
      if (action === 'health') return sendJson(res, 200, gatewayHealth(env));
      if (action === 'models') {
        const catalog = await listAllModels({ env, fetchImpl, force: url.searchParams.get('refresh') === '1' });
        return sendJson(res, 200, compat
          ? { providers: catalog.providers.map((g) => ({ provider: g.provider, models: g.models, ...(g.error ? { error: g.error } : {}) })) }
          : catalog);
      }
      return sendJson(res, 400, { error: 'action نامعتبر است.', code: 'AI_BAD_REQUEST' });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = await readBody(req);
    const act = body?.action || action;
    if (act === 'image') {
      const r = await generateImage({ env, fetchImpl, prompt: body.prompt, size: body.size });
      return sendJson(res, 200, r);
    }
    const freeOnly = auth.mode === 'open'; // no owner token configured -> auto chain stays free
    const r = await generateText({
      env, fetchImpl,
      task: typeof body.task === 'string' ? body.task : 'general',
      prompt: body.prompt,
      system: body.system ?? body.systemPrompt ?? '',
      json: Boolean(body.json),
      provider: typeof body.provider === 'string' ? body.provider : '',
      model: typeof body.model === 'string' ? body.model : '',
      strict: Boolean(body.strict),
      temperature: body.temperature, maxTokens: body.maxTokens,
      freeOnly,
    });
    return sendJson(res, 200, compat ? { text: r.text, model: r.model, provider: r.provider } : r);
  } catch (e) {
    if (e instanceof GatewayError) return sendJson(res, e.status, { error: e.message, code: e.code, attempts: e.attempts });
    if (e instanceof SyntaxError) return sendJson(res, 400, { error: 'بدنه JSON نامعتبر است.', code: 'AI_BAD_REQUEST' });
    return sendJson(res, 502, { error: 'خطای داخلی درگاه AI.', code: 'AI_UNAVAILABLE' });
  }
}
