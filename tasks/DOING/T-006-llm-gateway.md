---
id: T-006
title: LLM access through Konkred gateway (SPEC-006)
spec: SPEC-006
status: DOING
branch: arena/8bfff631-konklancer2
verification: "npm test && npm run lint && npm run test:dom"
---

## Implemented on this branch
- `server/llm.ts`: gateway-only `POST /v1/chat/completions`, task routing, retries, cache, and mock-response rejection.
- `server/gatewayApi.ts`, `api/llm/relay.ts`, and `server.ts`: app-token validation and gateway inference adapters; provider-target forwarding is disabled.
- `server/gatewayHealthApi.ts` and `api/llm/relay-health.ts`: token-gated, no-inference readiness check verifies caller authentication and available gateway model capacity; browser status no longer treats the app relay token alone as AI readiness.
- Browser LLM callers and Settings UI use the app relay token only. Provider-key/model UI and active browser-side provider-key code were removed; old stored keys can be purged.
- Supabase Edge source now supports HTML page fetching only; it no longer injects provider keys.
- `.env.example`, README, relay/setup docs, feature matrix, DOM smoke test, and gateway/client tests updated.

## Verified
- `npm test`: 176 passed.
- `npm run lint`: passed.
- `npm run test:dom`: 101/101 passed; includes production build (large bundle and ineffective dynamic import warnings remain).
- `git diff --check`: passed.
- Local health route with the app relay token returns HTTP 200 and `gateway.configured=false`; the inference route returns HTTP 503 `AI_NOT_CONFIGURED`. This confirms the app token is distinct and the missing gateway caller credential is the blocker.

## Not verified / blockers
- No live Konkred gateway inference was completed. Local health with the app relay token returns `configured:false`; inference returns `503 AI_NOT_CONFIGURED`.
- Current production and feature-preview Vercel deployment environment-name lists include `KONKLANCER_RELAY_TOKEN`, not `KONKRED_API_KEY`. The shared-variable list also has no shared gateway caller key.
- The gateway project has a sensitive `USERS_JSON_BASE64` allow-list. Its value was not decrypted or changed; inspected gateway source has no caller-key self-service route.
- The production Vercel app still runs `main`; only the feature branch's preview has these routes. The Supabase page-only source has not been deployed.
- Required server-side action: provision one dedicated Konklancer caller credential in the gateway allow-list and configure that same value as sensitive `KONKRED_API_KEY` in the Konklancer Vercel project. Do not paste the secret in chat.
- Once server-side config is ready, the app relay token still needs to be entered in Settings on the user's own browser/device.

## PR / deployment
- Draft PR #9: https://github.com/reARbitRA/konklancer2/pull/9.
- Vercel preview is READY: `https://konklancer2-git-arena-8bfff631-kon-943c5b-ari-miyanjis-projects.vercel.app`.
- CI `build-apk` passed. The first feature push triggered the existing Android workflow and updated the `android-latest` asset / `apk-latest` tag; release notes were corrected to disclose that AI is not configured. A main-only publish guard was added and its follow-up feature-branch run skipped publishing. The release asset remains published.
