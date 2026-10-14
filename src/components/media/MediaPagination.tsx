'use client';

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';
import { formatUINumber } from '../../lib/i18n/formatters';

import { MEDIA_PAGE_SIZES, type MediaPageSize } from '../../lib/mediaBrowsing';
import { IconButton } from '../global/IconButton';

export function MediaPagination({ page, pageCount, start, end, total, pageSize, setPage, setPageSize, disabled = false }: {
  page: number; pageCount: number; start: number; end: number; total: number; pageSize: MediaPageSize;
  setPage: (page: number) => void; setPageSize: (size: MediaPageSize) => void; disabled?: boolean;
}) {
  const { t } = useUITranslation('media');
  const { locale } = useUILocale();
  return <nav className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line p-4 text-xs text-muted" aria-label={t('media:ui.imagePagination')}>
    <span className="mr-auto" role="status">{t('media:templates.range', { start, end, total })}</span>
    <label className="flex shrink-0 items-center gap-2"><span>{t('media:ui.perPage')}</span><select className="field min-h-9 w-auto py-1 text-xs" aria-label={t('media:ui.imagesPerPage')} value={pageSize} disabled={disabled} onChange={event => setPageSize(Number(event.target.value) as MediaPageSize)}>{MEDIA_PAGE_SIZES.map(size => <option key={size} value={size}>{t('media:templates.pageSize', { count: size })}</option>)}</select></label>
    <div className="flex shrink-0 items-center gap-1">
      <IconButton tooltip={t('media:ui.previousPage')} disabled={disabled || page <= 1} onClick={() => setPage(page - 1)} icon={<span aria-hidden="true">←</span>} />
      <label><span className="sr-only">{t('media:ui.imagePage')}</span><select className="field min-h-9 w-auto py-1 text-xs" aria-label={t('media:ui.imagePage')} value={page} disabled={disabled || pageCount <= 1} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{formatUINumber(index + 1, locale)}／{formatUINumber(pageCount, locale)}</option>)}</select></label>
      <IconButton tooltip={t('media:ui.nextPage')} disabled={disabled || page >= pageCount} onClick={() => setPage(page + 1)} icon={<span aria-hidden="true">→</span>} />
    </div>
  </nav>;
}
