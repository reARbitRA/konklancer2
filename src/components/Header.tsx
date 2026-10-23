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
} from 'lucide-react';
import { isNativeAndroidApp, isStandaloneClientMode } from '../services/browserLLM';

interface HeaderProps {
  activeTab: 'hunter' | 'coder' | 'pipeline' | 'autopilot';
  setActiveTab: (tab: 'hunter' | 'coder' | 'pipeline' | 'autopilot') => void;
  onOpenSettings: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
  scanStatusText?: string | null;
  totalEarningsToday: number;
  activeJobsCount: number;
  socketConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onQuickScan,
  isScanning,
  scanStatusText,
  totalEarningsToday,
  activeJobsCount,
}) => {
  const nativeApp = isNativeAndroidApp();

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 py-2 max-w-7xl flex-wrap items-center justify-between gap-2 px-3 sm:px-6">
          {/* Zone 1: Brand title wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>KonkLancer</span>
                <span className="text-[10px] font-bold text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                  {nativeApp ? 'v3 APK' : 'v3 Studio'}
                </span>
              </div>
            </div>
          </div>

          {/* Zone 2: Desktop / Landscape Tablet Navigation */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800/80 rounded-xl">
            <button
              onClick={() => setActiveTab('hunter')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'hunter'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radar className="h-3.5 w-3.5" />
              <span>شکار پروژه‌ها</span>
            </button>

            <button
              onClick={() => setActiveTab('coder')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'coder'
                  ? 'bg-emerald-500/15 text-emerald-300 shadow-sm border border-emerald-500/40 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>استودیو تحویل و مستندات فنی</span>
            </button>

            <button
              onClick={() => setActiveTab('pipeline')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'pipeline'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Workflow className="h-3.5 w-3.5" />
              <span>پایپ‌لاین</span>
              {activeJobsCount > 0 && (
                <span className="font-mono text-[10px] bg-slate-700 text-slate-200 rounded px-1.5 py-0.2">
                  {activeJobsCount.toLocaleString('fa-IR')}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('autopilot')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'autopilot'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>رادار سایبورگ</span>
            </button>
          </nav>

          {/* Zone 3: Real-Time Key/Model Switcher + Deep Scan + Settings */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-400">درآمد امروز:</span>
              <span className="font-mono font-medium text-emerald-400 tabular-nums">
                {totalEarningsToday.toLocaleString('fa-IR')} تومان
              </span>
            </div>

            {!isStandaloneClientMode() && (
              <button
                onClick={handleInstantWebAppInstall}
                title="نصب میانبر روی صفحه اصلی تبلت"
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold text-sky-300 bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/40 rounded-lg transition-all whitespace-nowrap"
              >
                <Zap className="h-3.5 w-3.5 text-sky-400" />
                <span>نصب وب‌اپ</span>
              </button>
            )}

            {/* سوئیچر زنده و آنی کلید API و مدل هوش مصنوعی در هر لحظه */}
            <LiveModelSwitcher onOpenFullSettings={onOpenSettings} />

            <button
              onClick={onQuickScan}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all rounded-lg shadow-sm whitespace-nowrap disabled:opacity-50"
            >
              <Radar className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'اسکن عمیق...' : 'اسکن عمیق'}</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
              title="مدیریت گاوصندوق کلیدهای API و تنظیمات"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          {isScanning && scanStatusText && (
            <div className="w-full pt-1.5 border-t border-slate-800/70 flex items-center gap-2 text-xs text-emerald-300">
              <Cpu className="w-3.5 h-3.5 animate-pulse text-emerald-400 shrink-0" />
              <span className="truncate">{scanStatusText}</span>
            </div>
          )}
        </div>
      </header>

      {/* Portrait Tablet / Split-Screen Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-2 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))] grid grid-cols-4 gap-1">
        <button
          onClick={() => setActiveTab('hunter')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'hunter' ? 'text-emerald-400 bg-slate-900' : 'text-slate-400'
          }`}
        >
          <Radar className="h-4 w-4 mb-0.5" />
          <span>پروژه‌ها</span>
        </button>
        <button
          onClick={() => setActiveTab('coder')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'coder' ? 'text-emerald-400 bg-slate-900' : 'text-slate-400'
          }`}
        >
          <Terminal className="h-4 w-4 mb-0.5" />
          <span>مستندات و تحویل</span>
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium relative ${
            activeTab === 'pipeline' ? 'text-emerald-400 bg-slate-900' : 'text-slate-400'
          }`}
        >
          <Workflow className="h-4 w-4 mb-0.5" />
          <span>پایپ‌لاین</span>
        </button>
        <button
          onClick={() => setActiveTab('autopilot')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'autopilot' ? 'text-emerald-400 bg-slate-900' : 'text-slate-400'
          }`}
        >
          <Sparkles className="h-4 w-4 mb-0.5" />
          <span>رادار خودکار</span>
        </button>
      </nav>
    </>
  );
};
