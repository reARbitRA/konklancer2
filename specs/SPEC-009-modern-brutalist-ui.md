---
id: SPEC-009
title: Modern brutalist UI and app-wide micro-interactions
type: spec
status: DRAFT
version: 0.1.0
tags: [ui, ux, design-system, accessibility, animation]
depends_on: [SPEC-003]
---

# SPEC-009 — Modern brutalist UI and app-wide micro-interactions

## 1. Purpose
Refresh the app's visual language as contemporary, polished brutalism and give every interactive control immediate, consistent feedback. The design must feel current and intentional, not like an MS-DOS terminal or a retro computer interface.

## 2. Visual direction
- Use expressive contemporary typography, strong hierarchy, generous but purposeful spacing, confident grid/layout, high contrast, and a restrained accent palette.
- Retain the app's recognizable bold/brutalist character while improving consistency, polish, responsiveness, and readability. Use borders, offset shadows, geometric shapes, or texture selectively rather than turning every surface into a harsh box.
- Do not introduce terminal/CRT styling, pixel fonts, fake command prompts, scanlines, or DOS-like panels.
- Keep layouts usable on small Android screens, tablets, desktop, touch, and mouse.

## 3. Motion and interaction requirements
- R1. All buttons, links, menu items, switches, tabs, cards, and other interactive controls provide clear hover (where available), keyboard-focus, pressed/active, selected, disabled, and loading feedback appropriate to their role.
- R2. Use brief, purposeful micro-interactions (typically 120–220 ms) based mainly on transform and opacity; show a tactile pressed response without causing layout shifts or delaying activation.
- R3. Async actions show an immediate pending state and a clear success/error completion state. Do not animate a control as successful before its action succeeds.
- R4. Interactions must work on touch and keyboard; never depend on hover alone. Preserve visible `:focus-visible` states and correct accessible names/ARIA semantics.
- R5. Respect `prefers-reduced-motion: reduce` by removing nonessential movement and using minimal state transitions.
- R6. Avoid flashing, long decorative animations, excessive spring/bounce effects, and animation that obscures text or status.

## 4. Acceptance criteria
- AC-1: A repository-wide audit finds no primary interactive control without visible hover/focus/pressed/disabled feedback.
- AC-2: Click/tap actions still fire immediately and no interaction causes unexpected layout shift.
- AC-3: Reduced-motion preference disables nonessential movement while preserving state feedback.
- AC-4: Keyboard navigation and focus visibility remain clear through the main navigation, settings, dialogs, menus, and primary workflows.
- AC-5: UI remains legible and responsive at mobile, tablet, and desktop widths; no retro MS-DOS/terminal aesthetic is introduced.
- AC-6: DOM/UI checks, lint, and production build pass.

## 5. Non-goals
- Replacing the product's layout or app workflows without an approved design review.
- Adding decorative animation that slows down controls or reduces accessibility.

## 6. Open approval question
Approve or revise the modern-brutalist design and interaction requirements before app-wide UI implementation.
