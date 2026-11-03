import type { LLMProviderId } from '../types';

/** Detect obvious key/provider mismatches before they create a broken profile. */
export function validateProviderInput(provider: LLMProviderId, key: string, endpoint: string): string | null {
  const clean = key.trim();
  if (!clean && provider !== 'ollama') return 'Enter an API key on this device.';
  const expected = clean.startsWith('AIza') ? 'gemini' : clean.startsWith('gsk_') ? 'groq' : clean.startsWith('sk-or-') ? 'openrouter' : null;
  if (expected && provider !== expected) return `This key appears to be for ${expected}. Select that provider before saving.`;
  if (endpoint.trim()) {
    try {
      const url = new URL(endpoint.trim());
      if (provider === 'gemini' && (url.origin !== 'https://generativelanguage.googleapis.com' || !['', '/', '/v1beta', '/v1beta/'].includes(url.pathname))) return 'Gemini requires its standard Google endpoint.';
      if (url.username || url.password || (url.protocol !== 'https:' && !(provider === 'ollama' && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) return 'Use an HTTPS endpoint without embedded credentials (or a local Ollama address).';
    } catch { return 'Enter a valid endpoint URL.'; }
  }
  return null;
}
