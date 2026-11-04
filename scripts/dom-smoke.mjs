#!/usr/bin/env node
/**
 * DOM smoke test for the current rebuilt UI.
 *
 * It executes the real production bundle in jsdom against a live app server and
 * exercises the surfaces that exist today: opportunity search/detail, pipeline,
 * Studio files, outcome tracking, Settings and the SPEC-013 personal AI gateway.
 * The retired `.job-brutal` UI is intentionally not referenced.
 *
 * Usage:
 *   PORT=24678 KONKLANCER_DB_PATH=:memory: npm run dev   # in one terminal
 *   npm run test:dom                                     # in another
 *
 * Override the server with BASE_URL. If the server requires an API token, set
 * DOM_API_TOKEN to the same value.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:24678').replace(/\/$/, '');
const DOM_API_TOKEN = process.env.DOM_API_TOKEN || '';
const dist = 'dist';
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.?\/?assets\/(index-[^"]+\.js)"/)?.[1];
if (!jsFile) throw new Error('Could not locate the production index bundle in dist/index.html');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...args) => errors.push('console.error: ' + args.join(' ')));
vc.on('warn', (...args) => {
  const message = args.join(' ');
  if (!/not implemented|Could not parse CSS|width\(0\) and height\(0\)|The width\(0\)/i.test(message)) {
    errors.push('console.warn: ' + message);
  }
});

const resolveUrl = (input) => {
  if (input instanceof URL) return input;
  if (input && typeof input === 'object' && typeof input.url === 'string') return new URL(input.url, BASE_URL);
  return new URL(String(input), BASE_URL);
};
const testFetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (DOM_API_TOKEN && !headers.has('x-api-token')) headers.set('x-api-token', DOM_API_TOKEN);
  return globalThis.fetch(resolveUrl(input), { ...init, headers });
};

const dom = new JSDOM(html, {
  url: `${BASE_URL}/#/`,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
});
window.fetch = (input, init = {}) => {
  const requestLike = input && typeof input === 'object' && 'method' in input ? input : null;
  return testFetch(input, {
    ...(requestLike ? { method: requestLike.method, headers: requestLike.headers, body: requestLike.body } : {}),
    ...init,
  });
};
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
window.alert = () => {};
window.confirm = () => true;
window.HTMLElement.prototype.scrollIntoView = () => {};
try { window.navigator.clipboard = { writeText: async () => {} }; } catch { /* clipboard not exercised */ }
try { window.URL.createObjectURL = () => 'blob:dom-smoke'; } catch { /* downloads not exercised */ }

window.localStorage.setItem('konklancer_language', 'en');
if (DOM_API_TOKEN) window.localStorage.setItem('konklancer_api_token', DOM_API_TOKEN);

// Seed a protected/manual project through the rebuild storage contract. This
// gives Opportunities, Detail, Pipeline and Studio deterministic data without
// manufacturing a fake server feed.
const SEED_JOB_ID = 'seed-studio-job';
const SEED_TITLE = 'SeedStudioSmoke Deliverable Project';
const SEED_DESCRIPTION = 'SeedStudioSmoke deterministic brief for testing the current rebuilt workspace.';
const seedFiles = {
  'README.md': '# Seed project\n\nDeterministic smoke-test documentation.\n',
  'src/main.py': 'def main():\n    print("hello from smoke")\n',
  'src/utils/helper.py': 'def add(a, b):\n    return a + b\n',
  'web/index.html': '<main id="app">SeedStudioSmoke</main>\n',
};
const seedJob = {
  id: SEED_JOB_ID,
  platform: 'Ponisha',
  platformKey: 'ponisha',
  title: SEED_TITLE,
  clientName: 'Smoke Test Client',
  clientRating: 4.5,
  clientReviews: 10,
  budget: 12000000,
  budgetFormatted: '12,000,000 Toman',
  deadline: '7 days',
  postedTime: '10 minutes ago',
  category: 'Software development',
  categoryKey: 'development',
  tags: ['python', 'smoke'],
  description: SEED_DESCRIPTION,
  proposalsCount: 3,
  avgBid: 9000000,
  status: 'in_progress',
  blueprintMode: 'software_mvp',
  isManual: true,
  pinned: true,
  relevanceTier: 'prime',
  url: 'https://example.com/seed-studio-job',
  solutionCode: seedFiles,
  generatedFiles: seedFiles,
};
window.localStorage.setItem('konklancer_manual_jobs_v2', JSON.stringify([seedJob]));
window.localStorage.setItem('freelanceflow_jobs', JSON.stringify([seedJob]));

// Current Vite emits ESM helpers (`import.meta.*` and a trailing export for a
// split chunk). jsdom's classic-script eval cannot parse those two constructs.
// This harness-only transform leaves the shipped bundle untouched.
const bundleSource = fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8')
  .replaceAll('import.meta', '({url:"file:///dist/assets/index.js"})')
  .replace(/export\{[^}]*\};?\s*$/, '');
window.eval(bundleSource);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector, root = window.document) => root.querySelector(selector);
const $$ = (selector, root = window.document) => [...root.querySelectorAll(selector)];
const rootText = () => $('#root')?.textContent || '';
const results = [];
const check = (name, condition, extra = '') => {
  const ok = Boolean(condition);
  results.push({ name, ok, extra });
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const waitFor = async (predicate, label, timeout = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (predicate()) return true; } catch { /* keep polling while React settles */ }
    await sleep(150);
  }
  try { if (predicate()) return true; } catch { /* fall through */ }
  throw new Error('timeout waiting for ' + label);
};
const go = async (hash) => {
  if (window.location.hash !== hash) window.location.hash = hash;
  await sleep(350);
};
const setInputValue = (input, value) => {
  const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const setSelectValue = (select, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value); else select.value = value;
  select.dispatchEvent(new window.Event('input', { bubbles: true }));
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const click = (element) => element?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const findButton = (text) => $$('button').find((button) => (button.textContent || '').includes(text));

let seededBidId = '';
try {
  // The rebuilt shell and its live/persisted job feed render.
  await waitFor(() => $$('.table-row').some((row) => (row.textContent || '').includes(SEED_TITLE)), 'overview seed project', 60000);
  check('rebuilt shell renders', Boolean($('.app-shell')) && /konklancer/i.test(rootText()));
  check('overview renders opportunity rows', $$('.table-row').length > 0, `${$$('.table-row').length} rows`);
  check('navigation exposes current routes', ['Overview', 'Opportunities', 'Pipeline', 'Studio', 'Insights', 'Settings'].every((label) => rootText().includes(label)));

  // The gateway health endpoint is JSON and discloses metadata only.
  const healthResponse = await testFetch(`${BASE_URL}/api/ai?action=health`);
  const health = await healthResponse.json().catch(() => null);
  const providers = Array.isArray(health?.providers) ? health.providers : [];
  check('personal AI gateway health returns JSON', healthResponse.ok && health?.ok === true && providers.length > 0, `HTTP ${healthResponse.status}`);
  check(
    'gateway health includes primary provider groups',
    ['openrouter', 'groq', 'cerebras', 'gemini', 'agnes', 'mistral', 'huggingface', 'deepseek', 'apmix']
      .every((provider) => providers.some((item) => item.provider === provider)),
    providers.map((item) => item.provider).join(','),
  );
  check(
    'gateway health does not expose key material',
    providers.every((item) => Object.keys(item).every((key) => !/(apiKey|secret|token|credential|^key$)/i.test(key))),
  );

  // Opportunities: current table/search/detail behavior.
  await go('#/opportunities');
  await waitFor(() => Boolean($('.field-search input')) && $$('.table-row').length > 0, 'opportunities table', 60000);
  const search = $('.field-search input');
  check('opportunities search is present', Boolean(search));
  setInputValue(search, 'SeedStudioSmoke');
  await waitFor(
    () => $$('.table-row').length === 1 && ($('.table-row')?.textContent || '').includes(SEED_TITLE),
    'seed-only search result',
    30000,
  );
  check('opportunities search filters to the seeded project', $$('.table-row').length === 1);
  const seedRow = $('.table-row');
  check('seed row links to project detail', (seedRow?.getAttribute('href') || '').includes(encodeURIComponent(SEED_JOB_ID)), seedRow?.getAttribute('href') || '');
  click(seedRow);
  await waitFor(() => Boolean($('.detail-main')) && rootText().includes(SEED_DESCRIPTION), 'project detail', 30000);
  check('project detail renders the brief', rootText().includes(SEED_DESCRIPTION));
  check('project detail exposes AI analysis and proposal actions', Boolean(findButton('Analyze project')) && Boolean(findButton('Draft proposal')));

  // Pipeline: the seeded project is in its in-progress stage.
  await go('#/pipeline?stage=in_progress');
  await waitFor(() => $$('.pipeline-row').some((row) => (row.textContent || '').includes(SEED_TITLE)), 'pipeline seed row', 30000);
  check('pipeline renders five stages', $$('.stage-grid button').length === 5, `${$$('.stage-grid button').length} stages`);
  check('pipeline shows the seeded in-progress project', $$('.pipeline-row').some((row) => (row.textContent || '').includes(SEED_TITLE)));

  // Studio: seeded multi-file deliverable, file switching and creation.
  await go(`#/studio/${encodeURIComponent(SEED_JOB_ID)}`);
  await waitFor(() => Boolean($('.editor-shell')) && $$('.file-list button').length === 4, 'studio file list', 30000);
  const fileNames = $$('.file-list button').map((button) => (button.textContent || '').trim());
  check('studio renders all seeded files', Object.keys(seedFiles).every((name) => fileNames.includes(name)), fileNames.join(', '));
  check('studio opens a file in an editable textarea', $('.editor textarea')?.value.includes('# Seed project'));
  click($$('.file-list button').find((button) => (button.textContent || '').includes('src/main.py')));
  await waitFor(() => $('.editor textarea')?.value.includes('def main'), 'main.py editor content', 15000);
  check('studio switches files', $('.editor textarea')?.getAttribute('aria-label') === 'Edit src/main.py');
  const newFileInput = $('[aria-label="New file path"]');
  check('studio new-file input is present', Boolean(newFileInput));
  setInputValue(newFileInput, 'docs/smoke-notes.md');
  click($('[aria-label="Add file"]'));
  await waitFor(
    () => $$('.file-list button').some((button) => (button.textContent || '').includes('docs/smoke-notes.md')),
    'new studio file',
    15000,
  );
  check('studio creates a new file', $$('.file-list button').some((button) => (button.textContent || '').includes('docs/smoke-notes.md')));

  // Insights: create a real outcome row through the API, render it, then update
  // it through the current select control. The finally block removes it.
  const bidProjectId = `dom-smoke-${Date.now()}`;
  const bidTitle = `DomSmoke outcome ${bidProjectId}`;
  const bidResponse = await testFetch(`${BASE_URL}/api/bids`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: bidProjectId, platform: 'ponisha', category: 'web', title: bidTitle, budgetBid: 9000000 }),
  });
  const bidPayload = await bidResponse.json().catch(() => null);
  seededBidId = bidPayload?.bid?.id || '';
  check('outcome bid can be recorded through the API', bidResponse.ok && Boolean(seededBidId), `HTTP ${bidResponse.status}`);

  await go('#/insights');
  await waitFor(
    () => Boolean($('.metrics')) && $$('.pipeline-row').some((row) => (row.textContent || '').includes(bidTitle)),
    'seeded outcome row',
    30000,
  );
  check('insights renders outcome metrics and the seeded bid', Boolean($('.metrics')));
  const outcomeRow = $$('.pipeline-row').find((row) => (row.textContent || '').includes(bidTitle));
  const outcomeSelect = outcomeRow?.querySelector('select');
  check('insights exposes an outcome control', Boolean(outcomeSelect));
  setSelectValue(outcomeSelect, 'won');
  let persistedWon = false;
  for (let i = 0; i < 30 && !persistedWon; i += 1) {
    await sleep(300);
    try {
      const response = await testFetch(`${BASE_URL}/api/bids?projectId=${encodeURIComponent(bidProjectId)}`);
      const payload = await response.json();
      persistedWon = payload?.bids?.[0]?.status === 'won';
    } catch { /* retry while the UI request settles */ }
  }
  check('changing the outcome persists through the API', persistedWon);

  // Settings: SPEC-013 gateway card, Auto free routing and provider health.
  await go('#/settings');
  await waitFor(() => rootText().includes('هوش مصنوعی شخصی'), 'personal AI settings card', 30000);
  await waitFor(
    () => ['OpenRouter', 'Groq', 'Agnes AI'].every((label) => rootText().includes(label)),
    'gateway provider health chips',
    60000,
  );
  const modelSelect = $$('select').find((select) => select.querySelector('option[value="auto|auto"]'));
  check('settings renders the personal AI gateway', rootText().includes('بدون لاگین'));
  check('settings defaults to Auto free routing', modelSelect?.value === 'auto|auto', modelSelect?.value || 'missing select');
  check('settings exposes a gateway connection test', Boolean(findButton('تست اتصال AI')));
  check('settings exposes the optional remote gateway base', Boolean($('input[placeholder="https://konklancer2.vercel.app"]')));
  check('settings retains API-token access', rootText().includes('API access') && Boolean($('input[type="password"]')));

  // Legacy hashes still land on current rebuild routes.
  await go('#/hunt');
  await waitFor(() => window.location.hash.includes('/opportunities') && Boolean($('.opportunity-table')), 'legacy /hunt redirect', 30000);
  check('legacy /hunt route resolves to opportunities', window.location.hash.includes('/opportunities'));
  await go('#/analytics');
  await waitFor(() => window.location.hash.includes('/insights') && Boolean($('.metrics')), 'legacy /analytics redirect', 30000);
  check('legacy /analytics route resolves to insights', window.location.hash.includes('/insights'));
  await go('#/login');
  await waitFor(() => window.location.hash.includes('/settings') && rootText().includes('هوش مصنوعی شخصی'), 'legacy /login redirect', 30000);
  check('legacy /login route resolves to settings without gating AI', window.location.hash.includes('/settings'));
} catch (error) {
  errors.push('flow: ' + (error?.stack || error?.message || String(error)));
} finally {
  if (seededBidId) {
    await testFetch(`${BASE_URL}/api/bids/${encodeURIComponent(seededBidId)}`, { method: 'DELETE' }).catch(() => {});
  }
}

check('no runtime console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('FAILED:', failed.map((result) => result.name));
  process.exit(1);
}
process.exit(0);
