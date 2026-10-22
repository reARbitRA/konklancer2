import React from 'react';
import { Cloud, Database, Download, FlaskConical, Radar, RefreshCw, Inbox } from 'lucide-react';

export type FeedSource = 'scanner' | 'demo' | 'empty' | 'unknown';

interface FeedStatusBarProps {
  source: FeedSource;
  scannedAt: string | null;
  scannedProjects: number;
  jobCount: number;
  isScanning: boolean;
  onScan: () => void;
  /** اسکن ابری روی رانرهای گیت‌هاب (وقتی KONKLANCER_CLOUD_FEED_REPO تنظیم شده باشد) */
  cloudEnabled?: boolean;
  cloudBusy?: boolean;
  onCloudScan?: () => void;
  onSyncFeed?: () => void;
}

/** فاصله‌ی زمانی را به فارسی و خوانا نشان می‌دهد. */
export function relativeTimeFa(iso: string | null): string {
  if (!iso) return 'نامشخص';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return 'نامشخص';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${minutes.toLocaleString('fa-IR')} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString('fa-IR')} ساعت پیش`;
  const days = Math.round(hours / 24);
  return `${days.toLocaleString('fa-IR')} روز پیش`;
}

/**
 * نوار وضعیت فید (SPEC-004): صادقانه می‌گوید داده از اسکنر واقعی آمده، دمو است،
 * یا هنوز چیزی اسکن نشده — و دکمه‌ی اجرای اسکن را در دسترس می‌گذارد.
 */
export const FeedStatusBar: React.FC<FeedStatusBarProps> = ({
  source,
  scannedAt,
  scannedProjects,
  jobCount,
  isScanning,
  onScan,
  cloudEnabled = false,
  cloudBusy = false,
  onCloudScan,
  onSyncFeed,
}) => {
  const palette =
    source === 'scanner'
      ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200'
      : source === 'demo'
        ? 'border-amber-800/60 bg-amber-950/40 text-amber-200'
        : 'border-slate-800 bg-slate-900/70 text-slate-300';

  const Icon = source === 'scanner' ? Database : source === 'demo' ? FlaskConical : Inbox;

  const label =
    source === 'scanner'
      ? `فید واقعی از اسکنر (${jobCount.toLocaleString('fa-IR')} پروژه از ${scannedProjects.toLocaleString('fa-IR')} مورد اسکن‌شده)`
      : source === 'demo'
        ? 'حالت نمایشی: پروژه‌های این فهرست ساختگی هستند (KONKLANCER_DEMO=1)'
        : source === 'empty'
          ? 'هنوز هیچ پروژه‌ای اسکن نشده است — دکمه‌ی اسکن زنده را بزنید'
          : 'در حال خواندن فید اسکنر...';

  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${palette}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">{label}</span>
        {source === 'scanner' && (
          <span className="font-mono text-[11px] opacity-80">آخرین اسکن: {relativeTimeFa(scannedAt)}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {cloudEnabled && (
          <>
            <button
              onClick={onSyncFeed}
              disabled={cloudBusy}
              title="آخرین فید اسکن‌شده روی گیت‌هاب را بیاور (بدون اجرای اسکن تازه)"
              className="flex items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              <span>همگام‌سازی</span>
            </button>
            <button
              onClick={onCloudScan}
              disabled={cloudBusy}
              title="اجرای اسکنر واقعی روی رانرهای گیت‌هاب (سایت‌های فریلنسری از این سرور قابل دسترسی نیستند)"
              className="flex items-center gap-1.5 rounded-md border border-emerald-800/70 bg-emerald-950/50 px-2.5 py-1 font-medium text-emerald-200 transition-colors hover:bg-emerald-900/50 disabled:opacity-50"
            >
              <Cloud className={`h-3 w-3 ${cloudBusy ? 'animate-pulse' : ''}`} />
              <span>{cloudBusy ? 'اسکن ابری در جریان...' : 'اسکن ابری'}</span>
            </button>
          </>
        )}
        <button
          onClick={onScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'در حال اسکن...' : 'اسکن زنده'}</span>
          {!isScanning && <Radar className="h-3 w-3 text-emerald-400" />}
        </button>
      </div>
    </div>
  );
};
