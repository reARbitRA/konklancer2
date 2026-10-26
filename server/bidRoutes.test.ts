import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import { BidStore } from './store';
import { registerBidRoutes } from './bidRoutes';
import { createApiTokenGuard } from './apiAuth';

/**
 * تست HTTP واقعی روی مسیرهای پیشنهاد/آمار.
 * بدون شبیه‌سازی: یک اپ express روی پورت تصادفی بالا می‌آید و با fetch صدا زده می‌شود.
 */
async function withServer(
  handler: (base: string, store: BidStore) => Promise<void>,
  options: { token?: string | null; env?: NodeJS.ProcessEnv } = {},
) {
  const store = new BidStore(':memory:');
  const app = express();
  app.use(express.json());
  const token = options.token ?? null;
  if (token !== null) app.use('/api', createApiTokenGuard(token));
  registerBidRoutes(app, { store, env: options.env ?? ({} as NodeJS.ProcessEnv), alertSentCount: () => 2 });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await handler(`http://127.0.0.1:${port}`, store);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
}

const json = async (response: Response) => response.json() as Promise<any>;

test('HTTP: چرخه‌ی کامل ثبت، تغییر نتیجه و آمار', async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/api/bids`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p-1', platform: 'ponisha', category: 'web', title: 'سایت فروشگاهی', budgetBid: 12_000_000 }),
    });
    assert.equal(created.status, 201);
    const { bid } = await json(created);
    assert.equal(bid.status, 'sent');
    assert.equal(bid.projectId, 'p-1');

    const listed = await fetch(`${base}/api/bids?projectId=p-1`);
    assert.equal((await json(listed)).count, 1);

    const patched = await fetch(`${base}/api/bids/${bid.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'won' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await json(patched)).bid.status, 'won');

    const stats = await fetch(`${base}/api/stats`);
    const { stats: payload } = await json(stats);
    assert.equal(payload.overall.won, 1);
    assert.equal(payload.overall.closed, 1);
    assert.equal(payload.overall.winRate, 1);
    assert.equal(payload.overall.insufficientSample, true);
    assert.equal(payload.calibration.usable, false);

    const removed = await fetch(`${base}/api/bids/${bid.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const after = await fetch(`${base}/api/bids`);
    assert.equal((await json(after)).count, 0);
  });
});

test('HTTP: ورودی نامعتبر ۴۰۰ می‌دهد', async () => {
  await withServer(async (base) => {
    const noProject = await fetch(`${base}/api/bids`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'ponisha' }),
    });
    assert.equal(noProject.status, 400);
    assert.equal((await json(noProject)).code, 'INVALID_PROJECT');

    const created = await json(await fetch(`${base}/api/bids`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p-2' }),
    }));
    const badStatus = await fetch(`${base}/api/bids/${created.bid.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'maybe' }),
    });
    assert.equal(badStatus.status, 400);
    assert.equal((await json(badStatus)).code, 'INVALID_STATUS');

    const missing = await fetch(`${base}/api/bids/does-not-exist`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'lost' }),
    });
    assert.equal(missing.status, 404);
    assert.equal((await json(missing)).code, 'BID_NOT_FOUND');
    assert.equal((await fetch(`${base}/api/bids/does-not-exist`, { method: 'DELETE' })).status, 404);
  });
});

test('HTTP: وضعیت اعلان‌ها صادقانه گزارش می‌شود', async () => {
  await withServer(async (base) => {
    const off = await json(await fetch(`${base}/api/alerts/status`));
    assert.equal(off.alerts.enabled, false);
    assert.ok(off.alerts.reason);
    assert.equal(off.alerts.sentCount, 2);
  }, { env: {} as NodeJS.ProcessEnv });

  await withServer(async (base) => {
    const on = await json(await fetch(`${base}/api/alerts/status`));
    assert.equal(on.alerts.enabled, true);
    assert.equal(on.alerts.threshold, 70);
  }, { env: { KONKLANCER_TELEGRAM_BOT_TOKEN: 'bot', KONKLANCER_TELEGRAM_CHAT_ID: 'chat', KONKLANCER_ALERT_THRESHOLD: '70' } as NodeJS.ProcessEnv });
});

test('HTTP: با توکن فعال، درخواست بدون توکن ۴۰۱ می‌گیرد', async () => {
  await withServer(
    async (base) => {
      const denied = await fetch(`${base}/api/bids`);
      assert.equal(denied.status, 401);
      assert.equal((await json(denied)).code, 'UNAUTHORIZED');

      const allowed = await fetch(`${base}/api/bids`, { headers: { 'x-api-token': 'super-secret-token' } });
      assert.equal(allowed.status, 200);

      const wrong = await fetch(`${base}/api/stats`, { headers: { 'x-api-token': 'super-secret-tokeN' } });
      assert.equal(wrong.status, 401);

      const viaQuery = await fetch(`${base}/api/stats?token=super-secret-token`);
      assert.equal(viaQuery.status, 200);
    },
    { token: 'super-secret-token' },
  );
});
