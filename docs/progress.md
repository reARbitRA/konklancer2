# Rebuild progress — 2026-10-30

## Access and evidence
- GitHub checkout is at `4af8ea7`; only one commit is available in the shallow local history. Recent Actions runs were visible; no open PRs or issues were returned by `gh` at intake.
- Drive folder listing is accessible. `API-KONK.md` contains apparent plaintext provider credentials. Treat them as exposed and rotate/revoke them; no values were copied into the repository or used. The remaining archives and binaries have not been audited.
- Supabase project `yyxtdgmnbfucdkmunali` is active. A read-only `pg_tables` query returned no public tables and RLS enabled for the eight listed storage tables. This is not a complete schema or policy audit. The edge-function listing was empty. Logs, policies and auth configuration remain unreviewed.
- Vercel production deployment `dpl_6iBX6PDEFy8R8U5XtgcDQLzePdUA` is READY at commit `4af8ea7`; build logs show `vite build`, a 2.67 MB JS bundle, and an ineffective dynamic import. The deployment file-tree endpoint returned 404; runtime logs and actual API routing were not verified. A successful static build does not prove Express routes are deployed.

## Findings
- The app already has hash routes (`src/App.tsx`): hunt, pipeline, studio, analytics, ops, login and account. It is not literally a single route; individual surfaces still need a UX audit.
- `src/services/browserLLM.ts` directly calls providers using device-stored credentials, as explicitly required by approved `specs/SPEC-008-temporary-direct-llm.md`. The new brief requests server-only credentials instead. Migrating requires a deliberate architecture/security design, not silently claiming the current system is server-only.
- The requested Obsidian direction supersedes the existing aesthetic direction, but `SPEC-009` remains DRAFT and the existing design guard tests assert the previous visual language. The comprehensive rebuild and corresponding specification/guard changes have not been implemented.

## Implemented
- Under SPEC-008 R4, direct-provider fetches now abort if response headers do not arrive within 60 seconds and provide an actionable timeout message. Provider error response bodies are no longer shown to users because they may echo credentials or prompts. This does not impose a timeout on reading a response body after headers arrive.
- Two mocked-fetch regression tests cover timeout cancellation and redaction (`server/browserLLM.test.ts`). No live model request was performed.

## Verification
- `npm run lint`: pass.
- `npm test`: 162 passed.
- `npm run build`: pass, with existing oversized bundle and ineffective dynamic import warnings.
- `npm run test:dom`: failed: the script attempted to fetch `127.0.0.1:24678` and got ECONNREFUSED after earlier checks ran. The cause has not yet been diagnosed.
- No browser, live provider, mobile, accessibility, production API or deployment verification was performed. No deployment, migration, credential rotation, or infrastructure mutation was made.

## Next
1. Rotate exposed provider credentials and review the Drive file's permissions.
2. Complete source and environment intake, full truth map, route/API audit and deployment routing proof.
3. Specify the server-provider migration and locked design direction; implement and test without losing existing data or functionality.

## Continuation — Obsidian shell and local API (2026-10-30)
- Added the approved incremental shell spec (`specs/SPEC-010-obsidian-shell.md`), the dark command header/rail/mobile dock (`src/components/layout/ConsoleShell.tsx`), shell styles, and route/design notes. Existing feature panels remain in the old design; the requested full redesign is not complete.
- Local Express `GET /api/health` and `GET /api/jobs` returned 200. API auth reported **off** locally. Do not expose this configuration as a multi-user production backend.
- Unknown Express `/api` routes now return JSON 404 rather than being served the SPA in production. Static Vercel routing is a separate unresolved deployment issue.
- The DOM test requires a separately started server. It also had an obsolete hard-coded maximum budget; the expectation now derives from the live feed plus its own seed. `BASE_URL=http://127.0.0.1:3000 npm run test:dom` passed 102/102 against the local server; the suite exercises local SQLite mutations.
- `npm test` passed 162 tests, `npm run lint` and `npm run build` passed. Bundle warnings remain. No real provider, production deployment, visual viewport, accessibility, RLS, or tenant-isolation proof was performed.
- Auth client currently defaults to a **different** Supabase project than the operator-specified project unless Vite configuration overrides it (`src/services/auth.ts`). The new `.env.example` lists the Vite variables; values and production configuration have not been changed.
- Confirmed locally: `GET /api/unknown-route` returns HTTP 404 with JSON after the server change. The preview server was stopped because API auth was off while the process could discover a GitHub CLI credential for cloud scans; exposing that combination would permit unauthenticated remote actions. A safe production authentication and deployment design remains a release blocker.

## Continuation — security and scan wiring (2026-10-30)
- Server now refuses a missing API token in production, rejects short configured tokens and binds to loopback when the token is absent in development (`server/apiAuth.ts`). This is service-token protection, **not** tenant isolation; JWT-authenticated users still share a SQLite store.
- Removed automatic Git repository, branch and `gh auth` credential discovery. Cloud writes now require explicit `KONKLANCER_CLOUD_FEED_REPO` and `KONKLANCER_CLOUD_TOKEN`. The optional CLI fallback requires an opt-in and uses the explicit token. Existing installations that depended on implicit discovery must configure these values (`README.md`).
- Socket.IO now uses the same service token / verified JWT admission rule as the API (`server/socketAuth.ts`); browser connection supplies current credentials. `server/socketAuth.test.ts` verifies rejection and acceptance with real local Socket.IO connections.
- Removed the hardcoded unrelated Supabase project and anon key from auth and the optional feed relay. Auth now requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time; the legacy feed relay has separate opt-in variables. Until configured, sign-in and that relay are unavailable; guest mode remains. No remote environment values or schemas were changed. The requested Supabase project has no public tables or edge functions in the limited checks performed so far.
- Web scan, cloud scan and cloud sync controls now call their respective Express endpoints. Errors and results remain visible in the shell; cloud controls are no longer advertised as enabled without a successful server status response. The standalone scanner reports an error rather than claiming success if no source responded. No real scan or external cloud write was initiated during verification.
- Local authenticated HTTP checks: `/api/health` 200, anonymous `/api/jobs` 401, authenticated `/api/jobs` 200, unconfigured cloud status disabled, unknown authenticated API route 404 JSON. `npm run lint`, `npm test` (167 tests) and `npm run build` passed. Authenticated DOM smoke: 102/102. Test server stopped; no deployment was made.
- Remaining blockers: complete Obsidian screen migration, review current API security and SQLite tenant ownership, configure and verify the correct Supabase project, replace or safely operate browser-side AI, provision a compatible backend for Vercel, and perform live provider and production/browser QA. The existing static Vercel build alone does not deploy the Express server. No production-ready claim is warranted.

## Discovery workspace redesign
- Replaced the default `/hunt` wall with `src/components/OpportunityWorkspace.tsx`: searchable and filterable paginated opportunity list, deep-linked selection, responsive detail pane, analysis/proposal/studio/save actions, and explicit empty state. URL query stores view, search, sort, page and selected job. Existing manual entry, URL/HTML import and original advanced controls remain reachable through the advanced-tools action.
- Verification: `npm run lint`, `npm run build`, `npm test` (167 pass), and `node scripts/opportunities-smoke.mjs` (list, selection, deep link, analysis interaction) pass. This DOM smoke uses a seeded local record and simulated unavailable APIs; it is not live provider or visual-browser proof. The old full DOM suite expects the previous default hunter markup and has not been updated/re-run against this new default.
- Other surfaces and dialogs remain in the previous design; this is not the full product rebuild. Preview server remains running on port 3000 with API authentication enabled; the browser preview is not automatically authenticated.

## Pipeline workspace redesign
- Replaced the default pipeline wall with `src/components/PipelineWorkspace.tsx`: stage navigation with real counts, searchable focused list, stage and priority controls, and existing analysis/proposal/studio handlers. Stage and search are URL-backed. The previous chart and full board remain available in the advanced view. Removed the hardcoded agent speed and satisfaction figures from that old view.
- Verification: `npm run lint`, `npm test` (167 passing), `npm run build`, and `node scripts/opportunities-smoke.mjs` passed, including a seeded job stage transition. This is a simulated DOM test, not deployed or real-browser proof. Studio, analytics, operations and dialogs still need structural redesign and full integration verification.

### Ground-zero frontend rebuild — in progress

The application entry now mounts a newly written Obsidian frontend (`src/rebuild/`) instead of the previous UI. The old frontend source is retained as a capability reference, not mounted. The new routes cover overview, discovery, detail, pipeline, studio, insights and settings, with an authentication gate when configured. Existing local project and manual-vault data are read; generated files require confirmation before replacement. This is **not feature parity**: substantial legacy controls and workflows still need to be inventoried and rebuilt, including authentication methods and cloud/scanner management. Direct browser provider credentials remain an architectural/security gap against the requested server-only model.

Verification so far: TypeScript lint, 167 unit tests and production build passed; a jsdom smoke with mocked network verified seeded project discovery, detail navigation, persisted status and pipeline stage navigation. This is not a real-browser, live provider, production deployment, accessibility or end-to-end verification. The current preview's protected backend requires credentials not supplied automatically to the browser, so backend-connected actions can return 401. The build still has a large JS chunk warning. No release or deployment is claimed.

#### Project data safety follow-up

The rebuilt frontend now writes manual, pinned and legacy custom projects to the existing recovery vault as well as the main local project store. If either store cannot be decoded, valid data from the other is still loaded, writes are blocked to avoid overwriting potentially recoverable data, and a persistent warning is shown. Feed refresh now retains projects with solution files or recorded bids; the studio prevents edits during generation. Added focused storage tests. Verification: lint, 170 unit tests, build and mocked-network discovery/pipeline DOM smoke passed. Live backend/provider, cross-device isolation, real-browser accessibility, legacy capability parity, deployment and release gates remain unverified.

#### Operations and verification follow-up

Added cloud status, sync and explicit-confirmation scan queue controls; added scheduler interval management; redirected basic legacy URLs and repaired the skip-to-content control for hash routing. An isolated in-memory backend verified anonymous 401, authenticated jobs, scheduler read/write, disabled cloud status, and proposal create/update/list/stats. No external scans or provider calls were made. See `01-truth-map.md` through `08-changelog.md` for current evidence and outstanding release gates.

#### Relay and modal safety follow-up

The Node LLM relay now requires an allowlisted HTTPS URL without embedded credentials or a non-default port, disallows unneeded methods, and does not follow redirects. Server-managed credentials are injected only when explicitly requested with the server placeholder; existing browser-supplied keys are no longer silently replaced. This tightens legacy relay behavior and may reject previously permitted generic `*.googleapis.com` endpoints. Unit tests exercise URL validation and mocked redirect handling; no live provider call was made.

Command and add-project dialogs now receive focus, trap Tab, close with Escape and restore prior focus. The jsdom smoke checks command-dialog focus and restoration; this is not a full assistive-technology or real-browser audit. Lint, 172 tests, build and the updated smoke passed. The build continues to report a large JS chunk.

#### Studio and archive safety follow-up

ZIP export now rejects absolute, traversal, backslash, control-character and Windows-unsafe paths instead of producing archives that may extract outside the target folder. Studio exposes file rename and confirmed deletion so invalid generated names can be repaired; edits update `solutionCode` without overwriting the original `generatedFiles` field. The rebuilt AI actions now apply the existing content filter before making a provider call. Lint, build, 173 Node tests and the jsdom smoke passed. An isolated Chromium session verified file rename, persistence, preservation of original generated files, confirmed deletion, and blocking a restricted project before provider requests. These checks do not prove live provider connectivity, comprehensive accessibility or release readiness.

#### Persian-first language switch

The rebuilt UI now defaults to Persian with RTL layout, and provides an English toggle persisted locally. Core navigation, pages and primary controls have translations; provider-generated content and some dynamic server messages retain their original language. Chromium checks at 390, 768 and 1280 pixels found no horizontal overflow on the overview and verified language switching and persistence. Lint, the build, 173 tests and the jsdom smoke pass. Other routes, full localization, screen-reader behavior and deployed backend functionality still require verification.

#### Micro-interactions and orbit motion

Added 120ms interaction feedback to buttons, links and form controls, rotating overview orbits in both directions, a restrained center pulse, and a compact mobile orbit. Reduced-motion preference disables motion. Local Chromium verified orbit movement, press feedback, mobile visibility/no horizontal overflow at 390px and reduced-motion behavior; hover was not exercised because the headless browser reported no hover-capable device. Lint, 173 tests, build and jsdom smoke passed.

#### Scan diagnosis and published-feed refresh

The rebuilt overview's live scan requires the protected Express `/api/bridge/trigger-scan` endpoint. The local preview returned 401 without its private token, and Vercel's static Vite deployment is not evidence of an Express scanner backend. Added explicit authentication/server-unavailable messages and a separate button that fetches the latest published public GitHub scanner feed; it does not start or claim to start a scan. Feed refresh persists refreshed rows and reports storage failures. GitHub's public contents endpoint returned HTTP 200 and CORS `*` in a local HTTP check; a mocked Chromium test verified refresh, persistence and the visible 401 path. Lint, build, 175 unit tests and the jsdom smoke passed. An on-demand live scan on Vercel still requires an authenticated scanner service and real network verification.
