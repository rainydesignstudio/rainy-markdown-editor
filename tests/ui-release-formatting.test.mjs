import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import changelog from '../resources/changelog.json' with { type: 'json' };
import { createUII18n, UI_RESOURCES } from '../src/lib/i18n/runtime.ts';
import { releaseTextKey, chineseReleaseTexts } from '../src/lib/i18n/changelog.ts';
import * as formats from '../src/lib/i18n/formatters.ts';
import { productLabel } from '../src/lib/i18n/productMessages.ts';

const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];

async function component(file, extra = {}) {
  const source = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
  const instance = createUII18n('en-US'), cells = [], module = { exports: {} };
  let locale = 'en-US', cursor = 0;
  const react = {
    useState(initial) { const at = cursor++; if (!(at in cells)) cells[at] = typeof initial === 'function' ? initial() : initial; return [cells[at], value => cells[at] = typeof value === 'function' ? value(cells[at]) : value]; },
    useCallback: fn => fn,
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs, Fragment };
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: ns => ({ t: instance.getFixedT(locale, ns) }), useUILocale: () => ({ locale }) };
      if (id.endsWith('/i18n/formatters')) return formats;
      if (id.endsWith('/i18n/changelog')) return { releaseTextKey };
      if (id.endsWith('/changelog.json')) return changelog;
      if (id.endsWith('/appVersion')) return { APP_VERSION: '0.2.2' };
      if (id.endsWith('/useAnimatedMaxHeight')) return { useAnimatedMaxHeight: () => null };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogButton: 'action', DialogActions: 'actions', DialogFooter: 'footer' };
      if (id.endsWith('/fileSystem')) return { monthKey: () => '2026-10' };
      return extra[id] ?? {};
    },
  });
  return { exports: module.exports, render(name, props) { cursor = 0; return module.exports[name](props); }, setLocale(value) { locale = value; } };
}

test('all release translations cover original summaries, sections and items without duplicating metadata', async () => {
  const en = createUII18n('en-US'), zh = createUII18n('zh-CN');
  const storedChinese = JSON.parse(await readFile(new URL('../resources/locale/zh-CN/changelog.json', import.meta.url), 'utf8'));
  assert.equal(storedChinese.releases, undefined, 'Chinese wording is derived from its original single source');
  const historicalVersions = ['0.1.1', '0.1.2', '0.1.3', '0.1.3.1', '0.1.4', '0.1.5', '0.1.6', '0.1.7', '0.1.8', '0.2.0', '0.2.1'];
  const historical = changelog.filter(release => historicalVersions.includes(release.version));
  assert.equal(historical.length, historicalVersions.length);
  assert.equal(createHash('sha256').update(JSON.stringify(historical)).digest('hex'), 'd5c25af3008ad6e15e8ffaf8f41cb840b6870b3b44218684e74b49b99c08941c');
  for (const release of changelog) {
    const key = releaseTextKey(release.version), prefix = 'changelog:releases.' + key;
    const translated = UI_RESOURCES['en-US'].changelog.releases[key];
    assert.equal(translated.version, undefined); assert.equal(translated.status, undefined);
    assert.equal(zh.t(prefix + '.summary'), release.summary);
    assert.equal(chineseReleaseTexts[key].summary, release.summary);
    assert.ok(en.exists(prefix + '.summary', { lng: 'en-US' }));
    assert.ok(en.t(prefix + '.summary').trim());
    for (const [si, section] of (release.sections ?? []).entries()) {
      assert.equal(zh.t(prefix + `.sections.${si}.title`), section.title);
      assert.ok(en.exists(prefix + `.sections.${si}.title`, { lng: 'en-US' }));
      for (const [ii, item] of section.items.entries()) {
        const path = prefix + `.sections.${si}.items.${ii}`;
        assert.equal(zh.t(path), item); assert.ok(en.exists(path, { lng: 'en-US' })); assert.ok(en.t(path).trim());
      }
      assert.equal(translated.sections[si].items.length, section.items.length);
    }
  }
});

test('release expansion, version IDs and category keys survive locale changes and toggle-all', async () => {
  const view = await component('global/ChangelogDialog.tsx');
  const render = () => view.render('ChangelogDialog', { onClose() {} });
  let tree = render();
  const releases = () => nodes(tree).filter(node => node.props?.release);
  assert.equal(releases().filter(node => node.props.open).length, 1);
  assert.equal(releases().find(node => node.props.open).props.release.version, changelog.at(-1).version);
  const older = releases().find(node => node.props.release.version === '0.1.6');
  older.props.onToggle(); tree = render();
  const before = releases().map(node => [node.key, node.props.release.version, node.props.open]);
  const latest = releases()[0], englishBlock = latest.type(latest.props);
  assert.ok(text(englishBlock).includes(createUII18n('en-US').t('changelog:status.' + latest.props.release.status)));
  const englishKeys = nodes(englishBlock).filter(node => node.type === 'details').map(node => node.key);
  view.setLocale('zh-CN'); tree = render();
  assert.deepEqual(releases().map(node => [node.key, node.props.release.version, node.props.open]), before);
  const chineseBlock = releases()[0].type(releases()[0].props);
  assert.ok(text(chineseBlock).includes(createUII18n('zh-CN').t('changelog:status.' + latest.props.release.status)));
  assert.deepEqual(nodes(chineseBlock).filter(node => node.type === 'details').map(node => node.key), englishKeys);
  nodes(tree).find(node => node.type === 'header').props.actions.props.onClick(); tree = render();
  assert.ok(releases().filter(node => node.props.release.sections).every(node => node.props.open));
});

test('display numbers use Intl while plural decisions, canonical messages and string parameters remain stable', () => {
  const en = createUII18n('en-US');
  assert.equal(en.t('common:articleCount', { count: 0 }), '0 articles');
  assert.equal(en.t('common:articleCount', { count: 1 }), '1 article');
  assert.equal(en.t('common:articleCount', { count: 2 }), '2 articles');
  assert.equal(en.t('common:articleCount', { count: 12345 }), '12,345 articles');
  assert.equal(en.t('messages:cli.unsupportedArgument', { argument: '12345' }), 'Unsupported argument: 12345. Use --help for startup instructions.');
  const record = productLabel('report.compiled', { revision: 1000, classes: 10000, pass: 1000, warning: 0, error: 0, prefix: '', suffix: '' });
  assert.match(record.label, /revision 1000/);
  assert.equal(formats.formatUINumber(12345, 'en-US'), '12,345');
  assert.equal(formats.formatUINumber(1, 'zh-CN', { minimumIntegerDigits: 2, useGrouping: false }), '01');
  assert.equal(formats.formatUIBytes(1024, 'en-US'), '1.0 KB');
  assert.equal(formats.formatUIBytes(1024 ** 2, 'zh-CN'), '1.0 MB');
  assert.equal(formats.formatUIResolution('1024 × 1536', 'en-US'), '1,024 × 1,536');
});

test('display dates and month labels follow locale without changing stored timestamps or UTC month boundaries', () => {
  const value = '2026-10-09T06:23:38.219Z';
  const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
  assert.equal(formats.formatUIDate(value, 'en-US', options, 'invalid'), 'October 9, 2026');
  assert.equal(formats.formatUIDate(value, 'zh-CN', options, '无效'), '2026年10月9日');
  assert.equal(formats.formatUIDate('invalid-date', 'en-US', options, 'Invalid date'), 'Invalid date');
  assert.equal(formats.formatUIMonth('2026-01', 'en-US'), 'January 2026');
  assert.equal(formats.formatUIMonth('2026-01', 'zh-CN'), '2026年1月');
  assert.equal(formats.formatUIMonth('custom/month', 'en-US'), 'custom/month');
  assert.equal(value, '2026-10-09T06:23:38.219Z');
});

test('localized month option labels keep raw select values and callback parameters', async () => {
  const view = await component('articles/ArticleDialogs.tsx');
  const selected = [];
  const tree = view.render('CopyDialog', {
    article: { month: '2026-09' }, title: '作者文稿', month: '2026-09', months: ['2026-09', '2026-08'],
    applyTheme: null, usesCurrentDraft: false, onChangeTitle() {}, onChangeMonth: value => selected.push(value), onClose() {}, onConfirm() {},
  });
  const select = nodes(tree).find(node => node.type === 'select');
  assert.equal(select.props.value, '2026-09');
  const september = nodes(select).find(node => node.type === 'option' && node.props.value === '2026-09');
  assert.equal(text(september), 'September 2026');
  select.props.onChange({ target: { value: '2026-08' } });
  assert.deepEqual(selected, ['2026-08']);
});
