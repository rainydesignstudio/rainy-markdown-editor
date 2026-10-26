'use client';
import { useState, type ComponentProps } from 'react';
import { useUITranslation } from '../../components/global/UILocaleProvider';
import { productErrorMessage, formatProductMessage } from '../i18n/productMessages';
import { readCurrentLinkedResource } from '../resources/download';
import { downloadArticleBlob } from '../articleExport';
import type { ArticleMediaContext } from './MarkdownPreview';

export function LocalFileLink({ href, context: media, children, ...props }: ComponentProps<'a'> & { href: string; context: ArticleMediaContext | null }) {
  const { t } = useUITranslation('messages');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null);
  const download = async () => {
    if (busy) return; setBusy(true); setIssue(null);
    try {
      const result = await readCurrentLinkedResource(href, media);
      if (media?.isCurrent()) downloadArticleBlob(result.file, result.name);
    } catch (error) { if (media?.isCurrent() !== false) { setIssue(productErrorMessage(error)); media?.onResourceError?.(error); } }
    finally { setBusy(false); }
  };
  return <><a {...props} href={href} aria-busy={busy || undefined} onClick={event => { event.preventDefault(); void download(); }}>{children}</a>{issue && !media?.onResourceError ? <small data-preview-only="true" role="status">{formatProductMessage(issue, t)}</small> : null}</>;
}
