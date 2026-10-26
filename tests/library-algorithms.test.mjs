import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { DEFAULT_ALGORITHMS, algorithmHash, readLibraryAlgorithms, initializeLibraryAlgorithms, validateAlgorithmPackage, validateAlgorithmManifest } from '../src/lib/article-format/algorithms.ts';
import { activateFormatBundle, assertCurrentFormat, getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { activateLibraryFormat, initializeLibraryFormat, readLibraryFormat, getPublicPlatformPreset } from '../src/lib/article-format/library.ts';

function library() {
  const files = new Map(), dirs = new Set(['']), reads = [], writes = [];
  const missing = () => new DOMException('missing', 'NotFoundError');
  const directory = (prefix = '') => ({ name: prefix || 'algorithm-test',
    async getDirectoryHandle(name, options) { const path = prefix ? prefix + '/' + name : name; if (options?.create) dirs.add(path); if (!dirs.has(path)) throw missing(); return directory(path); },
    async getFileHandle(name, options) {
      const path = prefix ? prefix + '/' + name : name;
      if (!files.has(path) && !options?.create) throw missing();
      return { async getFile() { reads.push(path); return new File([files.get(path)], name); },
        async createWritable() { let pending; return { async write(value) { pending = value; }, async close() { writes.push(path); files.set(path, pending); }, async abort() {} }; } };
    },
  });
  const put = (path, value) => { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); files.set(path, value); };
  return { root: directory(), files, dirs, reads, writes, put };
}
async function custom() {
  const data = structuredClone(DEFAULT_ALGORITHMS), component = data.manifest.components[0];
  component.id = 'custom-dark'; component.version = '1.0.0';
  const path = component.scripts[1].path;
  data.files[path] += '\nglobalThis.__must_not_execute_in_host = true;\n';
  component.scripts[1].sha256 = await algorithmHash(data.files[path]);
  data.fingerprint = await algorithmHash(canonicalFormatJson({ manifest: data.manifest, files: data.files }));
  return validateAlgorithmPackage(data);
}
function install(fixture, data) {
  fixture.put('format/algorithms/manifest.json', JSON.stringify(data.manifest));
  for (const [path, value] of Object.entries(data.files)) fixture.put('format/algorithms/' + path, value);
}

test('public component package preserves upstream bytes and verifies every implementation and license', async () => {
  assert.equal((await validateAlgorithmPackage(DEFAULT_ALGORITHMS)).fingerprint, DEFAULT_ALGORITHMS.fingerprint);
  assert.equal(DEFAULT_ALGORITHMS.files['mp-darkmode.js'], await readFile(new URL('../node_modules/mp-darkmode/dist/darkmode.min.js', import.meta.url), 'utf8'));
  assert.equal(DEFAULT_ALGORITHMS.files['mp-darkmode.LICENSE'], await readFile(new URL('../node_modules/mp-darkmode/LICENSE', import.meta.url), 'utf8'));
  for (const mutate of [data => { data.files['mp-darkmode.js'] += 'bad'; }, data => { delete data.files['mp-darkmode.LICENSE']; }, data => { data.files.extra = 'unexpected'; }, data => { data.fingerprint = '0'.repeat(64); }]) {
    const data = structuredClone(DEFAULT_ALGORITHMS); mutate(data); await assert.rejects(validateAlgorithmPackage(data));
  }
});
test('component manifest rejects traversal, remote paths, duplicate IDs and unsupported protocol', () => {
  for (const mutate of [data => { data.components[0].scripts[0].path = '../escape.js'; }, data => { data.components[0].license.path = 'https://example.invalid/license'; }, data => { data.components.push(data.components[0]); }, data => { data.schemaVersion = 9; }, data => { data.components[0].capabilities.transform = 'true'; }]) {
    const data = structuredClone(DEFAULT_ALGORITHMS.manifest); mutate(data); assert.throws(() => validateAlgorithmManifest(data));
  }
});
test('old-library fallback is explicit, read-only and unavailable capabilities remain errors', async () => {
  const fixture = library(), bundle = compileFormatBundle(DEFAULT_FORMAT_BUNDLE);
  const result = await readLibraryAlgorithms(fixture.root, bundle);
  assert.equal(result.source, 'legacy'); assert.match(result.message, /内置默认算法/); assert.equal(fixture.writes.length, 0);
  bundle.formatter.preview.dark.transform = 'preserve';
  assert.equal((await readLibraryAlgorithms(fixture.root, bundle)).message, null);
  bundle.formatter.preview.dark.transform = 'missing-component';
  await assert.rejects(readLibraryAlgorithms(fixture.root, bundle), /所需能力/);
  fixture.dirs.add('format'); fixture.dirs.add('format/algorithms');
  assert.equal((await readLibraryFormat(fixture.root)).source, 'invalid');
  await assert.rejects(readLibraryAlgorithms(fixture.root, compileFormatBundle(DEFAULT_FORMAT_BUNDLE)), /missing/);
});

test('empty initialization includes a pinned interpreter, trio and empty algorithms without fallback', async t => {
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  const fixture = library(), preset = getPublicPlatformPreset('empty');
  await initializeLibraryFormat(fixture.root, 'empty');
  assert.deepEqual([...fixture.files.keys()].sort(), ['format/LICENSES.txt', 'format/algorithms/manifest.json', 'format/config.json', 'format/engine.js', 'format/format-support.json', 'format/formatter.json', 'format/renderer.js', 'format/validator.json']);
  assert.deepEqual(JSON.parse(fixture.files.get('format/algorithms/manifest.json')), { schemaVersion: 2, components: [] });
  assert.deepEqual((await readLibraryFormat(fixture.root)).bundle, preset.bundle);
  const result = await activateLibraryFormat(fixture.root, () => true);
  assert.equal(result.message, null); assert.equal(result.snapshot.error, null);
  assert.equal(result.snapshot.algorithmSource, 'library');
  assert.deepEqual(result.snapshot.algorithms.manifest.components, []);
  assert.deepEqual(result.snapshot.algorithms.files, {});
  assert.equal(result.snapshot.algorithms.fingerprint, preset.algorithms.fingerprint);
  assert.equal(result.snapshot.bundle.formatter.preview.dark.transform, 'preserve');
});

test('empty configuration errors never pass, and selecting another preset never overwrites either existing library', async t => {
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  for (const [first, second] of [['empty', 'wechat-article'], ['wechat-article', 'empty']]) {
    const fixture = library(); await initializeLibraryFormat(fixture.root, first);
    const before = [...fixture.files];
    await initializeLibraryFormat(fixture.root, second);
    assert.deepEqual([...fixture.files], before);
  }
  const fixture = library(); await initializeLibraryFormat(fixture.root, 'empty');
  const manifestPath = 'format/algorithms/manifest.json', original = fixture.files.get(manifestPath);
  for (const value of [undefined, '{', '{"schemaVersion":9,"components":[]}']) {
    if (value === undefined) fixture.files.delete(manifestPath); else fixture.files.set(manifestPath, value);
    const result = await activateLibraryFormat(fixture.root, () => true);
    assert.equal(result.snapshot.source, 'invalid'); assert.ok(result.message);
  }
  fixture.files.set(manifestPath, original);
  fixture.files.delete('format/formatter.json');
  assert.equal((await activateLibraryFormat(fixture.root, () => true)).snapshot.source, 'invalid');
});

test('static hosting confines Blob script permission to the opaque component runner', async () => {
  const source = await readFile(new URL('../scripts/start-static.mjs', import.meta.url), 'utf8');
  const methods = source.slice(source.indexOf('function inlineScriptHashes'), source.indexOf('const server ='));
  const context = { path, crypto, fs: { readFileSync: () => '<html><script src="/runtime.js"></script></html>' } };
  vm.runInNewContext(methods + '\nthis.policy=contentSecurityPolicy;', context);
  const component = context.policy('/build/algorithm/article-algorithm-sandbox.html');
  assert.match(component, /script-src 'self' blob:/); assert.match(component, /connect-src 'none'/);
  assert.match(component, /sandbox allow-scripts(?:;|$)/); assert.doesNotMatch(component, /allow-same-origin/);
  const main = context.policy('/build/editor/index.html');
  assert.match(main, /script-src 'self';/); assert.doesNotMatch(main, /script-src [^;]*blob:/);
  assert.match(main, /frame-ancestors 'none'/);
});
test('library code loads only as inert data; component changes invalidate snapshots and official-default identity', async () => {
  const fixture = library(), data = await custom(), raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  raw.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters.transform = 'custom-dark';
  raw.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters.options = { palette: ['#123456', '#abcdef'], enabled: true, level: 2, nested: { value: null } };
  install(fixture, data);
  const loaded = await readLibraryAlgorithms(fixture.root, compileFormatBundle(raw));
  assert.equal(globalThis.__must_not_execute_in_host, undefined);
  assert.equal(loaded.source, 'library'); assert.equal(fixture.writes.length, 0);
  const first = activateFormatBundle(raw, 'one', 'library', undefined, loaded.algorithms, loaded.source);
  assert.equal(first.officialDefault, false); assert.ok(first.id.endsWith(data.fingerprint));
  const reads = fixture.reads.length;
  for (let i = 0; i < 100; i++) getFormatSnapshot();
  assert.equal(fixture.reads.length, reads);
  const second = activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), 'two', 'library', undefined, DEFAULT_ALGORITHMS, 'library');
  assert.notEqual(first.id, second.id); assert.throws(() => assertCurrentFormat(first));
  assert.throws(() => { first.algorithms.files['mp-darkmode.js'] = 'changed'; });
});
test('bad files or missing declared capabilities invalidate activation instead of passing with defaults', async () => {
  const fixture = library(); await initializeLibraryFormat(fixture.root); fixture.files.delete('format/config.json');
  fixture.files.set('format/algorithms/mp-darkmode.js', 'tampered');
  const activated = await activateLibraryFormat(fixture.root, () => true);
  assert.equal(activated.snapshot.source, 'invalid'); assert.match(activated.message, /校验失败/);
  install(fixture, DEFAULT_ALGORITHMS);
  const manifest = JSON.parse(fixture.files.get('format/algorithms/manifest.json')); manifest.components[0].capabilities.validators = [];
  fixture.files.set('format/algorithms/manifest.json', JSON.stringify(manifest));
  const missing = await activateLibraryFormat(fixture.root, () => true);
  assert.equal(missing.snapshot.source, 'invalid'); assert.match(missing.message, /所需能力/);
});

test('disabled standards still load the full trio and validate algorithm hashes; formatter transforms stay independent', async () => {
  const fixture = library(); await initializeLibraryFormat(fixture.root); fixture.files.delete('format/config.json');
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.validator.meta.enabled = false;
  fixture.files.set('format/validator.json', JSON.stringify(raw.validator));
  const first = await activateLibraryFormat(fixture.root, () => true);
  assert.equal(first.snapshot.error, null); assert.equal(first.snapshot.bundle.validator.meta.enabled, false);
  assert.equal(first.snapshot.bundle.formatter.preview.dark.transform, compileFormatBundle(DEFAULT_FORMAT_BUNDLE).formatter.preview.dark.transform);
  for (const name of ['format-support.json', 'validator.json', 'formatter.json']) assert.ok(fixture.reads.includes('format/' + name));
  fixture.files.set('format/algorithms/mp-darkmode.js', 'tampered');
  assert.equal((await activateLibraryFormat(fixture.root, () => true)).snapshot.source, 'invalid');
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
});
test('stale activation cannot publish, and initialization does not overwrite an existing component directory', async () => {
  const fixture = library(); await initializeLibraryFormat(fixture.root);
  const before = getFormatSnapshot().id, writes = fixture.writes.length;
  assert.equal((await activateLibraryFormat(fixture.root, () => false)).snapshot, null);
  assert.equal(getFormatSnapshot().id, before); assert.equal(fixture.writes.length, writes);
  await assert.rejects(initializeLibraryAlgorithms(fixture.root), /未覆盖/);
  assert.equal(fixture.writes.length, writes);
});
test('trusted bridge validates all nodes, findings and resource references before applying paint', async () => {
  const window = {};
  vm.runInNewContext(await readFile(new URL('../public/algorithm/article-algorithm-host.js', import.meta.url), 'utf8'), { window, CSS: { supports: () => true } });
  const properties = window.ArticleAlgorithmHost.paintProperties;
  const original = Object.fromEntries(properties.map(property => [property, property === 'color' ? 'rgb(0, 0, 0)' : 'none']));
  const result = { paints: [{ node: 0, properties: original }], findings: [{ ruleId: 'contrast', node: 0, outcome: 'violation' }] };
  const validate = data => window.ArticleAlgorithmHost.validateResult(data, [{}], [{ id: 'contrast' }], [original]);
  assert.equal(validate(result), result);
  for (const mutate of [data => { data.paints[0].node = 10; }, data => { data.paints.push(data.paints[0]); }, data => { data.paints[0].properties.width = '100px'; }, data => { data.paints[0].properties['background-image'] = 'url(https://example.invalid/leak)'; }, data => { data.findings[0].ruleId = 'unknown'; }, data => { data.findings[0].outcome = 'passed'; }]) {
    const data = structuredClone(result); mutate(data); assert.throws(() => validate(data));
  }
});

test('paint writeback preserves resolved variable-border geometry through HTML serialization', async () => {
  const dom = new JSDOM('<article style="border:1px solid var(--line);border-left:3px dashed var(--line)"></article>');
  const root = dom.window.document.querySelector('article');
  root.getBoundingClientRect = () => ({ x: 0, y: 0, width: 750, height: 40 });
  const frame = { style: {}, setAttribute() {}, getBoundingClientRect: () => ({ width: 750, height: 960 }), contentWindow: { postMessage() {} }, remove() {} };
  const channels = [];
  class Channel { constructor() { this.port1 = { close() {} }; this.port2 = { close() {} }; channels.push(this); } }
  const window = { parent: {}, innerWidth: 750, innerHeight: 960, setTimeout: () => 1 };
  const document = { baseURI: 'http://localhost:3500/themes/', fonts: { ready: Promise.resolve() },
    head: { querySelectorAll: () => [], append() {} }, body: root.parentElement,
    createElement: tag => tag === 'iframe' ? frame : dom.window.document.createElement(tag) };
  document.body.append = () => frame.onload();
  // jsdom has CSSOM shorthand mutation but no var() computed-value resolution.
  // Supply the browser-resolved geometry; the actual inline style and HTML
  // round trip below use its real CSSStyleDeclaration implementation.
  const computed = property => /^border-(top|right|bottom|left)-width$/.test(property) ? (property.includes('-left-') ? '3px' : '1px')
    : /^border-(top|right|bottom|left)-style$/.test(property) ? (property.includes('-left-') ? 'dashed' : 'solid')
    : property.includes('color') ? 'rgb(20, 20, 20)' : 'none';
  vm.runInNewContext(await readFile(new URL('../public/algorithm/article-algorithm-host.js', import.meta.url), 'utf8'), {
    window, document, URL, MessageChannel: Channel, crypto: { randomUUID: () => 'border-request' },
    CSS: { supports: () => true }, clearTimeout() {}, getComputedStyle: () => ({ getPropertyValue: computed }),
  });
  window.ArticleAlgorithmHost.configure(DEFAULT_ALGORITHMS);
  const before = root.outerHTML, pending = window.ArticleAlgorithmHost.run(root, compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.outerHTML, before, 'no geometry or paint is written before packet validation');
  const properties = Object.fromEntries(window.ArticleAlgorithmHost.paintProperties.map(property => [property, property.includes('color') ? 'rgb(115, 115, 115)' : 'none']));
  channels[0].port1.onmessage({ data: { request: 'border-request', result: { paints: [{ node: 0, properties }], findings: [] } } });
  await pending;
  const restored = new JSDOM(root.outerHTML).window.document.querySelector('article');
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.equal(restored.style.getPropertyValue('border-' + side + '-width'), side === 'left' ? '3px' : '1px');
    assert.equal(restored.style.getPropertyValue('border-' + side + '-style'), side === 'left' ? 'dashed' : 'solid');
    assert.equal(restored.style.getPropertyValue('border-' + side + '-color'), 'rgb(115, 115, 115)');
  }
});

test('the bridge closes ports and frames on timeout, navigation and invalid output without applying partial paint', async () => {
  const source = await readFile(new URL('../public/algorithm/article-algorithm-host.js', import.meta.url), 'utf8');
  for (const cause of ['timeout', 'navigation', 'invalid-output']) {
    const writes = [], policies = [], ports = [], timers = [];
    let removed = 0, inertCopies = 0;
    const frame = { style: {}, setAttribute(name, value) { this[name] = value; }, getBoundingClientRect() { return { width: 750, height: 960 }; }, contentWindow: { postMessage() {} }, remove() { removed++; } };
    class Channel { constructor() { this.port1 = { close() { ports.push(1); } }; this.port2 = { close() { ports.push(2); } }; channels.push(this); } }
    const channels = [];
    const window = { parent: {}, innerWidth: 750, innerHeight: 960, setTimeout(callback) { timers.push(callback); return 1; } };
    const document = { baseURI: 'http://localhost:3501/editor/', fonts: { ready: Promise.resolve() }, head: { querySelectorAll() { return []; }, append(policy) { policies.push(policy.content); } }, body: { append(element) { element.onload(); } }, createElement(tag) { return tag === 'iframe' ? frame : tag === 'template' ? { content: { append() { inertCopies++; } } } : {}; } };
    const copy = { outerHTML: '<article></article>', querySelectorAll() { return []; }, setAttribute() {}, getAttribute() { return null; } };
    const root = { outerHTML: '<article></article>', parentElement: document.body, cloneNode() { return copy; }, getBoundingClientRect() { return { x: 0, y: 0, width: 750, height: 40 }; }, querySelectorAll() { return []; }, style: { setProperty(...args) { writes.push(args); } } };
    vm.runInNewContext(source, { window, document, URL, MessageChannel: Channel, crypto: { randomUUID: () => 'request' }, CSS: { supports: () => true }, clearTimeout() {}, getComputedStyle: () => ({ getPropertyValue: () => 'none' }) });
    window.ArticleAlgorithmHost.configure(DEFAULT_ALGORITHMS);
    const pending = window.ArticleAlgorithmHost.run(root, compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(inertCopies, 1, 'transport resource tokens are prepared in an inert template');
    assert.equal(frame.sandbox, 'allow-scripts'); assert.ok(policies.includes("frame-src 'none'"));
    if (cause === 'timeout') {
      channels[0].port1.onmessage({ data: { request: 'wrong', result: {} } });
      timers[0]();
    } else if (cause === 'navigation') frame.onload();
    else channels[0].port1.onmessage({ data: { request: 'request', result: { paints: [{ node: 0, properties: { color: 'blue', width: '100px' } }], findings: [] } } });
    await assert.rejects(pending, cause === 'timeout' ? /ALGORITHM_TIMEOUT/ : cause === 'navigation' ? /ALGORITHM_NAVIGATION_REJECTED/ : /ALGORITHM_INVALID_PAINT/);
    assert.equal(removed, 1); assert.equal(ports.length, 2); assert.equal(writes.length, 0);
  }
});
