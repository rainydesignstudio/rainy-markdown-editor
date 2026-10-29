'use client';

import { SelectField, type SelectItem } from '../global/SelectField';
import { CategoryIcon } from '../content/SnippetCategoryDialog';
import { RESOURCE_TYPES } from '../../lib/resources/types';
import { useUITranslation } from '../global/UILocaleProvider';

import type { ReactNode } from 'react';
import type { MediaPreferences } from '../../hooks/useMediaPreferences';
import { IconPopover } from '../global/IconPopover';
import { IconButton } from '../global/IconButton';
import { MediaIcon, MediaSourceSwitch } from './MediaGallery';

export type MediaControl = 'selection' | 'sort' | 'layout' | null;
type Option = { value: string; label: string };
type Filter = { value: string; options: Option[]; onChange: (value: string) => void };
type Selection = { active: boolean; count: number; hasVisible: boolean; onEnable: () => void; onAll: () => void; onDownload: () => void; onTransfer: () => void; onDelete: () => void; onCancel: () => void };
const menuItem = 'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-checked:bg-accent-soft aria-checked:text-accent-text';

export function MediaToolbar({ source, onSourceChange, articleLabel, query, onQueryChange, preferences, onPreferencesChange, activeControl, onControlChange, disabled, count, selection, actions, types, resourceLabels = false }: {
  source: 'shared' | 'article'; onSourceChange: (value: 'shared' | 'article') => void;
  articleLabel?: string; query: string; onQueryChange: (value: string) => void;
  preferences: MediaPreferences; onPreferencesChange: (value: MediaPreferences) => void;
  activeControl: MediaControl; onControlChange: (value: MediaControl) => void;
  disabled: boolean; count?: ReactNode; selection?: Selection; actions?: ReactNode;
  types?: Filter; resourceLabels?: boolean;
}) {
  const { t } = useUITranslation('media');
  const close = () => onControlChange(null);
  const toggle = (name: NonNullable<MediaControl>) => { if (disabled) return; if (name === 'selection') { if (selection?.active) { selection.onCancel(); return; } selection?.onEnable(); } onControlChange(activeControl === name ? null : name); };
  const sorts: Array<{ value: MediaPreferences['sort']; label: string }> = [{ value: 'name', label: t('media:ui.filename') }, { value: 'modified', label: t('media:ui.modifiedTime') }, { value: 'size', label: t('media:ui.fileSize') }];
  const sortLabel = sorts.find(option => option.value === preferences.sort)!.label;
  const typeOptions: SelectItem[] = [];
  if (types) {
    const groups = [
      ['images', ['image', 'image-file', 'svg', 'vector', 'model']],
      ['documents', ['pdf', 'document', 'presentation', 'markdown', 'text', 'ebook']],
      ['data', ['spreadsheet', 'data', 'database']],
      ['development', ['code', 'stylesheet', 'web']],
      ['media', ['audio', 'video']],
      ['other', ['archive', 'font', 'binary', 'file']],
    ] as const;
    const known = new Set<string>(groups.flatMap(([, values]) => [...values]));
    typeOptions.push(...types.options.filter(option => option.value === 'all'));
    for (const [id, values] of groups) {
      const children = types.options.filter(option => values.some(value => value === option.value) || (id === 'other' && option.value !== 'all' && !known.has(option.value))).map(option => ({ ...option, icon: <CategoryIcon name={RESOURCE_TYPES.find(type => type.id === option.value)?.icon ?? 'document'} className="size-4 shrink-0" /> }));
      if (children.length) typeOptions.push({ id: 'type-' + id, label: t('common:selection.groups.' + id), icon: <MediaIcon name="group" />, children });
    }
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-3" role="group" aria-label={t('media:ui.assetToolbar')}>
    <MediaSourceSwitch resourceLabels={resourceLabels} value={source} articleLabel={articleLabel} disabled={disabled} onChange={value => { close(); onSourceChange(value); }} />
    {types ? <label className="field-stack"><span className="sr-only">{t('messages:resources.typeFilter')}</span><SelectField label={t('messages:resources.typeFilter')} value={types.value} disabled={disabled} onChange={nextValue => types.onChange(nextValue)} options={typeOptions} /></label> : null}
    <div className="order-3 flex w-full min-w-0 items-center lg:order-none lg:w-auto lg:flex-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-clip py-1 md:gap-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        {selection ? <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t(resourceLabels ? 'messages:resources.bulkActions' : 'media:ui.bulkImageActions')}>
          <IconButton data-media-selection-trigger="true" icon={<MediaIcon name="select" />} tooltip={t(resourceLabels ? 'messages:resources.selectedHint' : 'media:templates.selectedHint', { count: selection.count })} aria-label={t(resourceLabels ? 'messages:resources.selectedLabel' : 'media:templates.selectedLabel', { count: selection.count })} aria-pressed={selection.active} aria-expanded={activeControl === 'selection'} disabled={disabled} onClick={() => toggle('selection')}>{selection.count ? <span className="absolute -top-1 -right-1 rounded-full bg-accent px-1 font-mono text-2xs text-action-text" aria-hidden="true">{selection.count}</span> : null}</IconButton>
          {selection.active ? <>
            <IconButton icon={<MediaIcon name="all" />} tooltip={t(resourceLabels ? 'messages:resources.selectAllImagesOnThisPage' : 'media:ui.selectAllImagesOnThisPage')} aria-label={t(resourceLabels ? 'messages:resources.selectAllOnPage' : 'media:ui.selectAllOnPage')} disabled={disabled || !selection.hasVisible} onClick={selection.onAll} />
            <IconButton icon={<MediaIcon name="close" />} tooltip={t('media:ui.cancelSelection')} aria-label={t(resourceLabels ? 'messages:resources.cancelImageSelection' : 'media:ui.cancelImageSelection')} disabled={disabled} onClick={selection.onCancel} />
            <span role="separator" aria-orientation="vertical" className="mx-1 h-6 border-l border-line" />
            <IconButton icon={<MediaIcon name="download" />} tooltip={t('messages:resources.downloadSelected')} disabled={disabled || !selection.count} onClick={selection.onDownload} />
            <IconButton icon={<MediaIcon name="use" />} tooltip={resourceLabels ? t('messages:resources.moveOrCopySelectedImages') : selection.count ? t('media:ui.moveOrCopySelectedImages') : t('media:ui.moveOrCopySelectImagesFirst')} aria-label={t(resourceLabels ? 'messages:resources.moveOrCopySelectedImages' : 'media:ui.moveOrCopySelectedImagesAlternative')} disabled={disabled || !selection.count} onClick={selection.onTransfer} />
            <IconButton icon={<MediaIcon name="delete" />} tone="danger" tooltip={selection.count ? t(resourceLabels ? 'messages:resources.deleteSelectedImages' : 'media:ui.deleteSelectedImages') : t('media:ui.deleteSelectedSelectImagesFirst')} aria-label={t(resourceLabels ? 'messages:resources.deleteSelectedImages' : 'media:ui.deleteSelectedImages')} disabled={disabled || !selection.count} onClick={selection.onDelete} />
          </> : null}
        </div> : null}
        <label className="field-stack min-w-20 flex-1"><span className="sr-only">{t(resourceLabels ? 'messages:resources.searchLabel' : 'media:ui.searchImageFilenameOrArticleTitle')}</span><input className="field" type="search" placeholder={source === 'article' ? t('media:ui.searchFilenameOrArticleTitle') : t('media:ui.searchFilename')} value={query} disabled={disabled} onChange={event => onQueryChange(event.target.value)} /></label>
        <IconPopover label={t(resourceLabels ? 'messages:resources.sorting' : 'media:ui.imageSorting')} tooltip={t('media:templates.sort', { key: sortLabel, order: preferences.descending ? t('media:ui.descending') : t('media:ui.ascending') })} icon={<MediaIcon name="sort" />} open={activeControl === 'sort'} disabled={disabled} onToggle={() => toggle('sort')} onClose={close}>
          {sorts.map(option => <div key={option.value} className="group/sort flex min-w-0 items-center gap-1">
            <button type="button" role="menuitemradio" aria-checked={preferences.sort === option.value} className={menuItem} onClick={() => { onPreferencesChange({ ...preferences, sort: option.value }); close(); }}><span className="w-3 shrink-0" aria-hidden="true">{preferences.sort === option.value ? '✓' : ''}</span><span>{option.label}</span></button>
            <IconButton icon={<span aria-hidden="true">{preferences.descending ? '↓' : '↑'}</span>} className="opacity-100 md:opacity-0 md:group-hover/sort:opacity-100 md:group-focus-within/sort:opacity-100 md:data-[current=true]:opacity-100 pointer-coarse:opacity-100" data-current={preferences.sort === option.value} tooltip={t('media:templates.orderHint', { key: option.label, order: preferences.descending ? t('media:ui.ascending') : t('media:ui.descending') })} aria-label={t('media:templates.orderLabel', { key: option.label, order: preferences.descending ? t('media:ui.ascending') : t('media:ui.descending') })} onClick={() => onPreferencesChange({ ...preferences, sort: option.value, descending: !preferences.descending })} />
          </div>)}
        </IconPopover>
        <IconPopover label={t(resourceLabels ? 'messages:resources.layout' : 'media:ui.imageLayout')} tooltip={preferences.columns === 1 ? t('media:ui.layoutHorizontalList') : t('media:templates.layout', { count: preferences.columns })} icon={<MediaIcon name="layout" />} open={activeControl === 'layout'} kind="dialog" disabled={disabled} onToggle={() => toggle('layout')} onClose={close}>
          <label className="grid gap-3 p-2"><span>{preferences.columns === 1 ? t('media:ui.horizontalList') : t('media:templates.columns', { count: preferences.columns })}</span><input type="range" min="1" max="4" step="1" value={preferences.columns} aria-label={t(resourceLabels ? 'messages:resources.perRow' : 'media:ui.imagesPerRow')} aria-valuetext={preferences.columns === 1 ? t('media:ui.horizontalList') : t('media:templates.columnsLabel', { count: preferences.columns })} className="w-full accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onChange={event => onPreferencesChange({ ...preferences, columns: Number(event.target.value) as MediaPreferences['columns'] })} /><span className="flex justify-between text-2xs text-muted"><span>{t('media:ui.list')}</span><span>{t('media:ui.4Columns')}</span></span></label>
        </IconPopover>
      </div>
    </div>
    {actions ? <div className="ml-auto flex shrink-0 items-center lg:ml-0">{actions}</div> : count !== undefined ? <span className="ml-auto shrink-0 text-xs text-muted lg:ml-0" role="status">{count}</span> : null}
  </div>;
}
