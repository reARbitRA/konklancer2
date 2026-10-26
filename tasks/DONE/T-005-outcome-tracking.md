---
id: T-005
title: Bid outcome tracking and SQLite (SPEC-005)
spec: SPEC-005
status: DONE
verification: "POST /api/bids then GET /api/stats shows the win rate"
---
DONE — `server/store.ts` (SQLite via `node:sqlite`), `server/bidStats.ts`, `server/bidRoutes.ts`,
UI صفحه‌ی `/analytics` (`src/components/OutcomeAnalytics.tsx`)، `src/services/outcomeApi.ts`.
تأیید: `server/bidRoutes.test.ts` (HTTP واقعی) + `server/outcomes.test.ts` + چک‌های DOM
(`clicking برنده persists the outcome to SQLite`).
