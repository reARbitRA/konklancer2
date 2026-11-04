/**
 * SPEC-013 — Client for the personal AI gateway (`/api/ai`).
 * The browser only talks to the app's own server; provider keys never reach the client.
 * (File name kept from the retired SPEC-011 "managed models" path so imports stay stable.)
 */
import type { CatalogModel } from '../../shared/modelCatalog';

export type ManagedModel = CatalogModel & {
  capabilities?: string[];
  context?: number;
  freeTier?: boolean;
  chat?: boolean;
  source?: 'live' | 'curated';
};

export const AUTO_MODEL: ManagedModel = { provider: 'auto', id: 'auto', name: 'خودکار — بهترین رایگان', priceCategory: 'free' };

const STORAGE = 'konklancer_managed_model';
const GATEWAY_URL_KEY = 'konklancer_gateway_url';
const OWNER_TOKEN_KEY = 'konklancer_api_token'; // same one-time token as Settings → API security

function lsGet(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function lsSet(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* storage optional */ }
}

export function readManagedModel(): ManagedModel | null {
  try {
    const m = JSON.parse(lsGet(STORAGE) || 'null');
    return m && typeof m.provider === 'string' && typeof m.id === 'string' ? m : null;
  } catch { return null; }
}
export function saveManagedModel(model: ManagedModel) { lsSet(STORAGE, JSON.stringify(model)); }
export function clearManagedModel() { lsSet(STORAGE, ''); }

/** For the Android APK / static builds: absolute URL of the deployed gateway (e.g. https://konklancer2.vercel.app). Empty = same origin. */
export function readGatewayBase(): string { return lsGet(GATEWAY_URL_KEY).trim().replace(/\/+$/, ''); }
export function saveGatewayBase(url: string) { lsSet(GATEWAY_URL_KEY, url.trim().replace(/\/+$/, '')); }
export function readOwnerToken(): string { return lsGet(OWNER_TOKEN_KEY).trim(); }

export class GatewayUnavailableError extends Error {
  code = 'GATEWAY_UNAVAILABLE';
}

async function gatewayFetch(path: string, init: RequestInit = {}, timeoutMs = 75_000): Promise<any> {
  const token = readOwnerToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${readGatewayBase()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-owner-token': token, 'x-api-token': token } : {}), ...(init.headers as Record<string, string> | undefined) },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    throw new GatewayUnavailableError('درگاه AI روی سرور در دسترس نیست (شبکه یا استقرار).');
  } finally {
    clearTimeout(timer);
  }
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    // Static hosting / APK without the server function, or a protection login page.
    throw new GatewayUnavailableError('درگاه AI روی این نسخه فعال نیست؛ نسخه وبِ مستقر روی Vercel را باز کنید یا آدرس درگاه را در تنظیمات وارد کنید.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) throw new GatewayUnavailableError('درگاه AI روی این نسخه فعال نیست.');
    const err: any = new Error(typeof data.error === 'string' ? data.error : `خطا در درگاه AI (${response.status}).`);
    err.code = typeof data.code === 'string' ? data.code : 'AI_UNAVAILABLE';
    err.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    err.status = response.status;
    throw err;
  }
  return data;
}

export interface GatewayHealthProvider { provider: string; label: string; tier: string; configured: boolean; keyCount: number }
export async function getGatewayHealth(): Promise<{ ok: boolean; authMode: string; configuredCount: number; providers: GatewayHealthProvider[] }> {
  return gatewayFetch('/api/ai?action=health', {}, 20_000);
}

export async function listManagedModels(refresh = false): Promise<{ providers: { provider: string; label?: string; tier?: string; configured?: boolean; models: ManagedModel[]; error?: string }[] }> {
  return gatewayFetch(`/api/ai?action=models${refresh ? '&refresh=1' : ''}`, {}, 45_000);
}

export interface GatewayCallOptions {
  task?: string;
  prompt: string;
  systemPrompt?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: ManagedModel | null;
  strict?: boolean;
}

export async function callGatewayAI(opts: GatewayCallOptions): Promise<{ text: string; model: string; provider: string; attempts?: unknown[]; latencyMs?: number }> {
  const model = opts.model ?? readManagedModel();
  const explicit = model && model.provider !== 'auto' && model.id !== 'auto' ? model : null;
  return gatewayFetch('/api/ai', {
    method: 'POST',
    body: JSON.stringify({
      task: opts.task || 'general',
      prompt: opts.prompt,
      system: opts.systemPrompt || '',
      json: Boolean(opts.json),
      ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(explicit ? { provider: explicit.provider, model: explicit.id } : {}),
      ...(opts.strict ? { strict: true } : {}),
    }),
  }, 90_000);
}

/** Backwards-compatible wrapper used by older call sites. */
export async function callManagedModel(model: ManagedModel, opts: { prompt: string; systemPrompt?: string; json?: boolean; maxTokens?: number; task?: string }) {
  return callGatewayAI({ ...opts, model });
}

export async function testGateway(): Promise<{ text: string; model: string; provider: string; latencyMs: number }> {
  const started = Date.now();
  const r = await callGatewayAI({ task: 'triage', prompt: 'فقط بنویس: اتصال برقرار شد', maxTokens: 64, temperature: 0 });
  return { ...r, latencyMs: r.latencyMs ?? Date.now() - started };
}

export async function generateImageViaGateway(prompt: string, size = '1024x1024'): Promise<{ provider: string; model: string; url?: string; dataUrl?: string }> {
  return gatewayFetch('/api/ai', { method: 'POST', body: JSON.stringify({ action: 'image', prompt, size }) }, 90_000);
}
