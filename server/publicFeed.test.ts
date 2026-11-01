import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublishedFeed, PUBLIC_FEED_URL } from '../src/services/publicFeed';

test('fetches the public published feed without credentials', async () => {
  const fake: typeof fetch = async (url, options) => {
    assert.equal(url, PUBLIC_FEED_URL);
    assert.equal((options?.headers as Record<string,string>).Accept, 'application/vnd.github.raw+json');
    assert.equal((options?.headers as Record<string,string>).Authorization, undefined);
    return new Response('{"id":"x"}');
  };
  assert.equal(await fetchPublishedFeed(fake), '{"id":"x"}');
});
test('reports errors and rejects empty or oversized feeds', async () => {
  await assert.rejects(fetchPublishedFeed(async () => new Response('', {status: 403})), /403/);
  await assert.rejects(fetchPublishedFeed(async () => new Response('')), /empty/);
  await assert.rejects(fetchPublishedFeed(async () => new Response('x', {headers:{'content-length':'5000001'}})), /too large/);
});
