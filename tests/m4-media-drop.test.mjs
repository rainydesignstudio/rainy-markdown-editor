import * as resourceTypes from '../src/lib/resources/types.ts';
import { inspectResourceFile } from '../src/lib/resources/storage.ts';
import { libraryMediaAssetKey } from '../src/lib/articleMedia.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import { inspectArticleImage } from '../src/lib/articleMedia.ts';

const image = new File([await readFile(new URL('../public/images/article-sample.png', import.meta.url))], 'same.png', { type: 'image/png' });
const unsupported = new File(['text'], 'notes.txt', { type: 'text/plain' });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const label = node => Array.isArray(node) ? node.map(label).join('') : node?.props ? label(node.props.children) : typeof node === 'string' ? node : '';
async function component(file, dependencies) {
  const cells = [], effects = []; let cursor = 0, tree;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useMemo: callback => callback(),
    useEffect(effect, deps) { const i = cursor++, previous = cells[i]; if (previous && deps.every((x, n) => x === previous.deps[n])) return; effects.push(() => { previous?.cleanup?.(); cells[i] = { deps, cleanup: effect() }; }); },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: withUILocaleImports(id => {
    if (id === 'react') return react;
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' }; if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/resources/types')) return resourceTypes; if (id.endsWith('/resources/storage')) return { inspectResourceFile }; if (id.endsWith('/ResourceGlyph')) return { ResourceGlyph: 'resource-glyph' }; if (id.endsWith('/articleMedia') && !(id in dependencies)) return { libraryMediaAssetKey }; if (id in dependencies) return dependencies[id];
    if (id.endsWith('/useImageZoom')) return { useImageZoom() {} };
    if (id.endsWith('/IconButton')) return { IconButton: 'zoom-button' };
    throw new Error('Unexpected import: ' + id);
  }) });
  return {
    render(name, props) { cursor = 0; tree = nodes(module.exports[name](props)); while (effects.length) effects.shift()(); return tree; },
    find(predicate) { const node = tree.find(predicate); assert.ok(node, 'Expected control'); return node; },
    text: () => label(tree),
    unmount() { for (const cell of cells) cell?.cleanup?.(); },
  };
}
const dialogs = { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' };
async function importDialog(files, onImport = async () => ({ ok: true }), inspect = inspectArticleImage, allResources = false) {
  let closes = 0, current = true;
  const imported = [], props = { files, libraryName: 'test-only', busy: false, allResources, isCurrent: () => current, onImport: async chosen => { imported.push(chosen); return onImport(chosen); }, onClose: () => closes++ };
  const view = await component('../src/components/media/MediaImportDialog.tsx', { '../../lib/articleMedia': { inspectArticleImage: inspect }, '../global/DialogFrame': dialogs, './MediaGallery': { MediaIcon: 'icon', formatMediaBytes: n => n + 'B' } });
  const render = () => view.render('MediaImportDialog', props);
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { ...view, props, render, settle, imported, get closes() { return closes; }, stale() { current = false; }, confirm: () => view.find(x => x.type === 'button' && x.props.variant === 'primary'), cancel: () => view.find(x => x.type === 'button' && label(x) === '取消') };
}

test('dropped files are inspected without importing; cancel writes nothing and mixed content imports only valid images after confirmation', async () => {
  const cancelled = await importDialog([image, unsupported]);
  assert.equal(cancelled.confirm().props.disabled, true);
  await cancelled.settle(); assert.equal(cancelled.imported.length, 0);
  assert.match(cancelled.text(), /test-only.*共享素材/);
  assert.match(cancelled.text(), /same.png/); assert.match(cancelled.text(), /notes.txt/);
  cancelled.cancel().props.onClick(); assert.equal(cancelled.closes, 1); assert.equal(cancelled.imported.length, 0); cancelled.unmount();
  const mixed = await importDialog([image, unsupported, image]); await mixed.settle();
  mixed.confirm().props.onClick(); await mixed.settle();
  assert.equal(mixed.imported.length, 1);
  assert.deepEqual([...mixed.imported[0]], [image, image], 'duplicate names remain distinct import requests');
  assert.equal(mixed.closes, 1); mixed.unmount();
});

test('unsupported-only and stale targets cannot import; duplicate confirmations and cancellation during writes are guarded', async () => {
  const invalid = await importDialog([unsupported]); await invalid.settle(); assert.equal(invalid.confirm().props.disabled, true); invalid.confirm().props.onClick(); await invalid.settle(); assert.equal(invalid.imported.length, 0); invalid.unmount();
  let finish;
  const pending = await importDialog([image], () => new Promise(resolve => { finish = resolve; })); await pending.settle();
  const click = pending.confirm().props.onClick; click(); click(); pending.cancel().props.onClick();
  assert.equal(pending.imported.length, 1); assert.equal(pending.closes, 0);
  finish({ ok: false, tone: 'error', message: 'permission revoked' }); await pending.settle();
  assert.match(JSON.stringify(pending.find(node => node.type === 'header').props.actions.props.notice), /permission revoked/); assert.equal(pending.confirm().props.disabled, false);
  pending.stale(); click(); await pending.settle(); assert.equal(pending.imported.length, 1); pending.unmount();
});

test('late file inspection does not enable import after cancellation or a changed library', async () => {
  let finish;
  const view = await importDialog([image], undefined, () => new Promise(resolve => { finish = resolve; }));
  view.stale(); view.unmount(); finish({ mimeType: 'image/png', extension: 'png' }); await view.settle();
  assert.equal(view.imported.length, 0); assert.equal(view.confirm().props.disabled, true);
});

test('general resource confirmation accepts inert PDF/text files but keeps broken raster files invalid and writes nothing before confirmation', async () => {
  const pdf = new File(['%PDF-test'], 'guide.pdf'), broken = new File(['not PNG'], 'broken.png');
  const view = await importDialog([image, pdf, unsupported, broken], undefined, inspectArticleImage, true); await view.settle();
  assert.equal(view.imported.length, 0); assert.equal(view.confirm().props.disabled, false);
  view.confirm().props.onClick(); await view.settle(); assert.deepEqual([...view.imported[0]], [image, pdf, unsupported]); view.unmount();
});

test('media page accepts only external file drops, opens a pending dialog with zero writes and rejects its stale target callback', async () => {
  const root = { name: 'first' }, second = { name: 'second' }, imports = [];
  let currentRoot = root, session = 1;
  const props = { root, sessionKey: 1, articles: [], workspace: { projects: [] }, isRootCurrent: (value, key) => value === currentRoot && key === session, onImport: async files => { imports.push(files); return { ok: true }; }, busy: false, currentArticleId: '' };
  const view = await component('../src/components/media/MediaLibrary.tsx', {
    '../../lib/editorWorkspace': { getArticleOrganization: () => ({}) },
    '../../hooks/useMediaPreferences': { useMediaPreferences: () => [{ sort: 'name' }, () => {}] },
    '../../hooks/useMediaPagination': { useMediaPagination: assets => ({ items: assets }) },
    '../../hooks/useMediaLibrary': { useMediaLibrary: () => ({ assets: [], issues: [], loading: false, refresh() {} }) },
    '../../lib/mediaBrowsing': { mediaDirectoryImages: values => values },
    '../global/PageHeading': { PageHeading: 'heading' }, '../global/DialogFrame': dialogs,
    './MediaGallery': { MediaDetails: 'details', MediaGallery: 'gallery', MediaIcon: 'icon', MediaImportButton: 'import', sortMediaAssets: values => values, formatMediaBytes: () => '', mediaAssetKey: asset => asset.fileName },
    './MediaToolbar': { MediaToolbar: 'toolbar' }, './MediaPagination': { MediaPagination: 'pagination' }, './MediaPreviewDialog': { MediaPreviewDialog: 'preview' }, './ArticleImagePreview': { ArticleImagePreview: 'image' }, './MediaManagementDialog': { MediaManagementDialog: 'management' }, './MediaImportDialog': { MediaImportDialog: 'import-dialog' },
  });
  const render = () => view.render('MediaLibrary', props); render();
  const page = () => view.find(x => x.type === 'section' && x.props.onDrop);
  let prevented = 0;
  const event = { dataTransfer: { types: ['Files'], files: [image] }, preventDefault() { prevented++; }, stopPropagation() {} };
  page().props.onDrop({ ...event, dataTransfer: { types: ['text/plain'], files: [] } }); render();
  assert.equal(prevented, 0);
  page().props.onDrop(event); render(); assert.equal(imports.length, 0);
  let pending = view.find(x => x.type === 'import-dialog').props;
  assert.deepEqual([...pending.files], [image]); assert.equal(pending.libraryName, 'first');
  pending.onClose(); render();
  page().props.onDrop(event); render();
  pending = view.find(x => x.type === 'import-dialog').props;
  assert.equal(imports.length, 0, 'cancelled drops can reopen without writing');
  currentRoot = second; session = 2; props.root = second; props.sessionKey = 2; render();
  assert.equal(pending.isCurrent(), false);
  const result = await pending.onImport([image]); assert.equal(result.ok, false); assert.equal(imports.length, 0); view.unmount();
});
