'use client';

import { ProductError, formatDiagnosticMessage, formatProductMessage, productCause, productDiagnosticReference, productJoin, productReference, productText, productErrorMessage, type ProductMessageInfo, type ProductMessageValue } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';
import { useArticleRenderMount, type ArticleDarkColors } from '../../lib/article-format/useArticleRenderMount';
import { ArticleDocument } from '../../lib/article-format/ArticleDocument';

import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useLibraryCapability } from '../../hooks/useLibraryCapability';
import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { SnippetTextarea } from '../content/SnippetTextarea';
import { validateContentSource } from '../../lib/contentValidation';
import { articleFormatMessageReference, type ArticleFormatIssue } from '../../lib/articleFormat';
import { getFormatSnapshot } from '../../lib/article-format/runtime';
import { PageHeading } from '../global/PageHeading';

import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';
import { ButtonBar } from '../global/ButtonBar';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { useDraftLocation, useEditingDraft, useEditingDrafts, UnsavedMark } from '../global/EditingDrafts';
import { hasEditingDraft } from '../../lib/editingDrafts';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { PreviewModeSwitch } from '../editor/PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { EditorColorPicker } from '../settings/EditorColorPicker';
import { ArticleThemeFields } from './ArticleThemeFields';
import { tailwindColorToHex } from '../../lib/tailwindPalette';
import type { EditorTheme } from '../../lib/editorThemes';
import { copyDefaultThemes } from '../../lib/themeDefaults';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteThemeLibraryTheme,
  loadThemeLibrary,
  saveThemeLibraryTheme,
  type ThemeLibraryIssue,
} from '../../lib/fileSystem';
import { refreshRootSession } from '../../lib/rootSession';
import { BASIC_THEME, resolveDefaultArticleTheme } from '../../lib/themes';
import { parseThemeConfigJson, inspectThemeConfig, inspectThemeCss, inspectThemeFormat } from '../../lib/themeValidation';
import type { ThemeConfig, ThemeNodeKey } from '../../lib/types';
import { MarkdownPreview } from '../../lib/article-format/MarkdownPreview';
import { useThemePreviewSample } from '../../hooks/useThemePreviewSample';
import { getThemePreviewSample } from '../../lib/themePreviewSample';
import { getArticleNodeSelectors, createArticleColorInspection, type ColorBinding } from '../../lib/themeInspection';
import { ThemeInspectionPreview, useThemeInspection, type ThemeInspection } from '../global/ThemeInspection';
import { compileArticleStyles, compileThemeInspectionUtilities } from '../../lib/article-format/renderer';

type ThemeLibraryProps = {
  root: FileSystemDirectoryHandle | null;
  themes: ThemeConfig[];
  editorThemes?: readonly EditorTheme[];
  issues: ThemeLibraryIssue[];
  currentTheme: ThemeConfig;
  defaultThemeId: string | null;
  currentArticleSaved: boolean;
  canApply: boolean;
  isRootCurrent: (root: FileSystemDirectoryHandle) => boolean;
  onLibraryChange: (root: FileSystemDirectoryHandle, themes: ThemeConfig[], issues: ThemeLibraryIssue[]) => void;
  onApply: (theme: ThemeConfig) => void;
  onSetDefault: (themeId: string, root: FileSystemDirectoryHandle) => Promise<void>;
};

function cloneTheme(theme: ThemeConfig): ThemeConfig {
  return JSON.parse(JSON.stringify(theme)) as ThemeConfig;
}

function uniqueThemeId(base: string, themes: ThemeConfig[]): string {
  const taken = new Set(themes.map((theme) => theme.id));
  const safeBase = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'imported-theme';
  if (!taken.has(safeBase)) return safeBase;
  let index = 2;
  while (taken.has(`${safeBase}-${index}`)) index += 1;
  return `${safeBase}-${index}`;
}

function ThemeIcon({ name }: { name: 'book' | 'upload' | 'plus' | 'edit' | 'apply' | 'info' | 'check' | 'save' | 'delete' | 'copy' | 'close' | 'code' | 'reset' }) {
  const paths = {
    book: 'M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V5Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
    plus: 'M12 5v14M5 12h14',
    edit: 'm4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4',
    apply: 'M4 7h10m-4-4 4 4-4 4M4 13v7h16V7h-2',
    info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    check: 'm4 12 5 5L20 6',
    save: 'M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6',
    delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    copy: 'M8 8h12v12H8V8ZM4 16V4h12',
    close: 'm6 6 12 12M18 6 6 18',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6',
    reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function ThemePreview({ theme, source: explicitSource, className = 'theme-stylebook-reader', framed = false, dark = false, inspection, onLocate, onNodeColors, onDarkColors }: { theme: ThemeConfig; source?: string; className?: string; framed?: boolean; dark?: boolean; inspection?: ThemeInspection; onLocate?: (binding: ColorBinding) => void; onNodeColors?: (colors: Partial<Record<ThemeNodeKey, string>>) => void; onDarkColors?: (theme: ThemeConfig, colors: ArticleDarkColors) => void }) {
  const { t } = useUITranslation('themes');
  const sample = useThemePreviewSample();
  const source = explicitSource ?? sample.markdown ?? '';
  const sampleUnavailable = explicitSource === undefined && sample.status !== 'ready';
  const formatSnapshot = useFormatSnapshot();
  const reactId = useId();
  const instanceScope = Array.from(reactId, character => character.codePointAt(0)!.toString(36)).join('-');
  const scopeClass = `theme-preview-instance-${instanceScope}`;
  const articleRef = useRef<HTMLElement | null>(null);
  const lightHostRef = useRef<HTMLDivElement | null>(null);

  const [compiledCss, setCompiledCss] = useState('');
  const [compileError, setCompileError] = useState('');
  const provenanceRef = useRef<ReturnType<typeof createArticleColorInspection> | null>(null);
  const [inspectionRevision, setInspectionRevision] = useState(0);
  const utilitiesRef = useRef('');
  const articleCss = articlePreviewStyle(`${compiledCss}\narticle.article-preview { min-height: 100%; min-width: 0; width: 100%; }`);
  const { target: lightTarget, native, darkIssue, darkColors, darkFrameRef: frameRef } = useArticleRenderMount(lightHostRef, formatSnapshot, compiledCss, dark, { colorTheme: onDarkColors && !sampleUnavailable ? theme : undefined });
  useEffect(() => { onDarkColors?.(theme, compileError || sampleUnavailable ? { status: 'error', values: {} } : darkColors); }, [theme, darkColors, compileError, sampleUnavailable, sample.id, onDarkColors]);
  useEffect(() => {
    let active = true;
    setCompiledCss(''); setCompileError('');
    if (sampleUnavailable) return;
    void compileArticleStyles(source, theme).then(({ css }) => {
      if (active) setCompiledCss(css);
    }).catch((error: unknown) => {
      if (active) setCompileError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [source, theme, formatSnapshot.id, sampleUnavailable]);
  useEffect(() => {
    const article = articleRef.current;
    if (!onNodeColors) return;
    if (!article || !compiledCss || sampleUnavailable) { onNodeColors({}); return; }
    let previous = '';
    const update = () => {
      const colors = Object.fromEntries(Object.entries(getArticleNodeSelectors()).flatMap(([key, selector]) => {
        const node = article.querySelector<HTMLElement>(selector);
        if (!node) return [];
        const value = article.ownerDocument.defaultView!.getComputedStyle(node).color;
        return [[key, tailwindColorToHex(value, article.ownerDocument)]];
      }));
      const snapshot = JSON.stringify(colors);
      if (snapshot !== previous) { previous = snapshot; onNodeColors(colors); }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(article, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [compiledCss, source, sampleUnavailable, onNodeColors]);
  useEffect(() => {
    if (!inspection || !compiledCss || !articleRef.current) return;
    provenanceRef.current = createArticleColorInspection(articleRef.current, theme, compiledCss);
    return () => { provenanceRef.current?.dispose(); provenanceRef.current = null; };
  }, [Boolean(inspection), theme, compiledCss, lightTarget]);
  useEffect(() => {
    if (!inspection) return;
    let active = true;
    void compileThemeInspectionUtilities().then(css => {
      if (!active) return;
      utilitiesRef.current = css;
      const shadow = lightHostRef.current?.shadowRoot;
      if (shadow && !shadow.querySelector('[data-theme-inspection-utilities]')) { const style = document.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = css; shadow.append(style); }
      const target = frameRef.current?.contentDocument;
      if (target && !target.querySelector('[data-theme-inspection-utilities]')) { const style = target.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = css; target.head.append(style); }
      setInspectionRevision(value => value + 1);
    });
    return () => { active = false; };
  }, [Boolean(inspection)]);
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!inspection || !doc || !utilitiesRef.current || doc.querySelector('[data-theme-inspection-utilities]')) return;
    const style = doc.createElement('style'); style.dataset.themeInspectionUtilities = 'true'; style.textContent = utilitiesRef.current; doc.head.append(style);
    setInspectionRevision(value => value + 1);
  }, [dark, darkColors, inspectionRevision, Boolean(inspection)]);
    const content = <div className={`${className} ${scopeClass}`} style={previewSurfaceStyle(dark)} data-preview-mode={dark ? 'dark' : 'light'}>
    {explicitSource === undefined && sample.status === 'loading' ? <p className="border-b border-line bg-panel p-4 text-xs text-muted" role="status">{t('themes:ui.previewSampleLoading')}</p> : null}
    {explicitSource === undefined && sample.status === 'error' ? <p className="border-b border-warning-line bg-warning-surface p-4 text-xs text-warning-strong" role="alert">{t('themes:ui.previewSampleUnavailable', { cause: formatProductMessage(sample.error, t) })}</p> : null}
    {explicitSource === undefined && sample.status === 'ready' && sample.origin === 'default' && sample.library ? <p className="border-b border-line bg-panel p-4 text-xs text-muted" role="status">{t('themes:ui.previewSampleDefault', { locale: sample.locale })}</p> : null}
    <div ref={lightHostRef} hidden={sampleUnavailable} className={framed ? 'mx-auto min-h-full min-w-0 w-full max-w-3xl rounded-lg shadow-panel' : 'min-h-full min-w-0 w-full border-0'} aria-busy={sampleUnavailable ? sample.status === 'loading' : !compiledCss && !compileError} />
    {lightTarget && !sampleUnavailable ? createPortal(<>{!native ? <style>{articleCss}</style> : null}<ArticleDocument snapshot={formatSnapshot} themeId={theme.id} attach={element => { articleRef.current = element; }}><MarkdownPreview source={source} snapshot={formatSnapshot} /></ArticleDocument></>, lightTarget) : null}
    {compileError ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">{t('themes:ui.themePreviewCompilationFailed')}{formatProductMessage(compileError, t)}</p> : null}
    {darkIssue ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">{formatProductMessage(darkIssue, t)}</p> : null}
  </div>;
  return inspection ? <ThemeInspectionPreview inspection={inspection} dialogOwner="theme-stylebook-title" rootRef={articleRef} frameRef={dark ? frameRef : undefined} revision={`${inspectionRevision}:${dark}:${darkColors.status}:${articleCss}`} className="flex min-h-0 flex-1 flex-col" onLocate={onLocate} resolve={(element, root) => {
    const light = articleRef.current;
    if (!light || !provenanceRef.current) return [];
    const index = [root, ...root.querySelectorAll<HTMLElement>('*')].indexOf(element);
    const original = [light, ...light.querySelectorAll<HTMLElement>('*')][index];
    return original ? provenanceRef.current.read(original) : [];
  }}>{content}</ThemeInspectionPreview> : content;
}

export function ThemeLibrary({ root, themes: storedThemes, editorThemes = [], issues, currentTheme, defaultThemeId, currentArticleSaved, canApply: canApplyInput, isRootCurrent, onLibraryChange, onApply, onSetDefault }: ThemeLibraryProps) {
  const { t } = useUITranslation('themes');
  const themeCapability = useLibraryCapability('articleTheme');
  const canApply = canApplyInput && themeCapability.enabled;
  const editingDrafts = useEditingDrafts();
  const themes = storedThemes;
  const defaultTheme = resolveDefaultArticleTheme(themes, defaultThemeId);
  const { dark, toggle } = useArticlePreviewMode();
  const [sessionRoot, setSessionRoot] = useState(root);
  const [selected, setSelected] = useState<ThemeConfig | null>(null);
  const [browsedThemeId, setBrowsedThemeId] = useState<string | null>(null);
  const [stylebookTheme, setStylebookTheme] = useState<ThemeConfig | null>(null);
  const [notice, setNotice] = useState<string | ProductMessageInfo | { message: string }>('');
  const [working, setWorking] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ThemeConfig | null>(null);
  const [deleteError, setDeleteError] = useState<string | ProductMessageInfo | { message: string }>('');
  const deletionRef = useRef<object | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  const sessionActive = sessionRoot === root && (!root || isRootCurrent(root));
  const browsedTheme = themes.find((theme) => theme.id === browsedThemeId)
    ?? themes.find((theme) => theme.id === currentTheme.id) ?? themes[0] ?? null;

  useEffect(() => {
    setSessionRoot(root);
    setSelected(null);
    setBrowsedThemeId(null);
    setStylebookTheme(null);
    setNotice('');
    setWorking(false);
    setRefreshPending(false);
    setDeleteTarget(null);
    setDeleteError('');
    deletionRef.current = null;
  }, [root]);

  const isSessionCurrent = (expectedRoot: FileSystemDirectoryHandle) => (
    root === expectedRoot && sessionRoot === expectedRoot && isRootCurrent(expectedRoot)
  );

  const updateFromRoot = async (expectedRoot: FileSystemDirectoryHandle = root!) => {
    if (!expectedRoot || !isSessionCurrent(expectedRoot)) return { kind: 'stale' as const };
    return refreshRootSession(
      expectedRoot,
      isSessionCurrent,
      loadThemeLibrary,
      (result) => onLibraryChange(expectedRoot, result.themes, result.issues),
    );
  };

  const publishTheme = (expectedRoot: FileSystemDirectoryHandle, saved: ThemeConfig) => {
    if (!isSessionCurrent(expectedRoot)) return;
    const nextThemes = storedThemes.some((theme) => theme.id === saved.id)
      ? storedThemes.map((theme) => theme.id === saved.id ? saved : theme)
      : [...storedThemes, saved];
    onLibraryChange(expectedRoot, nextThemes, issues);
  };

  const retryRefresh = async () => {
    if (!root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const result = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (result.kind === 'failed') {
        setRefreshPending(true);
        setNotice(productReference("themeLibrary.theOperationCompletedButTheThemeListHasNotRefreshedRetryLater", { "cause": productCause(result.error) }));
      } else if (result.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(productReference("themeLibrary.themeListReloaded"));
      }
    } finally {
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const createTheme = () => {
    if (!root || !sessionActive) return;
    const id = uniqueThemeId('custom-theme', themes);
    const base = themes[0] ?? BASIC_THEME;
    setSelected({ ...base, id, name: '未命名主题', version: '1.0.0' });
    setStylebookTheme({ ...base, id, name: '未命名主题', version: '1.0.0' });
  };

  const copyTheme = async (theme: ThemeConfig) => {
    if (!root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const id = uniqueThemeId(`${theme.id}-copy`, themes);
      const saved = await saveThemeLibraryTheme(operationRoot, { ...cloneTheme(theme), id, name: `${theme.name} 副本`, version: '1.0.0' });
      if (!isSessionCurrent(operationRoot)) return;
      publishTheme(operationRoot, saved);
      setSelected(saved);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(productReference("themeLibrary.copiedToTheLibraryButTheListCouldNotRefreshTheOperation", { "savedName": saved.name, "cause": productCause(refreshed.error) }));
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(productReference("themeLibrary.created", { "savedName": saved.name }));
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      setNotice(productReference("themeLibrary.themeCopyFailed", { "cause": productCause(error) }));
    } finally {
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const importTheme = async (file?: File) => {
    if (!file || !root || !isSessionCurrent(root)) return;
    const operationRoot = root;
    setWorking(true);
    try {
      const incoming = parseThemeConfigJson(await file.text());
      if (!isSessionCurrent(operationRoot)) return;
      const collision = themes.some((theme) => theme.id === incoming.id);
      const prepared = collision
        ? { ...incoming, id: uniqueThemeId(`${incoming.id}-copy`, themes), name: `${incoming.name} 副本`, version: '1.0.0' }
        : incoming;
      const saved = await saveThemeLibraryTheme(operationRoot, prepared);
      if (!isSessionCurrent(operationRoot)) return;
      publishTheme(operationRoot, saved);
      setSelected(saved);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(productReference("themeLibrary.importedIntoTheLibraryButTheListCouldNotRefreshTheOperation", { "savedName": saved.name, "cause": productCause(refreshed.error) }));
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(productReference(collision ? 'themeLibrary.importedDuplicate' : 'themeLibrary.imported', { savedName: saved.name }));
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      setNotice(productReference("themeLibrary.importFailed", { "cause": productCause(error) }));
    } finally {
      if (isSessionCurrent(operationRoot)) {
        setWorking(false);
        if (importRef.current) importRef.current.value = '';
      }
    }
  };

  const requestDelete = (theme: ThemeConfig) => {
    if (!root || working || themes.length <= 1 || !isSessionCurrent(root)) return;
    if (theme.id === defaultThemeId) { setNotice(productReference("themeLibrary.setAnotherThemeAsTheDefaultBeforeDeletingThisTheme")); return; }
    setDeleteError('');
    setDeleteTarget(theme);
  };

  const deleteTheme = async (theme: ThemeConfig) => {
    if (!root || deletionRef.current || !isSessionCurrent(root)) return;
    const operationRoot = root;
    const operation = {};
    deletionRef.current = operation;
    setDeleteError('');
    setWorking(true);
    try {
      await deleteThemeLibraryTheme(operationRoot, theme.id);
      if (!isSessionCurrent(operationRoot)) return;
      onLibraryChange(operationRoot, storedThemes.filter((item) => item.id !== theme.id), issues);
      setSelected(null);
      setDeleteTarget(null);
      setBrowsedThemeId((id) => id === theme.id ? null : id);
      const refreshed = await updateFromRoot(operationRoot);
      if (!isSessionCurrent(operationRoot)) return;
      if (refreshed.kind === 'failed') {
        setRefreshPending(true);
        setNotice(productReference("themeLibrary.deletedExistingArticleSnapshotsAreRetainedTheListCouldNotRefreshDo", { "themeName": theme.name, "cause": productCause(refreshed.error) }));
      } else if (refreshed.kind === 'refreshed') {
        setRefreshPending(false);
        setNotice(productReference("themeLibrary.deletedFromTheThemeLibraryExistingArticleSnapshotsAreRetained", { "themeName": theme.name }));
      }
    } catch (error) {
      if (!isSessionCurrent(operationRoot)) return;
      const message = productReference('themeLibrary.deleteFailed', { cause: productCause(error) });
      setDeleteError(message);
      setNotice(message);
    } finally {
      if (deletionRef.current === operation) deletionRef.current = null;
      if (isSessionCurrent(operationRoot)) setWorking(false);
    }
  };

  const exportTheme = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${theme.id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(productReference("themeLibrary.exportedJson", { "themeId": theme.id }));
  };

  const applyTheme = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    if (!canApply) {
      setNotice(productReference("themeLibrary.theOpenArticleBelongsToAnotherLibrarySwitchBackToItsLibrary"));
      return;
    }
    onApply(theme);
    setSelected(null);
    setStylebookTheme(null);
  };

  const setDefault = async (theme: ThemeConfig) => {
    if (!root || working || !isSessionCurrent(root)) return;
    const expectedRoot = root;
    setWorking(true);
    try {
      await onSetDefault(theme.id, expectedRoot);
      if (isSessionCurrent(expectedRoot)) setNotice(productReference("themeLibrary.setAsTheDefaultForNewArticlesAndTemplatePreviewsExistingArticle", { "themeName": theme.name }));
    } catch (error) {
      if (isSessionCurrent(expectedRoot)) setNotice(productReference("themeLibrary.defaultThemeSavingFailed", { "cause": productCause(error) }));
    } finally { if (isSessionCurrent(expectedRoot)) setWorking(false); }
  };

  const loadDefaults = async () => {
    if (!root || working || !isSessionCurrent(root)) return;
    const expectedRoot = root;
    setWorking(true);
    try {
      const result = await copyDefaultThemes(expectedRoot, 'article-themes');
      if (!isSessionCurrent(expectedRoot)) return;
      const refreshed = await updateFromRoot(expectedRoot);
      if (!isSessionCurrent(expectedRoot)) return;
      setRefreshPending(refreshed.kind === 'failed');
      setNotice(productReference("themeLibrary.defaultThemesAddedExistingThemesSkipped", { "resultAdded": result.added, "resultSkipped": result.skipped, "details": productJoin(result.issues.map(issue => productJoin([issue.file, '：', productDiagnosticReference(issue)])), '；'), "value": (refreshed.kind === 'failed' ? productReference("themeLibrary.theListCouldNotRefreshTryAgain") : '') }));
    } catch (error) { if (isSessionCurrent(expectedRoot)) setNotice(productErrorMessage(error)); }
    finally { if (isSessionCurrent(expectedRoot)) setWorking(false); }
  };

  const openStylebook = (theme: ThemeConfig) => {
    if (!sessionActive) return;
    setSelected(null);
    setDeleteTarget(null);
    setStylebookTheme(theme);
  };

  if (!sessionActive) {
    return <section className="page-card theme-library-page" aria-label={t('themes:ui.articleThemes')}><p className="status-copy" role="status">{t('themes:ui.switchingLibrariesThemeOperationsInThePreviousLibrary')}</p></section>;
  }

  return (
    <section className="page-card theme-library-page lg:overflow-hidden" aria-labelledby="theme-library-title">
      <PageHeading>
        <div className="min-w-0"><p id="theme-library-kicker" className="eyebrow">{t('themes:ui.articleStylebook')}</p><h2 id="theme-library-title" className="page-title font-heading">{t('themes:ui.themeLibraryAndTypographySamples')}</h2><p className="mt-3 text-sm text-muted">{t('themes:ui.chooseTypographyAndPreviewHeadingsBodyTextAnd')}</p></div>
        <ButtonBar label={t('themes:ui.themeLibraryActions')}>
          <button className="button button-quiet bg-panel" type="button" onClick={() => importRef.current?.click()} disabled={!root || working}><ThemeIcon name="upload" />{t('themes:ui.importJson')}</button>
          <input ref={importRef} className="sr-only" type="file" accept=".json,application/json" aria-label={t('themes:ui.importThemeJsonFile')} disabled={!root || working} onChange={(event) => void importTheme(event.currentTarget.files?.[0])} />
          <button className="button button-quiet" type="button" disabled={!root || working} onClick={() => void loadDefaults()}><ThemeIcon name="plus" />{t('themes:ui.loadDefaultThemes')}</button>
          <button className="button button-primary" type="button" onClick={createTheme} disabled={!root || working}><ThemeIcon name="plus" />{t('themes:ui.newTheme')}</button>
        </ButtonBar>
      </PageHeading>

      {!root ? <p className="shrink-0 rounded-lg border border-line bg-list px-4 py-3 text-xs text-muted">{t('themes:ui.connectALibraryToReadItsArticleThemes')}</p> : null}
      {notice ? <p className="status-copy shrink-0 rounded-lg border border-accent-line bg-accent-soft px-4 py-3" role="status">{formatProductMessage(notice, t)}</p> : null}
      {refreshPending ? <button className="button button-quiet self-start" type="button" onClick={() => void retryRefresh()} disabled={working}>{t('themes:ui.reloadThemeList')}</button> : null}
      {issues.length ? <CollapsiblePanel id="theme-library-issues" title={t('themes:ui.themeFilesNeedRepair')} icon={<PanelIcon kind="issues" />} count={issues.length} open={issuesOpen} onToggle={() => setIssuesOpen(value => !value)} className="shrink-0 border-warning-line bg-warning-surface" contentClassName="text-xs text-warning-strong"><div className="grid max-h-32 gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{issues.map((issue) => <p className="break-words" key={`${issue.file}-${issue.message}`}><code>{issue.file}</code>：{formatDiagnosticMessage(issue, t)}</p>)}</div></CollapsiblePanel> : null}

      {browsedTheme ? (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel lg:flex-1 lg:flex-row">
          <aside className="flex min-h-0 shrink-0 flex-col border-b border-line bg-list/50 lg:w-72 lg:border-b-0 lg:border-r" aria-label={t('themes:ui.themeList')}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4"><h3 className="text-sm font-semibold text-primary">{t('themes:ui.articleThemes')}</h3><span className="font-mono text-xs text-faint">{t('themes:templates.themeCount', { count: themes.length })}</span></div>
            <div className="grid max-h-56 min-h-0 content-start gap-2 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:max-h-none lg:flex-1">
              {themes.map((theme) => <button key={theme.id} className="group flex min-w-0 items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft" type="button" aria-label={t('themes:templates.previewTheme', { name: theme.name })} aria-pressed={browsedTheme.id === theme.id} aria-controls="theme-library-preview" onClick={() => setBrowsedThemeId(theme.id)}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-muted group-aria-pressed:border-accent-line group-aria-pressed:text-accent-text"><ThemeIcon name="book" /></span>
                <span className="grid min-w-0 flex-1 gap-1"><span className="break-words font-sub-heading text-base font-semibold text-primary group-aria-pressed:text-accent-text">{theme.name}{hasEditingDraft(editingDrafts, root, 'themes', theme.id) ? <UnsavedMark className="ml-2 inline-block" /> : null}</span><span className="break-all font-mono text-2xs text-faint">{theme.id} · v{theme.version}</span>{theme.id === defaultTheme.id ? <span className="flex items-center gap-1 text-2xs text-accent-text"><ThemeIcon name="check" />{t('themes:ui.defaultForNewArticles')}</span> : null}{theme.id === currentTheme.id && theme.version === currentTheme.version ? <span className="flex items-center gap-1 text-2xs text-muted"><ThemeIcon name="check" />{t('themes:ui.usedByCurrentArticle')}</span> : null}</span>
              </button>)}
            </div>
            <p className="hidden shrink-0 border-t border-line px-5 py-4 text-xs text-faint lg:block">{t('themes:ui.selectAThemeToPreviewItTheArticle')}</p>
          </aside>
          <section id="theme-library-preview" className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="theme-preview-title">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
              <div className="min-w-0"><h3 id="theme-preview-title" className="break-words font-heading text-xl font-semibold text-primary">{browsedTheme.name}</h3><p className="mt-1 text-xs text-faint">{t('themes:ui.fullTypographyPreview')} <span className="mx-2 text-line-strong" aria-hidden="true">/</span><span className="font-mono">v{browsedTheme.version}</span></p></div>
              <ButtonBar label={t('themes:ui.themePreviewActions')}><PreviewModeSwitch dark={dark} onToggle={toggle} /><button className="button button-quiet" type="button" onClick={() => { setSelected(browsedTheme); setDeleteTarget(null); }}><ThemeIcon name="info" />{t('themes:ui.themeDetails')}</button><button className="button button-quiet" type="button" onClick={() => openStylebook(browsedTheme)} disabled={!root || working}><ThemeIcon name="edit" />{t('themes:ui.editTheme')}</button><button className="button button-danger" type="button" onClick={() => requestDelete(browsedTheme)} disabled={!root || working || themes.length <= 1 || browsedTheme.id === defaultThemeId} title={browsedTheme.id === defaultThemeId ? t('themes:ui.chooseAnotherDefaultThemeFirst') : undefined}><ThemeIcon name="delete" />{t('themes:ui.deleteTheme')}</button></ButtonBar>
            </header>
            <ThemePreview key={`${browsedTheme.id}-${browsedTheme.version}`} theme={browsedTheme} dark={dark} framed className="h-120 min-h-0 min-w-0 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent lg:h-auto lg:flex-1" />
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 md:px-6">
              <p className="text-xs text-muted">{currentArticleSaved ? t('themes:ui.applyingCreatesANewArticleCopyAndRetains') : t('themes:ui.previewLeavesTheArticleUnchangedContinueEditingAfter')}</p>
              <ButtonBar label={t('themes:ui.themeApplicationActions')} title={themeCapability.reason} tabIndex={!themeCapability.enabled ? 0 : undefined}><button className="button button-quiet" type="button" onClick={() => void setDefault(browsedTheme)} disabled={!root || working || !themeCapability.enabled || browsedTheme.id === defaultTheme.id}><ThemeIcon name="check" />{browsedTheme.id === defaultTheme.id ? t('themes:ui.currentDefault') : t('themes:ui.setAsDefaultForNewArticles')}</button><button className="button button-primary" type="button" onClick={() => applyTheme(browsedTheme)} disabled={!canApply || working}><ThemeIcon name="apply" />{canApplyInput ? currentArticleSaved ? t('themes:ui.copyAndApply') : t('themes:ui.applyToCurrentArticle') : !root ? t('themes:ui.connectALibraryToApply') : t('themes:ui.articleBelongsToAnotherLibrary')}</button></ButtonBar>
            </footer>
          </section>
        </div>
      ) : <div className="empty-state"><div><strong>{t('themes:ui.noThemesAvailable')}</strong><p>{t('themes:ui.importThemeJsonOrCreateAThemeTo')}</p></div></div>}

      {selected && !stylebookTheme && !deleteTarget ? <ThemeCardDialog
        theme={selected}
        root={root}
        currentTheme={currentTheme}
        currentArticleSaved={currentArticleSaved}
        canApply={canApply}
        busy={working}
        canDelete={storedThemes.length > 1 && selected.id !== defaultThemeId}
        onClose={() => { setSelected(null); setDeleteTarget(null); }}
        onOpenStylebook={() => openStylebook(selected)}
        onCopy={() => void copyTheme(selected)}
        onExport={() => exportTheme(selected)}
        onApply={() => applyTheme(selected)}
        onRequestDelete={() => requestDelete(selected)}
      /> : null}

      {deleteTarget ? <ThemeDeleteDialog theme={deleteTarget} busy={working} error={deleteError} onCancel={() => { if (!deletionRef.current) setDeleteTarget(null); }} onDelete={() => deleteTheme(deleteTarget)} /> : null}

      {stylebookTheme ? <ThemeStylebookDialog
        key={stylebookTheme.id}
        theme={stylebookTheme}
        root={root}
        isRootCurrent={isRootCurrent}
        canApply={canApply}
        onClose={() => { setStylebookTheme(null); setSelected(null); setDeleteTarget(null); }}
        onApply={() => applyTheme(stylebookTheme)}
        onSaved={(savedRoot, saved) => {
          if (!isSessionCurrent(savedRoot)) return;
          setStylebookTheme(saved);
          setSelected((current) => current?.id === saved.id ? saved : current);
          publishTheme(savedRoot, saved);
          setNotice(productReference("themeLibrary.savedVArticleSnapshotsAreUnchanged", { "savedName": saved.name, "savedVersion": saved.version }));
        }}
      /> : null}
    </section>
  );
}

function ThemeCardDialog({
  theme, root, currentTheme, currentArticleSaved, busy,
  canApply, canDelete,
  onClose, onOpenStylebook, onCopy, onExport, onApply, onRequestDelete,
}: {
  theme: ThemeConfig;
  root: FileSystemDirectoryHandle | null;
  currentTheme: ThemeConfig;
  currentArticleSaved: boolean;
  canApply: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenStylebook: () => void;
  onCopy: () => void;
  onExport: () => void;
  onApply: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const { dark, toggle } = useArticlePreviewMode();
  return <DialogFrame large titleId="theme-card-title" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="theme-card-title" eyebrow={`${t('common:eyebrows.theme')} / ${theme.id} / v${theme.version}`} title={theme.name} onClose={onClose} closeDisabled={busy} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 md:basis-1/3 md:border-r md:border-b-0" aria-label={t('dialogs:ui.themeDetailsMenu')}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent"><p className="eyebrow mb-3">{t('common:eyebrows.themeActions')}</p><ButtonBar label={t('dialogs:ui.themeActions')} className="flex-col items-stretch">
          <button className="button button-primary justify-start" type="button" onClick={onApply} disabled={!canApply || busy}><ThemeIcon name="apply" />{currentArticleSaved ? t('dialogs:ui.copyAndApply') : t('dialogs:ui.applyToCurrentDraft')}</button>
          <button className="button button-quiet justify-start" type="button" onClick={onOpenStylebook} disabled={!root || busy}><ThemeIcon name="edit" />{t('dialogs:ui.editTheme')}</button>
          <button className="button button-quiet justify-start" type="button" onClick={onCopy} disabled={!root || busy}><ThemeIcon name="copy" />{t('dialogs:ui.copyTheme')}</button>
          <button className="button button-quiet justify-start" type="button" onClick={onExport} disabled={busy}><ThemeIcon name="upload" />{t('dialogs:ui.exportJson')}</button>
          <button className="button button-danger justify-start" type="button" onClick={onRequestDelete} disabled={!root || !canDelete || busy}><ThemeIcon name="delete" />{t('dialogs:ui.deleteTheme')}</button>
        </ButtonBar><div className="mt-6 grid gap-3 border-t border-line pt-4 text-xs text-muted"><p className="font-sub-heading text-sm font-semibold text-primary">{t('dialogs:ui.currentDraftUses')}</p><p className="break-words">{currentTheme.name}</p><p className="font-mono text-2xs text-faint">v{currentTheme.version}</p><p>{currentArticleSaved ? t('dialogs:ui.applyCopyRetains') : t('dialogs:ui.applyChangesDraft')}</p></div>
        </div>
      </aside>
      <div className="flex min-h-60 min-w-0 flex-1 flex-col gap-3 p-4 md:min-h-0"><div className="flex shrink-0 items-center justify-between gap-3"><p className="font-sub-heading text-sm font-medium text-primary">{t('dialogs:ui.articleTypographyPreview')}</p><PreviewModeSwitch dark={dark} onToggle={toggle} /></div><ThemePreview theme={theme} dark={dark} /></div>
    </div>
  </DialogFrame>;
}

function ThemeDeleteDialog({ theme, busy, error, onCancel, onDelete }: {
  theme: ThemeConfig;
  busy: boolean;
  error: string | ProductMessageInfo | { message: string };
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useUITranslation('dialogs');
  return <DialogFrame titleId="theme-delete-title" descriptionId="theme-delete-description" role="alertdialog" onClose={onCancel} dismissible={!busy}>
    <DialogHeader titleId="theme-delete-title" eyebrow={t('common:eyebrows.deleteTheme')} title={t('dialogs:ui.deleteTheme')} onClose={onCancel} closeDisabled={busy} />
    <div className="dialog-content">
      <p id="theme-delete-description" className="text-sm text-muted">{t('dialogs:templates.deleteTheme', { name: theme.name })}</p>
      <p className="break-all font-mono text-xs text-faint">{theme.id}.json</p>
      {error ? <p className="text-sm text-danger" role="alert">{formatProductMessage(error, t)}</p> : null}
      <DialogActions><DialogButton onClick={onCancel} disabled={busy}><ThemeIcon name="close" />{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" onClick={() => void onDelete()} disabled={busy}><ThemeIcon name="delete" />{busy ? t('dialogs:ui.deleting') : t('dialogs:ui.confirmDeletion')}</DialogButton></DialogActions>
    </div>
  </DialogFrame>;
}

function ThemeStylebookDialog({ theme, root, isRootCurrent, canApply, onClose, onApply, onSaved }: {
  theme: ThemeConfig;
  root: FileSystemDirectoryHandle | null;
  isRootCurrent: (root: FileSystemDirectoryHandle) => boolean;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
  onSaved: (root: FileSystemDirectoryHandle, theme: ThemeConfig) => void;
}) {
  const { t } = useUITranslation('dialogs');
  const previewSample = useThemePreviewSample();
  const formatSnapshot = useFormatSnapshot();
  const { dark, toggle } = useArticlePreviewMode();
  const layout = useResizableColumns(100 / 3, '(width >= 48rem)');
  const [picker, setPicker] = useState<{ label: string; token: string; value: string; select: (color: string) => void; scheme?: 'light' | 'dark' } | null>(null);
  const [departure, setDeparture] = useState(false);
  // The unsaved gate serves two exits now: closing the editor and applying the theme.
  const [applyAfter, setApplyAfter] = useState(false);
  const savedBaseline = useRef(JSON.stringify(theme));
  const savedCode = useRef({ css: theme.css, json: JSON.stringify(theme, null, 2) });
  const [codeErrors, setCodeErrors] = useState<{ css: ProductMessageValue; json: ProductMessageValue }>({ css: '', json: '' });
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => cloneTheme(theme));
  const [previewTheme, setPreviewTheme] = useState(() => cloneTheme(theme));
  const [editorTab, setEditorTab] = useState<'tokens' | 'css' | 'json'>('tokens');
  const editOrigin = useRef(editorTab);
  const location = useDraftLocation(() => document.getElementById('theme-stylebook-title')?.closest<HTMLElement>('[role=dialog]') ?? null);
  const [cssText, setCssText] = useState(theme.css);
  const [jsonText, setJsonText] = useState(JSON.stringify(theme, null, 2));
  const [nodeKey, setNodeKey] = useState<ThemeNodeKey>('h1');
  const [nodeColors, setNodeColors] = useState<Partial<Record<ThemeNodeKey, string>>>({});
  const [darkColorRecord, setDarkColorRecord] = useState<{ theme: ThemeConfig; colors: ArticleDarkColors } | null>(null);
  const receiveDarkColors = useCallback((theme: ThemeConfig, colors: ArticleDarkColors) => setDarkColorRecord({ theme, colors }), []);
  const darkColors: ArticleDarkColors | undefined = JSON.stringify(draft) !== JSON.stringify(previewTheme) ? { status: 'error', values: {} } : darkColorRecord?.theme === previewTheme ? darkColorRecord.colors : undefined;
  const inspection = useThemeInspection();
  const cssEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const locateInspection = (binding: ColorBinding) => {
    if (binding.kind === 'css') setEditorTab('css');
    else { setEditorTab('tokens'); if (binding.node) setNodeKey(binding.node); }
  };
  useEffect(() => {
    const binding = inspection.selected;
    if (binding?.kind !== 'css' || binding.start === undefined) return;
    const frame = requestAnimationFrame(() => {
      const editor = cssEditorRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true }); editor.setSelectionRange(binding.start!, binding.end ?? binding.start!);
      const line = editor.value.slice(0, binding.start).split('\n').length - 1;
      editor.scrollTo({ top: line * parseFloat(getComputedStyle(editor).lineHeight), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [inspection.selected, editorTab]);
  const [error, setError] = useState<ProductMessageValue>('');
  const [savedMessage, setSavedMessage] = useState('');
  const [sampleReport, setSampleReport] = useState<{ theme: ThemeConfig; formatId: string; sample: ReturnType<typeof getThemePreviewSample>; issues: ArticleFormatIssue[] } | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = !root;

  const updateDraft = (next: ThemeConfig) => {
    editOrigin.current = editorTab; location.capture();
    setWriteFailed(false);
    setDraft(next);
    if (!jsonNeedsValidation) setJsonText(JSON.stringify(next, null, 2));
    setSavedMessage('');
    const errors = [...inspectThemeConfig(next), ...inspectThemeFormat(next)];
    if (errors.length) setError(productReference('shared.compose', { parts: productJoin(errors, '；') }));
    else {
      setError('');
      setPreviewTheme(next);
    }
  };

  const formatCodeErrors = (errors: { css: ProductMessageValue; json: ProductMessageValue }) => errors.css || errors.json ? productReference('shared.compose', { parts: productJoin([errors.css ? productJoin(['CSS：', errors.css]) : '', errors.json ? productJoin(['JSON：', errors.json]) : ''].filter(Boolean), '；') }) : '';
  const changeCode = (kind: 'css' | 'json', value: string) => {
    editOrigin.current = kind; location.capture();
    setWriteFailed(false);
    if (kind === 'css') setCssText(value); else setJsonText(value);
    const nextErrors = { ...codeErrors, [kind]: '' };
    setCodeErrors(nextErrors);
    setError(formatCodeErrors(nextErrors));
    setSavedMessage('');
  };
  const validateCode = (): ThemeConfig | null => {
    setWriteFailed(false);
    const cssFailures = inspectThemeCss(cssText);
    const failures: { css: ProductMessageValue; json: ProductMessageValue } = { css: cssFailures.length ? productReference('shared.compose', { parts: productJoin(cssFailures, '；') }) : '', json: '' };
    let parsed: ThemeConfig | null = null;
    try {
      parsed = parseThemeConfigJson(jsonText);
      if (parsed.id !== theme.id) throw new ProductError("themeLibrary.aThemeIdCannotBeChangedInThisEditorCopyTheTheme");
    } catch (cause) { failures.json = productCause(cause); }
    setCodeErrors(failures);
    if (failures.css || failures.json || !parsed) {
      setError(formatCodeErrors(failures));
      setSavedMessage('');
      return null;
    }
    // JSON supplies the theme fields; explicitly edited CSS supplies its stylesheet.
    const next = { ...parsed, css: cssNeedsValidation ? cssText : parsed.css };
    const formatFailures = inspectThemeFormat(next);
    if (formatFailures.length) {
      setCodeErrors(current => ({ ...current, css: productReference('shared.compose', { parts: productJoin(formatFailures, '；') }) }));
      setError(productReference('shared.compose', { parts: productJoin(formatFailures, '；') }));
      setSavedMessage('');
      return null;
    }
    setDraft(next);
    setPreviewTheme(next);
    setCssText(next.css);
    setJsonText(JSON.stringify(next, null, 2));
    setError('');
    setSavedMessage(productText("themeLibrary.cssAndJsonValidationPassedAppliedToThisTemporaryPreview"));
    return next;
  };

  const save = async (validatedDraft?: ThemeConfig): Promise<boolean> => {
    if (!root || !isRootCurrent(root) || savingRef.current || unappliedChanges && !validatedDraft || !dirty) return false;
    const operationRoot = root;
    const formatId = getFormatSnapshot().id;
    const sample = getThemePreviewSample();
    if (sample !== previewSample || sample.status !== 'ready' || sample.markdown === null) { setError(sample.error ?? productReference('themeSample.invalidContent')); return false; }
    const target = validatedDraft ?? draft;
    const errors = [...inspectThemeConfig(target), ...inspectThemeFormat(target)];
    if (errors.length) {
      setError(productReference('shared.compose', { parts: productJoin(errors, '；') }));
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setWriteFailed(false);
    setError('');
    setSavedMessage(productText("themeLibrary.saving"));
    try {
      const measured = await validateContentSource('snippets', sample.markdown, { theme: target, purpose: 'theme' });
      if (!isRootCurrent(operationRoot) || getFormatSnapshot().id !== formatId || getThemePreviewSample() !== sample) return false;
      setSampleReport({ theme: target, formatId, sample, issues: measured.issues });
      if (measured.errors.length) { setError(measured.errorMessage ?? measured.errors.join('；')); setSavedMessage(productText("themeLibrary.layoutValidationDidNotPassTheThemeFileWasNotWritten")); return false; }
      const saved = await saveThemeLibraryTheme(operationRoot, target);
      if (!isRootCurrent(operationRoot) || getFormatSnapshot().id !== formatId || getThemePreviewSample() !== sample) return false;
      savedBaseline.current = JSON.stringify(saved);
      savedCode.current = { css: saved.css, json: JSON.stringify(saved, null, 2) };
      setDraft(saved);
      setPreviewTheme(saved);
      setCssText(saved.css);
      setJsonText(JSON.stringify(saved, null, 2));
      setSampleReport({ theme: saved, formatId, sample, issues: measured.issues });
      setError('');
      setSavedMessage(productText("themeLibrary.savedVExistingArticleSnapshotsAreUnchanged", { "savedVersion": saved.version, "value": (measured.issues.length ? productReference("themeLibrary.concernsRequiringReview", { "measured_issuesCount": measured.issues.length }) : '') }));
      onSaved(operationRoot, saved);
      return true;
    } catch (cause) {
      if (!isRootCurrent(operationRoot)) return false;
      setError(productReference("themeLibrary.savingFailed", { "cause": productCause(cause) }));
      setWriteFailed(true);
      return false;
    } finally {
      savingRef.current = false;
      if (isRootCurrent(operationRoot)) setSaving(false);
    }
  };

  const setToken = (key: string, value: string) => updateDraft({ ...draft, tokens: { ...draft.tokens, [key]: value } });
  const setDarkToken = (key: string, value: string | null) => {
    const tokens = { ...draft.dark?.tokens };
    if (value === null) delete tokens[key]; else tokens[key] = value;
    updateDraft({ ...draft, dark: { tokens } });
  };
  const selectedNode = draft.nodes?.[nodeKey] ?? {};
  const cssNeedsValidation = cssText !== draft.css;
  const jsonNeedsValidation = jsonText !== JSON.stringify(draft, null, 2);
  const unappliedChanges = cssNeedsValidation || jsonNeedsValidation;
  const dirty = JSON.stringify(draft) !== savedBaseline.current || unappliedChanges;
  const reviewIssues = !unappliedChanges && sampleReport?.theme === draft && sampleReport.formatId === formatSnapshot.id && sampleReport.sample === previewSample ? sampleReport.issues : [];
  const resumeTheme = () => { setDeparture(false); setApplyAfter(false); setEditorTab(editOrigin.current); location.restore(); };
  useEditingDraft(dirty ? { kind: 'article-theme', root, objectId: theme.id, resume: resumeTheme } : null);
  const resetChanges = () => {
    if (readOnly || savingRef.current || !dirty) return;
    const baseline = cloneTheme(JSON.parse(savedBaseline.current) as ThemeConfig);
    setDraft(baseline);
    setPreviewTheme(baseline);
    setCssText(baseline.css);
    setJsonText(JSON.stringify(baseline, null, 2));
    setCodeErrors({ css: '', json: '' });
    setWriteFailed(false);
    setError('');
    setSavedMessage('');
  };
  const close = () => { if (savingRef.current) return; if (dirty) { location.capture(); setDeparture(true); } else onClose(); };
  // Applying used to leave straight away, so unsaved edits were dropped without a word.
  const requestApply = () => { if (savingRef.current) return; if (dirty) { location.capture(); setApplyAfter(true); setDeparture(true); } else onApply(); };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const setNodeValue = (key: 'fontSize' | 'lineHeight' | 'color', value: string) => {
    const nextNodes = { ...draft.nodes, [nodeKey]: { ...selectedNode, [key]: value || undefined } };
    const nodeRules = nextNodes[nodeKey] ?? {};
    if (!nodeRules.fontSize && !nodeRules.lineHeight && !nodeRules.color) delete nextNodes[nodeKey];
    updateDraft({ ...draft, nodes: Object.keys(nextNodes).length ? nextNodes : undefined });
  };
  const resetNode = () => {
    const nextNodes = { ...draft.nodes };
    delete nextNodes[nodeKey];
    updateDraft({ ...draft, nodes: Object.keys(nextNodes).length ? nextNodes : undefined });
  };

  const activeTab = editorTab;
  const chooseTab = setEditorTab;
  const tabs = [{ id: 'tokens', label: productText("themeLibrary.commonFields"), icon: 'edit', pending: false, modified: false, failed: false }, { id: 'css', label: 'CSS', icon: 'code', pending: cssNeedsValidation, modified: cssText !== savedCode.current.css, failed: Boolean(codeErrors.css) }, { id: 'json', label: 'JSON', icon: 'code', pending: jsonNeedsValidation, modified: jsonText !== savedCode.current.json, failed: Boolean(codeErrors.json) }] as const;
  const openColor = (label: string, token: string, value: string, select: (color: string) => void, scheme?: 'light' | 'dark') => {
    try { setPicker({ label, token, value: tailwindColorToHex(value, document), select, scheme }); }
    catch { setError(productText("themeLibrary.theCurrentColorCouldNotBeParsedFixItInCssOr")); }
  };
  return <>
    <DialogFrame large titleId="theme-stylebook-title" onClose={close} dismissible={!saving && !picker && !departure} focusActive={!picker && !departure} onKeyDown={event => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault(); event.stopPropagation();
      if (readOnly || savingRef.current || saving || picker || departure || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (unappliedChanges) { const next = validateCode(); if (next) void save(next); } else void save();
    }}>
      <header className="dialog-header shrink-0"><div className="min-w-0"><p className="eyebrow">{t('common:eyebrows.articleTheme')} / v{draft.version}</p><h2 id="theme-stylebook-title" className="font-heading dialog-title break-words">{draft.name}</h2></div><ButtonBar label={t('dialogs:ui.articleThemeActions')}><button className="button button-quiet" type="button" onClick={requestApply} disabled={!canApply || saving}><ThemeIcon name="apply" />{t('dialogs:ui.applyToArticle')}</button><button className="button button-quiet" type="button" onClick={close} disabled={saving}><ThemeIcon name="close" />{t('common:actions.close')}</button></ButtonBar></header>
      <div ref={layout.containerRef} className="group/theme-columns flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto data-[wide=true]:flex-row data-[wide=true]:overflow-hidden" data-wide={layout.wideEnough} data-dragging={layout.dragging} style={layout.style}>
        <aside ref={inspection.listRef} {...inspection.listProps} className="flex h-96 min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 group-data-[wide=true]/theme-columns:h-auto group-data-[wide=true]/theme-columns:w-(--editor-source-width) group-data-[wide=true]/theme-columns:border-b-0" aria-label={t('dialogs:ui.temporaryThemeEditor')}>
          <div className="shrink-0 border-b border-line p-4"><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.themeName')}<input className="field min-w-0 w-full" value={draft.name} disabled={readOnly || saving} onChange={event => updateDraft({ ...draft, name: event.target.value })} /></label><p className="mt-2 break-all font-mono text-2xs text-faint">{draft.id}</p></div>
          <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-line p-3" role="tablist" aria-label={t('dialogs:ui.themeEditMenu')}>{tabs.map((tab, index) => <button key={tab.id} id={`article-theme-tab-${tab.id}`} role="tab" type="button" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} aria-controls="article-theme-editor-panel" disabled={saving} data-validation={tab.failed ? 'failed' : tab.pending ? 'pending' : 'complete'} data-modified={tab.modified} aria-label={tab.failed ? t('dialogs:templates.tabFailed', { name: t('dialogs:themeTabs.' + tab.id) }) : tab.modified ? t('dialogs:templates.tabModified', { name: t('dialogs:themeTabs.' + tab.id) }) : undefined} className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border border-transparent px-1 py-2 whitespace-nowrap text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${tab.failed ? 'text-danger aria-selected:border-danger aria-selected:bg-danger/10 aria-selected:text-danger' : 'text-muted aria-selected:border-accent-line aria-selected:bg-accent-soft aria-selected:text-accent-text'}`} onClick={() => chooseTab(tab.id)} onKeyDown={event => { const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); chooseTab(tabs[next].id); document.getElementById(`article-theme-tab-${tabs[next].id}`)?.focus(); } }}><ThemeIcon name={tab.icon} />{t('dialogs:themeTabs.' + tab.id)}{tab.modified ? <span className={`rounded px-1 text-2xs ${tab.failed ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent-text'}`}>{t('dialogs:ui.modified')}</span> : null}</button>)}</nav>
          <div id="article-theme-editor-panel" role="tabpanel" aria-labelledby={`article-theme-tab-${activeTab}`} className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            {editorTab === 'tokens' ? <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" onClick={event => { if (event.target === event.currentTarget) inspection.clear(); }}><ArticleThemeFields theme={draft} darkColors={darkColors} onDarkToken={setDarkToken} nodeColors={nodeColors} disabled={readOnly || saving} nodeKey={nodeKey} onNodeKey={setNodeKey} onToken={setToken} onNodeValue={setNodeValue} onResetNode={resetNode} onColor={openColor} inspection={inspection} /></div> : <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"><div className="flex min-h-0 flex-1 flex-col gap-2"><span className="shrink-0 font-sub-heading text-xs font-semibold text-primary">{editorTab === 'css' ? t('dialogs:ui.limitedCss') : t('dialogs:ui.fullThemeJson')}</span><SnippetTextarea ref={editorTab === 'css' ? cssEditorRef : undefined} sourceFont="editor" value={editorTab === 'css' ? cssText : jsonText} snippets={[]} readOnly={readOnly} disabled={saving} ariaLabel={editorTab === 'css' ? t('dialogs:ui.themeCss') : t('dialogs:ui.fullThemeJson')} onChange={value => changeCode(editorTab === 'css' ? 'css' : 'json', value)} /></div><p className="shrink-0 text-2xs text-faint">{editorTab === 'css' ? t('dialogs:ui.cssScope') : t('dialogs:ui.keepThemeId')}</p></div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line p-4"><ButtonBar label={t('dialogs:ui.themeSaveActions')} className="w-full justify-between"><button className="button button-quiet px-2" type="button" disabled={readOnly || saving || !dirty} onClick={resetChanges}><ThemeIcon name="reset" />{t('dialogs:ui.resetChanges')}</button>{editorTab !== 'tokens' ? <button className="button button-quiet px-2" type="button" disabled={readOnly || saving || !unappliedChanges} onClick={validateCode}><ThemeIcon name="check" />{t('dialogs:ui.validatePreview')}</button> : null}<span className="inline-flex min-w-0 after:top-auto after:bottom-full after:mb-2 after:mt-0" data-tooltip={unappliedChanges ? t('dialogs:ui.validateFirst') : undefined} tabIndex={unappliedChanges ? 0 : undefined} aria-describedby={unappliedChanges ? 'article-theme-validation-hint' : undefined}><button className="button button-primary px-2 disabled:pointer-events-none" type="button" onClick={() => void save()} disabled={readOnly || saving || Boolean(error) && !writeFailed || unappliedChanges || !dirty} aria-describedby={unappliedChanges ? 'article-theme-validation-hint' : undefined}><ThemeIcon name="save" />{saving ? t('dialogs:ui.saving') : t('dialogs:ui.saveTheme')}</button>{unappliedChanges ? <span id="article-theme-validation-hint" className="sr-only">{t('dialogs:ui.validateFirst')}</span> : null}</span></ButtonBar></div>
        </aside>
        <ColumnSplitter layout={layout} label={t('dialogs:ui.resizeTheme')} controls="article-theme-editor-panel" />
        <div className="flex min-h-60 min-w-0 flex-1 flex-col gap-3 p-5 group-data-[wide=true]/theme-columns:min-h-0"><div className="flex shrink-0 items-center justify-between gap-3"><p className="font-sub-heading text-sm font-medium text-primary">{t('dialogs:ui.liveTypography')}</p><PreviewModeSwitch dark={dark} onToggle={toggle} /></div><ThemePreview theme={previewTheme} dark={dark} inspection={inspection} onLocate={locateInspection} onNodeColors={setNodeColors} onDarkColors={receiveDarkColors} /></div>
      </div>
      {error || savedMessage ? <footer className="shrink-0 border-t border-line p-4">{error ? <p className="text-xs text-danger" role="alert">{formatProductMessage(error, t)}</p> : <p className="text-xs text-success" role="status">{formatProductMessage(savedMessage, t)}</p>}{reviewIssues.length ? <details className="mt-2 text-xs text-warning"><summary className="cursor-pointer">{formatProductMessage(productReference('themeLibrary.concernsRequiringReview', { measured_issuesCount: reviewIssues.length }), t)}</summary><ul className="mt-2 grid max-h-32 gap-2 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{reviewIssues.map((issue, index) => <li key={index}><p>{formatProductMessage(articleFormatMessageReference([issue]), t)}</p><p className="break-words text-muted">{issue.source}{issue.resourceSource ? ` · ${issue.resourceSource}` : ''} · {formatDiagnosticMessage(issue, t)}</p></li>)}</ul></details> : null}</footer> : null}
    </DialogFrame>
    {departure ? <UnsavedChangesDialog entries={[{ label: draft.name, detail: unappliedChanges ? t('dialogs:ui.unvalidatedCode') : t('dialogs:ui.themeChangesUnsaved') }]} description={t('dialogs:ui.themeUnsavedDescription')} saveLabel={applyAfter ? t('dialogs:ui.saveApply') : t('dialogs:ui.saveClose')} saveDisabled={Boolean(error) && !writeFailed || unappliedChanges || readOnly} onCancel={() => { setDeparture(false); setApplyAfter(false); }} onContinue={resumeTheme} onDiscard={onClose} onSave={async () => { if (!await save()) return false; if (applyAfter) { setApplyAfter(false); onApply(); } else onClose(); return true; }} /> : null}
    {picker ? <EditorColorPicker label={picker.label} token={picker.token} modeLabel={t(picker.scheme ? `dialogs:ui.${picker.scheme}` : 'dialogs:ui.articleTheme')} value={picker.value} onClose={() => setPicker(null)} onSelect={picker.select} /> : null}
  </>;
}
