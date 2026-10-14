import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildKnowledgeGraph, KNOWLEDGE_GRAPH_LIMITS } from '../../src/lib/knowledge/graph.ts';
import { KnowledgeIndexEngine } from '../../src/lib/knowledge/engine.ts';

function manifest(paths, edges) {
  return { schemaVersion: 1, sourceId: crypto.randomUUID(), generation: crypto.randomUUID(), scannedAt: new Date().toISOString(), status: 'partial',
    documents: paths.map(path => ({ path, title: path.slice(0, -3), size: 1, modified: 1, status: 'unindexed', links: [], diagnostics: [] })),
    shards: [], edges: edges.map(([from, to]) => ({ from, to, line: 1 })), diagnostics: [], diagnosticCount: 0, topologyTruncated: false };
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const options = { mode: 'global', root: '', depth: 1, filter: '' };
test('graph uses only explicit links and cannot mutate the index during static D3 layout', () => {
  const input = freeze(manifest(['A.md', 'B.md', 'C.md', 'D.md', 'Isolated.md'], [['A.md', 'B.md'], ['C.md', 'A.md'], ['B.md', 'D.md']]));
  const before = JSON.stringify(input), first = buildKnowledgeGraph(input, options), second = buildKnowledgeGraph(input, options);
  assert.equal(JSON.stringify(input), before); assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 5); assert.equal(first.edges.length, 3);
  assert.equal(first.nodes.find(node => node.path === 'Isolated.md').degree, 0);
  for (const node of first.nodes) { assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y)); assert.ok(node.x >= 40 && node.x <= 960 && node.y >= 40 && node.y <= 560); }
});
test('local neighborhoods include inbound and outbound relationships and respect depth', () => {
  const input = manifest(['A.md', 'B.md', 'C.md', 'D.md', 'Far.md'], [['A.md', 'B.md'], ['C.md', 'A.md'], ['B.md', 'D.md']]);
  assert.deepEqual(new Set(buildKnowledgeGraph(input, { ...options, mode: 'local', root: 'A.md' }).nodes.map(node => node.path)), new Set(['A.md', 'B.md', 'C.md']));
  assert.equal(buildKnowledgeGraph(input, { ...options, mode: 'local', root: 'A.md', depth: 2 }).nodes.length, 4);
  assert.equal(buildKnowledgeGraph(input, { ...options, mode: 'local', root: 'missing.md' }).nodes.length, 0);
  assert.equal(buildKnowledgeGraph(input, { ...options, filter: 'isolated' }).nodes.length, 0);
  assert.deepEqual(buildKnowledgeGraph(input, { ...options, filter: 'far' }).nodes.map(node => node.path), ['Far.md']);
});
test('large and dense graphs cap display with explicit totals and truncation flags', () => {
  const paths = Array.from({ length: 1000 }, (_, index) => `Doc-${index}.md`);
  const input = manifest(paths, paths.slice(1).map(path => [paths[0], path]));
  const graph = buildKnowledgeGraph(input, options);
  assert.equal(graph.nodes.length, KNOWLEDGE_GRAPH_LIMITS.nodes); assert.equal(graph.total, 1000); assert.equal(graph.truncated, true);
  const densePaths = paths.slice(0, 100), edges = [];
  for (let i = 0; i < densePaths.length; i++) for (let j = i + 1; j < densePaths.length; j++) edges.push([densePaths[i], densePaths[j]]);
  const dense = buildKnowledgeGraph(manifest(densePaths, edges), options);
  assert.equal(dense.edges.length, KNOWLEDGE_GRAPH_LIMITS.edges); assert.equal(dense.edgeTotal, 4950); assert.equal(dense.truncated, true);
});
test('the worker engine exposes graph layout without any filesystem/source capability', () => {
  const input = manifest(['A.md'], []), engine = new KnowledgeIndexEngine();
  assert.equal(engine.graph(input, options).nodes.length, 1);
  assert.throws(() => engine.graph(input, { ...options, depth: 99 }));
  assert.throws(() => engine.graph({ ...input, edges: [{ from: 'A.md', to: 'outside.md', line: 1 }] }, options));
  assert.equal(engine.graph({ ...input, topologyTruncated: true }, options).topologyTruncated, true);
});
test('controlled 10000-document graph remains bounded and reports the actual fixture timing', () => {
  const paths = Array.from({ length: 10000 }, (_, index) => `Doc-${index}.md`), input = manifest(paths, paths.slice(1).map(path => [paths[0], path]));
  const started = performance.now(), graph = buildKnowledgeGraph(input, options);
  assert.equal(graph.nodes.length, 300); assert.equal(graph.total, 10000);
  console.log(JSON.stringify({ measurement: 'Node static D3 layout; not browser FPS', documents: paths.length, visible: graph.nodes.length, edges: graph.edges.length, ms: performance.now() - started }));
});
