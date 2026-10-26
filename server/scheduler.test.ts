import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanScheduler, clampInterval, DEFAULT_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from './scheduler';

const makeScheduler = (over: Partial<ConstructorParameters<typeof ScanScheduler>[0]> = {}) => {
  const calls: string[] = [];
  const persisted: { enabled: boolean; intervalMinutes: number }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const scheduler = new ScanScheduler({
    scan: async () => { calls.push('scan'); },
    log: (m) => calls.push(`log:${m}`),
    persist: (state) => persisted.push(state),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
    ...over,
  });
  return { scheduler, calls, persisted, timers };
};

test('زمان‌بند: پیش‌فرض خاموش است و تیک نمی‌زند', async () => {
  const { scheduler, calls } = makeScheduler();
  assert.equal(scheduler.getState().enabled, false);
  assert.equal(scheduler.getState().intervalMinutes, DEFAULT_INTERVAL_MINUTES);
  assert.equal(await scheduler.tick(), 'skipped');
  assert.deepEqual(calls, []);
});

test('زمان‌بند: فعال‌سازی، تایمر می‌سازد و تیک اسکن را صدا می‌زند', async () => {
  const { scheduler, calls, timers, persisted } = makeScheduler();
  scheduler.configure({ enabled: true, intervalMinutes: 5 });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 5 * 60_000);
  assert.equal(scheduler.getState().enabled, true);
  assert.deepEqual(persisted.at(-1), { enabled: true, intervalMinutes: 5 });
  assert.equal(await scheduler.tick(), 'ok');
  assert.deepEqual(calls.filter((c) => c === 'scan'), ['scan']);
  assert.equal(scheduler.getState().scans, 1);
  assert.equal(scheduler.getState().lastResult, 'ok');
  assert.ok(scheduler.getState().lastRunAt);
});

test('زمان‌بند: خاموش‌کردن، تایمر را پاک می‌کند و تیک بی‌اثر است', async () => {
  const { scheduler, calls } = makeScheduler({ initial: { enabled: true, intervalMinutes: 10 } });
  scheduler.configure({ enabled: false });
  assert.equal(scheduler.getState().enabled, false);
  assert.equal(await scheduler.tick(), 'skipped');
  assert.deepEqual(calls.filter((c) => c === 'scan'), []);
});

test('زمان‌بند: تیک اجباری حتی در حالت خاموش اسکن می‌کند', async () => {
  const { scheduler, calls } = makeScheduler();
  assert.equal(await scheduler.tick(true), 'ok');
  assert.deepEqual(calls.filter((c) => c === 'scan'), ['scan']);
});

test('زمان‌بند: اسکن هم‌زمان دوباره اجرا نمی‌شود', async () => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const scheduler = new ScanScheduler({
    scan: async () => { started += 1; await waiting; },
    setTimer: () => 1,
    clearTimer: () => {},
  });
  scheduler.configure({ enabled: true, intervalMinutes: 1 });
  const first = scheduler.tick(true);
  assert.equal(await scheduler.tick(true), 'skipped');
  release();
  assert.equal(await first, 'ok');
  assert.equal(started, 1);
});

test('زمان‌بند: خطای اسکن ثبت می‌شود و برنامه نمی‌شکند', async () => {
  const { scheduler, calls } = makeScheduler({
    scan: async () => { throw new Error('network down'); },
  });
  scheduler.configure({ enabled: true, intervalMinutes: 2 });
  assert.equal(await scheduler.tick(true), 'error');
  const state = scheduler.getState();
  assert.equal(state.lastResult, 'error');
  assert.match(String(state.lastError), /network down/);
  assert.ok(calls.some((c) => c.startsWith('log:')));
});

test('زمان‌بند: بازه‌ی نامعتبر رد می‌شود، بازه‌ی مرزی پذیرفته', () => {
  const { scheduler } = makeScheduler();
  assert.throws(() => scheduler.configure({ intervalMinutes: 0 }));
  assert.throws(() => scheduler.configure({ intervalMinutes: MAX_INTERVAL_MINUTES + 1 }));
  assert.throws(() => scheduler.configure({ intervalMinutes: Number.NaN }));
  assert.equal(scheduler.configure({ intervalMinutes: MIN_INTERVAL_MINUTES }).intervalMinutes, MIN_INTERVAL_MINUTES);
  assert.equal(scheduler.configure({ intervalMinutes: MAX_INTERVAL_MINUTES }).intervalMinutes, MAX_INTERVAL_MINUTES);
  assert.equal(clampInterval(999), MAX_INTERVAL_MINUTES);
  assert.equal(clampInterval(-5), MIN_INTERVAL_MINUTES);
  assert.equal(clampInterval(Number.NaN), DEFAULT_INTERVAL_MINUTES);
});

test('زمان‌بند: وضعیت اولیه از بیرون (ذخیره‌شده) رعایت می‌شود', () => {
  const { scheduler, timers } = makeScheduler({ initial: { enabled: true, intervalMinutes: 45 } });
  assert.equal(scheduler.getState().enabled, true);
  assert.equal(scheduler.getState().intervalMinutes, 45);
  assert.equal(timers.length, 1, 'با وضعیت فعال ذخیره‌شده باید تایمر ساخته شود');
  assert.equal(timers[0].ms, 45 * 60_000);
  scheduler.stop();
  assert.equal(scheduler.getState().enabled, false);
});
