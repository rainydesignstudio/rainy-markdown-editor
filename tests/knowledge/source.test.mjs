import test from 'node:test';
import assert from 'node:assert/strict';
import { connectKnowledgeSource, restoreKnowledgeSource, readKnowledgeBinding, knowledgePath, validKnowledgeBinding } from '../../src/lib/knowledge/source.ts';
import { tree, snapshot, allCounts, bookmarks } from './fs-fixture.mjs';

test('binding writes only library metadata; browsing returns read-only data with zero source changes', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': '# A', 'nested/资料.md': '内容' }), store = bookmarks();
  const before = snapshot(source), reader = await connectKnowledgeSource(library, source, store);
  assert.equal(Object.isFrozen(reader), true); assert.equal(Object.isFrozen(reader.binding), true);
  for (const key of ['getDirectoryHandle', 'getFileHandle', 'createWritable', 'removeEntry', 'source', 'handle']) assert.equal(key in reader, false);
  assert.deepEqual(await Array.fromAsync(reader.list()), [{ name: 'a.md', kind: 'file' }, { name: 'nested', kind: 'directory' }]);
  assert.equal(await (await reader.readFile('nested/资料.md')).text(), '内容');
  assert.equal(snapshot(source), before); assert.equal(allCounts(source).writes, 0); assert.equal(allCounts(source).creates, 0);
  assert.ok(allCounts(source).permission.every(([, mode]) => mode === 'read'));
  assert.ok(allCounts(library).writes > 0); assert.deepEqual(await readKnowledgeBinding(library), reader.binding);
  assert.equal((await restoreKnowledgeSource(library, store)).status, 'ready');
});

test('same roots and both nesting directions are rejected before binding or bookmark writes', async () => {
  for (const mode of ['same', 'source-child', 'library-child']) {
    const outer = tree('outer', { 'child/a.md': 'A' }), child = outer.children.get('child'), store = bookmarks();
    const library = mode === 'library-child' ? child : outer, source = mode === 'same' ? outer : mode === 'source-child' ? child : outer;
    const before = snapshot(outer);
    await assert.rejects(connectKnowledgeSource(library, source, store), error => error.messageKey === 'knowledge.overlappingRoots');
    assert.equal(snapshot(outer), before); assert.equal(allCounts(outer).writes, 0); assert.equal(store.calls.length, 0);
  }
});

test('restoration does not scan source data and copied library metadata cannot reuse another directory bookmark', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': 'A' }), store = bookmarks();
  await connectKnowledgeSource(library, source, store);
  const reads = allCounts(source).reads;
  const restored = await restoreKnowledgeSource(library, store);
  assert.equal(restored.status, 'ready'); assert.equal(allCounts(source).reads, reads);
  const copy = tree('copied', { 'knowledge/binding.json': JSON.stringify(restored.binding) });
  assert.equal((await restoreKnowledgeSource(copy, store)).status, 'needs-source');
  assert.equal(allCounts(source).reads, reads);
});

test('all permission requests for a source are read-only and a missing writable library blocks source operations', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': 'A' }), store = bookmarks();
  await connectKnowledgeSource(library, source, store); source.permission = 'prompt';
  const result = await restoreKnowledgeSource(library, store); assert.equal(result.status, 'needs-permission');
  await assert.rejects(result.source.readFile('a.md'), error => error.messageKey === 'knowledge.readRequired');
  assert.equal(await result.source.requestReadPermission(), true);
  assert.equal((await restoreKnowledgeSource(library, store)).status, 'ready');
  library.permission = 'denied';
  await assert.rejects(result.source.readFile('a.md'), error => error.messageKey === 'knowledge.writableLibraryRequired');
  assert.equal((await restoreKnowledgeSource(library, store)).status, 'library-unavailable');
  assert.ok(allCounts(source).permission.every(([, mode]) => mode === 'read'));
  assert.equal(allCounts(source).reads, 0); assert.equal(allCounts(source).writes, 0);
});

test('unsafe relative paths and stale source operations fail without filesystem reads or writes', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': 'A' }), store = bookmarks(); let current = true;
  const reader = await connectKnowledgeSource(library, source, store, () => current);
  for (const path of ['', '../a.md', '/a.md', 'a//b', 'a/../b', 'a\\b', 'a\0b']) await assert.rejects(reader.readFile(path));
  assert.deepEqual(knowledgePath('', true), []);
  current = false; await assert.rejects(reader.readFile('a.md'), error => error.messageKey === 'knowledge.changed');
  await assert.rejects(reader.requestReadPermission(), error => error.messageKey === 'knowledge.changed');
  assert.equal(allCounts(source).reads, 0); assert.equal(allCounts(source).writes, 0);
});

test('bookmark and metadata failures preserve the old binding; invalid metadata can be explicitly replaced', async () => {
  const library = tree('library'), source = tree('notes'), store = bookmarks();
  store.failSave = true; await assert.rejects(connectKnowledgeSource(library, source, store));
  assert.equal(allCounts(library).writes, 0); store.failSave = false;
  const old = await connectKnowledgeSource(library, source, store), before = snapshot(library), known = [...store.records.keys()];
  library.children.get('knowledge').failWrite = true;
  await assert.rejects(connectKnowledgeSource(library, tree('other-notes'), store));
  assert.equal(snapshot(library), before); assert.deepEqual([...store.records.keys()], known);
  assert.equal((await restoreKnowledgeSource(library, store)).binding.sourceId, old.binding.sourceId);
  library.children.get('knowledge').failWrite = false;
  library.seed('knowledge/binding.json', '{bad'); assert.equal((await restoreKnowledgeSource(library, store)).status, 'invalid');
  const repaired = await connectKnowledgeSource(library, source, store); assert.ok(validKnowledgeBinding(repaired.binding));
  assert.equal((await restoreKnowledgeSource(library, store)).status, 'ready'); assert.equal(allCounts(source).writes, 0);
});

test('permission loss, moved roots and stale binding requests cannot publish a ready connection', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': 'A' }), store = bookmarks();
  source.permission = 'denied'; await assert.rejects(connectKnowledgeSource(library, source, store)); assert.equal(allCounts(library).writes, 0);
  source.permission = 'granted'; await assert.rejects(connectKnowledgeSource(library, source, store, () => false)); assert.equal(store.calls.length, 0);
  await connectKnowledgeSource(library, source, store); source.parent = library;
  assert.notEqual((await restoreKnowledgeSource(library, store)).status, 'ready');
  assert.equal(allCounts(source).writes, 0);
});

test('a library change while a bookmark is pending leaves target metadata untouched and drops the orphan', async () => {
  const library = tree('library'), source = tree('notes'), store = bookmarks(); let current = true, resume, reached;
  const gate = new Promise(resolve => { resume = resolve; }), ready = new Promise(resolve => { reached = resolve; });
  const save = store.save; store.save = async (id, value) => { await save(id, value); reached(); await gate; };
  const pending = connectKnowledgeSource(library, source, store, () => current);
  await ready; current = false; resume();
  await assert.rejects(pending, error => error.messageKey === 'knowledge.changed');
  assert.equal(store.records.size, 0); assert.equal(allCounts(library).writes, 0); assert.equal(allCounts(source).writes, 0);
});

test('an aliased knowledge directory cannot turn library metadata writes into source writes', async () => {
  const library = tree('library'), source = tree('notes', { 'a.md': 'A' }), store = bookmarks();
  library.children.set('knowledge', source);
  const before = snapshot(source);
  await assert.rejects(connectKnowledgeSource(library, source, store));
  assert.equal(snapshot(source), before); assert.equal(allCounts(source).writes, 0); assert.equal(allCounts(source).reads, 0);
  assert.equal(store.records.size, 0);
});

test('a canonical-looking source alias cannot read a file outside the granted source root', async () => {
  const library = tree('library'), source = tree('notes'), outside = tree('outside', { 'secret.md': 'private' });
  const reader = await connectKnowledgeSource(library, source, bookmarks());
  source.children.set('alias', outside); source.children.set('file-alias.md', outside.children.get('secret.md'));
  await assert.rejects(reader.readFile('alias/secret.md'), error => error.messageKey === 'knowledge.invalidPath');
  await assert.rejects(reader.readFile('file-alias.md'), error => error.messageKey === 'knowledge.invalidPath');
  await assert.rejects(Array.fromAsync(reader.list()), error => error.messageKey === 'knowledge.invalidPath');
  assert.equal(allCounts(outside).reads, 0); assert.equal(allCounts(outside).writes, 0);
});
