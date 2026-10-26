import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTrashCleanupCheckpoint, readTrashCleanupCheckpoint, removeTrashCleanupCheckpoint } from '../src/lib/trashCleanupCheckpoint.ts';

test('refresh journal restores the same library and receipt remaining time without extending the committed file window', () => {
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  saveTrashCleanupCheckpoint(storage, 'library-a', 'receipt', 'created', 12000);
  assert.equal(readTrashCleanupCheckpoint(storage, 'library-a', 'receipt', 'created', 30000), 12000);
  assert.equal(readTrashCleanupCheckpoint(storage, 'library-a', 'receipt', 'created', 5000), 5000);
  assert.equal(readTrashCleanupCheckpoint(storage, 'library-b', 'receipt', 'created', 30000), 30000);
  assert.equal(readTrashCleanupCheckpoint(storage, 'library-a', 'receipt', 'other-created', 30000), 30000);
  removeTrashCleanupCheckpoint(storage, 'library-a', 'receipt'); assert.equal(values.size, 0);
});

test('missing identity, malformed cache and denied browser storage retain the file-backed recovery window', () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
  saveTrashCleanupCheckpoint(denied, 'a', 'id', 'date', 10); removeTrashCleanupCheckpoint(denied, 'a', 'id');
  assert.equal(readTrashCleanupCheckpoint(denied, 'a', 'id', 'date', 30000), 30000);
  assert.equal(readTrashCleanupCheckpoint(null, null, 'id', 'date', 30000), 30000);
  assert.equal(readTrashCleanupCheckpoint({ getItem: () => '{broken' }, 'a', 'id', 'date', 30000), 30000);
});
