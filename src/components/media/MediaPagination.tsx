'use client';

import { SelectField } from '../global/SelectField';
import { useUITranslation, useUILocale } from '../global/UILocaleProvider';
import { formatUINumber } from '../../lib/i18n/formatters';

import { MEDIA_PAGE_SIZES, type MediaPageSize } from '../../lib/mediaBrowsing';
import { IconButton } from '../global/IconButton';

export function MediaPagination({ page, pageCount, start, end, total, pageSize, setPage, setPageSize, disabled = false, resourceLabels = false }: {
  page: number; pageCount: number; start: number; end: number; total: number; pageSize: MediaPageSize;
  setPage: (page: number) => void; setPageSize: (size: MediaPageSize) => void; disabled?: boolean; resourceLabels?: boolean;
}) {
  const { t } = useUITranslation('media');
  const { locale } = useUILocale();
  return <nav className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line p-4 text-xs text-muted" aria-label={t(resourceLabels ? 'messages:resources.pagination' : 'media:ui.imagePagination')}>
    <span className="mr-auto" role="status">{t(resourceLabels ? 'messages:resources.range' : 'media:templates.range', { start, end, total })}</span>
    <label className="flex shrink-0 items-center gap-2"><span>{t('media:ui.perPage')}</span><SelectField label={t(resourceLabels ? 'messages:resources.perPage' : 'media:ui.imagesPerPage')} className="min-h-9 w-auto py-1 text-xs" value={pageSize} disabled={disabled} onChange={nextValue => setPageSize(Number(nextValue) as MediaPageSize)} options={[...(MEDIA_PAGE_SIZES.map(size => ({ value: size, label: t(resourceLabels ? 'messages:resources.pageSize' : 'media:templates.pageSize', { count: size }) })) ?? [])]} /></label>
    <div className="flex shrink-0 items-center gap-1">
      <IconButton tooltip={t('media:ui.previousPage')} disabled={disabled || page <= 1} onClick={() => setPage(page - 1)} icon={<span aria-hidden="true">←</span>} />
      <label><span className="sr-only">{t(resourceLabels ? 'messages:resources.pageLabel' : 'media:ui.imagePage')}</span><SelectField label={t(resourceLabels ? 'messages:resources.pageLabel' : 'media:ui.imagePage')} className="min-h-9 w-auto py-1 text-xs" value={page} disabled={disabled || pageCount <= 1} onChange={nextValue => setPage(Number(nextValue))} options={[...(Array.from({ length: pageCount }, (_, index) => ({ value: index + 1, label: [formatUINumber(index + 1, locale), "／", formatUINumber(pageCount, locale)].join('') })) ?? [])]} /></label>
      <IconButton tooltip={t('media:ui.nextPage')} disabled={disabled || page >= pageCount} onClick={() => setPage(page + 1)} icon={<span aria-hidden="true">→</span>} />
    </div>
  </nav>;
}
