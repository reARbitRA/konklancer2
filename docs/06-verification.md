# Verification status

Latest local checks: `npm run lint` passed; `npm test` passed 170 tests; `npm run build` passed with a large JS chunk warning; `node scripts/opportunities-smoke.mjs` passed a mocked-network jsdom check for discovery, detail, persistence, pipeline, API 401 and an alias redirect.

An isolated Express instance with in-memory SQLite and a test token verified anonymous jobs 401, authenticated jobs 200 (1009 rows), scheduler read/write, disabled cloud status, and bid create/update/list/stats. The instance was stopped; no cloud scan, provider call or production data write was performed.

Not verified: live providers, external scanner and cloud writes; real OAuth; browser end-to-end, viewport/keyboard/screen-reader/contrast/performance audits; current-branch CI; RLS policy/isolation; request-ID propagation; deployed frontend/backend flows. Do not treat historical legacy UI tests as proof of this frontend.

Follow-up: 172 Node tests now pass, including relay URL validation and a mocked no-follow redirect test. The jsdom smoke also verifies command-dialog focus on open and restoration on Escape. Comprehensive keyboard and assistive-technology testing remains open.

Studio follow-up: 173 tests pass. Isolated local Chromium checks covered studio rename, confirmed delete and original generated-file preservation, plus blocking restricted content before provider calls. Live provider and end-to-end deployment checks remain open.
