import zhCommon from '../../../locale/zh-CN/common.json' with { type: 'json' };
import enCommon from '../../../locale/en-US/common.json' with { type: 'json' };

export const UI_LOCALES = ['zh-CN', 'en-US'] as const;
export type UILocale = typeof UI_LOCALES[number];
export const UI_LOCALE_STORAGE_KEY = 'rainy-ui-locale-v1';

export function resolveUILocale(saved: string | null, languages: readonly string[]): UILocale {
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
    if (/^en(?:-|$)/i.test(language)) return 'en-US';
  }
  return 'zh-CN';
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function readUILocale(storage: PreferenceStorage | null, languages: readonly string[]): UILocale {
  let saved: string | null = null;
  try { saved = storage?.getItem(UI_LOCALE_STORAGE_KEY) ?? null; } catch { /* Browsing must work without storage access. */ }
  return resolveUILocale(saved, languages);
}

export function saveUILocale(storage: PreferenceStorage | null, locale: UILocale): boolean {
  if (!storage || !UI_LOCALES.includes(locale)) return false;
  try { storage.setItem(UI_LOCALE_STORAGE_KEY, locale); return true; } catch { return false; }
}

// The same resolver is passed to this early script; it has no library or article dependencies.
function bootstrapUILocale(resolve: typeof resolveUILocale, key: string, titles: Record<UILocale, string>): void {
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(key); } catch { /* Storage may be disabled. */ }
  const locale = resolve(saved, navigator.languages?.length ? navigator.languages : [navigator.language]);
  document.documentElement.lang = locale;
  document.documentElement.dataset.uiLocale = locale;
  document.title = titles[locale];
}

export const UI_LOCALE_BOOTSTRAP_SCRIPT = '(' + bootstrapUILocale.toString() + ')(' + resolveUILocale.toString() + ',' + JSON.stringify(UI_LOCALE_STORAGE_KEY) + ',' + JSON.stringify({ 'zh-CN': zhCommon.app.title, 'en-US': enCommon.app.title }) + ');';
