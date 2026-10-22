import React, { useState } from 'react';
import {
  Settings,
  X,
  FolderGit2,
  Coins,
  Check,
  Bot,
  Sparkles,
  Zap,
  Globe,
  Radio,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Info,
  Sliders,
} from 'lucide-react';
import { UserSettings, CustomLLMConfig, ScannedModelItem } from '../types';
import { scanModelsDirect, testConnectionDirect } from '../services/browserLLM';

interface SettingsModalProps {
  settings: UserSettings;
  onClose: () => void;
  onSave: (newSettings: UserSettings) => void;
}

const PROVIDER_PRESETS: {
  id: CustomLLMConfig['provider'];
  label: string;
  badge: string;
  badgeColor: string;
  defaultEndpoint: string;
  keyUrl: string;
  guide: string;
}[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'توصیه شده (مدل‌های رایگان)',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    guide: 'دارای ده‌ها مدل کاملاً رایگان با کیفیت بالا (نظیر Llama 3.3 70B Free و Gemini 2.0 Flash Free). با یک کلید رایگان شروع کنید.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'لایه‌رایگان AI Studio',
    badgeColor: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    guide: 'کلید رایگان از Google AI Studio با ۱۵ درخواست در دقیقه (مدل‌های Flash و Pro).',
  },
  {
    id: 'groq',
    label: 'Groq Cloud',
    badge: 'سرعت فوق‌العاده',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    guide: 'پردازش فوق‌العاده سریع با Llama 3.3 70B و لایه رایگان روزانه.',
  },
  {
    id: 'ollama',
    label: 'Ollama (محلی)',
    badge: '۱۰۰٪ رایگان و آفلاین',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    defaultEndpoint: 'http://localhost:11434/v1',
    keyUrl: 'https://ollama.com',
    guide: 'اجرای کاملاً رایگان و محلی روی سیستم خودتان بدون نیاز به اینترنت و بدون فیلترینگ.',
  },
  {
    id: 'openai',
    label: 'OpenAI (رسمی)',
    badge: 'GPT-4o / o1',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    defaultEndpoint: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    guide: 'دسترسی رسمی به مدل‌های تجاری شرکت OpenAI.',
  },
  {
    id: 'custom',
    label: 'اندپوینت دلخواه',
    badge: 'OpenAI-Compatible',
    badgeColor: 'bg-slate-700 text-slate-300 border-slate-600',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    keyUrl: '',
    guide: 'هر سرور یا پروکسی هوش مصنوعی که از استاندارد /v1/chat/completions پشتیبانی کند.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<'llm' | 'github' | 'strategy'>('llm');

  const defaultCustomLLM: CustomLLMConfig = {
    enabled: settings.customLLM?.enabled ?? true,
    provider: settings.customLLM?.provider ?? 'openrouter',
    endpoint: settings.customLLM?.endpoint ?? 'https://openrouter.ai/api/v1',
    apiKey: settings.customLLM?.apiKey ?? '',
    selectedModel: settings.customLLM?.selectedModel ?? 'meta-llama/llama-3.3-70b-instruct:free',
    availableModels: settings.customLLM?.availableModels ?? [],
    lastPingMs: settings.customLLM?.lastPingMs,
  };

  const [form, setForm] = useState<UserSettings>({
    ...settings,
    githubUseSSH: settings.githubUseSSH ?? false,
    githubSSHKey: settings.githubSSHKey ?? '',
    customLLM: defaultCustomLLM,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const [savedNotice, setSavedNotice] = useState(false);

  const defaultModelForProvider = (providerId?: string): string => {
    switch (providerId) {
      case 'gemini':
        return 'gemini-2.5-flash';
      case 'groq':
        return 'llama-3.3-70b-versatile';
      case 'openai':
        return 'gpt-4o-mini';
      case 'ollama':
        return 'llama3.2';
      case 'custom':
        return 'deepseek-chat';
      case 'openrouter':
      default:
        return 'meta-llama/llama-3.3-70b-instruct:free';
    }
  };

  // انتخاب سریع ارائه‌دهنده (با بازنشانی مدل قبلی تا مدل ناسازگار قبلی ۴۰۴ ندهد)
  const handleSelectProvider = (providerId: CustomLLMConfig['provider']) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      customLLM: {
        ...(prev.customLLM || defaultCustomLLM),
        provider: providerId,
        endpoint: preset.defaultEndpoint,
        selectedModel: defaultModelForProvider(providerId),
        availableModels: [],
      },
    }));
    setScanMessage(null);
    setTestResult(null);
  };

  // اسکن و استخراج مدل‌ها با نشانه‌گذاری مدل‌های رایگان
  const handleScanModels = async () => {
    const llm = form.customLLM;
    if (!llm || !llm.apiKey?.trim()) {
      setScanMessage({ text: 'لطفاً ابتدا کلید API خود را وارد کنید.', type: 'error' });
      return;
    }

    setIsScanning(true);
    setScanMessage(null);
    setTestResult(null);

    try {
      const data = await scanModelsDirect({
        endpoint: llm.endpoint,
        apiKey: llm.apiKey,
        provider: llm.provider,
        model: llm.selectedModel,
      });
      if (!data.success) {
        throw new Error(data.error || 'خطا در اسکن اندپوینت و استخراج مدل‌ها');
      }

      const models: ScannedModelItem[] = data.models || [];
      const freeCount = models.filter((m) => m.isFree).length;

      setForm((prev) => {
        const currentSelected = prev.customLLM?.selectedModel || '';
        const stillValid = models.some((m) => m.id === currentSelected);
        const resolvedModel = stillValid
          ? currentSelected
          : data.defaultModel || models[0]?.id || defaultModelForProvider(data.detectedProvider || prev.customLLM?.provider);
        return {
          ...prev,
          customLLM: {
            ...(prev.customLLM || defaultCustomLLM),
            provider: (data.detectedProvider as CustomLLMConfig['provider']) || prev.customLLM?.provider || 'openrouter',
            endpoint: data.endpoint || prev.customLLM?.endpoint || '',
            availableModels: models,
            selectedModel: resolvedModel,
            lastPingMs: data.latencyMs,
          },
        };
      });

      setScanMessage({
        text: `اسکن موفقیت‌آمیز بود! ${models.length} مدل استخراج شد (${freeCount} مدل کاملاً رایگان) · تأخیر: ${data.latencyMs}ms`,
        type: 'success',
      });
    } catch (err: any) {
      setScanMessage({
        text: err.message || 'عدم دسترسی به اندپوینت. لطفاً کلید و آدرس را بررسی نمایید.',
        type: 'error',
      });
    } finally {
      setIsScanning(false);
    }
  };

  // تست زنده اتصال با یک پرامپت سریع
  const handleTestConnection = async () => {
    const llm = form.customLLM;
    if (!llm || !llm.apiKey?.trim()) {
      setTestResult({ success: false, message: 'لطفاً کلید API را وارد کنید.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const data = await testConnectionDirect({
        endpoint: llm.endpoint,
        apiKey: llm.apiKey,
        model: llm.selectedModel,
        provider: llm.provider,
      });

      setTestResult({
        success: true,
        latency: data.latencyMs,
        message: `پاسخ زنده از ${data.model} دریافت شد (${data.latencyMs}ms): «${data.reply}»`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'خطا در برقراری ارتباط زنده با مدل',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { githubToken, ...persistedSettings } = form;
    if (githubToken) {
      sessionStorage.setItem('freelanceflow_github_token', githubToken);
    } else {
      sessionStorage.removeItem('freelanceflow_github_token');
    }
    const serialized = JSON.stringify(persistedSettings);
    localStorage.setItem('konklancer_settings', serialized);
    localStorage.setItem('freelanceflow_settings', serialized);
    if (form.customLLM) {
      localStorage.setItem('freelanceflow_custom_llm', JSON.stringify(form.customLLM));
    }
    onSave(form);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 800);
  };

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === form.customLLM?.provider) || PROVIDER_PRESETS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-400">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>تنظیمات سامانه و اتصال هوش مصنوعی</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Custom LLM & Scanner
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">اتصال کلید اختصاصی LLM، اسکن مدل‌های رایگان و اتصال گیت‌هاب</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'llm'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>هوش مصنوعی و مدل‌ها (LLM API)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'github'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderGit2 className="h-3.5 w-3.5" />
            <span>اتصال گیت‌هاب (PAT / SSH)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('strategy')}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'strategy'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>استراتژی قیمت و درآمد</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* TAB 1: LLM API Configuration */}
          {activeTab === 'llm' && (
            <div className="space-y-5">
              {/* Info Banner about Keys */}
              <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-800/40 text-[11px] text-sky-200 flex items-start gap-2.5 leading-relaxed">
                <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sky-300">کلیدهای API چیست و چگونه کار می‌کنند؟</p>
                  <p className="text-slate-300">
                    کلید API کدی اختصاصی است که هوش مصنوعی را بدون نیاز به سرور واسطه مستقیماً برای شما فعال می‌کند.
                    شما می‌توانید از <strong>مدل‌های کاملاً رایگان</strong> در OpenRouter یا Gemini بدون پرداخت حتی یک سنت
                    استفاده کنید.
                  </p>
                </div>
              </div>

              {/* Provider Selector Grid */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">انتخاب ارائه‌دهنده هوش مصنوعی:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectProvider(preset.id)}
                      className={`p-3 text-right rounded-xl border transition-all text-xs flex flex-col justify-between gap-1.5 ${
                        form.customLLM?.provider === preset.id
                          ? 'bg-emerald-500/10 border-emerald-500/80 text-white shadow-lg shadow-emerald-500/5'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-slate-200">{preset.label}</span>
                        {form.customLLM?.provider === preset.id && (
                          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-block w-fit ${preset.badgeColor}`}>
                        {preset.badge}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-slate-400 leading-normal">{currentPreset.guide}</p>
                  {currentPreset.keyUrl && (
                    <a
                      href={currentPreset.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 shrink-0 ml-2"
                    >
                      <span>دریافت کلید {currentPreset.label}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>کلید API اختصاصی شما (API Key):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <span>{showApiKey ? 'مخفی‌سازی' : 'نمایش'}</span>
                  </button>
                </div>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.customLLM?.apiKey || ''}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    const trimmed = nextKey.trim();
                    let autoProvider = form.customLLM?.provider || 'openrouter';
                    if (trimmed.startsWith('AIza')) autoProvider = 'gemini';
                    else if (trimmed.startsWith('gsk_')) autoProvider = 'groq';
                    else if (trimmed.startsWith('sk-or-')) autoProvider = 'openrouter';

                    const providerChanged = autoProvider !== form.customLLM?.provider;
                    const preset = PROVIDER_PRESETS.find((p) => p.id === autoProvider);

                    setForm({
                      ...form,
                      customLLM: {
                        ...(form.customLLM || defaultCustomLLM),
                        apiKey: nextKey,
                        provider: autoProvider,
                        endpoint: providerChanged && preset ? preset.defaultEndpoint : form.customLLM?.endpoint || '',
                        selectedModel: providerChanged
                          ? defaultModelForProvider(autoProvider)
                          : form.customLLM?.selectedModel || defaultModelForProvider(autoProvider),
                      },
                    });
                  }}
                  placeholder={
                    form.customLLM?.provider === 'openrouter'
                      ? 'sk-or-v1-xxxxxxxxxxxxxxxxxxxx'
                      : form.customLLM?.provider === 'gemini'
                      ? 'AIzaSyxxxxxxxxxxxxxxxxxxxx'
                      : form.customLLM?.provider === 'groq'
                      ? 'gsk_xxxxxxxxxxxxxxxxxxxx'
                      : 'کلید خود را اینجا پیست کنید...'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500 shadow-inner"
                />
              </div>

              {/* Endpoint Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-sky-400" />
                    <span>آدرس اندپوینت (API Endpoint):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        customLLM: {
                          ...(form.customLLM || defaultCustomLLM),
                          endpoint: currentPreset.defaultEndpoint,
                        },
                      })
                    }
                    className="text-[11px] text-slate-400 hover:text-slate-300 underline"
                  >
                    بازنشانی به پیش‌فرض
                  </button>
                </div>
                <input
                  type="text"
                  value={form.customLLM?.endpoint || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customLLM: {
                        ...(form.customLLM || defaultCustomLLM),
                        endpoint: e.target.value,
                      },
                    })
                  }
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-300 dir-ltr text-left focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Action Buttons: Scan Models & Test Connection */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleScanModels}
                  disabled={isScanning || !form.customLLM?.apiKey?.trim()}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white disabled:opacity-50 transition-all shadow-md shadow-emerald-950"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>{isScanning ? 'در حال اسکن و بررسی مدل‌ها...' : 'اسکن و استخراج مدل‌ها (نشانگر رایگان)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !form.customLLM?.apiKey?.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 disabled:opacity-50 transition-all"
                >
                  <Radio className={`h-3.5 w-3.5 text-emerald-400 ${isTesting ? 'animate-pulse' : ''}`} />
                  <span>{isTesting ? 'در حال تست...' : 'تست اتصال زنده'}</span>
                </button>
              </div>

              {/* Scan Message Alert */}
              {scanMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    scanMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{scanMessage.text}</span>
                </div>
              )}

              {/* Test Result Alert */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Model Dropdown Selection with Free Indicators */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 block">مدل انتخاب‌شده برای کارها:</label>
                  {form.customLLM?.lastPingMs && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      تأخیر پاسخ: {form.customLLM.lastPingMs} میلی‌ثانیه
                    </span>
                  )}
                </div>

                {form.customLLM?.availableModels && form.customLLM.availableModels.length > 0 ? (
                  <div className="space-y-1">
                    <select
                      value={form.customLLM.selectedModel}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          customLLM: {
                            ...(form.customLLM || defaultCustomLLM),
                            selectedModel: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 dir-ltr text-left font-mono"
                    >
                      {form.customLLM.availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.isFree ? `⭐ [رایگان / FREE] ${m.id}` : m.id}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-emerald-400">
                      مدل‌های دارای علامت ⭐ [رایگان / FREE] بدون نیاز به اعتبار پولی کار می‌کنند.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={form.customLLM?.selectedModel || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          customLLM: {
                            ...(form.customLLM || defaultCustomLLM),
                            selectedModel: e.target.value,
                          },
                        })
                      }
                      placeholder="meta-llama/llama-3.3-70b-instruct:free یا gemini-2.5-flash"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400">
                      برای استخراج خودکار لیست مدل‌ها و نمایش مدل‌های رایگان، دکمه «اسکن و استخراج مدل‌ها» در بالا را بزنید.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GitHub Configuration */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FolderGit2 className="h-4 w-4 text-emerald-400" />
                    <span>روش احراز هویت گیت‌هاب:</span>
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, githubUseSSH: false })}
                    className={`flex-1 px-3 py-2 text-xs rounded-xl border transition-colors ${
                      !form.githubUseSSH
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    توکن دسترسی شخصی (PAT)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, githubUseSSH: true })}
                    className={`flex-1 px-3 py-2 text-xs rounded-xl border transition-colors ${
                      form.githubUseSSH
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    کلید خصوصی SSH
                  </button>
                </div>
              </div>

              {!form.githubUseSSH ? (
                <div className="space-y-1.5">
                  <input
                    type="password"
                    value={form.githubToken}
                    onChange={(e) => setForm({ ...form, githubToken: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    برای ایجاد توکن در گیت‌هاب به Settings &gt; Developer settings &gt; Personal access tokens رفته و دسترسی repo و workflow را تیک بزنید.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <textarea
                    value={form.githubSSHKey}
                    onChange={(e) => setForm({ ...form, githubSSHKey: e.target.value })}
                    placeholder="ssh-ed25519 AAAA..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-400 dir-ltr text-left focus:outline-none focus:border-amber-500 h-24"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    کلید خصوصی SSH خود را برای ارسال خودکار کد به مخازن گیت‌هاب وارد کنید.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Strategy & Goals */}
          {activeTab === 'strategy' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-amber-400" />
                  <span>هدف درآمد روزانه (تومان):</span>
                </label>
                <input
                  type="number"
                  value={form.dailyEarningsGoal}
                  onChange={(e) => setForm({ ...form, dailyEarningsGoal: parseInt(e.target.value) || 5000000 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">لحن پیش‌فرض نگارش پروپوزال‌ها:</label>
                <select
                  value={form.preferredTone}
                  onChange={(e) => setForm({ ...form, preferredTone: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="friendly_expert">صمیمی و ارشد (بالاترین نرخ پاسخ کارفرما)</option>
                  <option value="direct_urgent">صریح و متمرکز بر تحویل فوری (زیر ۴ ساعت)</option>
                  <option value="technical_detailed">فنی، دقیق و اشاره به پوشش تست‌های اتوماتیک</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">درصد تخفیف پیش‌فرض رقابتی (%):</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={form.defaultDiscountRate}
                  onChange={(e) => setForm({ ...form, defaultDiscountRate: parseInt(e.target.value) || 15 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Save feedback banner */}
          {savedNotice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span>تنظیمات و کلیدهای هوش مصنوعی با موفقیت ذخیره گردید.</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-[11px] text-slate-400">
              {form.customLLM?.apiKey ? '✓ کلید هوش مصنوعی آماده است' : '⚠️ کلید API وارد نشده است'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-950"
              >
                ذخیره و اعمال تنظیمات
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
