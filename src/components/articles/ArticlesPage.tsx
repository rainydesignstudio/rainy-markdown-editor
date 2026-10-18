'use client';

import { useEditingDrafts, UnsavedMark } from '../global/EditingDrafts';
import { hasEditingDraft } from '../../lib/editingDrafts';

import { formatDiagnosticMessage, formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';
import { formatUIDate, formatUIMonth, formatUINumber } from '../../lib/i18n/formatters';
import type { UILocale } from '../../lib/i18n/preferences';

import { PageHeading } from '../global/PageHeading';
import { IconButton } from '../global/IconButton';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { createPortal } from 'react-dom';
import { summarizeArticleListChecks, type ArticleListCheck } from '../../lib/articleListChecks';

import { ButtonBar } from '../global/ButtonBar';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ArticleCollection, Tone } from '../../hooks/useEditorController';
import { getArticleOrganization, type EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleSummary, ArticleIndexIssue, ThemeConfig } from '../../lib/types';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';
import { ThemeUpdateTag } from '../themes/ThemeUpdateTag';
import { ArticleActionsMenu } from './ArticleActionsMenu';
import { articleCollectionLabel } from '../../lib/i18n/articleLabels';

function formatDate(value: string, locale: UILocale, invalid: string): string {
  return formatUIDate(value, locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }, invalid);
}

type Props = {
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  themes: ThemeConfig[];
  currentId: string;
  directory: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  rememberedDirectoryName: string | null;
  directoryRestoreState: 'checking' | 'idle' | 'permission-needed';
  collection: ArticleCollection;
  collectionTitle: string;
  workspace: EditorWorkspace;
  busy: boolean;
  indexMonths: string[];
  indexIssues: ArticleIndexIssue[];
  checks: Record<string, ArticleListCheck>;
  listNotice: { label: string; tone: Tone };
  listWork: { kind: 'check' | 'index' | 'tags'; completed: number; total: number } | null;
  onCheck: (targets: ArticleSummary[]) => Promise<void>;
  onCancelCheck: (clearNotice?: boolean) => void;
  onRebuildIndexes: (months: string[]) => Promise<void>;
  onRemoveCategories: (targets: ArticleSummary[], labels: string[]) => Promise<boolean>;
  onNew: () => void;
  onImportMarkdown?: () => void;
  onImportTasks?: () => void;
  onRefresh: () => void;
  onOpen: (stored: ArticleSummary) => void;
  onInfo: (stored: ArticleSummary) => void;
  onArchive: (stored: ArticleSummary, archived: boolean) => void;
  onArchiveMany: (stored: ArticleSummary[], archived: boolean) => void;
  onClassifyMany: (stored: ArticleSummary[], projectId: string | null) => Promise<boolean>;
  onFork: (stored: ArticleSummary) => void;
  onDelete: (stored: ArticleSummary) => void;
  onDeleteMany: (stored: ArticleSummary[]) => void;
  onGoToSettings: () => void;
  onReopenRememberedDirectory: () => void;
};

export function ArticlesPage({
  articles,
  allArticles,
  themes,
  currentId,
  directory,
  directoryName,
  rememberedDirectoryName,
  directoryRestoreState,
  collection,
  collectionTitle,
  workspace,
  busy,
  indexMonths, indexIssues, checks, listNotice, listWork, onCheck, onCancelCheck, onRebuildIndexes, onRemoveCategories,
  onNew,
  onImportMarkdown,
  onImportTasks,
  onRefresh,
  onOpen,
  onInfo,
  onArchive,
  onArchiveMany,
  onClassifyMany,
  onFork,
  onDelete,
  onDeleteMany,
  onGoToSettings,
  onReopenRememberedDirectory,
}: Props) {
  const { t } = useUITranslation('articles');
  const { locale } = useUILocale();
  const displayCollectionTitle = articleCollectionLabel(collection, collectionTitle, t);
  const drafts = useEditingDrafts();
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [categoryTargets, setCategoryTargets] = useState<string[]>([]);
  const [categoryDecision, setCategoryDecision] = useState<{ rows: ArticleSummary[]; labels: string[]; scope: string } | null>(null);
  const [indexDecision, setIndexDecision] = useState<string[] | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const months = useMemo(() => Array.from(new Set(indexMonths)).sort().reverse(), [indexMonths]);
  const categories = useMemo(
    () => Array.from(new Set(articles.flatMap((item) => item.parse.metadata.categories).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [articles],
  );
  useEffect(() => { setSelectedCategories(current => { const next = current.filter(label => categories.includes(label)); return next.length === current.length ? current : next; }); }, [categories]);
  const projectsInOrder = useMemo(
    () => workspace.projectOrder.flatMap((id) => workspace.projects.filter((project) => project.id === id)),
    [workspace.projectOrder, workspace.projects],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return articles.filter((item) => {
      const titleMatches = !needle || item.parse.metadata.title.toLocaleLowerCase('zh-CN').includes(needle);
      const monthMatches = month === 'all' || item.month === month;
      const categoryMatches = selectedCategories.length === 0 || selectedCategories.some((category) => item.parse.metadata.categories.includes(category));
      return titleMatches && monthMatches && categoryMatches;
    });
  }, [articles, month, query, selectedCategories]);

  useEffect(() => { setSelectedCategories([]); setSelectedIds([]); setSelecting(false); setProjectMenuOpen(false); setManagingCategories(false); }, [collection, directory]);

  useEffect(() => {
    setSelectedIds([]);
    setProjectMenuOpen(false);
  }, [collection, query, month, selectedCategories]);

  useEffect(() => {
    const availableIds = new Set(articles.map((item) => item.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [articles]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) setProjectMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setProjectMenuOpen(false);
      projectMenuButtonRef.current?.focus();
      event.preventDefault();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuOpen]);

  const scope = JSON.stringify([collection, query, month, selectedCategories]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const totals = summarizeArticleListChecks(filtered, checks);
  const listBusy = busy || listWork !== null;
  const affected = filtered.filter(item => item.parse.metadata.categories.some(label => categoryTargets.includes(label)));
  useEffect(() => { onCancelCheck(true); setCategoryTargets([]); setCategoryDecision(null); return () => onCancelCheck(true); }, [scope, directory, onCancelCheck]);

  const toggleCategory = (category: string) => {
    if (managingCategories) { setCategoryTargets(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category]); return; }
    setSelectedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  };
  const hasActiveFilters = Boolean(query.trim() || month !== 'all' || selectedCategories.length);
  const selectionActive = selecting;
  const selectedArticles = filtered.filter((item) => selectedIds.includes(item.id));
  const allFilteredSelected = Boolean(filtered.length) && filtered.every((item) => selectedIds.includes(item.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const leaveSelection = () => { setSelecting(false); setSelectedIds([]); setProjectMenuOpen(false); };
  const toggleSelection = () => { setManagingCategories(false); setCategoryTargets([]); selecting ? leaveSelection() : setSelecting(true); };

  useEffect(() => {
    if (!selectedArticles.length || busy) setProjectMenuOpen(false);
  }, [selectedArticles.length, busy]);

  if (!directory) {
    return (
      <section className="page-card justify-center" aria-labelledby="articles-empty-title">
        <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 rounded-lg border border-line bg-panel p-6 md:p-10">
          <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true"><svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.75h8l4 4V20H6z" /><path d="M14 4v4h4M9 12h6M9 15.5h4" /></svg></span>
          <p id="articles-empty-kicker" className="eyebrow">{t('articles:eyebrow.library')}</p>
          <h2 id="articles-empty-title" className="page-title font-heading">{directoryRestoreState === 'checking' ? t('articles:directory.restoring') : rememberedDirectoryName ? t('articles:directory.reauthorize') : t('articles:directory.choose')}</h2>
          <p className="m-0 max-w-lg text-sm text-muted mt-3">{directoryRestoreState === 'checking' ? t('articles:directory.checking') : rememberedDirectoryName ? t('articles:directory.remembered', { name: rememberedDirectoryName }) : t('articles:directory.description')}</p>
          {directoryRestoreState === 'checking' ? null : rememberedDirectoryName ? <div className="mt-2 flex flex-wrap gap-2"><button className="button button-primary" type="button" onClick={onReopenRememberedDirectory}>{t('articles:directory.authorize')}</button><button className="button button-quiet" type="button" onClick={onGoToSettings}>{t('articles:directory.other')}</button></div> : <button className="button button-primary mt-2" type="button" onClick={onGoToSettings}>{t('articles:directory.settings')}</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="page-card" aria-labelledby="archive-title">
        <PageHeading className="border-b border-line pb-5">
          <div className="min-w-0">
            <p id="archive-kicker" className="eyebrow">{directoryName ?? t('articles:directory.local')} / {displayCollectionTitle}</p>
            <h2 id="archive-title" className="page-title font-heading">{collection === 'archived' ? t('articles:archiveTitle') : collection === 'all' ? t('articles:indexTitle') : collection === 'unclassified' ? t('articles:unclassifiedTitle') : t('articles:projectTitle')}</h2>
            <p className="max-w-160 text-sm text-muted mt-3">{collection === 'archived' ? t('articles:archiveDescription') : t('articles:indexDescription')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-baseline gap-2 border-r border-line pr-4" aria-label={t('articles:counts.showing', { shown: filtered.length, total: articles.length })}>
              <strong className="font-mono text-3xl font-medium tracking-tight text-accent-text">{formatUINumber(filtered.length, locale, { minimumIntegerDigits: 2, useGrouping: false })}</strong>
              <span className="text-xs text-muted">{t('articles:documentUnit', { count: filtered.length })}</span>
            </div>
            {collection !== 'archived' ? <ButtonBar label={t('articles:actions.label')}>{onImportTasks ? <button className="button button-quiet" type="button" onClick={onImportTasks}>{t('messages:imports.tasksTitle')}</button> : null}{onImportMarkdown ? <button className="button button-quiet" type="button" disabled={listBusy} onClick={onImportMarkdown}>{t('messages:imports.title')}</button> : null}<button className="button button-primary" type="button" onClick={onNew}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M4 12h16" /></svg>{t('articles:newArticle')}</button></ButtonBar> : null}
          </div>
        </PageHeading>

        <section className="min-w-0 rounded-lg border border-line bg-panel" aria-label={t('articles:list.filters')}>
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-end md:p-5">
            <label className="block min-w-0 flex-1">
              <span className="field-label mb-1.5 block">{t('articles:filter.title')}</span>
              <span className="relative block">
                <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                <input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('articles:filter.placeholder')} />
              </span>
            </label>
            <label className="block md:w-44 md:shrink-0">
              <span className="field-label mb-1.5 block">{t('articles:filter.month')}</span>
              <select className="field" value={month} onChange={(event) => setMonth(event.target.value)}>
                <option value="all">{t('articles:filter.allMonths')}</option>
                {months.map((value) => <option key={value} value={value}>{formatUIMonth(value, locale)}</option>)}
              </select>
            </label>
          </div>

          {indexIssues.length ? <div className="grid gap-2 border-b border-warning-line bg-warning-surface p-4" role="status"><p className="text-xs text-warning-strong">{t('articles:index.warning')}</p>{indexIssues.map(issue => <p key={`${issue.month}-${issue.message}`} className="break-words text-xs text-muted">{issue.month}：{formatDiagnosticMessage(issue, t)}</p>)}<button className="button button-quiet self-start" type="button" disabled={listBusy} onClick={() => setIndexDecision([...new Set(indexIssues.map(item => item.month))])}>{t('articles:index.rebuild')}</button></div> : null}
          {listNotice.label ? <p className="status-copy border-b border-line px-4 py-3 md:px-5" data-tone={listNotice.tone} role="status">{formatProductMessage(listNotice, t)}</p> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-5">
            <IconButton tooltip={collection === 'archived' ? t('articles:categories.readOnly') : managingCategories ? t('articles:categories.exit') : t('articles:categories.select')} disabled={collection === 'archived' || listBusy || !categories.length} aria-pressed={managingCategories} onClick={() => { leaveSelection(); setManagingCategories(value => !value); setCategoryTargets([]); }} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1" /><path d="m5 7 2 2 3-4M15 5h6M15 10h6M3 17h8M15 17h6" /></svg>} />
            <span className="mr-1 text-xs font-medium text-muted">{t('articles:categories.title')}</span>
            {categories.length ? categories.map((category) => {
              const pressed = managingCategories ? categoryTargets.includes(category) : selectedCategories.includes(category);
              return <button key={category} type="button" className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted transition hover:border-accent-line hover:text-secondary aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:font-medium aria-pressed:text-accent-text focus-visible:outline-2 focus-visible:outline-accent" aria-pressed={pressed} disabled={listBusy} onClick={() => toggleCategory(category)}>{category}</button>;
            }) : <span className="text-xs text-faint">{t('articles:categories.empty')}</span>}
            {managingCategories ? <><span className="text-xs text-faint">{t('articles:categories.selected', { count: categoryTargets.length })}</span><button className="button button-danger min-h-8 px-2 py-1 text-xs" type="button" disabled={!affected.length || listBusy} onClick={() => setCategoryDecision({ rows: [...affected], labels: [...categoryTargets], scope })}>{t('articles:categories.remove')}</button><button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={listBusy} onClick={() => { setManagingCategories(false); setCategoryTargets([]); }}>{t('common:actions.cancel')}</button></> : null}
            {hasActiveFilters ? <button className="ml-auto rounded-md border-0 bg-transparent px-2 py-1 text-xs text-muted underline underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => { setQuery(''); setMonth('all'); setSelectedCategories([]); }}>{t('articles:filter.clear')}</button> : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-list pl-3 pr-4 py-3 md:pr-5">
            <div className="flex flex-wrap items-center gap-2">
              <button className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-panel text-muted transition-colors hover:border-accent-line hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text" type="button" aria-label={selectionActive ? t('articles:selection.exit') : t('articles:selection.enter')} aria-pressed={selectionActive} data-tooltip={selectionActive ? t('articles:selection.exitShort') : t('articles:selection.label')} onClick={toggleSelection}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1" /><path d="m5.5 7 1.5 1.5L10 5.5M15 5h6M15 10h6M3 17h8M15 17h6" /></svg></button>
              <div className="flex items-baseline gap-2">
                <h3 className="font-sub-heading text-sm font-semibold text-primary">{t('articles:list.title')}</h3>
                <span className="text-xs text-faint">{selectionActive ? t('articles:selection.count', { selected: selectedArticles.length, total: filtered.length }) : t('articles:list.count', { shown: filtered.length, total: articles.length })}</span>
              </div>
              {selectionActive && filtered.length ? <button className="rounded-md border-0 bg-transparent px-1 text-xs text-muted underline underline-offset-2 transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => setSelectedIds(allFilteredSelected ? [] : filtered.map((item) => item.id))}>{allFilteredSelected ? t('articles:selection.clear') : t('articles:selection.all')}</button> : null}
            </div>
            {selectionActive ? <ButtonBar label={collection === 'archived' ? t('articles:selection.archiveActions') : t('articles:selection.actions')}>
              {collection === 'archived' ? <>
                <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onArchiveMany(selectedArticles, false)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v6h16v-6M12 16V4m0 0-4 4m4-4 4 4" /></svg>{t('articles:unarchive')}</button>
                <button className="button button-danger min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onDeleteMany(selectedArticles)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>{t('common:actions.delete')}</button>
              </> : <>
                <div ref={projectMenuRef} className="relative">
                  <button ref={projectMenuButtonRef} className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" aria-expanded={projectMenuOpen} aria-controls="bulk-project-menu" disabled={!selectedArticles.length || busy} onClick={() => setProjectMenuOpen((open) => !open)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3" /></svg>{t('articles:selection.group')}</button>
                  {projectMenuOpen ? <div id="bulk-project-menu" className="absolute top-full left-0 z-20 mt-2 grid w-56 max-h-56 gap-0.5 overflow-x-clip overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-panel scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" role="group" aria-label={t('articles:selection.targetProject')}>
                    {[{ id: null, name: t('articles:collections.unclassified') }, ...projectsInOrder].map((project) => <button key={project.id ?? 'unclassified'} className="w-full break-words rounded-sm px-3 py-2 text-left text-xs text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => { setProjectMenuOpen(false); void onClassifyMany(selectedArticles, project.id); }}>{project.name}</button>)}
                  </div> : null}
                </div>
                <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!selectedArticles.length || busy} onClick={() => onArchiveMany(selectedArticles, true)}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></svg>{t('articles:collections.archived')}</button>
              </>}
            </ButtonBar> : null}
            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
              <span className="status-copy" data-tone={totals.error || totals.failed ? 'error' : totals.warning || totals.stale ? 'warning' : 'neutral'} role="status">{filtered.length ? t('articles:checks.summary', totals) + (totals.stale ? t('articles:checks.staleSummary', { count: totals.stale }) : '') + (totals.failed ? t('articles:checks.failedSummary', { count: totals.failed }) : '') : t('articles:checks.empty')}</span>
              {listWork?.kind === 'check' ? <><span className="text-xs text-muted">{t('articles:checks.progress', listWork)}</span><button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" onClick={() => onCancelCheck()}>{t('articles:checks.cancel')}</button></> : <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={!filtered.length || listBusy} onClick={() => void onCheck([...filtered])}>{t('articles:checks.run')}</button>}
              <IconButton tooltip={t('articles:index.rebuildCurrent')} disabled={listBusy || !indexMonths.length} onClick={() => setIndexDecision(month === 'all' ? [...indexMonths] : [month])} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l5 5v2M13 3v5h5M7 11h4M7 15h2" /><path d="M21 13v4h-4M21 17a4 4 0 1 1-1.17-2.83" /></svg>} />
              <button className="button button-quiet min-h-8 px-2 py-1 text-xs" type="button" disabled={listBusy} onClick={onRefresh}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>{t('common:actions.refresh')}</button>
            </div>
          </div>

          {filtered.length ? (
            <section aria-label={t('articles:list.scopeLabel', { name: displayCollectionTitle })}>
              {filtered.map((item, index) => {
                const hasErrors = item.parse.diagnostics.some((diagnostic) => diagnostic.level === 'error');
                const organization = getArticleOrganization(workspace, item.id);
                const projectName = organization.projectId ? workspace.projects.find((project) => project.id === organization.projectId)?.name : null;
                const title = item.parse.metadata.title || t('articles:untitled');
                const current = item.id === currentId;
                const selected = selectionActive && selectedIds.includes(item.id);
                const themeUpdate = availableArticleThemeUpdate(item.theme, themes);
                const content = <>
                  <span className="flex min-w-0 flex-wrap items-center gap-2"><strong className="min-w-0 truncate font-sub-heading text-sm font-semibold text-primary group-hover:text-accent-text">{title}</strong>{hasErrors ? <span className="rounded-md border border-warning-line bg-warning-surface px-1.5 py-0.5 text-xs text-warning-strong">{t('articles:list.needsAttention')}</span> : null}</span>
                  <span className="mt-1 block truncate text-xs text-muted">{item.parse.metadata.description || (item.indexState === 'repair-needed' ? t('articles:list.summaryMissing') : t('articles:list.noSummary'))}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                    <span className="font-medium text-muted">{projectName ?? t('articles:collections.unclassified')}</span><span aria-hidden="true">·</span>
                    <span>{item.parse.metadata.categories.length ? item.parse.metadata.categories.join('、') : t('articles:list.noCategories')}</span><span aria-hidden="true">·</span>
                    <span aria-label={t('articles:theme.version', { name: item.theme.name, version: item.theme.version })}>v{item.theme.version}</span>
                    {themeUpdate ? <ThemeUpdateTag /> : null}
                    {hasEditingDraft(drafts, directory, 'articles', item.id) ? <UnsavedMark tag /> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.parse.metadata.updatedAt}>{formatDate(item.parse.metadata.updatedAt, locale, t('articles:dateNeedsRepair'))}</time>
                    {checks[item.id] ? <span className="status-copy" data-tone={checks[item.id].state === 'failed' || checks[item.id].error ? 'error' : checks[item.id].state === 'stale' || checks[item.id].warning ? 'warning' : 'neutral'} title={checks[item.id].message ? formatDiagnosticMessage(checks[item.id], t) : t('articles:checks.time', { date: formatDate(checks[item.id].checkedAt, locale, t('articles:dateNeedsRepair')) })}>{checks[item.id].state === 'failed' ? t('articles:checks.failure', { message: checks[item.id].message ? formatDiagnosticMessage(checks[item.id], t) : t('articles:checks.retry') }) : checks[item.id].state === 'stale' ? t('articles:checks.stale') : t('articles:checks.previous', { warning: checks[item.id].warning, error: checks[item.id].error })}</span> : null}
                  </span>
                </>;
                const selectOnKey = (event: KeyboardEvent<HTMLElement>) => {
                  if (event.key !== ' ' && event.key !== 'Enter') return;
                  event.preventDefault();
                  toggleSelected(item.id);
                };
                return (
                  <article key={item.id} className="group relative flex min-w-0 items-start gap-3 border-b border-line px-4 py-4 last:border-b-0 hover:bg-hover data-[current=true]:bg-accent-soft data-[selected=true]:bg-accent-soft data-[selected=true]:hover:bg-accent-soft data-[selecting=true]:cursor-pointer data-[selection-opacity=muted]:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:items-center md:px-5" data-current={current && !selectionActive} data-selected={selected} data-selecting={selectionActive} data-selection-opacity={selectionActive && !selected ? 'muted' : 'full'} role={selectionActive ? 'checkbox' : undefined} aria-checked={selectionActive ? selected : undefined} aria-label={selectionActive ? t('articles:selection.itemLabel', { title: title }) : undefined} tabIndex={selectionActive ? 0 : undefined} onClick={selectionActive ? () => toggleSelected(item.id) : undefined} onKeyDown={selectionActive ? selectOnKey : undefined}>
                    {current && !selectionActive ? <span className="absolute inset-y-3 left-0 w-0.75 rounded-full bg-accent" aria-hidden="true" /> : null}
                    <span className="grid w-6 shrink-0 place-items-start pt-0.5 md:pt-0"><span className="font-mono text-xs text-faint" aria-hidden="true">{formatUINumber(index + 1, locale, { minimumIntegerDigits: 2, useGrouping: false })}</span></span>
                    {selectionActive ? <span className="min-w-0 flex-1 text-left">{content}</span> : <button className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent" type="button" onClick={() => onOpen(item)}>{content}</button>}
                    {selectionActive ? <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line-strong bg-panel text-faint data-[checked=true]:border-accent data-[checked=true]:bg-accent data-[checked=true]:text-on-accent" data-checked={selected} aria-hidden="true"><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" />{selected ? <path d="m7 12 3.5 3.5L17 9" /> : null}</svg></span> : <ArticleActionsMenu article={item} archived={collection === 'archived' || organization.archived} disabled={busy} onInfo={onInfo} onArchive={onArchive} onFork={onFork} onDelete={onDelete} />}
                  </article>
                );
              })}
            </section>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center" aria-live="polite">
              <strong className="font-sub-heading text-sm font-semibold text-primary">{indexIssues.length && !articles.length ? t('articles:list.fixIndex') : articles.length ? t('articles:list.noMatches') : collection === 'archived' ? t('articles:list.archiveEmpty') : t('articles:list.empty')}</strong>
              <p className="m-0 max-w-112 text-sm text-muted mt-3">{indexIssues.length && !articles.length ? t('articles:list.fixIndexHelp') : articles.length ? t('articles:list.noMatchesHelp') : collection === 'archived' ? t('articles:list.archiveEmptyHelp') : t('articles:list.emptyHelp')}</p>
              {!indexIssues.length && !articles.length && collection !== 'archived' ? <button className="button button-quiet" type="button" onClick={onNew}>{t('articles:newArticle')}</button> : null}
            </div>
          )}
        </section>
        {categoryDecision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="remove-categories-title" role="alertdialog" onClose={() => setCategoryDecision(null)}><DialogHeader titleId="remove-categories-title" eyebrow={t('articles:categories.eyebrow')} title={t('articles:categories.removeTitle')} onClose={() => setCategoryDecision(null)} /><div className="grid gap-4 p-4"><p className="text-sm text-primary">{t('articles:categories.labels', { labels: categoryDecision.labels.join('、') })}</p><p className="text-sm text-muted">{t('articles:categories.scope', { name: displayCollectionTitle, count: categoryDecision.rows.length })}{query.trim() ? t('articles:categories.query', { query: query.trim() }) : ''}{month !== 'all' ? t('articles:categories.month', { month: formatUIMonth(month, locale) }) : ''}</p><p className="text-xs text-warning-strong">{t('articles:categories.removeHelp')}</p><DialogActions><DialogButton autoFocus onClick={() => setCategoryDecision(null)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" onClick={() => { const decision = categoryDecision; setCategoryDecision(null); void onRemoveCategories(decision.rows, decision.labels).then(done => { if (done && scopeRef.current === decision.scope) setCategoryTargets([]); }); }}>{t('articles:categories.confirm')}</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
        {indexDecision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="rebuild-index-title" onClose={() => setIndexDecision(null)}><DialogHeader titleId="rebuild-index-title" eyebrow={t('articles:index.eyebrow')} title={t('articles:index.rebuild')} onClose={() => setIndexDecision(null)} /><div className="grid gap-4 p-4"><p className="text-sm text-primary">{t('articles:index.targets', { months: indexDecision.map(value => formatUIMonth(value, locale)).join(locale === 'en-US' ? ', ' : '、') })}</p><p className="text-xs text-muted">{t('articles:index.description')}</p><DialogActions><DialogButton autoFocus onClick={() => setIndexDecision(null)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" onClick={() => { const months = indexDecision; setIndexDecision(null); void onRebuildIndexes(months); }}>{t('articles:index.start')}</DialogButton></DialogActions></div></DialogFrame>, document.body) : null}
    </section>
  );
}
