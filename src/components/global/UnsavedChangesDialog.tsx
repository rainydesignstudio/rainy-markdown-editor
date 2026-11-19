'use client';

import { ContentIcon } from './ContentIcon';

import { useUITranslation } from './UILocaleProvider';

import { useId, useRef, useState } from 'react';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from './DialogFrame';

type Props = {
  entries: Array<{ label: string; detail?: string }>;
  description: string;
  saveDisabled?: boolean;
  saveLabel?: string;
  onCancel: () => void;
  onContinue: () => void;
  onDiscard: () => void;
  onSave: () => Promise<boolean>;
};


export function UnsavedChangesDialog({ entries, description, saveDisabled = false, saveLabel, onCancel, onContinue, onDiscard, onSave }: Props) {
  const { t } = useUITranslation('dialogs');
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current || saveDisabled) return;
    savingRef.current = true;
    setSaving(true);
    setError(false);
    try {
      if (!await onSave()) setError(true);
    } catch {
      setError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const cancel = () => { if (!savingRef.current) onCancel(); };
  return (
    <DialogFrame titleId={`${id}-title`} descriptionId={`${id}-description`} role="alertdialog" dismissible={!saving} onClose={cancel}>
      <DialogHeader titleId={`${id}-title`} eyebrow={t('common:eyebrows.unsavedChanges')} title={t('dialogs:ui.unsavedChanges')} onClose={cancel} closeDisabled={saving} />
      <div className="dialog-content">
        <p id={`${id}-description`} className="text-sm text-muted">{description}</p>
        <div className="grid max-h-56 gap-2 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
          {entries.map((entry, index) => <div key={index} className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-list/50 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text"><ContentIcon name="edit" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-primary">{entry.label}</p>{entry.detail ? <p className="mt-1 break-words text-xs text-muted">{entry.detail}</p> : null}</div><span className="shrink-0 rounded-md border border-line px-2 py-1 text-2xs text-faint">{t('dialogs:ui.unsaved')}</span></div>)}
        </div>
        {error ? <p className="rounded-lg border border-danger/30 bg-list px-3 py-2 text-xs text-danger" role="alert">{t('dialogs:ui.saveIncomplete')}</p> : null}
        <DialogActions><div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
          <DialogButton icon="back" disabled={saving} onClick={() => { if (!savingRef.current) onContinue(); }}>{t('dialogs:ui.continueEditing')}</DialogButton>
          <DialogButton icon="delete" variant="danger" disabled={saving} onClick={() => { if (!savingRef.current) onDiscard(); }}>{t('dialogs:ui.discardChanges')}</DialogButton>
          <DialogButton icon="save" variant="primary" disabled={saveDisabled || saving} onClick={() => void save()}>{saving ? t('dialogs:ui.saving') : saveLabel ?? t('dialogs:ui.saveAndLeave')}</DialogButton>
        </div></DialogActions>
      </div>
    </DialogFrame>
  );
}
