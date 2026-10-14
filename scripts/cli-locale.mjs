import fs from 'node:fs';
import { createInstance } from 'i18next';

export function cliLocale(environment = process.env) {
  const language = environment.LC_ALL || environment.LC_MESSAGES || environment.LANG || '';
  return /^zh(?:[-_.]|$)/i.test(language) ? 'zh-CN' : 'en-US';
}

export function createCliTranslation(locale = cliLocale()) {
  const instance = createInstance();
  const resource = language => JSON.parse(fs.readFileSync(new URL(`../resources/locale/${language}/messages.json`, import.meta.url), 'utf8'));
  void instance.init({ lng: locale, fallbackLng: 'en-US', resources: { 'zh-CN': { messages: resource('zh-CN') }, 'en-US': { messages: resource('en-US') } }, defaultNS: 'messages', initAsync: false, interpolation: { escapeValue: false }, returnNull: false });
  return instance.getFixedT(locale, 'messages');
}
