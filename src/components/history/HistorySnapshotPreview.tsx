'use client';

import { useUITranslation } from '../global/UILocaleProvider';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { compileArticleStyles } from '../../lib/article-format/renderer';
import type { ArticleHistorySnapshot } from '../../lib/articleHistory';
import type { StoredArticle } from '../../lib/types';
import { MarkdownPreview, type ArticleMediaContext } from '../../lib/article-format/MarkdownPreview';
import { ArticleDocument } from '../../lib/article-format/ArticleDocument';
import { useArticleRenderMount } from '../../lib/article-format/useArticleRenderMount';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { restoreRenderEnvironment } from '../../lib/article-format/renderRecords';
import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { sanitizePackageHtml, bindPackageInput } from '../../lib/article-format/packageRendering';
import { sanitizeHtml } from '../../lib/article-format/sanitize';
import type { FormatSnapshot } from '../../lib/article-format/runtime';

type Props = { dark?: boolean; reference?: FormatSnapshot; snapshot: ArticleHistorySnapshot; root: FileSystemDirectoryHandle | null; article: Pick<StoredArticle, 'id' | 'month' | 'folder'>; articleTitle: string };
export function HistorySnapshotPreview({ snapshot, root, article, articleTitle, dark = false, reference }: Props) {
  const { t } = useUITranslation('dialogs');
  const live = useFormatSnapshot();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rendition, setRendition] = useState<{ id: string; css: string; html?: string; format: FormatSnapshot } | null>(null);
  const [issue, setIssue] = useState('');
  const identity = useRef({ id: snapshot.id, root, articleId: article.id });
  identity.current = { id: snapshot.id, root, articleId: article.id };
  const format = rendition?.id === snapshot.id ? rendition.format : reference ?? live;
  const { target, native, darkIssue } = useArticleRenderMount(hostRef, format, rendition?.css ?? '', dark);
  useEffect(() => {
    let active = true, dispose: (() => void) | undefined;
    setRendition(null); setIssue('');
    void (async () => {
      if (snapshot.renderIssue) throw new Error(snapshot.renderIssue);
      if (snapshot.renderRecord && root) {
        const restored = await restoreRenderEnvironment(root, snapshot.renderRecord, live);
        dispose = restored.dispose;
        if (active) setRendition({ id: snapshot.id, css: restored.css, html: restored.html, format: restored.snapshot });
        else dispose();
      } else {
        if (live.renderer && !reference) throw new Error(t('dialogs:history.packageDependenciesMissing'));
        const format = reference ?? live;
        const result = await compileArticleStyles(snapshot.source, snapshot.theme, { snapshot: format });
        if (active) setRendition({ id: snapshot.id, css: result.css, format });
      }
    })().catch(error => { if (active) setIssue(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; dispose?.(); };
  }, [snapshot.id, snapshot.source, snapshot.theme, snapshot.renderRecord, snapshot.renderIssue, root, live.id, reference, t]);
  const media: ArticleMediaContext = { root, article, articleTitle, sessionKey: 'history-' + snapshot.id,
    isCurrent: () => identity.current.id === snapshot.id && identity.current.root === root && identity.current.articleId === article.id };
  return <div className="history-render-scroll" data-preview-mode={dark ? 'dark' : 'light'} aria-label={t('dialogs:history.previewLabel')}>
    {!reference && (!snapshot.renderRecord || format.algorithmSource === 'legacy' && format.bundle.formatter.preview.dark.transform !== 'preserve') && !issue ? <p className="content-library-note" data-tone="warning">{t(!snapshot.renderRecord ? 'dialogs:history.legacyEnvironment' : 'messages:algorithms.legacyHistory')}</p> : null}
    {darkIssue ? <p className="content-library-note" data-tone="error" role="alert">{t('editor:preview.darkIssue', { message: darkIssue })}</p> : null}
    {issue ? <p className="content-library-note" data-tone="error" role="alert">{t('dialogs:history.restoreIssue', { issue })}</p> : null}
    {!rendition && !issue ? <p className="status-copy" role="status">{t('dialogs:history.loading')}</p> : null}
    <div ref={hostRef} className="history-render-host" style={previewSurfaceStyle(false, format)} aria-busy={!rendition && !issue} />
    {target && rendition?.id === snapshot.id ? createPortal(<>
      {!native ? <style data-article-style>{articlePreviewStyle(rendition.css, format)}</style> : null}
      {rendition.html !== undefined ? <div ref={element => { if (element && format.renderer) bindPackageInput(element, { source: snapshot.parsed.body, theme: snapshot.theme, snapshot: format, css: rendition.css, assets: format.resources ?? format.environment?.assets ?? [] }); }} dangerouslySetInnerHTML={{ __html: format.renderer ? sanitizePackageHtml(rendition.html, format) : sanitizeHtml(rendition.html, format) }} /> :
        <ArticleDocument snapshot={format} themeId={snapshot.theme.id} media={media}><MarkdownPreview source={snapshot.parsed.body} theme={snapshot.theme} media={media} snapshot={format} /></ArticleDocument>}
    </>, target) : null}
  </div>;
}
