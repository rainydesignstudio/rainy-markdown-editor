import * as previewScrolling from '../src/lib/editor/previewScrolling.ts';
import * as uiFormatters from '../src/lib/i18n/formatters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import { articleCollectionLabel } from '../src/lib/i18n/articleLabels.ts';

test('collection IDs translate product labels without translating colliding user project names', () => {
  const instance = createUII18n('en-US'), t = instance.t.bind(instance);
  assert.equal(articleCollectionLabel('all', '全部文章', t), 'All articles');
  assert.equal(articleCollectionLabel('archived', '归档', t), 'Archive');
  assert.equal(articleCollectionLabel('project:user-id', '全部文章', t), '全部文章');
  const groups = {
    'shell:navigation.': ['articles', 'themes', 'template', 'assets', 'settings'],
    'shell:views.': ['articles', 'themes', 'template', 'assets', 'settings'],
    'articles:collections.': ['all', 'unclassified', 'archived'],
    'editor:insert.groups.': ['headings', 'text-formatting', 'lists', 'blocks'],
    'editor:insert.items.': ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6', 'bold', 'italic', 'underline', 'strikethrough', 'inline-code', 'link', 'unordered-list', 'ordered-list', 'task-list', 'table', 'quote', 'code-block', 'rule'],
    'editor:diagnostics.': ['error', 'warning', 'mixed'],
    'common:displayMode.': ['light', 'dark', 'system'],
    'common:language.': ['zh-CN', 'en-US'],
  };
  for (const locale of ['zh-CN', 'en-US']) for (const [prefix, ids] of Object.entries(groups)) {
    for (const id of ids) assert.ok(instance.exists(prefix + id, { lng: locale }), locale + ':' + prefix + id);
  }
});

test('English find fields expose English labels while query and replacement stay byte-exact', async () => {
  const file = await readFile(new URL('../src/components/content/SourceFindBar.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const instance = createUII18n('en-US'), module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return { jsx, jsxs, Fragment };
    if (id === 'react-dom') return { createPortal: node => node };
    if (id.endsWith('/i18n/formatters')) return uiFormatters;
      if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => ({ locale: 'en-US' }), useUITranslation: ns => ({ t: instance.getFixedT('en-US', ns) }) };
    if (id.endsWith('/useTextInputHistory')) return { useTextInputHistory: () => ({ events: { onChange() {} } }) };
    if (id.endsWith('/IconButton')) return { IconButton: ({ tooltip }) => React.createElement('button', { 'aria-label': tooltip }) };
    if (id.endsWith('/DialogFrame')) return {};
    throw new Error(id);
  } });
  const query = '查找_Alpha_😀', replacement = '<section>保留用户文字</section>';
  const props = { query, replacement, count: 1, index: 0, matchCase: false, composing: false, disabled: false, onClose() {}, onMove() {}, onReplace() {} };
  const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(module.exports.SourceFindBar, props)));
  assert.match(html, /aria-label="Find text"/);
  assert.match(html, /aria-label="Replacement text"/);
  assert.ok(html.includes(query));
  assert.ok(html.includes('&lt;section&gt;保留用户文字&lt;/section&gt;'));
});

test('changing UI language updates iframe title without remounting, replacing the target or changing article language', async () => {
  const source = await readFile(new URL('../src/lib/article-format/useArticleRenderMount.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let findCalls = 0; const keyListeners = new Map();
  let cursor = 0, language = 'zh-CN', creations = 0, removals = 0;
  const cells = [], effects = [], frames = [], titles = { 'zh-CN': key => '中文:' + key, 'en-US': key => 'English:' + key };
  const element = () => ({ dataset: {}, style: {}, textContent: '', remove() { removals++; } });
  const head = { styles: [], append(node) { this.styles.push(node); }, querySelector() { return this.styles[0]; } };
  const doc = { documentElement: { dataset: {}, style: {}, classList: { toggle() {} } }, body: { style: {}, append() {} }, head, open() {}, write() {}, close() {}, createElement: element, addEventListener(name, callback) { keyListeners.set(name, callback); }, removeEventListener(name) { keyListeners.delete(name); } };
  doc.createElement = () => ({ ...element(), ownerDocument: doc });
  const host = { addEventListener() {}, removeEventListener() {}, style: {}, clientWidth: 996, clientHeight: 959, append(frame) { frames.push(frame); }, querySelectorAll() { return frames; } }, hostRef = { current: host };
  const effect = (fn, deps) => { const i = cursor++, old = cells[i]; if (old && deps.every((x, j) => Object.is(x, old.deps[j]))) return; effects.push(() => { old?.cleanup?.(); cells[i] = { deps, cleanup: fn() }; }); };
  const react = { useEffect: effect, useLayoutEffect: effect, useRef(value) { return cells[cursor++] ??= { current: value }; }, useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = value; return [cells[i], value => { cells[i] = value; }]; } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document: { createElement() { creations++; return { ...element(), contentDocument: doc, setAttribute() {} }; } }, ResizeObserver: class { observe() {} disconnect() {} }, require(id) {
    if (id === 'react') return react;
    if (id.endsWith('/editor/previewScrolling')) return previewScrolling;
    if (id.endsWith('/i18n/formatters')) return uiFormatters;
      if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => ({ locale: 'en-US' }), useUITranslation: () => ({ t: titles[language] }) };
    return {};
  } });
  const snapshot = { id: 'same', bundle: { formatter: { document: { language: 'zh-CN', viewport: { width: 1606, height: 959, contentWidth: 996 } }, preview: { light: { background: 'white' }, dark: { transform: 'preserve' }, color: 'black', fontFamily: 'serif' } } } };
  const render = () => { cursor = 0; const result = module.exports.useArticleRenderMount(hostRef, snapshot, '.unchanged{}', false, { onSourceFind: () => findCalls++ }); while (effects.length) effects.shift()(); return result; };
  render(); const before = render(), target = before.target;
  language = 'en-US'; const after = render();
  assert.equal(creations, 1); assert.equal(removals, 0); assert.equal(after.target, target);
  assert.equal(frames[0].title, 'English:preview.frame');
  assert.equal(doc.documentElement.lang, 'zh-CN');
  assert.equal(head.styles[0].textContent, '.unchanged{}');
  const key = extras => ({ key: 'f', metaKey: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extras });
  const command = key(); keyListeners.get('keydown')(command);
  assert.equal(command.defaultPrevented, true); assert.equal(findCalls, 1);
  keyListeners.get('keydown')(key({ isComposing: true }));
  keyListeners.get('keydown')(key({ defaultPrevented: true }));
  keyListeners.get('keydown')(key({ altKey: true }));
  assert.equal(findCalls, 1, 'IME and already handled shortcuts are left alone');

});
