/** Shared browser helpers for the application's authenticated API routes. */
import { getAuthAccessToken } from '../services/authToken';

export const API_TOKEN_STORAGE_KEY = 'konklancer_api_token';
export const API_TOKEN_CHANGED_EVENT = 'konklancer:api-token-updated';
let memoryApiToken = '';

export function readApiToken(): string {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(API_TOKEN_STORAGE_KEY) : null;
    if (stored) return stored;
  } catch {
    // Fall back to memory for Android WebViews/file-based clients that block storage.
  }
  return memoryApiToken;
}

export function writeApiToken(token: string): void {
  const clean = token.trim();
  memoryApiToken = clean;
  if (typeof window === 'undefined') return;
  try {
    if (clean) window.localStorage.setItem(API_TOKEN_STORAGE_KEY, clean);
    else window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  } catch {
    // The current session can still use the in-memory token.
  }
  window.dispatchEvent(new Event(API_TOKEN_CHANGED_EVENT));
}

/** Build application API headers. This token is not a provider/gateway key. */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readApiToken();
  const jwt = getAuthAccessToken();
  return {
    ...extra,
    ...(token ? { 'x-api-token': token } : {}),
    ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
  };
}

/** Fetch an internal API route with the current relay token and optional user JWT. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isInternalApi = path.startsWith('/api');
  const headers = isInternalApi ? apiHeaders((init.headers as Record<string, string>) ?? {}) : init.headers;
  return fetch(path, { ...init, headers });
}
