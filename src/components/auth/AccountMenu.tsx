import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogIn, LogOut, RefreshCw, Settings2, ShieldCheck, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { PROVIDER_LABEL } from '../../services/auth';
import { LoginScreen } from './LoginScreen';

/** چیپ حساب کاربر در هدر: وضعیت ورود، پروفایل و خروج. */
export const AccountMenu: React.FC = () => {
  const { ready, profile, signOut, busyProvider, availability } = useAuth();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // اگر کاربر تازه وارد شد، پنل ورود خودش بسته شود
  useEffect(() => {
    if (profile) setLoginOpen(false);
  }, [profile]);

  if (!ready) {
    return (
      <div className="hidden h-[42px] items-center gap-2 border-[2px] border-dashed border-[#0a0a0a] px-3 md:flex" aria-busy="true">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span className="font-mono text-[10px] font-bold uppercase">auth…</span>
      </div>
    );
  }

  const enabledCount = Object.values(availability).filter((state) => state.status === 'enabled').length;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={profile ? `حساب ${profile.fullName || profile.email || ''}` : 'ورود به حساب'}
        data-testid="account-chip"
        className={`flex h-[42px] items-center gap-2 border-[2.5px] border-[#0a0a0a] px-2.5 shadow-[3px_3px_0px_0px_#0a0a0a] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${
          profile ? 'bg-[#FFDE03]' : 'bg-white'
        }`}
      >
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="h-6 w-6 border-[2px] border-[#0a0a0a] object-cover" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center border-[2px] border-[#0a0a0a] bg-[#0a0a0a] text-[#FFDE03]">
            {profile ? <User className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
          </span>
        )}
        <span className="hidden max-w-[110px] truncate text-[11.5px] font-black xl:inline">
          {profile ? profile.fullName || profile.email || 'حساب من' : 'ورود'}
        </span>
        {profile && (
          <span className="hidden border-[2px] border-[#0a0a0a] bg-white px-1 font-mono text-[9px] font-black uppercase xl:inline">
            {PROVIDER_LABEL[profile.provider] || profile.provider}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="fixed inset-x-2 top-[96px] z-[70] w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+6px)] sm:w-[280px] max-h-[calc(100vh-8rem)] overflow-y-auto brutal-scroll border-[2.5px] border-[#0a0a0a] bg-white shadow-[5px_5px_0px_0px_#000]"
          data-testid="account-menu"
        >
          <div className="flex items-center justify-between border-b-[2.5px] border-[#0a0a0a] bg-[#0a0a0a] px-2.5 py-1.5">
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFDE03]">
              {profile ? 'ACCOUNT' : 'AUTH'}
            </span>
            <button onClick={() => setOpen(false)} aria-label="بستن منو"><X className="h-3.5 w-3.5 text-white" /></button>
          </div>

          {profile ? (
            <div className="space-y-2 p-2.5">
              <div className="leading-tight">
                <div className="truncate text-[12.5px] font-black">{profile.fullName || 'کاربر کنکلانسر'}</div>
                {profile.email && <div className="truncate font-mono text-[10px] text-[#555]" dir="ltr">{profile.email}</div>}
                {profile.telegramUsername && (
                  <div className="truncate font-mono text-[10px] text-[#0066FF]" dir="ltr">@{profile.telegramUsername}</div>
                )}
              </div>
              <div className="flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-[#FFFBF0] px-2 py-1 text-[10px] font-black">
                <ShieldCheck className="h-3 w-3" /> روش ورود: {PROVIDER_LABEL[profile.provider] || profile.provider}
              </div>
              <button
                onClick={() => {
                  navigate('/account');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 border-[2px] border-[#0a0a0a] bg-white px-2 py-1.5 text-[11.5px] font-black hover:bg-[#FFDE03]"
              >
                <Settings2 className="h-3.5 w-3.5" /> صفحه‌ی حساب
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  setOpen(false);
                }}
                disabled={busyProvider === 'signout'}
                className="flex w-full items-center justify-center gap-1.5 border-[2px] border-[#0a0a0a] bg-[#FF3B30] px-2 py-1.5 text-[11.5px] font-black text-white disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" /> {busyProvider === 'signout' ? 'در حال خروج…' : 'خروج از حساب'}
              </button>
            </div>
          ) : (
            <div className="space-y-2 p-2.5">
              <p className="text-[11px] font-bold leading-5 text-[#444]">
                هنوز وارد نشده‌اید. با Google، GitHub یا Telegram وارد شوید.
              </p>
              <div className="flex items-center gap-1 text-[10px] font-black text-[#555]">
                <span className={`border-[2px] border-[#0a0a0a] px-1 ${enabledCount > 0 ? 'bg-[#00E599]' : 'bg-[#FFDE03]'}`}>
                  {enabledCount > 0 ? `${enabledCount} روش آماده` : 'هیچ provider فعال نیست'}
                </span>
              </div>
              <button
                onClick={() => {
                  navigate('/login');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 border-[2.5px] border-[#0a0a0a] bg-[#FFDE03] px-2 py-2 text-[12px] font-black shadow-[2px_2px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                <LogIn className="h-4 w-4" /> ورود / ثبت‌نام
              </button>
            </div>
          )}
        </div>
      )}

      {loginOpen && !profile && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0a0a0a]/70 p-4" onMouseDown={() => setLoginOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <LoginScreen onClose={() => setLoginOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
