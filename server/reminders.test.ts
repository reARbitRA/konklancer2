import test from 'node:test';
import assert from 'node:assert/strict';
import { dueBidReminders, bidTimestamp, reminderMessage, REMINDER_AFTER_HOURS } from '../src/utils/reminders';

const now = new Date('2026-10-26T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

const job = (over: Partial<{ id: string; title: string; status: string; bidAt?: string; outcomeAt?: string }>) => ({
  id: over.id ?? 'j1',
  title: over.title ?? 'پروژه تست',
  status: (over.status ?? 'bidded') as any,
  bidAt: over.bidAt,
  outcomeAt: over.outcomeAt,
});

test('یادآور: پیشنهاد ۵ ساعته یادآوری می‌شود', () => {
  const due = dueBidReminders([job({ bidAt: hoursAgo(5) })], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].jobId, 'j1');
  assert.equal(due[0].hoursWaiting, 5);
});

test('یادآور: پیشنهاد تازه (کمتر از ۴ ساعت) یادآوری نمی‌شود', () => {
  const due = dueBidReminders([job({ bidAt: hoursAgo(REMINDER_AFTER_HOURS - 0.5) })], now);
  assert.equal(due.length, 0);
});

test('یادآور: دقیقاً روی مرز ۴ ساعت سفارشی', () => {
  const due = dueBidReminders([job({ bidAt: hoursAgo(2) })], now, { afterHours: 2 });
  assert.equal(due.length, 1);
  const notYet = dueBidReminders([job({ bidAt: hoursAgo(1.9) })], now, { afterHours: 2 });
  assert.equal(notYet.length, 0);
});

test('یادآور: وضعیت‌های دیگر یا بدون زمان، یادآور ندارند', () => {
  assert.equal(dueBidReminders([job({ status: 'completed', bidAt: hoursAgo(10) })], now).length, 0);
  assert.equal(dueBidReminders([job({ status: 'in_progress', bidAt: hoursAgo(10) })], now).length, 0);
  assert.equal(dueBidReminders([job({ bidAt: undefined })], now).length, 0);
  assert.equal(dueBidReminders([job({ bidAt: 'not-a-date' })], now).length, 0);
});

test('یادآور: زمان از outcomeAt مشتق می‌شود اگر bidAt نباشد', () => {
  const due = dueBidReminders([job({ outcomeAt: hoursAgo(6) })], now);
  assert.equal(due.length, 1);
  assert.equal(bidTimestamp(job({ outcomeAt: hoursAgo(6) })), now.getTime() - 6 * 3_600_000);
  assert.equal(bidTimestamp(job({})), null);
});

test('یادآور: موارد اعلان‌شده دوباره نمی‌آیند و ترتیب نزولی است', () => {
  const jobs = [job({ id: 'a', bidAt: hoursAgo(5) }), job({ id: 'b', bidAt: hoursAgo(9) }), job({ id: 'c', bidAt: hoursAgo(6) })];
  const due = dueBidReminders(jobs, now, { alreadyNotified: ['c'] });
  assert.deepEqual(due.map((d) => d.jobId), ['b', 'a']);
  assert.equal(due[0].hoursWaiting, 9);
});

test('یادآور: متن پیام خوانا و شامل عنوان است', () => {
  const [due] = dueBidReminders([job({ title: 'ربات تلگرام', bidAt: hoursAgo(7) })], now);
  const message = reminderMessage(due);
  assert.match(message.title, /نتیجه/);
  assert.match(message.body, /ربات تلگرام/);
  assert.match(message.body, /7 ساعت/);
});
