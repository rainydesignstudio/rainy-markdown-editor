import { ProductError } from '../i18n/productMessages';

export const KNOWLEDGE_LIMITS = Object.freeze({ documents: 10000, documentBytes: 2 * 1024 * 1024, shardTargetBytes: 8 * 1024 * 1024, shardBytes: 16 * 1024 * 1024, manifestBytes: 32 * 1024 * 1024, depth: 32, linksPerDocument: 1000, topologyLinks: 50000, diagnostics: 5000, searchResults: 200 });
export type KnowledgeLink = { kind: 'markdown' | 'wiki'; target: string; line: number };
export type KnowledgeDiagnostic = { kind: 'front-matter' | 'link-limit' | 'outside-link' | 'invalid-link' | 'missing-link' | 'ambiguous-link' | 'oversized' | 'unreadable'; path: string; target?: string; line?: number };
export type KnowledgeDocument = { path: string; title: string; size: number; modified: number; status: 'indexed' | 'unindexed'; hash?: string; shard?: string; links: KnowledgeLink[]; diagnostics: KnowledgeDiagnostic[] };
export type KnowledgeRecord = { meta: KnowledgeDocument; text: string };
export type KnowledgeShard = { id: string; bytes: number; hash: string };
export type KnowledgeManifest = {
  schemaVersion: 1; sourceId: string; generation: string; scannedAt: string; status: 'ready' | 'partial';
  documents: KnowledgeDocument[]; shards: KnowledgeShard[];
  edges: { from: string; to: string; line: number }[];
  diagnostics: KnowledgeDiagnostic[]; diagnosticCount: number; topologyTruncated: boolean;
};
export type KnowledgeSearchQuery = { text: string; phrase?: string; exclude?: string; title?: string; path?: string };
export type KnowledgeSearchHit = { path: string; title: string; line: number; endLine?: number; snippet: string; titleMatch: boolean; score?: number };
export type KnowledgeCapture = { sourceId: string; path: string; title: string; content: string; original?: string; line: number; endLine: number; whole: boolean };
export const isKnowledgeId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export const isMarkdownPath = (path: string) => /\.(?:md|markdown)$/i.test(path);
export function knowledgePath(path: string, allowRoot = false): string[] {
  if (typeof path !== 'string') throw new ProductError('knowledge.invalidPath');
  if (path === '' && allowRoot) return [];
  const parts = path.split('/');
  if (!path || path.length > 8192 || path.startsWith('/') || /[\\\u0000-\u001f]/.test(path) || parts.some(part => !part || part === '.' || part === '..')) throw new ProductError('knowledge.invalidPath');
  return parts;
}
export function normalizeKnowledgeRelativePath(base: string, target: string): string | null {
  const result = base ? base.split('/') : [];
  if (target.startsWith('/')) result.length = 0;
  if (/[\\\u0000-\u001f]/.test(target)) return null;
  for (const part of target.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!result.length) return null; result.pop(); } else result.push(part); }
  const path = result.join('/'); try { knowledgePath(path); return path; } catch { return null; }
}
export function knowledgeReferencePath(document: string, reference: string): string | null {
  const raw = reference.split('#')[0].split('?')[0];
  if (!raw || /^[a-z][\w+.-]*:/i.test(raw) || raw.startsWith('//')) return null;
  try { const decoded = decodeURIComponent(raw); if (/^[a-z][\w+.-]*:/i.test(decoded) || decoded.startsWith('//')) return null; return normalizeKnowledgeRelativePath(document.split('/').slice(0, -1).join('/'), decoded); } catch { return null; }
}
export const fileTitle = (path: string) => { const name = path.split('/').at(-1)!; return (name.replace(/\.(?:md|markdown)$/i, '') || name).slice(0, 200); };
export function knowledgeShardPath(id: string): string[] {
  const parts = knowledgePath(id);
  if (parts.length !== 2 || !isKnowledgeId(parts[0]) || !/^part-\d{4}\.json$/.test(parts[1])) throw new ProductError('knowledge.indexInvalid');
  return parts;
}

export function validateKnowledgeManifest(value: unknown, sourceId?: string): KnowledgeManifest {
  const invalid = () => { throw new ProductError('knowledge.indexInvalid'); };
  const keys = (value: unknown, required: string[], optional: string[] = []) => value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  const diagnostic = (issue: KnowledgeDiagnostic) => {
    if (!keys(issue, ['kind', 'path'], ['target', 'line']) || !['front-matter', 'link-limit', 'outside-link', 'invalid-link', 'missing-link', 'ambiguous-link', 'oversized', 'unreadable'].includes(issue.kind) || typeof issue.path !== 'string' || (issue.target !== undefined && (typeof issue.target !== 'string' || issue.target.length > 4096)) || (issue.line !== undefined && (!Number.isSafeInteger(issue.line) || issue.line < 1))) return false;
    try { knowledgePath(issue.path); return true; } catch { return false; }
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const m = value as KnowledgeManifest;
  if (!keys(m, ['schemaVersion', 'sourceId', 'generation', 'scannedAt', 'status', 'documents', 'shards', 'edges', 'diagnostics', 'diagnosticCount', 'topologyTruncated'])) return invalid();
  if (m.schemaVersion !== 1 || !isKnowledgeId(m.sourceId) || !isKnowledgeId(m.generation) || !['ready', 'partial'].includes(m.status) || typeof m.scannedAt !== 'string' || !Number.isFinite(Date.parse(m.scannedAt)) || typeof m.topologyTruncated !== 'boolean') return invalid();
  if (sourceId && m.sourceId !== sourceId) throw new ProductError('knowledge.indexSourceChanged');
  if (!Array.isArray(m.documents) || m.documents.length > KNOWLEDGE_LIMITS.documents || !Array.isArray(m.shards) || m.shards.length > KNOWLEDGE_LIMITS.documents || !Array.isArray(m.edges) || m.edges.length > KNOWLEDGE_LIMITS.topologyLinks || !Array.isArray(m.diagnostics) || m.diagnostics.length > KNOWLEDGE_LIMITS.diagnostics || !Number.isSafeInteger(m.diagnosticCount) || m.diagnosticCount < m.diagnostics.length) return invalid();
  const paths = new Set<string>(), shards = new Set<string>();
  for (const shard of m.shards) {
    if (!keys(shard, ['id', 'bytes', 'hash'])) return invalid();
    knowledgeShardPath(shard.id);
    if (shards.has(shard.id) || !Number.isSafeInteger(shard.bytes) || shard.bytes < 0 || shard.bytes > KNOWLEDGE_LIMITS.shardBytes || !/^[a-f0-9]{64}$/.test(shard.hash)) return invalid();
    shards.add(shard.id);
  }
  for (const doc of m.documents) {
    if (!keys(doc, ['path', 'title', 'size', 'modified', 'status', 'links', 'diagnostics'], ['hash', 'shard'])) return invalid();
    knowledgePath(doc.path);
    if (paths.has(doc.path) || !isMarkdownPath(doc.path) || typeof doc.title !== 'string' || doc.title.length > 200 || !Number.isSafeInteger(doc.size) || doc.size < 0 || !Number.isFinite(doc.modified) || !['indexed', 'unindexed'].includes(doc.status) || !Array.isArray(doc.links) || doc.links.length > KNOWLEDGE_LIMITS.linksPerDocument || !Array.isArray(doc.diagnostics)) return invalid();
    if (doc.status === 'indexed' && (doc.size > KNOWLEDGE_LIMITS.documentBytes || typeof doc.hash !== 'string' || !/^[a-f0-9]{64}$/.test(doc.hash) || !shards.has(doc.shard!))) return invalid();
    if (doc.status === 'unindexed' && (doc.hash !== undefined || doc.shard !== undefined)) return invalid();
    for (const link of doc.links) if (!keys(link, ['kind', 'target', 'line']) || !['markdown', 'wiki'].includes(link.kind) || typeof link.target !== 'string' || link.target.length > 4096 || !Number.isSafeInteger(link.line) || link.line < 1) return invalid();
    if (doc.diagnostics.length > KNOWLEDGE_LIMITS.diagnostics || doc.diagnostics.some(issue => !diagnostic(issue) || issue.path !== doc.path)) return invalid();
    paths.add(doc.path);
  }
  const usedShards = new Set(m.documents.flatMap(doc => doc.shard ? [doc.shard] : []));
  if (m.shards.some(shard => !usedShards.has(shard.id)) || (m.status === 'ready' && (m.topologyTruncated || m.documents.some(doc => doc.status === 'unindexed')))) return invalid();
  for (const edge of m.edges) if (!keys(edge, ['from', 'to', 'line']) || !paths.has(edge.from) || !paths.has(edge.to) || !Number.isSafeInteger(edge.line) || edge.line < 1) return invalid();
  for (const issue of m.diagnostics) if (!diagnostic(issue) || !paths.has(issue.path)) return invalid();
  return m;
}
