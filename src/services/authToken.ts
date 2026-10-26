/**
 * پل کوچک بین نشست Supabase و `apiFetch`.
 *
 * چرا فایل جدا؟ تا `apiFetch` مجبور نشود کل `@supabase/supabase-js` را import کند
 * (هم تست‌های jsdom سبک بمانند، هم وابستگی حلقه‌ای ایجاد نشود).
 * `AuthProvider` این مقدار را با هر تغییر نشست به‌روز می‌کند.
 */
let accessToken: string | null = null;
let userId: string | null = null;

export function setAuthAccessToken(token: string | null, id: string | null = null): void {
  accessToken = token && token.split('.').length === 3 ? token : null;
  userId = accessToken ? id : null;
}

export function getAuthAccessToken(): string | null {
  return accessToken;
}

export function getAuthUserId(): string | null {
  return userId;
}
