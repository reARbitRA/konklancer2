import { boundedFetch } from '../shared/http';
import { canonicalUrl } from '../shared/listing';
import { isHighIntentLead } from '../shared/highIntent';
/**
 * اعلان بیرونی برای پروژه‌های با امتیاز بالا (SPEC-004 R7).
 *
 * فقط تلگرام پشتیبانی می‌شود و کاملاً اختیاری است: اگر توکن/چت‌آیدی تنظیم
 * نشده باشد هیچ درخواستی به بیرون نمی‌رود و وضعیت صادقانه گزارش می‌شود.
 */

export interface AlertConfig {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  threshold: number;
  reason: string | null;
  profile?: 'score' | 'high-intent';
}

export interface NotableJob {
  id: string;
  title: string;
  platform?: string;
  budgetFormatted?: string;
  score?: number;
  url?: string;
  description?: string;
}

export function readAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig {
  const profile = env.KONKLANCER_ALERT_PROFILE?.trim() || 'high-intent';
  if (!['score', 'high-intent'].includes(profile)) throw new Error('Invalid KONKLANCER_ALERT_PROFILE');
  const botToken = (env.KONKLANCER_TELEGRAM_BOT_TOKEN ?? '').trim() || null;
  const chatId = (env.KONKLANCER_TELEGRAM_CHAT_ID ?? '').trim() || null;
  const thresholdRaw = Number(env.KONKLANCER_ALERT_THRESHOLD?.trim() || 85);
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(100, Math.max(0, thresholdRaw)) : 85;
  if (!botToken && !chatId) {
    return { enabled: false, botToken, chatId, threshold, profile: profile as 'score' | 'high-intent', reason: 'KONKLANCER_TELEGRAM_BOT_TOKEN و KONKLANCER_TELEGRAM_CHAT_ID تنظیم نشده‌اند.' };
  }
  if (!botToken) return { enabled: false, botToken, chatId, threshold, reason: 'توکن ربات تلگرام تنظیم نشده است.' };
  if (!chatId) return { enabled: false, botToken, chatId, threshold, reason: 'چت‌آیدی تلگرام تنظیم نشده است.' };
  return { enabled: true, botToken, chatId, threshold, reason: null, profile: profile as 'score' | 'high-intent' };
}

export function shouldAlert(job: NotableJob, threshold: number): boolean {
  return Number(job.score ?? 0) >= threshold;
}

export function formatAlert(job: NotableJob, threshold: number): string {
  const lines = [
    `🎯 پروژه‌ی تازه با امتیاز ${Math.round(Number(job.score ?? 0))} (آستانه ${threshold})`,
    `📌 ${job.title}`,
  ];
  if (job.platform) lines.push(`🌐 ${job.platform}`);
  if (job.budgetFormatted) lines.push(`💰 ${job.budgetFormatted}`);
  if (job.url) lines.push(job.url);
  return lines.join('\n');
}

export interface AlertResult {
  ok: boolean;
  sent: number;
  attempted: number;
  skipped: number;
  disabled: boolean;
  error?: string;
}

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export async function sendTelegramMessage(
  config: AlertConfig,
  text: string,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return { ok: false, error: 'notifier-disabled' };
  }
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await boundedFetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: false }),
      }, fetchImpl as typeof fetch);
      const payload = response.json ? await response.json() as any : null;
      if (response.status === 429 && payload?.ok === false && attempt < 2) {
        const seconds = Number(payload?.parameters?.retry_after ?? 1);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 5) {
          console.warn('[alerts] Telegram rate limited; bounded retry');
          await sleep(Math.max(250 * 2 ** attempt, seconds * 1000));
          continue;
        }
      }
      if (!response.ok || !payload || payload.ok !== true) {
        return { ok: false, status: response.status, error: `Telegram delivery rejected or malformed (HTTP ${response.status})` };
      }
      return { ok: true, status: response.status };
    }
    return { ok: false, error: 'Telegram retries exhausted' };
  } catch (err: any) {
    return { ok: false, error: `Telegram transport or response failure (${err?.name ?? 'Error'})` };
  }
}

/** ارسال اعلان برای پروژه‌های بالای آستانه؛ هر پروژه حداکثر یک بار. */
export async function notifyNotableJobs(
  jobs: NotableJob[],
  config: AlertConfig,
  fetchImpl: FetchLike,
  alreadySent: Set<string> = new Set(),
  persistSent?: () => void,
): Promise<AlertResult> {
  if (!config.enabled) {
    return { ok: true, sent: 0, attempted: 0, skipped: jobs.length, disabled: true, error: config.reason ?? undefined };
  }
  const identities = new Set<string>();
  const candidates = jobs.filter(job => {
    let key: string;
    try { key = job.url ? canonicalUrl(job.url) : job.id; }
    catch { console.warn('[alerts] invalid URL discarded'); return false; }
    const matches = config.profile === 'high-intent' ? isHighIntentLead(job.title, job.description) : shouldAlert(job, config.threshold);
    if (!matches || alreadySent.has(key) || alreadySent.has(job.id) || identities.has(key)) return false;
    identities.add(key);
    return true;
  });
  let sent = 0;
  let lastError: string | undefined;
  for (const job of candidates) {
    const result = await sendTelegramMessage(config, config.profile === 'high-intent' ? ['High-intent bot/automation request', job.title, job.budgetFormatted, job.url].filter(Boolean).join('\n') : formatAlert(job, config.threshold), fetchImpl);
    if (result.ok) {
      sent += 1;
      alreadySent.add(job.url ? canonicalUrl(job.url) : job.id);
      persistSent?.();
    } else {
      lastError = result.error;
      console.warn('[alerts] Telegram delivery failed:', result.error);
    }
  }
  return {
    ok: !lastError,
    sent,
    attempted: candidates.length,
    skipped: jobs.length - candidates.length,
    disabled: false,
    error: lastError,
  };
}
