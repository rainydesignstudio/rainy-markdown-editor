import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/components/editor/PackageOutputDialog.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(kind = 'export') {
  let version = 1, settle, started; const began = new Promise(resolve => { started = resolve; });
  const downloads = [], transforms = [], states = [], effects = []; let requests = 0;
  const snapshot = { id: 'one', renderer: { declaration: { actions: [{ id: 'custom', label: 'Custom', kind, extension: 'txt', mime: 'text/plain' }] } } };
  const jsx = (type, props) => ({ type, props });
  const context = { Blob, Uint8Array, AbortController, atob, btoa, exports: {}, require(id) {
    if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
    if (id.endsWith('/ContentIcon')) return { ContentIcon: 'content-icon' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (id === 'react') return { useState: value => [value, value => states.push(value)], useRef: value => ({ current: value }), useEffect: callback => { effects.push(callback); } };
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: key => key }) };
    if (id.endsWith('/DialogFrame')) return Object.fromEntries(['DialogFrame', 'DialogHeader', 'DialogFooter', 'DialogActions', 'DialogButton'].map(name => [name, name]));
    if (id.endsWith('/article-format/package')) return { invokeRenderer: async (_snapshot, _action, _input, signal) => { requests++; started(); await new Promise(resolve => { settle = resolve; }); signal.throwIfAborted(); return kind === 'format' ? { source: 'next' } : { data: 'result', extension: 'txt' }; } };
    if (id.endsWith('/articleExport')) return { articleExportBaseName: name => name, downloadArticleBlob: (...args) => downloads.push(args) };
    if (id.endsWith('/article-format/runtime')) return { getFormatSnapshot: () => snapshot };
    return {};
  } };
  vm.runInNewContext(compiled, context);
  const result = context.exports.PackageOutputDialog({ snapshot, source: 'body', theme: {}, title: 'test', root: {}, month: null, folder: null, previewRef: { current: null }, prepareVisual: async () => true, getResourceRevision: () => version, isCurrent: () => true, onTransform: value => transforms.push(value), onExported() {}, onClose() {} });
  const find = node => Array.isArray(node) ? node.flatMap(find) : node?.props ? [node, ...find(node.props.children)] : [];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const run = find(result).find(node => node.type === 'DialogButton' && text(node) === 'formatPackage.run').props.onClick;
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  return { run, began, downloads, transforms, states, get requests() { return requests; }, change() { version++; }, complete() { settle(); }, close() { cleanups.forEach(cleanup => cleanup()); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('unchanged package output downloads once and duplicate clicks do not launch another request', async () => {
  const f = fixture(); f.run(); f.run(); await f.began; f.complete(); await tick();
  assert.equal(f.requests, 1); assert.equal(f.downloads.length, 1); assert.equal(await f.downloads[0][0].text(), 'result'); f.close();
});
test('resource changes while package output is pending prevent downloads and draft transforms', async () => {
  for (const kind of ['export', 'format']) {
    const f = fixture(kind); f.run(); await f.began; f.change(); f.complete(); await tick();
    assert.equal(f.downloads.length, 0); assert.equal(f.transforms.length, 0); assert.ok(f.states.includes('formatPackage.changed')); f.close();
  }
});
test('closing the package output invalidates its request before a late result can download', async () => {
  const f = fixture(); f.run(); await f.began; f.close(); f.complete(); await tick(); assert.equal(f.downloads.length, 0);
});
