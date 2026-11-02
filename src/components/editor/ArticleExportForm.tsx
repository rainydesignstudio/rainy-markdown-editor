'use client';

import type { ReactNode } from 'react';
import { useUITranslation } from '../global/UILocaleProvider';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { ContentIcon } from '../global/ContentIcon';

export type ExportChoice = { id: string; title: string; extension?: string; detail?: string; disabled?: boolean; reason?: string };

/** The existing export dialog view, shared by legacy and declared package actions. */
export function ArticleExportForm({ choices, selected, onSelect, filename, dirty = false, busy, disabled, error, focusActive = true, onSubmit, onClose, continuation, review, children }: {
  choices: ExportChoice[]; selected: string; onSelect: (id: string) => void;
  filename?: { base: string; name?: string; onChange: (value: string) => void };
  dirty?: boolean; busy: boolean; disabled: boolean; error: string;
  focusActive?: boolean; onSubmit: () => void; onClose: () => void;
  continuation?: { label: string; run: () => void }; review?: ReactNode; children?: ReactNode;
}) {
  const { t } = useUITranslation('dialogs');
  const action = choices.find(item => item.id === selected);
  return <DialogFrame titleId="article-export-title" descriptionId="article-export-description" onClose={onClose} focusActive={focusActive} dismissible={!busy} className="flex min-h-0 max-w-2xl flex-col overflow-hidden">
    <DialogHeader titleId="article-export-title" eyebrow={t('common:eyebrows.exportArticle')} title={t('dialogs:ui.exportArticle')} onClose={onClose} closeDisabled={busy} />
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      <div className="grid min-h-0 gap-4 overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        <p id="article-export-description" className="text-sm text-muted">{t('dialogs:ui.exportTheCurrentDraft')}{dirty ? t('dialogs:ui.includingUnsavedChanges') : ''}{t('dialogs:ui.thisDoesNotSaveOrModifyTheLibrary')}</p>
        {filename ? <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.downloadFilename')}</span><input className="field" value={filename.base} maxLength={80} onChange={event => filename.onChange(event.target.value)} disabled={busy} />{filename.name ? <span className="break-all text-xs text-faint">{t('dialogs:templates.downloadAs', { name: filename.name })}</span> : null}</label> : null}
        <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-semibold text-primary">{t('dialogs:ui.format')}</legend>
          {choices.map(item => <label key={item.id} title={item.reason || undefined} tabIndex={item.disabled ? 0 : undefined} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel p-3 hover:border-accent-line has-checked:border-accent-line has-checked:bg-accent-soft has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <input className="mt-1 accent-accent" type="radio" name="article-export-format" value={item.id} checked={selected === item.id} onChange={() => { if (!item.disabled) onSelect(item.id); }} disabled={busy || item.disabled} />
            <span className="grid min-w-0 gap-1"><strong className="break-words text-sm font-semibold text-primary">{item.title}{item.extension ? <> <span className="font-mono text-xs font-normal text-muted">.{item.extension}</span></> : null}</strong>{item.detail ? <span className="break-words text-xs text-muted">{item.detail}</span> : null}</span>
          </label>)}
          {!choices.length ? <p className="text-sm text-muted">{t('messages:formatPackage.noActions')}</p> : null}
        </fieldset>
        {children}
        {error ? <p className="rounded-lg border border-danger/30 bg-danger-surface p-3 text-sm text-danger" role="alert">{error}</p> : null}
        {review}
      </div>
      <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}><ContentIcon name="close" />{t('common:actions.cancel')}</DialogButton>
        {continuation ? <DialogButton variant="primary" disabled={busy || disabled} onClick={continuation.run}>{continuation.label}</DialogButton> : <DialogButton type="submit" variant="primary" disabled={busy || disabled || !action}>{busy ? t('dialogs:ui.generating') : t('dialogs:templates.export', { name: action?.title ?? '' })}</DialogButton>}
      </DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
