import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Radar, Workflow, Terminal, Activity, BarChart3, Settings, Search, Menu, X, PanelLeftClose, PanelLeftOpen, ArrowUpRight } from 'lucide-react';
import { LiveModelSwitcher } from '../LiveModelSwitcher';
import { AccountMenu } from '../auth/AccountMenu';
import type { FeedSource } from '../FeedStatusBar';

const routes = [
  { to: '/hunt', label: 'پروژه‌ها', en: 'Discover', icon: Radar, description: 'فرصت‌های مناسب را پیدا و بررسی کنید.' },
  { to: '/pipeline', label: 'پایپ‌لاین', en: 'Pipeline', icon: Workflow, description: 'پروژه‌ها را از بررسی تا تحویل پیگیری کنید.' },
  { to: '/studio', label: 'استودیو', en: 'Studio', icon: Terminal, description: 'فایل‌ها و خروجی پروژه را آماده کنید.' },
  { to: '/analytics', label: 'کارنامه', en: 'Insights', icon: BarChart3, description: 'نتیجه پیشنهادهای ثبت‌شده را بررسی کنید.' },
  { to: '/ops', label: 'عملیات', en: 'Operations', icon: Activity, description: 'اسکن و عملیات خودکار را مدیریت کنید.' },
] as const;

interface Props {
  children: React.ReactNode;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
  scanStatusText: string | null;
  socketConnected: boolean;
  feedSource: FeedSource;
  jobCount: number;
}

export function ConsoleShell({ children, onOpenSettings, onOpenCommandPalette, onQuickScan, isScanning, scanStatusText, socketConnected, feedSource, jobCount }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer]);
  const location = useLocation();
  const current = routes.find(route => location.pathname.startsWith(route.to));
  const feedLabel: Record<FeedSource, string> = { scanner: 'فید اسکنر', demo: 'فید نمایشی', empty: 'فید خالی', unknown: 'در انتظار فید' };
  return <div className="console-shell" dir="rtl">
    <a className="console-skip" href="#main-content">پرش به محتوای اصلی</a>
    <header className="console-header">
      <button className="console-icon console-mobile-menu" aria-label={drawer ? 'بستن منو' : 'باز کردن منو'} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>{drawer ? <X size={19}/> : <Menu size={19}/>}</button>
      <NavLink to="/hunt" className="console-brand" aria-label="کنکلنسر، پروژه‌ها"><span className="console-mark">K<span>_</span></span><span>konklancer<small>FREELANCE WORKSPACE</small></span></NavLink>
      <div className="console-header-divider" />
      <span className="console-header-context">فضای کاری <span>/</span> {current?.label || 'حساب کاربری'}</span>
      <div className="console-header-actions">
        <button className="console-search" onClick={onOpenCommandPalette} aria-label="جستجو در دستورها"><Search size={16}/><span>جستجو یا فرمان</span><kbd>⌘ K</kbd></button>
        <div className="console-model"><LiveModelSwitcher onOpenFullSettings={onOpenSettings} compact /></div>
        <AccountMenu />
        <button className="console-icon" onClick={onOpenSettings} aria-label="تنظیمات"><Settings size={18}/></button>
      </div>
    </header>
    <div className="console-body">
      {drawer && <button className="console-backdrop" aria-label="بستن منو" onClick={() => setDrawer(false)} />}
      <aside className={`console-rail ${collapsed ? 'is-collapsed' : ''} ${drawer ? 'is-open' : ''}`}>
        <div className="console-rail-top"><span>WORKSPACE <b>01</b></span><button className="console-icon console-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button></div>
        <nav aria-label="ناوبری اصلی" className="console-nav">{routes.map(({to,label,en,icon:Icon}, i) => <NavLink key={to} to={to} title={label} onClick={() => setDrawer(false)} className={({isActive}) => `console-nav-item ${isActive ? 'is-active' : ''}`}><Icon size={18}/><span className="console-nav-label">{label}<small>{en}</small></span><span className="console-nav-index">0{i+1}</span></NavLink>)}</nav>
        <div className="console-rail-bottom"><div className="console-rail-caption">WORKSPACE STATUS</div><div className="console-rail-status"><span className={`console-dot ${socketConnected ? 'is-online' : ''}`}/><span>{socketConnected ? 'اتصال سرور برقرار' : 'اتصال سرور برقرار نیست'}</span></div><div className="console-rail-meta"><span>{feedLabel[feedSource]}</span><strong>{jobCount.toLocaleString('fa-IR')}</strong></div><button onClick={onOpenSettings} className="console-rail-settings"><Settings size={16}/><span>تنظیمات</span><ArrowUpRight size={14}/></button></div>
      </aside>
      <main id="main-content" className="console-main" tabIndex={-1}>
        <div className="console-page-heading"><div><div className="console-eyebrow"><span className="console-dot is-online"/> WORKSPACE / {current?.en.toUpperCase() || 'ACCOUNT'}</div><h1>{current?.label || 'حساب کاربری'}</h1><p>{current?.description || 'حساب و نشست خود را مدیریت کنید.'}</p></div>{location.pathname === '/hunt' && <button className="console-primary" onClick={onQuickScan} disabled={isScanning}><Radar size={17}/>{isScanning ? 'در حال اسکن' : 'اسکن پروژه‌ها'} <ArrowUpRight size={15}/></button>}</div>
        {scanStatusText && <div className="console-scanning" role="status">{scanStatusText}</div>}
        <div className="console-content">{children}</div>
      </main>
    </div>
    <nav className="console-mobile-nav" aria-label="ناوبری موبایل">{routes.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} className={({isActive}) => isActive ? 'is-active' : ''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
  </div>;
}
