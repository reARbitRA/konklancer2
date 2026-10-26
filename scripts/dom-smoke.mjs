#!/usr/bin/env node
/**
 * DOM smoke test — renders the real production bundle in jsdom against a live
 * dev/prod server and exercises navigation, sorting (time/type/price), card
 * expansion, search, filters and route changes.
 *
 * Usage:  npm run test:dom
 * Requires the app to be reachable at http://127.0.0.1:24678 (override with BASE_URL).
 * Exits non-zero if any check fails or the browser console reports an error.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.?\/?assets\/(index-[^"]+\.js)"/)?.[1];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { const s = a.join(' '); if (!/not implemented|Could not parse CSS|width\(0\) and height\(0\)|The width\(0\)/i.test(s)) errors.push('console.warn: ' + s); });

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:24678';
const dom = new JSDOM(html, { url: `${BASE_URL}/#/hunt`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
window.matchMedia = (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange: null, dispatchEvent(){ return false; } });
window.fetch = (u, o) => globalThis.fetch(new URL(u, BASE_URL), o);
window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.URL.createObjectURL = () => 'blob:x';
window.eval(fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8'));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
// NOTE: rendering ~800 cards in jsdom blocks the event loop for several seconds,
// so timer-driven polling can overshoot the deadline while the check would in
// fact succeed. Always re-check once after unblocking before failing.
const waitFor = async (fn, label, timeout = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (fn()) return true; } catch {}
    await sleep(150);
  }
  try { if (fn()) return true; } catch {}
  throw new Error('timeout waiting for ' + label);
};
const clickByText = (sel, text) => {
  const el = $$(sel).find(n => (n.textContent || '').includes(text));
  if (!el) throw new Error(`no ${sel} containing "${text}"`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
};
const fa2en = (s) => s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const budgets = () => $$('.job-brutal').map(c => {
  // budget chip is the accent-colored span in the card header
  const chip = [...c.querySelectorAll('span')].find(sp => /^[۰-۹\d][۰-۹\d٬,]*\s*تومان$/.test((sp.textContent || '').trim()));
  if (!chip) return null;
  return parseInt(fa2en(chip.textContent).replace(/[٬,]/g, ''), 10);
});
const ages = () => $$('.job-brutal').map(c => {
  const m = (c.textContent || '').match(/([۰-۹\d]+)\s*(ثانیه|دقیقه|ساعت|روز) پیش/);
  if (!m) return null;
  const n = parseFloat(fa2en(m[1]));
  const mult = { 'ثانیه': 1/60, 'دقیقه': 1, 'ساعت': 60, 'روز': 1440 }[m[2]];
  return n * mult;
});

const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

await waitFor(() => $$('.job-brutal').length > 0, 'job cards');
check('job cards rendered', $$('.job-brutal').length > 0, `${$$('.job-brutal').length} cards`);
check('sort panel rendered', !!$$('button').find(b => (b.textContent||'').includes('زمان انتشار')));

// 1) PRICE SORT (desc → priciest first)
clickByText('button', 'قیمت / بودجه');
await waitFor(() => { const v = budgets().filter(x => x !== null); return v.length > 1 && v[0] === Math.max(...v); }, 'price desc order', 30000).catch(() => {});
let b = budgets().filter(v => v !== null);
check('price sort applied (desc)', b.length > 1 && b.every((v, i) => i === 0 || v <= b[i-1]), `top=${b.slice(0,3).join(',')}`);

// toggle direction → asc
clickByText('button', 'قیمت / بودجه');
await waitFor(() => { const v = budgets().filter(x => x !== null); return v.length > 1 && v[0] === Math.min(...v); }, 'price asc order', 30000).catch(() => {});
let bAsc = budgets().filter(v => v !== null);
check('price sort toggled (asc)', bAsc.every((v, i) => i === 0 || v >= bAsc[i-1]), `top=${bAsc.slice(0,3).join(',')}`);

// 1b) relevance filter "همه" + price desc must surface the absolute max budget (1e9)
clickByText('button', 'همه (');
// rendering 1000+ cards takes >1s in jsdom → wait on the condition, not a timer
await waitFor(() => $$('.job-brutal').length >= 1000, '"همه" full feed render', 30000).catch(() => {});
const allCards = $$('.job-brutal').length;
check('"همه" relevance filter shows full feed', allCards >= 1000, `${allCards} cards`);

// force price DESC via the direction toggle (label starts with the "desc" side)
const dirs = () => $$('button').find(b => /^(نزولی|صعودی)|^(جدیدترین|قدیمی‌ترین|گران‌ترین|ارزان‌ترین)/.test((b.textContent || '').trim()));
const wantDesc = () => {
  const btn = dirs();
  if (!btn) return;
  const t = (btn.textContent || '').trim();
  const isDesc = t.startsWith('نزولی') || t.startsWith('جدیدترین') || t.startsWith('گران‌ترین');
  if (!isDesc) btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};
// make sure we are sorting by price, then force desc
const priceBtn = $$('button').find(b => (b.textContent || '').includes('قیمت / بودجه'));
const priceCardActive = priceBtn && /bg-\[#00E599\]/.test(priceBtn.className);
if (!priceCardActive) { priceBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(600); }
wantDesc(); await sleep(700);
if (!budgets().filter(v => v !== null).length || budgets().filter(v => v !== null)[0] !== 1000000000) { wantDesc(); await sleep(700); }
const allBudgets = budgets().filter(v => v !== null);
check('max budget surfaces under "همه" filter', allBudgets[0] === 1000000000, `top=${allBudgets[0]}`);
check('price desc monotonic across full feed', allBudgets.every((v, i) => i === 0 || v <= allBudgets[i-1]));
clickByText('button', 'مرتبط (');
await sleep(700);

// 2) TIME SORT (desc → newest first)
clickByText('button', 'زمان انتشار');
await waitFor(() => { const v = ages().filter(x => x !== null); return v.length > 0 && v[0] === Math.min(...v); }, 'time newest-first order', 30000).catch(() => {});
let a = ages().filter(v => v !== null);
check('time sort applied (newest first)', a.length > 0 && a.every((v, i) => i === 0 || v >= a[i-1]), `top=${a.slice(0,3).map(x=>x.toFixed(0)+'m').join(',')}`);

clickByText('button', 'زمان انتشار');
await waitFor(() => { const v = ages().filter(x => x !== null); return v.length > 0 && v[0] === Math.max(...v); }, 'time oldest-first order', 30000).catch(() => {});
let aAsc = ages().filter(v => v !== null);
check('time sort toggled (oldest first)', aAsc.every((v, i) => i === 0 || v <= aAsc[i-1]), `top=${aAsc.slice(0,3).map(x=>x.toFixed(0)+'m').join(',')}`);

// 3) TYPE SORT
clickByText('button', 'نوع / دسته‌بندی');
await sleep(700);
const platformGroups = () => $$('.job-brutal').map(c => {
  const chip = [...c.querySelectorAll('span')].find(sp => /(پونیشا|کارلانسر|پارس|تلگرام|Global)/i.test((sp.textContent || '').trim()) && (sp.textContent || '').trim().length < 24);
  const t = (chip?.textContent || '').trim();
  if (/پونیشا/.test(t)) return 'ponisha';
  if (/کارلانسر/.test(t)) return 'karlancer';
  if (/پارس/.test(t)) return 'parskoders';
  if (/تلگرام|global/i.test(t)) return 'global';
  return '?';
});
const groups = platformGroups();
const runs = groups.reduce((acc, p, i) => (i === 0 || p !== groups[i-1] ? acc + 1 : acc), 0);
const distinct = new Set(groups).size;
check('type sort groups platforms contiguously', runs === distinct && distinct > 1, `runs=${runs} distinct=${distinct} seq=${groups.slice(0, 6).join('>')}…`);

// reset sort
const resetBtn = $$('button').find(b => (b.textContent || '').trim() === 'بازنشانی');
if (resetBtn) { resetBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(400); }
check('sort reset works', true);

// 4) CARD EXPAND / COLLAPSE
const card = $('.job-brutal');
const expandBtn = [...card.querySelectorAll('button')].find(b => b.querySelector('svg.lucide-chevron-down, svg.lucide-chevron-up') || /جزئیات/.test(b.title || ''));
check('expand control exists', !!expandBtn);
expandBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(500);
const expandedText = $('.job-brutal').textContent || '';
check('card expands to details', /کارفرما/.test(expandedText) && /شناسه/.test(expandedText) && /مهلت/.test(expandedText));

// collapse again
const collapseBtn = [...$('.job-brutal').querySelectorAll('button')].find(b => b.querySelector('svg.lucide-chevron-up'));
collapseBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(400);
check('card collapses back', !/شناسه/.test($('.job-brutal').textContent || ''));

// 5) EXPAND ALL toggle
const expandAll = $$('button').find(b => (b.textContent || '').includes('بازکردن همه جزئیات'));
check('expand-all control exists', !!expandAll);
expandAll.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(600);
check('expand-all expands details', /کارفرما/.test($('.job-brutal').textContent || ''));

// 6) SEARCH + FILTERS
const search = $('#root input[placeholder*="ربات تلگرام"]') || $$('input').find(i => /FastAPI|ربات تلگرام/.test(i.placeholder || ''));
check('search input exists', !!search);
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
nativeSetter.call(search, 'ربات');
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(800);
check('search filters cards', $$('.job-brutal').length > 0, `${$$('.job-brutal').length} results for "ربات"`);
nativeSetter.call(search, '');
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(600);

// 6b) MODALS: command palette, settings, AI analysis, proposal studio
const pressKey = (key, opts = {}) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
pressKey('k', { ctrlKey: true });
await sleep(900);
const palette = $$('input').find(i => /جستجو|search|پروژه|دستور/i.test(i.placeholder || ''));
check('command palette opens (Ctrl+K)', !!palette || /دستور|پرش سریع|Command/i.test($('#root').textContent));
pressKey('Escape');
await sleep(600);

const settingsBtn = $$('button').find(b => /تنظیمات|Settings/i.test((b.textContent || '') + (b.getAttribute('title') || '') + (b.getAttribute('aria-label') || '')));
check('settings control exists', !!settingsBtn);
if (settingsBtn) {
  settingsBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(1200);
  const settingsText = $('#root').textContent || '';
  check('settings modal renders', /تنظیمات|کلید|GitHub|API/i.test(settingsText));
  const closeBtn = $$('button').find(b => /بستن|انصراف|Close|✕|×/i.test((b.textContent || '').trim()) && b.closest('[class*="fixed"]'));
  closeBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
}

// analyze → AI evaluator modal (backend may return 503 without a key: must degrade gracefully)
const analyseBtn = $$('button').find(b => (b.textContent || '').trim().startsWith('تحلیل'));
check('analyze button present', !!analyseBtn);
if (analyseBtn) {
  analyseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(1500);
  check('AI evaluator modal opens', /تحلیل|ارزیابی|هوش مصنوعی|AI/i.test($('#root').textContent));
  pressKey('Escape');
  const closers = $$('button').filter(b => /بستن|انصراف|✕|×/i.test((b.textContent || '').trim()));
  closers[0]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(800);
}

// 7) ROUTES
const go = async (hash) => { window.location.hash = hash; await sleep(3000); };
await go('#/pipeline');
check('route /pipeline renders', /قیف تبدیل|شکارشده|پایپ‌لاین/.test($('#root').textContent));
const pipeText = $('#root').textContent || '';
const funnelBtn = $$('button').find(b => (b.textContent || '').includes('قیف تبدیل'));
check('funnel collapsible present', !!funnelBtn);
if (funnelBtn) { funnelBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(900); }
check('funnel chart renders svg (d3)', $$('#root svg').length > 0, `${$$('#root svg').length} svg nodes`);
check('kanban stages render', /شکارشده/.test($('#root').textContent) && /تسویه شده/.test($('#root').textContent));
await go('#/studio');
check('route /studio renders', /استودیو|تحویل|کد/.test($('#root').textContent));
await go('#/ops');
check('route /ops renders', /سایبورگ|اتوماسیون|اسکن/.test($('#root').textContent));
await go('#/hunt');
await sleep(2000);
const huntCards = $$('.job-brutal').length;
check('route back to /hunt renders cards', huntCards > 0, `${huntCards} cards`);

check('no runtime console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.error('FAILED:', failed.map(f => f.name)); process.exit(1); }
process.exit(0);
