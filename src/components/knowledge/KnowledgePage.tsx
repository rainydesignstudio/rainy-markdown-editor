'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useKnowledgeLibrary } from '../../hooks/knowledge/useKnowledgeLibrary';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { formatUIDate } from '../../lib/i18n/formatters';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { PageHeading } from '../global/PageHeading';
import { ButtonBar } from '../global/ButtonBar';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { KnowledgeReader } from './KnowledgeReader';
import { KnowledgeGraph } from './KnowledgeGraph';

export function KnowledgePage({ root, sessionKey, isRootCurrent, onSettings, onImport }: {
  root: FileSystemDirectoryHandle | null; sessionKey: number; isRootCurrent: () => boolean; onSettings: () => void;
  onImport?: (path: string, sourceId: string) => void;
}) {
  const { t } = useUITranslation('knowledge'), { locale } = useUILocale();
  const library = useKnowledgeLibrary(root, sessionKey, isRootCurrent);
  const [page, setPage] = useState(1), [pane, setPane] = useState<'list' | 'reader'>('list'), [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [rebuildConfirm, setRebuildConfirm] = useState(false), textRef = useRef<HTMLTextAreaElement | null>(null);
  const [view, setView] = useState<'documents' | 'graph'>('documents');
  const ready = library.connection?.status === 'ready', busy = library.busy !== null || library.loading;
  const items = useMemo(() => library.query.trim() ? library.results?.hits.map(hit => ({ path: hit.path, title: hit.title, line: hit.line, snippet: hit.snippet, status: 'indexed' })) ?? [] : library.manifest?.documents.map(doc => ({ path: doc.path, title: doc.title, line: 1, snippet: '', status: doc.status })) ?? [], [library.query, library.results, library.manifest]);
  const pages = Math.max(1, Math.ceil(items.length / 100));
  useEffect(() => setPage(1), [library.query, library.manifest, library.results]);
  useEffect(() => { if (library.document) setMode(library.document.text.length > 128 * 1024 || library.document.line > 1 ? 'source' : 'preview'); }, [library.document]);
  useEffect(() => {
    const text = library.document, element = textRef.current;
    if (mode !== 'source' || !element || !text) return;
    const value = element.value; let start = 0;
    for (let line = 1; line < text.line; line++) { const next = value.indexOf('\n', start); if (next < 0) break; start = next + 1; }
    const end = value.indexOf('\n', start); element.setSelectionRange(start, end < 0 ? value.length : end);
    element.scrollTop = Math.max(0, (text.line - 2) * parseFloat(getComputedStyle(element).lineHeight));
  }, [library.document, mode]);
  const open = (path: string, line = 1) => { setView('documents'); setPane('reader'); void library.open(path, line); };
  const status = library.connection?.status;
  const currentMetadata = library.manifest?.documents.find(doc => doc.path === library.document?.path);
  const documentChanged = library.document?.changed || Boolean(currentMetadata && library.document && (currentMetadata.modified !== library.document.modified || currentMetadata.size !== library.document.size));
  const connectionText = status === 'unbound' ? t('unbound') : status === 'needs-source' ? t('needsSource') : status === 'needs-permission' ? t('needsPermission') : status === 'invalid' ? t('invalid') : status === 'library-unavailable' ? t('libraryUnavailable') : library.connection?.binding?.name ?? t('unbound');

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6 lg:p-8">
    <PageHeading><div className="min-w-0"><p className="eyebrow">{t('eyebrow')}</p><h1 className="mt-1 font-heading text-xl font-semibold text-primary md:text-2xl">{t('title')}</h1><p className="mt-2 text-sm text-muted">{t('description')}</p></div>
      <ButtonBar label={t('source')}>
        {!root || status === 'library-unavailable' ? <button className="button button-primary" type="button" onClick={onSettings}>{t('settings')}</button> : null}
        {root ? <button className="button button-quiet" type="button" disabled={busy || status === 'library-unavailable'} onClick={() => void library.connect()}>{library.connection?.binding ? t('replace') : t('connect')}</button> : null}
        {status === 'needs-permission' ? <button className="button button-primary" type="button" disabled={busy} onClick={() => void library.authorize()}>{t('authorize')}</button> : null}
        {ready ? <><button className="button button-primary" type="button" disabled={busy} onClick={() => void library.scan()}>{t('scan')}</button><button className="button button-quiet" type="button" disabled={busy} onClick={() => setRebuildConfirm(true)}>{t('rebuild')}</button></> : null}
        {library.busy === 'indexing' ? <button className="button button-quiet" type="button" onClick={library.cancel}>{t('cancel')}</button> : null}
      </ButtonBar>
    </PageHeading>
    <section className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-4 py-3" aria-label={t('source')}>
      <span className="min-w-0 break-all font-medium text-sm text-primary">{library.loading ? t('loading') : root ? connectionText : t('libraryRequired')}</span>
      {ready ? <span className="rounded bg-success-surface px-2 py-0.5 text-xs text-success">{t('readonly')}</span> : null}
      {library.manifest ? <><span className="text-xs text-muted">{t('documents', { count: library.manifest.documents.length })}</span><span className="text-xs text-faint">{t('lastScanned', { date: formatUIDate(library.manifest.scannedAt, locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }, t('unknownDate')) })}</span></> : null}
      {library.progress && library.busy === 'indexing' ? <span role="status" className="w-full text-xs text-accent-text">{t('progress', { phase: t('phase.' + library.progress.phase), done: library.progress.scanned, total: library.progress.total, parsed: library.progress.parsed, reused: library.progress.reused })}</span> : null}
      {library.manifest?.status === 'partial' ? <p className="w-full text-xs text-warning">{t('indexPartial')}</p> : null}
    </section>
    {library.issue || library.connection?.issue ? <p role="alert" className="shrink-0 rounded-md border border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-strong">{formatProductMessage(library.issue ?? library.connection!.issue!, t)}</p> : null}
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <ButtonBar label={t('reader')} className="border-b border-line px-4 py-2"><button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-pressed={view === 'documents'} onClick={() => setView('documents')}>{t('list')}</button><button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" disabled={!ready || !library.manifest} aria-pressed={view === 'graph'} onClick={() => setView('graph')}>{t('graphTitle')}</button></ButtonBar>
      {view === 'graph' && ready && library.manifest ? <KnowledgeGraph key={library.manifest.sourceId} manifest={library.manifest} selectedPath={library.document?.path} onOpen={path => open(path)} /> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line p-4">
        <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted"><span className="sr-only">{t('search')}</span><input className="field w-full" type="search" value={library.query} maxLength={200} disabled={!ready || !library.manifest} placeholder={t('searchPlaceholder')} onChange={event => library.setQuery(event.target.value)} /></label>
        <span className="text-xs text-faint" role="status">{library.searching ? t('searching') : library.results ? t('matches', { count: library.results.total }) : t('documents', { count: items.length })}</span>
        <ButtonBar label={t('reader')} className="lg:hidden">{(['list', 'reader'] as const).map(value => <button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" key={value} type="button" aria-pressed={pane === value} onClick={() => setPane(value)}>{t(value)}</button>)}</ButtonBar>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-3">
        <section data-active={pane === 'list'} className="flex min-h-0 min-w-0 flex-col border-r border-line data-[active=false]:hidden lg:data-[active=false]:flex" aria-label={t('list')}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip p-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
            {items.length ? items.slice((page - 1) * 100, page * 100).map(item => <button key={item.path} type="button" className="mb-1 grid w-full min-w-0 gap-1 rounded-lg border border-transparent p-3 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft" aria-pressed={library.document?.path === item.path} disabled={!ready || library.busy === 'connecting'} onClick={() => open(item.path, item.line)}>
              <span className="truncate font-sub-heading text-sm font-medium text-primary">{item.title}</span><span className="truncate font-mono text-2xs text-faint" title={item.path}>{item.path}</span>
              {item.snippet ? <span className="line-clamp-2 break-words text-xs text-muted">{item.snippet}</span> : null}{item.status === 'unindexed' ? <span className="text-2xs text-warning">{t('unindexed')}</span> : null}
            </button>) : <div className="p-4 text-sm text-muted">{!root ? t('libraryRequired') : !ready ? t('unboundDescription') : !library.manifest ? t('indexMissing') : library.query.trim() ? library.results ? t('noMatches') : library.searching ? t('searching') : t('searchUnavailable') : t('indexEmpty')}</div>}
          </div>
          {library.results?.truncated ? <p className="shrink-0 px-4 py-2 text-2xs text-warning">{t('resultsTruncated', { count: library.results.hits.length })}</p> : null}
          {pages > 1 ? <ButtonBar label={t('list')} className="justify-between border-t border-line p-2"><button className="button button-quiet" type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button><span className="text-2xs text-faint">{t('page', { page, pages })}</span><button className="button button-quiet" type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>{t('next')}</button></ButtonBar> : null}
        </section>
        <section data-active={pane === 'reader'} className="flex min-h-0 min-w-0 flex-col data-[active=false]:hidden lg:col-span-2 lg:data-[active=false]:flex" aria-label={t('reader')}>
          {library.document && library.connection?.source ? <>
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line p-4"><div className="min-w-0 flex-1"><h2 className="truncate font-sub-heading text-sm font-semibold text-primary">{library.document.title}</h2><p className="mt-1 truncate font-mono text-2xs text-faint" title={library.document.path}>{library.document.path}</p></div><ButtonBar label={t('reader')}>
              {onImport && library.connection.binding ? <button className="button button-quiet" type="button" disabled={!ready || busy || library.document.truncated} onClick={() => onImport(library.document!.path, library.connection!.binding!.sourceId)}>{t('messages:imports.fromKnowledgeButton')}</button> : null}
              <button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-pressed={mode === 'preview'} disabled={library.document.text.length > 128 * 1024} title={library.document.text.length > 128 * 1024 ? t('previewLong') : undefined} onClick={() => setMode('preview')}>{t('preview')}</button><button className="button button-quiet aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>{t('sourceView')}</button><button className="button button-quiet" type="button" onClick={() => void library.download(library.document!.path)}>{t('download')}</button>
            </ButtonBar></header>
            {documentChanged ? <p className="shrink-0 border-b border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-strong">{t('sourceChanged')}</p> : null}
            {library.document.truncated ? <p className="shrink-0 px-4 py-2 text-xs text-warning">{t('contentTruncated')}</p> : null}
            {mode === 'source' ? <textarea ref={textRef} readOnly spellCheck={false} wrap="off" className="min-h-0 w-full flex-1 resize-none border-0 bg-editor-surface p-4 font-article-source text-editor-source text-editor-text outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" value={library.document.text} aria-label={t('sourceView')} /> : <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent"><KnowledgeReader source={library.connection.source} path={library.document.path} text={library.document.text} manifest={library.manifest} onOpen={library.open} onDownload={library.download} /></div>}
            <p className="shrink-0 border-t border-line px-4 py-2 text-2xs text-faint">{t('readNotice')}{library.document.line > 1 ? ' · ' + t('location', { line: library.document.line }) : ''}</p>
          </> : <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted" role="status">{library.reading ? t('reading') : t('selectDocument')}</div>}
        </section>
      </div>
      </>}
    </section>
    {library.manifest?.diagnosticCount ? <details className="max-h-36 shrink-0 overflow-y-auto rounded-lg border border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-strong"><summary className="cursor-pointer font-medium">{t('diagnostics')} · {t('diagnosticCount', { count: library.manifest.diagnosticCount })}</summary><ul className="mt-2 grid gap-1">{library.manifest.diagnostics.slice(0, 50).map((item, index) => <li key={index}><button className="rounded text-left underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => open(item.path, item.line ?? 1)}>{item.path}{item.line ? ':' + item.line : ''}</button> · {t('diagnostic.' + item.kind)}{item.target ? ' · ' + item.target : ''}</li>)}</ul>{library.manifest.diagnosticCount > 50 ? <p className="mt-2">{t('diagnosticsTruncated', { count: 50 })}</p> : null}</details> : null}
    {rebuildConfirm ? <DialogFrame role="alertdialog" titleId="knowledge-rebuild-title" descriptionId="knowledge-rebuild-description" onClose={() => setRebuildConfirm(false)}><DialogHeader titleId="knowledge-rebuild-title" eyebrow={t('eyebrow')} title={t('forceTitle')} onClose={() => setRebuildConfirm(false)} /><p id="knowledge-rebuild-description" className="p-4 text-sm text-secondary">{t('forceDescription')}</p><DialogFooter><DialogActions><DialogButton onClick={() => setRebuildConfirm(false)}>{t('cancel')}</DialogButton><DialogButton variant="primary" onClick={() => { setRebuildConfirm(false); void library.scan(true); }}>{t('confirmRebuild')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}
  </div>;
}
