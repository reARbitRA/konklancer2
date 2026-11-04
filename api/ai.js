// SPEC-013 — Personal AI gateway (Vercel Function).
// Browser (incl. from Iran) -> this function (non-Iranian region) -> AI providers.
// Keys come from Vercel env (shared vars); nothing secret reaches the client.
import { handleAiHttp } from '../shared/aiGateway.mjs';

export default async function handler(req, res) {
  await handleAiHttp(req, res, { compat: false });
}
