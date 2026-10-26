import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from '../ui-locale-fixture.mjs';
import { BASIC_THEME } from '../../src/lib/themes.ts';
import { formatUINumber } from '../../src/lib/i18n/formatters.ts';
import * as product from '../../src/lib/i18n/productMessages.ts';

const source = await readFile(new URL('../../src/components/imports/MarkdownImportDialog.tsx', import.meta.url), 'utf8');
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';
function fixture() {
  const cells = []; let cursor = 0; const calls = [];
  const alternate = { ...BASIC_THEME, id: 'alternate', name: 'Alternate', version: '3.0.0' };
  const props = { source: null, mode: 'local', themes: [BASIC_THEME, alternate], defaultTheme: alternate, busy: false, feedback: null, onChooseFile: async () => calls.push('file'), onChooseDirectory: async () => calls.push('directory'), onConfirm: async theme => calls.push(theme.id), onClose: () => calls.push('close') };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: withUILocaleImports(id => {
      if (id === 'react') return { useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], next => { cells[index] = next; }]; } };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/formatters')) return { formatUINumber };
      if (id.endsWith('/productMessages')) return product;
      if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' };
      throw new Error(id);
    }),
  });
  const render = () => { cursor = 0; return walk(module.exports.MarkdownImportDialog(props)); };
  const button = label => render().find(node => node.type === 'button' && text(node) === label);
  return { props, calls, render, button, alternate };
}

test('the shared import dialog preselects the library default, permits a theme change and guards missing sources/busy actions', async () => {
  const f = fixture();
  assert.equal(f.render().find(node => node.type === 'select-field').props.value, 'alternate');
  assert.equal(f.button('导入文稿').props.disabled, true);
  await f.button('选择 Markdown 文件').props.onClick(); assert.deepEqual(f.calls, ['file']);
  f.props.source = { origin: { name: 'source.md', size: 100 }, title: 'Original title', directoryName: null, chooseDirectory() {} };
  assert.equal(f.button('导入文稿').props.disabled, false);
  f.render().find(node => node.type === 'select-field').props.onChange(BASIC_THEME.id);
  await f.button('导入文稿').props.onClick(); assert.equal(f.calls.at(-1), BASIC_THEME.id);
  await f.button('选择来源目录（只读）').props.onClick(); assert.equal(f.calls.at(-1), 'directory');
  f.props.busy = true;
  assert.equal(f.render()[0].props.dismissible, false); assert.equal(f.button('导入文稿').props.disabled, true); assert.equal(f.button('取消').props.disabled, true);
  f.props.mode = 'knowledge'; f.props.source = { ...f.props.source, chooseDirectory: undefined };
  assert.equal(f.button('选择 Markdown 文件'), undefined);
});

test('a missing library theme disables confirmation and import feedback stays visible in the shared scroll region', () => {
  const f = fixture(); f.props.source = { origin: { name: 'source.md', size: 100 }, title: 'Kept', directoryName: 'source' };
  f.props.themes = [BASIC_THEME]; f.props.feedback = product.productMessage('imports.sourceChanged');
  assert.equal(f.button('导入文稿').props.disabled, true);
  assert.ok(f.render().some(node => node.props.role === 'alert' && text(node).includes('来源 Markdown 已变化')));
  assert.ok(f.render().some(node => node.props.className?.includes('overflow-y-auto') && node.props.className.includes('min-h-0')));
});

test('actual controller document scopes isolate new imports without clearing undo on first save or reloading the same document', async () => {
  const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const openDocument = useCallback('), end = source.indexOf('  const persistEditorWorkspace = useCallback(', start);
  const root = {}, context = { articleSourceLocationRef: { current: null }, articleInfoLocationRef: { current: null }, articleDraftKindRef: { current: 'article-info' }, useCallback: fn => fn, documentTokenRef: { current: { root, articleId: 'draft' } }, sourceHistoryKeyRef: { current: 1 }, mutationQueueRef: { current: { openDocument: (root, articleId) => ({ root, articleId }) } } };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.open = openDocument;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.open(root, 'saved', true); assert.equal(context.sourceHistoryKeyRef.current, 1);
  context.open(root, 'saved'); assert.equal(context.sourceHistoryKeyRef.current, 1);
  context.open(root, 'imported'); assert.equal(context.sourceHistoryKeyRef.current, 2);
  context.open(root, 'draft'); context.open(root, 'draft'); assert.equal(context.sourceHistoryKeyRef.current, 4);
  assert.match(source, /openDocument\(root, result\.article\.id, true\)/, 'the first-save path uses the preserving scope');
});
