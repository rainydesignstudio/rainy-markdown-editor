'use client';

import { formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import type { ReactNode } from 'react';
import type { SnippetCategory, SnippetCategoryIcon } from '../../lib/types';
import { SNIPPET_CATEGORY_ICONS } from '../../lib/snippetCategoryIcons';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { PanelHeading } from '../global/CollapsiblePanel';

export function CategoryIcon({ name = 'snippet', className = 'size-4 shrink-0' }: { name?: SnippetCategoryIcon; className?: string }) {
  const icon = SNIPPET_CATEGORY_ICONS.find(item => item.id === name) ?? SNIPPET_CATEGORY_ICONS[0];
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon.path} /></svg>;
}

export function IconChoiceGrid({ name, value, onChange }: {
  name: string; value: SnippetCategoryIcon; onChange: (icon: SnippetCategoryIcon) => void;
}) {
  const { t } = useUITranslation('dialogs');
  return <div className="grid grid-cols-4 gap-2">
    {SNIPPET_CATEGORY_ICONS.map(icon => <label key={icon.id} title={t(`dialogs:icons.${icon.id}`)} className="flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-line bg-panel text-muted hover:bg-hover has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-accent-text has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-50">
      <input type="radio" name={name} className="sr-only" value={icon.id} aria-label={t(`dialogs:icons.${icon.id}`)} checked={value === icon.id} onChange={() => onChange(icon.id)} /><CategoryIcon name={icon.id} className="size-5 shrink-0" />
    </label>)}
  </div>;
}

export function IconSelectionFieldset({ name, label, hint, value, disabled, previewLabel, onChange, children }: {
  name: string; label: string; hint: string; value: SnippetCategoryIcon; disabled: boolean;
  previewLabel: string; onChange: (icon: SnippetCategoryIcon) => void; children: ReactNode;
}) {
  const { t } = useUITranslation('dialogs');
  return <fieldset disabled={disabled} className="min-w-0 rounded-xl border border-line bg-list/50 p-4">
    <legend className="field-label px-2">{label}</legend>
    <p className="mb-3 text-xs text-muted">{hint}</p>
    <IconChoiceGrid name={name} value={value} onChange={onChange} />
    <p className="mt-3 text-xs text-faint">{t('dialogs:templates.iconCurrent', { icon: t(`dialogs:icons.${value}`), preview: previewLabel })}</p>
    <div className="mt-3 min-w-0">{children}</div>
  </fieldset>;
}

export function SnippetCategoryDialog({ value, existing, kind = 'snippets', count, busy, error, onChange, onClose, onSave }: {
  value: SnippetCategory; existing: boolean; kind?: 'snippets' | 'templates'; count: number; busy: boolean; error: string;
  onChange: (value: SnippetCategory) => void; onClose: () => void; onSave: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const update = (patch: Partial<SnippetCategory>) => onChange({ ...value, ...patch });
  return <DialogFrame titleId="snippet-category-title" descriptionId="snippet-category-description" className="max-w-3xl" dismissible={!busy} onClose={onClose}>
    <DialogHeader titleId="snippet-category-title" eyebrow={kind === 'snippets' ? t('common:eyebrows.snippetCategory') : t('common:eyebrows.templateCategory')} title={existing ? t('dialogs:ui.editCategory') : t('dialogs:ui.newCategory')} closeDisabled={busy} onClose={onClose} />
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <div className="grid min-w-0 gap-6 p-4 md:grid-cols-5">
        <div className="grid min-w-0 content-start gap-4 md:col-span-3">
          <p id="snippet-category-description" className="text-sm text-muted">{t('dialogs:templates.categoryIntro', { type: kind === 'snippets' ? t('dialogs:ui.reusableSnippets') : t('dialogs:ui.starterTemplates') })}</p>
          <label className="field-stack"><span className="field-label">{t('dialogs:ui.categoryName')}</span><input name="category-name" className="field" value={value.name} maxLength={80} required disabled={busy} onChange={event => update({ name: event.target.value })} /></label>
          <label className="field-stack"><span className="field-label">{t('dialogs:ui.description')}</span><textarea name="category-description" className="field min-h-24 resize-y" value={value.description} maxLength={240} disabled={busy} placeholder={t('dialogs:templates.categoryDescription', { type: kind === 'snippets' ? t('dialogs:ui.snippets') : t('dialogs:ui.starterTemplates') })} onChange={event => update({ description: event.target.value })} /></label>
          <div className="grid min-w-0 grid-cols-3 gap-3">
            <label className="field-stack col-span-2 min-w-0"><span className="field-label">{t('dialogs:ui.directoryName')}</span><input name="category-directory" className="field min-w-0 font-mono text-xs" value={value.id} required pattern="[a-z0-9](?:[a-z0-9]|-){0,47}" maxLength={48} disabled={busy} onChange={event => update({ id: event.target.value })} /></label>
            <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.order')}</span><input name="category-order" className="field min-w-0" type="number" min={0} max={10000} step={1} required value={value.order} disabled={busy} onChange={event => update({ order: Number(event.target.value) })} /></label>
          </div>
          <p className="text-xs text-faint">{t('dialogs:ui.savingUpdatesTheDirectoryAndIndexTogetherLower')}</p>
        </div>
        <aside className="min-w-0 md:col-span-2 md:border-l md:border-line md:pl-6">
          <IconSelectionFieldset name="category-icon" label={t('dialogs:ui.categoryIcon')} hint={t('dialogs:templates.categoryUse', { type: kind === 'snippets' ? t('dialogs:ui.snippets') : t('dialogs:ui.starterTemplates') })} value={value.icon ?? 'snippet'} disabled={busy} previewLabel={t('dialogs:ui.categoryPreview')} onChange={icon => update({ icon })}>
            <div className="collapsible-panel"><PanelHeading title={value.name.trim() || t('dialogs:ui.categoryName')} icon={<CategoryIcon name={value.icon} />} count={count} expanded={false} disabled className="cursor-default" />
              {value.description.trim() ? <p className="px-4 pb-4 text-xs text-muted break-words">{value.description}</p> : null}
            </div>
          </IconSelectionFieldset>
        </aside>
      </div>
      <DialogFooter>{error ? <p className="mb-3 text-sm text-danger" role="alert">{formatProductMessage(error, t)}</p> : null}<DialogActions>
        <DialogButton disabled={busy} onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>{t('common:actions.cancel')}</DialogButton>
        <DialogButton type="submit" variant="primary" disabled={busy}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /></svg>{busy ? t('dialogs:ui.saving') : t('dialogs:ui.saveCategory')}</DialogButton>
      </DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
