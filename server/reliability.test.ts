import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boundedFetch } from '../shared/http';
import { canonicalUrl, cleanBids } from '../shared/listing';
import { isHighIntentLead } from '../shared/highIntent';
import { validateEnvironment } from './env';
import { notifyNotableJobs, readAlertConfig } from './notifier';
import { readProjects, syncCloudFeed, readCloudFeedConfig } from './scannerBridge';

const noSleep = async () => {};
test('HTTP: transient recovery, bounded signal, no auth retries', async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    const mock = async (_url: any, init: any) => { assert.ok(init.signal); calls++; return new Response('', { status }); };
    const res = await boundedFetch('https://example.test', {}, mock as any, { sleep: noSleep });
    assert.equal(res.status, status);
    assert.equal(calls, [401, 403].includes(status) ? 1 : 3);
  }
  let calls = 0;
  const res = await boundedFetch('https://example.test', {}, (async () => {
    if (++calls === 1) throw new TypeError('connection drop');
    return new Response('raw listing');
  }) as any, { sleep: noSleep });
  assert.equal(await res.text(), 'raw listing');
});

test('HTTP: timeout aborts; POST not replayed; long Retry-After not violated', async () => {
  let calls = 0;
  await assert.rejects(boundedFetch('https://example.test', { method: 'POST' }, (async () => { calls++; throw new TypeError('drop'); }) as any));
  assert.equal(calls, 1);
  const res = await boundedFetch('https://example.test', {}, (async () => new Response('', { status: 429, headers: { 'retry-after': '90' } })) as any, { sleep: () => { throw new Error('must not retry'); } });
  assert.equal(res.status, 429);
  // Keep event loop alive: AbortSignal.timeout uses an unref timer in Node.
  const keepalive = setInterval(() => {}, 100);
  try {
    await assert.rejects(boundedFetch('https://example.test', {}, (async (_: any, init: any) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))) as any, { timeoutMs: 5, attempts: 1 }));
  } finally { clearInterval(keepalive); }
});

test('canonical URLs and strict proposal fields', () => {
  assert.equal(canonicalUrl('http://www.parscoders.com/project/123/old/?utm_source=x#top'), 'https://parscoders.com/project/123');
  assert.equal(canonicalUrl('https://parscoders.com/project/123/new'), 'https://parscoders.com/project/123');
  assert.equal(canonicalUrl('https://example.test/job/?id=2&utm_medium=x'), 'https://example.test/job?id=2');
  for (const raw of ['۳ ساعت پیش', 'three hours ago', 'budget 9000']) assert.equal(cleanBids(raw), '');
  assert.equal(cleanBids('۳ ساعت پیش با ۴ پیشنهاد'), '4 پیشنهاد');
  assert.equal(cleanBids('پیشنهادها: ۱۲'), '12 پیشنهاد');
});

test('readProjects canonical dedupe across source IDs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reliability-'));
  try {
    const file = path.join(dir, 'feed.jsonl');
    fs.writeFileSync(file, [
      { id: 'a', title: 'ساخت ربات', url: 'https://www.parscoders.com/project/123/name', bids_text: '۳ ساعت پیش' },
      { id: 'b', title: 'ساخت ربات', url: 'https://parscoders.com/project/123/other?utm_source=x' },
    ].map(row => JSON.stringify(row)).join('\n'));
    assert.equal(readProjects(file).length, 1);
    assert.equal(readProjects(file)[0].bids_text, '');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('notifier high-intent ignores score, dedupes canonical URL and checks Telegram acknowledgement', async () => {
  const config = { ...readAlertConfig({ KONKLANCER_TELEGRAM_BOT_TOKEN: 'token', KONKLANCER_TELEGRAM_CHAT_ID: 'chat' }), profile: 'high-intent' as const };
  let calls = 0; let persisted = 0;
  const sent = new Set<string>();
  const jobs = [
    { id: 'a', title: 'ساخت ربات نرم‌افزاری برای ثبت سفارش', score: 0, url: 'https://example.test/job/?utm_source=a' },
    { id: 'b', title: 'ساخت ربات', score: 0, url: 'https://example.test/job' },
    { id: 'c', title: 'ساخت ربات ارسال انبوه', score: 100, url: 'https://example.test/spam' },
  ];
  const fake = async (_: any, init: any) => { calls++; assert.ok(init.signal); return new Response(JSON.stringify({ ok: true })); };
  assert.equal((await notifyNotableJobs(jobs, config, fake, sent, () => persisted++)).sent, 1);
  assert.equal(calls, 1); assert.equal(persisted, 1);
  assert.equal((await notifyNotableJobs(jobs, config, fake, sent)).sent, 0);
  const rejected = await notifyNotableJobs(jobs, config, async () => new Response(JSON.stringify({ ok: false })), new Set());
  assert.equal(rejected.sent, 0);
  assert.ok(rejected.error);
});

test('shared profile excludes vague descriptions, tutorials and bulk messaging', () => {
  for (const [title, expected] of [['نیاز به اسکرپر پایتون', true], ['Need workflow automation', true], ['ربات تلگرام چیست', false], ['آموزش ساخت ربات', false], ['ساخت ربات ارسال انبوه', false]] as const) assert.equal(isHighIntentLead(title), expected);
});

test('startup rejects partial/invalid enabled integrations but allows raw scanning without AI', () => {
  validateEnvironment({});
  for (const env of [{ KONKLANCER_TELEGRAM_BOT_TOKEN: 'token' }, { KONKRED_TIMEOUT_MS: 'Infinity' }, { KONKRED_GATEWAY_URL: 'https://example.test' }, { OPENAI_API_KEY: 'your_key' }]) assert.throws(() => validateEnvironment(env));
});

test('cloud metadata outage does not discard raw feed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-fallback-'));
  try {
    const config = readCloudFeedConfig({ KONKLANCER_CLOUD_FEED_REPO: 'owner/repo' }, dir)!;
    config.outFile = path.join(dir, 'feed.jsonl');
    const row = { id: 'raw', title: 'ساخت ربات', url: 'https://example.test/job' };
    const mock = async (url: any) => {
      if (String(url).includes(config.statusPath)) return new Response('unauthorized', { status: 401 });
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify(row)).toString('base64'), encoding: 'base64' }));
    };
    const result = await syncCloudFeed(config, { fetchImpl: mock as any });
    assert.equal(result.totalProjects, 1); assert.equal(result.status, null);
    assert.equal(readProjects(config.outFile)[0].title, row.title);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('Telegram retries only acknowledged rate limits, never ambiguous network errors', async () => {
  const { sendTelegramMessage } = await import('./notifier');
  const config = { enabled: true, botToken: 'token', chatId: 'chat', threshold: 0, reason: null };
  let calls = 0;
  const result = await sendTelegramMessage(config, 'raw lead', async () => {
    if (++calls === 1) return new Response(JSON.stringify({ ok: false, parameters: { retry_after: 0 } }), { status: 429 });
    return new Response(JSON.stringify({ ok: true }));
  }, noSleep);
  assert.equal(result.ok, true); assert.equal(calls, 2);
  calls = 0;
  assert.equal((await sendTelegramMessage(config, 'raw lead', async () => { calls++; throw new TypeError('drop'); }, noSleep)).ok, false);
  assert.equal(calls, 1);
});

test('scraper unknown fields stay unknown and IDs are stable across extraction cycles', async () => {
  const { parseHtmlProjects } = await import('./urlScraper');
  const html = '<article><a href="/project/123/name">ساخت ربات ثبت سفارش</a></article>';
  const first = parseHtmlProjects(html, 'https://ponisha.ir/search/projects')[0];
  const second = parseHtmlProjects(html, 'https://ponisha.ir/search/projects')[0];
  assert.equal(first.id, second.id); assert.equal(first.budget, 0);
  assert.equal(first.clientRating, 0); assert.equal(first.postedTime, 'زمان نامشخص');
});

test('high-intent requires target in heading; incidental bot mentions and financial bots are excluded', () => {
  assert.equal(isHighIntentLead('ترجمه فیلم', 'نیاز به ترجمه دارم؛ از ربات استفاده نکنید'), false);
  assert.equal(isHighIntentLead('توسعه ربات معامله‌گر خودکار'), false);
  assert.equal(isHighIntentLead('ساخت ربات اتوترید برای فارکس'), false);
  assert.throws(() => validateEnvironment({ KONKLANCER_API_TOKEN: 'short' }));
});

test('malformed optional fields do not drop an otherwise valid raw lead', () => {
  assert.equal(cleanBids(null), ''); assert.equal(cleanBids({ count: 3 }), '');
  assert.equal(cleanBids(4), '4');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-lead-'));
  try {
    const file = path.join(dir, 'feed.jsonl');
    fs.writeFileSync(file, JSON.stringify({ id: 'a', title: 'ساخت ربات', url: 'https://example.test/job', bids_text: null, summary: { broken: true }, budget_text: null }));
    const rows = readProjects(file);
    assert.equal(rows.length, 1); assert.equal(rows[0].summary, ''); assert.equal(rows[0].bids_text, '');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('bounded fetch works on WebViews without AbortSignal.timeout/any', async () => {
  const timeout = AbortSignal.timeout;
  const any = AbortSignal.any;
  const keepalive = setInterval(() => {}, 100);
  try {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
    await assert.rejects(boundedFetch('https://example.test', {}, (async (_: any, init: any) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))) as any, { timeoutMs: 5, attempts: 1 }));
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', { value: timeout, configurable: true });
    Object.defineProperty(AbortSignal, 'any', { value: any, configurable: true });
    clearInterval(keepalive);
  }
});

// Historical record 621910 has a generic heading; trading intent appears only in its summary.
test('excludes Persian trader bot requests in summaries without excluding order intake', () => {
  assert.equal(isHighIntentLead('ربات 119553', '🔢 کد پروژه: 119553📌 عنوان پروژه: رباتیه سفارش برای ربات داشتمیه ربات تریدر خودکار میخوام طراحی کنید برام، که این خدمات رو بتونه بهم ارائه بده من روزانه یک الی دو سیگنال خرید یا فروش بهش بدم و خودش اطل'), false);
  assert.equal(isHighIntentLead('ربات 119553', 'یه سفارش برای ربات داشتم'), true);
  assert.equal(isHighIntentLead('ساخت ربات نرم‌افزاری برای ثبت سفارش'), true);
});
