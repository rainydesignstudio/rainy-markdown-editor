import test from 'node:test';
import assert from 'node:assert/strict';
import { addKnowledgeSource, connectKnowledgeSource, readKnowledgeBindings, restoreKnowledgeSource, updateKnowledgeSource, disconnectKnowledgeSource, knowledgeSourceDirectory } from '../../src/lib/knowledge/source.ts';
import { rebuildKnowledgeIndex, searchKnowledgeIndex } from '../../src/lib/knowledge/indexing.ts';
import { readKnowledgeIndex } from '../../src/lib/knowledge/store.ts';
import { readResearch, updateResearch } from '../../src/lib/knowledge/research.ts';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';
import { tree, allCounts, snapshot, bookmarks } from './fs-fixture.mjs';

const worker = () => { const engine = new KnowledgeIndexEngine(); return { request: async (op, args, signal) => { signal?.throwIfAborted(); return engine[op](...args); }, dispose() {} }; };

test('independent sources with identical filenames keep separate indexes and never write original files', async () => {
  const root = tree('library'), store = bookmarks(), a = tree('notes-a', { 'same.md': '# A\n\nAlpha' }), b = tree('notes-b', { 'same.md': '# B\n\nBeta' });
  const beforeA = snapshot(a), beforeB = snapshot(b), ra = await addKnowledgeSource(root, a, store), rb = await addKnowledgeSource(root, b, store);
  const ma = await rebuildKnowledgeIndex(root, ra, { worker: worker() }), mb = await rebuildKnowledgeIndex(root, rb, { worker: worker() });
  assert.equal((await searchKnowledgeIndex(root, ra, ma, 'Alpha', worker())).total, 1);
  assert.equal((await searchKnowledgeIndex(root, rb, mb, 'Alpha', worker())).total, 0);
  assert.equal((await searchKnowledgeIndex(root, rb, mb, 'Beta', worker())).total, 1);
  assert.equal((await readKnowledgeBindings(root)).length, 2);
  assert.notEqual((await knowledgeSourceDirectory(root, ra)).name, (await knowledgeSourceDirectory(root, rb)).name);
  assert.equal(snapshot(a), beforeA); assert.equal(snapshot(b), beforeB); assert.equal(allCounts(a).writes + allCounts(b).writes, 0);
});

test('adding to a legacy library preserves source identity, manifest and collected material', async () => {
  const root = tree('library'), store = bookmarks(), old = await connectKnowledgeSource(root, tree('legacy', { 'a.md': 'original' }), store);
  const manifest = await rebuildKnowledgeIndex(root, old, { worker: worker() });
  await updateResearch(root, old, data => { data.topics.push({ id: crypto.randomUUID(), name: 'Keep', note: 'My note', articleIds: ['2026-10/old'], items: [] }); });
  await addKnowledgeSource(root, tree('second'), store);
  const entries = await readKnowledgeBindings(root), restored = await restoreKnowledgeSource(root, store, () => true, old.binding.sourceId);
  assert.equal(entries[0].sourceId, old.binding.sourceId); assert.ok(entries[0].directory);
  assert.equal((await readKnowledgeIndex(root, restored.source, worker())).generation, manifest.generation);
  assert.equal((await readResearch(root, restored.source)).topics[0].note, 'My note');
});

test('renaming a local partition and display name keeps index, research and external binding stable', async () => {
  const root = tree('library'), store = bookmarks(), external = tree('outside', { 'a.md': 'Alpha' }), reader = await addKnowledgeSource(root, external, store);
  const manifest = await rebuildKnowledgeIndex(root, reader, { worker: worker() }), previous = (await readKnowledgeBindings(root))[0].directory, before = snapshot(external);
  await updateResearch(root, reader, data => { data.topics.push({ id: crypto.randomUUID(), name: 'Keep', note: '', articleIds: [], items: [] }); });
  await updateKnowledgeSource(root, reader.binding.sourceId, { name: 'Renamed', directory: 'renamed-notes' });
  const restored = await restoreKnowledgeSource(root, store, () => true, reader.binding.sourceId);
  assert.equal(restored.binding.sourceId, reader.binding.sourceId); assert.equal(restored.binding.name, 'Renamed');
  assert.equal((await readKnowledgeIndex(root, restored.source, worker())).generation, manifest.generation);
  assert.equal((await readResearch(root, restored.source)).topics[0].name, 'Keep');
  assert.equal(root.children.get('knowledge').children.has(previous), false); assert.equal(snapshot(external), before);
});

test('removing or replacing a connection retains adopted snapshots and does not silently rebind them', async () => {
  const root = tree('library'), store = bookmarks(), reader = await addKnowledgeSource(root, tree('old'), store);
  await updateResearch(root, reader, data => { data.topics.push({ id: crypto.randomUUID(), name: 'Retained', note: '', articleIds: [], items: [] }); });
  const entry = (await readKnowledgeBindings(root))[0], retained = snapshot(await knowledgeSourceDirectory(root, reader));
  const next = await addKnowledgeSource(root, tree('replacement'), store, () => true, entry.sourceId);
  assert.notEqual(next.binding.sourceId, entry.sourceId); assert.equal((await readKnowledgeBindings(root)).length, 1);
  assert.equal(snapshot(root.children.get('knowledge').children.get(entry.directory)), retained);
  await assert.rejects(reader.assertCurrent(), error => error.messageKey === 'knowledge.indexSourceChanged');
  await disconnectKnowledgeSource(root, next.binding.sourceId);
  assert.equal((await readKnowledgeBindings(root)).length, 0); assert.equal((await readKnowledgeBindings(root, true)).length, 2);
});

test('partition collisions, unsafe names and foreign library bookmarks cannot replace existing data', async () => {
  const root = tree('library'), store = bookmarks(), external = tree('outside'), reader = await addKnowledgeSource(root, external, store);
  const before = snapshot(root);
  await assert.rejects(updateKnowledgeSource(root, reader.binding.sourceId, { name: 'Unsafe', directory: '../outside' }));
  assert.equal(snapshot(root), before);
  const entry = (await readKnowledgeBindings(root))[0];
  root.seed('knowledge/occupied/notes.json', 'keep');
  await assert.rejects(updateKnowledgeSource(root, entry.sourceId, { name: 'Collision', directory: 'occupied' }));
  assert.equal(root.children.get('knowledge').children.get('occupied').children.get('notes.json').value, 'keep');
  const copied = tree('copied'); copied.seed('knowledge/binding.json', root.children.get('knowledge').children.get('binding.json').value);
  assert.equal((await restoreKnowledgeSource(copied, store, () => true, entry.sourceId)).status, 'needs-source');
});

test('a failed initial binding write leaves no phantom registration and can be retried', async () => {
  const root = tree('library', { 'knowledge/keep.json': 'keep' }), store = bookmarks(), source = tree('outside');
  root.children.get('knowledge').failWrite = true;
  await assert.rejects(addKnowledgeSource(root, source, store));
  assert.equal((await readKnowledgeBindings(root)).length, 0);
  assert.equal(root.children.get('knowledge').children.size, 1);
  root.children.get('knowledge').failWrite = false;
  await addKnowledgeSource(root, source, store); assert.equal((await readKnowledgeBindings(root)).length, 1);
  assert.equal(allCounts(source).writes, 0);
});

test('failure to open the first binding writer cleans only its own empty metadata', async () => {
  const root = tree('library', { 'knowledge/keep.json': 'keep' }), store = bookmarks(), source = tree('outside');
  const folder = root.children.get('knowledge'), getFile = folder.getFileHandle;
  folder.getFileHandle = async (name, options) => {
    const file = await getFile(name, options);
    if (name === 'binding.json' && options?.create) file.createWritable = async () => { throw new Error('writer unavailable'); };
    return file;
  };
  await assert.rejects(addKnowledgeSource(root, source, store), /writer unavailable/);
  assert.equal(folder.children.has('binding.json'), false);
  folder.getFileHandle = getFile;
  await addKnowledgeSource(root, source, store);
  assert.equal((await readKnowledgeBindings(root)).length, 1);
});
