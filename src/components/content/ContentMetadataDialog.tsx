'use client';

import { formatProductMessage, type ProductMessageInfo } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import type { ReactNode } from 'react';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function ContentMetadataDialog({ kind, creating, busy, saveDisabled, submitLabel, shortcutEnabled = false, onShortcut, onValidate, validationDisabled = false, validating = false, status, statusTone = 'success', error, children, onClose, onSave }: {
  kind: 'snippets' | 'templates'; busy: boolean;
  creating: boolean; submitLabel?: string; shortcutEnabled?: boolean;
  onShortcut?: () => void; onValidate?: () => void; validationDisabled?: boolean; validating?: boolean;
  status?: string | ProductMessageInfo; statusTone?: 'warning' | 'success';
  saveDisabled: boolean; error?: string | ProductMessageInfo | { message: string }; children: ReactNode; onClose: () => void; onSave: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const snippet = kind === 'snippets';
  return <DialogFrame titleId="content-information-title" descriptionId="content-information-description" onClose={onClose} dismissible={!busy} className="flex min-h-0 max-w-3xl flex-col overflow-hidden">
    <DialogHeader titleId="content-information-title" eyebrow={snippet ? t('common:eyebrows.snippetInformation') : t('common:eyebrows.templateInformation')} title={snippet ? t('dialogs:ui.snippetInformation') : t('dialogs:ui.starterTemplateInformation')} onClose={onClose} closeDisabled={busy} />
    <form id="content-information-form" className="flex min-h-0 flex-col" aria-label={snippet ? t('dialogs:ui.editSnippetInformation') : t('dialogs:ui.editStarterTemplateInformation')} onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!saveDisabled && !busy) onSave(); }} onKeyDown={event => {
      if (!shortcutEnabled || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat || event.nativeEvent.isComposing || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) { if (onShortcut) onShortcut(); else if (!saveDisabled) onSave(); }
    }}>
      <div className="min-h-0 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        <div className="min-w-0 p-4">
          <p id="content-information-description" className="sr-only">{snippet ? t('dialogs:ui.editTheSnippetFilenameNameCategoryTriggerIcon') : t('dialogs:ui.editTheStarterFilenameTitleCategoryAuthorIcon')}</p>
          {children}{error ? <p className="mt-4 text-sm text-danger" role="alert">{formatProductMessage(error, t)}</p> : status ? <p className={`mt-4 text-sm ${statusTone === 'warning' ? 'text-warning' : 'text-success'}`} role="status">{formatProductMessage(status, t)}</p> : null}
        </div>
      </div>
      <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>{t('common:actions.cancel')}</DialogButton>{onValidate ? <DialogButton disabled={busy || validationDisabled} onClick={onValidate}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12 4 4L19 6" /></svg>{validating ? t('dialogs:ui.validating') : t('dialogs:ui.validate')}</DialogButton> : null}<DialogButton type="submit" variant="primary" aria-keyshortcuts="Meta+S Control+S" title={t('dialogs:templates.shortcut', { action: submitLabel ?? (creating ? t('dialogs:ui.confirmInformation') : t('dialogs:ui.saveInformation')) })} disabled={saveDisabled || busy}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h13l3 3v13H4V4ZM8 4v6h8V4M8 20v-6h8v6" /></svg>{busy && !validating ? t('dialogs:ui.saving') : submitLabel ?? (creating ? t('dialogs:ui.confirmInformation') : t('dialogs:ui.saveInformation'))}</DialogButton></DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
