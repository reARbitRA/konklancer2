import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS_KEY, MANUAL_KEY, loadProjects, saveProjects } from '../src/rebuild/projectStorage';
import type { FreelanceJob } from '../src/types';

const job = (id: string, extra: Partial<FreelanceJob> = {}) => ({ id, title: id, ...extra } as FreelanceJob);
function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('project storage merges recovery vault without overwriting newer saved work', () => {
  const store = memory({ [MANUAL_KEY]: JSON.stringify([job('manual-1', { status:'new' })]), [JOBS_KEY]: JSON.stringify([job('manual-1', { status:'bidded' })]) });
  const snapshot = loadProjects(store);
  assert.equal(snapshot.writable, true);
  assert.equal(snapshot.jobs[0].status, 'bidded');
  saveProjects(store, snapshot.jobs);
  assert.equal(JSON.parse(store.getItem(MANUAL_KEY)!)[0].status, 'bidded');
});
test('corrupt data is not treated as an empty writable store', () => {
  const store = memory({ [JOBS_KEY]: '{broken', [MANUAL_KEY]: JSON.stringify([job('manual-recovery')]) });
  assert.equal(loadProjects(store).writable, false);
  assert.equal(loadProjects(store).jobs[0].id, 'manual-recovery');
  assert.equal(store.getItem(JOBS_KEY), '{broken');
});
test('manual, pinned and legacy custom projects get a recovery copy', () => {
  const store = memory();
  saveProjects(store, [job('manual-1'), job('custom-1'), job('pinned', { pinned:true }), job('ordinary')]);
  assert.deepEqual(JSON.parse(store.getItem(MANUAL_KEY)!).map((x: FreelanceJob) => x.id), ['manual-1', 'custom-1', 'pinned']);
});
