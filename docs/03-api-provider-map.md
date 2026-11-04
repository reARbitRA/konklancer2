# API and provider map

| Route/service | Consumer | Verification |
|---|---|---|
| `/api/jobs` | unified feed | authenticated local HTTP returned 1009 jobs; anonymous 401 |
| `/api/bids`, `/api/bids/:id`, `/api/stats` | outcomes | create, patch, list and stats verified against isolated in-memory SQLite |
| `/api/scheduler` | settings operations | local read and write verified in isolated memory; no scan executed |
| `/api/bridge/trigger-scan` | overview | wiring present; real external scan not performed |
| `/api/bridge/cloud`, `/sync-feed`, `/cloud-scan` | settings operations | cloud status returned disabled locally; real sync and dispatch not run |
| `GET /api/ai?action=health` | rebuilt Settings → personal AI gateway | valid JSON locally; reports provider names, configured flags, tiers and key counts only |
| `GET /api/ai?action=models` | rebuilt Settings model picker | valid JSON locally; mocked discovery/classification tests cover malformed entries and curated fallback |
| `POST /api/ai` | analysis, proposals, delivery, translation/slides, QA and image requests | mocked unit tests cover task routing, key rotation, provider failover, Gemini payloads, sanitized errors and owner-token access; the branch Vercel preview built successfully, but live generation was not executed from the sandbox because Deployment Protection requires the owner's Vercel SSO session |
| `/api/models` | legacy callers only | backwards-compatible shim over `/api/ai`; the old Supabase-login/allowlist/quota gate has been retired for this single-owner app |
| Supabase Auth | account and optional gate | client/server wiring and unit tests only; real OAuth and project configuration unverified |

The scanner and outcomes routes above are Express routes and should not be assumed to be Vercel functions. The AI gateway is intentionally different: `api/ai.js` and `api/models.js` are Vercel Functions configured for `fra1`, and Express mounts the same gateway core for local/self-hosted parity.

## SPEC-013 personal AI gateway

The browser talks only to `/api/ai` on the app origin. Provider keys stay in server-side Vercel shared environment variables (or a local server `.env`), so provider traffic originates outside the owner's browser/Iranian IP path in the Vercel deployment. Auto mode routes by task and prefers evidenced free models first; configured providers are OpenRouter, Groq, Cerebras, Gemini, Agnes, Mistral, Hugging Face, DeepSeek and ApMix, with optional GitHub Models, NVIDIA and Fireworks support and Pollinations as the keyless last resort. Device-entered keys remain only as an explicit/offline fallback.

Owner-token behaviour is deliberately low-friction: if `KONKLANCER_OWNER_TOKEN` (or an accepted alias) is configured, it is required; otherwise the gateway runs in open-personal mode with free-only automatic routing and per-IP rate limiting. Do not expose open-personal mode on a public domain without Vercel Deployment Protection or an owner token.

See `docs/AI-GATEWAY-FA.md` for the owner guide and `specs/SPEC-013-personal-ai-gateway.md` for the acceptance criteria.
