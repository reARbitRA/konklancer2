import React from 'react';
import { ArrowLeft, Check, Copy, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';
import { PROVIDER_LABEL, SUPABASE_URL } from '../../services/auth';

const ROW = 'flex items-start justify-between gap-3 border-b-[2px] border-dashed border-[#0a0a0a]/30 py-2';

/** صفحه‌ی `/account`: جزئیات نشست، وضعیت providerها و راهنمای فعال‌سازی. */
export const AccountPage: React.FC = () => {
  const { profile, availability, providersRefreshedAt, refreshProviders, signOut, busyProvider, session } = useAuth();
  const [copied, setCopied] = React.useState(false);

  const copyUserId = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[980px] px-3 py-4" data-testid="account-page">
      <div className="mb-3 flex items-center justify-between">
        <Link
          to="/hunt"
          className="flex items-center gap-1.5 border-[2.5px] border-[#0a0a0a] bg-white px-2.5 py-1.5 text-[11.5px] font-black shadow-[2px_2px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> بازگشت به اپ
        </Link>
        <button
          onClick={() => void refreshProviders()}
          className="border-[2.5px] border-[#0a0a0a] bg-[#FFDE03] px-2.5 py-1.5 text-[11.5px] font-black shadow-[2px_2px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          بررسی دوباره‌ی وضعیت
        </button>
      </div>

      {profile ? (
        <div className="grid gap-3 md:grid-cols-2">
          <section className="border-[3px] border-[#0a0a0a] bg-white shadow-[6px_6px_0px_0px_#000]">
            <header className="border-b-[3px] border-[#0a0a0a] bg-[#0a0a0a] px-3 py-1.5">
              <h2 className="font-mono text-[11px] font-black uppercase tracking-widest text-[#FFDE03]">SESSION</h2>
            </header>
            <div className="space-y-1 p-3">
              <div className={ROW}>
                <span className="text-[11px] font-bold text-[#666]">نام</span>
                <span className="text-[12.5px] font-black">{profile.fullName || '—'}</span>
              </div>
              <div className={ROW}>
                <span className="text-[11px] font-bold text-[#666]">ایمیل</span>
                <span className="font-mono text-[11.5px] font-bold" dir="ltr">{profile.email || '—'}</span>
              </div>
              <div className={ROW}>
                <span className="text-[11px] font-bold text-[#666]">روش ورود</span>
                <span className="flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-[#00E599] px-1.5 text-[10.5px] font-black">
                  <ShieldCheck className="h-3 w-3" /> {PROVIDER_LABEL[profile.provider] || profile.provider}
                </span>
              </div>
              {profile.telegramUsername && (
                <div className={ROW}>
                  <span className="text-[11px] font-bold text-[#666]">تلگرام</span>
                  <span className="font-mono text-[11.5px] font-bold" dir="ltr">@{profile.telegramUsername}</span>
                </div>
              )}
              <div className={ROW}>
                <span className="text-[11px] font-bold text-[#666]">شناسه</span>
                <button onClick={() => void copyUserId()} className="flex items-center gap-1 font-mono text-[10.5px]" dir="ltr">
                  {profile.id.slice(0, 8)}…{copied ? <Check className="h-3 w-3 text-[#00A36C]" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className={ROW}>
                <span className="text-[11px] font-bold text-[#666]">انقضای توکن</span>
                <span className="font-mono text-[11px] font-bold" dir="ltr">
                  {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString('fa-IR') : '—'}
                </span>
              </div>
              <button
                onClick={() => void signOut()}
                disabled={busyProvider === 'signout'}
                className="mt-2 w-full border-[2.5px] border-[#0a0a0a] bg-[#FF3B30] py-2 text-[12px] font-black text-white disabled:opacity-50"
              >
                {busyProvider === 'signout' ? 'در حال خروج…' : 'خروج از حساب'}
              </button>
            </div>
          </section>

          <section className="border-[3px] border-[#0a0a0a] bg-white shadow-[6px_6px_0px_0px_#000]">
            <header className="border-b-[3px] border-[#0a0a0a] bg-[#0a0a0a] px-3 py-1.5">
              <h2 className="font-mono text-[11px] font-black uppercase tracking-widest text-[#FFDE03]">PROVIDERS</h2>
            </header>
            <ul className="divide-y-[2px] divide-dashed divide-[#0a0a0a]/20 p-3">
              {(['google', 'github', 'telegram'] as const).map((id) => {
                const state = availability[id];
                const tone =
                  state.status === 'enabled' ? 'bg-[#00E599]' : state.status === 'disabled' ? 'bg-[#FFDE03]' : 'bg-[#E5E5E5]';
                return (
                  <li key={id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-black">{PROVIDER_LABEL[id]}</span>
                      <span className={`flex items-center gap-1 border-[2px] border-[#0a0a0a] px-1.5 font-mono text-[9.5px] font-black uppercase ${tone}`}>
                        {state.status === 'enabled' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        {state.status}
                      </span>
                    </div>
                    {state.reason && <p className="mt-1 text-[10.5px] leading-4 text-[#666]">{state.reason}</p>}
                  </li>
                );
              })}
            </ul>
            <p className="border-t-[2px] border-dashed border-[#0a0a0a]/30 px-3 py-2 font-mono text-[9.5px] text-[#777]" dir="ltr">
              {SUPABASE_URL} · {providersRefreshedAt ? new Date(providersRefreshedAt).toLocaleTimeString('fa-IR') : '—'}
            </p>
          </section>
        </div>
      ) : (
        <LoginScreen />
      )}

      <section className="mt-3 border-[2.5px] border-[#0a0a0a] bg-[#FFFBF0] p-3">
        <h3 className="mb-1.5 text-[12px] font-black">راه‌اندازی ورود (کارهایی که فقط از داشبورد Supabase ممکن است)</h3>
        <ol className="list-decimal space-y-1 pr-5 text-[11px] font-bold leading-5 text-[#333]">
          <li>
            <span className="font-mono text-[10.5px]">Authentication → Providers → GitHub</span> — Client ID/Secret اپ GitHub OAuth را وارد و فعال کنید.
          </li>
          <li>
            <span className="font-mono text-[10.5px]">Authentication → Providers → Google</span> — Client ID/Secret از Google Cloud Console را وارد و فعال کنید.
          </li>
          <li>
            <span className="font-mono text-[10.5px]">Authentication → URL Configuration</span> — دامنه‌ی همین پیش‌نمایش (و دامنه‌ی نهایی) را به Redirect allow list اضافه کنید.
          </li>
          <li>
            <span className="font-mono text-[10.5px]">Edge Functions → telegram-auth → Secrets</span> — <span className="font-mono">TELEGRAM_BOT_TOKEN</span> را ست کنید و{' '}
            <span className="font-mono">VITE_TELEGRAM_BOT_USERNAME</span> را در env اپ بگذارید.
          </li>
        </ol>
        <a
          href="https://supabase.com/dashboard/project/rwuyuhjkitcnekpwmoml/auth/providers"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-white px-2 py-1 text-[11px] font-black hover:bg-[#FFDE03]"
        >
          <ExternalLink className="h-3 w-3" /> باز کردن داشبورد
        </a>
      </section>
    </div>
  );
};

export default AccountPage;
