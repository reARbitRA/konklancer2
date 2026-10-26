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
}

export interface NotableJob {
  id: string;
  title: string;
  platform?: string;
  budgetFormatted?: string;
  score?: number;
  url?: string;
}

export function readAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig {
  const botToken = (env.KONKLANCER_TELEGRAM_BOT_TOKEN ?? '').trim() || null;
  const chatId = (env.KONKLANCER_TELEGRAM_CHAT_ID ?? '').trim() || null;
  const thresholdRaw = Number(env.KONKLANCER_ALERT_THRESHOLD ?? 85);
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(100, Math.max(0, thresholdRaw)) : 85;
  if (!botToken && !chatId) {
    return { enabled: false, botToken, chatId, threshold, reason: 'KONKLANCER_TELEGRAM_BOT_TOKEN و KONKLANCER_TELEGRAM_CHAT_ID تنظیم نشده‌اند.' };
  }
  if (!botToken) return { enabled: false, botToken, chatId, threshold, reason: 'توکن ربات تلگرام تنظیم نشده است.' };
  if (!chatId) return { enabled: false, botToken, chatId, threshold, reason: 'چت‌آیدی تلگرام تنظیم نشده است.' };
  return { enabled: true, botToken, chatId, threshold, reason: null };
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

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export async function sendTelegramMessage(
  config: AlertConfig,
  text: string,
  fetchImpl: FetchLike,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return { ok: false, error: 'notifier-disabled' };
  }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: false }),
    });
    if (!response.ok) {
      const detail = response.text ? (await response.text()).slice(0, 200) : '';
      return { ok: false, status: response.status, error: detail || `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'network-error' };
  }
}

/** ارسال اعلان برای پروژه‌های بالای آستانه؛ هر پروژه حداکثر یک بار. */
export async function notifyNotableJobs(
  jobs: NotableJob[],
  config: AlertConfig,
  fetchImpl: FetchLike,
  alreadySent: Set<string> = new Set(),
): Promise<AlertResult> {
  if (!config.enabled) {
    return { ok: true, sent: 0, attempted: 0, skipped: jobs.length, disabled: true, error: config.reason ?? undefined };
  }
  const candidates = jobs.filter((job) => shouldAlert(job, config.threshold) && !alreadySent.has(job.id));
  let sent = 0;
  let lastError: string | undefined;
  for (const job of candidates) {
    const result = await sendTelegramMessage(config, formatAlert(job, config.threshold), fetchImpl);
    if (result.ok) {
      sent += 1;
      alreadySent.add(job.id);
    } else {
      lastError = result.error;
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
