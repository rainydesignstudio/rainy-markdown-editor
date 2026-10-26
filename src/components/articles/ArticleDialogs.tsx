'use client';

import { SelectField } from '../global/SelectField';
import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { formatUIMonth } from '../../lib/i18n/formatters';

import { monthKey } from '../../lib/fileSystem';
import type { ArticleSummary, ThemeConfig } from '../../lib/types';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function CopyDialog({ article, title, month, months, applyTheme, usesCurrentDraft, fromThemeLibrary = false, onChangeTitle, onChangeMonth, onClose, onConfirm }: {
  article: ArticleSummary;
  title: string;
  month: string;
  months: string[];
  applyTheme: ThemeConfig | null;
  usesCurrentDraft: boolean;
  fromThemeLibrary?: boolean;
  onChangeTitle: (value: string) => void;
  onChangeMonth: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const { locale } = useUILocale();
  const monthOptions = Array.from(new Set([article.month, ...months])).sort().reverse();
  const currentMonth = monthKey();
  const currentMonthAlreadyListed = monthOptions.includes(currentMonth);
  return (
    <DialogFrame titleId="copy-dialog-title" onClose={onClose}>
      <DialogHeader titleId="copy-dialog-title" eyebrow={t('common:eyebrows.forkManuscript')} title={t('dialogs:ui.forkAsAnIndependentManuscript')} onClose={onClose} />
      <div className="dialog-content">
        <label className="field-stack"><span className="field-label">{t('dialogs:ui.forkTitle')}</span><input className="field" autoFocus value={title} onChange={(event) => onChangeTitle(event.target.value)} /></label>
        <label className="field-stack"><span className="field-label">{t('dialogs:ui.savedMonth')}</span><SelectField label={t('dialogs:ui.savedMonth')} value={month} onChange={nextValue => onChangeMonth(nextValue)} options={[...(monthOptions.map((value) => ({ value: value, label: formatUIMonth(value, locale) })) ?? []), ...(!currentMonthAlreadyListed ? [{ value: currentMonth, label: [formatUIMonth(currentMonth, locale), " ", t('dialogs:ui.currentMonth')].join('') }] : [])]} /></label>
        <p className="status-copy">{fromThemeLibrary ? t('dialogs:ui.theCopyUsesCurrentEditsAndTheSelected') : usesCurrentDraft ? t('dialogs:ui.forkUsesCurrentEditsAndTheThemeSnapshot') : t('dialogs:ui.forkUsesThisSavedArticleSCurrentVersion')}{t('dialogs:ui.imagesAreCopiedToTheNewDirectoryHistory')}{applyTheme ? t('dialogs:templates.theme', { name: applyTheme.name, version: applyTheme.version }) : ''}{month !== article.month ? t('dialogs:templates.month', { month: formatUIMonth(month, locale) }) : ''}</p>
        <DialogActions><DialogButton onClick={onClose}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" onClick={onConfirm} disabled={!title.trim()}>{fromThemeLibrary ? t('dialogs:ui.copyAndApply') : t('dialogs:ui.createFork')}</DialogButton></DialogActions>
      </div>
    </DialogFrame>
  );
}

export function DeleteDialog({ articles, archived, trashEnabled = true, disabled = false, onClose, onConfirm }: { articles: ArticleSummary[]; archived: boolean; trashEnabled?: boolean; disabled?: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useUITranslation('dialogs');
  const count = articles.length;
  const title = count === 1
    ? t(`dialogs:deletion.${archived ? 'singleArchived' : 'singleManuscript'}`)
    : t(`dialogs:deletion.${archived ? 'archived' : 'manuscripts'}`, { count });
  const suffix = count > 1 ? t('dialogs:deletion.countSuffix', { count }) : '';
  return (
    <DialogFrame titleId="delete-dialog-title" descriptionId="delete-dialog-copy" role="alertdialog" onClose={onClose}>
      <DialogHeader titleId="delete-dialog-title" eyebrow={archived ? t('common:eyebrows.deleteArchive') : t('common:eyebrows.deleteManuscript')} title={trashEnabled ? t('messages:trash.moveTitle') : title} onClose={onClose} />
      <div className="grid gap-5 p-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-surface p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-panel text-warning-strong" aria-hidden="true"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v5M12 17.5h.01" /></svg></span>
          <div className="min-w-0"><p id="delete-dialog-copy" className="m-0 text-sm font-semibold text-warning-strong">{t(trashEnabled ? 'messages:trash.moveWarning' : 'messages:trash.permanentWarning')}</p>{disabled ? <p className="m-0 mt-1 text-sm text-muted">{t('messages:trash.invalidSetting')}</p> : null}</div>
        </div>
        <div className="grid gap-1 border-l-2 border-warning pl-3"><span className="text-xs font-medium text-faint">{count > 1 ? t('dialogs:templates.deleteArticles', { count }) : t('dialogs:ui.aboutToDelete')}</span>
          <div className="grid max-h-56 gap-2 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{articles.map((item) => <div key={item.id} className="grid gap-0.5"><strong className="break-words text-sm font-semibold text-primary">{item.parse.metadata.title || t('dialogs:ui.untitledArticle')}</strong><span className="break-all font-mono text-xs text-muted">{item.month}/{item.folder}</span></div>)}</div>
        </div>
      </div>
      <DialogFooter><DialogActions><DialogButton autoFocus onClick={onClose}>{t('dialogs:ui.keepManuscript')}</DialogButton><DialogButton variant="danger" disabled={disabled} onClick={onConfirm}>{t(trashEnabled ? 'messages:trash.moveConfirm' : 'messages:trash.permanentDelete')}{suffix}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>
  );
}
