import { getAuthAccessToken } from './authToken';
export type ManagedModel = {provider:string; id:string; name:string};
const STORAGE = 'konklancer_managed_model';
export function readManagedModel(): ManagedModel | null {
  try { const m=JSON.parse(localStorage.getItem(STORAGE)||'null'); return m && typeof m.provider==='string' && typeof m.id==='string' ? m : null; } catch { return null; }
}
export function saveManagedModel(model: ManagedModel) { localStorage.setItem(STORAGE,JSON.stringify(model)); }
export function clearManagedModel() { localStorage.removeItem(STORAGE); }
async function request(init:RequestInit = {}) {
  const token = getAuthAccessToken();
  if (!token) throw new Error('برای استفاده از مدل‌ها ابتدا وارد حساب مجاز شوید.');
  const response = await fetch('/api/models',{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},cache:'no-store'});
  if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.error || 'خطا در ارتباط با سرویس مدل‌ها.'); }
  return response.json();
}
export async function listManagedModels(): Promise<{providers:{provider:string;models:ManagedModel[];error?:string}[]}> { return request(); }
export async function callManagedModel(model:ManagedModel, opts:{prompt:string;systemPrompt?:string;json?:boolean;maxTokens?:number}) {
  return request({method:'POST',body:JSON.stringify({...opts,provider:model.provider,model:model.id})}) as Promise<{text:string;model:string;provider:string}>;
}
