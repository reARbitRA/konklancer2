/**
 * دسترسی مقاوم به localStorage.
 *
 * در WebView اندروید و حالت‌های content:// دسترسی مستقیم می‌تواند TypeError یا
 * SecurityError بدهد. همه‌ی خواندن/نوشتن‌ها اینجا محافظت می‌شوند و در صورت خطا
 * یک fallback حافظه‌ای در همان نشست استفاده می‌شود تا UI از کار نیفتد.
 */

const memoryStores = new Map<string, Map<string, string>>();

function memoryStore(kind: string): Map<string, string> {
  let store = memoryStores.get(kind);
  if (!store) {
    store = new Map();
    memoryStores.set(kind, store);
  }
  return store;
}

function canUseLocalStorage(): boolean {
  try {
    const probe = '__kl_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // fall through to memory
  }
  const mem = memoryStore('local');
  return mem.has(key) ? (mem.get(key) as string) : null;
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // fall through to memory
  }
  memoryStore('local').set(key, value);
  return false;
}

export function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  memoryStore('local').delete(key);
}

/** خواندن JSON با تحمل خطا: اگر کلید نبود fallback، و اگر JSON خراب بود هم fallback. */
export function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** نوشتن JSON با تحمل خطا. */
export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSetItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** آیا ذخیره‌سازی واقعی در دسترس نیست و حافظه‌ی موقت استفاده می‌شود؟ (برای هشدار UI) */
export function isUsingMemoryStorage(): boolean {
  return !canUseLocalStorage();
}
