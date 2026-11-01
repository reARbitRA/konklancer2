# Truth map — release work in progress

- Repository: this branch contains an uncommitted ground-up frontend in `src/rebuild`; legacy frontend remains as a capability reference. It is not feature-complete.
- Runtime: Express + Vite middleware, SQLite, scanner feed, browser LLM client. Server token/JWT protection exists; local SQLite is shared, not tenant-isolated.
- Drive: the specified folder was inspected; one document appeared to contain plaintext credentials. It must be treated as sensitive and those credentials should be rotated. They are not reproduced here.
- Supabase: connected project `yyxtdgmnbfucdkmunali` was reported healthy, but no public tables or edge functions were found at inspection. RLS policies, real OAuth and data isolation are not verified.
- Vercel: previously observed production deployment `dpl_6iBX6PDEFy8R8U5XtgcDQLzePdUA` was READY for main commit `4af8ea7`, not this work. Readiness is not proof that the Express API works there.
- Frontend/provider architecture: current LLM requests use a browser-stored device key, which does not satisfy the requested server-only credential architecture. No live provider request was made in this session.
