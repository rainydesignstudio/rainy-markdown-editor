import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { parseFragment } from 'parse5';
import { findSrcsetUrlRanges, markdownDestinationRange } from '../articleMedia';
import { resourceType, resourceReference, validResourceLeaf } from './types';
import { parseArticle, replaceArticleBody } from '../frontMatter';

type Node = { type?: string; value?: string; url?: string; identifier?: string; children?: Node[]; position?: { start: { offset?: number; line?: number }; end: { offset?: number } } };
type HtmlNode = { tagName?: string; value?: string; attrs?: { name: string; value: string; prefix?: string }[]; childNodes?: HtmlNode[]; sourceCodeLocation?: { attrs?: Record<string, { startOffset: number; endOffset: number }> } };
export type ResourceReference = { url: string; kind: 'image' | 'file'; start: number; end: number; line: number; uses?: number };
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const attachment = (url: string) => {
  const path = url.split('#')[0].split('?')[0];
  if (!path || /^(?:mailto|tel|javascript|data|blob):/i.test(path)) return false;
  if (!/^[a-z][\w+.-]*:|^\/\//i.test(path) && /(?:^|\/)(?:media|shared)\/file\/[^/]+$/.test(path)) return true;
  let name: string; try { name = decodeURIComponent(path); } catch { return false; }
  return !['file', 'markdown', 'web'].includes(resourceType(name).id);
};
function htmlValue(raw: string): string {
  const tree = parseFragment(`<i data-value="${raw.replace(/"/g, '&quot;')}"></i>`) as unknown as HtmlNode;
  return tree.childNodes?.[0]?.attrs?.find(attribute => attribute.name === 'data-value')?.value ?? raw;
}

/** Locate source destinations without serializing or formatting the author's Markdown/HTML. */
export function resourceReferences(body: string): ResourceReference[] {
  const tree = parser.parse(body) as Node, usage = new Map<string, 'image' | 'file'>(), result = new Map<string, ResourceReference>();
  const useCounts = new Map<string, number>(), seenDefinitions = new Set<string>();
  const lineStarts = [0], newline = /\r\n|\r|\n/g;
  while (newline.exec(body)) lineStarts.push(newline.lastIndex);
  const lineAt = (offset: number) => {
    let low = 0, high = lineStarts.length;
    while (low < high) { const middle = (low + high) >>> 1; if (lineStarts[middle] <= offset) low = middle + 1; else high = middle; }
    return low;
  };
  const collect = (node: Node) => {
    if ((node.type === 'imageReference' || node.type === 'linkReference') && node.identifier) {
      if (node.type === 'imageReference' || !usage.has(node.identifier)) usage.set(node.identifier, node.type === 'imageReference' ? 'image' : 'file');
      useCounts.set(node.identifier, (useCounts.get(node.identifier) ?? 0) + 1);
    }
    if (!['code', 'inlineCode'].includes(node.type ?? '')) node.children?.forEach(collect);
  }; collect(tree);
  const add = (url: string, kind: 'image' | 'file', start: number, end: number, explicit = false, uses = 1) => {
    url = url.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
    if (kind === 'file' && !explicit && !attachment(url)) return;
    if (/^(?:#|data:)/i.test(url)) return;
    result.set(`${start}:${end}`, { url, kind, start, end, line: lineAt(start), ...(uses > 1 ? { uses } : {}) });
  };
  const html = (value: string, offset: number) => {
    const visit = (node: HtmlNode) => {
      const tag = node.tagName?.toLowerCase(), download = node.attrs?.some(attribute => attribute.name === 'download');
      for (const attribute of node.attrs ?? []) {
        const name = attribute.prefix ? attribute.prefix + ':' + attribute.name : attribute.name;
        const kind = tag === 'img' && ['src', 'srcset'].includes(name) || tag === 'image' && ['href', 'xlink:href'].includes(name) || tag === 'video' && name === 'poster' ? 'image'
          : tag === 'a' && name === 'href' || ['audio', 'video', 'source'].includes(tag ?? '') && ['src', 'srcset'].includes(name) ? 'file' : null;
        if (!kind) continue;
        const location = node.sourceCodeLocation?.attrs?.[name]; if (!location) continue;
        const raw = value.slice(location.startOffset, location.endOffset), match = /^[^\s=]+\s*=\s*(["']?)/.exec(raw); if (!match) continue;
        const start = location.startOffset + match[0].length, end = location.endOffset - (match[1] ? 1 : 0), rawValue = value.slice(start, end);
        if (name === 'srcset') for (const range of findSrcsetUrlRanges(rawValue, offset + start)) add(htmlValue(body.slice(range.start, range.end)), tag === 'img' || tag === 'source' ? 'image' : kind, range.start, range.end, true);
        else add(attribute.value, kind, offset + start, offset + end, tag !== 'a' || download);
      }
      if (!['script', 'style', 'textarea', 'pre', 'code'].includes(tag ?? '')) node.childNodes?.forEach(visit);
    }; visit(parseFragment(value, { sourceCodeLocationInfo: true }) as unknown as HtmlNode);
  };
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type ?? '')) return;
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === 'definition' && node.identifier) { if (seenDefinitions.has(node.identifier)) return; seenDefinitions.add(node.identifier); }
      const kind = node.type === 'image' ? 'image' : node.type === 'link' ? 'file' : node.type === 'definition' ? usage.get(node.identifier ?? '') : undefined;
      if (kind && node.url !== undefined) {
        const range = markdownDestinationRange(body.slice(start, end), node.type === 'definition');
        if (range) add(node.url, kind, start + range.start, start + range.end, false, node.type === 'definition' ? useCounts.get(node.identifier ?? '') ?? 1 : 1);
        else if (kind === 'image' && node.url === '') add('', kind, start, end);
      }
      if (node.type === 'html' && node.value) html(node.value, start);
    }
    node.children?.forEach(visit);
  }; visit(tree);
  return [...result.values()].sort((a, b) => a.start - b.start);
}

export function rewriteResourceReferences(body: string, references: readonly ResourceReference[], replacements: ReadonlyMap<string, string>): string {
  let next = body;
  for (const item of [...references].sort((a, b) => b.start - a.start)) {
    const replacement = replacements.get(item.url);
    if (replacement !== undefined) next = next.slice(0, item.start) + replacement + next.slice(item.end);
  }
  return next;
}

export function localResourceReference(url: string): { storage: 'image' | 'file'; fileName: string; shared: boolean; prefix: string; suffix: string } | null {
  url = url.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  const match = /^(\.\/)?(media|\/shared)\/(image|file)\/([^/?#]+)([?#][\s\S]*)?$/.exec(url); if (!match) return null;
  let fileName: string; try { fileName = decodeURIComponent(match[4]); } catch { return null; }
  if (!validResourceLeaf(fileName)) return null;
  return { storage: match[3] as 'image' | 'file', fileName, shared: match[2] === '/shared', prefix: match[1] ?? '', suffix: match[5] ?? '' };
}
export function resourceReferenceIntent(url: string): 'image' | 'file' | null {
  return /^(?:\.\/)?(?:media|\/shared)\/(image|file)\//.exec(url.trim())?.[1] as 'image' | 'file' | undefined ?? null;
}
export function rewriteArticleFileReferences(source: string, oldFileName: string, newFileName: string) {
  const parsed = parseArticle(source), refs = resourceReferences(parsed.body), map = new Map<string, string>(); let count = 0;
  for (const ref of refs) { const local = localResourceReference(ref.url); if (local && !local.shared && local.storage === 'file' && local.fileName === oldFileName) { map.set(ref.url, local.prefix + resourceReference('file', newFileName) + encodeURI(local.suffix).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase())); count += ref.uses ?? 1; } }
  return { source: count ? replaceArticleBody(source, rewriteResourceReferences(parsed.body, refs, map)) : source, count };
}

/** Import deliberately does not crawl stylesheets, CSS URLs or embedded browsing contexts. */
export function unsupportedResourceReferences(body: string): Array<{ source: string; line: number }> {
  const result: Array<{ source: string; line: number }> = [];
  const add = (source: string, line: number) => { if (source && !/^(?:data:|#)/i.test(source) && result.length < 2000) result.push({ source: source.slice(0, 200), line }); };
  const css = (value: string, line: number) => {
    for (const match of value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)|@import\s+(["'])([^"']+)\3/gi)) add((match[2] ?? match[4]).trim(), line);
  };
  const html = (value: string, line: number) => {
    const visit = (node: HtmlNode) => {
      const tag = node.tagName?.toLowerCase(), attributes = node.attrs ?? [];
      for (const attribute of attributes) {
        if (attribute.name === 'style') css(attribute.value, line);
        if (['iframe', 'embed', 'object', 'track'].includes(tag ?? '') && ['src', 'data'].includes(attribute.name) || tag === 'link' && attribute.name === 'href' && attributes.some(item => item.name === 'rel' && /stylesheet/i.test(item.value))) add(attribute.value, line);
      }
      if (tag === 'style') css((node.childNodes ?? []).map(child => child.value ?? '').join(''), line);
      if (!['script', 'pre', 'code', 'textarea'].includes(tag ?? '')) node.childNodes?.forEach(visit);
    }; visit(parseFragment(value) as unknown as HtmlNode);
  };
  const visit = (node: Node) => { if (['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type ?? '')) return; if (node.type === 'html' && node.value) html(node.value, node.position?.start.line ?? 1); node.children?.forEach(visit); };
  visit(parser.parse(body) as Node); return result;
}
