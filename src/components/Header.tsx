import React from 'react';
import {
  Radar,
  Settings,
  Terminal,
  Workflow,
  Sparkles,
  Zap,
  TrendingUp,
  Smartphone,
  Cpu,
  Search,
} from 'lucide-react';
import { isNativeAndroidApp } from '../services/browserLLM';
import { LiveModelSwitcher } from './LiveModelSwitcher';

export type AppTab = 'hunter' | 'coder' | 'pipeline' | 'autopilot';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
  scanStatusText?: string | null;
  totalEarningsToday: number;
  activeJobsCount: number;
  socketConnected?: boolean;
  onOpenCommandPalette?: () => void;
}

const TABS: Array<{ key: AppTab; label: string; short: string; icon: React.ElementType }> = [
  { key: 'hunter', label: 'رادار پروژه‌ها', short: 'پروژه‌ها', icon: Radar },
  { key: 'coder', label: 'استودیو تحویل کد', short: 'کد', icon: Terminal },
  { key: 'pipeline', label: 'پایپ‌لاین', short: 'پایپ‌لاین', icon: Workflow },
  { key: 'autopilot', label: 'مرکز سایبورگ', short: 'سایبورگ', icon: Sparkles },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onQuickScan,
  isScanning,
  scanStatusText,
  totalEarningsToday,
  activeJobsCount,
  socketConnected = false,
  onOpenCommandPalette,
}) => {
  const nativeApp = isNativeAndroidApp();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#070c16]/90 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        {/* Zone 1: Brand title wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_-8px_rgba(52,211,153,0.7)]">
            <Zap className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm sm:text-base font-bold tracking-tight text-white">KonkLancer</span>
            <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
              {nativeApp ? 'v3 APK' : 'v3 Studio'}
            </span>
            <span
              className={`ms-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                socketConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-amber-400'
              }`}
              title={socketConnected ? 'اتصال زنده اسکنر برقرار است' : 'حالت لوکال / در حال اتصال…'}
            />
          </div>
        </div>

        {/* Zone 2: Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-800/80 rounded-xl" aria-label="بخش‌های اصلی">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-slate-800 text-emerald-300 shadow-sm border border-slate-700/60 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="hidden lg:inline">{tab.label}</span>
                <span className="lg:hidden">{tab.short}</span>
                {tab.key === 'pipeline' && activeJobsCount > 0 && (
                  <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.2">
                    {activeJobsCount.toLocaleString('fa-IR')}
                  </span>
                )}
                {active && <span className="absolute -bottom-[5px] inset-x-2 h-[2px] bg-emerald-400/80 rounded-full" />}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Search / Palette + Key Switcher + Scan + Settings */}
        <div className="flex items-center gap-2">
          {/* Quick command search trigger */}
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="group hidden sm:flex h-8 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
              title="جست‌وجوی سراسری (Ctrl + K)"
            >
              <Search className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300" />
              <span className="hidden lg:inline text-[11px] text-slate-500">جست‌وجو…</span>
              <kbd className="kbd">Ctrl+K</kbd>
            </button>
          )}

          {totalEarningsToday > 0 && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono font-medium text-emerald-400 tabular-nums">
                {totalEarningsToday.toLocaleString('fa-IR')} ت
              </span>
            </div>
          )}

          {nativeApp && (
            <span className="hidden lg:flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-700/50 rounded-lg">
              <Smartphone className="h-3 w-3 text-emerald-400" />
              <span>APK</span>
            </span>
          )}

          {/* سوئیچر زنده و آنی کلید API و مدل هوش مصنوعی در هر لحظه */}
          <LiveModelSwitcher onOpenFullSettings={onOpenSettings} />

          <button
            onClick={onQuickScan}
            disabled={isScanning}
            className="btn btn-primary h-8 px-2.5 sm:px-3 text-xs"
          >
            <Radar className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isScanning ? 'در حال اسکن...' : 'اسکن عمیق'}</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="icon-btn h-8 w-8 border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
            title="مدیریت گاوصندوق کلیدهای API و تنظیمات"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isScanning && scanStatusText && (
        <div className="w-full border-t border-slate-800/70 bg-emerald-950/30 px-4 py-1 flex items-center gap-2 text-xs text-emerald-300">
          <Cpu className="w-3.5 h-3.5 animate-pulse text-emerald-400 shrink-0" />
          <span className="truncate">{scanStatusText}</span>
        </div>
      )}
    </header>
  );
};
