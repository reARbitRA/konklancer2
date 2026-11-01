import React, {useEffect, useState} from 'react';
import { t } from './i18n';
import { sortCatalogModels, parameterBillions } from '../../shared/modelCatalog';
import { useAuth } from '../components/auth/AuthProvider';
import { getSupabaseClient, isSupabaseConfigured } from '../services/auth';
import { listManagedModels, readManagedModel, saveManagedModel, clearManagedModel, type ManagedModel } from '../services/managedLLM';

export default function ManagedModelSettings() {
  const auth = useAuth();
  const [email,setEmail]=useState('');
  const [models,setModels]=useState<ManagedModel[]>([]);
  const [selected,setSelected]=useState(readManagedModel);
  const sortedModels = sortCatalogModels(models);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const refresh=async()=>{setLoading(true);setError('');try{const result=await listManagedModels();setModels(result.providers.flatMap(p=>p.models)); const failed=result.providers.filter(p=>p.error && p.error!=='not_configured');setNotice(failed.length ? `برخی سرویس‌ها در دسترس نیستند: ${failed.map(p=>`${p.provider} (${p.error})`).join('، ')}` : '');}catch(e){setError(e instanceof Error?e.message:'خطا در دریافت مدل‌ها');}finally{setLoading(false);}};
  useEffect(()=>{if(auth.session) void refresh();},[auth.session?.access_token]);
  const login=async(e:React.FormEvent)=>{e.preventDefault();setError('');setNotice('');setLoading(true);try{const {error}=await getSupabaseClient().auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/#/settings`}});if(error)throw error;setNotice('لینک ورود به ایمیل ارسال شد. آن را در همین دستگاه باز کنید.');}catch(e){setError(e instanceof Error?e.message:'ارسال لینک ورود ناموفق بود.');}finally{setLoading(false);}};
  return <section className="settings-card"><div className="panel-heading"><span>{t('MANAGED MODELS')}</span></div><h2>{t('Select a model')}<span className="lime">.</span></h2><p className="muted">{t('Keys stay on the server. Select a model; usage may incur charges.')}</p>
  {!auth.session && (isSupabaseConfigured() ? <form onSubmit={login} className="settings-form"><label>{t('Authorized account email')}<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} dir="ltr"/></label><button className="btn primary" disabled={loading}>{t('Send sign-in link')}</button></form> : <p className="error">{t('Sign-in is not configured for this deployment.')}</p>)}
  {auth.session && <><button className="btn subtle" onClick={refresh} disabled={loading}>{t(loading?'Loading models…':'Refresh models')}</button><label className="stack-label">مدل<select disabled={loading || !models.length} value={selected ? `${selected.provider}|${selected.id}` : ''} onChange={e=>{const item=models.find(m=>`${m.provider}|${m.id}`===e.target.value);if(item){saveManagedModel(item);setSelected(item);setNotice('مدل انتخاب شد.');}}}><option value="">{t('Select a model')}</option>{(['free','unknown','paid'] as const).map(category => { const group=sortedModels.filter(m=>(m.priceCategory || 'unknown')===category); return group.length ? <optgroup key={category} label={t(category==='free'?'Free input/output':category==='paid'?'Paid input/output':'Price unknown')} >{group.map(m=><option key={`${m.provider}|${m.id}`} value={`${m.provider}|${m.id}`}>{m.provider} — {m.name} ({m.id}){category==='free' && parameterBillions(m)!==null ? ` · ${parameterBillions(m)}B` : ''}</option>)}</optgroup> : null; })}</select></label><p className="muted">{t('Free means zero input/output token prices reported by OpenRouter; limits or other charges may apply. Free models with known parameter counts are ordered by size, an approximate proxy—not a quality ranking. Other prices and sizes are unknown.')}</p>{selected && <><p className="muted">مدل فعال: {selected.provider} / {selected.id}</p><button className="btn subtle" onClick={()=>{clearManagedModel();setSelected(null);}}>{t('Use a personal key')}</button></>}</>}
  {notice&&<p role="status" className="notice">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
