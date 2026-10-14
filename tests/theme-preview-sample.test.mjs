import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defaultThemePreviewSample, readThemePreviewSample, activateThemePreviewSample,
  getThemePreviewSample, subscribeThemePreviewSample, initializeThemePreviewSample, MAX_THEME_PREVIEW_BYTES,
} from '../src/lib/themePreviewSample.ts';
import { initializeThemeDefaults } from '../src/lib/themeDefaults.ts';
import { createNamedDataDirectory } from '../src/lib/fileSystem.ts';
import { tree, snapshot, allCounts } from './knowledge/fs-fixture.mjs';

test('both sample seeds retain the existing typography and example image without translated metadata', async () => {
  for (const locale of ['en-US', 'zh-CN']) {
    const source = await readFile(new URL(`../resources/template/fresh-library/${locale}/themes/preview.md`, import.meta.url), 'utf8');
    assert.equal(defaultThemePreviewSample(locale), source);
    assert.match(source, /src="\/images\/article-sample.png"/);
    assert.match(source, /^###### /m);
    assert.match(source, /\[x\]/);
    assert.match(source, /```ts/);
    if (locale === 'en-US') assert.doesNotMatch(source, /[\p{Script=Han}]/u);
  }
  const styles = locale => [...defaultThemePreviewSample(locale).matchAll(/style="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(styles('en-US'), styles('zh-CN'));
  assert.equal(defaultThemePreviewSample('fr-FR'), defaultThemePreviewSample('en-US'));
});

test('new libraries materialize the matching sample, while reopening cannot overwrite it', async () => {
  for (const locale of ['en-US', 'zh-CN', 'fr-FR']) {
    const root = await createNamedDataDirectory(tree('parent'), locale, undefined, locale);
    const sample = await readThemePreviewSample(root);
    assert.equal(sample.origin, 'library');
    assert.equal(sample.markdown, defaultThemePreviewSample(locale));
    const before = snapshot(root);
    await initializeThemeDefaults(root, locale === 'zh-CN' ? 'en-US' : 'zh-CN');
    await initializeThemePreviewSample(root, 'zh-CN');
    assert.equal(snapshot(root), before);
  }
});

test('custom library samples take precedence without reading a seed receipt or writing files', async () => {
  const root = tree('custom', { 'themes/preview.md': '# My own sample\n\nKeep this wording.', 'themes/default-themes.loaded': 'unreadable legacy metadata' });
  const before = snapshot(root);
  const sample = await readThemePreviewSample(root);
  assert.equal(sample.markdown, '# My own sample\n\nKeep this wording.');
  assert.equal(sample.origin, 'library');
  assert.deepEqual(allCounts(root).fileReads, ['preview.md']);
  assert.equal(allCounts(root).writes, 0);
  assert.equal(snapshot(root), before);
});

test('missing samples fall back to the remembered seed, with unsupported and absent locales using English', async () => {
  for (const locale of ['zh-CN', 'en-US', 'fr-FR', null]) {
    const root = tree('old-library', locale ? { 'themes/default-themes.loaded': JSON.stringify({ version: 1, locale }) } : {});
    const before = snapshot(root);
    const sample = await readThemePreviewSample(root);
    assert.equal(sample.markdown, defaultThemePreviewSample(locale));
    assert.equal(sample.origin, 'default');
    assert.equal(sample.locale, locale === 'zh-CN' ? 'zh-CN' : 'en-US');
    assert.equal(snapshot(root), before);
    assert.equal(allCounts(root).writes, 0);
  }
});

test('invalid samples and read failures stay explicit and never turn into a successful default preview', async () => {
  for (const value of ['', ' \n', '# Broken\0sample', 'x'.repeat(MAX_THEME_PREVIEW_BYTES + 1), '<script>alert(1)</script>', '<section>Unclosed']) {
    const root = tree('bad-sample', { 'themes/preview.md': value });
    const before = snapshot(root);
    const sample = await activateThemePreviewSample(root, () => true);
    assert.equal(sample.status, 'error', JSON.stringify(value.slice(0, 25)));
    assert.equal(sample.markdown, null);
    assert.ok(sample.error);
    assert.equal(snapshot(root), before);
  }
  const denied = tree('denied');
  denied.getDirectoryHandle = async () => { throw new DOMException('Access denied', 'NotAllowedError'); };
  assert.equal((await activateThemePreviewSample(denied, () => true)).status, 'error');
  const corruptReceipt = tree('corrupt-receipt', { 'themes/default-themes.loaded': '{' });
  assert.equal((await activateThemePreviewSample(corruptReceipt, () => true)).status, 'error');
});

test('a late result from another library cannot replace the current sample, including identically named roots', async () => {
  const oldRoot = tree('same-name', { 'themes/preview.md': '# Old sample' });
  const nextRoot = tree('same-name', { 'themes/preview.md': '# Current sample' });
  const file = (await oldRoot.getDirectoryHandle('themes')).children.get('preview.md');
  const original = file.getFile.bind(file);
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  file.getFile = async () => { await delayed; return original(); };
  let active = oldRoot;
  const pending = activateThemePreviewSample(oldRoot, () => active === oldRoot);
  active = nextRoot;
  await activateThemePreviewSample(nextRoot, () => active === nextRoot);
  const current = getThemePreviewSample();
  release();
  assert.equal(await pending, null);
  assert.equal(getThemePreviewSample(), current);
  assert.equal(current.markdown, '# Current sample');
});

test('render consumers read the shared snapshot without IO, and an explicit reload replaces it', async () => {
  const root = tree('reload', { 'themes/preview.md': '# Before reload' });
  let notifications = 0;
  const unsubscribe = subscribeThemePreviewSample(() => notifications++);
  await activateThemePreviewSample(root, () => true);
  const current = getThemePreviewSample();
  const reads = allCounts(root).reads;
  for (let i = 0; i < 100; i++) assert.equal(getThemePreviewSample(), current);
  assert.equal(allCounts(root).reads, reads);
  root.seed('themes/preview.md', '# After reload');
  await activateThemePreviewSample(root, () => true);
  assert.equal(getThemePreviewSample().markdown, '# After reload');
  assert.notEqual(getThemePreviewSample().id, current.id);
  assert.equal(allCounts(root).writes, 0);
  assert.equal(notifications, 4);
  unsubscribe();
});

test('legacy initialization leaves missing samples alone; a failed new sample write can retry safely', async () => {
  const old = tree('old', { 'themes/default-themes.loaded': '{"version":1}' });
  const before = snapshot(old);
  await initializeThemeDefaults(old, 'zh-CN');
  assert.equal(snapshot(old), before);
  assert.equal((await readThemePreviewSample(old)).origin, 'default');
  const newRoot = tree('new');
  const themes = await newRoot.getDirectoryHandle('themes', { create: true });
  themes.failWrite = true;
  await assert.rejects(initializeThemePreviewSample(newRoot, 'zh-CN'), /write failed/);
  assert.equal(themes.children.has('preview.md'), false);
  themes.failWrite = false;
  await initializeThemePreviewSample(newRoot, 'zh-CN');
  assert.equal((await readThemePreviewSample(newRoot)).markdown, defaultThemePreviewSample('zh-CN'));
});

test('reopening a partially initialized old library cannot grant permission to write a missing sample', async () => {
  const root = tree('old-partial', {
    'themes/default-themes.loaded': '{"version":1,"locale":"zh-CN","initialized":false}',
    'themes/article-themes/custom.json': '{"private":"keep"}',
  });
  await initializeThemeDefaults(root, 'en-US');
  const themes = await root.getDirectoryHandle('themes');
  assert.equal(themes.children.has('preview.md'), false);
  assert.equal((await readThemePreviewSample(root)).origin, 'default');
  assert.equal((await readThemePreviewSample(root)).markdown, defaultThemePreviewSample('zh-CN'));
  assert.equal((await themes.getDirectoryHandle('article-themes')).children.get('custom.json').value, '{"private":"keep"}');
});
