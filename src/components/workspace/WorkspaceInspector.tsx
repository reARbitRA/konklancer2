import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  Cloud,
  Cpu,
  FileCode2,
  FolderGit2,
  GitBranch,
  Layers,
  ListChecks,
  Loader2,
  Play,
  Sparkles,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import type { FreelanceJob } from '../../types';
export interface AIMeta {
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
  streamed: boolean;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
}
import { GitHubWorkflowManager } from '../GitHubWorkflowManager';
import { MarkdownView } from './MarkdownView';
import type { TestResult } from './WorkspaceTerminal';

export interface AgentLogEntry {
  id: string;
  stage: string;
  message: string;
  at: number;
  tone?: 'info' | 'success' | 'warn' | 'error';
}

export interface SolutionPlan {
  projectName: string;
  stack: string;
  summary: string;
  files: Array<{ path: string; purpose: string }>;
  runInstructions: string;
}

interface WorkspaceInspectorProps {
  job: FreelanceJob;
  files: Record<string, string>;
  plan: SolutionPlan | null;
  logs: AgentLogEntry[];
  warnings: string[];
  meta: AIMeta | null;
  testResult: TestResult | null;
  testRunning: boolean;
  generating: boolean;
  dirtyCount: number;
  githubToken: string;
  onRepoCreated: (url: string) => void;
  onOpenAISettings?: () => void;
  onRunTests: () => void;
  onOpenFile: (path: string) => void;
  onGenerate: () => void;
}

type Tab = 'plan' | 'docs' | 'agent' | 'github';

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: 'plan', label: 'طرح', icon: Layers },
  { key: 'docs', label: 'مستندات', icon: BookOpen },
  { key: 'agent', label: 'ایجنت', icon: Cpu },
  { key: 'github', label: 'گیت‌هاب', icon: FolderGit2 },
];

const TONE_CLASS: Record<NonNullable<AgentLogEntry['tone']>, string> = {
  info: 'text-slate-400',
  success: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
};

const TONE_DOT: Record<NonNullable<AgentLogEntry['tone']>, string> = {
  info: 'bg-slate-500',
  success: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
};

export const WorkspaceInspector: React.FC<WorkspaceInspectorProps> = ({
  job,
  files,
  plan,
  logs,
  warnings,
  meta,
  testResult,
  testRunning,
  generating,
  dirtyCount,
  githubToken,
  onRepoCreated,
  onOpenAISettings,
  onRunTests,
  onOpenFile,
  onGenerate,
}) => {
  const [tab, setTab] = useState<Tab>('plan');
  const [copied, setCopied] = useState<string | null>(null);

  const stats = useMemo(() => {
    const paths = Object.keys(files);
    const lines = paths.reduce((total, path) => total + (files[path]?.split('\n').length ?? 0), 0);
    const bytes = paths.reduce((total, path) => total + new TextEncoder().encode(files[path] ?? '').length, 0);
    const readme = paths.find((path) => /(^|\/)readme(\.md|\.txt)?$/i.test(path));
    const tests = paths.filter((path) => /(^|\/)(test_[^/]+|[^/]+_test)\.py$|\.test\.(c|m)?js$/i.test(path));
    return { paths, lines, bytes, readme, tests };
  }, [files]);

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const summaryOk = Boolean(plan?.summary);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080e1a]">
      <div className="flex h-[34px] shrink-0 items-center gap-0.5 border-b border-slate-800/70 px-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`relative flex h-full items-center gap-1 px-2 text-[10.5px] font-medium transition-colors ${
                tab === item.key ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className={`h-3 w-3 ${tab === item.key ? 'text-emerald-400' : ''}`} />
              {item.label}
              {tab === item.key && <span className="absolute inset-x-1.5 -bottom-px h-px bg-emerald-400/80" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'plan' && (
          <div className="space-y-3">
            <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">پروژه</p>
                  <h3 className="truncate text-[12px] font-bold text-white">{plan?.projectName || job.title}</h3>
                  {plan?.stack && <p className="mt-0.5 truncate font-mono text-[10px] text-sky-300/90">{plan.stack}</p>}
                </div>
                {generating ? (
                  <span className="flex shrink-0 items-center gap-1 text-[9px] text-amber-300">
                    <Loader2 className="h-3 w-3 animate-spin" /> تولید
                  </span>
                ) : (
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
              </div>
              <p className="mt-2 text-[11px] leading-6 text-slate-400">
                {plan?.summary || 'هنوز نقشه‌ای از پروژه ساخته نشده است. با دکمه‌ی تولید، ایجنت ابتدا نقشه و سپس فایل‌ها را می‌سازد.'}
              </p>
              {!plan && !generating && (
                <button onClick={onGenerate} className="btn btn-primary mt-2 h-7 w-full justify-center text-[10.5px]">
                  <Sparkles className="h-3 w-3" /> تولید نقشه و سورس
                </button>
              )}
            </section>

            {plan && plan.files.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <FileCode2 className="h-3 w-3" /> ساختار فایل‌ها
                </h4>
                <div className="space-y-1">
                  {plan.files.map((item) => {
                    const exists = Boolean(files[item.path]);
                    const openable = exists;
                    return (
                      <button
                        key={item.path}
                        onClick={() => openable && onOpenFile(item.path)}
                        disabled={!openable}
                        className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          exists
                            ? 'border-slate-800/70 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/50'
                            : 'border-slate-800/40 bg-slate-950/30 opacity-60'
                        }`}
                        dir="ltr"
                      >
                        <FileCode2 className={`mt-0.5 h-3 w-3 shrink-0 ${exists ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[10.5px] text-slate-200">{item.path}</span>
                          {item.purpose && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500" dir="rtl">{item.purpose}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {plan?.runInstructions && (
              <section className="rounded-xl border border-slate-800/80 bg-slate-950/50">
                <div className="flex items-center justify-between border-b border-slate-800/70 px-2.5 py-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-300">
                    <ListChecks className="h-3 w-3 text-sky-400" /> اجرای پروژه
                  </span>
                  <button onClick={() => copy('run', plan.runInstructions)} className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-slate-200">
                    <ClipboardCopy className="h-2.5 w-2.5" /> {copied === 'run' ? 'کپی شد' : 'کپی'}
                  </button>
                </div>
                <pre className="code-surface overflow-x-auto p-2.5 text-[10.5px] text-emerald-200/90" dir="ltr">
                  {plan.runInstructions}
                </pre>
              </section>
            )}

            <section className="grid grid-cols-2 gap-2">
              <Stat icon={FileCode2} label="فایل" value={stats.paths.length.toLocaleString('fa-IR')} />
              <Stat icon={GitBranch} label="خط" value={stats.lines.toLocaleString('fa-IR')} />
              <Stat icon={Timer} label="آخرین اجرا" value={testResult ? `${((testResult.durationMs ?? 0) / 1000).toFixed(1)}s` : '—'} />
              <Stat
                icon={testResult?.ok ? CheckCircle2 : TriangleAlert}
                label="تست"
                value={testRunning ? 'در اجرا' : testResult ? (testResult.ok ? 'پاس' : 'شکست') : 'اجرا نشده'}
                tone={testResult ? (testResult.ok ? 'ok' : 'bad') : 'muted'}
              />
            </section>

            {dirtyCount > 0 && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200">
                {dirtyCount.toLocaleString('fa-IR')} فایل تغییر ذخیره‌نشده دارد. با Ctrl+S همان فایل یا «ذخیره‌ی همه» ذخیره کنید.
              </p>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="space-y-2">
            {stats.readme ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-[10px] text-slate-400" dir="ltr">
                    {stats.readme}
                  </span>
                  <button onClick={() => onOpenFile(stats.readme!)} className="btn h-6 px-2 text-[9.5px]">
                    <ArrowUpRight className="h-3 w-3" /> باز کردن
                  </button>
                </div>
                <div className="-mx-3 rounded-lg border border-slate-800/70 bg-slate-950/40">
                  <MarkdownView content={files[stats.readme] ?? ''} emptyHint="README خالی است." />
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center">
                <BookOpen className="mx-auto h-5 w-5 text-slate-600" />
                <p className="mt-2 text-[11px] text-slate-400">این پروژه هنوز README ندارد.</p>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">
                  در دستور تولید بنویسید «README فارسی با مراحل نصب و اجرا هم اضافه کن» تا مستندات ساخته شود.
                </p>
              </div>
            )}

            {summaryOk && (
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2.5">
                <p className="mb-1 text-[10px] font-semibold text-slate-300">خلاصه‌ی راهکار</p>
                <p className="text-[10.5px] leading-6 text-slate-400">{plan?.summary}</p>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-200">
                  <AlertTriangle className="h-3 w-3" /> نکات مدل
                </p>
                <ul className="space-y-1 text-[10px] leading-5 text-amber-100/80">
                  {warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'agent' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-2.5 py-1.5">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <Cpu className="h-3 w-3 text-sky-400" /> مدل و مصرف
              </span>
              <span className="font-mono text-[9px] text-slate-500">
                {meta?.model ?? '—'}
                {meta?.usage?.totalTokens ? ` · ${meta.usage.totalTokens.toLocaleString('fa-IR')} tok` : ''}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-2.5">
              <h4 className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-300">
                <span>رویدادهای ایجنت</span>
                {generating && <Loader2 className="h-3 w-3 animate-spin text-amber-300" />}
              </h4>
              {logs.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-slate-600">رویدادی ثبت نشده است.</p>
              ) : (
                <ol className="relative space-y-2 ps-3">
                  <span className="absolute inset-y-1 right-[3px] w-px bg-slate-800" />
                  {logs.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className={`absolute right-[-9px] top-1.5 h-1.5 w-1.5 rounded-full ${TONE_DOT[entry.tone ?? 'info']}`} />
                      <p className={`text-[10px] leading-5 ${TONE_CLASS[entry.tone ?? 'info']}`}>{entry.message}</p>
                      <p className="font-mono text-[8.5px] text-slate-600">
                        {new Date(entry.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-slate-300">
                <Play className="h-3 w-3 text-emerald-400" /> تست واقعی
              </p>
              <p className="text-[10px] leading-5 text-slate-500">
                {stats.tests.length > 0
                  ? `${stats.tests.length.toLocaleString('fa-IR')} فایل تست پیدا شد: ${stats.tests.join('، ')}`
                  : 'فایل تستی پیدا نشد؛ از ایجنت بخواهید test_*.py بسازد.'}
              </p>
              <button onClick={onRunTests} disabled={testRunning || stats.paths.length === 0} className="btn mt-2 h-7 w-full justify-center text-[10px]">
                {testRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 text-emerald-400" />}
                اجرای تست‌ها
              </button>
              {onOpenAISettings && (
                <button onClick={onOpenAISettings} className="mt-1 w-full text-[9px] text-slate-500 hover:text-slate-300">
                  تنظیمات اجرای کد و مدل
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'github' && (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-300">
                <Cloud className="h-3 w-3 text-sky-400" /> ثبت در مخزن خصوصی
              </p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                توکن گیت‌هاب فقط در sessionStorage همین مرورگر نگه‌داری می‌شود. قبل از ثبت، تغییرات را ذخیره کنید.
              </p>
            </div>

            {job.repoUrl ? (
              <a
                href={job.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2 text-[10.5px] text-emerald-200 hover:bg-emerald-500/10"
              >
                <span className="truncate font-mono">{job.repoUrl.replace('https://github.com/', '')}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <GitHubWorkflowManager job={job} githubToken={githubToken} onRepoCreated={onRepoCreated} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'ok' | 'bad' | 'muted';
}> = ({ icon: Icon, label, value, tone = 'muted' }) => (
  <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-2 py-1.5">
    <span className="flex items-center gap-1 text-[9px] text-slate-500">
      <Icon
        className={`h-2.5 w-2.5 ${tone === 'ok' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-500'}`}
      />
      {label}
    </span>
    <span
      className={`mt-0.5 block font-mono text-[11px] ${
        tone === 'ok' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-slate-200'
      }`}
    >
      {value}
    </span>
  </div>
);
