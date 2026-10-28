import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGatewayHealthRequest } from '../api/llm/relay-health';

const RELAY_TOKEN = 'app-relay-token-123456';

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('Vercel gateway health CORS preflight is read-only and requires no token', async () => {
  const res = fakeResponse();
  await handleGatewayHealthRequest(
    { method: 'OPTIONS', headers: { origin: 'https://konklancer2-git-feature.vercel.app' } },
    res,
  );
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers['access-control-allow-origin'], 'https://konklancer2-git-feature.vercel.app');
  assert.equal(res.headers['access-control-allow-methods'], 'GET, OPTIONS');
  assert.equal(res.headers['access-control-allow-headers'], 'content-type, x-api-token');
});

test('Vercel gateway health rejects disallowed origins and non-GET methods', async () => {
  const disallowed = fakeResponse();
  await handleGatewayHealthRequest({ method: 'GET', headers: { origin: 'https://attacker.example' } }, disallowed);
  assert.equal(disallowed.statusCode, 403);

  const method = fakeResponse();
  await handleGatewayHealthRequest({ method: 'POST', headers: {} }, method);
  assert.equal(method.statusCode, 405);
});

test('Vercel gateway health validates the device token and reports gateway readiness without inference', async () => {
  const invalid = fakeResponse();
  await handleGatewayHealthRequest({ method: 'GET', headers: {} }, invalid, {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: null,
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal((invalid.body as any).code, 'INVALID_RELAY_TOKEN');

  const configuredButMissingGatewayKey = fakeResponse();
  await handleGatewayHealthRequest({ method: 'GET', headers: { 'x-api-token': RELAY_TOKEN } }, configuredButMissingGatewayKey, {
    env: { KONKLANCER_RELAY_TOKEN: RELAY_TOKEN },
    config: null,
  });
  assert.equal(configuredButMissingGatewayKey.statusCode, 200);
  assert.equal((configuredButMissingGatewayKey.body as any).gateway.ready, false);
  assert.equal((configuredButMissingGatewayKey.body as any).gateway.status, 'not-configured');
});
