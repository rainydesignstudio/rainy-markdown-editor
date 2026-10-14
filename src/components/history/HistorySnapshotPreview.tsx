'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { compileArticleStyles } from '../../lib/tailwind';
import type { ArticleHistorySnapshot } from '../../lib/articleHistory';
import type { StoredArticle } from '../../lib/types';
import { MarkdownPreview, type ArticleMediaContext } from '../editor/MarkdownPreview';
import { ArticleDocument } from '../editor/ArticleDocument';
import { useArticleRenderMount } from '../../hooks/useArticleRenderMount';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { restoreRenderEnvironment } from '../../lib/article-format/renderRecords';
import { articlePreviewStyle } from '../../lib/article-format/preview';
import { sanitizeHtml } from '../../lib/article-format/sanitize';
import type { FormatSnapshot } from '../../lib/article-format/runtime';

type Props = { snapshot: ArticleHistorySnapshot; root: FileSystemDirectoryHandle | null; article: Pick<StoredArticle, 'id' | 'month' | 'folder'>; articleTitle: string };
export function HistorySnapshotPreview({ snapshot, root, article, articleTitle }: Props) {
  const live = useFormatSnapshot();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rendition, setRendition] = useState<{ id: string; css: string; html?: string; format: FormatSnapshot } | null>(null);
  const [issue, setIssue] = useState('');
  const identity = useRef({ id: snapshot.id, root, articleId: article.id });
  identity.current = { id: snapshot.id, root, articleId: article.id };
  const format = rendition?.id === snapshot.id ? rendition.format : live;
  const { target, native } = useArticleRenderMount(hostRef, format, rendition?.css ?? '');
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
        const result = await compileArticleStyles(snapshot.source, snapshot.theme);
        if (active) setRendition({ id: snapshot.id, css: result.css, format: live });
      }
    })().catch(error => { if (active) setIssue(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; dispose?.(); };
  }, [snapshot.id, snapshot.source, snapshot.theme, snapshot.renderRecord, snapshot.renderIssue, root, live.id]);
  const media: ArticleMediaContext = { root, article, articleTitle, sessionKey: 'history-' + snapshot.id,
    isCurrent: () => identity.current.id === snapshot.id && identity.current.root === root && identity.current.articleId === article.id };
  return <div className="history-render-scroll" aria-label="历史文章排版预览">
    {!snapshot.renderRecord && !issue ? <p className="content-library-note" data-tone="warning">此旧版本未留存渲染依赖，以下使用当前资料库环境预览。</p> : null}
    {issue ? <p className="content-library-note" data-tone="error" role="alert">历史渲染无法复现：{issue}。原文保留，可切换到源码查看。</p> : null}
    {!rendition && !issue ? <p className="status-copy" role="status">正在载入此版本自己的主题与样式…</p> : null}
    <div ref={hostRef} className="history-render-host" aria-busy={!rendition && !issue} />
    {target && rendition?.id === snapshot.id ? createPortal(<>
      {!native ? <style data-article-style>{articlePreviewStyle(rendition.css)}</style> : null}
      {rendition.html !== undefined ? <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(rendition.html, format) }} /> :
        <ArticleDocument snapshot={format} themeId={snapshot.theme.id} media={media}><MarkdownPreview source={snapshot.parsed.body} media={media} snapshot={format} /></ArticleDocument>}
    </>, target) : null}
  </div>;
}
