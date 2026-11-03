/** Validation for the optional provider relay. Never follow redirects with credentials. */
export const LLM_RELAY_ALLOWED_HOSTS = new Set([
  'generativelanguage.googleapis.com', 'api.groq.com', 'api.openai.com',
  'api.openrouter.ai', 'openrouter.ai', 'api.deepseek.com',
  'api.anthropic.com', 'api.cohere.ai', 'api.mistral.ai',
]);

export function isAllowedRelayUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return LLM_RELAY_ALLOWED_HOSTS.has(host) || host.endsWith('.openai.azure.com');
  } catch { return false; }
}

/** A redirect must be returned to the caller, never followed with provider credentials. */
export function fetchRelay(url: string, options: RequestInit, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return fetchImpl(url, { ...options, redirect: 'manual' });
}
