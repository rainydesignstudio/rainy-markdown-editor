import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import * as productMessages from '../src/lib/i18n/productMessages.ts';

const source = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function persistence(kind, active = true, enabled = true, pending = false) {
  const marker = source.indexOf('!articleSettings.' + kind + '.enabled');
  const start = source.lastIndexOf('  useEffect(() => {', marker), end = source.indexOf('\n\n  useEffect', marker);
  assert.ok(start >= 0 && end > start);
  const timers = [], clears = [], calls = { save: 0, compile: 0, render: 0, history: 0 };
  const root = {}, token = { root, articleId: 'draft' }, article = { dirty: true }, snapshot = { ...article, articleId: 'draft', documentToken: token };
  const editorPageRef = { current: active }; let cleanup, finish;
  const context = {
    useEffect: effect => { cleanup = effect(); },
    window: { setInterval: callback => { timers.push(callback); return timers.length; }, clearInterval: value => clears.push(value) },
    editorPageRef, directory: root, directoryRef: { current: root }, documentTokenRef: { current: token }, article, articleRef: { current: article },
    articleId: () => 'draft', settingsIssue: null, currentDocumentGeneration: 1, view: active ? 'articles' : 'settings', articleMode: active ? 'editor' : 'overview',
    articleSettings: { autoSave: { enabled, intervalSeconds: 30 }, autoSnapshot: { enabled, intervalMinutes: 1, maxCount: 10 } },
    editorWorkspace: {}, editorWorkspaceRef: { current: {} }, getArticleOrganization: () => ({ archived: false }), mutationQueueRef: { current: { canSave: () => true, run: task => task() } },
    historyOperationRef: { current: null }, autoSaveBusyRef: { current: false }, autoSnapshotBusyRef: { current: false }, mediaOperationRef: { current: false }, historyBaselineRef: { current: null },
    snapshotFor: () => snapshot, matchesSnapshot: () => true,
    saveSnapshot: async () => { calls.save++; return pending ? new Promise(resolve => { finish = resolve; }) : { ok: false }; },
    compileCurrent: async () => { calls.compile++; return true; }, captureSavedRender: async () => { calls.render++; },
    listArticleHistory: async () => { calls.history++; return { snapshots: [] }; },
  };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { timers, clears, calls, editorPageRef, cleanup: () => cleanup?.(), finish: () => finish({ ok: true, current: true, savedSnapshot: { ...snapshot, month: '2026-10', folder: 'test' }, result: { article: { parse: { canCopy: true } } } }) };
}

for (const kind of ['autoSave', 'autoSnapshot']) {
  test(kind + ' runs only in the editor and a queued tick cannot write after departure', async () => {
    assert.equal(persistence(kind, false).timers.length, 0);
    assert.equal(persistence(kind, true, false).timers.length, 0);
    const f = persistence(kind);
    assert.equal(f.timers.length, 1);
    f.editorPageRef.current = false; f.timers[0](); await new Promise(setImmediate);
    assert.equal(f.calls.save, 0);
    f.editorPageRef.current = true; f.timers[0](); await new Promise(setImmediate);
    assert.equal(f.calls.save, 1, 'returning to the editor retains the enabled timer behavior');
    f.cleanup(); assert.deepEqual(f.clears, [1]);
  });
  test(kind + ' finishes an already-started save without initiating later render/history writes after departure', async () => {
    const f = persistence(kind, true, true, true);
    f.timers[0](); await new Promise(setImmediate); assert.equal(f.calls.save, 1);
    f.editorPageRef.current = false; f.finish(); await new Promise(setImmediate);
    assert.equal(f.calls.compile, 0); assert.equal(f.calls.render, 0); assert.equal(f.calls.history, 0);
    f.cleanup();
  });
}

function callback(name, _next, context) {
  const tree = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
  let expression;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer.arguments[0]; ts.forEachChild(node, visit); };
  visit(tree); assert.ok(expression, name);
  const sandbox = { ...productMessages, renameSavedArticleFolder: async () => null, ...context };
  vm.runInNewContext(ts.transpileModule('globalThis.action = ' + expression.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox.action;
}

test('an automatic save expires in the mutation queue and does not compile after a completed in-flight write', async () => {
  for (const stage of ['queue', 'write']) {
    let active = true, release, writes = 0, renders = 0;
    const root = {}, snapshot = { directory: root, articleId: 'draft', documentToken: { root, articleId: 'draft' } };
    const result = { ok: true, current: true, savedSnapshot: snapshot, result: { article: { parse: { canCopy: true } } } };
    const context = {
      mutationQueueRef: { current: { canSave: () => true, run: task => stage === 'queue' ? new Promise(resolve => { release = () => resolve(task()); }) : task() } },
      matchesSnapshot: () => true, getPreviewPreferences: () => ({ saveOnly: true }), setStatus() {},
      performSaveSnapshot: () => { writes++; return new Promise(resolve => { release = () => resolve(result); }); },
      compileCurrent: async () => { renders++; return true; }, captureSavedRender: async () => ({ ok: true }),
    };
    context.finishSavedSnapshot = callback('finishSavedSnapshot', null, context);
    const save = callback('saveSnapshot', null, context);
    const pending = save(snapshot, () => active);
    active = false; release(); await pending;
    assert.equal(writes, stage === 'queue' ? 0 : 1);
    assert.equal(renders, 0);
  }
});

test('departure cancels an unstarted source write while a started source write may finish without later rendering', async () => {
  for (const started of [false, true]) {
    let active = started, matches = true, release, writes = 0;
    const root = {}, theme = {}, snapshot = { directory: root, source: 'body', theme, themeValid: true, folder: 'test', month: '2026-10', documentToken: { root } };
    const saved = { sourceSaved: true, article: { id: 'test', month: '2026-10', folder: 'test', theme, themeValid: true } };
    const save = callback('performSaveSnapshot', null, {
      getArticleOrganization: () => ({}), editorWorkspaceRef: { current: {} }, parseArticle: () => ({ diagnostics: [] }), updateFrontMatter: text => text,
      matchesSnapshot: () => matches, saveStoredArticle: () => { writes++; return new Promise(resolve => { release = () => resolve(saved); }); },
      openDocument() { throw Error('A departed editor cannot open a new document'); },
      mutationQueueRef: { current: { canSave: () => true } }, directoryRef: { current: null }, setStatus() {},
    });
    const pending = save(snapshot, () => active); await new Promise(setImmediate);
    active = false; matches = false; release?.();
    assert.equal((await pending).ok, started); assert.equal(writes, started ? 1 : 0);
  }
});

test('a queued automatic render capture cannot start persistence after leaving the editor', async () => {
  let active = true, release, renders = 0;
  const root = {}, snapshot = { directory: root, month: '2026-10', folder: 'test', source: 'body' };
  const capture = callback('captureSavedRender', 'saveCurrent', {
    previewRef: { current: {} }, compiledFormatRef: { current: { snapshot, css: '' } }, matchesSnapshot: () => true, prepareRenderRecord: async () => ({}),
    getFormatSnapshot: () => ({}), mutationQueueRef: { current: { canSave: () => true, run: task => new Promise(resolve => { release = () => resolve(task()); }) } },
    getStoredArticleDirectory: async () => ({}), persistRenderRecord: async () => { renders++; }, setStatus() {},
  });
  const pending = capture(snapshot, () => active); await new Promise(setImmediate);
  active = false; release(); assert.equal((await pending).ok, false); assert.equal(renders, 0);
});
