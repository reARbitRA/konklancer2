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
  if (!token || !url || !key || !members.length) return false;
  try {
    const origin = new URL(url);
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || origin.username || origin.password) return false;
    const response = await fetch(`${origin.origin}/auth/v1/user`, {headers:{apikey:key, Authorization:`Bearer ${token}`}, redirect:'error', signal: AbortSignal.timeout(8000)});
    if (!response.ok) return false;
    const user = await response.json() as {id?: string};
    return typeof user.id === 'string' && members.includes(user.id);
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

export default async function handler(req: IncomingMessage & {body?: any}, res: ServerResponse) {
  if (!await authorize(req)) return reply(res,401,{error:'Sign in with an authorized account to use managed models.'});
  if (req.method !== 'GET') return reply(res,405,{error:'Method not allowed'});
  const results = await Promise.all(Object.keys(providers).map(listProvider));
  return reply(res,200,{providers:results});
}
