# پچ‌های آماده

## `P0-ci-blocker.patch`
مخزن مقصد: `reARbitRA/konklancer` (برنچ `main`).

```bash
git clone https://github.com/reARbitRA/konklancer.git
cd konklancer
git apply /path/to/fixes/P0-ci-blocker.patch
python3 -m pytest -q scanner/tests   # باید 54 passed بدهد (قبلاً 1 failed)
npx tsc --noEmit                     # باید exit 0 بدهد (قبلاً خطای @capacitor/cli)
```

### چه چیزی را درست می‌کند
1. **`scanner/tests/test_live_fixtures.py`** — تست پارس‌کدرز دیگر انتظار ندارد *همه‌ی* کارت‌ها
   بودجه داشته باشند؛ کارت بدون بودجه یک داده‌ی واقعی و مشروع است. همین تست باعث می‌شد
   استپ `pytest` در ورک‌فلوی `scanner-feed` شکست بخورد و در نتیجه **اسکن صفحات و تلگرام
   هرگز اجرا نشود** (۳۳ اجرای متوالی failure، فید یخ‌زده از ۲۰۲۶-۱۰-۱۳).
2. **`tsconfig.json`** — `mobile` و `dist` از type-check ریشه خارج می‌شوند؛ `npx tsc --noEmit`
   (دستور رسمی verification در `tasks/`) دوباره سبز می‌شود.

### بعد از اعمال
- یک `workflow_dispatch` روی `scanner-feed` بزنید (یا `scanner/scan-request.json` را تغییر دهید) و
  مطمئن شوید استپ‌های ۷ تا ۱۰ سبز شده‌اند.
- `scanner/cloud-status.json` باید `job_status: "success"` و `projects_this_run > 0` بگیرد.
- بقیه‌ی اصلاح‌ها (P1/P2) عمداً در این پچ نیستند: به تصمیم محصولی نیاز دارند
  (مثلاً حذف UI «تست پروژه» یا وصل‌کردن تنظیمات به منطق قیمت‌گذاری).
