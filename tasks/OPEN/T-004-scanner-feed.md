---
id: T-004
title: Scanner feed to /api/jobs, pre-filter, cache, tiered models (SPEC-004)
spec: SPEC-004
status: OPEN
verification: "curl /api/jobs returns source=scanner; npm run test:scanner"
---
R1 (demo gate) via KONKLANCER_DEMO، R7 (اعلان تلگرام) با `server/notifier.ts` و `GET /api/alerts/status` انجام شد.
پیش‌فیلتر/کش فید از قبل در `server/scannerBridge.ts` و پنل وضعیت بود. تأیید: `npm test` + `/api/alerts/status`.
