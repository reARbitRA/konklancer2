import React, { useEffect, useState } from 'react';
import { Activity, CircleDot, Cpu, Database, Radar, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { AppTab } from './Header';
import type { FeedSource } from './FeedStatusBar';
import { readKeyVault, subscribeVaultChanges } from '../utils/customLLMClient';

const FEED_LABEL: Record<FeedSource, string> = {
  scanner: 'اسکنر واقعی پونیشا/کارلانسر/پارس‌کدرز',
  demo: 'داده‌ی نمایشی',
  empty: 'فید خالی',
  unknown: 'آماده‌سازی فید',
};

interface StatusBarProps {
  socketConnected: boolean;
  feedSource: FeedSource;
  jobCount: number;
  activeTab: AppTab;
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  socketConnected,
  feedSource,
  jobCount,
  activeTab,
  onOpenSettings,
  onOpenCommandPalette,
}) => {
  const [vault, setVault] = useState(() => readKeyVault());

  useEffect(() => {
    return subscribeVaultChanges(() => setVault(readKeyVault()));
  }, []);

  const activeKey = vault.profiles.find((k) => k.id === vault.activeProfileId) || vault.profiles[0];
  const modelName = activeKey?.selectedModel || 'تنظیم‌نشده';

  const tabLabel: Record<AppTab, string> = {
    hunter: 'رادار پروژه‌ها',
    coder: 'استودیو تحویل کد',
    pipeline: 'پایپ‌لاین',
    autopilot: 'مرکز سایبورگ',
  };

  return (
    <footer className="hidden h-6 shrink-0 items-center gap-3 border-t border-slate-800/80 bg-[#060b14] px-4 font-mono text-[10.5px] text-slate-500 md:flex z-30">
      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
        <Terminal className="h-3 w-3" /> KonkLancer v3
      </span>
      <span className="text-slate-700">|</span>
      <span className="flex items-center gap-1">
        <CircleDot className={`h-3 w-3 ${socketConnected ? 'text-emerald-400' : 'text-slate-500'}`} />
        {socketConnected ? 'bridge live' : 'standalone local'}
      </span>
      <span className="text-slate-700">|</span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex items-center gap-1 hover:text-emerald-300 transition-colors"
      >
        <Cpu className="h-3 w-3 text-slate-400" />
        <span className="truncate max-w-[160px] text-slate-300" dir="ltr">{modelName}</span>
      </button>
      <span className="text-slate-700">|</span>
      <span className="flex items-center gap-1">
        <Database className="h-3 w-3 text-slate-400" />
        <span>{FEED_LABEL[feedSource]}</span>
      </span>
      <span className="flex items-center gap-1 text-slate-400">
        <Activity className="h-3 w-3" />
        <span>{jobCount.toLocaleString('fa-IR')} پروژه فعال</span>
      </span>
      <span className="flex-1" />
      {onOpenCommandPalette && (
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden text-slate-500 hover:text-slate-300 transition-colors lg:inline-flex items-center gap-1"
        >
          <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> جست‌وجو
        </button>
      )}
      <span className="text-slate-400 font-sans font-medium">{tabLabel[activeTab]}</span>
    </footer>
  );
};

interface MobileNavProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeJobsCount: number;
}

const MOBILE_TABS: Array<{ key: AppTab; label: string; icon: React.ElementType }> = [
  { key: 'hunter', label: 'پروژه‌ها', icon: Radar },
  { key: 'coder', label: 'استودیو', icon: Terminal },
  { key: 'pipeline', label: 'پایپ‌لاین', icon: Workflow },
  { key: 'autopilot', label: 'سایبورگ', icon: Sparkles },
];

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab, activeJobsCount }) => (
  <nav
    className="flex shrink-0 items-stretch border-t border-slate-800/80 bg-[#070c16]/95 pb-[calc(0.4rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden fixed bottom-0 inset-x-0 z-40"
    aria-label="ناوبری تبلت و موبایل"
  >
    {MOBILE_TABS.map((tab) => {
      const Icon = tab.icon;
      const active = tab.key === activeTab;
      return (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
            active ? 'text-emerald-300' : 'text-slate-500'
          }`}
        >
          {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-400" />}
          <Icon className="h-4 w-4" />
          <span>{tab.label}</span>
          {tab.key === 'pipeline' && activeJobsCount > 0 && (
            <span className="absolute right-[22%] top-1 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-slate-950 font-mono">
              {activeJobsCount.toLocaleString('fa-IR')}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
