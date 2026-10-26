import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { tree } from './knowledge/fs-fixture.mjs';
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:3500/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser });
const { initializeLibraryFormat, activateLibraryFormat } = await import('../src/lib/article-format/library.ts');
const { activateFormatBundle } = await import('../src/lib/article-format/runtime.ts');
const { DEFAULT_FORMAT_BUNDLE } = await import('../src/lib/article-format/config.ts');
const { contentHash } = await import('../src/lib/article-format/styles.ts');
const { materializePackageResources } = await import('../src/lib/article-format/packageResources.ts');
const { assertInertPackageMarkup, assertPackageCss } = await import('../src/lib/article-format/packageRendering.ts');

async function fixture(t) {
  const root = tree('portable-output'); await initializeLibraryFormat(root, 'empty');
  const file = root.children.get('format').children.get('config.json'), config = JSON.parse(file.value);
  for (const [path, source, binary] of [
    ['styles/a.css', '.card{background:url("@assets/a.png")}'],
    ['assets/a.png', new Uint8Array([1, 2, 3]), true],
    ['assets/b.png', new Uint8Array([4, 5, 6]), true],
  ]) { root.seed(path, source); config.renderer.files.push({ path, sha256: await contentHash(new Blob([source])), ...(binary ? { encoding: 'base64' } : {}) }); }
  file.value = JSON.stringify(config);
  const snapshot = (await activateLibraryFormat(root, () => true)).snapshot;
  assert.equal(snapshot.error, null);
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  return snapshot.renderer;
}

test('web output contains standard static CSS and embedded assets while keeping the document envelope', async t => {
  const pkg = await fixture(t);
  const raw = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Export</title><style>@import "@styles/a.css";</style></head><body><img src="@assets/a.png" srcset="@assets/a.png 1x, assets/b.png 2x"><p style="background:url(@assets/b.png)">Text</p></body></html>';
  const output = materializePackageResources(pkg, { data: raw, extension: 'html', mime: 'text/html' }).data;
  assert.match(output, /<!doctype html>/i); assert.match(output, /lang="en"/); assert.match(output, /<title>Export<\/title>/);
  assert.doesNotMatch(output, /@styles|@assets|blob:/); assert.match(output, /data:image\/png;base64,AQID/); assert.match(output, /data:image\/png;base64,BAUG/);
  const parsed = new dom.window.DOMParser().parseFromString(output, 'text/html');
  assert.match(parsed.querySelector('img').getAttribute('srcset'), /AQID 1x, data:image\/png;base64,BAUG 2x/);
  assert.doesNotThrow(() => assertInertPackageMarkup(output, true, pkg.declaration.permissions));
  assert.doesNotThrow(() => assertPackageCss(parsed.querySelector('style').textContent, pkg.declaration.permissions));
  assert.equal(raw.includes('@styles'), true, 'source text remains unchanged');
});

test('resource resolution preserves the existing active-content floor and rejects unknown Blob sources', async t => {
  const pkg = await fixture(t);
  for (const html of ['<script>alert(1)</script>', '<img src="@assets/a.png" onerror="alert(1)">', '<link rel="stylesheet" href="@styles/a.css">']) {
    const output = materializePackageResources(pkg, { html }).html;
    assert.throws(() => assertInertPackageMarkup(output, false, pkg.declaration.permissions));
  }
  assert.throws(() => materializePackageResources(pkg, { html: '<img src="blob:temporary">' }), /Blob/);
});

test('developer hash policy survives render-record preparation, persistence and historical restoration', async t => {
  const { DEFAULT_ALGORITHMS, validateAlgorithmPackage } = await import('../src/lib/article-format/algorithms.ts');
  const { canonicalFormatJson } = await import('../src/lib/article-format/config.ts');
  const { BASIC_THEME } = await import('../src/lib/themes.ts');
  const { prepareRenderRecord, persistRenderRecord, restoreRenderEnvironment } = await import('../src/lib/article-format/renderRecords.ts');
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.support.meta.id = raw.validator.meta.id = raw.formatter.meta.id = 'developer-history';
  raw.support.rules = []; raw.support.manualReview = []; raw.validator.rules = []; raw.validator.meta.enabled = false; raw.formatter.steps = [];
  const data = structuredClone(DEFAULT_ALGORITHMS);
  for (const c of data.manifest.components) for (const file of [...c.scripts, c.license]) delete file.sha256;
  data.fingerprint = await contentHash(canonicalFormatJson({ manifest: data.manifest, files: data.files }));
  const policy = { validation: { verifySha256: false } };
  const algorithms = await validateAlgorithmPackage(data, policy), root = tree('developer-history');
  const snapshot = activateFormatBundle(raw, root.name, 'library', undefined, algorithms, 'library', { schemaVersion: 1, meta: { id: raw.support.meta.id }, ...policy });
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  const outer = document.createElement('div'); outer.innerHTML = '<article class="article-preview"><section class="article-body"><p>body</p></section></article>';
  const prepared = await prepareRenderRecord('body', BASIC_THEME, outer, 'p{}', { snapshot, root });
  await persistRenderRecord(root, await root.getDirectoryHandle('saved', { create: true }), prepared);
  const restored = await restoreRenderEnvironment(root, prepared.record, snapshot);
  assert.equal(restored.snapshot.configuration.validation.verifySha256, false);
  assert.equal(restored.snapshot.algorithms.fingerprint, algorithms.fingerprint);
  assert.deepEqual(restored.snapshot.algorithms.files, algorithms.files);
  restored.dispose();
});
