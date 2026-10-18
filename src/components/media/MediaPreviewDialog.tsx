'use client';

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { formatUINumber } from '../../lib/i18n/formatters';

import { useId, useState } from 'react';
import type { LibraryMediaAsset } from '../../lib/articleMedia';
import { DialogFrame, DialogHeader } from '../global/DialogFrame';
import { IconButton } from '../global/IconButton';
import { ArticleImagePreview } from './ArticleImagePreview';
import { mediaAssetKey } from './MediaGallery';
import { useImageZoom } from '../../hooks/useImageZoom';

export function MediaPreviewDialog({ initial, images = [], rendered, sessionKey, isCurrent, onClose }: {
  initial?: LibraryMediaAsset; images?: LibraryMediaAsset[]; rendered?: { src: string; alt: string; fileName: string }; sessionKey: number | string; isCurrent: () => boolean; onClose: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const { locale } = useUILocale();
  const titleId = useId();
  const [key, setKey] = useState(() => initial ? mediaAssetKey(initial) : rendered?.src ?? '');
  const { viewportRef, dimensions, scale, zoomTo, onDimensions, imageStyle } = useImageZoom('contain', `${sessionKey}:${key}`);
  const index = images.findIndex(image => mediaAssetKey(image) === key);
  const image = images[index];
  const move = (direction: number) => {
    const next = images[index + direction];
    if (!next || !isCurrent()) return;
    setKey(previous => {
      const currentIndex = images.findIndex(candidate => mediaAssetKey(candidate) === previous);
      const candidate = images[currentIndex + direction];
      return candidate ? mediaAssetKey(candidate) : previous;
    });
  };
  if ((!image && !rendered) || !isCurrent()) return null;
  const fileName = image?.fileName ?? rendered!.fileName;
  return <DialogFrame titleId={titleId} onClose={onClose} large onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  }}>
    <DialogHeader titleId={titleId} eyebrow={t('common:eyebrows.imagePreview')} title={t('dialogs:ui.imagePreview')} onClose={onClose} />
    <div className="flex shrink-0 items-center gap-3 border-b border-line p-4"><p className="min-w-0 flex-1 truncate text-sm text-primary" title={fileName}>{fileName}</p><span className="shrink-0 font-mono text-xs text-muted" role="status">{formatUINumber(rendered ? 1 : index + 1, locale)}／{formatUINumber(rendered ? 1 : images.length, locale)}</span></div>
    <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-list p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" tabIndex={0} aria-label={t('dialogs:ui.imagePreviewArea')}>
      <div className="grid min-h-full min-w-full place-items-center" style={imageStyle}>
        {image ? <ArticleImagePreview key={key} handle={image.handle} fileName={image.fileName} alt={image.description || image.fileName} variant="dialog" sessionKey={`${sessionKey}:${key}:original`} isCurrent={isCurrent}
          onDimensions={onDimensions}
          imageProps={{ className: 'max-h-none max-w-none shrink-0', style: imageStyle }} /> : <img src={rendered!.src} alt={rendered!.alt} className="max-h-none max-w-none shrink-0" style={imageStyle} onLoad={event => onDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />}
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-line p-4" role="group" aria-label={t('dialogs:ui.imagePreviewActions')}>
      <IconButton tooltip={t('dialogs:ui.previousImageLeftArrow')} aria-label={t('dialogs:ui.previousImage')} disabled={index <= 0} onClick={() => move(-1)} icon={<span aria-hidden="true">←</span>} />
      <IconButton tooltip={t('dialogs:ui.zoomOut')} aria-label={t('dialogs:ui.zoomOut')} disabled={!dimensions.width || scale <= 0.01} onClick={() => zoomTo(scale - 0.25)} icon={<span aria-hidden="true">−</span>} />
      <span className="min-w-12 text-center font-mono text-xs text-secondary" role="status">{formatUINumber(Math.round(scale * 100) / 100, locale, { style: 'percent', maximumFractionDigits: 0 })}</span>
      <IconButton tooltip={t('dialogs:ui.zoomIn')} aria-label={t('dialogs:ui.zoomIn')} disabled={!dimensions.width || scale >= 8} onClick={() => zoomTo(scale + 0.25)} icon={<span aria-hidden="true">+</span>} />
      <button className="button button-quiet min-h-9 py-1 text-xs" disabled={!dimensions.width} onClick={() => zoomTo(1)}>{formatUINumber(1, locale, { style: 'percent' })}</button>
      <button className="button button-quiet min-h-9 py-1 text-xs" disabled={!dimensions.width} onClick={() => zoomTo(null)}>{t('dialogs:ui.fitToWindow')}</button>
      <IconButton tooltip={t('dialogs:ui.nextImageRightArrow')} aria-label={t('dialogs:ui.nextImage')} disabled={Boolean(rendered) || index >= images.length - 1} onClick={() => move(1)} icon={<span aria-hidden="true">→</span>} />
    </div>
  </DialogFrame>;
}
