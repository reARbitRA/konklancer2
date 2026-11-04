import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — plain ESM core with sibling .d.mts
import {
  buildCandidates, checkOwner, classifyModel, clearModelCache,
  gatewayHealth, generateText, handleAiHttp, PROVIDER_MAP,
} from '../shared/aiGateway.mjs';

const ALL_KEYS = [
  'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY',
  'HUGGINGFACE_API_KEY', 'AGNES_API_KEY', 'APMIX_API_KEY', 'FIREWORKS_API_KEY', 'FIREWORK_API_KEY',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY_P1', 'GEMINI_KEY_P2', 'GEMINI_KEY_P3',
  'GITHUB_TOKEN', 'GITHUB_MODELS_TOKEN', 'NVIDIA_API_KEY', 'KONKLANCER_OWNER_TOKEN', 'AI_GATEWAY_TOKEN',
];
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!ALL_KEYS.includes(k) && !k.startsWith('KONKLANCER_API_TOKEN')) env[k] = v;
  delete env.KONKLANCER_API_TOKEN;
  return { ...env, ...extra };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('health reports configuration by name only and never leaks key values', () => {
  const env = cleanEnv({ OPENROUTER_API_KEY: 'sk-secret-value', GEMINI_KEY_P1: 'g1-secret', GEMINI_KEY_P2: 'g2-secret', AGNES_API_KEY: 'a-secret', APMIX_API_KEY: 'x-secret' });
  const health = gatewayHealth(env);
  const text = JSON.stringify(health);
  assert.ok(!/secret/.test(text));
  const find = (id: string) => health.providers.find((p: any) => p.provider === id) as any;
  assert.equal(find('gemini').keyCount, 2);
  assert.equal(find('agnes').configured, true);
  assert.equal(find('apmix').configured, true);
  assert.equal(find('fireworks').configured, false);
  assert.equal(health.authMode, 'open-personal');
});

test('owner token gate: open by default, constant-time check when configured', () => {
  assert.equal(checkOwner({}, cleanEnv()).ok, true);
  const env = cleanEnv({ KONKLANCER_OWNER_TOKEN: 'owner-token-123' });
  assert.equal(checkOwner({}, env).ok, false);
  assert.equal(checkOwner({ 'x-owner-token': 'wrong-token-123' }, env).ok, false);
  assert.equal(checkOwner({ 'x-owner-token': 'owner-token-123' }, env).ok, true);
  assert.equal(checkOwner({ authorization: 'Bearer owner-token-123' }, env).ok, true);
});

test('model classification: free detection, non-chat exclusion, capabilities', () => {
  const orp = PROVIDER_MAP.openrouter as any;
  const free: any = classifyModel(orp, { id: 'qwen/qwen3-coder:free', pricing: { prompt: '0', completion: '0' }, context_length: 262144 });
  assert.equal(free.priceCategory, 'free');
  assert.ok(free.capabilities.includes('code'));
  assert.ok(free.capabilities.includes('long-context'));
  const embed: any = classifyModel(orp, { id: 'openai/text-embedding-3-large', pricing: { prompt: '1', completion: '1' } });
  assert.equal(embed.chat, false);
  const agnes: any = classifyModel(PROVIDER_MAP.agnes as any, { id: 'agnes-2.5-flash' });
  assert.equal(agnes.priceCategory, 'free');
});

test('freeOnly routing excludes paid providers (deepseek/apmix/fireworks)', () => {
  const catalog = {
    providers: [
      { provider: 'deepseek', configured: true, models: [classifyModel(PROVIDER_MAP.deepseek as any, { id: 'deepseek-chat' })] },
      { provider: 'groq', configured: true, models: [classifyModel(PROVIDER_MAP.groq as any, { id: 'llama-3.3-70b-versatile' })] },
    ],
  };
  const chain = buildCandidates(catalog as any, { task: 'code', freeOnly: true });
  assert.deepEqual(chain.map((m: any) => m.provider), ['groq']);
  const chainPaid = buildCandidates(catalog as any, { task: 'code', freeOnly: false });
  assert.equal(chainPaid[0].provider, 'groq'); // free-tier still ranks before paid
  assert.ok(chainPaid.some((m: any) => m.provider === 'deepseek'));
});

test('auto generation: free model first, 429 fails over to the next provider', async () => {
  clearModelCache();
  const env = cleanEnv({ OPENROUTER_API_KEY: 'or-key', GROQ_API_KEY: 'groq-key', AI_DISABLE_KEYLESS: '1' });
  const seen: string[] = [];
  const fetchImpl = (async (url: any) => {
    const u = String(url); seen.push(u);
    if (u === 'https://openrouter.ai/api/v1/models') return json({ data: [
      { id: 'paid/model-x', pricing: { prompt: '0.001', completion: '0.002' } },
      { id: 'qwen/qwen3-coder:free', pricing: { prompt: '0', completion: '0' } },
    ] });
    if (u === 'https://api.groq.com/openai/v1/models') return json({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    if (u.endsWith('openrouter.ai/api/v1/chat/completions')) return json({ error: { message: 'or-key must not leak' } }, 429);
    if (u.endsWith('api.groq.com/openai/v1/chat/completions')) return json({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'پاسخ موفق' } }] });
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;

  const r: any = await generateText({ env, fetchImpl, task: 'code', prompt: 'یک تابع بنویس' });
  assert.equal(r.text, 'پاسخ موفق');
  assert.equal(r.provider, 'groq');
  assert.equal(r.attempts[0].provider, 'openrouter');
  assert.equal(r.attempts[0].model, 'qwen/qwen3-coder:free'); // free tried before paid groq model? groq is free-tier, both before paid
  assert.equal(r.attempts[0].error, 'rate_limit');
  assert.ok(!JSON.stringify(r).includes('or-key'));
  assert.ok(seen.every((u) => !u.includes('api.openai.com'))); // fixed allowlist only
});

test('gemini key rotation: P1 rejected (401) then P2 succeeds, via native API + header auth', async () => {
  clearModelCache();
  const env = cleanEnv({ GEMINI_KEY_P1: 'bad-key', GEMINI_KEY_P2: 'good-key', AI_DISABLE_KEYLESS: '1' });
  const keysUsed: string[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    const u = String(url);
    const key = new Headers(init?.headers).get('x-goog-api-key') || '';
    if (u.includes(':generateContent')) {
      keysUsed.push(key);
      assert.ok(!u.includes('key='), 'api key must not be in URL');
      if (key === 'bad-key') return json({ error: { message: 'bad-key rejected' } }, 401);
      return json({ candidates: [{ content: { parts: [{ text: 'پاسخ Gemini' }] } }] });
    }
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;

  const r: any = await generateText({ env, fetchImpl, provider: 'gemini', model: 'gemini-2.5-flash', strict: true, prompt: 'سلام' });
  assert.equal(r.text, 'پاسخ Gemini');
  assert.deepEqual(keysUsed, ['bad-key', 'good-key']);
  assert.equal(r.attempts[0].error, 'auth');
  assert.ok(!JSON.stringify(r).includes('good-key'));
});

test('strict explicit failure is sanitized and reports attempts without secrets', async () => {
  clearModelCache();
  const env = cleanEnv({ DEEPSEEK_API_KEY: 'ds-secret', AI_DISABLE_KEYLESS: '1' });
  const fetchImpl = (async () => new Response('ds-secret upstream garbage', { status: 503 })) as typeof fetch;
  await assert.rejects(
    generateText({ env, fetchImpl, provider: 'deepseek', model: 'deepseek-chat', strict: true, prompt: 'x', budgetMs: 8000 }),
    (e: any) => {
      assert.equal(e.code, 'AI_UNAVAILABLE');
      assert.ok(!String(e.message).includes('ds-secret'));
      assert.ok(!JSON.stringify(e.attempts).includes('ds-secret'));
      assert.ok(e.attempts.length >= 1);
      return true;
    },
  );
});

function fakeRes() {
  let status = 0, body = '';
  const headers = new Map<string, string>();
  const res: any = {
    set statusCode(n: number) { status = n; }, get statusCode() { return status; },
    setHeader(k: string, v: string) { headers.set(k.toLowerCase(), v); },
    end(s: string) { body = s; },
  };
  return { res, out: () => ({ status, headers, body: body ? JSON.parse(body) : null }) };
}

test('HTTP handler: health open, token enforced when configured, request id present', async () => {
  let r = fakeRes();
  await handleAiHttp({ method: 'GET', url: '/api/ai?action=health', headers: {} } as any, r.res, { env: cleanEnv() });
  assert.equal(r.out().status, 200);
  assert.match(r.out().headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);

  const env = cleanEnv({ KONKLANCER_OWNER_TOKEN: 'owner-token-123' });
  r = fakeRes();
  await handleAiHttp({ method: 'GET', url: '/api/ai?action=health', headers: {} } as any, r.res, { env });
  assert.equal(r.out().status, 401);
  r = fakeRes();
  await handleAiHttp({ method: 'GET', url: '/api/ai?action=health', headers: { 'x-owner-token': 'owner-token-123' } } as any, r.res, { env });
  assert.equal(r.out().status, 200);
});

test('HTTP handler: invalid provider is rejected, no arbitrary URL forwarding', async () => {
  clearModelCache();
  const r = fakeRes();
  await handleAiHttp(
    { method: 'POST', url: '/api/ai', headers: {}, body: { provider: 'https://attacker.example', model: 'x', prompt: 'hi' } } as any,
    r.res,
    { env: cleanEnv({ AI_DISABLE_KEYLESS: '1' }) },
  );
  assert.equal(r.out().status, 400);
});
