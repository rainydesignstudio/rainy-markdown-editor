import test from 'node:test';
import assert from 'node:assert/strict';
import { connectKnowledgeSource } from '../../src/lib/knowledge/source.ts';
import { readResearch, updateResearch, validateResearch, inspectCapture, sortCollectedKnowledge, transferCollectedKnowledge, reorderCollectedKnowledge } from '../../src/lib/knowledge/research.ts';
import { tree, bookmarks, snapshot, allCounts } from './fs-fixture.mjs';
const topic = name => ({ id: crypto.randomUUID(), name, note: '', articleIds: [], items: [] });

test('automatic shelf sorting retains manual order, keeps undated legacy captures stable and does not invent dates', () => {
  const a = { id: 'a', title: 'Chapter 10', path: 'a.md', createdAt: '2026-10-24T01:00:00.000Z', updatedAt: '2026-10-24T02:00:00.000Z' };
  const b = { id: 'b', title: 'Chapter 2', path: 'b.md', createdAt: '2026-10-25T01:00:00.000Z', updatedAt: '2026-10-25T02:00:00.000Z' };
  const older = { id: 'legacy1', title: '', path: 'Old.md' }, later = { ...older, id: 'legacy2' };
  const items = [older, a, later, b], before = JSON.stringify(items), ids = order => sortCollectedKnowledge(items, order, 'en-US').map(item => item.id);
  assert.deepEqual(ids('manual'), ['legacy1', 'a', 'legacy2', 'b']);
  assert.deepEqual(ids('updated-desc'), ['b', 'a', 'legacy1', 'legacy2']);
  assert.deepEqual(ids('created-asc'), ['a', 'b', 'legacy1', 'legacy2']);
  assert.deepEqual(ids('title-asc'), ['b', 'a', 'legacy1', 'legacy2']);
  assert.equal(JSON.stringify(items), before);
});

test('same-source moves preserve identity and snapshots, copies have independent identity and real creation time, failed writes retain the source', async () => {
  const root = tree('library'), origin = tree('notes', { 'a.md': 'Source' }), source = await connectKnowledgeSource(root, origin, bookmarks());
  const first = topic('First'), second = topic('Second'), now = '2026-10-25T01:00:00.000Z';
  const item = { id: crypto.randomUUID(), sourceId: source.binding.sourceId, path: 'a.md', title: '', content: 'Retained', original: '**Retained**', note: 'Note', whole: false, line: 1, endLine: 1 };
  await updateResearch(root, source, data => { first.items.push(item); data.topics.push(first, second); });
  const originalBytes = snapshot(origin), before = snapshot(root);
  await assert.rejects(updateResearch(root, source, data => { transferCollectedKnowledge(data, first.id, item.id, second.id, false); throw new Error('abort'); }));
  assert.equal(snapshot(root), before);
  const copied = await updateResearch(root, source, data => transferCollectedKnowledge(data, first.id, item.id, second.id, true, now));
  const copy = copied.topics[1].items[0];
  assert.notEqual(copy.id, item.id); assert.equal(copy.createdAt, now); assert.equal(copy.updatedAt, now);
  assert.equal(copy.note, item.note); assert.equal(copy.original, item.original); assert.equal(copied.topics[0].items.length, 1);
  const moved = await updateResearch(root, source, data => transferCollectedKnowledge(data, first.id, item.id, second.id, false, now));
  assert.equal(moved.topics[0].items.length, 0); assert.equal(moved.topics[1].items[1].id, item.id);
  assert.equal(moved.topics[1].items[1].createdAt, undefined, 'moving must not fabricate a legacy creation time');
  await assert.rejects(updateResearch(root, source, data => transferCollectedKnowledge(data, second.id, item.id, second.id, true)));
  await assert.rejects(updateResearch(root, source, data => { data.topics[1].items[0].updatedAt = 'invalid date'; }));
  await updateResearch(root, source, data => reorderCollectedKnowledge(data, second.id, [item.id, copy.id]));
  assert.deepEqual((await readResearch(root, source)).topics[1].items.map(item => item.id), [item.id, copy.id]);
  await assert.rejects(updateResearch(root, source, data => reorderCollectedKnowledge(data, second.id, [item.id])));
  await assert.rejects(updateResearch(root, source, data => reorderCollectedKnowledge(data, second.id, [item.id, item.id])));
  assert.equal(snapshot(origin), originalBytes); assert.equal(allCounts(origin).writes, 0);
});
test('topics, snapshots and citation origins persist only in the writable library and queued edits preserve each other', async () => {
  const root = tree('library'), source = tree('notes', { 'a.md': 'Old text' }), reader = await connectKnowledgeSource(root, source, bookmarks());
  const before = snapshot(source); assert.equal((await readResearch(root, reader)).topics.length, 0);
  await Promise.all([updateResearch(root, reader, data => data.topics.push(topic('First'))), updateResearch(root, reader, data => data.topics.push(topic('Second')))]);
  await updateResearch(root, reader, data => { data.topics[0].items.push({ id: crypto.randomUUID(), sourceId: reader.binding.sourceId, path: 'a.md', title: '', content: 'Old text', line: 1, endLine: 1, whole: false, note: 'my note' }); });
  const loaded = await readResearch(root, reader); assert.equal(loaded.topics.length, 2); assert.equal(loaded.topics[0].items[0].content, 'Old text');
  assert.equal(snapshot(source), before); assert.equal(allCounts(source).writes, 0);
});
test('stale sessions, revoked permissions, invalid metadata and mutation failures never overwrite research', async () => {
  const root = tree('library'), source = tree('notes'), store = bookmarks(); let current = true;
  const reader = await connectKnowledgeSource(root, source, store, () => current);
  await updateResearch(root, reader, data => data.topics.push(topic('Keep'))); const before = snapshot(root);
  await assert.rejects(updateResearch(root, reader, data => { data.topics[0].name = ''; })); assert.equal(snapshot(root), before);
  current = false; await assert.rejects(updateResearch(root, reader, data => data.topics.push(topic('Stale')))); assert.equal(snapshot(root), before);
  current = true; root.permission = 'denied'; await assert.rejects(readResearch(root, reader)); assert.equal(snapshot(root), before);
  assert.throws(() => validateResearch({ schemaVersion: 1, sourceId: reader.binding.sourceId, topics: [], citations: [{ id: '../unsafe' }] }, reader.binding.sourceId));
});

test('capture comparison follows unchanged moved text, flags actual changes, and preserves the old snapshot', () => {
  const capture = { sourceId: crypto.randomUUID(), path: 'a.md', title: '', content: 'Captured', line: 3, endLine: 3, whole: false };
  assert.equal(inspectCapture(capture, 'New introduction\n\n\nCaptured').changed, false);
  assert.equal(inspectCapture(capture, 'New introduction\n\n\nCaptured').line, 4);
  const changed = inspectCapture(capture, 'Intro\n\nRevised'); assert.equal(changed.changed, true); assert.equal(changed.content, 'Revised'); assert.equal(capture.content, 'Captured');
  const rendered = { ...capture, content: 'Bold words', original: '**Bold words**' };
  assert.equal(inspectCapture(rendered, 'Intro\n\n**Bold words**').changed, false);
});

test('failed first research writes clean only the owned empty file and can be retried', async () => {
  const root = tree('library'), source = tree('notes'), reader = await connectKnowledgeSource(root, source, bookmarks());
  const folder = root.children.get('knowledge'), name = 'research-' + reader.binding.sourceId + '.json';
  folder.failWrite = true; await assert.rejects(updateResearch(root, reader, value => value.topics.push(topic('First'))));
  assert.equal(folder.children.has(name), false);
  folder.failWrite = false; await updateResearch(root, reader, value => value.topics.push(topic('Retried')));
  assert.equal((await readResearch(root, reader)).topics[0].name, 'Retried'); const before = snapshot(root);
  folder.failWrite = true; await assert.rejects(updateResearch(root, reader, value => value.topics.push(topic('Failed')))); assert.equal(snapshot(root), before);
  assert.equal(allCounts(source).writes, 0);
});
test('lost permission defers owned-file cleanup until access returns', async () => {
  const root = tree('library'), reader = await connectKnowledgeSource(root, tree('notes'), bookmarks()), folder = root.children.get('knowledge');
  const name = 'research-' + reader.binding.sourceId + '.json', get = folder.getFileHandle; let first = true;
  folder.getFileHandle = async (...args) => { const file = await get(...args); if (args[1]?.create && first) { first = false; file.createWritable = async () => ({ async write() { root.permission = 'denied'; throw new Error('permission lost'); }, async abort() {} }); } return file; };
  await assert.rejects(updateResearch(root, reader, () => {})); assert.equal(folder.children.get(name).value, '');
  root.permission = 'granted'; assert.equal((await readResearch(root, reader)).topics.length, 0); assert.equal(folder.children.has(name), false);
  await updateResearch(root, reader, value => value.topics.push(topic('Recovered'))); assert.equal((await readResearch(root, reader)).topics[0].name, 'Recovered');
});
test('external replacements and preexisting empty files are never removed as failed creations', async () => {
  for (const replacement of ['', 'External content']) {
    const root = tree('library'), reader = await connectKnowledgeSource(root, tree('notes'), bookmarks()), folder = root.children.get('knowledge');
    const name = 'research-' + reader.binding.sourceId + '.json', get = folder.getFileHandle;
    folder.getFileHandle = async (...args) => { const file = await get(...args); if (args[1]?.create) file.createWritable = async () => ({ async write() { folder.seed(name, replacement); throw new Error('replaced externally'); }, async abort() {} }); return file; };
    await assert.rejects(updateResearch(root, reader, () => {})); assert.equal(folder.children.get(name).value, replacement);
  }
  const root = tree('library'), reader = await connectKnowledgeSource(root, tree('notes'), bookmarks());
  root.seed('knowledge/research-' + reader.binding.sourceId + '.json', ''); const before = snapshot(root);
  await assert.rejects(updateResearch(root, reader, () => {})); assert.equal(snapshot(root), before);
});
test('writer creation failure is cleaned and concurrent reads wait for committed research', async () => {
  const root = tree('library'), reader = await connectKnowledgeSource(root, tree('notes'), bookmarks()), folder = root.children.get('knowledge');
  const get = folder.getFileHandle; let first = true;
  folder.getFileHandle = async (...args) => { const file = await get(...args); if (args[1]?.create && first) { first = false; file.createWritable = async () => { throw new Error('cannot open writer'); }; } return file; };
  await assert.rejects(updateResearch(root, reader, () => {}));
  const saving = updateResearch(root, reader, value => value.topics.push(topic('Committed'))), reading = readResearch(root, reader);
  await saving; assert.equal((await reading).topics[0].name, 'Committed');
});
