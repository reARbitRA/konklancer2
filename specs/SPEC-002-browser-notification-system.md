---
id: SPEC-002
title: Browser Notification System
type: spec
status: DRAFT
version: 0.1.0
tags: [notifications, m1]
---

# SPEC-002 — Periodic Browser Notifications

## 1. Summary
Periodic browser notification reminder system for 'bidded' jobs.

## 2. Behavioral Contract
### 2.1 Rules
- R1. Monitor all jobs with status 'bidded'.
- R2. Trigger notification every 4 hours.
- R3. Reminder content: "Check project feedback".

## 3. Acceptance Criteria
- AC-1: Given jobs with status 'bidded', when 4 hours pass, then browser notification is triggered.
