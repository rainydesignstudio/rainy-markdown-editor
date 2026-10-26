import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import * as textDiff from '../src/lib/textDiff.ts';
import * as history from '../src/lib/articleHistory.ts';
import * as frontMatter from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import { createUII18n } from '../src/lib/i18n/runtime.ts';

const source = await readFile(new URL('../src/components/history/ArticleHistoryDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function page() {
  let cursor = 0, tree, closed = 0, dark = false;
  const cells = [], effects = [], frames = [], listeners = new Map(), deleted = [], forks = [], retention = [];
  const source = frontMatter.createArticleSource('Current draft', BASIC_THEME.id);
  const snapshot = { id: 'snapshot-fixture', title: 'Selected history', createdAt: '2026-10-18T00:00:00.000Z', kind: 'manual', retained: true, source, parsed: frontMatter.parseArticle(source), theme: BASIC_THEME, themeMatches: true };
  const props = { articleTitle: 'Current draft', currentSource: source, currentTheme: BASIC_THEME, currentThemeValid: true, currentDirty: false, month: '2026-10', folder: 'test-only', root: {}, mediaArticle: { id: 'test-only', month: '2026-10', folder: 'test-only' }, snapshots: [snapshot], issues: [], selectedId: snapshot.id, busy: false, canRestore: true, canDelete: true, canSaveAs: true, refreshPending: false, notice: { label: '', tone: 'neutral' }, months: ['2026-09'], onClose: () => closed++, getReturnFocus: () => null, onSelect() {}, onManualSnapshot() {}, onRestore() {}, onDelete: async value => { deleted.push(value); return true; }, onSaveAs: async (...values) => { forks.push(values); return true; }, onToggleRetention: (...values) => retention.push(values), onRefreshHistory() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, HTMLElement: class {}, document: { activeElement: null }, window: { requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame() {}, addEventListener: (key, cb) => listeners.set(key, cb), removeEventListener() {} }, require: withUILocaleImports(id => {
    if (id.endsWith('/textDiff')) return textDiff;
    if (id.endsWith('/articleHistory')) return history;
    if (id.endsWith('/frontMatter')) return frontMatter;
    if (id.endsWith('/HistorySnapshotPreview')) return { HistorySnapshotPreview: 'preview' };
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'live-format' }) };
    if (id.endsWith('/useArticlePreviewMode')) return { useArticlePreviewMode: () => ({ dark, toggle: () => { dark = !dark; } }) };
    if (id.endsWith('/PreviewModeSwitch')) return { PreviewModeSwitch: 'preview-mode-switch' };
    if (id.endsWith('/ModeSwitch')) return { ModeSwitch: 'mode-switch' };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
    if (id.endsWith('/EditorTopbar')) return { EditorActionIcon: 'action-icon' };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'dialog-header', DialogFooter: 'dialog-footer', DialogActions: 'dialog-actions', DialogButton: 'dialog-button' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => cells[i] = typeof value === 'function' ? value(cells[i]) : value]; },
      useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
      useMemo(fn) { return fn(); },
      useEffect(fn, deps) { const i = cursor++; if (cells[i]) return; effects.push(fn); cells[i] = deps; },
    };
    throw new Error(id);
  }) });
  const render = () => { cursor = 0; tree = module.exports.ArticleHistoryView(props); while (effects.length) effects.shift()(); };
  const nodes = () => walk(tree);
  const find = check => { const node = nodes().find(check); assert.ok(node, 'control exists'); return node; };
  render();
  return { props, snapshot, deleted, forks, retention, render, nodes, find, frames, get closed() { return closed; }, button: label => find(n => n.type === 'button' && text(n) === label), action: label => find(n => n.type === 'icon-button' && n.props.tooltip === label), escape() { listeners.get('keydown')?.({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); } };
}

test('all five history actions share the top toolbar while details and count retain their places', () => {
  const p = page(), header = p.find(n => n.type === 'header');
  const toolbar = walk(header).find(n => n.type === 'button-bar' && n.props.label === '历史版本操作');
  assert.ok(toolbar);
  const actions = walk(toolbar).filter(n => n.type === 'icon-button');
  assert.deepEqual(actions.map(n => n.props.tooltip), ['文章信息与主题', '从历史版本 Fork', '保存重要版本', '恢复此版本', '删除此版本']);
  assert.ok(actions[2].props.title.includes('当前编辑稿'));
  assert.ok(actions.every(n => n.props.icon.type === 'action-icon'));
  const aside = p.find(n => n.type === 'aside');
  assert.ok(text(aside).includes('共 1 个历史版本'));
  assert.equal(walk(aside).at(-1).type, 'p');
  assert.equal(p.nodes().some(n => n.type === 'form' || n.type === 'dialog'), false);
});

test('history child dialogs keep comparison state and prevent Escape from closing the history page', () => {
  const p = page();
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  p.action('文章信息与主题').props.onClick(); p.render();
  assert.equal(p.find(n => n.type === 'dialog' && n.props.titleId === 'history-info-title').props.large, undefined);
  p.escape(); assert.equal(p.closed, 0);
  p.find(n => n.type === 'dialog').props.onClose(); p.render();
  assert.equal(p.find(n => n.type === 'mode-switch').props.checked, true);
  p.escape(); assert.equal(p.closed, 1);
});

test('render comparison passes the retained current interpreter only to the current pane', () => {
  const p = page();
  p.props.currentFormat = { id: 'retained-current-format' };
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  const previews = p.nodes().filter(n => n.type === 'preview');
  assert.equal(previews.length, 2);
  assert.equal(previews[0].props.reference, undefined);
  assert.equal(previews[1].props.reference, p.props.currentFormat);
});

test('deletion needs explicit confirmation; cancellation is inert and failure keeps the selected target visible', async () => {
  const p = page();
  p.action('删除此版本').props.onClick(); p.render();
  assert.equal(p.deleted.length, 0);
  const dialog = () => p.find(n => n.type === 'dialog' && n.props.titleId === 'history-delete-title');
  assert.match(text(dialog()), /Selected history.*无法撤销.*自动清理不会删除/s);
  dialog().props.onClose(); p.render(); assert.equal(p.deleted.length, 0);
  p.action('删除此版本').props.onClick(); p.render();
  p.props.onDelete = async () => false;
  p.render();
  await p.find(n => n.type === 'dialog-button' && text(n) === '确认删除此版本').props.onClick(); p.render(); assert.ok(dialog());
  p.props.onDelete = async value => { p.deleted.push(value); return true; }; p.render();
  await p.find(n => n.type === 'dialog-button' && text(n) === '确认删除此版本').props.onClick(); p.render();
  assert.equal(p.deleted[0], p.snapshot);
  assert.equal(p.nodes().some(n => n.type === 'dialog'), false);
});

test('Fork awaits its outcome, prevents duplicate submissions and closes only its child dialog', async () => {
  const p = page(); p.action('从历史版本 Fork').props.onClick({ currentTarget: { focus() {} } }); p.render();
  let complete;
  p.props.onSaveAs = (...values) => { p.forks.push(values); return new Promise(resolve => { complete = resolve; }); }; p.render();
  const form = p.find(n => n.type === 'form');
  const pending = form.props.onSubmit({ preventDefault() {} }); p.render();
  assert.equal(p.forks.length, 1); assert.equal(p.forks[0][0], p.snapshot);
  assert.equal(p.forks[0][2], '2026-10');
  assert.ok(p.find(n => n.type === 'dialog' && n.props.titleId === 'history-fork-title'));
  p.props.busy = true; p.render();
  await p.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(p.forks.length, 1);
  let focused = 0;
  p.find(n => n.props['data-history-back']).props.ref.current = { focus() {}, closest: () => ({ querySelector: () => ({ focus() { focused++; } }) }) };
  p.props.busy = false; complete(true); await pending; p.render();
  p.frames.forEach(fn => fn()); assert.equal(focused, 1);
  assert.equal(p.nodes().some(n => n.type === 'dialog'), false); assert.equal(p.closed, 0);
});

test('a stale Fork outcome leaves the current child dialog alone', async () => {
  const p = page(); p.action('从历史版本 Fork').props.onClick({ currentTarget: { focus() {} } }); p.render();
  p.props.onSaveAs = async () => false; p.render();
  await p.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); p.render();
  assert.ok(p.find(n => n.type === 'dialog' && n.props.titleId === 'history-fork-title'));
});


test('protection controls reflect actual retained state and keep immutable snapshots guarded', () => {
  const p = page();
  const lock = () => p.find(n => n.type === 'icon-button' && n.props.variant === 'history');
  assert.equal(lock().props['aria-pressed'], true);
  assert.equal(lock().props.disabled, true);
  lock().props.onClick(); assert.equal(p.retention.length, 0);
  p.snapshot.kind = 'automatic'; p.snapshot.retained = false; p.render();
  assert.equal(lock().props['aria-pressed'], false);
  assert.equal(lock().props.tooltip, '保护此版');
  lock().props.onClick(); assert.equal(p.retention[0][0], p.snapshot); assert.equal(p.retention[0][1], true);
  p.snapshot.retained = true; p.render();
  assert.equal(lock().props.tooltip, '解除保护');
  lock().props.onClick(); assert.equal(p.retention[1][1], false);
  p.props.refreshPending = true; p.render();
  lock().props.onClick(); assert.equal(p.retention.length, 2);
});


test('history header reuses the editor context with the five icon actions and keeps status feedback', () => {
  const p = page(); p.props.notice = { label: '历史版本已载入。', tone: 'neutral' }; p.render();
  const header = p.find(n => n.type === 'header');
  assert.match(text(header), /返回编辑器.*Current draft.*历史版本/s);
  assert.deepEqual(walk(header).filter(n => n.type === 'icon-button').map(n => n.props.tooltip), ['文章信息与主题', '从历史版本 Fork', '保存重要版本', '恢复此版本', '删除此版本']);
  assert.equal(text(header).includes('test-only'), false);
  const status = () => p.find(n => n.type === 'operation-feedback');
  assert.ok(p.nodes().some(n => n.type === 'p' && /2026-10\/test-only.*成对保存/.test(text(n))));
  assert.equal(status().props.notice.label, '历史版本已载入。');
  assert.equal(status().props.hideTrigger, true);
  p.props.notice = { label: '写入失败', tone: 'error' }; p.render();
  assert.equal(status().props.notice.label, '写入失败'); assert.equal(status().props.tone, 'error');
});


test('the dark-mode switch remains visible, disables source comparison and preserves render mode and both snapshots use its mode', () => {
  const p = page(); const secondary = () => p.find(n => n.type === 'preview-mode-switch');
  assert.equal(secondary().props.disabled, true);
  assert.equal(secondary().props.reason, '选项不可用');
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  assert.equal(secondary().props.disabled, false);
  secondary().props.onToggle(); p.render();
  assert.deepEqual(p.nodes().filter(n => n.type === 'preview').map(n => n.props.dark), [true, true]);
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  assert.equal(secondary().props.disabled, true);
});


const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const forkStart = controllerSource.indexOf('  const saveHistoryAsArticle = useCallback(');
const forkEnd = controllerSource.indexOf('  const insertImagesIntoDraft = useCallback(', forkStart);
function forkOperation(outcome = 'success') {
  const root = {}, current = { directory: root, articleId: 'original', month: '2026-10', folder: 'original', themeValid: true, documentToken: {}, source: 'Unsaved original draft' };
  const selected = { source: frontMatter.createArticleSource('Historical content', BASIC_THEME.id), theme: BASIC_THEME, themeMatches: true };
  const toasts = [], notices = [], writes = []; let copies = 0, cleanups = 0, finishes = 0, busy = false;
  const context = {
    ...productMessages, useCallback: fn => fn, snapshotFor: () => current, directoryRef: { current: root },
    storedArticles: [{ id: 'original', parse: { diagnostics: [] } }], matchesSnapshot: () => true,
    beginHistoryOperation() { if (busy) return null; busy = true; return Symbol(); }, finishHistoryOperation() { busy = false; finishes++; },
    setHistoryNotice: value => notices.push(value), notifyToast: value => toasts.push(value), setStoredArticles() {},
    upsertStoredArticle: (items, item) => [...items, item],
    mutationQueueRef: { current: { canSave: () => true, run: task => Promise.resolve().then(task) } },
    copyStoredArticle: async () => { copies++; return { article: { month: '2026-10', folder: 'new-fork' }, folderCollision: false }; },
    updateFrontMatter: frontMatter.updateFrontMatter,
    saveStoredArticle: async (_root, content, theme) => { writes.push({ content, theme }); if (outcome === 'error') throw new Error('write failed'); return { article: { themeValid: true, parse: { metadata: { title: 'New fork' } } }, indexUpdated: outcome !== 'warning', indexError: outcome === 'warning' ? 'index unavailable' : null }; },
    deleteStoredArticle: async () => { cleanups++; },
  };
  vm.runInNewContext(ts.transpileModule(controllerSource.slice(forkStart, forkEnd) + '\nglobalThis.fork = saveHistoryAsArticle;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { context, current, selected, toasts, notices, writes, copies: () => copies, cleanups: () => cleanups, finishes: () => finishes, run: () => context.fork(selected, 'New fork', '2026-10') };
}

test('historical Fork reports one localized result toast for success, index warning and failure', async () => {
  for (const outcome of ['success', 'warning', 'error']) {
    const f = forkOperation(outcome), original = JSON.stringify(f.current);
    assert.equal(await f.run(), true); assert.equal(f.toasts.length, 1); assert.equal(f.toasts[0].tone, outcome);
    assert.equal(f.toasts[0].key, 'history-fork'); assert.equal(f.finishes(), 1);
    assert.equal(JSON.stringify(f.current), original); assert.equal(f.cleanups(), outcome === 'error' ? 1 : 0);
    for (const locale of ['zh-CN', 'en-US']) {
      const rendered = productMessages.formatProductMessage(f.toasts[0], createUII18n(locale).getFixedT(locale));
      assert.ok(rendered && !rendered.includes('{{') && !rendered.includes('messages:'));
      if (outcome === 'warning') assert.ok(rendered.includes('New fork') && rendered.includes('index unavailable'));
      if (outcome === 'error') assert.ok(rendered.includes('write failed'));
    }
  }
});

test('stale document or library results neither report a toast nor close a current Fork dialog', async () => {
  for (const changed of ['document', 'library']) {
    const f = forkOperation();
    f.context.saveStoredArticle = async () => {
      if (changed === 'document') f.context.matchesSnapshot = () => false;
      else f.context.directoryRef.current = {};
      return { article: { themeValid: true, parse: { metadata: { title: 'New fork' } } }, indexUpdated: true };
    };
    assert.equal(await f.run(), false); assert.equal(f.toasts.length, 0); assert.equal(f.finishes(), 1);
  }
});

test('a repeated in-flight Fork does not create a second copy or duplicate feedback', async () => {
  const f = forkOperation(); let complete;
  f.context.mutationQueueRef.current.run = task => new Promise(resolve => { complete = async () => resolve(await task()); });
  const pending = f.run(); assert.equal(await f.run(), false); assert.equal(f.copies(), 0);
  await complete(); assert.equal(await pending, true); assert.equal(f.copies(), 1); assert.equal(f.toasts.length, 1);
});

function listForkOperation(outcome = 'success') {
  const root = {}, toasts = [], statuses = [];
  const context = {
    ...productMessages, useCallback: fn => fn, copyTarget: { id: 'original', month: '2026-10', folder: 'original' },
    directoryRef: { current: root }, copyTitle: 'Review Fork', copyMonth: '2026-10', copySourceOverride: null, copyThemeTarget: null, copyFromThemeLibrary: false,
    setCopyTarget() {}, setCopySourceOverride() {}, setCopyThemeTarget() {}, setCopyFromThemeLibrary() {},
    setStatus: value => statuses.push(value), notifyToast: value => toasts.push(value), setStoredArticles() {},
    upsertStoredArticle: (items, item) => [...items, item], applyStoredArticle() {},
    mutationQueueRef: { current: { run: task => task() } },
    copyStoredArticle: async () => {
      if (outcome === 'error') throw new Error('write failed');
      if (outcome === 'stale') context.directoryRef.current = {};
      return { article: { folder: 'review-fork', theme: { version: '1.0.0' }, parse: { metadata: { title: 'Review Fork' } } }, indexUpdated: outcome !== 'warning', indexError: outcome === 'warning' ? 'index failed' : null };
    },
    loadStoredArticles: async () => { if (outcome === 'refresh') throw new Error('refresh failed'); },
  };
  const start = controllerSource.indexOf('  const confirmCopy = useCallback('), end = controllerSource.indexOf('  const trashQueue = useCallback(', start);
  vm.runInNewContext(ts.transpileModule(controllerSource.slice(start, end) + '\nglobalThis.copy = confirmCopy;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { toasts, statuses, async run() { context.copy(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('article-list Fork reports success, partial index/refresh results and failure without requiring the editor page', async () => {
  for (const outcome of ['success', 'warning', 'refresh', 'error']) {
    const f = listForkOperation(outcome); await f.run();
    assert.equal(f.toasts.length, 1);
    assert.equal(f.toasts[0].key, 'article-fork');
    assert.equal(f.toasts[0].tone, outcome === 'refresh' ? 'warning' : outcome);
    assert.equal(f.statuses.at(-1).notify, false, 'the status copy does not emit a second Toast');
    assert.equal(f.toasts[0].details.label, f.statuses.at(-1).label);
    for (const locale of ['zh-CN', 'en-US']) {
      const t = createUII18n(locale).getFixedT(locale), label = productMessages.formatProductMessage(f.toasts[0].summary, t);
      assert.ok(label.length > 0 && label.length < 30);
      assert.doesNotMatch(label, /{{|messages:/);
    }
  }
  const stale = listForkOperation('stale'); await stale.run(); assert.equal(stale.toasts.length, 0);
});
