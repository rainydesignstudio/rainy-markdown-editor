'use client';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColumnSplitter } from '../global/ColumnSplitter';

import { useUITranslation } from '../global/UILocaleProvider';

import { previewSurfaceStyle } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useLibraryCapability } from '../../hooks/useLibraryCapability';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { parseArticle } from '../../lib/frontMatter';
import type { WorkingArticle } from '../../lib/types';
import type { ArticleMediaContext } from '../../lib/article-format/MarkdownPreview';
import { PreviewModeSwitch } from './PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { InformationButton, InformationIcon } from '../global/InformationButton';
import { ThemeUpdateTag } from '../themes/ThemeUpdateTag';
import { IconButton } from '../global/IconButton';
import { ButtonBar } from '../global/ButtonBar';
import { usePreviewPreferences } from '../../hooks/usePreviewPreferences';
import { connectPreviewScrollSync } from '../../lib/previewScrollSync';
import { ArticlePreviewCanvas } from './ArticlePreviewCanvas';
import { retainPreviewInput, refreshRetainedPreviewMedia, type PreviewInput } from '../../lib/previewSnapshot';

type Props = {
  article: WorkingArticle;
  themeUpdateAvailable: boolean;
  savedPreviewRevision: number;
  documentGeneration: number;
  directory: FileSystemDirectoryHandle | null;
  parsed: ReturnType<typeof parseArticle>;
  compiledCss: string;
  compiledRevision: number | null;
  mobilePane: 'source' | 'preview';
  previewRef: MutableRefObject<HTMLElement | null>;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  attachPreview: (element: HTMLElement | null) => void;
  clipboardReceiverRef: MutableRefObject<HTMLDivElement | null>;
  media: ArticleMediaContext | null;
  onPaste: () => Promise<void>;
  mediaBusy: boolean;
  readOnly: boolean;
  onOpenTheme: () => void;
  onOpenSourceFind?: () => void;
  referencePanel?: ReactNode;
  referenceOpen?: boolean;
};

export function PreviewPanel({
  article,
  themeUpdateAvailable,
  savedPreviewRevision, documentGeneration, directory,
  parsed,
  compiledCss,
  compiledRevision,
  mobilePane,
  previewRef,
  sourceTextareaRef,
  attachPreview,
  clipboardReceiverRef,
  media,
  onPaste,
  mediaBusy,
  readOnly,
  onOpenTheme,
  onOpenSourceFind,
  referencePanel,
  referenceOpen = false,
}: Props) {
  const { t } = useUITranslation('editor');
  const referenceLayout = useResizableColumns(45, undefined, referenceOpen, 'y');
  const { preferences, toggle: togglePreference } = usePreviewPreferences();
  const liveViewportRef = useRef<HTMLDivElement | null>(null);
  const frozenViewportRef = useRef<HTMLDivElement | null>(null);
  const frozenRootRef = useRef<HTMLElement | null>(null);
  const sourceTextRef = useRef(parsed.body); sourceTextRef.current = parsed.body;
  const liveFormatSnapshot = useFormatSnapshot();
  const themeCapability = useLibraryCapability('articleTheme');
  const formatSnapshot = article.renderSnapshot?.id === liveFormatSnapshot.id ? article.renderSnapshot : liveFormatSnapshot;
  const input = useMemo<PreviewInput>(() => ({ article, parsed, compiledCss, media, snapshot: formatSnapshot }), [article, parsed, compiledCss, media, formatSnapshot]);
  const [frozen, setFrozen] = useState<ReturnType<typeof retainPreviewInput> | null>(null);
  const previewReadyRef = useRef<{ document: number; directory: FileSystemDirectoryHandle | null; month: WorkingArticle['month']; folder: WorkingArticle['folder']; format: string } | null>(null);
  const boundaryRef = useRef<{ saved: number; document: number; directory: FileSystemDirectoryHandle | null; month: WorkingArticle['month']; folder: WorkingArticle['folder'] } | null>(null);
  useLayoutEffect(() => {
    const ready = previewReadyRef.current;
    const ownStylesReady = compiledRevision !== null || ready?.document === documentGeneration && ready.directory === directory && ready.month === article.month && ready.folder === article.folder && ready.format === input.snapshot.id;
    if (compiledRevision !== null) previewReadyRef.current = { document: documentGeneration, directory, month: article.month, folder: article.folder, format: input.snapshot.id };
    if (!preferences.saveOnly) { boundaryRef.current = null; setFrozen(null); return; }
    const boundary = boundaryRef.current;
    // Generations count opens per article, so different manuscripts can share a number.
    if (boundary?.saved === savedPreviewRevision && boundary.document === documentGeneration && boundary.directory === directory && boundary.month === article.month && boundary.folder === article.folder) return;
    // Typing marks CSS stale; the same document can still retain its visible
    // body with its last own stylesheet. A newly opened document must wait.
    if (!ownStylesReady) { setFrozen(null); return; }
    boundaryRef.current = { saved: savedPreviewRevision, document: documentGeneration, directory, month: article.month, folder: article.folder };
    setFrozen(retainPreviewInput(input));
    // Input is captured only at the display boundary, never on typing/check/copy/export.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.saveOnly, savedPreviewRevision, documentGeneration, directory, article.month, article.folder, compiledRevision, formatSnapshot.id]);
  useLayoutEffect(() => { setFrozen(previous => refreshRetainedPreviewMedia(previous, media)); }, [media]);
  useEffect(() => () => frozen?.dispose(), [frozen?.dispose]);
  const frozenVisible = preferences.saveOnly && frozen !== null;
  const workingInputRef = useRef({ input, document: documentGeneration, directory });
  const working = workingInputRef.current;
  if (!frozenVisible || compiledRevision !== null || working.document !== documentGeneration || working.directory !== directory ||
    working.input.article.month !== article.month || working.input.article.folder !== article.folder ||
    working.input.snapshot !== formatSnapshot || working.input.media?.sessionKey !== media?.sessionKey) {
    workingInputRef.current = { input, document: documentGeneration, directory };
  }
  // Output operations compile/flush their current revision before consuming this canvas.
  // Ordinary typing does not keep rendering an invisible copy of the frozen manuscript.
  const workingInput = workingInputRef.current.input;
  const { dark, toggle } = useArticlePreviewMode();
  useEffect(() => {
    if (!preferences.scrollSync) return;
    const textarea = sourceTextareaRef.current;
    const container = frozenVisible ? frozenViewportRef.current : liveViewportRef.current;
    const root = frozenVisible ? frozenRootRef : previewRef;
    if (!textarea || !container) return;
    return connectPreviewScrollSync({ textarea, container, getRoot: () => root.current, getSource: () => sourceTextRef.current,
      getRenderedSource: () => frozenVisible ? frozen!.input.parsed.body : sourceTextRef.current });
  }, [preferences.scrollSync, frozenVisible, frozen, sourceTextareaRef, previewRef, formatSnapshot.id, dark, documentGeneration, directory]);
  // The clipboard dock opens to half the preview panel, measured once against the panel so the
  // target does not chase the preview as the dock itself takes space away from it.
  const [dockOpen, setDockOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dockBodyRef = useRef<HTMLDivElement | null>(null);
  const dockTarget = () => `${Math.round((panelRef.current?.clientHeight ?? 0) / 2)}px`;
  useLayoutEffect(() => {
    const node = dockBodyRef.current;
    if (!node) return;
    if (!node.style.maxHeight) {
      node.style.maxHeight = dockOpen ? dockTarget() : '0px';
      return;
    }
    node.style.maxHeight = `${node.getBoundingClientRect().height}px`;
    node.getBoundingClientRect();
    node.style.maxHeight = dockOpen ? dockTarget() : '0px';
  }, [dockOpen]);
  useEffect(() => {
    if (!dockOpen) return;
    const apply = () => { const node = dockBodyRef.current; if (node) node.style.maxHeight = dockTarget(); };
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [dockOpen]);
  useLayoutEffect(() => {
    const node = clipboardReceiverRef.current;
    if (!node) return;
    const syncPlaceholder = () => {
      const hasContent = Boolean(node.textContent || node.querySelector('img, svg, video, audio, canvas, table, hr'));
      node.dataset.empty = String(!hasContent);
    };
    syncPlaceholder();
    // Both native editing and the programmatic paste button change this uncontrolled DOM.
    const observer = new MutationObserver(syncPlaceholder);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [clipboardReceiverRef]);
    return (
    <section ref={panelRef} tabIndex={-1} aria-label={t('editor:workspace.preview')} onPointerDownCapture={event => {
      // Static preview text has no native focus target. Keep subsequent shortcuts
      // scoped to this pane without stealing focus from its interactive controls.
      const interactive = event.nativeEvent.composedPath().some(node => node !== event.currentTarget && node instanceof Element && node.matches('a,button,input,textarea,select,[tabindex],[contenteditable="true"]'));
      if (!interactive) event.currentTarget.focus({ preventScroll: true });
    }} className="panel preview-panel" data-mobile-hidden={mobilePane === 'source'} onKeyDownCapture={event => {
      if (!onOpenSourceFind || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f'
        || !event.nativeEvent.composedPath().includes(event.currentTarget)) return;
      event.preventDefault(); event.stopPropagation(); onOpenSourceFind();
    }}>
      <div className="panel-header h-18 min-h-18 bg-list px-3 md:px-7.5">
        <div className="flex min-w-0 items-center gap-2 md:gap-6">
          <span className="inline-flex min-w-0" title={themeCapability.reason} tabIndex={!themeCapability.enabled ? 0 : undefined} aria-label={themeCapability.reason}><InformationButton icon={<InformationIcon book />} title={liveFormatSnapshot.configuration?.rendering.styleAuthority === 'library' ? liveFormatSnapshot.bundle.support.meta.name : article.theme.name} subtitle={liveFormatSnapshot.configuration?.rendering.styleAuthority === 'library' ? t('messages:libraryConfiguration.styleSource') : <span className="flex items-center gap-1.5">v{article.theme.version}{themeUpdateAvailable ? <ThemeUpdateTag /> : null}</span>} onClick={() => { if (themeCapability.enabled) onOpenTheme(); }} disabled={mediaBusy || !themeCapability.enabled} aria-label={t('editor:preview.themeLabel', { name: article.theme.name, version: article.theme.version, update: themeUpdateAvailable ? t('editor:preview.updateSuffix') : '' })} /></span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <PreviewModeSwitch dark={dark} onToggle={toggle} />
          <ButtonBar label={t('editor:preview.options')}><IconButton tooltip={t('editor:preview.scrollSync')} aria-pressed={preferences.scrollSync} onClick={() => togglePreference('scrollSync')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h7M3 9h7M3 14h7M3 19h7M16 5v14m-3-11 3-3 3 3m-6 8 3 3 3-3" /></svg>} />
            <IconButton tooltip={t('editor:preview.saveReport')} aria-pressed={preferences.saveReport} onClick={() => togglePreference('saveReport')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5v17h14V4h-4M9 3h6v4H9zM8 14l3 3 5-6" /></svg>} />
            <IconButton tooltip={t('editor:preview.saveOnly')} aria-pressed={preferences.saveOnly} onClick={() => togglePreference('saveOnly')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v12H4zM8 21h8m-4-4v4M8 11h8m-3-3 3 3-3 3" /></svg>} />
          </ButtonBar>
        </div>
      </div>
      <div ref={referenceLayout.containerRef} className="flex min-h-0 flex-1 flex-col" style={referenceLayout.style}>
      <div data-open={referenceOpen} data-resizable={referenceLayout.wideEnough} className="flex min-h-0 shrink-0 flex-col data-[open=true]:flex-1 data-[open=true]:data-[resizable=true]:h-(--editor-reference-height) data-[open=true]:data-[resizable=true]:flex-none">{referencePanel}</div>
      {referenceOpen ? <ColumnSplitter layout={referenceLayout} label={t('workspace.resizeReference')} controls="editor-knowledge-content" /> : null}
      <div className="relative min-h-0 flex-1">
        <div className="h-full data-[hidden=true]:pointer-events-none data-[hidden=true]:absolute data-[hidden=true]:inset-0 data-[hidden=true]:opacity-0" data-hidden={frozenVisible} aria-hidden={frozenVisible || undefined} inert={frozenVisible}>
          <ArticlePreviewCanvas input={workingInput} dark={frozenVisible ? false : dark} onOpenSourceFind={onOpenSourceFind} canonical rootRef={previewRef} viewportRef={liveViewportRef} onAttach={attachPreview} />
        </div>
        {frozenVisible ? <ArticlePreviewCanvas input={frozen.input} dark={dark} onOpenSourceFind={onOpenSourceFind} canonical={false} rootRef={frozenRootRef} viewportRef={frozenViewportRef} /> : null}
      </div>
      </div>
      <div className="panel-body">
        <section className="clipboard-dock">
          <button className="clipboard-dock-toggle group/dock" type="button" aria-expanded={dockOpen} aria-controls="clipboard-receiver" onClick={() => setDockOpen((current) => !current)}>
            <span>{t('editor:clipboard.title')}</span>
            <svg className="size-4 shrink-0 text-faint transition-transform duration-500 ease-out motion-reduce:transition-none group-aria-expanded/dock:rotate-90" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
          </button>
          <div id="clipboard-receiver" ref={dockBodyRef} className="clipboard-dock-body" inert={!dockOpen}>
            <div className="clipboard-dock-content">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 min-w-0 text-xs text-muted">{t('editor:clipboard.description')}</p>
                <button className="button button-quiet shrink-0" type="button" onClick={() => void onPaste()} disabled={mediaBusy || readOnly || !parsed.canCopy || !article.themeValid}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6v3H9zM7 5H5v15h14V5h-2" /><path d="M9 12h6M9 16h4" /></svg>{t('editor:clipboard.paste')}</button>
              </div>
              <div ref={clipboardReceiverRef} className="clipboard-receiver before:pointer-events-none data-[empty=true]:before:content-[attr(aria-placeholder)]" contentEditable={!readOnly} suppressContentEditableWarning style={{ ...previewSurfaceStyle(false, liveFormatSnapshot), color: liveFormatSnapshot.bundle.formatter.preview.color }} role="textbox" aria-multiline="true" aria-label={t('editor:clipboard.aria')} aria-placeholder={t('editor:clipboard.placeholder')} />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
