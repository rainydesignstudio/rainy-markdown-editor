import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { getBuiltinEditorThemes, resolveEditorThemeColors, parseEditorThemeJson } from '../src/lib/editorThemes.ts';
import { ensureEditorThemeSnapshot, loadEditorThemeLibrary } from '../src/lib/editorThemeLibrary.ts';
import { createDefaultEditorWorkspace, setEditorAppearance } from '../src/lib/editorWorkspace.ts';
import { tree, snapshot } from './knowledge/fs-fixture.mjs';

const source = () => structuredClone(getBuiltinEditorThemes('zh-CN').find(theme => theme.id === 'linen'));
const marker = { 'themes/editor-themes/legacy-migration.done': '{"version":1,"legacyFiles":0}' };
const key = id => `themes/editor-themes/${id}.json`;
const changed = () => {
  const theme = source();
  theme.palette[theme.colors.light.canvas] = '#ff0000';
  return theme;
};

test('a missing selected theme is added without touching other library files', async () => {
  const selected = source(), root = tree('old-library', { 'article.md': 'keep', 'settings.json': 'keep settings' });
  const result = await ensureEditorThemeSnapshot(root, selected);
  assert.equal(result.id, selected.id);
  const themes = await loadEditorThemeLibrary(root);
  assert.deepEqual(themes.themes, [selected]);
  assert.equal(root.children.get('article.md').value, 'keep');
  assert.equal(root.children.get('settings.json').value, 'keep settings');
});

test('equivalent palette spellings and localized names reuse the original bytes', async () => {
  const selected = source(), existing = source();
  existing.name = 'My Linen';
  for (const key of Object.keys(existing.palette)) {
    const hex = existing.palette[key].toUpperCase();
    existing.palette[key] = /^#(.)\1(.)\2(.)\3$/.test(hex) ? '#' + hex[1] + hex[3] + hex[5] : hex;
  }
  delete existing.colors.light['search-hit']; delete existing.colors.dark['search-hit'];
  const root = tree('same-content', { ...marker, [key(existing.id)]: JSON.stringify(existing) });
  const before = snapshot(root);
  const result = await ensureEditorThemeSnapshot(root, selected);
  assert.equal(result.id, selected.id);
  assert.equal(result.name, 'My Linen');
  assert.equal(snapshot(root), before);
});

test('a same-ID modification is retained and one independent matching copy is reused', async () => {
  const selected = source(), original = changed(), raw = JSON.stringify(original);
  const root = tree('customized', { [key(original.id)]: raw });
  const first = await ensureEditorThemeSnapshot(root, selected);
  assert.notEqual(first.id, original.id);
  assert.match(first.id, /^entry-linen-/);
  for (const mode of ['light', 'dark']) assert.deepEqual(resolveEditorThemeColors(first, mode), resolveEditorThemeColors(selected, mode));
  const dir = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  assert.equal(dir.children.get(`${original.id}.json`).value, raw);
  const after = snapshot(root);
  const second = await ensureEditorThemeSnapshot(root, selected);
  assert.equal(second.id, first.id);
  assert.equal(snapshot(root), after);
  const editedCopy = structuredClone(first);
  editedCopy.fonts.heading = editedCopy.fonts.mono;
  dir.children.get(`${first.id}.json`).value = JSON.stringify(editedCopy);
  const third = await ensureEditorThemeSnapshot(root, selected);
  assert.notEqual(third.id, first.id);
  assert.equal(dir.children.get(`${first.id}.json`).value, JSON.stringify(editedCopy));
  assert.equal(dir.children.get(`${original.id}.json`).value, raw);
});

test('a version change or broken same-ID file is never silently replaced', async () => {
  for (const raw of ['{broken', JSON.stringify({ ...source(), version: '0.1.0' })]) {
    const root = tree('old-or-broken', { [key('linen')]: raw });
    const result = await ensureEditorThemeSnapshot(root, source());
    assert.notEqual(result.id, 'linen');
    const dir = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
    assert.equal(dir.children.get('linen.json').value, raw);
  }
});

test('selection snapshots do not drift while directory IO is pending', async () => {
  const selected = source(), expected = source(), root = tree('snapshot');
  const get = root.getDirectoryHandle.bind(root); let release;
  const wait = new Promise(done => { release = done; });
  root.getDirectoryHandle = async (...args) => { await wait; return get(...args); };
  const pending = ensureEditorThemeSnapshot(root, selected);
  selected.fonts.ui = 'Changed, sans-serif';
  release();
  const saved = await pending;
  assert.deepEqual(saved.fonts, expected.fonts);
});

test('expired selection and failed writes retain the original theme', async () => {
  const original = changed(), raw = JSON.stringify(original), root = tree('failure', { ...marker, [key('linen')]: raw });
  const before = snapshot(root);
  let current = true;
  const dir = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  const file = dir.children.get('linen.json'), get = file.getFile;
  file.getFile = async () => { current = false; return get(); };
  await assert.rejects(() => ensureEditorThemeSnapshot(root, source(), () => current), { name: 'AbortError' });
  assert.equal(snapshot(root), before); assert.equal(file.value, raw);
  file.getFile = get; dir.failWrite = true;
  await assert.rejects(() => ensureEditorThemeSnapshot(root, source()));
  assert.equal(snapshot(root), before); assert.equal(file.value, raw);
});

test('copy IDs stay valid for maximum-length source IDs', async () => {
  const selected = { ...source(), id: 'a'.repeat(48) }, original = { ...changed(), id: selected.id };
  const root = tree('long-id', { [key(selected.id)]: JSON.stringify(original) });
  const saved = await ensureEditorThemeSnapshot(root, selected);
  assert.ok(saved.id.length <= 48);
  assert.equal(parseEditorThemeJson(JSON.stringify(saved)).id, saved.id);
});

async function adoption(root) {
  const text = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = text.indexOf('  const adoptGuideAppearance =');
  const callback = text.slice(start, text.indexOf('  const createEditorTheme =', start));
  const writes = [];
  const state = {
    useCallback: fn => fn, directoryRef: { current: root }, directorySelectionRef: { current: 1 },
    editorThemeOperationRef: { current: false }, editorWorkspaceIssue: null, seedLocale: 'zh-CN',
    getBuiltinEditorThemes, ensureEditorThemeSnapshot, loadEditorThemeLibrary, setEditorAppearance,
    editorWorkspaceRef: { current: createDefaultEditorWorkspace() }, failSave: false,
    setEditorThemes() {}, setEditorThemeIssues() {}, setEditorWorkspace() {},
    persistEditorWorkspace: async fn => {
      writes.push(true);
      if (state.failSave) return false;
      state.editorWorkspaceRef.current = fn(state.editorWorkspaceRef.current);
      return true;
    },
  };
  const run = vm.runInNewContext(ts.transpileModule(callback + '\nadoptGuideAppearance;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
  return { state, writes, run };
}

test('production adoption makes preview content available in both missing and customized old libraries', async () => {
  for (const original of [null, changed()]) {
    const root = tree('adopt', original ? { [key('linen')]: JSON.stringify(original) } : {});
    const { state, run } = await adoption(root), selected = source();
    assert.equal(await run({ themeId: selected.id, colorMode: 'dark', custom: null }, selected), true);
    const saved = (await loadEditorThemeLibrary(root)).themes.find(theme => theme.id === state.editorWorkspaceRef.current.appearance.themeId);
    for (const mode of ['light', 'dark']) assert.deepEqual(resolveEditorThemeColors(saved, mode), resolveEditorThemeColors(selected, mode));
    assert.equal(state.editorThemeOperationRef.current, false);
  }
});

test('workspace save failure leaves appearance unchanged and retry reuses the imported copy', async () => {
  const root = tree('retry-adopt', { [key('linen')]: JSON.stringify(changed()) });
  const { state, run } = await adoption(root), before = JSON.stringify(state.editorWorkspaceRef.current);
  state.failSave = true;
  assert.equal(await run({ themeId: 'linen', colorMode: 'light', custom: null }, source()), false);
  assert.equal(JSON.stringify(state.editorWorkspaceRef.current), before);
  const imported = snapshot(root);
  state.failSave = false;
  assert.equal(await run({ themeId: 'linen', colorMode: 'light', custom: null }, source()), true);
  assert.equal(snapshot(root), imported);
});

test('a directory change during adoption cannot persist into the new library', async () => {
  const root = tree('old-root', marker), { state, writes, run } = await adoption(root);
  const before = snapshot(root), workspaceBefore = JSON.stringify(state.editorWorkspaceRef.current);
  const get = root.getDirectoryHandle.bind(root); let release;
  const wait = new Promise(done => { release = done; });
  root.getDirectoryHandle = async (...args) => { await wait; return get(...args); };
  const pending = run({ themeId: 'linen', colorMode: 'dark', custom: null }, source());
  const next = tree('new-root');
  state.directoryRef.current = next; state.directorySelectionRef.current++;
  release();
  assert.equal(await pending, false);
  assert.equal(writes.length, 0);
  assert.equal(snapshot(root), before); assert.equal(snapshot(next), '[]');
  assert.equal(JSON.stringify(state.editorWorkspaceRef.current), workspaceBefore);
  assert.equal(state.editorThemeOperationRef.current, false);
});
