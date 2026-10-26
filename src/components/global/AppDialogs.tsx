'use client';

import { useUITranslation, useUILocale } from "./UILocaleProvider";

import { CopyDialog, DeleteDialog } from '../articles/ArticleDialogs';
import { ProjectDeleteDialog } from '../articles/ProjectDeleteDialog';
import { ArticleInfoDialog } from '../editor/ArticleInfoDialog';
import { ThemeDialog } from '../themes/ThemeDialog';
import { TemplateDialog } from '../content/TemplateDialog';
import { UnsavedDialog } from '../editor/UnsavedDialog';
import { MediaAssetDialog } from '../media/MediaLibrary';
import { MediaPickerDialog } from '../media/MediaPickerDialog';
import { useEditorControllerContext } from './AppProviders';
import { resolveDefaultArticleTheme, getBuiltinArticleThemes } from '../../lib/themes';
import { getArticleOrganization } from '../../lib/editorWorkspace';
import { FormatCheckDialog } from './FormatCheckDialog';
import { CreateLibraryDialog } from '../settings/CreateLibraryDialog';
import { MarkdownImportDialog } from '../imports/MarkdownImportDialog';
import { ImportTasksDialog } from '../imports/ImportTasksDialog';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from './DialogFrame';

export function AppDialogs() {
  const { t } = useUITranslation('messages');
  const { locale } = useUILocale();
  const controller = useEditorControllerContext();
  const {
    article,
    articleInfoDialogOpen,
    articleList,
    copyMonth,
    copySourceOverride,
    copyTarget,
    copyOpenerRef,
    copyThemeTarget,
    copyTitle,
    deleteTargets,
    formatCheck,
    resolveFormatCheck,
    directory,
    documentTokenRef,
    editorWorkspace,
    editorWorkspaceBusy,
    historyBusy,
    historyOpenerRef,
    mediaOperation,
    mediaOperationRef,
    mediaTarget,
    mutationQueueRef,
    pendingActionLabel,
    projectDeleteTarget,
    setArticleInfoDialogOpen,
    setCopyMonth,
    setCopySourceOverride,
    setCopyFromThemeLibrary,
    setCopyTarget,
    setCopyThemeTarget,
    setCopyTitle,
    setDeleteTargets,
    setMediaTarget,
    setProjectDeleteTarget,
    showTemplateDialog,
    showUnsavedDialog,
    themeLibrary,
    resolvePendingAction,
    cancelPendingAction,
    confirmCopy,
    confirmDelete,
    confirmDeleteProject,
    createArticleFromTemplate,
    closeTemplateDialog,
    changeTheme,
    renameMediaImage,
  } = controller;

  const currentStored = directory ? articleList.find((item) => item.id === controller.currentArticleId) ?? null : null;
  const articleThemes = directory && themeLibrary.length ? themeLibrary : getBuiltinArticleThemes(locale);
  const defaultArticleTheme = resolveDefaultArticleTheme(articleThemes, controller.articleSettings.defaultArticleThemeId);
  // A pending draft decision takes focus first; only one top-level dialog may own the focus trap.
  const activeDialog = formatCheck ? 'format'
    : showUnsavedDialog ? 'unsaved'
    : controller.createLibraryDialogOpen ? 'create-library'
    : controller.markdownImport.request?.root === directory && controller.markdownImport.request.session === controller.contentLibraryRootSession ? 'markdown-import'
    : controller.markdownImport.tasksOpen && directory ? 'import-tasks'
    : controller.mediaPickerRequest && controller.view === 'articles' && controller.articleMode === 'editor' ? 'media-picker'
    : mediaTarget ? 'media'
    : articleInfoDialogOpen ? 'info'
    : projectDeleteTarget ? 'project-delete'
    : deleteTargets.length ? 'delete'
    : controller.trash.confirmation ? 'trash-cleanup'
    : copyTarget ? 'copy'
    : controller.showThemeDialog ? 'theme'
    : showTemplateDialog ? 'template'
    : null;

  return (
    <>
      {activeDialog === 'import-tasks' ? <ImportTasksDialog
        tasks={controller.markdownImport.pending.map(item => item.task)} selectedId={controller.markdownImport.selectedTaskId}
        busy={controller.markdownImport.taskBusy} issues={controller.markdownImport.taskIssues}
        onSelect={controller.markdownImport.setSelectedTaskId} onClose={controller.markdownImport.closeTasks}
        onRetry={controller.markdownImport.retryTask} onPause={controller.markdownImport.pauseTask} onCancel={controller.markdownImport.cancelTask}
        onChooseSource={controller.markdownImport.chooseTaskSource} onChooseDirectory={controller.markdownImport.chooseTaskDirectory} onReplace={controller.markdownImport.replaceResource}
      /> : null}
      {activeDialog === 'markdown-import' && controller.markdownImport.request ? <MarkdownImportDialog
        key={controller.markdownImport.request.id}
        source={controller.markdownImport.request.source} mode={controller.markdownImport.request.mode}
        themes={articleThemes} defaultTheme={defaultArticleTheme}
        busy={controller.markdownImport.busy} feedback={controller.markdownImport.feedback}
        onChooseFile={controller.markdownImport.chooseFile} onChooseDirectory={controller.markdownImport.chooseDirectory}
        onConfirm={controller.markdownImport.confirm} onClose={controller.markdownImport.close}
      /> : null}
      {activeDialog === 'media-picker' && controller.mediaPickerRequest ? <MediaPickerDialog
        key={controller.mediaPickerRequest.id}
        root={controller.mediaPickerRequest.root}
        sessionKey={controller.mediaPickerRequest.sessionKey}
        refreshSignal={controller.mediaCatalogRevision}
        articles={controller.articleList}
        articleId={controller.mediaPickerRequest.articleId}
        articleTitle={controller.currentTitle}
        initialAsset={controller.mediaPickerRequest.initialAsset}
        isCurrent={() => controller.directoryRef.current === controller.mediaPickerRequest?.root && controller.contentLibraryRootSessionRef.current === controller.mediaPickerRequest?.sessionKey}
        busy={mediaOperation !== null || historyBusy}
        onImport={controller.importSharedFiles}
        onAdopt={controller.adoptLibraryImage}
        onManage={controller.manageLibraryMedia}
        currentReferenceCount={controller.currentMediaReferenceCount}
        scanReferences={controller.scanLibraryMediaReferences}
        onClose={controller.closeMediaPicker}
      /> : null}
      {activeDialog === 'template' ? <TemplateDialog templates={controller.templates} categories={controller.templateCategories} themes={articleThemes} defaultTheme={defaultArticleTheme} onClose={closeTemplateDialog} onCreate={createArticleFromTemplate} /> : null}
      {activeDialog === 'theme' ? <ThemeDialog
        key={`${controller.contentLibraryRootSession}:${controller.currentArticleId}`}
        current={article.theme}
        themes={directory ? themeLibrary : getBuiltinArticleThemes(locale)}
        source={controller.parsed.body}
        media={controller.articleMediaContext}
        busy={mediaOperation !== null || historyBusy || editorWorkspaceBusy}
        blockedReason={controller.currentArticleIsArchived ? t("messages:uiFeedback.themeArchived") : controller.parsed.diagnostics.some(item => item.level === 'error') ? t("messages:uiFeedback.themeRepairMetadata") : !article.themeValid && article.folder ? t("messages:uiFeedback.themeRepairSnapshot") : ''}
        issue={controller.status.tone === 'error' ? controller.status.label : ''}
        onClose={() => controller.setShowThemeDialog(false)}
        onSelect={changeTheme}
      /> : null}
      {activeDialog === 'unsaved' ? <UnsavedDialog label={pendingActionLabel} onCancel={cancelPendingAction} onContinue={controller.resumeCurrentDraft} onSave={() => resolvePendingAction(false)} onDiscard={() => void resolvePendingAction(true)} /> : null}
      {activeDialog === 'create-library' ? <CreateLibraryDialog onCreate={controller.createDataDirectory} onClose={() => controller.setCreateLibraryDialogOpen(false)} /> : null}
      {activeDialog === 'copy' && copyTarget ? <CopyDialog
        article={copyTarget}
        title={copyTitle}
        month={copyMonth}
        months={Array.from(new Set(articleList.map((item) => item.month))).sort().reverse()}
        applyTheme={copyThemeTarget}
        usesCurrentDraft={copySourceOverride !== null}
        fromThemeLibrary={controller.copyFromThemeLibrary}
        onChangeTitle={setCopyTitle}
        onChangeMonth={setCopyMonth}
        onClose={() => {
          const opener = copyOpenerRef.current;
          copyOpenerRef.current = null;
          setCopyTarget(null);
          setCopyThemeTarget(null);
          setCopySourceOverride(null);
          setCopyFromThemeLibrary(false);
          requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
        }}
        onConfirm={confirmCopy}
      /> : null}
      {activeDialog === 'delete' && deleteTargets.length ? <DeleteDialog articles={deleteTargets} trashEnabled={controller.articleSettings.trash.enabled} disabled={Boolean(controller.settingsIssue) || controller.trash.busy} archived={getArticleOrganization(editorWorkspace, deleteTargets[0].id).archived} onClose={() => setDeleteTargets([])} onConfirm={confirmDelete} /> : null}
      {activeDialog === 'trash-cleanup' && controller.trash.confirmation ? <DialogFrame titleId="trash-cleanup-title" descriptionId="trash-cleanup-copy" role="alertdialog" onClose={controller.trash.closeConfirmation}>
        <DialogHeader titleId="trash-cleanup-title" eyebrow={t('messages:trash.eyebrow')} title={t('messages:trash.cleanupTitle')} onClose={controller.trash.closeConfirmation} />
        <div className="grid gap-4 p-4"><p className="break-all text-sm font-semibold text-primary">{controller.directoryName}/_trash/</p><p id="trash-cleanup-copy" className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong">{t('messages:trash.cleanupWarning', { count: controller.trash.confirmation.ids.length })}</p></div>
        <DialogFooter><DialogActions><DialogButton autoFocus onClick={controller.trash.closeConfirmation}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" disabled={controller.trash.busy || !controller.articleSettings.trash.enabled || Boolean(controller.settingsIssue)} onClick={() => void controller.trash.confirmCleanup()}>{t('messages:trash.confirmCleanup')}</DialogButton></DialogActions></DialogFooter>
      </DialogFrame> : null}
      {activeDialog === 'project-delete' && projectDeleteTarget ? <ProjectDeleteDialog
        name={projectDeleteTarget.name}
        busy={editorWorkspaceBusy}
        onClose={() => setProjectDeleteTarget(null)}
        onConfirm={() => void confirmDeleteProject()}
      /> : null}
      {activeDialog === 'info' ? <ArticleInfoDialog
        editingLocationRef={controller.articleInfoLocationRef}
        editingKey={controller.sourceHistoryKey}
        article={article}
        parsed={controller.parsed}
        stored={currentStored}
        folderName={controller.articleFolderName}
        onFolderName={controller.setArticleFolderName}
        workspace={editorWorkspace}
        archived={controller.currentArticleIsArchived}
        busy={mediaOperation !== null || historyBusy || editorWorkspaceBusy}
        onClose={() => setArticleInfoDialogOpen(false)}
        onChangeField={controller.changeField}
        onOpenTheme={() => { setArticleInfoDialogOpen(false); controller.setShowThemeDialog(true); }}
        onChangeProject={(projectId) => { if (currentStored) void controller.setStoredArticleProject(currentStored, projectId); }}
        onOpenHistory={() => {
          setArticleInfoDialogOpen(false);
          historyOpenerRef.current = document.querySelector<HTMLButtonElement>('[data-history-trigger="true"]');
          void controller.openArticleHistory();
        }}
        onSave={() => void controller.saveCurrent()}
        onDelete={() => {
          if (currentStored) setDeleteTargets([currentStored]);
          setArticleInfoDialogOpen(false);
        }}
        onUnarchive={() => {
          if (currentStored) controller.archiveStoredArticle(currentStored, false);
          setArticleInfoDialogOpen(false);
        }}
      /> : null}
      {activeDialog === 'media' && mediaTarget ? <MediaAssetDialog
        key={`${mediaTarget.articleId}:${mediaTarget.fileName}`}
        asset={mediaTarget}
        canRename={directory === mediaTarget.root && documentTokenRef.current?.root === mediaTarget.root && (controller.getCurrentArticleId() === mediaTarget.articleId || !controller.articleRef.current.dirty) && !mutationQueueRef.current.isDeleting(mediaTarget.root, mediaTarget.articleId)}
        renameBlockedReason={directory !== mediaTarget.root ? t("messages:uiFeedback.imageLibrary") : documentTokenRef.current?.root !== mediaTarget.root ? t("messages:uiFeedback.imageOtherLibrary") : controller.articleRef.current.dirty && controller.getCurrentArticleId() !== mediaTarget.articleId ? t("messages:uiFeedback.imageDirty") : mutationQueueRef.current.isDeleting(mediaTarget.root, mediaTarget.articleId) ? t("messages:uiFeedback.imageDeleting") : undefined}
        busy={mediaOperation !== null}
        sessionKey={controller.contentLibraryRootSession}
        isCurrent={() => directory === mediaTarget.root && controller.contentLibraryRootSessionRef.current === controller.contentLibraryRootSession}
        onClose={() => setMediaTarget(null)}
        onRename={renameMediaImage}
      /> : null}
      {activeDialog === 'format' && formatCheck ? <FormatCheckDialog mode={formatCheck.mode} report={formatCheck.report} onDecision={resolveFormatCheck} /> : null}
    </>
  );
}
