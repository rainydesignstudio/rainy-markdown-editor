import test from 'node:test';
import assert from 'node:assert/strict';
import { tree } from './knowledge/fs-fixture.mjs';
import { initializeLibraryFormat, activateLibraryFormat } from '../src/lib/article-format/library.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { contentHash, loadStylesheetEnvironment } from '../src/lib/article-format/styles.ts';
import { libraryCssPaths, readLibraryCss, saveLibraryCss } from '../src/lib/article-format/sourceStyles.ts';

const css = '.product { color: red; }\n';
async function fixture(t, text = css) {
  const root = tree('css-source-test');
  await initializeLibraryFormat(root, 'empty');
  const directory = root.children.get('format');
  const configFile = directory.children.get('config.json');
  const config = JSON.parse(configFile.value);
  root.seed('styles/shared.css', text);
  config.renderer.files.push({ path: 'styles/shared.css', sha256: await contentHash(text) });
  configFile.value = JSON.stringify(config, null, 2) + '\n';
  const snapshot = (await activateLibraryFormat(root, () => true)).snapshot;
  assert.equal(snapshot.error, null);
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  const source = await readLibraryCss(root, snapshot, 'styles/shared.css', () => true);
  return { root, directory, configFile, source, file: root.children.get('styles').children.get('shared.css') };
}
const textOf = async file => (await file.getFile()).text();

test('declared CSS source and its existing hash save together without changing protocol, structure or other files', async t => {
  const f = await fixture(t), before = JSON.parse(f.configFile.value), next = '.product { color: blue; }\n';
  const files = new Map([...f.directory.children].filter(([key]) => !['config.json', 'shared.css'].includes(key)).map(([key, value]) => [key, value.value]));
  assert.deepEqual(libraryCssPaths(f.source.snapshot), ['styles/shared.css']);
  await saveLibraryCss(f.source, next, () => true);
  assert.equal(await textOf(f.file), next);
  const after = JSON.parse(await textOf(f.configFile));
  assert.equal(after.renderer.files.find(file => file.path === 'styles/shared.css').sha256, await contentHash(next));
  after.renderer.files.find(file => file.path === 'styles/shared.css').sha256 = before.renderer.files.find(file => file.path === 'styles/shared.css').sha256;
  assert.deepEqual(after, before);
  for (const [key, value] of files) assert.equal(f.directory.children.get(key).value, value, key);
  const reloaded = await activateLibraryFormat(f.root, () => true);
  assert.equal(reloaded.snapshot.error, null);
  assert.notEqual(reloaded.snapshot.renderer.fingerprint, f.source.snapshot.renderer.fingerprint);
  assert.equal(f.source.snapshot.renderer.files['styles/shared.css'], css, 'the original snapshot is immutable');
});

test('UTF-8 BOM bytes are preserved when reading, editing and hashing CSS', async t => {
  const f = await fixture(t, '\uFEFF' + css);
  assert.equal(f.source.text.charCodeAt(0), 0xfeff);
  await saveLibraryCss(f.source, f.source.text + 'p {}', () => true);
  assert.deepEqual([...new Uint8Array(await (await f.file.getFile()).arrayBuffer()).slice(0, 3)], [239, 187, 191]);
  assert.equal((await activateLibraryFormat(f.root, () => true)).snapshot.error, null);
});

test('invalid syntax, undeclared paths, denied permission and expired sessions cause no writes', async t => {
  const f = await fixture(t), before = f.configFile.value;
  await assert.rejects(saveLibraryCss(f.source, '.broken {', () => true), /Unclosed block/);
  await assert.rejects(readLibraryCss(f.root, f.source.snapshot, 'format/../outside.css', () => true), /CSS/);
  await assert.rejects(saveLibraryCss({ ...f.source, path: 'format/not-declared.css' }, css, () => true), /CSS/);
  await assert.rejects(saveLibraryCss(f.source, 'a {}', () => false));
  f.root.permission = f.root.requestResult = 'denied';
  await assert.rejects(saveLibraryCss(f.source, 'a {}', () => true));
  assert.equal(f.file.value, css); assert.equal(f.configFile.value, before);
});

test('external source, manifest or other package changes are never silently accepted or rehashed', async t => {
  const f = await fixture(t), before = f.configFile.value;
  f.file.value = '.external {}';
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true));
  assert.equal(f.file.value, '.external {}'); assert.equal(f.configFile.value, before);
  f.file.value = css;
  f.configFile.value = before + ' ';
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true));
  assert.equal(f.file.value, css); assert.equal(f.configFile.value, before + ' ');
  f.configFile.value = before;
  f.directory.children.get('renderer.js').value += '\n// external';
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true));
  assert.equal(f.file.value, css); assert.equal(f.configFile.value, before);
});

test('a changed configuration identity or a library switch during staging does not commit CSS', async t => {
  const f = await fixture(t), create = f.file.createWritable.bind(f.file);
  let current = true;
  f.file.createWritable = async () => { const stream = await create(); return { ...stream, async write(value) { await stream.write(value); current = false; } }; };
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => current));
  assert.equal(f.file.value, css);
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true));
  assert.equal(f.file.value, css);
});

test('a manifest commit failure rolls back only this operation’s CSS write', async t => {
  const f = await fixture(t), before = f.configFile.value, create = f.configFile.createWritable.bind(f.configFile);
  f.configFile.createWritable = async () => ({ ...await create(), async close() { throw new Error('manifest close failed'); } });
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true), /manifest close failed/);
  assert.equal(await textOf(f.file), css); assert.equal(f.configFile.value, before);
  assert.equal((await activateLibraryFormat(f.root, () => true)).snapshot.error, null);
});

test('partial commit recovery stops if another writer changes the manifest', async t => {
  const f = await fixture(t), before = f.configFile.value, create = f.configFile.createWritable.bind(f.configFile);
  f.configFile.createWritable = async () => ({ ...await create(), async close() { f.configFile.value = before + ' '; throw new Error('external writer'); } });
  await assert.rejects(saveLibraryCss(f.source, '.mine {}', () => true), error => error.messageKey === 'libraryCss.partial');
  assert.equal(f.configFile.value, before + ' ');
  assert.equal(await textOf(f.file), '.mine {}', 'retain the source for explicit recovery instead of overwriting externally changed data');
});

test('legacy stylesheet sources save through their existing paths without creating package declarations', async t => {
  const root = tree('legacy-css', { 'styles/site.css': '@import "./detail.css";\np { color:red }', 'styles/detail.css': '.detail {}' });
  const environment = await loadStylesheetEnvironment(root, { entry: 'styles/site.css', publicRoot: 'assets' });
  const snapshot = activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), root.name, 'library', environment);
  t.after(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));
  assert.deepEqual(new Set(libraryCssPaths(snapshot)), new Set(['styles/site.css', 'styles/detail.css']));
  const source = await readLibraryCss(root, snapshot, 'styles/detail.css', () => true);
  await saveLibraryCss(source, '.detail { color:blue }', () => true);
  assert.equal(await textOf(root.children.get('styles').children.get('detail.css')), '.detail { color:blue }');
  assert.equal(root.children.has('format'), false);
  assert.equal(getFormatSnapshot(), snapshot, 'saving never activates a draft globally');
});
