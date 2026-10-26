import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const code = ts.transpileModule(await readFile(new URL('../src/hooks/useSidebarPreferences.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function browser(saved, denied = false) {
  const values = new Map(saved ? [['rainy-sidebar-preferences-v1', saved]] : []), listeners = new Map(), effects = [];
  const cells = []; let cursor = 0, writes = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, CustomEvent: class { constructor(type) { this.type = type; } }, window: {
    localStorage: { getItem(key) { if (denied) throw new Error('denied'); return values.get(key) ?? null; }, setItem(key, value) { if (denied) throw new Error('denied'); writes++; values.set(key, value); } },
    addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); }, dispatchEvent(event) { listeners.get(event.type)?.(event); },
  }, require: () => ({ useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], next => cells[index] = next]; }, useLayoutEffect(effect) { if (!effects.length) effects.push(effect); } }) });
  const render = () => { cursor = 0; return module.exports.useSidebarPreferences(); };
  render(); effects[0]();
  return { render, values, listeners, writes: () => writes };
}
test('each sidebar keeps its own browser preference across refresh without writing on mount', () => {
  const f = browser('{"mainCollapsed":true,"articleCollapsed":false}');
  assert.deepEqual({ ...f.render().preferences }, { mainCollapsed: true, articleCollapsed: false });
  assert.equal(f.writes(), 0);
  f.render().toggle('articleCollapsed');
  assert.deepEqual({ ...f.render().preferences }, { mainCollapsed: true, articleCollapsed: true });
  const refreshed = browser(f.values.get('rainy-sidebar-preferences-v1'));
  assert.deepEqual({ ...refreshed.render().preferences }, { mainCollapsed: true, articleCollapsed: true });
  refreshed.render().toggle('mainCollapsed');
  assert.deepEqual({ ...refreshed.render().preferences }, { mainCollapsed: false, articleCollapsed: true });
  assert.equal(refreshed.writes(), 1);
});
test('invalid storage falls back per field and denied storage retains only this session’s choices', () => {
  const invalid = browser('{"mainCollapsed":"true","articleCollapsed":true,"mobileOpen":true}');
  assert.deepEqual({ ...invalid.render().preferences }, { mainCollapsed: false, articleCollapsed: true });
  const broken = browser('invalid JSON');
  assert.deepEqual({ ...broken.render().preferences }, { mainCollapsed: false, articleCollapsed: false });
  const denied = browser(null, true); denied.render().toggle('mainCollapsed');
  assert.deepEqual({ ...denied.render().preferences }, { mainCollapsed: true, articleCollapsed: false });
  assert.equal(denied.writes(), 0);
  assert.deepEqual({ ...browser(null, true).render().preferences }, { mainCollapsed: false, articleCollapsed: false });
});
test('browser storage changes synchronize desktop preferences without persisting a mobile drawer state', () => {
  const f = browser(); f.render().toggle('mainCollapsed');
  f.values.set('rainy-sidebar-preferences-v1', '{"articleCollapsed":true}');
  f.listeners.get('storage')({ key: 'rainy-sidebar-preferences-v1' });
  assert.deepEqual({ ...f.render().preferences }, { mainCollapsed: false, articleCollapsed: true });
  assert.deepEqual(Object.keys(JSON.parse(f.values.get('rainy-sidebar-preferences-v1'))), ['articleCollapsed']);
});
