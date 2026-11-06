import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { loadArticleSettings, saveArticleSettings } from '../src/lib/articleSettings.ts';
import { GUIDE_PROFILES, guideProfile, guideTemplateSource, guideSampleSource } from '../src/lib/entryGuide.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { loadArticleTemplates, saveArticleTemplate, saveTemplateCategory } from '../src/lib/contentLibraries.ts';
import { listStoredArticles, listArticleSummaries, readStoredArticleById, rebuildArticleIndexes, saveStoredArticle } from '../src/lib/fileSystem.ts';

function diskHandle(directory, failures = { suffix: '', remaining: 0 }) {
  return { name: path.basename(directory), kind: 'directory', async queryPermission() { return 'granted'; },
    async getDirectoryHandle(name, options = {}) {
      const target = path.join(directory, name);
      if (options.create) await mkdir(target, { recursive: true });
      try { await access(target); } catch { throw new DOMException('missing', 'NotFoundError'); }
      return diskHandle(target, failures);
    },
    async getFileHandle(name, options = {}) {
      const file = path.join(directory, name);
      try { await access(file); } catch { if (!options.create) throw new DOMException('missing', 'NotFoundError'); await writeFile(file, ''); }
      return { kind: 'file', name, async getFile() { return new File([await readFile(file)], name); }, async createWritable() {
        let pending = '';
        return { async write(value) { pending = String(value); }, async close() { if (failures.remaining && file.includes('/articles/') && file.endsWith(failures.suffix)) { failures.remaining--; throw new Error('Injected write failure'); } await writeFile(file, pending); }, async abort() {} };
      } };
    }, async removeEntry(name, options = {}) { await rm(path.join(directory, name), { recursive: options.recursive ?? false }); },
    async *entries() { for (const entry of await readdir(directory, { withFileTypes: true })) yield [entry.name, entry.isDirectory() ? diskHandle(path.join(directory, entry.name), failures) : await this.getFileHandle(entry.name)]; },
  };
}

async function fixture(t, language = 'zh-CN', overrides = {}) {
  const parent = new URL('../data/test/', import.meta.url); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent.pathname, 'guide-preparation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const failures = { suffix: '', remaining: 0 };
  const root = diskHandle(directory, failures), guideSetup = { current: null }, calls = { create: 0, selected: [], templates: [], rendered: [] };
  const defaults = (await loadArticleSettings(root)).settings;
  await saveArticleSettings(root, { ...defaults, autoSave: { enabled: false, intervalSeconds: 17 }, autoSnapshot: { enabled: true, intervalMinutes: 91, maxCount: 9 }, trash: { enabled: false } });
  const translations = JSON.parse(await readFile(new URL(`../resources/locale/${language}/onboarding.json`, import.meta.url), 'utf8'));
  const source = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('  const createFromGuide ='), source.indexOf('  const openFromGuide ='));
  const controller = {
    directoryRef: { current: root },
    createDataDirectory: async (_name, _preset, _progress, keepRoute) => { calls.create++; assert.equal(keepRoute, true); return { status: 'created' }; },
    setTemplates(items) { calls.templates = items; }, setTemplateCategories() {}, setArticleSettings() {},
    selectEntryArticle: async article => { calls.selected.push(article); return true; },
    refreshArticles: async () => listArticleSummaries(root), saveEditorAppearance: async () => true,
    ...overrides,
  };
  const create = vm.runInNewContext(ts.transpileModule(callback + '\ncreateFromGuide;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    controller, guideSetup, locale: { locale: language }, guideProfile, guideTemplateSource, guideSampleSource, loadArticleSettings, saveArticleSettings,
    loadThemeLibrary: async () => ({ themes: [BASIC_THEME] }), saveTemplateCategory, saveArticleTemplate, loadArticleTemplates,
    saveStoredArticle, readStoredArticleById, rebuildArticleIndexes,
    renderGuideSample: async (_root, article) => { assert.equal(article.themeValid, true); assert.equal(article.parse.canCopy, true); calls.rendered.push(article.id); return {}; }, getStoredArticleDirectory: async () => ({}), persistRenderRecord: async () => {},
    t: key => key.split('.').reduce((value, part) => value?.[part], translations) ?? key,
    formatProductMessage: value => String(value),
  });
  const plan = { profile: 'technical', name: 'Preference test', writer: 'agent', autoSave: false, autoSnapshot: false, themeId: 'rainy-slate', colorMode: 'dark' };
  return { create, root, directory, plan, calls, guideSetup, controller, translations, failures };
}

test('all twelve localized starters create one template and one saved example, select the real example and preserve other settings', async t => {
  for (const language of ['zh-CN', 'en-US']) for (const profile of GUIDE_PROFILES) {
    const f = await fixture(t, language);
    const plan = { ...f.plan, profile: profile.id, autoSave: profile.purpose === 'development' || profile.id === 'product', autoSnapshot: profile.purpose === 'development' || profile.id === 'brief' };
    const result = await f.create(plan, () => {});
    assert.equal(result.status, 'ready', result.message);
    const articles = await listStoredArticles(f.root), templates = await loadArticleTemplates(f.root);
    assert.equal(articles.length, 1); assert.equal(templates.templates.length, 1);
    const article = articles[0];
    assert.equal(article.parse.canCopy, true); assert.equal(article.themeValid, true);
    assert.equal(article.parse.metadata.title, f.translations.starterExamples[profile.id].title);
    assert.equal(article.parse.body.trim(), f.translations.starterExamples[profile.id].body);
    assert.equal(result.resources.samplePath, article.filePath);
    assert.equal(result.resources.templatePath, `templates/entry-guide/entry-${profile.id}.md`);
    assert.equal(f.calls.selected[0].id, article.id);
    const settings = (await loadArticleSettings(diskHandle(f.directory))).settings;
    assert.deepEqual(settings.autoSave, { enabled: plan.autoSave, intervalSeconds: 17 });
    assert.deepEqual(settings.autoSnapshot, { enabled: plan.autoSnapshot, intervalMinutes: 91, maxCount: 9 });
    assert.deepEqual(settings.trash, { enabled: false });
    assert.equal(result.resources.autoSaveIntervalSeconds, 17); assert.equal(result.resources.autoSnapshotMaxCount, 9);
    assert.equal((await listArticleSummaries(f.root)).articles.length, 1);
  }
});

test('a late failure resumes the same library and saved example without creating a duplicate', async t => {
  let attempt = 0;
  const f = await fixture(t, 'zh-CN', { saveEditorAppearance: async () => ++attempt > 1 });
  const first = await f.create(f.plan, () => {});
  assert.equal(first.status, 'error'); assert.equal(first.resumable, true);
  const before = (await listStoredArticles(f.root))[0];
  const templateBefore = (await loadArticleTemplates(f.root)).templates[0].source;
  const resumed = await f.create(f.plan, () => {});
  assert.equal(resumed.status, 'ready', resumed.message); assert.equal(f.calls.create, 1);
  const articles = await listStoredArticles(f.root);
  assert.equal(articles.length, 1); assert.equal(articles[0].id, before.id); assert.equal(articles[0].source, before.source);
  assert.equal((await loadArticleTemplates(f.root)).templates[0].source, templateBefore);
});

test('resuming refuses a changed plan, switched library or externally edited example', async t => {
  const f = await fixture(t, 'zh-CN', { saveEditorAppearance: async () => false });
  await f.create(f.plan, () => {});
  assert.equal((await f.create({ ...f.plan, profile: 'website' }, () => {})).status, 'error');
  const sample = f.guideSetup.current.sample;
  const target = path.join(f.directory, sample.filePath);
  const external = sample.source + '\nExternal edit retained.\n';
  await writeFile(target, external);
  assert.equal((await f.create(f.plan, () => {})).status, 'error');
  assert.equal(await readFile(target, 'utf8'), external);
  f.controller.directoryRef.current = null;
  assert.equal((await f.create(f.plan, () => {})).status, 'error');
  assert.equal(f.calls.create, 1);
});

test('theme and index write failures resume the saved source with valid rendering input', async t => {
  for (const [suffix, remaining] of [['/theme.json', 1], ['/index.json', 2]]) {
    const f = await fixture(t); Object.assign(f.failures, { suffix, remaining });
    const first = await f.create(f.plan, () => {});
    assert.equal(first.status, 'error'); assert.equal(first.resumable, true);
    const saved = f.guideSetup.current.sample;
    assert.ok(saved?.source); assert.equal(f.calls.rendered.length, 0);
    const resumed = await f.create(f.plan, () => {});
    assert.equal(resumed.status, 'ready', resumed.message);
    const articles = await listStoredArticles(f.root);
    assert.equal(articles.length, 1); assert.equal(articles[0].id, saved.id); assert.equal(articles[0].source, saved.source);
    assert.equal(articles[0].themeValid, true); assert.equal((await listArticleSummaries(f.root)).articles.length, 1);
    assert.deepEqual(f.calls.rendered, [saved.id]); assert.equal(f.calls.create, 1);
  }
});


test('production Guide appearance adoption persists to an existing library and applies no-library choices in memory', async () => {
  const { getBuiltinEditorThemes } = await import('../src/lib/editorThemes.ts');
  const { ensureEditorThemeSnapshot, loadEditorThemeLibrary } = await import('../src/lib/editorThemeLibrary.ts');
  const { tree } = await import('./knowledge/fs-fixture.mjs');
  const { setEditorAppearance, createDefaultEditorWorkspace } = await import('../src/lib/editorWorkspace.ts');
  const source = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('  const adoptGuideAppearance ='), source.indexOf('  const createEditorTheme =', source.indexOf('  const adoptGuideAppearance =')));
  const stored = [], local = [], libraries = [];
  const context = { useCallback: fn => fn, directoryRef: { current: tree('guide-adoption') }, directorySelectionRef: { current: 1 }, editorThemeOperationRef: { current: false }, ensureEditorThemeSnapshot, loadEditorThemeLibrary, setEditorThemeIssues() {}, editorThemes: getBuiltinEditorThemes('zh-CN'), seedLocale: 'zh-CN', editorWorkspaceIssue: null,
    getBuiltinEditorThemes, setEditorAppearance, editorWorkspaceRef: { current: createDefaultEditorWorkspace() },
    persistEditorWorkspace: async (update, notice) => { stored.push({ value: update(context.editorWorkspaceRef.current), notice }); return true; },
    setEditorWorkspace: value => local.push(value), setEditorThemes: themes => libraries.push(themes),
  };
  const adopt = vm.runInNewContext(ts.transpileModule(callback + '\nadoptGuideAppearance;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const appearance = { themeId: 'linen', colorMode: 'dark', custom: null };
  assert.equal(await adopt(appearance), true); assert.equal(stored.length, 1); assert.equal(stored[0].notice, null);
  assert.deepEqual(JSON.parse(JSON.stringify(stored[0].value.appearance)), appearance);
  context.directoryRef.current = null; assert.equal(await adopt(appearance), true);
  assert.equal(stored.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(local[0].appearance)), appearance); assert.equal(libraries.at(-1).length, 11);
  assert.equal(await adopt({ ...appearance, themeId: 'missing-theme' }), false);
});

test('production Guide reopening passes both existing guards without erasing completion or reconnecting a library', async () => {
  const source = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('  const reopenEntryGuide ='), source.indexOf('  const createFromGuide ='));
  let continueNavigation, continueDraft; const visibility = [], setup = { current: { keepUntilConfirmed: true } };
  const reopen = vm.runInNewContext(ts.transpileModule(callback + '\nreopenEntryGuide;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    controller: { runWithNavigationGuard: next => { continueNavigation = next; }, runAfterDraftDecision: action => { continueDraft = action.run; } },
    t: key => key, guideAudio: { quiet() {} }, guideSetup: setup, previewEditorAppearance() {}, setGuideVisible: value => visibility.push(value),
  });
  reopen(); assert.deepEqual(visibility, []); assert.ok(setup.current);
  continueNavigation(); assert.deepEqual(visibility, []); assert.ok(setup.current);
  continueDraft(); assert.deepEqual(visibility, [true]); assert.equal(setup.current, null);
});
