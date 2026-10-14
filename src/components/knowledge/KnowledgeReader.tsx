'use client';
import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useUITranslation } from '../global/UILocaleProvider';
import { LibraryArticleImage } from '../editor/LibraryArticleImage';
import { knowledgeReferencePath, isMarkdownPath, type KnowledgeManifest } from '../../lib/knowledge/model';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';

type ReaderContext = { source: ReadonlyKnowledgeSource; path: string; paths: ReadonlySet<string>; open: (path: string) => void; download: (path: string) => void };
const Context = createContext<ReaderContext | null>(null);
function useReader() { const context = useContext(Context); if (!context) throw new Error('Knowledge reader context missing'); return context; }
function Link({ href, children }: { href?: string; children?: ReactNode }) {
  const context = useReader(), { t } = useUITranslation('knowledge');
  if (!href) return <span>{children}</span>;
  if (href.startsWith('#')) return <a href={href} className="text-accent-text underline underline-offset-2">{children}</a>;
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2">{children}</a>;
  const path = knowledgeReferencePath(context.path, href);
  if (!path) return <span title={t('unsupportedLink')}>{children}</span>;
  const document = context.paths.has(path) ? path : context.paths.has(path + '.md') ? path + '.md' : context.paths.has(path + '.markdown') ? path + '.markdown' : null;
  if (isMarkdownPath(path) && !document) return <span className="text-warning" title={t('missingLink')}>{children}</span>;
  return <button type="button" className="inline rounded text-left text-accent-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => document ? context.open(document) : context.download(path)}>{children}</button>;
}
function Image({ src, alt }: { src?: string | Blob; alt?: string }) {
  const context = useReader(), { t } = useUITranslation('knowledge');
  const reference = typeof src === 'string' ? src : '', path = reference && knowledgeReferencePath(context.path, reference);
  if (!path) return <span className="inline text-xs text-muted">{t('remoteImage', { name: alt || reference })}</span>;
  return <LibraryArticleImage root={null} readFile={context.source.readFile} defer path={path} source={reference} imageProps={{ alt: alt || '', loading: 'lazy', className: 'my-4 h-auto max-w-full rounded-lg border border-line' }} />;
}
const components: Components = {
  a: Link, img: Image,
  h1: ({ children, id }) => <h1 id={id} className="my-6 font-heading text-2xl font-semibold text-primary">{children}</h1>,
  h2: ({ children, id }) => <h2 id={id} className="my-5 font-heading text-xl font-semibold text-primary">{children}</h2>,
  h3: ({ children, id }) => <h3 id={id} className="my-4 font-heading text-lg font-semibold text-primary">{children}</h3>,
  h4: ({ children, id }) => <h4 id={id} className="my-4 font-heading text-base font-semibold text-primary">{children}</h4>,
  h5: ({ children, id }) => <h5 id={id} className="my-4 font-heading text-sm font-semibold text-primary">{children}</h5>,
  h6: ({ children, id }) => <h6 id={id} className="my-4 font-heading text-sm font-medium text-muted">{children}</h6>,
  p: ({ children }) => <p className="my-3 wrap-anywhere text-sm text-secondary">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-sm text-secondary">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-sm text-secondary">{children}</ol>,
  li: ({ children, id }) => <li id={id}>{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-accent-line pl-4 text-muted">{children}</blockquote>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-line bg-editor-surface p-4 font-article-source text-xs text-editor-text">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-hover px-1 font-article-source text-xs text-primary">{children}</code>,
  table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm text-secondary">{children}</table></div>,
  th: ({ children, colSpan, rowSpan }) => <th colSpan={colSpan} rowSpan={rowSpan} className="border border-line bg-hover p-2 font-semibold text-primary">{children}</th>,
  td: ({ children, colSpan, rowSpan }) => <td colSpan={colSpan} rowSpan={rowSpan} className="border border-line p-2">{children}</td>,
  hr: () => <hr className="my-6 border-line" />,
  div: ({ children }) => <div>{children}</div>, span: ({ children, id }) => <span id={id}>{children}</span>, section: ({ children, id }) => <section id={id}>{children}</section>,
  input: ({ checked }) => <input type="checkbox" checked={checked ?? false} disabled readOnly className="accent-accent" />,
};
const schema = { ...defaultSchema, tagNames: defaultSchema.tagNames?.filter(tag => !['script', 'style', 'link', 'meta', 'audio', 'video', 'source', 'iframe', 'object', 'embed', 'form'].includes(tag)) };
const remarks = [remarkGfm], rehypes = [rehypeRaw, [rehypeSanitize, schema]] as Parameters<typeof ReactMarkdown>[0]['rehypePlugins'];
const Body = memo(function KnowledgeMarkdownBody({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={remarks} rehypePlugins={rehypes} components={components}>{text}</ReactMarkdown>;
});
export const KnowledgeReader = memo(function KnowledgeReader({ source, path, text, manifest, onOpen, onDownload }: {
  source: ReadonlyKnowledgeSource; path: string; text: string; manifest: KnowledgeManifest | null; onOpen: (path: string) => void; onDownload: (path: string) => void;
}) {
  const paths = useMemo(() => new Set(manifest?.documents.map(doc => doc.path) ?? []), [manifest]);
  const context = useMemo(() => ({ source, path, paths, open: onOpen, download: onDownload }), [source, path, paths, onOpen, onDownload]);
  return <Context.Provider value={context}><div className="mx-auto w-full max-w-4xl p-4 md:p-6"><Body text={text} /></div></Context.Provider>;
});
