import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callBrowserLLM, scanModelsDirect } from '../src/services/browserLLM';

const directProfile = {
  provider: 'groq',
  endpoint: 'https://api.groq.com/openai/v1',
  apiKey: 'test-user-provider-key',
  model: 'llama-3.3-70b-versatile',
};

test('selected profile sends the LLM request directly to its provider', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders: Headers | undefined;
  let capturedBody: any;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      choices: [{ message: { content: 'direct provider response' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await callBrowserLLM({
      prompt: 'hello',
      overrideConfig: directProfile,
    });
    assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(capturedHeaders?.get('authorization'), 'Bearer test-user-provider-key');
    assert.equal(capturedBody.model, directProfile.model);
    assert.equal(result.text, 'direct provider response');
    assert.equal(result.provider, 'groq');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('model discovery requests the selected provider directly', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders: Headers | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({
      data: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await scanModelsDirect(directProfile);
    assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/models');
    assert.equal(capturedHeaders?.get('authorization'), 'Bearer test-user-provider-key');
    assert.equal(result.success, true);
    assert.equal(result.models[0]?.id, 'llama-3.3-70b-versatile');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct provider failures are surfaced instead of replaced with mock answers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;

  try {
    await assert.rejects(
      callBrowserLLM({ prompt: 'hello', overrideConfig: directProfile }),
      /Failed to fetch/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
