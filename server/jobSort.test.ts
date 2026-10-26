import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePostedTimeMinutes,
  parseFaQuantity,
  normalizeDigits,
  sortJobs,
  compareJobs,
  nextSortConfig,
  readStoredSort,
  writeStoredSort,
  getTypeRank,
  formatRelativeMinutes,
  DEFAULT_SORT,
} from '../src/utils/jobSort';

const job = (over: Partial<{ id: string; postedTime: string; budget: number; platformKey: any; categoryKey: any }>) => ({
  id: over.id ?? 'j',
  postedTime: over.postedTime ?? '۱ ساعت پیش',
  budget: over.budget ?? 1000,
  platformKey: over.platformKey ?? 'ponisha',
  categoryKey: over.categoryKey ?? 'web',
});

test('normalizeDigits converts Persian and Arabic-Indic digits', () => {
  assert.equal(normalizeDigits('۱۲۳'), '123');
  assert.equal(normalizeDigits('٤٥٦'), '456');
  assert.equal(normalizeDigits('  ۷  '), '7');
});

test('parseFaQuantity handles digits, words and compounds', () => {
  assert.equal(parseFaQuantity('۵'), 5);
  assert.equal(parseFaQuantity('بیست'), 20);
  assert.equal(parseFaQuantity('بیست و سه'), 23);
  assert.equal(parseFaQuantity('نیم'), 0.5);
  assert.equal(parseFaQuantity('هیچ'), null);
});

test('parsePostedTimeMinutes matches real scanner strings', () => {
  // strings taken verbatim from /api/jobs (955-project feed)
  assert.equal(parsePostedTimeMinutes('هم‌اکنون'), 0);
  assert.equal(parsePostedTimeMinutes('۱۸ ثانیه پیش'), 18 / 60);
  assert.equal(parsePostedTimeMinutes('۱۰ دقیقه پیش'), 10);
  assert.equal(parsePostedTimeMinutes('ده دقیقه پیش'), 10);
  assert.equal(parsePostedTimeMinutes('۵ ساعت پیش'), 300);
  assert.equal(parsePostedTimeMinutes('سه ساعت پیش'), 180);
  assert.equal(parsePostedTimeMinutes('اسکن ۵ ساعت پیش'), 300);
  assert.equal(parsePostedTimeMinutes('اسکن ۱۷ ساعت پیش'), 17 * 60);
  assert.equal(parsePostedTimeMinutes('۲ روز پیش'), 2 * 1440);
  assert.equal(parsePostedTimeMinutes('یک روز پیش'), 1440);
  assert.equal(parsePostedTimeMinutes('دوازده روز پیش'), 12 * 1440);
  assert.equal(parsePostedTimeMinutes('۲۴۶ روز پیش'), 246 * 1440);
  assert.equal(parsePostedTimeMinutes('دیروز'), 1440);
  assert.equal(parsePostedTimeMinutes('امروز'), 5);
});

test('parsePostedTimeMinutes returns a huge value when unparseable and no fallback', () => {
  const v = parsePostedTimeMinutes('');
  assert.ok(v > 1e12);
  assert.ok(parsePostedTimeMinutes('چیز نامعلوم') > 1e12);
});

test('parsePostedTimeMinutes falls back to scrapedAt', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const v = parsePostedTimeMinutes('', '2026-10-26T10:00:00Z', now);
  assert.equal(v, 120);
});

test('time sort: newest first for desc, oldest first for asc', () => {
  const jobs = [job({ id: 'old', postedTime: '۵ روز پیش' }), job({ id: 'new', postedTime: '۲ ساعت پیش' }), job({ id: 'mid', postedTime: 'یک روز پیش' })];
  assert.deepEqual(sortJobs(jobs, { by: 'time', dir: 'desc' }).map(j => j.id), ['new', 'mid', 'old']);
  assert.deepEqual(sortJobs(jobs, { by: 'time', dir: 'asc' }).map(j => j.id), ['old', 'mid', 'new']);
});

test('price sort: asc and desc', () => {
  const jobs = [job({ id: 'b', budget: 5000 }), job({ id: 'a', budget: 100 }), job({ id: 'c', budget: 999999 })];
  assert.deepEqual(sortJobs(jobs, { by: 'price', dir: 'asc' }).map(j => j.id), ['a', 'b', 'c']);
  assert.deepEqual(sortJobs(jobs, { by: 'price', dir: 'desc' }).map(j => j.id), ['c', 'b', 'a']);
});

test('type sort groups by platform then category', () => {
  const jobs = [
    job({ id: 'p-web', platformKey: 'ponisha', categoryKey: 'web' }),
    job({ id: 'k-web', platformKey: 'karlancer', categoryKey: 'web' }),
    job({ id: 'p-ai', platformKey: 'ponisha', categoryKey: 'ai' }),
  ];
  const asc = sortJobs(jobs, { by: 'type', dir: 'asc' }).map(j => j.id);
  assert.equal(asc[0], 'k-web');
  assert.ok(asc.indexOf('p-ai') < asc.indexOf('p-web'));
});

test('default sort keeps original order and does not mutate input', () => {
  const jobs = [job({ id: '1', budget: 3 }), job({ id: '2', budget: 1 })];
  const out = sortJobs(jobs, DEFAULT_SORT);
  assert.deepEqual(out.map(j => j.id), ['1', '2']);
  out.push(job({ id: 'x' }));
  assert.equal(jobs.length, 2);
});

test('nextSortConfig toggles direction on same column and resets on switch', () => {
  assert.deepEqual(nextSortConfig({ by: 'time', dir: 'desc' }, 'time'), { by: 'time', dir: 'asc' });
  assert.deepEqual(nextSortConfig({ by: 'time', dir: 'asc' }, 'time'), { by: 'time', dir: 'desc' });
  assert.deepEqual(nextSortConfig({ by: 'time', dir: 'asc' }, 'price'), { by: 'price', dir: 'desc' });
  assert.deepEqual(nextSortConfig({ by: 'price', dir: 'asc' }, 'type'), { by: 'type', dir: 'asc' });
  assert.deepEqual(nextSortConfig({ by: 'type', dir: 'asc' }, 'default'), DEFAULT_SORT);
});

test('sort config persistence survives storage errors and bad payloads', () => {
  const store = new Map<string, string>();
  writeStoredSort({ setItem: (k, v) => { store.set(k, v); } }, { by: 'price', dir: 'asc' });
  assert.deepEqual(readStoredSort({ getItem: (k) => store.get(k) ?? null }), { by: 'price', dir: 'asc' });

  assert.deepEqual(readStoredSort({ getItem: () => 'not-json' }), DEFAULT_SORT);
  assert.deepEqual(readStoredSort({ getItem: () => JSON.stringify({ by: 'nope', dir: 'nope' }) }), DEFAULT_SORT);
  assert.deepEqual(readStoredSort(null), DEFAULT_SORT);
  // throwing storage must not break the UI
  writeStoredSort({ setItem: () => { throw new Error('quota'); } }, { by: 'time', dir: 'asc' });
  assert.deepEqual(readStoredSort({ getItem: () => { throw new Error('denied'); } }), DEFAULT_SORT);
});

test('compareJobs is stable across equal values and getTypeRank is deterministic', () => {
  const a = job({ id: 'a', budget: 10 });
  const b = job({ id: 'b', budget: 10 });
  assert.equal(compareJobs(a, b, { by: 'price', dir: 'asc' }), 0);
  assert.equal(getTypeRank(a), getTypeRank(b));
  assert.notEqual(getTypeRank(a), getTypeRank(job({ platformKey: 'karlancer' })));
});

test('formatRelativeMinutes renders Persian labels', () => {
  assert.equal(formatRelativeMinutes(0), 'هم‌اکنون');
  assert.match(formatRelativeMinutes(30), /دقیقه پیش/);
  assert.match(formatRelativeMinutes(180), /ساعت پیش/);
  assert.match(formatRelativeMinutes(2880), /روز پیش/);
});
