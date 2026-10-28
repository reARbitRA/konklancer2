/**
 * Non-LLM cloud helpers for scanner page fetching and optional feed synchronization.
 * Browser LLM calls use the selected provider directly and do not import this module's relay helpers.
 */

const SUPABASE_BASE_URL = 'https://rwuyuhjkitcnekpwmoml.supabase.co';
const SUPABASE_ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dXl1aGpraXRjbmVrcHdtb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgwMzYsImV4cCI6MjEwNzkzNDAzNn0.KnWmpopGmuhdeQ5x6sOUfa7pBqeqN57oJhzBSlkuzzs';

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
