import test from 'node:test';
import assert from 'node:assert/strict';
import { writeResourceStream } from '../../src/lib/resources/storage.ts';
import { resourceDownloadURL, openImportResource } from '../../src/lib/imports/download.ts';
import { runImportResources as runResourceEngine } from '../../src/lib/imports/runner.ts';
import { planMarkdownResources } from '../../src/lib/imports/plan.ts';
import { tree, snapshot, allCounts } from '../knowledge/fs-fixture.mjs';
const memoryBookmarks = () => { const values = new Map(); return { load: async key => values.get(key), save: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }; };
const runImportResources = (root, source, plan, current, options) => runResourceEngine(root, source, plan, current, { bookmarks: memoryBookmarks(), ...options });

const target = { articleId: '2026-10/item', month: '2026-10', folder: 'item' };
const destination = { kind: 'article', ...target, title: 'Item' };
const key = name => error => error.messageKey === name;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
function filesystem() {
  const root = tree('library', { 'articles/2026-10/item/article.md': '# Editable draft' }), wrapped = new WeakSet();
  const io = { chunks: [], aborts: 0, closes: 0, failClose: false };
  function wrap(directory) {
    if (wrapped.has(directory)) return directory; wrapped.add(directory);
    const getDirectory = directory.getDirectoryHandle, getFile = directory.getFileHandle;
    directory.getDirectoryHandle = async (...args) => wrap(await getDirectory(...args));
    directory.getFileHandle = async (...args) => {
      const file = await getFile(...args); file.isSameEntry ??= async other => file === other;
      if (!file.streamWrapped) {
        file.streamWrapped = true; const original = file.createWritable;
        file.createWritable = async () => {
          const writer = await original(), values = [];
          return { async write(value) { if (value instanceof Uint8Array) { io.chunks.push(value.length); values.push(value); } else await writer.write(value); },
            async close() { if (io.failClose) throw Error('close failed'); if (values.length) await writer.write(new Blob(values)); await writer.close(); io.closes++; },
            async abort() { io.aborts++; await writer.abort(); } };
        };
      }
      return file;
    }; return directory;
  }
  return { root: wrap(root), io };
}
function source(files = {}) {
  const root = tree('source', files), origin = { kind: 'local', sourceId: crypto.randomUUID(), path: 'source.md', name: 'source.md', size: 1, modified: 1, hash: 'a'.repeat(64) };
  return { root, reader: { origin, title: 'Source', directoryName: 'source', assertCurrent: async () => {}, assertTarget: async () => {},
    readResource: async path => { const file = await (await root.getFileHandle(path)).getFile(); file.arrayBuffer = () => { throw Error('whole payload read'); }; return file; } } };
}
function task(reader, body) { return { schemaVersion: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), target, source: reader.origin, state: 'pending', ...planMarkdownResources(body) }; }
const bytes = values => new ReadableStream({ start(controller) { for (const value of values) controller.enqueue(value); controller.close(); } });
const options = () => ({ isCurrent: () => true, signal: new AbortController().signal });

test('download policy refuses private, executable, credentialed and redirect targets before fetch', async () => {
  for (const url of ['http://example.com/x', 'https://user:pass@example.com/x', 'https://localhost/x', 'https://name.local/x', 'https://127.1/x', 'https://2130706433/x', 'https://10.1.2.3/x', 'https://172.20.1.2/x', 'https://192.168.1.1/x', 'https://169.254.1.1/x', 'https://100.64.2.1/x', 'https://[::1]/x', 'https://[::ffff:127.0.0.1]/x', 'javascript:alert(1)']) assert.throws(() => resourceDownloadURL(url), key('imports.unsafeResource'), url);
  assert.equal(resourceDownloadURL('https://example.com/a.png#part').href, 'https://example.com/a.png');
  const s = source(), signal = new AbortController().signal; let requested;
  const result = await openImportResource({ location: 'https', source: 'https://example.com/a.pdf' }, s.reader, signal, async (url, init) => {
    requested = { url, init }; return new Response('payload', { headers: { 'content-length': '7' } });
  });
  assert.equal(requested.init.credentials, 'omit'); assert.equal(requested.init.redirect, 'error'); assert.equal(requested.init.mode, 'cors'); assert.equal(requested.init.referrerPolicy, 'no-referrer'); assert.equal(result.expectedBytes, undefined); await result.stream.cancel();
  await assert.rejects(openImportResource({ location: 'https', source: 'https://example.com/a' }, s.reader, signal, async () => { throw new TypeError('CORS'); }), key('imports.downloadFailed'));
  await assert.rejects(openImportResource({ location: 'https', source: 'https://example.com/a' }, s.reader, signal, async () => new Response('no', { status: 404 })), key('imports.downloadStatus'));
});

test('encoded HTTP payload length is not compared to the decoded browser stream; only the exact built-in sample uses same-origin fetch', async () => {
  const s = source(), signal = new AbortController().signal;
  const compressed = await openImportResource({ location: 'https', source: 'https://example.com/a' }, s.reader, signal, async () => new Response('decoded', { headers: { 'content-length': '2', 'content-encoding': 'gzip' } }));
  assert.equal(compressed.expectedBytes, undefined); await compressed.stream.cancel();
  const hiddenEncoding = await openImportResource({ location: 'https', source: 'https://example.com/a' }, s.reader, signal, async () => new Response('already decompressed', { headers: { 'content-length': '2' } }));
  assert.equal(hiddenEncoding.expectedBytes, undefined); await hiddenEncoding.stream.cancel();
  let requested;
  const sample = await openImportResource({ location: 'local', source: '/images/article-sample.png' }, s.reader, signal, async url => { requested = url; return new Response(png); });
  assert.equal(requested, '/images/article-sample.png'); await sample.stream.cancel();
  await assert.rejects(openImportResource({ location: 'local', source: '/article-sample.png' }, s.reader, signal, async () => { throw Error('must not fetch old alias'); }));
});

test('stream storage splits output into at most 64KiB chunks and completes only after close and length verification', async () => {
  const { root, io } = filesystem(), payload = new Uint8Array(250000).fill(7);
  const handle = await writeResourceStream(root, destination, 'file', 'large.bin', bytes([payload]), { ...options(), expectedBytes: payload.length });
  assert.equal((await handle.getFile()).size, payload.length); assert.deepEqual(io.chunks, [65536, 65536, 65536, 53392]); assert.equal(io.closes, 1);
  const image = await writeResourceStream(root, destination, 'image', 'tiny.png', bytes([png.subarray(0, 2), png.subarray(2)]), { ...options(), expectedBytes: png.length });
  assert.deepEqual(new Uint8Array(await (await image.getFile()).arrayBuffer()), png);
});

test('bad image signatures, attachment limits, length mismatch and failed close do not leave claimed successful resources', async () => {
  const f = filesystem();
  await assert.rejects(writeResourceStream(f.root, destination, 'image', 'fake.png', bytes([new TextEncoder().encode('not image')]), options()), key('articleMedia.fileContentCouldNotBeIdentifiedAsSupportedPngJpegGifWebp'));
  assert.equal(allCounts(f.root).creates, 0);
  await assert.rejects(writeResourceStream(f.root, destination, 'file', 'huge.zip', bytes([]), { ...options(), expectedBytes: 64 * 1024 * 1024 + 1 }), key('resources.tooLarge'));
  await assert.rejects(writeResourceStream(f.root, destination, 'file', 'short.pdf', bytes([png]), { ...options(), expectedBytes: 100 }), key('resources.incomplete'));
  f.io.failClose = true;
  await assert.rejects(writeResourceStream(f.root, destination, 'file', 'failed.pdf', bytes([png]), options()), /close failed/);
  const files = await (await (await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10')).getDirectoryHandle('item')).getDirectoryHandle('media').then(dir => dir.getDirectoryHandle('file'));
  assert.equal(files.children.size, 0); assert.ok(f.io.aborts >= 2);
});

test('cancelling a waiting read aborts the owned writer and cannot recreate a deleted manuscript', async () => {
  const { root, io } = filesystem(), abort = new AbortController();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(png); } });
  const job = writeResourceStream(root, destination, 'file', 'cancel.bin', stream, { isCurrent: () => true, signal: abort.signal, onProgress: () => abort.abort(new DOMException('Cancelled', 'AbortError')) });
  await assert.rejects(job, { name: 'AbortError' }); assert.equal(io.closes, 0); assert.equal(io.aborts, 1);
  const month = await (await root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10'); await month.removeEntry('item');
  await assert.rejects(writeResourceStream(root, destination, 'file', 'late.bin', bytes([png]), options()));
  assert.equal(month.children.size, 0);
});

test('mid-stream permission loss and replacement cannot close or remove an unauthorized file', async () => {
  const payload = new Uint8Array(100000);
  const lost = filesystem();
  await assert.rejects(writeResourceStream(lost.root, destination, 'file', 'lost.bin', bytes([payload]), { ...options(), onProgress: () => { lost.root.permission = 'denied'; } }), key('resources.libraryRequired'));
  assert.equal(lost.io.closes, 0); assert.equal(lost.io.aborts, 1);
  const replaced = filesystem(); let changed = false;
  await assert.rejects(writeResourceStream(replaced.root, destination, 'file', 'same.bin', bytes([payload]), { ...options(), onProgress: () => {
    if (changed) return; changed = true;
    const media = replaced.root.children.get('articles').children.get('2026-10').children.get('item').children.get('media').children.get('file');
    media.seed('same.bin', 'external replacement');
  } }), key('resources.changed'));
  assert.equal(replaced.io.closes, 0);
  const file = replaced.root.children.get('articles').children.get('2026-10').children.get('item').children.get('media').children.get('file').children.get('same.bin');
  assert.equal(file.value, 'external replacement');
});

test('two concurrent stream jobs preserve source bytes and an independently edited manuscript, without a whole attachment read', async () => {
  const { root } = filesystem(), s = source({ 'one.pdf': 'first', 'two.pdf': 'second', 'three.pdf': 'third' }), before = snapshot(s.root);
  const plan = task(s.reader, '[1](one.pdf)\n[2](two.pdf)\n[3](three.pdf)'), notices = [], persisted = [];
  const document = await (await (await root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10')).getDirectoryHandle('item');
  const manuscript = await document.getFileHandle('article.md');
  const result = await runImportResources(root, s.reader, plan, () => true, { signal: new AbortController().signal, onChange: value => notices.push(value), onResource: () => { manuscript.value = '# User changed this during transfer'; manuscript.modified++; }, persist: async value => persisted.push(value) });
  assert.equal(result.task.state, 'complete'); assert.ok(result.task.resources.every(item => item.state === 'complete'));
  assert.equal(await (await document.getFileHandle('article.md')).getFile().then(file => file.text()), '# User changed this during transfer');
  assert.equal(snapshot(s.root), before); assert.equal(allCounts(s.root).writes, 0); assert.equal(allCounts(s.root).bodyReads, 0);
  assert.equal(plan.state, 'pending'); assert.ok(plan.resources.every(item => item.state === 'pending'));
  assert.ok(persisted.length <= 3); assert.equal(persisted.at(-1).state, 'complete'); assert.ok(notices.length <= 3);
});

test('network workers cap concurrency at two and isolate failures while throttling progress', async () => {
  const { root } = filesystem(), s = source(); let active = 0, maximum = 0, completed = 0; const notices = [];
  const plan = task(s.reader, Array.from({ length: 5 }, (_, n) => `[${n}](https://example.com/${n}.pdf)`).join('\n'));
  const fetcher = async url => {
    if (url.endsWith('/4.pdf')) return new Response('missing', { status: 404 });
    active++; maximum = Math.max(maximum, active);
    return new Response(new ReadableStream({ async start(controller) { for (let n = 0; n < 5; n++) { await new Promise(done => setTimeout(done, 4)); controller.enqueue(png); } active--; controller.close(); } }));
  };
  const result = await runImportResources(root, s.reader, plan, () => true, { signal: new AbortController().signal, onChange: value => notices.push(value), onResource: () => { completed++; }, fetcher, persist: async () => {} });
  assert.equal(maximum, 2); assert.equal(completed, 4); assert.equal(result.task.state, 'paused'); assert.equal(result.task.resources.at(-1).state, 'failed'); assert.ok(notices.length <= 3);
});

test('a session change stops transfer results and the task record cannot be mistaken for fully saved', async () => {
  const { root } = filesystem(), s = source({ 'one.pdf': 'first', 'two.pdf': 'second' }); let current = true;
  const result = await runImportResources(root, s.reader, task(s.reader, '[1](one.pdf)\n[2](two.pdf)'), () => current, {
    signal: new AbortController().signal, onChange: () => {}, onResource: () => { current = false; }, persist: async () => { throw Error('disk full'); },
  });
  assert.equal(result.task.state, 'paused'); assert.ok(result.diskError); assert.equal(allCounts(s.root).writes, 0);
});
