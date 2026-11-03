// Vercel Node function: kept as JavaScript so deployment does not rely on Vite TypeScript types.
import { randomUUID } from "node:crypto";
import { tokenPriceCategory } from "../shared/tokenPricing.js";
const providers = {
  openrouter: { base: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"] },
  groq: { base: "https://api.groq.com/openai/v1", env: ["GROQ_API_KEY"] },
  deepseek: { base: "https://api.deepseek.com/v1", env: ["DEEPSEEK_API_KEY"] },
  mistral: { base: "https://api.mistral.ai/v1", env: ["MISTRAL_API_KEY"] },
  cerebras: { base: "https://api.cerebras.ai/v1", env: ["CEREBRAS_API_KEY"] },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta", env: ["GEMINI_API_KEY", "GEMINI_KEY_P1", "GEMINI_KEY_P2", "GEMINI_KEY_P3"], gemini: true }
};
const keyFor = (p) => p.env.map((k) => process.env[k]).find(Boolean);
const reply = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};
async function authorize(req) {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization || "")?.[1];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const members = (process.env.MANAGED_LLM_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const emails = (process.env.MANAGED_LLM_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!token || !url || !key || !members.length && !emails.length) return false;
  try {
    const origin = new URL(url);
    if (origin.protocol !== "https:" || !origin.hostname.endsWith(".supabase.co") || origin.username || origin.password) return false;
    const response = await fetch(`${origin.origin}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(8e3) });
    if (!response.ok) return false;
    const user = await response.json();
    return typeof user.id === "string" && members.includes(user.id) || Boolean(user.email_confirmed_at && user.email && emails.includes(user.email.toLowerCase()));
  } catch {
    return false;
  }
}
async function listProvider(name) {
  const p = providers[name];
  const key = keyFor(p);
  if (!key) return { provider: name, models: [], error: "not_configured" };
  try {
    const models = [];
    let page = "";
    const deadline = Date.now() + 15e3;
    for (let count = 0; count < (p.gemini ? 20 : 1); count++) {
      const url = new URL(`${p.base}/models`);
      if (p.gemini) {
        url.searchParams.set("pageSize", "1000");
        if (page) url.searchParams.set("pageToken", page);
      }
      const headers = p.gemini ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
      const res = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      if (!res.ok) return { provider: name, models: [], error: `provider_${res.status}` };
      const data = await res.json();
      const raw = p.gemini ? data.models : data.data;
      if (!Array.isArray(raw)) return { provider: name, models: [], error: "invalid_response" };
      for (const m of raw.slice(0, 1e4)) {
        if (!m || typeof m !== "object") continue;
        if (p.gemini && !m.supportedGenerationMethods?.includes("generateContent")) continue;
        const id = p.gemini ? String(m.name || "").replace(/^models\//, "") : m.id;
        if (typeof id === "string" && id && id.length < 300) models.push({ provider: name, id, name: String(m.displayName || m.name || id).slice(0, 300), priceCategory: tokenPriceCategory(name, m.pricing) });
      }
      page = typeof data.nextPageToken === "string" && data.nextPageToken.length <= 2048 ? data.nextPageToken : "";
      if (!page) break;
    }
    return { provider: name, models, ...page ? { error: "partial_list" } : {} };
  } catch {
    return { provider: name, models: [], error: "provider_unreachable" };
  }
}
async function reserve(req, openPreview) {
  const token = req.headers.authorization || "";
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  try {
    const origin = new URL(url).origin;
    const rpc = openPreview ? "konklancer_reserve_preview_request" : "konklancer_reserve_managed_request";
    const r = await fetch(`${origin}/rest/v1/rpc/${rpc}`, { method: "POST", headers: { apikey: key, Authorization: openPreview ? `Bearer ${key}` : token, "Content-Type": "application/json" }, body: "{}", redirect: "error", signal: AbortSignal.timeout(8e3) });
    return r.ok && await r.json() === true;
  } catch {
    return false;
  }
}
async function handler(req, res) {
  res.setHeader("X-Request-ID", randomUUID());
  const openPreview = process.env.VERCEL_ENV === "preview" && process.env.MANAGED_LLM_OPEN_PREVIEW === "true";
  if (!openPreview && !await authorize(req)) return reply(res, 401, { error: "Sign in with an authorized account to use managed models." });
  if (req.method === "GET") {
    const results = await Promise.all(Object.keys(providers).map(listProvider));
    return reply(res, 200, { providers: results });
  }
  if (req.method !== "POST") return reply(res, 405, { error: "Method not allowed" });
  const body = req.body;
  if (!body || typeof body !== "object" || typeof body.provider !== "string" || !Object.hasOwn(providers, body.provider) || typeof body.model !== "string" || !body.model || body.model.length > 300 || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 4e4 || body.systemPrompt !== void 0 && (typeof body.systemPrompt !== "string" || body.systemPrompt.length > 1e4)) return reply(res, 400, { error: "Invalid request." });
  const provider = providers[body.provider];
  const key = keyFor(provider);
  if (!key) return reply(res, 503, { error: "Provider is not configured." });
  const catalogue = await listProvider(body.provider);
  if (!catalogue.models.some((m) => m.id === body.model)) {
    if (catalogue.error) return reply(res, 503, { error: "Provider catalogue is unavailable. Try again later." });
    return reply(res, 400, { error: "Model is unavailable for this provider." });
  }
  if (!await reserve(req, openPreview)) return reply(res, 429, { error: "Usage limit reached or quota service unavailable." });
  const maxTokens = Math.max(1, Math.min(4096, Number.isFinite(body.maxTokens) ? Math.floor(body.maxTokens) : 1024));
  const prompt = body.prompt + (body.json ? "\nReturn valid JSON only." : "");
  let url;
  let headers;
  let payload;
  if (provider.gemini) {
    url = `${provider.base}/models/${encodeURIComponent(body.model)}:generateContent`;
    headers = { "Content-Type": "application/json", "x-goog-api-key": key };
    payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], ...body.systemPrompt ? { systemInstruction: { parts: [{ text: body.systemPrompt }] } } : {}, generationConfig: { maxOutputTokens: maxTokens } };
  } else {
    url = `${provider.base}/chat/completions`;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    payload = { model: body.model, messages: [...body.systemPrompt ? [{ role: "system", content: body.systemPrompt }] : [], { role: "user", content: prompt }], max_tokens: maxTokens };
  }
  try {
    const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(55e3) });
    if (!upstream.ok) return reply(res, upstream.status === 429 ? 429 : 502, { error: `Provider request failed (${upstream.status}).` });
    const data = await upstream.json();
    const text = provider.gemini ? data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") : data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return reply(res, 502, { error: "Provider returned an empty response." });
    return reply(res, 200, { text, model: body.model, provider: body.provider });
  } catch {
    return reply(res, 502, { error: "Provider unavailable or request timed out." });
  }
}
export {
  handler as default
};
