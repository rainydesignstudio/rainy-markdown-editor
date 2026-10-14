import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/hooks/usePreviewPreferences.ts', import.meta.url), 'utf8');
function environment(saved, denied = false) {
  const values = new Map(saved ? [['rainy-preview-preferences-v1', saved]] : []), events = new Map(), updates = [];
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, window: { localStorage: { getItem: key => { if (denied) throw new Error('denied'); return values.get(key) ?? null; }, setItem: (key, value) => { if (denied) throw new Error('denied'); values.set(key, value); } }, addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) }, require: () => ({ useSyncExternalStore(subscribe, get) { const cleanup = subscribe(() => updates.push(get())); return get(); } }) });
  return { ...module.exports, values, events, updates };
}
test('preview preferences default safely, retain session choices when storage fails and share changes without library writes', () => {
  const f = environment();
  assert.deepEqual({ ...f.getPreviewPreferences() }, { scrollSync: false, saveReport: true, saveOnly: false });
  assert.equal(f.values.size, 0);
  f.usePreviewPreferences(); f.setPreviewPreference('scrollSync', true);
  assert.equal(f.updates.at(-1).scrollSync, true);
  assert.deepEqual([...f.values.keys()], ['rainy-preview-preferences-v1']);
  const denied = environment(null, true); denied.setPreviewPreference('scrollSync', true); denied.usePreviewPreferences();
  assert.equal(denied.getPreviewPreferences().scrollSync, true);
  const invalid = environment('{"scrollSync":"true","saveReport":0,"saveOnly":true,"extra":true}');
  assert.deepEqual({ ...invalid.getPreviewPreferences() }, { scrollSync: false, saveReport: true, saveOnly: true });
  f.values.set('rainy-preview-preferences-v1', '{"scrollSync":false}'); f.events.get('storage')({ key: 'rainy-preview-preferences-v1' });
  assert.equal(f.getPreviewPreferences().scrollSync, false);
});
