---
id: SPEC-012
title: No-login managed models in private preview
status: APPROVED
version: 1.0.0
---
# No-login managed models in private preview

The operator explicitly requested that model selection work without entering API keys or signing in to the application. This preview-only change supersedes the login requirement in SPEC-011 for the current branch preview, not for production. Provider keys remain server-side and are not embedded in the client or repository.

- Enable unauthenticated application requests only when both `VERCEL_ENV=preview` and `MANAGED_LLM_OPEN_PREVIEW=true`. Other environments must retain existing authorization.
- Use Vercel deployment protection for access to the private preview; do not assume a public deployment is protected. If Vercel protection is disabled, anyone with the URL may use the shared model credentials and cause cost.
- Use a separate atomic Supabase preview quota of 20 generation attempts per UTC day. This is not a monetary cap. The public quota RPC can be consumed by anyone with the public Supabase key, allowing quota exhaustion; it does not expose provider credentials or make a provider request.
- Do not expose provider keys, allow arbitrary URLs, or claim provider availability without a real request. Surface connection and provider errors.
- Verify anonymous GET and POST with mocked providers, quota failures and production fail-closed; verify the separate quota in a rolled-back DB transaction. Real provider access and protected preview usability require separate end-to-end verification.
