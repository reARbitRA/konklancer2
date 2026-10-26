import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';

/**
 * دروازه‌ی ورود.
 *
 * رفتار پیش‌فرض «نرم» است: اپ بدون حساب هم کامل کار می‌کند (ورود از هدر یا مسیر
 * `/login`). فقط اگر `VITE_AUTH_REQUIRED=true` باشد اپ تا ورود موفق رندر نمی‌شود.
 *
 * این تصمیم عمدی است: در محیط‌هایی که به Supabase دسترسی شبکه‌ای نیست یا
 * providerها هنوز در داشبورد فعال نشده‌اند، قفل‌کردن کل اپ یعنی «اپ خراب».
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ready, session, authRequired } = useAuth();

  if (!authRequired) return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFBF0]" data-testid="auth-boot">
        <div className="flex items-center gap-2 border-[3px] border-[#0a0a0a] bg-white px-4 py-3 shadow-[6px_6px_0px_0px_#000]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px] font-black">در حال بررسی نشست…</span>
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen fullScreen />;

  return <>{children}</>;
};

export default AuthGate;
