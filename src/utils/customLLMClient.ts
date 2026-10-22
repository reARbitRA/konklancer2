import { CustomLLMConfig } from '../types';

/**
 * بازیابی تنظیمات اختصاصی هوش مصنوعی ذخیره‌شده توسط کاربر در مرورگر
 */
export function getSavedCustomLLM(): CustomLLMConfig | null {
  try {
    const raw = localStorage.getItem('freelanceflow_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.customLLM?.apiKey?.trim()) {
        return parsed.customLLM;
      }
    }
    const directRaw = localStorage.getItem('freelanceflow_custom_llm');
    if (directRaw) {
      const directParsed = JSON.parse(directRaw);
      if (directParsed?.apiKey?.trim()) {
        return directParsed;
      }
    }
  } catch (e) {
    console.error('[customLLM] Failed to read saved LLM config:', e);
  }
  return null;
}

/**
 * ساخت هدر x-custom-llm جهت ارسال به بک‌اند در تمام درخواست‌های تحلیلی و نگارش
 */
export function getCustomLLMHeaders(): Record<string, string> {
  const custom = getSavedCustomLLM();
  if (custom && custom.enabled && custom.apiKey?.trim()) {
    return {
      'x-custom-llm': JSON.stringify({
        endpoint: custom.endpoint,
        apiKey: custom.apiKey.trim(),
        model: custom.selectedModel,
        provider: custom.provider,
      }),
    };
  }
  return {};
}
