#!/usr/bin/env node
/**
 * Visual / layout audit in a REAL Chromium (not jsdom).
 *
 * Why: jsdom has no layout engine, so it can never catch what actually broke the
 * tablet experience — a header row that could not shrink, pushing 52–92px of
 * content outside the viewport, which makes a tablet zoom out and scroll
 * sideways. This script measures real geometry at phone/tablet/laptop sizes,
 * opens every overlay, and fails on:
 *
 *   • horizontal overflow  (documentElement.scrollWidth > viewport width)
 *   • elements escaping the viewport on either side
 *   • overlays (modals, popovers, palette) that open outside the viewport
 *   • touch targets smaller than the minimum on coarse pointers
 *   • runtime console errors
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chrome npm run test:visual
 *   BASE_URL=http://127.0.0.1:24678 CHROMIUM_PATH=... npm run test:visual
 *
 * The app must already be built + served (npm run build && npm run dev), same as
 * the DOM smoke test. Exits non-zero if any check fails.
 */
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:24678';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '';
const STRICT_TARGETS = process.env.STRICT_TARGETS !== 'false';

const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 740, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'tablet-800', width: 800, height: 1280, touch: true },
  { name: 'tablet-1024', width: 1024, height: 768, touch: true },
  { name: 'laptop-1280', width: 1280, height: 800, touch: false },
  { name: 'desktop-1600', width: 1600, height: 900, touch: false },
];

const ROUTES = ['#/hunt', '#/pipeline', '#/studio', '#/analytics', '#/ops', '#/login', '#/account'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!CHROMIUM_PATH) {
  console.error('CHROMIUM_PATH is required (path to a Chrome/Chromium binary).');
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM_PATH,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars'],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function newPage(vp) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Transport noise (socket.io reconnects, aborted navigations) is not a UI bug.
    if (/WebSocket|websocket|ERR_CONNECTION|net::|Failed to load resource|socket\.io|transport/i.test(text)) return;
    errors.push(`console.error: ${text.slice(0, 140)}`);
  });
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: vp.touch,
    hasTouch: vp.touch,
    deviceScaleFactor: 1,
  });
  return { page, errors };
}

/** Measures overflow + out-of-frame elements relative to the *requested* width. */
const measureLayout = (refWidth) => {
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
    // fixed overlays are measured separately by the overlay pass
    if (style.position === 'fixed') continue;
    // an element inside a horizontal scroller (nav strip, code editor, board) is
    // *meant* to extend past the viewport — the scroll container contains it.
    let clipped = false;
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const ps = getComputedStyle(parent);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(ps.overflowX)) { clipped = true; break; }
    }
    if (clipped) continue;
    if (rect.right > refWidth + 1 || rect.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 70),
        text: (el.textContent || '').trim().slice(0, 30),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  return {
    docScroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    offenders: offenders.slice(0, 5),
    offenderCount: offenders.length,
  };
};

// ── pass 1: every route × every viewport ────────────────────────────────────
for (const vp of VIEWPORTS) {
  const { page, errors } = await newPage(vp);
  for (const route of ROUTES) {
    await page.goto(`${BASE_URL}/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1800);
    const layout = await page.evaluate(measureLayout, vp.width);
    const overflow = Math.max(layout.docScroll, layout.viewport) - vp.width;
    check(
      `[${vp.name}] ${route} fits the viewport`,
      overflow <= 1 && layout.offenderCount === 0,
      overflow > 1 || layout.offenderCount
        ? `overflow=${overflow}px doc=${layout.docScroll} offenders=${layout.offenderCount} ${JSON.stringify(layout.offenders[0] ?? {})}`
        : `${layout.docScroll}px`,
    );
  }
  check(`[${vp.name}] no runtime console errors across routes`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── pass 2: overlays must open inside the viewport ──────────────────────────
const OVERLAYS = [
  { name: 'command palette', open: ['جستجو در دستورها', 'جستجو'], panel: '[data-testid="command-palette"]' },
  { name: 'settings modal', open: ['تنظیمات'], panel: '[role="dialog"]' },
  { name: 'account menu', open: ['ورود به حساب', 'حساب'], panel: '[data-testid="account-menu"]' },
  { name: 'model switcher', open: ['کلید API و مدل'], panel: '[data-testid="model-switcher-panel"]' },
];

for (const vp of VIEWPORTS.filter((v) => v.touch)) {
  const { page } = await newPage(vp);
  await page.goto(`${BASE_URL}/#/hunt`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);

  for (const overlay of OVERLAYS) {
    const opened = await page.evaluate((needles) => {
      for (const needle of needles) {
        const el = [...document.querySelectorAll('button, a, [role="button"]')].find((candidate) => {
          const label = candidate.getAttribute('aria-label') || candidate.textContent || '';
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && label.includes(needle);
        });
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    }, overlay.open);

    await sleep(700);
    const box = await page.evaluate((refWidth, selector) => {
      const candidates = [...document.querySelectorAll(selector)]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 80 && rect.height > 60 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
          };
        });
      return {
        found: candidates.length,
        outsideX: candidates.filter((c) => c.left < -1 || c.right > refWidth + 1),
        outsideY: candidates.filter((c) => c.bottom > window.innerHeight + 24 || c.top < -24),
      };
    }, vp.width, overlay.panel);

    if (!opened) {
      check(`[${vp.name}] ${overlay.name} is reachable`, false, 'trigger not found/visible');
    } else if (box.found === 0) {
      check(`[${vp.name}] ${overlay.name} opens inside the viewport`, false, 'nothing opened');
    } else {
      check(
        `[${vp.name}] ${overlay.name} opens inside the viewport`,
        box.outsideX.length === 0 && box.outsideY.length === 0,
        box.outsideX.length
          ? `outside X: ${JSON.stringify(box.outsideX[0])}`
          : box.outsideY.length
            ? `outside Y: ${JSON.stringify(box.outsideY[0])}`
            : `${box.found} panel(s)`,
      );
    }

    // close whatever opened before the next probe
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const close = document.querySelector(
        '[role="dialog"] [aria-label="بستن"], [aria-label="بستن منو"], [aria-label="بستن ورود"]',
      );
      if (close) close.click();
    });
    await sleep(350);
  }
  await page.close();
}

// ── pass 2b: the control rail must behave as a drawer below lg ──────────────
for (const vp of VIEWPORTS.filter((v) => v.touch && v.width <= 1024)) {
  const { page } = await newPage(vp);
  await page.goto(`${BASE_URL}/#/hunt`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);

  const closedAtStart = await page.evaluate(() => !document.querySelector('[data-testid="sidebar"]'));
  check(`[${vp.name}] control rail starts closed (does not cover the feed)`, closedAtStart);

  await page.evaluate(() => document.querySelector('header [aria-label="toggle sidebar"]')?.click());
  await sleep(700);
  const drawer = await page.evaluate((refWidth) => {
    const aside = document.querySelector('[data-testid="sidebar"]');
    if (!aside) return { open: false };
    const rect = aside.getBoundingClientRect();
    const backdrop = document.querySelector('[data-testid="sidebar-backdrop"]');
    return {
      open: rect.width > 100,
      inside: rect.left >= -1 && rect.right <= refWidth + 1,
      backdrop: Boolean(backdrop),
      docScroll: document.documentElement.scrollWidth,
    };
  }, vp.width);
  check(
    `[${vp.name}] header toggle opens the control rail as a drawer`,
    drawer.open && drawer.inside && drawer.backdrop && drawer.docScroll <= vp.width + 1,
    JSON.stringify(drawer),
  );

  await page.evaluate(() => document.querySelector('[data-testid="sidebar-backdrop"]')?.click());
  await sleep(600);
  const closedAgain = await page.evaluate(() => !document.querySelector('[data-testid="sidebar"]'));
  check(`[${vp.name}] tapping the backdrop closes the drawer`, closedAgain);
  await page.close();
}

// ── pass 3: touch-target sizes on coarse pointers ───────────────────────────
for (const vp of VIEWPORTS.filter((v) => v.touch)) {
  const { page } = await newPage(vp);
  await page.goto(`${BASE_URL}/#/hunt`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  const taps = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], input, select, textarea')) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width < 1 || rect.height < 1) continue;
      if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') continue;
      if (el.closest('[aria-hidden="true"]') || el.disabled) continue;
      // offsetHeight = layout pixels (immune to sub-pixel/page-scale rounding)
      if (el.offsetHeight < 30) {
        small.push({
          text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
          h: el.offsetHeight,
          cls: String(el.className).slice(0, 40),
        });
      }
    }
    return { total: small.length, sample: small.slice(0, 3) };
  });
  // The feed renders ~800 cards; allow a couple of incidental misses but not a class of them.
  const ok = STRICT_TARGETS ? taps.total === 0 : taps.total < 20;
  check(
    `[${vp.name}] touch targets are ≥30px tall`,
    ok,
    taps.total === 0 ? 'all good' : `${taps.total} too small: ${JSON.stringify(taps.sample)}`,
  );
  await page.close();
}

// ── pass 4: interaction state must survive idle time ────────────────────────
// Regression guard for the real bug: when the app shell was declared *inside*
// another component, React got a new component type on every render, so the whole
// subtree remounted ~1×/s and silently discarded every local UI state (sidebar
// drawer, filters, expanded cards, half-typed text). The feed re-rendered too.
for (const vp of VIEWPORTS.filter((v) => v.touch)) {
  const { page } = await newPage(vp);
  await page.goto(`${BASE_URL}/#/hunt`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);

  // 4a) drawer stays open while idle
  await page.evaluate(() => document.querySelector('header [aria-label="toggle sidebar"]')?.click());
  await sleep(2500);
  const stillOpen = await page.evaluate(() => Boolean(document.querySelector('[data-testid="sidebar"]')));
  check(`[${vp.name}] control rail stays open while idle (no shell remount)`, stillOpen);
  await page.evaluate(() => document.querySelector('[data-testid="sidebar-backdrop"]')?.click());
  await sleep(500);

  // 4b) typed text is not wiped
  const typed = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[type="text"], input:not([type])')].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 60 && rect.height > 0;
    });
    if (!input) return null;
    input.focus();
    input.value = 'تست پایداری وضعیت';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  });
  await sleep(2500);
  const afterIdle = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[type="text"], input:not([type])')].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 60 && rect.height > 0;
    });
    return input ? input.value : null;
  });
  check(
    `[${vp.name}] typed input survives 2.5s idle`,
    typed === null ? true : afterIdle === typed,
    typed === null ? 'no text input on this route' : `"${afterIdle}"`,
  );
  await page.close();
}

await browser.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} visual checks passed`);
if (failed.length) {
  console.error('FAILED:', failed.map((f) => f.name));
  process.exit(1);
}
process.exit(0);
