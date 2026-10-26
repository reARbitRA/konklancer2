/**
 * fetch یکدست برای `/api/*` که توکن اختیاری سرور را هم می‌فرستد (SPEC-003 R5).
 *
 * اگر `KONKLANCER_API_TOKEN` روی سرور تنظیم شده باشد، همه‌ی درخواست‌های API
 * باید توکن داشته باشند. توکن در تنظیمات (و در localStorage) نگه‌داری می‌شود.
 */
export const API_TOKEN_STORAGE_KEY = 'konklancer_api_token';

export function readApiToken(): string {
  try {
    return window.localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeApiToken(token: string): void {
  try {
    const clean = token.trim();
    if (clean) window.localStorage.setItem(API_TOKEN_STORAGE_KEY, clean);
    else window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  } catch {
    // توکن اختیاری است؛ نبودِ storage نباید برنامه را بشکند
  }
}

/** هدرهای پایه‌ی API همراه توکن (در صورت وجود). */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readApiToken();
  return { ...extra, ...(token ? { 'x-api-token': token } : {}) };
}

/** fetch روی مسیرهای داخلی با توکن. مسیرهای خارجی (http…) دست‌نخورده می‌مانند. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isInternalApi = path.startsWith('/api');
  const headers = isInternalApi ? apiHeaders((init.headers as Record<string, string>) ?? {}) : init.headers;
  return fetch(path, { ...init, headers });
}
