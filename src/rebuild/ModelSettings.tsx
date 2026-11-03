import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { LLMProviderId } from '../types';
import { scanModelsDirect, testConnectionDirect, type DiscoveredClientModel } from '../services/browserLLM';
import { addQuickApiKeyProfile, PROVIDER_DEFAULTS_MAP, purgeAllApiKeys, readKeyVault, subscribeVaultChanges, switchActiveKeyOrModel, writeKeyVault } from '../utils/customLLMClient';
import { validateProviderInput } from './providerValidation';
import { t } from './i18n';

export default function ModelSettings() {
  const [vault, setVault] = useState(readKeyVault);
  const [provider, setProvider] = useState<LLMProviderId>('openrouter');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [models, setModels] = useState<DiscoveredClientModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = vault.profiles.find(p => p.id === vault.activeProfileId);
  useEffect(() => subscribeVaultChanges(() => setVault(readKeyVault())), []);
  useEffect(() => { setActiveModel(active?.selectedModel || ''); setModels([]); setMessage(''); setError(''); }, [active?.id, active?.selectedModel]);
  const save = (event:React.FormEvent) => {
    event.preventDefault();
    const failure = validateProviderInput(provider, key, endpoint);
    if (failure) { setError(t(failure)); return; }
    addQuickApiKeyProfile({provider, apiKey:key.trim() || 'ollama', selectedModel:model, endpoint});
    setKey(''); setModel(''); setEndpoint(''); setError(''); setMessage(t('Model profile saved on this device.'));
  };
  const config = () => active ? {provider:active.provider, endpoint:active.endpoint, apiKey:active.apiKey, model:active.selectedModel} : null;
  const test = async () => {
    const selected = config(); if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await testConnectionDirect(selected); setMessage(`${t('Connection successful')} · ${result.model} · ${result.latencyMs} ms`); }
    catch (e) { setError(e instanceof Error ? e.message : t('Connection failed.')); }
    finally { setBusy(false); }
  };
  const discover = async () => {
    const selected = config(); if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await scanModelsDirect(selected); if (!result.success) throw new Error(result.error || t('Could not list models.')); setModels(result.models); setMessage(`${t('Models found')}: ${result.models.length}`); }
    catch(e) { setError(e instanceof Error ? e.message : t('Could not list models.')); }
    finally { setBusy(false); }
  };
  const remove = () => {
    if (!active || !window.confirm(t('Delete this model profile and its stored key?'))) return;
    const rest = vault.profiles.filter(p => p.id !== active.id);
    if (rest.length) writeKeyVault(rest, rest[0].id, vault.autoFailoverKeys); else purgeAllApiKeys();
    setVault(readKeyVault()); setMessage(t('Model profile deleted.')); setError('');
  };
  return <section className="settings-card"><div className="panel-heading"><span>{t('01 / MODEL CONNECTION')}</span><Sparkles size={16}/></div><h2>{t('Connect your model')}<span className="lime">.</span></h2>
    <p className="muted">{t('Requests currently go directly from this device to the selected provider. Browser storage is not a secure vault; use only a key you can revoke.')}</p>
    {vault.profiles.length>0 && <><label className="stack-label">{t('Active profile')}<select value={vault.activeProfileId} disabled={busy} onChange={e=>switchActiveKeyOrModel(e.target.value)}>{vault.profiles.map(p=><option key={p.id} value={p.id}>{p.label} · {p.selectedModel}</option>)}</select></label>
      <label className="stack-label">{t('Active model ID')}<input dir="ltr" value={activeModel} onChange={e=>setActiveModel(e.target.value)} disabled={busy}/></label><div className="action-row"><button className="btn subtle" type="button" disabled={busy||!activeModel.trim()||activeModel.trim()===active?.selectedModel} onClick={()=>{if(active) switchActiveKeyOrModel(active.id,activeModel.trim());setMessage(t('Active model updated.'));}}>{t('Save active model')}</button><button className="btn subtle" type="button" disabled={busy} onClick={discover}>{t('List available models')}</button><button className="btn subtle" type="button" disabled={busy} onClick={test}>{busy?t('Connecting…'):t('Test connection')}</button><button className="btn subtle" type="button" disabled={busy} onClick={remove}>{t('Delete profile')}</button></div>
      <p className="muted">{t('Testing sends a short prompt to the provider and may use quota or incur charges.')}</p>
      {models.length>0 && <label className="stack-label">{t('Available models')}<select value={models.some(m=>m.id===activeModel)?activeModel:''} onChange={e=>setActiveModel(e.target.value)}><option value="">{t('Select a model')}</option>{models.map(m=><option value={m.id} key={m.id}>{m.name || m.id} ({m.id})</option>)}</select></label>}</>}
    <div className="divider"/><h3>{t('Add a model profile')}</h3><form className="settings-form" onSubmit={save}><label>{t('Provider')}<select value={provider} onChange={e=>{setProvider(e.target.value as LLMProviderId);setEndpoint('');setModel('');setError('');}}>{(['openrouter','gemini','groq','openai','ollama','custom'] as const).map(p=><option value={p} key={p}>{PROVIDER_DEFAULTS_MAP[p].label}</option>)}</select></label>
      <label>{t('API key')} {provider==='ollama' && <small>{t('optional for Ollama')}</small>}<input type="password" dir="ltr" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={t('Enter on this device')}/></label>
      <label>{t('Model ID')} <small>{t('optional')}</small><input dir="ltr" value={model} onChange={e=>setModel(e.target.value)} placeholder={PROVIDER_DEFAULTS_MAP[provider].defaultModel}/></label>
      <label>{t('Endpoint')} <small>{t('optional')}</small><input dir="ltr" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder={PROVIDER_DEFAULTS_MAP[provider].endpoint}/></label>
      {provider==='ollama'&&<p className="muted">{t('Localhost refers to the device running your browser, not the preview server. Ollama must allow browser requests.')}</p>}
      <button className="btn primary" type="submit" disabled={busy}>{t('Save model profile')}</button></form>
    {message&&<p className="notice" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
