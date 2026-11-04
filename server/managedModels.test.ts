import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — JS shim over shared/aiGateway.mjs
import handler from '../api/models';
import type { IncomingMessage, ServerResponse } from 'node:http';
// @ts-ignore
import { clearModelCache } from '../shared/aiGateway.mjs';

const CLEAN = ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_KEY_P1', 'GEMINI_KEY_P2', 'GEMINI_KEY_P3',
  'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'CEREBRAS_API_KEY', 'HUGGINGFACE_API_KEY', 'AGNES_API_KEY', 'APMIX_API_KEY',
  'KONKLANCER_OWNER_TOKEN', 'AI_GATEWAY_TOKEN', 'KONKLANCER_API_TOKEN'];

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const saved = CLEAN.map((k) => process.env[k]);
    CLEAN.forEach((k) => delete process.env[k]);
    Object.assign(process.env, vars);
    clearModelCache();
    const original = globalThis.fetch;
    try { await fn(); } finally {
      globalThis.fetch = original;
      CLEAN.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
      clearModelCache();
    }
  };
}
function response() {
  let status = 0, body = '';
  const headers = new Map<string, string>();
  const res = { set statusCode(n: number) { status = n; }, setHeader(k: string, v: string) { headers.set(k.toLowerCase(), v); }, end(s: string) { body = s; } } as unknown as ServerResponse;
  return { res, result: () => ({ status, headers, body: JSON.parse(body) }) };
}

test('SPEC-013: compat discovery needs no login; unconfigured providers are explicit, keyless reserve exists',
  withEnv({}, async () => {
    globalThis.fetch = (async () => { throw new Error('no network expected'); }) as typeof fetch;
    const r = response();
    await handler({ headers: {}, method: 'GET', url: '/api/models' } as IncomingMessage, r.res);
    const out = r.result();
    assert.equal(out.status, 200);
    assert.equal(out.body.providers.find((p: any) => p.provider === 'openrouter').error, 'not_configured');
    assert.ok(out.body.providers.find((p: any) => p.provider === 'pollinations').models.length >= 1);
    assert.match(out.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  }));

test('SPEC-013: discovery uses only fixed endpoints, classifies free models, never returns the key',
  withEnv({ OPENROUTER_API_KEY: 'private-key', AI_DISABLE_KEYLESS: '1' }, async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: any) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ data: [{ id: 'some-free:free', name: 'Some Free', pricing: { prompt: '0', completion: '0' } }, null, 42] }));
    }) as typeof fetch;
    const r = response();
    await handler({ headers: {}, method: 'GET', url: '/api/models' } as IncomingMessage, r.res);
    const out = r.result();
    assert.equal(out.status, 200);
    const orp = out.body.providers.find((p: any) => p.provider === 'openrouter');
    assert.deepEqual(orp.models.map((m: any) => m.id), ['some-free:free']);
    assert.equal(orp.models[0].priceCategory, 'free');
    assert.ok(seen.includes('https://openrouter.ai/api/v1/models'));
    assert.ok(!JSON.stringify(out).includes('private-key'));
  }));

test('SPEC-013: generation via explicit model; unknown provider rejected; no quota/login calls',
  withEnv({ OPENROUTER_API_KEY: 'private-key', AI_DISABLE_KEYLESS: '1' }, async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      const u = String(url); calls.push(u);
      if (u.endsWith('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }));
      if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'some-model' }] }));
      throw new Error(`unexpected ${u}`);
    }) as typeof fetch;
    const req = { headers: {}, method: 'POST', url: '/api/models', body: { provider: 'openrouter', model: 'some-model', prompt: 'hello' } } as IncomingMessage & { body: any };
    let r = response();
    await handler(req, r.res);
    assert.equal(r.result().status, 200);
    assert.equal(r.result().body.text, 'hello');
    assert.ok(!JSON.stringify(r.result()).includes('private-key'));
    assert.ok(!calls.some((u) => u.includes('supabase') || u.includes('/auth/')));
    r = response();
    await handler({ ...req, body: { ...req.body, provider: 'https://attacker.example' } } as any, r.res);
    assert.equal(r.result().status, 400);
  }));

test('SPEC-013: owner token (when configured) is required on the compat endpoint too',
  withEnv({ KONKLANCER_OWNER_TOKEN: 'owner-token-123', AI_DISABLE_KEYLESS: '1' }, async () => {
    let r = response();
    await handler({ headers: {}, method: 'GET', url: '/api/models' } as IncomingMessage, r.res);
    assert.equal(r.result().status, 401);
    r = response();
    await handler({ headers: { 'x-owner-token': 'owner-token-123' }, method: 'GET', url: '/api/models' } as unknown as IncomingMessage, r.res);
    assert.equal(r.result().status, 200);
  }));
