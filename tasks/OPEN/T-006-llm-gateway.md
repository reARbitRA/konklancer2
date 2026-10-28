---
id: T-006
title: LLM access through Konkred gateway (SPEC-006)
spec: SPEC-006
status: OPEN
branch: arena/8bfff631-konklancer2
verification: "npm test && npm run lint && npm run test:dom"
---

## Current status
Paused by owner request on 2026-10-28: use direct provider calls temporarily until the Konkred gateway is ready. SPEC-006 remains APPROVED and unchanged. T-008 / SPEC-008 is now APPROVED and implements the temporary direct mode. Do not resume T-006 or use Supabase as an LLM relay until the owner asks.

## Prior gateway attempt (historical)
- Draft PR #9: https://github.com/reARbitRA/konklancer2/pull/9.
- Earlier preview work added Konkred inference/readiness adapters and was verified at the time. No live gateway inference was completed: the app relay token and gateway caller key are distinct, and `KONKRED_API_KEY` was absent from the inspected app deployments.
- No Supabase deployment or Vercel production deployment was made for that attempt.
- The first feature push unexpectedly updated the public `android-latest` APK asset and `apk-latest` tag. Release notes were corrected; the Android workflow was guarded to publish stable APKs only from `main`. The published APK remains.

## Resume condition
Resume only when the owner asks to return to the Konkred gateway. At that time, re-check the gateway caller credential and deployment configuration without requesting secrets in chat. SPEC-006 remains the intended longer-term gateway specification.
