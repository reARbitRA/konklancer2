/**
 * بررسی توکن Supabase (JWT) برای `/api/*`.
 *
 * علاوه بر `KONKLANCER_API_TOKEN`، اگر اپ با Supabase وارد شده باشد، همان
 * access_token در هدر `Authorization: Bearer <jwt>` فرستاده می‌شود و اینجا
 * اعتبارش بررسی می‌شود. اعتبارسنجی «محلی» است: امضای HS256 با
 * `SUPABASE_JWT_SECRET` (اگر تنظیم شده باشد) وگرنه کنترل ساختار + `exp`.
 * اگر secret نباشد، توکن بدون تأیید امضا پذیرفته **نمی‌شود**؛ فقط رد می‌شود،
 * مگر `KONKLANCER_TRUST_SUPABASE_JWT=true` باشد که صریحاً تأیید نشده است.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SupabaseClaims {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
  iat?: number;
  provider?: string;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { full_name?: string; avatar_url?: string; user_name?: string };
}

function base64UrlToBuffer(part: string): Buffer {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * اعتبارسنجی یک JWT Supabase.
 * @param token رشته‌ی توکن (بدون پیشوند Bearer)
 */
export function verifySupabaseJwt(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { ok: true; claims: SupabaseClaims } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };

  let claims: SupabaseClaims;
  try {
    claims = JSON.parse(base64UrlToBuffer(parts[1]).toString('utf8')) as SupabaseClaims;
  } catch {
    return { ok: false, reason: 'BAD_PAYLOAD' };
  }
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
    return { ok: false, reason: 'NO_SUBJECT' };
  }
  if (typeof claims.exp === 'number' && claims.exp + 30 < nowSeconds) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const secret = (env.SUPABASE_JWT_SECRET ?? '').trim();
  const header = (() => {
    try {
      return JSON.parse(base64UrlToBuffer(parts[0]).toString('utf8')) as { alg?: string };
    } catch {
      return {} as { alg?: string };
    }
  })();

  if (header.alg !== 'HS256') {
    // توکن‌های ES256/RS256 را بدون JWKS نمی‌توان تأیید کرد
    if (env.KONKLANCER_TRUST_SUPABASE_JWT !== 'true') return { ok: false, reason: 'UNSUPPORTED_ALG' };
    return { ok: true, claims };
  }

  if (!secret) {
    if (env.KONKLANCER_TRUST_SUPABASE_JWT === 'true') return { ok: true, claims };
    return { ok: false, reason: 'NO_SECRET' };
  }

  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const provided = base64UrlToBuffer(parts[2]);
  if (!safeEqual(expected, provided)) return { ok: false, reason: 'BAD_SIGNATURE' };

  return { ok: true, claims };
}

/** توکن Bearer را از هدر می‌خواند؛ فقط اگر شبیه JWT باشد برمی‌گرداند. */
export function extractBearerJwt(authHeader: string | undefined): string | null {
  if (typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1];
  return token.split('.').length === 3 ? token : null;
}
