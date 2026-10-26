import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { extractBearerJwt, verifySupabaseJwt } from './supabaseJwt';

const SECRET = 'test-jwt-secret-value-1234567890';
const NOW = 1_800_000_000;
const env = { SUPABASE_JWT_SECRET: SECRET } as NodeJS.ProcessEnv;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(claims: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${b64url(signature)}`;
}

test('verifySupabaseJwt accepts a correctly signed token', () => {
  const token = makeJwt({ sub: 'user-1', email: 'a@b.c', exp: NOW + 600 });
  const result = verifySupabaseJwt(token, env, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.claims.sub, 'user-1');
    assert.equal(result.claims.email, 'a@b.c');
  }
});

test('verifySupabaseJwt rejects a tampered payload', () => {
  const [header, , signature] = makeJwt({ sub: 'user-1', exp: NOW + 600 }).split('.');
  const forged = `${header}.${b64url(JSON.stringify({ sub: 'admin', exp: NOW + 600 }))}.${signature}`;
  assert.deepEqual(verifySupabaseJwt(forged, env, NOW), { ok: false, reason: 'BAD_SIGNATURE' });
});

test('verifySupabaseJwt rejects a token signed with another secret', () => {
  const token = makeJwt({ sub: 'user-1', exp: NOW + 600 }, 'other-secret');
  assert.deepEqual(verifySupabaseJwt(token, env, NOW), { ok: false, reason: 'BAD_SIGNATURE' });
});

test('verifySupabaseJwt rejects expired tokens', () => {
  const token = makeJwt({ sub: 'user-1', exp: NOW - 120 });
  assert.deepEqual(verifySupabaseJwt(token, env, NOW), { ok: false, reason: 'EXPIRED' });
});

test('verifySupabaseJwt rejects tokens without a subject', () => {
  const token = makeJwt({ email: 'a@b.c', exp: NOW + 600 });
  assert.deepEqual(verifySupabaseJwt(token, env, NOW), { ok: false, reason: 'NO_SUBJECT' });
});

test('verifySupabaseJwt rejects malformed strings', () => {
  assert.deepEqual(verifySupabaseJwt('not-a-jwt', env, NOW), { ok: false, reason: 'MALFORMED' });
  assert.deepEqual(verifySupabaseJwt('a.b', env, NOW), { ok: false, reason: 'MALFORMED' });
});

test('verifySupabaseJwt fails closed without a secret', () => {
  const token = makeJwt({ sub: 'user-1', exp: NOW + 600 });
  assert.deepEqual(verifySupabaseJwt(token, {} as NodeJS.ProcessEnv, NOW), { ok: false, reason: 'NO_SECRET' });
});

test('verifySupabaseJwt allows unsigned trust only with the explicit opt-in flag', () => {
  const token = makeJwt({ sub: 'user-1', exp: NOW + 600 });
  const result = verifySupabaseJwt(
    token,
    { KONKLANCER_TRUST_SUPABASE_JWT: 'true' } as NodeJS.ProcessEnv,
    NOW,
  );
  assert.equal(result.ok, true);
});

test('verifySupabaseJwt reports unsupported asymmetric algorithms instead of guessing', () => {
  const token = makeJwt({ sub: 'user-1', exp: NOW + 600 }, SECRET, 'ES256');
  assert.deepEqual(verifySupabaseJwt(token, env, NOW), { ok: false, reason: 'UNSUPPORTED_ALG' });
});

test('extractBearerJwt extracts well-formed bearer JWTs', () => {
  const token = makeJwt({ sub: 'u' });
  assert.equal(extractBearerJwt(`Bearer ${token}`), token);
  assert.equal(extractBearerJwt(`bearer   ${token}`), token);
});

test('extractBearerJwt ignores opaque API tokens and malformed headers', () => {
  assert.equal(extractBearerJwt('Bearer integration-token-123'), null);
  assert.equal(extractBearerJwt(undefined), null);
  assert.equal(extractBearerJwt('Basic abc'), null);
});

test('server wiring mounts the Supabase JWT path before the API token guard', () => {
  const source = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');
  assert.ok(source.includes('verifySupabaseJwt(jwt)'));
  assert.ok(source.includes("app.get('/api/auth/config'"));
  assert.ok(source.indexOf('verifySupabaseJwt(jwt)') < source.indexOf('return tokenGuard(req, res, next)'));
});

test('client bundle never carries a service-role credential', () => {
  const files = [
    'src/services/auth.ts',
    'src/services/authToken.ts',
    'src/components/auth/AuthProvider.tsx',
    'src/components/auth/LoginScreen.tsx',
    'src/components/auth/AccountMenu.tsx',
    'src/components/auth/AuthGate.tsx',
    'src/utils/apiFetch.ts',
  ];
  const client = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
  assert.ok(!client.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(!client.includes('sb_secret_'));
  assert.ok(!/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(
    client.split('role":"anon"')[0].replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, ''),
  ));
});

test('auth wiring is reachable from the app entrypoint', () => {
  const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8');
  assert.ok(main.includes('AuthProvider'));
  assert.ok(main.includes('AuthGate'));
  const header = readFileSync(join(process.cwd(), 'src/components/layout/BrutalHeader.tsx'), 'utf8');
  assert.ok(header.includes('AccountMenu'));
});

test('HTTP: a Supabase JWT unlocks a token-protected /api route (dual auth)', async () => {
  const express = (await import('express')).default;
  const { createApiTokenGuard } = await import('./apiAuth');
  const app = express();
  const guard = createApiTokenGuard('local-token-1234567890');
  app.use('/api', (req, res, next) => {
    const jwt = extractBearerJwt(req.headers.authorization);
    if (jwt) {
      const result = verifySupabaseJwt(jwt);
      if (result.ok) {
        res.setHeader('x-konklancer-user', result.claims.sub);
        return next();
      }
      res.setHeader('x-konklancer-jwt', result.reason);
    }
    return guard(req, res, next);
  });
  app.get('/api/secret', (req, res) => {
    res.json({ success: true, user: res.getHeader('x-konklancer-user') ?? null });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  const jwt = makeJwt({ sub: 'user-42', email: 'j@example.com', exp: Math.floor(Date.now() / 1000) + 600 });
  const previousSecret = process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_JWT_SECRET = SECRET;

  try {
    const anonymous = await fetch(`${base}/api/secret`);
    assert.equal(anonymous.status, 401);

    const withJwt = await fetch(`${base}/api/secret`, { headers: { authorization: `Bearer ${jwt}` } });
    assert.equal(withJwt.status, 200);
    assert.equal((await withJwt.json() as any).user, 'user-42');

    const withApiToken = await fetch(`${base}/api/secret`, { headers: { 'x-api-token': 'local-token-1234567890' } });
    assert.equal(withApiToken.status, 200);

    const badJwt = await fetch(`${base}/api/secret`, { headers: { authorization: `Bearer ${makeJwt({ sub: 'x' }, 'wrong-secret')}` } });
    assert.equal(badJwt.status, 401);
    assert.equal(badJwt.headers.get('x-konklancer-jwt'), 'BAD_SIGNATURE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = previousSecret;
  }
});
