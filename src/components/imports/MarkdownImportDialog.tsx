'use client';
import { SelectField } from '../global/SelectField';
import { useState } from 'react';
import { useUITranslation, useUILocale } from '../global/UILocaleProvider';
import { formatUINumber } from '../../lib/i18n/formatters';
import { formatProductMessage, type ProductMessageFields } from '../../lib/i18n/productMessages';
import type { ReadonlyImportSource } from '../../lib/imports/source';
import type { ThemeConfig } from '../../lib/types';
import { ButtonBar } from '../global/ButtonBar';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';

export function MarkdownImportDialog({ source, mode, themes, defaultTheme, busy, feedback, onChooseFile, onChooseDirectory, onConfirm, onClose }: {
  source: ReadonlyImportSource | null; mode: 'local' | 'knowledge'; themes: ThemeConfig[]; defaultTheme: ThemeConfig;
  busy: boolean; feedback: ProductMessageFields | { message: string } | null;
  onChooseFile: () => Promise<void>; onChooseDirectory: () => Promise<void>; onConfirm: (theme: ThemeConfig) => Promise<void>; onClose: () => void;
}) {
  const { t } = useUITranslation('messages'), { locale } = useUILocale();
  const [themeId, setThemeId] = useState(defaultTheme.id);
  const selected = themes.find(theme => theme.id === themeId);
  return <DialogFrame wide className="flex min-h-0 flex-col overflow-hidden" titleId="markdown-import-title" descriptionId="markdown-import-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="markdown-import-title" eyebrow={t('imports.eyebrow')} title={t('imports.title')} onClose={onClose} closeDisabled={busy} />
    <div className="dialog-content min-h-0 flex-1 content-start overflow-x-clip overflow-y-auto" aria-busy={busy}>
      <p id="markdown-import-description" className="text-sm text-muted">{t('imports.description')}</p>
      <section className="grid min-w-0 gap-3 rounded-lg border border-line bg-list/50 p-4" aria-label={t('imports.sourceLabel')}>
        <p className="text-xs text-muted">{t(mode === 'knowledge' ? 'imports.knowledgeSource' : 'imports.localSource')}</p>
        <p className="min-w-0 break-all font-medium text-sm text-primary">{source?.origin.name ?? t('imports.noFile')}</p>
        {source ? <><p className="break-words text-xs text-secondary">{source.title}</p><p className="text-xs text-faint">{t('imports.bytes', { size: formatUINumber(source.origin.size, locale) })}</p></> : null}
        {mode === 'local' ? <ButtonBar label={t('imports.sourceLabel')}><DialogButton disabled={busy} onClick={() => void onChooseFile()}>{t('imports.chooseFile')}</DialogButton></ButtonBar> : null}
      </section>
      <label className="field-stack" htmlFor="markdown-import-theme"><span className="field-label">{t('imports.themeLabel')}</span>
        <SelectField label={t('imports.themeLabel')} id="markdown-import-theme" value={themeId} disabled={busy} onChange={nextValue => setThemeId(nextValue)} options={[...(themes.map(theme => ({ value: theme.id, label: [theme.name, " · v", theme.version].join('') })) ?? [])]} />
        <span className="text-xs text-faint">{t('imports.themeHelp')}</span>
      </label>
      {source?.chooseDirectory ? <section className="field-stack" aria-label={t('imports.directoryLabel')}><p className="field-label">{t('imports.directoryLabel')}</p><p className="break-all text-xs text-secondary">{source.directoryName ?? t('imports.noDirectory')}</p><ButtonBar label={t('imports.directoryLabel')}><DialogButton disabled={busy} onClick={() => void onChooseDirectory()}>{t('imports.chooseDirectory')}</DialogButton></ButtonBar><p className="text-xs text-faint">{t('imports.directoryHelp')}</p></section> : null}
      {feedback ? <p role="alert" className="status-copy" data-tone="error">{formatProductMessage(feedback, t)}</p> : null}
      {busy ? <p className="text-xs text-muted" role="status">{t('imports.processing')}</p> : null}
    </div>
    <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" disabled={busy || !source || !selected} onClick={() => { if (selected) void onConfirm(selected); }}>{t('imports.confirm')}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
