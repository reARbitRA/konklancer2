---
id: SPEC-008
title: Temporary direct LLM provider access while Konkred gateway is unavailable
type: spec
status: APPROVED
version: 0.2.0
tags: [llm, providers, direct-api, temporary]
depends_on: [SPEC-003]
---

# SPEC-008 — Temporary direct LLM provider access

## 1. Purpose and status
The owner asked to pause SPEC-006 and use direct provider calls from the app until the Konkred gateway is ready. SPEC-006 remains APPROVED and unchanged; this temporary exception is defined here.

On 2026-10-28 the owner approved entering their own provider credentials into Settings on the personal device after installation. This spec does **not** permit embedding API secrets: personal use does not prevent an APK or JavaScript bundle from being unpacked and its keys extracted. No key values are needed in chat or repository files.

## 2. Scope
- Restore the existing in-app multi-provider key vault and model controls.
- Allow multiple user-owned provider profiles, switching the active profile, selecting a model, discovering models where supported, and testing the selected connection.
- Temporarily send LLM requests directly from the user's browser/app to the selected provider. Do not use the Konkred gateway or Supabase as an LLM relay in this temporary mode.
- Providers covered by the existing app implementation: OpenRouter, Google Gemini, Groq, OpenAI, Ollama/local, and a custom OpenAI-compatible endpoint (including DeepSeek-compatible endpoints).
- Keep SPEC-006 implementation and gateway work paused; this spec does not alter its text or decisions.

## 3. Security and user notice
- Provider keys are supplied by the individual user and stored on that user's device using the app's key-vault mechanism. The current web implementation uses browser storage; an Android-specific secure-storage change may use Android Keystore, but is not a prerequisite of this spec.
- Keys are used for direct client-to-provider requests; they are not sent to Konklancer's server or Supabase for inference.
- The UI must clearly warn that browser/device storage is not a secrets vault: anyone with access to the device or a successful script injection may access those keys. Provider terms and data-retention policies apply to prompts sent directly to them.
- Never print, commit, bundle, or otherwise publish provider-key values. Do not ask users to paste secrets into chat.
- Existing key profiles must not be purged automatically. Users can add, select, edit, and explicitly delete profiles.

## 4. Behavioral requirements
- R1. `LiveModelSwitcher` exposes the active provider/key profile and selected model, and can switch profiles without a page reload.
- R2. Settings can add multiple profiles, identify or configure the provider/endpoint, save a user-entered key, discover available models, allow a supported manual model entry, and test the connection.
- R3. Analysis, categorization, proposal generation, and solution generation use the active profile and selected model through direct client-to-provider requests.
- R4. Existing provider-specific request formats, JSON output handling, timeouts, and actionable error messages are retained or corrected; the client must not silently display fabricated/mock output as real AI output.
- R5. Optional key failover must be user-configurable and limited to profiles the user has enabled.
- R6. The temporary LLM path must not call Konkred or Supabase. Other app features and their existing backend routes are outside this spec.
- R7. Preserve/migrate previously saved local profiles where possible. Do not erase the app relay token or unrelated settings when key profiles are added, edited, or removed.
- R8. Do not put any real provider key in a build-time environment variable that is exposed to the browser, a frontend bundle, or a packaged APK.

## 5. Acceptance criteria
- AC-1: A user can save more than one provider profile, choose an active one and switch between them immediately.
- AC-2: The active profile can discover/select provider models where supported; a manual model ID can be entered when discovery is unavailable.
- AC-3: Each AI workflow uses the selected profile and model and makes a direct request to that provider; tests verify no LLM request is sent to Konkred or Supabase.
- AC-4: Invalid credentials, unsupported models, CORS/network failures, rate limits, and timeouts are reported clearly without fabricated analysis.
- AC-5: Existing stored profiles survive startup and no key purge occurs without an explicit user action.
- AC-6: No provider secret appears in tracked source, build output, or test fixtures.
- AC-7: Unit tests, lint, production build, and DOM smoke tests pass. Live provider smoke tests may be performed only with a user-owned key entered locally in the app; the key must not be copied into chat or repository files.

## 6. Non-goals
- Modifying or deleting approved SPEC-006.
- Repairing or deploying the Konkred gateway.
- Using Supabase as an AI proxy or changing Supabase configuration/deployment.
- Shipping shared provider credentials in the app bundle.
- Guaranteeing that every provider permits browser-origin requests; unsupported CORS must be shown as a clear limitation, not silently routed through another service.

## 7. Approval record
Approved by the owner on 2026-10-28: pause SPEC-006/Supabase LLM work temporarily, restore direct provider calls with multi-profile keys and model selection, and have the owner enter personal keys on-device after install. The owner confirmed per-device entry instead of bundling provider secrets in the APK.
