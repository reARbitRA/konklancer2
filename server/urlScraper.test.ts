import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlProjects, detectPlatformFromUrl, fetchAndParseUrl } from './urlScraper';

test('detectPlatformFromUrl identifies Iranian platforms correctly', () => {
  assert.equal(detectPlatformFromUrl('https://ponisha.ir/search/projects').key, 'ponisha');
  assert.equal(detectPlatformFromUrl('https://karlancer.com/projects').key, 'karlancer');
  assert.equal(detectPlatformFromUrl('https://parscoders.com/project').key, 'parskoders');
  assert.equal(detectPlatformFromUrl('https://t.me/s/freelancer_projects').key, 'global');
});

test('parseHtmlProjects extracts project cards, budget and metadata from sample HTML', () => {
  const sampleHtml = `
    <html>
      <body>
        <div class="search-results">
          <article class="project">
            <h2 class="project-title">
              <a href="/project/12345/telegram-bot-python">ربات تلگرام هوشمند معاملات ارز دیجیتال با پایتون</a>
            </h2>
            <div class="project-budget">۴,۵۰۰,۰۰۰ تومان</div>
            <div class="project-bids">۱۲ پیشنهاد</div>
            <div class="project-description">نیازمند یک اسکریپت پیشرفته تلگرام با کتابخانه python-telegram-bot و وب‌سوکت هستیم.</div>
            <div class="employer-name">مهندس جلالی</div>
            <div class="project-skills">
              <span>پایتون</span>
              <span>تلگرام</span>
            </div>
            <time>۲ ساعت پیش</time>
          </article>
          <article class="project">
            <h2 class="project-title">
              <a href="/project/67890/wordpress-speed">افزایش سرعت سایت وردپرس المنتور</a>
            </h2>
            <div class="project-budget">۲,۰۰۰,۰۰۰ تومان</div>
            <div class="project-bids">۳ پیشنهاد</div>
            <div class="project-description">بهینه‌سازی لایت‌اسپید کش و کاهش حجم عکس‌ها برای پیج اسپید گوگل ۹۰+.</div>
            <div class="employer-name">سارا کیانی</div>
            <div class="project-skills">
              <span>وردپرس</span>
            </div>
            <time>دیروز</time>
          </article>
        </div>
      </body>
    </html>
  `;

  const jobs = parseHtmlProjects(sampleHtml, 'https://ponisha.ir/search/projects');
  assert.equal(jobs.length, 2);

  const first = jobs[0];
  assert.equal(first.platformKey, 'ponisha');
  assert.equal(first.title, 'ربات تلگرام هوشمند معاملات ارز دیجیتال با پایتون');
  assert.equal(first.budget, 4500000);
  assert.equal(first.proposalsCount, 12);
  assert.equal(first.clientName, 'مهندس جلالی');
  assert.ok(first.url.includes('/project/12345/telegram-bot-python'));
  assert.equal(first.categoryKey, 'automation');

  const second = jobs[1];
  assert.equal(second.title, 'افزایش سرعت سایت وردپرس المنتور');
  assert.equal(second.budget, 2000000);
  assert.equal(second.proposalsCount, 3);
});

test('fetchAndParseUrl detects Cloudflare challenge and provides helpful instructions', async () => {
  const mockFetch = async () =>
    new Response('<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    });

  const res = await fetchAndParseUrl('https://ponisha.ir/search/projects', mockFetch as any);
  assert.equal(res.success, false);
  assert.equal(res.cloudflareBlocked, true);
  assert.ok(res.error?.includes('Cloudflare'));
  assert.ok(res.error?.includes('سورس HTML'));
});
