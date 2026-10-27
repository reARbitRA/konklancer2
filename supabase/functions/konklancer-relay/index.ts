// Konklancer — US Edge Relay (Virginia, us-east-1)
// Forwards LLM API calls from the browser through Supabase Edge infrastructure
// so that geo-blocked providers (Gemini 400 "User location is not supported",
// Groq 403, OpenAI 403) work without VPN for users in Iran.
//
// Why this exists: Direct browser fetch from an Iranian IP is rejected by
// Google/Groq. Routing through this Edge Function makes the request originate
// from Supabase's US-East-1 datacenter (Cloudflare), bypassing the geo-block.
//
// Contract:
//   POST /functions/v1/konklancer-relay
//   Body: { target_url: string, mode: "llm"|"page", req_method?, req_headers?, req_body? }
//   Response: { ok, status, bodyText, headers? }  (for mode=llm)
//             { ok, status, html }                (for mode=page)
//
// Security: allow-listed hosts only (no open SSRF proxy). anon/publishable key is public by design.
// verify_jwt: false (relies on allow-list + anon key, not user session).

const ALLOWED_HOSTS = new Set([
  // LLM providers
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.openai.com',
  'openrouter.ai',
  'api.openrouter.ai',
  'api.deepseek.com',
  'api.anthropic.com',
  'api.cohere.ai',
  'api.mistral.ai',
  // scraping / feed relay
  't.me',
  'telegram.me',
  'telegram.org',
  'parscoders.com',
  'www.parscoders.com',
  'ponisha.ir',
  'www.ponisha.ir',
  'karlancer.com',
  'www.karlancer.com',
  'kwork.ir',
  'www.kwork.ir',
]);

const ALLOWED_SUFFIXES = [
  '.googleapis.com',
  '.openai.azure.com',
];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  return ALLOWED_SUFFIXES.some((suf) => h.endsWith(suf));
}

const ALLOWED_ORIGINS = [
  'https://www.konkred.xyz',
  'https://konkred.xyz',
  'https://konklancer2.vercel.app',
  'https://reARbitRA.github.io',
  'http://localhost:3000',
  'http://localhost:24678',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:24678',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.e2b\.app$/i.test(origin))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-token, x-custom-llm, x-custom-llm-b64',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const json = (body: unknown, status: number, origin: string | null, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed — POST only' }, 405, origin);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400, origin);
  }

  const targetUrl: string = body?.target_url?.trim?.() || body?.targetUrl?.trim?.() || '';
  if (!targetUrl) {
    return json({ ok: false, error: 'target_url required' }, 400, origin);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return json({ ok: false, error: 'Invalid target_url' }, 400, origin);
  }

  if (!isAllowedHost(parsed.hostname)) {
    return json({ ok: false, error: `Host not allow-listed: ${parsed.hostname}`, allowed: [...ALLOWED_HOSTS] }, 403, origin);
  }

  const mode: string = body?.mode || 'llm';

  // ── mode = page: fetch HTML (telegram / parscoders) ───────────────
  if (mode === 'page') {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (KonkLancer Relay; +https://konkred.xyz)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await res.text();
      return json({ ok: res.ok, status: res.status, html, url: targetUrl }, 200, origin);
    } catch (e: any) {
      return json({ ok: false, status: 0, html: '', error: e?.message || String(e) }, 502, origin);
    }
  }

  // ── mode = llm (default): proxy LLM request ────────────────────────
  const reqMethod: string = (body?.req_method || body?.method || 'POST').toUpperCase();
  const reqHeadersIn: Record<string, string> = body?.req_headers || body?.headers || {};
  const reqBody: string | null = body?.req_body ?? body?.body ?? null;

  // Forward only safe headers; strip host-specific ones
  const forwardHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeadersIn)) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'content-length' || lk === 'connection') continue;
    forwardHeaders[k] = String(v);
  }
  if (!forwardHeaders['Content-Type'] && !forwardHeaders['content-type']) {
    forwardHeaders['Content-Type'] = 'application/json';
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: reqMethod,
      headers: forwardHeaders,
      body: reqBody != null ? reqBody : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    const bodyText = await upstream.text();

    // Pass through status + body; client reconstructs Response
    return json(
      {
        ok: upstream.ok,
        status: upstream.status,
        bodyText,
        headers: Object.fromEntries(upstream.headers.entries()),
      },
      200,
      origin,
    );
  } catch (e: any) {
    const msg = e?.message || String(e);
    const isTimeout = e?.name === 'TimeoutError' || /timeout|aborted/i.test(msg);
    return json({ ok: false, status: 0, bodyText: '', error: `Relay fetch failed: ${msg}`, timeout: isTimeout }, 502, origin);
  }
});
