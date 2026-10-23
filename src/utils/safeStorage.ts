/**
 * با وجود shim در index.html، در beberapa مرورگرهای قدیمی / WebView Android /
 * حالت content://، دسترسی مستقیم به window.localStorage می‌تواند TypeError /
 * SecurityError تولید کند. تمام مزارهای گرفته شده از محلی در اینجا تكون‌گذاری و
 * fallback حافظه‌ای گذاشته می‌شود.
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

/**读 JSON 容错包装（无 JSON 时返回默认值，损坏 JSON 返回 null） */
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

/**写 JSON 容错包装 */
export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSetItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/**当前是否在使用内存兜底存储（便于 UI 提示） */
export function isUsingMemoryStorage(): boolean {
  return !canUseLocalStorage();
}
