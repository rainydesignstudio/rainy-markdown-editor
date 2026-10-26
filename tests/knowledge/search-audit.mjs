// One consolidated audit of engine.ts; fixtures stay in memory.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';
const rows = [];
for (const size of [100, 1000, 10000]) {
  const writer = new KnowledgeIndexEngine(), sourceId = crypto.randomUUID(), generation = crypto.randomUUID(), shards = [], documents = [];
  const keep = value => { if (!value) return; const id = generation + '/part-' + String(shards.length).padStart(4, '0') + '.json'; shards.push({ id, ...value }); documents.push(...value.documents.map(meta => ({ ...meta, shard: id }))); };
  for (let i = 0; i < size; i++) keep(await writer.append(new Blob(['# Guide ' + i + '\n\n' + ('本地旧资料 无需作者和年份。'.repeat(50)) + '\n\nalpha beta exact phrase\n\nalpha alone\n\nbeta alone' + (i % 10 ? '' : '\n\nexcluded')]), 'notes/' + i + '.md', 100, sourceId));
  keep(await writer.flush());
  const { manifest } = await writer.finalize({ schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents, shards: shards.map(({ id, bytes, hash }) => ({ id, bytes, hash })) });
  const queries = ['alpha beta', { text: 'alpha', phrase: 'exact phrase', exclude: 'excluded', title: 'guide', path: 'notes/' }, { text: '', path: 'notes/' }, 'unmatched'];
  for (const query of queries) {
    const engine = new KnowledgeIndexEngine(); global.gc?.(); const heap = process.memoryUsage().heapUsed;
    const samples = [];
    for (let pass = 0; pass < 4; pass++) {
      let total = 0, hits = []; const start = performance.now();
      for (const shard of shards) { const result = await engine.search(shard.blob, shard.id, shard.hash, manifest, query); total += result.total; hits = engine.rank([...hits, ...result.hits]); }
      samples.push(+(performance.now() - start).toFixed(2));
      const expected = typeof query === 'string' ? query === 'unmatched' ? 0 : size * 3 : query.phrase ? size * 9 / 10 * 2 : size;
      assert.equal(total, expected); assert.equal(hits.length, Math.min(200, expected));
      if (typeof query === 'string' && query === 'alpha beta') assert.equal(hits[0].line, 5);
    }
    rows.push({ documents: size, bytes: shards.reduce((n, s) => n + s.bytes, 0), query, coldMs: samples[0], repeatedMs: samples.slice(1), heapGrowthMiB: +((process.memoryUsage().heapUsed - heap) / 1048576).toFixed(2), retainedCacheShards: Math.min(2, shards.length) });
  }
}
// Large Unicode document, dense passages, latest top-ranked hit, and corrupt input guards.
const engine = new KnowledgeIndexEngine(), sourceId = crypto.randomUUID(), generation = crypto.randomUUID(), id = generation + '/part-0000.json';
const text = '甲'.repeat(400000) + '\n\n' + 'alpha\n\nbeta\n\n'.repeat(1000) + 'alpha beta exact phrase';
await engine.append(new Blob([text]), 'legacy.md', 100, sourceId); const shard = await engine.flush();
const { manifest } = await engine.finalize({ schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents: shard.documents.map(meta => ({ ...meta, shard: id })), shards: [{ id, bytes: shard.bytes, hash: shard.hash }] });
const start = performance.now(), dense = await engine.search(shard.blob, id, shard.hash, manifest, 'alpha beta');
assert.equal(dense.total, 2001); assert.equal(dense.hits[0].line, 4003); assert.equal(dense.hits.length, 200);
await assert.rejects(new KnowledgeIndexEngine().search(shard.blob, id, 'invalid', manifest, 'alpha'));
console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, algorithm: 'src/lib/knowledge/engine.ts', rows, dense: { bytes: shard.bytes, passages: dense.total, ms: +(performance.now() - start).toFixed(2) }, note: 'Whole algorithm calls including shard integrity/decoding and bounded ranking. Heap growth is sampled allocation, not peak or retained heap. Worker transport/UI latency excluded.' }, null, 2));
