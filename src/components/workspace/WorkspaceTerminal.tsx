import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Loader2, Terminal as TerminalIcon, Trash2, XCircle } from 'lucide-react';

export interface TestResult {
  ok: boolean;
  command?: string;
  exitCode?: number | null;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  files?: string[];
  note?: string;
  error?: string;
  disabled?: boolean;
}

interface WorkspaceTerminalProps {
  result: TestResult | null;
  running: boolean;
  logs: string[];
  height: number;
  onHeightChange: (height: number) => void;
  onClearLogs: () => void;
  onRunTests: () => void;
  canRun: boolean;
  onOpenSettings?: () => void;
}

const TABS = [
  { key: 'terminal', label: 'ترمینال' },
  { key: 'output', label: 'خروجی تست' },
  { key: 'logs', label: 'لاگ ایجنت' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export const WorkspaceTerminal: React.FC<WorkspaceTerminalProps> = ({
  result,
  running,
  logs,
  height,
  onHeightChange,
  onClearLogs,
  onRunTests,
  canRun,
  onOpenSettings,
}) => {
  const [tab, setTab] = useState<TabKey>('terminal');
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const output = useMemo(() => {
    if (!result) return '';
    const parts = [
      result.command ? `$ ${result.command}` : '',
      result.stdout?.trim() ?? '',
      result.stderr?.trim() ?? '',
      result.error ? `! ${result.error}` : '',
      result.note ? `# ${result.note}` : '',
    ].filter(Boolean);
    return parts.join('\n\n');
  }, [result]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [output, logs.length, tab]);

  useEffect(() => {
    if (result) setTab('output');
  }, [result]);

  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: height };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    const next = Math.min(520, Math.max(110, dragRef.current.startHeight + delta));
    onHeightChange(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const copyOutput = () => {
    const text = tab === 'logs' ? logs.join('\n') : output;
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const exitTone =
    result && !running
      ? result.ok
        ? 'text-emerald-300'
        : result.disabled
          ? 'text-amber-300'
          : 'text-red-300'
      : 'text-slate-500';

  return (
    <div
      className="flex shrink-0 flex-col border-t border-slate-800/80 bg-[#060b13]"
      style={{ height: collapsed ? 34 : height }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="h-[5px] shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-emerald-500/30"
        role="separator"
        aria-orientation="horizontal"
      />

      <div className="flex h-[30px] shrink-0 items-center gap-1 border-b border-slate-800/70 px-2">
        <button
          onClick={() => setCollapsed((value) => !value)}
          className="icon-btn h-5 w-5"
          title={collapsed ? 'باز کردن پنل' : 'جمع کردن پنل'}
          aria-label={collapsed ? 'باز کردن پنل' : 'جمع کردن پنل'}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>

        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key);
              setCollapsed(false);
            }}
            className={`relative flex h-full items-center gap-1 px-2 text-[10.5px] font-medium transition-colors ${
              tab === item.key ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {item.label}
            {item.key === 'output' && result && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${result.ok ? 'bg-emerald-400' : result.disabled ? 'bg-amber-400' : 'bg-red-400'}`}
              />
            )}
            {tab === item.key && <span className="absolute inset-x-1.5 -bottom-px h-px bg-emerald-400/80" />}
          </button>
        ))}

        <div className="flex-1" />

        {running && (
          <span className="flex items-center gap-1 text-[10px] text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" /> در حال اجرا
          </span>
        )}
        {result && !running && (
          <span className={`flex items-center gap-1 font-mono text-[10px] ${exitTone}`}>
            {result.ok ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {result.ok ? 'PASS' : 'FAIL'}
            {typeof result.exitCode === 'number' ? ` · exit ${result.exitCode}` : ''}
            {typeof result.durationMs === 'number' ? ` · ${(result.durationMs / 1000).toFixed(1)}s` : ''}
          </span>
        )}

        <button
          onClick={copyOutput}
          disabled={tab === 'logs' ? logs.length === 0 : !output}
          className="icon-btn h-5 w-5"
          title="کپی خروجی"
          aria-label="کپی خروجی"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
        {tab === 'logs' ? (
          <button onClick={onClearLogs} disabled={logs.length === 0} className="icon-btn h-5 w-5" title="پاک کردن لاگ">
            <Trash2 className="h-3 w-3" />
          </button>
        ) : (
          <button onClick={onRunTests} disabled={!canRun || running} className="btn h-5 px-1.5 text-[9.5px]" title="اجرای تست‌ها">
            <TerminalIcon className="h-3 w-3" /> اجرا
          </button>
        )}
      </div>

      {!collapsed && (
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-5" dir="ltr">
          {tab === 'logs' ? (
            logs.length === 0 ? (
              <p className="text-slate-600" dir="rtl">
                هنوز رویدادی از ایجنت ثبت نشده است.
              </p>
            ) : (
              <div className="space-y-0.5">
                {logs.map((line, index) => (
                  <div key={index} className="text-slate-400">
                    <span className="me-2 text-slate-600">›</span>
                    <span dir="auto">{line}</span>
                  </div>
                ))}
              </div>
            )
          ) : output ? (
            <pre className={`whitespace-pre-wrap ${result?.ok ? 'text-emerald-200/90' : 'text-slate-300'}`}>{output}</pre>
          ) : running ? (
            <p className="text-amber-300/80">در حال اجرای تست‌ها در پوشه‌ی موقت… (تست واقعی، بدون لاگ ساختگی)</p>
          ) : (
            <div className="flex h-full min-h-[60px] flex-col items-center justify-center gap-1 text-slate-600" dir="rtl">
              <TerminalIcon className="h-4 w-4" />
              <p className="text-[10px]">هنوز تستی اجرا نشده است. دکمه‌ی اجرا یا میان‌بر را بزنید.</p>
              {onOpenSettings && (
                <button onClick={onOpenSettings} className="text-[10px] text-emerald-400/80 hover:text-emerald-300">
                  تنظیمات اجرای کد →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
