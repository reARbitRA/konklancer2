// Konklancer — Telegram login bridge (Supabase has no native Telegram provider).
//
// Flow: Telegram Login Widget (client) -> POST here with the signed payload ->
// verify HMAC-SHA256 against SHA256(TELEGRAM_BOT_TOKEN) -> find/create the
// Supabase user -> return a one-time hashed_token -> client calls
// supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) and gets a session.
//
// Required secret: TELEGRAM_BOT_TOKEN (from @BotFather).
// Optional secrets: TELEGRAM_ALLOWED_IDS (comma separated numeric ids),
//                   TELEGRAM_BOT_USERNAME (public, returned by GET so the client
//                   can render the widget without a build-time env var).
// The service role key never leaves this function.
//
// NOTE: the data_check_string MUST be joined with real U+000A newlines. Using a
// literal "\\n" breaks every signature, so we derive it from the char code.

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24; // 24h, per Telegram guidance
const NL = String.fromCharCode(10);

const ALLOWED_ORIGINS = [
  'https://www.konkred.xyz',
  'https://konkred.xyz',
  'https://konklancer2.vercel.app',
  'http://localhost:3000',
  'http://localhost:24678',
  'http://127.0.0.1:24678',
];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.e2b\.app$/i.test(origin))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
  });

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type TelegramPayload = Record<string, string | number | undefined>;

/** Build data_check_string (alphabetical, no hash) — pure, used by the tests. */
export function buildDataCheckString(payload: TelegramPayload): string {
  return Object.keys(payload)
    .filter((key) => key !== 'hash')
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join(NL);
}

export async function verifyTelegramPayload(
  payload: TelegramPayload,
  botToken: string,
  nowSeconds: number,
): Promise<{ ok: true; telegramId: number; username: string | null } | { ok: false; code: string; message: string }> {
  const hash = typeof payload.hash === 'string' ? payload.hash : '';
  if (hash.length !== 64) {
    return { ok: false, code: 'MISSING_HASH', message: 'امضای تلگرام در درخواست نیست.' };
  }
  const secretKey = await sha256(new TextEncoder().encode(botToken));
  const expected = await hmacSha256Hex(secretKey, buildDataCheckString(payload));
  if (!timingSafeEqual(expected, hash)) {
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

// deno-lint-ignore no-explicit-any
const SUPABASE_ADMIN = (url: string, key: string) => ({
  async call(path: string, init: RequestInit) {
    const response = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    });
    // deno-lint-ignore no-explicit-any
    const body: any = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  },
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const botUsername = (Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '').replace(/^@/, '');
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const allowedIds = (Deno.env.get('TELEGRAM_ALLOWED_IDS') ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (req.method === 'GET') {
    return json(
      {
        ok: true,
        configured: Boolean(botToken && supabaseUrl && serviceKey),
        missing: [
          !botToken ? 'TELEGRAM_BOT_TOKEN' : null,
          !supabaseUrl ? 'SUPABASE_URL' : null,
          !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
        ].filter(Boolean),
        allowListEnabled: allowedIds.length > 0,
        bot_username: botUsername || null,
        mode: 'edge',
      },
      200,
      origin,
    );
  }

  if (req.method !== 'POST') {
    return json({ ok: false, code: 'METHOD', message: 'فقط GET و POST مجاز است.' }, 405, origin);
  }
  if (!botToken || !supabaseUrl || !serviceKey) {
    return json(
      {
        ok: false,
        code: 'NOT_CONFIGURED',
        message: 'ورود تلگرام پیکربندی نشده است: secret با نام TELEGRAM_BOT_TOKEN را در پروژه اضافه کنید.',
      },
      503,
      origin,
    );
  }

  let payload: TelegramPayload;
  try {
    payload = (await req.json()) as TelegramPayload;
  } catch {
    return json({ ok: false, code: 'BAD_JSON', message: 'بدنه‌ی درخواست JSON نیست.' }, 400, origin);
  }

  const verified = await verifyTelegramPayload(payload, botToken, Math.floor(Date.now() / 1000));
  if (!verified.ok) return json({ ok: false, code: verified.code, message: verified.message }, 401, origin);

  if (allowedIds.length > 0 && !allowedIds.includes(verified.telegramId)) {
    return json({ ok: false, code: 'NOT_ALLOWED', message: 'این حساب تلگرام مجاز به ورود نیست.' }, 403, origin);
  }

  const admin = SUPABASE_ADMIN(supabaseUrl, serviceKey);
  const email = `tg${verified.telegramId}@telegram.konklancer.local`;

  try {
    // 1) اگر قبلاً وصل شده، همان کاربر را نگه می‌داریم
    let userId: string | null = null;
    const linked = await admin.call(
      `/rest/v1/telegram_links?telegram_id=eq.${verified.telegramId}&select=user_id`,
      { method: 'GET' },
    );
    if (Array.isArray(linked.body) && linked.body[0]?.user_id) userId = String(linked.body[0].user_id);

    // 2) ساخت کاربر با متادیتای تلگرام (اگر تازه است)
    if (!userId) {
      const created = await admin.call('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: {
            full_name:
              [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim() ||
              verified.username ||
              'کاربر تلگرام',
            avatar_url: typeof payload.photo_url === 'string' ? payload.photo_url : null,
            telegram_id: String(verified.telegramId),
            telegram_username: verified.username,
            provider_label: 'telegram',
          },
          app_metadata: { provider: 'telegram', providers: ['telegram'] },
        }),
      });
      if (!created.ok) {
        // کاربر ممکن است از قبل با همین ایمیل وجود داشته باشد
        const listed = await admin.call(`/auth/v1/admin/users?page=1&per_page=200`, { method: 'GET' });
        const found = Array.isArray(listed.body?.users)
          ? listed.body.users.find((user: { email?: string }) => user.email === email)
          : null;
        if (!found) {
          return json(
            { ok: false, code: 'USER_CREATE_FAILED', message: created.body?.msg || created.body?.message || `HTTP ${created.status}` },
            500,
            origin,
          );
        }
        userId = String(found.id);
      } else {
        userId = String(created.body?.id ?? '');
      }

      if (!userId) {
        return json({ ok: false, code: 'USER_CREATE_FAILED', message: 'کاربر ساخته نشد.' }, 500, origin);
      }

      await admin.call('/rest/v1/telegram_links?on_conflict=telegram_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          telegram_id: verified.telegramId,
          user_id: userId,
          telegram_username: verified.username,
        }),
      });
    }

    // 3) توکن یک‌بارمصرف؛ کلاینت آن را با verifyOtp به نشست تبدیل می‌کند
    const link = await admin.call('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!link.ok || !link.body?.hashed_token) {
      return json(
        { ok: false, code: 'LINK_FAILED', message: link.body?.msg || link.body?.message || 'توکن ورود ساخته نشد.' },
        500,
        origin,
      );
    }

    return json(
      {
        ok: true,
        token_hash: String(link.body.hashed_token),
        type: 'magiclink',
        user: { id: userId, telegram_id: verified.telegramId, username: verified.username },
      },
      200,
      origin,
    );
  } catch (err) {
    return json(
      { ok: false, code: 'UNEXPECTED', message: err instanceof Error ? err.message : 'خطای غیرمنتظره' },
      500,
      origin,
    );
  }
});
