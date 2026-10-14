import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { remarkHeadingIds, rehypeAlignSanitizedFragmentLinks } from '../articleTableOfContents';
import { remarkArticleBlankParagraphs, remarkArticleSoftBreaks, rehypeArticleSourcePositions } from '../articleBlankParagraphs';
import { rehypeArticleCodeHighlight, rehypeArticleCodeWhitespace } from '../articleCodeHighlight';
import { SAFE_REHYPE_SCHEMA, rehypeSafeStyles } from './sanitize';
import { getFormatSnapshot, type FormatSnapshot } from './runtime';
import { resourceReferenceIntent } from '../resources/references';
import remarkMath from 'remark-math';
import { rehypeArticleMath } from './math';
import { rehypeArticleMermaid } from './mermaid';

export function articleMarkdownPlugins(snapshot: FormatSnapshot = getFormatSnapshot()): PluggableList {
  return [remarkGfm, ...(snapshot.bundle.formatter.math ? [[remarkMath, { singleDollarTextMath: snapshot.bundle.formatter.math.singleDollar }] as PluggableList[number]] : []), [remarkHeadingIds, { mode: snapshot.bundle.formatter.headingIds ?? 'auto' }], [remarkArticleBlankParagraphs, snapshot.bundle.formatter.markdown], [remarkArticleSoftBreaks, snapshot.bundle.formatter.markdown]];
}
export function articleHtmlPlugins(snapshot: FormatSnapshot = getFormatSnapshot()): PluggableList {
  const prefix = snapshot.bundle.formatter.document?.preserveIds ? '' : 'user-content-';
  return [rehypeRaw, [rehypeAlignSanitizedFragmentLinks, { prefix }], [rehypeSanitize, { ...SAFE_REHYPE_SCHEMA, clobberPrefix: prefix }],
    ...(snapshot.bundle.formatter.math ? [[rehypeArticleMath, snapshot.bundle.formatter.math] as PluggableList[number]] : []),
    ...(snapshot.bundle.formatter.mermaid ? [[rehypeArticleMermaid, snapshot.bundle.formatter.mermaid] as PluggableList[number]] : []),
    ...(snapshot.bundle.formatter.codeHighlight.enabled && snapshot.bundle.formatter.codeHighlight.engine !== 'prism' ? [rehypeArticleCodeHighlight] : []),
    [rehypeConfiguredNodeDefaults, snapshot.bundle.formatter.nodes], [rehypeArticleCodeWhitespace, snapshot.bundle.formatter.codeWhitespace], rehypeSafeStyles, rehypeArticleSourcePositions];
}
type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] };
export function rehypePreviewOnly(options: { enabled: boolean }) {
  return (tree: Node) => {
    if (!options.enabled) return;
    for (const node of tree.children ?? []) {
      if (node.type === 'element') (node.properties ??= {})['data-preview-only'] = 'true';
    }
  };
}
export function rehypeConfiguredNodeDefaults(policy?: FormatSnapshot['bundle']['formatter']['nodes']) {
  return (tree: Node) => {
    if (!policy) return;
    const visit = (node: Node) => {
      if (node.type === 'element') {
        const p = node.properties ??= {};
        if (node.tagName === 'img') {
          p.width ??= policy.image.width; p.height ??= policy.image.height;
          if (!p.className) p.className = policy.image.classes;
          if (!p.style) p.style = Object.entries(policy.image.style).map(([key, value]) => key + ':' + value).join(';');
          if (!p.alt) p.alt = policy.image.alt;
        } else if (node.tagName === 'a' && typeof p.href === 'string' && !p.href.startsWith('#')) {
          if (!p.className) p.className = policy.link.classes;
          if (p.href.startsWith('/') && policy.link.rootBase && !resourceReferenceIntent(p.href)) p.href = new URL(p.href, policy.link.rootBase).href;
          else if (/^https?:/i.test(p.href)) { p.target ??= policy.link.externalTarget; p.rel ??= ['noopener', 'noreferrer']; }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
