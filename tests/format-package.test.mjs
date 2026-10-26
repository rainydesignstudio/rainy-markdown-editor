import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { tree, snapshot as diskSnapshot } from './knowledge/fs-fixture.mjs';
import { initializeLibraryFormat, activateLibraryFormat, readLibraryFormat } from '../src/lib/article-format/library.ts';
import { rendererDeclarationGuard, validateRendererPackage, readRendererPackage, rendererPolicy, validatePackageResult, rendererContextPolicy, invokeRenderer, disposeRendererRunners } from '../src/lib/article-format/package.ts';
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, getFormatSnapshot, assertCurrentFormat } from '../src/lib/article-format/runtime.ts';
import { algorithmHash } from '../src/lib/article-format/algorithms.ts';

async function initialized(preset = 'empty') { const root = tree('package-test'); await initializeLibraryFormat(root, preset); return root; }
const formatOf = root => root.children.get('format');
const packageFile = async root => JSON.parse(await (await (await formatOf(root).getFileHandle('config.json')).getFile()).text());
const reset = t => t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));

test('new public libraries retain a complete hashed interpreter and policy; activation does not execute it in the application', async t => {
  reset(t);
  for (const preset of ['wechat-article', 'empty']) {
    const root = await initialized(preset), before = diskSnapshot(root), config = await packageFile(root);
    const result = await activateLibraryFormat(root, () => true);
    assert.equal(result.snapshot.error, null); assert.equal(result.snapshot.renderer.declaration.protocol, 'rainy-format/2');
    assert.equal(result.snapshot.rawBundle.support.meta.id, config.meta.id);
    assert.equal(result.snapshot.renderer.files[config.renderer.entry].includes('export'), true);
    assert.deepEqual(result.snapshot.rawBundle, rendererPolicy(result.snapshot.renderer));
    for (const file of config.renderer.files) assert.equal(await algorithmHash(result.snapshot.renderer.files[file.path]), file.sha256);
    assert.equal(diskSnapshot(root), before, 'load and activation are read-only');
  }
});
test('a damaged or partial executable package cannot fall back to a built-in interpreter or mixed policies', async t => {
  reset(t);
  const root = await initialized(), dir = formatOf(root), config = await packageFile(root);
  const name = config.renderer.entry.split('/').at(-1), original = dir.children.get(name).value;
  for (const value of [undefined, original + '\n// modified']) {
    if (value === undefined) dir.children.delete(name); else dir.seed(name, value);
    const result = await activateLibraryFormat(root, () => true);
    assert.equal(result.snapshot.source, 'invalid'); assert.ok(result.message);
  }
  dir.seed(name, original);
  const formatter = dir.children.get('formatter.json'); formatter.value += ' ';
  assert.equal((await activateLibraryFormat(root, () => true)).snapshot.source, 'invalid', 'even a policy file byte change requires a matching declared hash');
});
test('an existing library or partial initialization is never upgraded or repaired implicitly', async t => {
  reset(t);
  const root = await initialized(), before = diskSnapshot(root);
  await initializeLibraryFormat(root, 'wechat-article'); assert.equal(diskSnapshot(root), before);
  const dir = formatOf(root); dir.children.delete('renderer.js');
  const partial = diskSnapshot(root); await initializeLibraryFormat(root); assert.equal(diskSnapshot(root), partial);
  assert.equal((await activateLibraryFormat(root, () => true)).snapshot.source, 'invalid');
});
test('opaque package rules are not interpreted by the application legacy operator table', async t => {
  reset(t);
  const root = await initialized(), dir = formatOf(root), config = await packageFile(root);
  const formatter = JSON.parse(dir.children.get('formatter.json').value);
  formatter.steps = [{ id: 'custom', operator: 'my-package-only-operation', enabled: true, parameters: { arbitrary: true } }];
  dir.seed('formatter.json', JSON.stringify(formatter));
  config.renderer.files.find(f => f.path === 'format/formatter.json').sha256 = await algorithmHash(dir.children.get('formatter.json').value);
  dir.seed('config.json', JSON.stringify(config));
  const result = await activateLibraryFormat(root, () => true);
  assert.equal(result.snapshot.error, null); assert.equal(result.snapshot.rawBundle.formatter.steps[0].operator, 'my-package-only-operation');
  assert.equal(result.snapshot.bundle.formatter.output.dropCssProperties.length, 0, 'no hidden legacy formatting pass');
});
test('editing only format files adds arbitrary action IDs and settings; reload publishes a new immutable identity', async t => {
  reset(t);
  const root = await initialized(), first = (await activateLibraryFormat(root, () => true)).snapshot, dir = formatOf(root), config = await packageFile(root);
  config.renderer.actions.push({ id: 'new-output-type', label: 'Custom output', kind: 'export', extension: 'txt' });
  config.renderer.settings = [{ key: 'suffix', label: 'Suffix', type: 'text' }, { key: 'enabled', label: 'Enabled', type: 'boolean' }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'layout', label: 'Layout', type: 'select', options: ['one', 'two'] }];
  config.renderer.values = { suffix: 'A', enabled: true, amount: 3, layout: 'one' };
  dir.seed('config.json', JSON.stringify(config));
  const second = (await activateLibraryFormat(root, () => true)).snapshot;
  assert.equal(second.error, null); assert.notEqual(second.renderer.fingerprint, first.renderer.fingerprint); assert.throws(() => assertCurrentFormat(first));
  assert.ok(second.renderer.declaration.actions.some(a => a.id === 'new-output-type'));
  assert.equal(first.renderer.declaration.settings.length, 0);
  assert.throws(() => { second.renderer.files['format/renderer.js'] = ''; });
});
test('package declarations reject unsupported protocols, traversal, duplicate bindings and invalid settings', async () => {
  const config = await packageFile(await initialized());
  for (const change of [
    d => { d.protocol = 'rainy-format/9'; }, d => { d.protocol = ['rainy-format/1']; },
    d => { d.entry = '../outside.js'; }, d => { d.entry = 'https://example.com/a.js'; },
    d => { d.files.push(d.files[0]); }, d => { d.actions.push(d.actions[0]); },
    d => { d.settings = [{ key: 'size', label: 'Size', type: 'number' }]; d.values = { size: 'large' }; },
    d => { d.settings = [{ key: 'size', label: 'Size', type: 'select', options: ['3'] }]; d.values = { size: 3 }; },
    d => { d.values.unknown = 3; }, d => { d.permissions.images = ['https://example.com/path']; },
    d => { d.files = d.files.filter(f => f.path !== 'format/validator.json'); },
  ]) { const declaration = structuredClone(config.renderer); change(declaration); assert.throws(() => rendererDeclarationGuard(declaration, 'renderer')); }
});
test('result envelopes reject executable transport data, unsupported values and forged validation status', () => {
  assert.deepEqual(validatePackageResult({ html: '', css: '', complete: false, issues: [], passed: [] }), { html: '', css: '', complete: false, issues: [], passed: [] });
  for (const result of [{ html: 4 }, { complete: 'true' }, { encoding: ['base64'] }, { issues: [{ message: 'x', severity: ['error'] }] }, { issues: [{ message: 'x', severity: 'passed' }] }, { issues: [{ message: 'x', severity: 'error', line: -1 }] }, { execute: 'alert(1)' }, { extension: '../js' }]) assert.throws(() => validatePackageResult(result));
});
test('source fingerprints cover every declared byte and the complete configuration, including settings', async t => {
  reset(t);
  const root = await initialized(), pkg = (await activateLibraryFormat(root, () => true)).snapshot.renderer;
  assert.equal((await validateRendererPackage(pkg)).fingerprint, pkg.fingerprint);
  for (const mutate of [p => { p.files['format/engine.js'] += ' '; }, p => { p.files.extra = ''; }, p => { p.declaration.version = 'other'; }, p => { p.fingerprint = '0'.repeat(64); }]) {
    const modified = structuredClone(pkg); mutate(modified); await assert.rejects(validateRendererPackage(modified));
  }
});
test('late library activation cannot publish a new format or change an existing library', async t => {
  reset(t);
  const root = await initialized(), before = diskSnapshot(root), current = getFormatSnapshot();
  assert.equal((await activateLibraryFormat(root, () => false)).snapshot, null);
  assert.equal(getFormatSnapshot(), current); assert.equal(diskSnapshot(root), before);
});
test('the transport is opaque and network-blocked; remote images are confined to the inert preview document', async () => {
  const source = await readFile(new URL('../scripts/start-static.mjs', import.meta.url), 'utf8');
  const methods = source.slice(source.indexOf('function inlineScriptHashes'), source.indexOf('const server ='));
  const context = { path, crypto, fs: { readFileSync: () => '<html></html>' } }; vm.runInNewContext(methods + '\nthis.policy=contentSecurityPolicy;', context);
  const runner = context.policy('/out/format/article-package-sandbox.html');
  assert.match(runner, /sandbox allow-scripts(?:;|$)/); assert.doesNotMatch(runner, /allow-same-origin|unsafe-eval/); assert.match(runner, /connect-src 'none'/);
  const display = context.policy('/out/format/article-package-preview.html');
  assert.match(display, /script-src 'none'/); assert.match(display, /img-src data: blob: https:/); assert.match(display, /form-action 'none'/);
  assert.doesNotMatch(context.policy('/out/editor/index.html'), /img-src[^;]*https:|script-src[^;]*blob:/);
});

test('binary resources and UTF-8 BOM bytes survive hashing and reload unchanged', async t => {
  reset(t);
  const root = await initialized(), dir = formatOf(root), config = await packageFile(root);
  const bytes = new Uint8Array([0, 255, 254, 127, 1]); dir.seed('asset.bin', bytes);
  config.renderer.files.push({ path: 'format/asset.bin', sha256: await algorithmHash(new Blob([bytes])), encoding: 'base64' });
  const policy = dir.children.get('validator.json'); policy.value = '\uFEFF' + policy.value;
  config.renderer.files.find(ref => ref.path === 'format/validator.json').sha256 = await algorithmHash(policy.value);
  const pkg = await readRendererPackage(root, config.renderer, config);
  assert.equal(pkg.files['format/asset.bin'], Buffer.from(bytes).toString('base64'));
  assert.equal(pkg.files['format/validator.json'].charCodeAt(0), 0xfeff);
  assert.equal(rendererPolicy(pkg).validator.meta.id, 'empty');
  dir.seed('asset.bin', new Uint8Array([0])); await assert.rejects(readRendererPackage(root, config.renderer));
});
test('runner services are request-scoped, cancelled on teardown, and isolated by library and action role', async t => {
  disposeRendererRunners();
  const first = (await activateLibraryFormat(await initialized(), () => true)).snapshot;
  const second = (await activateLibraryFormat(await initialized(), () => true)).snapshot;
  const oldDocument = globalThis.document, oldWindow = globalThis.window, frames = [];
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.document = { body: { append(frame) { frames.push(frame); queueMicrotask(() => frame.onload()); } }, createElement() {
    const frame = { style: {}, setAttribute() {}, remove() { this.removed = true; this.port?.close(); }, contentWindow: { postMessage(_boot, _target, [port]) {
      frame.port = port;
      port.onmessage = ({ data }) => { if (data.action) { if (data.action === 'validate') port.postMessage({ request: data.request, result: { complete: true, issues: [], passed: [] } }); else port.postMessage({ request: data.request, call: 'one', service: 'probe', input: { value: 1 } }); } };
      port.postMessage({ ready: true });
    } } }; return frame;
  } };
  t.after(() => { disposeRendererRunners(); globalThis.document = oldDocument; globalThis.window = oldWindow; activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'); });
  let serviceSignal; let begun;
  const started = new Promise(resolve => { begun = resolve; });
  const controller = new AbortController();
  const pending = invokeRenderer(first, 'html', {}, controller.signal, { probe: async (input, signal) => { assert.equal(input.value, 1); serviceSignal = signal; begun(); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); return null; } });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started;
  assert.equal((await invokeRenderer(first, 'validate', {})).complete, true);
  assert.equal((await invokeRenderer(second, 'validate', {})).complete, true);
  assert.equal(frames.length, 3, 'same bytes have separate library and operation state');
  controller.abort(); await rejected;
  assert.equal(serviceSignal.aborted, true); assert.equal(frames[0].removed, true);
});


test('host-only preview width never reaches a pinned renderer schema and does not mutate its immutable configuration', () => {
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.support.meta.rendering = { previewWidth:'available' };
  const configuration = { rendering:{styleAuthority:'library',previewMode:'light',previewWidth:'available'},capabilities:{} };
  const snapshot = {rawBundle:raw,configuration}, before = JSON.stringify(snapshot), context = rendererContextPolicy(snapshot);
  assert.equal(context.configuration.rendering.previewWidth,undefined);
  assert.deepEqual(context.configuration.rendering,{styleAuthority:'library',previewMode:'light'});
  assert.equal(context.rawBundle.support.meta.rendering,undefined);
  assert.equal(JSON.stringify(snapshot),before);
  assert.equal(snapshot.configuration.rendering.previewWidth,'available');
});
