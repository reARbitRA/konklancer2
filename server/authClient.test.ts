import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_AVAILABILITY,
  PROVIDER_LABEL,
  PROVIDERS,
  TELEGRAM_BOT_USERNAME,
  buildRedirectUrl,
  describeUser,
  mapAuthSettings,
  unavailableAvailability,
} from '../src/services/auth';
import { setAuthAccessToken, getAuthAccessToken, getAuthUserId } from '../src/services/authToken';
import { apiHeaders } from '../src/utils/apiFetch';

test('provider catalogue exposes exactly the three required methods', () => {
  assert.deepEqual(PROVIDERS.map((p) => p.id).sort(), ['github', 'google', 'telegram']);
  for (const provider of PROVIDERS) {
    assert.ok(PROVIDER_LABEL[provider.id], `missing label for ${provider.id}`);
    assert.notEqual(PROVIDER_LABEL[provider.id], provider.id);
    assert.ok(provider.sub.length > 3);
  }
});

test('mapAuthSettings marks enabled providers enabled', () => {
  const result = mapAuthSettings(
    { external: { google: true, github: true, email: true } },
    { telegramConfigured: true, now: 1000 },
  );
  assert.equal(result.google.status, 'enabled');
  assert.equal(result.github.status, 'enabled');
  assert.equal(result.telegram.status, 'enabled');
  assert.equal(result.google.checkedAt, 1000);
  assert.equal(result.google.reason, null);
});

test('mapAuthSettings marks disabled providers disabled with a reason', () => {
  const result = mapAuthSettings({ external: { google: false, github: false } }, { telegramConfigured: false });
  assert.equal(result.google.status, 'disabled');
  assert.equal(result.github.status, 'disabled');
  assert.equal(result.telegram.status, 'disabled');
  assert.match(result.google.reason ?? '', /client_id|فعال نیست/);
});

test('mapAuthSettings returns unknown — never a fake success — without a payload', () => {
  const result = mapAuthSettings(null);
  assert.equal(result.google.status, 'unknown');
  assert.equal(result.github.status, 'unknown');
  assert.equal(result.telegram.status, 'disabled');
  assert.ok((result.google.reason ?? '').length > 3);
});

test('mapAuthSettings handles missing external field on a 200 response', () => {
  const result = mapAuthSettings({ external: {} }, { telegramConfigured: false });
  assert.equal(result.google.status, 'unknown');
  assert.equal(result.google.checkedAt !== null, true);
});

test('INITIAL_AVAILABILITY starts honest (unknown)', () => {
  assert.equal(INITIAL_AVAILABILITY.google.status, 'unknown');
  assert.equal(INITIAL_AVAILABILITY.github.status, 'unknown');
  assert.equal(INITIAL_AVAILABILITY.telegram.status, 'unknown');
});

test('unavailableAvailability reports unknown with the given reason', () => {
  const map = unavailableAvailability('شبکه در دسترس نیست', 42);
  for (const id of ['google', 'github', 'telegram'] as const) {
    assert.equal(map[id].status, 'unknown');
    assert.match(map[id].reason ?? '', /شبکه/);
    assert.equal(map[id].checkedAt, 42);
  }
});

test('describeUser returns null for anonymous sessions', () => {
  assert.equal(describeUser(null), null);
  assert.equal(describeUser(undefined), null);
});

test('describeUser derives a Google profile', () => {
  const profile = describeUser({
    id: 'u1',
    email: 'me@example.com',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Ali Reza', avatar_url: 'https://x/y.png' },
  } as never);
  assert.equal(profile?.id, 'u1');
  assert.equal(profile?.email, 'me@example.com');
  assert.equal(profile?.fullName, 'Ali Reza');
  assert.equal(profile?.avatarUrl, 'https://x/y.png');
  assert.equal(profile?.provider, 'google');
  assert.equal(profile?.telegramId, null);
});

test('describeUser derives a GitHub profile from user_name', () => {
  const profile = describeUser({
    id: 'u2',
    email: 'dev@example.com',
    app_metadata: { provider: 'github' },
    user_metadata: { user_name: 'octocat' },
  } as never);
  assert.equal(profile?.provider, 'github');
  assert.equal(profile?.fullName, 'octocat');
});

test('describeUser picks up telegram identity fields', () => {
  const profile = describeUser({
    id: 'u3',
    app_metadata: { provider: 'email' },
    user_metadata: { telegram_id: '424242', username: 'tg_user', full_name: 'TG Person', provider: 'telegram' },
  } as never);
  assert.equal(profile?.telegramId, '424242');
  assert.equal(profile?.telegramUsername, 'tg_user');
  assert.equal(profile?.provider, 'telegram');
});

test('describeUser never throws on odd metadata', () => {
  const profile = describeUser({ id: 'u4', email: null, app_metadata: null, user_metadata: null } as never);
  assert.equal(profile?.provider, 'email');
  assert.equal(profile?.fullName, null);
  assert.equal(profile?.id, 'u4');
});

test('buildRedirectUrl stays on the current origin and keeps the route hash', () => {
  const url = buildRedirectUrl({ origin: 'https://abc-24678.e2b.app', pathname: '/', hash: '#/workspace' });
  assert.equal(url, 'https://abc-24678.e2b.app/#/workspace');
  const root = buildRedirectUrl({ origin: 'http://localhost:3000', pathname: '/index.html', hash: '' });
  assert.equal(root, 'http://localhost:3000/index.html');
});

test('auth token bridge accepts only JWT-shaped tokens', () => {
  setAuthAccessToken('not-a-jwt', 'u1');
  assert.equal(getAuthAccessToken(), null);
  assert.equal(getAuthUserId(), null);

  const jwt = 'aaa.bbb.ccc';
  setAuthAccessToken(jwt, 'u9');
  assert.equal(getAuthAccessToken(), jwt);
  assert.equal(getAuthUserId(), 'u9');
  setAuthAccessToken(null);
  assert.equal(getAuthAccessToken(), null);
});

test('apiHeaders forwards the session JWT as a bearer token', () => {
  const jwt = 'head.payload.sig';
  setAuthAccessToken(jwt, 'u1');
  const headers = apiHeaders({ 'content-type': 'application/json' });
  assert.equal(headers.authorization, `Bearer ${jwt}`);
  assert.equal(headers['content-type'], 'application/json');
  setAuthAccessToken(null);
  assert.equal(apiHeaders().authorization, undefined);
});

test('telegram bot username defaults to empty (provider stays disabled)', () => {
  assert.equal(typeof TELEGRAM_BOT_USERNAME, 'string');
  assert.equal(TELEGRAM_BOT_USERNAME.includes('@'), false);
});
