# TRACE
## Traceability Matrix
- SPEC-003 R1 → GitHubDispatcher.tsx (isPrivate default true)
- SPEC-003 R2 → App.tsx settings/sessionStorage
- SPEC-003 R3 → server/contentFilter.ts, server.ts analyze-job / generate-proposal / generate-solution
- SPEC-003 R4 → server.ts DEFAULT_JOBS, src/data/mockJobs.ts
- SPEC-003 R6 → App.tsx autoStart={false}
- SPEC-004 R1 → server.ts DEMO_FEED
- SPEC-003 R5, R7 → not yet (T-003 / Q1)
- SPEC-006 → server/llm.ts (callLLM, isMockModel, readLLMConfig), server/llm.test.ts (7 tests), server.ts (4 call sites, sendLLMError), .env.example
- SPEC-006 R4 (mock guard) → server/llm.ts isMockModel + test "mock simulator answer is rejected"
- SPEC-006 R7 (cache) → server/llm.ts cacheKey + test "cacheKey"
- SPEC-006 R5 (retry) → server/llm.ts loop + test "429 is retried"
- SPEC-004 R2/R4/R5 → server/scannerBridge.ts (readProjects, buildFeed, scoreProject)، server.ts (/api/jobs, trigger-scan, interval)
- SPEC-004 R3 → scanner/platforms.json (scan_enabled + scan_selectors)، readScanTargets
- SPEC-004 R6 (tiered taskType) → server.ts categorizeJobServer ({taskType:'extraction'}) و callLLM با taskType
- SPEC-007 R1–R3 → readScanConfig، readScanTargets، runScanner (قفل) + .env.example
- SPEC-007 R4 → server.ts (setInterval بر پایه KONKLANCER_SCAN_INTERVAL_MIN، پیش‌فرض خاموش)
- SPEC-007 R5 → scanner/konklancer_scan.py (cmd_parse_file --out، cmd_parse_telegram_file) + docs/PERSONAL-SETUP.md بخش ۴-الف
- SPEC-007 R7/R8 → cmd_toggle، RobotsCache.block_reason + پیام‌های تفکیک‌شده در fetch_html
- SPEC-007 R9–R13 → server.ts (/api/jobs source، /api/bridge/status)، src/components/FeedStatusBar.tsx، App.tsx (refreshFeed, mergeFeedJobs, scan:done)
- SPEC-007 R12 → src/types.ts (url/score/scoreReasons/source/scrapedAt) + JobHunter.tsx (لینک صفحه‌ی پروژه و چیپ امتیاز)
- SPEC-007 R14/R15 → server/scannerBridge.ts scoreProject + KONKLANCER_SCAN_MIN_SCORE
- SPEC-004 R7 (اعلان تلگرام) → هنوز پیاده نشده

## 2026-10-12 · T-007 (session-005) · طیف دسته‌ها + اسکنر واقعی
- منبع: درخواست صریح کاربر (فارسی): «پروژه‌ها فقط کد نویسی و ربات سازی نباید محدود باشه… ترجمه، طراحی، پوستر، بروشور، گرافیک… باید اسکن کنه» و «اسکنر رو دقیق و واقعی و نه ماک‌آپ تنظیم کن».
- تصمیم‌ها: (۱) دسته فقط متادیتا/فیلتر صریح است، نه گیت؛ (۲) کشف ساختار از خود DOM، نه هاردکد؛ (۳) مسیر HTML مرورگر به‌عنوان تضمین‌گاه همیشه در دسترس؛ (۴) ادعای تأییدنشده بودن نامزدها در کد و مستندات.
- شواهد: pytest 33/33، npm test 24/24، tsc/build سالم، E2E آفلاین با فیکسچرهای کارت/جدول/SPA.
- محدودیت صریح: صفر تماس موفق با سایت واقعی در این محیط؛ تأیید زنده = وظیفه‌ی کاربر روی ماشین خودش.

## 2026-10-28 · T-006 continuation · session-007
- SPEC-006 R1–R3 → `server/llm.ts` (only Konkred `/v1/chat/completions`; taskType/user contract; no provider/model in client), `server/gatewayApi.ts`, `api/llm/relay.ts`, browser callers.
- SPEC-006 R4/R5/R7 → mock rejection, retry/error mapping, local cache in `server/llm.ts`; `server/llm.test.ts`.
- SPEC-006 app boundary → `src/services/cloudRelay.ts`, Settings UI, app relay token in `src/utils/apiFetch.ts`; `server/gatewayApi.test.ts`, `server/cloudRelayClient.test.ts`, `server/vercelRelayRoute.test.ts`.
- Provider selection removal → `LiveModelSwitcher.tsx`, `SettingsModal.tsx`, legacy vault cleanup in `customLLMClient.ts`, `server/relayProxy.ts` removal.
- Supabase page relay only → `supabase/functions/konklancer-relay/index.ts`; deployment remains pending.
- Verification → `npm test` 166/166, lint, DOM 101/101, diff check. Live gateway credential and production endpoint remain unverified pending secure `KONKRED_API_KEY` configuration.
- Readiness mismatch fix → `server/gatewayHealthApi.ts`, `api/llm/relay-health.ts`, `server.ts`, `src/services/cloudRelay.ts`, App/header/status components; health probe authenticates the device token and caller key and checks model capacity without inference. Tests: `server/gatewayHealthApi.test.ts`, `server/vercelRelayHealthRoute.test.ts`, `server/cloudRelayClient.test.ts`.
- Release safety after feature-branch build → `.github/workflows/android-apk.yml` gates stable APK publication to `main` and updates release notes to gateway-only requirements; verified follow-up branch run succeeded with publish step skipped. Traced to SPEC-003 safety intent and SPEC-006 gateway-only rollout.
- 2026-10-28 owner scope change → proposed `SPEC-008` DRAFT and `T-008` OPEN for temporary user-entered direct provider access (multi-profile/model selection); implementation is explicitly pending approval. `T-006` / approved SPEC-006 paused without editing its approved text. Supabase work/deployment paused.
- 2026-10-28 UI/credential clarification → SPEC-008 v0.2.0 records the per-device-key alternative (no APK-bundled secrets); SPEC-009 drafts app-wide modern-brutalist styling, micro-interactions, and reduced-motion/accessibility requirements. Both await approval; T-008/T-009 OPEN, no implementation yet.

## 2026-10-28 · SPEC-008 / T-008 · temporary direct-provider path
- SPEC-008 R1/R2 and AC-1/AC-2 → restored `src/components/LiveModelSwitcher.tsx`, `src/components/SettingsModal.tsx`, and `src/utils/customLLMClient.ts`: multiple per-device profiles, active profile/model selection, model discovery, manual model entry, connection testing, and configurable failover.
- SPEC-008 R3/R6 and AC-3 → `src/services/browserLLM.ts` direct provider fetches; AI workflows in `AIEvaluatorModal.tsx`, `ProposalStudioModal.tsx`, `geminiCategorizer.ts`, `deliveryEngine.ts`, and `arbiterEngine.ts`. No LLM relay call to Konkred or Supabase from the app path.
- SPEC-008 R4 and AC-4 → direct provider errors propagate without mock answers; `server/browserLLM.test.ts` verifies inference/model discovery/failure with mocked fetch.
- SPEC-008 security notice / AC-7 → `SettingsModal.tsx` disclosure of browser/WebView storage risk and provider data policies; `scripts/dom-smoke.mjs` asserts that the notice is visible.
- SPEC-008 R7/R8 and AC-5/AC-6 → existing vault profiles/settings preserved; no build-time or APK provider key introduced. Personal setup and `.env.example` document post-install device entry.
- Verification → 160 Node tests, lint, production build, DOM smoke 102/102; no live provider key or inference used. SPEC-006/T-006 remain paused; SPEC-009/T-009 remain draft/open and unimplemented.

## 2026-11-04 · SPEC-013 / T-013 · personal AI gateway
- SPEC-013 §2 (one gateway path / Iran strategy) → `shared/aiGateway.mjs`, `api/ai.js`, compatibility `api/models.js`, Express `/api/ai` and `/api/models` mounts in `server.ts`, `vercel.json` (`fra1`, 60s).
- SPEC-013 §3 + AC-1/AC-2 (health, discovery/classification, Auto/explicit routing, key rotation, failover, image chain, owner token, bounds/no SSRF) → `shared/aiGateway.mjs` (`gatewayHealth`, `listAllModels`, `classifyModel`, `generateText`, `generateImage`, `checkOwner`, `createRateLimiter`, `handleAiHttp`); declarations in `shared/aiGateway.d.mts`; mocked contracts in `server/aiGateway.test.ts`, `server/managedModels.test.ts` and `server/managedClient.test.ts`.
- SPEC-013 §4 (classified providers/free focus) → fixed provider registry and curated fallback catalogues in `shared/aiGateway.mjs`; provider/env map in `docs/AI-GATEWAY-FA.md`, `docs/03-api-provider-map.md`, README and `.env.example`. Secrets remain server env vars only.
- SPEC-013 §5 (prompt library) → `shared/prompts.ts` builders for triage, analysis/pricing, proposal, clarification, delivery plan/spec/artifacts/refinement, slides, website, translation, story/brand/image prompts, QA, handover, follow-up and revisions; contract tests in `server/prompts.test.ts`.
- SPEC-013 §6 + AC-3/AC-4 (gateway-first client and Settings) → `src/services/managedLLM.ts` (`/api/ai` client, Auto/selected model, owner token, remote gateway base, health/models/test/image), `src/services/browserLLM.ts` (`callBrowserLLM`, `callPromptPack`, strict analysis, proposal, safe categorization), `src/rebuild/ManagedModelSettings.tsx`, and prompt-pack wiring in `src/rebuild/App.tsx`, `src/services/deliveryEngine.ts` and `src/services/arbiterEngine.ts`. New delivery modes are declared in `src/types.ts` and implemented across `BLUEPRINT_MODES`, detection and instructions in `deliveryEngine.ts`.
- SPEC-013 AC-5 (automated verification) → `npm run lint` pass; `npm test` 201/201; rewritten `scripts/dom-smoke.mjs` tests the current rebuilt UI (`.table-row`, `.detail-main`, `.pipeline-row`, `.editor-shell`, `.metrics`, Settings gateway) and passed 31/31 including production build. The old jsdom bundle parse workaround is harness-only; shipped bundle unchanged.
- Deployment evidence → feature commit `420b0b8`, Vercel deployment `dpl_53RvDtUocaZ9F2R4X273LzTYNnt2` READY, GitHub Vercel status success, functions metadata `api/ai.js`/`api/models.js` in `fra1`, expected provider env names present. Draft PR #12 tracks the branch.
- SPEC-013 AC-1/AC-2 live endpoint proof → **pending**: unauthenticated sandbox requests to the preview are redirected by Vercel Deployment Protection to SSO. Owner-authenticated Settings connection test plus one real analysis/proposal are required before T-013 can move to DONE.
- SPEC-013 AC-6 (secret hygiene) → health/tests/docs expose env names, provider labels, configured flags, tiers and key counts only. Drive plaintext-key deletion/rotation remains an owner-only operation recorded in `docs/AI-GATEWAY-FA.md` and T-013; no key value was copied into the branch.
