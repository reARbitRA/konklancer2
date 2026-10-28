import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeGatewayHealthApiRequest } from './gatewayHealthApi';

const RELAY_TOKEN = 'app-relay-token-123456';
const request = (token = RELAY_TOKEN) => ({ headers: { 'x-api-token': token } });
const gatewayConfig = {
  gatewayUrl: 'https://gateway.test',
  apiKey: 'server-only-gateway-caller-key',
  timeoutMs: 5_000,
  privacy: 'any' as const,
  cacheDir: null,
  cacheTtlMs: 0,
};

function bodyOf(result: Awaited<ReturnType<typeof executeGatewayHealthApiRequest>>) {
  return result.body as any;
}

test('gateway health rejects missing or invalid app relay credentials before probing Konkred', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const missingServerToken = await executeGatewayHealthApiRequest(request(), { env: {}, config: gatewayConfig, fetchImpl });
  assert.equal(missingServerToken.status, 503);
  assert.equal(bodyOf(missingServerToken).code, 'RELAY_NOT_CONFIGURED');

  const invalidDeviceToken = await executeGatewayHealthApiRequest({ headers: { 'x-api-token': 'wrong-token-123456' } }, {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN }, config: gatewayConfig, fetchImpl,
  });
  assert.equal(invalidDeviceToken.status, 401);
  assert.equal(bodyOf(invalidDeviceToken).code, 'INVALID_RELAY_TOKEN');
  assert.equal(calls, 0);
});

test('gateway health distinguishes absent gateway credentials from the app relay token', async () => {
  const result = await executeGatewayHealthApiRequest(request(), {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: null,
    fetchImpl: (async () => { throw new Error('must not call without a gateway key'); }) as typeof fetch,
  });

  assert.equal(result.status, 200);
  assert.equal(bodyOf(result).gateway.configured, false);
  assert.equal(bodyOf(result).gateway.ready, false);
  assert.equal(bodyOf(result).gateway.status, 'not-configured');
});

test('gateway health sends the server-side caller credential to the authenticated model registry', async () => {
  let capturedUrl = '';
  let capturedAuthorization = '';
  const result = await executeGatewayHealthApiRequest(request(), {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: gatewayConfig,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedAuthorization = new Headers(init?.headers).get('authorization') || '';
      return new Response(JSON.stringify({ ok: true, data: { models: [{ id: 'm1', available: false }, { id: 'm2', available: true }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });

  assert.equal(capturedUrl, 'https://gateway.test/api/models');
  assert.equal(capturedAuthorization, 'Bearer server-only-gateway-caller-key');
  assert.equal(result.status, 200);
  assert.equal(bodyOf(result).gateway.configured, true);
  assert.equal(bodyOf(result).gateway.authenticated, true);
  assert.equal(bodyOf(result).gateway.ready, true);
  assert.equal(bodyOf(result).gateway.status, 'ready');
});

test('gateway health reports invalid caller credentials, no model capacity, and upstream outages without leaking details', async () => {
  const unauthorized = await executeGatewayHealthApiRequest(request(), {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: gatewayConfig,
    fetchImpl: (async () => new Response('sensitive gateway detail', { status: 401 })) as typeof fetch,
  });
  assert.equal(bodyOf(unauthorized).gateway.status, 'unauthorized');
  assert.equal(bodyOf(unauthorized).gateway.authenticated, false);

  const noCapacity = await executeGatewayHealthApiRequest(request(), {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: gatewayConfig,
    fetchImpl: (async () => new Response(JSON.stringify({ ok: true, data: { models: [{ available: false }] } }), { status: 200 })) as typeof fetch,
  });
  assert.equal(bodyOf(noCapacity).gateway.status, 'no-capacity');
  assert.equal(bodyOf(noCapacity).gateway.authenticated, true);
  assert.equal(bodyOf(noCapacity).gateway.ready, false);

  const unavailable = await executeGatewayHealthApiRequest(request(), {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: gatewayConfig,
    fetchImpl: (async () => { throw new Error('private connection detail'); }) as typeof fetch,
  });
  assert.equal(bodyOf(unavailable).gateway.status, 'unavailable');
  assert.equal(JSON.stringify(unavailable.body).includes('private connection detail'), false);
});
