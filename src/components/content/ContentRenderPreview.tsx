'use client';

import { useUITranslation } from "../global/UILocaleProvider";
import { productCause, productReference, type ProductMessageValue } from "../../lib/i18n/productMessages";
import { OperationFeedback } from '../global/OperationFeedback';

import { articlePreviewStyle, previewSurfaceStyle, resourcePreviewHostClass, resourcePreviewWidth } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { useId, useRef } from 'react';
import { useResourcePreviewStyles } from '../../hooks/useResourcePreviewStyles';
import { PreviewCssDetails } from './PreviewCssDetails';
import { createPortal } from 'react-dom';
import type { ThemeConfig } from '../../lib/types';
import { MarkdownPreview } from '../../lib/article-format/MarkdownPreview';
import type { ArticleMediaContext } from '../../lib/article-format/MarkdownPreview';
import { useArticleRenderMount } from '../../lib/article-format/useArticleRenderMount';
import { ArticleDocument } from '../../lib/article-format/ArticleDocument';

export function ContentRenderPreview({ source, theme, blocked = false, media = null, fill = false, bare = false, dark = false }: { source: string; theme: ThemeConfig; blocked?: boolean; media?: ArticleMediaContext | null; fill?: boolean; bare?: boolean; dark?: boolean }) {
  const { t } = useUITranslation('messages');
  const feedbackId = useId();
  const formatSnapshot = useFormatSnapshot();
  const hostRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const body = source.replace('▌', '');
  const { css, issue, pending, ready, result } = useResourcePreviewStyles(body, theme, formatSnapshot, blocked, 200);
  const { target, native, darkIssue, darkFrameRef, darkColors } = useArticleRenderMount(hostRef, formatSnapshot, css, dark);
    return <section id={bare ? undefined : 'content-render-preview'} className={`relative flex ${fill ? 'min-h-0' : 'min-h-64'} min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line group-data-[wide=true]/content-preview:min-h-0`} style={previewSurfaceStyle(dark)} aria-label={t("messages:uiFeedback.livePreview")}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-list px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-secondary">{t("messages:uiFeedback.livePreviewShort")}</span><span className="min-w-0 break-words text-xs text-faint" role="status">{blocked ? t("messages:uiFeedback.repairMetadata") : issue ? t("messages:uiFeedback.stylesFailed") : pending ? t("messages:uiFeedback.updating") : theme.name}</span></div>
      <div className="ml-auto flex shrink-0 gap-2"><OperationFeedback id={`content-preview-${feedbackId}`} label={t('common:feedback.previewProblems')} announce={false} notice={issue || darkIssue} summary={productReference(darkIssue ? 'feedback.darkFailed' : 'feedback.compileFailed')} tone={issue ? "error" : "warning"} /><PreviewCssDetails css={css} ready={ready && !darkIssue && (!dark || !css || darkColors?.status === 'ready')} revision={result} snapshot={formatSnapshot} dark={dark} hostRef={hostRef} target={target} darkFrameRef={darkFrameRef} /></div>
    </header>
    <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div ref={hostRef} hidden={blocked} data-preview-width={resourcePreviewWidth(formatSnapshot)} className={resourcePreviewHostClass(formatSnapshot)} style={previewSurfaceStyle()} aria-busy={pending} />
      {blocked ? <p className="p-4 text-sm text-muted">{t("messages:uiFeedback.metadataBlocksPreview")}</p> : target ? createPortal(<>{!native ? <style>{css ? articlePreviewStyle(css) : ''}</style> : null}<ArticleDocument snapshot={formatSnapshot} themeId={theme.id} attach={element => { articleRef.current = element; }} media={media}><MarkdownPreview source={body} theme={theme} media={media} snapshot={formatSnapshot} /></ArticleDocument></>, target) : null}
    </div>
  </section>;
}
