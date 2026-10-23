/**
 * KonkLancer Cloud Relay & Shared Feed Store (US-East-1 Virginia via Supabase Edge Function + PostgREST)
 *
 * Solves two hard physical constraints simultaneously on tablets in Iran:
 * 1. Bypasses browser CORS & Telegram blocks (`telegram.me/s/...`, `parscoders.com`) directly over Cloudflare HTTPS.
 * 2. Transparently relays Gemini (`AIza...`), Groq (`gsk_...`), OpenAI (`sk-...`), and OpenRouter requests from
 *    Virginia, USA (`us-east-1`) whenever direct browser requests hit geo-blocks (`403 User location is not supported`)
 *    or container/ISP network blocks — working even with VPN turned OFF.
 */

const SUPABASE_BASE_URL = 'https://rwuyuhjkitcnekpwmoml.supabase.co';
const SUPABASE_ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dXl1aGpraXRjbmVrcHdtb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgwMzYsImV4cCI6MjEwNzkzNDAzNn0.KnWmpopGmuhdeQ5x6sOUfa7pBqeqN57oJhzBSlkuzzs';

/**
 * High-speed US Edge Relay (Supabase Edge Function `konklancer-relay`).
 *
 * The legacy SQL RPCs (konklancer_llm_relay / konklancer_fetch_page) inherited
 * the `anon` role's `statement_timeout` (3s on this project), which killed every
 * LLM request over 3s with a 504. The edge function is stateless, has no SQL
 * timeout, and runs in Virginia (US-East-1) so geo-blocked LLM endpoints work
 * without a VPN.
 */
const EDGE_FUNCTION_BASE = `${SUPABASE_BASE_URL}/functions/konklancer-relay`;

function supabaseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_JWT,
    Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
  };
}

export async function fetchPageViaCloudRelay(targetUrl: string): Promise<{ ok: boolean; status: number; html: string }> {
  // Prefer telegram.me over t.me to avoid 302 app-redirect HTML stub
  const normalizedUrl = targetUrl.replace(/^https?:\/\/t\.me\/s\//i, 'https://telegram.me/s/');
  const res = await fetch(EDGE_FUNCTION_BASE, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({ target_url: normalizedUrl, mode: 'page' }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, html: '' };
  }
  const data = await res.json();
  return {
    ok: Boolean(data?.ok && data?.html),
    status: Number(data?.status || 0),
    html: String(data?.html || ''),
  };
}

export async function relayLLMRequestViaUS(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Response> {
  const res = await fetch(EDGE_FUNCTION_BASE, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({
      target_url: targetUrl,
      mode: 'llm',
      req_method: method.toUpperCase(),
      req_headers: headers,
      req_body: body ?? null,
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`خطای شبکه در رله ابری آمریکا (${res.status}): ${errTxt.slice(0, 140)}`);
  }

  const wrapped = await res.json();
  const status = Number(wrapped?.status) || 502;
  const bodyText = typeof wrapped?.bodyText === 'string' ? wrapped.bodyText : JSON.stringify(wrapped?.bodyText ?? {});
  return new Response(bodyText, {
    status: status >= 200 && status <= 599 ? status : 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function readCloudSyncedRows<T = any>(): Promise<T[]> {
  try {
    const res = await fetch(
      `${SUPABASE_BASE_URL}/rest/v1/konklancer_projects?select=payload&order=updated_at.desc&limit=300`,
      { headers: supabaseHeaders() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map((row: any) => row.payload as T).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function upsertCloudSyncedRows(rows: Array<{ id: string; [k: string]: any }>): Promise<void> {
  if (!rows.length) return;
  try {
    const payload = rows.slice(0, 150).map((r) => ({
      id: r.id,
      payload: r,
      updated_at: new Date().toISOString(),
    }));
    await fetch(`${SUPABASE_BASE_URL}/rest/v1/konklancer_projects?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking background cloud sync
  }
}
