/**
 * احراز هویت اختیاری برای `/api/*` (SPEC-003 R5).
 *
 * اگر `KONKLANCER_API_TOKEN` تنظیم نشده باشد سرور مثل قبل باز است (حالت شخصی
 * روی localhost). اگر تنظیم شده باشد، همه‌ی درخواست‌های API باید توکن را در
 * هدر `x-api-token` (یا `Authorization: Bearer ...` یا `?token=`) بفرستند.
 */
import type { Request, Response, NextFunction } from 'express';

export const API_TOKEN_HEADER = 'x-api-token';

/** مسیرهایی که حتی با توکن فعال هم باز می‌مانند (سلامت سرویس برای مانیتورینگ). */
const PUBLIC_PATHS = new Set(['/health', '/api/health']);

export function readApiToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.KONKLANCER_API_TOKEN ?? '').trim();
  return raw.length >= 8 ? raw : null;
}

export function extractToken(req: Request): string | null {
  const header = req.headers[API_TOKEN_HEADER];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  return null;
}

export function isAuthorized(req: Request, expected: string | null): boolean {
  if (!expected) return true;
  const provided = extractToken(req);
  if (!provided) return false;
  return timingSafeEqualStrings(provided, expected);
}

/** مقایسه‌ی طول-ثابت تا زمان پاسخ نشت نکند. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function createApiTokenGuard(expected: string | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) return next();
    if (PUBLIC_PATHS.has(req.path) || PUBLIC_PATHS.has(req.originalUrl.split('?')[0])) return next();
    if (isAuthorized(req, expected)) return next();
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error:
        'این API توکن دارد. مقدار KONKLANCER_API_TOKEN را در هدر x-api-token بفرستید (یا آن را از .env بردارید).',
    });
  };
}

/** وضعیت قابل نمایش در UI (بدون افشای خود توکن). */
export function describeApiAuth(expected: string | null): { enabled: boolean; header: string } {
  return { enabled: Boolean(expected), header: API_TOKEN_HEADER };
}
