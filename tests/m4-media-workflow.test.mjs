import * as resourceTypes from '../src/lib/resources/types.ts';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import { withUILocaleImports } from "./ui-locale-fixture.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { parseArticle, createArticleSource } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { insertArticleImageReferences } from '../src/lib/articleMedia.ts';

const controller = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('controller.ts', controller, ts.ScriptTarget.Latest, true);
function action(name, context) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(initializer, name);
  const code = ts.transpileModule(`globalThis.action = ${initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  context.useCallback = callback => callback; context.Error = Error;
  vm.runInNewContext(code, Object.assign(context, productMessages));
  return context.action;
}
const body = 'before\n\nafter';
function fixture() {
  const root = {}, calls = [], statuses = [];
  const source = `${createArticleSource('当前稿', 'basic')}\n${body}`;
  const article = { source, folder: 'article', month: '2026-10', theme: BASIC_THEME, themeValid: true };
  const token = { root, articleId: '2026-10/article', generation: 1 };
  const request = { id: 1, root, sessionKey: 1, articleId: '2026-10/article', documentToken: token, body: parseArticle(source).body, selection: { start: 7, end: 7 } };
  const context = {
    directoryRef: { current: root }, contentLibraryRootSessionRef: { current: 1 },
    articleRef: { current: article }, mediaPickerRequestRef: { current: request },
    documentTokenRef: { current: token },
    mutationQueueRef: { current: { canSave: () => true } },
    mediaOperationRef: { current: false }, historyOperationRef: { current: null },
    articleId: item => `${item.month}/${item.folder}`, parseArticle,
    inspectArticleImage: async () => ({ extension: 'png', mimeType: 'image/png' }),
    setMediaOperation: value => calls.push(['busy', value]),
    setStatus: value => statuses.push(value), recordMediaArrival() {}, resourceReference: (_storage, name) => 'media/file/' + name,
    saveSnapshot: async () => { throw Error('unexpected archive'); }, matchesSnapshot: () => true,
    snapshotFor: () => ({ source: article.source, themeValid: true, directory: root, documentToken: token, articleId: request.articleId }),
    insertImagesIntoDraft: (_snapshot, names) => { calls.push(['insert', ...names]); return { ok: true, message: 'inserted', tone: 'warning' }; },
    importImagesWithResult: async (files, selection) => { calls.push(['copy', files[0].name, selection.start]); return { ok: true, message: 'copied and inserted', tone: 'warning' }; },
  };
  return { root, request, context, calls, statuses, adopt: action('adoptLibraryImage', context) };
}

test('adoption never inserts into a different article or library after an asynchronous file read', async () => {
  for (const change of ['article', 'library', 'body', 'session', 'generation', 'request']) {
    const f = fixture(); let finish;
    const pending = f.adopt({ kind: 'shared', root: f.root, fileName: 'cover.png', handle: { getFile: () => new Promise(resolve => { finish = resolve; }) } });
    if (change === 'article') f.context.articleRef.current = { ...f.context.articleRef.current, folder: 'other' };
    if (change === 'library') f.context.directoryRef.current = {};
    if (change === 'body') f.context.articleRef.current = { ...f.context.articleRef.current, source: `${createArticleSource('当前稿')}\nchanged` };
    if (change === 'session') f.context.contentLibraryRootSessionRef.current++;
    if (change === 'generation') f.context.documentTokenRef.current = { ...f.context.documentTokenRef.current, generation: 2 };
    if (change === 'request') f.context.mediaPickerRequestRef.current = { ...f.request, id: 2 };
    finish(new File(['bytes'], 'cover.png'));
    assert.equal((await pending).ok, false); assert.equal(f.calls.length, 0);
  }
});

test('using an existing article image inserts only a reference while shared adoption requests a copy', async () => {
  const f = fixture();
  const asset = { root: f.root, fileName: 'cover.png', handle: { getFile: async () => new File(['bytes'], 'cover.png') } };
  assert.equal((await f.adopt({ ...asset, kind: 'article', articleId: f.request.articleId })).ok, true);
  assert.equal(f.calls.filter(call => call[0] === 'copy').length, 0);
  assert.deepEqual(f.calls.find(call => call[0] === 'insert'), ['insert', 'cover.png']);
  assert.equal(f.context.mediaOperationRef.current, false);
  f.calls.length = 0;
  assert.equal((await f.adopt({ ...asset, kind: 'shared' })).ok, true);
  assert.deepEqual(f.calls.find(call => call[0] === 'copy'), ['copy', 'cover.png', 7]);
});

test('unreadable pictures retain the source and produce a recoverable failure', async () => {
  const f = fixture(), original = f.context.articleRef.current.source;
  const result = await f.adopt({ kind: 'shared', root: f.root, fileName: 'cover.png', handle: { getFile: async () => { throw new Error('permission revoked'); } } });
  assert.equal(result.ok, false); assert.match(result.message, /permission revoked/);
  assert.equal(f.context.articleRef.current.source, original); assert.equal(f.calls.length, 0);
});

test('failed native insertion restores the readonly state and does not compile or claim success', () => {
  const f = fixture(), textarea = { value: f.request.body, disabled: true }; let compiled = 0;
  Object.assign(f.context, {
    sourceTextareaRef: { current: textarea }, mutationQueueRef: { current: { canSave: () => true } },
    matchesSnapshot: () => true, insertArticleImageReferences, updateArticleBody() { throw new Error('must not edit'); },
    editorWorkspaceRef: { current: {} }, getArticleOrganization: () => ({ archived: false }),
    insertUndoableText: () => { assert.equal(textarea.disabled, false); return false; },
    compileCurrent: () => compiled++,
  });
  const insert = action('insertImagesIntoDraft', f.context);
  const result = insert(f.context.snapshotFor(), ['cover.png'], { start: 2, end: 2 });
  assert.equal(result.ok, false); assert.equal(textarea.disabled, true); assert.equal(compiled, 0);
  assert.equal(textarea.value, f.request.body); assert.match(result.message, /原文保持不变/);
});

test('an archived article or invalid theme cannot receive even an existing local image reference', () => {
  const f = fixture(), textarea = { value: f.request.body, disabled: true }; let edits = 0;
  Object.assign(f.context, {
    sourceTextareaRef: { current: textarea }, mutationQueueRef: { current: { canSave: () => true } },
    matchesSnapshot: () => true, insertArticleImageReferences, updateArticleBody() {},
    editorWorkspaceRef: { current: {} }, getArticleOrganization: () => ({ archived: true }),
    insertUndoableText: () => { edits++; return true; }, compileCurrent() {},
  });
  const insert = action('insertImagesIntoDraft', f.context);
  assert.equal(insert(f.context.snapshotFor(), ['cover.png'], { start: 0, end: 0 }).ok, false);
  f.context.getArticleOrganization = () => ({ archived: false });
  assert.equal(insert({ ...f.context.snapshotFor(), themeValid: false }, ['cover.png'], { start: 0, end: 0 }).ok, false);
  assert.equal(edits, 0); assert.equal(textarea.value, f.request.body);
});

const pickerSource = await readFile(new URL('../src/components/media/MediaPickerDialog.tsx', import.meta.url), 'utf8');
const pickerCode = ts.transpileModule(pickerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children), ...nodes(node.props.actions)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';
function picker(onAdopt, onImport = async () => ({ ok: true, message: 'imported', tone: 'success' })) {
  const asset = { kind: 'shared', root: {}, fileName: 'cover.png', handle: {} }, cells = [];
  let cursor = 0, tree, closes = 0, calls = 0;
  const module = { exports: {} };
  const render = () => { cursor = 0; tree = nodes(module.exports.MediaPickerDialog({ root: asset.root, sessionKey: 1, refreshSignal: 0, articles: [], articleId: 'target', articleTitle: '目标稿', initialAsset: asset, isCurrent: () => true, busy: false, onImport, onAdopt: image => { calls++; return onAdopt(image); }, onClose: () => closes++ })); };
  vm.runInNewContext(pickerCode, {
...productMessages, module, exports: module.exports, Error, require: withUILocaleImports(function(id){
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; }, useMemo: callback => callback(),
    };
    if (id.endsWith('/useMediaPreferences')) return { useMediaPreferences: () => [{ columns: 3, sort: 'name', descending: false }, () => {}] };
    if (id.endsWith('/useMediaPagination')) return { useMediaPagination: items => ({ items, page: 1, pageCount: 1, total: items.length, start: 1, end: items.length, pageSize: 20 }) };
    if (id.endsWith('/mediaBrowsing')) return { mediaDirectoryImages: values => values };
    if (id.endsWith('/MediaPagination')) return { MediaPagination: 'pagination' };
    if (id.endsWith('/MediaPreviewDialog')) return { MediaPreviewDialog: 'preview' };
    if (id.endsWith('/ArticleImagePreview')) return { ArticleImagePreview: 'image' };
    if (id.endsWith('/resources/types')) return resourceTypes;
    if (id.endsWith('/MediaImportDialog')) return { MediaImportDialog: 'confirmation' };
    if (id.endsWith('/MediaManagementDialog')) return { MediaManagementDialog: 'management' };
    if (id.endsWith('/useMediaLibrary')) return { useMediaLibrary: () => ({ assets: [asset], issues: [], loading: false, refresh() {} }) };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' };
    if (id.endsWith('/MediaToolbar')) return { MediaToolbar: 'toolbar' };
    if (id.endsWith('/MediaGallery')) return { MediaDetails: 'detail', MediaGallery: 'gallery', MediaBrowseControls: 'browse', sortMediaAssets: values => values, MediaIcon: 'icon', MediaImportButton: 'import', MediaSourceSwitch: 'switch', mediaAssetKey: a => a.fileName };
    throw new Error(id);
  }) });
  const find = predicate => { const result = tree.find(predicate); assert.ok(result); return result; };
  render();
  return { render, find, get closes() { return closes; }, get calls() { return calls; }, adopt: () => find(node => node.type === 'button' && text(node).includes('采用图片')).props.onClick(), cancel: () => find(node => node.type === 'button' && text(node).includes('取消')).props.onClick() };
}

test('adoption locks synchronously against duplicate clicks and dismissals before rerender', async () => {
  let finish;
  const view = picker(() => new Promise(resolve => { finish = resolve; }));
  view.adopt(); view.adopt(); view.cancel();
  assert.equal(view.calls, 1); assert.equal(view.closes, 0);
  view.render(); assert.equal(view.find(node => node.type === 'frame').props.dismissible, false);
  finish({ ok: true, message: 'done', tone: 'success' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.closes, 1);
});

test('a failed adoption preserves the selection, displays its error and permits retry', async () => {
  let attempts = 0;
  const view = picker(async () => { if (++attempts === 1) throw new Error('write failed'); return { ok: true, message: 'done', tone: 'success' }; });
  view.adopt(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.closes, 0); assert.equal(view.find(node => node.type === 'gallery').props.selected, 'cover.png');
  assert.match(JSON.stringify(view.find(node => node.type === 'operation-feedback' && node.props.tone === 'error').props.notice), /write failed/);
  view.adopt(); await new Promise(resolve => setImmediate(resolve)); assert.equal(view.closes, 1);
});

test('attachment adoption verifies existing files, copies shared files once and inserts file links through the same undo path', async () => {
  for (const kind of ['article', 'shared']) {
    const f = fixture(), inserted = [];
    f.context.snapshotFor = () => ({ source: f.context.articleRef.current.source, folder: 'article', month: '2026-10', themeValid: true, directory: f.root, documentToken: f.context.documentTokenRef.current, articleId: f.request.articleId });
    f.context.resourceAssetDirectory = async () => { f.calls.push(['verified']); };
    f.context.copyResourceFileAs = async (_asset, destination, name, current) => { assert.equal(current(), true); assert.equal(destination.articleId, f.request.articleId); f.calls.push(['copy-file', name]); return { fileName: 'independent.pdf' }; };
    f.context.setMediaRefreshRevision = () => {};
    f.context.insertImagesIntoDraft = (_target, names, selection, storage) => { inserted.push({ names, selection, storage }); return { ok: true, message: 'inserted', tone: 'warning' }; };
    const result = await f.adopt({ kind, root: f.root, articleId: f.request.articleId, fileName: 'guide.pdf', storage: 'file' });
    assert.equal(result.ok, true); assert.equal(inserted[0].storage, 'file'); assert.equal(inserted[0].selection.start, f.request.selection.start);
    assert.equal(inserted[0].names[0], kind === 'shared' ? 'independent.pdf' : 'guide.pdf'); assert.equal(f.calls.filter(call => call[0] === 'copy-file').length, kind === 'shared' ? 1 : 0); assert.equal(f.context.mediaOperationRef.current, false);
  }
});

test('a library change during attachment copying cannot insert into the newly active manuscript', async () => {
  const f = fixture();
  f.context.snapshotFor = () => ({ source: f.context.articleRef.current.source, folder: 'article', month: '2026-10', themeValid: true, directory: f.root, documentToken: f.context.documentTokenRef.current, articleId: f.request.articleId });
  f.context.resourceAssetDirectory = async () => {};
  f.context.copyResourceFileAs = async () => { f.context.directoryRef.current = {}; return { fileName: 'copied.pdf' }; };
  f.context.setMediaRefreshRevision = () => { throw Error('stale view must not refresh'); };
  const result = await f.adopt({ kind: 'shared', root: f.root, fileName: 'guide.pdf', storage: 'file' });
  assert.equal(result.ok, false); assert.equal(f.calls.some(call => call[0] === 'insert'), false); assert.equal(f.context.mediaOperationRef.current, false);
});

test('a new draft with a failed theme snapshot retains its source without copying attachments', async () => {
  const f = fixture();
  f.context.snapshotFor = () => ({ source: f.context.articleRef.current.source, folder: null, month: null, themeValid: true, directory: f.root, documentToken: f.context.documentTokenRef.current, articleId: 'draft' });
  f.context.saveSnapshot = async () => ({ ok: true, current: true, savedSnapshot: { themeValid: false }, result: { article: { themeValid: false } } });
  f.context.resourceAssetDirectory = async () => { throw Error('must not read attachments'); };
  const result = await f.adopt({ kind: 'shared', root: f.root, fileName: 'guide.pdf', storage: 'file' });
  assert.equal(result.ok, false); assert.equal(f.calls.some(call => call[0] === 'insert'), false); assert.equal(f.context.mediaOperationRef.current, false);
});

test('import success clears stale selection and filters; failure keeps both for retry', async () => {
  const results = [{ ok: false, message: 'permission revoked', tone: 'error' }, { ok: true, message: 'imported', tone: 'success' }];
  const view = picker(async () => ({ ok: true }), async () => results.shift());
  view.find(node => node.type === 'toolbar').props.onQueryChange('previous search'); view.render();
  view.find(node => node.type === 'import').props.onSelect([new File(['bytes'], 'new.png')]); view.render();
  const confirmation = view.find(node => node.type === 'confirmation').props;
  await confirmation.onImport(confirmation.files); confirmation.onClose(); view.render();
  assert.equal(view.find(node => node.type === 'toolbar').props.query, 'previous search');
  assert.ok(view.find(node => node.type === 'detail'));
  view.find(node => node.type === 'import').props.onSelect([new File(['bytes'], 'new.png')]); view.render();
  const retry = view.find(node => node.type === 'confirmation').props;
  await retry.onImport(retry.files); retry.onClose(); view.render();
  assert.equal(view.find(node => node.type === 'toolbar').props.query, '');
  assert.equal(view.find(node => node.type === 'gallery').props.selected, null);
  assert.equal(view.find(node => node.type === 'button' && text(node).includes('采用图片')).props.disabled, true);
});


test('picker yields focus only while a toolbar popover owns it and stays single-select', () => {
  const view = picker(async () => ({ ok: true }));
  view.find(node => node.type === 'toolbar').props.onControlChange('sort'); view.render();
  assert.equal(view.find(node => node.type === 'frame').props.focusActive, false);
  assert.equal(view.find(node => node.type === 'toolbar').props.selection, undefined);
  assert.equal(view.find(node => node.type === 'gallery').props.onToggleSelection, undefined);
  view.find(node => node.type === 'toolbar').props.onControlChange(null); view.render();
  assert.equal(view.find(node => node.type === 'frame').props.focusActive, true);
});
