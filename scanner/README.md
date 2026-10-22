# konklancer scanner

اسکنر فقط‌خواندنی برای جمع‌آوری **لیست پروژه‌های عمومی** از پلتفرم‌های فریلنسری ایران و کانال‌های تلگرامی پروژه.

## فایل‌ها

| فایل | کاربرد |
|---|---|
| `platforms.json` | فهرست اصلاح‌شده پلتفرم‌ها با وضعیت، کمیسیون، آمار و منبع هر مورد |
| `telegram_sources.json` | کانال‌های تلگرامی پیدا شده؛ `scan_enabled` پیش‌فرض `false` است |
| `konklancer_scan.py` | اسکنر (CLI) |
| `tests/` | تست‌های آفلاین با فیکسچرهای ساختگی |
| `out/` | خروجی‌ها (در `.gitignore`) |

## نصب و اجرای تست

```bash
pip install httpx beautifulsoup4 pytest
python -m pytest -q scanner/tests
```

## دستورها

```bash
# --- مشاهده ---
python -m scanner.konklancer_scan list        # وضعیت پلتفرم‌ها، کانال‌ها و دسته‌های پشتیبانی‌شده

# --- مسیر اصلی: اسکن واقعی صفحه‌ی زنده بدون کالیبراسیون دستی ---
python -m scanner.konklancer_scan autoscan --platform parscoders,ponisha --save
python -m scanner.konklancer_scan autoscan --platform parscoders --pages 2 --delay 10

# --- کشف/تأیید ساختار صفحه ---
python -m scanner.konklancer_scan probe --platform parscoders --save        # امتحان نامزدها روی صفحه‌ی زنده
python -m scanner.konklancer_scan autodetect --platform ponisha --url https://ponisha.ir/projects
python -m scanner.konklancer_scan autodetect --platform ponisha --html SAVED.html --save  # از فایل مرورگر

# --- اسکن دوره‌ای (همان چیزی که سرور اجرا می‌کند) ---
python -m scanner.konklancer_scan scan --platform parscoders,ponisha --pages 2 --auto
python -m scanner.konklancer_scan scan --telegram

# --- فیلترها (پیش‌فرض: بدون فیلتر ⇒ همه‌ی دسته‌ها) ---
python -m scanner.konklancer_scan scan --include پایتون,ترجمه,لوگو     # فقط همین کلیدواژه‌ها
python -m scanner.konklancer_scan scan --categories translation,graphic # فقط این دسته‌ها
python -m scanner.konklancer_scan scan --exclude «پروژه دانشجویی»

# --- مسیر بدون شبکه (وقتی سایت ربات‌ها را می‌بندد) ---
python -m scanner.konklancer_scan parse-file --platform parscoders --html SAVED.html \
    --selectors-json '{"item":"...","title":"..."}' --out scanner/out/projects.jsonl
python -m scanner.konklancer_scan autoscan --platform ponisha --html SAVED.html
python -m scanner.konklancer_scan parse-telegram-file --channel workarc --html tg.html --out scanner/out/projects.jsonl

# --- فعال/غیرفعال کردن منبع ---
python -m scanner.konklancer_scan enable  --platform parscoders  # با نامزد نشانی یا انتخابگر ثبت‌شده
python -m scanner.konklancer_scan enable  --telegram workarc
python -m scanner.konklancer_scan disable --telegram workarc
```

## سه لایه‌ی «اسکن واقعی»

| لایه | دستور | چه زمانی |
|---|---|---|
| ① کشف خودکار DOM | `autoscan --platform X` | پیش‌فرض؛ صفحه‌ی زنده را می‌خواند، ساختار را خودش پیدا می‌کند و در فید می‌نویسد. بدون انتخابگر دستی |
| ② تأیید و ذخیره‌ی نامزدها | `probe --platform X --save` | وقتی می‌خواهید انتخابگر تأییدشده در `platforms.json` ماندگار شود |
| ③ HTML ذخیره‌شده در مرورگر | `autoscan --html FILE` یا `autodetect --html FILE --save` | سایت JS-محور یا ضدربات است؛ داده‌ی واقعی بدون هیچ درخواست خودکار |

کشف ساختار (`scanner/autoparse.py`) دو الگو را می‌بیند: عناصر هم‌امضا (`div.project-card`) و
لیست‌های هم‌فرند (`tbody > tr` یا `li.item` با کلاس‌های متفاوت مثل `odd/even`). فیلدهای بودجه و
تعداد پیشنهاد از روی الگوی متن پیدا می‌شوند و در جدول‌های بدون کلاس با `:nth-of-type` تفکیک می‌شوند
تا ستون عنوان به‌اشتباه به‌عنوان بودجه خوانده نشود.

## دسته‌بندی: هر چیزی که AI می‌تواند تولید کند

دسته‌ها در `shared/taxonomy.json` (منبع واحد برای اسکنر، سرور و UI) تعریف شده‌اند:
ترجمه، گرافیک/لوگو/بروشور، تصویر و روتوش، ویدیو و انیمیشن، صدا و گویندگی، اسناد و پاورپوینت،
محتوا و نویسندگی، مارکتینگ و سئو، داده و اکسل، رابط کاربری، اتوماسیون/ربات، وب و اپلیکیشن، و «سایر».

- **هیچ دسته‌ای پیش‌فرض حذف نمی‌شود.** تا وقتی `--include` یا `--categories` ندهید، همه‌ی پروژه‌ها در فید نوشته می‌شوند.
- دسته‌ی هر پروژه در همان لحظه‌ی ساخت رکورد حساب و در فیلد `category` نوشته می‌شود.
- کلیدواژه‌های «قوی» (نام خودِ محصول: ترجمه، لوگو، گویندگی، پاورپوینت...) وزن ۸ دارند تا اشاره‌های
  جانبی مثل «فروشگاه اینترنتی» دسته‌ی واقعی پروژه را عوض نکند.

`parse-file --out` و `parse-telegram-file` مسیر «صفحه را در مرورگر ذخیره کن و همان‌جا تجزیه کن» را
پوشش می‌دهند: بدون هیچ درخواست خودکار به سایت، رکوردها در فید JSONL نوشته و در UI دیده می‌شوند
(جزئیات: `docs/PERSONAL-SETUP.md`).

پیام‌های توقف در `fetch_html` تفکیک شده‌اند: منع صریح `robots.txt`، خطای ۵xx و خطای شبکه (بی‌دسترسی)
هر کدام پیام جدا دارند؛ در هر سه حالت آن میزبان برای همان اجرا کنار گذاشته می‌شود.

## وضعیت انتخابگرها و کالیبراسیون

`scan_selectors` ماندگار برای هیچ سایتی «تأییدشده» ثبت نشده است، چون ساختار HTML واقعی باید از روی
صفحه‌ی زنده خوانده شود و این محیط توسعه به سایت‌های ایرانی دسترسی شبکه‌ای ندارد. اما اسکن به
انتخابگر ذخیره‌شده **وابسته نیست**:

1. برای پارس‌کدرز، پونیشا و کارلنسر «نامزدهای انتخابگر» (برگرفته از کد عمومی مخزن
   `reARBitRA/all-them-bots`، **تأییدنشده**) در `platforms.json` هست؛ `probe` آن‌ها را روی صفحه‌ی
   زنده امتحان و بهترین را ذخیره می‌کند.
2. اگر هیچ نامزدی کار نکند، `autodetect`/`autoscan` ساختار را از خود HTML یاد می‌گیرد.
3. اگر سایت ضدربات/JS-محور بود، `--html` (صفحه‌ی ذخیره‌شده در مرورگر) همیشه کار می‌کند.

روند کالیبراسیون دستی (اگر خواستید انتخابگر ثابت داشته باشید):

1. `snapshot` یا `--html` بگیرید و فایل را در `scanner/out/snapshots/X.html` ذخیره کنید.
2. `autodetect --platform X --html FILE --save` را اجرا کنید و انتخابگر پیشنهادی را ببینید.
3. `parse-file` را روی همان فایل اجرا کنید تا خروجی را بررسی کنید.
4. فقط بعد از این مراحل، `scan_enabled` را `true` کنید (یا `enable --platform X`).

### Playwright

برای سایت‌هایی که محتوایشان با JS می‌آید، **هنوز** Playwright پیاده نشده است؛ مسیر جایگزین فعلی
`--html` است (صفحه را در مرورگر باز و با Ctrl+S ذخیره کنید).

## قواعد ایمنی که در کد اجرا می‌شوند

- **robots.txt** هر میزبان قبل از هر درخواست بررسی می‌شود. اگر robots با خطای ۵xx یا خطای شبکه پاسخ دهد، همه درخواست‌ها برای آن میزبان متوقف می‌شوند.
- **محدودیت نرخ**: پیش‌فرض ۸ ثانیه فاصله بین درخواست‌ها برای هر میزبان.
- **ریدایرکت خارج از دامنه** متوقف می‌کند. این قاعده برای دامنه‌هایی مثل `karishe.com` و `hamiworks.com` که اکنون به سایت‌های تبلیغاتی یا قمار می‌روند لازم است.
- **فقط GET**. هیچ فرم، پیشنهاد یا POST ارسال نمی‌شود.
- **بدون کوکی ورود**، بدون مرورگر شخصی و بدون دور زدن کپچا یا سیستم ضدربات.

## محدودیت‌های شناخته‌شده

- robots.txt با stdlib پیاده‌سازی شده و wildcard (مثل `/api*`) را کامل نمی‌فهمد. قبل از فعال‌سازی هر سایت، robots.txt آن را دستی بخوانید.
- تنظیمات `robots` در `platforms.json` در بررسی ۱۰ اکتبر ۲۰۲۶ انجام شد و ممکن است قدیمی شود.
- لنسریفای (پارس فریلنسر) با `active_flagged` علامت خورده و اسکن نمی‌شود، چون صفحه اصلی آن آگهی‌های جعل مدرک احراز هویت دارد.
- پروژه‌های تلگرام فقط از پیش‌نمایش عمومی (`t.me/s/`) خوانده می‌شوند. هر پیام پروژه بالقوه است و قبل از هر اقدامی باید بررسی شود.

## آنچه عمداً در این ابزار نیست

- ارسال خودکار پیشنهاد (Auto-Bid)
- ورود با حساب یا استفاده از مرورگر شخصی از طریق CDP
- دور زدن ضدربات، کپچا یا fingerprinting
- تحویل خودکار کد به کارفرما یا انتشار خودکار مخزن عمومی در GitHub

اسکریپت قدیمی `freelance_pro_engine.py` در ریشه مخزن این موارد را دارد. با توجه به شرایط استفاده پلتفرم‌ها، توصیه می‌شود اجرا نشود.
