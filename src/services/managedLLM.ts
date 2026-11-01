import { getAuthAccessToken } from './authToken';
import type { CatalogModel } from '../../shared/modelCatalog';
export type ManagedModel = CatalogModel;
const STORAGE = 'konklancer_managed_model';
export function readManagedModel(): ManagedModel | null {
  try { const m=JSON.parse(localStorage.getItem(STORAGE)||'null'); return m && typeof m.provider==='string' && typeof m.id==='string' ? m : null; } catch { return null; }
}
export function saveManagedModel(model: ManagedModel) { localStorage.setItem(STORAGE,JSON.stringify(model)); }
export function clearManagedModel() { localStorage.removeItem(STORAGE); }
async function request(init:RequestInit = {}) {
  const token = getAuthAccessToken();
  const response = await fetch('/api/models',{...init,headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},cache:'no-store'});
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('پاسخ سرور مدل‌ها نامعتبر است؛ دسترسی به پیش‌نمایش یا وضعیت استقرار را بررسی کنید.');
  if (!response.ok) { const error = await response.json().catch(()=>({})); const id = response.headers.get('x-request-id'); const suffix = id && /^[0-9a-f-]{36}$/i.test(id) ? ` (شناسه درخواست: ${id})` : ''; throw new Error((typeof error.error === 'string' ? error.error : 'خطا در ارتباط با سرویس مدل‌ها.') + suffix); }
  return response.json();
}
export async function listManagedModels(): Promise<{providers:{provider:string;models:ManagedModel[];error?:string}[]}> { return request(); }
export async function callManagedModel(model:ManagedModel, opts:{prompt:string;systemPrompt?:string;json?:boolean;maxTokens?:number}) {
  return request({method:'POST',body:JSON.stringify({...opts,provider:model.provider,model:model.id})}) as Promise<{text:string;model:string;provider:string}>;
}
