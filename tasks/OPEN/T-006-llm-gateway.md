---
id: T-006
title: LLM access through Konkred gateway (SPEC-006)
spec: SPEC-006
status: DONE
branch: arena/bea82c77-konklancer
verification: "npm test && npx tsc --noEmit && npx vite build"
---
## Done
- server/llm.ts: callLLM via gateway /v1/chat/completions; mock guard (AI_UNAVAILABLE); 429 retry with Retry-After; 5xx/network one retry; 401 → AI_AUTH; disk cache by cacheKey (data/cache/llm, gitignored).
- server.ts: Gemini SDK and cooldown removed; the 3 fabricated fallbacks (analyze, proposal, solution) replaced by 503 errors with aiAvailable:false; categorize falls back to keyword rules.
- package.json: @google/genai removed; `npm test` runs server/*.test.ts (7 tests).
- Verified E2E against the konkred gateway (local, no provider keys): analyze and proposal → AI_UNAVAILABLE (mock rejected); categorize → keyword fallback; unconfigured → 503 AI_NOT_CONFIGURED.
## Not verified
- A live provider answer (no real keys in sandbox). Covered by the fake-gateway unit test only.
## Open
- SPEC-006 R8 (pre-filter before AI) belongs to SPEC-004 R5 (not done).
- PII redaction (recommended under D2) not approved.
- geminiCategorizer.ts file name is historical; it calls /api/categorize-job only.
