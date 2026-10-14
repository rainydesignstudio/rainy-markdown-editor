import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { getLocalFontStatus } from '../src/lib/localFonts.ts';
import { initializeLocalFonts, loadLocalFonts, shareLocalFontsWithPreview } from '../src/lib/localFonts.ts';
import { OPEN_FONT_ASSETS, canonicalFontStack, codeFontStack, fontOptions } from '../src/lib/fontCatalog.ts';

class Directory {
  files = new Map(); directories = new Map(); failWrite = false; failClose = false; replacementOnCloseFailure = null;
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name)) { if (!create) throw new DOMException('missing', 'NotFoundError'); this.directories.set(name, new Directory()); }
    return this.directories.get(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name)) { if (!create) throw new DOMException('missing', 'NotFoundError'); this.files.set(name, new ArrayBuffer(0)); }
    return { getFile: async () => ({ size: this.files.get(name).byteLength, arrayBuffer: async () => this.files.get(name) }), createWritable: async () => ({ write: async content => { if (this.failWrite) throw new Error('write denied'); this.files.set(name, content); }, close: async () => { if (this.failClose) { if (this.replacementOnCloseFailure) this.files.set(name, this.replacementOnCloseFailure); throw new Error('close denied'); } }, abort: async () => {} }) };
  }
  async removeEntry(name) { this.files.delete(name); }
}

test('font menu deduplicates full-stack variants by family and isolates code choices', () => {
  const options = fontOptions(['"Sen Local", serif', '"Sen Local", sans-serif', '"Songti SC", serif', '"Songti SC", SimSun, serif']);
  assert.equal(options.filter(font => font.label.startsWith('Sen')).length, 1);
  assert.equal(options.filter(font => font.label.startsWith('系统宋体')).length, 1);
  assert.equal(canonicalFontStack('"Sen Local", serif'), canonicalFontStack('"Sen Local", sans-serif'));
  assert.ok(fontOptions([], true).every(font => /monospace/.test(font.value)));
  assert.ok(!/Songti/.test(codeFontStack('"Songti SC", serif')));
});

const fixtureBytes = new TextEncoder().encode('font test bytes').buffer;
const fixtureHash = createHash('sha256').update(new Uint8Array(fixtureBytes)).digest('hex');
function fixtureCatalog(t) {
  const original = structuredClone(OPEN_FONT_ASSETS);
  for (const asset of OPEN_FONT_ASSETS) Object.assign(asset, { size: fixtureBytes.byteLength, sha256: fixtureHash, licenseSize: fixtureBytes.byteLength, licenseSha256: fixtureHash });
  t.after(() => OPEN_FONT_ASSETS.forEach((asset, index) => Object.assign(asset, original[index])));
}
const okResponse = () => new Response(fixtureBytes.slice(0));

test('directory initialization verifies external complete fonts and preserves every existing file', async t => {
  fixtureCatalog(t);
  const root = new Directory(), urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return okResponse(); });
  await initializeLocalFonts(root);
  const directory = await root.getDirectoryHandle('fonts');
  assert.deepEqual([...directory.files.keys()], OPEN_FONT_ASSETS.flatMap(asset => [asset.license, asset.file]));
  assert.equal(urls.filter(url => url.startsWith('https://raw.githubusercontent.com/google/fonts/')).length, 3);
  assert.equal(urls.filter(url => url.startsWith('/fonts/') && url.endsWith('-OFL.txt')).length, 3);
  const custom = new Uint8Array([1, 2, 3]).buffer;
  directory.files.set('sen-variable.ttf', custom);
  await initializeLocalFonts(root);
  assert.equal(urls.length, 6);
  assert.equal(directory.files.get('sen-variable.ttf'), custom);
  assert.equal(getLocalFontStatus().phase, 'ready');
});

test('failed writes remove only newly owned partial files; a stale session never writes fetched bytes', async t => {
  fixtureCatalog(t);
  const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
  t.mock.method(globalThis, 'fetch', async () => okResponse());
  directory.failWrite = true;
  await assert.rejects(initializeLocalFonts(root), /write denied/);
  assert.equal(directory.files.size, 0);
  assert.equal(getLocalFontStatus().phase, 'error');
  directory.failWrite = false;
  let current = true;
  t.mock.method(globalThis, 'fetch', async () => { current = false; return okResponse(); });
  await initializeLocalFonts(root, () => current);
  assert.equal(directory.files.size, 0);
  assert.equal(getLocalFontStatus().phase, 'cancelled');
});

test('bad hashes never create a file and a concurrent user font is retained', async t => {
  fixtureCatalog(t);
  const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(fixtureBytes.byteLength)));
  await assert.rejects(initializeLocalFonts(root), error => error.messageKey === 'localFonts.invalidFile');
  assert.equal(directory.files.size, 0);
  const custom = new Uint8Array([9, 8, 7]).buffer;
  t.mock.method(globalThis, 'fetch', async url => { if (url.endsWith('sen-OFL.txt')) directory.files.set('sen-OFL.txt', custom); return okResponse(); });
  await initializeLocalFonts(root);
  assert.equal(directory.files.get('sen-OFL.txt'), custom);
});

test('failed close cleans owned bytes but preserves a replacement with unrelated contents', async t => {
  fixtureCatalog(t);
  t.mock.method(globalThis, 'fetch', async () => okResponse());
  for (const replacement of [null, new Uint8Array([9, 8, 7]).buffer]) {
    const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
    directory.failClose = true; directory.replacementOnCloseFailure = replacement;
    await assert.rejects(initializeLocalFonts(root), /close denied/);
    assert.equal(directory.files.size, replacement ? 1 : 0);
    if (replacement) assert.equal(directory.files.get('sen-OFL.txt'), replacement);
  }
});

test('directory access failure publishes a retryable error and releases the active request', async t => {
  fixtureCatalog(t);
  await assert.rejects(initializeLocalFonts({ getDirectoryHandle: async () => { throw new Error('permission denied'); } }), /permission denied/);
  assert.equal(getLocalFontStatus().phase, 'error');
  t.mock.method(globalThis, 'fetch', async () => okResponse());
  await initializeLocalFonts(new Directory());
  assert.equal(getLocalFontStatus().phase, 'ready');
});

test('font loading reads authorized files, discards stale results, and cleans up a directory session', async t => {
  const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
  for (const asset of OPEN_FONT_ASSETS) directory.files.set(asset.file, new ArrayBuffer(8));
  const original = globalThis.FontFace;
  globalThis.FontFace = class { constructor(family, source, descriptors) { this.family = family; this.source = source; this.descriptors = descriptors; } async load() { return this; } };
  t.after(() => { if (original) globalThis.FontFace = original; else delete globalThis.FontFace; });
  const target = { fonts: new Set() };
  const preview = { fonts: new Set() }, closePreview = shareLocalFontsWithPreview(preview);
  const dispose = await loadLocalFonts(root, () => true, target);
  assert.deepEqual([...target.fonts].map(face => face.family), OPEN_FONT_ASSETS.map(asset => asset.family));
  assert.equal(preview.fonts.size, 3, 'isolated dark previews use the same authorized font faces');
  dispose(); assert.equal(target.fonts.size, 0);
  assert.equal(preview.fonts.size, 0, 'changing directories clears faces from dark previews too');
  await loadLocalFonts(root, () => false, target);
  assert.equal(target.fonts.size, 0);
  closePreview();
});
