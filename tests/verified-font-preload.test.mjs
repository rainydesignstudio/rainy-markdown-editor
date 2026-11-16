import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { ProductError } from '../src/lib/i18n/productMessages.ts';

const bytes = new TextEncoder().encode('verified font bytes');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {
  defaultSource: 'google-fonts', sources: [{ id: 'google-fonts' }, { id: 'jsdmirror' }],
  fonts: ['sen', 'noto', 'mono'].map(name => ({ file: name + '.ttf', license: name + '-OFL.txt', size: bytes.length, sha256, licenseSize: bytes.length, licenseSha256: sha256, urls: { 'google-fonts': `https://google.test/${name}.ttf`, jsdmirror: `https://mirror.test/${name}.ttf` } })),
};
const code = new Map();
for (const name of ['fontSources', 'verifiedResourceCache', 'fontPreload']) {
  code.set(name, ts.transpileModule(await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText);
}
function model(fetch) {
  const modules = {}, storage = new Map();
  const window = { localStorage: { getItem: name => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value) }, addEventListener() {}, removeEventListener() {} };
  for (const name of code.keys()) {
    const module = { exports: {} };
    vm.runInNewContext(code.get(name), { module, exports: module.exports, fetch, window, crypto, AbortController, DOMException, Uint8Array, ArrayBuffer, Map, Set, WeakMap, Symbol, TextEncoder, TextDecoder, Promise, Date, Number, Math, Object, setTimeout, clearTimeout, require(id) {
      if (id.endsWith('font-sources.json')) return manifest;
      if (id === './appBasePath') return { appAssetPath: value => value };
      if (id.endsWith('productMessages')) return { ProductError, productCause: error => String(error) };
      const dependency = modules[id.replace('./', '')]; if (dependency) return dependency;
      throw Error('Unexpected preload dependency: ' + id);
    } });
    modules[name] = module.exports;
  }
  return { ...modules.fontPreload, ...modules.fontSources, createCache: modules.verifiedResourceCache.createVerifiedResourceCache };
}
const tick = () => new Promise(setImmediate);
function delayedResponse(signal, releases) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    releases.push(() => { signal.removeEventListener('abort', abort); resolve(new Response(bytes)); });
  });
}

test('a failed font publishes immediately, drains slow siblings, and an explicit retry recovers', async () => {
  let fail = true;
  const subject = model(async (url, { signal }) => {
    if (fail && url.endsWith('/sen.ttf')) return new Response('', { status: 503 });
    if (fail && url.endsWith('/noto.ttf')) return delayedResponse(signal, []);
    return new Response(bytes);
  });
  await subject.preloadFonts();
  assert.equal(subject.getFontPreloadState().phase, 'failed');
  assert.equal(subject.getFontPreloadState().current, 'sen.ttf');
  assert.equal(subject.getFontPreloadState().completedAt, null);
  fail = false; await subject.preloadFonts(true);
  assert.equal(subject.getFontPreloadState().phase, 'complete');
  assert.equal(subject.getFontPreloadState().verified, subject.getFontPreloadState().total);
});

test('an explicit retry replaces an active preload; the cancelled generation cannot overwrite it', async () => {
  const releases = []; let requests = 0;
  const subject = model(async (_url, { signal }) => { requests++; return delayedResponse(signal, releases); });
  const first = subject.preloadFonts(); await tick();
  const second = subject.preloadFonts(true); assert.notEqual(second, first); await tick();
  for (const release of releases) release();
  await Promise.all([first, second]);
  assert.equal(subject.getFontPreloadState().phase, 'complete');
  assert.equal(requests, 12);
});

test('library consumption shares preload transport; cancelling that consumer preserves the preload', async () => {
  const releases = []; let requests = 0;
  const subject = model(async (_url, { signal }) => { requests++; return delayedResponse(signal, releases); });
  const preload = subject.preloadFonts(), controller = new AbortController();
  const file = subject.fontFileRequest(manifest.fonts[0]);
  const consumer = subject.loadPreparedFontFile(file, 'google-fonts', controller.signal);
  const cancelled = assert.rejects(consumer, { name: 'AbortError' }); controller.abort(); await cancelled;
  for (const release of releases) release(); await preload;
  assert.equal(requests, 6); assert.equal(subject.getFontPreloadState().phase, 'complete');
  const copy = await subject.loadPreparedFontFile(file, 'google-fonts'); new Uint8Array(copy)[0] = 0;
  assert.deepEqual(new Uint8Array(await subject.loadPreparedFontFile(file, 'google-fonts')), bytes);
  assert.equal(requests, 6);
});

test('source switching cancels only stale preload state and cannot reuse another source identity', async () => {
  const requested = [], releases = [];
  const subject = model(async (url, { signal }) => { requested.push(url); return url.startsWith('https://google.test/') ? delayedResponse(signal, releases) : new Response(bytes); });
  const old = subject.preloadFonts(); await tick();
  subject.setFontSource('jsdmirror'); await subject.preloadFonts(); await old;
  for (const release of releases) release(); await tick();
  assert.equal(subject.getFontPreloadState().source, 'jsdmirror'); assert.equal(subject.getFontPreloadState().phase, 'complete');
  assert.equal(requested.filter(url => url.startsWith('https://mirror.test/')).length, 3);
});

test('wrong size and SHA never populate verified cache; later valid bytes can retry', async () => {
  for (const invalid of [new Uint8Array(1), new Uint8Array(bytes.length)]) {
    let calls = 0; const subject = model(async () => new Response(++calls === 1 ? invalid : bytes)), cache = subject.createCache();
    const file = subject.fontFileRequest(manifest.fonts[0]);
    await assert.rejects(cache.load(file, 'google-fonts'), error => error.messageKey === 'localFonts.invalidFile');
    assert.equal(cache.read(file, 'google-fonts'), null);
    assert.deepEqual(new Uint8Array(await cache.load(file, 'google-fonts')), bytes); assert.equal(calls, 2);
  }
});

test('cancelling the last cache consumer aborts transport; a subsequent request starts cleanly', async () => {
  let calls = 0, aborts = 0;
  const subject = model(async (_url, { signal }) => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => { aborts++; reject(new DOMException('cancelled', 'AbortError')); }, { once: true }));
    return new Response(bytes);
  });
  const cache = subject.createCache(), file = subject.fontFileRequest(manifest.fonts[0]), controller = new AbortController();
  const pending = cache.load(file, 'google-fonts', controller.signal), rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort(); await rejected; await tick();
  assert.equal(aborts, 1); assert.deepEqual(new Uint8Array(await cache.load(file, 'google-fonts')), bytes); assert.equal(calls, 2);
});


test('run identity changes only for new real jobs and survives terminal state', async () => {
  const releases=[],states=[];
  const subject=model(async (_url,{signal})=>delayedResponse(signal,releases));
  assert.equal(subject.getFontPreloadState().runId,0);
  subject.subscribeFontPreload(()=>states.push(subject.getFontPreloadState()));
  const first=subject.preloadFonts(); const firstId=subject.getFontPreloadState().runId;
  assert.equal(firstId,1); assert.equal(subject.preloadFonts(),first);
  assert.equal(subject.getFontPreloadState().runId,firstId);
  const second=subject.preloadFonts(true);const secondId=subject.getFontPreloadState().runId;
  assert.equal(secondId,2);await tick();
  for(const release of releases)release();await Promise.all([first,second]);
  assert.equal(subject.getFontPreloadState().phase,'complete');
  assert.equal(subject.getFontPreloadState().runId,secondId);
  const count=states.length;await subject.preloadFonts();
  assert.equal(states.length,count,'a complete cache is not a new visible job');
  assert.equal(subject.getFontPreloadState().runId,secondId);
  assert.ok(states.every(state=>state.runId===firstId||state.runId===secondId));
});
