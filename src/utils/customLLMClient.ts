import { CustomLLMConfig, LLMProviderId, SavedApiKeyProfile } from '../types';

export interface ActiveCustomLLM {
  id?: string;
  label?: string;
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export const KEY_VAULT_STORAGE_KEY = 'konklancer_key_vault_v2';
export const LLM_CHANGED_EVENT = 'konklancer:llm-changed';

export const PROVIDER_DEFAULTS_MAP: Record<
  LLMProviderId,
  { label: string; endpoint: string; defaultModel: string; quickModels: string[] }
> = {
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    quickModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'google/gemini-2.0-flash-exp:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'anthropic/claude-3.7-sonnet',
      'openai/gpt-4o-mini',
    ],
  },
  gemini: {
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    quickModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite-preview-06-17',
    ],
  },
  groq: {
    label: 'Groq Cloud',
    endpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    quickModels: [
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'qwen-qwq-32b',
      'llama-3.1-8b-instant',
    ],
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    quickModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  ollama: {
    label: 'Ollama Local',
    endpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    quickModels: ['llama3.2', 'qwen2.5-coder:14b', 'deepseek-r1:14b'],
  },
  custom: {
    label: 'DeepSeek / Custom',
    endpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    quickModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
};

export interface KeyVaultState {
  profiles: SavedApiKeyProfile[];
  activeProfileId: string;
  autoFailoverKeys: boolean;
}

export function notifyLLMChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LLM_CHANGED_EVENT));
  }
}

export function subscribeVaultChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LLM_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(LLM_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function readKeyVault(): KeyVaultState {
  let profiles: SavedApiKeyProfile[] = [];
  let activeProfileId = '';
  let autoFailoverKeys = true;

  try {
    const rawVault = localStorage.getItem(KEY_VAULT_STORAGE_KEY);
    if (rawVault) {
      const parsed = JSON.parse(rawVault);
      if (Array.isArray(parsed?.profiles)) profiles = parsed.profiles;
      if (typeof parsed?.activeProfileId === 'string') activeProfileId = parsed.activeProfileId;
      if (typeof parsed?.autoFailoverKeys === 'boolean') autoFailoverKeys = parsed.autoFailoverKeys;
    }

    // مهاجرت خودکار کلید قبلی اگر خزانه جدید هنوز خالی باشد
    if (profiles.length === 0) {
      const legacyCandidates: Array<CustomLLMConfig | undefined> = [];
      for (const k of ['konklancer_settings', 'freelanceflow_settings']) {
        const s = localStorage.getItem(k);
        if (s) {
          try {
            const p = JSON.parse(s);
            if (Array.isArray(p?.apiKeyProfiles) && p.apiKeyProfiles.length > 0) {
              profiles = p.apiKeyProfiles;
              activeProfileId = p.activeProfileId || p.apiKeyProfiles[0].id;
            } else if (p?.customLLM?.apiKey?.trim()) {
              legacyCandidates.push(p.customLLM);
            }
          } catch {
            // ignore
          }
        }
      }
      const standalone = localStorage.getItem('freelanceflow_custom_llm');
      if (standalone) {
        try {
          const p = JSON.parse(standalone);
          if (p?.apiKey?.trim()) legacyCandidates.push(p);
        } catch {
          // ignore
        }
      }

      if (profiles.length === 0 && legacyCandidates[0]?.apiKey?.trim()) {
        const leg = legacyCandidates[0];
        const prov = (leg.provider || 'openrouter') as LLMProviderId;
        const migrated: SavedApiKeyProfile = {
          id: 'key-primary-1',
          label: `${PROVIDER_DEFAULTS_MAP[prov]?.label || prov} #1`,
          provider: prov,
          endpoint: leg.endpoint || PROVIDER_DEFAULTS_MAP[prov]?.endpoint || 'https://openrouter.ai/api/v1',
          apiKey: leg.apiKey.trim(),
          selectedModel:
            leg.selectedModel || PROVIDER_DEFAULTS_MAP[prov]?.defaultModel || 'meta-llama/llama-3.3-70b-instruct:free',
          availableModels: leg.availableModels || [],
          lastPingMs: leg.lastPingMs,
          enabled: true,
        };
        profiles = [migrated];
        activeProfileId = migrated.id;
      }
    }
  } catch {
    // ignore storage errors
  }

  if (profiles.length > 0 && !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
  }

  return { profiles, activeProfileId, autoFailoverKeys };
}

export function writeKeyVault(
  profiles: SavedApiKeyProfile[],
  activeProfileId?: string,
  autoFailoverKeys = true,
): KeyVaultState {
  const resolvedActiveId =
    profiles.find((p) => p.id === activeProfileId)?.id || profiles[0]?.id || '';
  const state: KeyVaultState = {
    profiles,
    activeProfileId: resolvedActiveId,
    autoFailoverKeys,
  };

  try {
    localStorage.setItem(KEY_VAULT_STORAGE_KEY, JSON.stringify(state));

    // همگام‌سازی کامل با ساختار قبلی برای سازگاری ۱۰۰٪ همه ماژول‌ها
    const active = profiles.find((p) => p.id === resolvedActiveId);
    if (active) {
      const legacyObj: CustomLLMConfig = {
        enabled: true,
        provider: active.provider,
        endpoint: active.endpoint,
        apiKey: active.apiKey,
        selectedModel: active.selectedModel,
        availableModels: active.availableModels || [],
        lastPingMs: active.lastPingMs,
      };
      localStorage.setItem('freelanceflow_custom_llm', JSON.stringify(legacyObj));

      for (const settingsKey of ['konklancer_settings', 'freelanceflow_settings']) {
        try {
          const prevRaw = localStorage.getItem(settingsKey);
          const prevObj = prevRaw ? JSON.parse(prevRaw) : {};
          const nextObj = {
            ...prevObj,
            customLLM: legacyObj,
            apiKeyProfiles: profiles,
            activeProfileId: resolvedActiveId,
            autoFailoverKeys,
          };
          localStorage.setItem(settingsKey, JSON.stringify(nextObj));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  notifyLLMChanged();
  return state;
}

/** سوییچ آنی (Real-Time) بین کلیدها و مدل‌ها از هر نقطه اپلیکیشن در صفر میلی‌ثانیه */
export function switchActiveKeyOrModel(profileId: string, newModel?: string): KeyVaultState {
  const vault = readKeyVault();
  const nextProfiles = vault.profiles.map((p) => {
    if (p.id !== profileId) return p;
    return {
      ...p,
      ...(newModel ? { selectedModel: newModel } : {}),
      lastError: undefined,
    };
  });
  return writeKeyVault(nextProfiles, profileId, vault.autoFailoverKeys);
}

/** افزودن سریع یک کلید جدید و فعال‌سازی بلافاصله آن */
export function addQuickApiKeyProfile(input: {
  label?: string;
  provider: LLMProviderId;
  apiKey: string;
  endpoint?: string;
  selectedModel?: string;
}): SavedApiKeyProfile {
  const vault = readKeyVault();
  const defaults = PROVIDER_DEFAULTS_MAP[input.provider] || PROVIDER_DEFAULTS_MAP.openrouter;
  const sameProviderCount = vault.profiles.filter((p) => p.provider === input.provider).length + 1;
  const created: SavedApiKeyProfile = {
    id: `key-${input.provider}-${Date.now().toString(36)}`,
    label: (input.label || '').trim() || `${defaults.label} #${sameProviderCount}`,
    provider: input.provider,
    endpoint: (input.endpoint || '').trim() || defaults.endpoint,
    apiKey: input.apiKey.trim(),
    selectedModel: (input.selectedModel || '').trim() || defaults.defaultModel,
    availableModels: [],
    enabled: true,
  };
  const next = [...vault.profiles, created];
  writeKeyVault(next, created.id, vault.autoFailoverKeys);
  return created;
}

export function readStoredCustomLLM(): ActiveCustomLLM | null {
  const vault = readKeyVault();
  const active =
    vault.profiles.find((p) => p.id === vault.activeProfileId && p.apiKey?.trim()) ||
    vault.profiles.find((p) => p.apiKey?.trim());
  if (!active) return null;
  return {
    id: active.id,
    label: active.label,
    provider: active.provider,
    endpoint: active.endpoint,
    apiKey: active.apiKey.trim(),
    model: active.selectedModel,
  };
}

/** لیست اولویت‌بندی‌شده کلیدهای فعال برای چرخش خودکار (Auto-Failover) در صورت خطای سهمیه/429 */
export function getOrderedVaultCandidates(override?: Partial<ActiveCustomLLM>): ActiveCustomLLM[] {
  if (override?.apiKey?.trim()) {
    const prov = (override.provider || 'openrouter') as LLMProviderId;
    return [
      {
        provider: prov,
        endpoint: override.endpoint || PROVIDER_DEFAULTS_MAP[prov]?.endpoint || 'https://openrouter.ai/api/v1',
        apiKey: override.apiKey.trim(),
        model: override.model || PROVIDER_DEFAULTS_MAP[prov]?.defaultModel || 'gemini-2.5-flash',
      },
    ];
  }

  const vault = readKeyVault();
  const valid = vault.profiles.filter((p) => p.enabled !== false && p.apiKey?.trim());
  if (valid.length === 0) return [];

  const activeIdx = valid.findIndex((p) => p.id === vault.activeProfileId);
  const ordered =
    activeIdx > 0 ? [valid[activeIdx], ...valid.slice(0, activeIdx), ...valid.slice(activeIdx + 1)] : valid;

  const list = vault.autoFailoverKeys ? ordered : ordered.slice(0, 1);
  return list.map((p) => ({
    id: p.id,
    label: p.label,
    provider: p.provider,
    endpoint: p.endpoint,
    apiKey: p.apiKey.trim(),
    model: p.selectedModel,
  }));
}

function toAsciiBase64(jsonStr: string): string {
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getCustomLLMHeaders(): Record<string, string> {
  const active = readStoredCustomLLM();
  if (!active) return {};
  return {
    'x-custom-llm-b64': toAsciiBase64(JSON.stringify(active)),
  };
}

export function getCustomLLMPayload(): { customLLM?: ActiveCustomLLM } {
  const active = readStoredCustomLLM();
  return active ? { customLLM: active } : {};
}
