/**
 * یادآور پیشنهادهای بی‌نتیجه (SPEC-002 / AC-1).
 *
 * اگر پیشنهادی بیش از ۴ ساعت در وضعیت «ارسال‌شده» بماند و نتیجه‌اش ثبت نشده
 * باشد، یک اعلان مرورگر داده می‌شود. همه‌ی منطق خالص است تا قابل تست باشد؛
 * لایه‌ی Notification فقط در هوک پایین صفحه استفاده می‌شود.
 */
import type { FreelanceJob } from '../types';

export const REMINDER_AFTER_HOURS = 4;
export const REMINDER_STORAGE_KEY = 'konklancer_bid_reminders_v1';

export interface DueReminder {
  jobId: string;
  title: string;
  hoursWaiting: number;
  bidAt: string;
}

type ReminderJob = Pick<FreelanceJob, 'id' | 'title' | 'status'> & {
  bidAt?: string;
  outcomeAt?: string;
};

/** زمان ارسال پیشنهاد: صریح (`bidAt`) یا مشتق از زمان آخرین تغییر وضعیت. */
export function bidTimestamp(job: ReminderJob): number | null {
  const raw = job.bidAt ?? job.outcomeAt;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function dueBidReminders(
  jobs: ReminderJob[],
  now: Date = new Date(),
  options: { afterHours?: number; alreadyNotified?: string[] } = {},
): DueReminder[] {
  const afterHours = Math.max(0, Number(options.afterHours ?? REMINDER_AFTER_HOURS));
  const notified = new Set(options.alreadyNotified ?? []);
  const nowMs = now.getTime();
  const due: DueReminder[] = [];

  for (const job of jobs) {
    if (job.status !== 'bidded') continue;
    if (notified.has(job.id)) continue;
    const stamp = bidTimestamp(job);
    if (stamp === null) continue;
    const hours = (nowMs - stamp) / 3_600_000;
    if (hours < afterHours) continue;
    due.push({
      jobId: job.id,
      title: job.title,
      hoursWaiting: Math.floor(hours),
      bidAt: new Date(stamp).toISOString(),
    });
  }

  return due.sort((a, b) => b.hoursWaiting - a.hoursWaiting);
}

export function reminderMessage(reminder: DueReminder): { title: string; body: string } {
  return {
    title: 'نتیجه‌ی پیشنهاد را ثبت کنید',
    body: `«${reminder.title}» حدود ${reminder.hoursWaiting} ساعت است که در وضعیت ارسال‌شده مانده و نتیجه‌اش در کارنامه ثبت نشده است.`,
  };
}

export function readNotifiedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberNotifiedIds(ids: string[]): void {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids)).slice(-200)));
  } catch {
    // storage may be unavailable; reminders simply repeat next session
  }
}

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
  return window.Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
  if (window.Notification.permission !== 'default') {
    return window.Notification.permission as NotificationPermissionState;
  }
  try {
    const result = await window.Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/** نشان‌دادن اعلان؛ در محیط‌های بدون Notification بی‌صدا رد می‌شود. */
export function showReminderNotification(reminder: DueReminder): boolean {
  if (notificationPermission() !== 'granted') return false;
  try {
    const { title, body } = reminderMessage(reminder);
    new window.Notification(title, { body, tag: `bid-${reminder.jobId}` });
    return true;
  } catch {
    return false;
  }
}
