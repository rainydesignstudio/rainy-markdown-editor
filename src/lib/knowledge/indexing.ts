import { createArticleMutationQueue } from '../articleMutationQueue';
import { ProductError } from '../i18n/productMessages';
import { KNOWLEDGE_LIMITS, fileTitle, isMarkdownPath, knowledgePath, type KnowledgeDocument, type KnowledgeManifest, type KnowledgeShard, type KnowledgeSearchHit } from './model';
import type { ReadonlyKnowledgeSource } from './source';
import { createKnowledgeWorker, type KnowledgeWorkerClient } from './workerClient';
import type { FlushedKnowledgeShard } from './engine';
import { assertIndexNotAborted, assertKnowledgeIndexTarget, readKnowledgeIndex, readKnowledgeShard, writeKnowledgeShard, publishKnowledgeIndex, removeUncommittedKnowledgeGeneration } from './store';

const mutations = createArticleMutationQueue();
const excludedDirectories = new Set(['.git', '.obsidian', '.trash', 'node_modules']);
export type KnowledgeIndexProgress = { phase: 'enumerating' | 'indexing' | 'publishing'; total: number; scanned: number; parsed: number; reused: number };
export function rebuildKnowledgeIndex(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, options: { force?: boolean; signal?: AbortSignal; worker?: KnowledgeWorkerClient; onProgress?: (value: KnowledgeIndexProgress) => void } = {}): Promise<KnowledgeManifest> {
  // Reuse the shared serial mutation primitive; cancelled native closes must drain before a new publication.
  return mutations.run(async () => {
    const worker = options.worker ?? createKnowledgeWorker(), signal = options.signal, generation = crypto.randomUUID();
    let committed = false, lastProgress = 0;
    const progress: KnowledgeIndexProgress = { phase: 'enumerating', total: 0, scanned: 0, parsed: 0, reused: 0 };
    const notify = (force = false) => { const now = Date.now(); if (force || now - lastProgress >= 100) { lastProgress = now; options.onProgress?.({ ...progress }); } };
    let budget = performance.now();
    const yieldMetadata = () => new Promise<void>(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); budget = performance.now(); resolve(); };
      channel.port2.postMessage(null);
    });
    try {
      await assertKnowledgeIndexTarget(library, source, signal);
      await worker.request('begin', [source.binding.sourceId], signal);
      let previous: KnowledgeManifest | null = null;
      try { previous = await readKnowledgeIndex(library, source, worker, signal); }
      catch (error) { if (!(error instanceof ProductError) || !((options.force && ['knowledge.indexInvalid', 'knowledge.indexTooLarge'].includes(error.messageKey)) || error.messageKey === 'knowledge.indexSourceChanged')) throw error; }
      const files = new Map<string, File>();
      const walk = async (path: string, depth: number): Promise<void> => {
        if (depth > KNOWLEDGE_LIMITS.depth) throw new ProductError('knowledge.depthLimit');
        for await (const entry of source.list(path)) {
          assertIndexNotAborted(signal); const next = path ? path + '/' + entry.name : entry.name; knowledgePath(next);
          if (entry.kind === 'directory') { if (!excludedDirectories.has(entry.name.toLowerCase())) await walk(next, depth + 1); }
          else if (isMarkdownPath(next)) {
            if (files.size >= KNOWLEDGE_LIMITS.documents) throw new ProductError('knowledge.documentLimit');
            files.set(next, await source.readFile(next)); progress.total = files.size; notify();
          }
          if (performance.now() - budget >= 4) await yieldMetadata();
        }
      };
      await walk('', 0); assertIndexNotAborted(signal);
      const plan = await worker.request('plan', [[...files].map(([path, file]) => ({ path, size: file.size, modified: file.lastModified })), previous, Boolean(options.force)], signal);
      const badShards = new Set<string>();
      for (const shard of previous?.shards ?? []) {
        if (!plan.some(entry => entry.reuse?.shard === shard.id)) continue;
        try { await worker.request('search', [await readKnowledgeShard(library, source, shard.id, signal), shard.id, shard.hash, previous!, ''], signal); }
        catch (error) { if (error instanceof ProductError && error.messageKey === 'knowledge.indexCorruptShard') badShards.add(shard.id); else throw error; }
      }
      const documents: KnowledgeDocument[] = [], shards: KnowledgeShard[] = [];
      let part = 0, linkCount = 0;
      const collect = (doc: KnowledgeDocument) => {
        const remaining = Math.max(0, KNOWLEDGE_LIMITS.topologyLinks - linkCount);
        const links = doc.links.slice(0, remaining); linkCount += links.length;
        documents.push({ ...doc, links, diagnostics: doc.links.length > links.length ? [...doc.diagnostics, { kind: 'link-limit', path: doc.path }] : [...doc.diagnostics] });
      };
      const save = async (flushed: FlushedKnowledgeShard | null) => {
        if (!flushed) return;
        const id = generation + '/part-' + String(part++).padStart(4, '0') + '.json';
        await writeKnowledgeShard(library, source, id, flushed.blob, signal);
        shards.push({ id, bytes: flushed.bytes, hash: flushed.hash });
        flushed.documents.forEach(doc => collect({ ...doc, shard: id }));
      };
      progress.phase = 'indexing'; notify(true);
      for (const entry of plan) {
        assertIndexNotAborted(signal);
        if (entry.reuse && !badShards.has(entry.reuse.shard!)) { collect(entry.reuse); progress.reused++; }
        else if (entry.size > KNOWLEDGE_LIMITS.documentBytes) collect({ path: entry.path, title: fileTitle(entry.path), size: entry.size, modified: entry.modified, status: 'unindexed', links: [], diagnostics: [{ kind: 'oversized', path: entry.path }] });
        else { await save(await worker.request('append', [files.get(entry.path)!, entry.path, entry.modified, source.binding.sourceId], signal)); progress.parsed++; }
        progress.scanned++; notify();
      }
      await save(await worker.request('flush', [], signal));
      const active = new Set(documents.flatMap(doc => doc.shard ? [doc.shard] : []));
      shards.push(...(previous?.shards.filter(shard => active.has(shard.id)) ?? []));
      progress.phase = 'publishing'; notify(true);
      const output = await worker.request('finalize', [{ schemaVersion: 1, sourceId: source.binding.sourceId, generation, scannedAt: new Date().toISOString(), status: 'ready', documents, shards }], signal);
      await publishKnowledgeIndex(library, source, output.blob, signal); committed = true; notify(true);
      return output.manifest;
    } finally {
      if (!committed) try { await removeUncommittedKnowledgeGeneration(library, source, generation); } catch { /* old active manifest stays; unauthorized cleanup is skipped */ }
      if (!options.worker) worker.dispose();
    }
  });
}

export async function searchKnowledgeIndex(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, manifest: KnowledgeManifest, query: string, worker: KnowledgeWorkerClient, signal?: AbortSignal): Promise<{ hits: KnowledgeSearchHit[]; total: number; truncated: boolean }> {
  await assertKnowledgeIndexTarget(library, source, signal);
  if (manifest.sourceId !== source.binding.sourceId) throw new ProductError('knowledge.indexSourceChanged');
  let hits: KnowledgeSearchHit[] = [], total = 0;
  if (!query.trim()) return { hits, total, truncated: false };
  for (const shard of manifest.shards) {
    const result = await worker.request('search', [await readKnowledgeShard(library, source, shard.id, signal), shard.id, shard.hash, manifest, query], signal);
    total += result.total; hits = await worker.request('rank', [[...hits, ...result.hits]], signal);
  }
  await assertKnowledgeIndexTarget(library, source, signal);
  return { hits, total, truncated: total > KNOWLEDGE_LIMITS.searchResults };
}
