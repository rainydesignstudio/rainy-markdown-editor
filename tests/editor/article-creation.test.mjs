import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { readFile } from 'node:fs/promises';
import { tree, snapshot } from '../knowledge/fs-fixture.mjs';
import { createArticleSource, instantiateArticleTemplate, parseArticle, updateFrontMatter } from '../../src/lib/frontMatter.ts';
import { monthKey, sanitizeFolderName, saveStoredArticle } from '../../src/lib/fileSystem.ts';
import { BASIC_THEME, RAINY_THEME } from '../../src/lib/themes.ts';
import { createArticleMutationQueue } from '../../src/lib/articleMutationQueue.ts';
import { articleDraftBaseline, articleDraftChanged } from '../../src/lib/editingDrafts.ts';
import { createDefaultEditorWorkspace, getArticleOrganization, moveArticleToProject } from '../../src/lib/editorWorkspace.ts';
import * as messages from '../../src/lib/i18n/productMessages.ts';

const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
function callback(name, context) {
  let expression;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer.arguments[0]; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(expression, name);
  vm.runInNewContext(ts.transpileModule('globalThis.action = ' + expression.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.action;
}

function saving() {
  const root = tree('isolated-creation'), notices = [], calls = { writes: 0, renders: 0, projects: 0 };
  const queue = createArticleMutationQueue(), workspace = createDefaultEditorWorkspace();
  workspace.projects.push({ id: 'project', name: 'Project', collapsed: false, pinned: false });
  const articleId = article => article.folder && article.month ? `${article.month}/${article.folder}` : 'draft';
  const initial = { source: 'previous article', theme: BASIC_THEME, themeValid: true, dirty: false, month: null, folder: null };
  const context = {
    ...messages, parseArticle, updateFrontMatter, sanitizeFolderName, getArticleOrganization, moveArticleToProject,
    articleId, articleDraftBaseline, articleDraftChanged, articleFingerprint: () => 'fingerprint',
    directoryRef: { current: root }, contentLibraryRootSessionRef: { current: 1 }, articleCreationRef: { current: { root, session: 1, target: null } },
    articleCreationBusyRef: { current: false }, mediaOperationRef: { current: false }, historyOperationRef: { current: null },
    articleRef: { current: initial }, articleBaselineRef: { current: null }, articleDraftKindRef: { current: 'article' },
    articleSourceLocationRef: { current: null }, articleInfoLocationRef: { current: null }, historyBaselineRef: { current: null },
    revisionRef: { current: 1 }, compileRequestRef: { current: 0 }, mediaRefreshRevisionRef: { current: 0 }, savedPreviewPendingRef: { current: null },
    editorWorkspaceRef: { current: workspace }, mutationQueueRef: { current: queue }, documentTokenRef: { current: queue.openDocument(root, 'draft') },
    storedArticles: [], getFormatSnapshot: () => ({ id: context.formatId ?? 'test-format' }),
    flushSync: fn => fn(), makeWorkingArticle: (source, theme) => ({ source, theme, themeValid: true, month: null, folder: null, dirty: true }),
    openDocument: (root, id) => context.documentTokenRef.current = queue.openDocument(root, id),
    setArticle() {}, setArticleChecks() {}, setRevision() {}, setCompiledRevision() {}, setLoadInspectionRevision() {}, setIsCompiling() {},
    setStoredArticles: update => { context.storedArticles = update(context.storedArticles); }, upsertStoredArticle: (items, article) => [article, ...items.filter(item => item.id !== article.id)],
    setStatus: notice => notices.push(notice),
    saveStoredArticle: async (...args) => { calls.writes++; return saveStoredArticle(...args); },
    orderArticlesForGroup: () => [],
    persistEditorWorkspace: async (update, notice) => { calls.projects++; assert.equal(notice, null); if (context.projectFails) return false; context.editorWorkspaceRef.current = update(context.editorWorkspaceRef.current); return true; },
    compileCurrent: async () => { calls.renders++; if (context.expireRender) context.formatId = 'changed-format'; return !context.renderFails; },
    captureSavedRender: async () => ({ ok: true }), compileIssueRef: { current: null },
    renameSavedArticleFolder: async () => { throw Error('An unchanged retry must not rename the created article'); },
  };
  for (const name of ['snapshotFor', 'matchesSnapshot', 'updateArticle', 'performSaveSnapshot', 'finishSavedSnapshot', 'saveSnapshot']) context[name] = callback(name, context);
  const create = callback('createArticleFromTemplate', context);
  return { root, calls, notices, context, initial, create };
}

test('one confirmed creation writes source, metadata, theme and index, assigns the project and leaves a saved article', async () => {
  const f = saving(), source = updateFrontMatter(createArticleSource('新文章'), { author: 'Writer', description: 'Summary', categories: ['One', 'Two'] });
  assert.equal(await f.create(source, BASIC_THEME, 'project'), true, JSON.stringify(f.notices));
  assert.equal(f.calls.writes, 1); assert.equal(f.calls.renders, 1); assert.equal(f.calls.projects, 1);
  const current = f.context.articleRef.current;
  assert.equal(current.dirty, false); assert.equal(current.folder, '新文章');
  const directory = await (await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(current.month)).getDirectoryHandle(current.folder);
  const saved = parseArticle(await (await directory.getFileHandle('article.md')).getFile().then(file => file.text()));
  assert.equal(saved.metadata.author, 'Writer'); assert.equal(saved.metadata.description, 'Summary'); assert.deepEqual(saved.metadata.categories, ['One', 'Two']);
  assert.equal(JSON.parse(await (await directory.getFileHandle('theme.json')).getFile().then(file => file.text())).id, BASIC_THEME.id);
  assert.equal(getArticleOrganization(f.context.editorWorkspaceRef.current, `${current.month}/${current.folder}`).projectId, 'project');
  assert.equal(f.notices.at(-1).tone, 'success');
});

test('a partial render or project failure retries the already-created article without a second folder', async () => {
  for (const cause of ['renderFails', 'projectFails']) {
    const f = saving(); f.context[cause] = true;
    const source = createArticleSource('Retry');
    assert.equal(await f.create(source, BASIC_THEME, 'project'), false);
    assert.equal(f.notices.at(-1).tone, 'warning');
    const target = f.context.articleCreationRef.current.target;
    assert.ok(target.folder); f.context[cause] = false;
    assert.equal(await f.create(source, BASIC_THEME, 'project'), true);
    assert.equal(f.context.articleRef.current.folder, target.folder);
    const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(target.month);
    assert.deepEqual([...month.children.values()].filter(item => item.kind === 'directory').map(item => item.name), ['Retry']);
  }
});

test('source write failure retains the submitted draft, and an old library or changed document cannot be reused', async () => {
  const f = saving(); f.context.saveStoredArticle = async () => { throw Error('disk full'); };
  const body = createArticleSource('Retained');
  assert.equal(await f.create(body, BASIC_THEME, null), false);
  assert.equal(f.context.articleRef.current.source, body); assert.equal(f.context.articleRef.current.dirty, true);
  assert.equal(f.context.articleCreationRef.current.target, null);
  f.context.directoryRef.current = {};
  assert.equal(await f.create(body, BASIC_THEME, null), false);
  const g = saving(); g.context.renderFails = true; await g.create(body, BASIC_THEME, null);
  const writes = g.calls.writes; g.context.documentTokenRef.current = {};
  assert.equal(await g.create(body, BASIC_THEME, null), false); assert.equal(g.calls.writes, writes);
});

test('a stale render completion and a collision-allocated directory both retain the first write for retry', async () => {
  for (const cause of ['stale', 'collision']) {
    const f = saving(), source = createArticleSource('Retried');
    if (cause === 'collision') { await saveStoredArticle(f.root, source, BASIC_THEME); f.context.renderFails = true; }
    else f.context.expireRender = true;
    assert.equal(await f.create(source, BASIC_THEME, null), false);
    const target = f.context.articleCreationRef.current.target;
    assert.equal(target.folder, cause === 'collision' ? 'Retried-2' : 'Retried');
    f.context.renderFails = f.context.expireRender = false;
    assert.equal(await f.create(source, BASIC_THEME, null), true);
    assert.equal(f.context.articleRef.current.folder, target.folder);
    const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(target.month);
    assert.equal([...month.children.values()].filter(item => item.kind === 'directory').length, cause === 'collision' ? 2 : 1);
  }
});

test('repeat submission cannot write twice and a same-title creation preserves the existing article', async () => {
  const f = saving(), body = createArticleSource('Collision');
  await saveStoredArticle(f.root, body, BASIC_THEME);
  let release; const save = f.context.saveStoredArticle;
  f.context.saveStoredArticle = (...args) => new Promise(resolve => { release = () => resolve(save(...args)); });
  const first = f.create(body, BASIC_THEME, null);
  await new Promise(setImmediate);
  assert.equal(await f.create(body, BASIC_THEME, null), false);
  release(); assert.equal(await first, true); assert.equal(f.calls.writes, 1);
  const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(f.context.articleRef.current.month);
  assert.deepEqual([...month.children.values()].filter(item => item.kind === 'directory').map(item => item.name).sort(), ['Collision', 'Collision-2']);
});

test('opening honors the existing dirty-draft decision; cancelling before submission returns to its entry page', () => {
  const root = {}, routes = [], previous = { source: 'existing unsaved source' };
  let pending, opened = false;
  const context = { ...messages, articleMode: 'overview', directoryRef: { current: root }, articleRef: { current: previous },
    articleCreationRef: { current: null }, articleCreationReturnFocusRef: { current: null }, articleCreationBusyRef: { current: false }, mediaOperationRef: { current: false }, historyOperationRef: { current: null }, contentLibraryRootSessionRef: { current: 1 },
    setStatus() {}, navigateRoute() {}, navigateArticleMode: mode => routes.push(mode), setShowTemplateDialog: value => { opened = value; },
    runAfterDraftDecision: action => { pending = action; } };
  callback('createNewArticle', context)();
  assert.equal(opened, false); assert.equal(context.articleCreationRef.current, null);
  pending.run(); assert.equal(opened, true); assert.equal(context.articleRef.current, previous);
  callback('closeTemplateDialog', context)();
  assert.equal(opened, false); assert.deepEqual(routes, ['editor', 'overview']); assert.equal(context.articleRef.current, previous);
});

test('creation close restores the logical opener after route remount, and a submitted draft focuses the source', () => {
  const marker = source.indexOf('    const pending = articleCreationReturnFocusRef.current;');
  const start = source.lastIndexOf('  useEffect(() => {', marker), end = source.indexOf('  const openStoredArticle', marker);
  for (const trigger of ['overview', null]) {
    let frame, focused = 0, selector;
    const target = { isConnected: true, focus: () => focused++ };
    const pending = { mode: trigger ? 'overview' : 'editor', trigger };
    const context = { articleCreationReturnFocusRef: { current: pending }, showTemplateDialog: false, view: 'articles', articleMode: pending.mode,
      sourceTextareaRef: { current: target }, document: { querySelector: value => { selector = value; return target; } },
      window: { requestAnimationFrame: run => { frame = run; return 1; }, cancelAnimationFrame() {} }, useEffect: effect => effect() };
    vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    assert.equal(focused, 0); frame(); assert.equal(focused, 1); assert.equal(context.articleCreationReturnFocusRef.current, null);
    if (trigger) assert.equal(selector, '[data-create-article-trigger="overview"]');
  }
});

async function wizard() {
  const state = [], refs = []; let cursor = 0, refCursor = 0, closed = 0, creates = 0, finish;
  const stub = () => null, module = { exports: {} };
  const modules = {
    react: { useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => state[i] = typeof next === 'function' ? next(state[i]) : next]; }, useRef: initial => refs[refCursor++] ??= { current: initial } },
    '../../lib/frontMatter': { createArticleSource, instantiateArticleTemplate, parseArticle, updateFrontMatter }, '../../lib/fileSystem': { monthKey, sanitizeFolderName },
    '../../lib/i18n/productMessages': messages, '../editor/ArticleInfoDialog': { ArticleInfoDialog: stub }, './TemplateDialog': { TemplateDialog: stub }, '../global/Toast': { useToast: () => () => {} },
  };
  const code = await readFile(new URL('../../src/components/content/ArticleCreationDialog.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: name => name === 'react/jsx-runtime' ? jsx : modules[name] });
  const props = { templates: [], categories: [], themes: [BASIC_THEME, RAINY_THEME], defaultTheme: BASIC_THEME, workspace: createDefaultEditorWorkspace(), onClose: () => closed++, onCreate: () => { creates++; return new Promise(resolve => { finish = resolve; }); } };
  return { render: () => { cursor = refCursor = 0; return module.exports.ArticleCreationDialog(props); }, counts: () => ({ closed, creates }), finish: result => finish(result) };
}

test('the two-step draft keeps title, project, template and theme on Back, without invoking persistence before confirmation', async () => {
  const f = await wizard(), root = tree('unchanged'), before = snapshot(root);
  const template = { id: 'template', source: updateFrontMatter(createArticleSource('Template'), { createdAt: '2000-01-01T00:00:00.000Z' }) + '\nTemplate body' };
  f.render().props.onCreate(template, RAINY_THEME);
  let info = f.render(); info.props.onChangeField('title', 'A long title'); info.props.onChangeProject('project');
  info = f.render(); assert.equal(info.props.folderName, 'A long title'); assert.equal(info.props.creation.projectId, 'project');
  assert.equal(info.props.parsed.body.includes('Template body'), true); assert.notEqual(info.props.parsed.metadata.createdAt, '2000-01-01T00:00:00.000Z');
  info.props.creation.onBack(); const first = f.render(); assert.equal(first.props.initialTemplateId, 'template'); assert.equal(first.props.initialThemeId, RAINY_THEME.id);
  first.props.onCreate(template, BASIC_THEME); info = f.render();
  assert.equal(info.props.parsed.metadata.title, 'A long title'); assert.equal(info.props.creation.projectId, 'project'); assert.equal(info.props.article.theme.id, BASIC_THEME.id);
  assert.deepEqual(f.counts(), { closed: 0, creates: 0 }); assert.equal(snapshot(root), before);
  info.props.onClose(); assert.equal(f.counts().closed, 1); assert.equal(f.counts().creates, 0);
});

test('confirmation is locked while pending; a failed save retains fields and success closes the wizard', async () => {
  const f = await wizard(); f.render().props.onCreate(null, BASIC_THEME);
  f.render().props.onChangeField('author', 'Retained author'); f.render().props.onSave(); f.render().props.onSave();
  assert.equal(f.render().props.busy, true); assert.equal(f.counts().creates, 1);
  f.finish(false); await new Promise(setImmediate);
  assert.equal(f.render().props.busy, false); assert.equal(f.render().props.parsed.metadata.author, 'Retained author'); assert.equal(f.counts().closed, 0);
  f.render().props.onSave(); f.finish(true); await new Promise(setImmediate); assert.equal(f.counts().closed, 1);
});
