import React, { useEffect, useState } from 'react';
import { Activity, CircleDot, Cpu, Database, Radar, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { AppTab } from './Header';
import type { FeedSource } from './FeedStatusBar';
import { readKeyVault, subscribeVaultChanges } from '../utils/customLLMClient';

const FEED_LABEL: Record<FeedSource, string> = {
  scanner: 'اسکنر واقعی',
  demo: 'نمایشی',
  empty: 'خالی',
  unknown: 'آماده‌سازی',
};

interface StatusBarProps {
  socketConnected: boolean;
  feedSource: FeedSource;
  jobCount: number;
  activeTab: AppTab;
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ socketConnected, feedSource, jobCount, activeTab, onOpenSettings, onOpenCommandPalette }) => {
  const [vault, setVault] = useState(()=> readKeyVault());
  useEffect(()=> subscribeVaultChanges(()=> setVault(readKeyVault())), []);
  const activeKey = vault.profiles.find(k=>k.id===vault.activeProfileId) || vault.profiles[0];
  const modelName = activeKey?.selectedModel || 'تنظیم‌نشده';
  const tabLabel: Record<AppTab, string> = { hunter:'رادار', coder:'استودیو', pipeline:'پایپ‌لاین', autopilot:'سایبورگ' };

  return (
    <footer className="hidden md:flex h-[32px] shrink-0 items-center gap-2 border-t-[2.5px] border-black bg-black text-white px-3 font-mono text-[11px] font-bold">
      <span className="flex items-center gap-1.5"><Terminal className="w-3 h-3 text-[#FFDE03]" /> KONKLANCER V4</span>
      <span className="opacity-30">|</span>
      <span className="flex items-center gap-1"><CircleDot className={`w-3 h-3 ${socketConnected?'text-[#00E599]':'text-white/50'}`} /> {socketConnected?'BRIDGE LIVE':'STANDALONE'}</span>
      <span className="opacity-30">|</span>
      <button onClick={onOpenSettings} className="flex items-center gap-1 hover:text-[#FFDE03]"><Cpu className="w-3 h-3" /><span className="truncate max-w-[160px]">{modelName}</span></button>
      <span className="opacity-30">|</span>
      <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {FEED_LABEL[feedSource]}</span>
      <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {jobCount.toLocaleString('fa-IR')} پروژه</span>
      <span className="flex-1" />
      {onOpenCommandPalette && <button onClick={onOpenCommandPalette} className="px-2 py-0.5 bg-white text-black border border-white hover:bg-[#FFDE03] text-[10px]">CTRL+K SEARCH</button>}
      <span className="px-2 py-0.5 bg-[#FFDE03] text-black border border-white">{tabLabel[activeTab]}</span>
    </footer>
  );
};

interface MobileNavProps { activeTab: AppTab; setActiveTab: (tab: AppTab)=>void; activeJobsCount: number; }

const MOBILE_TABS: Array<{ key: AppTab; label: string; icon: React.ElementType }> = [
  { key:'hunter', label:'پروژه‌ها', icon: Radar },
  { key:'coder', label:'استودیو', icon: Terminal },
  { key:'pipeline', label:'پایپ‌لاین', icon: Workflow },
  { key:'autopilot', label:'سایبورگ', icon: Sparkles },
];

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab, activeJobsCount }) => (
  <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-[3px] border-black pb-[env(safe-area-inset-bottom)]">
    {MOBILE_TABS.map(tab=>{
      const Icon=tab.icon; const active=tab.key===activeTab;
      return (
        <button key={tab.key} onClick={()=>setActiveTab(tab.key)} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-black uppercase border-r-[2px] border-black last:border-0 ${active?'bg-black text-white':'bg-white'}`}>
          <Icon className="w-5 h-5" /> {tab.label}
          {tab.key==='pipeline' && activeJobsCount>0 && <span className="px-1 bg-[#FFDE03] text-black border border-black font-mono text-[9px]">{activeJobsCount}</span>}
        </button>
      );
    })}
  </nav>
);
