'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { createUII18n } from '../../lib/i18n/runtime';
import { readUILocale, saveUILocale, type UILocale } from '../../lib/i18n/preferences';

type UILocaleContextValue = { locale: UILocale; ready: boolean; preferenceSaved: boolean | null; setLocale: (locale: UILocale) => Promise<void> };
const UILocaleContext = createContext<UILocaleContextValue | null>(null);

function browserStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function UILocaleProvider({ children }: { children: ReactNode }) {
  // Server and hydration both start with Chinese. StartupLoading hides product text until the browser preference is ready.
  const [instance] = useState(() => createUII18n());
  const [locale, updateLocale] = useState<UILocale>('zh-CN');
  const [ready, setReady] = useState(false);
  const [preferenceSaved, setPreferenceSaved] = useState<boolean | null>(null);
  const setLocale = useCallback(async (next: UILocale) => {
    if (next !== 'zh-CN' && next !== 'en-US') return;
    await instance.changeLanguage(next);
    updateLocale(next);
    setPreferenceSaved(saveUILocale(browserStorage(), next));
  }, [instance]);

  useLayoutEffect(() => {
    const next = readUILocale(browserStorage(), navigator.languages?.length ? navigator.languages : [navigator.language]);
    let disposed = false;
    void instance.changeLanguage(next).then(() => {
      if (!disposed) { updateLocale(next); setReady(true); }
    });
    return () => { disposed = true; };
  }, [instance]);
  useLayoutEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.uiLocale = locale;
    document.documentElement.dataset.uiLocaleState = 'ready';
  }, [locale, ready]);
  return <I18nextProvider i18n={instance}>
    <title suppressHydrationWarning>{instance.t('app.title')}</title>
    <meta name="description" content={instance.t('app.description')} suppressHydrationWarning />
    <UILocaleContext.Provider value={{ locale, ready, preferenceSaved, setLocale }}>{children}</UILocaleContext.Provider>
  </I18nextProvider>;
}

export function useUILocale(): UILocaleContextValue {
  const value = useContext(UILocaleContext);
  if (!value) throw new Error('useUILocale must be used inside UILocaleProvider');
  return value;
}

export function useUITranslation(namespace = 'common') {
  return useTranslation(namespace);
}
