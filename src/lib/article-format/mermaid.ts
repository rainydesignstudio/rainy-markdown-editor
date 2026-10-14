import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, Element } from 'hast';
import type { FormatFormatter } from './config';
import type { ArticleFormatIssue } from '../articleFormat';
import { ProductError, productMessage, productText } from '../i18n/productMessages';

export type MermaidPolicy = NonNullable<FormatFormatter['mermaid']>;
export type MermaidImage = { dataUrl: string; width: number; height: number };
export const MERMAID_IMAGE_CLASSES = 'block mx-auto max-w-full h-auto';
const parser = unified().use(remarkParse);
type MarkdownNode = { type: string; lang?: string | null; value?: string; position?: { start?: { line?: number } }; children?: MarkdownNode[] };
export function mermaidSourceProblem(source: string, policy: MermaidPolicy): string | null {
  if (source.length > policy.maxLength || source.split(/[\n;&]/).length > 256) return 'mermaid.limit';
  if (/%%\s*\{|^\s*---|^\s*(?:click|link|links)\s|<\s*\/?\s*[a-z]|(?:javascript|data|https?|file):|url\s*\(|@\{|\\(?:href|includegraphics|html\w*)\b/im.test(source)) return 'mermaid.unsafe';
  const first = source.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith('%%'))?.trim() ?? '';
  return /^(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram)\b/.test(first) ? null : 'mermaid.unsupported';
}
export function inspectMermaidSource(source: string, policy: MermaidPolicy, label: string): ArticleFormatIssue[] {
  let count = 0; const issues: ArticleFormatIssue[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === 'code' && node.lang === 'mermaid') {
      const failure = ++count > policy.maxDiagrams ? 'mermaid.limit' : mermaidSourceProblem(node.value ?? '', policy);
      if (failure) issues.push({ kind: 'element', name: productText('mermaid.name'), source: label, tier: 'error', line: node.position?.start?.line, ...productMessage(failure), domain: 'product' });
    } else node.children?.forEach(visit);
  }; visit(parser.parse(source)); return issues;
}
export function rehypeArticleMermaid(policy: MermaidPolicy) {
  return (tree: Root) => {
    let count = 0;
    const clear = (node: Root | Element) => { if (node.type === 'element') for (const name of ['dataMermaidSource', 'data-mermaid-source', 'dataMermaidRejected', 'data-mermaid-rejected']) delete node.properties[name]; for (const child of node.children) if (child.type === 'element') clear(child); }; clear(tree);
    const visit = (parent: Root | Element) => {
      for (const node of parent.children) if (node.type === 'element') {
        const code = node.tagName === 'pre' ? node.children.find(child => child.type === 'element' && child.tagName === 'code') as Element | undefined : undefined;
        if (code && Array.isArray(code.properties.className) && code.properties.className.includes('language-mermaid')) {
          node.tagName = 'section'; node.properties.dataRenderKind = 'mermaid';
          code.position ??= node.position; code.properties.dataMermaidSource = 'true';
          const failure = ++count > policy.maxDiagrams ? 'mermaid.limit' : mermaidSourceProblem(code.children.map(child => child.type === 'text' ? child.value : '').join(''), policy);
          if (failure) code.properties.dataMermaidRejected = failure;
        } else visit(node);
      }
    }; visit(tree);
  };
}

const cache = new Map<string, MermaidImage>(); let cacheBytes = 0, sequence = Promise.resolve();
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function mermaidFrameDocument(hostToken: string, origin: string): string {
  const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new ProductError('mermaid.invalidOutput');
  const config = scriptJson({ hostToken, origin });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${origin}; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:0;font-family:system-ui,sans-serif}</style><script type="application/json" data-mermaid-host>${config}</script><script defer src="${origin}/algorithm/mermaid/mermaid.min.js"></script><script defer src="${origin}/format/article-mermaid-bootstrap.js"></script></head><body><div id="diagram"></div></body></html>`;
}
export function validMermaidImage(value: unknown): value is MermaidImage {
  if (!value || typeof value !== 'object') return false;
  const image = value as MermaidImage;
  return typeof image.dataUrl === 'string' && image.dataUrl.length <= 8 * 1024 * 1024 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*=*$/.test(image.dataUrl) && [image.width, image.height].every(number => Number.isInteger(number) && number > 0 && number <= 4096);
}
let host: { frame: HTMLIFrameElement; token: string; session: string; ready: Promise<void>; cancelReady: () => void; idle?: ReturnType<typeof setTimeout> } | null = null;
function disposeHost() { if (!host) return; clearTimeout(host.idle); host.cancelReady(); host.frame.remove(); host = null; }
function rendererHost(session: string) {
  if (host?.session !== session) disposeHost();
  if (host) { clearTimeout(host.idle); return host; }
  const frame = document.createElement('iframe'), token = crypto.randomUUID();
  frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:750px;height:1000px;border:0;pointer-events:none';
  let cancelReady = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: Error) => { if (done) return; done = true; clearTimeout(timer); window.removeEventListener('message', receive); if (error) reject(error); else resolve(); };
    cancelReady = () => finish(new ProductError('mermaid.changed'));
    const receive = (event: MessageEvent) => { if (event.source === frame.contentWindow && event.origin === 'null' && event.data?.hostToken === token && event.data?.kind === 'mermaid-ready') finish(); };
    const timer = setTimeout(() => finish(new ProductError('mermaid.timeout')), 15000); window.addEventListener('message', receive);
  });
  host = { frame, token, session, ready, cancelReady }; frame.srcdoc = mermaidFrameDocument(token, location.origin); document.body.append(frame); return host;
}
export async function renderMermaidImage(source: string, policy: MermaidPolicy, session: string, signal: AbortSignal, current: () => boolean): Promise<MermaidImage> {
  const failure = mermaidSourceProblem(source, policy); if (failure) throw new ProductError(failure);
  const check = () => { signal.throwIfAborted(); if (!current()) throw new ProductError('mermaid.changed'); };
  check(); const key = JSON.stringify([policy.theme, source]), cached = cache.get(key); if (cached) return cached;
  const work = sequence.catch(() => {}).then(async () => {
    check(); const existing = cache.get(key); if (existing) return existing;
    const renderer = rendererHost(session), token = crypto.randomUUID();
    const abort = () => { if (host === renderer) disposeHost(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await renderer.ready; check();
      const result = await new Promise<MermaidImage>((resolve, reject) => {
        const finish = (error?: Error, value?: MermaidImage) => { clearTimeout(timer); signal.removeEventListener('abort', cancelled); window.removeEventListener('message', receive); if (error) reject(error); else resolve(value!); };
        const cancelled = () => finish(new ProductError('mermaid.changed'));
        const receive = (event: MessageEvent) => {
          if (event.source !== renderer.frame.contentWindow || event.origin !== 'null' || event.data?.hostToken !== renderer.token || event.data?.token !== token) return;
          if (event.data.error) finish(new ProductError('mermaid.invalid', { cause: String(event.data.error).slice(0, 1000) }));
          else if (validMermaidImage(event.data.image)) finish(undefined, event.data.image);
          else finish(new ProductError('mermaid.invalidOutput'));
        };
        const timer = setTimeout(() => finish(new ProductError('mermaid.timeout')), 15000);
        signal.addEventListener('abort', cancelled, { once: true }); window.addEventListener('message', receive);
        renderer.frame.contentWindow!.postMessage({ kind: 'mermaid-render', hostToken: renderer.token, token, source, theme: policy.theme }, '*');
      });
      check(); cache.set(key, result); cacheBytes += result.dataUrl.length * 2;
      while (cache.size > 32 || cacheBytes > 16 * 1024 * 1024) { const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.dataUrl.length * 2; cache.delete(oldest); }
      return result;
    } catch (error) { if (host === renderer) disposeHost(); throw error; }
    finally { signal.removeEventListener('abort', abort); if (host === renderer) renderer.idle = setTimeout(disposeHost, 30000); }
  });
  sequence = work.then(() => {}, () => {}); return work;
}
