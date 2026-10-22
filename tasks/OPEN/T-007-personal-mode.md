---
id: T-007
title: Personal mode — scanner feed wired to UI, env config, scheduling, browser-save path (SPEC-004 + SPEC-007)
spec: SPEC-007
status: DONE
branch: arena/bb8cb4b4-konklancer
verification: "npm test && npx tsc --noEmit && npm run build && python3 -m pytest -q scanner/tests && curl /api/jobs (source=scanner) && POST /api/bridge/trigger-scan"
---
## Done (session-005: دامنه‌ی همه‌ی دسته‌ها + اسکنر واقعی)
- `shared/taxonomy.json` + آینه‌های `shared/taxonomy.ts` و `scanner/taxonomy.py`: ۱۲ دسته + «سایر»،
  کلیدواژه‌ی «قوی» با وزن ۸، تشخیص ترکیبی وزنی (بدون تسلط اشاره‌های جانبی).
- `scanner/autoparse.py`: کشف خودکار ساختار فهرست (هم‌امضا + هم‌فرند)، تفکیک ستون با `:nth-of-type`
  (رفع باگ خواندن ستون عنوان به‌جای بودجه در جدول‌های بدون کلاس)، نرمال‌سازی ارقام فارسی.
- اسکنر: `probe --platform --save`، `autodetect --platform|--source --html|--url --save`،
  `autoscan [--html] [--save]`، `--categories` و `--auto` روی `scan`/`parse-file`، `list` با فهرست دسته‌ها.
- `platforms.json`: نامزدهای نشانی و انتخابگر (تأییدنشده) برای پارس‌کدرز/پونیشا/کارلنسر از کد عمومی
  `reARBitRA/all-them-bots`؛ `enable` پلتفرم نامزددار را هم می‌پذیرد.
- `server/scannerBridge.ts`: `categorize` با تاکسونومی، امتیاز خنثی برای کلیدواژه‌ی بی‌مطابقت،
  امتیاز تناسب دسته با AI، فیلتر دسته فقط با درخواست صریح، `--auto` در آرگومان‌های اسکن،
  `readScanTargets` با «نامزد نشانی».
- `server.ts`: `categoryFilter: all|explicit` و `categories` در `/api/jobs`، وضعیت دسته‌ها در
  `/api/bridge/status`، `categorizeJobServer` با prompt تاکسونومی، قالبي دمو با کلیدهای تاکسونومی.
- UI: پیل‌های دسته از `ALL_CATEGORIES` (شامل ترجمه/گرافیک/ویدیو/صدا/...)، چیپ دسته روی هر کارت،
  `geminiCategorizer` و `enrichJob` با دسته‌های مشترک (حذف پیش‌فرض «Backend»).
- اسناد: `scanner/README.md` (سه لایه‌ی اسکن + دسته‌ها)، `docs/PERSONAL-SETUP.md` (مسیر الف = HTML مرورگر
  با کشف خودکار؛ مسیر ج = probe/autoscan)، `.env.example` (`KONKLANCER_SCAN_CATEGORIES`, `..._AUTO`).
- تست‌ها: `scanner/tests/test_autoparse.py` و `test_taxonomy.py` (۱۴ تست تازه) + ۵ تست تازه‌ی Node.

## Done
- `server/scannerBridge.ts`: خواندن JSONL، نگاشت `Project → FeedJob` (بودجه‌ی فارسی/لاتین، ریال، بازه‌ها،
  تعداد پیشنهاد)، امتیاز پیش‌فیلتر ۰–۱۰۰ با دلایل، فیلتر include/exclude، `readScanTargets`،
  `readScanConfig`، `runScanner` با قفل.
- `server.ts`: `/api/jobs` = فید واقعی با `source: scanner|demo|empty`؛ `POST /api/bridge/trigger-scan`
  و رویداد سوکت `scan:trigger` اسکن واقعی را اجرا و `job:new` / `scan:done` پوش می‌کنند؛
  `/api/bridge/status` صادقانه (بدون latency ساختگی)؛ اسکن دوره‌ای اختیاری؛ لاگ وضعیت در راه‌اندازی.
- فرانت‌اند: `FeedStatusBar` (منبع فید، زمان آخرین اسکن، دکمه‌ی اسکن)، حذف داده‌ی ساختگی از مسیر
  پیش‌فرض، لینک «صفحه‌ی پروژه» و چیپ امتیاز فید روی کارت‌ها، نمایش شفاف وضعیت در `AutoPilotPanel`.
- اسکنر: `enable`/`disable` برای پلتفرم و کانال، `parse-file --out` و `parse-telegram-file` (مسیر
  «ذخیره‌ی صفحه در مرورگر»)، تفکیک پیام توقف robots (منع/۵xx/شبکه)، `list` گویاتر.
- اسناد: `docs/PERSONAL-SETUP.md` (راه‌اندازی شخصی گام‌به‌گام)، به‌روزرسانی README و scanner/README.
- تست‌ها: ۱۹ تست Node (۱۲ تازه) + ۱۹ تست Python (۴ تازه).
## Verified
- `npm test` ۱۹/۱۹ · `pytest scanner/tests` ۱۹/۱۹ · `tsc --noEmit` بدون خطا · `vite build` موفق.
- E2E: فید ساختگی در `/tmp` با ۳ پروژه → `/api/jobs` با `source: scanner` و امتیاز/دلایل درست؛
  `POST /api/bridge/trigger-scan` اسکنر واقعی را اجرا کرد (spawn + robots + خروج تمیز) و
  `parse-file --out` دو رکورد تازه به فید اضافه کرد که بی‌درنگ در API دیده شد.
## Not verified
- **تأیید انتخابگرها/نامزدها روی HTML زنده‌ی هیچ سایتی انجام نشده** — این محیط به پارس‌کدرز/پونیشا/کارلنسر/t.me
  دسترسی TCP ندارد. تأیید باید روی ماشین مالک پروژه با `probe`/`autoscan` انجام شود.
- سایت‌های JS-محور (احتمالاً کارلنسر): Playwright پیاده نشده؛ مسیر `--html` جایگزین است.
- اسکن واقعی یک پلتفرم/کانال (شبکه‌ی محیط توسعه به t.me و سایت‌های ایرانی دسترسی ندارد؛ نیاز به
  اجرای مالک پروژه روی ماشین خودش).
## Open
- SPEC-007 در وضعیت DRAFT است و نیاز به تأیید مالک دارد (پیش‌فرض UI تغییر کرده است).
- `SPEC-004 R7` (اعلان تلگرام برای پروژه‌های بالای آستانه) هنوز پیاده نشده است.
- افزودن Playwright برای سایت‌های JS-محور (پیشنهاد تازه، خارج از دامنه‌ی این تسک).
