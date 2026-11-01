# API and provider map

| Route/service | Consumer | Verification |
|---|---|---|
| `/api/jobs` | unified feed | authenticated local HTTP returned 1009 jobs; anonymous 401 |
| `/api/bids`, `/api/bids/:id`, `/api/stats` | outcomes | create, patch, list and stats verified against isolated in-memory SQLite |
| `/api/scheduler` | settings operations | local read and write verified in isolated memory; no scan executed |
| `/api/bridge/trigger-scan` | overview | wiring present; real external scan not performed |
| `/api/bridge/cloud`, `/sync-feed`, `/cloud-scan` | settings operations | cloud status returned disabled locally; real sync and dispatch not run |
| browser LLM provider API | project detail and studio | existing unit mocks only; no live keys/provider connectivity confirmed |
| Supabase Auth | account and optional gate | client/server wiring and unit tests only; real OAuth and project configuration unverified |

Current production hosting only proves a static Vite build for an older commit; a reachable Express backend and API routing on Vercel remain unproven. The preview server token is not automatically provided to browsers, so protected actions can return 401.

## Managed inference update
`/api/models` (Vercel function) verifies Supabase identity and a server-side allowlist, discovers fixed provider catalogues, and reserves a shared quota before generation. Supabase also verifies membership for the quota RPC; provisioning a user requires both allowlists. Failures include an opaque request ID. These paths have mocked tests; live provider calls and deployed user sessions remain unverified. The scanner and outcomes routes above are still Express routes, not proven Vercel functions.
