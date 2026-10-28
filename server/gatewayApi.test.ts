import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeGatewayApiRequest, gatewayTokensMatch } from './gatewayApi';
import type { LLMConfig } from './llm';

const relayToken = 'relay-token-for-gateway-tests';
const gatewayConfig: LLMConfig = {
  gatewayUrl: 'https://gateway.example.test',
  apiKey: 'server-only-gateway-key',
  timeoutMs: 1_000,
  privacy: 'strict',
  cacheDir: null,
  cacheTtlMs: 0,
};

const request = (body: unknown, token = relayToken) => ({
  headers: token ? { 'x-api-token': token } : {},
  body,
});

function gatewayFetch(calls: Array<{ url: string; init?: RequestInit }> = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      model: 'openai:gpt-4.1-mini',
      provider: 'openai',
      choices: [{ message: { content: 'gateway answer' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

test('relay token comparison is exact, length-checked, and constant-time-safe', () => {
  assert.equal(gatewayTokensMatch(relayToken, relayToken), true);
  assert.equal(gatewayTokensMatch(`${relayToken}x`, relayToken), false);
  assert.equal(gatewayTokensMatch('short', 'short'), false);
  assert.equal(gatewayTokensMatch(undefined, relayToken), false);
});

test('gateway adapter rejects missing server relay configuration and invalid app tokens', async () => {
  const noConfig = await executeGatewayApiRequest(request({ user: 'hello' }), { env: {}, config: gatewayConfig });
  assert.equal(noConfig.status, 503);
  assert.equal(noConfig.body.code, 'RELAY_NOT_CONFIGURED');

  const invalidToken = await executeGatewayApiRequest(request({ user: 'hello' }, 'wrong-token'), {
    env: { KONKLANCER_RELAY_TOKEN: relayToken },
    config: gatewayConfig,
  });
  assert.equal(invalidToken.status, 401);
  assert.equal(invalidToken.body.code, 'INVALID_RELAY_TOKEN');
});

test('gateway adapter forwards only the validated task contract to Konkred', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await executeGatewayApiRequest(request({
    taskType: 'extraction',
    user: 'extract category',
    system: 'Return strict JSON.',
    json: true,
    temperature: 0.2,
    maxTokens: 128,
    privacy: 'strict',
  }), {
    env: { KONKLANCER_RELAY_TOKEN: relayToken },
    config: gatewayConfig,
    fetchImpl: gatewayFetch(calls),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    success: true,
    aiAvailable: true,
    text: 'gateway answer',
    model: 'openai:gpt-4.1-mini',
    provider: 'openai',
    cached: false,
    attempts: 1,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gateway.example.test/v1/chat/completions');
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get('authorization'), 'Bearer server-only-gateway-key');
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(sent.taskType, 'extraction');
  assert.equal(sent.privacy, 'strict');
  assert.equal(sent.max_tokens, 128);
  assert.deepEqual(sent.messages, [
    { role: 'system', content: 'Return strict JSON.' },
    { role: 'user', content: 'extract category' },
  ]);
});

test('gateway adapter blocks provider-relay payloads before making an upstream call', async () => {
  let calls = 0;
  const result = await executeGatewayApiRequest(request({
    target_url: 'https://api.openai.com/v1/chat/completions',
    req_headers: { authorization: 'Bearer client-key' },
    req_body: '{}',
  }), {
    env: { KONKLANCER_RELAY_TOKEN: relayToken },
    config: gatewayConfig,
    fetchImpl: (async () => { calls += 1; throw new Error('should not run'); }) as typeof fetch,
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'PROVIDER_RELAY_DISABLED');
  assert.equal(calls, 0);
});

test('gateway adapter rejects invalid task metadata and never falls back to provider keys', async () => {
  const badTask = await executeGatewayApiRequest(request({ taskType: 'coding', user: 'x' }), {
    env: { KONKLANCER_RELAY_TOKEN: relayToken },
    config: gatewayConfig,
  });
  assert.equal(badTask.status, 400);
  assert.equal(badTask.body.code, 'INVALID_TASK_TYPE');

  const missingGatewayCredential = await executeGatewayApiRequest(request({ user: 'x' }), {
    env: { KONKLANCER_RELAY_TOKEN: relayToken, GEMINI_API_KEY: 'provider-key-must-not-be-used' },
  });
  assert.equal(missingGatewayCredential.status, 503);
  assert.equal(missingGatewayCredential.body.code, 'AI_NOT_CONFIGURED');
});
