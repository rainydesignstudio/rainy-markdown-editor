import test from 'node:test';
import assert from 'node:assert/strict';
import { connectKnowledgeSource } from '../../src/lib/knowledge/source.ts';
import { rebuildKnowledgeIndex, searchKnowledgeIndex } from '../../src/lib/knowledge/indexing.ts';
import { readKnowledgeIndex } from '../../src/lib/knowledge/store.ts';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';
import { KNOWLEDGE_LIMITS } from '../../src/lib/knowledge/model.ts';
import { tree, allCounts, snapshot, bookmarks } from './fs-fixture.mjs';

function localWorker() { const engine = new KnowledgeIndexEngine(); return { async request(operation, args, signal) { signal?.throwIfAborted(); return engine[operation](...args); }, dispose() {} }; }
async function fixture(files = { 'A.md': '# A\n\n[B](B.md)\n\nAlpha-only', 'B.md': '# B\n\nBeta second', 'media/a.png': 'binary' }) {
  const library = tree('library'), source = tree('notes', files), reader = await connectKnowledgeSource(library, source, bookmarks());
  return { library, source, reader };
}
const indexDirectory = library => library.children.get('knowledge').children.get('index');
function storedPart(library, id) { const [generation, name] = id.split('/'); return indexDirectory(library).children.get('generations').children.get(generation).children.get(name); }

test('initial indexing, no-change incrementals and normal search have explicit source/body/write counts', async () => {
  const f = await fixture(), before = snapshot(f.source), states = [];
  const first = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), onProgress: value => states.push(value) });
  assert.equal(first.documents.length, 2); assert.equal(first.edges.length, 1); assert.equal(first.status, 'ready');
  assert.equal(allCounts(f.source).bodyReads, 2); assert.equal(allCounts(f.source).writes, 0); assert.equal(snapshot(f.source), before);
  const shard = storedPart(f.library, first.shards[0].id), modified = shard.modified, body = allCounts(f.source).bodyReads, writes = allCounts(f.library).writes;
  const secondStates = [];
  const second = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), onProgress: value => secondStates.push(value) });
  assert.equal(secondStates.at(-1).parsed, 0); assert.equal(secondStates.at(-1).reused, 2);
  assert.equal(allCounts(f.source).bodyReads, body); assert.equal(shard.modified, modified);
  assert.deepEqual(second.shards, first.shards); assert.equal(allCounts(f.library).writes - writes, 1, 'only active manifest freshness is written');
  const reads = allCounts(f.source).reads, worker = localWorker();
  assert.equal((await readKnowledgeIndex(f.library, f.reader, worker)).generation, second.generation);
  assert.equal((await searchKnowledgeIndex(f.library, f.reader, second, 'alpha', worker)).hits[0].path, 'A.md');
  assert.equal(allCounts(f.source).reads, reads); assert.equal(allCounts(f.source).bodyReads, body);
});

test('only changed documents reparse, deleted documents vanish even when their old shard stays active, and force finds metadata-invisible edits', async () => {
  const f = await fixture(); let manifest = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  const a = f.source.children.get('A.md'); a.value = '# A\n\n[B](B.md)\n\nDelta-only'; a.modified++;
  let body = allCounts(f.source).bodyReads, last;
  manifest = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), onProgress: value => { last = value; } });
  assert.equal(last.parsed, 1); assert.equal(last.reused, 1); assert.equal(allCounts(f.source).bodyReads - body, 1);
  a.value = a.value.replace('Delta', 'Gamma'); body = allCounts(f.source).bodyReads;
  manifest = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  assert.equal(allCounts(f.source).bodyReads, body, 'same-size/same-time edits require explicit force');
  manifest = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), force: true });
  assert.equal((await searchKnowledgeIndex(f.library, f.reader, manifest, 'gamma', localWorker())).total, 1);
  f.source.children.delete('A.md'); body = allCounts(f.source).bodyReads;
  manifest = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  assert.equal(manifest.documents.length, 1); assert.equal(allCounts(f.source).bodyReads, body);
  assert.equal((await searchKnowledgeIndex(f.library, f.reader, manifest, 'gamma', localWorker())).total, 0);
  assert.equal(allCounts(f.source).writes, 0);
});

test('cancellation before manifest close preserves the previous active generation', async () => {
  const f = await fixture(), first = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  f.source.children.get('A.md').modified++;
  const controller = new AbortController(), file = indexDirectory(f.library).children.get('manifest.json'), original = file.createWritable;
  file.createWritable = async () => { const writer = await original(); return { ...writer, async write(value) { await writer.write(value); controller.abort(); } }; };
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), signal: controller.signal }));
  file.createWritable = original;
  assert.equal((await readKnowledgeIndex(f.library, f.reader, localWorker())).generation, first.generation);
  assert.equal(allCounts(f.source).writes, 0);
});

test('corrupt reused shards are rebuilt from source; invalid manifest is never trusted and force repairs it', async () => {
  const f = await fixture(), first = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  storedPart(f.library, first.shards[0].id).value = 'corrupt';
  const before = allCounts(f.source).bodyReads;
  const repaired = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  assert.equal(allCounts(f.source).bodyReads - before, 2);
  assert.equal((await searchKnowledgeIndex(f.library, f.reader, repaired, 'beta', localWorker())).total, 1);
  const file = indexDirectory(f.library).children.get('manifest.json'); file.value = '{bad';
  await assert.rejects(readKnowledgeIndex(f.library, f.reader, localWorker()));
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() }));
  assert.equal(file.value, '{bad');
  assert.equal((await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), force: true })).documents.length, 2);
  assert.equal(allCounts(f.source).writes, 0);
});

test('oversized source files are explicit unindexed entries without reading their bytes', async () => {
  const f = await fixture({ 'large.md': new Blob([new Uint8Array(KNOWLEDGE_LIMITS.documentBytes + 1)]) });
  const result = await rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() });
  assert.equal(result.status, 'partial'); assert.equal(result.documents[0].status, 'unindexed');
  assert.equal(result.diagnostics[0].kind, 'oversized'); assert.equal(result.shards.length, 0);
  assert.equal(allCounts(f.source).bodyReads, 0); assert.equal(allCounts(f.source).writes, 0);
});

test('an index-directory alias into the source is rejected before any source write', async () => {
  const f = await fixture(); f.library.children.get('knowledge').children.set('index', f.source);
  const before = snapshot(f.source);
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker() }));
  assert.equal(snapshot(f.source), before); assert.equal(allCounts(f.source).writes, 0);
});

test('a first-scan cancellation leaves an index missing instead of publishing an empty placeholder', async () => {
  const f = await fixture(), controller = new AbortController();
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), signal: controller.signal, onProgress: value => { if (value.phase === 'publishing') controller.abort(); } }));
  assert.equal(await readKnowledgeIndex(f.library, f.reader, localWorker()), null);
  assert.equal(allCounts(f.source).writes, 0);
});

test('a failed first manifest write removes its new empty header and leaves source data unchanged', async () => {
  const f = await fixture(), before = snapshot(f.source);
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker: localWorker(), onProgress: value => { if (value.phase === 'publishing') indexDirectory(f.library).failWrite = true; } }));
  indexDirectory(f.library).failWrite = false;
  assert.equal(await readKnowledgeIndex(f.library, f.reader, localWorker()), null);
  assert.equal(snapshot(f.source), before); assert.equal(allCounts(f.source).writes, 0);
});

test('a cancelled append buffer cannot leak records into a later scan using the same worker', async () => {
  const f = await fixture(), worker = localWorker();
  const first = await rebuildKnowledgeIndex(f.library, f.reader, { worker });
  f.source.children.get('A.md').modified++;
  const controller = new AbortController(), request = worker.request; let cancel = true;
  worker.request = async (operation, args, signal) => { const value = await request(operation, args, signal); if (cancel && operation === 'append') controller.abort(); return value; };
  await assert.rejects(rebuildKnowledgeIndex(f.library, f.reader, { worker, signal: controller.signal }));
  assert.equal((await readKnowledgeIndex(f.library, f.reader, worker)).generation, first.generation);
  cancel = false;
  const next = await rebuildKnowledgeIndex(f.library, f.reader, { worker });
  assert.equal(next.documents.length, 2); assert.equal(new Set(next.documents.map(doc => doc.path)).size, 2);
  assert.equal(allCounts(f.source).writes, 0);
});
