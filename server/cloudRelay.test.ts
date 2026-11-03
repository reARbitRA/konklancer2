import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPageViaCloudRelay, readCloudSyncedRows, upsertCloudSyncedRows } from '../src/services/cloudRelay';

test('unconfigured optional cloud feed never contacts another project', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error('unexpected request'); }) as typeof fetch;
  try {
    assert.deepEqual(await fetchPageViaCloudRelay('https://example.com'), { ok: false, status: 0, html: '' });
    assert.deepEqual(await readCloudSyncedRows(), []);
    await upsertCloudSyncedRows([{ id: 'test' }]);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
