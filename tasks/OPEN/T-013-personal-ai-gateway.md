---
id: T-013
title: Personal single-owner AI gateway + prompt library (SPEC-013)
spec: SPEC-013
status: OPEN
branch: arena/5dfaf182-konklancer2
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

## Owner manual steps remaining (documented, not code)
1. Delete Drive `API-KONK.md` (plaintext secrets) and rotate the keys in each provider console,
   then paste the new values over the same Vercel shared env var names.
2. (Optional) Add `FIREWORKS_API_KEY` to Vercel shared env if Fireworks should be active.
3. (Optional, recommended) Set `KONKLANCER_OWNER_TOKEN` in Vercel project env and paste the same
   value once in the app Settings.
