'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import type { ReactNode } from 'react';
import type { MediaPreferences } from '../../hooks/useMediaPreferences';
import { IconPopover } from '../global/IconPopover';
import { IconButton } from '../global/IconButton';
import { MediaIcon, MediaSourceSwitch } from './MediaGallery';

export type MediaControl = 'selection' | 'group' | 'article' | 'sort' | 'layout' | null;
type Option = { value: string; label: string };
type Filter = { value: string; options: Option[]; onChange: (value: string) => void };
type Selection = { active: boolean; count: number; hasVisible: boolean; onEnable: () => void; onAll: () => void; onTransfer: () => void; onDelete: () => void; onCancel: () => void };
const menuItem = 'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-checked:bg-accent-soft aria-checked:text-accent-text';

function FilterOptions({ filter, onClose }: { filter: Filter; onClose: () => void }) {
  const { t } = useUITranslation('media');
  return filter.options.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={filter.value === option.value} className={menuItem} onClick={() => { filter.onChange(option.value); onClose(); }}><span className="w-3 shrink-0" aria-hidden="true">{filter.value === option.value ? '✓' : ''}</span><span className="min-w-0 truncate">{option.label}</span></button>);
}

export function MediaToolbar({ source, onSourceChange, articleLabel, query, onQueryChange, preferences, onPreferencesChange, activeControl, onControlChange, disabled, count, groups, articles, selection, actions }: {
  source: 'shared' | 'article'; onSourceChange: (value: 'shared' | 'article') => void;
  articleLabel?: string; query: string; onQueryChange: (value: string) => void;
  preferences: MediaPreferences; onPreferencesChange: (value: MediaPreferences) => void;
  activeControl: MediaControl; onControlChange: (value: MediaControl) => void;
  disabled: boolean; count?: ReactNode; groups?: Filter; articles?: Filter; selection?: Selection; actions?: ReactNode;
}) {
  const { t } = useUITranslation('media');
  const close = () => onControlChange(null);
  const toggle = (name: NonNullable<MediaControl>) => { if (disabled) return; if (name === 'selection') selection?.onEnable(); onControlChange(activeControl === name ? null : name); };
  const sorts: Array<{ value: MediaPreferences['sort']; label: string }> = [{ value: 'name', label: t('media:ui.filename') }, { value: 'modified', label: t('media:ui.modifiedTime') }, { value: 'size', label: t('media:ui.fileSize') }];
  const sortLabel = sorts.find(option => option.value === preferences.sort)!.label;
  return <div className="flex min-w-0 flex-wrap items-center gap-3" role="group" aria-label={t('media:ui.assetToolbar')}>
    <MediaSourceSwitch value={source} articleLabel={articleLabel} disabled={disabled} onChange={value => { close(); onSourceChange(value); }} />
    <div className="order-3 flex w-full min-w-0 items-center lg:order-none lg:w-auto lg:flex-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-clip py-1 md:gap-2 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        {selection ? <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('media:ui.bulkImageActions')}>
          <IconButton icon={<MediaIcon name="select" />} tooltip={t('media:templates.selectedHint', { count: selection.count })} aria-label={t('media:templates.selectedLabel', { count: selection.count })} aria-pressed={selection.active} aria-expanded={activeControl === 'selection'} disabled={disabled} onClick={() => toggle('selection')}>{selection.count ? <span className="absolute -top-1 -right-1 rounded-full bg-accent px-1 font-mono text-2xs text-action-text" aria-hidden="true">{selection.count}</span> : null}</IconButton>
          {activeControl === 'selection' ? <>
            <IconButton icon={<MediaIcon name="all" />} tooltip={t('media:ui.selectAllImagesOnThisPage')} aria-label={t('media:ui.selectAllOnPage')} disabled={disabled || !selection.hasVisible} onClick={selection.onAll} />
            <IconButton icon={<MediaIcon name="use" />} tooltip={selection.count ? t('media:ui.moveOrCopySelectedImages') : t('media:ui.moveOrCopySelectImagesFirst')} aria-label={t('media:ui.moveOrCopySelectedImagesAlternative')} disabled={disabled || !selection.count} onClick={selection.onTransfer} />
            <IconButton icon={<MediaIcon name="delete" />} tone="danger" tooltip={selection.count ? t('media:ui.deleteSelectedImages') : t('media:ui.deleteSelectedSelectImagesFirst')} aria-label={t('media:ui.deleteSelectedImages')} disabled={disabled || !selection.count} onClick={selection.onDelete} />
            <IconButton icon={<MediaIcon name="close" />} tooltip={t('media:ui.cancelSelection')} aria-label={t('media:ui.cancelImageSelection')} disabled={disabled} onClick={selection.onCancel} />
          </> : null}
        </div> : null}
        <label className="field-stack min-w-20 flex-1"><span className="sr-only">{t('media:ui.searchImageFilenameOrArticleTitle')}</span><input className="field" type="search" placeholder={articles ? t('media:ui.searchFilenameOrArticleTitle') : t('media:ui.searchFilename')} value={query} disabled={disabled} onChange={event => onQueryChange(event.target.value)} /></label>
        {source === 'article' && groups ? <IconPopover label={t('media:ui.projectGroup')} tooltip={t('media:templates.groupFilter', { name: groups.options.find(option => option.value === groups.value)?.label ?? t('media:ui.allGroups') })} icon={<MediaIcon name="group" />} open={activeControl === 'group'} disabled={disabled} onToggle={() => toggle('group')} onClose={close}><FilterOptions filter={groups} onClose={close} /></IconPopover> : null}
        {source === 'article' && articles ? <IconPopover label={t('media:ui.article')} tooltip={t('media:templates.articleFilter', { name: articles.options.find(option => option.value === articles.value)?.label ?? t('media:ui.allArticles') })} icon={<MediaIcon name="article" />} open={activeControl === 'article'} disabled={disabled} onToggle={() => toggle('article')} onClose={close}><FilterOptions filter={articles} onClose={close} /></IconPopover> : null}
        <IconPopover label={t('media:ui.imageSorting')} tooltip={t('media:templates.sort', { key: sortLabel, order: preferences.descending ? t('media:ui.descending') : t('media:ui.ascending') })} icon={<MediaIcon name="sort" />} open={activeControl === 'sort'} disabled={disabled} onToggle={() => toggle('sort')} onClose={close}>
          {sorts.map(option => <div key={option.value} className="group/sort flex min-w-0 items-center gap-1">
            <button type="button" role="menuitemradio" aria-checked={preferences.sort === option.value} className={menuItem} onClick={() => { onPreferencesChange({ ...preferences, sort: option.value }); close(); }}><span className="w-3 shrink-0" aria-hidden="true">{preferences.sort === option.value ? '✓' : ''}</span><span>{option.label}</span></button>
            <IconButton icon={<span aria-hidden="true">{preferences.descending ? '↓' : '↑'}</span>} className="opacity-100 md:opacity-0 md:group-hover/sort:opacity-100 md:group-focus-within/sort:opacity-100 md:data-[current=true]:opacity-100 pointer-coarse:opacity-100" data-current={preferences.sort === option.value} tooltip={t('media:templates.orderHint', { key: option.label, order: preferences.descending ? t('media:ui.ascending') : t('media:ui.descending') })} aria-label={t('media:templates.orderLabel', { key: option.label, order: preferences.descending ? t('media:ui.ascending') : t('media:ui.descending') })} onClick={() => onPreferencesChange({ ...preferences, sort: option.value, descending: !preferences.descending })} />
          </div>)}
        </IconPopover>
        <IconPopover label={t('media:ui.imageLayout')} tooltip={preferences.columns === 1 ? t('media:ui.layoutHorizontalList') : t('media:templates.layout', { count: preferences.columns })} icon={<MediaIcon name="layout" />} open={activeControl === 'layout'} kind="dialog" disabled={disabled} onToggle={() => toggle('layout')} onClose={close}>
          <label className="grid gap-3 p-2"><span>{preferences.columns === 1 ? t('media:ui.horizontalList') : t('media:templates.columns', { count: preferences.columns })}</span><input type="range" min="1" max="4" step="1" value={preferences.columns} aria-label={t('media:ui.imagesPerRow')} aria-valuetext={preferences.columns === 1 ? t('media:ui.horizontalList') : t('media:templates.columnsLabel', { count: preferences.columns })} className="w-full accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onChange={event => onPreferencesChange({ ...preferences, columns: Number(event.target.value) as MediaPreferences['columns'] })} /><span className="flex justify-between text-2xs text-muted"><span>{t('media:ui.list')}</span><span>{t('media:ui.4Columns')}</span></span></label>
        </IconPopover>
      </div>
    </div>
    {actions ? <div className="ml-auto flex shrink-0 items-center lg:ml-0">{actions}</div> : count !== undefined ? <span className="ml-auto shrink-0 text-xs text-muted lg:ml-0" role="status">{count}</span> : null}
  </div>;
}
