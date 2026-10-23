/**
 * محلی‌سازی کلیپ‌بورد برای تمام محیط‌ها:
 * - Android WebView native bridge (window.KonkLancerHost.copyText)
 * - navigator.clipboard (HTTPS / secure context)
 * - Fallback global clipboard objects
 * - Fallback <textarea> + document.execCommand('copy') برای file:// و محلی
 */

// The full KonkLancerHost interface is declared in safeDownload.ts (which also
// declares saveFileToDownloads/shareFile). We do not re-declare it here to
// avoid duplicate-identifier errors.


export function isSecureContextAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      'isSecureContext' in window &&
      window.isSecureContext === true &&
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard !== 'undefined' &&
      typeof navigator.clipboard.writeText === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * عملية نسخ آمني که در هيچ محيطي TypeError thrown ندهد.
 * در صورت عدم موفقیت یک throw simulating نظم فعلي ندارد بلکه false برمی‌گرداند.
 */
export async function safeCopyText(text: string): Promise<boolean> {
  if (typeof text !== 'string' || text.length === 0) return false;

  // ۱. پل اصلی Android WebView (درون APK)
  try {
    if (typeof window !== 'undefined' && window.KonkLancerHost?.copyText) {
      window.KonkLancerHost.copyText(text);
      return true;
    }
  } catch {
    // ignore
  }

  // ۲. API مدرن
  if (isSecureContextAvailable()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // continue to fallbacks
    }
  }

  // ۳. Global clipboard objects
  try {
    const w = window as unknown as Record<string, any>;
    // @ts-ignore – legacy IE/custom
    if (typeof w.clipboardData !== 'undefined' && w.clipboardData?.setData) {
      // @ts-ignore
      w.clipboardData.setData('text/plain', text);
      return true;
    }
  } catch {
    // ignore
  }

  // ۴. Fallback executable (textarea + execCommand)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.dir = 'ltr';
    ta.spellcheck = false;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    // ignore
  }

  return false;
}
