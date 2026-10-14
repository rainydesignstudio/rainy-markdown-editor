import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownImport } from '../../src/lib/imports/create.ts';
import { chooseMarkdownImport, restoreLocalImportSource, knowledgeImportSource } from '../../src/lib/imports/source.ts';
import { createImportTaskRecord, loadImportTaskRecords, saveImportTaskRecord, importRecordGuard } from '../../src/lib/imports/store.ts';
import { validateImportTask } from '../../src/lib/imports/model.ts';
import { chooseImportReplacement, unavailableImportSource } from '../../src/lib/imports/recovery.ts';
import { runImportResources } from '../../src/lib/imports/runner.ts';
import { connectKnowledgeSource } from '../../src/lib/knowledge/source.ts';
import { BASIC_THEME } from '../../src/lib/themes.ts';
import { tree, snapshot, allCounts } from '../knowledge/fs-fixture.mjs';

const memory = () => { const values = new Map(); return { values, load: async key => values.get(key) ?? null, save: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }; };
const key = name => error => error.messageKey === name;
function fs(name, files = {}) {
  const root = tree(name, files), wrapped = new WeakSet();
  const wrap = dir => { if (wrapped.has(dir)) return dir; wrapped.add(dir); const getDirectory = dir.getDirectoryHandle, getFile = dir.getFileHandle;
    dir.getDirectoryHandle = async (...args) => wrap(await getDirectory(...args));
    dir.getFileHandle = async (...args) => { const handle = await getFile(...args); handle.isSameEntry ??= async other => handle === other; handle.queryPermission ??= async ({ mode }) => { assert.equal(mode, 'read'); return root.permission; }; return handle; }; return dir; };
  return wrap(root);
}
async function fixture() {
  const root = fs('library'), original = fs('source', { 'source.md': '# Recovery\n\n[pdf](manual.pdf)', 'manual.pdf': '%PDF-payload' });
  const reader = await knowledgeImportSource(await connectKnowledgeSource(root, original, memory()), 'source.md');
  const made = await createMarkdownImport(root, reader, BASIC_THEME, () => true);
  return { root, original, reader, task: made.task, bookmarks: memory() };
}

test('task recovery reads target metadata only, preserves completed items and never restarts a running task implicitly', async () => {
  const f = await fixture(), before = snapshot(f.original), reads = allCounts(f.original).bodyReads;
  f.task.state = 'running'; f.task.resources[0].state = 'running';
  await saveImportTaskRecord(f.root, f.task, importRecordGuard(f.root, () => true));
  const result = await loadImportTaskRecords(f.root, () => true);
  assert.equal(result.tasks[0].state, 'paused'); assert.equal(result.tasks[0].resources[0].state, 'pending'); assert.deepEqual(result.issues, []);
  assert.equal(snapshot(f.original), before); assert.equal(allCounts(f.original).bodyReads, reads); assert.equal(f.bookmarks.values.size, 0);
  const record = await (await (await f.root.getDirectoryHandle('imports')).getDirectoryHandle('tasks')).getFileHandle(f.task.id + '.json');
  assert.equal(JSON.parse(await (await record.getFile()).text()).state, 'running', 'loading itself does not rewrite the durable record');
});

test('malformed, oversized and source-aliased task records do not become trusted jobs or read source contents', async () => {
  const f = await fixture(), tasks = await (await f.root.getDirectoryHandle('imports')).getDirectoryHandle('tasks');
  tasks.seed(crypto.randomUUID() + '.json', '{broken');
  const result = await loadImportTaskRecords(f.root, () => true); assert.equal(result.tasks.length, 1); assert.equal(result.issues.length, 1);
  for (const change of [value => { value.target.folder = '../outside'; }, value => { value.resources[0].fileName = 'other.pdf'; }, value => { value.resources[0].receivedBytes = -1; }, value => { value.source.hash = 'bad'; }, value => { value.state = 'complete'; }, value => { value.extra = true; }]) { const value = structuredClone(f.task); change(value); assert.throws(() => validateImportTask(value)); }
  const imported = await f.root.getDirectoryHandle('imports'); imported.children.set('tasks', f.original);
  const reads = allCounts(f.original).bodyReads; await assert.rejects(loadImportTaskRecords(f.root, () => true), key('resources.unsafeTarget')); assert.equal(allCounts(f.original).bodyReads, reads);
});

test('local source bookmarks restore only the same library and exact original content with read permission', async () => {
  const originalWindow = globalThis.window, root = fs('library'), otherRoot = fs('other'), original = fs('source', { 'source.md': '# Local\n\n[pdf](manual.pdf)', 'manual.pdf': 'payload' }), bookmarks = memory();
  const file = await original.getFileHandle('source.md');
  globalThis.window = { showOpenFilePicker: async () => [file], showDirectoryPicker: async options => { assert.equal(options.mode, 'read'); return original; } };
  try {
    const picked = await chooseMarkdownImport(() => true), source = await picked.chooseDirectory();
    await source.remember('task-id', root, bookmarks);
    const restored = await restoreLocalImportSource('task-id', root, source.origin, () => true, false, bookmarks);
    assert.ok(restored); assert.equal((await restored.readResource('manual.pdf')).size, 7);
    assert.equal(await restoreLocalImportSource('task-id', otherRoot, source.origin, () => true, false, bookmarks), null);
    original.permission = 'denied'; await assert.rejects(restoreLocalImportSource('task-id', root, source.origin, () => true, false, bookmarks), key('imports.sourceRequired'));
    original.permission = 'granted'; file.value = '# Changed';
    await assert.rejects(restoreLocalImportSource('task-id', root, source.origin, () => true, false, bookmarks), key('imports.sourceChanged'));
    assert.equal(allCounts(original).writes, 0); assert.equal(allCounts(original).permission.some(([, mode]) => mode !== 'read'), false);
  } finally { globalThis.window = originalWindow; }
});

test('an interrupted empty reservation is retried only with the original verified handle; unrelated existing files are retained', async () => {
  const f = await fixture(), resource = f.task.resources[0], before = snapshot(f.original);
  const first = await runImportResources(f.root, f.reader, f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {}, persist: async () => {}, });
  assert.equal(first.task.state, 'complete');
  const article = await (await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(f.task.target.month)).getDirectoryHandle(f.task.target.folder), directory = await (await article.getDirectoryHandle('media')).getDirectoryHandle('file');
  const file = await directory.getFileHandle(resource.fileName); file.value = ''; file.modified = 1000;
  f.bookmarks.values.set(`target:${f.task.id}:${resource.id}`, { library: f.root, handle: file, size: 0, modified: 1000 });
  const resumed = await runImportResources(f.root, f.reader, f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {}, persist: async () => {} });
  assert.equal(resumed.task.state, 'complete'); assert.equal(await (await directory.getFileHandle(resource.fileName)).getFile().then(file => file.text()), '%PDF-payload');
  directory.seed(resource.fileName, 'user replacement');
  const conflict = await runImportResources(f.root, f.reader, f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {}, persist: async () => {} });
  assert.equal(conflict.task.state, 'paused'); assert.equal(conflict.task.resources[0].error.messageKey, 'imports.existingResource'); assert.equal(directory.children.get(resource.fileName).value, 'user replacement'); assert.equal(snapshot(f.original), before);
});

test('manual replacement selects a read-only file, survives bookmark recovery, and does not need the unavailable original source', async () => {
  const f = await fixture(), replacement = fs('replacement', { 'manual.pdf': 'replacement payload' }), file = await replacement.getFileHandle('manual.pdf'), previous = globalThis.window;
  globalThis.window = { showOpenFilePicker: async options => { assert.equal(options.multiple, false); return [file]; } };
  try {
    assert.equal((await chooseImportReplacement(f.root, f.task, f.task.resources[0], () => true, f.bookmarks)).name, 'manual.pdf');
    const before = snapshot(replacement), result = await runImportResources(f.root, unavailableImportSource(f.task, () => true), f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {} });
    assert.equal(result.task.state, 'complete'); assert.equal(result.diskError, undefined); assert.equal(snapshot(replacement), before); assert.equal(allCounts(replacement).writes, 0);
    const recovered = await loadImportTaskRecords(f.root, () => true); assert.equal(recovered.tasks[0].state, 'complete');
  } finally { globalThis.window = previous; }
});

test('cancellation is durably recorded, and deleted targets cancel instead of recreating manuscripts', async () => {
  const f = await fixture(), abort = new AbortController(); abort.abort({ messageKey: 'imports.cancelled' });
  const stopped = await runImportResources(f.root, f.reader, f.task, () => true, { signal: abort.signal, bookmarks: f.bookmarks, onChange() {}, onResource() {} });
  assert.equal(stopped.task.state, 'cancelled'); assert.equal(stopped.diskError, undefined);
  assert.equal((await loadImportTaskRecords(f.root, () => true)).tasks[0].state, 'cancelled');
  const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(f.task.target.month); await month.removeEntry(f.task.target.folder);
  const result = await runImportResources(f.root, f.reader, f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {} });
  assert.equal(result.task.state, 'cancelled'); assert.equal(result.task.resources[0].error.messageKey, 'imports.targetDeleted'); assert.equal(month.children.has(f.task.target.folder), false);
  f.root.permission = 'denied';
  const denied = await runImportResources(f.root, f.reader, f.task, () => true, { signal: new AbortController().signal, bookmarks: f.bookmarks, onChange() {}, onResource() {} });
  assert.equal(denied.task.state, 'paused'); assert.ok(denied.diskError);
});

test('pausing and cancelling an active slow stream stop reads, clean only its reservation and persist the final state', async () => {
  for (const action of ['paused', 'cancelled']) {
    const f = await fixture(), abort = new AbortController(), saved = []; let cancelled = 0;
    f.task.resources[0].location = 'https'; f.task.resources[0].source = 'https://example.com/slow.pdf';
    const fetcher = async () => { let timer; return new Response(new ReadableStream({ start(controller) { timer = setTimeout(() => controller.enqueue(new TextEncoder().encode('first chunk')), 120); }, cancel() { clearTimeout(timer); cancelled++; } })); };
    const result = await runImportResources(f.root, f.reader, f.task, () => true, {
      signal: abort.signal, bookmarks: f.bookmarks, fetcher, persist: async task => saved.push(task), onResource() { throw Error('unfinished file cannot complete'); },
      onChange(task) { if (task.resources[0].receivedBytes) abort.abort({ messageKey: 'imports.' + action }); },
    });
    assert.equal(result.task.state, action); assert.equal(saved.at(-1).state, action); assert.ok(cancelled > 0); assert.equal(result.task.resources[0].state, action === 'cancelled' ? 'cancelled' : 'pending');
    const article = await (await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(f.task.target.month)).getDirectoryHandle(f.task.target.folder);
    const files = await (await article.getDirectoryHandle('media')).getDirectoryHandle('file'); assert.equal(files.children.size, 0);
  }
});
