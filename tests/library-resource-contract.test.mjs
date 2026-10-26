import test from 'node:test';
import assert from 'node:assert/strict';
import { tree, snapshot as diskSnapshot } from './knowledge/fs-fixture.mjs';
import { initializeLibraryFormat, activateLibraryFormat } from '../src/lib/article-format/library.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { readRendererPackage, validateRendererPackage, rendererPackageData, invokeRenderer } from '../src/lib/article-format/package.ts';
import { validateLibraryConfiguration, libraryCapability } from '../src/lib/article-format/libraryConfiguration.ts';
import { contentHash, loadStylesheetEnvironment } from '../src/lib/article-format/styles.ts';
import { validateAlgorithmPackage, initializeLibraryAlgorithms, readLibraryAlgorithms } from '../src/lib/article-format/algorithms.ts';
import { resolveLibraryResource } from '../src/lib/article-format/resourcePaths.ts';
import { libraryCssPaths, readLibraryCss, saveLibraryCss } from '../src/lib/article-format/sourceStyles.ts';
import { materializePackageResources } from '../src/lib/article-format/packageResources.ts';

async function fixture(t, preset = 'empty') {
  const root = tree('contract'); await initializeLibraryFormat(root, preset);
  const configFile = root.children.get('format').children.get('config.json');
  const config = JSON.parse(configFile.value);
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  return { root, config, configFile, writeConfig() { configFile.value = JSON.stringify(config); } };
}
async function add(f, path, source, binary = false) {
  f.root.seed(path, source);
  f.config.renderer.files.push({ path, sha256: await contentHash(new Blob([source])), ...(binary ? { encoding: 'base64' } : {}) });
  f.writeConfig();
}

test('new libraries use library-root paths, strict hashes and a required host Markdown export', async t => {
  const f = await fixture(t), before = diskSnapshot(f.root);
  assert.equal(f.config.renderer.protocol, 'rainy-format/2');
  assert.equal(f.config.renderer.entry, 'format/renderer.js');
  assert.equal(f.config.validation.verifySha256, true);
  const loaded = (await activateLibraryFormat(f.root, () => true)).snapshot;
  assert.equal(loaded.error, null);
  const source = '---\ntitle: unsaved\n---\n\n# draft  \n';
  const result = await invokeRenderer(loaded, 'markdown', { source });
  assert.equal(result.data, source); assert.equal(result.extension, 'md');
  assert.equal(diskSnapshot(f.root), before, 'load and source export do not write');
  f.config.renderer.actions = f.config.renderer.actions.filter(action => action.id !== 'markdown');
  assert.throws(() => validateLibraryConfiguration(f.config), /Markdown/);
  assert.equal(libraryCapability({ error: 'broken renderer' }, 'exportMarkdown').enabled, true);
  assert.equal(libraryCapability({ error: 'broken renderer' }, 'exportPng').enabled, false);
});

test('developer hash opt-out allows external edits, changes identities and remains read-only; strict re-enable fails honestly', async t => {
  const f = await fixture(t); await add(f, 'styles/a/b/site.css', 'p { color:red }');
  const first = (await activateLibraryFormat(f.root, () => true)).snapshot;
  f.config.validation.verifySha256 = false;
  for (const file of f.config.renderer.files) delete file.sha256;
  f.root.seed('styles/a/b/site.css', 'p { color:blue }'); f.writeConfig();
  const before = diskSnapshot(f.root), next = (await activateLibraryFormat(f.root, () => true)).snapshot;
  assert.equal(next.error, null); assert.notEqual(first.renderer.fingerprint, next.renderer.fingerprint);
  assert.equal(next.renderer.files['styles/a/b/site.css'], 'p { color:blue }');
  assert.equal(diskSnapshot(f.root), before);
  f.config.validation.verifySha256 = true; f.writeConfig();
  assert.equal((await activateLibraryFormat(f.root, () => true)).snapshot.source, 'invalid');
  f.config.validation.verifySha256 = false; f.writeConfig();
  assert.equal((await activateLibraryFormat(f.root, () => true)).snapshot.error, null);
  const pkg = await readRendererPackage(f.root, f.config.renderer, f.config);
  const changed = structuredClone(pkg); changed.files['styles/a/b/site.css'] += ' ';
  await assert.rejects(validateRendererPackage(changed), /identity/);
});

test('hash policy applies to algorithm scripts and licenses without skipping actual package identity', async t => {
  const f = await fixture(t, 'wechat-article');
  const pkg = await readRendererPackage(f.root, f.config.renderer, f.config);
  const manifest = JSON.parse(pkg.files['format/algorithms/manifest.json']);
  assert.equal(manifest.schemaVersion, 2);
  const files = Object.fromEntries(manifest.components.flatMap(c => [...c.scripts, c.license]).map(file => [file.path, pkg.files[file.path]]));
  const installed = tree('root-algorithms'), complete = { manifest, files, fingerprint: await contentHash(canonicalFormatJson({ manifest, files })) };
  await initializeLibraryAlgorithms(installed, complete);
  const loaded = await readLibraryAlgorithms(installed, compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
  assert.deepEqual(loaded.algorithms.files, files);
  assert.equal(installed.children.get('format').children.get('algorithms').children.has('mp-darkmode.js'), true);
  const occupied = tree('existing-component', { [Object.keys(files)[0]]: 'user bytes' });
  const before = diskSnapshot(occupied);
  await assert.rejects(initializeLibraryAlgorithms(occupied, complete), error => error.messageKey === 'libraryContract.existingFile');
  assert.equal(diskSnapshot(occupied), before);
  for (const c of manifest.components) for (const file of [...c.scripts, c.license]) delete file.sha256;
  const data = { manifest, files }, fingerprint = await contentHash(canonicalFormatJson(data));
  await assert.rejects(validateAlgorithmPackage({ ...data, fingerprint }));
  assert.equal((await validateAlgorithmPackage({ ...data, fingerprint }, { validation: { verifySha256: false } })).fingerprint, fingerprint);
  files[Object.keys(files)[0]] += ' ';
  await assert.rejects(validateAlgorithmPackage({ ...data, fingerprint }, { validation: { verifySha256: false } }), /校验|verification|hash/i);
});

test('aliases resolve deep CSS and font dependencies only within explicitly declared library files', async t => {
  const f = await fixture(t);
  await add(f, 'styles/a/site.css', '@import "@styles/common/tokens.css";\n@font-face{font-family:X;src:url("@assets/fonts/a.woff2")}');
  await add(f, 'styles/common/tokens.css', '.example {color:red}');
  await add(f, 'assets/fonts/a.woff2', new Uint8Array([0, 1, 2]), true);
  const resolution = { aliases: f.config.resources.aliases, allowedPaths: f.config.renderer.files.map(file => file.path) };
  const env = await loadStylesheetEnvironment(f.root, { entry: '@styles/a/site.css', publicRoot: 'assets' }, resolution);
  t.after(() => env.dispose());
  assert.deepEqual(Object.keys(env.rawFiles).sort(), ['styles/a/site.css', 'styles/common/tokens.css']);
  assert.match(env.files['styles/a/site.css'], /styles\/common\/tokens\.css/);
  assert.match(env.files['styles/a/site.css'], /blob:/);
  assert.equal(env.assets[0].path, 'assets/fonts/a.woff2');
  assert.equal(resolveLibraryResource('@styles/a/b/c/d.css', resolution), 'styles/a/b/c/d.css');
  for (const value of ['../secret', 'styles/../secret', 'styles/%2e%2e/secret', '@missing/a.css', 'https://example.com/a.css']) assert.throws(() => resolveLibraryResource(value, resolution));
  await assert.rejects(loadStylesheetEnvironment(f.root, { entry: 'styles/a/site.css', publicRoot: 'assets' }, { ...resolution, allowedPaths: ['styles/a/site.css'] }), /未列入|Undeclared/);
  f.root.seed('styles/common/tokens.css', '@import "@styles/a/site.css";');
  await assert.rejects(loadStylesheetEnvironment(f.root, { entry: 'styles/a/site.css', publicRoot: 'assets' }, resolution), /循环|circular/i);
});

test('library-root CSS saves update strict hashes; developer saves leave config bytes intact and reject concurrent edits', async t => {
  const f = await fixture(t); await add(f, 'styles/a/site.css', 'p { color:red }');
  let snapshot = (await activateLibraryFormat(f.root, () => true)).snapshot;
  assert.deepEqual(libraryCssPaths(snapshot), ['styles/a/site.css']);
  let source = await readLibraryCss(f.root, snapshot, 'styles/a/site.css', () => true);
  await saveLibraryCss(source, 'p { color:blue }', () => true);
  const saved = JSON.parse(await (await f.configFile.getFile()).text());
  assert.equal(saved.renderer.files.find(file => file.path === 'styles/a/site.css').sha256, await contentHash('p { color:blue }'));
  f.config.renderer = saved.renderer; f.config.validation.verifySha256 = false; f.writeConfig();
  snapshot = (await activateLibraryFormat(f.root, () => true)).snapshot;
  source = await readLibraryCss(f.root, snapshot, 'styles/a/site.css', () => true);
  const configBytes = f.configFile.value;
  await saveLibraryCss(source, 'p { color:green }', () => true);
  assert.equal(f.configFile.value, configBytes);
  snapshot = (await activateLibraryFormat(f.root, () => true)).snapshot;
  source = await readLibraryCss(f.root, snapshot, 'styles/a/site.css', () => true);
  f.root.children.get('styles').children.get('a').children.get('site.css').value = 'p {color:purple}';
  await assert.rejects(saveLibraryCss(source, 'p { color:black }', () => true));
});

test('a concurrent config edit still blocks developer-mode CSS staging', async t => {
  const f = await fixture(t); await add(f, 'styles/site.css', 'p{color:red}');
  f.config.validation.verifySha256 = false; f.writeConfig();
  const snapshot = (await activateLibraryFormat(f.root, () => true)).snapshot;
  const source = await readLibraryCss(f.root, snapshot, 'styles/site.css', () => true);
  const file = f.root.children.get('styles').children.get('site.css'), create = file.createWritable.bind(file);
  file.createWritable = async () => { const stream = await create(); return { ...stream, async write(value) { await stream.write(value); f.configFile.value += ' '; } }; };
  await assert.rejects(saveLibraryCss(source, 'p{color:blue}', () => true));
  assert.equal(file.value, 'p{color:red}'); assert.equal(f.configFile.value.endsWith(' '), true);
});

test('new CSS output resolves import layers and assets into portable content without expanding file authority', async t => {
  const f = await fixture(t);
  await add(f, 'styles/common.css', '.card{background:url("@assets/a.png")}');
  await add(f, 'assets/a.png', new Uint8Array([1, 2, 3]), true);
  const pkg = await readRendererPackage(f.root, f.config.renderer, f.config);
  const result = materializePackageResources(pkg, { css: '@import "@styles/common.css" layer(cards) supports(display:grid) screen and (min-width: 400px);' });
  assert.match(result.css, /@layer cards/); assert.match(result.css, /@supports \(display:grid\)/); assert.match(result.css, /@media screen and \(min-width: 400px\)/);
  assert.match(result.css, /data:image\/png;base64,AQID/); assert.doesNotMatch(result.css, /@styles|@assets|blob:/);
  assert.throws(() => materializePackageResources(pkg, { css: '@import "styles/private.css";' }), /未列入|Undeclared/);
  assert.throws(() => materializePackageResources(pkg, { css: 'p{background:url("../outside.png")}' }));
  assert.throws(() => materializePackageResources(pkg, { css: 'p{background:url("blob:temporary")}' }), /Blob/);
  const large = structuredClone(pkg);
  large.files['assets/a.png'] = 'A'.repeat(1024 * 1024);
  assert.throws(() => materializePackageResources(large, { css: Array.from({ length: 33 }, (_, i) => `.item${i}{background:url("@assets/a.png")}`).join('') }), /容量|limits/);
});

test('a pinned format-relative v1 package still reads and saves its original file layout', async t => {
  const f = await fixture(t);
  f.config.renderer.protocol = 'rainy-format/1';
  f.config.renderer.entry = 'renderer.js';
  f.config.renderer.files = f.config.renderer.files.map(file => ({ ...file, path: file.path.slice('format/'.length) }));
  f.root.seed('format/algorithms/manifest.json', '{"schemaVersion":1,"components":[]}');
  f.config.renderer.files.find(file => file.path === 'algorithms/manifest.json').sha256 = await contentHash('{"schemaVersion":1,"components":[]}');
  delete f.config.validation; delete f.config.resources;
  f.root.seed('format/shared.css', 'p{color:red}');
  f.config.renderer.files.push({ path: 'shared.css', sha256: await contentHash('p{color:red}') }); f.writeConfig();
  const before = diskSnapshot(f.root), snapshot = (await activateLibraryFormat(f.root, () => true)).snapshot;
  assert.equal(snapshot.error, null); assert.equal(snapshot.renderer.declaration.protocol, 'rainy-format/1');
  assert.equal(diskSnapshot(f.root), before);
  assert.deepEqual(libraryCssPaths(snapshot), ['format/shared.css']);
  const source = await readLibraryCss(f.root, snapshot, 'format/shared.css', () => true);
  await saveLibraryCss(source, 'p{color:blue}', () => true);
  const config = JSON.parse(await (await f.configFile.getFile()).text());
  assert.equal(config.renderer.protocol, 'rainy-format/1'); assert.equal(config.renderer.entry, 'renderer.js');
  assert.equal(config.renderer.files.find(file => file.path === 'shared.css').sha256, await contentHash('p{color:blue}'));
  config.resources = { aliases: { '@styles/': 'styles/' } };
  assert.throws(() => validateLibraryConfiguration(config), error => error.messageKey === 'libraryContract.aliasProtocol');
});
