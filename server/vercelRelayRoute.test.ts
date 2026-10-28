import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGatewayApiRequest, resolveRelayCorsOrigin } from '../api/llm/relay';

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

test('Vercel gateway CORS allows production and Capacitor origins, rejects unrelated origins', () => {
  assert.equal(resolveRelayCorsOrigin('https://konklancer2.vercel.app'), 'https://konklancer2.vercel.app');
  assert.equal(resolveRelayCorsOrigin('https://konklancer2-git-arena-preview.vercel.app'), 'https://konklancer2-git-arena-preview.vercel.app');
  assert.equal(resolveRelayCorsOrigin('https://localhost'), 'https://localhost');
  assert.equal(resolveRelayCorsOrigin('capacitor://localhost'), 'capacitor://localhost');
  assert.equal(resolveRelayCorsOrigin('null'), 'null');
  assert.equal(resolveRelayCorsOrigin('https://attacker.example'), undefined);
});

test('Vercel gateway returns preflight without requiring an app token', async () => {
  const res = fakeResponse();
  await handleGatewayApiRequest(
    { method: 'OPTIONS', headers: { origin: 'https://konklancer2.vercel.app' } },
    res,
  );
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers['access-control-allow-origin'], 'https://konklancer2.vercel.app');
  assert.equal(res.headers['access-control-allow-headers'], 'content-type, x-api-token');
});

test('Vercel gateway rejects disallowed origins and non-POST methods', async () => {
  const disallowed = fakeResponse();
  await handleGatewayApiRequest(
    { method: 'POST', headers: { origin: 'https://attacker.example' }, body: {} },
    disallowed,
  );
  assert.equal(disallowed.statusCode, 403);

  const method = fakeResponse();
  await handleGatewayApiRequest({ method: 'GET', headers: {} }, method);
  assert.equal(method.statusCode, 405);
});

test('Vercel gateway rejects a POST with a missing relay token', async () => {
  const res = fakeResponse();
  await handleGatewayApiRequest(
    { method: 'POST', headers: { origin: 'https://konklancer2.vercel.app' }, body: { prompt: 'hello' } },
    res,
    { env: { KONKLANCER_RELAY_TOKEN: 'relay-token-that-is-long' }, config: null },
  );
  assert.equal(res.statusCode, 401);
  assert.equal((res.body as any).code, 'INVALID_RELAY_TOKEN');
});
