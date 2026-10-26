import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Github, Loader2, LogIn, RefreshCw, Send, ShieldCheck, X, Zap } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { PROVIDER_LABEL, type LoginProviderId, type ProviderAvailability } from '../../services/auth';

const STATUS_STYLE: Record<ProviderAvailability['status'], string> = {
  enabled: 'bg-[#00E599] text-[#0a0a0a]',
  disabled: 'bg-[#E8E6E0] text-[#555555]',
  unknown: 'bg-[#FFDE03] text-[#0a0a0a]',
};

const STATUS_TEXT: Record<ProviderAvailability['status'], string> = {
  enabled: 'آماده',
  disabled: 'تنظیم نشده',
  unknown: 'نامشخص',
};

const GoogleGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.5 14.7 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.06-1.1-.15-1.6H12z" />
  </svg>
);

/** ویجت رسمی تلگرام: اسکریپت را در زمان نمایش دکمه لود می‌کند. */
const TelegramLoginButton: React.FC<{ botUsername: string; onAuth: (payload: Record<string, unknown>) => void }> = ({ botUsername, onAuth }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    (window as any).onKonklancerTelegramAuth = onAuth;
    host.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername.replace(/^@/, ''));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '0');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onKonklancerTelegramAuth(user)');
    host.appendChild(script);
    return () => {
      delete (window as any).onKonklancerTelegramAuth;
      host.innerHTML = '';
    };
  }, [botUsername, onAuth]);

  return <div ref={hostRef} data-testid="telegram-widget" className="flex min-h-[44px] items-center justify-center" />;
};

interface LoginScreenProps {
  /** اگر true باشد تمام‌صفحه است (حالت اجباری)، وگرنه پنل داخل صفحه. */
  fullScreen?: boolean;
  onGuestContinue?: () => void;
  onClose?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ fullScreen = false, onGuestContinue, onClose }) => {
  const {
    availability,
    providersRefreshedAt,
    busyProvider,
    error,
    clearError,
    signInWithProvider,
    signInWithTelegramPayload,
    telegramBotUsername,
    refreshProviders,
  } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [telegramFailed, setTelegramFailed] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProviders();
    setRefreshing(false);
  };

  const handleTelegramAuth = async (payload: Record<string, unknown>) => {
    setTelegramFailed(null);
    const ok = await signInWithTelegramPayload(payload);
    if (!ok) setTelegramFailed('ورود تلگرام انجام نشد؛ پیام خطای بالا را ببینید.');
  };

  const body = (
    <div className={`w-full max-w-[560px] ${fullScreen ? '' : 'mx-auto'}`} data-testid="login-panel">
      <div className="border-[3px] border-[#0a0a0a] bg-white shadow-[8px_8px_0px_0px_#000]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b-[3px] border-[#0a0a0a] bg-[#0a0a0a] px-4 py-3">
          <div className="flex items-center gap-2 text-[#FFFBF0]">
            <div className="flex h-9 w-9 items-center justify-center border-[2px] border-[#FFDE03] bg-[#FFDE03] text-[#0a0a0a]">
              <Zap className="h-5 w-5 fill-[#0a0a0a]" />
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-black tracking-tight">ورود به KONKLANCER</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#FFDE03]">SUPABASE AUTH · OAUTH + TELEGRAM</div>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="بستن ورود" className="flex h-8 w-8 items-center justify-center border-[2px] border-[#FFFBF0] bg-white text-[#0a0a0a] hover:bg-[#FFDE03]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          <p className="text-[12px] font-bold leading-6 text-[#333]">
            با یکی از روش‌های زیر وارد شوید. نشست شما امن ذخیره می‌شود و با بستن مرورگر از بین نمی‌رود.
          </p>

          {error && (
            <div className="flex items-start justify-between gap-2 border-[2px] border-[#0a0a0a] bg-[#FF3B30] px-3 py-2 text-[11.5px] font-bold text-white" role="alert">
              <span className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</span>
              <button onClick={clearError} aria-label="بستن خطا"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {(['google', 'github', 'telegram'] as LoginProviderId[]).map((id) => {
            const state = availability[id];
            const busy = busyProvider === id;
            const isTelegram = id === 'telegram';
            const canUse = state.status !== 'disabled' && (isTelegram ? Boolean(telegramBotUsername) : true);
            const Icon = id === 'google' ? GoogleGlyph : id === 'github' ? Github : Send;
            return (
              <div key={id} className="border-[2.5px] border-[#0a0a0a]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border-[2px] border-[#0a0a0a] bg-[#FFFBF0]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-black">{PROVIDER_LABEL[id]}</span>
                    <span className={`mt-0.5 inline-block border-[2px] border-[#0a0a0a] px-1 text-[9px] font-black ${STATUS_STYLE[state.status]}`}>
                      {STATUS_TEXT[state.status]}
                    </span>
                  </span>
                  {isTelegram ? (
                    <span className="text-[10px] font-bold text-[#555]">ویجت رسمی</span>
                  ) : (
                    <button
                      onClick={() => void signInWithProvider(id)}
                      disabled={busy || !canUse}
                      aria-label={`ورود با ${PROVIDER_LABEL[id]}`}
                      className="flex h-[38px] shrink-0 items-center gap-1.5 border-[2.5px] border-[#0a0a0a] bg-[#FFDE03] px-3 text-[12px] font-black shadow-[2px_2px_0px_0px_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:cursor-not-allowed disabled:bg-[#E8E6E0] disabled:text-[#888] disabled:shadow-none"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                      ورود
                    </button>
                  )}
                </div>

                {isTelegram && (
                  <div className="border-t-[2px] border-[#0a0a0a] bg-[#FFFBF0] px-3 py-2">
                    {telegramBotUsername ? (
                      <TelegramLoginButton botUsername={telegramBotUsername} onAuth={handleTelegramAuth} />
                    ) : (
                      <div className="text-[10.5px] font-bold leading-5 text-[#555]">
                        نام ربات تلگرام تنظیم نشده است. <code dir="ltr" className="bg-white px-1">VITE_TELEGRAM_BOT_USERNAME</code> را
                        بگذارید و secret <code dir="ltr" className="bg-white px-1">TELEGRAM_BOT_TOKEN</code> را روی Supabase اضافه کنید.
                      </div>
                    )}
                  </div>
                )}

                {state.status !== 'enabled' && state.reason && (
                  <div className="border-t-[2px] border-[#0a0a0a] bg-white px-3 py-1.5 text-[10px] font-bold text-[#555]">
                    {state.reason}
                  </div>
                )}
              </div>
            );
          })}

          {telegramFailed && (
            <div className="border-[2px] border-[#0a0a0a] bg-[#FF3B30] px-3 py-2 text-[11px] font-bold text-white">{telegramFailed}</div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t-[2.5px] border-[#0a0a0a] pt-3">
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex items-center gap-1.5 border-[2px] border-[#0a0a0a] bg-white px-2.5 py-1.5 text-[11px] font-black hover:bg-[#FFDE03]"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              بررسی وضعیت providerها
            </button>
            {providersRefreshedAt && (
              <span className="font-mono text-[10px] text-[#777]" dir="ltr">
                checked {new Date(providersRefreshedAt).toLocaleTimeString('en-GB')}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-[#00E599] px-2 py-1 text-[10px] font-black">
              <ShieldCheck className="h-3 w-3" /> PKCE · RLS
            </span>
          </div>

          {onGuestContinue && (
            <button
              onClick={onGuestContinue}
              className="w-full border-[2.5px] border-[#0a0a0a] bg-white px-3 py-2 text-[12px] font-black hover:bg-[#F6F0E0]"
            >
              ادامه به‌صورت مهمان (بدون حساب)
            </button>
          )}

          <p className="text-[10px] leading-5 text-[#777]">
            ورود تلگرام از ویجت رسمی تلگرام استفاده می‌کند و امضا در سرور (Edge Function) بررسی می‌شود؛
            توکن ربات هرگز به مرورگر نمی‌آید.
          </p>
        </div>
      </div>
    </div>
  );

  if (!fullScreen) return body;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFFBF0] p-4" data-testid="login-screen">
      <div className="w-full max-w-[560px] space-y-3">
        {body}
        <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#777]">
          <Check className="h-3 w-3" /> ساخته‌شده روی Supabase Auth — سازمان شما، داده‌ی شما
        </div>
      </div>
    </div>
  );
};
