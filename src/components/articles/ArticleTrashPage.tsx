'use client';

import type { useArticleTrash } from '../../hooks/useArticleTrash';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { PageHeading } from '../global/PageHeading';
import { ContentIcon } from '../global/ContentIcon';
import { IconButton } from '../global/IconButton';

export function ArticleTrashPage({ trash, directoryName, enabled, disabled }: { trash: ReturnType<typeof useArticleTrash>; directoryName: string | null; enabled: boolean; disabled: boolean }) {
  const { t } = useUITranslation('messages'), { locale } = useUILocale();
  const blocked = disabled || trash.busy;
  return <section className="page-card">
    <PageHeading className="border-b border-line pb-5" children={<><div><p className="eyebrow">{t('trash.eyebrow')}</p><h2 className="mt-1 font-heading text-2xl font-semibold text-primary">{t('trash.title')}</h2><p className="mt-3 text-sm text-muted">{t(enabled ? 'trash.description' : 'trash.offDescription')}</p></div><div className="flex items-center gap-2"><IconButton tooltip={t('trash.refresh')} icon={<ContentIcon name="reset" />} disabled={blocked} onClick={() => void trash.refresh()} /><button className="button button-quiet" disabled={blocked || !enabled || !trash.available.length} type="button" onClick={() => trash.requestCleanup()}><ContentIcon name="delete" />{t('trash.clear')}</button></div></>} />
    <div className="grid min-w-0 gap-4 rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4"><code className="break-all text-xs text-muted">{directoryName}/_trash/</code><span className="text-xs text-muted">{t('trash.entries', { count: trash.available.length })}</span></div>
      {trash.issues.length ? <div className="grid gap-2 rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong">{trash.issues.map((item, index) => <p className="break-words" key={index}>{formatProductMessage(item, t)}</p>)}</div> : null}
      {trash.cleanups.map(record => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-list p-4"><div className="grid min-w-0 gap-1"><strong className="text-sm text-primary">{t(record.committing ? 'trash.cleanupCommitting' : 'trash.cleanupPending')}</strong><span className="text-xs text-muted">{t('trash.entries', { count: record.entryIds.length - record.removedIds.length })}</span></div><button className="button button-quiet" type="button" disabled={blocked} onClick={() => void (record.committing ? trash.retryCleanup(record.id) : trash.undoCleanup(record.id))}><ContentIcon name="reset" />{t(record.committing ? 'trash.cleanupRetry' : 'trash.undoCleanup')}</button></div>)}
      {!trash.available.length ? <p className="py-8 text-center text-sm text-muted">{t('trash.emptyDescription')}</p> : <div className="divide-y divide-line">{trash.available.map(entry => <article key={entry.id} className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-4"><div className="grid min-w-0 flex-1 gap-2"><h3 className="break-words text-sm font-semibold text-primary">{entry.title}</h3><code className="break-all text-xs text-muted">articles/{entry.articleId}</code><p className="text-xs text-faint">{t('trash.deletedAt')} · {new Date(entry.deletedAt).toLocaleString(locale)}</p>{entry.state === 'restored' ? <p className="text-xs text-warning-strong">{t('trash.restoredState')}</p> : null}</div><div className="flex shrink-0 items-center gap-2"><IconButton tooltip={t(entry.state === 'restored' ? 'trash.restoreRetry' : 'trash.restore')} icon={<ContentIcon name="reset" />} disabled={blocked} onClick={() => void trash.restore([entry.id])} /><IconButton tooltip={t('trash.permanentDelete')} icon={<ContentIcon name="delete" />} disabled={blocked || !enabled} onClick={() => trash.requestCleanup([entry.id])} /></div></article>)}</div>}
    </div>
  </section>;
}
