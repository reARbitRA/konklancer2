import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/models';
import type { IncomingMessage, ServerResponse } from 'node:http';

function response() {
  let status = 0, body = '';
  const res = {set statusCode(n:number){ status=n; }, setHeader(){}, end(s:string){ body=s; }} as unknown as ServerResponse;
  return {res, result:()=>({status, body:JSON.parse(body)})};
}
test('managed discovery fails closed without authorization configuration', async () => {
  const vars = ['SUPABASE_URL','VITE_SUPABASE_URL','MANAGED_LLM_USER_IDS'];
  const saved = vars.map(k=>process.env[k]); vars.forEach(k=>delete process.env[k]);
  try {
    const r=response(); await handler({headers:{},method:'GET'} as IncomingMessage,r.res);
    assert.equal(r.result().status,401);
  } finally {vars.forEach((k,i)=>{if(saved[i]===undefined) delete process.env[k]; else process.env[k]=saved[i];});}
});
test('discovery authenticates, uses only fixed provider endpoint and never returns key', async () => {
  const names=['SUPABASE_URL','SUPABASE_ANON_KEY','MANAGED_LLM_USER_IDS','OPENROUTER_API_KEY'];
  const saved=names.map(k=>process.env[k]); const original=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',MANAGED_LLM_USER_IDS:'member',OPENROUTER_API_KEY:'private-key'});
  const seen:string[]=[];
  globalThis.fetch = (async (url:any)=>{seen.push(String(url)); if(String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({id:'member'})); return new Response(JSON.stringify({data:[{id:'some-model',name:'Some Model'}]}));}) as typeof fetch;
  try {
    const r=response(); await handler({headers:{authorization:'Bearer token'},method:'GET'} as IncomingMessage,r.res);
    assert.equal(r.result().status,200); assert.ok(r.result().body.providers.find((p:any)=>p.provider==='openrouter').models.some((m:any)=>m.id==='some-model'));
    assert.ok(!JSON.stringify(r.result()).includes('private-key')); assert.ok(seen.some(url=>url==='https://openrouter.ai/api/v1/models'));
  } finally {globalThis.fetch=original; names.forEach((k,i)=>{if(saved[i]===undefined) delete process.env[k]; else process.env[k]=saved[i];});}
});
