import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash, createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  MAX_AUTH_AGE_SECONDS,
  buildDataCheckString,
  computeTelegramHash,
  createTelegramAuthHandler,
  readAllowedIds,
  readBotToken,
  verifyTelegramPayload,
  type TelegramAuthEnv,
} from './telegramAuth';

const BOT_TOKEN = '123456:TEST-bot-token-value';
const SECRET_KEY = createHash('sha256').update(BOT_TOKEN, 'utf8').digest();

function sign(payload: Record<string, string | number>, botToken = BOT_TOKEN): Record<string, string | number> {
  const key = createHash('sha256').update(botToken, 'utf8').digest();
  const NL = String.fromCharCode(10);
  const checkString = Object.keys(payload)
    .filter((k) => k !== 'hash' && payload[k] !== '' && payload[k] !== undefined)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join(NL);
  const hash = createHmac('sha256', key).update(checkString, 'utf8').digest('hex');
  return { ...payload, hash };
}

const NOW = 1_800_000_000;
const basePayload = { id: 424242, first_name: 'Ali', username: 'tg_alias', auth_date: NOW };

test('buildDataCheckString sorts keys alphabetically and drops hash', () => {
  const value = buildDataCheckString({ username: 'u', auth_date: 1, id: 2, hash: 'x' });
  const NL = String.fromCharCode(10);
  assert.equal(value, ['auth_date=1', 'id=2', 'username=u'].join(NL));
  assert.ok(!value.includes('\n') === false, 'must use real newline separators, not literal \\n');
})

test('buildDataCheckString keeps literal backslash-n out of the payload', () => {
  assert.ok(!buildDataCheckString(basePayload as never).includes(String.raw`\n`));
});

test('computeTelegramHash matches an independently computed HMAC', () => {
  const checkString = Object.keys(basePayload).sort().map((k) => `${k}=${(basePayload as never)[k]}`).join(String.fromCharCode(10));
  const expected = createHmac('sha256', SECRET_KEY).update(checkString, 'utf8').digest('hex');
  assert.equal(computeTelegramHash(basePayload as never, BOT_TOKEN), expected);
});

test('verifyTelegramPayload accepts a freshly signed widget payload', () => {
  const result = verifyTelegramPayload(sign(basePayload) as never, BOT_TOKEN, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.telegramId, 424242);
    assert.equal(result.username, 'tg_alias');
  }
});

test('verifyTelegramPayload rejects a tampered payload', () => {
  const signed = sign(basePayload);
  const tampered = { ...signed, id: 999 } as never;
  assert.deepEqual(verifyTelegramPayload(tampered, BOT_TOKEN, NOW), {
    ok: false,
    code: 'BAD_SIGNATURE',
    message: 'امضای تلگرام معتبر نیست.',
  });
});

test('verifyTelegramPayload rejects a signature made with another bot token', () => {
  const other = sign(basePayload, '999:OTHER-token');
  const result = verifyTelegramPayload(other as never, BOT_TOKEN, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'BAD_SIGNATURE');
});

test('verifyTelegramPayload rejects replay after 24h', () => {
  const signed = sign(basePayload);
  const result = verifyTelegramPayload(signed as never, BOT_TOKEN, NOW + MAX_AUTH_AGE_SECONDS + 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'STALE');
});

test('verifyTelegramPayload rejects missing hash / bad id', () => {
  assert.equal((verifyTelegramPayload({ id: 1, auth_date: NOW } as never, BOT_TOKEN, NOW) as any).code, 'MISSING_HASH');
  const signed = sign({ auth_date: NOW, username: 'x' });
  assert.equal((verifyTelegramPayload(signed as never, BOT_TOKEN, NOW) as any).code, 'BAD_ID');
});

test('env readers tolerate missing and comma-separated values', () => {
  assert.equal(readBotToken({}), '');
  assert.equal(readBotToken({ KONKLANCER_TELEGRAM_BOT_TOKEN: ' x ' }), 'x');
  assert.equal(readBotToken({ TELEGRAM_BOT_TOKEN: ' y ' }), 'y');
  assert.deepEqual(readAllowedIds({}), []);
  assert.deepEqual(readAllowedIds({ TELEGRAM_ALLOWED_IDS: '1, 2,abc,0,-5' }), [1, 2]);
});

type Handler = ReturnType<typeof createTelegramAuthHandler>;

async function withEndpoint(
  env: TelegramAuthEnv,
  handlerRun: (base: string) => Promise<void>,
  nowSeconds = () => NOW,
  fetchImpl?: typeof fetch,
) {
  const app = express();
  app.use(express.json());
  const handler: Handler = createTelegramAuthHandler({ env, nowSeconds, fetchImpl });
  app.get('/api/auth/telegram', handler);
  app.post('/api/auth/telegram', handler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await handlerRun(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const FULL_ENV: TelegramAuthEnv = {
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-not-a-real-secret',
};

test('HTTP: GET reports configuration honestly', async () => {
  await withEndpoint({}, async (base) => {
    const body = (await (await fetch(`${base}/api/auth/telegram`)).json()) as any;
    assert.equal(body.configured, false);
    assert.deepEqual(body.missing, ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  await withEndpoint(FULL_ENV, async (base) => {
    const body = (await (await fetch(`${base}/api/auth/telegram`)).json()) as any;
    assert.equal(body.configured, true);
    assert.deepEqual(body.missing, []);
    assert.equal(body.allowListEnabled, false);
    assert.equal(body.bot_username, null);
  });
});

test('HTTP: GET exposes the public bot username for the login widget', async () => {
  await withEndpoint({ ...FULL_ENV, TELEGRAM_BOT_USERNAME: '@konklancer_login_bot' }, async (base) => {
    const body = (await (await fetch(`${base}/api/auth/telegram`)).json()) as any;
    assert.equal(body.bot_username, 'konklancer_login_bot');
  });
});

test('HTTP: POST without a bot token fails closed with 503', async () => {
  await withEndpoint({}, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as any).code, 'NOT_CONFIGURED');
  });
});

test('HTTP: POST with a forged signature is rejected with 401', async () => {
  await withEndpoint(FULL_ENV, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload, 'wrong-token')),
    });
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as any).code, 'BAD_SIGNATURE');
  });
});

test('HTTP: allow-list blocks unlisted telegram ids', async () => {
  await withEndpoint({ ...FULL_ENV, TELEGRAM_ALLOWED_IDS: '111,222' }, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as any).code, 'NOT_ALLOWED');
  });
});

test('HTTP: a verified payload without a service key returns verification only', async () => {
  await withEndpoint({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.verified, true);
    assert.equal(body.configured, false);
    assert.equal(body.token_hash, undefined);
  });
});

test('HTTP: a verified payload mints a real token_hash through the admin API', async () => {
  const calls: { url: string; body: any }[] = [];
  const fakeFetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ hashed_token: 'one-time-hash-123', email: JSON.parse(init.body).email }),
    } as never;
  }) as unknown as typeof fetch;

  await withEndpoint(FULL_ENV, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.ok, true);
    assert.equal(body.token_hash, 'one-time-hash-123');
    assert.equal(body.type, 'magiclink');
    assert.equal(body.user.telegram_id, 424242);
  }, () => NOW, fakeFetch);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/admin/generate_link');
  assert.equal(calls[0].body.type, 'magiclink');
  assert.equal(calls[0].body.email, 'tg424242@telegram.konklancer.local');
});

test('HTTP: a brand-new telegram user is created then linked', async () => {
  const seen: string[] = [];
  const fakeFetch = (async (url: any, init: any) => {
    const target = String(url);
    seen.push(target);
    if (target.endsWith('/admin/generate_link') && seen.length === 1) {
      return { ok: false, status: 422, json: async () => ({ error_code: 'user_not_found', msg: 'User not found' }) } as never;
    }
    if (target.endsWith('/admin/users')) {
      return { ok: true, status: 200, json: async () => ({ id: 'new-user' }) } as never;
    }
    return { ok: true, status: 200, json: async () => ({ hashed_token: 'second-attempt-hash' }) } as never;
  }) as unknown as typeof fetch;

  await withEndpoint(FULL_ENV, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).token_hash, 'second-attempt-hash');
  }, () => NOW, fakeFetch);

  assert.deepEqual(seen.map((u) => u.split('/').pop()), ['generate_link', 'users', 'generate_link']);
});

test('HTTP: an unreachable Supabase surfaces as 502 with a clear message', async () => {
  const fakeFetch = (async () => {
    throw new Error('ENETUNREACH');
  }) as unknown as typeof fetch;
  await withEndpoint(FULL_ENV, async (base) => {
    const response = await fetch(`${base}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(basePayload)),
    });
    assert.equal(response.status, 502);
    const body = (await response.json()) as any;
    assert.equal(body.code, 'NETWORK');
    assert.match(body.message, /ENETUNREACH/);
  }, () => NOW, fakeFetch);
});
