/**
 * Helpers for downloading files across all environments:
 * - Android WebView native bridge (KonkLancerHost.saveFileToDownloads)
 * - iOS native bridge (webkit.messageHandlers)
 * - Browser blob <a download> with longer-lived object URLs
 */

declare global {
  interface Window {
    KonkLancerHost?: {
      copyText?: (text: string) => void;
      saveFileToDownloads?: (filename: string, base64: string, mimeType: string) => boolean;
      shareFile?: (filename: string, base64: string, mimeType: string) => void;
    };
    webkit?: {
      messageHandlers?: Record<string, unknown>;
    };
  }
}

/** Minimal base64 encoder for Uint8Array (binary-safe). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = Array.from(bytes.subarray(i, i + chunk));
    binary += String.fromCharCode(...(slice as unknown as number[]));
  }
  return btoa(binary);
}

/** Trigger a real file save in any environment without throwing. */
export function downloadBlob(blob: Blob, filename: string): void {
  // 1. Android WebView native bridge
  try {
    const androidSave = window.KonkLancerHost?.saveFileToDownloads;
    if (typeof androidSave === 'function') {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = String(reader.result || '').split(',')[1] || '';
        androidSave(filename, base64, blob.type || 'application/octet-stream');
      };
      reader.onerror = () => browserDownloadFallback(blob, filename);
      reader.readAsDataURL(blob);
      return;
    }
  } catch {
    // fall through to browser
  }

  // 2. iOS native bridge
  try {
    const handler = window.webkit?.messageHandlers?.KonkLancerHost as
      | { postMessage?: (m: unknown) => void }
      | undefined;
    if (handler && typeof handler.postMessage === 'function') {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = String(reader.result || '').split(',')[1] || '';
        handler.postMessage?.({
          action: 'saveFile',
          filename,
          base64,
          mimeType: blob.type,
        });
      };
      reader.readAsDataURL(blob);
      return;
    }
  } catch {
    // fall through
  }

  browserDownloadFallback(blob, filename);
}

function browserDownloadFallback(blob: Blob, filename: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Keep the object URL alive long enough for Android WebView / mobile browsers
    // to begin the download, then revoke it.
    setTimeout(() => {
      document.body.removeChild(a);
    }, 60_000);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 60_000);
  } catch {
    // ignore
  }
}

/** Save a string directly to the device Downloads folder on Android APK. */
export function downloadFileToDownloads(filename: string, content: string, mimeType = 'text/plain'): void {
  const bytes = new TextEncoder().encode(content);
  try {
    if (window.KonkLancerHost?.saveFileToDownloads) {
      window.KonkLancerHost.saveFileToDownloads(filename, toBase64(bytes), mimeType);
    } else {
      const blob = new Blob([bytes], { type: mimeType });
      downloadBlob(blob, filename);
    }
  } catch {
    // ignore
  }
}
