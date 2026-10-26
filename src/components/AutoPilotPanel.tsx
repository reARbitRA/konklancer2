import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Sparkles, Radar, ShieldCheck, Activity, Clock, Coins, CheckCircle2, Terminal, Zap, TrendingUp, Cpu, Settings, AlertTriangle, Play, Pause } from 'lucide-react';
import { ActivityLogItem, UserSettings, FreelanceJob } from '../types';
import { BrutalCollapsible } from './brutalist/Collapsible';
import { apiFetch } from '../utils/apiFetch';

interface AutoPilotPanelProps {
  logs: ActivityLogItem[];
  settings: UserSettings;
  jobs: FreelanceJob[];
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onTriggerManualScan: () => void;
  isScanning: boolean;
}

export const AutoPilotPanel: React.FC<AutoPilotPanelProps> = ({ logs, settings, jobs, onUpdateSettings, onTriggerManualScan, isScanning }) => {
  const [engineActive, setEngineActive] = useState(true);
  const [scanInterval, setScanInterval] = useState('2');
  const [bridgeStatus, setBridgeStatus] = useState<any>(null);

  React.useEffect(() => {
    const setStandalone = () => setBridgeStatus('standalone');
    let cancelled = false;
    const timeout = setTimeout(()=>{ if(!cancelled) setStandalone(); }, 2500);
    apiFetch('/api/bridge/status').then(r=>{ if(!r.ok) throw new Error(); return r.json(); }).then(d=>{ if(!cancelled) setBridgeStatus(d?.status||'online'); }).catch(()=>{ if(!cancelled) setStandalone(); }).finally(()=>{ if(!cancelled) clearTimeout(timeout); });
    return ()=>{ cancelled=true; clearTimeout(timeout); };
  }, []);

  const completedJobs = useMemo(()=> jobs.filter(j=>j.status==='completed'), [jobs]);
  const chartData = useMemo(()=>{
    const names=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
    const res=[]; const today=new Date();
    for(let i=6;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); const iso=d.toISOString().split('T')[0]; const label=i===0?'امروز':i===1?'دیروز':names[d.getDay()]; const dayJobs=completedJobs.filter(j=> j.completedAt? j.completedAt===iso : i===0); const total=dayJobs.reduce((a,j)=>a+(j.proposedPrice||j.budget||0),0); res.push({ dayLabel: label, earnings: total, fullDate: d.toLocaleDateString('fa-IR') }); }
    return res;
  }, [completedJobs]);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="brutal-panel">
        <div className="brutal-header brutal-header--ink">
          <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-[#FFDE03]" /> مرکز فرمان رادار اتوماسیون — سایبورگ</span>
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 border border-white ${engineActive?'bg-[#00E599] animate-pulse':'bg-[#FF3B30]'}`} />
            <span className="px-2 py-1 bg-[#FFDE03] text-black border-[2px] border-white text-[10px] font-black">{engineActive?'ACTIVE':'PAUSED'}</span>
          </span>
        </div>
        <div className="p-3 bg-[#FFFBF0] text-[12px] font-bold flex flex-wrap items-center gap-2">
          <span>رصد مستمر بازارهای داخلی و بین‌المللی ● فیلتر تسک‌های زودبازده</span>
          <span className="ml-auto flex items-center gap-1 px-2 py-1 bg-white border-[2px] border-black font-mono text-[11px]"><Activity className="w-3.5 h-3.5 text-[#00E599]" /> LIVE TELEGRAM + PLATFORMS</span>
        </div>
      </div>

      <BrutalCollapsible title="روند درآمد ۷ روز اخیر" icon={TrendingUp} variant="accent" defaultOpen={true} storageKey="ops-chart">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0a0a0a" opacity={0.08} vertical={false} />
              <XAxis dataKey="dayLabel" stroke="#0a0a0a" fontSize={11} tickLine={false} axisLine={{ stroke:'#0a0a0a', strokeWidth:2 }} />
              <YAxis stroke="#0a0a0a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v=>`${(v/1000000).toFixed(1)}M`} />
              <Tooltip contentStyle={{ background:'#0a0a0a', color:'#fff', border:'2px solid #000' }} />
              <Line type="monotone" dataKey="earnings" stroke="#0a0a0a" strokeWidth={2.5} dot={{ fill:'#FFDE03', stroke:'#0a0a0a', strokeWidth:2, r:4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </BrutalCollapsible>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="brutal-panel p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest">موتور رصد</span>
            <span className={`px-2 py-1 border-[2px] border-black text-[10px] font-black ${engineActive?'bg-[#00E599]':'bg-[#FF3B30] text-white'}`}>{engineActive?'فعال':'متوقف'}</span>
          </div>
          <h3 className="text-[13px] font-black">{settings.cyborgMode ? 'سایبورگ — تایید ۱ کلیک' : 'تمام خودکار'}</h3>
          <p className="text-[11px] leading-5 text-[#555] font-medium">{settings.cyborgMode ? 'ربات پروژه را پیدا کرده، پروپوزال و کد را می‌سازد و فقط تایید نهایی را از شما می‌گیرد.' : 'کلیه مراحل طبق ترشولد AI کاملاً اتوماتیک انجام می‌شود.'}</p>
          <div className="flex gap-2">
            <button onClick={()=>onUpdateSettings({ cyborgMode: !settings.cyborgMode })} className="flex-1 brutal-btn brutal-btn--sm bg-white text-[11px]">تغییر حالت</button>
            <button onClick={()=>setEngineActive(!engineActive)} className={`px-3 py-2 border-[2.5px] border-black font-black text-[11px] flex items-center gap-1 ${engineActive?'bg-[#FF3B30] text-white':'bg-[#00E599] text-black'}`}>
              {engineActive? <><Pause className="w-3.5 h-3.5" /> توقف</> : <><Play className="w-3.5 h-3.5" /> روشن</>}
            </button>
          </div>
        </div>

        <div className="brutal-panel p-4 space-y-3 bg-white">
          <div className="text-[11px] font-black uppercase tracking-widest">پارامترهای تخفیف و ترشولد</div>
          <div>
            <div className="flex justify-between text-[11px] font-bold mb-1"><span>تخفیف برای برنده شدن</span><span className="font-mono bg-[#FFDE03] border border-black px-1.5">{settings.defaultDiscountRate}٪</span></div>
            <input type="range" min={5} max={35} value={settings.defaultDiscountRate} onChange={e=>onUpdateSettings({ defaultDiscountRate: parseInt(e.target.value) })} className="w-full accent-black" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-bold mb-1"><span>حداقل امتیاز AI</span><span className="font-mono bg-[#0066FF] text-white border border-black px-1.5">{settings.autoBidThreshold}٪</span></div>
            <input type="range" min={70} max={98} value={settings.autoBidThreshold} onChange={e=>onUpdateSettings({ autoBidThreshold: parseInt(e.target.value) })} className="w-full accent-black" />
          </div>
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span>فواصل رصد</span>
            <select value={scanInterval} onChange={e=>setScanInterval(e.target.value)} className="brutal-select !h-[32px] !w-auto text-[11px]">
              <option value="1">هر ۱ دقیقه</option><option value="2">هر ۲ دقیقه</option><option value="5">هر ۵ دقیقه</option>
            </select>
          </div>
        </div>

        <div className="brutal-panel p-4 flex flex-col justify-between bg-[#FFFBF0]">
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest">فید واقعی (SPEC-004)</div>
            <div className="mt-2 space-y-1.5 text-[11px] font-bold">
              {bridgeStatus ? (
                <>
                  <div className="flex justify-between"><span>منبع</span><span className="px-1.5 py-0.5 bg-black text-white font-mono text-[10px]">{bridgeStatus.source==='scanner'?'اسکنر واقعی':bridgeStatus.source==='demo'?'دمو':'خالی'}</span></div>
                  <div className="flex justify-between"><span>پروژه‌های فید</span><span className="font-mono">{(bridgeStatus.feedJobs??0).toLocaleString('fa-IR')} / {(bridgeStatus.scannedProjects??0).toLocaleString('fa-IR')}</span></div>
                  {bridgeStatus.activePlatforms?.length>0 ? bridgeStatus.activePlatforms.map((p:any)=><div key={p.name} className="flex justify-between text-[#00B37A]"><span>{p.name}</span><span>فعال</span></div>) : <p className="text-[#FF4D00]">هیچ منبعی فعال نیست — docs/PERSONAL-SETUP.md</p>}
                </>
              ) : <p className="opacity-60">در حال دریافت...</p>}
            </div>
          </div>
          <button onClick={onTriggerManualScan} disabled={isScanning} className="mt-4 w-full brutal-btn brutal-btn--primary flex items-center justify-center gap-2">
            <Radar className={`w-4 h-4 ${isScanning?'animate-spin':''}`} /> {isScanning?'در حال پایش...':'اجرای اسکن زنده'}
          </button>
        </div>
      </div>

      <BrutalCollapsible title="لاگ فعالیت زنده سیستم" icon={Activity} variant="ink" defaultOpen={true} storageKey="ops-log">
        <div className="max-h-[280px] overflow-y-auto brutal-scroll divide-y divide-black/10 font-mono text-[12px]">
          {logs.length===0 ? <p className="py-8 text-center opacity-40 font-bold">لاگی ثبت نشده</p> :
            logs.map(log=>(
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-3">
                <span className="flex gap-2 flex-1"><span className="text-[#0066FF] font-black">›</span><span>{log.message}</span></span>
                <span className="text-[11px] opacity-60 shrink-0">{log.timestamp}</span>
              </div>
            ))}
        </div>
      </BrutalCollapsible>
    </div>
  );
};
