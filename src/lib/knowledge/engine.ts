import { ProductError } from '../i18n/productMessages';
import { KNOWLEDGE_LIMITS, validateKnowledgeManifest, knowledgePath, isKnowledgeId, type KnowledgeDocument, type KnowledgeRecord, type KnowledgeManifest, type KnowledgeSearchHit } from './model';
import { parseKnowledgeText, knowledgeHash, resolveKnowledgeLinks } from './parse';
import { buildKnowledgeGraph, type KnowledgeGraphOptions } from './graph';

export type FlushedKnowledgeShard = { blob: Blob; bytes: number; hash: string; documents: KnowledgeDocument[] };
// Instantiated inside a worker. Only bounded shard buffers and two read caches are retained.
export class KnowledgeIndexEngine {
  private records: KnowledgeRecord[] = [];
  private bytes = 0;
  private sourceId = '';
  private cache = new Map<string, KnowledgeRecord[]>();
  graph(manifest: KnowledgeManifest, options: KnowledgeGraphOptions) { return buildKnowledgeGraph(manifest, options); }
  begin(sourceId: string): void {
    if (!isKnowledgeId(sourceId)) throw new ProductError('knowledge.indexInvalid');
    this.records = []; this.bytes = 0; this.sourceId = sourceId;
  }

  plan(stats: { path: string; size: number; modified: number }[], previous: KnowledgeManifest | null, force: boolean) {
    if (stats.length > KNOWLEDGE_LIMITS.documents) throw new ProductError('knowledge.documentLimit');
    const old = new Map(previous?.documents.map(doc => [doc.path, doc]) ?? []);
    return [...stats].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(stat => {
      knowledgePath(stat.path);
      const doc = old.get(stat.path);
      return { ...stat, reuse: !force && doc?.status === 'indexed' && doc.size === stat.size && doc.modified === stat.modified ? doc : null };
    });
  }
  rank(hits: KnowledgeSearchHit[]): KnowledgeSearchHit[] {
    if (hits.length > KNOWLEDGE_LIMITS.searchResults * 2) throw new ProductError('knowledge.indexTooLarge');
    return [...hits].sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).slice(0, KNOWLEDGE_LIMITS.searchResults);
  }
  async readText(file: Blob): Promise<{ text: string; truncated: boolean }> {
    const limited = file.size > KNOWLEDGE_LIMITS.documentBytes ? file.slice(0, KNOWLEDGE_LIMITS.documentBytes) : file;
    return { text: new TextDecoder().decode(await limited.arrayBuffer()), truncated: file.size > KNOWLEDGE_LIMITS.documentBytes };
  }

  async append(file: Blob, path: string, modified: number, sourceId: string): Promise<FlushedKnowledgeShard | null> {
    knowledgePath(path);
    if (!isKnowledgeId(sourceId) || file.size > KNOWLEDGE_LIMITS.documentBytes || !Number.isFinite(modified)) throw new ProductError('knowledge.indexInvalid');
    if (this.sourceId && this.sourceId !== sourceId) throw new ProductError('knowledge.indexSourceChanged');
    this.sourceId = sourceId;
    const bytesRead = await file.arrayBuffer(), text = new TextDecoder().decode(bytesRead), parsed = parseKnowledgeText(text, path), hash = await knowledgeHash(bytesRead);
    const meta: KnowledgeDocument = { path, title: parsed.title, modified, size: file.size, hash, status: 'indexed', links: parsed.links, diagnostics: parsed.diagnostics };
    const record = { meta, text }, bytes = new Blob([JSON.stringify(record)]).size;
    let flushed: FlushedKnowledgeShard | null = null;
    if (this.records.length && this.bytes + bytes > KNOWLEDGE_LIMITS.shardTargetBytes) flushed = await this.flush();
    this.records.push(record); this.bytes += bytes + 1;
    return flushed;
  }
  async flush(): Promise<FlushedKnowledgeShard | null> {
    if (!this.records.length) return null;
    const records = this.records; this.records = []; this.bytes = 0;
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, sourceId: this.sourceId, records })], { type: 'application/json' });
    if (blob.size > KNOWLEDGE_LIMITS.shardBytes) throw new ProductError('knowledge.indexTooLarge');
    return { blob, bytes: blob.size, hash: await knowledgeHash(blob), documents: records.map(record => record.meta) };
  }
  async manifest(file: Blob, sourceId?: string): Promise<KnowledgeManifest> {
    if (file.size > KNOWLEDGE_LIMITS.manifestBytes) throw new ProductError('knowledge.indexTooLarge');
    try { return validateKnowledgeManifest(JSON.parse(await file.text()), sourceId); }
    catch (error) { if (error instanceof ProductError) throw error; throw new ProductError('knowledge.indexInvalid'); }
  }
  async finalize(input: Omit<KnowledgeManifest, 'edges' | 'diagnostics' | 'diagnosticCount' | 'topologyTruncated'>): Promise<{ manifest: KnowledgeManifest; blob: Blob }> {
    input.documents.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const topology = resolveKnowledgeLinks(input.documents);
    const manifest = validateKnowledgeManifest({ ...input, ...topology, status: input.documents.some(doc => doc.status === 'unindexed' || doc.diagnostics.some(issue => issue.kind === 'front-matter')) || topology.topologyTruncated ? 'partial' : 'ready' });
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    if (blob.size > KNOWLEDGE_LIMITS.manifestBytes) throw new ProductError('knowledge.indexTooLarge');
    return { manifest, blob };
  }
  async search(file: Blob, id: string, hash: string, manifest: KnowledgeManifest, query: string): Promise<{ hits: KnowledgeSearchHit[]; total: number }> {
    const key = manifest.sourceId + ':' + id + ':' + hash;
    let records = this.cache.get(key);
    if (records) { this.cache.delete(key); this.cache.set(key, records); }
    else {
      if (file.size > KNOWLEDGE_LIMITS.shardBytes) throw new ProductError('knowledge.indexCorruptShard');
      const bytes = await file.arrayBuffer();
      if (await knowledgeHash(bytes) !== hash) throw new ProductError('knowledge.indexCorruptShard');
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ProductError('knowledge.indexCorruptShard'); }
      if (data?.schemaVersion !== 1 || data.sourceId !== manifest.sourceId || !Array.isArray(data.records) || data.records.length > KNOWLEDGE_LIMITS.documents) throw new ProductError('knowledge.indexCorruptShard');
      records = data.records;
      const paths = new Set<string>();
      for (const record of records!) {
        if (typeof record?.text !== 'string' || record.text.length > KNOWLEDGE_LIMITS.documentBytes || typeof record?.meta?.path !== 'string' || typeof record.meta.hash !== 'string') throw new ProductError('knowledge.indexCorruptShard');
        if (paths.has(record.meta.path)) throw new ProductError('knowledge.indexCorruptShard'); paths.add(record.meta.path);
        knowledgePath(record.meta.path);
      }
      this.cache.set(key, records!); while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
    }
    const terms = query.trim().slice(0, 200).toLowerCase().split(/\s+/).filter(Boolean), hits: KnowledgeSearchHit[] = [];
    if (!terms.length) return { hits, total: 0 };
    const active = new Map(manifest.documents.filter(doc => doc.status === 'indexed' && doc.shard === id).map(doc => [doc.path, doc]));
    let total = 0;
    for (const record of records!) {
      const meta = active.get(record.meta.path); if (!meta || meta.hash !== record.meta.hash) continue;
      const body = record.text.toLowerCase(), title = meta.title.toLowerCase();
      if (!terms.every(term => title.includes(term) || body.includes(term))) continue;
      total++;
      if (hits.length < KNOWLEDGE_LIMITS.searchResults) {
        const positions = terms.map(term => body.indexOf(term)).filter(index => index >= 0);
        const lowerIndex = positions.length ? Math.min(...positions) : 0;
        let index = lowerIndex;
        if (body.length !== record.text.length) {
          let length = 0; index = 0;
          for (const character of record.text) { const next = length + character.toLowerCase().length; if (next > lowerIndex) break; length = next; index += character.length; }
        }
        hits.push({ path: meta.path, title: meta.title, line: record.text.slice(0, index).split(/\r?\n/).length, snippet: record.text.slice(Math.max(0, index - 60), index + 120).replace(/\s+/g, ' '), titleMatch: terms.every(term => title.includes(term)) });
      }
    }
    return { hits, total };
  }
}
