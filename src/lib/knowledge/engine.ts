import { ProductError } from '../i18n/productMessages';
import { KNOWLEDGE_LIMITS, validateKnowledgeManifest, knowledgePath, isKnowledgeId, type KnowledgeDocument, type KnowledgeRecord, type KnowledgeManifest, type KnowledgeSearchHit, type KnowledgeSearchQuery } from './model';
import { parseKnowledgeText, knowledgeHash, resolveKnowledgeLinks } from './parse';
import { buildKnowledgeGraph, type KnowledgeGraphOptions } from './graph';

const compareHits = (a: KnowledgeSearchHit, b: KnowledgeSearchHit) => (b.score ?? 0) - (a.score ?? 0) || Number(b.titleMatch) - Number(a.titleMatch) || (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);

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
    return [...hits].sort(compareHits).slice(0, KNOWLEDGE_LIMITS.searchResults);
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
  async search(file: Blob, id: string, hash: string, manifest: KnowledgeManifest, query: string | KnowledgeSearchQuery): Promise<{ hits: KnowledgeSearchHit[]; total: number }> {
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
    const raw = typeof query === 'string' ? { text: query } : query;
    const fold = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 200).toLowerCase() : '';
    const terms = fold(raw.text).split(/\s+/).filter(Boolean), phrase = fold(raw.phrase);
    const excluded = fold(raw.exclude).split(/\s+/).filter(Boolean), titleFilter = fold(raw.title), pathFilter = fold(raw.path);
    const positive = phrase ? [...terms, phrase] : terms, hits: KnowledgeSearchHit[] = [];
    if (!positive.length && !excluded.length && !titleFilter && !pathFilter) return { hits, total: 0 };
    const active = new Map(manifest.documents.filter(doc => doc.status === 'indexed' && doc.shard === id).map(doc => [doc.path, doc]));
    let total = 0;
    const offer = (hit: KnowledgeSearchHit) => {
      total++;
      if (hits.length === KNOWLEDGE_LIMITS.searchResults && compareHits(hit, hits.at(-1)!) >= 0) return;
      let low = 0, high = hits.length;
      while (low < high) { const middle = (low + high) >>> 1; if (compareHits(hit, hits[middle]) < 0) high = middle; else low = middle + 1; }
      hits.splice(low, 0, hit); if (hits.length > KNOWLEDGE_LIMITS.searchResults) hits.pop();
    };
    for (const record of records!) {
      const meta = active.get(record.meta.path); if (!meta || meta.hash !== record.meta.hash) continue;
      const body = record.text.toLowerCase(), title = meta.title.toLowerCase();
      if (!title.includes(titleFilter) || !meta.path.toLowerCase().includes(pathFilter)
        || !positive.every(term => title.includes(term) || body.includes(term))
        || excluded.some(term => title.includes(term) || body.includes(term))) continue;
      const titleMatch = positive.length > 0 && positive.every(term => title.includes(term));
      const lines = record.text.split(/\r?\n/); let emitted = false;
      for (let line = 0; line < lines.length;) {
        if (!lines[line].trim()) { line++; continue; }
        const start = line++; while (line < lines.length && lines[line].trim()) line++;
        const paragraph = lines.slice(start, line).join('\n'), lower = paragraph.toLowerCase();
        const count = positive.reduce((n, term) => n + Number(lower.includes(term)), 0);
        if (!count) continue;
        const first = Math.min(...positive.map(term => lower.indexOf(term)).filter(index => index >= 0)), offset = Math.max(0, first - 80);
        offer({ path: meta.path, title: meta.title, line: start + 1, endLine: line, snippet: (offset ? '…' : '') + paragraph.slice(offset, offset + 300), titleMatch, score: (count === positive.length ? 1000 : 0) + count * 10 }); emitted = true;
      }
      if (!emitted) offer({ path: meta.path, title: meta.title, line: 1, endLine: 1, snippet: record.text.slice(0, 300), titleMatch, score: titleMatch ? 500 : 0 });
    }
    return { hits, total };
  }
}
