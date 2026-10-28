// SPEC-006 tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { callLLM, LLMError, parseJsonLoose, type LLMConfig } from './llm';

type Scripted = { status: number; headers?: Record<string, string>; body: unknown };

async function fakeGateway(script: Scripted[]) {
  const hits: { auth?: string; body: any }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      hits.push({ auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      const step = script[Math.min(hits.length - 1, script.length - 1)];
      res.writeHead(step.status, { 'content-type': 'application/json', ...(step.headers ?? {}) });
      res.end(JSON.stringify(step.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  return { url: `http://127.0.0.1:${port}`, hits, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const okBody = (model: string, content: string) => ({
  id: 'x',
  model,
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
});

const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'konk-llm-'));
const cfgFor = (url: string, extra: Partial<LLMConfig> = {}): LLMConfig => ({
  gatewayUrl: url,
  apiKey: 'konk-test-key',
  timeoutMs: 5000,
  privacy: 'any',
  cacheDir: cacheDir(),
  cacheTtlMs: 3600_000,
  ...extra,
});

test('success: sends taskType, privacy and bearer key; returns text and model', async () => {
  const gw = await fakeGateway([{ status: 200, body: okBody('groq:llama-70b', '{"ok":true}') }]);
  try {
    const r = await callLLM({ taskType: 'general', prompt: 'hi', json: true }, cfgFor(gw.url));
    assert.equal(r.text, '{"ok":true}');
    assert.equal(r.model, 'groq:llama-70b');
    assert.equal(r.cached, false);
    assert.equal(gw.hits[0].auth, 'Bearer konk-test-key');
    assert.equal(gw.hits[0].body.taskType, 'general');
    assert.equal(gw.hits[0].body.privacy, 'any');
    assert.equal(gw.hits[0].body.messages.at(-1).content, 'hi');
  } finally {
    await gw.close();
  }
});

test('mock simulator answer is rejected as AI_UNAVAILABLE (never shown as analysis)', async () => {
  const gw = await fakeGateway([{ status: 200, body: okBody('mock:atlas-70b', 'offline simulator text') }]);
  try {
    await assert.rejects(callLLM({ taskType: 'general', prompt: 'x' }, cfgFor(gw.url)), (e: any) => {
      assert.ok(e instanceof LLMError);
      assert.equal(e.code, 'AI_UNAVAILABLE');
      return true;
    });
  } finally {
    await gw.close();
  }
});

test('429 is retried once after Retry-After, then succeeds', async () => {
  const gw = await fakeGateway([
    { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'slow down' } } },
    { status: 200, body: okBody('cerebras:llama-8b', 'done') },
  ]);
  try {
    const r = await callLLM({ taskType: 'extraction', prompt: 'x' }, cfgFor(gw.url));
    assert.equal(r.text, 'done');
    assert.equal(gw.hits.length, 2);
  } finally {
    await gw.close();
  }
});

test('401 gives AI_AUTH without retry', async () => {
  const gw = await fakeGateway([{ status: 401, body: { error: { message: 'bad key' } } }]);
  try {
    await assert.rejects(callLLM({ taskType: 'general', prompt: 'x' }, cfgFor(gw.url)), (e: any) => e.code === 'AI_AUTH');
    assert.equal(gw.hits.length, 1);
  } finally {
    await gw.close();
  }
});

test('missing config gives AI_NOT_CONFIGURED', async () => {
  await assert.rejects(callLLM({ taskType: 'general', prompt: 'x' }, null), (e: any) => e.code === 'AI_NOT_CONFIGURED');
});

test('cacheKey: second identical call is served from disk without a gateway hit', async () => {
  const gw = await fakeGateway([{ status: 200, body: okBody('groq:llama-70b', 'cached me') }]);
  const cfg = cfgFor(gw.url);
  try {
    const a = await callLLM({ taskType: 'general', prompt: 'p', cacheKey: 'job-1' }, cfg);
    const b = await callLLM({ taskType: 'general', prompt: 'p', cacheKey: 'job-1' }, cfg);
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.equal(b.text, 'cached me');
    assert.equal(gw.hits.length, 1);
  } finally {
    await gw.close();
  }
});

test('parseJsonLoose handles fenced and prefixed JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"tag":"Backend"} thanks'), { tag: 'Backend' });
  assert.equal(parseJsonLoose('not json'), null);
});

test('scanModels: extracts OpenRouter models and marks free models with isFree: true', async () => {
  const { scanModels } = await import('./llm');
  const fakeFetch: any = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000005', completion: '0.000015' } },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', pricing: { prompt: '0', completion: '0' } },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (free)', pricing: { prompt: '0', completion: '0' } }
      ]
    })
  });

  const res = await scanModels({ endpoint: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test' }, fakeFetch);
  assert.equal(res.success, true);
  assert.equal(res.models.length, 3);
  // Free models sorted to top
  assert.equal(res.models[0].isFree, true);
  assert.equal(res.models[1].isFree, true);
  assert.equal(res.models[2].isFree, false);
  assert.ok(res.models[0].name.includes('Free'));
});

test('scanModels: extracts Gemini models and identifies Flash free tier', async () => {
  const { scanModels } = await import('./llm');
  const fakeFetch: any = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      models: [
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      ]
    })
  });

  const res = await scanModels({ provider: 'gemini', apiKey: 'AIzaSyTestKey' }, fakeFetch);
  assert.equal(res.success, true);
  const flash = res.models.find(m => m.id === 'gemini-2.5-flash');
  const pro = res.models.find(m => m.id === 'gemini-2.5-pro');
  assert.ok(flash);
  assert.equal(flash.isFree, true);
  assert.ok(pro);
  assert.equal(pro.isFree, false);
});

test('callLLM: routes to customLLM endpoint when custom configuration is provided', async () => {
  const customServer = await fakeGateway([{ status: 200, body: okBody('custom-model-x', 'custom reply') }]);
  try {
    const r = await callLLM(
      { taskType: 'general', prompt: 'hello' },
      null, // server cfg is null
      fetch,
      { endpoint: customServer.url, apiKey: 'user-custom-key', model: 'custom-model-x' }
    );
    assert.equal(r.text, 'custom reply');
    assert.equal(r.model, 'custom-model-x');
    assert.equal(customServer.hits[0].auth, 'Bearer user-custom-key');
  } finally {
    await customServer.close();
  }
});

test('Gemini 2.5 thinking parts: ignores thought=true parts and guards against stale OpenRouter model ID', async () => {
  const { readLLMConfig } = await import('./llm');
  let capturedBody: any = null;
  let capturedUrl = '';
  const fakeGeminiFetch: any = async (url: string, init: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { thought: true, text: 'internal chain of thought tokens...' },
                { text: 'اتصال برقرار شد' },
              ],
            },
          },
        ],
      }),
    };
  };

  // Even if UI left provider='openrouter' and model='meta-llama/llama-3.3-70b-instruct:free', AIza key auto-routes cleanly to gemini-2.5-flash!
  const res = await callLLM(
    { taskType: 'general', prompt: 'سلام', maxTokens: 60 },
    null,
    fakeGeminiFetch,
    {
      provider: 'openrouter',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: 'AIzaSyDummyGeminiKey123456',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
    },
  );
  assert.equal(res.text, 'اتصال برقرار شد');
  assert.equal(res.model, 'gemini-2.5-flash');
  assert.equal(res.provider, 'gemini');
  assert.match(capturedUrl, /models\/gemini-2\.5-flash:generateContent/);
  assert.deepEqual(capturedBody.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.ok(capturedBody.generationConfig.maxOutputTokens >= 512);

  // Also verify readLLMConfig picks up AI Studio GEMINI_API_KEY automatically
  const envCfg = readLLMConfig({ GEMINI_API_KEY: 'AIzaSyEnvKey' });
  assert.ok(envCfg?.directCustom);
  assert.equal(envCfg?.directCustom?.provider, 'gemini');
});
