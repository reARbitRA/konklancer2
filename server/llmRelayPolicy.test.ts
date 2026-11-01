import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRelay, isAllowedRelayUrl } from './llmRelayPolicy';

test('relay accepts only HTTPS provider hosts without credentials or custom ports', () => {
  assert.equal(isAllowedRelayUrl('https://api.openai.com/v1/chat/completions'), true);
  assert.equal(isAllowedRelayUrl('https://deployment.openai.azure.com/openai/deployments'), true);
  for (const url of [
    'http://api.openai.com/v1', 'https://api.openai.com:8443/v1',
    'https://user:pass@api.openai.com/v1', 'https://api.openai.com.evil.example/',
    'https://evil.example/?next=api.openai.com', 'https://storage.googleapis.com/',
    'https://127.0.0.1/', 'not a url',
  ]) assert.equal(isAllowedRelayUrl(url), false, url);
});

test('relay returns redirects without forwarding credentials to a redirect destination', async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.redirect, 'manual');
    return new Response('', { status: 302, headers: { location: 'https://attacker.invalid/' } });
  };
  const response = await fetchRelay('https://api.openai.com/v1', { headers: { authorization: 'Bearer test-only' } }, fakeFetch);
  assert.equal(response.status, 302);
  assert.equal(calls, 1);
});
