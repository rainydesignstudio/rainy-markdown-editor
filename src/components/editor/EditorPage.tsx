'use client';

import { productLabel } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEditorControllerContext } from '../global/AppProviders';
import { EditorWorkspace } from './EditorWorkspace';
import { ImportProgressButton } from '../imports/ImportTasksDialog';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';
import { Button } from '../global/Button';
import { ButtonBar } from '../global/ButtonBar';

export function EditorPage() {
  const { t } = useUITranslation('editor');
  const controller = useEditorControllerContext();
  const mediaBusy = controller.mediaOperation !== null || controller.historyBusy;

  if (!controller.directory || (!controller.article.folder && !controller.article.source.trim())) {
    return (
      <section className="editor-unavailable" aria-labelledby="editor-unavailable-title">
        <p id="editor-unavailable-kicker" className="eyebrow">{t('editor:eyebrow.editor')}</p>
        <h2 id="editor-unavailable-title" className="page-title font-heading">{controller.directory ? t('editor:empty.chooseArticle') : t('editor:empty.chooseLibrary')}</h2>
        <p className="mt-3">{controller.directory ? t('editor:empty.articleHelp') : t('editor:empty.libraryHelp')}</p>
        <ButtonBar label={t('editor:toolbar.actions')} className="mt-2">
          {controller.directory ? <><Button icon="back"  type="button" onClick={() => controller.navigateArticleMode('overview')} label={t('articles:returnOverview')} /><Button icon="plus" variant="primary"  type="button" data-create-article-trigger="editor" onClick={controller.createNewArticle} label={t('articles:newArticle')} /></> : <Button icon="settings" variant="primary"  type="button" onClick={() => controller.navigateView('settings')} label={t('articles:directory.settings')} />}
        </ButtonBar>
      </section>
    );
  }

  return (
    <EditorWorkspace
      librarySessionKey={controller.contentLibraryRootSession}
      isLibraryCurrent={() => controller.directoryRef.current === controller.directory && controller.contentLibraryRootSessionRef.current === controller.contentLibraryRootSession}
      article={controller.article}
      themeUpdateAvailable={Boolean(availableArticleThemeUpdate(controller.article.theme, controller.themeLibrary))}
      parsed={controller.parsed}
      compiledCss={controller.compiledCss}
      compiledRevision={controller.compiledRevision}
      savedPreviewRevision={controller.savedPreviewRevision}
      documentGeneration={controller.currentDocumentGeneration}
      sourceHistoryKey={controller.sourceHistoryKey}
      revision={controller.revision}
      mediaRevision={controller.mediaRefreshRevision}
      sourceFormatIssues={controller.sourceFormatIssues}
      status={controller.sourceStatus}
      importProgress={<ImportProgressButton job={controller.markdownImport.pending.find(item => item.task.target.articleId === controller.currentArticleId) ?? null} onClick={() => controller.markdownImport.openTasks(controller.currentArticleId)} />}
      mobilePane={controller.mobilePane}
      directory={controller.directory}
      snippets={controller.snippets}
      snippetCategories={controller.snippetCategories}
      previewRef={controller.previewRef}
      attachPreview={controller.attachPreview}
      clipboardReceiverRef={controller.clipboardReceiverRef}
      sourceTextareaRef={controller.sourceTextareaRef}
      editingLocationRef={controller.articleSourceLocationRef}
      sourceFocusDisabled={controller.articleInfoDialogOpen}
      onChangeBody={controller.updateArticleBody}
      onSnippetInserted={() => { void controller.compileCurrent(); }}
      onOpenInfo={() => controller.openArticleInfo()}
      onOpenMediaPicker={() => controller.openMediaPicker()}
      onOpenTheme={() => controller.setShowThemeDialog(true)}
      onPaste={controller.pasteRichText}
      onImportFiles={controller.importImages}
      onPasteConflict={() => controller.setStatus({ ...productLabel("editorPage.theClipboardContainsBothTextAndImagesThisPasteRetainsTheText"), tone: 'warning' })}
      onSetMobilePane={controller.setMobilePane}
      media={controller.articleMediaContext}
      mediaBusy={mediaBusy}
      readOnly={controller.currentArticleIsArchived}
    />
  );
}
