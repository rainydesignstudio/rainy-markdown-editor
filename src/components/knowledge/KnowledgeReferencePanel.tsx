'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useKnowledgeLibrary } from '../../hooks/knowledge/useKnowledgeLibrary';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import type { KnowledgeCapture } from '../../lib/knowledge/model';
import { useUITranslation } from '../global/UILocaleProvider';
import { ContentIcon } from '../global/ContentIcon';
import { IconButton } from '../global/IconButton';
import { LibraryCard } from '../global/LibraryCard';
import { ScrollViewport } from '../global/ScrollViewport';
import { KnowledgeReader } from './KnowledgeReader';
import { useToast } from '../global/Toast';
import { captureKnowledgeSelection } from '../../lib/knowledge/selection';

export function KnowledgeReferencePanel({ root, sessionKey, scope, isRootCurrent, disabled, onCite }: {
  root: FileSystemDirectoryHandle | null; sessionKey: number; scope: string | number;
  isRootCurrent: () => boolean; disabled: boolean;
  onCite: (capture: KnowledgeCapture | undefined, excerpt: boolean) => void;
}) {
  const { t } = useUITranslation('knowledge');
  const notify = useToast();
  const library = useKnowledgeLibrary(root, sessionKey, isRootCurrent);
  const [reading, setReading] = useState(false), [collapsed, setCollapsed] = useState(false), [page, setPage] = useState(1);
  const [selection, setSelection] = useState<KnowledgeCapture | null>(null);
  const host = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null);
  const active = library.bindings.find(item => item.sourceId === library.selectedId);
  const doc = library.document, source = library.connection?.source;
  const documents = library.manifest?.documents ?? [], pages = Math.max(1, Math.ceil(documents.length / 100));
  const ready = library.connection?.status === 'ready';
  useEffect(() => { setReading(false); setCollapsed(false); setPage(1); setSelection(null); }, [root, sessionKey]);
  useEffect(() => { setSelection(null); }, [scope, doc, reading]);
  useEffect(() => { setPage(1); }, [library.selectedId]);
  const browse = () => { setReading(false); setSelection(null); };
  const open = (path: string, line = 1, fragment?: string) => { setSelection(null); setReading(true); void library.open(path, line, fragment); };
  const rememberSelection = useCallback(() => {
    if (!reading || !doc || !active || !ready) { setSelection(null); return; }
    const next = captureKnowledgeSelection(host.current?.querySelector<HTMLElement>('[data-knowledge-content]') ?? null, window.getSelection(), doc, active.sourceId);
    if (!next) { setSelection(null); return; }
    setSelection(previous => previous?.sourceId === next.sourceId && previous.path === next.path && previous.line === next.line && previous.endLine === next.endLine && previous.content === next.content ? previous : next);
  }, [reading, doc, active, ready]);
  useEffect(() => { document.addEventListener('selectionchange', rememberSelection); return () => document.removeEventListener('selectionchange', rememberSelection); }, [rememberSelection]);
  const cite = (excerpt: boolean) => {
    if (disabled || !isRootCurrent()) return;
    const captured = reading && selection && selection.path === doc?.path && selection.sourceId === active?.sourceId ? selection : undefined;
    if (excerpt && !captured) return;
    const content = doc?.text.split(/\r?\n\s*\r?\n/)[0] ?? '';
    onCite(captured ?? (reading && doc && active && ready ? { sourceId: active.sourceId, path: doc.path, title: doc.title, content, line: 1, endLine: content.split('\n').length, whole: false } : undefined), excerpt);
  };
  const issue = library.issue ?? library.connection?.issue;
  useEffect(() => { if (issue && isRootCurrent()) notify({ key: 'reference-read', tone: 'warning', label: formatProductMessage(issue, t) }); }, [issue, notify, t]);
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('referencePanel')} data-reference-panel>
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0 flex-1"><nav className="flex min-w-0 items-center gap-1 text-xs text-muted" aria-label={t('referenceNavigation')}>
        <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded hover:text-primary focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { browse(); setCollapsed(false); }}><ContentIcon name="book" /><span>{t('title')}</span></button>
        {active ? <><span aria-hidden="true">›</span><button type="button" className="min-w-0 truncate rounded hover:text-primary focus-visible:outline-2 focus-visible:outline-accent" title={active.name} onClick={browse}>{active.name}</button></> : null}
        {reading && doc ? <><span aria-hidden="true">›</span><span className="min-w-0 truncate" aria-current="page" title={doc.path}>{doc.title}</span></> : null}
      </nav><h3 className="mt-1 truncate font-sub-heading text-sm font-semibold text-primary">{reading && doc ? doc.title : library.reading ? t('reading') : t('noDocumentSelected')}</h3></div>
      <div className="flex shrink-0 gap-1" role="group" aria-label={t('referenceActions')}>
        <IconButton tooltip={t('adoptExcerpt')} icon={<ContentIcon name="copy" />} disabled={disabled || !reading || !selection || library.reading} onPointerDown={event => event.preventDefault()} onClick={() => cite(true)} />
        <IconButton tooltip={t('addCitation')} icon={<ContentIcon name="link" />} disabled={disabled || library.reading} onPointerDown={event => event.preventDefault()} onClick={() => cite(false)} />
      </div>
    </header>
    <div hidden={reading} className="flex min-h-0 min-w-0 flex-1">
      <aside data-collapsed={collapsed} className="group/reference-sources flex w-40 min-h-0 shrink-0 flex-col border-r border-line bg-list/50 data-[collapsed=true]:w-14" aria-label={t('sources')}>
        <div className="flex h-10 shrink-0 items-center justify-between gap-1 px-4 group-data-[collapsed=true]/reference-sources:px-2"><span className="truncate text-xs text-muted group-data-[collapsed=true]/reference-sources:sr-only">{t('sources')}</span><IconButton variant="inline" tooltip={t(collapsed ? 'expandSources' : 'collapseSources')} icon={<ContentIcon name={collapsed ? 'expand' : 'collapse'} />} onClick={() => setCollapsed(value => !value)} /></div>
        <div className="grid min-h-0 content-start gap-1 overflow-y-auto overflow-x-clip p-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent group-data-[collapsed=true]/reference-sources:scrollbar-none">
          {library.bindings.map(item => <LibraryCard key={item.sourceId} icon={<ContentIcon name="book" />} collapsed={collapsed} title={item.name} aria-pressed={item.sourceId === library.selectedId} onClick={() => { browse(); void library.select(item.sourceId); }}><span className="truncate text-2xs text-faint">{t(library.indexed[item.sourceId] ? 'indexReady' : 'indexMissing')}</span></LibraryCard>)}
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Geometry rationale: document cards follow the reference container width; the minimum shrinks to fit its narrowest single column. */}
        <div className="grid min-h-0 content-start grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2 overflow-y-auto overflow-x-clip p-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
          {documents.slice((page - 1) * 100, page * 100).map(item => <LibraryCard key={item.path} icon={<ContentIcon name="document" />} title={item.title} aria-pressed={doc?.path === item.path} disabled={library.loading || !ready} onClick={() => open(item.path)}><span className="truncate font-mono text-2xs text-faint">{item.path}</span></LibraryCard>)}
        </div>
        {library.loading || !documents.length ? <div className="grid min-h-0 flex-1 content-center justify-items-start gap-2 p-3 text-xs text-muted"><p>{library.loading ? t('loading') : !root ? t('libraryRequired') : !active ? library.bindings.length ? t('chooseSource') : t('unbound') : !ready ? t(library.connection?.status === 'needs-permission' ? 'needsPermission' : 'needsSource') : t('indexMissing')}</p>{library.connection?.status === 'needs-permission' ? <button type="button" className="button button-quiet" onClick={() => void library.authorize()}>{t('authorize')}</button> : null}</div> : null}
        {pages > 1 ? <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-line p-2"><IconButton tooltip={t('previous')} icon={<ContentIcon name="collapse" />} disabled={page <= 1} onClick={() => setPage(value => value - 1)} /><span className="text-2xs text-muted">{t('page', { page, pages })}</span><IconButton tooltip={t('next')} icon={<ContentIcon name="expand" />} disabled={page >= pages} onClick={() => setPage(value => value + 1)} /></div> : null}
      </div>
    </div>
    <div ref={host} hidden={!reading} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {library.reading ? <p role="status" className="p-3 text-xs text-muted">{t('reading')}</p> : doc && source ? doc.text.length > 128 * 1024 ? <ScrollViewport className="flex-1"><pre data-knowledge-content data-line="1" className="min-h-full whitespace-pre-wrap break-words p-4 font-article-source text-xs text-primary">{doc.text}</pre></ScrollViewport> : <KnowledgeReader variant="reference" source={source} path={doc.path} text={doc.text} manifest={library.manifest} line={doc.line} fragment={doc.fragment} scrollRef={scroll} onOpen={open} onDownload={library.download} /> : <p className="p-3 text-xs text-muted">{t('selectDocument')}</p>}
      {doc?.truncated ? <p className="shrink-0 px-3 py-2 text-xs text-warning">{t('contentTruncated')}</p> : null}
    </div>
  </section>;
}
