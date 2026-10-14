import test from 'node:test';
import assert from 'node:assert/strict';
import { localeCoverage } from './locale-coverage.mjs';
import { UI_RESOURCES, createUII18n } from '../src/lib/i18n/runtime.ts';
import { inspectEditorTheme, validateEditorTheme, parseEditorThemeJson, BASE_EDITOR_THEME } from '../src/lib/editorThemes.ts';
import { formatDiagnosticMessage, formatProductMessage, productDiagnosticReference, productErrorMessage, productJoin, productMessage, productReference } from '../src/lib/i18n/productMessages.ts';
import { inspectThemeConfig, validateThemeConfig, parseThemeConfigJson } from '../src/lib/themeValidation.ts';
import { validateContentSource } from '../src/lib/contentValidation.ts';
import { articleListCheckResult } from '../src/lib/articleListChecks.ts';
import { SNIPPET_CATEGORY_ICONS } from '../src/lib/snippetCategoryIcons.ts';
import { EDITOR_COLOR_ROLES } from '../src/lib/editorThemes.ts';
import { TAILWIND_PALETTE } from '../src/lib/tailwindPalette.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';

test('source translation references exist in both locales and supply declared parameters', () => {
  const result = localeCoverage();
  assert.ok(result.references > 1500);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.parameters, []);
});

test('English product catalogs have no Chinese prose except the language option endonym', () => {
  const found = [];
  function visit(value, key = '') {
    for (const [name, child] of Object.entries(value)) {
      const next = key ? key + '.' + name : name;
      if (typeof child === 'string') {
        if (/[\p{Script=Han}]/u.test(child)) found.push([next, child]);
      } else visit(child, next);
    }
  }
  visit(UI_RESOURCES['en-US']);
  assert.deepEqual(found, [['common.language.zh-CN', '简体中文']]);
});

test('multi-error editor theme reports retain canonical validation and translate without revalidating', () => {
  const input = { ...BASE_EDITOR_THEME, fonts: {}, colors: { light: {}, dark: {} } };
  const diagnostics = inspectEditorTheme(input);
  const canonical = validateEditorTheme(input);
  assert.ok(diagnostics.length > 5);
  assert.deepEqual(diagnostics.map(issue => issue.message), canonical);
  let error;
  try { parseEditorThemeJson(JSON.stringify(input)); } catch (failure) { error = failure; }
  assert.equal(error.message, canonical.join('；'));
  const record = productErrorMessage(error), original = JSON.stringify(record);
  const translated = formatProductMessage(record, createUII18n('en-US').getFixedT('en-US', 'messages'));
  assert.ok(translated.includes('light'));
  assert.ok(translated.includes('fonts'));
  assert.equal(/[\p{Script=Han}]/u.test(translated), false);
  assert.equal(formatProductMessage(record, createUII18n('zh-CN').getFixedT('zh-CN', 'messages')), error.message);
  assert.equal(JSON.stringify(record), original);
});

test('article theme and template metadata error details retain message IDs and unchanged canonical errors', async () => {
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  const diagnostics = inspectThemeConfig({});
  assert.deepEqual(diagnostics.map(issue => issue.message), validateThemeConfig({}));
  let error;
  try { parseThemeConfigJson('{}'); } catch (failure) { error = failure; }
  assert.equal(/[\p{Script=Han}]/u.test(formatProductMessage(error, en)), false);
  const result = await validateContentSource('templates', '---\ntitle: []\ncategories: 1\n---\n正文');
  assert.equal(result.errors.length, 2);
  assert.ok(result.errorMessage);
  assert.equal(/[\p{Script=Han}]/u.test(formatProductMessage(result.errorMessage, en)), false);
  const canonical = createUII18n('zh-CN').getFixedT('zh-CN', 'messages');
  assert.equal(formatProductMessage(result.errorMessage, canonical), result.errors.join('；'));
});

test('composed diagnostic reports keep authored standard text and filenames literal', () => {
  const authored = '深色转换已取消。';
  const parts = [
    productJoin(['用户主题.json：', productDiagnosticReference({ domain: 'standard', message: authored })]),
    productDiagnosticReference({ message: authored }),
  ];
  const record = productReference('shared.compose', { parts: productJoin(parts, '；') });
  assert.equal(formatProductMessage(record, createUII18n('en-US').getFixedT('en-US', 'messages')), '用户主题.json：深色转换已取消。；Dark-mode conversion was cancelled.');
});

test('registered dynamic icon, color, font, node, export and history IDs have translations', () => {
  const groups = {
    'dialogs:icons.': SNIPPET_CATEGORY_ICONS.map(item => item.id),
    'dialogs:colorRoles.': EDITOR_COLOR_ROLES,
    'dialogs:fontRoles.': Object.keys(BASE_EDITOR_THEME.fonts),
    'dialogs:paletteFamilies.': TAILWIND_PALETTE.map(item => item.name),
    'dialogs:nodes.': Object.keys(getFormatSnapshot().bundle.validator.product.theme.nodes),
    'dialogs:historyKinds.': ['automatic', 'manual', 'before-restore', 'before-theme-change'],
    'dialogs:historyFields.': ['title', 'description', 'author', 'categories'],
    'dialogs:mediaTitles.': ['rename', 'describe', 'replace', 'delete', 'transfer'],
  };
  for (const locale of ['zh-CN', 'en-US']) {
    const instance = createUII18n(locale);
    for (const [prefix, ids] of Object.entries(groups)) for (const id of ids) assert.ok(instance.exists(prefix + id), locale + ':' + prefix + id);
    for (const id of ['package', 'markdown', 'body', 'png', 'pdf']) for (const field of ['title', 'detail']) assert.ok(instance.exists('dialogs:exportFormats.' + id + '.' + field));
  }
});

test('existing failed list checks update product messages without changing their state or signature', () => {
  const article = { id: 'original-id', parse: { metadata: { updatedAt: '2026-10-09T00:00:00Z', theme: { id: 'basic', version: '1.0.6' } }, diagnostics: [] } };
  const engine = { kind: 'engine', tier: 'error', domain: 'product', name: '格式检查引擎', ...productMessage('runtime.darkTimeout') };
  const report = { theme: { passed: [], issues: [engine] }, body: { passed: [], issues: [] } };
  const record = articleListCheckResult(article, report), before = JSON.stringify(record);
  assert.equal(record.state, 'failed');
  assert.equal(formatDiagnosticMessage(record, createUII18n('en-US').getFixedT('en-US', 'messages')), 'Dark-mode conversion timed out.');
  assert.equal(formatDiagnosticMessage(record, createUII18n('zh-CN').getFixedT('zh-CN', 'messages')), engine.message);
  assert.equal(JSON.stringify(record), before);
});

test('reference scan counts use singular and plural English without changing the Chinese wording', () => {
  const en = createUII18n('en-US'), zh = createUII18n('zh-CN');
  for (const count of [0, 1, 2]) {
    assert.equal(en.t('dialogs:templates.currentReferences', { count }), `This article: ${count} ${count === 1 ? 'reference' : 'references'}`);
    assert.equal(en.t('dialogs:templates.currentBodyReferences', { count }), `Current manuscript body: ${count} ${count === 1 ? 'reference' : 'references'}`);
    assert.equal(en.t('dialogs:templates.workspaceReferences', { count, current: 'No current manuscript open', warning: '' }), `No current manuscript open, workspace: ${count} ${count === 1 ? 'reference' : 'references'} (including history)`);
    assert.equal(zh.t('dialogs:templates.currentReferences', { count }), `本文 ${count} 处`);
  }
});
