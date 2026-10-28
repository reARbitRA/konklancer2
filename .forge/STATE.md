# STATE — as of 2026-10-28

## Current owner direction
- Pause gateway/Supabase LLM work under SPEC-006 while using direct provider access temporarily.
- SPEC-008 is APPROVED: multiple provider profiles, device-entered keys, model discovery/selection, connection testing, and direct client-to-provider calls. Do not embed, commit, or ask for API secrets.
- App-wide contemporary 2027 brutalist styling and micro-interactions remain separate in SPEC-009 (DRAFT); the owner requested a UI-spec revision, but clarification/approval is still pending.

## Active task and approvals
- T-008 is DONE on `arena/8bfff631-konklancer2` under APPROVED SPEC-008.
- T-006 is OPEN/paused; approved SPEC-006 text is unchanged. No gateway, Supabase AI relay, or deployment work is being continued.
- T-009 is OPEN; SPEC-009 remains DRAFT. No redesign work was included in T-008.

## Current implementation boundary
- `src/services/browserLLM.ts` sends inference, model discovery, and connection tests directly to the selected user-configured provider. The app AI path has no Konkred/Supabase/Vercel LLM fallback and does not show fabricated answers.
- The existing provider key vault, multiple profiles, `LiveModelSwitcher`, model selection/discovery/manual entry, testing, and opt-in failover are retained. Existing profiles are not purged automatically.
- Provider keys are entered after installation on the owner's device. Settings warns that browser/WebView storage is not a secure vault and that provider data policies apply. No real provider secret was added.
- Existing scanner page-fetch/cloud-feed helpers remain separate; they are not used for LLM inference. No Supabase configuration or deployment was changed for SPEC-008.

## Branch and PR
- Fixed branch: `arena/8bfff631-konklancer2`; status `pr_open`. PR #9 remains OPEN/DRAFT: https://github.com/reARbitRA/konklancer2/pull/9.
- Direct-provider implementation commit: `1adb5ea` (`feat(llm): restore direct provider access [T-008] [SPEC-008]`). The Forge handoff and task transition are recorded on the same fixed branch; no merge was performed.
- Do not push to `main` or change branches.
- Historical gateway-only APK preview/release details are below. The `android-latest` artifact published by earlier work is still not confirmed AI-ready; stable APK publishing remains restricted to `main`.

## Verification for T-008
- `npm test`: 160 passed, including direct-provider tests using mocked fetch and a fake test key.
- `npm run lint`: passed.
- `npm run test:dom`: 102/102 passed; this also completed the production build.
- Build warnings remain: the JavaScript chunk exceeds 500 kB and the dynamic import of `deliveryEngine.ts` is ineffective because it is also statically imported.
- No live provider request was made: no user key was entered in this environment. Direct browser calls may be affected by provider CORS, network, region, or quota policies.
- Final staged `git diff --check` passed after the Forge/task updates.

## APK publication side effect (historical)
The first feature push triggered the repository's Android workflow and updated `android-latest` / `apk-latest` with a gateway-only feature build before live AI was configured. Release notes were corrected. The workflow was restricted to publish stable APKs only from `main`; the follow-up branch run passed and skipped release publishing. The already-published asset remains available and is not confirmed AI-ready.

## Latest session checkpoint
T-008 is implemented, verified, documented, and moved to DONE. The feature commit restores direct user-configured provider access with a Settings security disclosure; provider credentials remain device-entered. T-006/SPEC-006 stay paused and unchanged. T-009/SPEC-009 stay unimplemented and draft/open pending the owner's UI-spec revision. No live provider key, inference, Supabase deployment, or Vercel deployment was used for this work.
