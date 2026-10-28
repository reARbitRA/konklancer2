---
id: T-008
title: Temporary direct provider LLM mode
spec: SPEC-008
status: DONE
branch: arena/8bfff631-konklancer2
verification: "npm test && npm run lint && npm run test:dom"
---

## Approved scope
The owner approved SPEC-008 on 2026-10-28: pause T-006/SPEC-006 and Supabase LLM work temporarily; restore user-entered provider profiles, model selection, and direct client-to-provider calls. Provider secrets are entered on the owner's device after installation; none are embedded in source or APK.

## Implemented
- Restored the existing provider vault, `LiveModelSwitcher`, and Settings UI from the base app: multiple profiles, model selection/discovery, connection test, and opt-in failover.
- `src/services/browserLLM.ts` now calls the selected provider directly. Removed the Supabase/Vercel relay path, server-managed placeholder keys, and sandbox mock answers.
- `src/services/cloudRelay.ts` keeps only existing non-LLM scanner/cloud helpers; no AI calls are routed through it.
- Removed the feature-branch Konkred Vercel API adapters and their tests from this checkout; restored the existing server files. No Supabase deployment/configuration was changed.
- Added `server/browserLLM.test.ts` to verify provider inference, model discovery, and real error propagation using mocked fetch and a fake test key.
- Added a Settings disclosure about device/browser key storage, direct prompt delivery, and the provider's data-retention terms; added a DOM smoke assertion for its visibility.
- Updated README, personal setup, relay, feature matrix, `.env.example`, and server startup messaging to distinguish temporary direct LLM mode from the paused gateway path.

## Verified
- `npm test`: 160 passed, including the three direct-provider client tests.
- `npm run lint`: passed.
- `npm run test:dom`: 102/102 passed; this also completed the production build (local server required on port 24678).
- `git diff --check`: passed on the final staged patch, including Forge/task updates.

## Not verified / limits
- No live provider inference was run: no user key was entered into this sandbox. The user can add their own key in the app Settings on their device; do not send it in chat.
- Direct browser calls depend on each provider's CORS and network policy. The UI reports failures; there is no relay fallback or fabricated answer.
- SPEC-006 remains APPROVED but paused; no gateway or Supabase AI deployment was made.
- App-wide modern-brutalist redesign and micro-interactions are tracked separately in SPEC-009 (DRAFT) / T-009 and have not been implemented pending revised approval.
