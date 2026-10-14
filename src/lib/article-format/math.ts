import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';
import type { Root, Element, ElementContent } from 'hast';
import type { FormatFormatter } from './config';
import { productCause, productMessage, productText } from '../i18n/productMessages';
import type { ArticleFormatIssue } from '../articleFormat';

export type MathPolicy = NonNullable<FormatFormatter['math']>;
type Rendered = { children: ElementContent[]; failure: string };
const cache = new Map<string, { rendered: Rendered; bytes: number }>(); let cacheBytes = 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
function renderMath(source: string, display: boolean): Rendered {
  const key = JSON.stringify([display, source]), hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return structuredClone(hit.rendered); }
  const code: Element = { type: 'element', tagName: 'code', properties: { className: ['language-math', display ? 'math-display' : 'math-inline'] }, children: [{ type: 'text', value: source }] };
  const root: Root = { type: 'root', children: display ? [{ type: 'element', tagName: 'pre', properties: {}, children: [code] }] : [code] };
  const file = new VFile(); let blocked = false, failure = '';
  try {
    // Untrusted TeX cannot enable HTML, fetch URLs, change options or share macros.
    rehypeKatex({ output: 'mathml', strict: 'error', maxSize: 10, maxExpand: 1000, macros: Object.create(null), trust: () => { blocked = true; return false; } })(root, file);
    if (blocked) failure = productText('math.unsafe');
    else if (file.messages.length) failure = errorText(file.messages[0].cause ?? file.messages[0]);
  } catch (error) { failure = errorText(error); }
  const children = root.children as ElementContent[], rendered = { children, failure }, bytes = JSON.stringify(children).length * 2;
  if (bytes > 512 * 1024) return { children: [], failure: productText('math.limit') };
  if (!failure) {
    cache.set(key, { rendered: structuredClone(rendered), bytes }); cacheBytes += bytes;
    while (cache.size > 64 || cacheBytes > 2 * 1024 * 1024) { const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest); }
  }
  return rendered;
}
type MathNode = { type: string; value?: string; lang?: string; children?: MathNode[]; position?: { start?: { line?: number } } };
const parsers = [false, true].map(singleDollarTextMath => unified().use(remarkParse).use(remarkMath, { singleDollarTextMath }));
export function inspectMathSource(source: string, policy: MathPolicy, label: string): { issues: ArticleFormatIssue[]; count: number } {
  const issues: ArticleFormatIssue[] = []; let count = 0;
  const visit = (node: MathNode) => {
    if (node.type === 'math' || node.type === 'inlineMath' || node.type === 'code' && node.lang === 'math') {
      const value = node.value ?? ''; count++;
      const failure = count > policy.maxExpressions || value.length > policy.maxLength ? productText('math.limit') : renderMath(value, node.type !== 'inlineMath').failure;
      if (failure) issues.push({ kind: 'element', name: productText('math.name'), source: label, tier: 'error', line: node.position?.start?.line, ...productMessage('math.invalid', { cause: productCause(failure) }), domain: 'product' });
      return;
    }
    if (node.type !== 'code' && node.type !== 'inlineCode') node.children?.forEach(visit);
  }; visit(parsers[policy.singleDollar ? 1 : 0].parse(source) as MathNode); return { issues, count };
}

/** The official KaTeX rehype adapter runs after author HTML has been sanitized. */
export function rehypeArticleMath(policy: MathPolicy) {
  return (tree: Root) => {
    let count = 0;
    const text = (node: ElementContent): string => node.type === 'text' ? node.value : 'children' in node ? node.children.map(text).join('') : '';
    const visit = (parent: Root | Element) => {
      for (let index = 0; index < parent.children.length; index++) {
        const node = parent.children[index]; if (node.type !== 'element') continue;
        const code = node.tagName === 'pre' ? node.children.find(child => child.type === 'element' && child.tagName === 'code') as Element | undefined : node.tagName === 'code' ? node : undefined;
        const classes = code?.properties.className;
        if (!code || !Array.isArray(classes) || !classes.some(name => ['language-math', 'math-inline', 'math-display'].includes(String(name)))) { visit(node); continue; }
        const source = text(node), display = node.tagName === 'pre' || classes.includes('math-display');
        const rendered = ++count > policy.maxExpressions || source.length > policy.maxLength ? { children: [], failure: productText('math.limit') } : renderMath(source, display);
        const wrapper: Element = { type: 'element', tagName: display ? 'section' : 'span', properties: { dataRenderKind: 'math', dataMathDisplay: display ? 'true' : 'false' }, position: node.position ?? code.position, children: rendered.children };
        if (rendered.failure) {
          wrapper.properties.dataRenderError = 'math'; wrapper.properties.title = rendered.failure;
          wrapper.children = [{ type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: source }] }];
        }
        parent.children[index] = wrapper;
      }
    }; visit(tree);
  };
}
