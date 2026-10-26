import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';

async function setup(files) {
  const engine = new KnowledgeIndexEngine(), sourceId = crypto.randomUUID(), generation = crypto.randomUUID(), id = generation + '/part-0000.json';
  for (const [path, text] of Object.entries(files)) await engine.append(new Blob([text]), path, 100, sourceId);
  const shard = await engine.flush();
  const { manifest } = await engine.finalize({ schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents: shard.documents.map(meta => ({ ...meta, shard: id })), shards: [{ id, bytes: shard.bytes, hash: shard.hash }] });
  return query => engine.search(shard.blob, id, shard.hash, manifest, query);
}

test('passages in the same document remain separate and co-occurring words rank first', async () => {
  const search = await setup({ 'guide.md': '# Guide\n\nalpha alone\n\nbeta alone\n\nalpha beta together' });
  const result = await search('alpha beta');
  assert.equal(result.total, 3);
  assert.equal(result.hits[0].line, 7);
  assert.equal(result.hits[0].snippet, 'alpha beta together');
  assert.deepEqual(result.hits.slice(1).map(hit => hit.line), [3, 5]);
});

test('phrase, exclusions, title and path filters compose without requiring metadata', async () => {
  const search = await setup({ 'notes/a.md': '# First\n\nKeep this exact phrase.', 'notes/b.md': '# Second\n\nKeep this exact phrase. unwanted', 'other/c.md': 'Keep this exact phrase.' });
  const result = await search({ text: 'keep', phrase: 'exact phrase', exclude: 'unwanted', title: 'first', path: 'notes/' });
  assert.equal(result.total, 1); assert.equal(result.hits[0].path, 'notes/a.md');
  assert.equal((await search({ text: '', path: 'other/' })).total, 1);
  assert.equal((await search({ text: '', phrase: 'not contiguous' })).total, 0);
});

test('bounded results retain a high-ranked late match and report all passage matches', async () => {
  const search = await setup({ 'a.md': '# Partials\n\n' + ('alpha\n\n'.repeat(250)) + 'beta', 'z.md': '# Final\n\nalpha beta' });
  const result = await search('alpha beta');
  assert.equal(result.total, 252); assert.equal(result.hits.length, 200);
  assert.equal(result.hits[0].path, 'z.md');
  assert.deepEqual(result.hits, (await search('alpha beta')).hits);
});

test('Unicode folding preserves physical paragraph lines', async () => {
  const search = await setup({ 'old.md': '# 未命名\r\n\r\nİ 主题 保存\r\n第二行' });
  const result = await search({ text: '主题 保存', exclude: '不在这里' });
  assert.equal(result.hits[0].line, 3); assert.equal(result.hits[0].endLine, 4);
  assert.equal((await search('i̇')).hits[0].line, 3);
});
