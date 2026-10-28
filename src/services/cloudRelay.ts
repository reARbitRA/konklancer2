/**
 * Client for Konkred gateway calls plus the read-only Supabase page relay.
 * LLM requests carry only an application relay token; provider keys and model
 * selection stay behind the Konkred gateway.
 */
import { readApiToken } from '../utils/apiFetch';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_PROJECT_URL,
  SUPABASE_RELAY_URL,
  VERCEL_RELAY_URL,
} from '../../shared/relayConfig';

export type GatewayTaskType = 'extraction' | 'summarization' | 'general' | 'code-generation';

export interface GatewayLLMRequest {
  taskType?: GatewayTaskType;
  prompt: string;
  system?: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
  privacy?: 'any' | 'strict';
}

export interface GatewayLLMResult {
  text: string;
  model: string;
  provider: string;
  cached: boolean;
}

function supabaseHeaders(): Record<string, string> {
  const token = readApiToken();
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(token ? { 'x-api-token': token } : {}),
  };
}

/** The HTML relay is read-only and protected by the same per-device relay token. */
export async function fetchPageViaCloudRelay(targetUrl: string): Promise<{ ok: boolean; status: number; html: string }> {
  const normalizedUrl = targetUrl.replace(/^https?:\/\/t\.me\/s\//i, 'https://telegram.me/s/');
  try {
    const response = await fetch(SUPABASE_RELAY_URL, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ target_url: normalizedUrl, mode: 'page' }),
    });
    if (!response.ok) return { ok: false, status: response.status, html: '' };
    const data = await response.json();
    return {
      ok: Boolean(data?.ok && data?.html),
      status: Number(data?.status || 0),
      html: String(data?.html || ''),
    };
  } catch {
    return { ok: false, status: 0, html: '' };
  }
}

function describeGatewayFailure(payload: any, status: number): Error {
  const message = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.error?.message === 'string'
      ? payload.error.message
      : `Gateway API returned HTTP ${status}.`;
  const error = new Error(message) as Error & { code?: string; status?: number; retryAfterSeconds?: number };
  error.code = typeof payload?.code === 'string' ? payload.code : undefined;
  error.status = status;
  error.retryAfterSeconds = Number(payload?.retryAfterSeconds) || undefined;
  return error;
}

/**
 * Check end-to-end gateway readiness without spending inference tokens. The
 * health route validates this device's relay token, the server-side caller key,
 * gateway authentication, and current model capacity.
 */
export async function isKonkredGatewayReady(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = readApiToken();
  if (!token) return false;

  const productionOrigin = new URL(VERCEL_RELAY_URL).origin;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const healthUrl = `${productionOrigin}/api/llm/relay-health`;
  const urls = ['/api/llm/relay-health'];
  if (currentOrigin !== productionOrigin) urls.push(healthUrl);

  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-api-token': token },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (response.ok && payload?.success === true && payload?.gateway?.ready === true) return true;
    } catch {
      // Try the configured production adapter if the current origin has no API.
    }
  }
  return false;
}

/** Send one task-aware request to the app's server-side Konkred gateway adapter. */
export async function requestKonkredGateway(request: GatewayLLMRequest): Promise<GatewayLLMResult> {
  const token = readApiToken();
  if (!token) {
    throw new Error('برای استفاده از هوش مصنوعی، توکن KONKLANCER_RELAY_TOKEN را در تنظیمات همین دستگاه وارد کنید.');
  }

  const headers = { 'Content-Type': 'application/json', 'x-api-token': token };
  const body = JSON.stringify({
    taskType: request.taskType || 'general',
    user: request.prompt,
    ...(request.system ? { system: request.system } : {}),
    ...(request.json !== undefined ? { json: request.json } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
    ...(request.cacheKey ? { cacheKey: request.cacheKey } : {}),
    ...(request.privacy ? { privacy: request.privacy } : {}),
  });
  const urls: string[] = ['/api/llm/relay'];
  const vercelOrigin = new URL(VERCEL_RELAY_URL).origin;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (currentOrigin !== vercelOrigin) urls.push(VERCEL_RELAY_URL);

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body });
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.success !== true || typeof payload?.text !== 'string') {
        const failure = describeGatewayFailure(payload, response.status);
        // A bad relay token cannot be repaired by trying a second endpoint.
        if (response.status === 401) throw failure;
        lastError = failure;
        continue;
      }
      if (typeof payload.model !== 'string' || !payload.model.trim()) {
        throw new Error('درگاه Konkred نام مدل پاسخ را برنگرداند.');
      }
      return {
        text: payload.text,
        model: payload.model,
        provider: typeof payload.provider === 'string' ? payload.provider : 'gateway',
        cached: Boolean(payload.cached),
      };
    } catch (error) {
      if (error instanceof Error && /Invalid or missing relay token|توکن/.test(error.message)) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`درگاه هوش مصنوعی در دسترس نیست. ${lastError?.message || 'بررسی تنظیمات و اتصال لازم است.'}`);
}

export async function readCloudSyncedRows<T = any>(): Promise<T[]> {
  try {
    const response = await fetch(
      `${SUPABASE_PROJECT_URL}/rest/v1/konklancer_projects?select=payload&order=updated_at.desc&limit=300`,
      { headers: supabaseHeaders() },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.map((row: any) => row.payload as T).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function upsertCloudSyncedRows(rows: Array<{ id: string; [k: string]: any }>): Promise<void> {
  if (!rows.length) return;
  try {
    const payload = rows.slice(0, 150).map((row) => ({
      id: row.id,
      payload: row,
      updated_at: new Date().toISOString(),
    }));
    await fetch(`${SUPABASE_PROJECT_URL}/rest/v1/konklancer_projects?on_conflict=id`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking background cloud sync.
  }
}
