import assert from 'node:assert/strict';
import test from 'node:test';
import { retainPreviewInput, previewInputMatches } from '../src/lib/previewSnapshot.ts';
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
test('body, theme, configuration and media changes pause mapping; metadata-only edits do not falsify the visible body', () => {
  const saved = input(), retained = retainPreviewInput(saved);
  assert.equal(previewInputMatches(saved, { ...saved, article: { ...saved.article, dirty: true } }), true);
  for (const current of [
    { ...saved, parsed: { ...saved.parsed, body: '# current' } },
    { ...saved, parsed: { ...saved.parsed, canCopy: false } },
    { ...saved, article: { ...saved.article, theme: { ...saved.article.theme, version: '2' } } },
    { ...saved, snapshot: { id: 'library-2' } },
    { ...saved, compiledCss: 'new css' },
    { ...saved, media: { sessionKey: 2 } },
  ]) assert.equal(previewInputMatches(saved, current), false);
  assert.equal(retained.input.parsed.body, '# saved'); retained.dispose();
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
    assert.equal(removed.length, 2);
  } finally { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.MutationObserver = previous.observer; }
});
