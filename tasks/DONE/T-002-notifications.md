---
id: T-002
type: task
status: DONE
implements: [SPEC-002]
acs: [AC-1]
plan: PLAN-001
size: S
---
# T-002 — Implement Browser Notification System
## Goal
DONE — منطق خالص `src/utils/reminders.ts` (۴ ساعت، بدون تکرار)، زمان‌بند دقیقه‌ای در `App.tsx`،
کلید فعال‌سازی + وضعیت مجوز در تنظیمات. تأیید: ۷ تست در `server/reminders.test.ts`.
محدودیت: نمایش واقعی اعلان به مجوز مرورگر کاربر وابسته است؛ در jsdom اعلان ساخته نمی‌شود.
