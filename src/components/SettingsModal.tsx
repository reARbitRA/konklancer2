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
  purgeAllApiKeys,
} from '../utils/customLLMClient';
import {
  detectProviderClient,
  scanModelsDirect,
  testConnectionDirect,
} from '../services/browserLLM';
import { safeCopyText } from '../utils/safeClipboard';

/** fallback نچسباندن کلیپ‌بورد در اینترنت/file:// (پشتیبانی pass-through Android WebView) */
async function pasteFromClipboard(inputEl: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (typeof text === 'string') {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      inputEl.value = inputEl.value.slice(0, start) + text + inputEl.value.slice(end);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.setSelectionRange(start + text.length, start + text.length);
    }
  } catch {
    // clipboard blocked; user can still type
  }
}

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
  const [wipedToast, setWipedToast] = useState(false);

  const handleWipeAllKeys = () => {
    if (window.confirm('آیا از امحای کامل و غیرقابل‌بازگشت کلیه کلیدهای API از روی این دستگاه مطمئن هستید؟')) {
      purgeAllApiKeys();
      setKeys([]);
      setActiveKeyId('');
      setWipedToast(true);
      setStatusMsg({
        type: 'ok',
        text: 'تمامی کلیدها با موفقیت از روی دستگاه پاکسازی شدند.',
      });
      setTimeout(() => setWipedToast(false), 3000);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const vault = readKeyVault();
    setKeys(vault.profiles);
    setActiveKeyId(vault.activeProfileId);
    setAutoFailover(vault.autoFailoverKeys);
    setGithubToken(settings.githubToken || '');
    setStatusMsg(null);
    // IMPORTANT: only re-init when the modal is opened — NOT when `settings`
    // changes. Otherwise saving a key immediately resets the status message
    // (and can drop keys written to the in-memory fallback storage on WebView).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="گاوصندوق API"
    >
      <div className="w-full max-w-3xl bg-white border-[3px] border-[#0a0a0a] shadow-[8px_8px_0px_0px_#000] overflow-hidden my-4 sm:my-8 max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b-[3px] border-[#0a0a0a] bg-[#0a0a0a] text-[#FFFBF0]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 shrink-0 border-[2px] border-current flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-black tracking-wide uppercase leading-5">گاوصندوق چندکلیدی API</h3>
              <p className="text-[11px] font-mono opacity-70 truncate">
                Gemini · Groq · OpenRouter · DeepSeek · OpenAI — سوییچ آنی + چرخش خودکار
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 shrink-0 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] flex items-center justify-center hover:bg-[#FFDE03] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 brutal-scroll">
          {statusMsg && (
            <div
              className={`p-3.5  border text-xs flex items-start gap-2 ${
                statusMsg.type === 'ok'
                  ? 'bg-[#00E599]/25 border-[2px] border-[#0a0a0a] text-[#00875A]'
                  : 'bg-[#FF3B30]/15 border-[2px] border-[#0a0a0a] text-[#C1121F]'
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

          <div className="p-3.5  bg-black/70 border-[2px] border-[#0a0a0a] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#00875A] shrink-0" />
              <div>
                <div className="text-xs sm:text-sm font-bold text-[#0a0a0a]">
                  چرخش خودکار بدون توقف بین کلیدها (Smart Multi-Key Failover)
                </div>
                <p className="text-[11px] text-[#4a4a4a]">
                  اگر کلید فعال وسط تولید مستندات سنگین به محدودیت سرعت (429) بخورد، سیستم خودکار با کلید سالم بعدی ادامه می‌دهد.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoFailover}
              onChange={(e) => commitVault(keys, activeKeyId, e.target.checked)}
              className="w-5 h-5 accent-[#0066FF] cursor-pointer shrink-0"
            />
          </div>

          <form
            onSubmit={handleAddKeyToVault}
            className="p-4  bg-black/75 border-[2px] border-[#0a0a0a] space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[#0066FF]">
              <Plus className="w-4 h-4" /> افزودن کلید جدید به گاوصندوق
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#4a4a4a] mb-1">نام دلخواه کلید</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="مثلاً: Gemini Pro اصلی / Groq فوق‌سریع"
                  className="w-full bg-white border-[2px] border-[#0a0a0a]  px-3 py-2 text-xs text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4a4a4a] mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-[#6b6b6b]" /> Base URL سفارشی (اختیاری)
                </label>
                <input
                  type="text"
                  value={newBaseUrl}
                  onChange={(e) => setNewBaseUrl(e.target.value)}
                  placeholder="خالی بگذارید تا خودکار تشخیص دهد"
                  dir="ltr"
                  className="w-full bg-white border-[2px] border-[#0a0a0a]  px-3 py-2 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-[#6b6b6b] absolute right-14 top-2.5" />
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="کلید API را اینجا بچسبانید (AIza... / gsk_... / sk-or-... / sk-...)"
                  dir="ltr"
                  className="w-full bg-white border-[2px] border-[#0a0a0a]  pl-3 pr-28 py-2 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
                />
                <button
                  type="button"
                  onClick={(e) => pasteFromClipboard((e.currentTarget.previousElementSibling as HTMLInputElement) || (document.activeElement as HTMLInputElement))}
                  className="absolute right-1 top-2 px-2.5 py-1 text-[10px] font-bold text-[#00875A] bg-white hover:bg-[#FFDE03] border-[2px] border-[#0a0a0a] "
                >
                  پِست
                </button>
              </div>
              <button
                type="submit"
                disabled={!newApiKey.trim() || addingKey}
                className="brutal-btn brutal-btn--electric gap-1.5 shrink-0"
              >
                {addingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addingKey ? 'در حال اسکن مدل‌ها...' : 'افزودن و اسکن مدل‌ها'}
              </button>
            </div>
          </form>

          <div>
            <h4 className="text-xs font-bold text-[#333333] mb-2.5">
              کلیدهای ذخیره‌شده در گاوصندوق ({keys.length.toLocaleString('fa-IR')} کلید)
            </h4>
            {keys.length === 0 ? (
              <div className="p-6 text-center  bg-black/50 border border-dashed border-[2px] border-[#0a0a0a] text-xs text-[#4a4a4a]">
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
                      className={`p-3.5  border transition-all ${
                        isActive
                          ? 'bg-[#00E599]/25 border-[2px] border-[#0a0a0a]'
                          : 'bg-black/60 border-[2px] border-[#0a0a0a] hover:border-[#0a0a0a]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => commitVault(keys, k.id, autoFailover)}
                            className={`px-2.5 py-1  text-xs font-bold flex items-center gap-1 transition-colors ${
                              isActive
                                ? 'bg-[#00C584] text-[#0a0a0a]'
                                : 'bg-white hover:bg-[#FFDE03] text-[#333333]'
                            }`}
                          >
                            {isActive && <Check className="w-3.5 h-3.5" />}
                            {isActive ? 'کلید فعال اصلی' : 'انتخاب به عنوان فعال'}
                          </button>
                          <input
                            type="text"
                            value={k.label}
                            onChange={(e) => handleUpdateProfileField(k.id, { label: e.target.value })}
                            className="bg-transparent border-b-[2px] border-transparent hover:border-[#0a0a0a] focus:border-[#0066FF] text-[13px] font-black text-[#0a0a0a] focus:outline-none px-1 py-0.5 min-w-0"
                          />
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#FFDE03] border border-[#0a0a0a] text-[#0a0a0a]">
                            {k.provider}
                          </span>
                          <span className="text-xs font-mono text-[#6b6b6b]" dir="ltr">
                            {k.apiKey.slice(0, 6)}…{k.apiKey.slice(-4)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="flex items-center gap-1 text-[11px] text-[#4a4a4a] ml-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={k.enabled}
                              onChange={(e) => handleUpdateProfileField(k.id, { enabled: e.target.checked })}
                              className="accent-[#0066FF]"
                            />
                            مشارکت در چرخش
                          </label>
                          <button
                            type="button"
                            onClick={() => handlePingKey(k)}
                            disabled={testingId === k.id}
                            className="px-2.5 py-1  bg-white hover:bg-[#FFDE03] text-[#00875A] text-xs flex items-center gap-1"
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
                            className="px-2.5 py-1  bg-white hover:bg-[#FFDE03] text-[#0066FF] text-xs flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${scanningId === k.id ? 'animate-spin' : ''}`} />
                            اسکن مدل‌ها
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(k.id)}
                            className="p-1.5  bg-[#FF3B30]/15 hover:bg-[#FF3B30]/15 text-[#C1121F]"
                            title="حذف کلید"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[2px] border-[#0a0a0a] flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-xs text-[#4a4a4a] shrink-0">مدل انتخابی این کلید:</span>
                        <select
                          value={k.selectedModel}
                          onChange={(e) => handleUpdateProfileField(k.id, { selectedModel: e.target.value })}
                          dir="ltr"
                          className="flex-1 bg-white border-[2px] border-[#0a0a0a]  px-3 py-1.5 text-xs font-mono text-[#00875A] focus:outline-none focus:border-[#0066FF]"
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
            <div className="p-3.5  bg-black/60 border-[2px] border-[#0a0a0a] flex flex-col sm:flex-row gap-2 items-center">
              <span className="text-xs text-[#4a4a4a] shrink-0">
                افزودن دستی شناسه مدل سفارشی به «{activeProfile.label}»:
              </span>
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="مثلاً: gemini-2.5-pro یا deepseek/deepseek-r1"
                dir="ltr"
                className="flex-1 w-full bg-white border-[2px] border-[#0a0a0a]  px-3 py-1.5 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
              />
              <button
                type="button"
                onClick={handleAddCustomModel}
                disabled={!customModelInput.trim()}
                className="px-3 py-1.5  bg-white hover:bg-[#FFDE03] disabled:opacity-40 text-xs text-[#0a0a0a] shrink-0"
              >
                ثبت مدل
              </button>
            </div>
          )}

          <div className="p-3.5  bg-black/60 border-[2px] border-[#0a0a0a] space-y-1.5">
            <label className="block text-xs font-bold text-[#333333]">
              توکن GitHub جهت انتشار مخزن تحویلی (اختیاری - ذخیره امن فقط در نشست فعلی)
            </label>
            <div className="relative">
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_... یا github_pat_..."
                dir="ltr"
                className="w-full bg-white border-[2px] border-[#0a0a0a]  px-3 py-1.5 pr-24 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
              />
              <button
                type="button"
                onClick={(e) =>
                  pasteFromClipboard(
                    (e.currentTarget.previousElementSibling as HTMLInputElement) ||
                      (document.activeElement as HTMLInputElement),
                  )
                }
                className="absolute right-1.5 top-1.5 px-2 py-1 text-[10px] font-bold text-[#00875A] bg-white hover:bg-[#FFDE03] border-[2px] border-[#0a0a0a] "
              >
                پِست
              </button>
            </div>
          </div>

          {/* Permanent Safe Storage Guarantees */}
          <div className="p-4  bg-black/80 border-[2px] border-[#0a0a0a] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#00875A]">
                <CheckCircle2 className="w-4 h-4 text-[#00875A]" />
                <span>ذخیره‌سازی دائمی و خودکار کلیدها (Permanent Safe Storage)</span>
              </div>
              <button
                type="button"
                onClick={handleWipeAllKeys}
                className="px-2.5 py-1 bg-[#FF3B30]/15 hover:bg-[#FF3B30]/15 text-[#C1121F] border-[2px] border-[#0a0a0a]  text-[10px] font-bold flex items-center gap-1 transition-colors"
                title="پاکسازی دستی تمامی کلیدها از حافظه این دستگاه"
              >
                <Trash2 className="w-3 h-3" />
                {wipedToast ? 'پاک شد!' : 'پاکسازی همه کلیدها'}
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-[#333333]">
              💾 <strong>ذخیره ماندگار:</strong> تمامی کلیدهای اضافه‌شده به‌صورت دائمی در دیتابیس بومی دستگاه و LocalStorage ثبت می‌شوند. در دفعات بعدی اجرای برنامه یا روشن کردن تبلت، نیازی به ورود مجدد ندارید.
            </p>
            <p className="text-[10px] leading-relaxed text-[#4a4a4a]">
              ⚡ <strong>تماس مستقیم و واقعی:</strong> کلیه تحلیل‌ها و کدهای تحویلی مستقیماً به API اصلی ارسال می‌شوند (هیچ شبیه‌ساز یا Mock آفلاین در سیستم فعال نیست).
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-[2px] border-[#0a0a0a]">
            <button
              type="button"
              onClick={handleDone}
              className="brutal-btn brutal-btn--primary gap-2"
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
