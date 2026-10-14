import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { parseDocument } from 'yaml';
import { KNOWLEDGE_LIMITS, fileTitle, knowledgePath, normalizeKnowledgeRelativePath, type KnowledgeDocument, type KnowledgeLink, type KnowledgeDiagnostic } from './model';

type Node = { type: string; value?: string; alt?: string; url?: string; identifier?: string; depth?: number; children?: Node[]; position?: { start: { line: number; offset?: number }; end: { offset?: number } } };
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const plain = (node: Node): string => node.value ?? node.alt ?? node.children?.map(plain).join('') ?? '';
export async function knowledgeHash(value: Blob | string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? value : await value.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function parseKnowledgeText(text: string, path: string): { title: string; links: KnowledgeLink[]; diagnostics: KnowledgeDiagnostic[] } {
  knowledgePath(path);
  let body = text, offset = 0, title = '';
  const diagnostics: KnowledgeDiagnostic[] = [], links: KnowledgeLink[] = [];
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (header) {
    body = text.slice(header[0].length); offset = header[0].split(/\r?\n/).length - 1;
    try {
      const yaml = parseDocument(header[1], { schema: 'core', uniqueKeys: true });
      if (yaml.errors.length) throw new Error('front matter');
      const value = yaml.toJS({ maxAliasCount: 0 });
      if (value && typeof value === 'object' && Object.hasOwn(value, 'title') && typeof value.title === 'string') title = value.title.trim().slice(0, 200);
    } catch { diagnostics.push({ kind: 'front-matter', path, line: 1 }); }
  } else if (/^---\r?\n/.test(text)) { body = ''; diagnostics.push({ kind: 'front-matter', path, line: 1 }); }
  const tree = parser.parse(body) as Node, definitions = new Map<string, string>();
  const definitionsVisit = (node: Node) => { if (node.type === 'definition' && node.identifier && node.url) definitions.set(node.identifier, node.url); node.children?.forEach(definitionsVisit); };
  definitionsVisit(tree);
  let truncated = false;
  const add = (kind: KnowledgeLink['kind'], target: string, line: number) => {
    if (target.length > 4096 || links.length >= KNOWLEDGE_LIMITS.linksPerDocument) { truncated = true; return; }
    links.push({ kind, target, line });
  };
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'html', 'definition', 'math', 'inlineMath'].includes(node.type)) return;
    if (!title && node.type === 'heading') title = plain(node).trim().slice(0, 200);
    if (node.type === 'link' && node.url) { add('markdown', node.url, (node.position?.start.line ?? 1) + offset); return; }
    if (node.type === 'linkReference') { const target = definitions.get(node.identifier ?? ''); if (target) add('markdown', target, (node.position?.start.line ?? 1) + offset); return; }
    if (node.type === 'text' && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      const raw = body.slice(node.position.start.offset, node.position.end.offset), wiki = /\[\[([^\]\r\n]+)\]\]/g;
      for (const match of raw.matchAll(wiki)) {
        const before = raw.slice(0, match.index), escapes = /\\+$/.exec(before)?.[0].length ?? 0;
        if (escapes % 2 || before.endsWith('!')) continue;
        add('wiki', match[1].split('|')[0].trim(), (node.position.start.line + offset) + before.split(/\r?\n/).length - 1);
      }
    }
    if (!['image', 'imageReference'].includes(node.type)) node.children?.forEach(visit);
  }; visit(tree);
  if (truncated) diagnostics.push({ kind: 'link-limit', path });
  return { title: title || fileTitle(path), links, diagnostics };
}

export function resolveKnowledgeLinks(documents: KnowledgeDocument[]): { edges: { from: string; to: string; line: number }[]; diagnostics: KnowledgeDiagnostic[]; diagnosticCount: number; topologyTruncated: boolean } {
  const paths = new Set(documents.map(doc => doc.path)), names = new Map<string, Set<string>>();
  for (const doc of documents) for (const name of [doc.path.split('/').at(-1)!, doc.path.split('/').at(-1)!.replace(/\.(?:md|markdown)$/i, '')]) {
    const key = name.toLowerCase(); if (!names.has(key)) names.set(key, new Set()); names.get(key)!.add(doc.path);
  }
  const diagnostics: KnowledgeDiagnostic[] = [], edges: { from: string; to: string; line: number }[] = [], seen = new Set<string>();
  let diagnosticCount = 0, topologyTruncated = documents.some(doc => doc.diagnostics.some(issue => issue.kind === 'link-limit')), linkCount = 0;
  const issue = (value: KnowledgeDiagnostic) => { diagnosticCount++; if (diagnostics.length < KNOWLEDGE_LIMITS.diagnostics) diagnostics.push(value); };
  const exact = (path: string) => paths.has(path) ? path : !/\.[^/]+$/.test(path) ? [path + '.md', path + '.markdown'].find(item => paths.has(item)) : undefined;
  for (const doc of documents) {
    for (const diagnostic of doc.diagnostics) issue(diagnostic);
    for (const link of doc.links) {
      if (++linkCount > KNOWLEDGE_LIMITS.topologyLinks) { topologyTruncated = true; continue; }
      const raw = link.target.split('#')[0].split('?')[0];
      if (!raw || /^[a-z][\w+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
      let target: string;
      try { target = decodeURIComponent(raw); } catch { issue({ kind: 'invalid-link', path: doc.path, target: link.target, line: link.line }); continue; }
      if (/[\\\u0000-\u001f]/.test(target)) { issue({ kind: 'invalid-link', path: doc.path, target: link.target, line: link.line }); continue; }
      if (/\.[^/]+$/.test(target) && !/\.(?:md|markdown)$/i.test(target)) continue;
      let found: string | undefined;
      if (link.kind === 'wiki' && !target.includes('/')) {
        const matches = names.get(target.toLowerCase());
        if (matches && matches.size > 1) { issue({ kind: 'ambiguous-link', path: doc.path, target: link.target, line: link.line }); continue; }
        found = matches?.values().next().value;
      } else {
        const base = doc.path.split('/').slice(0, -1).join('/');
        const relative = normalizeKnowledgeRelativePath(base, target), rooted = normalizeKnowledgeRelativePath('', target);
        if (!relative && !(link.kind === 'wiki' && rooted)) { issue({ kind: 'outside-link', path: doc.path, target: link.target, line: link.line }); continue; }
        found = link.kind === 'wiki' && !target.startsWith('.') ? rooted && exact(rooted) || relative && exact(relative) || undefined : relative ? exact(relative) : undefined;
      }
      if (!found) { issue({ kind: 'missing-link', path: doc.path, target: link.target, line: link.line }); continue; }
      const key = doc.path + '\0' + found;
      if (found !== doc.path && !seen.has(key)) { seen.add(key); edges.push({ from: doc.path, to: found, line: link.line }); }
    }
  }
  return { edges, diagnostics, diagnosticCount, topologyTruncated };
}
