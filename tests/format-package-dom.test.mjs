import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:3500/' });
globalThis.MutationObserver = dom.window.MutationObserver;
dom.window.setTimeout = setTimeout; dom.window.clearTimeout = clearTimeout;
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.location = dom.window.location;
const { sanitizePackageHtml, assertInertPackageMarkup, assertPackageCss, packageMeasurementServices, awaitPackagePreview, bindPackageInput, packageInputFor, packageAuthoredMarkup, packageResourcePath } = await import('../src/lib/article-format/packageRendering.ts');
const snapshot = { id: 'isolated', renderer: { declaration: { permissions: { images: ['https://allowed.example'], styles: ['https://styles.example'], fonts: ['https://fonts.example'] } } } };

test('generic package floor preserves native labels, disabled state and picture sources without adding a platform policy', () => {
  const input = '<input type="radio" id="one" name="tabs" checked><label for="one">One</label><input type="radio" id="two" name="tabs" disabled><picture><source srcset="https://allowed.example/a.png 1x, /shared/image/a.png 2x"><img src="https://allowed.example/a.png"></picture>';
  const target = document.createElement('template'); target.innerHTML = sanitizePackageHtml(input, snapshot);
  assert.equal(target.content.querySelector('#one').hasAttribute('disabled'), false);
  assert.equal(target.content.querySelector('#two').hasAttribute('disabled'), true);
  assert.equal(target.content.querySelector('label').htmlFor, 'one');
  assert.match(target.content.querySelector('source').getAttribute('srcset'), /2x/);
  target.innerHTML = sanitizePackageHtml('<img src="https://blocked.example/a.png">', snapshot);
  assert.equal(target.content.querySelector('img').hasAttribute('src'), false);
  assert.equal(target.content.querySelector('img').dataset.assetState, 'error');
});
test('mapped preview Blob images and source sets remain visible without allowing Blob anchors', () => {
  const html = sanitizePackageHtml('<picture><source srcset="blob:http://127.0.0.1:3500/one 1x"><img src="blob:http://127.0.0.1:3500/one"></picture><a href="blob:http://127.0.0.1:3500/private">x</a>', snapshot);
  const template = document.createElement('template'); template.innerHTML = html;
  assert.match(template.content.querySelector('img').getAttribute('src'), /^blob:/);
  assert.match(template.content.querySelector('source').getAttribute('srcset'), /^blob:/);
  assert.equal(template.content.querySelector('a').hasAttribute('href'), false);
});
test('active output and undeclared styles are refused, while native important and responsive rules stay intact', () => {
  for (const html of ['<script>x</script>', '<img onerror="x()">', '<iframe src="https://example.com">', '<a href="java\nscript:alert(1)">x</a>', '<svg><set attributeName="href" to="javascript:x"/></svg>']) assert.throws(() => assertInertPackageMarkup(html));
  const css = '@import "https://styles.example/base.css";@font-face{font-family:X;src:url(https://fonts.example/x.woff2)}@media(max-width:600px){label{display:block!important}}';
  assert.doesNotThrow(() => assertPackageCss(css, snapshot.renderer.declaration.permissions));
  for (const css of ['@import "https://blocked.example/base.css";', 'p{background:url(https://blocked.example/a.png)}', '@plugin "x";', 'p{behavior:url(x)}']) assert.throws(() => assertPackageCss(css, snapshot.renderer.declaration.permissions));
});
test('preview resource mapping remains private while clipboard markup restores authored URLs and input ownership', () => {
  const mount = document.createElement('div'); mount.innerHTML = '<article><picture><source data-local-asset-srcset="/shared/image/a.png 1x" srcset="blob:local 1x"><img data-local-asset-src="/shared/image/a.png" src="blob:local"></picture></article>';
  const input = { source: 'body', theme: {}, snapshot, css: 'a{}', assets: [] }; bindPackageInput(mount, input);
  assert.equal(packageInputFor(mount.firstChild), input); assert.equal(packageInputFor(mount), input);
  const authored = packageAuthoredMarkup(mount); assert.match(authored, /src="\/shared\/image\/a.png"/); assert.match(authored, /srcset="\/shared\/image\/a.png 1x"/); assert.doesNotMatch(authored, /blob:local/);
  assert.equal(packageResourcePath('/shared/image/a.png', 'articles/month/article', snapshot), 'shared/image/a.png');
  assert.equal(packageResourcePath('media/image/a.png', 'articles/month/article', snapshot), 'articles/month/article/media/image/a.png');
  assert.throws(() => packageResourcePath('../../../../secret', 'articles/month/article', snapshot));
});

test('preview handoff waits for matching committed input and can be cancelled without a false ready result', async () => {
  const root = document.createElement('div'), mount = document.createElement('div'); root.append(mount); document.body.append(root);
  const stop = new AbortController(); const pending = awaitPackagePreview(root, 'next', {}, snapshot, stop.signal);
  stop.abort(); await assert.rejects(pending, { name: 'AbortError' });
  const ready = awaitPackagePreview(root, 'next', {}, snapshot);
  bindPackageInput(mount, { source: 'next', theme: {}, snapshot, css: '' }); await ready;
  root.remove();
});

test('read-only measurement refuses active markup, undeclared styles and unbounded viewport requests', async () => {
  const measure = packageMeasurementServices(snapshot)['measure-v1'], signal = new AbortController().signal;
  for (const input of [{ html: '<p>x</p>', css: '', widths: [] }, { html: '<p>x</p>', css: '', widths: [10000] }, { html: '<script>x</script>', css: '', widths: [375] }, { html: '<p>x</p>', css: '@import "https://blocked.example/x.css";', widths: [375] }]) await assert.rejects(measure(input, signal));
  const controller = new AbortController(); controller.abort(); await assert.rejects(measure({ html: '<p>x</p>', css: '', widths: [375] }, controller.signal), { name: 'AbortError' });
});

test('packages without a stylesheet policy retain immutable image bytes when the original file is absent', async () => {
  const { tree } = await import('./knowledge/fs-fixture.mjs');
  const { initializeLibraryFormat, activateLibraryFormat } = await import('../src/lib/article-format/library.ts');
  const { activateFormatBundle } = await import('../src/lib/article-format/runtime.ts');
  const { DEFAULT_FORMAT_BUNDLE } = await import('../src/lib/article-format/config.ts');
  const { BASIC_THEME } = await import('../src/lib/themes.ts');
  const { contentHash } = await import('../src/lib/article-format/styles.ts');
  const { prepareRenderRecord, persistRenderRecord, restoreRenderEnvironment } = await import('../src/lib/article-format/renderRecords.ts');
  const { retainPreviewInput } = await import('../src/lib/previewSnapshot.ts');
  const root = tree('no-css-assets'); await initializeLibraryFormat(root, 'empty');
  const format = (await activateLibraryFormat(root, () => true)).snapshot;
  const bytes = new Uint8Array([1, 2, 3]), blob = new Blob([bytes], { type: 'image/png' });
  const asset = { path: 'shared/image/retained.png', mime: 'image/png', hash: await contentHash(blob), blob, url: 'blob:retained' };
  const outer = document.createElement('div'), mount = document.createElement('div'); outer.append(mount); document.body.append(outer);
  mount.innerHTML = '<article data-article-content-root><img src="blob:retained" data-local-asset-src="/shared/image/retained.png"></article>';
  bindPackageInput(mount, { source: 'body', theme: BASIC_THEME, snapshot: format, css: 'p{}', assets: [asset] });
  const prepared = await prepareRenderRecord('body', BASIC_THEME, outer, 'p{}', { snapshot: format, root });
  assert.equal(prepared.manifest.policy, null);
  await persistRenderRecord(root, await root.getDirectoryHandle('saved', { create: true }), prepared);
  const restored = await restoreRenderEnvironment(root, prepared.record, format);
  assert.equal(restored.snapshot.environment, undefined);
  assert.deepEqual(new Uint8Array(await restored.snapshot.resources[0].blob.arrayBuffer()), bytes);
  const retained = retainPreviewInput({ snapshot: restored.snapshot, compiledCss: '', article: {}, parsed: {}, media: null });
  assert.notEqual(retained.input.snapshot.resources[0].url, restored.snapshot.resources[0].url);
  assert.equal(retained.input.snapshot.resources[0].blob, restored.snapshot.resources[0].blob);
  mount.innerHTML = '<article data-article-content-root><p>Image removed</p></article>';
  bindPackageInput(mount, { source: 'clean', theme: BASIC_THEME, snapshot: restored.snapshot, css: 'p{}', assets: [] });
  const next = await prepareRenderRecord('clean', BASIC_THEME, outer, 'p{}', { snapshot: restored.snapshot, root });
  assert.equal(next.assets.length, 0, 'a later record must not carry removed article images');
  retained.dispose(); restored.dispose(); outer.remove(); activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
});
