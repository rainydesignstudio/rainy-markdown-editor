'use client';

import { useUITranslation } from "../global/UILocaleProvider";
import { formatProductMessage } from "../../lib/i18n/productMessages";

import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compileArticleStyles } from '../../lib/tailwind';
import type { ThemeConfig } from '../../lib/types';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import type { ArticleMediaContext } from '../editor/MarkdownPreview';
import { useArticleRenderMount } from '../../hooks/useArticleRenderMount';
import { ArticleDocument } from '../editor/ArticleDocument';

export function ContentRenderPreview({ source, theme, blocked = false, media = null, fill = false, bare = false, dark = false }: { source: string; theme: ThemeConfig; blocked?: boolean; media?: ArticleMediaContext | null; fill?: boolean; bare?: boolean; dark?: boolean }) {
  const { t } = useUITranslation('messages');
  const formatSnapshot = useFormatSnapshot();
  const hostRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [css, setCss] = useState('');
  const { target, native, darkIssue } = useArticleRenderMount(hostRef, formatSnapshot, css, dark);
  const [issue, setIssue] = useState('');
  const [pending, setPending] = useState(true);
  const body = source.replace('▌', '');
  useEffect(() => {
    let current = true;
    setPending(!blocked); setIssue('');
    if (blocked) { setCss(''); return; }
    // Merge rapid typing; ignore obsolete completions on edits, theme changes or unmount.
    const timer = window.setTimeout(() => {
      void compileArticleStyles(body, theme).then(result => {
        if (current) { setCss(result.css); setPending(false); }
      }).catch((error: unknown) => {
        if (current) { setIssue(error instanceof Error ? error.message : String(error)); setPending(false); }
      });
    }, 200);
    return () => { current = false; window.clearTimeout(timer); };
  }, [body, theme, blocked, formatSnapshot.id]);
    return <section id={bare ? undefined : 'content-render-preview'} className={`flex ${fill ? 'min-h-0' : 'min-h-64'} min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line group-data-[wide=true]/content-preview:min-h-0`} style={previewSurfaceStyle(dark)} aria-label={t("messages:uiFeedback.livePreview")}>
    {bare ? null : <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-list px-4 py-3"><span className="text-xs font-medium text-secondary">{t("messages:uiFeedback.livePreviewShort")}</span><span className="text-xs text-faint" role="status">{blocked ? t("messages:uiFeedback.repairMetadata") : issue ? t("messages:uiFeedback.stylesFailed") : pending ? t("messages:uiFeedback.updating") : theme.name}</span></header>}
    {bare && pending && !blocked ? <p className="shrink-0 px-4 py-2 text-xs text-muted" role="status">{t("messages:uiFeedback.layoutUpdating")}</p> : null}
    {issue ? <p className="shrink-0 px-4 py-3 text-xs text-danger" role="alert">{formatProductMessage(issue, t)}</p> : null}
    {darkIssue ? <p className="shrink-0 px-4 py-3 text-xs text-danger" role="alert">{t("messages:uiFeedback.darkIncomplete")}{formatProductMessage(darkIssue, t)}</p> : null}
    <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div ref={hostRef} hidden={blocked} className="min-h-full min-w-0" style={previewSurfaceStyle()} aria-busy={pending} />
      {blocked ? <p className="p-4 text-sm text-muted">{t("messages:uiFeedback.metadataBlocksPreview")}</p> : target ? createPortal(<>{!native ? <style>{css ? articlePreviewStyle(css) : ''}</style> : null}<ArticleDocument snapshot={formatSnapshot} themeId={theme.id} attach={element => { articleRef.current = element; }} media={media}><MarkdownPreview source={body} media={media} snapshot={formatSnapshot} /></ArticleDocument></>, target) : null}
    </div>
  </section>;
}
