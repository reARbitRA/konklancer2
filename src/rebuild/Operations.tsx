import { t } from './i18n';
import React, { useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

type CloudStatus = { enabled: boolean; repo?: string; ref?: string; cloudProjects?: number; message?: string };
type Schedule = { enabled: boolean; intervalMinutes: number; running: boolean; lastRunAt: string | null; lastResult: string | null; lastError: string | null };

async function request(path: string, body?: unknown) {
  const response = await apiFetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success === false) throw new Error(typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : `HTTP ${response.status}`);
  return data;
}

export default function Operations() {
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [interval, setIntervalValue] = useState('30');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed.'); } finally { setBusy(false); }
  };
  const refreshSchedule = async () => { const data = await request('/api/scheduler'); setSchedule(data.scheduler); setIntervalValue(String(data.scheduler.intervalMinutes)); };
  const updateSchedule = async (patch: { enabled?: boolean; intervalMinutes?: number }) => { const data = await request('/api/scheduler', patch); setSchedule(data.scheduler); setIntervalValue(String(data.scheduler.intervalMinutes)); setMessage('Scheduler settings saved.'); };
  return <section className="settings-card" aria-labelledby="operations-title">
    <div className="panel-heading"><span>{t("04 / SCAN OPERATIONS")}</span></div><h2 id="operations-title">{t("Feed operations")}<span className="lime">.</span></h2>
    <p className="muted">{t("Inspect the server configuration before starting a scan or changing its schedule. A cloud scan is queued on the configured GitHub repository and may consume Actions minutes.")}</p>
    <div className="action-row"><button className="btn subtle" disabled={busy} onClick={() => run(async () => { setCloud(await request('/api/bridge/cloud')); })}>{t("Check cloud feed")}</button><button className="btn subtle" disabled={busy} onClick={() => run(refreshSchedule)}>{t("Check scheduler")}</button></div>
    {cloud && <div className="muted"><p>Cloud feed: {cloud.enabled ? `configured${cloud.repo ? ` · ${cloud.repo}` : ''}${cloud.ref ? ` (${cloud.ref})` : ''}` : 'not configured'}. {cloud.message || ''} {cloud.cloudProjects !== undefined ? `${cloud.cloudProjects} projects.` : ''}</p>{cloud.enabled && <div className="action-row"><button className="btn subtle" disabled={busy} onClick={() => run(async () => { const data = await request('/api/bridge/sync-feed', {}); setMessage(data.message || 'Feed synchronization completed. Reload opportunities to see updates.'); })}>{t("Sync cloud feed")}</button><button className="btn subtle" disabled={busy} onClick={() => { if (window.confirm(t('Queue a cloud scan in the configured repository? This may consume GitHub Actions minutes.'))) void run(async () => { const data = await request('/api/bridge/cloud-scan', {}); setMessage(data.message || 'Cloud scan queued. It may take time to finish.'); }); }}>{t("Queue cloud scan")}</button></div>}</div>}
    {schedule && <div><p className="muted">Scheduler {schedule.enabled ? 'enabled' : 'disabled'} · {schedule.running ? 'scan running' : 'idle'}{schedule.lastRunAt ? ` · last run ${schedule.lastRunAt}` : ''}{schedule.lastResult ? ` · ${schedule.lastResult}` : ''}{schedule.lastError ? ` · ${schedule.lastError}` : ''}</p><form onSubmit={e => { e.preventDefault(); const value = Number(interval); if (!Number.isInteger(value) || value < 1 || value > 240) { setError('Interval must be a whole number from 1 to 240 minutes.'); return; } void run(() => updateSchedule({ intervalMinutes: value })); }}><label className="stack-label">{t("Interval in minutes")}<input type="number" min="1" max="240" step="1" value={interval} onChange={e => setIntervalValue(e.target.value)} disabled={busy}/></label><div className="action-row"><button className="btn subtle" disabled={busy}>{t("Save interval")}</button><button className="btn subtle" type="button" disabled={busy} onClick={() => run(() => updateSchedule({ enabled: !schedule.enabled }))}>{t(schedule.enabled ? 'Pause scheduler' : 'Enable scheduler')}</button></div></form></div>}
    {message && <p role="status" className="notice">{t(message)}</p>}{error && <p role="alert" className="error">{t(error)}</p>}
  </section>;
}
