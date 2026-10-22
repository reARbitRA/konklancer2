---
id: T-003
title: Safety & hardening (SPEC-003)
spec: SPEC-003
status: DOING
branch: arena/bea82c77-konklancer
verification: "npx tsc --noEmit && npx vite build && npm run test:scanner"
---
## Done in this session
- R1 private-by-default GitHub repo in GitHubDispatcher
- R2 GitHub token moved to sessionStorage (legacy localStorage copy removed)
- R3 content filter server/contentFilter.ts applied to analyze-job, generate-proposal, generate-solution
- R4 captcha/phone sample job removed from server.ts and mockJobs.ts
- R6 autoStart on in_progress disabled (App.tsx)
- R7 NOT done (open question Q1)
## Remaining
- R5 API auth (KONKLANCER_API_TOKEN) — needs frontend header change
- Q2 model names; Q1 engine deletion; Q3 confirm R6 wording
