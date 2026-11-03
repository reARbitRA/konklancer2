// Classify only explicit OpenRouter token prices; other fees and tiers are unknown.
function tokenPrice(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}
export function tokenPriceCategory(provider, pricing) {
  if (provider !== 'openrouter' || !pricing || typeof pricing !== 'object') return 'unknown';
  const input = tokenPrice(pricing.prompt), output = tokenPrice(pricing.completion);
  if (input === null || output === null) return 'unknown';
  return input === 0 && output === 0 ? 'free' : 'paid';
}
