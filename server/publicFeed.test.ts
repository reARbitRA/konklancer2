import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublishedFeed, PUBLIC_FEED_URL, GITHUB_API_FEED_URL } from '../src/services/publicFeed';

test('fetches raw published feed first, without credentials or Github API rate limits', async () => {
  const fake: typeof fetch = async (url, options) => {
    assert.equal(url, PUBLIC_FEED_URL);
    assert.equal((options?.headers as Record<string,string> | undefined)?.Authorization, undefined);
    return new Response('{"id":"x"}');
  };
  assert.equal(await fetchPublishedFeed(fake), '{"id":"x"}');
});
test('falls back to GitHub API when the raw feed fails', async () => {
  const urls:string[]=[];
  const result=await fetchPublishedFeed(async (url,options)=>{ urls.push(String(url)); if(url===PUBLIC_FEED_URL) return new Response('',{status:403}); assert.equal(url,GITHUB_API_FEED_URL);assert.equal((options?.headers as Record<string,string>).Accept,'application/vnd.github.raw+json');return new Response('{"id":"x"}');});
  assert.equal(result,'{"id":"x"}'); assert.deepEqual(urls,[PUBLIC_FEED_URL,GITHUB_API_FEED_URL]);
});
test('reports errors and rejects empty or oversized feeds from both sources', async () => {
  await assert.rejects(fetchPublishedFeed(async () => new Response('', {status: 403})), /403/);
  await assert.rejects(fetchPublishedFeed(async () => new Response('')), /empty/);
  await assert.rejects(fetchPublishedFeed(async () => new Response('x', {headers:{'content-length':'5000001'}})), /too large/);
});
