import React from 'react';
import { 
  Radar, 
  Settings, 
  FolderGit2, 
  Terminal, 
  Workflow, 
  Sparkles,
  Zap,
  TrendingUp
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'hunter' | 'coder' | 'pipeline' | 'autopilot';
  setActiveTab: (tab: 'hunter' | 'coder' | 'pipeline' | 'autopilot') => void;
  onOpenSettings: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
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
  totalEarningsToday,
  activeJobsCount,
  socketConnected = false,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Zone 1: Brand title wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <a href="/" className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <span>FreelanceFlow AI</span>
              <span className="text-[11px] font-normal text-emerald-400/90 font-mono">v2026.9</span>
            </a>
          </div>

          {/* Socket.io Live Status Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-md text-[10px] font-mono text-slate-300">
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{socketConnected ? 'Bridge Live' : 'Connecting...'}</span>
          </div>
        </div>

        {/* Zone 2: Navigation tabs adhering to clean typography */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800/80 rounded-xl">
          <button
            onClick={() => setActiveTab('hunter')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'hunter'
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="h-3.5 w-3.5" />
            <span>شکار هوشمند پروژه‌ها</span>
          </button>

          <button
            onClick={() => setActiveTab('coder')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'coder'
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>استودیو ایجنت و سورس</span>
          </button>

          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'pipeline'
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Workflow className="h-3.5 w-3.5" />
            <span>پایپ‌لاین تحویل و تسویه</span>
            {activeJobsCount > 0 && (
              <span className="font-mono text-[10px] bg-slate-700 text-slate-200 rounded px-1.5 py-0.2">
                {activeJobsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('autopilot')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'autopilot'
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>رادار خودکار سایبورگ</span>
          </button>
        </nav>

        {/* Zone 3: Primary Actions and Metrics */}
        <div className="flex items-center gap-3">
          {/* Revenue metric */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400">درآمد امروز:</span>
            <span className="font-mono font-medium text-emerald-400 tabular-nums">
              {totalEarningsToday.toLocaleString('fa-IR')} تومان
            </span>
          </div>

          {/* Quick scan action */}
          <button
            onClick={onQuickScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all rounded-lg shadow-sm whitespace-nowrap font-medium disabled:opacity-50"
          >
            <Radar className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'درحال رصد بازار...' : 'اسکن فوری سایت‌ها'}</span>
          </button>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="تنظیمات سامانه و گیت‌هاب"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
