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


## 2026-10-28 · session-007 · arena/8bfff631-konklancer2
**Did:** Resumed T-006 on the fixed Arena branch. Replaced provider-relay LLM paths with the approved Konkred gateway contract; added token-gated Vercel/local adapters; removed active provider-key/model UI and legacy browser key use; constrained Supabase Edge relay source to page fetching; updated docs and tests. Configured the local git-ignored `.env` with the app relay token and restarted the preview on port 24678.
**Verified:** `npm test` 166/166; `npm run lint`; `npm run test:dom` 101/101 (production build included; existing bundle/dynamic-import warnings); `git diff --check`; preview root and `/api/health` return HTTP 200; relay adapter rejects missing device token as expected.
**Not verified:** no live Konkred request. Local `KONKRED_API_KEY` absent. Vercel environment listing truncated, so presence of a caller key is unknown; no secret values were decrypted. New Vercel route and Supabase page-only function have not been deployed.
**Status:** T-006 remains DOING. Needs authorized gateway caller credential in Vercel, user-side relay token entry, and deployment/production smoke test.

### session-007 continuation · readiness mismatch
- Found and fixed an additional Vercel gap: only the inference relay function existed; `/api/llm/relay-health` had only been registered in local Express. Added a Vercel health function, CORS/method/token checks, and a no-inference `/api/models` caller-auth/capacity probe. Browser UI now reports readiness instead of assuming that a saved app relay token means AI is usable.
- Vercel shared environment metadata contained no shared `KONKRED_API_KEY`; the Konklancer project-specific listing remained truncated, so no conclusion about a project-scoped key. Gateway project has sensitive `USERS_JSON_BASE64`; it was not decrypted or modified. No gateway credential could be securely established from available metadata.
- Verification after the change: `npm test` 176/176, `npm run lint`, `npm run test:dom` 101/101, and `git diff --check` passed. Local route check with the app token returned health `configured:false`; the inference route returned 503 `AI_NOT_CONFIGURED`. Preview restarted on port 24678. No live gateway call or production deployment.

## 2026-10-28 · session-007 final handoff · arena/8bfff631-konklancer2
**Branch/PR:** Pushed gateway implementation commit `6627134` and APK-release guard `8e3aad2` to the fixed Arena branch. Draft PR #9 is open: https://github.com/reARbitRA/konklancer2/pull/9.
**Preview/checks:** Vercel branch preview `dpl_7DSB1M7YjX8hSRVi1ZH9xFYbcs1S` is READY. `npm test` 176/176, lint, DOM smoke 101/101, `git diff --check`, GitHub build-apk all pass; Supabase Preview was skipped. APK build warnings are as listed in STATE.
**Live AI:** Exact production and preview Vercel deployment environment-name lists include `KONKLANCER_RELAY_TOKEN` but not `KONKRED_API_KEY`. Local health returns `configured:false`; inference returns 503 `AI_NOT_CONFIGURED`. Gateway `USERS_JSON_BASE64` was not decrypted or changed. No live gateway response or Vercel production deployment.
**APK side effect:** The first feature-branch push triggered the existing Android workflow, which replaced the `android-latest` asset and moved `apk-latest` to a gateway-only build before its production route/key existed. Release notes were updated to disclose this. Added a main-only publish guard; the next branch run passed and skipped release publishing. The asset remains published.
**Next:** T-006 remains DOING. Provision one dedicated gateway caller in `USERS_JSON` and configure it as sensitive `KONKRED_API_KEY` in Konklancer Vercel (never paste the value in chat). Then redeploy via approved PR flow and run a real gateway readiness/inference smoke test. The user must enter the separate app relay token in Settings on their own device.

## 2026-10-28 · session-008 · owner scope change
**Request:** Pause SPEC-006 and all further Supabase work; temporarily restore in-app provider keys/model choice and direct provider calls until the gateway is ready.
**Action:** Did not implement conflicting application behavior before specification approval. Left approved SPEC-006 unchanged, moved T-006 to OPEN/paused, drafted `specs/SPEC-008-temporary-direct-llm.md` as DRAFT, added it to the index, and created OPEN task T-008. Draft assumes user-entered per-device keys; no shared credentials may be committed or bundled.
**Boundary:** No provider secrets read, copied, or added. No Supabase deployment or Vercel deployment for this request. Earlier gateway-only branch work remains; it was not reverted in this response.
**Next:** Owner approval/revision of SPEC-008 is required before direct-provider code changes. Confirm that keys are user-entered in app Settings, not shared keys embedded in the APK.

### session-008 clarification · APK credentials and UI direction
- Owner clarified they want all provider keys inside a personal APK and requested app-wide micro-interactions plus a contemporary 2027 brutalist style, explicitly not MS-DOS/terminal styling.
- Updated SPEC-008 to v0.2.0 and added SPEC-009 as DRAFT. The repository contract forbids committing/bundling secrets; a personal APK is still extractable. Draft therefore offers user-entered per-device keys after install as the safe alternative. No key was requested or embedded.
- Added OPEN T-009. Both SPEC-008 and SPEC-009 remain DRAFT; no application implementation or deployment until approval.

## 2026-10-28 · session-009 · T-008 direct-provider implementation
**Scope:** Implemented approved SPEC-008 after the owner chose per-device key entry. SPEC-006/T-006 remain paused and unchanged at the spec level; SPEC-009/T-009 stay DRAFT/OPEN without UI redesign work.
**Implemented:** Restored the device key vault and live model controls; `src/services/browserLLM.ts` now sends AI inference/model discovery/connection checks directly to the selected provider, with no Konkred/Supabase LLM fallback or fabricated result. Added `SettingsModal` security/data-retention disclosure and a DOM assertion. Kept existing scanner/cloud-feed helpers separate. Updated README, personal setup, relay, feature matrix, `.env.example`, and server startup notice. Added mocked-fetch tests in `server/browserLLM.test.ts`.
**Verified:** `npm test` 160 passed; `npm run lint` passed; `npm run test:dom` 102/102 passed and included a successful production build. Existing build warnings: large JS chunk and ineffective dynamic import. The first DOM rerun had `ReferenceError: document is not defined`; the assertion was corrected to `window.document`, and the final run passed.
**Not verified:** No live provider request (no user key used); direct provider access still depends on CORS/network/region/quota. No Supabase/Vercel deployment or gateway inference was performed. No provider secret was added.
**Status:** T-008 DONE and committed as `1adb5ea` on the fixed Arena branch; T-006 stays OPEN/paused; T-009 stays OPEN pending UI-spec revision/approval.
