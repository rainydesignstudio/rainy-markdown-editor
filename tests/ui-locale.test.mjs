import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { resolveUILocale, readUILocale, saveUILocale, UI_LOCALE_STORAGE_KEY, UI_LOCALE_BOOTSTRAP_SCRIPT } from '../src/lib/i18n/preferences.ts';
import { createUII18n, UI_RESOURCES } from '../src/lib/i18n/runtime.ts';

test('explicit locale wins, supported browser languages are matched in order, otherwise Chinese', () => {
  assert.equal(resolveUILocale('en-US', ['zh-CN']), 'en-US');
  assert.equal(resolveUILocale('zh-CN', ['en-GB']), 'zh-CN');
  assert.equal(resolveUILocale('bad', ['fr-FR', 'en-GB', 'zh-TW']), 'en-US');
  assert.equal(resolveUILocale(null, ['zh-HK', 'en-US']), 'zh-CN');
  assert.equal(resolveUILocale(null, ['de-DE']), 'zh-CN');
});

test('preference failure is non-blocking and only the origin UI preference key is written', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readUILocale(denied, ['en-US']), 'en-US');
  assert.equal(saveUILocale(denied, 'en-US'), false);
  assert.equal(saveUILocale(null, 'zh-CN'), false);
  const writes = [];
  assert.equal(saveUILocale({ setItem: (...args) => writes.push(args) }, 'en-US'), true);
  assert.deepEqual(writes, [[UI_LOCALE_STORAGE_KEY, 'en-US']]);
});

test('bundled translations are synchronously ready, support interpolation, plurals and Chinese fallback', async () => {
  const instance = createUII18n('en-US');
  assert.equal(instance.isInitialized, true);
  assert.equal(instance.t('articleCount', { count: 0 }), '0 articles');
  assert.equal(instance.t('articleCount', { count: 1 }), '1 article');
  assert.equal(instance.t('articleCount', { count: 2 }), '2 articles');
  assert.equal(instance.t('language.current', { language: 'English' }), 'Interface language: English');
  instance.removeResourceBundle('en-US', 'common');
  assert.equal(instance.t('loading.label'), '正在载入资料库');
  const separate = createUII18n('en-US');
  assert.equal(separate.t('loading.label'), 'Loading library');
  await separate.changeLanguage('zh-CN');
  assert.equal(separate.t('articleCount', { count: 1 }), '1 篇文章');
});

function flatten(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? prefix + '.' + key : key;
    return typeof item === 'string' ? [[path, item]] : Object.entries(flatten(item, path));
  }));
}

test('both catalogs have identical keys and interpolation parameters', () => {
  const chinese = flatten(UI_RESOURCES['zh-CN']);
  const english = flatten(UI_RESOURCES['en-US']);
  assert.deepEqual(Object.keys(english).sort(), Object.keys(chinese).sort());
  const parameters = text => [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(chinese)) {
    assert.ok(english[key].trim(), key);
    assert.deepEqual(parameters(english[key]), parameters(chinese[key]), key);
  }
});

test('early bootstrap picks the same preference and language before hydration, including denied storage', () => {
  for (const [saved, denied, language, expected] of [['en-US', false, 'zh-CN', 'en-US'], ['zh-CN', false, 'en-US', 'zh-CN'], [null, true, 'en-GB', 'en-US']]) {
    const document = { documentElement: { lang: 'zh-CN', dataset: {} }, title: '' };
    vm.runInNewContext(UI_LOCALE_BOOTSTRAP_SCRIPT, {
      document, navigator: { languages: [language], language },
      window: { localStorage: { getItem() { if (denied) throw new Error('denied'); return saved; } } },
    });
    assert.equal(document.documentElement.lang, expected);
    assert.equal(document.documentElement.dataset.uiLocale, expected);
    assert.equal(document.title, UI_RESOURCES[expected].common.app.title);
  }
});
