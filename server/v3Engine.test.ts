import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectCategory } from '../shared/taxonomy.js';
import { evaluateProjectRelevance } from '../shared/relevanceEngine.js';
import { createZipBlob } from '../src/utils/zipBuilder.js';
import { countLegacyApiKeys, purgeAllApiKeys } from '../src/utils/customLLMClient.js';

// In-memory localStorage shim for Node test runtime
const memStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => memStore.set(k, String(v)),
  removeItem: (k: string) => memStore.delete(k),
  clear: () => memStore.clear(),
};

describe('KonkLancer v3 — 6-Part Overhaul Verification Suite', () => {
  beforeEach(() => {
    memStore.clear();
  });

  it('1. Title-weighted categorization beats noisy description & handles AI/Prompt/Persian ZWNJ', () => {
    const r1 = detectCategory(
      'طراحی ربات اسکرپینگ و اتوماسیون تلگرام با پایتون',
      'نیاز است داده‌ها جمع‌آوری شده و در صورت نیاز ترجمه متون کوتاه هم انجام شود و در دیتابیس ذخیره گردد',
    );
    assert.ok(['automation', 'dev'].includes(r1.key), `Expected automation/dev, got ${r1.key}`);

    const r2 = detectCategory(
      'پیاده‌سازی سیستم RAG و ایجنت هوش مصنوعی با LangChain',
      'پاسخگویی خودکار به اسناد سازمانی با مدل زبانی',
    );
    assert.equal(r2.key, 'ai');

    const r3 = detectCategory('ترجمه تخصصي مقاله علمي انگليسي به فارسي', 'متن دانشگاهی ۱۰ صفحه‌ای');
    assert.equal(r3.key, 'translation');
  });

  it('2. Relevance Engine eliminates physical/in-person/ad junk and highlights Prime AI/Code jobs', () => {
    const junk1 = evaluateProjectRelevance(
      'استخدام بازاریاب حضوری در تهران',
      'نیازمند ویزیتور حضوری جهت مراجعه به فروشگاه‌ها با پورسانت عالی',
      'marketing',
    );
    assert.equal(junk1.tier, 'junk');

    const junk2 = evaluateProjectRelevance(
      'مهلت تمام شده - پروژه طراحی لوگو',
      'این پروژه واگذار شده به مجری دیگر است',
      'graphic',
    );
    assert.equal(junk2.tier, 'junk');

    const prime = evaluateProjectRelevance(
      'توسعه میکروسرویس Python FastAPI و مستندسازی معماری فنی',
      'پیاده‌سازی API تمیز به همراه داکیومنت کامل Swagger و تست خودکار',
      'dev',
    );
    assert.equal(prime.tier, 'prime');
  });

  it('3. Legacy provider keys can be identified and removed without deleting the gateway token', () => {
    memStore.set('konklancer_key_vault_v2', JSON.stringify({ profiles: [{ apiKey: 'legacy-provider-secret' }] }));
    memStore.set('konklancer_settings', JSON.stringify({
      apiToken: 'app-relay-token',
      customLLM: { apiKey: 'legacy-provider-secret' },
      notificationsEnabled: true,
    }));
    assert.equal(countLegacyApiKeys(), 1);

    purgeAllApiKeys();
    assert.equal(countLegacyApiKeys(), 0);
    const settings = JSON.parse(memStore.get('konklancer_settings') || '{}');
    assert.equal(settings.apiToken, 'app-relay-token');
    assert.equal(settings.notificationsEnabled, true);
    assert.equal('customLLM' in settings, false);
  });

  it('4. Binary PKZIP Builder generates valid ZIP archive with PK\\x03\\x04 header and full content', async () => {
    const blob = createZipBlob({
      '00-Executive-Pitch-and-Roadmap.md': '# نقشه راه اجرایی پروژه\n\nتحویل کامل.',
      'src/main.py': 'print("KonkLancer Enterprise Delivery")\n',
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(bytes[0], 0x50); // 'P'
    assert.equal(bytes[1], 0x4b); // 'K'
    assert.equal(bytes[2], 0x03);
    assert.equal(bytes[3], 0x04);
    assert.ok(bytes.length > 120);
  });
});
