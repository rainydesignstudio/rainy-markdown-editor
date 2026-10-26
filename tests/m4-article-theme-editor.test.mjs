import { withUILocaleImports } from './ui-locale-fixture.mjs';
const formatRuntime = await import('../src/lib/article-format/runtime.ts');
const formatPreview = await import('../src/lib/article-format/preview.ts');
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as themes from '../src/lib/themes.ts';
import * as validation from '../src/lib/themeValidation.ts';
import * as articleFormat from '../src/lib/articleFormat.ts';

const source = await readFile(new URL('../src/components/themes/ThemeLibrary.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const FORMAT_THEME = {
  ...themes.BASIC_THEME,
  css: '.article-preview .article-body p { color: #123456; }',
  nodes: undefined,
};
function editor(theme = FORMAT_THEME) {
  let cursor = 0, tree, closes = 0, writes = 0, saves = 0; const cells = [], effects = [];
  let sample = { id: 1, status: 'ready', markdown: '# A library-owned sample', origin: 'library', error: null };
  const sampleChecks = [];
  let validateSample = async () => ({ errors: [], issues: [] });
  const props = { theme, root: {}, isRootCurrent: () => true, canApply: true, onClose: () => closes++, onApply() {}, onSaved: () => saves++ };
  let persist = async (_, value) => ({ ...value, version: '1.0.1' });
  const module = { exports: {} };
  vm.runInNewContext(`${code}\nexports.Stylebook = ThemeStylebookDialog;`, { module, exports: module.exports, window: { addEventListener() {}, removeEventListener() {} }, document: { getElementById: () => ({ focus() {} }) }, require: withUILocaleImports(function(id){
    if (id.endsWith('/articleFormat')) return articleFormat;
    if (id.endsWith('/useArticleRenderMount')) return { useArticleRenderMount: () => ({ target: null, native: false }) };
    if (id.endsWith('/ArticleDocument')) return { ArticleDocument: 'article-document' };
    if (id.endsWith('/contentValidation')) return { validateContentSource: async (kind, source, options) => { sampleChecks.push(source); assert.equal(options.purpose, 'theme'); return validateSample(); } };
    if ((id.endsWith('/article-format/runtime') || id === './runtime')) return { getFormatSnapshot: () => ({ id: 'test-format' }) };
    if (id.endsWith('/PageHeading')) return { PageHeading: 'page-heading' };
    if (id.endsWith('/useResourcePreviewStyles')) return { useResourcePreviewStyles: () => ({ css: '', issue: '', ready: true, result: {} }) };
    if (id.endsWith('/useThemePreviewSample')) return { useThemePreviewSample: () => sample };
    if (id.endsWith('/themePreviewSample')) return { getThemePreviewSample: () => sample };
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
    if (id.endsWith('/article-format/preview')) return formatPreview;
    if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input' };
    if (id.endsWith('/articleExamples')) return { ARTICLE_EXAMPLE_IMAGE: '/images/article-sample.png' };
      if (id.endsWith('/ThemeInspection')) return { useThemeInspection: () => ({ listRef: { current: null }, hovered: null, selected: null, rowProps: () => ({}), clear() {}, locate() {} }), ThemeInspectionPreview: 'inspection-preview', INSPECTION_ROW_CLASSES: '' };
    if (id.endsWith('/themeInspection')) return { uniqueBindings: items => items.filter((item, index) => items.findIndex(other => other.key === item.key) === index) };
    if ((id.endsWith('/tailwind') || id.endsWith('/article-format/renderer'))) return {};
    if (id === 'react-dom') return { createPortal: children => children };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/useResizableColumns')) return { useResizableColumns: () => ({ containerRef: { current: null }, wideEnough: true, dragging: false, ratio: 40, style: { '--editor-source-width': '400px' } }) };
    if (id.endsWith('/ColumnSplitter')) return { ColumnSplitter: 'column-splitter' };
    if (id.endsWith('/localFonts')) return { shareLocalFontsWithPreview: () => () => {} };
    if (id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel: 'collapsible-panel', PanelIcon: 'panel-icon' };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'dialog-header' };
    if (id.endsWith('/PreviewModeSwitch')) return { PreviewModeSwitch: 'preview-switch' };
    if (id.endsWith('/useArticlePreviewMode')) return { useArticlePreviewMode: () => ({ dark: true, toggle() {} }) };
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' };
    if (id.endsWith('/ArticleThemeFields')) return { ArticleThemeFields: 'article-fields' };
    if (id.endsWith('/LibraryCssEditor')) return { LibraryCssEditor: 'library-css-editor' };
    if (id.endsWith('/EditorColorPicker')) return { EditorColorPicker: 'color-picker' };
    if (id.endsWith('/MarkdownPreview')) return { MarkdownPreview: 'markdown-preview' };
    if (id.endsWith('/themes')) return themes;
    if (id.endsWith('/themeValidation')) return validation;
    if (id.endsWith('/fileSystem')) return { saveThemeLibraryTheme: async (...args) => { writes++; return persist(...args); } };
    if (/themeDefaults|rootSession|articleDarkPreview|tailwindPalette/.test(id)) return {};
    if (id === 'react') return {
      useCallback: value => value,
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
      useEffect(effect, dependencies) { const index = cursor++, old = cells[index]; if (old && dependencies.every((value, i) => Object.is(value, old.dependencies[i]))) return; effects.push(() => { old?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); },
    };
    throw new Error(id);
  }) });
  const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const render = () => { cursor = 0; tree = module.exports.Stylebook(props); while (effects.length) effects.shift()(); };
  const find = predicate => { const node = all(tree).find(predicate); assert.ok(node, 'control exists'); return node; };
  render();
  return { props, render, find, sampleChecks, setSample: value => { sample = value; }, setValidation: value => { validateSample = value; }, nodes: () => all(tree), get closes() { return closes; }, get writes() { return writes; }, get saves() { return saves; }, setPersist: value => { persist = value; }, button: label => find(node => node.type === 'button' && text(node) === label), tab(label) { this.find(node => node.props.id === `article-theme-tab-${label === '常用项' ? 'tokens' : label.toLowerCase()}`).props.onClick(); render(); }, frame: () => find(node => node.type === 'dialog'), fields: () => find(node => node.type === 'article-fields') };
}

test('editor opens directly to common fields and exposes only three tabs on one row', () => {
  const view = editor();
  assert.ok(view.fields());
  const tabs = view.nodes().filter(node => node.props.role === 'tab');
  assert.deepEqual(tabs.map(node => node.props.id), ['article-theme-tab-tokens', 'article-theme-tab-css', 'article-theme-tab-json']);
  assert.ok(view.find(node => node.props.role === 'tablist').props.className.includes('grid-cols-3'));
  let prevented = false;
  tabs[0].props.onKeyDown({ key: 'End', preventDefault() { prevented = true; } }); view.render();
  assert.equal(prevented, true);
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-json').props['aria-selected'], true);
});

test('code validation shares the save toolbar and code/preview panes use the article splitter', () => {
  const view = editor(); view.tab('CSS');
  const toolbar = view.find(node => node.props.className?.includes('flex shrink-0 flex-wrap items-center justify-between gap-2 border-t'));
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const texts = walk(toolbar).filter(node => node.type === 'button').map(node => walk(node).map(child => child.props.children).flat().filter(item => typeof item === 'string').join(''));
  assert.ok(texts.includes('校验并预览')); assert.ok(texts.includes('保存主题'));
  const splitter = view.find(node => node.type === 'column-splitter');
  assert.equal(splitter.props.label, '调整主题代码与预览宽度');
});

test('theme save shortcut validates and persists the edited buffer once; invalid buffers never write', async () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const view = editor(); view.tab('CSS');
    const css = '.article-preview .article-body p { color: #654321; }';
    view.find(n => n.type === 'source-input').props.onChange(css); view.render();
    let saved;
    view.setPersist(async (_, next) => { saved = next; return { ...next, version: '1.0.1' }; });
    const key = { key: 's', [modifier]: true, nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {} };
    view.frame().props.onKeyDown(key); view.frame().props.onKeyDown(key);
    await new Promise(resolve => setImmediate(resolve)); view.render();
    assert.equal(view.writes, 1); assert.equal(saved.css, css);
    view.find(n => n.type === 'source-input').props.onChange('.article-preview { background: url(https://invalid.example/image.png); }'); view.render();
    view.frame().props.onKeyDown(key); await new Promise(resolve => setImmediate(resolve)); view.render();
    assert.equal(view.writes, 1);
    assert.equal(view.find(n => n.type === 'source-input').props.value, '.article-preview { background: url(https://invalid.example/image.png); }');
  }
});

test('CSS and JSON fill the flexible left panel, cannot resize, and raw changes block saving across tab switches', () => {
  const view = editor();
  for (const label of ['CSS', 'JSON']) {
    view.tab(label);
    const area = view.find(node => node.type === 'source-input');
    assert.equal(area.props.sourceFont, 'editor'); assert.equal(area.props.disabled, false);
    assert.equal(area.props.rows, undefined);
  }
  const area = view.find(node => node.type === 'source-input');
  area.props.onChange('{unfinished'); view.render();
  view.tab('常用项'); assert.equal(view.button('保存主题').props.disabled, true);
  view.frame().props.onClose(); view.render();
  const guard = view.find(node => node.type === 'unsaved-dialog');
  assert.equal(guard.props.saveDisabled, true); assert.equal(view.closes, 0);
  guard.props.onCancel(); view.render(); view.tab('JSON');
  assert.equal(view.find(node => node.type === 'source-input').props.value, '{unfinished');
});

test('theme colors preview live, unsafe CSS is rejected, and write failures preserve drafts and block closing', async () => {
  const view = editor();
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  view.setPersist(async () => { throw new Error('test disk denied'); });
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.fields().props.theme.tokens['color-article-quote-surface'], '#fafafa');
  assert.ok(view.find(node => node.type === 'operation-feedback' && node.props.tone === 'error').props.notice);
  view.frame().props.onClose(); view.render(); assert.equal(view.closes, 0);
  view.find(node => node.type === 'unsaved-dialog').props.onCancel(); view.render();
  view.tab('CSS'); view.find(node => node.type === 'source-input').props.onChange('@import "https://bad.invalid/style.css";'); view.render();
  view.button('校验并预览').props.onClick(); view.render();
  assert.equal(view.button('保存主题').props.disabled, true); assert.equal(view.writes, 1);
});

test('unmentioned positioning CSS remains editable instead of inheriting an old blanket ban', async () => {
  const view = editor({ ...themes.BASIC_THEME, css: `${themes.BASIC_THEME.css}\n.article-preview .article-body { position: relative; }` });
  assert.ok(view.fields());
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  assert.equal(view.button('保存主题').props.disabled, false);
  await view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1);
});

test('saving is locked against double clicks and updates the close guard only after successful persistence', async () => {
  const view = editor(); let release;
  view.setPersist(async (_, value) => new Promise(resolve => { release = () => resolve({ ...value, version: '1.0.1' }); }));
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  const save = view.button('保存主题'); save.props.onClick(); save.props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1); view.frame().props.onClose(); assert.equal(view.closes, 0);
  release(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.saves, 1); view.frame().props.onClose(); assert.equal(view.closes, 1);
});

test('a saved theme retains sample review details without blocking future edits or showing stale diagnostics', async () => {
  const view = editor();
  const issue = { kind: 'engine', name: 'sample layout', source: 'themes/preview.md', line: 49, tier: 'unknown', message: 'Image-dependent layout inspection is incomplete', resourceSource: '/images/missing.png', resourceDependency: true };
  view.setValidation(async () => ({ errors: [], issues: [issue] }));
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1);
  const details = view.find(node => node.type === 'operation-feedback' && node.props.id.startsWith('theme-stylebook-'));
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  assert.match(text(details), /themes\/preview.md.*missing.png.*incomplete/);
  assert.match(text(details), /49/);
  assert.equal(issue.tier, 'unknown');
  view.fields().props.onToken('color-article-quote-surface', '#eeeeee'); view.render();
  assert.equal(view.button('保存主题').props.disabled, false);
  const cleared = view.find(node => node.type === 'operation-feedback' && node.props.id.startsWith('theme-stylebook-'));
  assert.ok(cleared); assert.equal(text(cleared), '');
});

test('resetting the last node override restores the original draft without a spurious unsaved dialog', () => {
  const view = editor();
  view.fields().props.onNodeValue('fontSize', '2rem'); view.render();
  assert.equal(view.fields().props.theme.nodes.h1.fontSize, '2rem');
  view.fields().props.onResetNode(); view.render();
  assert.equal(view.fields().props.theme.nodes, undefined);
  view.frame().props.onClose(); view.render();
  assert.equal(view.closes, 1); assert.equal(view.writes, 0);
});

test('code edits require validation before saving, with pending tab and disabled-button help', async () => {
  const view = editor(); view.tab('CSS');
  assert.equal(view.button('校验并预览').props.disabled, true);
  assert.equal(view.button('保存主题').props.disabled, true);
  assert.equal(view.button('重置修改').props.disabled, true);
  view.find(node => node.type === 'source-input').props.onChange(`${FORMAT_THEME.css}\n.article-preview .article-body p { color: #654321; }`); view.render();
  assert.equal(view.button('校验并预览').props.disabled, false);
  assert.equal(view.button('保存主题').props.disabled, true);
  const pendingTab = view.find(node => node.props.id === 'article-theme-tab-css');
  assert.equal(pendingTab.props['data-validation'], 'pending');
  assert.equal(pendingTab.props['data-modified'], true);
  assert.ok(!pendingTab.props.className.includes('text-danger'));
  assert.equal(view.find(node => node.props['data-tooltip'] === '请先完成校验').props.tabIndex, 0);
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-json').props['data-validation'], 'complete');
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); assert.equal(view.writes, 0);
  view.button('校验并预览').props.onClick(); view.render();
  assert.equal(view.button('校验并预览').props.disabled, true);
  assert.equal(view.button('保存主题').props.disabled, false);
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-css').props['data-validation'], 'complete');
  assert.throws(() => view.find(node => node.props['data-tooltip'] === '请先完成校验'), /control exists/);
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1);
  assert.equal(view.button('保存主题').props.disabled, true);
});

test('either validation button checks both code buffers, preserves failures, and applies both only after success', () => {
  const view = editor(); view.tab('CSS');
  const brokenCss = '.article-preview .article-body p {';
  view.find(node => node.type === 'source-input').props.onChange(brokenCss); view.render();
  view.tab('JSON');
  view.find(node => node.type === 'source-input').props.onChange('{broken'); view.render();
  view.button('校验并预览').props.onClick(); view.render();
  for (const kind of ['css', 'json']) {
    const tab = view.find(node => node.props.id === `article-theme-tab-${kind}`);
    assert.equal(tab.props['data-validation'], 'failed');
    assert.ok(tab.props.className.includes('text-danger'));
  }
  assert.equal(view.button('保存主题').props.disabled, true);
  assert.equal(view.find(node => node.type === 'source-input').props.value, '{broken');
  view.tab('CSS'); assert.equal(view.find(node => node.type === 'source-input').props.value, brokenCss);
  const nextCss = `${FORMAT_THEME.css}\n.article-preview .article-body p { color: #654321; }`;
  view.find(node => node.type === 'source-input').props.onChange(nextCss); view.render();
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-css').props['data-validation'], 'pending');
  view.button('校验并预览').props.onClick(); view.render();
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-css').props['data-validation'], 'pending');
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-json').props['data-validation'], 'failed');
  assert.equal(view.button('保存主题').props.disabled, true);
  view.tab('JSON');
  view.find(node => node.type === 'source-input').props.onChange(JSON.stringify({ ...FORMAT_THEME, name: '一起校验后的主题' })); view.render();
  view.button('校验并预览').props.onClick(); view.render();
  for (const kind of ['css', 'json']) assert.equal(view.find(node => node.props.id === `article-theme-tab-${kind}`).props['data-validation'], 'complete');
  assert.equal(view.button('校验并预览').props.disabled, true);
  assert.equal(view.button('保存主题').props.disabled, false);
  view.tab('常用项');
  assert.equal(view.fields().props.theme.name, '一起校验后的主题');
  assert.equal(view.fields().props.theme.css, nextCss);
});

test('reset restores the last saved theme, code buffers, preview and validation state without writing', async () => {
  const view = editor();
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1);
  view.fields().props.onNodeValue('fontSize', '2rem'); view.render();
  view.tab('CSS'); view.find(node => node.type === 'source-input').props.onChange('.article-preview {'); view.render();
  view.tab('JSON'); view.find(node => node.type === 'source-input').props.onChange('{broken'); view.render();
  view.button('校验并预览').props.onClick(); view.render();
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-css').props['data-validation'], 'failed');
  view.button('重置修改').props.onClick(); view.render();
  const restored = JSON.parse(view.find(node => node.type === 'source-input').props.value);
  assert.equal(restored.tokens['color-article-quote-surface'], '#fafafa', 'reset uses the saved revision, not the original prop');
  assert.equal(restored.version, '1.0.1');
  assert.equal(restored.nodes, undefined);
  assert.equal(view.button('保存主题').props.disabled, true);
  assert.equal(view.button('校验并预览').props.disabled, true);
  assert.equal(view.button('重置修改').props.disabled, true);
  for (const kind of ['css', 'json']) {
    const tab = view.find(node => node.props.id === `article-theme-tab-${kind}`);
    assert.equal(tab.props['data-validation'], 'complete');
    assert.equal(tab.props['data-modified'], false);
  }
  assert.throws(() => view.find(node => node.type === 'operation-feedback' && node.props.tone === 'error'), /control exists/);
  assert.equal(view.writes, 1, 'reset never writes to the directory');
  view.frame().props.onClose(); assert.equal(view.closes, 1);
});


test('manual dark edits change only the override group and survive saving; resetting restores inheritance', async () => {
  const view = editor();
  const light = JSON.stringify(view.fields().props.theme.tokens);
  view.fields().props.onDarkToken('color-article-ink', '#ddeeff'); view.render();
  assert.equal(view.fields().props.theme.dark.tokens['color-article-ink'], '#ddeeff');
  assert.equal(JSON.stringify(view.fields().props.theme.tokens), light);
  view.button('保存主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 1);
  assert.equal(view.fields().props.theme.dark.tokens['color-article-ink'], '#ddeeff');
  view.fields().props.onDarkToken('color-article-ink', null); view.render();
  assert.deepEqual(Object.keys(view.fields().props.theme.dark.tokens), []);
  assert.equal(JSON.stringify(view.fields().props.theme.tokens), light);
});


test('continue editing returns to the last modified code tab while closing the gate keeps the inspected tab', () => {
  const view = editor(); view.tab('CSS');
  const changed = '.article-preview .article-body p { color: #234567; }';
  view.find(node => node.type === 'source-input').props.onChange(changed); view.render();
  view.tab('常用项'); view.frame().props.onClose(); view.render();
  view.find(node => node.type === 'unsaved-dialog').props.onCancel(); view.render();
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-tokens').props['aria-selected'], true);
  view.frame().props.onClose(); view.render();
  view.find(node => node.type === 'unsaved-dialog').props.onContinue(); view.render();
  assert.equal(view.find(node => node.props.id === 'article-theme-tab-css').props['aria-selected'], true);
  assert.equal(view.find(node => node.type === 'source-input').props.value, changed);
  assert.equal(view.closes, 0); assert.equal(view.writes, 0);
});


test('saving a theme validates the same library sample shown by its preview', async () => {
  const view = editor();
  view.setSample({ id: 2, status: 'ready', markdown: '# The custom library sample', origin: 'library', error: null });
  view.render();
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  await view.button('保存主题').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.sampleChecks, ['# The custom library sample']);
  assert.equal(view.writes, 1);
});

test('unavailable samples cannot validate or save a theme, and the draft is retained', async () => {
  const view = editor();
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  view.setSample({ id: 2, status: 'error', markdown: null, origin: 'library', error: 'Sample read failed' });
  view.render();
  await view.button('保存主题').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 0);
  assert.deepEqual(view.sampleChecks, []);
  assert.equal(view.fields().props.theme.tokens['color-article-quote-surface'], '#fafafa');
  assert.ok(view.find(node => node.type === 'operation-feedback' && node.props.tone === 'error').props.notice);
});

test('reloading the sample during a layout check prevents a stale theme write', async () => {
  const view = editor(); let release;
  view.setValidation(() => new Promise(resolve => { release = () => resolve({ errors: [], issues: [] }); }));
  view.fields().props.onToken('color-article-quote-surface', '#fafafa'); view.render();
  const pending = view.button('保存主题').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  view.setSample({ id: 2, status: 'ready', markdown: '# Replacement sample', origin: 'library', error: null });
  release(); await pending;
  await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.writes, 0);
  assert.equal(view.fields().props.theme.tokens['color-article-quote-surface'], '#fafafa');
});
