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
  cloudEnabled?: boolean;
  cloudBusy?: boolean;
  onCloudScan?: () => void;
  onSyncFeed?: () => void;
}

export function relativeTimeFa(iso: string | null): string {
  if (!iso) return 'نامشخص';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'نامشخص';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'همین حالا';
  if (m < 60) return `${m.toLocaleString('fa-IR')} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h.toLocaleString('fa-IR')} ساعت پیش`;
  return `${Math.round(h/24).toLocaleString('fa-IR')} روز پیش`;
}

export const FeedStatusBar: React.FC<FeedStatusBarProps> = ({ source, scannedAt, scannedProjects, jobCount, isScanning, onScan, cloudEnabled=false, cloudBusy=false, onCloudScan, onSyncFeed }) => {
  const isLive = source==='scanner';
  return (
    <div className={`brutal-panel flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 ${isLive ? 'bg-[#00E599] border-[#0a0a0a]':'bg-white'}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 border-[2px] border-black flex items-center justify-center shrink-0 ${isLive?'bg-black text-white':'bg-[#FFDE03] text-black'}`}>
          {isLive? <Database className="w-4 h-4" /> : source==='demo'? <FlaskConical className="w-4 h-4" /> : <Inbox className="w-4 h-4" />}
        </div>
        <div>
          <div className="text-[12px] font-black uppercase tracking-wide">
            {isLive ? `فید زنده ● ${jobCount.toLocaleString('fa-IR')} پروژه از ${scannedProjects.toLocaleString('fa-IR')} اسکن` : source==='demo' ? 'حالت نمایشی — داده ساختگی' : source==='empty' ? 'هنوز اسکن نشده — دکمه اسکن را بزنید' : 'در حال خواندن فید...'}
          </div>
          {isLive && <div className="text-[11px] font-mono font-bold opacity-70">آخرین اسکن: {relativeTimeFa(scannedAt)}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {cloudEnabled && (
          <>
            <button onClick={onSyncFeed} disabled={cloudBusy} className="brutal-btn brutal-btn--sm bg-white text-[11px]"><Download className="w-3.5 h-3.5" /> همگام‌سازی</button>
            <button onClick={onCloudScan} disabled={cloudBusy} className="brutal-btn brutal-btn--sm bg-white text-[11px]"><Cloud className={`w-3.5 h-3.5 ${cloudBusy?'animate-pulse':''}`} /> اسکن ابری</button>
          </>
        )}
        <button onClick={onScan} disabled={isScanning} className="brutal-btn brutal-btn--primary brutal-btn--sm">
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning?'animate-spin':''}`} /> {isScanning?'در حال اسکن...':'اسکن زنده'} <Radar className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
