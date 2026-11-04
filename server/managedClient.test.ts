import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listManagedModels, callManagedModel, callGatewayAI } from '../src/services/managedLLM';

test('SPEC-013: gateway client lists models and generates through /api/ai with no login credential', async () => {
  const original = globalThis.fetch;
  const requests: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    requests.push({ url: String(url), init });
    const body = init?.method === 'POST'
      ? { text: 'ok', model: 'model', provider: 'openrouter' }
      : { providers: [] };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await listManagedModels();
    const result = await callManagedModel({ id: 'model', name: 'Model', provider: 'openrouter' }, { prompt: 'hello', task: 'analysis' });
    assert.equal(result.text, 'ok');
    assert.equal(requests[0].url, '/api/ai?action=models');
    assert.equal(requests[0].init.headers.Authorization, undefined);
    assert.equal(requests[1].url, '/api/ai');
    const sent = JSON.parse(requests[1].init.body);
    assert.equal(sent.provider, 'openrouter');
    assert.equal(sent.model, 'model');
    assert.equal(sent.task, 'analysis');
  } finally { globalThis.fetch = original; }
});

test('SPEC-013: Auto mode sends no provider/model (server routes by task)', async () => {
  const original = globalThis.fetch;
  let sent: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ text: 'auto ok', model: 'free-x', provider: 'groq' }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const r = await callGatewayAI({ task: 'code', prompt: 'بنویس', model: { provider: 'auto', id: 'auto', name: 'Auto' } });
    assert.equal(r.text, 'auto ok');
    assert.equal(sent.provider, undefined);
    assert.equal(sent.model, undefined);
    assert.equal(sent.task, 'code');
  } finally { globalThis.fetch = original; }
});
