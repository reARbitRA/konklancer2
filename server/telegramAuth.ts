/**
 * ورود تلگرام در سمت سرور Node (هم‌ارز Edge Function `telegram-auth`).
 *
 * چرا دو پیاده‌سازی؟ Supabase provider بومی تلگرام ندارد. دو مسیر استقرار داریم:
 *  1. پروژه‌ی Supabase با Edge Function (برای اپ میزبانی‌شده روی konkred.xyz)
 *  2. همین سرور Express (برای اجرای محلی/خودمیزبان روی سرور خودتان)
 * هر دو از یک الگوریتم استفاده می‌کنند: HMAC-SHA256 با کلید SHA256(bot_token)
 * روی data_check_string ساخته‌شده از فیلدهای مرتب‌شده.
 *
 * توکن ربات و service role key هرگز به مرورگر نمی‌روند؛ فقط اینجا خوانده می‌شوند.
 */
import type { Request, Response } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24;

export type TelegramPayload = Record<string, string | number | undefined>;

export type VerifyResult =
  | { ok: true; telegramId: number; username: string | null }
  | { ok: false; code: string; message: string };

/** ساخت data_check_string به ترتیب الفبایی و بدون فیلد hash. */
export function buildDataCheckString(payload: TelegramPayload): string {
  const NL = String.fromCharCode(10);
  return Object.keys(payload)
    .filter((key) => key !== 'hash')
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join(NL);
}

/** امضای مورد انتظار ویجت تلگرام (hex). */
export function computeTelegramHash(payload: TelegramPayload, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken, 'utf8').digest();
  return createHmac('sha256', secretKey).update(buildDataCheckString(payload), 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

/**
 * بررسی کامل پیام امضاشده‌ی ویجت: امضا، تازگی (۲۴ ساعت) و شناسه.
 * خالص و قابل تست؛ هیچ I/O ندارد.
 */
export function verifyTelegramPayload(
  payload: TelegramPayload,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const hash = typeof payload.hash === 'string' ? payload.hash : '';
  if (hash.length !== 64) {
    return { ok: false, code: 'MISSING_HASH', message: 'امضای تلگرام در درخواست نیست.' };
  }
  const expected = computeTelegramHash(payload, botToken);
  if (!safeEqualHex(expected, hash)) {
    return { ok: false, code: 'BAD_SIGNATURE', message: 'امضای تلگرام معتبر نیست.' };
  }
  const authDate = Number(payload.auth_date ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, code: 'STALE', message: 'زمان ورود تلگرام در درخواست نیست.' };
  }
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, code: 'STALE', message: 'این ورود منقضی شده است؛ دوباره از ویجت تلگرام وارد شوید.' };
  }
  const telegramId = Number(payload.id ?? 0);
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return { ok: false, code: 'BAD_ID', message: 'شناسه‌ی تلگرام معتبر نیست.' };
  }
  return { ok: true, telegramId, username: typeof payload.username === 'string' ? payload.username : null };
}

export interface TelegramAuthEnv {
  TELEGRAM_BOT_TOKEN?: string;
  KONKLANCER_TELEGRAM_BOT_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TELEGRAM_ALLOWED_IDS?: string;
  TELEGRAM_BOT_USERNAME?: string;
}

export interface TelegramAuthDeps {
  env?: TelegramAuthEnv;
  fetchImpl?: typeof fetch;
  nowSeconds?: () => number;
}

export function readBotToken(env: TelegramAuthEnv): string {
  return (env.TELEGRAM_BOT_TOKEN || env.KONKLANCER_TELEGRAM_BOT_TOKEN || '').trim();
}

export function readAllowedIds(env: TelegramAuthEnv): number[] {
  return (env.TELEGRAM_ALLOWED_IDS ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/** یک `token_hash` یک‌بارمصرف از Supabase می‌گیرد (بدون ارسال کلید به مرورگر). */
async function mintMagicLinkToken(
  env: TelegramAuthEnv,
  fetchImpl: typeof fetch,
  email: string,
): Promise<{ ok: true; tokenHash: string } | { ok: false; code: string; message: string }> {
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'SUPABASE_URL یا SUPABASE_SERVICE_ROLE_KEY تنظیم نشده است.' };
  }
  try {
    const response = await fetchImpl(`${base}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    const body: any = await response.json().catch(() => null);
    if (response.ok && body?.hashed_token) {
      return { ok: true, tokenHash: String(body.hashed_token) };
    }
    // اگر کاربر وجود نداشت، بسازیم و دوباره تلاش کنیم
    if (body?.error_code === 'user_not_found' || /not found|no user/i.test(body?.msg || body?.message || '')) {
      const created = await fetchImpl(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
        body: JSON.stringify({ email, email_confirm: true, user_metadata: { provider_label: 'telegram' } }),
      });
      if (!created.ok) {
        const detail: any = await created.json().catch(() => null);
        return { ok: false, code: 'USER_CREATE_FAILED', message: detail?.msg || detail?.message || `HTTP ${created.status}` };
      }
      const retry = await fetchImpl(`${base}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
        body: JSON.stringify({ type: 'magiclink', email }),
      });
      const retryBody: any = await retry.json().catch(() => null);
      if (retry.ok && retryBody?.hashed_token) return { ok: true, tokenHash: String(retryBody.hashed_token) };
      return { ok: false, code: 'LINK_FAILED', message: retryBody?.msg || retryBody?.message || `HTTP ${retry.status}` };
    }
    return { ok: false, code: 'LINK_FAILED', message: body?.msg || body?.message || `HTTP ${response.status}` };
  } catch (err: any) {
    return { ok: false, code: 'NETWORK', message: `ارتباط با Supabase برقرار نشد: ${err?.message ?? 'network'}` };
  }
}

/**
 * هندلر Express برای `/api/auth/telegram`.
 *  - GET  → وضعیت پیکربندی (برای UI: چرا غیرفعال است)
 *  - POST → بررسی امضا و صدور token_hash برای `verifyOtp`
 */
export function createTelegramAuthHandler(deps: TelegramAuthDeps = {}) {
  const env = deps.env ?? (process.env as TelegramAuthEnv);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));

  return async function telegramAuthHandler(req: Request, res: Response) {
    const botToken = readBotToken(env);
    const base = (env.SUPABASE_URL || '').trim();
    const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (req.method === 'GET') {
      return res.json({
        success: true,
        configured: Boolean(botToken && base && serviceKey),
        missing: [
          !botToken ? 'TELEGRAM_BOT_TOKEN' : null,
          !base ? 'SUPABASE_URL' : null,
          !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
        ].filter(Boolean),
        allowListEnabled: readAllowedIds(env).length > 0,
        // نام کاربری ربات عمومی است (در ویجت تلگرام دیده می‌شود) و برای رندر
        // ویجت در کلاینت لازم است؛ بنابراین می‌تواند از env سرور بیاید.
        bot_username: (env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '') || null,
        mode: 'server',
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, code: 'METHOD', message: 'فقط GET و POST مجاز است.' });
    }

    if (!botToken) {
      return res.status(503).json({
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'ورود تلگرام پیکربندی نشده است: TELEGRAM_BOT_TOKEN را در env سرور بگذارید.',
      });
    }

    const payload = (req.body ?? {}) as TelegramPayload;
    const verified = verifyTelegramPayload(payload, botToken, now());
    if (!verified.ok) {
      return res.status(401).json({ success: false, code: verified.code, message: verified.message });
    }

    const allowedIds = readAllowedIds(env);
    if (allowedIds.length > 0 && !allowedIds.includes(verified.telegramId)) {
      return res.status(403).json({
        success: false,
        code: 'NOT_ALLOWED',
        message: 'این حساب تلگرام مجاز به ورود نیست.',
      });
    }

    const email = `tg${verified.telegramId}@telegram.konklancer.local`;

    // در حالت «بررسی بدون صدور نشست» (بدون کلید سرویس) فقط تأیید امضا را برمی‌گردانیم
    if (!serviceKey || !base) {
      return res.status(200).json({
        success: true,
        verified: true,
        configured: false,
        missing: [!base ? 'SUPABASE_URL' : null, !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean),
        user: { telegram_id: verified.telegramId, username: verified.username, email },
        message: 'امضا معتبر است، اما برای ساخت نشست باید SUPABASE_SERVICE_ROLE_KEY روی سرور تنظیم شود.',
      });
    }

    const minted = await mintMagicLinkToken(env, fetchImpl, email);
    if (!minted.ok) {
      return res.status(minted.code === 'NOT_CONFIGURED' ? 503 : 502).json({
        success: false,
        code: minted.code,
        message: minted.message,
      });
    }

    return res.status(200).json({
      success: true,
      ok: true,
      token_hash: minted.tokenHash,
      type: 'magiclink',
      user: { telegram_id: verified.telegramId, username: verified.username, email },
    });
  };
}
