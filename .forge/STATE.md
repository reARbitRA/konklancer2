# STATE — as of 2026-10-28

## Milestone
M1 (Features), safety hardening, approved SPEC-006 gateway-only LLM path, and personal mode.

## Specs
- SPEC-001, SPEC-002: DRAFT (implementation exists; specification approval/alignment remains open).
- SPEC-003 Safety & Hardening: APPROVED; T-003 remains open for its outstanding requirements.
- SPEC-004 Live Job Feed: APPROVED; remaining work tracked in T-004.
- SPEC-005 Bid Outcome Tracking: APPROVED; T-005 OPEN.
- SPEC-006 LLM access through Konkred gateway: APPROVED; T-006 DOING.
- SPEC-007 Personal mode: DRAFT; owner approval remains open.

## Active focus — T-006 / SPEC-006
All LLM requests on the feature branch use the server-side Konkred `/v1/chat/completions` endpoint. The old provider-relay path and browser provider-key use are removed. Added a separate, token-gated, no-inference health API that validates the device relay token, gateway caller authorization, and available model capacity. The client UI no longer equates a saved app relay token with working AI.

### Verification
- `npm test`: 176/176 passed.
- `npm run lint`: passed.
- `npm run test:dom`: 101/101 passed, including production build. Existing warnings: one >500 kB chunk and ineffective dynamic import in `src/services/deliveryEngine.ts`.
- `git diff --check`: passed.
- Local preview on port 24678: with the app relay token, `/api/llm/relay-health` returns HTTP 200 with `configured:false`; `/api/llm/relay` returns HTTP 503 `AI_NOT_CONFIGURED`.
- GitHub Android build check passed. A follow-up run confirmed the APK release publish step is skipped on the feature branch.

### Branch, PR, and preview
- Fixed branch: `arena/8bfff631-konklancer2`.
- Feature commit: `6627134`; APK release guard commit: `8e3aad2`.
- Draft PR #9: https://github.com/reARbitRA/konklancer2/pull/9 (Vercel check passed; `build-apk` passed; Supabase Preview skipped).
- Vercel preview is READY at `https://konklancer2-git-arena-8bfff631-kon-943c5b-ari-miyanjis-projects.vercel.app` (deployment `dpl_7DSB1M7YjX8hSRVi1ZH9xFYbcs1S`). It contains both LLM API functions.
- The current Vercel production deployment remains on `main`; this branch has not been deployed to production.

### Single server-side blocker for live AI
The exact current production and preview Vercel deployment environment-name lists include `KONKLANCER_RELAY_TOKEN` but not `KONKRED_API_KEY`. The Vercel shared-variable list also has no shared `KONKRED_API_KEY`. The gateway project has a sensitive `USERS_JSON_BASE64` allow-list, which was not decrypted or modified; inspected gateway code has no caller-key self-service route.

Outstanding server-side action: provision one dedicated Konklancer caller credential in the gateway allow-list and configure that same value as sensitive `KONKRED_API_KEY` in the Konklancer Vercel project. Do not request or paste the value in chat. Once the server is configured, the already-provisioned app relay token still needs to be entered in Settings on the user's own browser/device.

### APK publication side effect
The repository's existing Android workflow publishes a stable APK on every qualifying branch push. The first feature push therefore updated the `android-latest` asset and `apk-latest` tag with the gateway-only feature build before its backend was configured. Release notes were corrected to disclose that AI is not ready. The workflow now restricts stable-release publishing to `main`; the follow-up feature-branch run built successfully and skipped publishing. The APK asset has not been removed. This is separate from Vercel production deployment.

## Other known issues
- The CodeWorkspace “run test” button is simulated.
- `freelance_pro_engine.py` remains in the repository root; removal is an owner decision.
- Non-relay API routes still need the broader SPEC-003 authentication work before exposing the server beyond local/personal use.

## Latest session checkpoint
`session-007`, branch `arena/8bfff631-konklancer2`. Source commits are pushed; this state, trace, ledger, spec index, and T-006 task move are included in the final Forge handoff commit. T-006 remains DOING: live gateway inference has not been verified and no Vercel production deployment has been made. See `.forge/LEDGER.md` and `.forge/TRACE.md` for details.
