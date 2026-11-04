---
id: SPEC-013
title: Personal single-owner AI gateway (server-side, free-first routing, prompt library)
type: spec
status: APPROVED
version: 1.0.0
tags: [llm, gateway, personal, prompts, vercel]
supersedes: "SPEC-008 (temporary direct browser calls) and the access model of SPEC-011/SPEC-012 (Supabase-login managed models) for day-to-day use; those spec files remain unchanged as history. SPEC-006 remains paused."
depends_on: [SPEC-003, SPEC-004, SPEC-005]
---

# SPEC-013 — Personal AI gateway, finished once and for all

## Approval record
Approved explicitly by the owner on 2026-11-04 in chat:
- The app is for the owner only — nobody else.
- Purpose: find freelance projects, then use AI provider APIs to analyze them, write proposals,
  and produce deliverables (code / text / articles / docs / stories / images / websites / slides / …).
- Implement the most current, efficient AI plumbing, specifically for connecting from Iran to
  providers that mostly block Iranian IPs.
- Design the best, cutting-edge prompts for every AI stage, from analysis to final delivery.
- Integrate the providers the owner placed in Google Drive and Vercel shared env vars in the most
  usable, hassle-free way, classified, with focus on FREE models.

Verified 2026-11-04 (names only, no values read into this repo):
- Vercel shared env vars linked to project `konklancer2` (preview+production):
  `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`,
  `HUGGINGFACE_API_KEY`, `AGNES_API_KEY`, `APMIX_API_KEY`, `GEMINI_KEY_P1`, `GEMINI_KEY_P2`, `GEMINI_KEY_P3`.
- Drive file `API-KONK.md` additionally lists a Fireworks key name. It is NOT in Vercel.
  That file stores secrets in plaintext: the owner must delete it and rotate those keys.
  Code supports `FIREWORKS_API_KEY`/`FIREWORK_API_KEY` the moment the owner adds it to Vercel.

## 1. Problem being ended
Three parallel, conflicting AI paths existed (direct browser→provider from the user's Iranian IP;
Vercel `/api/models` gated by Supabase login + allowlist + quota RPC + branch-specific preview
flags; Konkred gateway client). Result: endless "API not configured / sign in / quota" warnings,
region blocks, and dead ends. This spec replaces them with ONE path.

## 2. Architecture (the one path)
- **One gateway core** `shared/aiGateway.mjs` (zero dependencies, plain ESM) used by:
  - `api/ai.js` — Vercel Function (primary; region pinned outside Iran, `fra1`).
  - `api/models.js` — thin backwards-compatible shim over the same core (old response shapes).
  - Express `server.ts` — `ALL /api/ai` for local/self-hosted use with the same semantics.
- **Iran strategy:** the browser only ever talks to the app's own origin (`/api/ai`). All provider
  calls originate from the Vercel function (non-Iranian IP), so provider geo-blocks and CORS no
  longer apply to the owner. Locally, providers are called from the owner's machine (docs explain
  proxy/VPN env notes); production path is Vercel.
- Provider keys exist ONLY as server env vars. They are never sent to the browser, never logged,
  never included in errors, never committed. Upstream error bodies are never echoed.

## 3. Gateway behavior
- `GET /api/ai?action=health` → per-provider `{ configured, keyCount, tier }` (names/booleans only).
- `GET /api/ai?action=models` → live discovery across all configured providers (parallel, cached
  10 min in memory), each model classified: `priceCategory` (free/unknown/paid), capabilities
  (chat/code/reasoning/vision/fast/long-context), context length when known. If discovery fails for
  a configured provider, a curated fallback list is returned with `source:"curated"` so the UI is
  never empty. Keyless last-resort provider (Pollinations) is always listed.
- `POST /api/ai` `{task?, prompt, system?, provider?, model?, json?, maxTokens?, temperature?}`:
  - **Auto mode (default, zero configuration):** task-based routing. Tasks:
    `triage, analysis, proposal, code, writing, translation, slides, image-prompt, qa, reasoning, general`.
    Candidates are scored FREE first, then task-fit, then size; interleaved across providers so one
    dead provider never eats the whole attempt budget.
  - **Explicit mode:** a user-picked `provider+model` is tried first (with key rotation), then the
    auto chain takes over on failure unless `strict:true`.
  - **Failover/rotation:** per-provider key rotation on 401/403/429 (incl. Gemini P1→P2→P3 and
    `*_API_KEYS` comma lists / `*_2` numbered keys); one retry on 5xx/timeout with backoff;
    hard attempt + wall-clock budgets. Response includes `provider`, `model`, `attempts[]`
    (sanitized), `latencyMs`. Mock/fabricated text is never returned as AI output.
  - Non-chat models (embedding/ASR/TTS/image-only/rerank/moderation) are excluded from chat routing.
  - `<think>` blocks are stripped; empty upstream content counts as a failed attempt.
- `POST /api/ai` `{action:"image", prompt, size?}` → image chain: Agnes image → Gemini image →
  keyless Pollinations (fetched server-side, returned as data URL with size cap).
- **Access (single owner, hassle-free):** if `KONKLANCER_OWNER_TOKEN`
  (or `AI_GATEWAY_TOKEN` / `KONKLANCER_API_TOKEN`, ≥8 chars) is set, requests require header
  `x-owner-token` (or Bearer), compared in constant time; the owner pastes it once in Settings and
  it is kept in browser storage. If no token is configured, the gateway runs in "open personal
  mode": auto-routing is restricted to FREE candidates (explicit picks still allowed) and a
  per-IP rate limit applies (authenticated owner requests are exempt). Open mode is intended to sit
  behind Vercel Deployment Protection; the docs say so in one place, not as repeated UI warnings.
- Bounds: prompt ≤ 60k chars, system ≤ 12k, `maxTokens` clamped 1..8192, JSON bodies only,
  no arbitrary URL forwarding (fixed provider allowlist — no SSRF).

## 4. Providers (classified; free focus)
| Provider | Tier | Notes |
|---|---|---|
| OpenRouter | free pool (`:free` + zero-price) | primary free pool, `openrouter/free` router |
| Groq | free tier | very fast Llama/Qwen/GPT-OSS |
| Cerebras | free tier | very fast, good code models |
| Google Gemini (×3 keys) | free tier | Flash/Gemma, long context, vision, image |
| Agnes | free (publisher-stated) | text+vision, image, video models; OpenAI-compatible |
| Mistral | free Experiment tier | incl. Codestral for code |
| Hugging Face Router | free monthly credits | OpenAI-compatible router |
| GitHub Models (optional `GITHUB_TOKEN`) | free rate-limited | only if env present |
| NVIDIA NIM (optional `NVIDIA_API_KEY`) | free credits | only if env present |
| Pollinations | keyless free | last resort only; quality varies |
| DeepSeek | paid-cheap | strong code/reasoning; used late in chain |
| Fireworks | paid-cheap | env not yet in Vercel; supported in code |
| ApMix | subscription gateway | plan-scoped catalog via discovery |

Adding a future OpenAI-compatible provider = one registry line in `shared/aiGateway.mjs`.

## 5. Prompt library (`shared/prompts.ts`)
Versioned, Persian-first, structured prompts for every stage, each returning
`{system, user, task, json, temperature, maxTokens}` where applicable:
triage/classification, deep analysis & go/no-go & pricing (strict JSON contract, evidence-grounded,
no invented numbers), proposal (platform-aware, anti-cliché, 3 tones, hook + clarifying question),
client clarification questions, delivery plan/spec, per-category deliverable generation
(code multi-file protocol, article/SEO, translation + glossary + QA, slides slide-by-slide, docs/SRS,
story, data/Excel, website, image prompts/brand kit), self-review/QA (critic), handover message,
follow-up, revision reply. All app AI flows are rewired to these builders through
`callBrowserLLM({task,...})`.

## 6. Client behavior
- `callBrowserLLM` order: explicit test profile (Settings "test this device key") → **gateway
  `/api/ai`** (selected model or Auto) → device-stored direct keys (kept only as offline/APK
  fallback) → one clear Persian error. No login is required for AI. No repeated warnings.
- Settings shows gateway health per provider, an **Auto (Free)** default selection, grouped model
  picker (Free first), optional owner-token field, and a one-click connection test.
- Personal mode: guest use stays available; auth features are untouched but no longer gate AI.

## 7. Acceptance criteria
- AC-1: With only the existing Vercel shared env vars, `GET /api/ai?action=health` reports the 9
  provider groups configured (Agnes/ApMix included) and leaks no secret material.
- AC-2: `POST /api/ai` with `{task:"analysis", prompt}` and no model selected returns real text
  from a free candidate; mocked-fetch tests prove free-first ordering, 429 key rotation,
  cross-provider failover, Gemini native payload, and sanitized errors.
- AC-3: Every existing AI UI flow (analysis, proposal, categorization, delivery 3-stage, arbiter,
  studio) works through the gateway with zero keys entered and no Supabase login.
- AC-4: When the gateway function is absent (static/APK), flows fall back to previously stored
  device keys if any; otherwise one actionable error, no fabricated output.
- AC-5: `npm run lint`, `npm test`, `npm run test:dom` (build) pass. Live provider calls are
  verified separately on the Vercel preview deployment when reachable; anything not live-verified
  is recorded honestly in docs/forge handoff.
- AC-6: No secret value appears in the repository, client bundle, tests, or docs.

## 8. Non-goals
- Multi-user accounts, billing, or public SaaS. Auto-submitting bids/deliveries to platforms.
- Copying secrets out of Drive. Deleting SPEC-006/008/011/012 files (history stays).
