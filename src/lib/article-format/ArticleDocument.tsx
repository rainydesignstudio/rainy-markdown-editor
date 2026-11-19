'use client';

import { createElement, useCallback, type ReactNode } from 'react';
import type { FormatSnapshot } from './runtime';
import { bindArticleRenderSnapshot } from './runtime';
import { MarkdownPreview, type ArticleMediaContext } from './MarkdownPreview';

export function ArticleDocument({ snapshot, themeId, attach, media, children, codeKey }: {
  snapshot: FormatSnapshot; themeId: string; attach?: (element: HTMLElement | null) => void;
  media?: ArticleMediaContext | null; children: ReactNode; codeKey?: string;
}) {
  const policy = snapshot.bundle.formatter.document;
  const bind = useCallback((element: HTMLElement | null) => { if (element) bindArticleRenderSnapshot(element, snapshot); attach?.(element); }, [attach, snapshot]);
  if (snapshot.renderer) return <div ref={bind} data-package-document="true" data-preview-code-key={codeKey}>{children}</div>;
  const root = policy?.root ?? { tag: 'article', classes: ['article-preview'] };
  const body = policy ? policy.body : { tag: 'div', classes: ['article-body'] };
  const content = body ? createElement(body.tag, { id: body.id, className: body.classes.join(' '), 'data-article-content-body': '' }, children) : children;
  return createElement(root.tag, { ref: bind, id: root.id, className: root.classes.join(' '), 'data-theme': themeId, 'data-article-content-root': '', 'data-preview-code-key': codeKey },
    policy?.beforeHtml ? <MarkdownPreview source={policy.beforeHtml} media={media} snapshot={snapshot} previewOnly /> : null,
    content,
    policy?.afterHtml ? <MarkdownPreview source={policy.afterHtml} media={media} snapshot={snapshot} previewOnly /> : null);
}
