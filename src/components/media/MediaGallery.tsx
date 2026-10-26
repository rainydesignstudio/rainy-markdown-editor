'use client';

import { productCause, productMessage, productJoin } from "../../lib/i18n/productMessages";

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { formatUIBytes, formatUIResolution } from '../../lib/i18n/formatters';
import type { UILocale } from '../../lib/i18n/preferences';

import { useRef, useState, type ChangeEvent } from 'react';
import type { LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import { useEditingDrafts, UnsavedMark } from '../global/EditingDrafts';
import { hasEditingDraft } from '../../lib/editingDrafts';
import { IconButton } from '../global/IconButton';
import { ContentIcon } from '../global/ContentIcon';
import { TooltipButton } from '../global/TooltipButton';
import type { MediaPreferences } from '../../hooks/useMediaPreferences';
import { ArticleImagePreview } from './ArticleImagePreview';
import { ResourceGlyph } from './ResourceGlyph';
import { libraryMediaAssetKey } from '../../lib/articleMedia';
import { resourceType } from '../../lib/resources/types';
import { LibraryCardFrame } from '../global/LibraryCard';

export const mediaAssetKey = libraryMediaAssetKey;
export const mediaAssetOrigin = (asset: LibraryMediaAsset, sharedLabel = '共享素材') => asset.kind === 'shared' ? sharedLabel : asset.articleTitle;
export function MediaSourceSwitch({ value, onChange, disabled, articleLabel: customArticleLabel, resourceLabels = false }: {
  value: 'shared' | 'article';
  onChange: (value: 'shared' | 'article') => void;
  disabled: boolean;
  articleLabel?: string; resourceLabels?: boolean;
}) {
  const { t } = useUITranslation('media');
  const articleLabel = customArticleLabel ?? t('media:ui.articleAssets');
  return <div className="flex min-w-0 gap-1 rounded-lg bg-list p-1" role="group" aria-label={t(resourceLabels ? 'messages:resources.sourceLabel' : 'media:ui.imageSource')}>
    {(['shared', 'article'] as const).map((kind) => <button key={kind} type="button" aria-pressed={value === kind} disabled={disabled} onClick={() => onChange(kind)} className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-muted transition-colors md:px-3 hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:bg-panel aria-pressed:text-accent-text"><MediaIcon name={kind === 'shared' ? 'shared' : 'article'} />{kind === 'shared' ? t('media:ui.sharedAssets') : articleLabel}</button>)}
  </div>;
}
export function formatMediaBytes(size: number, locale: UILocale = 'zh-CN'): string {
  return formatUIBytes(size, locale);
}

export function MediaIcon({ name }: { name: 'image' | 'import' | 'refresh' | 'close' | 'use' | 'search' | 'edit' | 'download' | 'delete' | 'replace' | 'shared' | 'article' | 'select' | 'all' | 'group' | 'sort' | 'layout' }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'select' ? <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></> : name === 'all' ? <><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6m5-3 3 3 5-6" /></> : name === 'group' ? <path d="M3 7V4h7l2 3h9v13H3z" /> : name === 'sort' ? <path d="M5 20V4m-3 3 3-3 3 3M12 5h4M12 10h6M12 15h8" /> : name === 'layout' ? <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18M12 3v18" /></> : name === 'edit' ? <><path d="m4 16 12-12 4 4L8 20H4zM14 6l4 4" /></> : name === 'delete' ? <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></> : name === 'shared' ? <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></> : name === 'article' ? <><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h6" /></> : name === 'replace' ? <><path d="M4 7h15l-4-4M20 17H5l4 4M4 7v7M20 17v-7" /></> : name === 'image' ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 6-5 4 3 3-3 3 3" /></> : name === 'import' || name === 'download' ? <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></> : name === 'refresh' ? <><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 1M18 18a8 8 0 0 1-13-1" /></> : name === 'close' ? <path d="m5 5 14 14M19 5 5 19" /> : name === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : <><path d="M10 5h10v14H10M3 12h12m-4-4 4 4-4 4" /></>}
  </svg>;
}

export function MediaImportButton({ busy, disabled, onImport, onSelect, allResources = false }: {
  busy: boolean;
  disabled: boolean;
  onImport?: (files: File[]) => Promise<MediaActionOutcome>;
  onSelect?: (files: File[]) => void;
  allResources?: boolean;
}) {
  const { t } = useUITranslation('media');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length) { if (onSelect) onSelect(files); else void onImport?.(files); }
  };
  return <>
    <input ref={inputRef} type="file" accept={allResources ? undefined : 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif'} multiple hidden aria-label={t(allResources ? 'messages:resources.importSharedFiles' : 'media:ui.importSharedImageFiles')} onChange={selectFiles} />
    <button className="button button-primary" type="button" disabled={busy || disabled} onClick={() => inputRef.current?.click()}><MediaIcon name="import" /><span>{busy ? t('media:ui.working') : t(allResources ? 'messages:resources.importSharedFiles' : 'media:ui.importSharedImages')}</span></button>
  </>;
}

export async function downloadMediaAsset(asset: LibraryMediaAsset, isCurrent: () => boolean): Promise<MediaActionOutcome> {
  try {
    const file = await asset.handle.getFile();
    if (!isCurrent()) return { ok: false, tone: 'warning', ...productMessage("mediaGallery.theLibraryChangedNothingWasDownloaded") };
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = asset.fileName; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true, tone: 'success', ...productMessage("mediaGallery.downloaded", { "assetFileName": asset.fileName }) };
  } catch (error) { return { ok: false, tone: 'error', ...productMessage("mediaGallery.downloadFailed", { "cause": productCause(error) }) }; }
}

export async function downloadMediaAssets(assets: LibraryMediaAsset[], isCurrent: () => boolean): Promise<MediaActionOutcome> {
  const outcomes: MediaActionOutcome[] = [], failedKeys: string[] = [];
  for (let index = 0; index < assets.length; index++) {
    if (!isCurrent()) { failedKeys.push(...assets.slice(index).map(mediaAssetKey)); outcomes.push({ ok: false, tone: 'warning', ...productMessage('mediaGallery.theLibraryChangedNothingWasDownloaded') }); break; }
    const result = await downloadMediaAsset(assets[index], isCurrent); outcomes.push(result);
    if (!result.ok) failedKeys.push(mediaAssetKey(assets[index]));
  }
  const started = outcomes.filter(result => result.ok).length, failed = assets.length - started;
  return { ok: failed === 0, tone: failed ? started ? 'warning' : 'error' : 'success', failedKeys, ...productMessage('mediaGallery.downloadBatch', { started, failed, details: productJoin(outcomes.map(result => productCause(result)), '\n') }) };
}

export function sortMediaAssets(assets: LibraryMediaAsset[], preferences: MediaPreferences) {
  return [...assets].sort((left, right) => {
    const value = preferences.sort === 'size' ? left.size - right.size : preferences.sort === 'modified' ? (left.lastModified ?? 0) - (right.lastModified ?? 0) : left.fileName.localeCompare(right.fileName, 'zh-CN', { numeric: true });
    return (value || mediaAssetKey(left).localeCompare(mediaAssetKey(right))) * (preferences.descending ? -1 : 1);
  });
}
export function MediaGallery({ assets, selected, onSelect, sessionKey, isCurrent, disabled, columns = 3, selectedKeys, onToggleSelection, onRename, onTransfer, onDelete, onAdopt, canAdopt, onNotice, referenceStates }: {
  referenceStates?: Readonly<Record<string, boolean>>;
  assets: LibraryMediaAsset[]; selected: string | null; onSelect: (asset: LibraryMediaAsset) => void;
  sessionKey: number; isCurrent: () => boolean; disabled: boolean; columns?: 1 | 2 | 3 | 4;
  selectedKeys?: ReadonlySet<string>; onToggleSelection?: (asset: LibraryMediaAsset) => void; onRename?: (asset: LibraryMediaAsset) => void;
  onTransfer?: (asset: LibraryMediaAsset) => void; onDelete?: (asset: LibraryMediaAsset) => void; onAdopt?: (asset: LibraryMediaAsset) => void;
  canAdopt?: (asset: LibraryMediaAsset) => boolean; onNotice?: (notice: MediaActionOutcome) => void;
}) {
  const { t } = useUITranslation('media');
  const editingDrafts = useEditingDrafts();
  const { locale } = useUILocale();
  const [dimensions, setDimensions] = useState<Record<string, string>>({});
  return <div className="grid min-w-0 grid-cols-2 content-start gap-3 data-[columns=1]:grid-cols-1 md:data-[columns=2]:grid-cols-2 md:data-[columns=3]:grid-cols-3 md:data-[columns=4]:grid-cols-4" data-columns={columns} role="group" aria-label={t('media:ui.imageList')}>
    {assets.map(asset => {
      const key = mediaAssetKey(asset), referenced = referenceStates?.[key], chosen = selectedKeys ? selectedKeys.has(key) : selected === key;
      return <LibraryCardFrame key={key} data-selected={chosen} data-selecting={Boolean(selectedKeys)} data-layout={columns === 1 ? 'list' : 'grid'} className="data-[layout=list]:flex">
        <button type="button" disabled={disabled} aria-label={t('media:templates.selectOrigin', { name: asset.fileName, origin: mediaAssetOrigin(asset, t('media:ui.sharedAssets')) })} aria-pressed={selectedKeys ? undefined : chosen} role={selectedKeys ? 'checkbox' : undefined} aria-checked={selectedKeys ? chosen : undefined} onClick={() => onSelect(asset)} className="absolute inset-0 cursor-default rounded-lg focus-visible:outline-2 focus-visible:outline-accent"><span aria-hidden="true" className="absolute top-0 left-0 aspect-square w-full cursor-pointer group-data-[layout=list]:h-full group-data-[layout=list]:w-24 md:group-data-[layout=list]:w-32" /></button>
        <div className="pointer-events-none relative min-w-0 shrink-0 text-left group-data-[layout=list]:w-24 md:group-data-[layout=list]:w-32">
          <span className="media-gallery-thumbnail group-data-[layout=list]:border-b-0">{asset.storage === 'file' ? <ResourceGlyph fileName={asset.fileName} mimeType={asset.mimeType} /> : <ArticleImagePreview handle={asset.handle} fileName={asset.fileName} alt={asset.description ?? ''} variant="tile" sessionKey={`${sessionKey}:${key}`} isCurrent={isCurrent} onDimensions={(width, height) => setDimensions(values => values[key] === `${width} × ${height}` ? values : { ...values, [key]: `${width} × ${height}` })} />}</span>
          {dimensions[key] ? <span className="absolute right-2 bottom-2 rounded-md bg-popup-bg px-1.5 py-0.5 font-mono text-2xs text-popup-text">{formatUIResolution(dimensions[key], locale)}</span> : null}
        </div>
        {onToggleSelection ? <span data-checked={selectedKeys?.has(key) ?? false} className="absolute top-2 left-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-data-[selecting=true]:opacity-100 data-[checked=true]:opacity-100 pointer-coarse:opacity-100"><TooltipButton role="checkbox" aria-checked={selectedKeys?.has(key) ?? false} aria-label={t('media:templates.select', { name: asset.fileName })} tooltip={selectedKeys?.has(key) ? t('media:ui.deselectImage') : t('media:ui.selectImage')} disabled={disabled} onClick={() => onToggleSelection(asset)} className="grid size-6 min-h-6 place-items-center rounded-md border border-line-strong bg-panel text-accent-text focus-visible:outline-2 focus-visible:outline-accent"><span aria-hidden="true">{selectedKeys?.has(key) ? '✓' : ''}</span></TooltipButton></span> : null}
        <div className="pointer-events-none relative grid min-w-0 flex-1 content-start gap-2 p-3 group-data-[layout=list]:content-center">
          <div className="flex min-w-0 items-center gap-1"><button type="button" className="pointer-events-auto min-w-0 cursor-pointer truncate text-left text-sm font-semibold text-primary" disabled={disabled} title={asset.fileName} onClick={() => onRename ? onRename(asset) : onSelect(asset)}>{asset.fileName}</button>{hasEditingDraft(editingDrafts, asset.root, 'assets', key) ? <UnsavedMark /> : null}{onRename ? <IconButton variant="inline" icon={<MediaIcon name="edit" />} className="pointer-events-auto" tooltip={t('media:ui.renameFile')} aria-label={t('media:templates.rename', { name: asset.fileName })} disabled={disabled} onClick={() => onRename(asset)} /> : null}{referenced ? <span className="ml-auto inline-flex h-4 shrink-0 items-center rounded-md border border-accent-line bg-accent-soft px-1 text-2xs font-medium text-accent-text">{t('messages:resources.referenced')}</span> : null}</div>
          <span className="truncate text-xs text-muted">{mediaAssetOrigin(asset, t('media:ui.sharedAssets'))}</span>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs text-muted">{asset.storage === 'file' ? resourceType(asset.fileName, asset.mimeType).badge || 'FILE' : asset.mimeType.replace('image/', '').toUpperCase()} · {formatMediaBytes(asset.size, locale)}</span><div className="flex max-w-full shrink-0 flex-wrap gap-1" role="group" aria-label={t(asset.storage === 'file' ? 'messages:resources.fileActions' : 'media:templates.actions', { name: asset.fileName })}>
            <IconButton icon={<MediaIcon name="download" />} className="pointer-events-auto" tooltip={t(asset.storage === 'file' ? 'messages:resources.downloadFile' : 'media:ui.downloadImage')} aria-label={t('media:templates.download', { name: asset.fileName })} disabled={disabled} onClick={() => void downloadMediaAsset(asset, isCurrent).then(onNotice)} />
            {onTransfer ? <IconButton icon={<ContentIcon name="copy" />} className="pointer-events-auto" tooltip={t(referenced === undefined ? 'messages:resources.referenceUnconfirmed' : referenced ? 'messages:resources.copy' : 'messages:resources.move')} aria-label={t(referenced === undefined ? 'messages:resources.referenceUnconfirmed' : referenced ? 'messages:resources.copy' : 'messages:resources.move')} disabled={disabled || referenced === undefined} onClick={() => onTransfer(asset)} /> : null}
            {onDelete ? <IconButton icon={<MediaIcon name="delete" />} className="pointer-events-auto" tone="danger" tooltip={t(asset.storage === 'file' ? 'messages:resources.deleteFile' : 'media:ui.deleteImage')} aria-label={t('media:templates.delete', { name: asset.fileName })} disabled={disabled} onClick={() => onDelete(asset)} /> : null}

          </div></div>
        </div>
      </LibraryCardFrame>;
    })}
  </div>;
}
export function MediaDetails({ asset, sessionKey, isCurrent, onPreview, onRename, onDescribe, onReplace, onTransfer, onDelete, onNotice, referenced, disabled = false }: {
  referenced?: boolean;
  asset: LibraryMediaAsset; sessionKey: number; isCurrent: () => boolean;
  onPreview?: () => void; onRename?: () => void; onDescribe?: () => void;
  onReplace?: () => void; onTransfer?: () => void; onDelete?: () => void; disabled?: boolean;
  onNotice?: (notice: MediaActionOutcome) => void;
}) {
  const { t } = useUITranslation('media');
  const { locale } = useUILocale();
  const [dimensions, setDimensions] = useState('');
  return <div className="grid min-w-0 content-start gap-4">
    <div className="grid min-w-0 gap-1"><div className="flex min-w-0 items-center gap-1"><h3 className="min-w-0 truncate font-heading text-base font-semibold text-primary" title={asset.fileName}>{asset.fileName}</h3>{onRename ? <IconButton variant="inline" icon={<MediaIcon name="edit" />} tooltip={t('media:ui.renameFile')} aria-label={t(asset.storage === 'file' ? 'messages:resources.renameFile' : 'media:ui.renameSelectedImage')} disabled={disabled} onClick={onRename} /> : null}{referenced ? <span className="ml-auto inline-flex h-4 shrink-0 items-center rounded-md border border-accent-line bg-accent-soft px-1 text-2xs font-medium text-accent-text">{t('messages:resources.referenced')}</span> : null}</div><p className="text-xs text-muted">{mediaAssetOrigin(asset, t('media:ui.sharedAssets'))}</p></div>
    {asset.storage === 'file' ? <div className="aspect-4/3 overflow-hidden rounded-lg border border-line"><ResourceGlyph fileName={asset.fileName} mimeType={asset.mimeType} /></div> : <button type="button" aria-label={t('media:ui.previewSelectedImage')} aria-haspopup="dialog" disabled={disabled || !onPreview} onClick={onPreview} className="relative grid aspect-4/3 min-h-0 min-w-0 place-items-center overflow-hidden rounded-lg border border-line bg-list cursor-zoom-in focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default"><ArticleImagePreview handle={asset.handle} fileName={asset.fileName} alt={asset.description ?? ''} variant="tile" sessionKey={`${sessionKey}:${mediaAssetKey(asset)}:detail`} isCurrent={isCurrent} onDimensions={(width, height) => setDimensions(`${width} × ${height}`)} /></button>}
    <dl className="grid min-w-0 grid-cols-2 gap-2 text-xs">{asset.storage !== 'file' ? <><dt className="text-muted">{t('media:ui.resolution')}</dt><dd className="text-right font-mono text-secondary">{dimensions ? formatUIResolution(dimensions, locale) : t('media:ui.loading')}</dd></> : null}<dt className="text-muted">{t('media:ui.format')}</dt><dd className="break-all text-right font-mono text-secondary">{asset.storage === 'file' ? asset.mimeType : asset.mimeType.replace('image/', '').toUpperCase()}</dd><dt className="text-muted">{t('media:ui.fileSize')}</dt><dd className="text-right font-mono text-secondary">{formatMediaBytes(asset.size, locale)}</dd></dl>
    <div className="grid gap-2"><span className="text-xs text-muted">{t('media:ui.description')}</span><div className="flex min-w-0 items-center gap-1"><p className="min-w-0 whitespace-pre-wrap break-words text-xs text-secondary">{asset.description || t('media:ui.noDescription')}</p>{onDescribe ? <IconButton variant="inline" icon={<MediaIcon name="edit" />} tooltip={t('media:ui.editDescription')} aria-label={t(asset.storage === 'file' ? 'messages:resources.editFileDescription' : 'media:ui.editImageDescription')} disabled={disabled} onClick={onDescribe} /> : null}</div></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t(asset.storage === 'file' ? 'messages:resources.selectedFileActions' : 'media:ui.selectedImageActions')}>
      <IconButton icon={<MediaIcon name="image" />} tooltip={t(asset.storage === 'file' ? 'messages:resources.downloadOnly' : 'media:ui.viewOriginalImage')} aria-label={t(asset.storage === 'file' ? 'messages:resources.viewFile' : 'media:ui.viewOriginalImage')} disabled={disabled || asset.storage === 'file' || !onPreview} onClick={onPreview} />
      <IconButton icon={<MediaIcon name="download" />} tooltip={t(asset.storage === 'file' ? 'messages:resources.downloadFile' : 'media:ui.downloadImage')} disabled={disabled} onClick={() => void downloadMediaAsset(asset, isCurrent).then(onNotice)} />
      <IconButton icon={<ContentIcon name="copy" />} tooltip={t(referenced === undefined ? 'messages:resources.referenceUnconfirmed' : referenced ? 'messages:resources.copy' : 'messages:resources.move')} aria-label={t(referenced === undefined ? 'messages:resources.referenceUnconfirmed' : referenced ? 'messages:resources.copy' : 'messages:resources.move')} disabled={disabled || !onTransfer || referenced === undefined} onClick={onTransfer} />
      <IconButton icon={<MediaIcon name="replace" />} tooltip={t(asset.storage === 'file' ? 'messages:resources.replaceFile' : 'media:ui.replaceImage')} disabled={disabled || !onReplace} onClick={onReplace} />
      <IconButton icon={<MediaIcon name="delete" />} tone="danger" tooltip={t(asset.storage === 'file' ? 'messages:resources.deleteFile' : 'media:ui.deleteImage')} aria-label={t(asset.storage === 'file' ? 'messages:resources.deleteFile' : 'media:ui.deleteSelectedImages')} disabled={disabled || !onDelete} onClick={onDelete} />
    </div>
  </div>;
}
