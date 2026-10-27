import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AUTH_REQUIRED,
  INITIAL_AVAILABILITY,
  TELEGRAM_BOT_USERNAME,
  describeUser,
  loadSession,
  onAuthChange,
  probeProviders,
  probeServerTelegram,
  signInWithOAuth,
  signInWithTelegram,
  signOut as supabaseSignOut,
  type AccountProfile,
  type AvailabilityMap,
  type OAuthProviderId,
  type ServerTelegramStatus,
} from '../../services/auth';
import { setAuthAccessToken } from '../../services/authToken';

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  profile: AccountProfile | null;
  availability: AvailabilityMap;
  providersRefreshedAt: number | null;
  authRequired: boolean;
  telegramBotUsername: string;
  serverTelegram: ServerTelegramStatus;
  busyProvider: string | null;
  error: string | null;
  clearError: () => void;
  signInWithProvider: (provider: OAuthProviderId) => Promise<void>;
  signInWithTelegramPayload: (payload: Record<string, unknown>) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProviders: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [availability, setAvailability] = useState<AvailabilityMap>(INITIAL_AVAILABILITY);
  const [providersRefreshedAt, setProvidersRefreshedAt] = useState<number | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [serverTelegram, setServerTelegram] = useState<ServerTelegramStatus>({
    reachable: false,
    configured: false,
    missing: [],
    allowListEnabled: false,
    botUsername: '',
  });
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  // نشست را در دو جا نگه می‌داریم: context برای UI و پل توکن برای apiFetch
  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setAuthAccessToken(next?.access_token ?? null, next?.user?.id ?? null);
  }, []);

  const refreshProviders = useCallback(async () => {
    // اول سرور را می‌پرسیم تا اگر نام ربات آن‌جا تنظیم شده باشد، ویجت فعال شود
    const server = await probeServerTelegram();
    const username = TELEGRAM_BOT_USERNAME || server.botUsername;
    const next = await probeProviders({ telegramConfigured: Boolean(username) });
    if (!mounted.current) return;
    setAvailability(next);
    setServerTelegram(server);
    setProvidersRefreshedAt(Date.now());
  }, []);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      // «آماده» فقط به خواندن نشست محلی وابسته است، نه به شبکه.
      // (قبلاً منتظر probeProviders می‌ماند و در شبکه‌ی کند تا ۸ ثانیه چیپ حساب
      // اسپینر می‌ماند.) وضعیت providerها جدا و در پس‌زمینه به‌روز می‌شود.
      const initialSession = await loadSession();
      if (!mounted.current) return;
      applySession(initialSession);
      setReady(true);
      unsubscribe = onAuthChange((next) => {
        if (!mounted.current) return;
        applySession(next);
        setError(null);
      });
      void refreshProviders();
    })();
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [refreshProviders, applySession]);

  const signInWithProvider = useCallback(async (provider: OAuthProviderId) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const { error: oauthError } = await signInWithOAuth(provider);
      if (oauthError) {
        setError(
          /provider is not enabled|not enabled/i.test(oauthError.message)
            ? `ورود ${provider} در Supabase فعال نیست. client_id و secret را در داشبورد اضافه کنید.`
            : oauthError.message,
        );
        setBusyProvider(null);
      }
      // در حالت موفق مرورگر به provider هدایت می‌شود؛ busy تا بازگشت می‌ماند
    } catch (err: any) {
      setError(err?.message || 'ورود ناموفق بود');
      setBusyProvider(null);
    }
  }, []);

  const signInWithTelegramPayload = useCallback(async (payload: Record<string, unknown>) => {
    setBusyProvider('telegram');
    setError(null);
    try {
      const result = await signInWithTelegram(payload);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      applySession(result.session);
      return true;
    } catch (err: any) {
      setError(err?.message || 'ورود تلگرام ناموفق بود');
      return false;
    } finally {
      setBusyProvider(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusyProvider('signout');
    try {
      await supabaseSignOut();
      applySession(null);
    } catch (err: any) {
      setError(err?.message || 'خروج ناموفق بود');
    } finally {
      setBusyProvider(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      profile: describeUser(session?.user),
      availability,
      providersRefreshedAt,
      authRequired: AUTH_REQUIRED,
      telegramBotUsername: TELEGRAM_BOT_USERNAME || serverTelegram.botUsername,
      serverTelegram,
      busyProvider,
      error,
      clearError: () => setError(null),
      signInWithProvider,
      signInWithTelegramPayload,
      signOut,
      refreshProviders,
    }),
    [ready, session, availability, serverTelegram, providersRefreshedAt, busyProvider, error, signInWithProvider, signInWithTelegramPayload, signOut, refreshProviders],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
