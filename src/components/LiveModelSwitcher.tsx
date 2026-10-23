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
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
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
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
          activeProfile
            ? 'bg-slate-800/90 hover:bg-slate-800 border-emerald-500/35 text-slate-100'
            : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/40 text-amber-300'
        }`}
        title="تعویض آنی کلید API و مدل هوش مصنوعی در هر لحظه"
      >
        <KeyRound className={`w-3.5 h-3.5 shrink-0 ${activeProfile ? 'text-emerald-400' : 'text-amber-400'}`} />
        {activeProfile ? (
          <>
            <span className="max-w-[95px] truncate font-bold text-emerald-300">{activeProfile.label}</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-[11px] text-slate-200 max-w-[130px] truncate" dir="ltr">
              {shortModelName(activeProfile.selectedModel)}
            </span>
            {enabledCount > 1 && (
              <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px]">
                {enabledCount.toLocaleString('fa-IR')} کلید
              </span>
            )}
          </>
        ) : (
          <span>افزودن کلید API</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed sm:absolute left-3 right-3 sm:right-auto sm:left-0 top-16 sm:top-full sm:mt-2 sm:w-[410px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">سوئیچر زنده کلید و مدل (Real-Time)</span>
            </div>
            <div className="flex items-center gap-2">
              {enabledCount > 1 && vault.autoFailoverKeys && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> چرخش خودکار
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenFullSettings();
                }}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-md"
              >
                <Settings className="w-3 h-3" /> مدیریت کامل
              </button>
            </div>
          </div>

          {feedback && (
            <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <div className="p-3.5 space-y-3.5 max-h-[72vh] overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-400">
                  ۱. کلیدهای ذخیره‌شده ({vault.profiles.length.toLocaleString('fa-IR')})
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd((v) => !v)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> کلید جدید فوری
                </button>
              </div>

              {showQuickAdd && (
                <form
                  onSubmit={handleQuickAddSubmit}
                  className="mb-2.5 p-2.5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2"
                >
                  <input
                    type="text"
                    value={quickLabel}
                    onChange={(e) => setQuickLabel(e.target.value)}
                    placeholder="نام دلخواه (مثلاً Gemini اصلی، Groq سریع...)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    value={quickKey}
                    onChange={(e) => setQuickKey(e.target.value)}
                    placeholder="چسباندن کلید API (AIza... / gsk_... / sk-or-... / sk-...)"
                    dir="ltr"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                  {quickKey.trim() && (
                    <div className="text-[10px] text-slate-400">
                      سرویس تشخیص داده‌شده:{' '}
                      <strong className="text-emerald-400">
                        {detectProviderClient('', undefined, quickKey.trim())}
                      </strong>
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="px-2.5 py-1 rounded text-[11px] text-slate-400 hover:text-white"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={!quickKey.trim() || quickAdding}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      {quickAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      ذخیره، اسکن مدل و فعال‌سازی
                    </button>
                  </div>
                </form>
              )}

              {vault.profiles.length === 0 ? (
                <div className="p-4 text-center rounded-xl bg-slate-950/70 border border-dashed border-slate-800 text-xs text-slate-400">
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
                        className={`w-full text-right px-3 py-2 rounded-xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-500/12 border-emerald-500/45 text-white'
                            : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold truncate">{k.label}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {k.provider}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5" dir="ltr">
                            {k.selectedModel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 mr-2">
                          <span className="text-[10px] font-mono text-slate-500" dir="ltr">
                            …{k.apiKey.slice(-4)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {activeProfile && (
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    ۲. تغییر آنی مدل روی «{activeProfile.label}»
                  </span>
                  <button
                    type="button"
                    onClick={handleScanModelsForActive}
                    disabled={scanningId === activeProfile.id}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
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
                        className={`px-2.5 py-1.5 rounded-lg text-left font-mono text-xs flex items-center justify-between transition-colors ${
                          active
                            ? 'bg-indigo-600/25 border border-indigo-500/50 text-indigo-200 font-semibold'
                            : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800/60'
                        }`}
                      >
                        <span className="truncate">{m}</span>
                        {active && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-2" />}
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
