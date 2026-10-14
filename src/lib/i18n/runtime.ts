import { createInstance, type i18n, type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from '../../../resources/locale/zh-CN/common.json' with { type: 'json' };
import enCommon from '../../../resources/locale/en-US/common.json' with { type: 'json' };
import zhShell from '../../../resources/locale/zh-CN/shell.json' with { type: 'json' };
import enShell from '../../../resources/locale/en-US/shell.json' with { type: 'json' };
import zhArticles from '../../../resources/locale/zh-CN/articles.json' with { type: 'json' };
import enArticles from '../../../resources/locale/en-US/articles.json' with { type: 'json' };
import zhEditor from '../../../resources/locale/zh-CN/editor.json' with { type: 'json' };
import enEditor from '../../../resources/locale/en-US/editor.json' with { type: 'json' };
import zhThemes from '../../../resources/locale/zh-CN/themes.json' with { type: 'json' };
import enThemes from '../../../resources/locale/en-US/themes.json' with { type: 'json' };
import zhContent from '../../../resources/locale/zh-CN/content.json' with { type: 'json' };
import enContent from '../../../resources/locale/en-US/content.json' with { type: 'json' };
import zhMedia from '../../../resources/locale/zh-CN/media.json' with { type: 'json' };
import enMedia from '../../../resources/locale/en-US/media.json' with { type: 'json' };
import zhSettings from '../../../resources/locale/zh-CN/settings.json' with { type: 'json' };
import enSettings from '../../../resources/locale/en-US/settings.json' with { type: 'json' };
import zhDialogs from '../../../resources/locale/zh-CN/dialogs.json' with { type: 'json' };
import enDialogs from '../../../resources/locale/en-US/dialogs.json' with { type: 'json' };
import zhMessages from '../../../resources/locale/zh-CN/messages.json' with { type: 'json' };
import enMessages from '../../../resources/locale/en-US/messages.json' with { type: 'json' };
import zhChangelog from '../../../resources/locale/zh-CN/changelog.json' with { type: 'json' };
import enChangelog from '../../../resources/locale/en-US/changelog.json' with { type: 'json' };
import { chineseReleaseTexts } from './changelog';
import { formatUINumber } from './formatters';
import { UI_LOCALES, type UILocale } from './preferences';

export const UI_RESOURCES = {
  'zh-CN': { common: zhCommon, shell: zhShell, articles: zhArticles, editor: zhEditor, themes: zhThemes, content: zhContent, media: zhMedia, settings: zhSettings, dialogs: zhDialogs, messages: zhMessages, changelog: { ...zhChangelog, releases: chineseReleaseTexts } },
  'en-US': { common: enCommon, shell: enShell, articles: enArticles, editor: enEditor, themes: enThemes, content: enContent, media: enMedia, settings: enSettings, dialogs: enDialogs, messages: enMessages, changelog: enChangelog },
};

// Use i18next's registered formatter for display interpolation. Only numeric values are
// localized; plural selection receives the original count, and strings/IDs stay verbatim.
// Derive resources in memory so canonical core messages and historical Chinese remain unchanged.
function displayResources(resources: Resource): Resource {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(/{{\s*(\w+)\s*}}/g, '{{$1, uiValue}}');
    if (Array.isArray(value)) return value.map(visit);
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)])) : value;
  };
  return visit(resources) as Resource;
}

export function createUII18n(locale: UILocale = 'zh-CN'): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: displayResources(UI_RESOURCES),
    lng: locale,
    supportedLngs: [...UI_LOCALES],
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: Object.keys(UI_RESOURCES['zh-CN']),
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });
  instance.services.formatter?.add('uiValue', (value, language) => typeof value === 'number' ? formatUINumber(value, language === 'en-US' ? 'en-US' : 'zh-CN') : value);
  return instance;
}
