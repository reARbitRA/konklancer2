import React, { createContext, useContext, useEffect, useState } from 'react';
import translations from './translations.json';

export type Language = 'fa' | 'en';
const STORAGE_KEY = 'konklancer_language';
function initialLanguage(): Language {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'fa'; } catch { return 'fa'; }
}
let current: Language = initialLanguage();
export function formatNumber(value:number):string { return value.toLocaleString(current === 'fa' ? 'fa-IR' : 'en-US'); }
export function t(text: string): string {
  return current === 'fa' ? (translations as Record<string, string>)[text] || text : text;
}
const LanguageContext = createContext<{language: Language; setLanguage: (language: Language) => void}>({language: 'fa', setLanguage: () => {}});
export function LanguageProvider({children}:{children:React.ReactNode}) {
  const [language, update] = useState<Language>(current);
  const setLanguage = (next:Language) => { current = next; update(next); try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference remains active in memory */ } };
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'; }, [language]);
  return <LanguageContext.Provider value={{language,setLanguage}}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
