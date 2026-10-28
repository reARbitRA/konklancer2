// SPEC-006 gateway client tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { callLLM, LLMError, parseJsonLoose, readLLMConfig, scanModels, type LLMConfig } from './llm';

type Scripted = { status: number; headers?: Record<string, string>; body: unknown };

async function fakeGateway(script: Scripted[]) {
  const hits: { method?: string; url?: string; auth?: string; body: any }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      const step = script[Math.min(hits.length - 1, script.length - 1)];
      res.writeHead(step.status, { 'content-type': 'application/json', ...(step.headers ?? {}) });
      res.end(JSON.stringify(step.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  return { url: `http://127.0.0.1:${port}`, hits, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const okBody = (model: string, content: string) => ({
  id: 'x',
  model,
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
});
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'konk-llm-'));
const cfgFor = (url: string, dir: string | null = null, extra: Partial<LLMConfig> = {}): LLMConfig => ({
  gatewayUrl: url,
  apiKey: 'konk-test-key',
  timeoutMs: 5_000,
  privacy: 'any',
  cacheDir: dir,
  cacheTtlMs: 3_600_000,
  ...extra,
});

test('callLLM uses only the Konkred OpenAI-compatible route and sends task metadata', async () => {
  const gateway = await fakeGateway([{ status: 200, body: okBody('groq:llama-70b', '{"ok":true}') }]);
  try {
    const result = await callLLM(
      { taskType: 'general', user: 'hi', system: 'Be concise', json: true, maxTokens: 256 },
      cfgFor(gateway.url),
    );
    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.model, 'groq:llama-70b');
    assert.equal(result.provider, 'groq');
    assert.equal(result.cached, false);
    assert.equal(result.attempts, 1);
    assert.equal(gateway.hits[0].method, 'POST');
    assert.equal(gateway.hits[0].url, '/v1/chat/completions');
    assert.equal(gateway.hits[0].auth, 'Bearer konk-test-key');
    assert.equal(gateway.hits[0].body.taskType, 'general');
    assert.equal(gateway.hits[0].body.privacy, 'any');
    assert.equal(gateway.hits[0].body.max_tokens, 256);
    assert.deepEqual(gateway.hits[0].body.response_format, { type: 'json_object' });
    assert.deepEqual(gateway.hits[0].body.messages, [
      { role: 'system', content: 'Be concise' },
      { role: 'user', content: 'hi' },
    ]);
    assert.equal('model' in gateway.hits[0].body, false, 'model selection stays in the gateway');
  } finally {
    await gateway.close();
  }
});

test('mock model and mock provider are rejected as AI_UNAVAILABLE', async () => {
  for (const response of [
    okBody('mock:atlas-70b', 'offline simulator text'),
    { ...okBody('atlas-70b', 'offline simulator text'), provider: 'mock' },
  ]) {
    const gateway = await fakeGateway([{ status: 200, body: response }]);
    try {
      await assert.rejects(
        callLLM({ taskType: 'general', user: 'x' }, cfgFor(gateway.url)),
        (error: any) => error instanceof LLMError && error.code === 'AI_UNAVAILABLE' && error.status === 503,
      );
    } finally {
      await gateway.close();
    }
  }
});

test('429 is retried once using Retry-After and then succeeds', async () => {
  const gateway = await fakeGateway([
    { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'slow down', retryAfterSec: 0 } } },
    { status: 200, body: okBody('cerebras:llama-8b', 'done') },
  ]);
  try {
    const result = await callLLM({ taskType: 'extraction', user: 'x' }, cfgFor(gateway.url));
    assert.equal(result.text, 'done');
    assert.equal(result.attempts, 2);
    assert.equal(gateway.hits.length, 2);
  } finally {
    await gateway.close();
  }
});

test('gateway 429 after one retry returns an error', async () => {
  const gateway = await fakeGateway([
    { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'slow down' } } },
    { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'still limited' } } },
  ]);
  try {
    await assert.rejects(
      callLLM({ taskType: 'general', user: 'x' }, cfgFor(gateway.url)),
      (error: any) => error.code === 'AI_RATE_LIMIT' && error.status === 429,
    );
    assert.equal(gateway.hits.length, 2);
  } finally {
    await gateway.close();
  }
});

test('401 returns AI_AUTH without retry', async () => {
  const gateway = await fakeGateway([{ status: 401, body: { error: { message: 'bad key' } } }]);
  try {
    await assert.rejects(
      callLLM({ taskType: 'general', user: 'x' }, cfgFor(gateway.url)),
      (error: any) => error.code === 'AI_AUTH' && error.status === 401,
    );
    assert.equal(gateway.hits.length, 1);
  } finally {
    await gateway.close();
  }
});

test('missing gateway config fails closed even when provider keys are present', async () => {
  assert.equal(readLLMConfig({ GEMINI_API_KEY: 'must-not-be-used' } as NodeJS.ProcessEnv), null);
  await assert.rejects(
    callLLM({ taskType: 'general', user: 'x' }, null),
    (error: any) => error instanceof LLMError && error.code === 'AI_NOT_CONFIGURED' && error.status === 503,
  );
});

test('same task and prompt are served from the local cache without a second gateway hit', async () => {
  const directory = tempDir();
  const gateway = await fakeGateway([{ status: 200, body: okBody('groq:llama-70b', 'cached me') }]);
  try {
    const config = cfgFor(gateway.url, directory);
    const first = await callLLM({ taskType: 'general', user: 'p', cacheKey: 'job-1' }, config);
    const second = await callLLM({ taskType: 'general', user: 'p', cacheKey: 'job-1' }, config);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(first.attempts, 1);
    assert.equal(second.attempts, 0);
    assert.equal(second.text, 'cached me');
    assert.equal(gateway.hits.length, 1);
  } finally {
    await gateway.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('scanModels only reads the gateway model catalogue', async () => {
  const gateway = await fakeGateway([{ status: 200, body: { object: 'list', data: [{ id: 'groq:fast' }, { id: 'cerebras:strong' }] } }]);
  try {
    const result = await scanModels(cfgFor(gateway.url));
    assert.equal(result.success, true);
    assert.deepEqual(result.models.map((model) => model.id), ['groq:fast', 'cerebras:strong']);
    assert.equal(gateway.hits[0].method, 'GET');
    assert.equal(gateway.hits[0].url, '/v1/models');
    assert.equal(gateway.hits[0].auth, 'Bearer konk-test-key');
  } finally {
    await gateway.close();
  }
});

test('parseJsonLoose handles fenced and prefixed JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"tag":"Backend"} thanks'), { tag: 'Backend' });
  assert.equal(parseJsonLoose('not json'), null);
});
