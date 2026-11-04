# STATE — as of 2026-11-04

## Current owner direction
- Konklancer is a **single-owner personal app**. SPEC-013 is the active AI architecture: one server-side personal gateway for finding freelance projects, analysing/pricing them, writing proposals and generating deliverables.
- SPEC-013 supersedes SPEC-008 direct browser→provider calls as the primary path and the Supabase-login/allowlist/quota access model from the earlier managed-model work. Those spec files remain as history. SPEC-006/Konkred remains paused and unchanged.
- Provider keys must live only in server-side environment variables (Vercel Shared Env for web, local `.env` for a self-hosted server). Never copy values from Drive into source, docs, tests, logs, browser bundles or APKs.

## Active task and branch
- Fixed branch: `arena/5dfaf182-konklancer2` (active). Never push to `main` or rename/switch this session branch.
- Draft PR: https://github.com/reARbitRA/konklancer2/pull/12
- Commits before handoff:
  - `c327485` — `spec(ai): approve personal AI gateway [T-013] [SPEC-013]`
  - `420b0b8` — `feat(ai): add personal free-first gateway [T-013] [SPEC-013]`
  - The Forge handoff commit follows these and is intended to be the last commit of this session.
- `T-013` is in `tasks/DOING/`, not DONE: implementation and automated verification are complete, but the owner-authenticated live Vercel smoke test is still pending.
- `T-006` remains OPEN/paused. `T-009`/SPEC-009 remain untouched by this work.

## Implemented SPEC-013 boundary
- One dependency-free gateway core, `shared/aiGateway.mjs`, is used by:
  - `api/ai.js` — primary Vercel Function.
  - `api/models.js` — backwards-compatible legacy shim.
  - Express mounts in `server.ts` for local/self-hosted parity.
- `vercel.json` pins both gateway functions to `fra1` with a 60-second limit. Browser/APK traffic goes to the app origin (or an explicitly configured deployed gateway base), so production provider calls originate from Vercel rather than the owner's Iranian browser IP.
- Provider registry: OpenRouter, Groq, Cerebras, native Gemini, Agnes, Mistral, Hugging Face, optional GitHub Models/NVIDIA, DeepSeek, Fireworks, ApMix, and keyless Pollinations as last resort. The live Vercel deployment metadata confirms the expected shared-env names for the owner's nine configured provider groups; Fireworks is code-supported but was not present in Vercel during the audit.
- `/api/ai` provides health, live model discovery/classification, task-aware text generation and image generation. Auto routing prefers evidenced free models, interleaves providers, rotates keys on auth/rate-limit failures, fails over on transient/empty responses, strips `<think>` blocks, excludes non-chat models from chat routing, and returns sanitized attempts. It never fabricates AI output.
- Access remains low-friction: with `KONKLANCER_OWNER_TOKEN` (or an accepted alias) configured, that token is required; without it, open-personal mode keeps automatic routing free-only and applies per-IP rate limiting. Open-personal mode should stay behind Vercel Deployment Protection or gain an owner token before any public exposure.
- `shared/prompts.ts` is the versioned Persian-first prompt library for triage, evidence-grounded analysis/pricing, anti-cliché proposals, clarification, three-stage delivery, slides/website/story modes, translation, image prompts, QA, handover, follow-up and revisions.
- Browser flows are gateway-first through `src/services/browserLLM.ts` and `src/services/managedLLM.ts`; stored device keys are only an explicit/offline fallback. Strict analysis throws on malformed JSON rather than inventing a score, categorization safely falls back to tags/`other`, and the arbiter cannot certify from its capped fallback score.
- Rebuilt Settings shows provider health, Auto free routing, grouped free/unknown/paid models, a real connection test with sanitized attempts/latency, and an optional gateway-base URL for APK/static builds. Supabase login no longer gates AI.

## Verification completed
- `npm run lint` — passed.
- `npm test` — 201/201 passed.
- `npm run test:dom` — production build passed and the rewritten current-rebuild DOM smoke passed 31/31. It covers overview/opportunity search/detail, pipeline, Studio file switching/creation, outcome persistence, Settings/AI gateway health and legacy redirects, with no runtime console errors. The obsolete `.job-brutal` selectors were removed from the smoke test.
- Local Express `/api/ai?action=health` returned valid JSON containing provider metadata only. In the sandbox, GitHub Models appears configured only because the sandbox itself exposes `GITHUB_TOKEN`; that is not evidence about Vercel.
- Feature-commit Vercel preview deployment `dpl_53RvDtUocaZ9F2R4X273LzTYNnt2` is READY. Its build completed, GitHub's Vercel commit status is success, the `build-apk` check succeeded, and Supabase Preview was skipped. Deployment metadata confirms `api/ai.js` and `api/models.js` at `fra1` and the expected provider env names.
- The production bundle still warns that the main JavaScript chunk is about 1.79 MB minified / 417 kB gzip. This is a performance follow-up, not a blocker for T-013.

## Live verification still pending
The sandbox cannot call the deployed preview's `/api/ai` health/models/generate endpoints: Vercel Deployment Protection redirects unauthenticated requests to Vercel SSO. Therefore **live provider generation has not been proven yet**. Next, while signed in to Vercel as the owner:
1. Open PR #12's latest Vercel preview.
2. Go to Settings → «هوش مصنوعی شخصی» and confirm provider chips/model list load.
3. Click «تست اتصال AI». Success must name a real provider/model and latency; failure must be diagnosed from the sanitized `attempts` using `docs/AI-GATEWAY-FA.md`.
4. Run one real project analysis or proposal.
Only after that succeeds should T-013 be moved to `tasks/DONE/` and its status closed.

## Owner-only security/operations next steps
1. Delete the plaintext `API-KONK.md` from Google Drive.
2. Rotate every provider key listed there in its provider console.
3. Paste replacements only over the same names in server-side Vercel Shared Env, then redeploy if Vercel requires a new deployment for the changed values.
4. Optional: add `FIREWORKS_API_KEY` if Fireworks should be active.
5. Recommended: add `KONKLANCER_OWNER_TOKEN` in Vercel and enter the same value once in the app's existing API-token settings.

Do not use or disclose the old Drive values. No secret value was added to this branch.
