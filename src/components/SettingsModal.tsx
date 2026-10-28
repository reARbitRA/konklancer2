import React, { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Cpu, Loader2, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { notificationPermission, requestNotificationPermission } from '../utils/reminders';
import { UserSettings } from '../types';
import { countLegacyApiKeys, purgeAllApiKeys } from '../utils/customLLMClient';
import { testConnectionDirect } from '../services/browserLLM';
import { writeApiToken } from '../utils/apiFetch';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen = true, onClose, settings, onSave }) => {
  const [apiToken, setApiToken] = useState(settings.apiToken || '');
  const [githubToken, setGithubToken] = useState(settings.githubToken || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(Boolean(settings.notificationsEnabled));
  const [permission, setPermission] = useState(() => notificationPermission());
  const [legacyKeyCount, setLegacyKeyCount] = useState(() => countLegacyApiKeys());
  const [testing, setTesting] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setApiToken(settings.apiToken || '');
    setGithubToken(settings.githubToken || '');
    setNotificationsEnabled(Boolean(settings.notificationsEnabled));
    setPermission(notificationPermission());
    setLegacyKeyCount(countLegacyApiKeys());
    setStatusMsg(null);
  }, [isOpen, settings.apiToken, settings.githubToken, settings.notificationsEnabled]);

  if (!isOpen) return null;

  const saveSettings = () => {
    const cleanToken = apiToken.trim();
    writeApiToken(cleanToken);
    onSave({ ...settings, githubToken, apiToken: cleanToken, notificationsEnabled });
  };

  const testGateway = async () => {
    const cleanToken = apiToken.trim();
    if (!cleanToken) {
      setStatusMsg({ type: 'err', text: 'ابتدا توکن رله را وارد و ذخیره کنید.' });
      return;
    }
    writeApiToken(cleanToken);
    setTesting(true);
    setStatusMsg(null);
    try {
      const result = await testConnectionDirect();
      setStatusMsg({
        type: 'ok',
        text: `درگاه Konkred پاسخ داد: ${result.model} · ${result.latencyMs.toLocaleString('fa-IR')} میلی‌ثانیه`,
      });
    } catch (error: any) {
      setStatusMsg({ type: 'err', text: error?.message || 'اتصال به درگاه ناموفق بود.' });
    } finally {
      setTesting(false);
    }
  };

  const clearLegacyProviderKeys = () => {
    if (!window.confirm('کلیدهای provider قدیمی فقط از حافظه‌ی همین دستگاه پاک شوند؟ این کار کلیدهای تنظیم‌شده در درگاه Konkred را تغییر نمی‌دهد.')) return;
    purgeAllApiKeys();
    setLegacyKeyCount(0);
    setStatusMsg({ type: 'ok', text: 'کلیدهای قدیمی provider از این دستگاه پاک شدند.' });
  };

  const handleDone = () => {
    saveSettings();
    setSavedToast(true);
    window.setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 450);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="تنظیمات درگاه Konkred"
    >
      <div className="w-full max-w-2xl bg-white border-[3px] border-[#0a0a0a] shadow-[8px_8px_0px_0px_#000] overflow-hidden my-4 sm:my-8 max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b-[3px] border-[#0a0a0a] bg-[#0a0a0a] text-[#FFFBF0]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 shrink-0 border-[2px] border-current flex items-center justify-center"><Cpu className="w-4 h-4" /></span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-black tracking-wide uppercase leading-5">اتصال هوش مصنوعی</h3>
              <p className="text-[11px] font-mono opacity-70 truncate">همه‌ی درخواست‌ها از درگاه مرکزی Konkred عبور می‌کنند</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 shrink-0 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] flex items-center justify-center hover:bg-[#FFDE03] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 brutal-scroll">
          {statusMsg && (
            <div className={`p-3.5 border text-xs flex items-start gap-2 ${statusMsg.type === 'ok' ? 'bg-[#00E599]/25 border-[2px] border-[#0a0a0a] text-[#00875A]' : 'bg-[#FF3B30]/15 border-[2px] border-[#0a0a0a] text-[#C1121F]'}`} role="status">
              {statusMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <section className="p-3.5 bg-white/80 border-[2.5px] border-[#0a0a0a] space-y-3" data-testid="settings-gateway">
            <h4 className="text-xs font-black uppercase tracking-wide text-[#0a0a0a] flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> درگاه هوش مصنوعی Konkred</h4>
            <p className="text-[11px] leading-5 text-[#333333]">
              مدل، provider، سهمیه و failover را خود درگاه مدیریت می‌کند. کلیدهای provider در مرورگر/APK لازم نیستند؛ اعتبار درگاه فقط روی سرور نگه‌داری می‌شود.
            </p>
            <label className="block">
              <span className="block text-xs font-bold text-[#0a0a0a] mb-1">توکن دسترسی رله‌ی این برنامه</span>
              <input
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="مقدار KONKLANCER_RELAY_TOKEN را وارد کنید"
                dir="ltr"
                autoComplete="off"
                aria-label="توکن دسترسی رله"
                className="w-full bg-white border-[2px] border-[#0a0a0a] px-3 py-2 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
              />
              <span className="mt-1 block text-[10.5px] text-[#4a4a4a]">
                این توکن فقط به endpoint برنامه دسترسی می‌دهد و کلید gateway یا provider نیست. در همان دستگاه ذخیره و با هدر <code dir="ltr">x-api-token</code> فرستاده می‌شود.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { saveSettings(); setStatusMsg({ type: 'ok', text: 'تنظیمات اتصال ذخیره شد.' }); }} className="brutal-btn brutal-btn--primary brutal-btn--sm">
                <Save className="w-3.5 h-3.5" /> ذخیره توکن
              </button>
              <button type="button" onClick={testGateway} disabled={testing} className="brutal-btn brutal-btn--ink brutal-btn--sm disabled:opacity-50">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {testing ? 'در حال آزمایش…' : 'آزمایش درگاه'}
              </button>
            </div>
            {legacyKeyCount > 0 && (
              <div className="border-t border-[#0a0a0a] pt-3 space-y-2">
                <p className="text-[10.5px] leading-5 text-[#4a4a4a]">
                  {legacyKeyCount.toLocaleString('fa-IR')} کلید provider قدیمی روی این دستگاه ذخیره شده‌اند؛ نسخه‌ی فعلی دیگر از آن‌ها استفاده نمی‌کند.
                </p>
                <button type="button" onClick={clearLegacyProviderKeys} className="text-[10px] font-bold px-2.5 py-1 border-[2px] border-[#0a0a0a] bg-white text-[#C1121F] hover:bg-[#FF3B30]/10 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> پاک‌کردن کلیدهای قدیمی از این دستگاه
                </button>
              </div>
            )}
          </section>

          <section className="p-3.5 bg-white/80 border-[2.5px] border-[#0a0a0a] space-y-3" data-testid="settings-notifications">
            <h4 className="text-xs font-black uppercase tracking-wide text-[#0a0a0a] flex items-center gap-2"><BellRing className="w-4 h-4" /> یادآور مرورگر</h4>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-xs font-bold text-[#0a0a0a]">یادآور مرورگر برای پیشنهادهای بی‌نتیجه</span>
                <span className="block text-[11px] text-[#4a4a4a] leading-5">
                  اگر پیشنهادی بیش از ۴ ساعت در وضعیت «ارسال‌شده» بماند، یک اعلان می‌بینی. وضعیت مجوز: <b>{permission === 'granted' ? 'داده شده' : permission === 'denied' ? 'رد شده' : permission === 'unsupported' ? 'پشتیبانی نمی‌شود' : 'هنوز پرسیده نشده'}</b>
                </span>
              </span>
              <input
                type="checkbox"
                aria-label="فعال‌سازی یادآور مرورگر"
                checked={notificationsEnabled}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  setNotificationsEnabled(enabled);
                  if (enabled) {
                    const result = await requestNotificationPermission();
                    setPermission(result);
                    if (result !== 'granted') setStatusMsg({ type: 'err', text: 'مرورگر اجازه‌ی اعلان نداد؛ یادآور فقط داخل برنامه ثبت می‌شود.' });
                  }
                  onSave({ ...settings, githubToken, apiToken: apiToken.trim(), notificationsEnabled: enabled });
                }}
                className="w-5 h-5 mt-1 accent-[#0066FF] cursor-pointer shrink-0"
              />
            </label>
          </section>

          <section className="p-3.5 bg-white/80 border-[2.5px] border-[#0a0a0a] space-y-2.5">
            <label className="block text-xs font-bold text-[#0a0a0a]">توکن GitHub برای انتشار مخزن تحویلی (اختیاری)</label>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={githubToken}
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder="ghp_... یا github_pat_..."
              dir="ltr"
              className="w-full bg-white border-[2px] border-[#0a0a0a] px-3 py-2 text-xs font-mono text-[#0a0a0a] focus:outline-none focus:border-[#0066FF]"
            />
            <p className="text-[10.5px] text-[#4a4a4a]">توکن فقط در تنظیمات کاربر نگه‌داری می‌شود؛ آن را در کد یا مخزن قرار ندهید.</p>
          </section>

          <div className="pt-2 flex justify-end gap-3 border-t border-[2px] border-[#0a0a0a]">
            <button type="button" onClick={handleDone} className="brutal-btn brutal-btn--primary gap-2">
              {savedToast ? <><CheckCircle2 className="w-4 h-4" /> ذخیره و اعمال شد</> : <><Save className="w-4 h-4" /> ذخیره و بازگشت</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
