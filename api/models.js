// SPEC-013 — Backwards-compatible shim over the personal AI gateway.
// Legacy contract: GET -> { providers: [...] }, POST {provider, model, prompt,...} -> { text, model, provider }.
// The old Supabase-login + quota gating (SPEC-011/012) is retired for the single-owner app;
// access control is the gateway owner token (when configured) behind Vercel Deployment Protection.
import { handleAiHttp } from '../shared/aiGateway.mjs';

export default async function handler(req, res) {
  await handleAiHttp(req, res, { compat: true });
}
