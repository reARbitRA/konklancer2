# رله خارج از ایران — حیاتی

**تمام درخواست‌های AI باید از خارج ایران ارسال شود.** درخواست مستقیم از IP ایران به `generativelanguage.googleapis.com` با `400 User location is not supported` و به `api.groq.com / api.openai.com` با `403` بلاک می‌شود. این باگ قبلاً وجود داشت و الان درست شده.

## معماری

```
مرورگر/تبلت (ایران) --POST--> Supabase Edge `konklancer-relay` (Virginia US) --fetch--> Gemini/Groq/OpenAI
                     \--fallback--> /api/llm/relay (Vercel/US VPS) --fetch--> Gemini/Groq/OpenAI
```

1. **مرورگر هیچ‌وقت مستقیم به گوگل نمی‌زند** — `src/services/browserLLM.ts:smartFetchLLM` اول `relayLLMRequestViaUS` را می‌زند. اگر رله جواب داد (حتی `401` احراز هویت)، همان جواب از خارج ایران برگشته. اگر رله در دسترس نبود، خطای شفاف می‌دهد نه اینکه بی‌صدا برود مستقیم.
2. `src/services/cloudRelay.ts:relayLLMRequestViaUS` اول Supabase Edge، اگر `404` بود می‌رود سراغ `/api/llm/relay` همان سرور (مفید وقتی اپ روی Vercel/US دیپلوی شده).
3. استثناء: `Ollama` (`localhost:11434`) همیشه مستقیم است.

## فایل‌ها

- `supabase/functions/konklancer-relay/index.ts` — Edge Function، allow-list هاست‌ها (no open SSRF)، CORS، `mode: llm | page`
- `server.ts: POST /api/llm/relay` — fallback همان قرارداد
- `server.ts: GET /api/llm/relay-health` — وضعیت + probe
- `src/services/cloudRelay.ts` — کلاینت رله
- `src/services/browserLLM.ts` — تضمین ارسال از خارج

## دیپلوی Edge Function (یک‌بار)

```bash
supabase functions deploy konklancer-relay --project-ref rwuyuhjkitcnekpwmoml
# یا از داشبورد Supabase: Edge Functions → Deploy
```

`verify_jwt` باید `false` باشد (کلید anon عمومی است، امنیت با allow-list).

## تست

```bash
curl -s http://localhost:24678/api/llm/relay-health | jq .
curl -s -X POST http://localhost:24678/api/llm/relay -H 'content-type: application/json' \
  -d '{"target_url":"https://generativelanguage.googleapis.com/v1beta/models","req_method":"GET","req_headers":{"x-goog-api-key":"AIzaTEST"}}' | jq .

# در مرورگر (با کلید واقعی در تنظیمات):
# 1) یک پروژه را "ارزیابی AI" بزن — باید بدون خطای "User location" کار کند
# 2) اگر رله deploy نشده باشد، خطا می‌گوید: "رله خارج از ایران در دسترس نیست"
# 3) برای تست با VPN: localStorage.setItem('konklancer_allow_direct','1')
```

## Auth مهم نیست؟

درست است — `docs/AUTH.md` کدها هست و `supabaseJwt` dual-auth کار می‌کند، ولی بدون `TELEGRAM_BOT_TOKEN` و بدون `client_id` گوگل در داشبورد، login واقعی کار نمی‌کند. این فعلاً اوکی است چون رله AI حیاتی‌تر است و بدون login هم کار می‌کند (کلیدهای API در `localStorage`/`IndexedDB` vault هستند).

## امنیت

- allow-list هاست‌ها جلوی SSRF را می‌گیرد — `evil.com` → `403 Host not allow-listed`
- کلید LLM در `req_headers` به رله می‌رود و از آنجا به پرووایدر — رله لاگ نمی‌کند و در پاسخ برنمی‌گرداند
