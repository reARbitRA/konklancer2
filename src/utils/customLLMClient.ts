import { CustomLLMConfig } from '../types';

export interface ActiveCustomLLM {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export function readStoredCustomLLM(): ActiveCustomLLM | null {
  try {
    const candidates: Array<CustomLLMConfig | undefined> = [];

    for (const key of ['konklancer_settings', 'freelanceflow_settings']) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          candidates.push(JSON.parse(raw)?.customLLM);
        } catch {
          // ignore malformed entry
        }
      }
    }

    const standalone = localStorage.getItem('freelanceflow_custom_llm');
    if (standalone) {
      try {
        candidates.push(JSON.parse(standalone));
      } catch {
        // ignore malformed entry
      }
    }

    for (const custom of candidates) {
      if (custom && custom.enabled !== false && custom.apiKey?.trim()) {
        return {
          provider: custom.provider || 'openrouter',
          endpoint: (custom.endpoint || '').trim(),
          apiKey: custom.apiKey.trim(),
          model: (custom.selectedModel || '').trim(),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function toAsciiBase64(jsonStr: string): string {
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * ASCII-safe HTTP header carrying custom LLM config (prevents Android/Chrome Fetch `Headers` ISO-8859-1 crash).
 */
export function getCustomLLMHeaders(): Record<string, string> {
  const active = readStoredCustomLLM();
  if (!active) return {};
  return {
    'x-custom-llm-b64': toAsciiBase64(JSON.stringify(active)),
  };
}

/**
 * UTF-8 JSON body mixin carrying `customLLM` directly in POST request bodies.
 */
export function getCustomLLMPayload(): { customLLM?: ActiveCustomLLM } {
  const active = readStoredCustomLLM();
  return active ? { customLLM: active } : {};
}
