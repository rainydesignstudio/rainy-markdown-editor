'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import { previewSurfaceStyle } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { parseArticle } from '../../lib/frontMatter';
import type { WorkingArticle } from '../../lib/types';
import type { ArticleMediaContext } from './MarkdownPreview';
import { PreviewModeSwitch } from './PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { InformationButton, InformationIcon } from '../global/InformationButton';
import { ThemeUpdateTag } from '../themes/ThemeUpdateTag';
import { IconButton } from '../global/IconButton';
import { ButtonBar } from '../global/ButtonBar';
import { usePreviewPreferences } from '../../hooks/usePreviewPreferences';
import { connectPreviewScrollSync } from '../../lib/previewScrollSync';
import { ArticlePreviewCanvas } from './ArticlePreviewCanvas';
import { retainPreviewInput, previewInputMatches, type PreviewInput } from '../../lib/previewSnapshot';

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
}: Props) {
  const { t } = useUITranslation('editor');
  const { preferences, toggle: togglePreference } = usePreviewPreferences();
  const liveViewportRef = useRef<HTMLDivElement | null>(null);
  const frozenViewportRef = useRef<HTMLDivElement | null>(null);
  const frozenRootRef = useRef<HTMLElement | null>(null);
  const sourceTextRef = useRef(parsed.body); sourceTextRef.current = parsed.body;
  const liveFormatSnapshot = useFormatSnapshot();
  const formatSnapshot = article.renderSnapshot?.id === liveFormatSnapshot.id ? article.renderSnapshot : liveFormatSnapshot;
  const input: PreviewInput = { article, parsed, compiledCss, media, snapshot: formatSnapshot };
  const [frozen, setFrozen] = useState<ReturnType<typeof retainPreviewInput> | null>(null);
  const boundaryRef = useRef<{ saved: number; document: number; directory: FileSystemDirectoryHandle | null } | null>(null);
  useLayoutEffect(() => {
    if (!preferences.saveOnly) { boundaryRef.current = null; setFrozen(null); return; }
    const boundary = boundaryRef.current;
    if (boundary?.saved === savedPreviewRevision && boundary.document === documentGeneration && boundary.directory === directory) return;
    // A newly opened document must first receive its own compiled stylesheet.
    if (compiledRevision === null) { setFrozen(null); return; }
    boundaryRef.current = { saved: savedPreviewRevision, document: documentGeneration, directory };
    setFrozen(retainPreviewInput(input));
    // Input is captured only at the display boundary, never on typing/check/copy/export.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.saveOnly, savedPreviewRevision, documentGeneration, directory, compiledRevision]);
  useEffect(() => () => frozen?.dispose(), [frozen]);
  const frozenVisible = preferences.saveOnly && frozen !== null;
  const stale = frozenVisible && !previewInputMatches(frozen.original, input);
  const { dark, toggle } = useArticlePreviewMode();
  useEffect(() => {
    if (!preferences.scrollSync || stale) return;
    const textarea = sourceTextareaRef.current;
    const container = frozenVisible ? frozenViewportRef.current : liveViewportRef.current;
    const root = frozenVisible ? frozenRootRef : previewRef;
    if (!textarea || !container) return;
    return connectPreviewScrollSync({ textarea, container, getRoot: () => root.current, getSource: () => sourceTextRef.current });
  }, [preferences.scrollSync, stale, frozenVisible, frozen, sourceTextareaRef, previewRef, formatSnapshot.id, dark, documentGeneration, directory]);
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
    <section ref={panelRef} className="panel preview-panel" data-mobile-hidden={mobilePane === 'source'}>
      <div className="panel-header h-18 min-h-18 bg-list px-3 md:px-7.5">
        <div className="flex min-w-0 items-center gap-2 md:gap-6">
          <InformationButton icon={<InformationIcon book />} title={article.theme.name} subtitle={<span className="flex items-center gap-1.5">v{article.theme.version}{themeUpdateAvailable ? <ThemeUpdateTag /> : null}</span>} onClick={onOpenTheme} disabled={mediaBusy} aria-label={t('editor:preview.themeLabel', { name: article.theme.name, version: article.theme.version, update: themeUpdateAvailable ? t('editor:preview.updateSuffix') : '' })} />
          <PreviewModeSwitch dark={dark} onToggle={toggle} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ButtonBar label={t('editor:preview.options')}><IconButton tooltip={t('editor:preview.scrollSync')} aria-pressed={preferences.scrollSync} onClick={() => togglePreference('scrollSync')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h7M3 9h7M3 14h7M3 19h7M16 5v14m-3-11 3-3 3 3m-6 8 3 3 3-3" /></svg>} />
            <IconButton tooltip={t('editor:preview.saveReport')} aria-pressed={preferences.saveReport} onClick={() => togglePreference('saveReport')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5v17h14V4h-4M9 3h6v4H9zM8 14l3 3 5-6" /></svg>} />
            <IconButton tooltip={t('editor:preview.saveOnly')} aria-pressed={preferences.saveOnly} onClick={() => togglePreference('saveOnly')} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v12H4zM8 21h8m-4-4v4M8 11h8m-3-3 3 3-3 3" /></svg>} />
          </ButtonBar>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-faint" role="status"><svg className="size-3.5 text-accent-text" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{article.dirty ? <circle cx="12" cy="12" r="7" /> : <path d="m4 12 5 5L20 6" />}</svg>{article.dirty ? t('editor:source.unsaved') : t('editor:source.saved')}</span>
        </div>
      </div>
      {stale ? <p className="m-0 border-b border-line bg-list px-4 py-2 text-xs text-muted" role="status">{t(preferences.scrollSync ? 'preview.frozenSyncPaused' : 'preview.frozen')}</p> : null}
      <div className="relative min-h-0 flex-1">
        <div className="h-full data-[hidden=true]:pointer-events-none data-[hidden=true]:absolute data-[hidden=true]:inset-0 data-[hidden=true]:opacity-0" data-hidden={frozenVisible} aria-hidden={frozenVisible || undefined} inert={frozenVisible}>
          <ArticlePreviewCanvas input={input} dark={frozenVisible ? false : dark} canonical rootRef={previewRef} viewportRef={liveViewportRef} onAttach={attachPreview} />
        </div>
        {frozenVisible ? <ArticlePreviewCanvas input={frozen.input} dark={dark} canonical={false} rootRef={frozenRootRef} viewportRef={frozenViewportRef} /> : null}
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
              <div ref={clipboardReceiverRef} className="clipboard-receiver before:pointer-events-none before:text-muted data-[empty=true]:before:content-[attr(aria-placeholder)]" data-preview-mode={dark ? 'dark' : 'light'} contentEditable={!readOnly} suppressContentEditableWarning style={previewSurfaceStyle(dark)} role="textbox" aria-multiline="true" aria-label={t('editor:clipboard.aria')} aria-placeholder={t('editor:clipboard.placeholder')} />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
