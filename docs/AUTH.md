# احراز هویت — Google · GitHub · Telegram

پیاده‌سازی روی **Supabase Auth** (پروژه `rwuyuhjkitcnekpwmoml` — `konkred-xyz`).
این سند هم «چه چیزی ساخته شد» را می‌گوید، هم «چه چیزی هنوز کار انسانی لازم دارد» —
بدون ادعای اضافی.

## ۱) معماری

```
┌─────────────── مرورگر (React) ───────────────┐
│ AuthProvider  ── session / profile / availability
│ LoginScreen   ── Google، GitHub (OAuth) + ویجت تلگرام
│ AccountMenu   ── چیپ حساب در هدر + منوی ورود/خروج
│ apiFetch      ── Authorization: Bearer <supabase jwt>
└───────────────┬──────────────────────────────┘
                │
   ┌────────────┴─────────────┐
   │                          │
Supabase Auth            سرور Express (همین ریپو)
(Google/GitHub OAuth،    ├─ GET/POST /api/auth/telegram   ← هم‌ارز Edge Function
 profiles، RLS)           ├─ GET /api/auth/config         ← وضعیت احراز هویت دوگانه
                          └─ میدل‌ور supabaseJwt          ← پذیرش JWT کاربر
   │
Edge Function `telegram-auth` (v2, verify_jwt:false)
   └─ بررسی HMAC ویجت تلگرام → ساخت/یافتن کاربر → token_hash
```

دو مسیر برای تلگرام وجود دارد و کلاینت اولی را ترجیح می‌دهد:

1. `POST /api/auth/telegram` روی همان سروری که اپ را سرو می‌کند (خودمیزبان).
2. `POST {SUPABASE_URL}/functions/v1/telegram-auth` (اپ میزبانی‌شده).

اگر مسیر اول `NOT_CONFIGURED`/`404` بدهد، کلاینت بی‌صدا سراغ دومی می‌رود.

### چرا Telegram مسیر سفارشی دارد؟
Supabase provider بومی تلگرام ندارد. ویجت رسمی تلگرام یک payload **امضاشده** می‌فرستد؛
امضا فقط با `SHA256(bot_token)` قابل بررسی است، پس **توکن ربات هرگز به مرورگر نمی‌رود**.
سرور پس از تأیید امضا یک `hashed_token` یک‌بارمصرف می‌دهد و کلاینت آن را با
`supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` به نشست تبدیل می‌کند.

الگوریتم (هر دو پیاده‌سازی یکسان):
`hex(HMAC_SHA256(key = SHA256(bot_token), msg = data_check_string))`
که `data_check_string` = فیلدهای غیرخالی، بدون `hash`، مرتب‌شده، به شکل `k=v` و
**با جداکننده‌ی خط جدید واقعی (U+000A)**.
> نسخه‌ی اول Edge Function از `'\n'` به‌صورت رشته‌ی escape استفاده می‌کرد که امضا را
> همیشه باطل می‌کرد؛ در v2 با `String.fromCharCode(10)` اصلاح شد.

## ۲) پایگاه داده و امنیت

| آبجکت | توضیح |
|---|---|
| `public.profiles` | پروفایل هر کاربر (`id → auth.users`)، متادیتای نمایش، `primary_provider`، `telegram_id`، `locale='fa'`. RLS روشن؛ سه policy: `select_own` / `insert_own` / `update_own`. |
| `public.telegram_links` | نقشه‌ی `telegram_id → user_id`؛ RLS فقط خواندن رکورد خود. |
| تریگر `on_auth_user_created` | با ساخت کاربر در `auth.users`، ردیف `profiles` می‌سازد. |

کلیدها:
- در کلاینت فقط **anon/publishable** (عمومی به‌طراحی). مقدار پیش‌فرض در `src/services/auth.ts` است و با `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` جایگزین می‌شود.
- `service_role` فقط در Edge Function / env سرور (`SUPABASE_SERVICE_ROLE_KEY`). یک تست، غیبت آن در همه‌ی فایل‌های کلاینت را تضمین می‌کند.

## ۳) متغیرهای محیطی

| متغیر | کجا | لازم؟ | کاربرد |
|---|---|---|---|
| `VITE_SUPABASE_URL` | کلاینت | پیش‌فرض دارد | آدرس پروژه |
| `VITE_SUPABASE_ANON_KEY` | کلاینت | پیش‌فرض دارد | کلید عمومی |
| `VITE_TELEGRAM_BOT_USERNAME` | کلاینت | اختیاری | نام ربات برای ویجت (می‌تواند از env سرور بیاید) |
| `VITE_AUTH_REQUIRED` | کلاینت | اختیاری | `true` = اپ تا ورود رندر نمی‌شود (پیش‌فرض: ورود اختیاری) |
| `TELEGRAM_BOT_TOKEN` | سرور / Edge secret | برای تلگرام | توکن BotFather |
| `TELEGRAM_BOT_USERNAME` | سرور / Edge secret | برای ویجت | نام عمومی ربات (از `GET /api/auth/telegram` خوانده می‌شود) |
| `TELEGRAM_ALLOWED_IDS` | سرور / Edge secret | اختیاری | لیست سفید شناسه‌های تلگرام |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | سرور | برای ساخت نشست تلگرام | تماس با Admin API |
| `SUPABASE_JWT_SECRET` | سرور | برای تأیید JWT | بدون آن، JWT رد می‌شود (fail-closed) |
| `KONKLANCER_TRUST_SUPABASE_JWT` | سرور | ممنوع در تولید | `true` = پذیرش JWT بدون بررسی امضا (فقط برای توسعه) |

## ۴) API

| مسیر | خروجی |
|---|---|
| `GET /api/auth/config` | `{ apiToken:{enabled,header}, supabaseJwt:{enabled,signatureChecked,trustUnsigned,header} }` |
| `GET /api/auth/telegram` | `{ configured, missing[], allowListEnabled, bot_username, mode }` |
| `POST /api/auth/telegram` | `{ ok, token_hash, type:'magiclink', user }` یا خطای صریح: `MISSING_HASH` / `BAD_SIGNATURE` / `STALE` / `BAD_ID` / `NOT_ALLOWED` / `NOT_CONFIGURED` / `USER_CREATE_FAILED` / `LINK_FAILED` / `NETWORK` |
| `GET /api/auth/telegram` (edge) | همان، با `mode:'edge'` |

احراز هویت `/api/*`: یا `x-api-token` (توکن محلی) یا `Authorization: Bearer <supabase jwt>`.
اگر JWT نامعتبر باشد، پاسخ ۴۰۱ هدر `x-konklancer-jwt` را با دلیل (`BAD_SIGNATURE`, `EXPIRED`, …) برمی‌گرداند.

## ۵) آنچه در این محیط تأیید شد

- `npm run lint` پاک.
- ۳۱ تست Node:
  - `server/authClient.test.ts` — کاتالوگ providerها، `mapAuthSettings` (enabled/disabled/unknown)، `describeUser` (Google/GitHub/Telegram)، `buildRedirectUrl`، پل توکن، `apiHeaders`.
  - `server/telegramAuth.test.ts` — ۱۸ تست شامل **HTTP واقعی**: `configured` صادقانه، ۵۰۳ بدون توکن ربات، ۴۰۱ با امضای جعلی، ۴۰۳ برای لیست سفید، ساخت کاربر جدید + `token_hash` با Admin API شبیه‌سازی‌شده، و ۵۰۲ با پیام روشن در قطعی شبکه.
  - `server/supabaseJwt.test.ts` — امضا/انقضا/alg، و HTTP واقعی: بدون توکن ۴۰۱ → با JWT ۲۰۰ و هدر کاربر.
- ۱۰ چک DOM جدید (`npm run test:dom`): چیپ حساب، باز شدن منو، `/login` با سه روش، `/account`، وضعیت صادقانه‌ی providerها، `GET /api/auth/config`.

## ۶) آنچه تأیید نشد (صادقانه)

1. **دور کامل OAuth با مرورگر** — این سندباکس هیچ مسیر شبکه‌ای به `*.supabase.co` ندارد (`curl` مقدار `000` می‌دهد). پس ورود واقعی Google/GitHub اینجا قابل تمرین نبود.
2. **client_id/secret گوگل و گیت‌هاب** — API و کانکتور Supabase فقط toggle/expiry را عوض می‌کنند، نه credentialها. باید در داشبورد وارد شود.
3. **Redirect allow list** — دامنه‌ی این پیش‌نمایش (`https://<port>-<id>.e2b.app`) و دامنه‌ی نهایی باید به `Authentication → URL Configuration` اضافه شوند.
4. **ربات تلگرام** — ساخت ربات با BotFather و ست‌کردن `TELEGRAM_BOT_TOKEN` (+`TELEGRAM_BOT_USERNAME`) کار انسانی است.

### دستورهای دقیق برای همین چهار مورد

```
Supabase Dashboard → Project konkred-xyz
  Authentication → Providers → GitHub   → Client ID/Secret اپ GitHub OAuth → Enable
  Authentication → Providers → Google   → Client ID/Secret از Google Cloud  → Enable
  Authentication → URL Configuration    → Site URL + Redirect allow list:
        https://www.konkred.xyz/**
        https://<preview>.e2b.app/**
        http://localhost:24678/**
  Edge Functions → telegram-auth → Secrets:
        TELEGRAM_BOT_TOKEN = <از BotFather>
        TELEGRAM_BOT_USERNAME = <نام ربات بدون @>
        (اختیاری) TELEGRAM_ALLOWED_IDS = 11111111,22222222
```

پس از هر تغییر، در اپ دکمه‌ی «بررسی دوباره‌ی وضعیت» در `/account` یا `/login` را بزنید؛
وضعیت هر provider مستقیم از `GET /auth/v1/settings` و `GET /api/auth/telegram` خوانده می‌شود.

## ۷) تأیید دستی سریع

```bash
npm run lint && npm test
curl -s localhost:24678/api/auth/config | jq
curl -s localhost:24678/api/auth/telegram | jq        # configured / missing / bot_username
# امضای جعلی باید ۴۰۱ بدهد:
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:24678/api/auth/telegram \
  -H 'content-type: application/json' -d '{"id":1,"auth_date":1,"hash":"'$(printf 'a%.0s' {1..64})'"}'
```
