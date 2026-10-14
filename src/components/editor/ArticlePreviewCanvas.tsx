'use client';

import { memo, useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { useArticleRenderMount } from '../../hooks/useArticleRenderMount';
import { articleDarkPreviewDocument, cloneArticleForDarkPreview, observeArticlePreview } from '../../lib/articleDarkPreview';
import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import type { PreviewInput } from '../../lib/previewSnapshot';
import { ArticleDocument } from './ArticleDocument';
import { MarkdownPreview } from './MarkdownPreview';

/** Shared renderer. Only the current working canvas is attached to validation and output. */
export const ArticlePreviewCanvas = memo(function ArticlePreviewCanvas({
  input, dark, canonical, rootRef, viewportRef, onAttach,
}: {
  input: PreviewInput; dark: boolean; canonical: boolean;
  rootRef: MutableRefObject<HTMLElement | null>;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  onAttach?: (element: HTMLElement | null) => void;
}) {
  const { t } = useUITranslation('editor');
  const { article, parsed, compiledCss, media, snapshot } = input;
  const lightHostRef = useRef<HTMLDivElement | null>(null);
  const { target, native, darkIssue } = useArticleRenderMount(lightHostRef, snapshot, compiledCss, dark, { retained: !canonical });
  const [darkDocument, setDarkDocument] = useState('');
  const [darkError, setDarkError] = useState(false);
  const lastSnapshotRef = useRef('');
  const attach = useCallback((element: HTMLElement | null) => { rootRef.current = element; onAttach?.(element); }, [rootRef, onAttach]);
  useEffect(() => {
    if (native || !dark || !rootRef.current) return;
    return observeArticlePreview(rootRef.current, () => {
      try {
        const clone = cloneArticleForDarkPreview(rootRef.current!, snapshot);
        const key = compiledCss + '\n' + clone.outerHTML;
        if (key === lastSnapshotRef.current) return;
        lastSnapshotRef.current = key;
        setDarkError(false);
        setDarkDocument(articleDarkPreviewDocument(compiledCss, clone.outerHTML, snapshot));
      } catch {
        lastSnapshotRef.current = '';
        setDarkDocument(''); setDarkError(true);
      }
    });
  }, [native, dark, compiledCss, rootRef, snapshot, target]);
  return <div ref={viewportRef} className="preview-shell flex h-full flex-col data-[frame=true]:overflow-hidden" data-frame={native || dark} data-preview-mode={dark ? 'dark' : 'light'} data-preview-canonical={canonical}>
    {darkIssue ? <p className="content-library-note" data-tone="error" role="alert">{t('preview.darkIssue', { message: darkIssue })}</p> : null}
    <div ref={lightHostRef} className="min-h-full min-w-0" style={previewSurfaceStyle(false, snapshot)} hidden={dark && !native} />
    {target ? createPortal(<>{!native ? <style data-article-style="true">{articlePreviewStyle(compiledCss, snapshot)}</style> : null}
      <ArticleDocument snapshot={snapshot} themeId={article.theme.id} attach={attach} media={media}>
        {parsed.canCopy && article.themeValid ? <MarkdownPreview source={parsed.body} media={media} snapshot={snapshot} /> : <div className="empty-state"><strong>{t('preview.blocked')}</strong><p>{t('preview.repair')}</p></div>}
      </ArticleDocument></>, target) : null}
    {dark && !native && darkError ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">{t('preview.darkFailed')}</p> : null}
    {dark && !native ? <iframe data-article-standalone-dark="true" className="block min-h-0 w-full flex-1 border-0" title={t('preview.darkFrame')} sandbox="allow-scripts allow-same-origin" srcDoc={darkDocument} /> : null}
  </div>;
});
