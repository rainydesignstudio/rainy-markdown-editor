'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { useArticleRenderMount } from '../../lib/article-format/useArticleRenderMount';
import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import type { PreviewInput } from '../../lib/previewSnapshot';
import { ArticleDocument } from '../../lib/article-format/ArticleDocument';
import { MarkdownPreview } from '../../lib/article-format/MarkdownPreview';
import { MediaPreviewDialog } from '../media/MediaPreviewDialog';
import type { RenderedPreviewImage } from '../../lib/article-format/previewImages';
import {packageInputKey} from '../../lib/article-format/packageRendering';
import {observeRenderedCode,readRenderedCode,type RenderedCode} from '../../lib/renderedCode';

/** Shared renderer. Only the current working canvas is attached to validation and output. */
export const ArticlePreviewCanvas = memo(function ArticlePreviewCanvas({
  input, dark, canonical, rootRef, viewportRef, onAttach, onOpenSourceFind, codeActive=false, codeReady=true, onCode,
}: {
  input: PreviewInput; dark: boolean; canonical: boolean;
  rootRef: MutableRefObject<HTMLElement | null>;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  onOpenSourceFind?: () => void;
  onAttach?: (element: HTMLElement | null) => void;
  codeActive?:boolean;codeReady?:boolean;onCode?:(value:RenderedCode)=>void;
}) {
  const { t } = useUITranslation('editor');
  const { article, parsed, compiledCss, media, snapshot } = input;
  const lightHostRef = useRef<HTMLDivElement | null>(null);
  const [openedImage, setOpenedImage] = useState<RenderedPreviewImage | null>(null);
  useEffect(() => setOpenedImage(null), [parsed.body, snapshot.id, media?.sessionKey]);
  const codeKey=useMemo(()=>packageInputKey(parsed.body,article.theme,snapshot),[parsed.body,article.theme,snapshot]);
  const { target, native, darkIssue, darkFrameRef } = useArticleRenderMount(lightHostRef, snapshot, compiledCss, dark, { retained: !canonical, editorWheel: true, codeKey, onImageOpen: setOpenedImage, onSourceFind: onOpenSourceFind });
  useEffect(()=>{
    const host=lightHostRef.current;if(!codeActive||!host||!target||!onCode)return;
    return observeRenderedCode(host,target,()=>readRenderedCode(target,darkFrameRef.current,input,dark,codeReady&&parsed.canCopy&&article.themeValid,darkIssue||(!parsed.canCopy||!article.themeValid?t('preview.repair'):'')),onCode);
  },[codeActive,codeReady,onCode,target,codeKey,input,dark,darkIssue,darkFrameRef,parsed.canCopy,article.themeValid,t]);
  const attach = useCallback((element: HTMLElement | null) => { rootRef.current = element; onAttach?.(element); }, [rootRef, onAttach]);
  return <><div ref={viewportRef} className="preview-shell h-full data-[frame=true]:flex data-[frame=true]:flex-col data-[frame=true]:overflow-hidden" data-frame={native || dark} data-preview-mode={dark ? 'dark' : 'light'} data-preview-canonical={canonical}>
    {darkIssue ? <p className="content-library-note" data-tone="error" role="alert">{t('preview.darkIssue', { message: darkIssue })}</p> : null}
    <div ref={lightHostRef} className="min-h-full min-w-0" style={previewSurfaceStyle(false, snapshot)} />
    {target ? createPortal(<>{!native ? <style data-article-style="true">{articlePreviewStyle(compiledCss, snapshot)}</style> : null}
      <ArticleDocument snapshot={snapshot} themeId={article.theme.id} attach={attach} media={media} codeKey={codeKey}>
        {parsed.canCopy && article.themeValid ? <MarkdownPreview source={parsed.body} theme={article.theme} media={media} snapshot={snapshot} /> : <div className="empty-state"><strong>{t('preview.blocked')}</strong><p>{t('preview.repair')}</p></div>}
      </ArticleDocument></>, target) : null}
  </div>{openedImage && (!media || media.isCurrent()) ? createPortal(<MediaPreviewDialog rendered={openedImage} sessionKey={snapshot.id} isCurrent={() => !media || media.isCurrent()} onClose={() => { setOpenedImage(null); requestAnimationFrame(openedImage.focus); }} />, document.body) : null}</>;
});
