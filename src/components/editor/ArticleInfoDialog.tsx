'use client';

import { useUITranslation } from '../global/UILocaleProvider';

import { useLayoutEffect, useRef, type FormEvent, type MutableRefObject } from 'react';
import { useDraftLocation } from '../global/EditingDrafts';
import type { RememberedEditingLocation } from '../../lib/editingLocation';
import type { EditorWorkspace } from '../../lib/editorWorkspace';
import type { WorkingArticle, ArticleSummary } from '../../lib/types';
import type { parseArticle } from '../../lib/frontMatter';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { InformationButton, InformationIcon } from '../global/InformationButton';

type Props = {
  article: WorkingArticle; parsed: ReturnType<typeof parseArticle>; stored: ArticleSummary | null;
  editingLocationRef?: MutableRefObject<RememberedEditingLocation | null>; editingKey?: number;
  workspace: EditorWorkspace; archived: boolean; busy: boolean;
  onClose: () => void; onChangeField: (field: 'title' | 'description' | 'author' | 'categories', value: string) => void;
  onOpenTheme: () => void; onChangeProject: (projectId: string | null) => void;
  onOpenHistory: () => void;
  onSave: () => void; onDelete: () => void; onUnarchive: () => void;
  folderName: string; onFolderName: (name: string) => void; onRenameFolder: () => void;
};

export function ArticleInfoDialog({ article, parsed, stored, workspace, archived, busy, onClose, onChangeField, onOpenTheme, onChangeProject, onOpenHistory, onSave, onDelete, onUnarchive, editingLocationRef, editingKey, folderName, onFolderName, onRenameFolder }: Props) {
  const { t } = useUITranslation('dialogs');
  const location = useDraftLocation<HTMLFormElement>();
  const dirtyRef = useRef(article.dirty); dirtyRef.current = article.dirty;
  useLayoutEffect(() => {
    const remembered = editingLocationRef?.current;
    if (remembered && remembered.key === editingKey) location.restore(remembered.location);
    return () => { const saved = dirtyRef.current ? location.capture() : null; if (saved && editingLocationRef) editingLocationRef.current = { key: editingKey, location: saved }; };
    // The form's location belongs to this document, not to each field revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingLocationRef, editingKey]);
  const invalid = parsed.diagnostics.some(item => item.level === 'error');
  const readOnly = archived || busy;
  const disabled = readOnly || invalid;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onClose(); };
  return <DialogFrame className="flex min-h-0 max-w-5xl flex-col overflow-hidden" titleId="article-info-title" descriptionId="article-info-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="article-info-title" eyebrow={t('common:eyebrows.manuscriptDetails')} title={t('dialogs:ui.manuscriptInformation')} onClose={onClose} closeDisabled={busy} />
    <form {...location.props} id="article-info-form" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" onSubmit={handleSubmit}>
      <strong className="block shrink-0 break-words font-mono font-semibold text-primary">{article.folder ?? t('dialogs:ui.unsavedManuscript')}</strong>
      <div className="mt-2 mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-list/50 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3"><span className="information-badge"><InformationIcon /></span><div className="min-w-0 flex-1">
          {article.month && article.folder ? <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-xs text-muted">
            <span>{`articles/${article.month}/`}</span>
            <label className="min-w-0 basis-full md:flex-1 md:basis-0"><span className="sr-only">{t('dialogs:ui.articleFolderName')}</span><input className="field min-w-0 font-mono text-xs" name="article-folder" value={folderName} maxLength={80} disabled={readOnly} onChange={event => onFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (!readOnly && folderName.trim() && folderName !== article.folder) onRenameFolder(); } }} /></label>
            <span>/article.md</span><button className="button button-quiet min-h-9 px-2 py-1 text-xs" type="button" disabled={readOnly || !folderName.trim() || folderName === article.folder} onClick={onRenameFolder}>{t('dialogs:ui.applyFolderName')}</button>
          </div> : <p className="mt-1 break-all font-mono text-xs text-muted">{t('dialogs:ui.writtenToTheLibraryAfterSaving')}</p>}
        </div></div>
        <span className="shrink-0 rounded-md bg-panel px-2.5 py-1.5 text-xs text-muted" role="status">{archived ? t('dialogs:ui.archived') : article.dirty ? t('dialogs:ui.unsavedChangesAlternative') : t('dialogs:ui.saved')}</span>
      </div>
      <p id="article-info-description" className="mb-4 shrink-0 text-xs text-muted">{article.folder ? <>{t('dialogs:ui.folderRenameImmediate')}{' '}</> : null}{t('dialogs:ui.informationEditsUpdateTheCurrentDraftAndAre')}</p>
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
