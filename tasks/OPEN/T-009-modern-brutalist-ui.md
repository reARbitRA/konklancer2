---
id: T-009
title: Modern brutalist UI and app-wide micro-interactions
spec: SPEC-009
status: OPEN
branch: arena/8bfff631-konklancer2
verification: "npm test && npm run lint && npm run test:dom"
---

## Scope requested by owner
Modernize the app's current brutalist visual language (contemporary 2027 direction, not MS-DOS/retro terminal) and add short, clear micro-interactions to every interactive control.

## Approval gate
SPEC-009 is DRAFT. No app-wide design or animation implementation starts until the owner approves it. Accessibility, keyboard/touch feedback, reduced-motion support, responsive layout, and non-blocking motion are acceptance criteria.

## Planned verification
- Audit interactive controls and shared components for state feedback.
- Verify `prefers-reduced-motion`, keyboard focus, touch operation, and small-screen layouts.
- `npm test`, `npm run lint`, and `npm run test:dom`.
