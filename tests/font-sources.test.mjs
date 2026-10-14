import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEFAULT_FONT_SOURCE, FONT_SOURCE_STORAGE_KEY, getFontSource, setFontSource, subscribeFontSource, fetchVerifiedFontFile } from '../src/lib/fontSources.ts';
import { initializeLocalFonts, getLocalFontStatus, cancelLocalFontDownload } from '../src/lib/localFonts.ts';

const bytes = new TextEncoder().encode('complete font fixture');
const request = { name: 'font.ttf', url: 'https://example.test/font.ttf', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };

function browser(t) {
  const values = new Map(), events = new Map();
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const reset = subscribeFontSource(() => {}); events.get('storage')({ key: null }); reset();
  return { values, events };
}

test('global source defaults to Google, survives rereading, and broadcasts storage changes without locale inference', t => {
  const { values, events } = browser(t); let changes = 0;
  const unsubscribe = subscribeFontSource(() => changes++);
  t.after(unsubscribe);
  assert.equal(DEFAULT_FONT_SOURCE, 'google-fonts');
  assert.equal(getFontSource(), 'google-fonts');
  assert.equal(setFontSource('jsdmirror'), true);
  assert.equal(values.get(FONT_SOURCE_STORAGE_KEY), 'jsdmirror');
  assert.equal(getFontSource(), 'jsdmirror');
  values.set(FONT_SOURCE_STORAGE_KEY, 'google-fonts');
  events.get('storage')({ key: FONT_SOURCE_STORAGE_KEY });
  assert.equal(getFontSource(), 'google-fonts'); assert.equal(changes, 2);
  assert.throws(() => setFontSource('other'), /无效/);
  t.mock.method(window.localStorage, 'setItem', () => { throw new Error('denied'); });
  assert.equal(setFontSource('jsdmirror'), false); assert.equal(getFontSource(), 'jsdmirror');
});

test('verified downloader uses credential-free cached fetch and checks size/hash before returning', async t => {
  let options;
  t.mock.method(globalThis, 'fetch', async (_, next) => { options = next; return new Response(bytes); });
  assert.deepEqual(new Uint8Array(await fetchVerifiedFontFile(request)), bytes);
  assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'force-cache'); assert.equal(options.referrerPolicy, 'no-referrer');
  for (const response of [new Response(bytes.slice(1)), new Response(new Uint8Array(bytes.length)), new Response(bytes, { headers: { 'Content-Length': String(bytes.length + 1) } })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(fetchVerifiedFontFile(request), error => error.messageKey === 'localFonts.invalidFile');
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(fetchVerifiedFontFile(request), error => error.messageKey === 'localFonts.downloadFailed');
});

test('stream exceeding the complete-file size is cancelled', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes.length + 1)); }, cancel() { cancelled = true; } })));
  await assert.rejects(fetchVerifiedFontFile(request), error => error.messageKey === 'localFonts.invalidFile');
  assert.equal(cancelled, true);
});

test('timeout and explicit cancellation settle even if fetch ignores its AbortSignal', async t => {
  let expire, limit;
  t.mock.method(globalThis, 'setTimeout', (fn, duration) => { expire = fn; limit = duration; return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Promise(() => {}));
  const timeout = fetchVerifiedFontFile(request); const timeoutCheck = assert.rejects(timeout, error => error.messageKey === 'localFonts.timeout');
  assert.equal(limit, 30_000); expire(); await timeoutCheck;
  const controller = new AbortController(), cancelled = fetchVerifiedFontFile(request, controller.signal);
  const cancelledCheck = assert.rejects(cancelled, { name: 'AbortError' }); controller.abort(); await cancelledCheck;
  await assert.rejects(fetchVerifiedFontFile(request, AbortSignal.abort()), { name: 'AbortError' });
});

test('source switch and cancel invalidate library download before any file creation', async t => {
  browser(t); setFontSource('google-fonts');
  const writes = [], root = { getDirectoryHandle: async () => ({ getFileHandle: async (name, options) => { if (options?.create) writes.push(name); throw new DOMException('missing', 'NotFoundError'); } }) };
  let started;
  t.mock.method(globalThis, 'fetch', () => { started?.(); return new Promise(() => {}); });
  const ready = new Promise(resolve => { started = resolve; });
  const pending = initializeLocalFonts(root); await ready; setFontSource('jsdmirror'); await pending;
  assert.deepEqual(writes, []); assert.equal(getLocalFontStatus().phase, 'cancelled');
  const readyAgain = new Promise(resolve => { started = resolve; });
  const again = initializeLocalFonts(root); await readyAgain; cancelLocalFontDownload(); await again;
  assert.deepEqual(writes, []); assert.equal(getLocalFontStatus().phase, 'cancelled');
});
