'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArticlePreviewCanvas } from '../editor/ArticlePreviewCanvas';
import { useResourcePreviewStyles } from '../../hooks/useResourcePreviewStyles';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useUITranslation } from '../global/UILocaleProvider';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { awaitPackagePreview } from '../../lib/article-format/packageRendering';
import { prepareRenderRecord, type PreparedRenderRecord } from '../../lib/article-format/renderRecords';
import type { StoredArticle } from '../../lib/types';

export type GuideRenderRequest = {
  root: FileSystemDirectoryHandle; article: StoredArticle; formatId: string;
  isCurrent: () => boolean; resolve: (result: PreparedRenderRecord) => void; reject: (error: Error) => void;
};

/** Prepare the saved example through the same canvas used by the editor. */
export function GuideSampleRenderer({ request }: { request: GuideRenderRequest }) {
  const { t } = useUITranslation('onboarding');
  const snapshot = useFormatSnapshot();
  const { article, root } = request;
  const compiled = useResourcePreviewStyles(article.source, article.theme, snapshot, false);
  const rootRef = useRef<HTMLElement | null>(null), viewportRef = useRef<HTMLDivElement | null>(null);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const media = useMemo(() => ({ root, article, articleTitle: article.parse.metadata.title, sessionKey: request.formatId + article.id, isCurrent: request.isCurrent }), [request, root, article]);
  const input = useMemo(() => ({ article: { ...article, dirty: false }, parsed: article.parse, compiledCss: compiled.css, media, snapshot }), [article, compiled.css, media, snapshot]);
  useEffect(() => {
    const timeout = window.setTimeout(() => request.reject(new Error(t('sampleRenderFailed'))), 20000);
    return () => { window.clearTimeout(timeout); request.reject(new Error(t('contextChanged'))); };
  }, [request, t]);
  useEffect(() => {
    if (!request.isCurrent() || snapshot.id !== request.formatId) { request.reject(new Error(t('contextChanged'))); return; }
    if (compiled.issue || snapshot.error) { request.reject(new Error(formatProductMessage(compiled.issue || snapshot.error, t))); return; }
    if (!compiled.ready || !element) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        await awaitPackagePreview(element, article.parse.body, article.theme, snapshot);
        await Promise.all(Array.from(element.querySelectorAll('img')).map(image => image.decode()));
        if (cancelled || !request.isCurrent()) return;
        const prepared = await prepareRenderRecord(article.source, article.theme, element, compiled.css, { snapshot, root, articlePath: `articles/${article.month}/${article.folder}` });
        if (!cancelled && request.isCurrent()) request.resolve(prepared);
      })().catch(error => { if (!cancelled) request.reject(error instanceof Error ? error : new Error(String(error))); });
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [article, compiled.css, compiled.issue, compiled.ready, element, request, root, snapshot, t]);
  return <div aria-hidden="true" inert className="pointer-events-none fixed inset-0 -z-20 opacity-0"><ArticlePreviewCanvas input={input} dark={false} canonical rootRef={rootRef} viewportRef={viewportRef} onAttach={setElement} /></div>;
}
