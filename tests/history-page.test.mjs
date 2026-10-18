import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import * as history from '../src/lib/articleHistory.ts';
import * as frontMatter from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

const source = await readFile(new URL('../src/components/history/ArticleHistoryDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function page() {
  let cursor = 0, tree, closed = 0, dark = false;
  const cells = [], effects = [], listeners = new Map(), deleted = [], forks = [], retention = [];
  const source = frontMatter.createArticleSource('Current draft', BASIC_THEME.id);
  const snapshot = { id: 'snapshot-fixture', title: 'Selected history', createdAt: '2026-10-18T00:00:00.000Z', kind: 'manual', retained: true, source, parsed: frontMatter.parseArticle(source), theme: BASIC_THEME, themeMatches: true };
  const props = { articleTitle: 'Current draft', currentSource: source, currentTheme: BASIC_THEME, currentThemeValid: true, currentDirty: false, month: '2026-10', folder: 'test-only', root: {}, mediaArticle: { id: 'test-only', month: '2026-10', folder: 'test-only' }, snapshots: [snapshot], issues: [], selectedId: snapshot.id, busy: false, canRestore: true, canDelete: true, canSaveAs: true, refreshPending: false, notice: { label: '', tone: 'neutral' }, months: ['2026-09'], onClose: () => closed++, getReturnFocus: () => null, onSelect() {}, onManualSnapshot() {}, onRestore() {}, onDelete: async value => { deleted.push(value); return true; }, onSaveAs: (...values) => forks.push(values), onToggleRetention: (...values) => retention.push(values), onRefreshHistory() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, HTMLElement: class {}, document: { activeElement: null }, window: { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener: (key, cb) => listeners.set(key, cb), removeEventListener() {} }, require: withUILocaleImports(id => {
    if (id.endsWith('/articleHistory')) return history;
    if (id.endsWith('/frontMatter')) return frontMatter;
    if (id.endsWith('/HistorySnapshotPreview')) return { HistorySnapshotPreview: 'preview' };
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
  return { props, snapshot, deleted, forks, retention, render, nodes, find, get closed() { return closed; }, button: label => find(n => n.type === 'button' && text(n) === label), action: label => find(n => n.type === 'icon-button' && n.props.tooltip === label), escape() { listeners.get('keydown')?.({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); } };
}

test('history actions share the toolbar, count is in the list footer, and metadata/Fork do not occupy preview height', () => {
  const p = page(), toolbar = p.find(n => n.type === 'button-bar' && n.props.label === '历史版本操作');
  const actions = walk(toolbar).filter(n => n.type === 'button');
  assert.deepEqual(actions.map(text), ['删除此版本', '保存重要版本', '恢复此版本']);
  assert.ok(actions[1].props.className.includes('button-quiet'));
  assert.equal(actions[1].props.className, actions[2].props.className);
  assert.ok(actions[1].props.title.includes('当前编辑稿'));
  assert.ok(actions.every(n => walk(n).some(child => child.type === 'action-icon')));
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

test('deletion needs explicit confirmation; cancellation is inert and failure keeps the selected target visible', async () => {
  const p = page();
  p.button('删除此版本').props.onClick(); p.render();
  assert.equal(p.deleted.length, 0);
  const dialog = () => p.find(n => n.type === 'dialog' && n.props.titleId === 'history-delete-title');
  assert.match(text(dialog()), /Selected history.*无法撤销.*自动清理不会删除/s);
  dialog().props.onClose(); p.render(); assert.equal(p.deleted.length, 0);
  p.button('删除此版本').props.onClick(); p.render();
  p.props.onDelete = async () => false;
  p.render();
  await p.find(n => n.type === 'dialog-button' && text(n) === '确认删除此版本').props.onClick(); p.render(); assert.ok(dialog());
  p.props.onDelete = async value => { p.deleted.push(value); return true; }; p.render();
  await p.find(n => n.type === 'dialog-button' && text(n) === '确认删除此版本').props.onClick(); p.render();
  assert.equal(p.deleted[0], p.snapshot);
  assert.equal(p.nodes().some(n => n.type === 'dialog'), false);
});

test('Fork has its own form dialog and targets the selected history version', () => {
  const p = page(); p.action('从历史版本 Fork').props.onClick(); p.render();
  const form = p.find(n => n.type === 'form');
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(p.forks.length, 1); assert.equal(p.forks[0][0], p.snapshot);
  assert.equal(p.forks[0][2], '2026-10');
  p.props.busy = true; p.render();
  p.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(p.forks.length, 1);
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


test('history header reuses the editor context with only information/Fork actions and keeps status feedback', () => {
  const p = page(); p.props.notice = { label: '历史版本已载入。', tone: 'neutral' }; p.render();
  const header = p.find(n => n.type === 'header');
  assert.match(text(header), /返回编辑器.*Current draft.*历史版本/s);
  assert.deepEqual(walk(header).filter(n => n.type === 'icon-button').map(n => n.props.tooltip), ['文章信息与主题', '从历史版本 Fork']);
  assert.equal(text(header).includes('test-only'), false);
  const status = () => p.find(n => n.type === 'p' && n.props.role === 'status');
  assert.match(text(status()), /2026-10\/test-only.*成对保存.*历史版本已载入/);
  p.props.notice = { label: '写入失败', tone: 'error' }; p.render();
  assert.match(text(status()), /写入失败/); assert.equal(status().props['data-tone'], 'error');
});


test('render mode reveals the shared dark-mode switch and both snapshots use its mode', () => {
  const p = page(); const secondary = () => p.find(n => n.type === 'preview-mode-switch');
  const holder = () => p.find(n => n.props.children?.type === 'preview-mode-switch');
  assert.equal(holder().props.inert, true);
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  assert.equal(holder().props.inert, false);
  secondary().props.onToggle(); p.render();
  assert.deepEqual(p.nodes().filter(n => n.type === 'preview').map(n => n.props.dark), [true, true]);
  p.find(n => n.type === 'mode-switch').props.onToggle(); p.render();
  assert.equal(holder().props.inert, true);
});
