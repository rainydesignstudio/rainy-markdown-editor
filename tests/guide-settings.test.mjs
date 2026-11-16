import './prepared-library-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { libraryDirectory } from '../scripts/library-directory.mjs';
import { loadArticleSettings, DEFAULT_ARTICLE_SETTINGS } from '../src/lib/articleSettings.ts';
import { GUIDE_PROFILES, guideProfile } from '../src/lib/entryGuide.ts';
import { loadArticleTemplates } from '../src/lib/contentLibraries.ts';
import { listStoredArticles, listArticleSummaries, readStoredArticleById, createNamedDataDirectory } from '../src/lib/fileSystem.ts';
import { getFreshGuide } from '../src/lib/preparedLibrary.ts';

async function fixture(t, language = 'zh-CN', overrides = {}) {
  const parent = new URL('../data/test/', import.meta.url); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent.pathname, 'guide-preparation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const parentHandle = libraryDirectory(directory), guideSetup = { current: null }, calls = { create: 0, reloaded: 0, selected: [], reads: 0 };
  let readFailures = 0;
  const translations = JSON.parse(await readFile(new URL(`../resources/locale/${language}/onboarding.json`, import.meta.url), 'utf8'));
  const source = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('  const createFromGuide ='), source.indexOf('  const openFromGuide ='));
  const controller = {
    directoryRef: { current: null },
    createDataDirectory: async (name, preset, progress, keepRoute, plan) => {
      calls.create++; assert.equal(keepRoute, true); progress?.();
      controller.directoryRef.current = await createNamedDataDirectory(parentHandle, name, preset, language, { guide: plan });
      if (overrides.failInitialLoad && calls.create === 1) return { status: 'error', created: true, root: controller.directoryRef.current, message: 'Injected post-copy load failure' };
      return { status: 'created' };
    },
    waitForEntryFonts: async () => {},
    resumeEntryDirectory: async root => {
      if (root !== controller.directoryRef.current) return { status: 'error', message: 'Library changed' };
      calls.reloaded++;
      return { status: 'created' };
    },
    selectEntryArticle: async article => { calls.selected.push(article); return overrides.selectEntryArticle ? overrides.selectEntryArticle(article) : true; },
  };
  const create = vm.runInNewContext(ts.transpileModule(callback + '\ncreateFromGuide;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    controller, guideSetup, prepareGuideWorkspace: async () => {}, locale: { locale: language }, guideProfile, loadArticleSettings, getFreshGuide,
    readStoredArticleById: async (...args) => { calls.reads++; if (readFailures > 0) { readFailures--; throw Error('Injected first sample read failure'); } return readStoredArticleById(...args); },
    t: key => key.split('.').reduce((value, part) => value?.[part], translations) ?? key,
    formatProductMessage: value => String(value),
  });
  const plan = { profile: 'technical', name: 'Preference test', writer: 'agent', autoSave: false, autoSnapshot: false, themeId: 'rainy-design-slate', colorMode: 'dark' };
  return { create, get root() { return controller.directoryRef.current; }, get directory() { return path.join(directory, plan.name); }, plan, calls, guideSetup, controller, translations, failReads(count) { readFailures = count; } };
}

test('all twelve localized starters select one prepared saved example and retain the other bundled content', async t => {
  for (const language of ['zh-CN', 'en-US']) for (const profile of GUIDE_PROFILES) {
    const f = await fixture(t, language), plan = { ...f.plan, profile: profile.id, autoSave: profile.purpose === 'development', autoSnapshot: profile.id === 'brief' };
    const result = await f.create(plan, () => {}); assert.equal(result.status, 'ready', result.message);
    const articles = await listStoredArticles(f.root), templates = await loadArticleTemplates(f.root);
    assert.equal(articles.length, 1); assert.equal(templates.templates.filter(item => item.id.startsWith('entry-')).length, 1);
    assert.ok(templates.templates.some(item => item.id === 'markdown-guide'));
    const article = articles[0]; assert.equal(article.parse.canCopy, true); assert.equal(article.themeValid, true);
    assert.equal(article.parse.metadata.title, f.translations.starterExamples[profile.id].title);
    assert.equal(article.parse.body.trim(), f.translations.starterExamples[profile.id].body);
    assert.equal(result.resources.samplePath, article.filePath); assert.equal(result.resources.templatePath, `templates/entry-guide/entry-${profile.id}.md`);
    assert.equal(f.calls.selected[0].id, article.id);
    const settings = (await loadArticleSettings(f.root)).settings;
    assert.deepEqual(settings.autoSave, { ...DEFAULT_ARTICLE_SETTINGS.autoSave, enabled: plan.autoSave });
    assert.deepEqual(settings.autoSnapshot, { ...DEFAULT_ARTICLE_SETTINGS.autoSnapshot, enabled: plan.autoSnapshot });
    assert.deepEqual(settings.trash, DEFAULT_ARTICLE_SETTINGS.trash); assert.equal((await listArticleSummaries(f.root)).articles.length, 1);
  }
});

test('a late selection failure retries the same prepared library and example without duplicate creation or writes', async t => {
  let attempt = 0; const f = await fixture(t, 'zh-CN', { selectEntryArticle: async () => ++attempt > 1 });
  const first = await f.create(f.plan, () => {}); assert.equal(first.status, 'error'); assert.equal(first.resumable, true);
  const before = (await listStoredArticles(f.root))[0], templates = await loadArticleTemplates(f.root);
  const resumed = await f.create(f.plan, () => {}); assert.equal(resumed.status, 'ready', resumed.message); assert.equal(f.calls.create, 1);
  const after = await listStoredArticles(f.root); assert.equal(after.length, 1); assert.equal(after[0].source, before.source);
  assert.deepEqual((await loadArticleTemplates(f.root)).templates, templates.templates);
});

test('a first sample read failure remembers the created directory before retry and never opens a second picker', async t => {
  const f = await fixture(t); f.failReads(1);
  const first = await f.create(f.plan, () => {}); assert.equal(first.status, 'error'); assert.equal(first.resumable, true);
  assert.ok(f.guideSetup.current?.root); assert.equal(f.guideSetup.current.sample, undefined);
  const next = await f.create(f.plan, () => {}); assert.equal(next.status, 'ready', next.message);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.reads, 2); assert.equal((await listStoredArticles(f.root)).length, 1);
});

test('resuming refuses a changed plan, switched library or externally edited example and retains the edit', async t => {
  const f = await fixture(t, 'zh-CN', { selectEntryArticle: async () => false }); await f.create(f.plan, () => {});
  assert.equal((await f.create({ ...f.plan, profile: 'website' }, () => {})).status, 'error');
  const sample = f.guideSetup.current.sample, target = path.join(f.directory, sample.filePath), external = sample.source + '\nExternal edit retained.\n';
  await writeFile(target, external); assert.equal((await f.create(f.plan, () => {})).status, 'error'); assert.equal(await readFile(target, 'utf8'), external);
  f.controller.directoryRef.current = null; assert.equal((await f.create(f.plan, () => {})).status, 'error'); assert.equal(f.calls.create, 1);
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
    t: key => key, guideAudio: { quiet() {} }, guideSetup: setup, previewEditorAppearance() {}, setWorkspaceMounted() {}, setArrivalVisible() {}, setGuideVisible: value => visibility.push(value),
  });
  reopen(); assert.deepEqual(visibility, []); assert.ok(setup.current);
  continueNavigation(); assert.deepEqual(visibility, []); assert.ok(setup.current);
  continueDraft(); assert.deepEqual(visibility, [true]); assert.equal(setup.current, null);
});

test('post-copy load failure retries loading the same created root instead of creating a duplicate', async t => {
  const f = await fixture(t, 'zh-CN', { failInitialLoad: true });
  const first = await f.create(f.plan, () => {});
  assert.equal(first.status, 'error'); assert.equal(first.resumable, true);
  assert.equal(f.calls.reads, 0); assert.equal(f.guideSetup.current.needsReload, true);
  const resumed = await f.create(f.plan, () => {});
  assert.equal(resumed.status, 'ready', resumed.message);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.reloaded, 1);
  assert.equal((await listStoredArticles(f.root)).length, 1);
});

test('post-copy recovery rejects a changed plan and a switched root before reading its sample', async t => {
  const f = await fixture(t, 'zh-CN', { failInitialLoad: true });
  await f.create(f.plan, () => {});
  assert.equal((await f.create({ ...f.plan, profile: 'website' }, () => {})).status, 'error');
  assert.equal(f.calls.reloaded, 0);
  f.controller.directoryRef.current = null;
  assert.equal((await f.create(f.plan, () => {})).status, 'error');
  assert.equal(f.calls.create, 1); assert.equal(f.calls.reads, 0);
});
