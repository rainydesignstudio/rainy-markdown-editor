'use client';

import { productLabel } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEditorControllerContext } from '../global/AppProviders';
import { EditorWorkspace } from './EditorWorkspace';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';

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
        <div className="editor-unavailable-actions">
          {controller.directory ? <><button className="button button-quiet" type="button" onClick={() => controller.navigateArticleMode('overview')}>{t('articles:returnOverview')}</button><button className="button button-primary" type="button" onClick={controller.createNewArticle}>{t('articles:newArticle')}</button></> : <button className="button button-primary" type="button" onClick={() => controller.navigateView('settings')}>{t('articles:directory.settings')}</button>}
        </div>
      </section>
    );
  }

  return (
    <EditorWorkspace
      article={controller.article}
      themeUpdateAvailable={Boolean(availableArticleThemeUpdate(controller.article.theme, controller.themeLibrary))}
      parsed={controller.parsed}
      compiledCss={controller.compiledCss}
      compiledRevision={controller.compiledRevision}
      savedPreviewRevision={controller.savedPreviewRevision}
      documentGeneration={controller.currentDocumentGeneration}
      revision={controller.revision}
      mediaRevision={controller.mediaRefreshRevision}
      status={controller.status}
      mobilePane={controller.mobilePane}
      directory={controller.directory}
      snippets={controller.snippets}
      snippetCategories={controller.snippetCategories}
      previewRef={controller.previewRef}
      attachPreview={controller.attachPreview}
      clipboardReceiverRef={controller.clipboardReceiverRef}
      sourceTextareaRef={controller.sourceTextareaRef}
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
