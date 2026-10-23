import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  Globe,
  RefreshCw,
  Plus,
  Trash2,
  ShieldCheck,
  Zap,
  Check,
} from 'lucide-react';
import { LLMProviderId, SavedApiKeyProfile, UserSettings } from '../types';
import {
  PROVIDER_DEFAULTS_MAP,
  readKeyVault,
  writeKeyVault,
} from '../utils/customLLMClient';
import {
  detectProviderClient,
  scanModelsDirect,
  testConnectionDirect,
} from '../services/browserLLM';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen = true,
  onClose,
  settings,
  onSave,
}) => {
  const [keys, setKeys] = useState<SavedApiKeyProfile[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string>('');
  const [autoFailover, setAutoFailover] = useState<boolean>(true);
  const [githubToken, setGithubToken] = useState<string>(settings.githubToken || '');

  const [newLabel, setNewLabel] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [addingKey, setAddingKey] = useState(false);

  const [scanningId, setScanningId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [customModelInput, setCustomModelInput] = useState('');
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const vault = readKeyVault();
    setKeys(vault.profiles);
    setActiveKeyId(vault.activeProfileId);
    setAutoFailover(vault.autoFailoverKeys);
    setGithubToken(settings.githubToken || '');
    setStatusMsg(null);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const activeProfile = keys.find((k) => k.id === activeKeyId) || keys[0] || null;

  const commitVault = (nextKeys: SavedApiKeyProfile[], nextActiveId: string, nextFailover: boolean) => {
    setKeys(nextKeys);
    setActiveKeyId(nextActiveId);
    setAutoFailover(nextFailover);
    writeKeyVault(nextKeys, nextActiveId, nextFailover);
    const current = nextKeys.find((k) => k.id === nextActiveId) || nextKeys[0];
    onSave({
      ...settings,
      githubToken,
      apiKeyProfiles: nextKeys,
      activeProfileId: current?.id || '',
      autoFailoverKeys: nextFailover,
      ...(current
        ? {
            customLLM: {
              enabled: true,
              provider: current.provider,
              endpoint: current.endpoint,
              apiKey: current.apiKey,
              selectedModel: current.selectedModel,
              availableModels: current.availableModels || [],
              lastPingMs: current.lastPingMs,
            },
          }
        : {}),
    });
  };

  const handleAddKeyToVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawKey = newApiKey.trim();
    if (!rawKey) return;
    setAddingKey(true);
    setStatusMsg(null);

    const detectedProv = detectProviderClient(newBaseUrl.trim(), undefined, rawKey) as LLMProviderId;
    const defs = PROVIDER_DEFAULTS_MAP[detectedProv] || PROVIDER_DEFAULTS_MAP.openrouter;
    const endpoint = newBaseUrl.trim() || defs.endpoint;

    const scanRes = await scanModelsDirect({
      provider: detectedProv,
      endpoint,
      apiKey: rawKey,
      model: defs.defaultModel,
    });
    const chosenModel = scanRes.defaultModel || defs.defaultModel;

    const newProfile: SavedApiKeyProfile = {
      id: `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: newLabel.trim() || `${defs.label} #${keys.length + 1}`,
      apiKey: rawKey,
      endpoint,
      provider: (scanRes.detectedProvider as LLMProviderId) || detectedProv,
      selectedModel: chosenModel,
      availableModels: scanRes.models,
      lastPingMs: scanRes.latencyMs,
      enabled: true,
    };

    const nextKeys = [...keys, newProfile];
    commitVault(nextKeys, newProfile.id, autoFailover);
    setAddingKey(false);
    setNewLabel('');
    setNewApiKey('');
    setNewBaseUrl('');

    if (!scanRes.success) {
      setStatusMsg({
        type: 'err',
        text: `کلید ذخیره شد، اما اسکن اولیه مدل‌ها هشدار داد: ${scanRes.error}`,
      });
    } else {
      setStatusMsg({
        type: 'ok',
        text: `کلید «${newProfile.label}» با ${scanRes.models.length.toLocaleString('fa-IR')} مدل زنده اضافه و فعال شد!`,
      });
    }
  };

  const handleScanModels = async (profile: SavedApiKeyProfile) => {
    setScanningId(profile.id);
    setStatusMsg(null);
    const res = await scanModelsDirect({
      provider: profile.provider,
      endpoint: profile.endpoint,
      apiKey: profile.apiKey,
      model: profile.selectedModel,
    });
    setScanningId(null);
    if (!res.success) {
      setStatusMsg({ type: 'err', text: `خطا در اسکن «${profile.label}»: ${res.error}` });
      return;
    }
    const nextModel = res.models.some((m) => m.id === profile.selectedModel)
      ? profile.selectedModel
      : res.defaultModel || profile.selectedModel;
    const nextKeys = keys.map((k) =>
      k.id === profile.id
        ? {
            ...k,
            provider: (res.detectedProvider as LLMProviderId) || k.provider,
            availableModels: res.models,
            selectedModel: nextModel,
            lastPingMs: res.latencyMs,
          }
        : k,
    );
    commitVault(nextKeys, activeKeyId || profile.id, autoFailover);
    setStatusMsg({
      type: 'ok',
      text: `${res.models.length.toLocaleString('fa-IR')} مدل زنده برای «${profile.label}» به‌روزرسانی شد.`,
    });
  };

  const handlePingKey = async (profile: SavedApiKeyProfile) => {
    setTestingId(profile.id);
    setStatusMsg(null);
    try {
      const res = await testConnectionDirect({
        provider: profile.provider,
        endpoint: profile.endpoint,
        apiKey: profile.apiKey,
        model: profile.selectedModel,
      });
      setStatusMsg({
        type: 'ok',
        text: `پاسخ زنده از «${profile.label}» (${res.model}) در ${res.latencyMs.toLocaleString('fa-IR')} میلی‌ثانیه دریافت شد!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'err',
        text: `تست «${profile.label}» ناموفق بود: ${err?.message || 'خطای اتصال'}`,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleUpdateProfileField = (id: string, patch: Partial<SavedApiKeyProfile>) => {
    const nextKeys = keys.map((k) => (k.id === id ? { ...k, ...patch } : k));
    commitVault(nextKeys, activeKeyId, autoFailover);
  };

  const handleDeleteKey = (id: string) => {
    const nextKeys = keys.filter((k) => k.id !== id);
    const nextActive = id === activeKeyId ? nextKeys[0]?.id || '' : activeKeyId;
    commitVault(nextKeys, nextActive, autoFailover);
  };

  const handleAddCustomModel = () => {
    if (!activeProfile || !customModelInput.trim()) return;
    const clean = customModelInput.trim();
    const existing = activeProfile.availableModels || [];
    const mergedModels = existing.some((m) => m.id === clean)
      ? existing
      : [{ id: clean, name: clean, isFree: false }, ...existing];
    handleUpdateProfileField(activeProfile.id, {
      availableModels: mergedModels,
      selectedModel: clean,
    });
    setCustomModelInput('');
  };

  const handleDone = () => {
    commitVault(keys, activeKeyId, autoFailover);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <Cpu className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                گاوصندوق چندکلیدی API و مدیریت زنده مدل‌ها
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                همه کلیدهای خود (Gemini، Groq، OpenRouter، DeepSeek، OpenAI) را یک‌جا ذخیره کنید؛ سوییچ آنی در نوار بالا + چرخش خودکار
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {statusMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs sm:text-sm font-bold text-white">
                  چرخش خودکار بدون توقف بین کلیدها (Smart Multi-Key Failover)
                </div>
                <p className="text-[11px] text-slate-400">
                  اگر کلید فعال وسط تولید مستندات سنگین به محدودیت سرعت (429) بخورد، سیستم خودکار با کلید سالم بعدی ادامه می‌دهد.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoFailover}
              onChange={(e) => commitVault(keys, activeKeyId, e.target.checked)}
              className="w-5 h-5 accent-emerald-500 cursor-pointer shrink-0"
            />
          </div>

          <form
            onSubmit={handleAddKeyToVault}
            className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/25 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Plus className="w-4 h-4" /> افزودن کلید جدید به گاوصندوق
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">نام دلخواه کلید</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="مثلاً: Gemini Pro اصلی / Groq فوق‌سریع"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-500" /> Base URL سفارشی (اختیاری)
                </label>
                <input
                  type="text"
                  value={newBaseUrl}
                  onChange={(e) => setNewBaseUrl(e.target.value)}
                  placeholder="خالی بگذارید تا خودکار تشخیص دهد"
                  dir="ltr"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="کلید API را اینجا بچسبانید (AIza... / gsk_... / sk-or-... / sk-...)"
                  dir="ltr"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={!newApiKey.trim() || addingKey}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
              >
                {addingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addingKey ? 'در حال اسکن مدل‌ها...' : 'افزودن و اسکن مدل‌ها'}
              </button>
            </div>
          </form>

          <div>
            <h4 className="text-xs font-bold text-slate-300 mb-2.5">
              کلیدهای ذخیره‌شده در گاوصندوق ({keys.length.toLocaleString('fa-IR')} کلید)
            </h4>
            {keys.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-xs text-slate-400">
                هنوز هیچ کلیدی ذخیره نشده است. اولین کلید خود را در کادر بالا وارد کنید.
              </div>
            ) : (
              <div className="space-y-2.5">
                {keys.map((k) => {
                  const isActive = activeProfile?.id === k.id;
                  const modelList = Array.from(
                    new Set([
                      k.selectedModel,
                      ...(k.availableModels?.map((m) => m.id) || []),
                      ...(PROVIDER_DEFAULTS_MAP[k.provider]?.quickModels || []),
                    ]),
                  );
                  return (
                    <div
                      key={k.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-emerald-500/8 border-emerald-500/45'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => commitVault(keys, k.id, autoFailover)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                              isActive
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            {isActive && <Check className="w-3.5 h-3.5" />}
                            {isActive ? 'کلید فعال اصلی' : 'انتخاب به عنوان فعال'}
                          </button>
                          <input
                            type="text"
                            value={k.label}
                            onChange={(e) => handleUpdateProfileField(k.id, { label: e.target.value })}
                            className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 text-sm font-bold text-white focus:outline-none px-1 py-0.5"
                          />
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {k.provider}
                          </span>
                          <span className="text-xs font-mono text-slate-500" dir="ltr">
                            {k.apiKey.slice(0, 6)}…{k.apiKey.slice(-4)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="flex items-center gap-1 text-[11px] text-slate-400 ml-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={k.enabled}
                              onChange={(e) => handleUpdateProfileField(k.id, { enabled: e.target.checked })}
                              className="accent-emerald-500"
                            />
                            مشارکت در چرخش
                          </label>
                          <button
                            type="button"
                            onClick={() => handlePingKey(k)}
                            disabled={testingId === k.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs flex items-center gap-1"
                          >
                            {testingId === k.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Zap className="w-3.5 h-3.5" />
                            )}
                            تست زنده
                          </button>
                          <button
                            type="button"
                            onClick={() => handleScanModels(k)}
                            disabled={scanningId === k.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${scanningId === k.id ? 'animate-spin' : ''}`} />
                            اسکن مدل‌ها
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(k.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                            title="حذف کلید"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-xs text-slate-400 shrink-0">مدل انتخابی این کلید:</span>
                        <select
                          value={k.selectedModel}
                          onChange={(e) => handleUpdateProfileField(k.id, { selectedModel: e.target.value })}
                          dir="ltr"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                        >
                          {modelList.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {activeProfile && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row gap-2 items-center">
              <span className="text-xs text-slate-400 shrink-0">
                افزودن دستی شناسه مدل سفارشی به «{activeProfile.label}»:
              </span>
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="مثلاً: gemini-2.5-pro یا deepseek/deepseek-r1"
                dir="ltr"
                className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddCustomModel}
                disabled={!customModelInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white shrink-0"
              >
                ثبت مدل
              </button>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              توکن GitHub جهت انتشار مخزن تحویلی (اختیاری - ذخیره امن فقط در نشست فعلی)
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_... یا github_pat_..."
              dir="ltr"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleDone}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm"
            >
              {savedToast ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> ذخیره و اعمال شد!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> تایید و بازگشت به محیط کار
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
