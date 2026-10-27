import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Radar, Terminal, Workflow, Cpu, Layers, TrendingUp, Database, Zap, Settings, ChevronLeft, ChevronRight, BarChart3, Vault, Activity, Search, Filter, Tag, Clock, Target, ShieldCheck, Sparkles } from 'lucide-react';
import { BrutalCollapsible } from '../brutalist/Collapsible';
import { FreelanceJob } from '../../types';
import { FeedSource } from '../FeedStatusBar';

interface BrutalSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  jobs: FreelanceJob[];
  feed: { source: FeedSource; scannedAt: string | null; scannedProjects: number };
  onOpenSettings: () => void;
}

export const BrutalSidebar: React.FC<BrutalSidebarProps> = ({ collapsed, onToggle, jobs, feed, onOpenSettings }) => {
  const stats = {
    total: jobs.length,
    prime: jobs.filter(j => j.relevanceTier === 'prime' || j.pinned || j.isManual).length,
    saved: jobs.filter(j => j.isManual || j.pinned).length,
    new: jobs.filter(j => j.status === 'new').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    earnings: jobs.filter(j => j.status === 'completed').reduce((a, j) => a + (j.proposedPrice || j.budget || 0), 0),
  };

  if (collapsed) {
    return (
      <aside className="hidden lg:flex w-[68px] shrink-0 bg-white border-r-[3px] border-[#0a0a0a] flex-col sticky top-[92px] h-[calc(100vh-92px)] overflow-hidden">
        <div className="p-2 border-b-[2.5px] border-[#0a0a0a] bg-[#FFFBF0] flex justify-center">
          <button onClick={onToggle} className="w-10 h-10 bg-[#0a0a0a] text-white border-[2px] border-[#0a0a0a] flex items-center justify-center hover:bg-[#1a1a1a]">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-2">
          {[
            { to: '/hunt', icon: Radar, label: 'HUNT' },
            { to: '/pipeline', icon: Workflow, label: 'PIPE' },
            { to: '/studio', icon: Terminal, label: 'CODE' },
            { to: '/ops', icon: Cpu, label: 'OPS' },
            { to: '/analytics', icon: BarChart3, label: 'STATS' },
          ].map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `w-10 h-10 border-[2.5px] border-[#0a0a0a] flex items-center justify-center transition-all ${isActive ? 'bg-[#FFDE03] text-[#0a0a0a] shadow-[2px_2px_0px_0px_#0a0a0a]' : 'bg-white hover:bg-[#0a0a0a] hover:text-white'}`}>
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t-[2.5px] border-[#0a0a0a] space-y-2">
          <div className="w-10 h-10 bg-[#0a0a0a] text-white border-[2px] border-[#0a0a0a] flex flex-col items-center justify-center leading-none">
            <span className="text-[10px] font-black">{stats.total}</span>
            <span className="text-[7px] font-mono">JOBS</span>
          </div>
          <button onClick={onOpenSettings} className="w-10 h-10 bg-white border-[2px] border-[#0a0a0a] flex items-center justify-center hover:bg-[#FFFBF0]"><Settings className="w-4 h-4" /></button>
        </div>
      </aside>
    );
  }

  // expanded: off-canvas drawer on tablet/phone (the header toggle finally does
  // something below lg), static control rail from lg up
  return (
    <>
    <div
      className="fixed inset-0 z-[55] bg-[#0a0a0a]/60 lg:hidden"
      onClick={onToggle}
      aria-hidden="true"
      data-testid="sidebar-backdrop"
    />
    <aside
      data-testid="sidebar"
      className="fixed inset-y-0 right-0 z-[60] flex w-[86vw] max-w-[340px] flex-col overflow-hidden bg-[#FFFBF0] border-l-[3px] border-[#0a0a0a] lg:sticky lg:inset-auto lg:top-[92px] lg:right-auto lg:z-auto lg:h-[calc(100vh-92px)] lg:w-[300px] lg:max-w-none lg:shrink-0 lg:border-l-0 lg:border-r-[3px]"
    >
      {/* Collapse handle */}
      <div className="h-10 shrink-0 bg-[#0a0a0a] text-white flex items-center justify-between px-3 border-b-[2.5px] border-[#0a0a0a]">
        <span className="text-[11px] font-black tracking-[0.14em] uppercase">CONTROL RAIL — SPACE SAVER</span>
        <button onClick={onToggle} aria-label="بستن کنترل‌ریل" className="w-7 h-7 bg-white text-black border-[2px] border-white flex items-center justify-center hover:bg-[#FFDE03]">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto brutal-scroll p-3 space-y-3">
        {/* Navigation collapsible */}
        <BrutalCollapsible title="ناوبری سریع" icon={Layers} badge={`${stats.total} پروژه`} storageKey="nav" variant="ink" defaultOpen={true}>
          <nav className="grid grid-cols-2 gap-2">
            {[
              { to: '/hunt', label: 'رادار شکار', sub: 'HUNT • RADAR', icon: Radar, count: stats.new },
              { to: '/pipeline', label: 'پایپ‌لاین', sub: 'PIPE • KANBAN', icon: Workflow, count: stats.inProgress },
              { to: '/studio', label: 'استودیو کد', sub: 'CODE • STUDIO', icon: Terminal, count: stats.completed },
              { to: '/ops', label: 'اتوماسیون', sub: 'OPS • CYBORG', icon: Cpu, count: stats.prime },
              { to: '/analytics', label: 'کارنامه', sub: 'STATS • OUTCOME', icon: BarChart3, count: stats.completed },
            ].map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group flex flex-col gap-1 p-3 border-[2.5px] border-[#0a0a0a] transition-all text-right ${
                    isActive ? 'bg-[#0a0a0a] text-white shadow-[3px_3px_0px_0px_#0a0a0a] translate-x-[-1px] translate-y-[-1px]' : 'bg-white hover:bg-[#FFDE03] hover:shadow-[2px_2px_0px_0px_#0a0a0a]'
                  }`
                }
              >
                <div className="flex items-center justify-between">
                  <item.icon className="w-4 h-4" />
                  <span className="text-[10px] font-mono font-black px-1 py-0.5 bg-[#FFDE03] text-black border border-black group-[.bg-[#0a0a0a]]:bg-white">{item.count}</span>
                </div>
                <span className="text-[12px] font-black leading-none">{item.label}</span>
                <span className="text-[9px] font-mono opacity-60">{item.sub}</span>
              </NavLink>
            ))}
          </nav>
        </BrutalCollapsible>

        {/* Stats */}
        <BrutalCollapsible title="آمار زنده" icon={BarChart3} variant="accent" defaultOpen={true} storageKey="stats">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'کل', value: stats.total, bg: 'bg-white' },
              { label: 'طلایی', value: stats.prime, bg: 'bg-[#FFDE03]' },
              { label: 'تسویه', value: stats.completed, bg: 'bg-[#00E599]' },
            ].map(s => (
              <div key={s.label} className={`border-[2.5px] border-[#0a0a0a] p-2 text-center ${s.bg}`}>
                <div className="text-[16px] font-black leading-none">{s.value.toLocaleString('fa-IR')}</div>
                <div className="text-[9px] font-black uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-2.5 bg-[#0a0a0a] text-white border-[2px] border-[#0a0a0a] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono tracking-widest opacity-70">TOTAL EARNINGS</div>
              <div className="text-[13px] font-black font-mono">{stats.earnings.toLocaleString('fa-IR')} ت</div>
            </div>
            <TrendingUp className="w-5 h-5 text-[#00E599]" />
          </div>
          <div className="mt-2 text-[11px] font-medium text-[#6B6B6B] flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            فید: {feed.source === 'scanner' ? 'اسکنر واقعی' : feed.source === 'demo' ? 'دمو' : 'در انتظار'}
            {feed.scannedAt && <span className="mr-auto font-mono text-[10px]">● {new Date(feed.scannedAt).toLocaleTimeString('fa-IR')}</span>}
          </div>
        </BrutalCollapsible>

        {/* Quick filters collapsible */}
        <BrutalCollapsible title="فیلترهای سریع" icon={Filter} defaultOpen={false} storageKey="filters">
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest">پلتفرم‌ها</div>
            <div className="flex flex-wrap gap-1.5">
              {['پونیشا', 'کارلانسر', 'پارس‌کدرز', 'همه'].map(p => (
                <span key={p} className="px-2 py-1 bg-white border-[2px] border-[#0a0a0a] text-[11px] font-bold hover:bg-[#FFDE03] cursor-pointer">{p}</span>
              ))}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest mt-3">برچسب‌ها</div>
            <div className="flex flex-wrap gap-1">
              {['Python', 'FastAPI', 'Telegram Bot', 'Pandas', 'Web Scraping'].map(t => (
                <span key={t} className="px-2 py-1 bg-[#0066FF] text-white border-[1.5px] border-[#0a0a0a] text-[10px] font-mono font-bold">{t}</span>
              ))}
            </div>
          </div>
        </BrutalCollapsible>

        {/* Shortcuts */}
        <BrutalCollapsible title="میانبرها" icon={Zap} defaultOpen={false} storageKey="shortcuts">
          <div className="grid grid-cols-1 gap-1.5 text-[11px]">
            <button onClick={onOpenSettings} className="flex items-center gap-2 p-2.5 bg-white border-[2px] border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white font-bold text-right">
              <Settings className="w-4 h-4" /> مدیریت کلیدهای API
              <ChevronLeft className="w-3 h-3 mr-auto" />
            </button>
            <div className="flex items-center gap-2 p-2 bg-[#FFDE03] border-[2px] border-[#0a0a0a] font-mono text-[10px] font-bold">
              CTRL + K → پالت فرمان
            </div>
            <div className="flex items-center gap-2 p-2 bg-white border-[2px] border-[#0a0a0a] font-medium">
              <ShieldCheck className="w-4 h-4 text-[#00E599]" /> گاوصندوق دائمی فعال
            </div>
          </div>
        </BrutalCollapsible>

        {/* Activity mini */}
        <div className="brutal-panel">
          <div className="brutal-header brutal-header--ink">
            <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> لاگ زنده</span>
            <span className="w-2 h-2 bg-[#00E599] border border-white animate-pulse" />
          </div>
          <div className="p-2 space-y-1.5 max-h-[140px] overflow-y-auto brutal-scroll">
            {[
              ' موتور v4 نئو-بروتالیست آماده شد',
              ' اسکن عمیق چندصفحه‌ای فعال',
              ' گاوصندوق دائمی همگام‌سازی شد',
              ' استودیو ۳ مرحله‌ای در دسترس',
            ].map((m, i) => (
              <div key={i} className="text-[11px] font-mono flex gap-2 text-[#333] border-b border-dashed border-black/10 pb-1 last:border-0">
                <span className="text-[#0066FF] font-black">›</span>{m}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer of rail */}
      <div className="shrink-0 p-3 border-t-[2.5px] border-[#0a0a0a] bg-white">
        <div className="flex items-center gap-2 text-[11px] font-black">
          <Vault className="w-4 h-4" /> گاوصندوق
          <span className="mr-auto px-2 py-0.5 bg-[#8B5CF6] text-white border-[2px] border-black text-[10px] font-mono">{stats.saved} PINNED</span>
        </div>
        <div className="mt-2 h-1.5 bg-white border-[2px] border-black overflow-hidden">
          <div className="h-full bg-[#8B5CF6]" style={{ width: `${Math.min(100, (stats.saved / Math.max(1, stats.total)) * 100)}%` }} />
        </div>
      </div>
    </aside>
    </>
  );
};
