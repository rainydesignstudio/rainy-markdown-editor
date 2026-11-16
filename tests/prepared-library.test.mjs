import './prepared-library-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createNamedDataDirectory, readStoredArticleById, getStoredArticleDirectory } from '../src/lib/fileSystem.ts';
import { getFreshGuide, preloadPreparedLibraries, prepareBuiltinLibrary, installPreparedLibrary } from '../src/lib/preparedLibrary.ts';
import { readRenderRecord, renderRecordMatches } from '../src/lib/article-format/renderRecords.ts';
import { loadArticleSettings } from '../src/lib/articleSettings.ts';
import { loadEditorWorkspace } from '../src/lib/editorWorkspace.ts';
import { initializeThemeDefaults } from '../src/lib/themeDefaults.ts';
import { GUIDE_PROFILES } from '../src/lib/entryGuide.ts';
import { tree, snapshot } from './knowledge/fs-fixture.mjs';

test('every language/profile copies a complete saved example with the selected settings and immutable render dependencies', async () => {
  await preloadPreparedLibraries();
  for (const locale of ['zh-CN', 'en-US']) for (const profile of GUIDE_PROFILES) {
    const plan = { profile: profile.id, name: 'Test', writer: 'agent', autoSave: false, autoSnapshot: false, themeId: 'rose', colorMode: 'dark' };
    const root = await createNamedDataDirectory(tree('parent'), 'Test', profile.preset, locale, { guide: plan });
    const ready = getFreshGuide(root); assert.ok(ready);
    assert.notEqual(ready.month, '2000-01');
    const article = await readStoredArticleById(root, ready.month, ready.folder);
    assert.ok(article.themeValid); assert.ok(article.renderRecord); assert.ok(!article.renderRecordStale);
    assert.equal(await renderRecordMatches(article.renderRecord, article.source, article.theme), true);
    assert.doesNotMatch(article.source, /2000-01-01T00:00:00.000Z/);
    const settings = await loadArticleSettings(root), workspace = await loadEditorWorkspace(root);
    assert.equal(settings.issue, null); assert.equal(settings.settings.autoSave.enabled, false); assert.equal(settings.settings.autoSnapshot.enabled, false);
    assert.equal(workspace.issue, null); assert.equal(workspace.workspace.appearance.themeId, 'rose'); assert.equal(workspace.workspace.appearance.colorMode, 'dark');
    const saved = await getStoredArticleDirectory(root, ready.month, ready.folder); assert.ok(await readRenderRecord(saved));
    const before = snapshot(root); await initializeThemeDefaults(root, locale); assert.equal(snapshot(root), before, 'opening the new library must not initialize it again');
    await assert.rejects(root.getDirectoryHandle('fonts'), { name: 'NotFoundError' }, 'Prepared components do not bundle complete fonts');
  }
});

test('warm prepared components are reused, and a second creation does not refetch them', async () => {
  const real = globalThis.fetch; let requests = 0;
  globalThis.fetch = (...args) => { requests++; return real(...args); };
  try {
    await preloadPreparedLibraries({ locale: 'en-US', preset: 'empty' });
    await prepareBuiltinLibrary({ locale: 'zh-CN', preset: 'wechat-article' }); const first = requests;
    await createNamedDataDirectory(tree('parent'), 'One', 'empty', 'en-US');
    await createNamedDataDirectory(tree('parent'), 'Two', 'wechat-article', 'zh-CN');
    assert.equal(requests, first);
  } finally { globalThis.fetch = real; }
});

test('cancelled creation cannot start directory writes after the selected target changes', async () => {
  const root = tree('cancelled'), before = snapshot(root);
  await assert.rejects(installPreparedLibrary(root, { locale: 'en-US', preset: 'empty' }, () => false), { name: 'AbortError' });
  assert.equal(snapshot(root), before);
});

test('a corrupted prepared object is rejected before any library file is written', async () => {
  const isolated = await import('../src/lib/preparedLibrary.ts?corrupt'), real = globalThis.fetch;
  const root = tree('bad'), before = snapshot(root);
  globalThis.fetch = async () => new Response(new Uint8Array([0]));
  try { await assert.rejects(isolated.installPreparedLibrary(root, { locale: 'en-US', preset: 'empty' }), /size mismatch|verification failed/); }
  finally { globalThis.fetch = real; }
  assert.equal(snapshot(root), before);
});

test('build output contains only referenced non-font objects and excludes private library paths', async () => {
  const manifest = JSON.parse(await readFile(new URL('../resources/prepared-library.generated.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(manifest.components).length, 16);
  assert.equal(manifest.components.fonts, undefined);
  assert.ok(Object.values(manifest.components).every(component => Object.keys(component.files).every(file => !file.startsWith('fonts/'))));
  assert.deepEqual((await readdir(new URL('../public/prepared-library/objects/', import.meta.url))).sort(), Object.keys(manifest.blobs).sort());
  assert.doesNotMatch(JSON.stringify(manifest), /data\/wechat|rainy-design-official|\/Users\//);
});

test('the completed seed receipt waits for the last theme file, while unrelated copying remains concurrent', { timeout: 3000 }, async () => {
  const root = tree('receipt'), themes = await root.getDirectoryHandle('themes', { create: true });
  const folder = await themes.getDirectoryHandle('article-themes', { create: true }), basic = await folder.getFileHandle('basic.json', { create: true });
  const original = basic.createWritable; let started, release;
  const reached = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  basic.createWritable = async () => { const stream = await original(); return { ...stream, async close() { started(); await gate; await stream.close(); } }; };
  const pending = installPreparedLibrary(root, { locale: 'en-US', preset: 'empty' });
  await reached; assert.equal(themes.children.has('default-themes.loaded'), false);
  release(); await pending; assert.equal(JSON.parse(await (await (await themes.getFileHandle('default-themes.loaded')).getFile()).text()).initialized, true);
});

test('a failed theme write cannot leave a successful seed receipt', async () => {
  const root = tree('receipt-failure'), themes = await root.getDirectoryHandle('themes', { create: true });
  const folder = await themes.getDirectoryHandle('article-themes', { create: true }), basic = await folder.getFileHandle('basic.json', { create: true });
  basic.createWritable = async () => ({ async write() { throw Error('Injected seed failure'); }, async abort() {} });
  await assert.rejects(installPreparedLibrary(root, { locale: 'en-US', preset: 'empty' }), /Injected seed failure/);
  assert.equal(themes.children.has('default-themes.loaded'), false);
});
