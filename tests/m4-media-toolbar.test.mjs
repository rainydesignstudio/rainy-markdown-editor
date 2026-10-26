import * as resourceTypes from '../src/lib/resources/types.ts';
import { inspectResourceFile } from '../src/lib/resources/storage.ts';
import { libraryMediaAssetKey } from '../src/lib/articleMedia.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
async function component(file, dependencies, runEffects = false) {
  const module = { exports: {} }, cells = [], effects = [], keyListeners = new Set(), body = {}, html = {};
  let cursor = 0, modal = false;
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Set, AbortController, window: { matchMedia: () => ({ matches: false }), addEventListener(name, fn) { if (name === 'keydown') keyListeners.add(fn); }, removeEventListener(name, fn) { if (name === 'keydown') keyListeners.delete(fn); } }, document: { body, documentElement: html, querySelector: () => modal ? {} : null }, require: withUILocaleImports(function(id){
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' }; if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; }, useMemo: callback => callback(), useEffect(callback, deps) {
        if (!runEffects) return;
        const index = cursor++, previous = cells[index];
        if (previous && deps.every((value, n) => value === previous.deps[n])) return;
        effects.push(() => { previous?.cleanup?.(); cells[index] = { deps, cleanup: callback() }; });
      },
    };
    if (id.endsWith('/resources/types')) return resourceTypes; if (id.endsWith('/resources/storage')) return { inspectResourceFile }; if (id.endsWith('/ResourceGlyph')) return { ResourceGlyph: 'resource-glyph' }; if (id.endsWith('/articleMedia') && !(id in dependencies)) return { libraryMediaAssetKey }; if (id in dependencies) return dependencies[id];
    if (id.endsWith('/useImageZoom')) return { useImageZoom() {} };
    if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
    if (id.endsWith('/ContentIcon')) return { ContentIcon: 'content-icon' };
    if (id.endsWith('/IconButton')) return { IconButton: 'zoom-button' };
    throw new Error(id);
  }) });
  const render = (name, props) => { cursor = 0; const result = nodes(module.exports[name](props)); while (effects.length) effects.shift()(); return result; };
  render.setModal = value => { modal = value; };
  render.bodyEscape = (changes = {}) => { const event = { key:'Escape', target:body, isComposing:false, defaultPrevented:false, preventDefault(){ this.defaultPrevented = true; }, stopPropagation(){}, ...changes }; for (const fn of keyListeners) fn(event); };
  return render;
}
const assets = [{ kind: 'shared', fileName: 'a.png', size: 1, mimeType: 'image/png', handle: {} }, { kind: 'shared', fileName: 'b.png', size: 2, mimeType: 'image/png', handle: {} }];
const galleryExports = { MediaDetails: 'details', MediaGallery: 'gallery', MediaIcon: 'icon', MediaImportButton: 'import', sortMediaAssets: values => values, mediaAssetKey: asset => asset.fileName };
const find = (tree, predicate) => { const node = tree.find(predicate); assert.ok(node); return node; };

test('first card checkbox enables bulk selection; collapsed controls retain it and filter changes clear it', async () => {
  const render = await component('../src/components/media/MediaLibrary.tsx', {
    '../../lib/editorWorkspace': { getArticleOrganization: () => ({}) },
    '../global/PageHeading': { PageHeading: 'heading' }, './MediaManagementDialog': { MediaManagementDialog: 'management' },
    '../../hooks/useMediaPreferences': { useMediaPreferences: () => [{ columns: 1, sort: 'name', descending: false }, () => {}] },
    '../../hooks/useMediaPagination': { useMediaPagination: items => ({ items, page: 1, pageCount: 1, total: items.length, start: 1, end: items.length, pageSize: 20 }) },
    '../../lib/mediaBrowsing': { mediaDirectoryImages: values => values }, './MediaPagination': { MediaPagination: 'pagination' }, './MediaPreviewDialog': { MediaPreviewDialog: 'preview' }, './MediaImportDialog': { MediaImportDialog: 'import-dialog' },
    '../../hooks/useMediaLibrary': { useMediaLibrary: () => ({ assets, issues: [], refresh() {} }) },
    '../global/DialogFrame': { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' },
    './MediaToolbar': { MediaToolbar: 'toolbar' }, './MediaGallery': galleryExports, './ArticleImagePreview': { ArticleImagePreview: 'image' },
  }, true);
  const props = { root: {}, sessionKey: 1, refreshSignal: 0, articles: [], workspace: { projects: [] }, isRootCurrent: () => true, currentReferenceCount: () => 0, busy: false, currentArticleId: '', canAdopt: false };
  const view = () => render('MediaLibrary', props);
  const toolbar = () => find(view(), node => node.type === 'toolbar').props;
  const gallery = () => find(view(), node => node.type === 'gallery').props;
  gallery().onToggleSelection(assets[0]);
  assert.equal(toolbar().selection.active, true); assert.equal(toolbar().selection.count, 1); assert.equal(toolbar().activeControl, 'selection');
  toolbar().onControlChange('sort'); assert.equal(toolbar().activeControl, 'sort'); assert.equal(toolbar().selection.count, 1);
  toolbar().onControlChange(null); assert.equal(toolbar().selection.count, 1);
  gallery().onSelect(assets[1]); assert.equal(toolbar().selection.count, 2);
  toolbar().onQueryChange('a'); assert.equal(toolbar().selection.count, 0); assert.equal(toolbar().selection.active, false);
  gallery().onToggleSelection(assets[0]); toolbar().types.onChange('all'); assert.equal(toolbar().selection.count, 0);
  toolbar().selection.onEnable(); toolbar().selection.onAll(); assert.equal(toolbar().selection.count, 1);
  toolbar().selection.onCancel(); assert.equal(toolbar().selection.active, false);
  toolbar().onQueryChange('');
  gallery().onToggleSelection(assets[0]); gallery().onToggleSelection(assets[1]);
  let focused = 0, prevented = 0;
  const escape = (overrides = {}) => find(view(), node => node.type === 'section' && node.props.onDrop).props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: false }, defaultPrevented: false, preventDefault() { prevented++; }, stopPropagation() {}, currentTarget: { querySelector: () => ({ focus() { focused++; } }) }, ...overrides });
  escape({ nativeEvent: { isComposing: true } });
  escape({ defaultPrevented: true });
  props.busy = true; escape(); props.busy = false;
  assert.equal(toolbar().selection.count, 2); assert.equal(prevented, 0);
  gallery().onTransfer(assets[0]);
  let management = find(view(), node => node.type === 'management').props;
  assert.deepEqual([...management.request.assets], [assets[0]], 'single-card transfer excludes other selected assets');
  escape(); assert.equal(toolbar().selection.count, 2, 'child dialog owns Escape');
  management.onClose();
  toolbar().onControlChange('sort'); escape();
  assert.equal(toolbar().activeControl, null); assert.equal(toolbar().selection.count, 2, 'first Escape closes only the active popover');
  escape();
  assert.equal(toolbar().selection.active, false); assert.equal(toolbar().selection.count, 0); assert.equal(focused, 1);
  assert.equal(toolbar().query, ''); assert.equal(toolbar().groups, undefined);
  gallery().onSelect(assets[1]);
  find(view(), node => node.type === 'details').props.onTransfer();
  management = find(view(), node => node.type === 'management').props;
  assert.deepEqual([...management.request.assets], [assets[1]], 'details transfers its own resource');
  management.onClose();
  gallery().onToggleSelection(assets[0]); toolbar().onSourceChange('article'); assert.equal(toolbar().selection.count, 0);
  toolbar().onSourceChange('shared'); gallery().onToggleSelection(assets[0]);
  const host = find(view(), node => node.type === 'section' && node.props.onDrop);
  host.props.ref.current = { querySelector: () => ({ focus() { focused++; } }) };
  render.setModal(true); render.bodyEscape(); assert.equal(toolbar().selection.count, 1, 'a modal owns Escape even if focus returns to body');
  render.setModal(false); render.bodyEscape({ isComposing:true }); render.bodyEscape({ defaultPrevented:true }); render.bodyEscape({ target:{} });
  assert.equal(toolbar().selection.count, 1);
  render.bodyEscape(); assert.equal(toolbar().selection.active, false); assert.equal(toolbar().selection.count, 0);
  assert.equal(focused, 2, 'body-focus cancellation returns to the selection trigger');

});

test('toolbar controls are exclusive, sorting arrow applies its field and range preserves sorting', async () => {
  const render = await component('../src/components/media/MediaToolbar.tsx', {
    '../global/IconPopover': { IconPopover: 'popover' }, '../global/TooltipButton': { TooltipButton: 'tooltip' }, '../global/IconButton': { IconButton: 'tooltip' }, './MediaGallery': { MediaIcon: 'icon', MediaSourceSwitch: 'source' },
  });
  let activeControl = null, preferences = { columns: 3, sort: 'name', descending: false }, enabled = 0;
  const props = { source: 'article', query: '', onSourceChange() {}, onQueryChange() {}, disabled: false, groups: { value: 'all', options: [{ value: 'all', label: '全部分组' }], onChange() {} }, articles: { value: 'all', options: [{ value: 'all', label: '全部文章' }], onChange() {} }, selection: { active: false, count: 0, hasVisible: true, onEnable() { enabled++; } }, onControlChange: value => activeControl = value, onPreferencesChange: value => preferences = value };
  const view = () => render('MediaToolbar', { ...props, activeControl, preferences });
  find(view(), node => node.props['aria-label']?.startsWith('多选图片')).props.onClick(); assert.equal(activeControl, 'selection');
  assert.equal(view().some(node => node.props.label === '所属分组' || node.props.label === '文章'), false);
  find(view(), node => node.props.label === '图片排序').props.onToggle(); assert.equal(activeControl, 'sort');
  find(view(), node => node.props['aria-label'] === '按文件大小切换为降序').props.onClick(); assert.equal(preferences.sort, 'size'); assert.equal(preferences.descending, true);
  find(view(), node => node.props.label === '图片布局').props.onToggle(); assert.equal(activeControl, 'layout');
  const range = find(view(), node => node.props.type === 'range'); assert.equal(range.props.min, '1'); assert.equal(range.props.max, '4'); assert.equal(range.props.step, '1');
  range.props.onChange({ target: { value: '1' } }); assert.equal(preferences.columns, 1); assert.equal(preferences.sort, 'size'); assert.equal(preferences.descending, true);
  assert.equal(enabled, 1);
});

test('card selection, checkbox, rename and actions are separate sibling controls in grid and list modes', async () => {
  const render = await component('../src/components/media/MediaGallery.tsx', { '../global/TooltipButton': { TooltipButton: 'tooltip' }, '../global/IconButton': { IconButton: 'tooltip' }, './ArticleImagePreview': { ArticleImagePreview: 'image' } });
  for (const columns of [1, 3]) {
    const calls = [], asset = assets[0];
    const tree = render('MediaGallery', { assets: [asset], selected: null, columns, selectedKeys: new Set(), disabled: false, onSelect: () => calls.push('select'), onToggleSelection: () => calls.push('check'), onRename: () => calls.push('rename'), onDelete: () => calls.push('delete'), onAdopt: () => calls.push('adopt') });
    const card = find(tree, node => node.type === 'article');
    const primary = find(tree, node => node.type === 'button' && node.props['aria-label']?.startsWith('选择 '));
    assert.equal(nodes(primary.props.children).some(node => node.type === 'button' || node.props.role === 'checkbox'), false, 'interactive controls cannot be nested in stretched button');
    primary.props.onClick();
    find(tree, node => node.type === 'tooltip' && node.props.role === 'checkbox').props.onClick();
    find(tree, node => node.type === 'button' && node.props.title === asset.fileName).props.onClick();
    find(tree, node => node.props['aria-label'] === `删除 ${asset.fileName}`).props.onClick();
    assert.deepEqual(calls, ['select', 'check', 'rename', 'delete']);
    assert.equal(card.props['data-layout'], columns === 1 ? 'list' : 'grid');
  }
});

test('single-resource tags and transfer labels agree for referenced, unused, unknown and disabled images/files', async () => {
  const render = await component('../src/components/media/MediaGallery.tsx', { '../global/TooltipButton': { TooltipButton: 'tooltip' }, '../global/IconButton': { IconButton: 'tooltip' }, './ArticleImagePreview': { ArticleImagePreview: 'image' } });
  for (const storage of ['image', 'file']) {
    const asset = { ...assets[0], storage, fileName: storage === 'file' ? 'notes.txt' : 'a.png' };
    for (const referenced of [true, false, undefined]) for (const disabled of [false, true]) {
      const calls = [], label = referenced === undefined ? '引用尚未核实' : referenced ? '复制' : '移动';
      const tree = render('MediaGallery', { assets: [asset], referenceStates: referenced === undefined ? undefined : { [libraryMediaAssetKey(asset)]: referenced }, disabled, onTransfer: value => calls.push(value), onDelete() {} });
      const transfer = find(tree, node => node.type === 'tooltip' && node.props['aria-label'] === label);
      assert.equal(transfer.props.disabled, disabled || referenced === undefined);
      assert.equal(tree.some(node => node.type === 'span' && node.props.children === '被引用'), referenced === true);
      assert.equal(transfer.props.icon.props.name, 'copy');
      const actions = nodes(find(tree, node => node.props.role === 'group' && node.props.children?.some?.(child => child?.props === transfer.props)).props.children).filter(node => node.type === 'tooltip');
      assert.equal(actions[1], transfer); assert.equal(actions[2].props.tone, 'danger');
      const details = render('MediaDetails', { asset, referenced, disabled, onPreview() {}, onReplace() {}, onTransfer() {}, onDelete() {} });
      const buttons = details.filter(node => node.type === 'tooltip'), index = buttons.findIndex(node => node.props['aria-label'] === label);
      assert.equal(buttons.length, 5); assert.deepEqual(buttons.map(node => node.props.icon.props.name), ['image', 'download', 'copy', 'replace', 'delete']);
      assert.equal(buttons[index].props.disabled, disabled || referenced === undefined);
      assert.equal(details.some(node => node.type === 'span' && node.props.children === '被引用'), referenced === true);
    }
  }
});

test('the shared reference hook cancels old batches, isolates identities and keeps incomplete scans unknown', async () => {
  const requests = [], cells = [], effects = []; let cursor = 0;
  const props = { root: {}, sessionKey: 1, assets, loading: false, revision: 'one', isCurrent: () => true, scan: (selected, signal) => new Promise(resolve => requests.push({ selected, signal, resolve })) };
  const module = { exports: {} }, source = await readFile(new URL('../src/hooks/useMediaReferences.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, AbortController, require: withUILocaleImports(id => {
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
      useEffect(callback, deps) { const index = cursor++, previous = cells[index]; if (previous && deps.every((value, n) => value === previous.deps[n])) return; effects.push(() => { previous?.cleanup?.(); cells[index] = { deps, cleanup: callback() }; }); },
    }; throw new Error(id);
  }) });
  const view = () => { cursor = 0; const result = module.exports.useMediaReferences(props); while (effects.length) effects.shift()(); return result; };
  assert.equal(view().states, undefined); assert.equal(requests.length, 1); assert.equal(requests[0].selected.length, 2);
  const first = { current: 0, workspace: 1, issues: [], referenced: { 'a.png': true, 'b.png': false } };
  requests[0].resolve(first); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view().states, first.referenced); view(); assert.equal(requests.length, 1, 'ordinary UI rerenders share the same batch');
  props.revision = 'two'; assert.equal(view().states, undefined); assert.equal(requests.length, 2);
  props.root = {}; props.sessionKey = 2; view(); assert.equal(requests[1].signal.aborted, true); assert.equal(requests.length, 3);
  requests[1].resolve(first); await new Promise(resolve => setImmediate(resolve)); assert.equal(view().states, undefined);
  requests[2].resolve({ ...first, issues: ['unreadable history'] }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view().states, undefined); assert.match(JSON.stringify(view().issue), /unreadable history/);
  for (const cell of cells) cell?.cleanup?.();
});
