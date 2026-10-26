'use client';
import { SelectField } from '../global/SelectField';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKnowledgeLibrary } from '../../hooks/knowledge/useKnowledgeLibrary';
import { articleIdentityMap } from '../../lib/articleIdentity';
import { productErrorMessage } from '../../lib/i18n/productMessages';
import { formatKnowledgeIssue } from '../../lib/knowledge/errors';
import { captureKnowledgeSelection } from '../../lib/knowledge/selection';
import { formatUIDate } from '../../lib/i18n/formatters';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { PanelIcon } from '../global/CollapsiblePanel';
import { IconButton } from '../global/IconButton';
import { ModeSwitch } from '../global/ModeSwitch';
import { IconPopover } from '../global/IconPopover';
import { PageHeading } from '../global/PageHeading';
import { ContentIcon } from '../global/ContentIcon';
import { LibraryCard } from '../global/LibraryCard';
import { TooltipButton } from '../global/TooltipButton';
import { ButtonBar } from '../global/ButtonBar';
import { useToast } from '../global/Toast';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { KnowledgeChanges } from './KnowledgeChanges';
import { KnowledgeRelations } from './KnowledgeRelations';
import { KnowledgeTopics } from './KnowledgeTopics';
import { readResearch, updateResearch, type KnowledgeResearch } from '../../lib/knowledge/research';
import { KnowledgeReader } from './KnowledgeReader';
import { KnowledgeSource } from './KnowledgeSource';
import type { KnowledgeCapture } from '../../lib/knowledge/model';
import { KnowledgeGraph } from './KnowledgeGraph';

const viewIcons = { documents: 'document', graph: 'graph', topics: 'book', relations: 'link', changes: 'changes' } as const;

export function KnowledgePage({ root, sessionKey, isRootCurrent, onSettings, onImport, embedded = false, onAdopt, articles = [], researchRevision = 0 }: {
  root: FileSystemDirectoryHandle | null; sessionKey: number; isRootCurrent: () => boolean; onSettings: () => void;
  onImport?: (path: string, sourceId: string) => void; embedded?: boolean; researchRevision?: number;
  onAdopt?: (capture: KnowledgeCapture, excerpt: boolean) => void; articles?: { id: string; title: string }[];
}) {
  const { t } = useUITranslation('knowledge'), { locale } = useUILocale(), notify = useToast();
  const library = useKnowledgeLibrary(root, sessionKey, isRootCurrent);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [viewToolbarTarget, setViewToolbarTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { if (!embedded) setToolbarTarget(document.getElementById('knowledge-toolbar-actions')); }, [embedded]);
  const [page, setPage] = useState(1), [pane, setPane] = useState<'list' | 'reader'>('list'), [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [rebuildConfirm, setRebuildConfirm] = useState(false), textRef = useRef<HTMLTextAreaElement | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false), [editOpen, setEditOpen] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sourceForm, setSourceForm] = useState({ name: '', directory: '' });
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false), [documentsCollapsed, setDocumentsCollapsed] = useState(false);
  useEffect(() => { if (window.matchMedia('(width < 64rem)').matches) setSourcesCollapsed(true); }, []);
  const [filtersOpen, setFiltersOpen] = useState(false), [diagnosticsOpen, setDiagnosticsOpen] = useState(false), [showLineNumbers, setShowLineNumbers] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null), history = useRef<{ path: string; line: number; fragment?: string; mode: 'preview' | 'source'; scroll: number }[]>([]), restore = useRef<{ mode: 'preview' | 'source'; scroll: number } | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [selection, setSelection] = useState<KnowledgeCapture | null>(null);
  const [view, setView] = useState<'documents' | 'graph' | 'topics' | 'relations' | 'changes'>('documents');
  const [research, setResearch] = useState<KnowledgeResearch | null>(null), [researchBusy, setResearchBusy] = useState(false), [researchIssue, setResearchIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null), [topicId, setTopicId] = useState('');
  const source = library.connection?.source, activeSource = useRef(source); activeSource.current = source;
  useEffect(() => { setEditOpen(false); setDeleteConfirm(false); setReplaceConfirm(false); setRebuildConfirm(false); }, [root, sessionKey]);
  useEffect(() => {
    let active = true; setResearch(null); setResearchIssue(null); setTopicId(''); setResearchBusy(false);
    if (root && source && library.connection?.status === 'ready') void readResearch(root, source).then(value => { if (active) setResearch(value); }).catch(error => { if (active) setResearchIssue(productErrorMessage(error)); });
    return () => { active = false; };
  }, [root, sessionKey, source, library.connection?.status]);
  useEffect(() => {
    let active = true;
    if (researchRevision && root && source) void readResearch(root, source).then(value => { if (active) setResearch(value); }).catch(error => { if (active) setResearchIssue(productErrorMessage(error)); });
    return () => { active = false; };
  }, [researchRevision, root, source]);
  const researchSave = async (mutate: (value: KnowledgeResearch) => void) => {
    if (!root || !source || researchBusy || !isRootCurrent()) return false; setResearchBusy(true); setResearchIssue(null);
    try { const value = await updateResearch(root, source, mutate); if (isRootCurrent() && activeSource.current === source) setResearch(value); return true; }
    catch (error) { if (isRootCurrent() && activeSource.current === source) setResearchIssue(productErrorMessage(error)); return false; }
    finally { if (isRootCurrent() && activeSource.current === source) setResearchBusy(false); }
  };
  const [articleKeys, setArticleKeys] = useState<Map<string, string>>(new Map());
  useEffect(() => { let active = true; setArticleKeys(new Map()); if (root) void articleIdentityMap(root).then(value => { if (active) setArticleKeys(value); }).catch(error => { if (active) setResearchIssue(productErrorMessage(error)); }); return () => { active = false; }; }, [root, research]);
  const linkedArticles = articles.map(article => ({ ...article, id: articleKeys.get(article.id) ?? article.id }));
  const [relationPath, setRelationPath] = useState('');
  const ready = library.connection?.status === 'ready', busy = library.busy !== null || library.loading;
  const items = useMemo(() => library.searchActive ? library.results?.hits.map(hit => ({ path: hit.path, title: hit.title, line: hit.line, snippet: hit.snippet, status: 'indexed' })) ?? [] : library.manifest?.documents.map(doc => ({ path: doc.path, title: doc.title, line: 1, snippet: '', status: doc.status })) ?? [], [library.searchActive, library.results, library.manifest]);
  const pages = Math.max(1, Math.ceil(items.length / 100));
  useEffect(() => setPage(1), [library.query, library.manifest, library.results]);
  useEffect(() => { if (library.document) setMode(restore.current?.mode ?? (library.document.text.length > 128 * 1024 ? 'source' : 'preview')); }, [library.document]);
  useEffect(() => {
    const text = library.document, element = textRef.current;
    if (mode !== 'source' || !element || !text) return;
    const value = element.value; let start = 0;
    for (let line = 1; line < text.line; line++) { const next = value.indexOf('\n', start); if (next < 0) break; start = next + 1; }
    const end = value.indexOf('\n', start); element.setSelectionRange(start, end < 0 ? value.length : end);
    element.scrollTop = Math.max(0, (text.line - 2) * parseFloat(getComputedStyle(element).lineHeight));
  }, [library.document, mode]);
  useEffect(() => { history.current = []; restore.current = null; setHistoryCount(0); }, [root, sessionKey, library.selectedId]);
  useEffect(() => { setPane('list'); setRelationPath(''); }, [library.selectedId]);
  useEffect(() => setSelection(null), [library.selectedId, library.document?.path, library.document?.text, mode]);
  useEffect(() => { if (!library.document || !restore.current || mode !== restore.current.mode) return; const frame = restore.current; restore.current = null; const element = mode === 'source' ? textRef.current : readerRef.current; if (element) element.scrollTop = frame.scroll; }, [library.document, mode]);
  const open = (path: string, line = 1, fragment?: string) => {
    if (library.document) { history.current.push({ path: library.document.path, line: library.document.line, fragment: library.document.fragment, mode, scroll: (mode === 'source' ? textRef.current : readerRef.current)?.scrollTop ?? 0 }); if (history.current.length > 100) history.current.shift(); setHistoryCount(history.current.length); }
    setRelationPath(path); setView('documents'); setPane('reader'); void library.open(path, line, fragment);
  };
  const back = () => { const entry = history.current.pop(); if (!entry) return; restore.current = entry; setRelationPath(entry.path); setHistoryCount(history.current.length); void library.open(entry.path, entry.line, entry.fragment); };
  const rememberSelection = () => {
    const doc = library.document, sourceId = library.connection?.binding?.sourceId;
    if (!doc || !sourceId) { setSelection(null); return; }
    const area = textRef.current;
    if (mode === 'source' && area) {
      const content = area.value.slice(area.selectionStart, area.selectionEnd);
      const line = area.value.slice(0, area.selectionStart).split('\n').length;
      const endLine = line + content.replace(/\n$/, '').split('\n').length - 1;
      setSelection(content.trim() ? { sourceId, path: doc.path, title: doc.title, content, line, endLine, whole: false, original: doc.text.split(/\r?\n/).slice(line - 1, endLine).join('\n') } : null);
    } else setSelection(captureKnowledgeSelection(readerRef.current?.querySelector<HTMLElement>('[data-knowledge-content]') ?? null, window.getSelection(), doc, sourceId));
  };
  const validSelection = selection?.path === library.document?.path && selection?.sourceId === library.connection?.binding?.sourceId ? selection : null;
  const capture = (whole = false, fallback = false): KnowledgeCapture | null => {
    const doc = library.document, sourceId = library.connection?.binding?.sourceId;
    if (!doc || !sourceId || doc.truncated) return null;
    if (!whole && validSelection) return validSelection;
    if (!whole && !fallback) return null;
    const content = whole ? doc.text : doc.text.split(/\r?\n/).slice(doc.line - 1).join('\n').split(/\n\s*\n/)[0];
    const line = whole ? 1 : doc.line;
    return { sourceId, path: doc.path, title: doc.title, content, line, endLine: whole ? doc.text.split('\n').length : line + content.split('\n').length - 1, whole };
  };
  const adopt = (excerpt: boolean) => { const value = capture(false, !excerpt); if (value) onAdopt?.(value, excerpt); };
  const collect = (whole: boolean) => {
    if (!ready || busy || researchBusy || !isRootCurrent() || !research?.topics.some(item => item.id === topicId)) return;
    const value = capture(whole);
    if (value) void researchSave(data => { const topic = data.topics.find(item => item.id === topicId); if (topic) { const now = new Date().toISOString(); topic.items.push({ ...value, id: crypto.randomUUID(), note: '', createdAt: now, updatedAt: now }); } }).then(ok => { if (ok) notify({ key: 'knowledge-collect', label: t('notice.collected'), tone: 'success' }); });
  };
  const status = library.connection?.status;
  const currentMetadata = library.manifest?.documents.find(doc => doc.path === library.document?.path);
  const documentChanged = library.document?.changed || Boolean(currentMetadata && library.document && (currentMetadata.modified !== library.document.modified || currentMetadata.size !== library.document.size));


  const currentIssue = researchIssue ?? library.issue ?? library.connection?.issue;
  useEffect(() => { if (currentIssue) notify({ key: 'knowledge-issue', label: t('notice.failed'), details: formatKnowledgeIssue(currentIssue, t), tone: 'error', lifetime: { mode: 'locked' } }, JSON.stringify(currentIssue)); else notify({ key: 'knowledge-issue', dismiss: true }); }, [currentIssue, notify, t]);
  useEffect(() => { if (library.manifest?.status === 'partial') notify({ key: 'knowledge-index', label: t('notice.partial'), details: t('indexPartial'), tone: 'warning' }, JSON.stringify([library.manifest.sourceId, library.manifest.generation])); else notify({ key: 'knowledge-index', dismiss: true }); }, [library.manifest, notify, t]);
  useEffect(() => { if (library.results?.truncated) notify({ key: 'knowledge-results', label: t('notice.results'), details: t('resultsTruncated', { count: library.results.hits.length }), tone: 'warning' }, JSON.stringify(library.results)); else notify({ key: 'knowledge-results', dismiss: true }); }, [library.results, notify, t]);
  useEffect(() => { if (documentChanged || library.document?.truncated) notify({ key: 'knowledge-document', label: t(documentChanged ? 'notice.changed' : 'notice.truncated'), tone: 'warning' }, JSON.stringify([library.document?.path, documentChanged, library.document?.truncated])); else notify({ key: 'knowledge-document', dismiss: true }); }, [documentChanged, library.document?.path, library.document?.truncated, notify, t]);
  const diagnosticCount = (library.manifest?.diagnosticCount ?? 0) + [currentIssue, library.manifest?.status === 'partial', documentChanged, library.document?.truncated, library.results?.truncated].filter(Boolean).length;
  const diagnostics = diagnosticCount ? <IconPopover label={t('diagnostics') + ' (' + diagnosticCount + ')'} kind="dialog" open={diagnosticsOpen} onToggle={() => setDiagnosticsOpen(value => !value)} onClose={() => setDiagnosticsOpen(false)} icon={<ContentIcon name="info" />}><div className="grid max-h-80 gap-3 overflow-y-auto p-3 text-xs text-secondary">
    {currentIssue ? <p role="alert" className="whitespace-pre-wrap break-words">{formatKnowledgeIssue(currentIssue, t)}</p> : null}
    {library.manifest?.status === 'partial' ? <p>{t('indexPartial')}</p> : null}{documentChanged ? <p>{t('sourceChanged')}</p> : null}{library.document?.truncated ? <p>{t('contentTruncated')}</p> : null}{library.results?.truncated ? <p>{t('resultsTruncated', { count: library.results.hits.length })}</p> : null}
    <p>{t('diagnosticCount', { count: library.manifest?.diagnosticCount ?? 0 })}</p><ul className="grid gap-2">{library.manifest?.diagnostics.slice(0, 50).map((item, index) => <li key={index}><button className="rounded text-left underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => { setDiagnosticsOpen(false); open(item.path, item.line ?? 1); }}>{item.path}{item.line ? ':' + item.line : ''}</button> · {t('diagnostic.' + item.kind)}{item.target ? ' · ' + item.target : ''}</li>)}</ul>{(library.manifest?.diagnosticCount ?? 0) > 50 ? <p>{t('diagnosticsTruncated', { count: 50 })}</p> : null}
  </div></IconPopover> : null;
  const selectedSource = library.bindings.find(item => item.sourceId === library.selectedId);
  const sourceWorking = library.loading || library.busy === 'reading' || library.busy === 'indexing';
  const updatedCount = library.bindings.filter(item => library.indexed[item.sourceId]).length;
  const actions = <><ButtonBar label={t('sources')} className="flex-nowrap"><IconButton tooltip={t('addSource')} icon={<ContentIcon name="plus" />} disabled={!root || busy || status === 'library-unavailable'} onClick={() => void library.connect('add')} /><IconButton tooltip={t('editSource')} icon={<ContentIcon name="edit" />} disabled={!selectedSource || busy} onClick={() => { if (selectedSource) { setSourceForm({ name: selectedSource.name, directory: selectedSource.directory || 'source-' + selectedSource.sourceId.slice(0, 8) }); setEditOpen(true); } }} /></ButtonBar>
    <ButtonBar label={t('scan')} className="flex-nowrap"><IconButton tooltip={t('scan')} icon={<ContentIcon name="reset" />} disabled={!selectedSource || !ready || busy} onClick={() => void library.scan()} /><IconButton tooltip={t('rebuild')} icon={<ContentIcon name="code" />} disabled={!selectedSource || !ready || busy} onClick={() => setRebuildConfirm(true)} /></ButtonBar></>;
  const connectionStatus = <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-list px-4 py-3 text-sm" role="status"><span className="size-1.5 shrink-0 rounded-full bg-muted data-[ready=true]:bg-success" data-ready={Boolean(updatedCount)} /><div className="min-w-0"><p className="text-xs text-muted">{t('connectedSources')}</p><p className="truncate text-sm text-primary">{library.bindings.length ? t('updatedSources', { done: updatedCount, total: library.bindings.length }) : t('noSources')}</p></div></div>;
  return <section data-embedded={embedded} className={embedded ? 'group/knowledge flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'page-card group/knowledge flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden'}>
    {!embedded && toolbarTarget ? createPortal(actions, toolbarTarget) : null}
    {!embedded ? <PageHeading><div className="min-w-0"><p className="eyebrow">{t('eyebrow')}</p><h2 className="page-title font-heading">{t('pageTitle')}</h2><p className="mt-3 text-sm text-muted">{t('pageDescription')}</p></div>{connectionStatus}</PageHeading> : <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line p-3">{actions}{connectionStatus}</div>}
    {!root || status === 'library-unavailable' ? <button className="button button-quiet self-start" type="button" onClick={onSettings}>{t('settings')}</button> : null}
    {/* Geometry rationale: auto sizes the source rail/header; the zero-minimum remainder owns scrolling, and subgrids share the header row. */}
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-panel group-data-[embedded=true]/knowledge:rounded-none group-data-[embedded=true]/knowledge:border-0">
      <aside data-collapsed={sourcesCollapsed} className="group/sources row-span-2 grid w-60 min-w-0 grid-cols-1 grid-rows-subgrid border-r border-line bg-list/50 data-[collapsed=true]:w-16" aria-label={t('sources')}>
        <header className="relative flex min-h-16 items-center border-b border-line px-4 group-data-[collapsed=true]/sources:justify-center group-data-[collapsed=true]/sources:px-0"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary"><TooltipButton tooltip={t('sources')} aria-label={t('sources')} aria-expanded={!sourcesCollapsed} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setSourcesCollapsed(value => !value)}><ContentIcon name="book" /></TooltipButton><span className="truncate group-data-[collapsed=true]/sources:sr-only">{t('sources')}</span></h3>
        <button className="article-sidebar-collapse top-1/2 grid -translate-y-1/2" type="button" aria-label={t(sourcesCollapsed ? 'expandSources' : 'collapseSources')} data-tooltip={t(sourcesCollapsed ? 'expandSources' : 'collapseSources')} onClick={() => setSourcesCollapsed(value => !value)}><ContentIcon name={sourcesCollapsed ? 'expand' : 'collapse'} /></button></header>
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overflow-x-clip p-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent group-data-[collapsed=true]/sources:p-1 group-data-[collapsed=true]/sources:scrollbar-none">
          {library.bindings.map(item => <div key={item.sourceId} className="group/card relative min-w-0"><LibraryCard icon={<span data-reading={library.selectedId === item.sourceId && sourceWorking} className="data-[reading=true]:animate-pulse motion-reduce:animate-none"><ContentIcon name="book" /></span>} title={item.name} collapsed={sourcesCollapsed} aria-busy={library.selectedId === item.sourceId && sourceWorking} aria-pressed={library.selectedId === item.sourceId} disabled={library.busy === 'connecting'} onClick={() => void library.select(item.sourceId)}>
            <span className="truncate font-mono text-2xs text-faint">{item.directory || t('legacyPartition')}</span><span className="text-2xs text-muted">{library.indexed[item.sourceId] ? t('indexReady') : t('indexMissing')}</span>
            {library.selectedId === item.sourceId && sourceWorking ? <span className="grid gap-1"><progress className="block h-1 w-full appearance-none overflow-hidden rounded-full border-0 bg-accent/20 indeterminate:animate-pulse motion-reduce:animate-none [&::-webkit-progress-bar]:bg-accent/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent" aria-label={t('readingProgress', { done: library.progress?.scanned ?? 0, total: library.progress?.total || '…' })} max={Math.max(1, library.progress?.total ?? 0)} value={library.progress?.total ? library.progress.scanned : undefined} /><span className="text-2xs text-muted" role="status">{t('readingProgress', { done: library.progress?.scanned ?? 0, total: library.progress?.total || '…' })}</span></span> : null}
            {library.selectedId === item.sourceId && library.manifest ? <span className="text-2xs text-faint">{formatUIDate(library.manifest.scannedAt, locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }, t('unknownDate'))}</span> : null}
          </LibraryCard>{sourcesCollapsed && library.selectedId === item.sourceId && sourceWorking ? <progress className="absolute bottom-1 left-2 block h-1 w-10 appearance-none overflow-hidden rounded-full border-0 bg-accent/20 indeterminate:animate-pulse motion-reduce:animate-none [&::-webkit-progress-bar]:bg-accent/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent" aria-label={t('readingProgress', { done: library.progress?.scanned ?? 0, total: library.progress?.total || '…' })} max={Math.max(1, library.progress?.total ?? 0)} value={library.progress?.total ? library.progress.scanned : undefined} /> : null}{library.selectedId === item.sourceId && sourceWorking ? <IconButton className="absolute right-1 top-1 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100" tooltip={t('stopReading')} icon={<ContentIcon name="close" />} onClick={library.cancel} /> : null}</div>)}
          {!library.bindings.length ? <p className="break-words p-2 text-xs text-muted group-data-[collapsed=true]/sources:text-center"><span className="group-data-[collapsed=true]/sources:sr-only">{t(root ? 'unboundDescription' : 'libraryRequired')}</span><span className="hidden group-data-[collapsed=true]/sources:inline" aria-hidden="true">...</span></p> : null}
        </div>
      </aside>
      <section className="col-start-2 row-span-2 grid min-h-0 min-w-0 grid-cols-1 grid-rows-subgrid">
      <div className="flex min-h-16 flex-wrap items-center gap-2 border-b border-line p-2">
        <div className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-lg bg-list p-1" role="tablist" aria-label={t('view')}>
          {(['documents', 'graph', 'topics', 'relations', 'changes'] as const).map(value => <button key={value} className="flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-selected:bg-panel aria-selected:text-accent-text" id={`knowledge-tab-${embedded ? "reference" : "page"}-${value}`} aria-controls={`knowledge-content-${embedded ? "reference" : "page"}`} tabIndex={view === value ? 0 : -1} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')); const index = tabs.indexOf(event.currentTarget), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click(); }} type="button" role="tab" aria-selected={view === value} disabled={value !== 'documents' && (!ready || !library.manifest || (value === 'topics' || value === 'changes') && !research)} onClick={() => { setView(value); setFiltersOpen(false); }}><ContentIcon name={viewIcons[value]} />{t('tabs.' + value)}</button>)}
        </div>
        <div ref={setViewToolbarTarget} className="flex min-w-0 basis-80 grow flex-wrap items-center gap-2">{view === 'documents' ? <><label className="min-w-24 flex-1"><span className="sr-only">{t('search')}</span><input className="field w-full" type="search" value={library.query} maxLength={200} disabled={!ready || !library.manifest} placeholder={t('searchPlaceholder')} onChange={event => library.setQuery(event.target.value)} /></label>
          <span className={embedded ? 'sr-only' : 'shrink-0 text-xs text-faint'} role="status">{library.searching ? t('searching') : library.results ? t('matches', { count: library.results.total }) : t('documents', { count: items.length })}</span>
          <IconPopover label={t('filters')} kind="dialog" open={filtersOpen} disabled={!ready || !library.manifest} onToggle={() => setFiltersOpen(value => !value)} onClose={() => setFiltersOpen(false)} icon={<PanelIcon kind="nodes" />}><div className="grid gap-4 p-2">{(['phrase', 'exclude', 'title', 'path'] as const).map(key => <label key={key} className="grid min-w-0 gap-2 text-xs text-muted"><span className="flex items-center gap-2"><ContentIcon name={key === 'path' ? 'folder' : key === 'title' ? 'document' : key === 'exclude' ? 'minus' : 'quote'} />{t('filter.' + key)}</span><input className="field w-full" maxLength={200} value={library.filters[key]} onChange={event => library.setFilters(value => ({ ...value, [key]: event.target.value }))} /></label>)}</div></IconPopover>
          {library.document ? <IconButton className={embedded ? '' : 'lg:hidden'} tooltip={t(pane === 'reader' ? 'list' : 'reader')} icon={<ContentIcon name={pane === 'reader' ? 'collapse' : 'expand'} />} onClick={() => setPane(value => value === 'reader' ? 'list' : 'reader')} /> : null}
        </> : null}</div>{diagnostics}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" id={`knowledge-content-${embedded ? "reference" : "page"}`} role="tabpanel" aria-labelledby={`knowledge-tab-${embedded ? "reference" : "page"}-${view}`}>
      {view === 'changes' && research && source ? <KnowledgeChanges key={library.selectedId} toolbarTarget={viewToolbarTarget} data={research} source={source} onChange={researchSave} onOpen={open} /> : view === 'relations' && library.manifest && source ? <KnowledgeRelations toolbarTarget={viewToolbarTarget} manifest={library.manifest} source={source} selected={relationPath || library.manifest.documents[0]?.path || ''} onSelect={setRelationPath} onOpen={open} onGraph={() => setView('graph')} /> : view === 'topics' && research ? <KnowledgeTopics key={library.selectedId + ':' + topicId} source={source!} manifest={library.manifest} onDownload={library.download} toolbarTarget={viewToolbarTarget} data={research} selected={topicId} onSelect={setTopicId} onChange={researchSave} onOpen={open} articles={linkedArticles} busy={researchBusy || busy || !ready} /> : view === 'graph' && ready && library.manifest ? <KnowledgeGraph toolbarTarget={viewToolbarTarget} key={library.manifest.sourceId} manifest={library.manifest} selectedPath={relationPath || library.document?.path} onOpen={path => open(path)} /> : <>
      {/* Geometry rationale: list and reader share an auto-height header; the zero-minimum content row scrolls without sizing the whole workspace. */}
      <div className={embedded ? 'grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)]' : 'grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)]'}>
        <section data-active={pane === 'list'} data-collapsed={documentsCollapsed} className={embedded ? 'group/documents row-span-2 grid min-h-0 min-w-0 grid-cols-1 grid-rows-subgrid border-r border-line data-[active=false]:hidden data-[collapsed=true]:w-16' : 'group/documents row-span-2 grid min-h-0 min-w-0 grid-cols-1 grid-rows-subgrid border-r border-line data-[active=false]:hidden data-[collapsed=true]:w-16 lg:w-60 lg:data-[active=false]:grid'} aria-label={t('list')}>
          <header className="relative flex min-h-16 items-center border-b border-line px-4 group-data-[collapsed=true]/documents:justify-center group-data-[collapsed=true]/documents:px-0"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary"><TooltipButton tooltip={t('tabs.documents')} aria-label={t('tabs.documents')} aria-expanded={!documentsCollapsed} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setDocumentsCollapsed(value => !value)}><ContentIcon name="document" /></TooltipButton><span className="truncate group-data-[collapsed=true]/documents:sr-only">{t('tabs.documents')}</span></h3>
          <button className="article-sidebar-collapse top-1/2 grid -translate-y-1/2" type="button" aria-label={t(documentsCollapsed ? 'expandDocuments' : 'collapseDocuments')} data-tooltip={t(documentsCollapsed ? 'expandDocuments' : 'collapseDocuments')} onClick={() => setDocumentsCollapsed(value => !value)}><ContentIcon name={documentsCollapsed ? 'expand' : 'collapse'} /></button></header>
          <div className="flex min-h-0 flex-col">
          <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overflow-x-clip p-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent group-data-[collapsed=true]/documents:px-0 group-data-[collapsed=true]/documents:py-1 group-data-[collapsed=true]/documents:scrollbar-none">
            {items.length ? library.searchActive ? [...Map.groupBy(items, item => item.path)].map(([path, matches]) => documentsCollapsed ? <LibraryCard key={path} collapsed icon={<ContentIcon name="document" />} title={matches[0].title} aria-pressed={library.document?.path === path} onClick={() => open(path, matches[0].line)} /> : <details key={path} open className="mb-2 min-w-0 max-w-full rounded-lg border border-line">
              <summary className="flex min-w-0 cursor-pointer items-start gap-2 p-3 text-sm text-primary" title={matches[0].title + " · " + path}><ContentIcon name="document" /><span className="grid min-w-0 flex-1 gap-1"><span className="truncate">{matches[0].title}</span><span className="truncate font-mono text-2xs text-faint">{path}</span></span><span className="shrink-0 text-xs text-faint">{matches.length}</span></summary>
              {matches.map(item => <button key={item.path + ':' + item.line} type="button" className="grid w-full min-w-0 gap-1 border-t border-line p-3 text-left hover:bg-hover" disabled={!ready} onClick={() => open(item.path, item.line)}><span className="text-2xs text-faint">{t('location', { line: item.line })}</span><span className="line-clamp-3 whitespace-pre-wrap wrap-anywhere text-xs text-secondary">{item.snippet}</span></button>)}
            </details>) : items.slice((page - 1) * 100, page * 100).map(item => <LibraryCard key={item.path} icon={<ContentIcon name="document" />} title={item.title} collapsed={documentsCollapsed} aria-pressed={library.document?.path === item.path} disabled={!ready || busy} onClick={() => open(item.path)}><span className="truncate font-mono text-2xs text-faint">{item.path}</span>{item.status === 'unindexed' ? <span className="text-2xs text-warning">{t('unindexed')}</span> : null}</LibraryCard>) : <div className="p-4 text-sm text-muted group-data-[collapsed=true]/documents:px-0 group-data-[collapsed=true]/documents:text-center"><span className="group-data-[collapsed=true]/documents:sr-only">{!root ? t('libraryRequired') : !ready ? t('unboundDescription') : !library.manifest ? t('indexMissing') : library.searchActive ? library.results ? t('noMatches') : library.searching ? t('searching') : t('searchUnavailable') : t('indexEmpty')}</span><span className="hidden group-data-[collapsed=true]/documents:inline" aria-hidden="true">...</span></div>}

          </div>
          {!library.searchActive && pages > 1 ? <ButtonBar label={t('list')} className="justify-between border-t border-line p-2 group-data-[collapsed=true]/documents:flex-col"><IconButton tooltip={t('previous')} icon={<ContentIcon name="collapse" />} disabled={page <= 1} onClick={() => setPage(value => value - 1)} /><span className="whitespace-nowrap text-2xs text-faint">{t('page', { page, pages })}</span><IconButton tooltip={t('next')} icon={<ContentIcon name="expand" />} disabled={page >= pages} onClick={() => setPage(value => value + 1)} /></ButtonBar> : null}
          </div>
        </section>
        <section data-active={pane === 'reader'} className={embedded ? "row-span-2 grid min-h-0 min-w-0 grid-cols-1 grid-rows-subgrid data-[active=false]:hidden" : "row-span-2 grid min-h-0 min-w-0 grid-cols-1 grid-rows-subgrid data-[active=false]:hidden lg:data-[active=false]:grid"} aria-label={t('reader')}>
          {library.document && library.connection?.source ? <>
            <header className="flex min-h-16 flex-wrap items-center gap-2 border-b border-line px-3 py-2.5"><IconButton tooltip={t('back')} disabled={!historyCount || library.reading} onClick={back} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h15" /></svg>} /><div className="min-w-0 flex-1"><h2 className="truncate font-sub-heading text-sm font-semibold text-primary">{library.document.title}</h2><p className="mt-1 truncate font-mono text-2xs text-faint" title={library.document.path}>{library.document.path}{' · ' + t('location', { line: library.document.line })}</p></div><ButtonBar label={t('reader')} className="ml-auto flex-wrap gap-2">
              <div role="group" aria-label={t('reader')} className="flex items-center gap-1"><IconButton tooltip={t('showLineNumbers')} aria-pressed={showLineNumbers} icon={<ContentIcon name="lines" />} onClick={() => setShowLineNumbers(value => !value)} />
              {onImport && library.connection.binding ? <IconButton tooltip={t('messages:imports.fromKnowledgeButton')} icon={<ContentIcon name="apply" />} disabled={!ready || busy || library.document.truncated} onClick={() => onImport(library.document!.path, library.connection!.binding!.sourceId)} /> : null}
              <IconButton tooltip={t('download')} icon={<ContentIcon name="download" />} disabled={busy} onClick={() => void library.download(library.document!.path)} /></div>
              {research ? <><span role="separator" aria-orientation="vertical" className="h-6 border-l border-line" /><div role="group" aria-label={t('collectToTopic')} className="flex min-w-0 items-center gap-1"><IconButton tooltip={t('collectPassage')} icon={<ContentIcon name="quote" />} disabled={!topicId || !validSelection || !ready || busy || researchBusy || library.document.truncated} onPointerDown={event => event.preventDefault()} onClick={() => collect(false)} /><IconButton tooltip={t('collectDocument')} icon={<ContentIcon name="document" />} disabled={!topicId || !ready || busy || researchBusy || library.document.truncated} onClick={() => collect(true)} /><SelectField label={t('topicChoose')} className="w-36" value={topicId} disabled={researchBusy || !ready || busy} onChange={setTopicId} options={[{ value: '', label: t('topicChoose') }, ...research.topics.map(item => ({ value: item.id, label: item.name }))]} /></div></> : null}
              {onAdopt ? <div className="flex items-center gap-1"><IconButton tooltip={t('adoptExcerpt')} icon={<ContentIcon name="copy" />} disabled={!validSelection || library.document.truncated || busy} onPointerDown={event => event.preventDefault()} onClick={() => adopt(true)} /><IconButton tooltip={t('addCitation')} icon={<ContentIcon name="link" />} disabled={library.document.truncated || busy} onClick={() => adopt(false)} /></div> : null}
              <span role="separator" aria-orientation="vertical" className="h-6 border-l border-line" /><ModeSwitch checked={mode === 'source'} onToggle={() => setMode(value => value === 'source' ? 'preview' : 'source')} label={t('readerMode')} start={t('preview')} end={t('sourceView')} disabled={library.document.text.length > 128 * 1024} reason={library.document.text.length > 128 * 1024 ? t('previewLong') : undefined} />
            </ButtonBar></header>
            <div className="flex min-h-0 flex-col">
            <div onMouseUp={rememberSelection} onKeyUp={rememberSelection} className="flex min-h-0 flex-1 flex-col">{mode === 'source' ? <KnowledgeSource text={library.document.text} textareaRef={textRef} showLineNumbers={showLineNumbers} onSelection={rememberSelection} /> : <KnowledgeReader source={library.connection.source} path={library.document.path} text={library.document.text} manifest={library.manifest} onOpen={open} onDownload={library.download} line={library.document.line} fragment={library.document.fragment} scrollRef={readerRef} showLineNumbers={showLineNumbers} />}</div>
            </div>
          </> : <div className="row-span-2 grid min-h-0 place-items-center p-6 text-center text-sm text-muted" role="status">{library.reading ? t('reading') : t('selectDocument')}</div>}
        </section>
      </div>
      </>}
      </div>
    </section></div>
    {(editOpen || deleteConfirm) && typeof document !== 'undefined' ? createPortal(<DialogFrame role={deleteConfirm ? 'alertdialog' : 'dialog'} titleId="knowledge-edit-source-title" onClose={() => { setEditOpen(false); setDeleteConfirm(false); }}><DialogHeader titleId="knowledge-edit-source-title" eyebrow={t('eyebrow')} title={t(deleteConfirm ? 'removeSource' : 'editSource')} onClose={() => { setEditOpen(false); setDeleteConfirm(false); }} />
      {deleteConfirm ? <p className="p-4 text-sm text-secondary">{t('removeSourceDescription')}</p> : <div className="grid gap-4 p-4"><p className="text-sm text-muted">{t('sourceEditDescription')}</p><label className="grid gap-2 text-sm"><span>{t('sourceName')}</span><input className="field w-full" maxLength={255} value={sourceForm.name} onChange={event => setSourceForm(value => ({ ...value, name: event.target.value }))} /></label><label className="grid gap-2 text-sm"><span>{t('partitionName')}</span><input className="field w-full" maxLength={48} value={sourceForm.directory} onChange={event => setSourceForm(value => ({ ...value, directory: event.target.value }))} /><span className="text-xs text-muted">{t('partitionDescription')}</span></label><div className="flex flex-wrap gap-2 border-t border-line pt-4"><button className="button button-quiet" type="button" disabled={busy} onClick={() => { setEditOpen(false); void library.connect('relocate'); }}><ContentIcon name="reset" />{t('relocate')}</button><button className="button button-quiet" type="button" disabled={busy} onClick={() => { setEditOpen(false); setReplaceConfirm(true); }}><ContentIcon name="copy" />{t('replace')}</button>{status === 'needs-permission' ? <button className="button button-quiet" type="button" onClick={() => { setEditOpen(false); void library.authorize(); }}>{t('authorize')}</button> : null}<button className="button button-danger" type="button" disabled={busy} onClick={() => { setEditOpen(false); setDeleteConfirm(true); }}><ContentIcon name="delete" />{t('removeSource')}</button></div></div>}
      <DialogFooter><DialogActions><DialogButton onClick={() => { setEditOpen(false); setDeleteConfirm(false); }}>{t('cancelEdit')}</DialogButton><DialogButton variant={deleteConfirm ? 'danger' : 'primary'} disabled={busy || !deleteConfirm && (!sourceForm.name.trim() || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(sourceForm.directory) || sourceForm.name === selectedSource?.name && sourceForm.directory === selectedSource?.directory)} onClick={() => void library.edit(deleteConfirm ? null : sourceForm).then(ok => { if (ok) { setEditOpen(false); setDeleteConfirm(false); } })}>{t(deleteConfirm ? 'removeSource' : 'saveSource')}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>, document.body) : null}
    {(rebuildConfirm || replaceConfirm) && typeof document !== 'undefined' ? createPortal(<>
    {rebuildConfirm ? <DialogFrame role="alertdialog" titleId="knowledge-rebuild-title" descriptionId="knowledge-rebuild-description" onClose={() => setRebuildConfirm(false)}><DialogHeader titleId="knowledge-rebuild-title" eyebrow={t('eyebrow')} title={t('forceTitle')} onClose={() => setRebuildConfirm(false)} /><p id="knowledge-rebuild-description" className="p-4 text-sm text-secondary">{t('forceDescription')}</p><DialogFooter><DialogActions><DialogButton onClick={() => setRebuildConfirm(false)}>{t('cancelEdit')}</DialogButton><DialogButton variant="primary" onClick={() => { setRebuildConfirm(false); void library.scan(true); }}>{t('confirmRebuild')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}
    {replaceConfirm ? <DialogFrame role="alertdialog" titleId="knowledge-replace-title" descriptionId="knowledge-replace-description" onClose={() => setReplaceConfirm(false)}><DialogHeader titleId="knowledge-replace-title" eyebrow={t('eyebrow')} title={t('replace')} onClose={() => setReplaceConfirm(false)} /><p id="knowledge-replace-description" className="p-4 text-sm text-secondary">{t('replaceDescription')}</p><DialogFooter><DialogActions><DialogButton onClick={() => setReplaceConfirm(false)}>{t('cancelEdit')}</DialogButton><DialogButton variant="primary" onClick={() => { setReplaceConfirm(false); void library.connect('replace'); }}>{t('replace')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}
    </>, document.body) : null}
  </section>;
}
