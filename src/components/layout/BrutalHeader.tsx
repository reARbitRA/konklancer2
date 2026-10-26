import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Radar, Terminal, Workflow, Cpu, Settings, Search, Command, Zap, Layers, Sparkles, TrendingUp, Menu, X, ChevronDown } from 'lucide-react';
import { LiveModelSwitcher } from '../LiveModelSwitcher';
import { AccountMenu } from '../auth/AccountMenu';

interface BrutalHeaderProps {
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
  scanStatusText?: string | null;
  totalEarningsToday: number;
  activeJobsCount: number;
  socketConnected: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

/** هوک ساده‌ی مدیا کوئری (بدون وابستگی اضافه) برای حالت فشرده‌ی هدر. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);
  return matches;
}

const NAV_ITEMS = [
  { to: '/hunt', label: 'رادار', fa: 'رادار شکار', icon: Radar, desc: 'HUNT' },
  { to: '/pipeline', label: 'پایپ‌لاین', fa: 'پایپ‌لاین', icon: Workflow, desc: 'PIPE' },
  { to: '/studio', label: 'استودیو', fa: 'استودیو کد', icon: Terminal, desc: 'CODE' },
  { to: '/ops', label: 'سایبورگ', fa: 'اتوماسیون', icon: Cpu, desc: 'OPS' },
] as const;

export const BrutalHeader: React.FC<BrutalHeaderProps> = ({
  onOpenSettings,
  onOpenCommandPalette,
  onQuickScan,
  isScanning,
  scanStatusText,
  totalEarningsToday,
  activeJobsCount,
  socketConnected,
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  // زیر ۱۲۸۰px نام مدل/کلید در دکمه‌ی سوئیچر جا نمی‌شود و ردیف هدر را از قاب بیرون می‌زند
  const isWide = useMediaQuery('(min-width: 1280px)');

  return (
    <header className="sticky top-0 z-40 w-full max-w-full bg-white border-b-[3px] border-[#0a0a0a] shadow-[0_4px_0px_0px_#0a0a0a] overflow-x-clip">
      {/* Top brutal bar: ticker-like */}
      <div className="h-[28px] bg-[#0a0a0a] text-[#FFFBF0] flex items-center overflow-hidden text-[11px] font-mono font-bold tracking-widest uppercase">
        <div className="flex min-w-0 items-center gap-0 h-full">
          <span className="h-full flex items-center px-3 bg-[#FFDE03] text-[#0a0a0a] border-r-[2.5px] border-[#0a0a0a]">KONKLANCER OS v4</span>
          <span className="hidden md:flex items-center gap-2 px-3 border-r border-white/20">
            <span className={`w-2 h-2 rounded-none border border-white ${socketConnected ? 'bg-[#00E599] animate-pulse' : 'bg-[#FF4D00]'}`} />
            {socketConnected ? 'BRIDGE LIVE' : 'STANDALONE'}
          </span>
          <span className="hidden 2xl:flex items-center px-3 border-r border-white/20">NEO-BRUTALIST • SPACE-SAVING • EVERYTHING COLLAPSIBLE</span>
          <span className="hidden 2xl:flex items-center px-3">▲ BUILT FOR FREELANCERS WHO SHIP FAST</span>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center h-full">
          {totalEarningsToday > 0 && (
            <span className="h-full flex items-center gap-1.5 px-3 bg-[#00E599] text-[#0a0a0a] border-l-[2.5px] border-[#0a0a0a] font-black">
              <TrendingUp className="w-3.5 h-3.5" />
              {totalEarningsToday.toLocaleString('fa-IR')} ت ● TODAY
            </span>
          )}
          <span className="h-full flex items-center px-3 bg-white text-[#0a0a0a] border-l-[2.5px] border-[#0a0a0a] font-black">
            {new Date().toLocaleDateString('fa-IR')} ● TEHRAN
          </span>
        </div>
      </div>

      {/* Main header */}
      <div className="bg-[#FFFBF0] border-b-[2.5px] border-[#0a0a0a]/10">
        <div className="max-w-[1600px] mx-auto flex min-w-0 items-center gap-2 lg:gap-3 px-2 sm:px-3 lg:px-4 h-[64px]">
          {/* Brand block */}
          <div className="flex min-w-0 items-center gap-2 lg:gap-3 shrink-0">
            <button onClick={onToggleSidebar} className="brutal-icon-btn lg:hidden" aria-label="toggle sidebar">
              {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 shrink-0 lg:w-11 lg:h-11 bg-[#0a0a0a] border-[2.5px] border-[#0a0a0a] shadow-[3px_3px_0px_0px_#0a0a0a] flex items-center justify-center text-[#FFDE03]">
                <Zap className="w-6 h-6 fill-[#FFDE03]" />
              </div>
              <div className="leading-none hidden lg:block shrink-0 whitespace-nowrap">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[20px] font-black tracking-tighter leading-none whitespace-nowrap">KONK</span>
                  <span className="text-[20px] font-black tracking-tighter leading-none text-[#0066FF] whitespace-nowrap">LANCER</span>
                  <span className="hidden xl:inline-flex ml-1 px-1.5 py-0.5 bg-[#FFDE03] border-[2px] border-[#0a0a0a] text-[10px] font-black tracking-widest">V4 STUDIO</span>
                </div>
                <div className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-[#6B6B6B] mt-0.5 hidden 2xl:block">BRUTALISM • FUNCTION • SPEED</div>
              </div>
            </div>
          </div>

          {/* Nav tabs - desktop */}
          <nav className="hidden xl:flex items-center gap-1.5 ml-4 min-w-0">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2 px-3.5 py-2 border-[2.5px] font-black text-[12px] tracking-wide uppercase transition-all ${
                    isActive
                      ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] shadow-[3px_3px_0px_0px_#0a0a0a] -translate-y-[1px]'
                      : 'bg-white text-[#0a0a0a] border-[#0a0a0a] shadow-[2px_2px_0px_0px_#0a0a0a] hover:shadow-[3px_3px_0px_0px_#0a0a0a] hover:-translate-y-[1px]'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden xl:inline">{item.label}</span>
                <span className="xl:hidden">{item.desc}</span>
                {item.to === '/pipeline' && activeJobsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-[#FFDE03] text-[#0a0a0a] border border-[#0a0a0a] text-[10px] font-mono font-black">
                    {activeJobsCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1 min-w-0 hidden xl:block" />

          {/* Actions */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Account / Supabase auth (Google · GitHub · Telegram) */}
            <AccountMenu />

            {/* Live API-key / model switcher — فشرده زیر ۱۲۸۰px تا هدر از قاب بیرون نزند */}
            <LiveModelSwitcher onOpenFullSettings={onOpenSettings} compact={!isWide} />

            <button
              onClick={onOpenCommandPalette}
              aria-label="جستجو در دستورها"
              className="flex items-center justify-center gap-2 h-[42px] w-[42px] sm:w-auto sm:px-3 bg-white border-[2.5px] border-[#0a0a0a] shadow-[3px_3px_0px_0px_#0a0a0a] hover:shadow-[2px_2px_0px_0px_#0a0a0a] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            >
              <Search className="w-4 h-4" />
              <span className="text-[12px] font-black uppercase tracking-wide hidden xl:inline">جستجو</span>
              <span className="hidden xl:flex items-center gap-1 ml-2 px-1.5 py-0.5 bg-[#0a0a0a] text-white text-[10px] font-mono font-bold">
                <Command className="w-3 h-3" /> K
              </span>
            </button>

            <button
              onClick={onQuickScan}
              disabled={isScanning}
              className="flex items-center justify-center gap-2 h-[42px] w-[42px] sm:w-auto sm:px-3 lg:px-4 bg-[#FFDE03] border-[2.5px] border-[#0a0a0a] shadow-[3px_3px_0px_0px_#0a0a0a] hover:shadow-[2px_2px_0px_0px_#0a0a0a] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all font-black text-[12px] uppercase tracking-wide disabled:opacity-60"
            >
              <Radar className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{isScanning ? 'SCANNING...' : 'اسکن عمیق'}</span>
              <span className="hidden sm:inline lg:hidden">SCAN</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="w-[42px] h-[42px] shrink-0 bg-white border-[2.5px] border-[#0a0a0a] shadow-[3px_3px_0px_0px_#0a0a0a] hover:shadow-[2px_2px_0px_0px_#0a0a0a] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center transition-all"
              title="Settings"
              aria-label="تنظیمات"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scanning ticker */}
      {isScanning && scanStatusText && (
        <div className="bg-[#0066FF] border-b-[2.5px] border-[#0a0a0a] text-white px-4 py-2 flex items-center gap-3 text-[12px] font-bold overflow-hidden">
          <span className="w-2 h-2 bg-white animate-pulse border border-black shrink-0" />
          <span className="truncate">{scanStatusText}</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] text-[10px] font-mono font-black animate-pulse">LIVE SCAN</span>
        </div>
      )}

      {/* Mobile nav tabs */}
      <div className="xl:hidden bg-white border-t-[2.5px] border-[#0a0a0a] px-2 py-2 flex items-center gap-2 overflow-x-auto brutal-scroll overscroll-x-contain">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `shrink-0 flex items-center gap-1.5 px-3 py-2 border-[2.5px] text-[11px] font-black uppercase tracking-wide ${
                isActive ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-[#0a0a0a] border-[#0a0a0a]/20'
              }`
            }
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </header>
  );
};
