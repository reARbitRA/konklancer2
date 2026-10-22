import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { PipelineDashboard } from './PipelineDashboard';
import { 
  Coins, 
  Clock, 
  Target, 
  TrendingUp, 
  CheckCircle2, 
  Code2, 
  Filter, 
  ChevronDown, 
  Sparkles,
  BarChart2,
  Calendar,
  Layers,
  Tag
} from 'lucide-react';
import { FreelanceJob, PriorityLevel } from '../types';

interface PipelineBoardProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onMoveJobStatus: (jobId: string, newStatus: FreelanceJob['status']) => void;
  onUpdatePriority?: (jobId: string, newPriority: PriorityLevel) => void;
  dailyEarningsGoal: number;
}

const PRIORITY_CONFIG: Record<PriorityLevel, { label: string; badgeClass: string; dotClass: string }> = {
  High: {
    label: 'بالا (High)',
    badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-400',
  },
  Medium: {
    label: 'متوسط (Medium)',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  Low: {
    label: 'پایین (Low)',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
};

const CATEGORY_TAG_COLORS: Record<string, string> = {
  Frontend: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  Backend: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  DevOps: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  Design: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
};

// Custom Tooltip for Recharts line chart
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-xl backdrop-blur-md text-right text-xs space-y-1">
        <p className="font-semibold text-white flex items-center justify-between gap-3 border-b border-slate-800 pb-1">
          <span>{data.fullDateLabel}</span>
          <span className="text-[11px] font-normal text-slate-400">{data.dayName}</span>
        </p>
        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="text-slate-400">درآمد روزانه:</span>
          <span className="font-mono font-bold text-emerald-400 tabular-nums">
            {(data.earnings as number).toLocaleString('fa-IR')} تومان
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
          <span>تعداد تسویه‌ها:</span>
          <span className="font-mono text-slate-200 tabular-nums">{data.jobsCount} پروژه</span>
        </div>
      </div>
    );
  }
  return null;
};

export const PipelineBoard: React.FC<PipelineBoardProps> = ({
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onMoveJobStatus,
  onUpdatePriority,
  dailyEarningsGoal,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityDropdownJobId, setPriorityDropdownJobId] = useState<string | null>(null);

  // Completed jobs & today's calculations
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs]);
  
  // Last 7 days dynamic calculation based on completedAt or today
  const last7DaysChartData = useMemo(() => {
    const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
    const result = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'امروز' : i === 1 ? 'دیروز' : dayNames[d.getDay()];
      
      const dayMonth = d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
      
      // Match completed jobs for this date (or if i === 0 and job has no date or today date)
      const dayJobs = completedJobs.filter((j) => {
        if (j.completedAt) {
          return j.completedAt === isoDate;
        }
        // If completed today without explicit completedAt
        return i === 0;
      });

      const dayTotal = dayJobs.reduce((acc, j) => acc + (j.proposedPrice || j.budget || 0), 0);

      result.push({
        dateKey: isoDate,
        dayLabel: dayName,
        dayName: dayNames[d.getDay()],
        fullDateLabel: dayMonth,
        earnings: dayTotal,
        jobsCount: dayJobs.length,
      });
    }

    return result;
  }, [completedJobs]);

  const sevenDaysTotalEarnings = useMemo(() => {
    return last7DaysChartData.reduce((acc, d) => acc + d.earnings, 0);
  }, [last7DaysChartData]);

  const dailyAverageEarnings = useMemo(() => {
    return Math.round(sevenDaysTotalEarnings / 7);
  }, [sevenDaysTotalEarnings]);

  const todayEarnings = useMemo(() => {
    const todayData = last7DaysChartData[last7DaysChartData.length - 1];
    return todayData ? todayData.earnings : 0;
  }, [last7DaysChartData]);

  const goalProgress = Math.min(100, Math.round((todayEarnings / (dailyEarningsGoal || 5000000)) * 100));

  // Filter jobs by priority and category
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesPriority = priorityFilter === 'All' || (job.priority || 'Medium') === priorityFilter;
      const matchesCategory = categoryFilter === 'All' || job.categorizedTag === categoryFilter;
      return matchesPriority && matchesCategory;
    });
  }, [jobs, priorityFilter, categoryFilter]);

  // Counts per priority
  const priorityCounts = useMemo(() => {
    return {
      All: jobs.length,
      High: jobs.filter((j) => (j.priority || 'Medium') === 'High').length,
      Medium: jobs.filter((j) => (j.priority || 'Medium') === 'Medium').length,
      Low: jobs.filter((j) => (j.priority || 'Medium') === 'Low').length,
    };
  }, [jobs]);

  const stages: { key: FreelanceJob['status']; title: string; desc: string }[] = [
    { key: 'new', title: '۱. پروژه‌های شکارشده', desc: 'بررسی نشده' },
    { key: 'bidded', title: '۲. پیشنهاد ارسال‌شده', desc: 'منتظر پاسخ کارفرما' },
    { key: 'in_progress', title: '۳. در حال کدنویسی', desc: 'ایجنت در حال توسعه' },
    { key: 'ready', title: '۴. آماده تحویل', desc: 'کد آماده در مخزن' },
    { key: 'completed', title: '۵. تسویه‌شده', desc: 'وجه دریافت شد' },
  ];

  return (
    <div className="space-y-6">
      {/* Visual Dashboard */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-white mb-4">داشبورد وضعیت پایپ‌لاین (Funnel)</h2>
        <PipelineDashboard jobs={jobs} />
      </div>

      {/* 1. Visual Daily Earnings Dashboard with Recharts Line Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span>داشبورد بصری درآمد روزانه (۷ روز اخیر بر اساس تسویه‌ها)</span>
            </h2>
            <p className="text-xs text-slate-400">
              نمودار خطی نوسان درآمد روزانه مبتنی بر تسویه‌حساب‌های موفق پروژه‌ها
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">مجموع ۷ روز:</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {sevenDaysTotalEarnings.toLocaleString('fa-IR')} ت
              </span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">میانگین روزانه:</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {dailyAverageEarnings.toLocaleString('fa-IR')} ت
              </span>
            </div>
          </div>
        </div>

        {/* Recharts Line Chart Container */}
        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last7DaysChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="dayLabel" 
                stroke="#64748b" 
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomChartTooltip />} />
              <Line 
                type="monotone" 
                dataKey="earnings" 
                stroke="#10b981" 
                strokeWidth={2.5}
                dot={{ fill: '#0f172a', stroke: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ fill: '#34d399', stroke: '#0f172a', strokeWidth: 2, r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Financial Metrics & Goal Target Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-emerald-400" />
            <span>مجموع درآمد واریزی امروز:</span>
          </span>
          <div className="font-mono text-xl font-bold text-emerald-400 tabular-nums">
            {todayEarnings.toLocaleString('fa-IR')} تومان
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            {completedJobs.length} پروژه تاکنون تسویه شده است
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            <span>پیشرفت هدف روزانه ({dailyEarningsGoal.toLocaleString('fa-IR')} تومان):</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">{goalProgress}٪</span>
          </div>
          <span className="text-[11px] text-slate-400 block">
            {todayEarnings >= dailyEarningsGoal ? '✓ تبریک! هدف امروز محقق شد.' : 'فقط چند پروژه تا تکمیل هدف'}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-sky-400" />
            <span>میانگین سرعت تحویل ایجنت:</span>
          </span>
          <div className="font-mono text-xl font-bold text-sky-300">
            ۴۵ دقیقه
          </div>
          <span className="text-[11px] text-slate-400 block">
            نرخ رضایت کارفرمایان: ۹۸٪ با کدهای تست‌شده
          </span>
        </div>
      </div>

      {/* 3. Task Priority System Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1 ml-1 font-medium">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>فیلتر اولویت تسک:</span>
          </span>

          {(
            [
              { key: 'All', label: 'همه اولویت‌ها' },
              { key: 'High', label: 'بالا (High)' },
              { key: 'Medium', label: 'متوسط (Medium)' },
              { key: 'Low', label: 'پایین (Low)' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setPriorityFilter(item.key)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                priorityFilter === item.key
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              {item.key !== 'All' && (
                <span className={`h-2 w-2 rounded-full ${PRIORITY_CONFIG[item.key].dotClass}`} />
              )}
              <span>{item.label}</span>
              <span className="font-mono text-[10px] bg-slate-950 text-slate-400 px-1.5 py-0.2 rounded">
                {priorityCounts[item.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Category Tag filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <Tag className="h-3 w-3 text-slate-500" />
          <span className="text-slate-400">تگ تخصصی:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-slate-700"
          >
            <option value="All">همه تگ‌ها</option>
            <option value="Frontend">Frontend</option>
            <option value="Backend">Backend</option>
            <option value="DevOps">DevOps</option>
            <option value="Design">Design</option>
          </select>
        </div>
      </div>

      {/* 4. Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-start">
        {stages.map((stage) => {
          const stageJobs = filteredJobs.filter((j) => j.status === stage.key);
          const stageTotal = stageJobs.reduce((acc, j) => acc + (j.proposedPrice || j.budget || 0), 0);

          return (
            <div
              key={stage.key}
              className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 flex flex-col min-h-[460px] space-y-3"
            >
              {/* Stage Header */}
              <div className="pb-2 border-b border-slate-800/80">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white">{stage.title}</h3>
                  <span className="font-mono text-[11px] bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
                    {stageJobs.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>{stage.desc}</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {stageTotal > 0 ? `${(stageTotal / 1000000).toFixed(1)} م.ت` : ''}
                  </span>
                </div>
              </div>

              {/* Jobs List in Stage */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px]">
                {stageJobs.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-600 italic">
                    موردی نیست
                  </div>
                ) : (
                  stageJobs.map((job) => {
                    const currentPriority: PriorityLevel = job.priority || 'Medium';
                    const priorityCfg = PRIORITY_CONFIG[currentPriority];

                    return (
                      <div
                        key={job.id}
                        className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-lg p-3 space-y-2.5 text-xs transition-colors"
                      >
                        {/* Card Header: Platform, Budget & Priority Badge */}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-medium">{job.platform}</span>
                          <span className="font-mono font-bold text-emerald-400 tabular-nums">
                            {(job.proposedPrice || job.budget).toLocaleString('fa-IR')} ت
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="font-semibold text-slate-200 line-clamp-2 leading-relaxed">
                          {job.title}
                        </h4>

                        {/* Tags Row: Priority Selector Tag + Gemini Role Category Tag */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {/* Priority Dropdown / Tag */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setPriorityDropdownJobId(
                                  priorityDropdownJobId === job.id ? null : job.id
                                );
                              }}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${priorityCfg.badgeClass}`}
                              title="کلیک برای تغییر اولویت"
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dotClass}`} />
                              <span>{priorityCfg.label}</span>
                              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                            </button>

                            {/* Priority Selection Popup */}
                            {priorityDropdownJobId === job.id && (
                              <div className="absolute top-full right-0 mt-1 z-30 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1 min-w-[120px] space-y-0.5">
                                {(['High', 'Medium', 'Low'] as PriorityLevel[]).map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => {
                                      if (onUpdatePriority) {
                                        onUpdatePriority(job.id, p);
                                      }
                                      setPriorityDropdownJobId(null);
                                    }}
                                    className={`w-full text-right px-2 py-1 rounded text-[10px] flex items-center justify-between hover:bg-slate-850 ${
                                      p === currentPriority ? 'text-white font-bold' : 'text-slate-400'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_CONFIG[p].dotClass}`} />
                                      <span>{PRIORITY_CONFIG[p].label}</span>
                                    </span>
                                    {p === currentPriority && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Gemini Categorized Tag if present */}
                          {job.categorizedTag && (
                            <span 
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                CATEGORY_TAG_COLORS[job.categorizedTag] || 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {job.categorizedTag}
                            </span>
                          )}
                        </div>

                        {/* Quick stage transition buttons */}
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-1 text-[11px]">
                          {stage.key === 'new' && (
                            <>
                              <button
                                onClick={() => onSelectJobForProposal(job)}
                                className="text-amber-400 hover:underline"
                              >
                                نگارش پیشنهاد
                              </button>
                              <button
                                onClick={() => onMoveJobStatus(job.id, 'bidded')}
                                className="text-slate-400 hover:text-white"
                                title="انتقال به ارسال‌شده"
                              >
                                ثبت ←
                              </button>
                            </>
                          )}

                          {stage.key === 'bidded' && (
                            <>
                              <button
                                onClick={() => onSelectJobForCoding(job)}
                                className="text-emerald-400 hover:underline flex items-center gap-1"
                              >
                                <Code2 className="h-3 w-3" />
                                <span>کدنویسی</span>
                              </button>
                              <button
                                onClick={() => onMoveJobStatus(job.id, 'in_progress')}
                                className="text-slate-400 hover:text-white"
                              >
                                شروع ←
                              </button>
                            </>
                          )}

                          {stage.key === 'in_progress' && (
                            <>
                              <button
                                onClick={() => onSelectJobForCoding(job)}
                                className="text-sky-400 hover:underline"
                              >
                                مشاهده سورس
                              </button>
                              <button
                                onClick={() => onMoveJobStatus(job.id, 'ready')}
                                className="text-slate-400 hover:text-white"
                              >
                                آماده تحویل ←
                              </button>
                            </>
                          )}

                          {stage.key === 'ready' && (
                            <>
                              <span className="text-[10px] text-emerald-400">در انتظار تایید</span>
                              <button
                                onClick={() => onMoveJobStatus(job.id, 'completed')}
                                className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-[10px]"
                              >
                                تسویه شد ✓
                              </button>
                            </>
                          )}

                          {stage.key === 'completed' && (
                            <div className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>مبلغ دریافت شد</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
