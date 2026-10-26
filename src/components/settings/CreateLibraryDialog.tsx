'use client';

import { SelectField } from '../global/SelectField';
import { formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useRef, useState, type FormEvent } from 'react';
import type { LibraryCreationResult } from '../../hooks/useEditorController';
import { normalizeDataDirectoryName } from '../../lib/fileSystem';
import { DEFAULT_PLATFORM_PRESET_ID, PUBLIC_PLATFORM_PRESETS, type PlatformPresetId } from '../../lib/article-format/library';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

function LibraryIcon({ cancel = false }: { cancel?: boolean }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {cancel ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M3 7V4h6l2 3h10v13H3V7Zm9 4v6m-3-3h6" />}
  </svg>;
}

export function CreateLibraryDialog({ onCreate, onClose }: { onCreate: (name: string, presetId: PlatformPresetId) => Promise<LibraryCreationResult>; onClose: () => void }) {
  const { t } = useUITranslation('dialogs');
  const [name, setName] = useState('');
  const [presetId, setPresetId] = useState<PlatformPresetId>(DEFAULT_PLATFORM_PRESET_ID);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ label: string; error: boolean } | null>(null);
  const creatingRef = useRef(false);
  let normalizedName = '', nameIssue = '';
  if (name.trim()) {
    try { normalizedName = normalizeDataDirectoryName(name); }
    catch (error) { nameIssue = error instanceof Error ? error.message : String(error); }
  }
  const close = () => { if (!creatingRef.current) onClose(); };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingRef.current || !normalizedName || nameIssue) return;
    creatingRef.current = true;
    setCreating(true);
    setFeedback(null);
    try {
      const result = await onCreate(normalizedName, presetId);
      if (result.status === 'created') onClose();
      else if (result.status === 'error') setFeedback({ label: result.message, error: true });
    } catch (error) {
      setFeedback({ label: error instanceof Error ? error.message : String(error), error: true });
    } finally { creatingRef.current = false; setCreating(false); }
  };

  return <DialogFrame titleId="create-library-title" descriptionId="create-library-description" onClose={close} dismissible={!creating}>
    <DialogHeader titleId="create-library-title" eyebrow={t('common:eyebrows.createLocalLibrary')} title={t('dialogs:ui.newLibrary')} onClose={close} closeDisabled={creating} />
    <form onSubmit={create} aria-busy={creating}>
      <div className="dialog-content">
        <label className="field-stack" htmlFor="new-library-name">
          <span className="field-label">{t('dialogs:ui.libraryName')}</span>
          <input id="new-library-name" name="library-name" className="field" value={name} maxLength={80} onChange={event => { setName(event.target.value); setFeedback(null); }} placeholder={t('dialogs:ui.exampleMyManuscripts')} autoFocus autoComplete="off" spellCheck={false} required disabled={creating} aria-invalid={Boolean(nameIssue)} aria-describedby={nameIssue ? 'create-library-name-error' : 'create-library-name-help'} />
          <span id="create-library-name-help" className="text-xs text-faint">{t('dialogs:ui.usedAsTheNewFolderNameUpTo')}</span>
          {nameIssue ? <span id="create-library-name-error" className="text-xs text-danger" role="alert">{formatProductMessage(nameIssue, t)}</span> : null}
        </label>
        <label className="field-stack" htmlFor="new-library-preset">
          <span className="field-label">{t('dialogs:ui.validationAndAlgorithmTemplate')}</span>
          <SelectField label={t('dialogs:ui.validationAndAlgorithmTemplate')} id="new-library-preset" name="library-preset" value={presetId} disabled={creating} aria-describedby="new-library-preset-help" onChange={nextValue => { setPresetId(nextValue as PlatformPresetId); setFeedback(null); }} options={[...(PUBLIC_PLATFORM_PRESETS.map(preset => ({ value: preset.id, label: t('dialogs:platformPresets.' + preset.id) })) ?? [])]} />
          <span id="new-library-preset-help" className="text-xs text-faint">{t('dialogs:ui.newLibraryPresetHelp')}</span>
        </label>
        <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-list/50 p-4" aria-label={t('dialogs:ui.libraryLocationPreview')}>
          <p className="text-xs text-muted">{t('dialogs:ui.creationLocation')}</p>
          <div className="flex min-w-0 items-start gap-2 text-sm"><span className="mt-0.5 text-accent-text"><LibraryIcon /></span><p className="min-w-0 break-all"><span className="text-muted">{t('dialogs:ui.chosenParentDirectory')} </span><strong className="font-medium text-primary">{normalizedName || t('dialogs:ui.libraryName')}</strong></p></div>
          <p id="create-library-description" className="text-xs text-muted">{t('dialogs:ui.chooseTheParentInTheSystemDialogNext')}</p>
        </div>
        {feedback ? <p className="status-copy" data-tone={feedback.error ? 'error' : 'neutral'} role={feedback.error ? 'alert' : 'status'}>{formatProductMessage(feedback, t)}</p> : null}
      </div>
      <DialogFooter><DialogActions>
        <DialogButton disabled={creating} onClick={close}><LibraryIcon cancel />{t('common:actions.cancel')}</DialogButton>
        <DialogButton type="submit" variant="primary" disabled={creating || !normalizedName || Boolean(nameIssue)}><LibraryIcon />{creating ? t('dialogs:ui.creating') : t('dialogs:ui.chooseParentAndCreate')}</DialogButton>
      </DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
