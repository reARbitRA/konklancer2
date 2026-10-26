import test from 'node:test';
import assert from 'node:assert/strict';
import { BidStore, BidStoreError, BID_STATUSES } from './store';
import { computeBidStats, budgetBandOf, percent, MIN_CLOSED_SAMPLE } from './bidStats';
import { readApiToken, extractToken, isAuthorized, createApiTokenGuard, timingSafeEqualStrings, describeApiAuth } from './apiAuth';
import { readAlertConfig, shouldAlert, formatAlert, notifyNotableJobs, sendTelegramMessage, type AlertConfig, type FetchLike } from './notifier';

const makeStore = () => new BidStore(':memory:');

const seed = (store: BidStore, count: number, statuses: ('won' | 'lost' | 'no_reply' | 'sent')[] = ['won', 'lost']) => {
  const created = [];
  for (let i = 0; i < count; i += 1) {
    created.push(
      store.recordBid({
        projectId: `p-${i}`,
        platform: i % 2 === 0 ? 'ponisha' : 'parscoders',
        category: i % 3 === 0 ? 'web' : 'ai',
        budgetBid: 1_000_000 + i * 1_000_000,
        status: statuses[i % statuses.length],
        title: `job ${i}`,
      }),
    );
  }
  return created;
};

test('store: ثبت پیشنهاد و خواندن آن', () => {
  const store = makeStore();
  const bid = store.recordBid({ projectId: 'p1', platform: 'ponisha', category: 'web', budgetBid: 5_000_000, notes: 'سلام' });
  assert.equal(bid.status, 'sent');
  assert.equal(bid.outcomeAt, null);
  assert.equal(bid.budgetBid, 5_000_000);
  assert.equal(store.getBid(bid.id)?.projectId, 'p1');
  assert.equal(store.listBids().length, 1);
  store.close();
});

test('store: projectId خالی رد می‌شود', () => {
  const store = makeStore();
  assert.throws(() => store.recordBid({ projectId: '  ' }), BidStoreError);
  store.close();
});

test('store: تغییر وضعیت، outcome_at را ثبت می‌کند', () => {
  const store = makeStore();
  const bid = store.recordBid({ projectId: 'p1' });
  const won = store.updateBid(bid.id, { status: 'won', notes: 'برنده شدیم' });
  assert.equal(won?.status, 'won');
  assert.ok(won?.outcomeAt, 'outcomeAt باید پر شود');
  const back = store.updateBid(bid.id, { status: 'sent' });
  assert.equal(back?.outcomeAt, null, 'برگشت به sent باید outcomeAt را پاک کند');
  assert.equal(store.updateBid('missing', { status: 'won' }), null);
  store.close();
});

test('store: فیلتر بر اساس وضعیت و پروژه + حذف', () => {
  const store = makeStore();
  const a = store.recordBid({ projectId: 'p1', status: 'won' });
  store.recordBid({ projectId: 'p1', status: 'lost' });
  store.recordBid({ projectId: 'p2', status: 'sent' });
  assert.equal(store.listBids({ status: 'won' }).length, 1);
  assert.equal(store.listBids({ projectId: 'p1' }).length, 2);
  assert.equal(store.deleteBid(a.id), true);
  assert.equal(store.deleteBid(a.id), false);
  store.close();
});

test('store: projects_seen یکتا می‌ماند', () => {
  const store = makeStore();
  store.upsertProjectSeen('x', 3, '۱۰ میلیون');
  store.upsertProjectSeen('x', 9, '۲۰ میلیون');
  store.upsertProjectSeen('y', null, '');
  assert.equal(store.countProjectsSeen(), 2);
  store.close();
});

test('stats: نرخ برد، نمونه ناکافی و باند بودجه', () => {
  const store = makeStore();
  seed(store, 10, ['won', 'lost']); // ۵ برد، ۵ باخت
  const stats = computeBidStats(store.listBids());
  assert.equal(stats.overall.total, 10);
  assert.equal(stats.overall.won, 5);
  assert.equal(stats.overall.winRate, 0.5);
  assert.equal(stats.overall.insufficientSample, true);
  assert.match(stats.overall.sampleNote, /نمونه ناکافی/);
  assert.equal(stats.calibration.usable, false);
  assert.equal(stats.calibration.baseRate, 0.5);
  assert.equal(stats.byPlatform.length, 2);
  assert.equal(percent(stats.overall.winRate), '۵۰٪');
  store.close();
});

test('stats: با ۳۰ نمونه‌ی بسته، کالیبراسیون قابل استفاده است', () => {
  const store = makeStore();
  seed(store, MIN_CLOSED_SAMPLE, ['won', 'lost']);
  const stats = computeBidStats(store.listBids());
  assert.equal(stats.overall.closed, MIN_CLOSED_SAMPLE);
  assert.equal(stats.overall.insufficientSample, false);
  assert.equal(stats.calibration.usable, true);
  assert.match(stats.overall.sampleNote, /کالیبره/);
  store.close();
});

test('stats: پیشنهادهای باز در مخرج نرخ برد حساب نمی‌شوند', () => {
  const store = makeStore();
  store.recordBid({ projectId: 'a', status: 'won' });
  store.recordBid({ projectId: 'b', status: 'sent' });
  store.recordBid({ projectId: 'c', status: 'sent' });
  const stats = computeBidStats(store.listBids());
  assert.equal(stats.overall.closed, 1);
  assert.equal(stats.overall.winRate, 1);
  assert.equal(stats.overall.sent, 2);
  store.close();
});

test('stats: بدون داده، نرخ برد null است نه NaN', () => {
  const stats = computeBidStats([]);
  assert.equal(stats.overall.winRate, null);
  assert.equal(percent(null), '—');
  assert.equal(stats.byPlatform.length, 0);
  assert.equal(stats.calibration.usable, false);
});

test('budgetBandOf مرزها را درست می‌بندد', () => {
  assert.equal(budgetBandOf(0).key, 'under-5m');
  assert.equal(budgetBandOf(4_999_999).key, 'under-5m');
  assert.equal(budgetBandOf(5_000_000).key, '5m-10m');
  assert.equal(budgetBandOf(50_000_000).key, 'over-50m');
  assert.equal(budgetBandOf(-5).key, 'under-5m');
  assert.equal(budgetBandOf(Number.NaN).key, 'under-5m');
});

test('api auth: بدون توکن همه مجازند', () => {
  assert.equal(readApiToken({} as NodeJS.ProcessEnv), null);
  assert.equal(readApiToken({ KONKLANCER_API_TOKEN: 'short' } as any), null, 'توکن کوتاه نادیده گرفته می‌شود');
  assert.equal(readApiToken({ KONKLANCER_API_TOKEN: 'long-enough-token' } as any), 'long-enough-token');
  assert.equal(isAuthorized({ headers: {}, query: {} } as any, null), true);
});

test('api auth: توکن از هدر، Bearer و کوئری خوانده می‌شود', () => {
  const expected = 'secret-token-123';
  assert.equal(extractToken({ headers: { 'x-api-token': 'secret-token-123' }, query: {} } as any), expected);
  assert.equal(extractToken({ headers: { authorization: 'Bearer secret-token-123' }, query: {} } as any), expected);
  assert.equal(extractToken({ headers: {}, query: { token: expected } } as any), expected);
  assert.equal(extractToken({ headers: {}, query: {} } as any), null);
  assert.equal(isAuthorized({ headers: { 'x-api-token': 'wrong' }, query: {} } as any, expected), false);
  assert.equal(isAuthorized({ headers: { 'x-api-token': 'wrong-token-123' }, query: {} } as any, expected), false);
  assert.equal(isAuthorized({ headers: { 'x-api-token': 'secret-token-124' }, query: {} } as any, expected), false,
    'توکن هم‌طول ولی متفاوت باید رد شود');
});

test('api auth: مقایسه‌ی طول‌ثابت برای رشته‌های ناهم‌طول', () => {
  assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
  assert.equal(timingSafeEqualStrings('abc', 'abcd'), false);
  assert.equal(timingSafeEqualStrings('', 'x'), false);
});

test('api auth: گارد ۴۰۱ می‌دهد و /api/health باز است', () => {
  const guard = createApiTokenGuard('secret-token-123');
  const run = (req: any) => {
    let status = 200;
    let body: any = null;
    const res: any = {
      status(code: number) { status = code; return res; },
      json(payload: any) { body = payload; return res; },
    };
    let nexted = false;
    guard(req, res, () => { nexted = true; });
    return { status, body, nexted };
  };
  assert.equal(run({ headers: {}, query: {}, path: '/api/jobs', originalUrl: '/api/jobs' }).status, 401);
  assert.equal(run({ headers: { 'x-api-token': 'secret-token-123' }, query: {}, path: '/api/jobs', originalUrl: '/api/jobs' }).nexted, true);
  assert.equal(run({ headers: {}, query: {}, path: '/api/health', originalUrl: '/api/health' }).nexted, true);
  assert.deepEqual(describeApiAuth('x'), { enabled: true, header: 'x-api-token' });
  assert.equal(createApiTokenGuard(null)({} as any, {} as any, () => {}), undefined);
});

test('notifier: بدون پیکربندی خاموش و صادق است', () => {
  const config = readAlertConfig({} as NodeJS.ProcessEnv);
  assert.equal(config.enabled, false);
  assert.match(String(config.reason), /تنظیم نشده/);
  const partial = readAlertConfig({ KONKLANCER_TELEGRAM_BOT_TOKEN: 't' } as any);
  assert.equal(partial.enabled, false);
  assert.match(String(partial.reason), /چت‌آیدی/);
  const full = readAlertConfig({ KONKLANCER_TELEGRAM_BOT_TOKEN: 't', KONKLANCER_TELEGRAM_CHAT_ID: 'c', KONKLANCER_ALERT_THRESHOLD: '70' } as any);
  assert.equal(full.enabled, true);
  assert.equal(full.threshold, 70);
});

test('notifier: آستانه و متن پیام', () => {
  assert.equal(shouldAlert({ id: '1', title: 'x', score: 90 }, 85), true);
  assert.equal(shouldAlert({ id: '2', title: 'x', score: 84 }, 85), false);
  assert.equal(shouldAlert({ id: '3', title: 'x' }, 0), true, 'امتیاز نداشته باشد صفر حساب می‌شود');
  const text = formatAlert({ id: '1', title: 'ربات فروش', platform: 'پونیشا', budgetFormatted: '۱۰ میلیون', score: 92, url: 'https://x' }, 85);
  assert.match(text, /ربات فروش/);
  assert.match(text, /پونیشا/);
  assert.match(text, /https:\/\/x/);
});

test('notifier: ارسال با fetch تزریقی و بدون تکرار', async () => {
  const config: AlertConfig = { enabled: true, botToken: 'tok', chatId: 'chat', threshold: 80, reason: null };
  const calls: string[] = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push(`${url}|${init?.body ?? ''}`);
    return { ok: true, status: 200 };
  };
  const sent = new Set<string>();
  const first = await notifyNotableJobs(
    [
      { id: 'a', title: 'بالا', score: 95 },
      { id: 'b', title: 'پایین', score: 10 },
    ],
    config,
    fakeFetch,
    sent,
  );
  assert.equal(first.sent, 1);
  assert.equal(first.skipped, 1);
  assert.equal(calls.length, 1);
  const second = await notifyNotableJobs([{ id: 'a', title: 'بالا', score: 95 }], config, fakeFetch, sent);
  assert.equal(second.sent, 0, 'پروژه‌ی تکراری دوباره اعلان نمی‌شود');
  assert.equal(calls.length, 1);
});

test('notifier: خطای شبکه وضعیت را می‌شکند ولی کرش نمی‌کند', async () => {
  const config: AlertConfig = { enabled: true, botToken: 'tok', chatId: 'chat', threshold: 1, reason: null };
  const failing: FetchLike = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
  const result = await notifyNotableJobs([{ id: 'a', title: 'x', score: 99 }], config, failing);
  assert.equal(result.ok, false);
  assert.equal(result.sent, 0);
  assert.match(String(result.error), /forbidden/);
  const thrown: FetchLike = async () => { throw new Error('boom'); };
  const one = await sendTelegramMessage(config, 'hi', thrown);
  assert.equal(one.ok, false);
  assert.match(String(one.error), /boom/);
  const disabled = await sendTelegramMessage({ ...config, enabled: false }, 'hi', failing);
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error, 'notifier-disabled');
});

test('store: همه‌ی وضعیت‌های مجاز پذیرفته می‌شوند', () => {
  const store = makeStore();
  for (const status of BID_STATUSES) {
    const bid = store.recordBid({ projectId: `p-${status}`, status });
    assert.equal(bid.status, status);
  }
  assert.equal(store.listBids().length, BID_STATUSES.length);
  const invalid = store.recordBid({ projectId: 'z', status: 'bogus' as any });
  assert.equal(invalid.status, 'sent', 'وضعیت نامعتبر به sent برمی‌گردد');
  store.close();
});
