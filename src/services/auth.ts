/**
 * احراز هویت Supabase برای Konklancer.
 *
 * سه مسیر ورود:
 *  - Google / GitHub: OAuth استاندارد Supabase (`signInWithOAuth`).
 *  - Telegram: Supabase provider بومی ندارد؛ از Edge Function `telegram-auth`
 *    استفاده می‌شود که امضای ویجت تلگرام را بررسی می‌کند و یک `token_hash`
 *    یک‌بارمصرف می‌دهد؛ سپس `verifyOtp` نشست واقعی می‌سازد.
 *
 * نکته‌ی مهم: کلید anon/publishable عمومی است و افشای آن ایراد امنیتی نیست؛
 * کلید service_role هرگز به مرورگر نمی‌آید (فقط داخل Edge Function است).
 */
import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';

export const SUPABASE_URL: string =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://rwuyuhjkitcnekpwmoml.supabase.co';

export const SUPABASE_ANON_KEY: string =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dXl1aGpraXRjbmVrcHdtb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgwMzYsImV4cCI6MjEwNzkzNDAzNn0.KnWmpopGmuhdeQ5x6sOUfa7pBqeqN57oJhzBSlkuzzs';

/** نام ربات تلگرام بدون @ برای ویجت ورود (اختیاری؛ اگر نباشد تلگرام غیرفعال است). */
export const TELEGRAM_BOT_USERNAME: string =
  (import.meta as any).env?.VITE_TELEGRAM_BOT_USERNAME || '';

export const AUTH_REQUIRED: boolean = String((import.meta as any).env?.VITE_AUTH_REQUIRED || '') === 'true';

export type OAuthProviderId = 'google' | 'github';
export type LoginProviderId = OAuthProviderId | 'telegram';

export interface ProviderDescriptor {
  id: LoginProviderId;
  label: string;
  sub: string;
  kind: 'oauth' | 'custom';
}

export const PROVIDERS: ProviderDescriptor[] = [
  { id: 'google', label: 'Google', sub: 'ورود با حساب گوگل', kind: 'oauth' },
  { id: 'github', label: 'GitHub', sub: 'ورود با حساب گیت‌هاب', kind: 'oauth' },
  { id: 'telegram', label: 'Telegram', sub: 'ورود با ویجت تلگرام', kind: 'custom' },
];

/** وضعیت هر provider بعد از پرسیدن از خود Supabase. */
export type ProviderStatus = 'enabled' | 'disabled' | 'unknown';

export interface ProviderAvailability {
  status: ProviderStatus;
  /** دلیل غیرفعال/نامشخص بودن؛ برای نمایش صادقانه در UI. */
  reason: string | null;
  checkedAt: number | null;
}

export type AvailabilityMap = Record<LoginProviderId, ProviderAvailability>;

export const INITIAL_AVAILABILITY: AvailabilityMap = {
  google: { status: 'unknown', reason: 'وضعیت بررسی نشده', checkedAt: null },
  github: { status: 'unknown', reason: 'وضعیت بررسی نشده', checkedAt: null },
  telegram: { status: 'unknown', reason: 'وضعیت بررسی نشده', checkedAt: null },
};

/**
 * تبدیل پاسخ `GET /auth/v1/settings` به وضعیت providerها. خالص و قابل تست.
 * `external` در Supabase یک آبجکت بولین است: {google: true, github: false, ...}
 */
export function mapAuthSettings(
  payload: unknown,
  options: { telegramConfigured: boolean; now?: number } = { telegramConfigured: false },
): AvailabilityMap {
  const now = options.now ?? Date.now();
  const external = (payload as any)?.external ?? {};

  const fromFlag = (id: OAuthProviderId): ProviderAvailability => {
    if (external[id] === true) return { status: 'enabled', reason: null, checkedAt: now };
    if (external[id] === false) {
      return {
        status: 'disabled',
        reason: `provider ${id} در Supabase فعال نیست (client_id/secret تنظیم نشده)`,
        checkedAt: now,
      };
    }
    return { status: 'unknown', reason: 'پاسخ Supabase فیلد این provider را نداشت', checkedAt: now };
  };

  const telegram: ProviderAvailability = options.telegramConfigured
    ? { status: 'enabled', reason: null, checkedAt: now }
    : {
        status: 'disabled',
        reason: 'VITE_TELEGRAM_BOT_USERNAME تنظیم نشده و secret ربات روی Supabase ست نشده',
        checkedAt: now,
      };

  return { google: fromFlag('google'), github: fromFlag('github'), telegram };
}

/** وضعیت وقتی شبکه/پروژه در دسترس نیست (نباید باعث کرش یا دکمه‌ی مرده شود). */
export function unavailableAvailability(reason: string, now: number = Date.now()): AvailabilityMap {
  return {
    google: { status: 'unknown', reason, checkedAt: now },
    github: { status: 'unknown', reason, checkedAt: now },
    telegram: { status: 'unknown', reason, checkedAt: now },
  };
}

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * پرسیدن اینکه کدام provider واقعاً روی پروژه فعال است.
 * هیچ‌وقت throw نمی‌کند: در خطای شبکه «unknown» برمی‌گرداند.
 */
export async function probeProviders(
  options: { url?: string; anonKey?: string; telegramConfigured?: boolean; fetchImpl?: FetchLike; now?: number; timeoutMs?: number } = {},
): Promise<AvailabilityMap> {
  const url = options.url ?? SUPABASE_URL;
  const anonKey = options.anonKey ?? SUPABASE_ANON_KEY;
  const telegramConfigured = options.telegramConfigured ?? false;
  const now = options.now ?? Date.now();
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => (globalThis.fetch as any)(input, init));
  const timeoutMs = options.timeoutMs ?? 8000;

  if (!url || !anonKey) {
    return unavailableAvailability('VITE_SUPABASE_URL یا VITE_SUPABASE_ANON_KEY تنظیم نشده', now);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey, accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
      return unavailableAvailability(`Supabase پاسخ ${response.status} داد`, now);
    }
    const payload = await response.json();
    return mapAuthSettings(payload, { telegramConfigured, now });
  } catch (err: any) {
    return unavailableAvailability(`اتصال به Supabase برقرار نشد (${err?.message ?? 'network'})`, now);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** آدرس بازگشت OAuth: همان میزبان فعلی + هش روت، تا بعد از ورود به همان صفحه برگردد. */
export function buildRedirectUrl(location?: { origin: string; pathname: string; hash: string }): string {
  const loc = location ?? (typeof window !== 'undefined'
    ? { origin: window.location.origin, pathname: window.location.pathname, hash: window.location.hash }
    : { origin: '', pathname: '/', hash: '' });
  const origin = loc.origin || 'http://localhost:3000';
  const path = loc.pathname && loc.pathname !== '/' ? loc.pathname : '/';
  // هش را نگه می‌داریم تا HashRouter بعد از ورود همان صفحه را نشان دهد
  const hash = loc.hash && loc.hash.startsWith('#/') ? loc.hash : '';
  return `${origin}${path === '/' ? '/' : path}${hash}`;
}

export interface ServerTelegramStatus {
  reachable: boolean;
  configured: boolean;
  missing: string[];
  allowListEnabled: boolean;
  botUsername: string;
}

/**
 * بررسی پیکربندی مسیر تلگرام روی همین سرور (`/api/auth/telegram`).
 * هرگز throw نمی‌کند: در دسترس نبودن سرور = reachable:false.
 */
export async function probeServerTelegram(
  options: { path?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ServerTelegramStatus> {
  const url = options.path ?? '/api/auth/telegram';
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 6000) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return { reachable: true, configured: false, missing: [], allowListEnabled: false, botUsername: '' };
    const body: any = await response.json().catch(() => null);
    return {
      reachable: true,
      configured: Boolean(body?.configured),
      missing: Array.isArray(body?.missing) ? body.missing.map(String) : [],
      allowListEnabled: Boolean(body?.allowListEnabled),
      botUsername: typeof body?.bot_username === 'string' ? body.bot_username : '',
    };
  } catch {
    return { reachable: false, configured: false, missing: [], allowListEnabled: false, botUsername: '' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let cachedClient: SupabaseClient | null = null;

/** کلاینت Supabase (Singleton). PKCE برای SPA امن‌تر است. */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'konklancer-auth',
    },
    global: { headers: { 'x-client-info': 'konklancer-v4' } },
  });
  return cachedClient;
}

/** ورود OAuth گوگل/گیت‌هاب. */
export async function signInWithOAuth(provider: OAuthProviderId, redirectTo?: string) {
  const supabase = getSupabaseClient();
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo ?? buildRedirectUrl(),
      queryParams: provider === 'google' ? { prompt: 'select_account', access_type: 'offline' } : { allow_signup: 'true' },
    },
  });
}

/** نتیجه‌ی تلاش یک مسیر تلگرام (سرور محلی یا Edge Function). */
interface TelegramAttempt {
  ok: boolean;
  tokenHash?: string;
  status: number;
  code?: string;
  error?: string;
}

async function postTelegram(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<TelegramAttempt> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    const body: any = await response.json().catch(() => null);
    if (response.ok && body?.token_hash) {
      return { ok: true, tokenHash: String(body.token_hash), status: response.status };
    }
    return {
      ok: false,
      status: response.status,
      code: body?.code ?? (response.ok ? 'NO_TOKEN' : `HTTP_${response.status}`),
      error: body?.message || `ورود تلگرام ناموفق بود (HTTP ${response.status})`,
    };
  } catch (err: any) {
    return { ok: false, status: 0, code: 'NETWORK', error: err?.message || 'network' };
  }
}

/**
 * ورود تلگرام: داده‌ی امضاشده‌ی ویجت → تأیید در سرور → نشست Supabase.
 *
 * دو مسیر، به همین ترتیب:
 *  1. `/api/auth/telegram` روی همین سرور (خودمیزبان؛ اگر SERVICE_ROLE_KEY داشته باشد)
 *  2. Edge Function `telegram-auth` روی Supabase (اپ میزبانی‌شده)
 * اگر مسیر اول «پیکربندی‌نشده» یا «پیدا نشد» بدهد، بی‌صدا سراغ دومی می‌رویم.
 */
export async function signInWithTelegram(
  payload: Record<string, unknown>,
  options: { functionsUrl?: string; anonKey?: string; localUrl?: string } = {},
): Promise<{ ok: true; session: Session } | { ok: false; error: string; code?: string }> {
  const supabase = getSupabaseClient();
  const anonKey = options.anonKey ?? SUPABASE_ANON_KEY;
  const localUrl = options.localUrl ?? '/api/auth/telegram';
  const remoteUrl = `${options.functionsUrl || `${SUPABASE_URL}/functions/v1`}/telegram-auth`;

  let attempt = await postTelegram(localUrl, payload, {});
  const fallThrough = !attempt.ok && (attempt.status === 0 || attempt.status === 404 || attempt.status === 501 || attempt.code === 'NOT_CONFIGURED');
  if (fallThrough) {
    attempt = await postTelegram(remoteUrl, payload, { apikey: anonKey, authorization: `Bearer ${anonKey}` });
  }
  if (!attempt.ok || !attempt.tokenHash) {
    return { ok: false, error: attempt.error || 'ورود تلگرام ناموفق بود', code: attempt.code };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: attempt.tokenHash,
    type: 'magiclink',
  });
  if (error || !data.session) {
    return { ok: false, error: error?.message || 'نشست تلگرام ساخته نشد' };
  }
  return { ok: true, session: data.session };
}

export interface AccountProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  provider: string;
  telegramId: string | null;
  telegramUsername: string | null;
}

/** تبدیل User سوپابیس به پروفایل نمایشی. خالص. */
export function describeUser(user: User | null | undefined): AccountProfile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const appMeta = (user.app_metadata ?? {}) as Record<string, any>;
  const providers: string[] = Array.isArray(appMeta.providers) ? appMeta.providers : [];
  const provider = String(meta.provider_label || meta.provider || appMeta.provider || providers[0] || 'email');
  const fullName = meta.full_name || meta.name || meta.user_name || meta.preferred_username || null;
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: fullName ? String(fullName) : null,
    avatarUrl: meta.avatar_url || meta.picture || null,
    provider,
    telegramId: meta.telegram_id ? String(meta.telegram_id) : null,
    telegramUsername: meta.telegram_username ? String(meta.telegram_username) : meta.username ? String(meta.username) : null,
  };
}

export const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  telegram: 'Telegram',
  email: 'ایمیل',
};

export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}

/** توکن دسترسی فعلی (برای فرستادن به API سرور). */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * بررسی «بی‌صدا»ی نشست هنگام بوت. اگر Supabase در دسترس نباشد یا نشستی نباشد،
 * null برمی‌گرداند و اپ باید در حالت مهمان ادامه دهد.
 */
export async function loadSession(): Promise<Session | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

export function onAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
