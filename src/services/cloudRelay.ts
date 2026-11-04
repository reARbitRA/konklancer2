import { canonicalUrl, cleanBids } from '../../shared/listing';
import { boundedFetch } from '../../shared/http';
/**
 * Non-LLM cloud helpers for scanner page fetching and optional feed synchronization.
 * Browser LLM calls use the selected provider directly and do not import this module's relay helpers.
 */

const SUPABASE_BASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_JWT = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
/** Existing read-only scanner page relay; never used for LLM inference. */
const EDGE_FUNCTION_BASE = `${SUPABASE_BASE_URL}/functions/konklancer-relay`;

function supabaseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_JWT,
    Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
  };
}

export async function fetchPageViaCloudRelay(targetUrl: string): Promise<{ ok: boolean; status: number; html: string }> {
  if (!SUPABASE_BASE_URL || !SUPABASE_ANON_JWT) return { ok: false, status: 0, html: '' };
  // Prefer telegram.me over t.me to avoid 302 app-redirect HTML stub
  const normalizedUrl = targetUrl.replace(/^https?:\/\/t\.me\/s\//i, 'https://telegram.me/s/');
  const res = await boundedFetch(EDGE_FUNCTION_BASE, {
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


export async function readCloudSyncedRows<T = any>(): Promise<T[]> {
  if (!SUPABASE_BASE_URL || !SUPABASE_ANON_JWT) return [];
  try {
    const res = await boundedFetch(
      `${SUPABASE_BASE_URL}/rest/v1/konklancer_projects?select=payload&order=updated_at.desc&limit=300`,
      { headers: supabaseHeaders() },
    );
    if (!res.ok) throw new Error(`Cloud feed HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data.map((row: any) => row.payload as T).filter(Boolean) : [];
  } catch {
    console.warn('[cloud] feed unavailable; using local records');
    return [];
  }
}

export async function upsertCloudSyncedRows(rows: Array<{ id: string; [k: string]: any }>): Promise<void> {
  if (!rows.length || !SUPABASE_BASE_URL || !SUPABASE_ANON_JWT) return;
  try {
    const payload = rows.slice(0, 150).map((r) => ({
      id: canonicalUrl(r.url),
      payload: { ...r, url: canonicalUrl(r.url), bids_text: cleanBids(r.bids_text) },
      updated_at: new Date().toISOString(),
    }));
    const response = await boundedFetch(`${SUPABASE_BASE_URL}/rest/v1/konklancer_projects?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Cloud sync HTTP ${response.status}`);
  } catch {
    console.warn('[cloud] sync failed; local records retained');
  }
}
