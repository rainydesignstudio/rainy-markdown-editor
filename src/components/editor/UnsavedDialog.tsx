'use client';

import { useUITranslation } from '../global/UILocaleProvider';
import { formatProductMessage } from '../../lib/i18n/productMessages';

import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';

export function UnsavedDialog({ label, onCancel, onSave, onDiscard }: { label: string; onCancel: () => void; onSave: () => Promise<boolean>; onDiscard: () => void }) {
  const { t } = useUITranslation('dialogs');
  return <UnsavedChangesDialog entries={[{ label: t('dialogs:ui.currentManuscript'), detail: t('dialogs:ui.bodyAndArticleInformationHaveUnsavedChanges') }]} description={t('dialogs:templates.unsavedAction', { action: formatProductMessage(label, t) })} saveLabel={t('dialogs:ui.saveAndContinue')} onCancel={onCancel} onSave={onSave} onDiscard={onDiscard} />;
}
