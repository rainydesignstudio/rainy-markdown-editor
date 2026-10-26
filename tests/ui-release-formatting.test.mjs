import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import changelog from '../resources/changelog/public.json' with { type: 'json' };
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
      if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
      if (id === 'react/jsx-runtime') return { jsx, jsxs, Fragment };
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: ns => ({ t: instance.getFixedT(locale, ns) }), useUILocale: () => ({ locale }) };
      if (id.endsWith('/i18n/formatters')) return formats;
      if (id.endsWith('/i18n/changelog')) return { releaseTextKey };
      if (id.endsWith('/resources/changelog/public.json')) return changelog;
      if (id.endsWith('/appVersion')) return { APP_VERSION: '0.2.2' };
      if (id.endsWith('/useAnimatedMaxHeight')) return { useAnimatedMaxHeight: () => null };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogButton: 'action', DialogActions: 'actions', DialogFooter: 'footer' };
      if (id.endsWith('/fileSystem')) return { monthKey: () => '2026-10' };
      return extra[id] ?? {};
    },
  });
  return { exports: module.exports, i18n: instance, render(name, props) { cursor = 0; return module.exports[name](props); }, setLocale(value) { locale = value; } };
}

test('all release translations cover original summaries, sections and items without duplicating metadata', async () => {
  const en = createUII18n('en-US'), zh = createUII18n('zh-CN');
  const storedChinese = JSON.parse(await readFile(new URL('../resources/locale/zh-CN/changelog.json', import.meta.url), 'utf8'));
  assert.equal(storedChinese.releases, undefined, 'Chinese wording is derived from its original single source');
  const historicalVersions = ['0.1.1', '0.1.2', '0.1.3', '0.1.3.1', '0.1.4', '0.1.5', '0.1.6', '0.1.7', '0.1.8', '0.2.0', '0.2.1'];
  const historical = changelog.filter(release => historicalVersions.includes(release.version));
  assert.equal(historical.length, historicalVersions.length);
  // The accepted 0.2.1 release finalized its status and summary; freeze that released history.
  assert.equal(createHash('sha256').update(JSON.stringify(historical)).digest('hex'), '8f76229bac035be67f5dc53c1dc531a98ca42ca463ee884688c14caf5d5311da');
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
        if (typeof item === 'string') {
          assert.equal(zh.t(path), item); assert.ok(en.exists(path, { lng: 'en-US' })); assert.ok(en.t(path).trim());
        } else {
          assert.equal(zh.t(path + '.title'), item.title);
          assert.ok(en.exists(path + '.title', { lng: 'en-US' })); assert.ok(en.t(path + '.title').trim());
          assert.equal(translated.sections[si].items[ii].items.length, item.items.length);
          for (const [di, detail] of item.items.entries()) {
            const detailPath = path + `.items.${di}`;
            assert.equal(zh.t(detailPath), detail);
            assert.ok(en.exists(detailPath, { lng: 'en-US' })); assert.ok(en.t(detailPath).trim());
          }
        }
      }
      assert.equal(translated.sections[si].items.length, section.items.length);
    }
  }
});

test('grouped release notes render semantic nested lists, retain legacy strings and fall back to English', async () => {
  const view = await component('global/ChangelogDialog.tsx');
  const releaseNode = version => nodes(view.render('ChangelogDialog', { onClose() {} })).find(node => node.props?.release?.version === version);
  const documentFor = version => {
    const node = releaseNode(version);
    return new JSDOM(renderToStaticMarkup(node.type({ ...node.props, open: true }))).window.document;
  };
  for (const locale of ['en-US', 'zh-CN']) {
    view.setLocale(locale);
    for (const [version, topics, explanations] of [['0.3.0', 26, 46], ['0.2.2.1', 16, 26]]) {
      const document = documentFor(version);
      assert.equal(document.querySelectorAll('details').length, 4);
      assert.equal(document.querySelectorAll('details > ul > li > strong').length, topics);
      assert.equal(document.querySelectorAll('details > ul > li > ul > li').length, explanations);
      const expected = UI_RESOURCES[locale].changelog.releases[releaseTextKey(version)].sections;
      assert.deepEqual([...document.querySelectorAll('details > ul > li > ul > li')].map(node => node.textContent), expected.flatMap(section => section.items.flatMap(item => item.items)));
    }
    const legacy = documentFor('0.2.1');
    assert.equal(legacy.querySelectorAll('ul ul').length, 0);
    assert.equal(legacy.querySelector('details > ul > li').textContent, UI_RESOURCES[locale].changelog.releases.v0_2_1.sections[0].items[0]);
  }
  view.i18n.removeResourceBundle('zh-CN', 'changelog');
  const fallback = documentFor('0.3.0');
  assert.equal(fallback.querySelector('strong').textContent, UI_RESOURCES['en-US'].changelog.releases.v0_3_0.sections[0].items[0].title);
  assert.equal(fallback.querySelector('ul ul li').textContent, UI_RESOURCES['en-US'].changelog.releases.v0_3_0.sections[0].items[0].items[0]);
});

test('release titles and explanations render markup as literal text', async () => {
  const view = await component('global/ChangelogDialog.tsx');
  const title = '<strong>Literal title</strong>', explanation = '<img src=x onerror=alert(1)><br/>Literal explanation';
  view.i18n.addResource('en-US', 'changelog', 'releases.v0_3_0.sections.0.items.0.title', title);
  view.i18n.addResource('en-US', 'changelog', 'releases.v0_3_0.sections.0.items.0.items.0', explanation);
  const node = nodes(view.render('ChangelogDialog', { onClose() {} })).find(node => node.props?.release?.version === '0.3.0');
  const document = new JSDOM(renderToStaticMarkup(node.type(node.props))).window.document;
  assert.equal(document.querySelector('strong').textContent, title);
  assert.equal(document.querySelector('ul ul li').textContent, explanation);
  assert.equal(document.querySelectorAll('strong strong, img, br, script').length, 0);
});

test('release expansion, version IDs and category keys survive locale changes and toggle-all', async () => {
  const view = await component('global/ChangelogDialog.tsx');
  const render = () => view.render('ChangelogDialog', { onClose() {} });
  let tree = render();
  const releases = () => nodes(tree).filter(node => node.props?.release);
  const newest = changelog.at(-1);
  assert.deepEqual(releases().filter(node => node.props.open).map(node => node.props.release.version), newest.sections?.length ? [newest.version] : []);
  const older = releases().find(node => node.props.release.version === '0.1.6');
  older.props.onToggle(); tree = render();
  const before = releases().map(node => [node.key, node.props.release.version, node.props.open]);
  const categorized = releases().find(node => node.props.release.sections?.length), englishBlock = categorized.type(categorized.props);
  assert.ok(text(englishBlock).includes(createUII18n('en-US').t('changelog:status.' + categorized.props.release.status)));
  const englishKeys = nodes(englishBlock).filter(node => node.type === 'details').map(node => node.key);
  assert.ok(englishKeys.length > 0);
  view.setLocale('zh-CN'); tree = render();
  assert.deepEqual(releases().map(node => [node.key, node.props.release.version, node.props.open]), before);
  const localized = releases().find(node => node.props.release.version === categorized.props.release.version);
  const chineseBlock = localized.type(localized.props);
  assert.ok(text(chineseBlock).includes(createUII18n('zh-CN').t('changelog:status.' + categorized.props.release.status)));
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
  const select = nodes(tree).find(node => node.type === 'select-field');
  assert.equal(select.props.value, '2026-09');
  const september = select.props.options.find(option => option.value === '2026-09');
  assert.equal(september.label, 'September 2026');
  select.props.onChange('2026-08');
  assert.deepEqual(selected, ['2026-08']);
});
