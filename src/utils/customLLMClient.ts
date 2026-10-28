/**
 * One-time cleanup support for API-key data saved by the legacy provider
 * switcher. The current client cannot create, select, or send provider keys.
 */
export const LEGACY_LLM_CHANGED_EVENT = 'konklancer:legacy-llm-changed';

const LEGACY_VAULT_KEY = 'konklancer_key_vault_v2';
const LEGACY_CUSTOM_KEY = 'freelanceflow_custom_llm';
const LEGACY_SETTINGS_KEYS = ['konklancer_settings', 'freelanceflow_settings'];
const IDB_NAME = 'konklancer_vault_db';
const IDB_STORE = 'vault_records';
const IDB_KEY = 'primary_vault_state';

function storage(): Storage | null {
  try {
    if (typeof window !== 'undefined') return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // localStorage can be disabled by file:// and older Android WebViews.
  }
  return null;
}

function parseStoredJson(key: string): any {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Count legacy credential profiles without exposing their values to app code. */
export function countLegacyApiKeys(): number {
  const counts: number[] = [];
  const vault = parseStoredJson(LEGACY_VAULT_KEY);
  if (Array.isArray(vault?.profiles)) counts.push(vault.profiles.length);

  const standalone = parseStoredJson(LEGACY_CUSTOM_KEY);
  if (standalone && typeof standalone === 'object' && typeof standalone.apiKey === 'string' && standalone.apiKey.trim()) counts.push(1);

  for (const key of LEGACY_SETTINGS_KEYS) {
    const settings = parseStoredJson(key);
    if (Array.isArray(settings?.apiKeyProfiles)) counts.push(settings.apiKeyProfiles.length);
    if (settings?.customLLM && typeof settings.customLLM.apiKey === 'string' && settings.customLLM.apiKey.trim()) counts.push(1);
  }
  return Math.max(0, ...counts);
}

function deleteLegacyIndexedDbRecord(): void {
  try {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        return;
      }
      const transaction = db.transaction(IDB_STORE, 'readwrite');
      transaction.objectStore(IDB_STORE).delete(IDB_KEY);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    };
  } catch {
    // A failed legacy cleanup should not prevent app startup.
  }
}

/** Remove old browser-side provider keys; leave the app relay token untouched. */
export function purgeAllApiKeys(): void {
  const store = storage();
  try {
    store?.removeItem(LEGACY_VAULT_KEY);
    store?.removeItem(LEGACY_CUSTOM_KEY);
    for (const key of LEGACY_SETTINGS_KEYS) {
      const previous = parseStoredJson(key);
      if (!previous || typeof previous !== 'object') continue;
      delete previous.customLLM;
      delete previous.apiKeyProfiles;
      delete previous.activeProfileId;
      delete previous.autoFailoverKeys;
      store?.setItem(key, JSON.stringify(previous));
    }
  } catch {
    // Best effort for browser storage restrictions.
  }
  deleteLegacyIndexedDbRecord();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LEGACY_LLM_CHANGED_EVENT));
}
