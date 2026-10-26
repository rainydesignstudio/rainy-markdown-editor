import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { readFile } from 'node:fs/promises';
import { articleDraftBaseline, articleDraftChanged } from '../../src/lib/editingDrafts.ts';
import { normalizeArticleDirectoryName } from '../../src/lib/articleFolder.ts';

const controller = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('controller.ts', controller, ts.ScriptTarget.Latest, true);
function callback(name, context) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) initializer = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(initializer, name);
  const code = ts.transpileModule('globalThis.action = ' + initializer.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { ...context }; vm.runInNewContext(code, sandbox); return sandbox.action;
}

test('a folder-only edit is an unsaved article change, including after a source save; reverting it clears the change', () => {
  const saved = { source: 'body', theme: {}, themeValid: true, folder: 'Original' };
  const baseline = articleDraftBaseline(saved), draft = { ...saved, folderNameDraft: 'Renamed' };
  assert.equal(articleDraftChanged(draft, baseline), true);
  assert.equal(articleDraftChanged(draft, articleDraftBaseline(draft)), true, 'saving the body alone cannot mark the pending rename complete');
  assert.equal(articleDraftChanged({ ...draft, folderNameDraft: saved.folder }, baseline), false);
  assert.equal(articleDraftChanged({ ...draft, source: 'new body', folderNameDraft: saved.folder }, baseline), true);
});

function saving({ sourceOk = true, current = true, renameOk = true } = {}) {
  const root = {}, trace = [], notices = [];
  const original = { directory: root, documentToken: { root, articleId: 'Original' }, articleId: 'Original', folder: 'Original', month: '2026-10', folderNameDraft: 'Renamed', source: 'draft body' };
  const saved = { ...original, source: 'saved body' }, moved = { ...saved, articleId: 'Renamed', folder: 'Renamed', folderNameDraft: undefined };
  const action = callback('saveSnapshot', {
    normalizeArticleDirectoryName, productErrorLabel: error => ({ label: error.messageKey ?? error.message }), setStatus: notice => notices.push(notice),
    matchesSnapshot: () => current, getPreviewPreferences: () => ({ saveOnly: false }),
    mutationQueueRef: { current: { canSave: () => true, run: task => task() } },
    performSaveSnapshot: async snapshot => { trace.push(['save', snapshot.folder, snapshot.source]); return { ok: sourceOk, current, savedSnapshot: saved }; },
    renameSavedArticleFolder: async (snapshot, name) => { trace.push(['rename', snapshot.folder, snapshot.source, name]); return renameOk ? moved : null; },
  });
  return { action, original, moved, trace, notices };
}

test('one article save writes the body before renaming and returns the new document identity', async () => {
  const f = saving(), result = await f.action(f.original);
  assert.deepEqual(f.trace, [['save', 'Original', 'draft body'], ['rename', 'Original', 'saved body', 'Renamed']]);
  assert.equal(result.ok, true); assert.equal(result.savedSnapshot, f.moved); assert.deepEqual(f.notices, []);
});

test('an invalid folder name prevents writes; failed or stale source saves never rename', async () => {
  const invalid = saving();
  assert.equal((await invalid.action({ ...invalid.original, folderNameDraft: 'bad/name' })).ok, false);
  assert.deepEqual(invalid.trace, []); assert.equal(invalid.notices[0].tone, 'error');
  for (const options of [{ sourceOk: false }, { current: false }]) {
    const f = saving(options); await f.action(f.original);
    assert.equal(f.trace.length, 1); assert.equal(f.trace[0][0], 'save');
  }
  const failed = saving({ renameOk: false });
  assert.equal((await failed.action(failed.original)).ok, false);
  assert.equal(failed.original.folderNameDraft, 'Renamed', 'the requested name remains available for retry');
});

test('the rename path accepts the saved draft, preserves failure recovery, and emits no success notice', async () => {
  for (const fail of [false, true]) {
    const root = {}, source = 'saved body', target = { directory: root, month: '2026-10', folder: 'Original', articleId: '2026-10/Original', source };
    const articleRef = { current: { ...target, folderNameDraft: 'Renamed', dirty: true } }, notices = [], operations = [];
    const moved = { id: '2026-10/Renamed', folder: 'Renamed', month: target.month, source };
    const action = callback('renameSavedArticleFolder', {
      editorWorkspaceIssue: null, mediaOperationRef: { current: false }, editorWorkspaceRef: { current: {} }, editorWorkspaceQueueRef: { current: Promise.resolve() },
      directoryRef: { current: root }, articleRef, articleId: article => article.articleId ?? article.id,
      matchesSnapshot: () => true, getArticleOrganization: () => ({ archived: false }),
      beginHistoryOperation: () => 'lease', finishHistoryOperation: () => operations.push('finish'),
      importFolderRef: { current: { isBusy: () => false, moved() {} } },
      mutationQueueRef: { current: { beginDelete: () => 'block', run: task => task(), finishDelete: () => operations.push('commit'), failDelete: () => operations.push('recover') } },
      renameStoredArticleDirectory: async (_root, month, folder, name, options) => {
        assert.equal(month, target.month); assert.equal(folder, 'Original'); assert.equal(name, 'Renamed');
        assert.equal(options.expectedSource, source); assert.equal(options.isCurrent(), true);
        if (fail) throw new Error('collision');
        return { article: moved };
      },
      setMediaTarget() {}, closeMediaPicker() {}, setStoredArticles() {}, setArticleChecks() {}, setEditorWorkspace() {},
      editorWorkspaceSnapshotRef: { current: {} }, loadEditorWorkspace: async () => ({ workspace: {}, issue: null }),
      readStoredArticleById: async () => moved, applyStoredArticle: async article => { articleRef.current = article; return true; },
      setMediaRefreshRevision() {}, snapshotFor: () => articleRef.current,
      setStatus: notice => notices.push(notice), productErrorLabel: error => ({ label: error.message }),
    });
    const result = await action(target, 'Renamed');
    if (fail) {
      assert.equal(result, null); assert.equal(articleRef.current.folderNameDraft, 'Renamed');
      assert.equal(notices[0].tone, 'error'); assert.deepEqual(operations, ['recover', 'finish']);
    } else {
      assert.equal(result, moved); assert.deepEqual(notices, []); assert.deepEqual(operations, ['commit', 'finish']);
    }
  }
});

test('article information has one save action, no per-folder saved badge, and Enter saves the whole form', async () => {
  const source = await readFile(new URL('../../src/components/editor/ArticleInfoDialog.tsx', import.meta.url), 'utf8');
  const module = { exports: {} }, stub = () => null;
  const modules = {
    react: { ...React, useRef: value => ({ current: value }), useLayoutEffect() {} },
    '../global/UILocaleProvider': { useUITranslation: () => ({ t: key => key }) },
    '../global/EditingDrafts': { useDraftLocation: () => ({ props: {} }) },
    '../../hooks/useLibraryCapability': { useLibraryCapability: () => ({ enabled: true }) },
    '../global/SelectField': { SelectField: stub },
    '../global/DialogFrame': Object.fromEntries(['DialogActions', 'DialogButton', 'DialogFooter', 'DialogFrame', 'DialogHeader'].map(name => [name, stub])),
    '../global/InformationButton': { InformationButton: stub, InformationIcon: stub },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: name => name === 'react/jsx-runtime' ? { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment } : modules[name],
  });
  let saves = 0;
  const element = module.exports.ArticleInfoDialog({ article: { folder: 'Original', month: '2026-10', dirty: true, themeValid: true, theme: {} }, parsed: { diagnostics: [], metadata: { categories: [] } }, workspace: { projects: [] }, onSave: () => saves++, folderName: 'Renamed' });
  const nodes = [];
  function visit(value) { if (Array.isArray(value)) return value.forEach(visit); if (value?.props) { nodes.push(value); visit(value.props.children); } }
  visit(element);
  assert.equal(nodes.filter(node => node.props.children === 'dialogs:ui.applyFolderName').length, 0);
  assert.equal(nodes.filter(node => node.props.role === 'status').length, 0);
  const input = nodes.find(node => node.props.name === 'article-folder');
  input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {}, stopPropagation() {} });
  assert.equal(saves, 0);
  input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {} });
  assert.equal(saves, 1);
  nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 2);
});
