import { t, useLanguage } from './i18n';
import React from 'react';
import { useAuth } from '../components/auth/AuthProvider';

export default function AuthGate({children}:{children:React.ReactNode}) {
  const {language, setLanguage} = useLanguage();
  const auth = useAuth();
  if (!auth.authRequired) return <>{children}</>;
  if (!auth.ready) return <main className="studio-empty"><p>{t("Checking your session…")}</p></main>;
  if (auth.session) return <>{children}</>;
  return <main className="studio-empty"><button className="language-toggle" onClick={()=>setLanguage(language==='fa'?'en':'fa')} aria-label={language==='fa'?'Switch language to English':'تغییر زبان به فارسی'}>{language==='fa'?'EN':'فا'}</button><span className="micro lime">{t("KONKLANCER / ACCOUNT")}</span><h2>{t("Sign in to continue")}<span>.</span></h2><p>{t("Use an enabled account provider to access this workspace.")}</p><div className="action-row"><button className="btn subtle" onClick={()=>auth.signInWithProvider('google')}>{t("Continue with Google")}</button><button className="btn subtle" onClick={()=>auth.signInWithProvider('github')}>{t("Continue with GitHub")}</button></div>{auth.error && <div className="error" role="alert">{auth.error}</div>}</main>;
}
