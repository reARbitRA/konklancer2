# Konkred gateway and page relay

## Request paths

```text
AI features (web / APK)
  └─ /api/llm/relay (Vercel or local Express)
       └─ Konkred gateway: POST /v1/chat/completions

Readiness (no inference tokens spent)
  └─ /api/llm/relay-health (Vercel or local Express)
       └─ validates the app token, gateway caller auth, and model capacity

HTML page fetching only
  └─ Supabase Edge Function: /functions/v1/konklancer-relay
       └─ allow-listed freelance-platform / Telegram pages
```

All LLM requests use the Konkred gateway. The browser sends only the app relay token and a task payload (`taskType`, `system`, `user`, and optional generation settings). The gateway credential, provider keys, provider choice, model choice, quotas, and failover remain server-side. Provider-specific endpoints and provider-key forwarding are disabled.

The Supabase Edge Function remains available for non-LLM HTML page fetching. It accepts only `mode: "page"`, follows redirects only to allow-listed HTTPS hosts, and does not read or inject provider secrets. Do not use it for model inference.

## Required server configuration

Configure these as Vercel project environment variables (Production, Preview, and Development as appropriate):

- `KONKLANCER_RELAY_TOKEN` — the app-to-server token. The same value may be set as a Supabase Edge secret to protect page fetching. It is **not** the gateway credential.
- `KONKRED_GATEWAY_URL` — normally `https://api.konkred.xyz`.
- `KONKRED_API_KEY` — a gateway caller credential that is provisioned in the gateway's `USERS_JSON`. Do not use a provider key or the app relay token here.
- Optional: `KONKRED_PRIVACY` (`any` by default, or `strict`), `KONKRED_TIMEOUT_MS`, and `KONKRED_CACHE_TTL_MINUTES`.

If `KONKRED_API_KEY` is missing or rejected by the gateway, the API returns a clear configuration/authentication error rather than trying a provider directly or returning mock output. Never put `KONKRED_API_KEY` in `VITE_*`, browser local storage, a public repository, or an APK.

## Per-device setup

In Settings → “توکن دسترسی رله‌ی این برنامه”, enter the value of `KONKLANCER_RELAY_TOKEN`. It is saved on that device and sent in the `x-api-token` header. This does not configure the gateway itself; an authorized `KONKRED_API_KEY` must already be present on the Vercel/server environment.

## Supabase page-relay setup

The existing project is `konkred-xyz` (`rwuyuhjkitcnekpwmoml`, `us-east-1`); the separate `konklancer2` Supabase project was not migrated as part of this change. Keep the Edge Function's `KONKLANCER_RELAY_TOKEN` secret set and deploy the page-only function after code changes:

```bash
supabase functions deploy konklancer-relay --project-ref rwuyuhjkitcnekpwmoml
```

The Supabase anon key is public and is not authentication. `OPTIONS` preflight is unauthenticated; application requests require the relay token. No provider API secrets are needed by this function.

## Routes and ownership

- `server/llm.ts` — one server-side Konkred client, OpenAI-compatible `/v1/chat/completions`, retry/error mapping, local cache, and mock-response rejection.
- `server/gatewayApi.ts` — validates the app relay token and task contract; rejects provider relay/model-selection payloads.
- `api/llm/relay.ts` — Vercel adapter and CORS policy for gateway inference.
- `server/gatewayHealthApi.ts` and `api/llm/relay-health.ts` — no-inference readiness probe that confirms app-token validity, gateway caller authorization, and available model capacity.
- `server.ts` — local Express adapters and legacy server-side task endpoints; those also use the gateway client only.
- `src/services/cloudRelay.ts` — client calls the app adapter and checks readiness; Supabase is used separately for page fetching and cloud data sync.
- `supabase/functions/konklancer-relay/index.ts` — allow-listed HTML page fetching only.

## Safe smoke test

The app's status indicator uses `GET /api/llm/relay-health` with the device relay token. This no-inference probe authenticates the gateway caller through `/api/models` and checks that at least one model is available. After the server credential has been provisioned, use Settings → “آزمایش درگاه” for a real inference request; it displays the returned model/latency. To verify only the inference route's app-token gate without invoking an LLM, send an empty task payload with a missing token and expect HTTP 401:

```bash
curl -i -X POST https://konklancer2.vercel.app/api/llm/relay \
  -H 'content-type: application/json' \
  -d '{"taskType":"general","user":"test"}'
```

A valid-token request without gateway configuration should return `503 AI_NOT_CONFIGURED`; a gateway auth rejection should return `401 AI_AUTH`. Do not use provider target URLs or provider keys in this endpoint.
