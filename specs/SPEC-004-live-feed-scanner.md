---
id: SPEC-004
title: Live Job Feed from Scanner
type: spec
status: APPROVED
version: 0.1.0
tags: [scanner, feed, data]
---

# SPEC-004 — Live Job Feed from Scanner

## 1. Summary
منبع پروژه‌های برنامه، خروجی واقعی `scanner/out/projects.jsonl` است؛ فید ساختگی `BRIDGE_FEED_POOL` حذف یا فقط در حالت دمو فعال می‌شود.

## 2. Behavioral Contract
### 2.1 Interfaces
- `GET /api/jobs` → `{ jobs: FreelanceJob[], source: 'scanner'|'demo', scannedAt }`.
- `POST /api/bridge/trigger-scan` → اجرای `scanner scan` (یک بار، با قفل) و بازگرداندن تعداد پروژه‌های جدید.
- نگاشت `Project → FreelanceJob` شامل تخمین بودجه از `budget_text` (ارقام فارسی و لاتین) و `proposalsCount` از `bids_text`.

### 2.2 Rules
- R1. `broadcastNewJob` و `setInterval` ۴۵ ثانیه‌ای فقط وقتی `KONKLANCER_DEMO=1` باشد فعال‌اند؛ در غیر این صورت هیچ پروژه‌ای ساختگی منتشر نمی‌شود.
- R2. پروژه‌ها بر اساس `id` (هش URL) یکتا هستند؛ تکراری‌ها به‌روزرسانی نمی‌شوند.
- R3. فقط پروژه‌های `scan_enabled` در پلتفرم‌های فعال‌شده (SPEC-003 و `platforms.json`) از اسکنر می‌آیند.
- R4. نتیجه‌ی تحلیل AI با هش متن پروژه در `data/cache/` ذخیره می‌شود؛ تحلیل تکراری فراخوانی نمی‌شود.
- R5. پیش‌فیلتر امتیازدهی قبل از AI: امتیاز بر اساس بودجه، تعداد پیشنهادها، هم‌پوشانی مهارت‌ها، و تازگی. فقط پروژه‌های بالای آستانه (پیش‌فرض ۶۰) به `analyze-job` می‌روند.
- R6. مدل سبک (پیش‌فرض از `GEMINI_MODEL_FAST`) برای تشخیص/امتیاز؛ مدل قوی (`GEMINI_MODEL_PRO`) فقط برای پیشنهاد و کد.
- R7. اعلان تلگرام (اختیاری، `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID`) برای پروژه‌های بالای آستانه. تلاش مجدد با backoff برای خطاهای شبکه و 429.

## 3. Acceptance Criteria
- AC-1: Given `projects.jsonl` با ۳ خط، when `GET /api/jobs`، then ۳ job با `source: 'scanner'` برمی‌گردد.
- AC-2: Given `KONKLANCER_DEMO` تنظیم نشده، when ۴۵ ثانیه بگذرد، then هیچ `job:new` ساختگی منتشر نمی‌شود.
- AC-3: Given تحلیل یک پروژه دوبار، then دومی از کش خوانده می‌شود و تماس AI ندارد.
- AC-4: Given امتیاز زیر آستانه، then `analyze-job` فراخوانی نمی‌شود.

## 4. Non-goals
- اجرای مرورگری یا دور زدن ضدربات. منبع فقط اسکنر فقط‌خواندنی (SPEC-004 در کنار scanner/README.md) است.
