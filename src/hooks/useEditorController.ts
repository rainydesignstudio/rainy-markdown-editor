'use client';

import { productJoin, productDiagnosticReference, productErrorLabel, productErrorMessage, ProductError, productCause, productLabel, productMessage, productReference, productText } from "../lib/i18n/productMessages";
import { prepareRenderRecord, persistRenderRecord, restoreRenderEnvironment, renderRecordMatches, type RenderRecord } from '../lib/article-format/renderRecords';
import type { FormatSnapshot } from '../lib/article-format/runtime';

import { useFormatSnapshot } from './useFormatSnapshot';
import { activateLibraryFormat, initializeLibraryFormat } from '../lib/article-format/library';
import { getFormatSnapshot, invalidateFormatBundle } from '../lib/article-format/runtime';

import { articleFormatPreviewStructure } from '../lib/articleFormat';
import { articleListCheckResult, articleSummarySignature, type ArticleListCheck } from '../lib/articleListChecks';
import { removeArticleCategories } from '../lib/articleCategoryMutation';

import { countCurrentMediaReferences, scanWorkspaceMediaReferences, inspectMediaUsage, readMediaMetadata, removeMediaDescription, mediaDirectory, renameSharedMedia, saveMediaDescription, transferMedia, type MediaMutation } from '../lib/mediaManagement';
import { insertUndoableText } from '../lib/nativeTextareaEdit';

import { copyDefaultThemes, initializeThemeDefaults } from '../lib/themeDefaults';
import { initializeLocalFonts, loadLocalFonts } from '../lib/localFonts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useRouteNavigation } from './useRouteNavigation';
import { templateHref, type TemplateTab } from '../lib/templateNavigation';
import { createArticleSource, instantiateArticleTemplate, parseArticle, replaceArticleBody, updateFrontMatter } from '../lib/frontMatter';
import {
  copyStoredArticle,
  createNamedDataDirectory,
  deleteStoredArticle,
  displayDirectoryName,
  ensureArticleDirectories,
  assertExistingDataDirectory,
  getArticleMediaDirectory,
  getStoredArticleDirectory,
  loadThemeLibrary,
  listStoredArticles,
  listArticleSummaries,
  articleSummary,
  readStoredArticleById,
  rebuildArticleIndexes,
  monthKey,
  pickDataDirectory,
  sanitizeFolderName,
  saveStoredArticle,
  supportsFileSystemAccess,
} from '../lib/fileSystem';
import type { ThemeLibraryIssue } from '../lib/fileSystem';
import {
  getDirectoryBookmarkId,
  loadLastDirectoryHandle,
  queryDirectoryReadWritePermission,
  requestDirectoryReadWritePermission,
  saveLastDirectoryHandle,
} from '../lib/directoryBookmark';
import { activateEditorThemeDirectory } from '../lib/editorThemeCache';
import {
  DEFAULT_ARTICLE_SNIPPETS,
  DEFAULT_SNIPPET_CATEGORIES,
  DEFAULT_TEMPLATE_CATEGORIES,
  DEFAULT_ARTICLE_TEMPLATES,
  loadArticleSnippets,
  loadArticleTemplates,
  type ContentLibraryIssue,
} from '../lib/contentLibraries';
import { buildClipboardPayload, extractMarkdownClassCandidates } from '../lib/render';
import { embedClipboardImages } from '../lib/clipboardImages';
import { ARTICLE_EXAMPLE_IMAGE } from '../lib/articleExamples';
import { compiledArticleFormatStatus, hasFormatConcerns, inspectArticleFormatReport, type ArticleFormatReport } from '../lib/articleFormatReport';
import { compileArticleStyles } from '../lib/tailwind';
import { createArticleMutationQueue, type ArticleDocumentToken } from '../lib/articleMutationQueue';
import { copyArticleImageAs, importArticleImage, insertArticleImageReferences, rewriteArticleImageReferences, type ArticleMediaAsset, type LibraryMediaAsset, type MediaActionOutcome, importSharedImage, inspectArticleImage } from '../lib/articleMedia';
import { DEFAULT_ARTICLE_SETTINGS, loadArticleSettings, saveArticleSettings, type ArticleSettings } from '../lib/articleSettings';
import { createArticleSnapshot, listArticleHistory, setArticleSnapshotRetained, type ArticleHistoryIssue, type ArticleHistorySnapshot } from '../lib/articleHistory';
import { BASIC_THEME } from '../lib/themes';
import { BASE_EDITOR_THEME, parseEditorThemeJson, type EditorTheme } from '../lib/editorThemes';
import { deleteEditorTheme, loadEditorThemeLibrary, saveEditorTheme, type EditorThemeIssue } from '../lib/editorThemeLibrary';
import { migrateLegacyEditorAppearance } from '../lib/editorThemeMigration';
import {
  createDefaultEditorWorkspace,
  createEditorProject,
  deleteEditorProject,
  editorArticleGroupKey,
  getArticleOrganization,
  loadEditorWorkspace,
  moveArticleToProject,
  orderArticlesForGroup,
  orderEditorProjects,
  renameEditorProject,
  reorderPinnedEditorProjects,
  replaceEditorAppearanceThemeId,
  resetEditorAppearance,
  saveEditorWorkspace,
  setArticleArchived,
  setArticleGroupOrder,
  setArticleProject,
  setEditorAppearance,
  setEditorProjectCollapsed,
  setEditorProjectPinned,
  validateEditorWorkspace,
  type EditorAppearance,
  type EditorWorkspace,
  type EditorWorkspaceLoadResult,
  type EditorWorkspaceSaveBase,
} from '../lib/editorWorkspace';
import type { ArticleDiagnostic, ArticleSnippet, ArticleTemplate, SnippetCategory, ArticleSummary, ArticleIndexIssue, StoredArticle, ThemeConfig, WorkingArticle } from '../lib/types';
import type { ArticleMediaContext } from '../components/editor/MarkdownPreview';
import type { MediaRenameOutcome } from '../components/media/MediaLibrary';

export type ViewKey = 'articles' | 'assets' | 'themes' | 'template' | 'settings';
export type ArticleMode = 'overview' | 'editor';
export type Tone = 'neutral' | 'success' | 'warning' | 'error';
export type ArticleCollection = 'all' | 'unclassified' | 'archived' | `project:${string}`;
export type LibraryCreationResult = { status: 'created' | 'cancelled' } | { status: 'error'; message: string };
type PendingAction = { label: string; run: () => void | Promise<void>; onCancel?: () => void };
type MediaPickerRequest = {
  id: number;
  root: FileSystemDirectoryHandle;
  sessionKey: number;
  articleId: string;
  body: string;
  selection: { start: number; end: number };
  documentToken: ArticleDocumentToken;
  initialAsset?: LibraryMediaAsset;
};



function makeWorkingArticle(source: string, theme: ThemeConfig, folder: string | null = null, month: string | null = null, themeValid = true): WorkingArticle {
  return { source, theme, folder, month, themeValid, dirty: true };
}

function makeEmptyWorkingArticle(theme: ThemeConfig): WorkingArticle {
  return { ...makeWorkingArticle('', theme), dirty: false };
}

function errorDiagnostics(diagnostics: ArticleDiagnostic[]): ArticleDiagnostic[] {
  return diagnostics.filter((item) => item.level === 'error');
}

type ArticleSnapshot = {
  renderRecord?: RenderRecord | null;
  renderCss?: string;
  renderSnapshot?: FormatSnapshot;
  renderIssue?: string;
  source: string;
  theme: ThemeConfig;
  themeValid: boolean;
  folder: string | null;
  month: string | null;
  revision: number;
  articleId: string;
  directory: FileSystemDirectoryHandle | null;
  documentToken: ArticleDocumentToken;
  formatId: string;
};

type SaveSnapshotResult = {
  ok: boolean;
  current: boolean;
  savedSnapshot?: ArticleSnapshot;
  result?: Awaited<ReturnType<typeof saveStoredArticle>>;
};

function articleId(article: Pick<WorkingArticle, 'folder' | 'month'>): string {
  return article.folder && article.month ? `${article.month}/${article.folder}` : 'draft';
}

function upsertStoredArticle(items: ArticleSummary[], article: StoredArticle): ArticleSummary[] {
  return [articleSummary(article), ...items.filter((item) => item.id !== article.id)]
    .sort((a, b) => b.parse.metadata.updatedAt.localeCompare(a.parse.metadata.updatedAt));
}

function articleFingerprint(source: string, theme: ThemeConfig): string {
  return JSON.stringify({ source, theme });
}

export function useEditorController() {
  const formatSnapshot = useFormatSnapshot();
  const [mounted, setMounted] = useState(false);
  const [fileSystemReady, setFileSystemReady] = useState(false);
  const pathname = usePathname();
  const { navigateRoute, registerNavigationGuard } = useRouteNavigation(pathname);
  const routePath = (pathname ?? '/').replace(/\/+$/, '') || '/';
  const routeSegment = routePath.split('/').filter(Boolean)[0] ?? '';
  const routeView: ViewKey = routeSegment === 'snippets' || routeSegment === 'templates' ? 'template' : routeSegment === 'editor' || routeSegment === 'articles'
    ? 'articles'
    : (['assets', 'themes', 'template', 'settings'].includes(routeSegment) ? routeSegment as ViewKey : 'articles');
  const lastImageSelectionRef = useRef<{ articleId: string; body: string; start: number; end: number } | null>(null);
  const [preferredArticleMode, setPreferredArticleMode] = useState<ArticleMode>('overview');
  const view = routeView;
  const articleMode: ArticleMode = routePath === '/articles'
    ? 'overview'
    : routePath === '/editor' ? 'editor' : preferredArticleMode;
  const navigateArticleMode = useCallback((mode: ArticleMode) => {
    if (mode === 'editor' && !directoryRef.current) {
      setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeEditing"), tone: 'warning' });
      navigateRoute('/settings/');
      return;
    }
    setPreferredArticleMode(mode);
    navigateRoute(mode === 'editor' ? '/editor/' : '/articles/');
  }, [navigateRoute]);
  const navigateView = useCallback((target: ViewKey, tab: TemplateTab = 'snippets') => {
    const textarea = sourceTextareaRef.current;
    if (textarea) lastImageSelectionRef.current = { articleId: articleId(articleRef.current), body: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
    if (target === 'template') {
      navigateRoute(templateHref(tab));
      return;
    }
    if (target === 'articles') {
      navigateRoute('/articles/');
      return;
    }
    navigateRoute(`/${target}/`);
  }, [navigateRoute]);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [rememberedDirectory, setRememberedDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [directoryRestoreState, setDirectoryRestoreState] = useState<'checking' | 'idle' | 'permission-needed'>('checking');
  const [directoryBookmarkIssue, setDirectoryBookmarkIssue] = useState<string | null>(null);
  const [contentLibraryRootSession, setContentLibraryRootSession] = useState(0);
  const [contentLibrariesState, setContentLibrariesState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [storedArticles, setStoredArticles] = useState<ArticleSummary[]>([]);
  const [articleIndexIssues, setArticleIndexIssues] = useState<ArticleIndexIssue[]>([]);
  const [articleIndexMonths, setArticleIndexMonths] = useState<string[]>([]);
  const articleOpenRequestRef = useRef(0);
  const [articleChecks, setArticleChecks] = useState<Record<string, ArticleListCheck>>({});
  const [articleListNotice, setArticleListNotice] = useState<{ label: string; tone: Tone }>({ label: '', tone: 'neutral' });
  const [articleListWork, setArticleListWork] = useState<{ kind: 'check' | 'index' | 'tags'; completed: number; total: number } | null>(null);
  const articleListAbortRef = useRef<(AbortController & { kind: 'check' | 'index' | 'tags' }) | null>(null);
  const [themeLibrary, setThemeLibrary] = useState<ThemeConfig[]>([]);
  const [themeIssues, setThemeIssues] = useState<ThemeLibraryIssue[]>([]);
  const [editorThemes, setEditorThemes] = useState<EditorTheme[]>([]);
  const [editorThemeIssues, setEditorThemeIssues] = useState<EditorThemeIssue[]>([]);
  const [snippets, setSnippets] = useState<ArticleSnippet[]>(DEFAULT_ARTICLE_SNIPPETS);
  const [snippetIssues, setSnippetIssues] = useState<ContentLibraryIssue[]>([]);
  const [snippetCategories, setSnippetCategories] = useState<SnippetCategory[]>(DEFAULT_SNIPPET_CATEGORIES);
  const [templateCategories, setTemplateCategories] = useState<SnippetCategory[]>(DEFAULT_TEMPLATE_CATEGORIES);
  const [templates, setTemplates] = useState<ArticleTemplate[]>(DEFAULT_ARTICLE_TEMPLATES);
  const [templateIssues, setTemplateIssues] = useState<ContentLibraryIssue[]>([]);
  const [article, setArticle] = useState<WorkingArticle>(() => makeEmptyWorkingArticle(BASIC_THEME));
  const [articleSettings, setArticleSettings] = useState<ArticleSettings>(DEFAULT_ARTICLE_SETTINGS);
  const [editorWorkspace, setEditorWorkspace] = useState<EditorWorkspace>(() => createDefaultEditorWorkspace());
  const [editorWorkspaceIssue, setEditorWorkspaceIssue] = useState<string | null>(null);
  const [editorWorkspaceBusy, setEditorWorkspaceBusy] = useState(false);
  const [editorAppearanceLoaded, setEditorAppearanceLoaded] = useState(false);
  const [editorAppearanceVerified, setEditorAppearanceVerified] = useState(false);
  const [editorDirectoryId, setEditorDirectoryId] = useState<string | null>(null);
  const [selectedArticleCollection, setSelectedArticleCollection] = useState<ArticleCollection>('all');
  const [articleInfoDialogOpen, setArticleInfoDialogOpen] = useState(false);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [settingsIssue, setSettingsIssue] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<{ label: string; tone: Tone }>({ ...productLabel("controller.defaultIntervalsAutoSaveEvery60SecondsAutomaticSnapshotEvery30Minutes"), tone: 'neutral' });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<ArticleHistorySnapshot[]>([]);
  const [historyIssues, setHistoryIssues] = useState<ArticleHistoryIssue[]>([]);
  const [historySelectedId, setHistorySelectedId] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyRefreshPending, setHistoryRefreshPending] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<{ label: string; tone: Tone }>({ ...productLabel("controller.historyIsStoredOnlyInTheCurrentArticleDirectory"), tone: 'neutral' });
  const [revision, setRevision] = useState(1);
  const [compiledRevision, setCompiledRevision] = useState<number | null>(null);
  const [compiledCss, setCompiledCss] = useState('');
  const [status, setStatus] = useState<{ label: string; tone: Tone; formatRevision?: number }>({ ...productLabel("controller.chooseALibraryToStartWriting"), tone: 'neutral' });
  const [formatCheck, setFormatCheck] = useState<{ mode: 'copy' | 'save' | 'inspect' | 'export'; report: ArticleFormatReport } | null>(null);
  const [loadInspectionRevision, setLoadInspectionRevision] = useState<number | null>(null);
  const formatCheckResolveRef = useRef<((proceed: boolean) => void) | null>(null);
  const copyRequestRef = useRef(0);
  const [mobilePane, setMobilePane] = useState<'source' | 'preview'>('source');
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingActionLabel, setPendingActionLabel] = useState('');
  const [createLibraryDialogOpen, setCreateLibraryDialogOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<ArticleSummary | null>(null);
  const copyOpenerRef = useRef<HTMLElement | null>(null);
  const [copyTitle, setCopyTitle] = useState('');
  const [copyMonth, setCopyMonth] = useState('');
  const [copyThemeTarget, setCopyThemeTarget] = useState<ThemeConfig | null>(null);
  const [copySourceOverride, setCopySourceOverride] = useState<string | null>(null);
  const [copyFromThemeLibrary, setCopyFromThemeLibrary] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ArticleSummary[]>([]);
  // Kept as a single-article view for the delete dialog and its callers; a selection fills the same list.
  const deleteTarget = deleteTargets[0] ?? null;
  const setDeleteTarget = useCallback((target: ArticleSummary | null) => { setDeleteTargets(target ? [target] : []); }, []);
  const [mediaTarget, setMediaTarget] = useState<ArticleMediaAsset | null>(null);
  const [mediaPickerRequest, setMediaPickerRequest] = useState<MediaPickerRequest | null>(null);
  const mediaPickerRequestRef = useRef<MediaPickerRequest | null>(null);
  mediaPickerRequestRef.current = mediaPickerRequest;
  const mediaPickerIdRef = useRef(0);
  const [mediaOperation, setMediaOperation] = useState<'import' | 'rename' | null>(null);
  const [mediaRefreshRevision, setMediaRefreshRevision] = useState(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const previewRef = useRef<HTMLElement | null>(null);
  const renderEnvironmentRef = useRef<{ dispose: () => void } | null>(null);
  useEffect(() => () => renderEnvironmentRef.current?.dispose(), []);
  const [previewElement, setPreviewElement] = useState<HTMLElement | null>(null);
  const attachPreview = useCallback((element: HTMLElement | null) => {
    previewRef.current = element;
    setPreviewElement(element);
  }, []);
  const clipboardReceiverRef = useRef<HTMLDivElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const compileRequestRef = useRef(0);
  const compiledFormatRef = useRef<{ snapshot: ArticleSnapshot; css: string; report: ArticleFormatReport; classes: number; preview: HTMLElement | null; requestId: number } | null>(null);
  const formatInspectionRef = useRef(false);
  const articleRef = useRef(article);
  const directoryRef = useRef(directory);
  const fontSessionDisposeRef = useRef<() => void>(() => {});
  useEffect(() => () => fontSessionDisposeRef.current(), []);
  useEffect(() => { if (!directory) { fontSessionDisposeRef.current(); fontSessionDisposeRef.current = () => {}; } }, [directory]);
  const editorWorkspaceRef = useRef(editorWorkspace);
  const editorWorkspaceSnapshotRef = useRef<EditorWorkspaceSaveBase>({ fileExists: false, rawContent: null });
  const editorWorkspaceQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const contentLibraryRootSessionRef = useRef(0);
  const directorySelectionRef = useRef(0);
  const directoryBookmarkWriteRef = useRef<Promise<void>>(Promise.resolve());
  const revisionRef = useRef(revision);
  const mutationQueueRef = useRef(createArticleMutationQueue());
  const documentTokenRef = useRef<ArticleDocumentToken | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const mediaOperationRef = useRef(false);
  const autoSaveBusyRef = useRef(false);
  const autoSnapshotBusyRef = useRef(false);
  const historyOperationRef = useRef<symbol | null>(null);
  const historyOpenerRef = useRef<HTMLButtonElement | null>(null);
  const historyBaselineRef = useRef<{ root: FileSystemDirectoryHandle; articleId: string; fingerprint: string | null; initialized: boolean } | null>(null);

  const advanceContentLibraryRootSession = useCallback(() => {
    const nextSession = contentLibraryRootSessionRef.current + 1;
    contentLibraryRootSessionRef.current = nextSession;
    setContentLibraryRootSession(nextSession);
    setMediaTarget(null);
    mediaPickerRequestRef.current = null;
    setMediaPickerRequest(null);
  }, []);

  if (!documentTokenRef.current) {
    documentTokenRef.current = mutationQueueRef.current.openDocument(directoryRef.current, articleId(article));
  }
  const currentDocumentGeneration = documentTokenRef.current?.generation ?? 0;

  const beginHistoryOperation = useCallback(() => {
    if (historyOperationRef.current) return null;
    const lease = Symbol('article-history-operation');
    historyOperationRef.current = lease;
    setHistoryBusy(true);
    return lease;
  }, []);

  const finishHistoryOperation = useCallback((lease: symbol) => {
    if (historyOperationRef.current !== lease) return;
    historyOperationRef.current = null;
    setHistoryBusy(false);
  }, []);

  const openDocument = useCallback((root: FileSystemDirectoryHandle | null, id: string) => {
    const token = mutationQueueRef.current.openDocument(root, id);
    if (token) documentTokenRef.current = token;
    return token;
  }, []);

  const persistEditorWorkspace = useCallback((
    update: (current: EditorWorkspace) => EditorWorkspace,
    notice = productText("controller.localProjectSettingsSaved"),
  ): Promise<boolean> => {
    const root = directoryRef.current;
    if (!root) {
      setStatus({ ...productLabel("controller.chooseALibraryBeforeSavingProjectAndAppearanceSettings"), tone: 'warning' });
      return Promise.resolve(false);
    }
    const rootSession = contentLibraryRootSessionRef.current;
    const perform = async () => {
      if (directoryRef.current !== root || contentLibraryRootSessionRef.current !== rootSession) return false;
      if (editorWorkspaceIssue) {
        setStatus({ ...productLabel("controller.projectAndAppearanceSettingsRemainReadOnly", { "editorWorkspaceIssue": editorWorkspaceIssue }), tone: 'error' });
        return false;
      }
      setEditorWorkspaceBusy(true);
      try {
        const next = validateEditorWorkspace(update(editorWorkspaceRef.current));
        const saved = await saveEditorWorkspace(root, next, editorWorkspaceSnapshotRef.current);
        if (directoryRef.current !== root || contentLibraryRootSessionRef.current !== rootSession) return false;
        editorWorkspaceRef.current = saved.workspace;
        editorWorkspaceSnapshotRef.current = { fileExists: saved.fileExists, rawContent: saved.rawContent };
        setEditorWorkspace(saved.workspace);
        setEditorAppearanceVerified(true);
        setEditorWorkspaceIssue(null);
        setStatus({ label: notice, tone: 'success' });
        return true;
      } catch (error) {
        if (directoryRef.current === root && contentLibraryRootSessionRef.current === rootSession) {
          setStatus({ ...productErrorLabel(error), tone: 'error' });
        }
        return false;
      } finally {
        if (directoryRef.current === root && contentLibraryRootSessionRef.current === rootSession) setEditorWorkspaceBusy(false);
      }
    };
    const queued = editorWorkspaceQueueRef.current.then(perform, perform);
    editorWorkspaceQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [editorWorkspaceIssue]);

  useEffect(() => {
    articleListAbortRef.current?.abort();
    setArticleChecks({});
    setCompiledRevision(null); setCompiledCss(''); setIsCompiling(false); compiledFormatRef.current = null;
    setFormatCheck(null); formatCheckResolveRef.current?.(false); formatCheckResolveRef.current = null;
    compileRequestRef.current += 1;
  }, [formatSnapshot.id]);

  const parsed = useMemo(() => parseArticle(article.source), [article.source]);
  const parseErrors = errorDiagnostics(parsed.diagnostics);
  const currentTitle = parsed.metadata.title || productText("articleHistory.untitledManuscript");
  const articleList = directory ? storedArticles : [];
  const currentArticleIsArchived = Boolean(article.folder && article.month && getArticleOrganization(editorWorkspace, articleId(article)).archived);
  const isReadyToCopy = mounted && Boolean(directory && article.folder && article.month) && !currentArticleIsArchived && parseErrors.length === 0 && parsed.canCopy && article.themeValid;
  const articleMediaContext = useMemo<ArticleMediaContext | null>(() => {
    const token = documentTokenRef.current;
    if (!article.folder || !article.month || !token?.root || token.root !== directoryRef.current) return null;
    const root = token.root as FileSystemDirectoryHandle;
    const id = articleId(article);
    const rootSession = contentLibraryRootSession;
    return {
      root,
      article: { id, month: article.month, folder: article.folder },
      articleTitle: currentTitle,
      sessionKey: `${rootSession}:${token.generation}:${mediaRefreshRevision}`,
      isCurrent: () => directoryRef.current === root &&
        contentLibraryRootSessionRef.current === rootSession &&
        documentTokenRef.current === token &&
        articleId(articleRef.current) === id,
      onOpen: (asset) => setMediaTarget(asset),
    };
  }, [article, contentLibraryRootSession, currentTitle, mediaRefreshRevision]);

  const updateArticle = useCallback((nextSource: string, nextTheme?: ThemeConfig) => {
    const documentToken = documentTokenRef.current;
    const current = articleRef.current;
    if (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, articleId(current)).archived) {
      setStatus({ ...productLabel("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeEditing"), tone: 'warning' });
      return;
    }
    if (documentToken?.root && mutationQueueRef.current.isDeleting(documentToken.root, documentToken.articleId)) {
      setStatus({ ...productLabel("controller.thisArticleIsBeingDeletedEditingAndSavingAreUnavailable"), tone: 'warning' });
      return;
    }
    const changedId = articleId(current);
    setArticleChecks(records => records[changedId] ? { ...records, [changedId]: { ...records[changedId], state: 'stale' } } : records);
    const nextArticle = { ...current, source: nextSource, theme: nextTheme ?? current.theme, themeValid: nextTheme ? true : current.themeValid, dirty: true };
    articleRef.current = nextArticle;
    revisionRef.current += 1;
    compileRequestRef.current += 1;
    setIsCompiling(false);
    setArticle(nextArticle);
    setRevision(revisionRef.current);
    setLoadInspectionRevision(null);
    setCompiledRevision(null);
  }, []);

  const updateArticleBody = useCallback((body: string) => {
    try {
      const nextSource = replaceArticleBody(articleRef.current.source, body);
      updateArticle(nextSource);
    } catch (error) {
      setStatus({ ...productErrorLabel(error), tone: 'error' });
    }
  }, [updateArticle]);

  const snapshotFor = useCallback((current = articleRef.current, targetRevision = revisionRef.current): ArticleSnapshot => ({
    renderSnapshot: current.renderSnapshot,
    renderRecord: current.renderRecord, renderCss: current.renderCss,
    renderIssue: current.renderIssue,
    source: current.source,
    theme: current.theme,
    themeValid: current.themeValid,
    folder: current.folder,
    month: current.month,
    revision: targetRevision,
    articleId: articleId(current),
    directory: directoryRef.current,
    documentToken: documentTokenRef.current!,
    formatId: getFormatSnapshot().id,
  }), []);

  const matchesSnapshot = useCallback((snapshot: ArticleSnapshot) => (
    getFormatSnapshot().id === snapshot.formatId &&
    revisionRef.current === snapshot.revision &&
    articleId(articleRef.current) === snapshot.articleId &&
    directoryRef.current === snapshot.directory &&
    documentTokenRef.current === snapshot.documentToken &&
    snapshot.documentToken.root === snapshot.directory &&
    snapshot.documentToken.articleId === snapshot.articleId
  ), []);

  const cacheLoadedArticleReport = useCallback((snapshot: ArticleSnapshot, report: ArticleFormatReport, preview: HTMLElement | null) => {
    if (report.complete === false || !preview || !preview.isConnected || preview !== previewRef.current || !matchesSnapshot(snapshot) || !snapshot.folder || !snapshot.month || articleRef.current.dirty) return;
    const parsed = parseArticle(snapshot.source);
    if (!snapshot.themeValid) parsed.diagnostics.push({ level: 'error', ...productMessage("controller.theThemeSnapshotNeedsRepair") });
    const cached = articleListCheckResult({ id: snapshot.articleId, month: snapshot.month, folder: snapshot.folder, filePath: '', source: snapshot.source, theme: snapshot.theme, themeValid: snapshot.themeValid, parse: parsed }, report);
    setArticleChecks(records => ({ ...records, [snapshot.articleId]: cached }));
  }, [matchesSnapshot]);

  const compileCurrent = useCallback(async (given?: ArticleSnapshot): Promise<boolean> => {
    if (!mounted) return false;
    const snapshot = given ?? snapshotFor();
    const requestId = ++compileRequestRef.current;
    setIsCompiling(true);
    try {
      if (snapshot.renderIssue) throw new Error(snapshot.renderIssue);
      const result = snapshot.renderRecord && snapshot.renderCss && await renderRecordMatches(snapshot.renderRecord, snapshot.source, snapshot.theme)
        ? { css: snapshot.renderCss, candidates: extractMarkdownClassCandidates(snapshot.source) }
        : await compileArticleStyles(snapshot.source, snapshot.theme, { snapshot: snapshot.renderSnapshot?.id === snapshot.formatId ? snapshot.renderSnapshot : undefined });
      if (requestId !== compileRequestRef.current || !matchesSnapshot(snapshot)) return false;
      // Format rules must be checked against the committed preview, including its new stylesheet.
      flushSync(() => { setCompiledCss(result.css); setCompiledRevision(snapshot.revision); });
      const preview = previewRef.current;
      const report = await inspectArticleFormatReport(snapshot.source, snapshot.theme, preview, { root: snapshot.directory, month: snapshot.month, folder: snapshot.folder }, { deep: false }).catch((cause): ArticleFormatReport => ({
        theme: { passed: [], issues: [{ kind: 'engine', name: productText("controller.formatCheckEngine"), source: productText("controller.currentArticleFormatCheck"), tier: 'unknown', ...productMessage("controller.theCurrentFormatCouldNotBeChecked", { "cause": productCause(cause) }) }] },
        body: { passed: [], issues: [] },
      }));
      if (requestId !== compileRequestRef.current || !matchesSnapshot(snapshot)) return false;
      compiledFormatRef.current = { snapshot, css: result.css, report, classes: result.candidates.length, preview, requestId };
      setStatus(compiledArticleFormatStatus(report, snapshot.revision, result.candidates.length));
      cacheLoadedArticleReport(snapshot, report, preview);
      return true;
    } catch (error) {
      if (requestId === compileRequestRef.current && matchesSnapshot(snapshot)) {
        setStatus({ ...productLabel("controller.styleGenerationFailed", { "cause": productCause(error) }), tone: 'error' });
      }
      return false;
    } finally {
      if (requestId === compileRequestRef.current) setIsCompiling(false);
    }
  }, [cacheLoadedArticleReport, matchesSnapshot, mounted, snapshotFor]);

  const loadStoredArticles = useCallback(async (root: FileSystemDirectoryHandle | null = directoryRef.current) => {
    if (!root) return [];
    articleListAbortRef.current?.abort();
    setArticleChecks({});
    const next = await listArticleSummaries(root);
    if (directoryRef.current === root) { setStoredArticles(next.articles); setArticleIndexIssues(next.issues); setArticleIndexMonths(next.months); }
    return next.articles;
  }, []);

  const refreshArticles = useCallback((root: FileSystemDirectoryHandle | null = directoryRef.current) => (
    mutationQueueRef.current.run(() => loadStoredArticles(root))
  ), [loadStoredArticles]);

  const applyStoredArticle = useCallback(async (stored: StoredArticle, navigateToEditor = false, root: FileSystemDirectoryHandle | null = directoryRef.current) => {
    const documentToken = openDocument(root, stored.id);
    if (!documentToken) {
      setStatus({ ...productLabel("controller.thisArticleIsBeingDeletedRefreshTheArticleListLater"), tone: 'warning' });
      return false;
    }
    let restored: Awaited<ReturnType<typeof restoreRenderEnvironment>> | undefined;
    let renderIssue = stored.renderIssue;
    if (stored.renderRecord && root && !renderIssue) {
      try { restored = await restoreRenderEnvironment(root, stored.renderRecord); }
      catch (error) { renderIssue = productText("controller.historicalRenderDependenciesCouldNotLoad") + (error instanceof Error ? error.message : String(error)); }
    }
    if (directoryRef.current !== root || documentTokenRef.current !== documentToken) { restored?.dispose(); return false; }
    renderEnvironmentRef.current?.dispose(); renderEnvironmentRef.current = restored ?? null;
    const nextArticle: WorkingArticle = { source: stored.source, folder: stored.folder, month: stored.month, theme: stored.theme, themeValid: stored.themeValid, dirty: false, renderRecord: stored.renderRecord, renderSnapshot: restored?.snapshot, renderCss: restored?.css, renderIssue };
    historyBaselineRef.current = root
      ? { root, articleId: stored.id, fingerprint: articleFingerprint(stored.source, stored.theme), initialized: false }
      : null;
    articleRef.current = nextArticle;
    revisionRef.current += 1;
    compileRequestRef.current += 1;
    setIsCompiling(false);
    setArticle(nextArticle);
    setRevision(revisionRef.current);
    setLoadInspectionRevision(revisionRef.current);
    setCompiledRevision(null);
    setStatus({ ...(stored.parse.diagnostics.length > 0 ? productLabel("controller.loadedResolveDiagnosticsFirst", { "storedFilePath": stored.filePath }) : productLabel("controller.loaded", { "storedFilePath": stored.filePath })), tone: stored.parse.diagnostics.length > 0 ? 'warning' : 'success' });
    if (navigateToEditor) navigateArticleMode('editor');
    void compileCurrent(snapshotFor(nextArticle, revisionRef.current));
    return true;
  }, [compileCurrent, navigateArticleMode, openDocument, snapshotFor]);

  useEffect(() => {
    if (isCompiling || articleMode !== 'editor' || loadInspectionRevision === null || compiledRevision !== loadInspectionRevision || !previewElement) return;
    const snapshot = snapshotFor();
    if (snapshot.revision !== loadInspectionRevision) return;
    const compiled = compiledFormatRef.current;
    if (!compiled || !matchesSnapshot(compiled.snapshot)) return;
    if (compiled.preview === previewElement) { setLoadInspectionRevision(null); return; }
    let cancelled = false;
    void inspectArticleFormatReport(snapshot.source, snapshot.theme, previewElement, { root: snapshot.directory, month: snapshot.month, folder: snapshot.folder }, { deep: false }).then(report => {
      if (cancelled || !matchesSnapshot(snapshot) || compiled.requestId !== compileRequestRef.current) return;
      compiledFormatRef.current = { ...compiled, report, preview: previewElement };
      setStatus(compiledArticleFormatStatus(report, snapshot.revision, compiled.classes));
      cacheLoadedArticleReport(snapshot, report, previewElement);
      setLoadInspectionRevision(null);
    });
    return () => { cancelled = true; };
  }, [articleMode, cacheLoadedArticleReport, compiledRevision, isCompiling, loadInspectionRevision, matchesSnapshot, previewElement, snapshotFor]);

  const performSaveSnapshot = useCallback(async (snapshot: ArticleSnapshot): Promise<SaveSnapshotResult> => {
    const root = snapshot.directory;
    if (!root) {
      setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeSaving"), tone: 'warning' });
      return { ok: false, current: matchesSnapshot(snapshot) };
    }
    if (snapshot.folder && snapshot.month && getArticleOrganization(editorWorkspaceRef.current, snapshot.articleId).archived) {
      setStatus({ ...productLabel("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeSaving"), tone: 'warning' });
      return { ok: false, current: matchesSnapshot(snapshot) };
    }
    const parsedSnapshot = parseArticle(snapshot.source);
    const hasErrors = parsedSnapshot.diagnostics.some((item) => item.level === 'error');
    const preserveThemeSnapshot = Boolean(snapshot.folder) && !snapshot.themeValid;
    const nextSource = hasErrors
      ? snapshot.source
      : updateFrontMatter(snapshot.source, {
          updatedAt: new Date().toISOString(),
          ...(preserveThemeSnapshot ? {} : { theme: { id: snapshot.theme.id, version: snapshot.theme.version } }),
        });
    try {
      let prepared: Awaited<ReturnType<typeof prepareRenderRecord>> | undefined, renderIssue: string | undefined;
      const compiled = compiledFormatRef.current;
      const preview = previewRef.current;
      if (!hasErrors && !preserveThemeSnapshot && matchesSnapshot(snapshot) && preview && compiled?.snapshot.revision === snapshot.revision) {
        try {
          prepared = await prepareRenderRecord(nextSource, snapshot.theme, preview, compiled.css, { snapshot: snapshot.renderSnapshot ?? getFormatSnapshot(), root, articlePath: snapshot.folder && snapshot.month ? 'articles/' + snapshot.month + '/' + snapshot.folder : undefined });
        } catch (error) { renderIssue = error instanceof Error ? error.message : String(error); }
      } else renderIssue = productText("controller.theCurrentRenderIsNotReadyUpdateStylesAndSaveAgain");
      const result = await saveStoredArticle(root, nextSource, snapshot.theme, snapshot.folder, snapshot.month, { writeTheme: !preserveThemeSnapshot });
      if (prepared && result.article.themeValid) {
        try {
          await persistRenderRecord(root, await getStoredArticleDirectory(root, result.article.month, result.article.folder), prepared);
          result.article.renderRecord = prepared.record;
        } catch (error) { renderIssue = error instanceof Error ? error.message : String(error); }
      }
      if (renderIssue) result.article.renderIssue = renderIssue;
      const currentDocument = matchesSnapshot(snapshot) && mutationQueueRef.current.canSave(snapshot.documentToken);
      const nextDocumentToken = currentDocument
        ? result.article.id === snapshot.documentToken.articleId
          ? snapshot.documentToken
          : openDocument(root, result.article.id)
        : null;
      const current = nextDocumentToken !== null;
      const savedSnapshot: ArticleSnapshot = {
        ...snapshot,
        source: nextSource,
        theme: result.article.theme,
        themeValid: result.article.themeValid,
        folder: result.article.folder,
        month: result.article.month,
        articleId: result.article.id,
        documentToken: nextDocumentToken ?? snapshot.documentToken,
      };
      if (current) {
        documentTokenRef.current = nextDocumentToken;
        setStoredArticles((items) => upsertStoredArticle(items, result.article));
        const savedArticle: WorkingArticle = { source: nextSource, folder: result.article.folder, month: result.article.month, theme: result.article.theme, themeValid: result.article.themeValid, dirty: false, renderSnapshot: snapshot.renderSnapshot, renderCss: prepared ? compiled?.css : undefined, renderRecord: result.article.renderRecord, renderIssue: snapshot.renderIssue };
        articleRef.current = savedArticle;
        setArticle(savedArticle);
        if (!snapshot.folder || !snapshot.month) {
          historyBaselineRef.current = {
            root,
            articleId: result.article.id,
            fingerprint: articleFingerprint(nextSource, result.article.theme),
            initialized: false,
          };
        }
        setCompiledRevision(null);
        if (result.indexUpdated && result.indexError) setStatus({ ...productLabel("controller.sourceSavedTheMonthlyIndexWasRebuilt", { "resultIndexError": result.indexError }), tone: 'warning' });
        else if (result.indexUpdated) setStatus({ ...productLabel("controller.sourceSaved", { "result_articleFilePath": result.article.filePath }), tone: 'success' });
        else setStatus({ ...productLabel("controller.sourceSavedTheIndexWasNotUpdated", { "value": (result.indexError ?? productReference("controller.unknownError")) }), tone: 'warning' });
        if (renderIssue) setStatus({ ...productLabel("shared.compose", { parts: productJoin([productReference("controller.sourceSavedTheRenderRecordWasNotUpdated"), renderIssue]) }), tone: 'warning' });
      }
      return { ok: result.sourceSaved, current, savedSnapshot, result };
    } catch (error) {
      if (matchesSnapshot(snapshot)) setStatus({ ...productLabel("themeLibrary.savingFailed", { "cause": productCause(error) }), tone: 'error' });
      return { ok: false, current: matchesSnapshot(snapshot) };
    }
  }, [matchesSnapshot, openDocument]);

  const saveSnapshot = useCallback((snapshot: ArticleSnapshot): Promise<SaveSnapshotResult> => (
    mutationQueueRef.current.run(() => {
      const current = matchesSnapshot(snapshot);
      const tokenMatchesSnapshot = snapshot.documentToken.root === snapshot.directory && snapshot.documentToken.articleId === snapshot.articleId;
      if (!tokenMatchesSnapshot || !mutationQueueRef.current.canSave(snapshot.documentToken)) {
        if (current) setStatus({ ...productLabel("controller.savingCancelledThisArticleIsBeingDeletedOrHasBeenDeletedOpen"), tone: 'warning' });
        return { ok: false, current };
      }
      return performSaveSnapshot(snapshot);
    })
  ), [matchesSnapshot, performSaveSnapshot]);

  const captureSavedRender = useCallback(async (snapshot: ArticleSnapshot) => {
    const root = snapshot.directory, preview = previewRef.current, compiled = compiledFormatRef.current;
    if (!root || !snapshot.month || !snapshot.folder || !preview || !compiled || !matchesSnapshot(snapshot)) return false;
    try {
      const prepared = await prepareRenderRecord(snapshot.source, snapshot.theme, preview, compiled.css, { snapshot: snapshot.renderSnapshot ?? getFormatSnapshot(), root, articlePath: 'articles/' + snapshot.month + '/' + snapshot.folder });
      if (!matchesSnapshot(snapshot)) return false;
      await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(snapshot) || !mutationQueueRef.current.canSave(snapshot.documentToken)) throw new ProductError("controller.theArticleSessionChangedTheRenderRecordWasNotUpdated");
        await persistRenderRecord(root, await getStoredArticleDirectory(root, snapshot.month!, snapshot.folder!), prepared);
      });
      if (matchesSnapshot(snapshot)) {
        const next = { ...articleRef.current, renderRecord: prepared.record, renderCss: compiled.css, renderIssue: undefined };
        articleRef.current = next; setArticle(next);
      }
      return true;
    } catch (error) {
      if (matchesSnapshot(snapshot)) setStatus({ ...productLabel("shared.compose", { parts: productJoin([productReference("controller.sourceSavedTheRenderRecordWasNotUpdated"), productCause(error)]) }), tone: 'warning' });
      return false;
    }
  }, [matchesSnapshot]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (mediaOperationRef.current || historyOperationRef.current) return false;
    const snapshot = snapshotFor();
    setLoadInspectionRevision(null);
    const result = await saveSnapshot(snapshot);
    if (result.ok && result.current && result.savedSnapshot && result.result?.article.parse.canCopy) {
      const compiled = await compileCurrent(result.savedSnapshot);
      if (compiled) await captureSavedRender(result.savedSnapshot);
      const checked = compiledFormatRef.current;
      try {
      const report = compiled && checked?.report.complete && matchesSnapshot(checked.snapshot)
        ? checked.report : await inspectArticleFormatReport(result.savedSnapshot.source, result.savedSnapshot.theme, previewRef.current, { root: result.savedSnapshot.directory, month: result.savedSnapshot.month, folder: result.savedSnapshot.folder });
      if (matchesSnapshot(result.savedSnapshot) && hasFormatConcerns(report)) {
        setFormatCheck({ mode: 'save', report });
      }
      } catch (error) {
        if (matchesSnapshot(result.savedSnapshot)) setStatus({ ...productLabel("controller.sourceSavedFormatCheckingIsIncomplete", { "cause": productCause(error) }), tone: 'warning' });
      }
    }
    return result.ok;
  }, [captureSavedRender, compileCurrent, matchesSnapshot, saveSnapshot, snapshotFor]);

  const checkCurrentFormat = useCallback(async (): Promise<boolean> => {
    if (formatInspectionRef.current || formatCheckResolveRef.current || mediaOperationRef.current || historyOperationRef.current) return false;
    const snapshot = snapshotFor();
    if (!parseArticle(snapshot.source).canCopy || !snapshot.themeValid) {
      setStatus({ ...productLabel("controller.repairMetadataOrTheThemeSnapshotBeforeCheckingTheCurrentArticle"), tone: 'error' });
      return false;
    }
    formatInspectionRef.current = true;
    try {
      if (!await compileCurrent(snapshot)) return false;
      const checked = compiledFormatRef.current;
      if (!checked || !matchesSnapshot(snapshot) || checked.requestId !== compileRequestRef.current) return false;
      const report = await inspectArticleFormatReport(snapshot.source, snapshot.theme, previewRef.current, { root: snapshot.directory, month: snapshot.month, folder: snapshot.folder });
      if (!matchesSnapshot(snapshot) || checked.requestId !== compileRequestRef.current) return false;
      compiledFormatRef.current = { ...checked, report };
      cacheLoadedArticleReport(snapshot, report, previewRef.current);
      setStatus(compiledArticleFormatStatus(report, snapshot.revision, checked.classes));
      setFormatCheck({ mode: 'inspect', report });
      return true;
    } catch (error) {
      if (matchesSnapshot(snapshot)) setStatus({ ...productLabel("controller.formatCheckingIsIncomplete", { "cause": productCause(error) }), tone: 'warning' });
      return false;
    } finally { formatInspectionRef.current = false; }
  }, [cacheLoadedArticleReport, compileCurrent, matchesSnapshot, snapshotFor]);

  const updateCurrentStyles = useCallback(async () => {
    const root = directoryRef.current, token = documentTokenRef.current;
    if (!root || !token) return false;
    const loaded = await activateLibraryFormat(root, () => directoryRef.current === root && documentTokenRef.current === token);
    if (!loaded.snapshot || directoryRef.current !== root || documentTokenRef.current !== token) return false;
    if (loaded.snapshot.error) { setStatus({ ...productLabel("shared.compose", { parts: productJoin([productReference("controller.stylesWereNotUpdated"), loaded.snapshot.error]) }), tone: 'error' }); return false; }
    renderEnvironmentRef.current?.dispose(); renderEnvironmentRef.current = null;
    const next: WorkingArticle = { ...articleRef.current, renderSnapshot: undefined, renderCss: undefined, renderIssue: undefined, renderRecord: null, dirty: true };
    articleRef.current = next; setArticle(next);
    return compileCurrent(snapshotFor(next));
  }, [compileCurrent, snapshotFor]);

  const saveSettings = useCallback(async (nextSettings: ArticleSettings) => {
    const root = directoryRef.current;
    if (!root) return;
    setSettingsBusy(true);
    setSettingsNotice({ ...productLabel("controller.savingSettingsJson"), tone: 'warning' });
    try {
      const saved = await saveArticleSettings(root, nextSettings);
      if (directoryRef.current !== root) return;
      setArticleSettings(saved);
      setSettingsIssue(null);
      setSettingsNotice({ ...productLabel("controller.settingsSavedTimersRestartedWithTheNewConfiguration"), tone: 'success' });
    } catch (error) {
      if (directoryRef.current === root) setSettingsNotice({ ...productErrorLabel(error), tone: 'error' });
    } finally {
      if (directoryRef.current === root) setSettingsBusy(false);
    }
  }, []);

  const setDefaultArticleTheme = useCallback(async (themeId: string, expectedRoot: FileSystemDirectoryHandle) => {
    const root = directoryRef.current;
    if (settingsIssue) throw new ProductError("controller.settingsJsonNeedsRepairTheDefaultThemeWasNotSaved");
    if (!root || root !== expectedRoot || !themeLibrary.some((theme) => theme.id === themeId)) {
      throw new ProductError("controller.theCurrentLibraryOrArticleThemeChangedRefreshAndTryAgain");
    }
    const saved = await saveArticleSettings(root, { ...articleSettings, defaultArticleThemeId: themeId });
    if (directoryRef.current !== root) return;
    setArticleSettings(saved);
    setSettingsIssue(null);
  }, [articleSettings, settingsIssue, themeLibrary]);

  const saveEditorAppearance = useCallback((appearance: EditorAppearance) => (
    persistEditorWorkspace((current) => setEditorAppearance(current, appearance), productText("controller.editorAppearanceSavedToTheCurrentLibrary"))
  ), [persistEditorWorkspace]);

  const editorThemeOperationRef = useRef(false);

  const createEditorTheme = useCallback(async (input: EditorTheme, previous?: EditorTheme, expectedRoot?: FileSystemDirectoryHandle): Promise<boolean> => {
    const root = directoryRef.current;
    if (!root || editorWorkspaceIssue || editorThemeOperationRef.current || (expectedRoot && root !== expectedRoot)) return false;
    editorThemeOperationRef.current = true;
    setEditorWorkspaceBusy(true);
    try {
      const theme = parseEditorThemeJson(JSON.stringify(input));
      const renamed = previous && previous.id !== theme.id;
      const savedAppearance = editorWorkspaceRef.current.appearance;
      const appearanceUsesOldId = Boolean(renamed && previous.id !== BASE_EDITOR_THEME.id && JSON.stringify(replaceEditorAppearanceThemeId(savedAppearance, previous.id, theme.id)) !== JSON.stringify(savedAppearance));
      await saveEditorTheme(root, theme, previous, appearanceUsesOldId ? {
        commit: async () => {
          const updated = await persistEditorWorkspace(current => setEditorAppearance(current, replaceEditorAppearanceThemeId(current.appearance, previous!.id, theme.id)), productText("controller.theEditorThemeFilenameAndAppearanceReferenceAreSynchronized"));
          setEditorWorkspaceBusy(true);
          if (!updated) throw new ProductError("controller.theAppearanceReferenceCouldNotBeSavedThemeFileRenamingWasCancelled");
        },
        rollback: async () => {
          const restored = await persistEditorWorkspace(current => setEditorAppearance(current, replaceEditorAppearanceThemeId(current.appearance, theme.id, previous!.id)), productText("controller.themeRenamingDidNotCompleteTheAppearanceReferenceWasRestored"));
          setEditorWorkspaceBusy(true);
          if (!restored) throw new ProductError("controller.theThemeFileWasRolledBackButTheAppearanceReferenceCouldNot");
        },
      } : undefined);
      const library = await loadEditorThemeLibrary(root);
      if (directoryRef.current !== root) return false;
      setEditorThemes(library.themes);
      setEditorThemeIssues(library.issues);
      setStatus({ ...productLabel("controller.savedEditorTheme", { "themeName": theme.name }), tone: 'success' });
      return true;
    } catch (error) {
      if (directoryRef.current === root) setStatus({ ...productErrorLabel(error), tone: 'error' });
      return false;
    } finally {
      editorThemeOperationRef.current = false;
      if (directoryRef.current === root) setEditorWorkspaceBusy(false);
    }
  }, [editorWorkspaceIssue, persistEditorWorkspace]);

  const loadDefaultEditorThemes = useCallback(async (): Promise<boolean> => {
    const root = directoryRef.current;
    if (!root || editorWorkspaceIssue || editorThemeOperationRef.current) return false;
    editorThemeOperationRef.current = true;
    setEditorWorkspaceBusy(true);
    try {
      await initializeLocalFonts(root, () => directoryRef.current === root);
      const result = await copyDefaultThemes(root, 'editor-themes');
      const library = await loadEditorThemeLibrary(root);
      if (directoryRef.current !== root) return false;
      setEditorThemes(library.themes); setEditorThemeIssues([...library.issues, ...result.issues]);
      setStatus({ ...productLabel("controller.defaultEditorThemesAddedExistingThemesSkipped", { "resultAdded": result.added, "resultSkipped": result.skipped }), tone: result.issues.length ? 'warning' : 'success' });
      return !result.issues.length;
    } catch (error) { if (directoryRef.current === root) setStatus({ label: String(error), tone: 'error' }); return false; }
    finally { editorThemeOperationRef.current = false; if (directoryRef.current === root) setEditorWorkspaceBusy(false); }
  }, [editorWorkspaceIssue]);

  const removeEditorTheme = useCallback(async (id: string, expectedRoot?: FileSystemDirectoryHandle): Promise<boolean> => {
    const root = directoryRef.current;
    const appearance = editorWorkspaceRef.current.appearance;
    const referenced = [appearance.themeId, appearance.custom?.colorThemeId, appearance.custom?.fontThemeId];
    if (!root || editorWorkspaceIssue || editorThemeOperationRef.current || (expectedRoot && root !== expectedRoot) || id === BASE_EDITOR_THEME.id || referenced.includes(id)) return false;
    editorThemeOperationRef.current = true;
    setEditorWorkspaceBusy(true);
    try {
      await deleteEditorTheme(root, id);
      const library = await loadEditorThemeLibrary(root);
      if (directoryRef.current !== root) return false;
      setEditorThemes(library.themes); setEditorThemeIssues(library.issues);
      setStatus({ ...productLabel("controller.editorThemeDeleted"), tone: 'success' }); return true;
    } catch (error) { if (directoryRef.current === root) setStatus({ label: String(error), tone: 'error' }); return false; }
    finally { editorThemeOperationRef.current = false; if (directoryRef.current === root) setEditorWorkspaceBusy(false); }
  }, [editorWorkspaceIssue]);

  const setEditorColorMode = useCallback((colorMode: EditorAppearance['colorMode']) => {
    const root = directoryRef.current;
    if (root) {
      return saveEditorAppearance({ ...editorWorkspaceRef.current.appearance, colorMode });
    }
    const next = setEditorAppearance(editorWorkspaceRef.current, { ...editorWorkspaceRef.current.appearance, colorMode });
    editorWorkspaceRef.current = next;
    setEditorWorkspace(next);
    setStatus({ ...productLabel("controller.noLibraryIsOpenAppearanceAppliesTemporarilyToThisWindow"), tone: 'neutral' });
    return Promise.resolve(true);
  }, [saveEditorAppearance]);

  const resetCurrentEditorAppearance = useCallback(() => {
    if (directoryRef.current) return persistEditorWorkspace(resetEditorAppearance, productText("controller.editorAppearanceRestoredToDefaults"));
    const next = resetEditorAppearance(editorWorkspaceRef.current);
    editorWorkspaceRef.current = next;
    setEditorWorkspace(next);
    setStatus({ ...productLabel("controller.defaultAppearanceRestoredNoLibraryIsOpenSoNoFileWasWritten"), tone: 'neutral' });
    return Promise.resolve(true);
  }, [persistEditorWorkspace]);

  const openArticleHistory = useCallback(async () => {
    const target = snapshotFor();
    const root = target.directory;
    if (!root || target.documentToken.root !== root || !mutationQueueRef.current.canSave(target.documentToken)) {
      setHistoryNotice({ ...productLabel("controller.theCurrentDraftDoesNotBelongToTheAuthorizedLibraryNoHistory"), tone: 'warning' });
      return;
    }
    if (!target.folder || !target.month) {
      setHistoryNotice({ ...productLabel("controller.thisNewArticleHasNoDiskHistoryYetSaveItBeforeViewing"), tone: 'warning' });
      return;
    }
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryRefreshPending(false);
    setHistoryNotice({ ...productLabel("controller.loadingHistoricalVersions"), tone: 'warning' });
    try {
      const result = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedHistoryReadingWasCancelled");
        return listArticleHistory(root, target.month!, target.folder!);
      });
      if (directoryRef.current !== root || !matchesSnapshot(target)) return;
      setHistorySnapshots(result.snapshots);
      setHistoryIssues(result.issues);
      setHistorySelectedId(result.snapshots[0]?.id ?? null);
      if (!historyBaselineRef.current || historyBaselineRef.current.root !== root || historyBaselineRef.current.articleId !== target.articleId) {
        historyBaselineRef.current = { root, articleId: target.articleId, fingerprint: null, initialized: false };
      }
      setHistoryNotice({ ...(result.issues.length ? productLabel("controller.completeVersionsLoadedDamagedOrIncompleteRecordsExcludedFromRestore", { "result_snapshotsCount": result.snapshots.length, "result_issuesCount": result.issues.length }) : productLabel("controller.historicalVersionsLoaded", { "result_snapshotsCount": result.snapshots.length })), tone: result.issues.length ? 'warning' : 'neutral' });
      setHistoryDialogOpen(true);
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(target)) setHistoryNotice({ ...productLabel("controller.historyReadingFailed", { "cause": productCause(error) }), tone: 'error' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [beginHistoryOperation, finishHistoryOperation, matchesSnapshot, snapshotFor]);

  const createManualHistorySnapshot = useCallback(async () => {
    const root = directoryRef.current;
    let target = snapshotFor();
    if (!root || target.directory !== root || target.documentToken.root !== root) return;
    if (target.folder && target.month && getArticleOrganization(editorWorkspaceRef.current, target.articleId).archived) {
      setHistoryNotice({ ...productLabel("controller.archivedArticlesAreReadOnlyAHistoricalVersionCannotBeCreated"), tone: 'warning' });
      return;
    }
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryNotice({ ...productLabel("controller.savingAnImportantVersion"), tone: 'warning' });
    try {
      if (!target.folder || !target.month) {
        const archived = await saveSnapshot(target);
        if (!archived.ok || !archived.current || !archived.savedSnapshot) throw new ProductError("controller.draftArchivingFailedTheImportantVersionWasNotCreated");
        target = archived.savedSnapshot;
      }
      const result = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedNoSnapshotWasCreated");
        return createArticleSnapshot(root, target.month!, target.folder!, target.source, target.theme, {
          kind: 'manual', maxAutoSnapshots: articleSettings.autoSnapshot.maxCount,
        });
      });
      if (directoryRef.current !== root || !matchesSnapshot(target)) return;
      setHistorySelectedId(result.snapshot.id);
      historyBaselineRef.current = { root, articleId: target.articleId, fingerprint: articleFingerprint(target.source, target.theme), initialized: true };
      const cleanupNote = result.cleanupIssues.length ? productReference("controller.automaticCleanupNotes", { "details": result.cleanupIssues.join('；') }) : '';
      setHistoryRefreshPending(true);
      try {
        const history = await mutationQueueRef.current.run(async () => {
          if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedListRefreshWasCancelled");
          return listArticleHistory(root, target.month!, target.folder!);
        });
        if (directoryRef.current !== root || !matchesSnapshot(target)) return;
        setHistorySnapshots(history.snapshots);
        setHistoryIssues(history.issues);
        setHistoryRefreshPending(false);
        setHistoryNotice({ ...(result.created ? productLabel("controller.importantVersionSaved", { "result_snapshotId": result.snapshot.id, "cleanupNote": cleanupNote }) : productLabel("controller.contentMatchesAnExistingVersionNoDuplicateWasWritten", { "result_snapshotId": result.snapshot.id, "cleanupNote": cleanupNote })), tone: result.cleanupIssues.length ? 'warning' : 'success' });
      } catch (error) {
        if (directoryRef.current === root && matchesSnapshot(target)) setHistoryNotice({ ...productLabel("controller.importantVersionSavedButTheHistoryListCouldNotRefreshRetryRefresh", { "result_snapshotId": result.snapshot.id, "cause": productCause(error) }), tone: 'warning' });
      }
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(target)) setHistoryNotice({ ...productLabel("controller.importantVersionSavingFailed", { "cause": productCause(error) }), tone: 'error' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [articleSettings.autoSnapshot.maxCount, beginHistoryOperation, finishHistoryOperation, matchesSnapshot, saveSnapshot, snapshotFor]);

  const toggleHistoryRetention = useCallback(async (snapshot: ArticleHistorySnapshot, retained: boolean) => {
    const root = directoryRef.current;
    const current = snapshotFor();
    if (!root || !current.month || !current.folder || current.documentToken.root !== root) return;
    const lease = beginHistoryOperation();
    if (!lease) return;
    let updated: Awaited<ReturnType<typeof setArticleSnapshotRetained>>;
    try {
      updated = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(current) || !mutationQueueRef.current.canSave(current.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedSnapshotProtectionWasNotModified");
        return setArticleSnapshotRetained(root, current.month!, current.folder!, snapshot.id, retained);
      });
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(current)) setHistoryNotice({ ...productLabel("controller.protectionUpdateFailed", { "cause": productCause(error) }), tone: 'error' });
      finishHistoryOperation(lease);
      return;
    }
    if (directoryRef.current !== root || !matchesSnapshot(current)) {
      finishHistoryOperation(lease);
      return;
    }
    setHistoryRefreshPending(true);
    try {
      const history = await mutationQueueRef.current.run(() => listArticleHistory(root, current.month!, current.folder!));
      if (directoryRef.current !== root || !matchesSnapshot(current)) return;
      setHistorySnapshots(history.snapshots);
      setHistoryIssues(history.issues);
      setHistoryRefreshPending(false);
      setHistoryNotice({ ...(updated.retained ? productLabel("controller.thisAutomaticVersionIsProtectedAndWillNotBeCleanedAutomatically") : productLabel("controller.protectionRemovedCleanupPolicyAppliesToLaterAutomaticSnapshots")), tone: 'success' });
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(current)) setHistoryNotice({ ...productLabel("controller.protectionWasSavedButTheHistoryListCouldNotRefreshRetryRefresh", { "cause": productCause(error) }), tone: 'warning' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [beginHistoryOperation, finishHistoryOperation, matchesSnapshot, snapshotFor]);

  const refreshArticleHistory = useCallback(async () => {
    const root = directoryRef.current;
    const current = snapshotFor();
    if (!root || !current.month || !current.folder || current.documentToken.root !== root) return;
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryRefreshPending(true);
    setHistoryNotice({ ...productLabel("controller.refreshingTheHistoryListWithoutWritingFiles"), tone: 'warning' });
    try {
      const history = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(current) || !mutationQueueRef.current.canSave(current.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedHistoryRefreshWasCancelled");
        return listArticleHistory(root, current.month!, current.folder!);
      });
      if (directoryRef.current !== root || !matchesSnapshot(current)) return;
      setHistorySnapshots(history.snapshots);
      setHistoryIssues(history.issues);
      setHistoryRefreshPending(false);
      setHistoryNotice({ ...productLabel("controller.historyListRefreshedCompleteVersions", { "history_snapshotsCount": history.snapshots.length, "value": (history.issues.length ? productReference("controller.unreadableRecords", { "history_issuesCount": history.issues.length }) : '') }), tone: history.issues.length ? 'warning' : 'success' });
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(current)) setHistoryNotice({ ...productLabel("controller.historyRefreshStillFailedProtectionWillNotBeWrittenAgain", { "cause": productCause(error) }), tone: 'warning' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [beginHistoryOperation, finishHistoryOperation, matchesSnapshot, snapshotFor]);

  const restoreHistorySnapshot = useCallback(async (targetSnapshot: ArticleHistorySnapshot) => {
    const current = snapshotFor();
    const root = current.directory;
    if (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, current.articleId).archived) {
      setHistoryNotice({ ...productLabel("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeRestoringAHistorical"), tone: 'warning' });
      return;
    }
    if (!root || !current.folder || !current.month || !current.themeValid || !targetSnapshot.themeMatches) {
      setHistoryNotice({ ...productLabel("controller.restoreRequirementsAreNotMetTheCurrentThemeSnapshotMustBeValid"), tone: 'error' });
      return;
    }
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryNotice({ ...productLabel("controller.creatingACheckpointBeforeRestore"), tone: 'warning' });
    try {
      const result = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(current) || !mutationQueueRef.current.canSave(current.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedRestoreWasCancelled");
        const checkpoint = await createArticleSnapshot(root, current.month!, current.folder!, current.source, current.theme, {
          kind: 'before-restore', maxAutoSnapshots: articleSettings.autoSnapshot.maxCount,
        });
        if (directoryRef.current !== root || documentTokenRef.current !== current.documentToken || !mutationQueueRef.current.canSave(current.documentToken)) {
          throw new ProductError("controller.checkpointSavedAsButTheArticleSessionChangedTheTargetArticleWas", { "checkpoint_snapshotId": checkpoint.snapshot.id });
        }
        let restored: Awaited<ReturnType<typeof saveStoredArticle>>;
        try {
          restored = await saveStoredArticle(root, targetSnapshot.source, targetSnapshot.theme, current.folder, current.month, { renderRecord: targetSnapshot.renderRecord ?? null });
        } catch (error) {
          throw new ProductError("controller.articleMdWritingFailedTheOriginalManuscriptWasNotOverwrittenCheckpointIs", { "cause": productCause(error), "checkpoint_snapshotId": checkpoint.snapshot.id });
        }
        if (!restored.article.themeValid) {
          let rollback: Awaited<ReturnType<typeof saveStoredArticle>>;
          try {
            rollback = await saveStoredArticle(root, current.source, current.theme, current.folder, current.month, { renderRecord: current.renderRecord ?? null });
          } catch (rollbackError) {
            throw new ProductError("controller.themeJsonWritingFailedAndRollbackIsIncompleteRestoreManuallyFromCheckpoint", { "cause": productCause(rollbackError), "checkpoint_snapshotId": checkpoint.snapshot.id });
          }
          if (!rollback.article.themeValid) throw new ProductError("controller.themeJsonWritingFailedAndTheRolledBackThemeRemainsInvalidRestore", { "checkpoint_snapshotId": checkpoint.snapshot.id });
          throw new ProductError("controller.themeJsonWritingOrValidationFailedTheCheckpointRestoredTheCurrentBody", { "checkpoint_snapshotId": checkpoint.snapshot.id });
        }
        return { restored, checkpointId: checkpoint.snapshot.id };
      });
      if (directoryRef.current !== root || documentTokenRef.current !== current.documentToken || !mutationQueueRef.current.canSave(current.documentToken)) return;
      await applyStoredArticle(result.restored.article, true, root);
      historyBaselineRef.current = { root, articleId: result.restored.article.id, fingerprint: articleFingerprint(targetSnapshot.source, targetSnapshot.theme), initialized: true };
      let refreshError: unknown;
      setHistoryRefreshPending(true);
      try {
        const history = await mutationQueueRef.current.run(async () => {
          if (directoryRef.current !== root || articleId(articleRef.current) !== result.restored.article.id) throw new ProductError("controller.theCurrentArticleChangedOnlyThePreviousHistoryViewRefreshWasSkipped");
          await loadStoredArticles(root);
          return listArticleHistory(root, current.month!, current.folder!);
        });
        if (directoryRef.current === root && articleId(articleRef.current) === result.restored.article.id) {
          setHistorySnapshots(history.snapshots);
          setHistoryIssues(history.issues);
          setHistoryRefreshPending(false);
        }
      } catch (error) { refreshError = error; }
      if (directoryRef.current !== root || articleId(articleRef.current) !== result.restored.article.id) return;
      const notes = [
        result.restored.indexUpdated ? result.restored.indexError : productReference("controller.theMonthlyIndexWasNotUpdated", { "value": (result.restored.indexError ?? productReference("controller.unknownError")) }),
        refreshError ? productReference("controller.historyOrArticleListRefreshFailed", { "cause": productCause(refreshError) }) : '',
      ].filter(Boolean);
      const detail = notes.length ? productJoin(['；', productJoin(notes, '；')]) : '';
      setHistoryNotice({ ...productLabel("controller.selectedVersionRestoredContentFromBeforeRestoreIsRetainedIn", { "resultCheckpointId": result.checkpointId, "detail": detail }), tone: notes.length ? 'warning' : 'success' });
      setStatus({ ...productLabel("controller.historicalVersionRestoredContentFromBeforeRestoreIsRetainedIn", { "resultCheckpointId": result.checkpointId, "detail": detail }), tone: notes.length ? 'warning' : 'success' });
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(current)) setHistoryNotice({ ...productErrorLabel(error), tone: 'error' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [articleSettings.autoSnapshot.maxCount, applyStoredArticle, beginHistoryOperation, finishHistoryOperation, loadStoredArticles, matchesSnapshot, snapshotFor]);

  const saveHistoryAsArticle = useCallback(async (selected: ArticleHistorySnapshot, title: string, targetMonth: string) => {
    const current = snapshotFor();
    const root = current.directory;
    const cleanTitle = title.trim();
    const persisted = storedArticles.find((item) => item.id === current.articleId);
    if (!root || !current.folder || !current.month || !cleanTitle || !selected.themeMatches || !persisted || !current.themeValid || persisted.parse.diagnostics.some((item) => item.level === 'error')) {
      setHistoryNotice({ ...productLabel("controller.anIndependentCopyCannotBeCreatedSafelyAValidCurrentArticleMatching"), tone: 'error' });
      return;
    }
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryNotice({ ...productLabel("controller.copyingArticleAssetsAndCreatingAnIndependentVersion"), tone: 'warning' });
    try {
      const result = await mutationQueueRef.current.run(async () => {
        if (!matchesSnapshot(current) || !mutationQueueRef.current.canSave(current.documentToken)) throw new ProductError("controller.theArticleOrLibraryChangedCopyCreationWasCancelled");
        const carrier = await copyStoredArticle(root, current.month!, current.folder!, cleanTitle, targetMonth);
        const timestamp = new Date().toISOString();
        const source = updateFrontMatter(selected.source, {
          title: cleanTitle,
          createdAt: timestamp,
          updatedAt: timestamp,
          theme: { id: selected.theme.id, version: selected.theme.version },
        });
        try {
          const saved = await saveStoredArticle(root, source, selected.theme, carrier.article.folder, carrier.article.month, { renderRecord: selected.renderRecord ?? null });
          if (!saved.article.themeValid) throw new ProductError("controller.themeJsonValidationFailed", { "details": productJoin(saved.article.parse.diagnostics.map(productDiagnosticReference), '；') });
          return { article: saved.article, folderCollision: carrier.folderCollision, indexUpdated: saved.indexUpdated, indexError: saved.indexError };
        } catch (error) {
          try { await deleteStoredArticle(root, carrier.article.month, carrier.article.folder); }
          catch (cleanupError) { throw new ProductError("controller.historicalCopyInitializationFailedCleanupOfIncompleteCopyAlsoFailed", { "cause": productCause(error), "carrier_articleMonth": carrier.article.month, "carrier_articleFolder": carrier.article.folder, "cause2": productCause(cleanupError) }); }
          throw error;
        }
      });
      if (directoryRef.current !== root) return;
      setStoredArticles((items) => upsertStoredArticle(items, result.article));
      if (!matchesSnapshot(current)) return;
      const indexNote = result.indexUpdated ? (result.indexError ? productReference("controller.indexRebuilt", { "resultIndexError": result.indexError }) : '') : productReference("controller.monthlyIndexNotUpdated", { "value": (result.indexError ?? productReference("controller.unknownError")) });
      setHistoryNotice({ ...productLabel("controller.savedAnIndependentArticleItsBodyUsesTheSelectedHistoricalVersionAssets", { "result_article_parse_metadataTitle": result.article.parse.metadata.title, "indexNote": indexNote }), tone: result.indexUpdated && !result.indexError ? 'success' : 'warning' });
    } catch (error) {
      if (directoryRef.current === root && matchesSnapshot(current)) setHistoryNotice({ ...productLabel("controller.saveAsFailedTheOriginalManuscriptAndHistoryAreUnchanged", { "cause": productCause(error) }), tone: 'error' });
    } finally {
      finishHistoryOperation(lease);
    }
  }, [beginHistoryOperation, finishHistoryOperation, matchesSnapshot, snapshotFor, storedArticles]);

  const insertImagesIntoDraft = useCallback((target: ArticleSnapshot, fileNames: string[], selection: { start: number; end: number }): MediaActionOutcome => {
    const notice = (message: string, tone: MediaActionOutcome['tone'], ok = false): MediaActionOutcome => {
      if (directoryRef.current === target.directory) setStatus({ label: message, tone });
      return { ok, message, tone };
    };
    if (!matchesSnapshot(target) || target.documentToken.root !== target.directory || target.documentToken.articleId !== target.articleId || !mutationQueueRef.current.canSave(target.documentToken)) return notice(productText("controller.theManuscriptChangedNoImageReferenceWasInserted"), 'warning');
    if (getArticleOrganization(editorWorkspaceRef.current, target.articleId).archived) return notice(productText("controller.theArticleIsArchivedAndReadOnlyNoImageReferenceWasInserted"), 'warning');
    if (!target.themeValid || !parseArticle(target.source).canCopy) return notice(productText("controller.repairMetadataOrTheThemeSnapshotFirstNoImageReferenceWasInserted"), 'error');
    const body = parseArticle(target.source).body;
    const selected = { start: Math.min(body.length, Math.max(0, selection.start)), end: Math.min(body.length, Math.max(0, selection.end)) };
    const nextBody = insertArticleImageReferences(body, fileNames, selected);
    const textarea = sourceTextareaRef.current;
    if (!textarea || textarea.value !== body) return notice(productText("controller.theImageFileIsRetainedButTheBodyInputIsUnavailableNo"), 'warning');
    let start = selected.start, end = selected.end;
    let text = nextBody.slice(start, nextBody.length - (body.length - end));
    if (body.slice(0, start) + text + body.slice(end) !== nextBody) { start = 0; end = body.length; text = nextBody; }
    const wasDisabled = textarea.disabled;
    textarea.disabled = false;
    let inserted = false;
    try { inserted = insertUndoableText(textarea, text, start, end, () => parseArticle(articleRef.current.source).body, updateArticleBody); }
    finally { textarea.disabled = wasDisabled; }
    if (!inserted) return notice(productText("controller.theImageFileIsRetainedButTheBrowserCouldNotCreateAn"), 'warning');
    void compileCurrent();
    return notice(productText("controller.imagesInsertedSaveTheManuscriptToRetainTheseReferences", { "fileNamesCount": fileNames.length }), 'warning', true);
  }, [compileCurrent, matchesSnapshot, updateArticleBody]);

  const importImagesWithResult = useCallback(async (files: File[], selection: { start: number; end: number }): Promise<MediaActionOutcome> => {
    const root = directoryRef.current;
    const rootSession = contentLibraryRootSessionRef.current;
    const notice = (message: string, tone: MediaActionOutcome['tone'], ok = false): MediaActionOutcome => {
      if (directoryRef.current === root && contentLibraryRootSessionRef.current === rootSession) setStatus({ label: message, tone });
      return { ok, message, tone };
    };
    if (!files.length) return notice(productText("controller.noImagesSelected"), 'warning');
    if (mediaOperationRef.current || historyOperationRef.current) return notice(productText("controller.anotherAssetOrHistoryOperationIsInProgressImagesWereNotImported"), 'warning');
    if (!root) return notice(productText("controller.chooseALibraryFirstImagesWereNotImported"), 'warning');
    const initial = snapshotFor();
    if (initial.folder && initial.month && getArticleOrganization(editorWorkspaceRef.current, initial.articleId).archived) return notice(productText("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeImportingImages"), 'warning');
    if (initial.directory !== root || initial.documentToken.root !== root || initial.documentToken.articleId !== initial.articleId || !mutationQueueRef.current.canSave(initial.documentToken)) return notice(productText("controller.theCurrentManuscriptDoesNotBelongToTheSelectedLibraryImagesWere"), 'warning');
    if (!parseArticle(initial.source).canCopy) return notice(productText("controller.repairTheManuscriptMetadataFirstImagesWereNotImported"), 'error');
    mediaOperationRef.current = true;
    setMediaOperation('import');
    notice(initial.folder ? productText("controller.savingImagesToTheCurrentArticle") : productText("controller.creatingTheArticleArchiveAndThemeSnapshot"), 'warning');
    try {
      let target = initial;
      if (!target.folder || !target.month) {
        const saved = await saveSnapshot(target);
        if (!saved.ok || !saved.current || !saved.savedSnapshot) return notice(productText("controller.articleArchivingDidNotCompleteNoImagesWereWrittenOrTemporaryReferences"), 'error');
        if (!saved.result?.article.themeValid || !saved.savedSnapshot.themeValid) return notice(productText("controller.theManuscriptWasSavedButItsThemeSnapshotCouldNotBeVerified"), 'error');
        target = saved.savedSnapshot;
        const request = mediaPickerRequestRef.current;
        if (request && request.root === root && request.articleId === initial.articleId) {
          const updated = { ...request, articleId: target.articleId, documentToken: target.documentToken, body: parseArticle(target.source).body };
          mediaPickerRequestRef.current = updated;
          setMediaPickerRequest(updated);
        }
      } else if (!target.themeValid) return notice(productText("controller.theCurrentArticleThemeSnapshotIsInvalidImagesWereNotImported"), 'error');
      if (!target.folder || !target.month || !matchesSnapshot(target) || contentLibraryRootSessionRef.current !== rootSession) return notice(productText("controller.theManuscriptOrLibraryChangedImagesWereNotImported"), 'warning');
      const result = await mutationQueueRef.current.run(async () => {
        const imported: Awaited<ReturnType<typeof importArticleImage>>[] = [];
        const failures: string[] = [];
        const current = () => matchesSnapshot(target) && mutationQueueRef.current.canSave(target.documentToken) && contentLibraryRootSessionRef.current === rootSession;
        if (!current()) return { stale: true, imported, failures };
        const directory = await getArticleMediaDirectory(root, target.month!, target.folder!, true);
        for (const file of files) {
          if (!current()) return { stale: true, imported, failures };
          try { imported.push(await importArticleImage(directory, file)); }
          catch (error) { failures.push(productText("controller.message", { "value": (file.name || productReference("snippetCategoryIcons.image")), "cause": productCause(error) })); }
        }
        return { stale: !current(), imported, failures };
      });
      if (result.imported.length && directoryRef.current === root && contentLibraryRootSessionRef.current === rootSession) setMediaRefreshRevision((revision) => revision + 1);
      if (result.stale || !matchesSnapshot(target)) return notice(productText("controller.theImageOperationFinishedButTheManuscriptChangedNoReferencesWereInserted"), 'warning');
      if (!result.imported.length) return notice(productText("controller.imagesWereNotImported", { "details": (result.failures.length ? `：${result.failures.join('；')}` : productReference("controller.theOriginalManuscriptIsUnchanged")) }), 'error');
      const inserted = insertImagesIntoDraft(target, result.imported.map((image) => image.fileName), selection);
      if (inserted.ok && result.failures.length) return notice(productText("controller.additionalImagesNotImported", { "insertedMessage": inserted.message, "result_failuresCount": result.failures.length, "details": result.failures.join('；') }), 'warning', true);
      return inserted;
    } catch (error) { return notice(productText("controller.imageImportFailedNoTemporaryReferencesWereInserted", { "cause": productCause(error) }), 'error'); }
    finally { mediaOperationRef.current = false; setMediaOperation(null); }
  }, [insertImagesIntoDraft, matchesSnapshot, saveSnapshot, snapshotFor]);

  const importImages = useCallback(async (files: File[], selection: { start: number; end: number }) => {
    await importImagesWithResult(files, selection);
  }, [importImagesWithResult]);

  const importSharedFiles = useCallback(async (files: File[]): Promise<MediaActionOutcome> => {
    const root = directoryRef.current, session = contentLibraryRootSessionRef.current;
    const current = () => directoryRef.current === root && contentLibraryRootSessionRef.current === session;
    const notice = (message: string, tone: MediaActionOutcome['tone'], ok = false): MediaActionOutcome => {
      if (current()) setStatus({ label: message, tone });
      return { ok, message, tone };
    };
    if (!root) return notice(productText("controller.openALibraryFirst"), 'warning');
    if (mediaOperationRef.current || historyOperationRef.current) return notice(productText("controller.anotherAssetOrHistoryOperationIsInProgress"), 'warning');
    if (!files.length) return notice(productText("controller.noImagesSelected"), 'warning');
    mediaOperationRef.current = true; setMediaOperation('import');
    notice(productText("controller.importingSharedImages"), 'warning');
    try {
      const result = await mutationQueueRef.current.run(async () => {
        let imported = 0;
        const failures: string[] = [];
        for (const file of files) {
          if (!current()) break;
          try { await importSharedImage(root, file, current); imported += 1; }
          catch (error) { failures.push(productText("controller.message", { "value": (file.name || productReference("snippetCategoryIcons.image")), "cause": productCause(error) })); }
        }
        return { imported, failures };
      });
      if (!current()) return { ok: false, ...productMessage("controller.theLibraryChangedImportedFilesRemainInTheOriginalLibrary"), tone: 'warning' };
      if (result.imported) setMediaRefreshRevision((revision) => revision + 1);
      const failure = result.failures.length ? `；${result.failures.join('；')}` : '';
      return notice(result.imported ? productText("controller.sharedImagesImported", { "resultImported": result.imported, "failure": failure }) : productText("controller.sharedImagesWereNotImported", { "failure": failure }), result.failures.length ? 'warning' : result.imported ? 'success' : 'error', result.imported > 0);
    } catch (error) { return notice(productText("mediaLibrary.sharedImageImportFailed", { "cause": productCause(error) }), 'error'); }
    finally { mediaOperationRef.current = false; setMediaOperation(null); }
  }, []);

  const openMediaPicker = useCallback((initialAsset?: LibraryMediaAsset) => {
    const current = articleRef.current, root = directoryRef.current;
    if (!root || !current.source.trim() || !parseArticle(current.source).canCopy || !current.themeValid || (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, articleId(current)).archived)) {
      setStatus({ ...productLabel("controller.openAnEditableArticleBeforeInsertingAnImage"), tone: 'warning' }); return;
    }
    if (mediaOperationRef.current || historyOperationRef.current || formatCheckResolveRef.current) return;
    if (!documentTokenRef.current || documentTokenRef.current.root !== root || documentTokenRef.current.articleId !== articleId(current)) return;
    if (initialAsset && initialAsset.root !== root) return;
    const body = parseArticle(current.source).body, textarea = sourceTextareaRef.current;
    const remembered = lastImageSelectionRef.current;
    const selection = textarea && textarea.value === body ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : remembered?.articleId === articleId(current) && remembered.body === body ? { start: remembered.start, end: remembered.end }
      : { start: body.length, end: body.length };
    const request = { id: ++mediaPickerIdRef.current, root, sessionKey: contentLibraryRootSessionRef.current, articleId: articleId(current), documentToken: documentTokenRef.current, body, selection, initialAsset };
    mediaPickerRequestRef.current = request; setMediaPickerRequest(request);
    setMediaTarget(null); setArticleInfoDialogOpen(false); setShowThemeDialog(false); setShowTemplateDialog(false); setCopyTarget(null); setDeleteTargets([]); setProjectDeleteTarget(null); setCreateLibraryDialogOpen(false);
    setMobilePane('source');
    navigateArticleMode('editor');
  }, [navigateArticleMode]);

  const closeMediaPicker = useCallback(() => {
    mediaPickerRequestRef.current = null; setMediaPickerRequest(null);
    window.requestAnimationFrame(() => sourceTextareaRef.current?.focus());
  }, []);

  const adoptLibraryImage = useCallback(async (asset: LibraryMediaAsset): Promise<MediaActionOutcome> => {
    const request = mediaPickerRequestRef.current;
    const valid = () => Boolean(request && mediaPickerRequestRef.current?.id === request.id && directoryRef.current === request.root && contentLibraryRootSessionRef.current === request.sessionKey && documentTokenRef.current === request.documentToken && articleId(articleRef.current) === request.articleId && parseArticle(articleRef.current.source).body === request.body);
    if (!request || asset.root !== request.root || !valid()) return { ok: false, ...productMessage("controller.theManuscriptOrLibraryChangedReopenTheImagePicker"), tone: 'warning' };
    try {
      const file = await asset.handle.getFile();
      await inspectArticleImage(file);
      if (!valid()) return { ok: false, ...productMessage("controller.theManuscriptChangedWhileReadingNoReferenceWasInserted"), tone: 'warning' };
      if (asset.kind === 'article' && asset.articleId === request.articleId) {
        if (mediaOperationRef.current || historyOperationRef.current) return { ok: false, ...productMessage("controller.anotherOperationIsInProgress"), tone: 'warning' };
        mediaOperationRef.current = true; setMediaOperation('import');
        try { return insertImagesIntoDraft(snapshotFor(), [asset.fileName], request.selection); }
        finally { mediaOperationRef.current = false; setMediaOperation(null); }
      }
      return await importImagesWithResult([file], request.selection);
    } catch (error) { return { ok: false, ...productMessage("controller.imageInsertionFailedTheOriginalManuscriptAndImageAreRetained", { "cause": productCause(error) }), tone: 'error' }; }
  }, [importImagesWithResult, insertImagesIntoDraft, snapshotFor]);

  useEffect(() => {
    const request = mediaPickerRequestRef.current;
    if (request && !mediaOperationRef.current && (directory !== request.root || contentLibraryRootSession !== request.sessionKey || documentTokenRef.current !== request.documentToken || articleId(article) !== request.articleId || parseArticle(article.source).body !== request.body)) closeMediaPicker();
  }, [article, directory, contentLibraryRootSession, currentDocumentGeneration, mediaOperation, closeMediaPicker]);

  const renameMediaImage = useCallback(async (asset: ArticleMediaAsset, baseName: string, replacement?: File): Promise<MediaRenameOutcome> => {
    if (mediaOperationRef.current) return { fileCreated: false, ...productMessage("controller.anotherAssetOperationIsInProgressTryAgainLater"), tone: 'warning' };
    const root = asset.root;
    const rootSession = contentLibraryRootSessionRef.current;
    if (getArticleOrganization(editorWorkspaceRef.current, asset.articleId).archived) {
      return { fileCreated: false, ...productMessage("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeRenamingImages"), tone: 'warning' };
    }
    const initialToken = documentTokenRef.current;
    const ownerIsCurrent = directoryRef.current === root && initialToken?.root === root && initialToken.articleId === asset.articleId && articleId(articleRef.current) === asset.articleId;
    if (directoryRef.current !== root) return { fileCreated: false, ...productMessage("controller.theLibraryChangedNothingWasRenamedOrWrittenReloadTheAssetList"), tone: 'warning' };
    if (!ownerIsCurrent && articleRef.current.dirty) return { fileCreated: false, ...productMessage("controller.theCurrentManuscriptHasUnsavedChangesSaveOrResolveThemBeforeRenaming"), tone: 'warning' };

    mediaOperationRef.current = true;
    setMediaOperation('rename');
    setStatus({ ...productLabel("controller.creatingANewFileForAndUpdatingArticleReferences", { "assetFileName": asset.fileName }), tone: 'warning' });
    const createdRef: { value: Awaited<ReturnType<typeof copyArticleImageAs>> | null } = { value: null };
    const removedSourceRef = { value: false };
    try {
      const result = await mutationQueueRef.current.run(async () => {
        const isRootCurrent = () => directoryRef.current === root && contentLibraryRootSessionRef.current === rootSession;
        if (!isRootCurrent()) return { fileCreated: false, ...productMessage("controller.theLibrarySessionChangedNoNewFileWasWritten"), tone: 'warning' as const };

        let source: string;
        let folder = asset.folder;
        let month = asset.month;
        let theme: ThemeConfig;
        let currentDocument = false;

        if (ownerIsCurrent) {
          if (!initialToken || documentTokenRef.current !== initialToken || !mutationQueueRef.current.canSave(initialToken)) {
            return { fileCreated: false, ...productMessage("controller.theArticleSessionChangedOrDeletionIsInProgressNoNewFile"), tone: 'warning' as const };
          }
          source = articleRef.current.source;
          folder = articleRef.current.folder ?? asset.folder;
          month = articleRef.current.month ?? asset.month;
          theme = articleRef.current.theme;
          currentDocument = true;
        } else {
          const storedArticles = await listStoredArticles(root);
          if (!isRootCurrent()) return { fileCreated: false, ...productMessage("controller.theLibrarySessionChangedNoNewFileWasWritten"), tone: 'warning' as const };
          const stored = storedArticles.find((item) => item.id === asset.articleId);
          if (!stored) return { fileCreated: false, ...productMessage("controller.theOwningArticleIsNoLongerInThisLibraryNoNewFile"), tone: 'warning' as const };
          source = stored.source;
          folder = stored.folder;
          month = stored.month;
          theme = stored.theme;
        }

        const imageDirectory = await getArticleMediaDirectory(root, month, folder, false);
        if (!isRootCurrent()) return { fileCreated: false, ...productMessage("controller.theLibrarySessionChangedNoNewFileWasWritten"), tone: 'warning' as const };
        await readMediaMetadata(imageDirectory);
        if (!isRootCurrent()) throw new ProductError("controller.theLibrarySessionChangedNoNewFileWasWritten2");
        createdRef.value = replacement ? await importArticleImage(imageDirectory, new File([replacement], `${baseName}.${replacement.name.split('.').at(-1) ?? 'png'}`)) : await copyArticleImageAs(imageDirectory, asset.handle, baseName);
        if (isRootCurrent()) setMediaRefreshRevision((revision) => revision + 1);
        const created = createdRef.value;
        if (created && asset.description && isRootCurrent()) await saveMediaDescription(imageDirectory, created.fileName, asset.description, isRootCurrent);
        if (!created) return { fileCreated: false, ...productMessage("controller.writingTheNewFileReturnedNoFileHandleTheArticleWasNot"), tone: 'warning' as const };
        if (!isRootCurrent()) return { fileCreated: true, fileName: created.fileName, ...productMessage("controller.newImageWasWrittenToTheOriginalLibraryButTheLibraryChanged", { "createdFileName": created.fileName }), tone: 'warning' as const };

        const references = rewriteArticleImageReferences(source, asset.fileName, created.fileName);
        if (!references.count) {
          const usage = await inspectMediaUsage({ ...asset, kind: 'article' }, source);
          if (!isRootCurrent()) return { fileCreated: true, fileName: created.fileName, ...productMessage("controller.newImageSavedTheLibrarySessionChangedTheOriginalFileIsRetained"), tone: 'warning' as const };
          const retained = Boolean(usage.body || usage.history || usage.issues.length);
          if (!retained) { await imageDirectory.removeEntry(asset.fileName); removedSourceRef.value = true; await removeMediaDescription(imageDirectory, asset.fileName, isRootCurrent); }
          const message = productText("controller.imageOperationCompleted", { "value": (replacement ? productReference("mediaManagement.replacedWith") : productReference("mediaManagement.renamedTo")), "createdFileName": created.fileName, "value2": (retained ? productReference("controller.savedBodyOrHistoryStillNeedsTheOriginalFileWhichIsRetained") : productReference("controller.theUnreferencedOriginalFileWasRemoved")) });
          return { fileCreated: true, fileName: created.fileName, message, tone: 'success' as const };
        }
        const nextSource = updateFrontMatter(references.source, { updatedAt: new Date().toISOString() });

        if (currentDocument) {
          if (!isRootCurrent() || documentTokenRef.current !== initialToken || articleId(articleRef.current) !== asset.articleId) {
            return { fileCreated: true, fileName: created.fileName, ...productMessage("controller.newImageWasSavedButTheManuscriptSessionChangedCurrentReferencesWere", { "createdFileName": created.fileName }), tone: 'warning' as const };
          }
          updateArticle(nextSource);
          const saveResult = await performSaveSnapshot(snapshotFor());
          const sourceSaved = saveResult.ok && saveResult.current && Boolean(saveResult.savedSnapshot);
          const indexNote = saveResult.result?.indexError ? productReference("controller.monthlyIndexStatus", { "saveResult_resultIndexError": saveResult.result.indexError }) : '';
          const message = sourceSaved
            ? productText("controller.newImageSavedCurrentManuscriptReferencesWereUpdatedAndSavedOriginalFile", { "createdFileName": created.fileName, "assetFileName": asset.fileName, "indexNote": indexNote })
            : productText("controller.newImageSavedButWritingManuscriptReferencesWasNotConfirmedUnsavedEdits", { "createdFileName": created.fileName, "assetFileName": asset.fileName });
          setStatus({ label: message, tone: sourceSaved && !saveResult.result?.indexError ? 'success' : 'warning' });
          return { fileCreated: true, fileName: created.fileName, message, tone: sourceSaved && !saveResult.result?.indexError ? 'success' as const : 'warning' as const };
        }

        const saved = await saveStoredArticle(root, nextSource, theme, folder, month, { writeTheme: false });
        if (isRootCurrent()) setStoredArticles((items) => upsertStoredArticle(items, saved.article));
        const message = saved.sourceSaved
          ? productText("controller.newImageSavedReferencesInItsOwningArticleWereUpdatedAndSaved", { "createdFileName": created.fileName, "assetFileName": asset.fileName, "value": (saved.indexError ? productReference("controller.monthlyIndexStatus2", { "savedIndexError": saved.indexError }) : '') })
          : productText("controller.newImageSavedButWritingReferencesInItsOwningArticleWasNot", { "createdFileName": created.fileName, "assetFileName": asset.fileName });
        if (isRootCurrent()) setStatus({ label: message, tone: saved.sourceSaved && !saved.indexError ? 'success' : 'warning' });
        return { fileCreated: true, fileName: created.fileName, message, tone: saved.sourceSaved && !saved.indexError ? 'success' as const : 'warning' as const };
      });
      return result;
    } catch (error) {
      if (createdRef.value) {
        const created = createdRef.value;
        const message = productText("controller.newImageSavedButArticleReferenceUpdateFailed", { "createdFileName": created.fileName, "cause": productCause(error), "value": (removedSourceRef.value ? productReference("controller.theOriginalFileWasRemovedButTheDescriptionIndexOrLaterOperation") : productReference("controller.originalFileIsRetained", { "assetFileName": asset.fileName })) });
        if (directoryRef.current === root) setStatus({ label: message, tone: 'warning' });
        return { fileCreated: true, fileName: created.fileName, message, tone: 'warning' };
      }
      throw error;
    } finally {
      mediaOperationRef.current = false;
      setMediaOperation(null);
    }
  }, [performSaveSnapshot, snapshotFor, updateArticle]);

  const runAfterDraftDecision = useCallback((action: PendingAction, protectDraft = true) => {
    if (protectDraft && articleRef.current.dirty) {
      pendingActionRef.current = action;
      setPendingActionLabel(action.label);
      setShowUnsavedDialog(true);
      return;
    }
    void action.run();
  }, []);

  const cancelArticleListCheck = useCallback((clearNotice = false) => { if (articleListAbortRef.current?.kind === 'check') { articleListAbortRef.current.abort(); articleListAbortRef.current = null; setArticleListWork(null); if (!clearNotice) setArticleListNotice({ ...productLabel("controller.checkCancelledCompletedRecordsAreRetained"), tone: 'neutral' }); } if (clearNotice) setArticleListNotice({ label: '', tone: 'neutral' }); }, []);

  const checkArticleList = useCallback(async (targets: ArticleSummary[]) => {
    const root = directoryRef.current;
    if (!root || articleListAbortRef.current) return;
    const abort = Object.assign(new AbortController(), { kind: 'check' as const }); articleListAbortRef.current = abort;
    const formatId = getFormatSnapshot().id;
    const current = () => !abort.signal.aborted && getFormatSnapshot().id === formatId && directoryRef.current === root && articleListAbortRef.current === abort;
    const rows = [...new Map(targets.map(item => [item.id, item])).values()];
    setArticleListWork({ kind: 'check', completed: 0, total: rows.length });
    setArticleListNotice({ ...productLabel("controller.checkingTheCurrentRange"), tone: 'neutral' });
    try {
      for (let index = 0; index < rows.length && current(); index++) {
        const target = rows[index];
        try {
          const stored = await mutationQueueRef.current.run(() => readStoredArticleById(root, target.month, target.folder));
          if (!current()) break;
          const preview = articleFormatPreviewStructure(stored.parse.body);
          const report = await inspectArticleFormatReport(stored.source, stored.theme, preview, { root, month: stored.month, folder: stored.folder }, { signal: abort.signal });
          if (!current()) break;
          setStoredArticles(items => upsertStoredArticle(items, stored));
          setArticleChecks(records => ({ ...records, [stored.id]: articleListCheckResult(stored, report) }));
        } catch (error) {
          if (current()) setArticleChecks(records => ({ ...records, [target.id]: { signature: articleSummarySignature(target), checkedAt: new Date().toISOString(), state: 'failed', warning: 0, error: 0, ...productErrorMessage(error) } }));
        }
        if (current()) setArticleListWork({ kind: 'check', completed: index + 1, total: rows.length });
      }
      if (current()) setArticleListNotice({ ...productLabel("controller.currentRangeCheckedArticlesSeeEachArticleSRecordForDetails", { "rowsCount": rows.length }), tone: 'success' });
    } finally {
      if (articleListAbortRef.current === abort) { articleListAbortRef.current = null; setArticleListWork(null); }
    }
  }, []);

  const rebuildListIndexes = useCallback(async (months: string[]) => {
    const root = directoryRef.current;
    if (!root || articleListAbortRef.current) return;
    const abort = Object.assign(new AbortController(), { kind: 'index' as const }); articleListAbortRef.current = abort;
    setArticleListWork({ kind: 'index', completed: 0, total: months.length });
    try {
      await mutationQueueRef.current.run(() => rebuildArticleIndexes(root, months, abort.signal));
      if (directoryRef.current !== root) return;
      await loadStoredArticles(root);
      setArticleListNotice({ ...productLabel("controller.monthlyIndexRebuiltOriginalManuscriptsAndThemeSnapshotsAreRetained"), tone: 'success' });
    } catch (error) {
      if (directoryRef.current === root) setArticleListNotice({ ...productLabel("controller.indexRebuildFailed", { "cause": productCause(error) }), tone: 'error' });
    } finally {
      if (articleListAbortRef.current === abort) { articleListAbortRef.current = null; setArticleListWork(null); }
    }
  }, [loadStoredArticles]);

  const removeListCategories = useCallback((targets: ArticleSummary[], labels: string[]) => {
    const root = directoryRef.current;
    if (!root || !targets.length || !labels.length || articleListAbortRef.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const run = async () => {
        const abort = Object.assign(new AbortController(), { kind: 'tags' as const }); articleListAbortRef.current = abort;
        const current = () => !abort.signal.aborted && directoryRef.current === root && articleListAbortRef.current === abort;
        setArticleListWork({ kind: 'tags', completed: 0, total: targets.length });
        try {
          const result = await mutationQueueRef.current.run(() => removeArticleCategories(root, targets, labels, { isCurrent: current, isArchived: id => getArticleOrganization(editorWorkspaceRef.current, id).archived }));
          if (directoryRef.current !== root) { resolve(false); return; }
          setStoredArticles(items => result.changed.reduce((next, stored) => upsertStoredArticle(next, stored), items));
          setArticleChecks(records => { const next = { ...records }; for (const item of result.changed) if (next[item.id]) next[item.id] = { ...next[item.id], state: 'stale' }; return next; });
          const active = result.changed.find(item => item.id === articleId(articleRef.current));
          if (active && !articleRef.current.dirty) applyStoredArticle(active, false, root);
          const errors = [...result.failures.map(item => productJoin([item.id, '：', productDiagnosticReference(item)])), ...result.indexIssues.map(item => productJoin([item.month, '：', productDiagnosticReference(item)]))];
          setArticleListNotice({ ...productLabel("controller.articlesWithTagsRemovedUnchanged", { "result_changedCount": result.changed.length, "result_skippedCount": result.skipped.length, "details": (errors.length ? productJoin(['；', productJoin(errors, '；')]) : '。') }), tone: errors.length ? 'warning' : 'success' });
          if (result.indexIssues.length) setArticleIndexIssues(issues => [...issues.filter(item => !result.indexIssues.some(issue => issue.month === item.month)), ...result.indexIssues]);
          resolve(!errors.length);
        } catch (error) {
          if (directoryRef.current === root) setArticleListNotice({ ...productLabel("controller.tagRemovalFailed", { "cause": productCause(error) }), tone: 'error' });
          resolve(false);
        } finally {
          if (articleListAbortRef.current === abort) { articleListAbortRef.current = null; setArticleListWork(null); }
        }
      };
      const protectsDraft = articleRef.current.dirty && targets.some(item => item.id === articleId(articleRef.current));
      runAfterDraftDecision({ label: productText("controller.removeCategoryTagsFromTheCurrentRange"), run, onCancel: () => resolve(false) }, protectsDraft);
    });
  }, [applyStoredArticle, runAfterDraftDecision]);

  const readAndApplyArticle = useCallback(async (stored: ArticleSummary, navigate = true, root = directoryRef.current) => {
    if (!root) return false;
    const request = ++articleOpenRequestRef.current;
    const token = documentTokenRef.current;
    try {
      const loaded = await mutationQueueRef.current.run(() => readStoredArticleById(root, stored.month, stored.folder));
      if (directoryRef.current !== root || request !== articleOpenRequestRef.current || token !== documentTokenRef.current) return false;
      setStoredArticles(items => upsertStoredArticle(items, loaded));
      return applyStoredArticle(loaded, navigate, root);
    } catch (error) {
      if (directoryRef.current === root && request === articleOpenRequestRef.current) setStatus({ ...productLabel("controller.articleReadingFailed", { "cause": productCause(error) }), tone: 'error' });
      return false;
    }
  }, [applyStoredArticle]);

  const discardCurrentDraft = useCallback(async () => {
    const current = articleRef.current;
    if (current.folder && current.month) {
      return readAndApplyArticle({ id: articleId(current), month: current.month, folder: current.folder, filePath: '', parse: { metadata: parseArticle(current.source).metadata, diagnostics: [] }, theme: current.theme }, false);
    }
    const blank = makeWorkingArticle(createArticleSource(productText("controller.untitledTechnicalManuscript"), current.theme.id), { ...current.theme, tokens: { ...current.theme.tokens } });
    blank.dirty = false;
    openDocument(directoryRef.current, 'draft');
    articleRef.current = blank;
    revisionRef.current += 1;
    compileRequestRef.current += 1;
    setIsCompiling(false);
    setArticle(blank);
    setRevision(revisionRef.current);
    setCompiledRevision(null);
    void compileCurrent(snapshotFor(blank, revisionRef.current));
    return true;
  }, [readAndApplyArticle, compileCurrent, openDocument, snapshotFor]);

  const resolvePendingAction = useCallback(async (discard: boolean) => {
    const action = pendingActionRef.current;
    if (!action) return false;
    if (discard) {
      if (!await discardCurrentDraft()) return false;
    } else {
      const saved = await saveCurrent();
      if (!saved || articleRef.current.dirty) return false;
    }
    pendingActionRef.current = null;
    setShowUnsavedDialog(false);
    await action.run();
    return true;
  }, [discardCurrentDraft, saveCurrent]);

  const cancelPendingAction = useCallback(() => {
    pendingActionRef.current?.onCancel?.();
    pendingActionRef.current = null;
    setShowUnsavedDialog(false);
  }, []);

  const closeTemplateDialog = useCallback(() => setShowTemplateDialog(false), []);

  const openStoredArticle = useCallback((stored: ArticleSummary) => {
    const root = directoryRef.current;
    if (!root) return;
    if (mutationQueueRef.current.isDeleting(root, stored.id)) {
      setStatus({ ...productLabel("controller.thisArticleIsBeingDeletedRefreshTheArticleListLater"), tone: 'warning' });
      return;
    }
    runAfterDraftDecision({ label: productText("controller.open", { "stored_parse_metadataTitle": stored.parse.metadata.title }), run: async () => {
      if (directoryRef.current !== root) return;
      await readAndApplyArticle(stored, true, root);
    } });
  }, [readAndApplyArticle, runAfterDraftDecision]);

  const openArticleInfo = useCallback((stored?: ArticleSummary) => {
    if (stored && stored.id !== articleId(articleRef.current)) {
      runAfterDraftDecision({
        label: productText("controller.viewInformationFor", { "stored_parse_metadataTitle": stored.parse.metadata.title }),
        run: async () => {
          if (await readAndApplyArticle(stored, true)) setArticleInfoDialogOpen(true);
        },
      });
      return;
    }
    if (!directoryRef.current) {
      setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeEditingArticleInformation"), tone: 'warning' });
      return;
    }
    if (parseArticle(articleRef.current.source).diagnostics.some((item) => item.level === 'error')) {
      setStatus({ ...productLabel("controller.theManuscriptMetadataIsInvalidRepairFrontMatterBeforeEditingInformationTo"), tone: 'error' });
      return;
    }
    setArticleInfoDialogOpen(true);
  }, [readAndApplyArticle, runAfterDraftDecision]);

  const createProject = useCallback(async (name: string) => {
    const base = `project-${Date.now().toString(36)}`;
    let id = base;
    let suffix = 2;
    while (editorWorkspaceRef.current.projects.some((project) => project.id === id)) id = `${base}-${suffix++}`;
    const saved = await persistEditorWorkspace((current) => createEditorProject(current, name, id), productText("controller.projectCreated", { "value": name.trim() }));
    if (saved) {
      setSelectedArticleCollection(`project:${id}`);
      if (view === 'articles' && articleMode === 'editor') navigateArticleMode('overview');
    }
    return saved;
  }, [articleMode, navigateArticleMode, persistEditorWorkspace, view]);

  const currentMediaReferenceCount = useCallback((assets: LibraryMediaAsset[]) => {
    const article = articleRef.current;
    return countCurrentMediaReferences(assets, directoryRef.current && article.source.trim() ? { source: article.source, month: article.month, folder: article.folder } : null);
  }, []);
  const scanLibraryMediaReferences = useCallback(async (assets: LibraryMediaAsset[], signal: AbortSignal) => {
    const root = directoryRef.current, session = contentLibraryRootSessionRef.current;
    if (!root) throw new ProductError("controller.theLibraryIsNotConnected");
    const article = articleRef.current, source = article.source, id = articleId(article);
    const current = () => directoryRef.current === root && contentLibraryRootSessionRef.current === session && articleId(articleRef.current) === id && articleRef.current.source === source;
    return scanWorkspaceMediaReferences(root, assets, source.trim() ? { source, month: article.month, folder: article.folder } : null, signal, current);
  }, []);

  const manageLibraryMedia = useCallback(async (operation: MediaMutation): Promise<MediaActionOutcome> => {
    const root = directoryRef.current, session = contentLibraryRootSessionRef.current;
    const current = () => root !== null && directoryRef.current === root && contentLibraryRootSessionRef.current === session;
    if (!root || !operation.assets.length || mediaOperationRef.current || historyOperationRef.current) return { ok: false, tone: 'warning', ...productMessage("controller.anotherOperationIsInProgressOrNoAssetIsSelected") };
    const outcomes: MediaActionOutcome[] = [];
    const failedKeys: string[] = [];
    const keyOf = (asset: LibraryMediaAsset) => `${asset.kind}:${asset.kind === 'article' ? asset.articleId : 'shared'}:${asset.fileName}`;
    for (const asset of operation.assets) {
      if (!current() || asset.root !== root) { outcomes.push({ ok: false, tone: 'warning', ...productMessage("controller.theLibrarySessionChangedRemainingAssetsWereNotProcessed") }); failedKeys.push(...operation.assets.slice(operation.assets.indexOf(asset)).map(keyOf)); break; }
      try {
        if (asset.kind === 'article' && (getArticleOrganization(editorWorkspaceRef.current, asset.articleId).archived || mutationQueueRef.current.isDeleting(root, asset.articleId))) throw new ProductError("controller.assetsInArchivedArticlesOrArticlesBeingDeletedAreReadOnly");
        if (operation.destination?.kind === 'article' && getArticleOrganization(editorWorkspaceRef.current, operation.destination.articleId).archived) throw new ProductError("controller.theTargetArticleIsArchivedAndReadOnly");
        if ((operation.type === 'rename' || operation.type === 'replace') && asset.kind === 'article') {
          const result = await renameMediaImage(asset, operation.name ?? asset.fileName.replace(/\.[^.]+$/, ''), operation.type === 'replace' ? operation.file : undefined);
          const outcome = { ok: result.fileCreated && result.tone === 'success', tone: result.tone, message: result.message }; outcomes.push(outcome); if (!outcome.ok) failedKeys.push(keyOf(asset));
          continue;
        }
        mediaOperationRef.current = true; setMediaOperation('rename');
        const result = await mutationQueueRef.current.run(async (): Promise<MediaActionOutcome> => {
          if (!current()) throw new ProductError("controller.theLibrarySessionChanged");
          if (operation.type === 'rename' || operation.type === 'replace') return renameSharedMedia(asset, operation.name ?? asset.fileName, current, operation.type === 'replace' ? operation.file : undefined);
          const directory = await mediaDirectory(asset);
          if (!current()) throw new ProductError("controller.theLibrarySessionChanged");
          if (operation.type === 'describe') { await saveMediaDescription(directory, asset.fileName, operation.description ?? '', current); return { ok: true, tone: 'success', ...productMessage("controller.descriptionSaved") }; }
          if (operation.type === 'delete') {
            try { await directory.removeEntry(asset.fileName); } catch (error) { if (!(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')) throw error; }
            try { await removeMediaDescription(directory, asset.fileName, current); } catch (error) { return { ok: false, tone: 'warning', ...productMessage("controller.fileWasDeletedButItsDescriptionIndexWasNotCleaned", { "assetFileName": asset.fileName, "cause": productCause(error) }) }; } return { ok: true, tone: 'warning', ...productMessage("controller.deletedBodyAndHistoryReferencesAreRetained", { "assetFileName": asset.fileName }) }; }
          if (!operation.destination) throw new ProductError("controller.chooseADestination");
          const source = asset.kind === 'article' && articleId(articleRef.current) === asset.articleId ? articleRef.current.source : undefined;
          const usage = await inspectMediaUsage(asset, source);
          if (!current()) throw new ProductError("controller.theLibrarySessionChanged");
          return transferMedia(asset, operation.destination, usage, current);
        });
        outcomes.push(result); if (!result.ok) failedKeys.push(keyOf(asset));
      } catch (error) { outcomes.push({ ok: false, tone: 'error', message: `${asset.fileName}：${error instanceof Error ? error.message : String(error)}` }); failedKeys.push(keyOf(asset)); }
      finally { mediaOperationRef.current = false; if (current()) { setMediaOperation(null); setMediaRefreshRevision(value => value + 1); } }
    }
    const ok = outcomes.every(result => result.ok), tone = outcomes.some(result => !result.ok) ? 'warning' : outcomes.some(result => result.tone === 'warning') ? 'warning' : 'success';
    const result: MediaActionOutcome = { ok, tone, failedKeys, ...productMessage("controller.completed", { "outcomes_filter_result_result_ok_Count": outcomes.filter(result => result.ok).length, "operation_assetsCount": operation.assets.length, "details": outcomes.map(result => result.message.replace(/。$/, '')).join('；') }) };
    if (current()) {
      const request = mediaPickerRequestRef.current, snapshot = snapshotFor();
      if (request && request.root === root && request.articleId === snapshot.articleId) { const updated = { ...request, documentToken: snapshot.documentToken, body: parseArticle(snapshot.source).body }; mediaPickerRequestRef.current = updated; setMediaPickerRequest(updated); }
      setStatus({ label: result.message, tone }); if (view === 'articles' && articleMode === 'editor') void compileCurrent(snapshot); }
    return result;
  }, [articleMode, compileCurrent, renameMediaImage, snapshotFor, view]);

  const renameProject = useCallback((id: string, name: string) => (
    persistEditorWorkspace((current) => renameEditorProject(current, id, name), productText("controller.projectRenamedTo", { "value": name.trim() }))
  ), [persistEditorWorkspace]);

  const setProjectCollapsed = useCallback((id: string, collapsed: boolean) => (
    persistEditorWorkspace((current) => setEditorProjectCollapsed(current, id, collapsed), productText("controller.projectDisplayStateSaved"))
  ), [persistEditorWorkspace]);

  const setProjectPinned = useCallback((id: string, pinned: boolean) => (
    persistEditorWorkspace((current) => setEditorProjectPinned(current, id, pinned), pinned ? productText("controller.projectPinned") : productText("controller.projectUnpinned"))
  ), [persistEditorWorkspace]);

  const reorderPinnedProjects = useCallback((ids: string[]) => (
    persistEditorWorkspace((current) => reorderPinnedEditorProjects(current, ids), productText("controller.pinnedProjectOrderSaved"))
  ), [persistEditorWorkspace]);

  const confirmDeleteProject = useCallback(async () => {
    const target = projectDeleteTarget;
    if (!target) return false;
    const assignedIds = new Set([
      ...Object.entries(editorWorkspaceRef.current.articleOrganization)
        .filter(([, value]) => value.projectId === target.id)
        .map(([id]) => id),
      ...storedArticles.filter((item) => getArticleOrganization(editorWorkspaceRef.current, item.id).projectId === target.id).map((item) => item.id),
    ]);
    const saved = await persistEditorWorkspace(
      (current) => deleteEditorProject(current, target.id, [...assignedIds]),
      productText("controller.projectDeletedArticlesMovedToUnclassifiedTheirContentIsUnchanged", { "targetName": target.name }),
    );
    if (saved) {
      setProjectDeleteTarget(null);
      if (selectedArticleCollection === `project:${target.id}`) setSelectedArticleCollection('unclassified');
    }
    return saved;
  }, [persistEditorWorkspace, projectDeleteTarget, selectedArticleCollection, storedArticles]);

  const setArticleCollection = useCallback((collection: ArticleCollection) => {
    setSelectedArticleCollection(collection);
    if (view === 'articles' && articleMode === 'editor') navigateArticleMode('overview');
  }, [articleMode, navigateArticleMode, view]);

  const archiveStoredArticle = useCallback((stored: ArticleSummary, archived: boolean) => {
    const root = directoryRef.current;
    if (!root) return;
    const run = () => {
      void persistEditorWorkspace(
        (current) => setArticleArchived(current, stored.id, archived),
        archived ? productText("controller.archivedOriginalSourceAndAssetsAreRetained", { "stored_parse_metadataTitle": stored.parse.metadata.title }) : productText("controller.unarchived", { "stored_parse_metadataTitle": stored.parse.metadata.title }),
      );
    };
    const isCurrent = articleId(articleRef.current) === stored.id && documentTokenRef.current?.root === root;
    if (isCurrent) runAfterDraftDecision({ label: productText("controller.archiveActionTitle", { "value": (archived ? productReference("controller.archive") : productReference("controller.unarchive")), "stored_parse_metadataTitle": stored.parse.metadata.title }), run }, articleRef.current.dirty);
    else run();
  }, [persistEditorWorkspace, runAfterDraftDecision]);

  const archiveStoredArticles = useCallback((targets: ArticleSummary[], archived: boolean) => {
    const root = directoryRef.current;
    const ids = [...new Set(targets.map((item) => item.id))];
    if (!root || !ids.length) return;
    const action = archived ? productText("controller.archive") : productText("controller.unarchive");
    const run = () => {
      if (directoryRef.current !== root) return;
      void persistEditorWorkspace(
        (current) => ids.reduce((workspace, id) => setArticleArchived(workspace, id, archived), current),
        productText("controller.manuscriptsOriginalSourceAndAssetsAreRetained", { "idsCount": ids.length, "action": action }),
      );
    };
    const protectDraft = articleRef.current.dirty && documentTokenRef.current?.root === root && ids.includes(articleId(articleRef.current));
    runAfterDraftDecision({ label: productText("controller.theSelectedManuscripts", { "action": action, "idsCount": ids.length }), run }, protectDraft);
  }, [persistEditorWorkspace, runAfterDraftDecision]);

  const classifyStoredArticles = useCallback((targets: ArticleSummary[], projectId: string | null) => {
    const root = directoryRef.current;
    if (!root || !targets.length) return Promise.resolve(false);
    const project = projectId === null ? null : editorWorkspaceRef.current.projects.find((item) => item.id === projectId);
    if (projectId !== null && !project) {
      setStatus({ ...productLabel("controller.theTargetProjectDoesNotExistSelectedManuscriptsAreUnchanged"), tone: 'warning' });
      return Promise.resolve(false);
    }
    const ids = [...new Set(targets.map((item) => item.id))];
    return persistEditorWorkspace((current) => {
      let next = current;
      // moveArticleToProject prepends each item; reverse here to preserve the
      // order in which the selected articles appear in the list.
      for (const id of [...ids].reverse()) {
        if (getArticleOrganization(next, id).archived) throw new ProductError("controller.archivedArticlesCannotBeAssignedCategoriesUnarchiveThemFirst");
        const targetOrder = orderArticlesForGroup(storedArticles, next, projectId, false).map((item) => item.id);
        next = moveArticleToProject(next, id, projectId, targetOrder);
      }
      return next;
    }, productText("controller.manuscriptsAssignedTo", { "idsCount": ids.length, "value": (project?.name ?? productReference("controller.unclassified")) }));
  }, [persistEditorWorkspace, storedArticles]);

  const moveStoredArticleToProject = useCallback((stored: ArticleSummary, projectId: string | null) => {
    const current = editorWorkspaceRef.current;
    const targetIds = orderArticlesForGroup(storedArticles, current, projectId, false)
      .filter((item) => item.id !== stored.id)
      .map((item) => item.id);
    return persistEditorWorkspace(
      (workspace) => moveArticleToProject(workspace, stored.id, projectId, targetIds),
      productText("controller.projectAssignmentUpdatedForTheDirectoryAndCategoriesAreUnchanged", { "stored_parse_metadataTitle": stored.parse.metadata.title }),
    );
  }, [persistEditorWorkspace, storedArticles]);

  const reorderStoredArticleGroup = useCallback((projectId: string | null, ids: string[]) => (
    persistEditorWorkspace((current) => setArticleGroupOrder(current, projectId, ids), productText("controller.articleOrderSaved"))
  ), [persistEditorWorkspace]);

  const moveStoredArticleInOrder = useCallback((stored: ArticleSummary, direction: -1 | 1) => {
    const workspace = editorWorkspaceRef.current;
    const organization = getArticleOrganization(workspace, stored.id);
    const items = orderArticlesForGroup(storedArticles, workspace, organization.projectId, organization.archived);
    const ids = items.map((item) => item.id);
    const index = ids.indexOf(stored.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return Promise.resolve(false);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    return persistEditorWorkspace(
      (current) => setArticleGroupOrder(current, organization.projectId, ids),
      productText("controller.manualOrderUpdatedFor", { "stored_parse_metadataTitle": stored.parse.metadata.title }),
    );
  }, [persistEditorWorkspace, storedArticles]);

  const setStoredArticleProject = useCallback((stored: ArticleSummary, projectId: string | null) => {
    const targetIds = orderArticlesForGroup(storedArticles, editorWorkspaceRef.current, projectId, false)
      .filter((item) => item.id !== stored.id)
      .map((item) => item.id);
    return persistEditorWorkspace(
      (workspace) => moveArticleToProject(workspace, stored.id, projectId, targetIds),
      productText("controller.projectAssignmentUpdatedForCategoryTagsAreUnchanged", { "stored_parse_metadataTitle": stored.parse.metadata.title }),
    );
  }, [persistEditorWorkspace, storedArticles]);

  const openAuthorizedDirectory = useCallback(async (handle: FileSystemDirectoryHandle, selection: number) => {
    const isCurrentSelection = () => directorySelectionRef.current === selection;
    let selectedRoot: FileSystemDirectoryHandle | null = null;
    let libraryLoadFinished = false;
    try {
          if (!isCurrentSelection()) return;
          selectedRoot = handle;
          setEditorAppearanceLoaded(false);
          setEditorAppearanceVerified(false);
          const bookmarkId = getDirectoryBookmarkId(handle);
          setEditorDirectoryId(bookmarkId);
          if (bookmarkId) activateEditorThemeDirectory(bookmarkId);
          const previousRoot = directoryRef.current;
          directoryRef.current = handle;
          invalidateFormatBundle(handle.name, productText("controller.loadingLibraryFormatConfiguration"), { loading: true });
          if (previousRoot !== handle) {
            advanceContentLibraryRootSession();
            const blank = makeEmptyWorkingArticle(BASIC_THEME);
            articleRef.current = blank;
            revisionRef.current += 1;
            compileRequestRef.current += 1;
            setIsCompiling(false);
            setArticle(blank);
            setRevision(revisionRef.current);
            setCompiledRevision(null);
            openDocument(handle, 'draft');
            setSelectedArticleCollection('all');
          }
          setDirectory(handle);
          setContentLibrariesState('loading');
          setDirectoryName(displayDirectoryName(handle));
          setThemeLibrary([]);
          setThemeIssues([]);
          setEditorThemes([]);
          setEditorThemeIssues([]);
          setSnippets(DEFAULT_ARTICLE_SNIPPETS);
          setSnippetCategories(DEFAULT_SNIPPET_CATEGORIES);
          setSnippetIssues([]);
          setTemplates(DEFAULT_ARTICLE_TEMPLATES);
          setTemplateCategories(DEFAULT_TEMPLATE_CATEGORIES);
        setTemplateIssues([]);
        articleListAbortRef.current?.abort();
        setArticleChecks({});
        setArticleIndexIssues([]);
        setArticleIndexMonths([]);
        setArticleListNotice({ label: '', tone: 'neutral' });
        setStoredArticles([]);
        setArticleSettings(DEFAULT_ARTICLE_SETTINGS);
        const emptyWorkspace = createDefaultEditorWorkspace();
        editorWorkspaceRef.current = emptyWorkspace;
        editorWorkspaceSnapshotRef.current = { fileExists: false, rawContent: null };
        setEditorWorkspace(emptyWorkspace);
        setEditorWorkspaceIssue(null);
        setEditorWorkspaceBusy(false);
        setSettingsIssue(null);
          setSettingsBusy(false);
          setSettingsNotice({ ...productLabel("controller.readingLibrarySettings"), tone: 'warning' });
          historyBaselineRef.current = null;
          openDocument(handle, articleId(articleRef.current));
          await ensureArticleDirectories(handle);
          const formatLoaded = await activateLibraryFormat(handle, () => isCurrentSelection() && directoryRef.current === handle);
          if (!isCurrentSelection() || directoryRef.current !== handle) return;
          let defaultsIssue: string | null = formatLoaded.message;
          try {
            fontSessionDisposeRef.current();
            fontSessionDisposeRef.current = () => {};
            await initializeLocalFonts(handle, () => isCurrentSelection() && directoryRef.current === handle);
            const dispose = await loadLocalFonts(handle, () => isCurrentSelection() && directoryRef.current === handle);
            if (isCurrentSelection() && directoryRef.current === handle) {
              fontSessionDisposeRef.current();
              fontSessionDisposeRef.current = dispose;
            } else dispose();
          } catch (error) { defaultsIssue = [defaultsIssue, productText("controller.fontLoadingFailed", { "cause": productCause(error) })].filter(Boolean).join('；'); }
          try { await initializeThemeDefaults(handle); } catch (error) { defaultsIssue = [defaultsIssue, error instanceof Error ? error.message : String(error)].filter(Boolean).join('；'); }
          if (!isCurrentSelection() || directoryRef.current !== handle) return;
          const [themeResult, snippetResult, templateResult, settingsResult, workspaceResult, editorThemeResult] = await Promise.allSettled([
            loadThemeLibrary(handle),
            loadArticleSnippets(handle),
            loadArticleTemplates(handle),
            loadArticleSettings(handle),
            loadEditorWorkspace(handle),
            loadEditorThemeLibrary(handle),
          ]);
          if (!isCurrentSelection() || directoryRef.current !== handle) return;
          if (themeResult.status === 'fulfilled') {
            setThemeLibrary(themeResult.value.themes);
            setThemeIssues([...themeResult.value.issues, ...(defaultsIssue ? [{ file: 'library/initialization', message: defaultsIssue }] : [])]);
            if (!articleRef.current.folder && !articleRef.current.dirty) {
              const localTheme = themeResult.value.themes.find(theme => theme.id === articleRef.current.theme.id) ?? themeResult.value.themes[0];
              if (localTheme) {
                const blank = makeEmptyWorkingArticle(localTheme);
                articleRef.current = blank;
                setArticle(blank);
              }
            }
          } else {
            setThemeLibrary([]);
            setThemeIssues([{ file: 'themes', message: themeResult.reason instanceof Error ? themeResult.reason.message : String(themeResult.reason) }]);
          }
          if (snippetResult.status === 'fulfilled') {
            setSnippets(snippetResult.value.snippets);
            setSnippetCategories(snippetResult.value.categories);
            setSnippetIssues(snippetResult.value.issues);
          } else {
            setSnippets([]);
            setSnippetCategories([]);
            setSnippetIssues([{ file: 'snippets', message: snippetResult.reason instanceof Error ? snippetResult.reason.message : String(snippetResult.reason) }]);
          }
          if (templateResult.status === 'fulfilled') {
            setTemplates(templateResult.value.templates);
            setTemplateCategories(templateResult.value.categories);
            setTemplateIssues(templateResult.value.issues);
          } else {
            setTemplates([]);
            setTemplateCategories([]);
            setTemplateIssues([{ file: 'templates', message: templateResult.reason instanceof Error ? templateResult.reason.message : String(templateResult.reason) }]);
          }
          if (settingsResult.status === 'fulfilled') {
            setArticleSettings(settingsResult.value.settings);
            setSettingsIssue(settingsResult.value.issue);
            setSettingsNotice({
              ...(settingsResult.value.issue
                ? productLabel("controller.settingsJsonIsInvalidAutoSaveAndSnapshotsArePausedRepairThe")
                : settingsResult.value.fileExists ? productLabel("controller.workflowSettingsLoadedForThisLibrary") : productLabel("controller.thisDirectoryHasNoSettingsJsonDefaultsAreBeingUsedNoFile")),
              tone: settingsResult.value.issue ? 'warning' : 'neutral',
            });
          } else {
            setSettingsIssue(settingsResult.reason instanceof Error ? settingsResult.reason.message : String(settingsResult.reason));
            setSettingsNotice({ ...productLabel("controller.settingsCouldNotBeReadAutoSaveAndSnapshotsArePaused"), tone: 'error' });
          }
          let availableEditorThemes = editorThemeResult.status === 'fulfilled'
            ? editorThemeResult.value.themes
            : [];
          setEditorThemeIssues([...(editorThemeResult.status === 'fulfilled'
            ? editorThemeResult.value.issues
            : [{ file: 'editor-themes', message: editorThemeResult.reason instanceof Error ? editorThemeResult.reason.message : String(editorThemeResult.reason) }]), ...(defaultsIssue ? [{ file: 'library/initialization', message: defaultsIssue }] : [])]);
          let workspaceIssue = workspaceResult.status === 'fulfilled'
            ? workspaceResult.value.issue
            : workspaceResult.reason instanceof Error ? workspaceResult.reason.message : String(workspaceResult.reason);
          if (workspaceResult.status === 'fulfilled') {
            let loadedWorkspace = workspaceResult.value;
            const migration = await migrateLegacyEditorAppearance(handle, loadedWorkspace, availableEditorThemes, editorThemeResult.status === 'fulfilled');
            loadedWorkspace = migration.loaded;
            availableEditorThemes = migration.themes;
            workspaceIssue = migration.issue;
            if (!isCurrentSelection() || directoryRef.current !== handle) return;
            editorWorkspaceRef.current = loadedWorkspace.workspace;
            editorWorkspaceSnapshotRef.current = { fileExists: loadedWorkspace.fileExists, rawContent: loadedWorkspace.rawContent };
            setEditorWorkspace(loadedWorkspace.workspace);
            setEditorWorkspaceIssue(workspaceIssue);
          } else {
            setEditorWorkspaceIssue(workspaceIssue);
          }
          setEditorThemes(availableEditorThemes);
          setEditorAppearanceVerified(workspaceResult.status === 'fulfilled' && !workspaceIssue && editorThemeResult.status === 'fulfilled');
          setEditorAppearanceLoaded(true);
          const libraryLoadSucceeded = snippetResult.status === 'fulfilled' && templateResult.status === 'fulfilled';
          libraryLoadFinished = true;
          setContentLibrariesState(libraryLoadSucceeded ? 'ready' : 'failed');
          const next = await refreshArticles(handle);
          if (!isCurrentSelection() || directoryRef.current !== handle) return;
          if (view === 'articles') navigateArticleMode('overview');
          else setPreferredArticleMode('overview');
          setStatus({
            ...(workspaceIssue
              ? productLabel("controller.projectAndAppearanceSettingsRemainReadOnly2", { "value": (next.length ? productReference("controller.libraryAuthorizedArticlesFound", { "nextCount": next.length }) : productReference("controller.libraryAuthorizedNoArticlesYet")), "workspaceIssue": workspaceIssue })
              : defaultsIssue ? productLabel("controller.libraryAuthorizedSomeDefaultThemesCouldNotBeAdded", { "defaultsIssue": defaultsIssue }) : next.length ? productLabel("controller.libraryAuthorizedArticlesFound", { "nextCount": next.length }) : productLabel("controller.libraryAuthorizedNoArticlesYet")),
            tone: workspaceIssue || defaultsIssue ? 'warning' : 'success',
          });
    } catch (error) {
      if (!isCurrentSelection()) return;
      if (!libraryLoadFinished && selectedRoot && directoryRef.current === selectedRoot) setContentLibrariesState('failed');
      setStatus({ ...productErrorLabel(error), tone: 'error' });
    } finally {
      if (isCurrentSelection() && selectedRoot && directoryRef.current === selectedRoot) setEditorAppearanceLoaded(true);
    }
  }, [advanceContentLibraryRootSession, navigateArticleMode, openDocument, refreshArticles, setPreferredArticleMode, view]);

  const rememberAuthorizedDirectory = useCallback((handle: FileSystemDirectoryHandle, selection: number) => {
    setRememberedDirectory(handle);
    setDirectoryRestoreState('idle');
    const write = directoryBookmarkWriteRef.current.then(() => {
      if (directorySelectionRef.current === selection) return saveLastDirectoryHandle(handle);
    });
    directoryBookmarkWriteRef.current = write.then(() => undefined, () => undefined);
    void write.then(
      () => {
        if (directorySelectionRef.current !== selection) return;
        setDirectoryBookmarkIssue(null);
        const bookmarkId = getDirectoryBookmarkId(handle);
        if (bookmarkId) {
          activateEditorThemeDirectory(bookmarkId);
          setEditorDirectoryId(bookmarkId);
        }
      },
      (error: unknown) => {
        if (directorySelectionRef.current === selection) {
          setDirectoryBookmarkIssue(productText("controller.theLibraryOpenedButTheBrowserCouldNotRememberIt", { "cause": productCause(error) }));
        }
      },
    );
  }, []);

  const authorizeDirectory = useCallback(() => {
    const selection = ++directorySelectionRef.current;
    runAfterDraftDecision({
      label: productText("controller.switchLibraryDirectories"),
      run: async () => {
        try {
          setStatus({ ...productLabel("controller.chooseAnExistingLibraryFolder"), tone: 'neutral' });
          const handle = await pickDataDirectory();
          if (directorySelectionRef.current !== selection) return;
          await assertExistingDataDirectory(handle);
          rememberAuthorizedDirectory(handle, selection);
          await openAuthorizedDirectory(handle, selection);
        } catch (error) {
          if (directorySelectionRef.current !== selection || error instanceof DOMException && error.name === 'AbortError') return;
          setStatus({ ...productErrorLabel(error), tone: 'error' });
        }
      },
    });
  }, [openAuthorizedDirectory, rememberAuthorizedDirectory, runAfterDraftDecision]);

  const requestCreateDataDirectory = useCallback(() => {
    runAfterDraftDecision({ label: productText("controller.createALibrary"), run: () => { setCreateLibraryDialogOpen(true); } });
  }, [runAfterDraftDecision]);

  const createDataDirectory = useCallback(async (name: string): Promise<LibraryCreationResult> => {
    const selection = ++directorySelectionRef.current;
    try {
      setStatus({ ...productLabel("controller.chooseTheParentDirectoryForTheNewLibrary"), tone: 'neutral' });
      const parent = await pickDataDirectory();
      if (directorySelectionRef.current !== selection) return { status: 'cancelled' };
      const handle = await createNamedDataDirectory(parent, name);
      if (directorySelectionRef.current !== selection) return { status: 'cancelled' };
      rememberAuthorizedDirectory(handle, selection);
      await openAuthorizedDirectory(handle, selection);
      return { status: directorySelectionRef.current === selection ? 'created' : 'cancelled' };
    } catch (error) {
      if (directorySelectionRef.current !== selection || error instanceof DOMException && error.name === 'AbortError') return { status: 'cancelled' };
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ label: message, tone: 'error' });
      return { status: 'error', message };
    }
  }, [openAuthorizedDirectory, rememberAuthorizedDirectory]);

  const reopenRememberedDirectory = useCallback(() => {
    const handle = rememberedDirectory;
    if (!handle) return;
    const selection = ++directorySelectionRef.current;
    void requestDirectoryReadWritePermission(handle).then(
      async (permission) => {
        if (directorySelectionRef.current !== selection) return;
        if (permission !== 'granted') {
          setStatus({ ...productLabel("controller.thePreviousLibraryLacksReadWritePermissionAuthorizeItOrChooseAnother"), tone: 'warning' });
          return;
        }
        setDirectoryRestoreState('idle');
        await openAuthorizedDirectory(handle, selection);
      },
      (error: unknown) => {
        if (directorySelectionRef.current === selection) setStatus({ ...productErrorLabel(error), tone: 'error' });
      },
    );
  }, [openAuthorizedDirectory, rememberedDirectory]);

  const confirmFormatCheck = useCallback((report: ArticleFormatReport, mode: 'copy' | 'export' = 'copy') => new Promise<boolean>((resolve) => {
    formatCheckResolveRef.current?.(false);
    formatCheckResolveRef.current = resolve;
    setFormatCheck({ mode, report });
  }), []);
  const resolveFormatCheck = useCallback((proceed: boolean) => {
    const resolve = formatCheckResolveRef.current;
    formatCheckResolveRef.current = null;
    setFormatCheck(null);
    resolve?.(proceed);
  }, []);

  const prepareVisualExport = useCallback(async () => {
    const snapshot = snapshotFor();
    if (!await compileCurrent(snapshot) || !matchesSnapshot(snapshot)) return false;
    const report = await inspectArticleFormatReport(snapshot.source, snapshot.theme, previewRef.current, { root: snapshot.directory, month: snapshot.month, folder: snapshot.folder });
    if (!matchesSnapshot(snapshot)) return false;
    return await confirmFormatCheck(report, 'export') && matchesSnapshot(snapshot);
  }, [compileCurrent, matchesSnapshot, snapshotFor, confirmFormatCheck]);

  const copyRichText = useCallback(async () => {
    if (mediaOperationRef.current) {
      setStatus({ ...productLabel("controller.assetsAreBeingWrittenOrRenamedCompleteThatOperationBeforeCopying"), tone: 'warning' });
      return;
    }
    const requestId = ++copyRequestRef.current;
    const initial = snapshotFor();
    setLoadInspectionRevision(null);
    if (!isReadyToCopy || !previewRef.current) {
      setStatus({ ...productLabel("controller.thisManuscriptCannotBeCopiedYetRepairYamlOrTheThemeSnapshot"), tone: 'error' });
      return;
    }
    const saved = initial.directory && articleRef.current.dirty ? await saveSnapshot(initial) : { ok: true, current: matchesSnapshot(initial), savedSnapshot: initial };
    if (!saved.ok) return;
    if (!saved.current || !saved.savedSnapshot || !matchesSnapshot(saved.savedSnapshot) || copyRequestRef.current !== requestId) {
      setStatus({ ...productLabel("controller.theManuscriptChangedDuringSavingTheOldRevisionWasDiscardedCopyThe"), tone: 'error' });
      return;
    }
    const target = saved.savedSnapshot;
    const current = () => copyRequestRef.current === requestId && matchesSnapshot(target) && !mediaOperationRef.current;
    const compiled = compiledRevision === target.revision ? true : await compileCurrent(target);
    if (!compiled || !current()) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!current() || !previewRef.current) return;
    let report: ArticleFormatReport;
    try { report = await inspectArticleFormatReport(target.source, target.theme, previewRef.current, { root: target.directory, month: target.month, folder: target.folder }); }
    catch (error) { if (current()) setStatus({ ...productLabel("controller.copyCheckingIsIncomplete", { "cause": productCause(error) }), tone: 'warning' }); return; }
    if (!current()) {
      setStatus({ ...productLabel("controller.theManuscriptChangedDuringValidationCopyTheCurrentDraftAgain"), tone: 'warning' });
      return;
    }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setStatus({ ...productLabel("controller.thisBrowserHasNoUsableClipboarditemRichTextWritingSupportNothingWas"), tone: 'error' });
      return;
    }
    try {
      const payload = buildClipboardPayload(previewRef.current, target.renderSnapshot);
      const proceed = await confirmFormatCheck(report);
      if (!proceed) { setStatus({ ...productLabel("controller.copyCancelledTheClipboardIsUnchanged"), tone: 'warning' }); return; }
      if (!current() || !previewRef.current) { setStatus({ ...productLabel("controller.theManuscriptChangedDuringValidationCopyTheCurrentDraftAgain"), tone: 'warning' }); return; }
      if (previewRef.current.querySelector('[data-local-asset-src]:not(img), [data-local-asset-srcset]:not(img):not(source)')) throw new ProductError("controller.localImagesAreNotReadyOrAreUnavailableCheckTheImagesAnd");
      let imageDirectory: Promise<FileSystemDirectoryHandle> | null = null;
      setStatus({ ...productLabel("controller.preparingTheCompleteRichTextArticleAndImages"), tone: 'neutral' });
      const complete = await embedClipboardImages(payload, async fileName => {
        if (!target.directory || !target.month || !target.folder) throw new ProductError("controller.saveTheManuscriptAndAuthorizeTheLibraryContainingItsImagesFirst");
        imageDirectory ??= getArticleMediaDirectory(target.directory, target.month, target.folder, false);
        const directory = await imageDirectory;
        if (!current()) throw new ProductError("controller.theManuscriptOrLibraryChangedCopyingThePreviousDraftWasCancelled");
        return (await directory.getFileHandle(fileName)).getFile();
      }, current, async () => {
        const response = await fetch(ARTICLE_EXAMPLE_IMAGE);
        if (!response.ok) throw new ProductError("controller.theSampleImageCouldNotBeReadRefreshAndTryAgain");
        return response.blob();
      });
      if (!current()) return;
      const item = new ClipboardItem({
        'text/html': new Blob([complete.html], { type: 'text/html' }),
        'text/plain': new Blob([complete.text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      if (!current()) return;
      setStatus({
        ...(complete.embeddedImageCount
          ? productLabel("controller.completeRichTextArticleCopiedEmbeddedImageReferencesReadyToPaste", { "completeEmbeddedImageCount": complete.embeddedImageCount })
          : productLabel("controller.richTextCopiedPasteIntoTheReceivingAreaBelow")),
        tone: 'success',
      });
    } catch (error) {
      if (current()) setStatus({ ...productLabel("controller.wholeArticleCopyingFailed", { "cause": productCause(error) }), tone: 'error' });
    }
  }, [compiledRevision, compileCurrent, confirmFormatCheck, isReadyToCopy, matchesSnapshot, saveSnapshot, snapshotFor]);

  const pasteRichText = useCallback(async () => {
    const receiver = clipboardReceiverRef.current;
    if (!receiver) return;
    if (!navigator.clipboard?.read) {
      setStatus({ ...productLabel("controller.thisBrowserHasNoUsableClipboardReadingSupportNothingWasPasted"), tone: 'error' });
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.includes('text/html') || candidate.types.includes('text/plain'));
      if (!item) {
        setStatus({ ...productLabel("controller.theClipboardContainsNoPasteableTextHtmlOrTextPlainContent"), tone: 'error' });
        return;
      }
      const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
      const text = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
      const value = html || text;
      if (!value) {
        setStatus({ ...productLabel("controller.theClipboardIsEmptyNothingWasPasted"), tone: 'error' });
        return;
      }

      receiver.focus();
      const selection = window.getSelection();
      if (!selection) {
        setStatus({ ...productLabel("controller.theReceivingAreaSelectionCouldNotBeLocatedNothingWasPasted"), tone: 'error' });
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(receiver);
      selection.removeAllRanges();
      selection.addRange(range);
      const inserted = document.execCommand(html ? 'insertHTML' : 'insertText', false, value);
      selection.removeAllRanges();
      if (!inserted || !receiver.textContent?.trim()) {
        setStatus({ ...productLabel("controller.theBrowserDidNotCompleteThePasteIntoTheReceivingArea"), tone: 'error' });
        return;
      }
      setStatus({ ...(html ? productLabel("controller.clipboardPastedTextHtmlTextPlain") : productLabel("controller.clipboardPastedTextPlain")), tone: 'success' });
    } catch (error) {
      setStatus({ ...productLabel("controller.clipboardReadingOrPastingFailed", { "cause": productCause(error) }), tone: 'error' });
    }
  }, []);

  const changeField = useCallback(
    (field: 'title' | 'description' | 'author' | 'categories', value: string) => {
      if (!directoryRef.current) {
        setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeModifyingArticleInformation"), tone: 'warning' });
        return;
      }
      const current = articleRef.current;
      const nextValue = field === 'categories' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value;
      const nextSource = updateFrontMatter(current.source, { [field]: nextValue });
      updateArticle(nextSource);
    },
    [updateArticle],
  );

  const changeTheme = useCallback((theme: ThemeConfig) => {
    if (!directoryRef.current) {
      setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeApplyingATheme"), tone: 'warning' });
      return;
    }
    const current = articleRef.current;
    const currentId = articleId(current);
    if (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, currentId).archived) {
      setStatus({ ...productLabel("controller.archivedArticlesAreReadOnlyUnarchiveTheArticleBeforeSwitchingThemes"), tone: 'warning' });
      return;
    }
    if (parseArticle(current.source).diagnostics.some((item) => item.level === 'error')) {
      setStatus({ ...productLabel("controller.frontMatterIsInvalidRepairItBeforeBindingATheme"), tone: 'error' });
      return;
    }
    if (current.themeValid && JSON.stringify(current.theme) === JSON.stringify(theme)) {
      setShowThemeDialog(false);
      return;
    }
    const nextSource = updateFrontMatter(current.source, { theme: { id: theme.id, version: theme.version } });
    if (!current.folder || !current.month) {
      updateArticle(nextSource, theme);
      setShowThemeDialog(false);
      setStatus({ ...productLabel("controller.newDraftThemeSwitchedToItsArticleThemeSnapshotIsWrittenWhen", { "themeName": theme.name }), tone: 'success' });
      return;
    }

    const target = snapshotFor(current);
    const root = target.directory;
    if (!root || target.documentToken.root !== root || !target.themeValid) {
      setStatus({ ...productLabel("controller.theCurrentArticleOrThemeSnapshotIsInvalidTheThemeWasNot"), tone: 'error' });
      return;
    }
    const lease = beginHistoryOperation();
    if (!lease) return;
    setHistoryNotice({ ...productLabel("controller.creatingACheckpointBeforeChangingTheTheme"), tone: 'warning' });
    void mutationQueueRef.current.run(async () => {
      if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) {
        throw new ProductError("controller.theArticleOrLibraryChangedTheThemeWasNotModified");
      }
      return createArticleSnapshot(root, target.month!, target.folder!, target.source, target.theme, {
        kind: 'before-theme-change',
        maxAutoSnapshots: articleSettings.autoSnapshot.maxCount,
      });
    }).then((checkpoint) => {
      if (directoryRef.current !== root || !matchesSnapshot(target)) {
        setStatus({ ...productLabel("controller.checkpointSavedAsButTheArticleSessionChangedTheNewThemeWas", { "checkpoint_snapshotId": checkpoint.snapshot.id }), tone: 'warning' });
        return;
      }
      updateArticle(nextSource, theme);
      setShowThemeDialog(false);
      setHistoryNotice({ ...productLabel("controller.savedVersionBeforeChangingTheTheme", { "checkpoint_snapshotId": checkpoint.snapshot.id }), tone: 'success' });
      setStatus({
        ...(checkpoint.cleanupIssues.length
          ? productLabel("controller.checkpointSavedThemeSwitchedToHistoryCleanupNotes", { "themeName": theme.name, "details": checkpoint.cleanupIssues.join('；') })
          : productLabel("controller.checkpointSavedThemeSwitchedToSaveTheArticleToWriteItsSource", { "themeName": theme.name })),
        tone: checkpoint.cleanupIssues.length ? 'warning' : 'success',
      });
    }).catch((error) => {
      if (directoryRef.current === root && matchesSnapshot(target)) {
        setStatus({ ...productLabel("controller.theCheckpointBeforeThemeChangeFailedTheOriginalThemeIsRetained", { "cause": productCause(error) }), tone: 'error' });
      }
    }).finally(() => finishHistoryOperation(lease));
  }, [articleSettings.autoSnapshot.maxCount, beginHistoryOperation, finishHistoryOperation, matchesSnapshot, snapshotFor, updateArticle]);

  const applyThemeFromLibrary = useCallback((theme: ThemeConfig) => {
    const root = directoryRef.current;
    const current = articleRef.current;
    if (!root || documentTokenRef.current?.root !== root) {
      setStatus({ ...productLabel("controller.theCurrentManuscriptDoesNotBelongToThisLibraryTheThemeWas"), tone: 'warning' });
      return;
    }
    if (!current.folder || !current.month) {
      changeTheme(theme);
      navigateArticleMode('editor');
      return;
    }
    const stored = storedArticles.find(item => item.month === current.month && item.folder === current.folder);
    if (!stored) {
      setStatus({ ...productLabel("controller.noSavedVersionOfTheCurrentArticleWasFoundRefreshTheArticle"), tone: 'warning' });
      return;
    }
    if (parseArticle(current.source).diagnostics.some(item => item.level === 'error')) {
      setStatus({ ...productLabel("controller.frontMatterIsInvalidRepairItBeforeCopyingAndApplyingTheTheme"), tone: 'error' });
      return;
    }
    const active = typeof document === 'undefined' ? null : document.activeElement;
    copyOpenerRef.current = typeof HTMLElement !== 'undefined' && active instanceof HTMLElement ? active : null;
    setCopyThemeTarget(theme);
    setCopySourceOverride(current.source);
    setCopyFromThemeLibrary(true);
    setCopyTarget(stored);
    setCopyTitle(`${stored.parse.metadata.title} Fork`);
    setCopyMonth(stored.month);
  }, [changeTheme, navigateArticleMode, storedArticles]);

  const createNewArticle = useCallback(() => {
    if (!directoryRef.current) {
      setStatus({ ...productLabel("controller.chooseALibraryInSettingsBeforeCreatingAnArticle"), tone: 'warning' });
      navigateRoute('/settings/');
      return;
    }
    runAfterDraftDecision({
      label: productText("controller.createAnArticle"),
      run: () => {
        navigateArticleMode('overview');
        setShowTemplateDialog(true);
      },
    });
  }, [navigateArticleMode, navigateRoute, runAfterDraftDecision]);

  const createArticleFromTemplate = useCallback((template: ArticleTemplate | null, selectedTheme: ThemeConfig) => {
    if (!directoryRef.current) {
      setStatus({ ...productLabel("controller.chooseALibraryBeforeCreatingAnArticle"), tone: 'warning' });
      setShowTemplateDialog(false);
      navigateRoute('/settings/');
      return;
    }
    const now = new Date().toISOString();
    try {
      const source = template
        ? instantiateArticleTemplate(template.source, { now, theme: selectedTheme })
        : updateFrontMatter(createArticleSource(productText("controller.untitledTechnicalManuscript"), selectedTheme.id), {
            createdAt: now,
            updatedAt: now,
            theme: { id: selectedTheme.id, version: selectedTheme.version },
          });
      const nextArticle = makeWorkingArticle(source, selectedTheme, null, null, true);
      openDocument(directoryRef.current, 'draft');
      articleRef.current = nextArticle;
      revisionRef.current += 1;
      compileRequestRef.current += 1;
      setIsCompiling(false);
      setArticle(nextArticle);
      setRevision(revisionRef.current);
      setCompiledRevision(null);
      setStatus({ ...(template ? productLabel("controller.newDraftCreatedFromTheOriginalTemplateAndSavedArticlesAreUnchanged", { "templateName": template.name }) : productLabel("controller.newBlankDraftCreatedItIsWrittenToDiskOnlyAfterChoosing")), tone: 'warning' });
      setShowTemplateDialog(false);
      navigateArticleMode('editor');
      void compileCurrent(snapshotFor(nextArticle, revisionRef.current));
    } catch (error) {
      setStatus({ ...productLabel("controller.thisTemplateCannotBeUsedNoNewDraftWasCreated", { "cause": productCause(error) }), tone: 'error' });
    }
  }, [compileCurrent, navigateArticleMode, openDocument, navigateRoute, snapshotFor]);

  const beginCopy = useCallback((target: ArticleSummary) => {
    const current = articleRef.current;
    const forkCurrent = articleId(current) === target.id && current.folder === target.folder && current.month === target.month;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    copyOpenerRef.current = typeof HTMLElement !== 'undefined' && active instanceof HTMLElement ? active.closest('details')?.querySelector<HTMLElement>('summary') ?? active : null;
    setCopyThemeTarget(forkCurrent ? current.theme : null);
    setCopySourceOverride(forkCurrent ? current.source : null);
    setCopyFromThemeLibrary(false);
    setCopyTarget(target);
    setCopyTitle(`${target.parse.metadata.title} Fork`);
    setCopyMonth(target.month);
  }, []);

  const confirmCopy = useCallback(() => {
    const target = copyTarget;
    const root = directoryRef.current;
    if (!target || !root) return;
    const title = copyTitle.trim();
    if (!title) {
      setStatus({ ...productLabel("controller.theForkTitleCannotBeEmpty"), tone: 'error' });
      return;
    }
    const sourceOverride = copySourceOverride ?? undefined;
    const themeOverride = copyThemeTarget ?? undefined;
    const openCreatedArticle = copyFromThemeLibrary;
    setCopyTarget(null);
    setCopySourceOverride(null);
    setCopyThemeTarget(null);
    setCopyFromThemeLibrary(false);
    void (async () => {
      try {
        const { result, refreshError } = await mutationQueueRef.current.run(async () => {
          const result = await copyStoredArticle(root, target.month, target.folder, title, copyMonth, undefined, {
            sourceOverride,
            themeOverride,
          });
          if (directoryRef.current === root) setStoredArticles((items) => upsertStoredArticle(items, result.article));
          let refreshError: unknown;
          try {
            await loadStoredArticles(root);
          } catch (error) {
            refreshError = error;
          }
          return { result, refreshError };
        });
        const monthNote = copyMonth === target.month ? '' : productReference("controller.savedUnder", { "copyMonth": copyMonth });
        const collisionNote = result.folderCollision ? productReference("controller.directoryNameConflictUsing", { "result_articleFolder": result.article.folder }) : '';
        const indexNote = result.indexUpdated
          ? result.indexError ? productReference("controller.monthlyIndexRebuilt", { "resultIndexError": result.indexError }) : ''
          : productReference("controller.forkWrittenButTheMonthlyIndexWasNotUpdated", { "value": (result.indexError ?? productReference("controller.unknownError")) });
        const refreshNote = refreshError
          ? productReference("controller.listRefreshFailedClickRefreshToRetry", { "cause": productCause(refreshError) })
          : '';
        if (directoryRef.current !== root) return;
        if (openCreatedArticle) applyStoredArticle(result.article, true, root);
        const themeNote = themeOverride ? productReference("controller.themeV", { "themeOverrideName": themeOverride.name, "result_article_themeVersion": result.article.theme.version }) : '';
        setStatus({ ...productLabel("controller.forkCreatedTheOriginalManuscriptIsUnchanged", { "result_article_parse_metadataTitle": result.article.parse.metadata.title, "themeNote": themeNote, "monthNote": monthNote, "collisionNote": collisionNote, "indexNote": indexNote, "refreshNote": refreshNote }), tone: result.indexUpdated && !result.indexError && !refreshError ? 'success' : 'warning' });
      } catch (error) {
        if (directoryRef.current !== root) return;
        setStatus({ ...productLabel("controller.forkFailedTheOriginalManuscriptAndUnsavedStateAreRetained", { "cause": productCause(error) }), tone: 'error' });
      }
    })();
  }, [applyStoredArticle, copyFromThemeLibrary, copyMonth, copySourceOverride, copyTarget, copyThemeTarget, copyTitle, loadStoredArticles]);

  const confirmDelete = useCallback(() => {
    const targets = deleteTargets;
    const root = directoryRef.current;
    if (!targets.length || !root) return;
    const targetIds = new Set(targets.map((item) => item.id));
    const protectCurrentDraft = documentTokenRef.current?.root === root && targetIds.has(articleId(articleRef.current));
    setDeleteTargets([]);
    runAfterDraftDecision({
      label: targets.length === 1 ? productText("controller.delete", { "targets_0_parse_metadataTitle": targets[0].parse.metadata.title }) : productText("controller.deleteTheSelectedManuscripts", { "targetsCount": targets.length }),
      run: async () => {
        const deletingDocumentToken = directoryRef.current === root &&
          documentTokenRef.current?.root === root &&
          targetIds.has(documentTokenRef.current.articleId) &&
          targetIds.has(articleId(articleRef.current))
          ? documentTokenRef.current
          : null;
        const queued = targets.flatMap((target) => {
          const token = mutationQueueRef.current.beginDelete(root, target.id);
          return token ? [{ target, token }] : [];
        });
        if (!queued.length) {
          if (directoryRef.current === root) setStatus({ ...productLabel("controller.selectedManuscriptsAreBeingDeletedRefreshTheArticleListLater"), tone: 'warning' });
          return;
        }
        const settled = new Set<ReturnType<typeof mutationQueueRef.current.beginDelete>>();
        const deletedIds: string[] = [];
        const failedTitles: string[] = [];
        let indexUpdated = true;
        let indexError = '';
        let clearedCurrent = false;
        try {
          const { refreshError, workspaceCleanupError } = await mutationQueueRef.current.run(async () => {
            for (const { target, token } of queued) {
              try {
                const result = await deleteStoredArticle(root, target.month, target.folder);
                mutationQueueRef.current.finishDelete(token);
                settled.add(token);
                deletedIds.push(target.id);
                if (!result.indexUpdated) indexUpdated = false;
                if (result.indexError) indexError = result.indexError;
              } catch (error) {
                mutationQueueRef.current.failDelete(token);
                settled.add(token);
                failedTitles.push(target.parse.metadata.title || productText("controller.untitledArticle"));
              }
            }
            if (directoryRef.current === root && deletedIds.length) {
              setStoredArticles((items) => items.filter((item) => !deletedIds.includes(item.id)));
            }
            let workspaceCleanupError = '';
            if (directoryRef.current === root && deletedIds.length) {
              const cleaned = await persistEditorWorkspace((current) => {
                const articleOrganization = { ...current.articleOrganization };
                for (const id of deletedIds) delete articleOrganization[id];
                const articleOrder = Object.fromEntries(Object.entries(current.articleOrder).map(([groupId, ids]) => [groupId, ids.filter((id) => !deletedIds.includes(id))]));
                return { ...current, articleOrganization, articleOrder };
              }, productText("controller.articleProjectAndOrderRecordsCleaned"));
              if (!cleaned) workspaceCleanupError = productText("controller.editorOrganizationRecordsWereNotCleanedRepairSettingsJsonToPreventOld");
            }
            if (deletingDocumentToken &&
              directoryRef.current === root &&
              documentTokenRef.current === deletingDocumentToken &&
              deletedIds.includes(articleId(articleRef.current))) {
              const blank = makeWorkingArticle(createArticleSource(productText("controller.untitledTechnicalManuscript"), 'basic'), BASIC_THEME);
              blank.dirty = false;
              openDocument(root, 'draft');
              articleRef.current = blank;
              revisionRef.current += 1;
              compileRequestRef.current += 1;
              setIsCompiling(false);
              setArticle(blank);
              setRevision(revisionRef.current);
              setCompiledRevision(null);
              navigateArticleMode('overview');
              clearedCurrent = true;
            }
            let refreshError: unknown;
            try {
              await loadStoredArticles(root);
            } catch (error) {
              refreshError = error;
            }
            return { refreshError, workspaceCleanupError };
          });
          if (clearedCurrent) await compileCurrent(snapshotFor(articleRef.current, revisionRef.current));
          const indexMessage = indexUpdated
            ? indexError ? productReference("controller.monthlyIndexRebuilt2", { "indexError": indexError }) : ''
            : productReference("controller.theMonthlyIndexWasNotUpdated", { "value": (indexError || productReference("controller.unknownError")) });
          const refreshMessage = refreshError
            ? productReference("controller.listRefreshPendingClickRefreshArticlesToRetry", { "cause": productCause(refreshError) })
            : '';
          const failedMessage = failedTitles.length ? productReference("controller.articlesNotDeleted", { "failedTitlesCount": failedTitles.length, "details": failedTitles.join('、') }) : '';
          const details = productJoin([indexMessage, refreshMessage, workspaceCleanupError, failedMessage].filter(Boolean), '；');
          if (directoryRef.current !== root) return;
          const subject = deletedIds.length === 1 ? productReference("controller.article") : productReference("controller.articles", { "deletedIdsCount": deletedIds.length });
          setStatus({
            ...(deletedIds.length
              ? productLabel("controller.andItsAssetsAndHistoryWereDeleted", { "subject": subject, "value": productJoin([' ', details]) })
              : productLabel("controller.deletionFailedTheManuscriptIsUnchanged", { "value": productJoin([' ', details]) })),
            tone: deletedIds.length
              ? (failedTitles.length || !indexUpdated || indexError || refreshError || workspaceCleanupError ? 'warning' : 'success')
              : 'error',
          });
        } catch (error) {
          for (const { token } of queued) if (!settled.has(token)) mutationQueueRef.current.failDelete(token);
          if (directoryRef.current !== root) return;
          const subject = deletedIds.length === 1 ? productReference("controller.article") : productReference("controller.articles", { "deletedIdsCount": deletedIds.length });
          setStatus({
            ...(deletedIds.length
              ? productLabel("controller.wasDeletedButTheSubsequentStateUpdateFailedRefreshTheList", { "subject": subject, "cause": productCause(error) })
              : productLabel("controller.deletionFailed", { "cause": productCause(error) })),
            tone: deletedIds.length ? 'warning' : 'error',
          });
        }
      },
    }, protectCurrentDraft);
  }, [compileCurrent, deleteTargets, loadStoredArticles, navigateArticleMode, openDocument, persistEditorWorkspace, runAfterDraftDecision, snapshotFor]);

  useEffect(() => {
    setMounted(true);
    const supported = supportsFileSystemAccess();
    setFileSystemReady(supported);
    if (!supported || directoryRef.current) {
      if (!supported) activateEditorThemeDirectory(null);
      setDirectoryRestoreState('idle');
      return;
    }
    if (directoryRestoreState !== 'checking') return;
    let cancelled = false;
    const selection = directorySelectionRef.current;
    void (async () => {
      try {
        const handle = await loadLastDirectoryHandle();
        if (cancelled || directorySelectionRef.current !== selection || directoryRef.current) return;
        if (!handle) {
          activateEditorThemeDirectory(null);
          setDirectoryRestoreState('idle');
          return;
        }
        setRememberedDirectory(handle);
        activateEditorThemeDirectory(getDirectoryBookmarkId(handle));
        const permission = await queryDirectoryReadWritePermission(handle);
        if (cancelled || directorySelectionRef.current !== selection || directoryRef.current) return;
        if (permission === 'granted') {
          await openAuthorizedDirectory(handle, selection);
          if (!cancelled && directorySelectionRef.current === selection) setDirectoryRestoreState('idle');
        } else {
          setDirectoryRestoreState('permission-needed');
          setStatus({ ...productLabel("controller.rememberedLibraryAuthorizeItBeforeOpening", { "handleName": handle.name }), tone: 'warning' });
        }
      } catch (error) {
        if (cancelled || directorySelectionRef.current !== selection) return;
        setDirectoryBookmarkIssue(productText("controller.thePreviousLibraryDirectoryCouldNotBeRestored", { "cause": productCause(error) }));
        setDirectoryRestoreState('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [directoryRestoreState, openAuthorizedDirectory]);

  useEffect(() => {
    const root = directory;
    const current = articleRef.current;
    const token = documentTokenRef.current;
    const id = articleId(current);
    if (!root || !current.folder || !current.month || !token || token.root !== root || token.articleId !== id ||
      !mutationQueueRef.current.canSave(token)) return;

    let baseline = historyBaselineRef.current;
    if (!baseline || baseline.root !== root || baseline.articleId !== id) {
      baseline = { root, articleId: id, fingerprint: articleFingerprint(current.source, current.theme), initialized: false };
      historyBaselineRef.current = baseline;
    }
    if (baseline.initialized) return;
    const initialFingerprint = baseline.fingerprint;
    let cancelled = false;
    void mutationQueueRef.current.run(() => listArticleHistory(root, current.month!, current.folder!)).then((history) => {
      const latest = history.snapshots[0];
      const active = historyBaselineRef.current;
      if (cancelled || directoryRef.current !== root || documentTokenRef.current !== token ||
        articleId(articleRef.current) !== id || !mutationQueueRef.current.canSave(token) ||
        active?.root !== root || active.articleId !== id || active.initialized || active.fingerprint !== initialFingerprint) return;
      historyBaselineRef.current = {
        root,
        articleId: id,
        fingerprint: latest ? articleFingerprint(latest.source, latest.theme) : initialFingerprint,
        initialized: true,
      };
    }).catch((error) => {
      if (!cancelled && directoryRef.current === root && documentTokenRef.current === token) {
        setStatus({ ...productLabel("controller.theHistoryBaselineCouldNotBeReadTheFirstAutomaticSnapshotWill", { "cause": productCause(error) }), tone: 'warning' });
      }
    });
    return () => { cancelled = true; };
  }, [article.folder, article.month, currentDocumentGeneration, directory]);

  useEffect(() => {
    const root = directory;
    const token = documentTokenRef.current;
    const id = articleId(article);
    if (!root || settingsIssue || !articleSettings.autoSave.enabled || !article.dirty ||
      (article.folder && article.month && getArticleOrganization(editorWorkspace, id).archived) ||
      !token || token.root !== root || token.articleId !== id || !mutationQueueRef.current.canSave(token)) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const current = articleRef.current;
        const activeToken = documentTokenRef.current;
        if (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, id).archived) return;
        if (historyOperationRef.current || autoSaveBusyRef.current || mediaOperationRef.current || !current.dirty || directoryRef.current !== root ||
          activeToken !== token || articleId(current) !== id || activeToken?.root !== root || activeToken.articleId !== id ||
          !mutationQueueRef.current.canSave(token)) return;
        autoSaveBusyRef.current = true;
        try {
          const snapshot = snapshotFor(current);
          const result = await saveSnapshot(snapshot);
          if (result.ok && result.current && result.savedSnapshot && result.result?.article.parse.canCopy && result.savedSnapshot.documentToken.root === root) {
            if (await compileCurrent(result.savedSnapshot)) await captureSavedRender(result.savedSnapshot);
          }
        } finally {
          autoSaveBusyRef.current = false;
        }
      })();
    }, articleSettings.autoSave.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [articleSettings.autoSave.enabled, articleSettings.autoSave.intervalSeconds, article.dirty, article.folder, article.month, captureSavedRender, compileCurrent, currentDocumentGeneration, directory, editorWorkspace, saveSnapshot, settingsIssue, snapshotFor]);

  useEffect(() => {
    const root = directory;
    const token = documentTokenRef.current;
    const id = articleId(article);
    if (!root || settingsIssue || !articleSettings.autoSnapshot.enabled ||
      (article.folder && article.month && getArticleOrganization(editorWorkspace, id).archived) ||
      !token || token.root !== root || token.articleId !== id ||
      !mutationQueueRef.current.canSave(token)) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const current = articleRef.current;
        const activeToken = documentTokenRef.current;
        if (current.folder && current.month && getArticleOrganization(editorWorkspaceRef.current, id).archived) return;
        if (historyOperationRef.current || autoSnapshotBusyRef.current || mediaOperationRef.current || directoryRef.current !== root || activeToken !== token ||
          articleId(current) !== id || activeToken?.root !== root || activeToken.articleId !== id || !mutationQueueRef.current.canSave(token)) return;
        if ((!current.folder || !current.month) && !current.dirty) return;
        autoSnapshotBusyRef.current = true;
        try {
          let target = snapshotFor(current);
          const wasDraft = !target.folder || !target.month;
          if (wasDraft) {
            const archived = await saveSnapshot(target);
            if (!archived.ok || !archived.current || !archived.savedSnapshot) return;
            target = archived.savedSnapshot;
            historyBaselineRef.current = { root, articleId: target.articleId, fingerprint: null, initialized: true };
          }
          if (historyOperationRef.current || !target.month || !target.folder || directoryRef.current !== root || !matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) return;
          const result = await mutationQueueRef.current.run(async () => {
            if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) return null;
            const history = await listArticleHistory(root, target.month!, target.folder!);
            if (!matchesSnapshot(target) || !mutationQueueRef.current.canSave(target.documentToken)) return null;
            const fingerprint = articleFingerprint(target.source, target.theme);
            const baseline = historyBaselineRef.current;
            const baselineMatches = baseline?.root === root && baseline.articleId === target.articleId;
            const baselineFingerprint = wasDraft
              ? null
              : baselineMatches && baseline
                ? baseline.fingerprint
                : history.snapshots[0]
                  ? articleFingerprint(history.snapshots[0].source, history.snapshots[0].theme)
                  : null;
            historyBaselineRef.current = { root, articleId: target.articleId, fingerprint: baselineFingerprint, initialized: true };
            if (baselineFingerprint === fingerprint) return null;
            const created = await createArticleSnapshot(root, target.month!, target.folder!, target.source, target.theme, {
              kind: 'automatic', maxAutoSnapshots: articleSettings.autoSnapshot.maxCount,
            });
            if (matchesSnapshot(target)) historyBaselineRef.current = { root, articleId: target.articleId, fingerprint, initialized: true };
            return created;
          });
          if (result && directoryRef.current === root && matchesSnapshot(target)) {
            try {
              const history = await mutationQueueRef.current.run(() => listArticleHistory(root, target.month!, target.folder!));
              if (directoryRef.current === root && matchesSnapshot(target)) {
                setHistorySnapshots(history.snapshots);
                setHistoryIssues(history.issues);
                setHistorySelectedId((selected) => history.snapshots.some((item) => item.id === selected) ? selected : result.snapshot.id);
                setHistoryRefreshPending(false);
              }
            } catch (error) {
              if (directoryRef.current === root && matchesSnapshot(target)) {
                setHistoryRefreshPending(true);
                setHistoryNotice({ ...productLabel("controller.snapshotSavedButTheHistoryListCouldNotRefresh", { "cause": productCause(error) }), tone: 'warning' });
              }
            }
            if (directoryRef.current !== root || !matchesSnapshot(target)) return;
            const cleanupNote = result.cleanupIssues.length ? productReference("controller.cleanupNotes", { "details": result.cleanupIssues.join('；') }) : '';
            setStatus({ ...(result.created ? productLabel("controller.automaticHistorySnapshotSaved", { "result_snapshotId": result.snapshot.id, "cleanupNote": cleanupNote }) : productLabel("controller.contentIsUnchangedNoDuplicateHistoricalSnapshotWasCreated", { "cleanupNote": cleanupNote })), tone: result.cleanupIssues.length ? 'warning' : result.created ? 'success' : 'neutral' });
          }
        } catch (error) {
          if (directoryRef.current === root && articleId(articleRef.current) === id && documentTokenRef.current === token) setStatus({ ...productLabel("controller.automaticHistorySnapshotFailed", { "cause": productCause(error) }), tone: 'error' });
        } finally {
          autoSnapshotBusyRef.current = false;
        }
      })();
    }, articleSettings.autoSnapshot.intervalMinutes * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [article.folder, article.month, articleSettings.autoSnapshot.enabled, articleSettings.autoSnapshot.intervalMinutes, articleSettings.autoSnapshot.maxCount, currentDocumentGeneration, directory, editorWorkspace, matchesSnapshot, saveSnapshot, settingsIssue, snapshotFor]);

  useEffect(() => {
    if (mounted) void compileCurrent();
    // Initial compile is intentional; subsequent typing only marks styles stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, formatSnapshot.id]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!articleRef.current.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view === 'template' || event.defaultPrevented || event.repeat || event.isComposing || (event.target as HTMLElement | null)?.closest?.('[aria-modal="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCurrent();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveCurrent, view]);


  const currentArticleId = articleId(article);
  const currentProjectName = editorWorkspace.projects.find((project) => project.id === getArticleOrganization(editorWorkspace, currentArticleId).projectId)?.name ?? null;
  const getCurrentArticleId = () => articleId(articleRef.current);
  const editorProjectsInDisplayOrder = orderEditorProjects(editorWorkspace, articleList);
  const orderedUnclassifiedArticles = orderArticlesForGroup(articleList, editorWorkspace, null, false);
  const orderedProjectArticles = editorProjectsInDisplayOrder.flatMap((project) => orderArticlesForGroup(articleList, editorWorkspace, project.id, false));
  const orderedArchivedArticles = articleList
    .filter((item) => getArticleOrganization(editorWorkspace, item.id).archived)
    .sort((left, right) => right.parse.metadata.updatedAt.localeCompare(left.parse.metadata.updatedAt));
  const articlesForOverview = selectedArticleCollection === 'unclassified'
    ? orderedUnclassifiedArticles
    : selectedArticleCollection === 'archived'
      ? orderedArchivedArticles
      : selectedArticleCollection.startsWith('project:')
        ? orderArticlesForGroup(articleList, editorWorkspace, selectedArticleCollection.slice('project:'.length), false)
        : [...orderedUnclassifiedArticles, ...orderedProjectArticles];
  const articleCollectionTitle = selectedArticleCollection === 'unclassified'
    ? productText("controller.unclassified")
    : selectedArticleCollection === 'archived'
      ? productText("controller.archivedArticles")
      : selectedArticleCollection.startsWith('project:')
        ? editorWorkspace.projects.find((project) => project.id === selectedArticleCollection.slice('project:'.length))?.name ?? productText("controller.project")
        : productText("controller.allArticles");
  return {
    mounted, fileSystemReady, view, articleMode, navigateView, navigateArticleMode, registerNavigationGuard,
    directory, setDirectory, contentLibraryRootSession, contentLibrariesState, setContentLibrariesState,
    directoryName, setDirectoryName, rememberedDirectoryName: rememberedDirectory?.name ?? null,
    directoryRestoreState, directoryBookmarkIssue, storedArticles, setStoredArticles, articleIndexIssues, articleIndexMonths, articleChecks, articleListNotice, articleListWork, checkArticleList, cancelArticleListCheck, rebuildListIndexes, removeListCategories,
    editorWorkspace, editorWorkspaceIssue, editorWorkspaceBusy, selectedArticleCollection,
    editorDirectoryId, editorAppearanceVerified,
    editorAppearanceReady: directory ? editorAppearanceLoaded : directoryRestoreState !== 'checking',
    articlesForOverview, articleCollectionTitle, editorProjectsInDisplayOrder, orderedUnclassifiedArticles, orderedArchivedArticles,
    articleInfoDialogOpen, setArticleInfoDialogOpen, projectDeleteTarget, setProjectDeleteTarget,
    themeLibrary, setThemeLibrary, themeIssues, setThemeIssues,
    editorThemes, editorThemeIssues, createEditorTheme, loadDefaultEditorThemes, removeEditorTheme,
    snippets, setSnippets, snippetIssues, setSnippetIssues, snippetCategories, setSnippetCategories,
    templates, setTemplates, templateIssues, setTemplateIssues, templateCategories, setTemplateCategories,
    article, setArticle, articleSettings, setArticleSettings, settingsIssue, setSettingsIssue, setDefaultArticleTheme,
    settingsNotice, setSettingsNotice, settingsBusy, setSettingsBusy,
    historyDialogOpen, setHistoryDialogOpen, historySnapshots, setHistorySnapshots, historyIssues,
    setHistoryIssues, historySelectedId, setHistorySelectedId, historyBusy, historyRefreshPending,
    setHistoryRefreshPending, historyNotice, setHistoryNotice,
    revision, compiledRevision, setCompiledRevision, compiledCss, status, setStatus,
    mobilePane, setMobilePane, showThemeDialog, setShowThemeDialog, showTemplateDialog,
    setShowTemplateDialog, showUnsavedDialog, setShowUnsavedDialog, pendingActionLabel,
    setPendingActionLabel,
    copyTarget, setCopyTarget, copyOpenerRef, copyTitle, setCopyTitle, copyMonth, setCopyMonth,
    copyThemeTarget, setCopyThemeTarget, copySourceOverride, setCopySourceOverride, copyFromThemeLibrary, setCopyFromThemeLibrary, deleteTarget, deleteTargets, setDeleteTarget, setDeleteTargets, formatCheck, resolveFormatCheck, mediaTarget,
    setMediaTarget, mediaOperation, setMediaOperation, mediaRefreshRevision, isCompiling, mediaPickerRequest, openMediaPicker, closeMediaPicker, adoptLibraryImage, importSharedFiles, manageLibraryMedia, currentMediaReferenceCount, scanLibraryMediaReferences,
    previewRef, attachPreview, clipboardReceiverRef, sourceTextareaRef, articleRef, directoryRef, contentLibraryRootSessionRef,
    documentTokenRef, historyOpenerRef, mutationQueueRef, mediaOperationRef,
    parsed, parseErrors, currentTitle, currentArticleId, currentProjectName, getCurrentArticleId, articleList, currentArticleIsArchived, isReadyToCopy, articleMediaContext,
    updateArticle, updateArticleBody, compileCurrent, updateCurrentStyles, checkCurrentFormat, prepareVisualExport, loadStoredArticles, refreshArticles, saveCurrent, saveSettings,
    persistEditorWorkspace, saveEditorAppearance, setEditorColorMode, resetCurrentEditorAppearance,
    setArticleCollection, createProject, renameProject, setProjectCollapsed, setProjectPinned,
    reorderPinnedProjects, confirmDeleteProject, openArticleInfo, archiveStoredArticle, archiveStoredArticles, classifyStoredArticles,
    moveStoredArticleToProject, reorderStoredArticleGroup, moveStoredArticleInOrder, setStoredArticleProject,
    openArticleHistory, createManualHistorySnapshot, toggleHistoryRetention, refreshArticleHistory,
    restoreHistorySnapshot, saveHistoryAsArticle, importImages, renameMediaImage,
    runAfterDraftDecision, resolvePendingAction, cancelPendingAction, closeTemplateDialog,
    openStoredArticle, authorizeDirectory, requestCreateDataDirectory, createDataDirectory, createLibraryDialogOpen, setCreateLibraryDialogOpen, reopenRememberedDirectory, copyRichText, pasteRichText, changeField,
    changeTheme, applyThemeFromLibrary, createNewArticle, createArticleFromTemplate,
    beginCopy, confirmCopy, confirmDelete,
  };
}
