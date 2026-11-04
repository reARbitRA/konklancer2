---
id: T-013
title: Personal single-owner AI gateway + prompt library (SPEC-013)
spec: SPEC-013
status: DOING — implementation and automated verification complete; owner-authenticated Vercel live smoke pending
branch: arena/5dfaf182-konklancer2
pr: https://github.com/reARbitRA/konklancer2/pull/12 (draft)
verification: "npm run lint && npm test && npm run test:dom"
---

## Scope
- `shared/aiGateway.mjs` core (providers, discovery+classification, task routing, failover/rotation,
  image chain, owner-token auth, rate limit, HTTP handler) + types.
- `api/ai.js` (Vercel, fra1), `api/models.js` compat shim, Express `/api/ai` mount, `vercel.json`.
- `shared/prompts.ts` full pipeline prompt library; rewire analysis/proposal/categorize/delivery/arbiter.
- Client: gateway-first `callBrowserLLM`, Auto(Free) model selection, gateway health/test in Settings.
- New delivery modes: slides, website/landing, story/brand/image.
- Docs (FA guide, README, provider map), tests, forge handoff.

## Verification completed (2026-11-04)
- `npm run lint` passed.
- `npm test` passed: 201/201.
- `npm run test:dom` passed: production build + 31/31 current-rebuild DOM checks.
- Local Express `/api/ai?action=health` returned valid JSON and no key material.
- Vercel preview deployment `dpl_53RvDtUocaZ9F2R4X273LzTYNnt2` for commit `420b0b8` is READY; its build completed and both `api/ai.js` and `api/models.js` were configured for `fra1`.
- The sandbox could not call the deployed `/api/ai` health/model/generation endpoints because Vercel Deployment Protection redirects unauthenticated requests to Vercel SSO. Do not mark this task DONE until an owner-authenticated preview smoke test succeeds.

## Owner manual steps remaining (documented, not code)
1. Delete Drive `API-KONK.md` (plaintext secrets) and rotate the keys in each provider console,
   then paste the new values over the same Vercel shared env var names.
2. (Optional) Add `FIREWORKS_API_KEY` to Vercel shared env if Fireworks should be active.
3. (Optional, recommended) Set `KONKLANCER_OWNER_TOKEN` in Vercel project env and paste the same
   value once in the app Settings.
