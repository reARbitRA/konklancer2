# Konklancer

ابزار کمکی برای فریلنسرها: مرور پروژه‌ها، تحلیل با هوش مصنوعی، و مدیریت وضعیت پیشنهادها.
این ابزار **هیچ کاری به‌صورت خودکار روی پلتفرم‌ها انجام نمی‌دهد** (ارسال پیشنهاد، ورود به حساب، یا تحویل خودکار کد وجود ندارد).

## پیش‌نیازها
- Node.js 22 یا بالاتر
- Python 3.10+ (فقط برای اسکنر، اختیاری)
- یک نمونه‌ی در حال اجرا از Konkred gateway (`gateway/` در [reARbitRA/konkred-AI-ecosystem](https://github.com/reARbitRA/konkred-AI-ecosystem)) و یک کلید آن

## راه‌اندازی
```bash
npm install --legacy-peer-deps   # یک تضاد peer بین esbuild و vite وجود دارد؛ react-is هم لازم است
cp .env.example .env             # و مقادیر را پر کنید
npm start                        # http://localhost:3000
```

### متغیرهای محیطی (`.env`)
| نام | الزامی | توضیح |
|-----|--------|-------|
| `KONKRED_GATEWAY_URL` | بله، برای تحلیل AI | آدرس gateway کانکرد (`gateway/` در [reARbitRA/konkred-AI-ecosystem](https://github.com/reARbitRA/konkred-AI-ecosystem)). |
| `KONKRED_API_KEY` | بله، برای تحلیل AI | یکی از کلیدهای `USERS_JSON` روی gateway. |
| `KONKRED_PRIVACY` | خیر | `any` (پیش‌فرض) یا `private` (فقط providerهایی که روی داده آموزش نمی‌دهند). |
| `KONKRED_TIMEOUT_MS` / `KONKRED_CACHE_TTL_HOURS` | خیر | مهلت هر تماس (پیش‌فرض ۶۰ ثانیه) و عمر کش تحلیل (پیش‌فرض ۱۶۸ ساعت). |
| `PORT` | خیر | پیش‌فرض `3000` |
| `KONKLANCER_DEMO` | خیر | اگر `1` باشد، پروژه‌های ساختگی نمایشی تولید می‌شوند. پیش‌فرض خاموش. |
| `KONKLANCER_API_TOKEN` | خیر | اگر تنظیم شود (حداقل ۸ نویسه)، همه‌ی `/api/*` توکن می‌خواهند: هدر `x-api-token` یا `Bearer` یا `?token=`. توکن را در تنظیمات → «یادآور و امنیت API» هم وارد کنید. |
| `KONKLANCER_DB_PATH` | خیر | مسیر دیتابیس SQLite (پیش‌فرض `data/konklancer.db`، مسیر `:memory:` هم پذیرفته است). |
| `KONKLANCER_TELEGRAM_BOT_TOKEN` / `KONKLANCER_TELEGRAM_CHAT_ID` | خیر | اعلان پروژه‌های بالای آستانه در تلگرام (SPEC-004 R7). |
| `KONKLANCER_ALERT_THRESHOLD` | خیر | آستانه‌ی امتیاز برای اعلان (پیش‌فرض ۸۵). |
| `KONKLANCER_BROWSER` | خیر | `1` = رندر صفحه با مرورگر واقعی Playwright برای سایت‌های JS-محور (نیازمند `pip install playwright && playwright install chromium`). |

**مدل‌ها:** Konklancer هیچ مدلی را به‌صورت ثابت انتخاب نمی‌کند. هر درخواست یک `taskType` دارد (`extraction` برای دسته‌بندی، `general` برای تحلیل و پروپوزال، `code-generation` برای کد)، و gateway بر اساس ظرفیت رایگان کلیدها و اولویت هر وظیفه مدل را انتخاب می‌کند.

**پاسخ شبیه‌ساز:** اگر هیچ provider زنده‌ای در دسترس نباشد، gateway پاسخ «شبیه‌ساز» برمی‌گرداند. Konklancer این پاسخ را خطا حساب می‌کند (`AI_UNAVAILABLE`) و هرگز آن را به‌عنوان تحلیل نشان نمی‌دهد.

### توکن گیت‌هاب
توکن فقط در `sessionStorage` مرورگر نگه‌داری می‌شود و با بستن تب پاک می‌شود. مخزن‌های ساخته‌شده پیش‌فرض **خصوصی** هستند؛ انتشار عمومی نیاز به انتخاب صریح دارد.

## اسکریپت‌ها
| دستور | کار |
|------|-----|
| `npm start` | اجرای سرور (Express + Socket.io + Vite) |
| `npm run dev` | مثل start، برای توسعه |
| `npm run build` | ساخت نسخه تولیدی در `dist/` |
| `npm run lint` | بررسی نوع‌ها با `tsc --noEmit` |
| `npm test` | تست‌های سرور و کلاینت gateway (Node) |
| `npm run test:scanner` | تست‌های آفلاین اسکنر (Python) |
| `npm run scan` | یک اسکن فقط‌خواندنی طبق تنظیمات `.env` (`KONKLANCER_SCAN_*`) |

## اسکنر پروژه (فقط‌خواندنی) و فید واقعی
پوشه `scanner/` پروژه‌های عمومی پلتفرم‌ها و کانال‌های تلگرام را می‌خواند و در `scanner/out/projects.jsonl` ذخیره می‌کند. جزئیات، قواعد ایمنی و مراحل کالیبراسیون در [scanner/README.md](scanner/README.md) است.

`GET /api/jobs` همان خروجی اسکنر را به‌صورت فید UI برمی‌گرداند (`source: "scanner"`)، هر پروژه یک
امتیاز پیش‌فیلتر ۰ تا ۱۰۰ می‌گیرد و `POST /api/bridge/trigger-scan` یک اسکن واقعی (با قفل) اجرا و
پروژه‌های تازه را با Socket.io به UI پوش می‌کند. اگر فایل اسکنر خالی باشد، UI **هیچ داده‌ی ساختگی
نشان نمی‌دهد** (حالت دمو فقط با `KONKLANCER_DEMO=1`).

### راه‌اندازی برای استفاده‌ی شخصی
گام‌به‌گام (نصب، موتور AI، فعال‌کردن تلگرام یا یک پلتفرم، اسکن دوره‌ای، تنظیم سلیقه و عیب‌یابی):
**[docs/PERSONAL-SETUP.md](docs/PERSONAL-SETUP.md)**.

**اگر ماشین/شبکه‌ی شما به سایت‌های فریلنسری دسترسی ندارد:** همان اسکنر روی **رانرهای گیت‌هاب** اجرا
می‌شود و نتیجه در فید می‌آید (ورک‌فلوی `.github/workflows/scanner-feed.yml`):

```bash
# در .env:  KONKLANCER_CLOUD_FEED_REPO="reARbitRA/konklancer" و KONKLANCER_CLOUD_FEED_REF="<برنچ>"
curl -s -X POST localhost:3000/api/bridge/cloud-scan | jq .   # اجرای اسکن واقعی روی گیت‌هاب
curl -s -X POST localhost:3000/api/bridge/sync-feed  | jq .   # فقط کشیدن آخرین فید
```
در UI هم دو دکمه‌ی «اسکن ابری» و «همگام‌سازی» در نوار وضعیت فید همین کار را می‌کنند.

```bash
python -m scanner.konklancer_scan list                            # چه چیزی اسکن‌شدنی است + فهرست دسته‌ها
python -m scanner.konklancer_scan autoscan --platform parscoders,ponisha --save   # اسکن واقعی + کشف خودکار ساختار
python -m scanner.konklancer_scan autoscan --platform ponisha --html SAVED.html   # مسیر بدون شبکه (HTML مرورگر)
python -m scanner.konklancer_scan enable --telegram workarc       # سریع‌ترین منبع: کانال عمومی تلگرام
# .env → KONKLANCER_SCAN_PLATFORMS="parscoders,ponisha" و/یا KONKLANCER_SCAN_TELEGRAM="1"
# سپس دکمه‌ی «اسکن زنده» در UI
```

### دسته‌بندی: «هر چیزی که AI می‌تواند تولید کند»
دسته‌ها در `shared/taxonomy.json` (منبع واحد برای اسکنر، سرور و UI) تعریف شده‌اند: ترجمه، گرافیک/لوگو/بروشور،
تصویر و روتوش، ویدیو و انیمیشن، صدا و گویندگی، اسناد و پاورپوینت، محتوا و نویسندگی، مارکتینگ و سئو،
داده و اکسل، رابط کاربری، اتوماسیون/ربات، وب و اپلیکیشن، و «سایر». **هیچ دسته‌ای پیش‌فرض حذف نمی‌شود**:
تا وقتی `KONKLANCER_SCAN_INCLUDE` یا `KONKLANCER_SCAN_CATEGORIES` را پر نکنید، همه‌ی پروژه‌ها (کدنویسی و
غیرکدنویسی) خوانده و در فید نوشته می‌شوند و دسته فقط برای نمایش/فیلتر UI استفاده می‌شود.

## وضعیت پروژه و قواعد
- هر تغییر باید به یک spec تاییدشده در `specs/` وصل باشد (ببینید `AGENTS.md`).
- بازبینی وضعیت فعلی: [docs/AUDIT-2026-10-10.md](docs/AUDIT-2026-10-10.md).
- `freelance_pro_engine.py` قدیمی است و اجرا نمی‌شود.

## کارنامه‌ی پیشنهادها (قابلیت تازه)
`POST /api/bids` ثبت دستی پیشنهاد، `PATCH /api/bids/:id` ثبت نتیجه، `GET /api/stats` نرخ برد
به تفکیک پلتفرم/دسته/بازه‌ی بودجه. داده در SQLite (`data/konklancer.db`) ذخیره می‌شود و صفحه‌ی
«کارنامه» در UI (`/analytics`) آن را نشان می‌دهد. تا کمتر از ۳۰ نتیجه‌ی بسته‌شده، نرخ برد با
برچسب «نمونه ناکافی» نمایش داده می‌شود (SPEC-005 R2). هیچ پیشنهادی به‌صورت خودکار به پلتفرم
فرستاده نمی‌شود.

**زمان‌بند اسکن:** از صفحه‌ی «سایبورگ» می‌توانید اسکن دوره‌ای را روشن/خاموش کنید و بازه‌اش را
(۱ تا ۲۴۰ دقیقه) تغییر دهید؛ وضعیت در `data/konklancer.db` پایدار می‌ماند
(`GET/POST /api/scheduler`، `POST /api/scheduler/run-now`).

**یادآور مرورگر:** پیشنهادی که بیش از ۴ ساعت در وضعیت ارسالی بماند، اعلان مرورگر می‌دهد
(تنظیمات → «یادآور و امنیت API»).

**ماتریس کامل قابلیت‌ها و شکاف‌های باقی‌مانده:** [docs/FEATURE-MATRIX.md](docs/FEATURE-MATRIX.md).

## محدودیت‌های فعلی
- انتخابگرهای **کارلنسر** و **پونیشا** روی نمونه‌ی HTML واقعی تأیید شده‌اند (`scan_selectors_verified` در `platforms.json`)؛ انتخابگرهای **پارس‌کدرز** هنوز تأییدنشده‌اند (صفحه در اجرای رانر تایم‌اوت داد) و با `KONKLANCER_HTTP_TIMEOUT=45` دوباره تلاش می‌شود (SPEC-004 R3).
- سایت‌های JS-محور یا ضدربات (احتمالاً کارلنسر) با `autoscan` خالی برمی‌گردند؛ Playwright پیاده نشده و مسیر جایگزین، ذخیره‌ی صفحه در مرورگر و `autoscan --html` است.
- احراز هویت `/api/*` **پیاده شده** ولی اختیاری است: فقط با تنظیم `KONKLANCER_API_TOKEN` فعال می‌شود (SPEC-003 R5).
- پیش‌فیلتر قانون‌محور ۰–۱۰۰ در `server/scannerBridge.ts` و هم‌ارز کلاینتی آن در `src/services/standaloneFeed.ts` هست.
- نتیجه‌ی پیشنهادها در SQLite ذخیره می‌شود؛ فهرست پروژه‌ها همچنان فایل JSONL اسکنر است و jobs در مرورگر نگه‌داری می‌شوند.
- رندر مرورگری (Playwright) برای سایت‌های JS-محور پیاده شده ولی در محیط توسعه تأییدنشده است (بدون مرورگر نصب‌شده).
