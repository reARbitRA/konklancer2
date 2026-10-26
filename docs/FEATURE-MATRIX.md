# ماتریس قابلیت‌ها — چه چیزی واقعاً کار می‌کند

این سند جای «ادعا» می‌نشیند: برای هر قابلیتی که در README، specs/، tasks/ یا UI وجود دارد،
وضعیت واقعی + نحوه‌ی تأیید نوشته شده است. اگر چیزی کار نمی‌کند، همین‌جا با کلمه‌ی «نشد» آمده،
نه با عبارت مبهم.

آخرین به‌روزرسانی: ۲۰۲۶-۱۰-۲۶ · شاخه `arena/c7be3325-konklancer2`

## ۱) قابلیت‌هایی که در این نشست پیاده و تأیید شدند

| قابلیت | spec/task | بک‌اند | UI | تأیید |
|---|---|---|---|---|
| ثبت پیشنهاد + ثبت نتیجه (برد/باخت/بی‌پاسخ/انصراف) | SPEC-005 / T-005 | `POST/GET/PATCH/DELETE /api/bids`، SQLite `data/konklancer.db` (`node:sqlite`) | صفحه‌ی «کارنامه» (`/analytics`) با دکمه‌های نتیجه روی هر پیشنهاد؛ «ثبت پیشنهاد ←» در قایق پایپ‌لاین | `server/bidRoutes.test.ts` (HTTP واقعی) + ۱۰ چک DOM (`clicking برنده persists the outcome to SQLite`) |
| آمار نرخ برد به تفکیک پلتفرم/دسته/بازه‌ی بودجه + برچسب «نمونه ناکافی» زیر ۳۰ نتیجه | SPEC-005 R2/R3 | `GET /api/stats` | جدول‌های بروتالیست + نوار نرخ برد + هشدار صادقانه | `server/outcomes.test.ts` + چک‌های DOM («analytics shows the insufficient-sample warning honestly») |
| ذخیره‌سازی پایدار روی سرور (نه فقط مرورگر) | SPEC-005 | SQLite، جداول `bids` و `projects_seen` | پنل «ذخیره‌سازی» در کارنامه | فایل `data/konklancer.db` پس از اولین درخواست ساخته می‌شود (تأیید با `ls`) |
| یادآور مرورگر برای پیشنهاد بیش از ۴ ساعت بی‌نتیجه | SPEC-002 / T-002 AC-1 | منطق خالص در `src/utils/reminders.ts`، زمان‌بندی هر ۶۰ ثانیه در App | کلید فعال‌سازی + نمایش وضعیت مجوز در تنظیمات، بخش «یادآور و امنیت API» | ۷ تست واحد در `server/reminders.test.ts` |
| احراز هویت اختیاری API با `KONKLANCER_API_TOKEN` | SPEC-003 R5 | میدل‌ور `server/apiAuth.ts` روی `/api` (هدر `x-api-token` / `Bearer` / `?token=`) | فیلد «توکن API سرور» در تنظیمات؛ توکن با هدر فرستاده می‌شود | `server/bidRoutes.test.ts` («درخواست بدون توکن ۴۰۱ می‌گیرد») |
| اعلان تلگرام برای پروژه‌های بالای آستانه | SPEC-004 R7 | `server/notifier.ts` + `GET /api/alerts/status`، ارسال پس از هر اسکن موفق | پنل «اعلان‌ها» در کارنامه با دلیل خاموش‌بودن | ۴ تست `outcomes.test.ts` + چک DOM «analytics explains telegram alert state» |
| رندر مرورگری برای سایت‌های JS-محور | SPEC-007 (شکاف قبلی) | `render_html_with_browser` در اسکنر (Playwright، robots + محدودیت دامنه) | فلگ `--browser` روی `scan/probe/autodetect/autoscan` و env `KONKLANCER_BROWSER=1` | ۴ تست آفلاین `scanner/tests/test_browser_mode.py`؛ **اجرای واقعی مرورگر در این محیط تأیید نشد** (Playwright نصب نیست) |
| زمان‌بند اسکن قابل کنترل از UI (توقف/فواصل رصد) — قبلاً state محلی و بی‌اثر بود | SPEC-004/007 §2.2 | `POST/GET /api/scheduler` + `POST /api/scheduler/run-now`، وضعیت در SQLite (`settings.scan_scheduler`) پایدار می‌ماند | دکمه‌ی توقف/روشن و انتخاب بازه در صفحه‌ی سایبورگ + نمایش آخرین اجرا | ۸ تست `server/scheduler.test.ts` + چک DOM «engine toggle changes real scheduled-scan state» + تأیید curl/SQLite |
| ورود کاربر با **Google / GitHub / Telegram** روی Supabase Auth | AUTH-001 (درخواست کاربر) | پروژه‌ی Supabase `rwuyuhjkitcnekpwmoml`؛ جدول‌های `profiles` + `telegram_links` با RLS؛ Edge Function `telegram-auth` v2؛ مسیر هم‌ارز `GET/POST /api/auth/telegram` روی سرور Node | چیپ حساب در هدر، مودال ورود، مسیرهای `/login` و `/account`، گیت اختیاری با `VITE_AUTH_REQUIRED` | ۳۱ تست Node (`server/authClient.test.ts` + `server/telegramAuth.test.ts` + `server/supabaseJwt.test.ts`) + ۱۰ چک DOM جدید؛ **ورود واقعی OAuth/Telegram در این سندباکس تأیید نشد** چون هیچ مسیر شبکه‌ای به `*.supabase.co` نیست و client_id/secret هنوز در داشبورد ست نشده |
| احراز هویت دوگانه‌ی API: توکن محلی **یا** JWT سوپابیس | AUTH-002 | میدل‌ور `server/supabaseJwt.ts` پیش از `createApiTokenGuard`؛ `GET /api/auth/config` برای وضعیت | `apiFetch` توکن نشست را به‌صورت `Authorization: Bearer` می‌فرستد | ۱۵ تست (شامل HTTP واقعی: بدون توکن ۴۰۱، با JWT ۲۰۰، توکن بد ۴۰۱ با هدر `x-konklancer-jwt`) |
| ذخیره‌سازی مقاوم مرورگر (WebView اندروید) | — | `src/utils/safeStorage.ts` که قبلاً بی‌استفاده بود، اکنون در خواندن/نوشتن jobs و settings | — | `tsc` + اجرای کامل DOM smoke |

## ۲) قابلیت‌هایی که از قبل بودند و دوباره تأیید شدند

| قابلیت | تأیید |
|---|---|
| فید واقعی اسکنر (`/api/jobs` با `source: scanner`)، اسکن دستی/ابری/همگام‌سازی | `/api/jobs` با ۱۰۱۸ پروژه؛ دکمه‌های UI در DOM smoke |
| درخت فایل، ادیتور هایلایت‌شده، جست‌وجوی پروژه در استودیو | ۱۵ چک DOM + ۱۰ تست واحد |
| موتور تحویل ۳ مرحله‌ای + ARBITER + خروجی ZIP/HTML/Word | گردش استودیو در DOM smoke |
| تحلیل AI / پروپوزال / دسته‌بندی (با کلید) | اندپوینت‌ها فعال؛ بدون کلید به‌صورت صادقانه ۵۰۳ می‌دهند |
| مدیریت گردش‌کار GitHub، دیسپچر، سوییچر مدل زنده | مونتاژ + بازشدن در DOM smoke |
| طراحی بروتالیست همه‌ی دیالوگ‌ها/صفحه‌ها | گارد `server/uiDesignGuard.test.ts` + ممیزی DOM در ۷ صفحه/دیالوگ |

## ۳) شکاف‌هایی که هنوز باقی‌اند (به‌صراحت)

| مورد | وضعیت | چرا |
|---|---|---|
| اجرای واقعی Playwright با مرورگر در این محیط | تأیید نشده | نصب مرورگر Playwright به CDN بیرون از دسترس این سندباکس نیاز دارد. کد + رفتار «نصب نیست» تست شده؛ اجرای واقعی باید روی ماشین مالک انجام شود. |
| تأیید انتخابگرهای پارس‌کدرز روی HTML زنده | تأیید نشده | این محیط به سایت‌های ایرانی دسترسی TCP ندارد (از قبل مستند بود). |
| اسکن واقعی تلگرام/پلتفرم‌ها | تأیید نشده | همان دلیل شبکه؛ مسیر `--html` جایگزین آفلاین است. |
| `GET /download/KonkLancer-Studio.apk` | فایل نیست | اندپوینت صادقانه ۴۰۴ می‌دهد؛ ساخت APK به Android SDK/Gradle نیاز دارد (`npm run android:apk`) که در این محیط نیست. هیچ دکمه‌ای در UI به آن لینک نیست. |
| `freelance_pro_engine.py` (اسکریپت قدیمی با auto-bid) | حذف نشده | سؤال باز SPEC-006 D4؛ اجرا نمی‌شود و در `npm start` دخالتی ندارد. حذفش تصمیم مالک است. |
| ارسال پیشنهاد به پلتفرم‌ها | عمداً پیاده نشده | خارج از دامنه‌ی ایمنی پروژه (README بند اول). |
| فعال‌سازی providerهای Google/GitHub | نیاز به کار انسانی | API قابل‌دسترس Supabase (و کانکتور) فقط toggle/expiry را تغییر می‌دهد و فیلد `client_id`/`secret` را نمی‌پذیرد؛ باید در Dashboard → Authentication → Providers وارد شود. UI این وضعیت را صادقانه «تنظیم نشده» نشان می‌دهد و دکمه‌ی موفقیت جعلی ندارد. |
| ویجت تلگرام | نیاز به BotFather | `TELEGRAM_BOT_TOKEN` (secret پروژه) و نام کاربری ربات لازم است؛ تا آن زمان مسیر `/api/auth/telegram` صادقانه `configured:false` + `missing` برمی‌گرداند. |
| دور واقعی OAuth (رفت‌وبرگشت مرورگر) | تأیید نشده | سندباکس به `*.supabase.co` شبکه ندارد؛ فقط توابع خالص و مسیرهای HTTP محلی تست شده‌اند. دامنه‌ی پیش‌نمایش هم باید به Redirect allow list اضافه شود. |

## ۴) چطور خودت تأیید کنی

یک دستور برای همه‌چیز (به‌جز اسکنر پایتون):

```bash
npm run verify      # lint + ۱۳۹ تست Node + ۱۰۱ چک DOM روی سرور زنده
```

جزئیات:

```bash
npm test            # ۱۳۹ تست Node (سرور + منطق مشترک)
npm run test:dom    # ۱۰۱ چک DOM روی بیلد واقعی + سرور زنده
npm run lint        # tsc --noEmit
python3 -m pytest -q scanner/tests   # ۵۸ تست اسکنر
curl -s localhost:3000/api/health
curl -s -X POST localhost:3000/api/bids -H 'content-type: application/json' \
  -d '{"projectId":"p1","platform":"ponisha","title":"نمونه","budgetBid":5000000}'
curl -s localhost:3000/api/stats
curl -s localhost:3000/api/auth/config          # وضعیت احراز هویت دوگانه
curl -s localhost:3000/api/auth/telegram        # پیکربندی ورود تلگرام (configured/missing)
```

مسیر کامل راه‌اندازی و تأیید ورود: `docs/AUTH.md`.
