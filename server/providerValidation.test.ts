import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderInput } from '../src/rebuild/providerValidation';

test('detects common key and provider mismatches', () => {
  assert.match(validateProviderInput('openrouter', 'AIza-example', '')!, /gemini/);
  assert.match(validateProviderInput('openai', 'gsk_example', '')!, /groq/);
  assert.match(validateProviderInput('gemini', 'sk-or-example', '')!, /openrouter/);
  assert.equal(validateProviderInput('gemini', 'AIza-example', ''), null);
});
test('validates endpoint and allows keyless local Ollama', () => {
  assert.equal(validateProviderInput('ollama', '', 'http://localhost:11434/v1'), null);
  assert.ok(validateProviderInput('openai', '', ''));
  assert.ok(validateProviderInput('custom', 'key', 'http://example.com/v1'));
  assert.ok(validateProviderInput('custom', 'key', 'https://user:pass@example.com/v1'));
  assert.ok(validateProviderInput('gemini', 'AIza-example', 'https://other.example/v1'));
  assert.equal(validateProviderInput('custom', 'key', 'https://example.com/v1'), null);
});
