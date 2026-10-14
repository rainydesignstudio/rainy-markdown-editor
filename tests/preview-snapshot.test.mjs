import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { retainPreviewInput, refreshRetainedPreviewMedia } from '../src/lib/previewSnapshot.ts';
import { nativeDarkRendition } from '../src/lib/article-format/nativeDark.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';

function input(environment) {
  return { article: { theme: { id: 'theme', version: '1' }, themeValid: true },
    parsed: { body: '# saved', canCopy: true }, compiledCss: 'p{background:url(blob:original#svg)}',
    snapshot: { id: 'library-1', environment }, media: { sessionKey: 1 } };
}
test('retained visible inputs keep independent Blob URL lifetimes without reading or mutating the live environment', () => {
  const created = [], revoked = [], create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { created.push(blob); return 'blob:retained'; };
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    const blob = new Blob(['font']), environment = { assets: [{ path: 'font.woff', blob, url: 'blob:original' }], files: { 'a.css': 'url(blob:original)' }, resolveCss() { throw new Error('must not compile during capture'); }, dispose() { throw new Error('must not dispose the live environment'); } };
    const original = input(environment), retained = retainPreviewInput(original);
    assert.equal(created.length, 1); assert.equal(created[0], blob);
    assert.equal(retained.input.compiledCss, 'p{background:url(blob:retained#svg)}');
    assert.equal(retained.input.snapshot.environment.files['a.css'], 'url(blob:retained)');
    assert.equal(environment.assets[0].url, 'blob:original');
    assert.equal(original.compiledCss, 'p{background:url(blob:original#svg)}');
    retained.dispose(); retained.dispose(); assert.deepEqual(revoked, ['blob:retained']);
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
test('resource arrival refreshes the saved canvas media without publishing unsaved body or replacing retained URL lifetimes', () => {
  const original = input(), root = {}; original.media = { root, article: { id: 'saved' }, sessionKey: 1 };
  const retained = retainPreviewInput(original), media = { ...original.media, sessionKey: 2 };
  const refreshed = refreshRetainedPreviewMedia(retained, media);
  assert.equal(refreshed.input.media, media); assert.equal(refreshed.input.parsed.body, '# saved');
  assert.equal(refreshed.dispose, retained.dispose); assert.equal(refreshed.input.snapshot, retained.input.snapshot);
  assert.equal(refreshRetainedPreviewMedia(refreshed, { ...media, article: { id: 'other' } }), refreshed);
  assert.equal(refreshRetainedPreviewMedia(refreshed, { ...media, root: {} }), refreshed);
  assert.equal(refreshRetainedPreviewMedia(refreshed, media), refreshed);
});

test('save-only previews distinguish manuscripts with the same per-article generation and wait for their own compilation', async () => {
  const source = await readFile(new URL('../src/components/editor/PreviewPanel.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const boundaryRef = '), end = source.indexOf('  useLayoutEffect(() => { setFrozen', start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const boundary = { current: null }, ready = { current: null }, directory = {}, saved = input();
  let shown = null;
  const render = (current, compiledRevision, generation = 1, savedRevision = 0, root = directory, enabled = true) => {
    vm.runInNewContext(code, { article: current.article, input: current, compiledRevision,
      preferences: { saveOnly: enabled }, savedPreviewRevision: savedRevision, documentGeneration: generation, directory: root, formatSnapshot: current.snapshot,
      previewReadyRef: ready,
      useRef: () => boundary, useLayoutEffect: fn => fn(), retainPreviewInput,
      setFrozen: next => { shown?.dispose(); shown = next; },
    });
    return shown?.input.parsed.body ?? null;
  };
  saved.article = { ...saved.article, month: '2026-10', folder: 'first' };
  assert.equal(render(saved, 1), '# saved');
  const next = { ...saved, article: { ...saved.article, folder: 'second' }, parsed: { ...saved.parsed, body: '# second' } };
  assert.equal(render(next, null), null, 'switching to a first-opened manuscript must drop the previous canvas');
  assert.equal(render(next, 2), '# second');
  const edited = { ...next, parsed: { ...next.parsed, body: '# unsaved second' } };
  assert.equal(render(edited, null), '# second', 'typing in the same manuscript keeps its saved preview');
  assert.equal(render(edited, 3), '# second', 'background checks do not publish an unsaved draft');
  assert.equal(render(edited, 3, 1, 1), '# unsaved second', 'a successful save advances the display boundary');
  const month = { ...next, article: { ...next.article, month: '2026-11' }, parsed: { ...next.parsed, body: '# other month' } };
  assert.equal(render(month, null, 1, 1), null);
  assert.equal(render(month, 4, 1, 1), '# other month');
  assert.equal(render(saved, null, 2, 1), null, 'reopening also changes the boundary');
  assert.equal(render(saved, 5, 2, 1), '# saved');
  assert.equal(render(next, null, 1, 1, {}), null, 'library changes cannot retain the previous manuscript');
  assert.equal(render(next, 6, 1, 1, {}), '# second');
  assert.equal(render(next, 6, 1, 1, directory, false), null);
  assert.equal(render(edited, null, 1, 1, directory, true), '# unsaved second', 'enabling on an edited document retains its visible body with its own existing stylesheet');
  const third = { ...next, article: { ...next.article, folder: 'third' }, parsed: { ...next.parsed, body: '# third' } };
  assert.equal(render(third, null, 1, 1), null, 'readiness for another manuscript never licenses a stale stylesheet');
  render(edited, 7, 3, 1);
  const adopted = { ...edited, article: { ...edited.article, theme: { id: 'adopted', version: '2' } }, compiledCss: 'p{color:blue}' };
  render(adopted, 8, 3, 1);
  assert.equal(shown.input.article.theme.id, 'theme', 'compilation alone does not advance a frozen display');
  render(adopted, 8, 3, 2);
  assert.equal(shown.input.article.theme.id, 'adopted', 'explicit adoption publishes the newly compiled theme');
  assert.equal(shown.input.compiledCss, adopted.compiledCss);
  assert.equal(shown.input.parsed.body, '# unsaved second');
  render({ ...adopted, parsed: { ...adopted.parsed, body: '# later typing' } }, null, 3, 2);
  assert.equal(shown.input.parsed.body, '# unsaved second', 'subsequent typing still follows save-only preference');
});

test('only an explicitly retained display can finish using its old immutable format; current output keeps the stale-format guard', async () => {
  const previous = { document: globalThis.document, window: globalThis.window, observer: globalThis.MutationObserver };
  const removed = [];
  globalThis.window = { setTimeout };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.document = { createElement: () => ({
    style: {}, setAttribute() {}, remove() { removed.push(this); },
    contentDocument: { body: { dataset: { previewReady: 'true' } }, head: { querySelectorAll: () => [{ textContent: 'retained css' }] }, querySelector: () => ({ outerHTML: '<article>saved</article>' }) },
  }), body: { append(frame) { queueMicrotask(() => frame.onload()); } } };
  try {
    const snapshot = { ...getFormatSnapshot(), id: 'old-retained-display' }, root = { clientWidth: 640, outerHTML: '<article>saved</article>' };
    await assert.rejects(nativeDarkRendition(root, '', snapshot, new AbortController().signal), /配置|format/i);
    assert.deepEqual(await nativeDarkRendition(root, '', snapshot, new AbortController().signal, { retained: true }), { html: '<article>saved</article>', css: 'retained css' });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(nativeDarkRendition(root, '', snapshot, controller.signal, { retained: true }), /abort/i);
    assert.equal(removed.length, 1, 'stale and already-cancelled requests allocate no processing frame');
  } finally { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.MutationObserver = previous.observer; }
});
