'use client';
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useUITranslation } from '../global/UILocaleProvider';
import { IconButton } from '../global/IconButton';
import { ScrollViewport } from '../global/ScrollViewport';
import { PanelIcon } from '../global/CollapsiblePanel';
import { LibraryArticleImage } from '../../lib/article-format/LibraryArticleImage';
import { knowledgeReferencePath, isMarkdownPath, type KnowledgeManifest } from '../../lib/knowledge/model';
import { remarkHeadingIds, rehypeAlignSanitizedFragmentLinks } from '../../lib/articleTableOfContents';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';

type ReaderContext = { source: ReadonlyKnowledgeSource; path: string; paths: ReadonlySet<string>; open: (path: string, line?: number, fragment?: string) => void; download: (path: string) => void };
const Context = createContext<ReaderContext | null>(null);
function useReader() { const context = useContext(Context); if (!context) throw new Error('Knowledge reader context missing'); return context; }
function Link({ href, children }: { href?: string; children?: ReactNode }) {
  const context = useReader(), { t } = useUITranslation('knowledge');
  if (!href) return <span>{children}</span>;
  if (href.startsWith('#')) return <button type="button" className="text-left text-accent-text underline underline-offset-2" onClick={() => context.open(context.path, 1, href.slice(1))}>{children}</button>;
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2">{children}</a>;
  const path = knowledgeReferencePath(context.path, href);
  if (!path) return <span title={t('unsupportedLink')}>{children}</span>;
  const document = context.paths.has(path) ? path : context.paths.has(path + '.md') ? path + '.md' : context.paths.has(path + '.markdown') ? path + '.markdown' : null;
  if (isMarkdownPath(path) && !document) return <span className="text-warning" title={t('missingLink')}>{children}</span>;
  return <button type="button" className="inline rounded text-left text-accent-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => document ? context.open(document, 1, href.split('#')[1]) : context.download(path)}>{children}</button>;
}
function Image({ src, alt }: { src?: string | Blob; alt?: string }) {
  const context = useReader(), { t } = useUITranslation('knowledge');
  const reference = typeof src === 'string' ? src : '', path = reference && knowledgeReferencePath(context.path, reference);
  if (!path) return <span className="inline text-xs text-muted">{t('remoteImage', { name: alt || reference })}</span>;
  return <LibraryArticleImage root={null} readFile={context.source.readFile} defer path={path} source={reference} imageProps={{ alt: alt || '', loading: 'lazy', className: 'my-4 h-auto max-w-full rounded-lg border border-line' }} />;
}
const components: Components = {
  a: Link, img: Image,
  h1: ({ children, id, node }) => <h1 data-line={node?.position?.start.line} id={id} className="my-6 font-heading text-2xl font-semibold text-primary">{children}</h1>,
  h2: ({ children, id, node }) => <h2 data-line={node?.position?.start.line} id={id} className="my-5 font-heading text-xl font-semibold text-primary">{children}</h2>,
  h3: ({ children, id, node }) => <h3 data-line={node?.position?.start.line} id={id} className="my-4 font-heading text-lg font-semibold text-primary">{children}</h3>,
  h4: ({ children, id, node }) => <h4 data-line={node?.position?.start.line} id={id} className="my-4 font-heading text-base font-semibold text-primary">{children}</h4>,
  h5: ({ children, id, node }) => <h5 data-line={node?.position?.start.line} id={id} className="my-4 font-heading text-sm font-semibold text-primary">{children}</h5>,
  h6: ({ children, id, node }) => <h6 data-line={node?.position?.start.line} id={id} className="my-4 font-heading text-sm font-medium text-muted">{children}</h6>,
  p: ({ children, node }) => <p data-line={node?.position?.start.line} className="my-3 wrap-anywhere text-sm text-secondary">{children}</p>,
  ul: ({ children, node }) => <ul data-line={node?.position?.start.line} className="my-3 list-disc space-y-1 pl-6 text-sm text-secondary">{children}</ul>,
  ol: ({ children, node }) => <ol data-line={node?.position?.start.line} className="my-3 list-decimal space-y-1 pl-6 text-sm text-secondary">{children}</ol>,
  li: ({ children, id, node }) => <li data-line={node?.position?.start.line} id={id}>{children}</li>,
  blockquote: ({ children, node }) => <blockquote data-line={node?.position?.start.line} className="my-4 border-l-2 border-accent-line pl-4 text-muted">{children}</blockquote>,
  pre: ({ children, node }) => <pre data-line={node?.position?.start.line} data-source-column={node?.position?.start.column} className="my-4 overflow-x-auto rounded-lg border border-line bg-editor-surface p-4 font-article-source text-xs text-editor-text">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-hover px-1 font-article-source text-xs text-primary">{children}</code>,
  table: ({ children, node }) => <div className="my-4 overflow-x-auto"><table data-line={node?.position?.start.line} className="w-full border-collapse text-left text-sm text-secondary">{children}</table></div>,
  th: ({ children, colSpan, rowSpan, node }) => <th data-line={node?.position?.start.line} colSpan={colSpan} rowSpan={rowSpan} className="border border-line bg-hover p-2 font-semibold text-primary">{children}</th>,
  td: ({ children, colSpan, rowSpan, node }) => <td data-line={node?.position?.start.line} colSpan={colSpan} rowSpan={rowSpan} className="border border-line p-2">{children}</td>,
  hr: ({ node }) => <hr data-line={node?.position?.start.line} className="my-6 border-line" />,
  div: ({ children, node }) => <div data-line={node?.position?.start.line}>{children}</div>, span: ({ children, id, node }) => <span data-line={node?.position?.start.line} id={id}>{children}</span>, section: ({ children, id, node }) => <section data-line={node?.position?.start.line} id={id}>{children}</section>,
  input: ({ checked }) => <input type="checkbox" checked={checked ?? false} disabled readOnly className="accent-accent" />,
};
const schema = { ...defaultSchema, tagNames: defaultSchema.tagNames?.filter(tag => !['script', 'style', 'link', 'meta', 'audio', 'video', 'source', 'iframe', 'object', 'embed', 'form'].includes(tag)) };
const remarks = [remarkGfm, remarkHeadingIds], rehypes = [rehypeRaw, rehypeAlignSanitizedFragmentLinks, [rehypeSanitize, schema]] as Parameters<typeof ReactMarkdown>[0]['rehypePlugins'];
const Body = memo(function KnowledgeMarkdownBody({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={remarks} rehypePlugins={rehypes} components={components}>{text}</ReactMarkdown>;
});
const excerptComponents: Components = {
  ...components,
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span className="text-muted">{alt}</span>,
  input: ({ checked }) => <span aria-hidden="true">{checked ? '☑' : '☐'}</span>,
  h1: ({ children }) => <p className="mb-2 text-sm font-semibold text-primary">{children}</p>,
  h2: ({ children }) => <p className="mb-2 text-sm font-semibold text-primary">{children}</p>,
  h3: ({ children }) => <p className="mb-2 text-sm font-semibold text-primary">{children}</p>,
  p: ({ children }) => <p className="mb-2 wrap-anywhere text-xs text-secondary">{children}</p>,
};
/** A bounded, inert variant of the reader body; links and images open through the card. */
export function KnowledgeExcerpt({ text }: { text: string }) {
  return <div className="line-clamp-5 break-words"><ReactMarkdown remarkPlugins={remarks} rehypePlugins={rehypes} components={excerptComponents}>{text.slice(0, 600)}</ReactMarkdown></div>;
}
export const KnowledgeReader = memo(function KnowledgeReader({ source, path, text, manifest, onOpen, onDownload, line = 1, fragment, scrollRef, variant = 'page', showLineNumbers = false }: {
  source: ReadonlyKnowledgeSource; path: string; text: string; manifest: KnowledgeManifest | null; onOpen: (path: string, line?: number, fragment?: string) => void; onDownload: (path: string) => void; line?: number; fragment?: string; scrollRef?: RefObject<HTMLDivElement | null>; variant?: 'page' | 'reference'; showLineNumbers?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null), [headings, setHeadings] = useState<{ id: string; title: string }[]>([]);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [markers, setMarkers] = useState<{ line: string; top: number }[]>([]);
  const markerRef = useRef<HTMLDivElement>(null);
  const { t } = useUITranslation('knowledge');
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !showLineNumbers) { setMarkers(previous => previous.length ? [] : previous); return; }
    const measure = () => {
      const origin = content.getBoundingClientRect().top;
      const markerHeight = markerRef.current ? parseFloat(getComputedStyle(markerRef.current).lineHeight) || 16 : 16;
      const next = [...content.querySelectorAll<HTMLElement>('h1[data-line],h2[data-line],h3[data-line],h4[data-line],h5[data-line],h6[data-line],p[data-line],pre[data-line],li[data-line],table[data-line],hr[data-line],div[data-line],section[data-line]')]
        .filter(node => !(['LI', 'DIV', 'SECTION'].includes(node.tagName) && [...node.children].some(child => child.matches('p,h1,h2,h3,h4,h5,h6,pre,div,section,table'))))
        .map(node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(), height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5; return { line: node.dataset.line!, top: rect.top - origin + (parseFloat(style.paddingTop) || 0) + Math.max(0, (Math.min(height, rect.height) - markerHeight) / 2) }; });
      setMarkers(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(content);
    return () => observer?.disconnect();
  }, [path, text, showLineNumbers]);
  useEffect(() => {
    const content = contentRef.current; if (!content) return;
    setHeadings([...content.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')].map(node => ({ id: node.id, title: node.textContent ?? '' })));
    let target: Element | undefined;
    if (fragment) { let id = fragment; try { id = decodeURIComponent(id); } catch { /* malformed fragment stays literal */ } target = [...content.querySelectorAll('[id]')].find(node => node.id === id || node.id === 'user-content-' + id); }
    else if (line > 1) target = [...content.querySelectorAll<HTMLElement>('[data-line]')].filter(node => Number(node.dataset.line) <= line).at(-1);
    target?.scrollIntoView({ block: 'center' });
  }, [path, text, line, fragment]);
  const paths = useMemo(() => new Set(manifest?.documents.map(doc => doc.path) ?? []), [manifest]);
  const context = useMemo(() => ({ source, path, paths, open: onOpen, download: onDownload }), [source, path, paths, onOpen, onDownload]);
  return <Context.Provider value={context}><div className="relative flex min-h-0 min-w-0 flex-1">
    <ScrollViewport ref={scrollRef} className="flex-1"><div ref={contentRef} data-knowledge-content data-variant={variant} data-line-numbers={showLineNumbers} className="relative mx-auto w-full max-w-4xl p-4 md:p-6 data-[variant=reference]:max-w-none data-[variant=reference]:px-4 data-[line-numbers=true]:pl-18"><Body text={text} />{showLineNumbers ? <div ref={markerRef} aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 w-10 select-none text-right font-mono text-xs text-faint">{markers.map((marker, index) => <span key={index} data-origin-line={marker.line} className="absolute inset-x-0 before:content-[attr(data-origin-line)]" style={{ top: marker.top }} />)}</div> : null}</div></ScrollViewport>
    {headings.length ? <><aside data-open={contentsOpen} className="hidden min-h-0 w-32 shrink-0 flex-col border-l border-line bg-list/50 p-3 pt-14 data-[open=true]:flex md:w-52"><nav aria-label={t('contents')} className="grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-clip scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{headings.map(item => <button type="button" key={item.id} className="truncate rounded text-left text-sm text-accent-text hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onOpen(path, 1, item.id)}>{item.title}</button>)}</nav></aside><IconButton tooltip={t('contents')} aria-expanded={contentsOpen} className="absolute right-3 top-3 opacity-30 hover:opacity-100 focus-visible:opacity-100" icon={<PanelIcon kind="nodes" />} onClick={() => setContentsOpen(value => !value)} /></> : null}
  </div></Context.Provider>;
});
