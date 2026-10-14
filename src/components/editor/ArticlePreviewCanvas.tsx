'use client';

import { memo, useCallback, useRef, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { useArticleRenderMount } from '../../hooks/useArticleRenderMount';
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
  const attach = useCallback((element: HTMLElement | null) => { rootRef.current = element; onAttach?.(element); }, [rootRef, onAttach]);
  return <div ref={viewportRef} className="preview-shell h-full data-[frame=true]:flex data-[frame=true]:flex-col data-[frame=true]:overflow-hidden" data-frame={native || dark} data-preview-mode={dark ? 'dark' : 'light'} data-preview-canonical={canonical}>
    {darkIssue ? <p className="content-library-note" data-tone="error" role="alert">{t('preview.darkIssue', { message: darkIssue })}</p> : null}
    <div ref={lightHostRef} className="min-h-full min-w-0" style={previewSurfaceStyle(false, snapshot)} />
    {target ? createPortal(<>{!native ? <style data-article-style="true">{articlePreviewStyle(compiledCss, snapshot)}</style> : null}
      <ArticleDocument snapshot={snapshot} themeId={article.theme.id} attach={attach} media={media}>
        {parsed.canCopy && article.themeValid ? <MarkdownPreview source={parsed.body} media={media} snapshot={snapshot} /> : <div className="empty-state"><strong>{t('preview.blocked')}</strong><p>{t('preview.repair')}</p></div>}
      </ArticleDocument></>, target) : null}
  </div>;
});
