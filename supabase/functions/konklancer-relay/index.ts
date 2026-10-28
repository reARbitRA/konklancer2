// Konklancer's Supabase Edge relay is reserved for public HTML page fetching.
// All LLM traffic must use the Konkred gateway through /api/llm/relay.
//
// Contract:
//   POST /functions/v1/konklancer-relay
//   Headers: x-api-token: <KONKLANCER_RELAY_TOKEN>
//   Body: { target_url: string, mode: "page" }
//   Response: { ok, status, html, url }
//
// No provider credentials are read or injected by this function.

const ALLOWED_HOSTS = new Set([
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

const ALLOWED_ORIGINS = new Set([
  'https://www.konkred.xyz',
  'https://konkred.xyz',
  'https://konklancer2.vercel.app',
  'https://reARBitRA.github.io',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:24678',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:24678',
  'capacitor://localhost',
]);

const MAX_URL_LENGTH = 4_096;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin || origin === 'null' || ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && (
      hostname.endsWith('.e2b.app') ||
      (hostname.endsWith('.vercel.app') && (hostname === 'konklancer2.vercel.app' || hostname.startsWith('konklancer2-')))
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8',
    },
  });

function relayTokenMatches(provided: string, expected: string): boolean {
  const actual = provided.trim();
  const secret = expected.trim();
  if (secret.length < 8 || actual.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ secret.charCodeAt(index);
  return difference === 0;
}

function validatePageUrl(raw: string): URL | null {
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    ) return null;
    return url;
  } catch {
    return null;
  }
}

async function readLimitedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new Error('HTML page is too large.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error('HTML page is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchAllowedPage(initialUrl: URL): Promise<{ response: Response; url: string }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (KonkLancer Page Relay; +https://konkred.xyz)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status < 300 || response.status > 399) return { response, url: url.toString() };
    const location = response.headers.get('location');
    if (!location) return { response, url: url.toString() };
    const nextUrl = validatePageUrl(new URL(location, url).toString());
    if (!nextUrl) throw new Error('Redirect target is not allow-listed.');
    url = nextUrl;
  }
  throw new Error('Too many redirects.');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (origin && !isAllowedOrigin(origin)) {
    return json({ ok: false, error: 'Origin not allowed.' }, 403, origin);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed — POST only.' }, 405, origin);

  const expectedToken = Deno.env.get('KONKLANCER_RELAY_TOKEN')?.trim() || Deno.env.get('KONKLANCER_API_TOKEN')?.trim() || '';
  if (expectedToken.length < 8) return json({ ok: false, error: 'Relay access token is not configured.' }, 503, origin);
  if (!relayTokenMatches(req.headers.get('x-api-token') || '', expectedToken)) {
    return json({ ok: false, error: 'Invalid or missing relay token.' }, 401, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400, origin);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'A JSON object is required.' }, 400, origin);
  }

  const payload = body as Record<string, unknown>;
  if (payload.mode !== 'page') {
    return json({ ok: false, code: 'LLM_RELAY_DISABLED', error: 'LLM requests must use the Konkred gateway.' }, 410, origin);
  }
  const rawTarget = typeof payload.target_url === 'string'
    ? payload.target_url.trim()
    : typeof payload.targetUrl === 'string'
      ? payload.targetUrl.trim()
      : '';
  const targetUrl = validatePageUrl(rawTarget);
  if (!targetUrl) return json({ ok: false, error: 'Invalid or non-allow-listed HTTPS page URL.' }, 400, origin);

  try {
    const { response, url } = await fetchAllowedPage(targetUrl);
    const html = await readLimitedHtml(response);
    return json({ ok: response.ok, status: response.status, html, url }, 200, origin);
  } catch (error: any) {
    const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'Page relay timed out.'
      : error instanceof Error && error.message === 'HTML page is too large.'
        ? error.message
        : error instanceof Error && (error.message === 'Too many redirects.' || error.message === 'Redirect target is not allow-listed.')
          ? error.message
          : 'Page relay request failed.';
    return json({ ok: false, status: 0, html: '', error: message }, 502, origin);
  }
});
