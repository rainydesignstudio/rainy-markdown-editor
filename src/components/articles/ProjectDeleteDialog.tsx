'use client';

import { ConfirmDialog } from '../global/ConfirmDialog';

import { useUITranslation } from '../global/UILocaleProvider';

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
    <ConfirmDialog titleId="project-delete-title" descriptionId="project-delete-description" role="alertdialog" onClose={onClose} dismissible={!busy} wide closeDisabled={busy}
      eyebrow={t('common:eyebrows.deleteProject')} title={t('dialogs:templates.deleteProject', { name })}
      cancel={{ label: t('common:actions.cancel'), autoFocus: true, disabled: busy, onClick: onClose }}
      confirm={{ label: busy ? t('dialogs:ui.savingAlternative') : t('dialogs:ui.deleteProject'), icon: 'delete', variant: 'danger', disabled: busy, onClick: onConfirm }}>
      <div className="dialog-content"><p id="project-delete-description">{t('dialogs:ui.projectArticlesMoveToUngroupedBodyCategoriesImages')}</p></div>
    </ConfirmDialog>
  );
}
