import React, { useEffect, useState } from 'react';
import { t } from './i18n';
import { sortCatalogModels, parameterBillions } from '../../shared/modelCatalog';
import {
  AUTO_MODEL,
  getGatewayHealth,
  listManagedModels,
  readGatewayBase,
  readManagedModel,
  saveGatewayBase,
  saveManagedModel,
  clearManagedModel,
  testGateway,
  type GatewayHealthProvider,
  type ManagedModel,
} from '../services/managedLLM';

const TIER_FA: Record<string, string> = {
  'free-pool': 'استخر رایگان',
  'free-tier': 'پلن رایگان',
  free: 'رایگان',
  'free-credits': 'اعتبار رایگان',
  'paid-cheap': 'پولی ارزان',
  subscription: 'اشتراکی',
  keyless: 'بدون کلید (ذخیره)',
};

/**
 * SPEC-013 — درگاه شخصی AI: بدون لاگین و بدون واردکردن کلید.
 * کلیدها روی سرور (Vercel Env) هستند؛ پیش‌فرض «خودکار» بهترین مدل رایگان هر کار را انتخاب می‌کند.
 */
export default function ManagedModelSettings() {
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [health, setHealth] = useState<GatewayHealthProvider[]>([]);
  const [selected, setSelected] = useState<ManagedModel | null>(readManagedModel);
  const [gatewayBase, setGatewayBase] = useState(readGatewayBase);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const sortedModels = sortCatalogModels(models.filter((m) => m.chat !== false));
  const isAuto = !selected || selected.provider === 'auto';

  const refresh = async (force = false) => {
    setLoading(true); setError(''); setNotice('');
    try {
      const [h, result] = await Promise.allSettled([getGatewayHealth(), listManagedModels(force)]);
      if (h.status === 'fulfilled') setHealth(h.value.providers);
      if (result.status === 'fulfilled') {
        setModels(result.value.providers.flatMap((p) => p.models));
        const failed = result.value.providers.filter((p) => p.error && p.error !== 'not_configured' && p.configured);
        if (failed.length) setNotice(`فهرست زنده بعضی سرویس‌ها نیامد و از مدل‌های پیش‌فرض استفاده می‌شود: ${failed.map((p) => p.provider).join('، ')}`);
      } else {
        throw result.reason;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در اتصال به درگاه AI');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const runTest = async () => {
    setTesting(true); setError(''); setNotice('');
    try {
      const r = await testGateway();
      setNotice(`اتصال سالم است — پاسخ از ${r.provider} / ${r.model} در ${(r.latencyMs / 1000).toFixed(1)} ثانیه آمد.`);
    } catch (e: any) {
      const attempts = Array.isArray(e?.attempts) && e.attempts.length
        ? ` تلاش‌ها: ${e.attempts.map((a: any) => `${a.provider}/${a.model}: ${a.error}${a.status ? ` (${a.status})` : ''}`).join('؛ ')}`
        : '';
      setError((e instanceof Error ? e.message : 'تست اتصال ناموفق بود.') + attempts);
    } finally { setTesting(false); }
  };

  const pickAuto = () => { saveManagedModel(AUTO_MODEL); setSelected(AUTO_MODEL); setNotice('حالت خودکار فعال شد: برای هر کار بهترین مدل رایگانِ در دسترس انتخاب می‌شود و در صورت خطا خودکار به سرویس بعدی می‌رود.'); };

  return (
    <section className="settings-card">
      <div className="panel-heading"><span>{t('PERSONAL AI GATEWAY')}</span></div>
      <h2>هوش مصنوعی شخصی<span className="lime">.</span></h2>
      <p className="muted">
        بدون لاگین و بدون واردکردن کلید: درخواست‌ها از سرور خود اپ (خارج از ایران) به سرویس‌دهنده‌ها می‌رسند،
        پس تحریم IP و خطای CORS مرورگر دیگر مطرح نیست. حالت «خودکار» برای هر مرحله (تحلیل، پیشنهاد، کد، متن و…)
        بهترین مدل رایگان را انتخاب می‌کند و اگر سرویسی خطا داد، خودکار سراغ بعدی می‌رود.
      </p>

      {health.length > 0 && (
        <div className="tag-row" aria-label="وضعیت سرویس‌دهنده‌ها">
          {health.map((p) => (
            <span key={p.provider} title={p.provider} style={!p.configured ? { opacity: 0.45 } : undefined}>
              {p.configured ? '●' : '○'} {p.label} · {TIER_FA[p.tier] || p.tier}{p.configured && p.keyCount > 1 ? ` · ${p.keyCount} کلید` : ''}{p.configured ? '' : ' · تنظیم‌نشده'}
            </span>
          ))}
        </div>
      )}

      <div className="action-row">
        <button className="btn primary" onClick={runTest} disabled={testing || loading}>{testing ? 'در حال تست…' : 'تست اتصال AI'}</button>
        <button className="btn subtle" onClick={() => refresh(true)} disabled={loading}>{loading ? 'در حال دریافت مدل‌ها…' : 'تازه‌سازی فهرست مدل‌ها'}</button>
        <button className="btn subtle" onClick={pickAuto} disabled={isAuto}>خودکار (بهترین رایگان)</button>
      </div>

      <label className="stack-label">مدل
        <select
          disabled={loading}
          value={isAuto ? 'auto|auto' : `${selected!.provider}|${selected!.id}`}
          onChange={(e) => {
            if (e.target.value === 'auto|auto') { pickAuto(); return; }
            const item = models.find((m) => `${m.provider}|${m.id}` === e.target.value);
            if (item) { saveManagedModel(item); setSelected(item); setNotice(`مدل ثابت انتخاب شد: ${item.provider} / ${item.id} — اگر پاسخ ندهد، زنجیره خودکار ادامه می‌دهد.`); }
          }}
        >
          <option value="auto|auto">خودکار — بهترین رایگان (پیشنهادی)</option>
          {(['free', 'unknown', 'paid'] as const).map((category) => {
            const group = sortedModels.filter((m) => (m.priceCategory || 'unknown') === category);
            if (!group.length) return null;
            return (
              <optgroup key={category} label={category === 'free' ? 'رایگان' : category === 'paid' ? 'پولی' : 'پلن رایگان سرویس / قیمت نامشخص'}>
                {group.map((m) => (
                  <option key={`${m.provider}|${m.id}`} value={`${m.provider}|${m.id}`}>
                    {m.provider} — {m.name} ({m.id}){parameterBillions(m) !== null ? ` · ${parameterBillions(m)}B` : ''}{m.capabilities?.includes('code') ? ' · کد' : ''}{m.capabilities?.includes('reasoning') ? ' · استدلالی' : ''}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      <p className="muted">
        {isAuto
          ? 'مدل فعال: خودکار (روتینگ بر اساس نوع کار، رایگان اول).'
          : `مدل فعال: ${selected!.provider} / ${selected!.id}`}
        {' '}«رایگان» یعنی قیمت توکن صفر یا رایگان‌بودنِ اعلامی سرویس؛ سقف‌های پلن رایگان هر سرویس ممکن است جداگانه اعمال شود — درگاه با Failover خودکار از آن عبور می‌کند.
      </p>
      {!isAuto && (
        <button className="btn subtle" onClick={() => { clearManagedModel(); setSelected(null); }}>
          بازگشت به حالت خودکار
        </button>
      )}

      <details>
        <summary>آدرس درگاه برای نسخه اندروید/استاتیک (اختیاری)</summary>
        <label className="stack-label">آدرس پایه درگاه
          <input
            dir="ltr"
            placeholder="https://konklancer2.vercel.app"
            value={gatewayBase}
            onChange={(e) => setGatewayBase(e.target.value)}
          />
        </label>
        <button className="btn subtle" onClick={() => { saveGatewayBase(gatewayBase); setNotice('آدرس درگاه ذخیره شد.'); void refresh(); }}>
          ذخیره آدرس درگاه
        </button>
        <p className="muted">در نسخه وب خالی بماند. در APK آدرس نسخه مستقر روی Vercel را وارد کنید تا درخواست‌های AI از همان درگاه عبور کنند.</p>
      </details>

      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
