import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Cpu, Settings, ShieldCheck, XCircle } from 'lucide-react';
import { readApiToken, API_TOKEN_CHANGED_EVENT } from '../utils/apiFetch';

interface LiveModelSwitcherProps {
  onOpenFullSettings: () => void;
  aiAvailable: boolean | null;
  compact?: boolean;
}

/**
 * Compatibility component kept in the application header. Model/provider
 * choice is owned by Konkred; this menu reports server/gateway readiness and
 * links to the app relay-token settings.
 */
export const LiveModelSwitcher: React.FC<LiveModelSwitcherProps> = ({ onOpenFullSettings, aiAvailable, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [hasToken, setHasToken] = useState(() => Boolean(readApiToken()));
  const containerRef = useRef<HTMLDivElement>(null);
  const ready = hasToken && aiAvailable === true;
  const checking = hasToken && aiAvailable === null;
  const statusText = !hasToken ? 'نیاز به توکن' : checking ? 'در حال بررسی' : ready ? 'آماده' : 'آماده نیست';

  useEffect(() => {
    const update = () => setHasToken(Boolean(readApiToken()));
    window.addEventListener(API_TOKEN_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(API_TOKEN_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  const openSettings = () => {
    setOpen(false);
    onOpenFullSettings();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="وضعیت درگاه هوش مصنوعی"
        aria-expanded={open}
        title="وضعیت و تنظیم اتصال به درگاه Konkred"
        className={`flex items-center justify-center gap-2 border-[2.5px] border-[#0a0a0a] text-[11px] font-black transition-all ${
          compact ? 'h-[42px] w-[42px] shrink-0' : 'px-2.5 py-1.5'
        } ${ready ? 'bg-white hover:bg-[#FFFBF0] text-[#0a0a0a]' : 'bg-[#FFDE03] hover:bg-[#FFE53A] text-[#0a0a0a]'}`}
      >
        <Cpu className={`w-3.5 h-3.5 shrink-0 ${ready ? 'text-[#00875A]' : 'text-[#7a5c00]'}`} />
        {compact ? (
          <span aria-hidden className={`h-1.5 w-1.5 border border-[#0a0a0a] ${ready ? 'bg-[#00E599]' : 'bg-[#FF4D00]'}`} />
        ) : (
          <>
            <span className="font-bold">KONKRED</span>
            <span className={`text-[10px] ${ready ? 'text-[#00875A]' : 'text-[#C1121F]'}`}>{statusText}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-[#4a4a4a] transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed inset-x-2 bottom-2 lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-full lg:mt-2 lg:w-[340px] max-w-[calc(100vw-1rem)] z-[75] bg-white border-[3px] border-[#0a0a0a] shadow-[8px_8px_0px_0px_#000]"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[#0a0a0a] text-white border-b-[3px] border-[#0a0a0a]">
            <span className="flex items-center gap-2 text-xs font-black"><ShieldCheck className="w-4 h-4 text-[#FFDE03]" /> درگاه مرکزی Konkred</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="p-1 hover:text-[#FFDE03]"><XCircle className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-3">
            <div className={`p-2.5 border-[2px] border-[#0a0a0a] flex items-start gap-2 text-[11px] leading-5 ${ready ? 'bg-[#00E599]/20 text-[#006B45]' : 'bg-[#FFDE03]/35 text-[#4a3900]'}`}>
              {ready ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <Cpu className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>
                {!hasToken
                  ? 'توکن رله‌ی برنامه در این دستگاه ثبت نشده است.'
                  : checking
                    ? 'در حال بررسی دسترسی این دستگاه و آمادگی درگاه…'
                    : ready
                      ? 'توکن رله معتبر است و درگاه، دسترسی و ظرفیت مدل را تأیید کرده است.'
                      : 'درگاه آماده نیست؛ توکن، اعتبار gateway یا ظرفیت مدل را در تنظیمات بررسی کنید.'}
              </span>
            </div>
            <button type="button" onClick={openSettings} className="brutal-btn brutal-btn--primary brutal-btn--sm w-full justify-center gap-2">
              <Settings className="w-3.5 h-3.5" /> تنظیم توکن و آزمایش اتصال
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
