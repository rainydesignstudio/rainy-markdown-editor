'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import type { FormEvent } from 'react';
import type { EditorWorkspace } from '../../lib/editorWorkspace';
import type { WorkingArticle, ArticleSummary } from '../../lib/types';
import type { parseArticle } from '../../lib/frontMatter';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { InformationButton, InformationIcon } from '../global/InformationButton';

type Props = {
  article: WorkingArticle; parsed: ReturnType<typeof parseArticle>; stored: ArticleSummary | null;
  workspace: EditorWorkspace; archived: boolean; busy: boolean;
  onClose: () => void; onChangeField: (field: 'title' | 'description' | 'author' | 'categories', value: string) => void;
  onOpenTheme: () => void; onChangeProject: (projectId: string | null) => void;
  onOpenHistory: () => void;
  onSave: () => void; onDelete: () => void; onUnarchive: () => void;
};

export function ArticleInfoDialog({ article, parsed, stored, workspace, archived, busy, onClose, onChangeField, onOpenTheme, onChangeProject, onOpenHistory, onSave, onDelete, onUnarchive }: Props) {
  const { t } = useUITranslation('dialogs');
  const invalid = parsed.diagnostics.some(item => item.level === 'error');
  const readOnly = archived || busy;
  const disabled = readOnly || invalid;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onClose(); };
  return <DialogFrame className="flex min-h-0 max-w-5xl flex-col overflow-hidden" titleId="article-info-title" descriptionId="article-info-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="article-info-title" eyebrow={t('common:eyebrows.manuscriptDetails')} title={t('dialogs:ui.manuscriptInformation')} onClose={onClose} closeDisabled={busy} />
    <form id="article-info-form" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" onSubmit={handleSubmit}>
      <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-list/50 p-4">
        <div className="flex min-w-0 items-center gap-3"><span className="information-badge"><InformationIcon /></span><div className="min-w-0"><strong className="block font-mono text-xs font-semibold text-primary">{stored ? 'article.md' : t('dialogs:ui.unsavedManuscript')}</strong><p className="mt-1 break-all font-mono text-xs text-muted">{stored?.filePath ?? t('dialogs:ui.writtenToTheLibraryAfterSaving')}</p></div></div>
        <span className="shrink-0 rounded-md bg-panel px-2.5 py-1.5 text-xs text-muted" role="status">{archived ? t('dialogs:ui.archived') : article.dirty ? t('dialogs:ui.unsavedChangesAlternative') : t('dialogs:ui.saved')}</span>
      </div>
      <p id="article-info-description" className="mb-4 shrink-0 text-xs text-faint">{t('dialogs:ui.informationEditsUpdateTheCurrentDraftAndAre')}</p>
      {archived || invalid || !article.themeValid ? <p className="mb-4 shrink-0 rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{archived ? t('dialogs:ui.thisArticleIsArchivedUnarchiveItToEdit') : invalid ? t('dialogs:ui.resolveMetadataDiagnosticsBeforeChangingFields') : t('dialogs:ui.theThemeSnapshotNeedsRepairSourceRemainsUnchanged')}</p> : null}
      <div className="grid min-w-0 shrink-0 items-start gap-5 md:grid-cols-3">
        <section className="min-w-0 rounded-lg border border-line bg-list/50 p-4 md:col-span-2" aria-labelledby="article-fields-heading">
          <h3 id="article-fields-heading" className="mb-4 font-sub-heading text-sm font-semibold text-primary">{t('dialogs:ui.basicInformation')}</h3>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="field-stack min-w-0 md:col-span-2"><span className="field-label">{t('dialogs:ui.articleTitle')}</span><input name="article-title" className="field" value={parsed.metadata.title} onChange={event => onChangeField('title', event.target.value)} disabled={disabled} /></label>
            <label className="field-stack min-w-0 md:col-span-2"><span className="field-label">{t('dialogs:ui.summary')}</span><textarea name="article-description" className="field min-h-32" value={parsed.metadata.description} onChange={event => onChangeField('description', event.target.value)} disabled={disabled} placeholder={t('dialogs:ui.brieflyDescribeThisArticle')} /></label>
            <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.author')}</span><input name="article-author" className="field" value={parsed.metadata.author} onChange={event => onChangeField('author', event.target.value)} disabled={disabled} /></label>
            <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.articleCategories')}</span><input name="article-categories" className="field" value={parsed.metadata.categories.join(', ')} onChange={event => onChangeField('categories', event.target.value)} disabled={disabled} placeholder={t('dialogs:ui.separateCategoriesWithCommas')} /></label>
          </div>
        </section>
        <div className="grid min-w-0 content-start gap-4">
          <section className="grid min-w-0 gap-4 rounded-lg border border-line bg-list/50 p-4" aria-labelledby="article-location-heading">
            <h3 id="article-location-heading" className="font-sub-heading text-sm font-semibold text-primary">{t('dialogs:ui.stylingAndOrganization')}</h3>
            <InformationButton icon={<InformationIcon book />} title={article.theme.name} subtitle={t('dialogs:templates.themeVersionChoice', { version: article.theme.version })} onClick={onOpenTheme} disabled={busy} />
            <label className="field-stack"><span className="field-label">{t('dialogs:ui.project')}</span><select name="article-project" className="field" value={stored ? workspace.articleOrganization[stored.id]?.projectId ?? '' : ''} onChange={event => onChangeProject(event.target.value || null)} disabled={readOnly || !stored}><option value="">{t('dialogs:ui.ungrouped')}</option>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          </section>
          <section className="grid min-w-0 gap-3 rounded-lg border border-line bg-list/50 p-4" aria-labelledby="article-manage-heading">
            <h3 id="article-manage-heading" className="font-sub-heading text-sm font-semibold text-primary">{t('dialogs:ui.manuscriptManagement')}</h3>
            <button className="button button-quiet justify-start" type="button" disabled={!stored || busy} onClick={onOpenHistory}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2" /></svg>{t('dialogs:ui.viewHistory')}</button>
            {archived ? <button className="button button-quiet justify-start" type="button" disabled={busy} onClick={onUnarchive}>{t('dialogs:ui.unarchive')}</button> : null}
            {stored ? <button className="button button-danger justify-start" type="button" disabled={busy} onClick={onDelete}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></svg>{t('dialogs:ui.deleteArticle')}</button> : null}
          </section>
        </div>
      </div>
    </form>
    <DialogFooter><DialogActions><DialogButton onClick={onClose} disabled={busy}>{t('dialogs:ui.backToEditor')}</DialogButton><DialogButton variant="primary" disabled={!article.dirty || readOnly || invalid} onClick={onSave}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8" /></svg>{t('dialogs:ui.saveArticle')}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
