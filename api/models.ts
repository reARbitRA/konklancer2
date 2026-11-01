import type { IncomingMessage, ServerResponse } from 'node:http';

// Endpoints and credential names are fixed: the client cannot direct a server request.
const providers: Record<string, { base: string; env: string[]; gemini?: boolean }> = {
  openrouter: { base: 'https://openrouter.ai/api/v1', env: ['OPENROUTER_API_KEY'] },
  groq: { base: 'https://api.groq.com/openai/v1', env: ['GROQ_API_KEY'] },
  deepseek: { base: 'https://api.deepseek.com/v1', env: ['DEEPSEEK_API_KEY'] },
  mistral: { base: 'https://api.mistral.ai/v1', env: ['MISTRAL_API_KEY'] },
  cerebras: { base: 'https://api.cerebras.ai/v1', env: ['CEREBRAS_API_KEY'] },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta', env: ['GEMINI_API_KEY', 'GEMINI_KEY_P1', 'GEMINI_KEY_P2', 'GEMINI_KEY_P3'], gemini: true },
};
const keyFor = (p: typeof providers[string]) => p.env.map(k => process.env[k]).find(Boolean);
const reply = (res: ServerResponse, status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(body)); };

async function authorize(req: IncomingMessage): Promise<boolean> {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  // Authorization must be explicitly provisioned; an arbitrary valid account isn't necessarily a member.
  const members = (process.env.MANAGED_LLM_USER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const emails = (process.env.MANAGED_LLM_EMAILS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!token || !url || !key || (!members.length && !emails.length)) return false;
  try {
    const origin = new URL(url);
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || origin.username || origin.password) return false;
    const response = await fetch(`${origin.origin}/auth/v1/user`, {headers:{apikey:key, Authorization:`Bearer ${token}`}, redirect:'error', signal: AbortSignal.timeout(8000)});
    if (!response.ok) return false;
    const user = await response.json() as {id?: string; email?:string; email_confirmed_at?:string};
    return (typeof user.id === 'string' && members.includes(user.id)) || Boolean(user.email_confirmed_at && user.email && emails.includes(user.email.toLowerCase()));
  } catch { return false; }
}

async function listProvider(name: string) {
  const p = providers[name]; const key = keyFor(p);
  if (!key) return {provider:name, models:[], error:'not_configured'};
  try {
    const models: {provider:string;id:string;name:string}[] = [];
    let page = '';
    for (let count=0; count < (p.gemini ? 20 : 1); count++) {
      const url = new URL(`${p.base}/models`);
      if (p.gemini) { url.searchParams.set('pageSize','1000'); if (page) url.searchParams.set('pageToken',page); }
      const headers: Record<string,string> = p.gemini ? {'x-goog-api-key':key} : {Authorization:`Bearer ${key}`};
      const res = await fetch(url, {headers,redirect:'error',signal:AbortSignal.timeout(15000)});
      if (!res.ok) return {provider:name, models:[], error:`provider_${res.status}`};
      const data = await res.json() as any;
      const raw = p.gemini ? data.models : data.data;
      if (!Array.isArray(raw)) return {provider:name, models:[], error:'invalid_response'};
      for (const m of raw) {
        if (p.gemini && !m.supportedGenerationMethods?.includes('generateContent')) continue;
        const id = p.gemini ? String(m.name || '').replace(/^models\//,'') : m.id;
        if (typeof id === 'string' && id && id.length < 300) models.push({provider:name,id,name:String(m.displayName || m.name || id).slice(0,300)});
      }
      page = data.nextPageToken || ''; if (!page) break;
    }
    return {provider:name, models, ...(page ? {error:'partial_list'} : {})};
  } catch { return {provider:name, models:[], error:'provider_unreachable'}; }
}

async function reserve(req: IncomingMessage) {
  const token = req.headers.authorization || '';
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  try {
    const origin = new URL(url).origin;
    const r = await fetch(`${origin}/rest/v1/rpc/konklancer_reserve_managed_request`, {method:'POST',headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(8000)});
    return r.ok && await r.json() === true;
  } catch { return false; }
}

export default async function handler(req: IncomingMessage & {body?: any}, res: ServerResponse) {
  if (!await authorize(req)) return reply(res,401,{error:'Sign in with an authorized account to use managed models.'});
  if (req.method === 'GET') {
    const results = await Promise.all(Object.keys(providers).map(listProvider));
    return reply(res,200,{providers:results});
  }
  if (req.method !== 'POST') return reply(res,405,{error:'Method not allowed'});
  const body = req.body;
  if (!body || typeof body !== 'object' || typeof body.provider !== 'string' || !Object.hasOwn(providers,body.provider) || typeof body.model !== 'string' || !body.model || body.model.length > 300 || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 40000 || (body.systemPrompt !== undefined && (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > 10000))) return reply(res,400,{error:'Invalid request.'});
  const provider = providers[body.provider]; const key = keyFor(provider);
  if (!key) return reply(res,503,{error:'Provider is not configured.'});
  const catalogue = await listProvider(body.provider);
  if (!catalogue.models.some(m => m.id === body.model)) return reply(res,400,{error:'Model is unavailable for this provider.'});
  if (!await reserve(req)) return reply(res,429,{error:'Usage limit reached or quota service unavailable.'});
  const maxTokens = Math.max(1, Math.min(4096, Number.isFinite(body.maxTokens) ? Math.floor(body.maxTokens) : 1024));
  const prompt = body.prompt + (body.json ? '\nReturn valid JSON only.' : '');
  let url: string; let headers: Record<string,string>; let payload: unknown;
  if (provider.gemini) {
    url = `${provider.base}/models/${encodeURIComponent(body.model)}:generateContent`;
    headers = {'Content-Type':'application/json','x-goog-api-key':key};
    payload = {contents:[{role:'user',parts:[{text:prompt}]}], ...(body.systemPrompt ? {systemInstruction:{parts:[{text:body.systemPrompt}]}} : {}), generationConfig:{maxOutputTokens:maxTokens}};
  } else {
    url = `${provider.base}/chat/completions`;
    headers = {'Content-Type':'application/json',Authorization:`Bearer ${key}`};
    payload = {model:body.model,messages:[...(body.systemPrompt ? [{role:'system',content:body.systemPrompt}] : []),{role:'user',content:prompt}],max_tokens:maxTokens};
  }
  try {
    const upstream = await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(55000)});
    if (!upstream.ok) return reply(res,502,{error:`Provider request failed (${upstream.status}).`});
    const data = await upstream.json() as any;
    const text = provider.gemini ? data.candidates?.[0]?.content?.parts?.map((p:any)=>p.text || '').join('') : data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return reply(res,502,{error:'Provider returned an empty response.'});
    return reply(res,200,{text,model:body.model,provider:body.provider});
  } catch { return reply(res,502,{error:'Provider unavailable or request timed out.'}); }
}
