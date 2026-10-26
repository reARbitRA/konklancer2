import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Coins, Clock, Target, TrendingUp, CheckCircle2, Code2, Filter, ChevronDown, Sparkles, BarChart2, Calendar, Layers, Tag, ArrowLeft, Zap, Eye } from 'lucide-react';
import { FreelanceJob, PriorityLevel } from '../types';
import { BrutalCollapsible } from './brutalist/Collapsible';
import { PipelineDashboard } from './PipelineDashboard';

interface PipelineBoardProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onMoveJobStatus: (jobId: string, newStatus: FreelanceJob['status']) => void;
  onUpdatePriority?: (jobId: string, newPriority: PriorityLevel) => void;
  dailyEarningsGoal: number;
}

const PRIORITY_CFG: Record<PriorityLevel, { label: string; bg: string; dot: string }> = {
  High: { label: 'بالا', bg: 'bg-[#FF3B30] text-white', dot: 'bg-[#FF3B30]' },
  Medium: { label: 'متوسط', bg: 'bg-[#FFDE03] text-black', dot: 'bg-[#FFDE03]' },
  Low: { label: 'پایین', bg: 'bg-white text-black', dot: 'bg-[#00E599]' },
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-black text-white border-[2.5px] border-black p-3 text-xs font-mono">
        <div className="font-black">{d.fullDateLabel} — {d.dayName}</div>
        <div>درآمد: {d.earnings.toLocaleString('fa-IR')} ت</div>
        <div className="opacity-70">{d.jobsCount} پروژه</div>
      </div>
    );
  }
  return null;
};

export const PipelineBoard: React.FC<PipelineBoardProps> = ({ jobs, onSelectJobForAnalysis, onSelectJobForProposal, onSelectJobForCoding, onMoveJobStatus, onUpdatePriority, dailyEarningsGoal }) => {
  const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityOpen, setPriorityOpen] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});

  const completedJobs = useMemo(() => jobs.filter(j => j.status === 'completed'), [jobs]);
  const last7DaysChartData = useMemo(() => {
    const dayNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
    const res = [];
    const today = new Date();
    for (let i=6;i>=0;i--) {
      const d = new Date(today); d.setDate(d.getDate()-i);
      const iso = d.toISOString().split('T')[0];
      const dayName = i===0?'امروز':i===1?'دیروز':dayNames[d.getDay()];
      const dayMonth = d.toLocaleDateString('fa-IR', { month:'short', day:'numeric' });
      const dayJobs = completedJobs.filter(j=> j.completedAt? j.completedAt===iso : i===0);
      const dayTotal = dayJobs.reduce((a,j)=>a+(j.proposedPrice||j.budget||0),0);
      res.push({ dateKey: iso, dayLabel: dayName, dayName: dayNames[d.getDay()], fullDateLabel: dayMonth, earnings: dayTotal, jobsCount: dayJobs.length });
    }
    return res;
  }, [completedJobs]);
  const sevenDaysTotal = last7DaysChartData.reduce((a,d)=>a+d.earnings,0);
  const todayEarnings = last7DaysChartData[last7DaysChartData.length-1]?.earnings || 0;
  const goalProgress = Math.min(100, Math.round((todayEarnings / (dailyEarningsGoal||5000000))*100));

  const filteredJobs = useMemo(()=> jobs.filter(j=> {
    const mP = priorityFilter==='All' || (j.priority||'Medium')===priorityFilter;
    const mC = categoryFilter==='All' || j.categorizedTag===categoryFilter;
    return mP && mC;
  }), [jobs, priorityFilter, categoryFilter]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      const tag = j.categorizedTag || (j.categoryKey ? String(j.categoryKey) : '');
      if (!tag) continue;
      map.set(tag, (map.get(tag) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const priorityCounts = {
    All: jobs.length,
    High: jobs.filter(j=>(j.priority||'Medium')==='High').length,
    Medium: jobs.filter(j=>(j.priority||'Medium')==='Medium').length,
    Low: jobs.filter(j=>(j.priority||'Medium')==='Low').length,
  };

  const stages: { key: FreelanceJob['status']; title: string; desc: string; color: string }[] = [
    { key: 'new', title: 'شکارشده', desc: 'بررسی نشده', color: '#FFDE03' },
    { key: 'bidded', title: 'پیشنهاد شده', desc: 'منتظر پاسخ', color: '#FFE4CC' },
    { key: 'in_progress', title: 'در حال اجرا', desc: 'ایجنت فعال', color: '#0066FF' },
    { key: 'ready', title: 'آماده تحویل', desc: 'در مخزن', color: '#00E599' },
    { key: 'completed', title: 'تسویه شده', desc: 'واریز شد', color: '#0a0a0a' },
  ];

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Header stats brutal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="stat-brutal stat-brutal--accent">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest">امروز</span>
            <Coins className="w-5 h-5" />
          </div>
          <div className="text-[20px] font-black font-mono">{todayEarnings.toLocaleString('fa-IR')} ت</div>
          <div className="text-[11px] font-bold opacity-70">{completedJobs.length} پروژه تسویه</div>
        </div>
        <div className="stat-brutal">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest">پیشرفت هدف</span>
            <Target className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-3 bg-white border-[2px] border-black overflow-hidden">
              <div className="h-full bg-black transition-all" style={{ width: `${goalProgress}%` }} />
            </div>
            <span className="font-mono font-black text-[13px]">{goalProgress}%</span>
          </div>
          <div className="text-[11px] font-medium">هدف: {dailyEarningsGoal.toLocaleString('fa-IR')} ت</div>
        </div>
        <div className="stat-brutal stat-brutal--electric">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest">سرعت ایجنت</span>
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-[20px] font-black">۴۵ دقیقه</div>
          <div className="text-[11px] font-bold opacity-80">رضایت ۹۸٪ ● ۷ روز: {sevenDaysTotal.toLocaleString('fa-IR')} ت</div>
        </div>
      </div>

      {/* Funnel dashboard (d3) — restored feature, collapsible */}
      <BrutalCollapsible title="قیف تبدیل پایپ‌لاین (Funnel)" icon={Layers} variant="ink" defaultOpen={false} storageKey="pipeline-funnel">
        <div className="bg-white border-[2px] border-black p-2">
          <PipelineDashboard jobs={jobs} />
        </div>
      </BrutalCollapsible>

      {/* Chart collapsible */}
      <BrutalCollapsible title="روند درآمد ۷ روز اخیر" icon={TrendingUp} variant="electric" defaultOpen={true} storageKey="pipeline-chart">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last7DaysChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0a0a0a" opacity={0.08} vertical={false} />
              <XAxis dataKey="dayLabel" stroke="#0a0a0a" fontSize={11} tickLine={false} axisLine={{ stroke: '#0a0a0a', strokeWidth: 2 }} />
              <YAxis stroke="#0a0a0a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v=>`${(v/1000000).toFixed(1)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="earnings" stroke="#0a0a0a" strokeWidth={2.5} dot={{ fill: '#FFDE03', stroke: '#0a0a0a', strokeWidth: 2, r: 4 }} activeDot={{ fill: '#0a0a0a', r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </BrutalCollapsible>

      {/* Filters collapsible */}
      <BrutalCollapsible title="فیلتر پایپ‌لاین" icon={Filter} defaultOpen={true} storageKey="pipeline-filters">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['All','High','Medium','Low'] as const).map(k=>(
              <button key={k} onClick={()=>setPriorityFilter(k)} className={`px-3 py-1.5 border-[2.5px] border-black text-[11px] font-black uppercase flex items-center gap-1.5 ${priorityFilter===k?'bg-black text-white shadow-[2px_2px_0px_0px_#000]':'bg-white hover:bg-[#FFDE03]'}`}>
                {k!=='All' && <span className={`w-2 h-2 border border-black ${PRIORITY_CFG[k as PriorityLevel].dot}`} />} {k==='All'?'همه':PRIORITY_CFG[k as PriorityLevel].label} <span className="px-1.5 py-0.5 bg-white text-black border border-black font-mono text-[10px]">{(priorityCounts as any)[k]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="brutal-select !h-[34px] !w-auto text-[11px]">
              <option value="All">همه تگ‌ها ({jobs.length})</option>
              {categoryOptions.map(([tag, count]) => (
                <option key={tag} value={tag}>{tag} ({count})</option>
              ))}
            </select>
          </div>
        </div>
      </BrutalCollapsible>

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {stages.map(stage=>{
          const stageJobs = filteredJobs.filter(j=>j.status===stage.key);
          const stageTotal = stageJobs.reduce((a,j)=>a+(j.proposedPrice||j.budget||0),0);
          const collapsed = collapsedStages[stage.key];
          return (
            <div key={stage.key} className="kanban-col">
              <div className="kanban-col__head" style={{ background: stage.color, color: stage.color==='#0a0a0a'?'#FFFBF0':'#0a0a0a' }}>
                <div>
                  <div className="text-[12px] font-black flex items-center gap-1.5">{stage.title} <span className="px-1.5 py-0.5 bg-white text-black border-[2px] border-black font-mono text-[10px]">{stageJobs.length}</span></div>
                  <div className="text-[10px] font-bold opacity-70">{stage.desc} {stageTotal>0?`● ${(stageTotal/1000000).toFixed(1)} م.ت`:''}</div>
                </div>
                <button onClick={()=>setCollapsedStages(s=>({...s,[stage.key]:!s[stage.key]}))} className="w-7 h-7 bg-white text-black border-[2px] border-black flex items-center justify-center hover:bg-black hover:text-white">
                  {collapsed? <ChevronDown className="w-4 h-4" /> : <BarChart2 className="w-4 h-4" />}
                </button>
              </div>
              {!collapsed && (
                <div className="flex-1 p-2 space-y-2 bg-[#FFFBF0] overflow-y-auto max-h-[560px] brutal-scroll">
                  {stageJobs.length===0 ? <div className="py-10 text-center text-[11px] font-bold opacity-40 border-[2px] dashed border-black/20 bg-white">موردی نیست</div> :
                    stageJobs.map(job=>{
                      const pri = (job.priority||'Medium') as PriorityLevel; const cfg = PRIORITY_CFG[pri];
                      return (
                        <div key={job.id} className="bg-white border-[2.5px] border-black p-3 space-y-2 hover:shadow-[3px_3px_0px_0px_#000] hover:-translate-y-[1px] transition-all">
                          <div className="flex items-center justify-between text-[11px] font-black">
                            <span className="px-1.5 py-0.5 bg-black text-white text-[10px]">{job.platform}</span>
                            <span className="font-mono bg-[#FFDE03] border border-black px-1.5 py-0.5">{(job.proposedPrice||job.budget).toLocaleString('fa-IR')} ت</span>
                          </div>
                          <h4 className="text-[12px] font-black leading-snug line-clamp-2">{job.title}</h4>
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <button onClick={()=>setPriorityOpen(priorityOpen===job.id?null:job.id)} className={`px-2 py-1 border-[2px] border-black text-[10px] font-black flex items-center gap-1 ${cfg.bg}`}>
                                <span className={`w-2 h-2 border border-black ${cfg.dot}`} /> {cfg.label} <ChevronDown className="w-3 h-3" />
                              </button>
                              {priorityOpen===job.id && (
                                <div className="absolute top-full right-0 mt-1 z-20 bg-white border-[2.5px] border-black shadow-[3px_3px_0px_0px_#000] p-1 min-w-[130px]">
                                  {(['High','Medium','Low'] as PriorityLevel[]).map(p=>(
                                    <button key={p} onClick={()=>{onUpdatePriority?.(job.id,p); setPriorityOpen(null);}} className={`w-full text-right px-2 py-1.5 text-[11px] font-bold flex items-center justify-between hover:bg-[#FFFBF0] ${p===pri?'bg-black text-white':''}`}>
                                      <span className="flex items-center gap-1"><span className={`w-2 h-2 ${PRIORITY_CFG[p].dot} border border-black`} /> {PRIORITY_CFG[p].label}</span>
                                      {p===pri && <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {job.categorizedTag && <span className="px-2 py-1 bg-[#0066FF] text-white border border-black text-[10px] font-mono font-bold">{job.categorizedTag}</span>}
                          </div>
                          <div className="flex items-center gap-1 pt-2 border-t-[2px] border-black text-[11px] font-bold">
                            {stage.key==='new' && <><button onClick={()=>onSelectJobForProposal(job)} className="text-[#FF4D00] hover:underline">پروپوزال</button><button onClick={()=>onMoveJobStatus(job.id,'bidded')} className="mr-auto bg-black text-white px-2 py-1 border border-black hover:bg-white hover:text-black" title="ثبت پیشنهاد در کارنامه (SPEC-005)">ثبت پیشنهاد ←</button></>}
                            {stage.key==='bidded' && <><button onClick={()=>onSelectJobForCoding(job)} className="flex items-center gap-1 text-[#0066FF]"><Code2 className="w-3 h-3" /> کدنویسی</button><button onClick={()=>onMoveJobStatus(job.id,'in_progress')} className="mr-auto bg-black text-white px-2 py-1">شروع ←</button></>}
                            {stage.key==='in_progress' && <><button onClick={()=>onSelectJobForCoding(job)} className="text-[#0066FF]">سورس</button><button onClick={()=>onMoveJobStatus(job.id,'ready')} className="mr-auto bg-black text-white px-2 py-1">آماده ←</button></>}
                            {stage.key==='ready' && <><span className="text-[#00E599] font-black text-[10px]">آماده تایید</span><button onClick={()=>onMoveJobStatus(job.id,'completed')} className="mr-auto bg-[#00E599] text-black px-2 py-1 border-[2px] border-black font-black">تسویه ✓</button></>}
                            {stage.key==='completed' && <span className="flex items-center gap-1 text-[#00E599] font-black w-full justify-center"><CheckCircle2 className="w-4 h-4" /> تسویه شد</span>}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
