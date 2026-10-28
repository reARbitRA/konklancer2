import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKonkredGatewayReady, requestKonkredGateway } from '../src/services/cloudRelay';
import { VERCEL_RELAY_URL } from '../shared/relayConfig';

async function withBrowserMocks(
  origin: string,
  fetchMock: typeof fetch,
  run: () => Promise<void>,
  relayToken: string | null = 'client-test-token-123456',
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin, protocol: 'https:', hostname: new URL(origin).hostname },
      localStorage: { getItem: (key: string) => key === 'konklancer_api_token' ? relayToken : null },
    },
  });
  globalThis.fetch = fetchMock;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as any).window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
}

test('browser LLM client posts the gateway task contract and saved app token to the same-origin route', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  await withBrowserMocks('https://konklancer2.vercel.app', (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      success: true,
      text: 'gateway answer',
      model: 'groq:llama-70b',
      provider: 'groq',
      cached: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch, async () => {
    const result = await requestKonkredGateway({ taskType: 'extraction', prompt: 'extract category', system: 'Return JSON.', json: true });
    assert.equal(result.text, 'gateway answer');
    assert.equal(result.model, 'groq:llama-70b');
    assert.equal(capturedUrl, '/api/llm/relay');
    assert.equal(new Headers(capturedInit?.headers).get('x-api-token'), 'client-test-token-123456');
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.taskType, 'extraction');
    assert.equal(body.user, 'extract category');
    assert.equal(body.system, 'Return JSON.');
    assert.equal('prompt' in body, false);
    assert.equal('model' in body, false);
    assert.equal('apiKey' in body, false);
  });
});

test('preview clients can fall back to the configured Vercel gateway adapter', async () => {
  const urls: string[] = [];
  await withBrowserMocks('https://konklancer2-git-feature.vercel.app', (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url === '/api/llm/relay') return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ success: true, text: 'ok', model: 'gateway:model', provider: 'gateway' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, async () => {
    const result = await requestKonkredGateway({ prompt: 'hello' });
    assert.equal(result.text, 'ok');
    assert.deepEqual(urls, ['/api/llm/relay', VERCEL_RELAY_URL]);
  });
});

test('gateway readiness requires an app token and an authenticated, available gateway model', async () => {
  let capturedUrl = '';
  let capturedHeaders: Headers | undefined;
  await withBrowserMocks('https://konklancer2.vercel.app', (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ success: true, gateway: { configured: true, authenticated: true, ready: true, status: 'ready' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, async () => {
    assert.equal(await isKonkredGatewayReady(), true);
    assert.equal(capturedUrl, '/api/llm/relay-health');
    assert.equal(capturedHeaders?.get('x-api-token'), 'client-test-token-123456');
  });
});

test('preview gateway readiness falls back to the production health route', async () => {
  const urls: string[] = [];
  const headers: Headers[] = [];
  await withBrowserMocks('https://konklancer2-git-feature.vercel.app', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    headers.push(new Headers(init?.headers));
    if (url === '/api/llm/relay-health') return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ success: true, gateway: { ready: true, status: 'ready' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, async () => {
    assert.equal(await isKonkredGatewayReady(), true);
    assert.deepEqual(urls, [
      '/api/llm/relay-health',
      'https://konklancer2.vercel.app/api/llm/relay-health',
    ]);
    assert.equal(headers.every((headersForRequest) => headersForRequest.get('x-api-token') === 'client-test-token-123456'), true);
  });
});

test('gateway readiness is false without a device token or usable gateway capacity', async () => {
  let calls = 0;
  const fetchMock = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ success: true, gateway: { configured: true, authenticated: true, ready: false, status: 'no-capacity' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await withBrowserMocks('https://konklancer2.vercel.app', fetchMock, async () => {
    assert.equal(await isKonkredGatewayReady(), false);
  }, null);
  assert.equal(calls, 0);

  await withBrowserMocks('https://konklancer2.vercel.app', fetchMock, async () => {
    assert.equal(await isKonkredGatewayReady(), false);
  });
  assert.equal(calls, 1);
});
