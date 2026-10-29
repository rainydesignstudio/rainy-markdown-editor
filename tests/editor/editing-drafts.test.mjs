import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { createEditingDrafts, hasEditingDraft, articleDraftBaseline, articleDraftChanged } from '../../src/lib/editingDrafts.ts';

test('draft identities aggregate eight editable kinds, isolate libraries, and keep fresh return actions without content copies', () => {
  const store = createEditingDrafts(), root = {}, otherRoot = {}, calls = [];
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  const kinds = ['article', 'article-info', 'article-theme', 'snippet', 'starter-template', 'editor-theme', 'appearance', 'media'];
  kinds.forEach((kind, i) => store.set(String(i), { kind, root, objectId: String(i), resume: () => calls.push(i) }));
  for (const area of ['articles', 'themes', 'template', 'settings', 'assets']) {
    assert.equal(hasEditingDraft(store.getSnapshot(), root, area), true);
    assert.equal(hasEditingDraft(store.getSnapshot(), otherRoot, area), false);
  }
  assert.equal(hasEditingDraft(store.getSnapshot(), root, 'articles', '2'), false);
  const snapshot = store.getSnapshot();
  store.set('0', { kind: 'article', root, objectId: '0', resume: () => calls.push('latest') });
  assert.equal(store.getSnapshot(), snapshot, 'typing keeps the navigation snapshot stable');
  assert.equal(notifications, kinds.length);
  store.getSnapshot()[0].resume(); assert.deepEqual(calls, ['latest']);
  assert.equal(Object.keys(snapshot[0]).some(key => /source|content|value|progress|search/.test(key)), false);
  store.set('0', null); store.set('1', null);
  assert.equal(hasEditingDraft(store.getSnapshot(), root, 'articles'), false);
  store.set('1', null); assert.equal(notifications, kinds.length + 2);
  unsubscribe(); store.set('2', null); assert.equal(notifications, kinds.length + 2);
});

test('source, metadata and theme edits clear on returning to the saved baseline; failed or never-saved drafts stay dirty', () => {
  const saved = { source: '---\ntitle: original\n---\nBody', theme: { id: 'basic', tokens: { ink: 'black' } }, themeValid: true };
  const baseline = articleDraftBaseline(saved);
  assert.equal(articleDraftChanged(saved, baseline), false);
  assert.equal(articleDraftChanged({ ...saved, source: saved.source + ' edited' }, baseline), true);
  assert.equal(articleDraftChanged({ ...saved, source: saved.source.replace('original', 'new title') }, baseline), true);
  assert.equal(articleDraftChanged({ ...saved, theme: structuredClone(saved.theme) }, baseline), false);
  assert.equal(articleDraftChanged({ ...saved, themeValid: false }, baseline), true);
  const draft = { ...saved, theme: { ...saved.theme, tokens: { ink: 'blue' } } };
  assert.equal(articleDraftChanged(draft, baseline), true);
  assert.equal(articleDraftChanged(saved, baseline), false, 'undo to saved data clears the flag');
  assert.equal(articleDraftChanged(draft, baseline), true, 'an unsuccessful write never advances the saved baseline');
  assert.equal(articleDraftChanged(draft, articleDraftBaseline(draft)), false);
  assert.equal(articleDraftChanged(saved, null), true, 'new documents still need their first save');
});

test('continue returns to the protected article editor without running its abandoned navigation or reloading data', async () => {
  const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const resumeCurrentDraft = useCallback('), end = source.indexOf('  const closeTemplateDialog', start);
  const calls = [], location = {};
  const context = { useCallback: fn => fn, cancelPendingAction: () => calls.push('cancel-target'), articleDraftKindRef: { current: 'article' },
    setArticleInfoDialogOpen: value => calls.push(['information', value]), navigateArticleMode: mode => calls.push(['page', mode]),
    articleSourceLocationRef: { current: { key: 5, location } }, sourceHistoryKeyRef: { current: 5 }, sourceTextareaRef: { current: null },
    restoreEditingLocation: saved => calls.push(['position', saved]) };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.resume = resumeCurrentDraft;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.resume();
  assert.deepEqual(calls, ['cancel-target', ['information', false], ['page', 'editor'], ['position', location]]);
  calls.length = 0; context.articleSourceLocationRef.current.key = 4; context.resume();
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'position'), false, 'an older document cannot steal the new draft selection');
  calls.length = 0; context.articleDraftKindRef.current = 'article-info'; context.resume();
  assert.deepEqual(calls, ['cancel-target', ['information', true], ['page', 'editor']]);
});

test('the actual article update path tracks the current edit owner and clears source changes at the saved baseline', async () => {
  const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const updateArticle = useCallback('), end = source.indexOf('  const updateArticleBody', start);
  const saved = { source: 'Saved body', theme: { id: 'basic' }, themeValid: true, dirty: false, folder: null, month: null };
  const context = { useCallback: fn => fn, articleRef: { current: saved }, documentTokenRef: { current: null }, articleDraftKindRef: { current: 'article' },
    articleBaselineRef: { current: articleDraftBaseline(saved) }, articleDraftChanged, articleId: () => 'test',
    revisionRef: { current: 0 }, compileRequestRef: { current: 0 }, setArticleChecks() {}, setIsCompiling() {}, setArticle() {}, setRevision() {}, setLoadInspectionRevision() {}, setCompiledRevision() {} };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.update = updateArticle;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.update('Changed title', undefined, 'article-info');
  assert.equal(context.articleDraftKindRef.current, 'article-info'); assert.equal(context.articleRef.current.dirty, true);
  context.update('Changed body');
  assert.equal(context.articleDraftKindRef.current, 'article', 'later body/resource/theme edits do not reopen an older information edit');
  context.update(saved.source); assert.equal(context.articleRef.current.dirty, false);
  assert.equal(context.articleBaselineRef.current.source, saved.source, 'typing never advances the persisted baseline');
});

test('a completed older save advances only its still-open stored document baseline and keeps new typing', async () => {
  const source = await readFile(new URL('../../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const performSaveSnapshot = useCallback('), end = source.indexOf('  const captureSavedRender', start);
  const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.save = performSaveSnapshot;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const scenario of ['same', 'reverted-while-saving', 'other-document', 'other-library', 'other-format', 'new-document']) {
    const root = {}, token = { root, articleId: 'stored' }, theme = { id: 'basic', version: '1' };
    const baseline = articleDraftBaseline({ source: 'A', theme, themeValid: true });
    const snapshot = { directory: root, documentToken: token, articleId: 'stored', source: 'B', theme, themeValid: true, folder: scenario === 'new-document' ? null : 'stored', month: '2026-10', formatId: 'format' };
    const live = { source: scenario === 'reverted-while-saving' ? 'B' : 'C', theme, themeValid: true, dirty: true };
    let finish, published = 0;
    const context = { useCallback: fn => fn, productText: key => key, setStatus() {}, getArticleOrganization: () => ({ archived: false }), editorWorkspaceRef: { current: {} }, parseArticle: () => ({ diagnostics: [] }),
      updateFrontMatter: source => source + ':generated-timestamp', compiledFormatRef: { current: null }, previewRef: { current: null },
      saveStoredArticle: () => new Promise(resolve => { finish = resolve; }), matchesSnapshot: () => false,
      directoryRef: { current: root }, documentTokenRef: { current: token }, mutationQueueRef: { current: { canSave: () => true } },
      getFormatSnapshot: () => ({ id: scenario === 'other-format' ? 'changed' : 'format' }), openDocument() { throw Error('Must not replace a live draft'); },
      articleBaselineRef: { current: scenario === 'new-document' ? null : baseline }, articleDraftBaseline, articleDraftChanged, articleRef: { current: live }, setArticle: () => published++ };
    vm.runInNewContext(code, context);
    const pending = context.save(snapshot);
    if (scenario === 'other-document') context.documentTokenRef.current = { ...token };
    if (scenario === 'other-library') context.directoryRef.current = {};
    finish({ sourceSaved: true, article: { id: 'stored', folder: 'stored', month: '2026-10', theme, themeValid: true } });
    assert.equal((await pending).ok, true);
    assert.equal(context.articleRef.current.source, live.source, 'writing an older snapshot never overwrites current typing');
    if (scenario === 'same' || scenario === 'reverted-while-saving') {
      assert.equal(context.articleBaselineRef.current.source, 'B');
      assert.equal(articleDraftChanged({ ...live, source: 'B' }, context.articleBaselineRef.current), false);
      assert.equal(articleDraftChanged({ ...live, source: 'A' }, context.articleBaselineRef.current), true, 'undo to a superseded disk version remains unsaved');
      assert.equal(context.articleRef.current.dirty, scenario !== 'reverted-while-saving');
      assert.equal(published, scenario === 'reverted-while-saving' ? 1 : 0);
    } else {
      assert.equal(context.articleBaselineRef.current, scenario === 'new-document' ? null : baseline);
      assert.equal(published, 0);
    }
  }
});

const locationSource = await readFile(new URL('../../src/lib/editingLocation.ts', import.meta.url), 'utf8');
function locationHarness() {
  const frames = [], doc = { activeElement: null };
  class Element {
    constructor(tag, parent = null) { this.tagName = tag; this.parentElement = parent; this.children = []; this.ownerDocument = doc; this.scrollTop = 0; this.scrollLeft = 0; this.isConnected = true; this.inert = false; if (parent) parent.children.push(this); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { doc.activeElement = this; }
    closest() { return this.inert || this.parentElement?.closest() ? this : null; }
    setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  }
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(locationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, HTMLElement: Element, window: { requestAnimationFrame: callback => frames.push(callback) } });
  return { ...module.exports, Element, doc, flush() { while (frames.length) frames.shift()(); } };
}

test('return locations survive remounted tabs, restore selection and scroll, and wait until dialog focus cleanup', () => {
  const h = locationHarness(), root = new h.Element('FORM'), scroll = new h.Element('DIV', root), input = new h.Element('TEXTAREA', scroll);
  h.doc.activeElement = input; root.scrollTop = 60; scroll.scrollTop = 300; input.scrollLeft = 20; input.setSelectionRange(12, 19, 'backward');
  const location = h.captureEditingLocation(root);
  const replacement = new h.Element('FORM'), pane = new h.Element('DIV', replacement), field = new h.Element('TEXTAREA', pane);
  h.restoreEditingLocation(location, () => replacement);
  assert.equal(h.doc.activeElement, input, 'focus restoration is deferred past confirmation cleanup');
  h.flush();
  assert.equal(h.doc.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection], [12, 19, 'backward']);
  assert.deepEqual([replacement.scrollTop, pane.scrollTop, field.scrollLeft], [60, 300, 20]);
});

test('a changed/missing owner or inert modal is never focused; a tab without a field returns focus to its panel', () => {
  const h = locationHarness(), root = new h.Element('SECTION'); root.scrollTop = 50;
  const empty = h.captureEditingLocation(root);
  h.restoreEditingLocation(empty, () => root); h.flush(); assert.equal(h.doc.activeElement, root);
  const input = new h.Element('INPUT', root); h.doc.activeElement = input;
  const captured = h.captureEditingLocation(root); h.doc.activeElement = null;
  root.inert = true; h.restoreEditingLocation(captured, () => root); h.flush(); assert.equal(h.doc.activeElement, null);
  root.inert = false; root.isConnected = false;
  h.restoreEditingLocation(captured, () => root); h.flush(); assert.equal(h.doc.activeElement, null);
  h.restoreEditingLocation(captured, () => null); h.flush(); assert.equal(h.doc.activeElement, null);
});
