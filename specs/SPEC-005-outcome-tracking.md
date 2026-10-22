---
id: SPEC-005
title: Bid Outcome Tracking & Win-Probability Calibration
type: spec
status: APPROVED
version: 0.1.0
tags: [analytics, tracking, probability]
---

# SPEC-005 — Bid Outcome Tracking

## 1. Summary
ثبت هر پیشنهاد و نتیجه‌اش تا احتمال برنده شدن بر پایه‌ی داده‌ی واقعی سنجیده شود، نه حدس مدل.

## 2. Behavioral Contract
### 2.1 Data (SQLite، فایل `data/konklancer.db`)
- جدول `bids`: `id, project_id, platform, category, budget_bid, bid_at, status (sent|won|lost|no_reply|withdrawn), outcome_at, notes`.
- جدول `projects_seen`: `project_id, first_seen, bids_at_seen, budget_text`.

### 2.2 Interfaces
- `POST /api/bids` ثبت پیشنهاد ارسال‌شده (کاربر دستی ثبت می‌کند؛ هیچ ارسال خودکاری وجود ندارد).
- `PATCH /api/bids/:id` تغییر وضعیت نتیجه.
- `GET /api/stats` نرخ برد به تفکیک پلتفرم، دسته، بازه‌ی بودجه و تعداد پیشنهاد.

### 2.3 Rules
- R1. هیچ پیشنهادی بدون ثبت انسانی ایجاد نمی‌شود.
- R2. `winProbability` در `AIAnalysis` تا تعداد نمونه‌ی کافی (پیش‌فرض ۳۰ پیشنهاد بسته‌شده) فقط با عنوان «تخمین اولیه، نمونه ناکافی» نمایش داده شود.
- R3. کالیبراسیون: نرخ برد واقعی به‌عنوان prior در امتیازدهی R5 (SPEC-004) استفاده شود.
- R4. داده‌ی مدل حذف یا خروجی گرفته شود؛ هیچ اطلاعات شخصی کارفرما ذخیره نمی‌شود، فقط نام کاربری عمومی و شناسه پروژه.

## 3. Acceptance Criteria
- AC-1: Given پیشنهاد ثبت‌شده، when وضعیت به `won` تغییر کند، then `GET /api/stats` آن را در نرخ برد لحاظ می‌کند.
- AC-2: Given کمتر از ۳۰ نمونه، then برچسب «نمونه ناکافی» در UI و API دیده می‌شود.
- AC-3: Given کاربر بدون تایید، then هیچ درخواست ثبت پیشنهاد به پلتفرم ارسال نمی‌شود.

## 4. Non-goals
- خودکارسازی ارسال پیشنهاد یا خواندن نتیجه از حساب کاربری پلتفرم.
