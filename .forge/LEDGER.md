# LEDGER
## Handoff log
## 2026-10-10 · session-001 · agent-arbiter-mvp
**Did:** Initialized repo structure, created specs SPEC-001/002, created tasks T-001/002. Firebase declined by user. Implemented rate limiting/cool-down in server.ts to fix Gemini API 429 errors.
**Did (T-001):** Updated handleMoveJobStatus in App.tsx to automatically trigger GitHubWorkflowManager when job status changes to 'in_progress'.
**Did (Bug Fix):** Improved Gemini API rate limit handling in server.ts to parse dynamic retry delays from error details.
**Status:** T-001 DONE. Ready to verify T-002.
## 2026-10-10 · session-002 · arena/bea82c77-konklancer
**Did:** Merged origin/main (467a3fb). Audited roadmap (docs/AUDIT-2026-10-10.md). Drafted SPEC-003/004/005; user approved all three (open questions Q1 engine deletion, Q2 model names, Q3 R6 wording kept open). Implemented SPEC-003 R1,R2,R3,R4,R6 and SPEC-004 R1 (demo-gated fake feed). Added server/contentFilter.ts. Allowed *.e2b.app in Vite middleware. Rewrote README; package renamed konklancer; start=tsx server.ts; react-is declared (build needed it).
**Verified:** tsc OK; vite build OK (after react-is); contentFilter cases OK; scanner tests 11/11; HTTP: analyze-job blocked→422, /api/jobs has no captcha job, trigger-scan no longer fabricates.
**Status:** T-003 DOING (R5 pending). T-004, T-005 OPEN. Branch is arena/bea82c77-konklancer (session-fixed), not feat/*.
## 2026-10-10 · session-003 · arena/bea82c77-konklancer
**Did:** Answered Q1 (engine file) honestly: not strictly required. User picked: Gemini removed from konklancer only; privacy any; fusion = normalization. Cloned and read konkred gateway (31/31 tests pass, zero deps). Drafted and got approval of SPEC-006. Implemented T-006: server/llm.ts (gateway client, mock guard, retry, cache), 7 tests, server.ts migrated (SDK removed, fabricated fallbacks removed), .env.example, README AI section, data/ gitignored.
**Verified:** npm test 7/7; tsc OK; vite build OK; scanner tests 11/11; E2E with local gateway (no provider keys): analyze/proposal → AI_UNAVAILABLE 503, categorize keyword fallback, unconfigured → 503 AI_NOT_CONFIGURED.
**Not verified:** live provider output (no real keys).
**Status:** T-006 DONE. T-003 DOING, T-004 OPEN, T-005 OPEN.
## 2026-10-12 · session-004 · arena/bb8cb4b4-konklancer
**Did:** درخواست کاربر: «آماده‌سازی برای استفاده‌ی شخصی؛ برای خودم اسکن کند». پیاده‌سازی حلقه‌ی گمشده‌ی SPEC-004 و یک لایه‌ی حالت شخصی:
server/scannerBridge.ts (نگاشت JSONL→فید، بودجه‌ی فارسی/ریال، امتیاز پیش‌فیلتر، runScanner با قفل)، بازنویسی /api/jobs و /api/bridge/trigger-scan و /api/bridge/status، رویداد scan:done، اسکن دوره‌ای اختیاری، FeedStatusBar، حذف داده‌ی ساختگی از مسیر پیش‌فرض، لینک صفحه‌ی پروژه و چیپ امتیاز، enable/disable + parse-file --out + parse-telegram-file در اسکنر، تفکیک پیام‌های robots، docs/PERSONAL-SETUP.md، SPEC-007 (DRAFT)، T-007.
**Verified:** npm test 19/19 (۱۲ تازه)؛ pytest 19/19 (۴ تازه)؛ tsc و vite build سالم؛ E2E با فید ساختگی: source=scanner، امتیاز/دلایل درست، trigger-scan واقعی (spawn پایتون + guard robots + خروج تمیز)، parse-file --out فید زنده را به‌روز کرد.
**Not verified:** اسکن واقعی سایت/کانال (شبکه‌ی محیط توسعه دسترسی ندارد).
**Status:** T-007 DONE (SPEC-007 DRAFT، نیازمند تأیید). T-004: R2/R4/R5/R6 انجام شد؛ R7 (اعلان تلگرام) باز. T-003 R5 (auth API) و T-005 (SQLite/نرخ برد) همچنان باز.
## 2026-10-12 · session-005 · arena/bb8cb4b4-konklancer
**Did:** دامنه از «فقط کدنویسی/ربات» به «هر چیزی که AI می‌تواند تولید کند» باز شد و اسکنر واقعی شد:
shared/taxonomy.json (۱۲ دسته + سایر، کلیدواژه‌ی قوی با وزن ۸) و آینه‌های آن shared/taxonomy.ts و scanner/taxonomy.py؛
scanner/autoparse.py (کشف خودکار ساختار: هم‌امضا + هم‌فرند، :nth-of-type برای تفکیک ستون، نرمال‌سازی ارقام فارسی)؛
دستورهای تازه‌ی probe / autodetect / autoscan و --categories و --html در konklancer_scan.py؛
نامزد انتخابگر از کد عمومی reARBitRA/all-them-bots در platforms.json (تأییدنشده)؛
scannerBridge (categorize با تاکسونومی، امتیاز خنثی + تناسب دسته، matchesFilters با دسته‌ی صریح، scan --auto در args)؛
server.ts (/api/jobs با categoryFilter، status با categories، categorizeJobServer با prompt تاکسونومی)؛
UI (پیل‌های دسته از تاکسونومی، چیپ دسته روی کارت، geminiCategorizer با کلیدهای مشترک)؛
docs و .env.example و SPEC-007 (R16–R23، AC-8..AC-12).
**Verified:** pytest 33/33 (۱۴ تازه: autoparse + taxonomy)؛ npm test 24/24 (۵ تازه)؛ tsc و vite build سالم؛
E2E آفلاین با دو صفحه‌ی آزمایشی (کارت‌های RTL و جدول با کلاس‌های odd/even): کشف خودکار درست، بودجه/پیشنهاد/زمان درست،
صفحه‌ی JS-محور صفر مورد با پیام روشن، و فید خروجی دسته‌ی درست برای ترجمه/گرافیک/اسناد/ویدیو/صدا/تصویر/وب.
**Not verified:** هیچ سایت واقعی از این محیط قابل دسترسی نیست (TCP به پارس‌کدرز/پونیشا/کارلنسر/t.me بسته است)؛
نامزدهای انتخابگر و مقدار `aiFit` روی HTML زنده تأیید نشده‌اند؛ Playwright پیاده نشده.
**Status:** T-007 DOING→DONE (SPEC-007 هنوز DRAFT). T-003 R5 (auth API) و T-005 (SQLite) باز.

## 2026-10-12 — کالیبراسیون اسکنر با HTML واقعی + مسیر اجرای ابری
- شواهد: سه ران موفق ورک‌فلو (`38293888420`, `38294391400`, `38295997675`) + نمونه‌های واقعی در
  `scanner/tests/fixtures/live/` (کارلنسر ۲۴ کارت، پونیشا ۲۰ پروژه، ۴ کانال تلگرام، پارس‌کدرز ۲۵ ردیف).
- تغییرات: انتخابگرهای تأییدشده‌ی کارلنسر/پونیشا در `platforms.json`؛ گارد ناوبری + الگوی مسیر
  پروژه؛ دستور `prune` (۴۷ ردیف زباله از فید واقعی حذف شد: ۱۵۵ → ۱۰۸)؛ جریمه‌ی دقت در `autoparse`؛
  عنوان درست پیام‌های تلگرام؛ دو کانال پرسیگنال فعال و دو کانال بی‌ربط غیرفعال؛ مسیر پشتیبان `gh api`
  برای محیط‌هایی که fetch نود گواهی TLS را تأیید نمی‌کند.
- تست: ۵۳ تست پایتون (شامل ۱۱ تست روی فایل‌های واقعی) + ۲۴ تست TypeScript؛ `tsc` تمیز.
- محدودیت‌های باز: پارس‌کدرز/پونیشا/کارلنسر از IP ابری ناپایدار جواب می‌دهند (۴۰۴/۵۰۳/تایم‌اوت)؛
  دسته‌ی «سایر» در فید فعلی بزرگ است (۵۷ ردیف) چون متن خلاصه‌ی بعضی ردیف‌ها کوتاه است.

## 2026-10-20 · session-006 · AI Studio Migration Fix
- Did: Imported repository into AI Studio environment.
- Fixed: tsconfig.json exclude mobile/ and dist/ so `npm run lint` passes without Capacitor missing-module errors.
- Fixed: Allowed hosts in server.ts and vite.config.ts set to `allowedHosts: true` to support AI Studio preview URL headers.
- Verified: `compile_applet` passed, `lint_applet` passed, `npm test` 24/24 passed.
- Dev server running on 0.0.0.0:3000.

