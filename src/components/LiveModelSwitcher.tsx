import React, { useEffect, useRef, useState } from 'react';
import {
  KeyRound,
  ChevronDown,
  Check,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Settings,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { LLMProviderId, SavedApiKeyProfile } from '../types';
import {
  PROVIDER_DEFAULTS_MAP,
  readKeyVault,
  subscribeVaultChanges,
  switchActiveKeyOrModel,
  writeKeyVault,
} from '../utils/customLLMClient';
import { detectProviderClient, scanModelsDirect } from '../services/browserLLM';

/** fallback نچسباندن کلیپ‌بورد در Internet/file:// / Android WebView */
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

interface LiveModelSwitcherProps {
  onOpenFullSettings: () => void;
}

export const LiveModelSwitcher: React.FC<LiveModelSwitcherProps> = ({ onOpenFullSettings }) => {
  const [vault, setVault] = useState(() => readKeyVault());
  const [open, setOpen] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickLabel, setQuickLabel] = useState('');
  const [quickKey, setQuickKey] = useState('');
  const [quickAdding, setQuickAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setVault(readKeyVault());
    return subscribeVaultChanges(sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Use 'click' instead of 'mousedown': on Samsung Galaxy Tab, the keyboard's
    // clipboard/paste popup and long-press synthesis can fire mousedown *after*
    // the touch target is already determined, unmounting the dropdown before a
    // paste can land. Click fires only after the gesture is complete and inside
    // the dropdown's subtree (or outside of it, which is what we want).
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  const activeProfile: SavedApiKeyProfile | null =
    vault.profiles.find((k) => k.id === vault.activeProfileId) || vault.profiles[0] || null;
  const enabledCount = vault.profiles.filter((k) => k.enabled !== false && k.apiKey.trim()).length;

  const handleSelectProfile = (id: string) => {
    const updated = switchActiveKeyOrModel(id);
    setVault(updated);
    setFeedback('کلید فعال فوراً تعویض شد.');
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleSelectModel = (modelId: string) => {
    if (!activeProfile) return;
    const updated = switchActiveKeyOrModel(activeProfile.id, modelId);
    setVault(updated);
    setFeedback(`مدل فعال به ${modelId} تغییر کرد.`);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleScanModelsForActive = async () => {
    if (!activeProfile) return;
    setScanningId(activeProfile.id);
    setFeedback(null);
    const res = await scanModelsDirect({
      provider: activeProfile.provider,
      endpoint: activeProfile.endpoint,
      apiKey: activeProfile.apiKey,
      model: activeProfile.selectedModel,
    });
    setScanningId(null);
    if (!res.success) {
      setFeedback(`خطا: ${res.error}`);
      return;
    }
    const chosen = res.models.some((m) => m.id === activeProfile.selectedModel)
      ? activeProfile.selectedModel
      : res.defaultModel || activeProfile.selectedModel;
    const nextProfiles = vault.profiles.map((p) =>
      p.id === activeProfile.id
        ? {
            ...p,
            provider: (res.detectedProvider as LLMProviderId) || p.provider,
            availableModels: res.models,
            selectedModel: chosen,
            lastPingMs: res.latencyMs,
          }
        : p,
    );
    const updated = writeKeyVault(nextProfiles, activeProfile.id, vault.autoFailoverKeys);
    setVault(updated);
    setFeedback(`${res.models.length.toLocaleString('fa-IR')} مدل زنده شناسایی شد.`);
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawKey = quickKey.trim();
    if (!rawKey) return;
    setQuickAdding(true);
    setFeedback(null);

    const detectedProv = detectProviderClient('', undefined, rawKey) as LLMProviderId;
    const defs = PROVIDER_DEFAULTS_MAP[detectedProv] || PROVIDER_DEFAULTS_MAP.openrouter;
    const scanRes = await scanModelsDirect({
      provider: detectedProv,
      endpoint: defs.endpoint,
      apiKey: rawKey,
      model: defs.defaultModel,
    });

    const chosenModel = scanRes.defaultModel || defs.defaultModel;
    const created: SavedApiKeyProfile = {
      id: `key-${detectedProv}-${Date.now().toString(36)}`,
      label: quickLabel.trim() || `${defs.label} #${vault.profiles.length + 1}`,
      provider: (scanRes.detectedProvider as LLMProviderId) || detectedProv,
      endpoint: scanRes.endpoint || defs.endpoint,
      apiKey: rawKey,
      selectedModel: chosenModel,
      availableModels: scanRes.models,
      lastPingMs: scanRes.latencyMs,
      enabled: true,
    };

    const updated = writeKeyVault([...vault.profiles, created], created.id, vault.autoFailoverKeys);
    setQuickAdding(false);
    setVault(updated);
    setQuickKey('');
    setQuickLabel('');
    setShowQuickAdd(false);
    setFeedback(
      scanRes.success
        ? `کلید «${created.label}» با ${scanRes.models.length.toLocaleString('fa-IR')} مدل اضافه و فعال شد!`
        : `کلید ذخیره شد (${scanRes.error || 'مدل پیش‌فرض تنظیم شد'})`,
    );
  };

  const shortModelName = (m?: string) => {
    if (!m) return 'بدون مدل';
    const parts = m.split('/');
    const tail = parts[parts.length - 1];
    return tail.length > 24 ? `${tail.slice(0, 22)}…` : tail;
  };

  const modelOptionsForActive: string[] = activeProfile
    ? Array.from(
        new Set([
          activeProfile.selectedModel,
          ...(activeProfile.availableModels?.map((m) => m.id) || []),
          ...(PROVIDER_DEFAULTS_MAP[activeProfile.provider]?.quickModels || []),
        ]),
      )
    : [];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-2.5 py-1.5 border-[2px] border-[#0a0a0a] text-[11px] font-black transition-all ${
          activeProfile
            ? 'bg-white hover:bg-[#FFFBF0] text-[#0a0a0a]'
            : 'bg-[#FFDE03] hover:bg-[#FFE53A] text-[#0a0a0a]'
        }`}
        title="تعویض آنی کلید API و مدل هوش مصنوعی در هر لحظه"
      >
        <KeyRound className={`w-3.5 h-3.5 shrink-0 ${activeProfile ? 'text-[#00875A]' : 'text-[#7a5c00]'}`} />
        {activeProfile ? (
          <>
            <span className="max-w-[95px] truncate font-bold text-[#00875A]">{activeProfile.label}</span>
            <span className="text-[#6b6b6b]">·</span>
            <span className="font-mono text-[11px] text-[#1a1a1a] max-w-[130px] truncate" dir="ltr">
              {shortModelName(activeProfile.selectedModel)}
            </span>
            {enabledCount > 1 && (
              <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 border border-[#0a0a0a] bg-[#00E599] text-[#0a0a0a] text-[10px] font-black">
                {enabledCount.toLocaleString('fa-IR')} کلید
              </span>
            )}
          </>
        ) : (
          <span>افزودن کلید API</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-[#4a4a4a] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed sm:absolute left-3 right-3 sm:right-auto sm:left-0 top-16 sm:top-full sm:mt-2 sm:w-[430px] bg-white border-[3px] border-[#0a0a0a] shadow-[8px_8px_0px_0px_#000] z-[75] overflow-hidden"
        >
          <div className="px-3 py-2.5 bg-[#0a0a0a] text-[#FFFBF0] border-b-[3px] border-[#0a0a0a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FFDE03]" />
              <span className="text-[12px] font-black uppercase tracking-wide">سوئیچر زنده کلید و مدل</span>
            </div>
            <div className="flex items-center gap-2">
              {enabledCount > 1 && vault.autoFailoverKeys && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-[#00E599] text-[#0a0a0a] border-[2px] border-[#0a0a0a] px-2 py-0.5">
                  <ShieldCheck className="w-3 h-3" /> چرخش خودکار
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenFullSettings();
                }}
                className="text-[11px] font-black flex items-center gap-1 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] px-2 py-1 hover:bg-[#FFDE03]"
              >
                <Settings className="w-3 h-3" /> مدیریت کامل
              </button>
            </div>
          </div>

          {feedback && (
            <div className="px-4 py-2 bg-[#00E599]/25 border-b border-[2px] border-[#0a0a0a] text-[11px] text-[#00875A] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <div className="p-3.5 space-y-3.5 max-h-[72vh] overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[#4a4a4a]">
                  ۱. کلیدهای ذخیره‌شده ({vault.profiles.length.toLocaleString('fa-IR')})
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd((v) => !v)}
                  className="text-[11px] text-[#00875A] hover:text-[#00875A] flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> کلید جدید فوری
                </button>
              </div>

              {showQuickAdd && (
                <form
                  onSubmit={handleQuickAddSubmit}
                  className="mb-2.5 p-2.5  bg-[#FFFBF0] border-[2px] border-[#0a0a0a] space-y-2"
                >
                  <input
                    type="text"
                    value={quickLabel}
                    onChange={(e) => setQuickLabel(e.target.value)}
                    placeholder="نام دلخواه (مثلاً Gemini اصلی، Groq سریع...)"
                    className="w-full bg-white border-[2px] border-[#0a0a0a]  px-2.5 py-1.5 text-xs text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
                  />
                  <div className="relative">
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={quickKey}
                      onChange={(e) => setQuickKey(e.target.value)}
                      placeholder="چسباندن کلید API (AIza... / gsk_... / sk-or-... / sk-...)"
                      dir="ltr"
                      className="w-full bg-white border-[2px] border-[#0a0a0a]  px-2.5 py-1.5 pr-24 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
                    />
                    <button
                      type="button"
                      onClick={(e) =>
                        pasteFromClipboard(
                          (e.currentTarget.previousElementSibling as HTMLInputElement) ||
                            (document.activeElement as HTMLInputElement),
                        )
                      }
                      className="absolute right-1 top-1 px-2 py-0.5 text-[10px] font-bold text-[#00875A] bg-white hover:bg-[#FFDE03] border-[2px] border-[#0a0a0a] "
                    >
                      پِست
                    </button>
                  </div>
                  {quickKey.trim() && (
                    <div className="text-[10px] text-[#4a4a4a]">
                      سرویس تشخیص داده‌شده:{' '}
                      <strong className="text-[#00875A]">
                        {detectProviderClient('', undefined, quickKey.trim())}
                      </strong>
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="px-2.5 py-1  text-[11px] text-[#4a4a4a] hover:text-[#0a0a0a]"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={!quickKey.trim() || quickAdding}
                      className="brutal-btn brutal-btn--sm brutal-btn--mint gap-1"
                    >
                      {quickAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      ذخیره، اسکن مدل و فعال‌سازی
                    </button>
                  </div>
                </form>
              )}

              {vault.profiles.length === 0 ? (
                <div className="p-4 text-center  bg-black/70 border border-dashed border-[2px] border-[#0a0a0a] text-xs text-[#4a4a4a]">
                  هنوز کلیدی ثبت نشده است. روی «+ کلید جدید فوری» بزنید تا همه کلیدهای خود را یک‌بار برای همیشه ذخیره کنید.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {vault.profiles.map((k: SavedApiKeyProfile) => {
                    const isSelected = activeProfile?.id === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => handleSelectProfile(k.id)}
                        className={`w-full text-right px-2.5 py-2 border-[2px] border-[#0a0a0a] transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#00E599]/30 text-[#0a0a0a] shadow-[2px_2px_0px_0px_#000]'
                            : 'bg-white hover:bg-[#FFDE03] text-[#333333]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold truncate">{k.label}</span>
                            <span className="text-[10px] font-mono px-1 bg-[#FFFBF0] border border-[#0a0a0a] text-[#4a4a4a]">
                              {k.provider}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[#4a4a4a] truncate mt-0.5" dir="ltr">
                            {k.selectedModel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 mr-2">
                          <span className="text-[10px] font-mono text-[#6b6b6b]" dir="ltr">
                            …{k.apiKey.slice(-4)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-[#00875A]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {activeProfile && (
              <div className="pt-2 border-t border-[2px] border-[#0a0a0a]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#4a4a4a]">
                    ۲. تغییر آنی مدل روی «{activeProfile.label}»
                  </span>
                  <button
                    type="button"
                    onClick={handleScanModelsForActive}
                    disabled={scanningId === activeProfile.id}
                    className="text-[11px] text-[#0066FF] hover:text-[#0066FF] flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${scanningId === activeProfile.id ? 'animate-spin' : ''}`} />
                    بروزرسانی لیست مدل‌ها
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-0.5" dir="ltr">
                  {modelOptionsForActive.map((m: string) => {
                    const active = m === activeProfile.selectedModel;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelectModel(m)}
                        className={`px-2.5 py-1.5  text-left font-mono text-xs flex items-center justify-between transition-colors ${
                          active
                            ? 'bg-[#0066FF]/25 border-[2px] border-[#0a0a0a] text-[#0066FF] font-semibold'
                            : 'bg-black/60 hover:bg-white text-[#333333] border-[2px] border-[#0a0a0a]'
                        }`}
                      >
                        <span className="truncate">{m}</span>
                        {active && <Check className="w-3.5 h-3.5 text-[#0066FF] shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
