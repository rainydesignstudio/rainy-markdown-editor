import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createKnowledgeWorker } from '../../src/lib/knowledge/workerClient.ts';

test('the actual worker protocol parses File snapshots off the main thread and serializes concurrent operations', async () => {
  const worker = new Worker(new URL('./worker-bridge.mjs', import.meta.url), { execArgv: ['--experimental-strip-types', '--experimental-loader', fileURLToPath(new URL('../ts-loader.mjs', import.meta.url))] });
  const [ready] = await once(worker, 'message'); assert.ok(ready.threadId > 0);
  const listeners = new Map(), port = {
    postMessage(value) { worker.postMessage(value); },
    addEventListener(type, handler) { const callback = type === 'message' ? data => handler({ data }) : handler; listeners.set(handler, [type, callback]); worker.on(type, callback); },
    removeEventListener(_type, handler) { const pair = listeners.get(handler); if (pair) worker.off(...pair); listeners.delete(handler); },
    terminate() { void worker.terminate(); },
  };
  const client = createKnowledgeWorker(() => port), sourceId = crypto.randomUUID();
  try {
    await Promise.all([
      client.request('append', [new Blob(['# A\n\n[[B]]']), 'A.md', 1, sourceId]),
      client.request('append', [new Blob(['# B']), 'B.md', 1, sourceId]),
    ]);
    const result = await client.request('flush', []);
    assert.equal(result.documents.length, 2); assert.equal(result.documents[0].links[0].target, 'B');
    const generation = crypto.randomUUID(), id = generation + '/part-0000.json';
    const finalized = await client.request('finalize', [{ schemaVersion: 1, sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents: result.documents.map(meta => ({ ...meta, shard: id })), shards: [{ id, hash: result.hash, bytes: result.bytes }] }]);
    const graph = await client.request('graph', [finalized.manifest, { mode: 'global', root: '', depth: 1, filter: '' }]);
    assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1); assert.ok(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
    const signal = new AbortController(); signal.abort();
    await assert.rejects(client.request('flush', [], signal.signal), error => error.messageKey === 'knowledge.indexCancelled');
  } finally { client.dispose(); }
});
