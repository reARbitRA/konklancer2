// SPEC-004 tests: scanner JSONL → UI feed mapping, pre-filter score and scan config.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { categoryLabel } from '../shared/taxonomy';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildFeed,
  buildScanArgs,
  categorize,
  extractBudgetToman,
  extractProposalsCount,
  mapProjectToJob,
  platformOf,
  priorityFromScore,
  readProjects,
  readScanConfig,
  readScanTargets,
  scoreProject,
  toLatinDigits,
  type ScannedProject,
} from './scannerBridge';

const project = (over: Partial<ScannedProject> = {}): ScannedProject => ({
  id: 'p1',
  source: 'parscoders',
  title: 'توسعه ربات تلگرام با پایتون',
  url: 'https://parscoders.com/project/1',
  summary: 'ربات مدیریت کانال با python-telegram-bot',
  budget_text: '۲,۵۰۰,۰۰۰ تومان',
  bids_text: '۳ پیشنهاد',
  posted_text: '۲ ساعت پیش',
  scraped_at: '2026-10-12T08:00:00+00:00',
  ...over,
});

test('toLatinDigits converts Persian and Arabic numerals and drops thousand separators', () => {
  assert.equal(toLatinDigits('۲٬۵۰۰٫۵'), '2500.5');
  assert.equal(toLatinDigits('۱۲۳'), '123');
});

test('extractBudgetToman handles Persian magnitudes, ranges, rial and unknown budgets', () => {
  assert.equal(extractBudgetToman('حداکثر ۵۰۰ هزار تومان'), 500_000);
  assert.equal(extractBudgetToman('۲,۵۰۰,۰۰۰ تومان'), 2_500_000);
  assert.equal(extractBudgetToman('۳ تا ۵ میلیون تومان'), 5_000_000);
  assert.equal(extractBudgetToman('۱٫۵ میلیون تومان'), 1_500_000);
  assert.equal(extractBudgetToman('۲ میلیارد ریال'), 200_000_000);
  assert.equal(extractBudgetToman('توافقی'), 0);
  assert.equal(extractBudgetToman(undefined), 0);
});

test('extractProposalsCount reads Persian digits and treats "بدون پیشنهاد" as zero', () => {
  assert.equal(extractProposalsCount('۳ پیشنهاد'), 3);
  assert.equal(extractProposalsCount('بدون پیشنهاد'), 0);
  assert.equal(extractProposalsCount(''), 0);
});

test('platformOf maps registry ids to UI platform keys and labels Telegram channels', () => {
  assert.deepEqual(platformOf('parscoders'), { key: 'parskoders', label: 'پارس‌کدرز' });
  assert.deepEqual(platformOf('ponisha'), { key: 'ponisha', label: 'پونیشا' });
  assert.deepEqual(platformOf('telegram:workarc'), { key: 'global', label: 'تلگرام @workarc' });
});

test('mapProjectToJob produces a job the front-end validator accepts', () => {
  const job = mapProjectToJob(project());
  assert.equal(job.id, 'p1');
  assert.equal(job.status, 'new');
  assert.equal(job.platformKey, 'parskoders');
  assert.equal(job.budget, 2_500_000);
  assert.equal(job.budgetFormatted, `${(2_500_000).toLocaleString('fa-IR')} تومان`);
  assert.equal(job.proposalsCount, 3);
  assert.equal(job.url, 'https://parscoders.com/project/1');
  assert.equal(job.source, 'parscoders');
  assert.ok(job.description.includes('python-telegram-bot'));
  assert.ok(job.tags.length >= 2 && job.tags.includes('telegram'));
  assert.ok(['High', 'Medium', 'Low'].includes(job.priority));
});

test('mapProjectToJob falls back to the title when the scanner has no summary', () => {
  const job = mapProjectToJob(project({ summary: '' }));
  assert.equal(job.description, 'توسعه ربات تلگرام با پایتون');
});

test('scoreProject rewards fresh, low-competition, well-paid and keyword-matching projects', () => {
  const good = scoreProject(
    project({ budget_text: '۶ میلیون تومان', bids_text: 'بدون پیشنهاد', posted_text: '۲۰ دقیقه پیش' }),
    { include: ['ربات'] },
  );
  const bad = scoreProject(
    project({ budget_text: '۳۰۰ هزار تومان', bids_text: '۳۵ پیشنهاد', posted_text: '۳ هفته پیش' }),
    { include: ['ربات'] },
  );
  assert.ok(good.score > bad.score, `${good.score} should beat ${bad.score}`);
  assert.ok(good.score >= 70);
  assert.ok(good.reasons.some((r) => r.includes('بدون پیشنهاد')));
  assert.equal(priorityFromScore(good.score), 'High');
});

test('readProjects skips broken lines, de-duplicates ids and tolerates a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-scan-'));
  const file = path.join(dir, 'projects.jsonl');
  fs.writeFileSync(
    file,
    [
      JSON.stringify(project({ id: 'a' })),
      '{ not json',
      JSON.stringify(project({ id: 'b' })),
      JSON.stringify(project({ id: 'a', title: 'تکراری' })),
      JSON.stringify({ id: 'c' }),
      '',
    ].join('\n'),
  );
  const projects = readProjects(file);
  assert.deepEqual(projects.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(readProjects(path.join(dir, 'nope.jsonl')), []);
});

test('buildFeed applies include/exclude, the score threshold and sorts by score', () => {
  const projects = [
    project({ id: 'weak', title: 'ترجمه مقاله', summary: 'ترجمه متن', budget_text: '۲۰۰ هزار تومان', bids_text: '۴۰ پیشنهاد' }),
    project({ id: 'strong', title: 'ربات تلگرام پیشرفته', budget_text: '۸ میلیون تومان', bids_text: '۱ پیشنهاد' }),
  ];
  const feed = buildFeed(projects, { include: ['ربات'], minScore: 1 });
  assert.deepEqual(feed.jobs.map((j) => j.id), ['strong']);
  assert.equal(feed.scannedAt, '2026-10-12T08:00:00+00:00');

  const unfiltered = buildFeed(projects, { minScore: 0 });
  assert.deepEqual(unfiltered.jobs.map((j) => j.id), ['strong', 'weak']);

  const excluded = buildFeed(projects, { exclude: ['ربات'], minScore: 0 });
  assert.deepEqual(excluded.jobs.map((j) => j.id), ['weak']);

  const threshold = buildFeed(projects, { minScore: 90 });
  assert.equal(threshold.jobs.length, 0);
  assert.equal(threshold.scannedAt, '2026-10-12T08:00:00+00:00');
});

test('readScanConfig reads personal-mode settings from the environment', () => {
  const defaults = readScanConfig({}, '/tmp/k');
  assert.equal(defaults.python, 'python3');
  assert.deepEqual(defaults.platforms, []);
  assert.equal(defaults.telegram, false);
  assert.equal(defaults.pages, 1);
  assert.equal(defaults.delay, 8);
  assert.equal(defaults.intervalMinutes, 0);
  assert.deepEqual(defaults.categories, []);
  assert.equal(defaults.autoCalibrate, true, 'کالیبراسیون خودکار باید پیش‌فرض روشن باشد');
  assert.equal(defaults.outFile, path.join('/tmp/k', 'scanner', 'out', 'projects.jsonl'));

  const custom = readScanConfig(
    {
      KONKLANCER_PYTHON: 'python3.11',
      KONKLANCER_SCAN_PLATFORMS: 'parscoders, ponisha',
      KONKLANCER_SCAN_TELEGRAM: '1',
      KONKLANCER_SCAN_PAGES: '3',
      KONKLANCER_SCAN_INCLUDE: 'پایتون,python',
      KONKLANCER_SCAN_MIN_SCORE: '60',
      KONKLANCER_SCAN_CATEGORIES: 'translation, graphic',
      KONKLANCER_SCAN_AUTO: '0',
      KONKLANCER_PROJECTS_FILE: '/tmp/feed.jsonl',
      KONKLANCER_SCAN_INTERVAL_MIN: '30',
    },
    '/tmp/k',
  );
  assert.deepEqual(custom.platforms, ['parscoders', 'ponisha']);
  assert.equal(custom.telegram, true);
  assert.equal(custom.pages, 3);
  assert.deepEqual(custom.include, ['پایتون', 'python']);
  assert.equal(custom.minScore, 60);
  assert.equal(custom.outFile, '/tmp/feed.jsonl');
  assert.equal(custom.intervalMinutes, 30);
  assert.deepEqual(custom.categories, ['translation', 'graphic']);
  assert.equal(custom.autoCalibrate, false);
});

test('readScanTargets reports which platforms and channels are actually scannable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-targets-'));
  fs.mkdirSync(path.join(dir, 'scanner'));
  fs.writeFileSync(
    path.join(dir, 'scanner', 'platforms.json'),
    JSON.stringify({
      platforms: [
        { id: 'parscoders', name: 'پارس‌کدرز', scan_enabled: true, scan_selectors: { item: '.x', title: '.y' } },
        { id: 'ponisha', name: 'پونیشا', scan_enabled: true },
        { id: 'karlancer-cand', name: 'کارلانسر (نامزددار)', scan_enabled: true, listing_url_candidates: ['https://x.test/p'] },
        { id: 'karlancer', name: 'کارلانسر', scan_enabled: false },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'scanner', 'telegram_sources.json'),
    JSON.stringify({ channels: [{ username: 'workarc', title: 'فریلنسری', scan_enabled: true }] }),
  );

  const targets = readScanTargets(dir);
  assert.equal(targets.find((t) => t.id === 'parscoders')?.enabled, true);
  assert.equal(targets.find((t) => t.id === 'ponisha')?.enabled, false);
  assert.equal(targets.find((t) => t.id === 'telegram:workarc')?.enabled, true);
  assert.equal(targets.find((t) => t.id === 'karlancer-cand')?.enabled, true, 'نامزد نشانی کافی است');
  assert.match(targets.find((t) => t.id === 'karlancer')?.reason ?? '', /enable --platform karlancer/);
  assert.deepEqual(readScanTargets(path.join(dir, 'missing')).length, 0);
});

test('buildScanArgs mirrors the documented scanner CLI', () => {
  const args = buildScanArgs({
    python: 'python3',
    platforms: ['parscoders'],
    telegram: true,
    pages: 2,
    delay: 8,
    include: ['پایتون'],
    exclude: [],
    categories: [],
    autoCalibrate: true,
    minScore: 0,
    outFile: '/tmp/out.jsonl',
    intervalMinutes: 0,
    timeoutMs: 1000,
    cwd: '/tmp',
  });
  assert.deepEqual(args, [
    '-m',
    'scanner.konklancer_scan',
    'scan',
    '--platform',
    'parscoders',
    '--telegram',
    '--pages',
    '2',
    '--delay',
    '8',
    '--include',
    'پایتون',
    '--auto',
    '--out',
    '/tmp/out.jsonl',
  ]);

  const limited = buildScanArgs({
    python: 'python3',
    platforms: [],
    telegram: false,
    pages: 1,
    delay: 8,
    include: [],
    exclude: [],
    categories: ['graphic', 'translation'],
    autoCalibrate: false,
    minScore: 0,
    outFile: '/tmp/out.jsonl',
    intervalMinutes: 0,
    timeoutMs: 1000,
    cwd: '/tmp',
  });
  assert.ok(limited.includes('--categories'));
  assert.equal(limited[limited.indexOf('--categories') + 1], 'graphic,translation');
  assert.ok(!limited.includes('--auto'), 'با autoCalibrate=false نباید --auto بفرستیم');
});

// ---------------------------------------------------------------------------
// «هر چیزی که AI می‌تواند تولید کند» — نه فقط کدنویسی
// ---------------------------------------------------------------------------

const nonCoding = [
  project({ id: 'tr', title: 'ترجمه مقاله پزشکی', summary: 'ترجمه تخصصی', budget_text: '۳ میلیون تومان' }),
  project({ id: 'gr', title: 'طراحی لوگو و بروشور', summary: 'هویت بصری', budget_text: '۲ میلیون تومان' }),
  project({ id: 'vo', title: 'گویندگی تیزر تبلیغاتی', summary: 'نریشن فارسی', budget_text: '۱ میلیون تومان' }),
  project({ id: 'pp', title: 'ساخت پاورپوینت دفاع', summary: '۳۰ اسلاید', budget_text: '۸۰۰ هزار تومان' }),
];

test('non-coding projects survive the default (empty) filter', () => {
  const feed = buildFeed(nonCoding, { minScore: 0 });
  assert.deepEqual(feed.jobs.map((j) => j.id).sort(), ['gr', 'pp', 'tr', 'vo']);
  for (const job of feed.jobs) {
    assert.notEqual(job.categoryKey, '', 'هر پروژه باید دسته داشته باشد');
    assert.notEqual(job.category, '', 'هر پروژه باید برچسب فارسی دسته داشته باشد');
  }
});

test('categorize maps AI-deliverable work to the shared taxonomy', () => {
  assert.equal(categorize('ترجمه مقاله انگلیسی به فارسی').key, 'translation');
  assert.equal(categorize('طراحی لوگو و ست اداری').key, 'graphic');
  assert.equal(categorize('روتوش عکس محصول').key, 'image');
  assert.equal(categorize('مونتاژ ویدیو یوتیوب').key, 'video');
  assert.equal(categorize('گویندگی تیزر تبلیغاتی').key, 'audio');
  assert.equal(categorize('کپی‌رایتینگ صفحه فرود').key, 'writing');
  assert.equal(categorize('ساخت پاورپوینت دفاع پایان‌نامه').key, 'docs');
  assert.equal(categorize('تحلیل داده فروش با اکسل').key, 'data');
  assert.equal(categorize('ربات تلگرام با پایتون').key, 'automation');
  assert.equal(categorize('یک کار کاملاً نامشخص').key, 'other');
});

test('a keyword that matches nothing yields a neutral bonus, not exclusion', () => {
  const scored = scoreProject(project({ title: 'طراحی بروشور', summary: 'بروشور سه لت' }), {
    include: ['بلاک‌چین'],
  });
  assert.ok(scored.score > 0);
  assert.ok(scored.reasons.some((r) => r.includes('امتیاز خنثی')));
  assert.equal(scored.categoryKey, 'graphic');
});

test('category filter applies only when explicitly requested', () => {
  const everything = buildFeed(nonCoding, { minScore: 0 });
  assert.equal(everything.jobs.length, 4);

  const onlyGraphics = buildFeed(nonCoding, { minScore: 0, categories: ['graphic'] });
  assert.deepEqual(onlyGraphics.jobs.map((j) => j.id), ['gr']);

  const multi = buildFeed(nonCoding, { minScore: 0, categories: ['translation', 'audio'] });
  assert.deepEqual(multi.jobs.map((j) => j.id).sort(), ['tr', 'vo']);
});

test('scanner-provided category wins over local detection', () => {
  const job = mapProjectToJob(project({ id: 'x', title: 'یک متن', category: 'video' }));
  assert.equal(job.categoryKey, 'video');
  assert.equal(job.category, categoryLabel('video'));
});
