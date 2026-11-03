---
id: SPEC-011
title: Managed multi-provider model selection
status: APPROVED
version: 1.0.0
---
# Managed multi-provider model selection

Approved by the operator’s explicit request to implement managed multi-provider models. The operator wants end users to select a model without entering provider keys. The operator identified Vercel shared environment variables as the source of provider credentials and chose access for authorized signed-in users. This changes the temporary device-key approach in SPEC-008; it does not modify that approved specification.

## Requirements

- Keep provider credentials on the server. Never return them to the browser, build artifacts, logs or error messages.
- Discover and display available generation models from configured providers, clearly labeling provider, availability and discovery errors. Do not invent models or claim every model is accessible. Model selection persists without collecting a key from end users.
- Route all existing AI workflows through the selected server-side model; preserve existing work and provide actionable failures. Avoid arbitrary URL forwarding and SSRF with a fixed provider/endpoint allowlist.
- Authenticate and authorize requests server-side, fail closed, and prevent unauthorized users from consuming shared credentials. Configure and verify identity provider, membership policy, usage limits and rate limiting before enabling paid operations. Bound request size, output tokens and provider timeouts; sanitize errors.
- Shared variables must be explicitly linked to the correct Vercel project and target environments. Changes affecting production or paid use require appropriate confirmation. No secret values should be copied into code or chat.
- Verify model discovery, provider failures and generation with mocks; verify authentication/authorization and limits with integration tests. Verify actual provider connectivity and deployed behavior separately without exposing secrets. Record unverified services and rollback instructions.

## Current evidence and blockers

- On operator authorization, eleven Vercel shared provider variables were associated with the konklancer2 project for their existing preview and production targets, preserving their other project associations. Their values were not retrieved or verified. Existing deployments do not automatically receive the change; new deployments are required.
- The deployed Vite frontend currently uses device-stored keys and direct browser requests. A Vercel-hosted authenticated gateway is not yet implemented or verified.
- Browser authentication is optional by default; Supabase identity configuration and authorized membership policy have not been verified. Linking shared paid credentials to an unauthenticated gateway would expose quota to abuse.
