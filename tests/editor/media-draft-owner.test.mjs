import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from '../ui-locale-fixture.mjs';
const source = await readFile(new URL('../../src/components/media/MediaLibrary.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function owner(outcome = { fileCreated: false, tone: 'error', message: 'write denied' }) {
  const cells = [], props = { asset: { root: {}, fileName: 'sample.png', articleId: 'sample', size: 10 }, canRename: true, busy: false, sessionKey: 1, isCurrent: () => true,
    onClose: () => closes++, onRename: async () => outcome };
  let cursor = 0, tree, closes = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: withUILocaleImports(id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return { useRef: value => { const i = cursor++; return cells[i] ??= { current: value }; }, useEffect() {}, useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = typeof value === 'function' ? value() : value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; } };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header' };
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'gate' };
    if (id.endsWith('/MediaGallery')) return { mediaAssetKey: asset => asset.fileName, formatMediaBytes: () => '10 B' };
    if (id.endsWith('/ArticleImagePreview')) return { ArticleImagePreview: 'preview' };
    if (id.endsWith('/useImageZoom')) return { useImageZoom: () => ({ viewportRef: { current: null }, dimensions: { width: 0, height: 0 }, scale: 1, zoomTo() {}, onDimensions() {} }) };
    if (id.endsWith('/IconButton')) return { IconButton: 'zoom-button' };
    return {}; // The other exports belong to MediaLibrary, which this owner test does not mount.
  }) });
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const render = () => { cursor = 0; tree = walk(module.exports.MediaAssetDialog(props)); };
  const find = type => { const found = tree.find(node => node.type === type); assert.ok(found, type); return found; };
  render();
  return { render, find, get closes() { return closes; } };
}

test('legacy article-image rename uses the shared parent/child focus gate and retains failed saves', async () => {
  const view = owner();
  view.find('input').props.onChange({ target: { value: 'retained' } }); view.render();
  view.find('frame').props.onClose(); view.render(); assert.equal(view.find('frame').props.focusActive, false);
  view.find('gate').props.onContinue(); view.render(); assert.equal(view.find('frame').props.focusActive, true);
  assert.equal(view.find('input').props.value, 'retained'); assert.equal(view.closes, 0);
  view.find('frame').props.onClose(); view.render();
  assert.equal(await view.find('gate').props.onSave(), false); view.render();
  assert.equal(view.find('input').props.value, 'retained'); assert.equal(view.closes, 0);
  view.find('gate').props.onDiscard(); assert.equal(view.closes, 1);
});

test('successful legacy image creation clears its rename draft before closing', async () => {
  const view = owner({ fileCreated: true, fileName: 'new-name.png', tone: 'success', message: 'saved' });
  view.find('input').props.onChange({ target: { value: 'new-name' } }); view.render();
  view.find('frame').props.onClose(); view.render(); assert.equal(await view.find('gate').props.onSave(), true); view.render();
  assert.equal(view.closes, 1); assert.equal(view.find('input').props.disabled, true);
  view.find('frame').props.onClose(); assert.equal(view.closes, 2, 'a saved name no longer needs an unsaved decision');
});
