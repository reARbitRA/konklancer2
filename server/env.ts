/** Validate configured integrations, never require optional enrichment for raw scanning. */
export function validateEnvironment(env: NodeJS.ProcessEnv): void {
  const value = (name: string) => (env[name] ?? '').trim();
  const pair = (a: string, b: string) => {
    if (Boolean(value(a)) !== Boolean(value(b))) throw new Error(`${a} and ${b} must be configured together`);
  };
  if (value('KONKLANCER_API_TOKEN') && value('KONKLANCER_API_TOKEN').length < 8) throw new Error('KONKLANCER_API_TOKEN must contain at least 8 characters');
  pair('KONKLANCER_TELEGRAM_BOT_TOKEN', 'KONKLANCER_TELEGRAM_CHAT_ID');
  if (value('KONKLANCER_TELEGRAM_BOT_TOKEN') && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(value('KONKLANCER_TELEGRAM_BOT_TOKEN'))) throw new Error('Malformed Telegram bot token');
  if (value('KONKLANCER_TELEGRAM_CHAT_ID') && !/^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(value('KONKLANCER_TELEGRAM_CHAT_ID'))) throw new Error('Malformed Telegram chat ID');
  if (value('KONKRED_GATEWAY_URL') && !value('KONKRED_API_KEY')) throw new Error('KONKRED_API_KEY required for configured gateway');
  for (const name of ['SUPABASE_URL', 'KONKRED_GATEWAY_URL']) {
    if (!value(name)) continue;
    const url = new URL(value(name));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(`Invalid ${name}`);
  }
  if (value('SUPABASE_SERVICE_ROLE_KEY') && !value('SUPABASE_URL')) throw new Error('SUPABASE_URL required for service key');
  if (value('TELEGRAM_BOT_TOKEN') && (!value('SUPABASE_SERVICE_ROLE_KEY') || !value('SUPABASE_URL'))) throw new Error('Telegram login requires Supabase admin configuration');
  for (const [name, min, max] of [['PORT', 1, 65535], ['KONKRED_TIMEOUT_MS', 1000, 60000], ['KONKLANCER_HTTP_TIMEOUT', 1, 60], ['KONKLANCER_SCAN_TIMEOUT_MS', 1000, 900000], ['KONKLANCER_ALERT_THRESHOLD', 0, 100]] as const) {
    if (value(name) && (!Number.isFinite(Number(value(name))) || Number(value(name)) < min || Number(value(name)) > max)) throw new Error(`Invalid ${name}: expected ${min}..${max}`);
  }
  for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'KONKRED_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (value(name) && (/\s/.test(value(name)) || /^(?:your[_-]|replace|placeholder|changeme)/i.test(value(name)))) throw new Error(`Malformed ${name}`);
  }
  if (value('KONKLANCER_ALERT_PROFILE') && !['score', 'high-intent'].includes(value('KONKLANCER_ALERT_PROFILE'))) throw new Error('Invalid KONKLANCER_ALERT_PROFILE');
}
