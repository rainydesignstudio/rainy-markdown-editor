import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';
import { parseKnowledgeText, resolveKnowledgeLinks, knowledgeHash } from '../../src/lib/knowledge/parse.ts';
import { validateKnowledgeManifest, knowledgeShardPath } from '../../src/lib/knowledge/model.ts';

const sourceId = crypto.randomUUID(), generation = crypto.randomUUID(), id = generation + '/part-0000.json';
const doc = (path, links = []) => ({ path, title: path, size: 1, modified: 1000, status: 'unindexed', links, diagnostics: [] });

test('Markdown/reference/wiki links preserve source lines while code, escaped wiki and HTML examples stay data', () => {
  const source = '---\ntitle: Front title\n---\n# Heading\n\n[B](B.md) [[C|别名]]\n\n`[[inline]]`\n\n```md\n[[fenced]] [x](bad.md)\n```\n\n\\[[escaped]]\n\n<a href="html.md">Example</a>\n\n[reference][b]\n\n[b]: B.md\n';
  const result = parseKnowledgeText(source, 'A.md');
  assert.equal(result.title, 'Front title');
  assert.deepEqual(result.links.map(link => link.target), ['B.md', 'C', 'B.md']);
  assert.equal(result.links[0].line, 6); assert.equal(result.links[1].kind, 'wiki');
  assert.equal(result.diagnostics.length, 0);
  const invalid = parseKnowledgeText('---\ntitle: [\n---\n# Actual\n', 'A.md');
  assert.equal(invalid.title, 'Actual'); assert.equal(invalid.diagnostics[0].kind, 'front-matter');
});

test('link resolution isolates root paths, ambiguity, dangling targets and traversal without network lookups', () => {
  const parsed = parseKnowledgeText('[B](../B.md#part) [[C]] [[Dup]] [bad](../../outside.md) [missing](Missing.md) [web](https://example.com/post.md)', 'notes/A.md');
  const result = resolveKnowledgeLinks([doc('notes/A.md', parsed.links), doc('B.md'), doc('C.md'), doc('one/Dup.md'), doc('two/Dup.md')]);
  assert.deepEqual(result.edges.map(edge => edge.to), ['B.md', 'C.md']);
  assert.ok(result.diagnostics.some(issue => issue.kind === 'ambiguous-link'));
  assert.ok(result.diagnostics.some(issue => issue.kind === 'outside-link'));
  assert.ok(result.diagnostics.some(issue => issue.kind === 'missing-link'));
  assert.equal(result.diagnostics.some(issue => issue.target?.startsWith('https:')), false);
  for (const path of ['../bad.json', '/absolute.json', generation + '/../../x', generation + '/other.json']) assert.throws(() => knowledgeShardPath(path));
});

test('immutable shard search filters removed records, reports real lines and rejects corruption', async () => {
  const engine = new KnowledgeIndexEngine();
  await engine.append(new Blob(['# A\n\nAlpha first\n']), 'A.md', 1000, sourceId);
  await engine.append(new Blob(['# İ\n\n目标 Alpha\n']), 'B.md', 1001, sourceId);
  const shard = await engine.flush();
  const input = { schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents: shard.documents.map(meta => ({ ...meta, shard: id })), shards: [{ id, bytes: shard.bytes, hash: shard.hash }] };
  const { manifest, blob } = await engine.finalize(input);
  assert.equal(validateKnowledgeManifest(JSON.parse(await blob.text()), sourceId).documents.length, 2);
  const result = await engine.search(shard.blob, id, shard.hash, manifest, 'alpha');
  assert.equal(result.total, 2); assert.equal(result.hits.find(hit => hit.path === 'B.md').line, 3);
  const removed = await engine.finalize({ ...input, generation: crypto.randomUUID(), documents: input.documents.filter(meta => meta.path === 'B.md') });
  assert.equal((await engine.search(shard.blob, id, shard.hash, removed.manifest, 'first')).total, 0);
  const fresh = new KnowledgeIndexEngine();
  await assert.rejects(fresh.search(new Blob(['tampered']), id, shard.hash, manifest, 'alpha'), error => error.messageKey === 'knowledge.indexCorruptShard');
  assert.equal(await knowledgeHash(shard.blob), shard.hash);
});

test('foreign-source and malformed manifests fail explicitly rather than becoming empty indexes', async () => {
  const engine = new KnowledgeIndexEngine(), bad = { schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents: [], shards: [], edges: [], diagnostics: [], diagnosticCount: 0, topologyTruncated: false };
  assert.equal((await engine.manifest(new Blob([JSON.stringify(bad)]), sourceId)).documents.length, 0);
  await assert.rejects(engine.manifest(new Blob([JSON.stringify(bad)]), crypto.randomUUID()), error => error.messageKey === 'knowledge.indexSourceChanged');
  await assert.rejects(engine.manifest(new Blob(['{bad']), sourceId), error => error.messageKey === 'knowledge.indexInvalid');
  assert.throws(() => validateKnowledgeManifest({ ...bad, edges: [{ from: 'missing', to: 'missing', line: 1 }] }));
});
