'use client';
import { useState, type ComponentProps } from 'react';
import { useUITranslation } from '../global/UILocaleProvider';
import { ProductError, productCause, productErrorMessage, formatProductMessage } from '../../lib/i18n/productMessages';
import { localResourceReference } from '../../lib/resources/references';
import { readLinkedResource } from '../../lib/resources/download';
import { currentImportResource } from '../../lib/resources/inspection';
import { downloadArticleBlob } from '../../lib/articleExport';
import type { ArticleMediaContext } from './MarkdownPreview';

export function LocalFileLink({ href, context: media, children, ...props }: ComponentProps<'a'> & { href: string; context: ArticleMediaContext | null }) {
  const { t } = useUITranslation('messages'), local = localResourceReference(href);
  const id = media?.article?.id ?? 'draft';
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null);
  const download = async () => {
    if (busy) return; setBusy(true); setIssue(null);
    try {
      if (!local || !media?.root || !media.isCurrent() || !local.shared && !media.article) throw new ProductError('resources.linkUnavailable');
      const latest = await currentImportResource(media.root, id, href, media.isCurrent);
      if (latest?.state === 'pending' || latest?.state === 'running') throw new ProductError('resources.importPending', { name: local.fileName });
      if (latest?.state === 'failed' || latest?.state === 'cancelled') throw new ProductError('resources.importFailed', { name: local.fileName, cause: latest.error ? productCause(latest.error) : '' });
      const destination = local.shared ? { kind: 'shared' as const } : { kind: 'article' as const, articleId: media.article!.id, month: media.article!.month, folder: media.article!.folder, title: media.articleTitle };
      const file = await readLinkedResource(media.root, destination, local.fileName, media.isCurrent);
      if (!media.isCurrent()) return; downloadArticleBlob(file, local.fileName);
    } catch (error) { if (media?.isCurrent() !== false) { setIssue(productErrorMessage(error)); media?.onResourceError?.(error); } }
    finally { setBusy(false); }
  };
  return <><a {...props} href={href} aria-busy={busy || undefined} onClick={event => { event.preventDefault(); void download(); }}>{children}</a>{issue && !media?.onResourceError ? <small data-preview-only="true" role="status">{formatProductMessage(issue, t)}</small> : null}</>;
}
