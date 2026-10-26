'use client';

import { SelectField } from '../global/SelectField';
import { formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import type { ArticleMeta, ArticleSnippet, SnippetCategory, SnippetCategoryIcon } from '../../lib/types';
import { isSnippetCategoryIcon } from '../../lib/snippetCategoryIcons';
import { CategoryIcon, IconSelectionFieldset } from './SnippetCategoryDialog';

export type TemplateMetadataInputs = Partial<Record<'title' | 'description' | 'author' | 'categories', string>>;

export function ContentMetadataEditor({ snippet, metadata, inputs, fileId, fileError, creating, creationSavesContent = false, categoryId, categories, onCategoryChange, disabled, invalid, onFileIdChange, onSnippetChange, onMetadataChange, onTemplateIconChange }: {
  snippet?: ArticleSnippet; metadata?: ArticleMeta; inputs?: TemplateMetadataInputs;
  fileId: string; fileError?: string; creating: boolean; creationSavesContent?: boolean; onFileIdChange: (value: string) => void;
  categoryId?: string; onCategoryChange: (id: string | undefined) => void;
  categories: SnippetCategory[]; disabled: boolean; invalid: boolean;
  onSnippetChange: (patch: Partial<ArticleSnippet>) => void;
  onMetadataChange: (field: keyof TemplateMetadataInputs, value: string) => void;
  onTemplateIconChange: (icon: SnippetCategoryIcon) => void;
}) {
  const { t } = useUITranslation('dialogs');
  const rawTemplateIcon = metadata?.templateIcon;
  const templateIcon = isSnippetCategoryIcon(rawTemplateIcon) ? rawTemplateIcon : 'document';
  const fileField = <div className="grid min-w-0 gap-1.5">
        <label className="min-w-0" htmlFor="content-file-name"><span className="field-label">{t('dialogs:ui.filename')}</span></label>
        <div className="flex min-w-0 items-center gap-2">
          <input id="content-file-name" name="content-file-name" className="field min-w-0 flex-1 font-mono text-xs" value={fileId} maxLength={48} pattern="[a-z0-9](?:[a-z0-9]|-){0,47}" placeholder={snippet ? 'my-snippet' : 'my-template'} required autoComplete="off" spellCheck={false} disabled={disabled} aria-invalid={Boolean(fileError)} aria-describedby="content-file-help" onChange={event => onFileIdChange(event.target.value)} />
          <span className="shrink-0 font-mono text-xs text-faint">{snippet ? '.json' : '.md'}</span>
        </div>
        <p id="content-file-help" className="text-xs text-muted">{t('dialogs:ui.lowercaseLettersDigitsAndHyphensUpTo48')}{creating ? creationSavesContent ? t('dialogs:ui.theFileIsWrittenWhenCreatingTheTemplate') : t('dialogs:ui.theFileIsCreatedOnTheFirstContent') : t('dialogs:ui.savingInformationAlsoRenamesTheFile')}</p>
        {fileError ? <p className="text-xs text-danger" role="alert">{formatProductMessage(fileError, t)}</p> : null}
      </div>;
  if (snippet) return <div className="grid min-w-0 gap-6 md:grid-cols-5">
    <div className="grid min-w-0 content-start gap-4 md:col-span-3">
      <p className="text-sm text-muted">{t('dialogs:ui.nameCategoryAndTriggerHelpYouFindAnd')}</p>
      {fileField}
      <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.name')}</span><input name="snippet-name" className="field" value={snippet.name} maxLength={80} onChange={event => onSnippetChange({ name: event.target.value })} disabled={disabled} required /></label>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.category')}</span><SelectField label={t('dialogs:ui.category')} name="snippet-category" value={categoryId ?? ''} onChange={nextValue => onCategoryChange(nextValue || undefined)} disabled={disabled} options={[{ value: "", label: t('dialogs:ui.chooseACategory'), disabled: Boolean(categoryId) }, ...(categories.map(category => ({ value: category.id, label: category.name })) ?? [])]} /></label>
        <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.trigger')}</span><input name="snippet-trigger" className="field font-mono text-xs" value={snippet.trigger} placeholder="//my-snippet" onChange={event => onSnippetChange({ trigger: event.target.value })} spellCheck={false} disabled={disabled} required /></label>
      </div>
    </div>
    <aside className="min-w-0 md:col-span-2 md:border-l md:border-line md:pl-6">
      <IconSelectionFieldset name="snippet-icon" label={t('dialogs:ui.snippetIcon')} hint={t('dialogs:ui.usedInTheSnippetListAndEditorInsert')} value={snippet.icon ?? 'snippet'} disabled={disabled} previewLabel={t('dialogs:ui.defaultPreview')} onChange={icon => onSnippetChange({ icon })}>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-list/50 p-3 text-sm font-semibold text-primary" aria-label={t('dialogs:ui.defaultSnippetListPreview')}>
          <CategoryIcon name={snippet.icon} /><span className="min-w-0 truncate">{snippet.name.trim() || t('dialogs:ui.untitledSnippet')}</span>
        </div>
      </IconSelectionFieldset>
    </aside>
    <label className="field-stack min-w-0 md:col-span-5"><span className="field-label">{t('dialogs:ui.description')}</span><textarea name="snippet-description" className="field min-h-24 resize-y" value={snippet.description} maxLength={240} placeholder={t('dialogs:ui.describeHowToUseThisContent')} onChange={event => onSnippetChange({ description: event.target.value })} disabled={disabled} /></label>
    {creating ? <p className="text-xs text-muted md:col-span-5">{t('dialogs:ui.confirmInformationThenContinueEditingSaveContentWrites')}</p> : null}
  </div>;
  if (!metadata) return null;
  return <div className="grid min-w-0 gap-6 md:grid-cols-5">
    <div className="grid min-w-0 content-start gap-4 md:col-span-3">
      {fileField}
      <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.headings')}</span><input name="template-title" className="field" value={inputs?.title ?? metadata.title} onChange={event => onMetadataChange('title', event.target.value)} disabled={disabled || invalid} /></label>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.templateCategory')}</span><SelectField label={t('dialogs:ui.templateCategory')} name="template-category" value={categoryId ?? ''} onChange={nextValue => onCategoryChange(nextValue || undefined)} disabled={disabled} options={[{ value: "", label: t('dialogs:ui.chooseACategory'), disabled: Boolean(categoryId) }, ...(categories.map(category => ({ value: category.id, label: category.name })) ?? [])]} /></label>
        <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.author')}</span><input name="template-author" className="field" value={inputs?.author ?? metadata.author} onChange={event => onMetadataChange('author', event.target.value)} disabled={disabled || invalid} /></label>
      </div>
      <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.articleCategories')}</span><input name="template-categories" className="field" value={inputs?.categories ?? metadata.categories.join(', ')} placeholder={t('dialogs:ui.separateCategoriesWithCommasAlternative')} onChange={event => onMetadataChange('categories', event.target.value)} disabled={disabled || invalid} /></label>
    </div>
    <aside className="min-w-0 md:col-span-2 md:border-l md:border-line md:pl-6">
      <IconSelectionFieldset name="template-icon" label={t('dialogs:ui.starterTemplateIcon')} hint={t('dialogs:ui.usedInTheTemplateListAndStarterSelector')} value={templateIcon} disabled={disabled || invalid} previewLabel={t('dialogs:ui.defaultPreview')} onChange={onTemplateIconChange}>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-list/50 p-3 text-sm font-semibold text-primary" aria-label={t('dialogs:ui.defaultStarterTemplateListPreview')}>
          <CategoryIcon name={templateIcon} /><span className="min-w-0 truncate">{(inputs?.title ?? metadata.title).trim() || t('dialogs:ui.untitledStarterTemplate')}</span>
        </div>
      </IconSelectionFieldset>
    </aside>
    <label className="field-stack min-w-0 md:col-span-5"><span className="field-label">{t('dialogs:ui.summary')}</span><textarea name="template-description" className="field min-h-24 resize-y" value={inputs?.description ?? metadata.description} placeholder={t('dialogs:ui.describeThisStarterStructureSPurpose')} onChange={event => onMetadataChange('description', event.target.value)} disabled={disabled || invalid} /></label>
    {creating ? <p className="text-xs text-muted md:col-span-5">{creationSavesContent ? t('dialogs:ui.creationWritesTheCurrentBodyAndInformationTo') : t('dialogs:ui.confirmInformationThenContinueEditingSaveContentWrites')}</p> : null}
  </div>;
}
