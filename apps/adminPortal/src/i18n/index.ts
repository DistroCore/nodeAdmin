import en from './locales/en.json';
import zh from './locales/zh.json';

export type AppLocale = 'en' | 'zh';

const STORAGE_KEY = 'locale';

const messageMap: Record<AppLocale, Record<string, string>> = { en, zh };

export function getLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY) as AppLocale | null;
  if (stored && stored in messageMap) return stored;

  const browserLang = navigator.language.slice(0, 2).toLowerCase();
  if (browserLang in messageMap) return browserLang as AppLocale;

  return 'zh';
}

export function getMessages(locale: AppLocale): Record<string, string> {
  return messageMap[locale] ?? messageMap.zh;
}

export function setStoredLocale(locale: AppLocale): void {
  localStorage.setItem(STORAGE_KEY, locale);
}
