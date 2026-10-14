'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function ProjectDeleteDialog({
  name,
  busy,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  return (
    <DialogFrame titleId="project-delete-title" descriptionId="project-delete-description" role="alertdialog" onClose={onClose} dismissible={!busy} wide>
      <DialogHeader titleId="project-delete-title" eyebrow={t('common:eyebrows.deleteProject')} title={t('dialogs:templates.deleteProject', { name: name })} onClose={onClose} closeDisabled={busy} />
      <div className="grid gap-4 p-4">
        <p id="project-delete-description">{t('dialogs:ui.projectArticlesMoveToUngroupedBodyCategoriesImages')}</p>
        <DialogActions><DialogButton autoFocus disabled={busy} onClick={onClose}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" disabled={busy} onClick={onConfirm}>{busy ? t('dialogs:ui.savingAlternative') : t('dialogs:ui.deleteProject')}</DialogButton></DialogActions>
      </div>
    </DialogFrame>
  );
}
