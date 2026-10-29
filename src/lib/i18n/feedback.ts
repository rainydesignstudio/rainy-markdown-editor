import type { TFunction } from 'i18next';
import { formatUINumber } from './formatters';
import type { UILocale } from './preferences';
import { formatProductMessage, isProductMessage, legacyProductMessage, type ProductMessageInfo } from './productMessages';

type Tone = 'success' | 'warning' | 'error' | 'info';
const summaries: Record<string, [string, Tone]> = {
  'controller.sourceSaved': ['articleSaved', 'success'],
  'controller.styleGenerationFailed': ['failed', 'error'],
  'controller.formatCheckingIsIncomplete': ['checkIncomplete', 'warning'],
  'controller.savingSettingsJson': ['saving', 'info'],
  'controller.settingsSavedTimersRestartedWithTheNewConfiguration': ['saved', 'success'],
  'controller.importantVersionSavedButTheHistoryListCouldNotRefreshRetryRefresh': ['refreshPending', 'warning'],
  'controller.protectionWasSavedButTheHistoryListCouldNotRefreshRetryRefresh': ['refreshPending', 'warning'],
  'controller.selectedVersionRestoredContentFromBeforeRestoreIsRetainedIn': ['restored', 'success'],
  'controller.historicalVersionRestoredContentFromBeforeRestoreIsRetainedIn': ['restored', 'success'],
  'controller.savedAnIndependentArticleItsBodyUsesTheSelectedHistoricalVersionAssets': ['forkCreated', 'success'],
  'controller.currentRangeCheckedArticlesSeeEachArticleSRecordForDetails': ['checkedArticles', 'success'],
  'controller.settingsCouldNotBeReadAutoSaveAndSnapshotsArePaused': ['settingsReadFailed', 'warning'],
  'controller.newDraftThemeSwitchedToItsArticleThemeSnapshotIsWrittenWhen': ['themeChanged', 'success'],
  'controller.checkpointSavedThemeSwitchedToSaveTheArticleToWriteItsSource': ['themeChanged', 'success'],
  'controller.forkCreatedTheOriginalManuscriptIsUnchanged': ['forkCreated', 'success'],
  'controller.forkFailedTheOriginalManuscriptAndUnsavedStateAreRetained': ['forkFailed', 'error'],
  'controller.loadedResolveDiagnosticsFirst': ['articleOpenedReview', 'warning'],
  'controller.loaded': ['articleOpened', 'info'],
  'controller.completeVersionsLoadedDamagedOrIncompleteRecordsExcludedFromRestore': ['historyReview', 'warning'],
  'controller.importantVersionSaved': ['saved', 'success'],
  'controller.contentMatchesAnExistingVersionNoDuplicateWasWritten': ['versionExists', 'info'],
  'controller.projectDeletedArticlesMovedToUnclassifiedTheirContentIsUnchanged': ['deleted', 'success'],
  'controller.archivedOriginalSourceAndAssetsAreRetained': ['archived', 'success'],
  'controller.unarchived': ['unarchived', 'success'],
  'controller.completeRichTextArticleCopiedEmbeddedImageReferencesReadyToPaste': ['copied', 'success'],
  'controller.richTextCopiedPasteIntoTheReceivingAreaBelow': ['copied', 'success'],
  'controller.clipboardPastedTextHtmlTextPlain': ['pasted', 'success'],
  'controller.clipboardPastedTextPlain': ['pasted', 'success'],
  'libraryCss.partial': ['savePartial', 'warning'],
  'libraryCss.saved': ['cssSaved', 'success'],
  'libraryCss.reloadFailed': ['cssReloadFailed', 'warning'],
  'controller.sourceSavedTheIndexWasNotUpdated': ['savedNeedsReview', 'warning'],
  'controller.sourceSavedTheMonthlyIndexWasRebuilt': ['savedNeedsReview', 'warning'],
  'controller.sourceSavedTheRenderRecordWasNotUpdated': ['renderRecordPending', 'warning'],
  'controller.sourceSavedFormatCheckingIsIncomplete': ['savedNeedsReview', 'warning'],
  'mediaLibrary.selectedAssetsIncludeArchivedArticlesUnarchiveThemBeforeMakingChanges': ['unarchive', 'warning'],
  'mediaLibrary.sharedImageImportFailed': ['importFailed', 'error'],
  'mediaLibrary.dropContainsNoFiles': ['noFiles', 'warning'],
  'mediaLibrary.dropTargetChanged': ['sessionChanged', 'warning'],
  'mediaGallery.theLibraryChangedNothingWasDownloaded': ['sessionChanged', 'warning'],
  'mediaGallery.refreshPartial': ['someFilesFailed', 'warning'],
  'mediaGallery.downloaded': ['downloadStarted', 'success'],
  'mediaGallery.downloadFailed': ['downloadFailed', 'error'],
  'resources.metadataIssue': ['metadataReadFailed', 'warning'],
  'resources.listFailed': ['someFilesFailed', 'warning'],
  'resources.referenceUnavailable': ['referenceFailed', 'warning'],
  'resources.checkingReferences': ['referenceChecking', 'info'],
  'resources.sharedOriginalRetained': ['originalRetained', 'success'],
  'mediaManagement.copiedTheSourceIsReferencedByTheBodyOrHistoryAndIs': ['copiedRetained', 'success'],
  'mediaManagement.moved': ['moved', 'success'],
  'mediaManagement.destinationWasWritten': ['targetSaved', 'warning'],
  'mediaManagement.newFileWasSaved': ['targetSaved', 'warning'],
  'controller.imageOperationCompleted': ['renamed', 'success'],
  'controller.newImageSavedButArticleReferenceUpdateFailed': ['targetSaved', 'warning'],
  'controller.newImageSavedButWritingManuscriptReferencesWasNotConfirmedUnsavedEdits': ['targetSaved', 'warning'],
  'controller.newImageSavedButWritingReferencesInItsOwningArticleWasNot': ['targetSaved', 'warning'],
  'controller.newImageSavedCurrentManuscriptReferencesWereUpdatedAndSavedOriginalFile': ['renamed', 'success'],
  'controller.newImageSavedReferencesInItsOwningArticleWereUpdatedAndSaved': ['renamed', 'success'],
  'controller.assetOperationFailed': ['failed', 'error'],
  'controller.fileWasDeletedButItsDescriptionIndexWasNotCleaned': ['indexRepair', 'warning'],
  'controller.sharedImagesWereNotImported': ['importFailed', 'error'],
  'controller.importingSharedImages': ['importing', 'info'],
  'controller.descriptionSaved': ['descriptionSaved', 'success'],
  'controller.deletedBodyAndHistoryReferencesAreRetained': ['deleted', 'success'],
  'themeLibrary.theOperationCompletedButTheThemeListHasNotRefreshedRetryLater': ['refreshPending', 'warning'],
  'themeLibrary.copiedToTheLibraryButTheListCouldNotRefreshTheOperation': ['refreshPending', 'warning'],
  'themeLibrary.importedIntoTheLibraryButTheListCouldNotRefreshTheOperation': ['refreshPending', 'warning'],
  'themeLibrary.deletedExistingArticleSnapshotsAreRetainedTheListCouldNotRefreshDo': ['refreshPending', 'warning'],
  'themeLibrary.themeListReloaded': ['themeRefreshed', 'success'],
  'themeLibrary.created': ['themeCopied', 'success'],
  'themeLibrary.themeCopyFailed': ['themeCopyFailed', 'error'],
  'themeLibrary.imported': ['themeImported', 'success'],
  'themeLibrary.importedDuplicate': ['themeImportedCopy', 'success'],
  'themeLibrary.importFailed': ['importFailed', 'error'],
  'themeLibrary.setAnotherThemeAsTheDefaultBeforeDeletingThisTheme': ['defaultRequired', 'warning'],
  'themeLibrary.deletedFromTheThemeLibraryExistingArticleSnapshotsAreRetained': ['themeDeleted', 'success'],
  'themeLibrary.exportedJson': ['themeExported', 'success'],
  'themeLibrary.theOpenArticleBelongsToAnotherLibrarySwitchBackToItsLibrary': ['articleLibraryRequired', 'warning'],
  'themeLibrary.setAsTheDefaultForNewArticlesAndTemplatePreviewsExistingArticle': ['defaultSaved', 'success'],
  'themeLibrary.defaultThemeSavingFailed': ['defaultFailed', 'error'],
  'themeLibrary.defaultThemesAddedExistingThemesSkipped': ['themesAdded', 'success'],
  'themeLibrary.theListCouldNotRefreshTryAgain': ['refreshFailed', 'warning'],
  'themeLibrary.savedVArticleSnapshotsAreUnchanged': ['themeSaved', 'success'],
  'themeLibrary.cssAndJsonValidationPassedAppliedToThisTemporaryPreview': ['previewValidated', 'success'],
  'themeLibrary.saving': ['saving', 'info'],
  'themeLibrary.layoutValidationDidNotPassTheThemeFileWasNotWritten': ['layoutFailed', 'warning'],
  'themeLibrary.savedVExistingArticleSnapshotsAreUnchanged': ['themeSaved', 'success'],
  'themeLibrary.savingFailed': ['saveFailed', 'error'],
  'createTemplateFromArticleDialog.validationFailed': ['validationFailed', 'error'],
  'controller.deletionFailed': ['deleteFailed', 'error'],
  'contentLibrary.validating': ['validating', 'info'],
  'contentLibrary.validationFailedNothingWasSaved': ['validationFailed', 'error'],
  'contentLibrary.validationPassedFormatConcernsRequiringReview': ['validationReview', 'warning'],
  'contentLibrary.validationPassedCurrentContentCanBeSaved': ['validated', 'success'],
  'contentLibrary.butTheListCouldNotRefreshTheOperationCompletedRetryRefreshDo': ['refreshPending', 'warning'],
  'contentLibrary.enterAFilenameFirstLowercaseLettersNumbersAndHyphensWithAtMost': ['filenameRequired', 'warning'],
  'contentLibrary.chooseACategoryBeforeCreatingContent': ['categoryRequired', 'warning'],
  'contentLibrary.saving': ['saving', 'info'],
  'contentLibrary.savingFailedTheDraftIsRetained': ['saveFailedDraftRetained', 'error'],
  'contentLibrary.savedFormatConcernsRequiringReview': ['savedReview', 'warning'],
  'contentLibrary.savedExistingArticlesAreUnaffected': ['saved', 'success'],
  'contentLibrary.deleting': ['deleting', 'info'],
  'contentLibrary.deletedExistingArticlesAreUnaffected': ['contentDeleted', 'success'],
  'contentLibrary.listReloadedSavingOrDeletionWasNotRepeated': ['refreshed', 'success'],
  'contentLibrary.theBodyChangedValidateItBeforeSaving': ['modified', 'warning'],
  'contentLibrary.invalidFilenameFormatUseLowercaseLettersNumbersAndHyphens': ['filenameRequired', 'warning'],
  'contentLibrary.informationConfirmedContinueEditingTheBodyThenClickSaveContentToCreate': ['infoConfirmed', 'success'],
  'contentLibrary.editingCancelledUnsavedContentWasDiscarded': ['cancelled', 'success'],
  'settingsPanel.previewingChangesAreWrittenToTheLibraryOnlyWhenSaved': ['appearancePreview', 'info'],
  'settingsPanel.changesCancelledSavedAppearanceRestored': ['appearanceRestored', 'success'],
  'settingsPanel.savingFailedThePreviewAndUnsavedChangesAreRetained': ['saveFailedDraftRetained', 'error'],
  'settingsPanel.themeDeleted': ['deleted', 'success'],
  'settingsPanel.deletionFailedTheThemeIsRetained': ['deleteFailed', 'error'],
  'uiFeedback.appearanceSaved': ['appearanceSaved', 'success'],
  'uiFeedback.appearanceDefault': ['appearanceRestored', 'success'],
  'uiFeedback.appearancePreviewDefault': ['appearancePreview', 'info'],
  'uiFeedback.themeImported': ['themeImported', 'success'],
  'uiFeedback.themeImportFailed': ['importFailed', 'error'],
  'uiFeedback.themesAdded': ['themesAdded', 'success'],
  'uiFeedback.themesFailed': ['someFilesFailed', 'warning'],
};

export function feedbackNotice(value: unknown, tone?: Tone | 'neutral'): { summary: ProductMessageInfo; tone: Tone } {
  if (!tone && value && typeof value === 'object' && 'tone' in value && ['success', 'warning', 'error', 'info', 'neutral'].includes(String(value.tone))) tone = value.tone as Tone | 'neutral';
  const literal = typeof value === 'string' ? value : value && typeof value === 'object' && 'label' in value ? String(value.label) : '';
  const message = isProductMessage(value) ? value : legacyProductMessage(literal);
  let choice = message ? summaries[message.messageKey] : undefined;
  if (message?.messageKey === 'shared.compose') {
    const parts = message.messageParams?.parts;
    const entries = parts && typeof parts === 'object' && 'messageParts' in parts && Array.isArray(parts.messageParts) ? parts.messageParts : [];
    if (entries.some(part => isProductMessage(part) && part.messageKey === 'controller.sourceSavedTheRenderRecordWasNotUpdated')) choice = ['renderRecordPending', 'warning'];
    else if (entries.some(part => isProductMessage(part) && part.messageKey === 'controller.sourceSavedTheIndexWasNotUpdated')) choice = ['savedNeedsReview', 'warning'];
    else { const known = entries.find(part => isProductMessage(part) && summaries[part.messageKey]); if (isProductMessage(known)) choice = summaries[known.messageKey]; }
  }
  if (message?.messageKey.startsWith('feedback.')) choice = [message.messageKey.slice(9), tone === 'neutral' ? 'info' : tone ?? 'info'];
  if (message?.messageKey === 'contentLibrary.editingANewSaveItToReuseIt') choice = [typeof message.messageParams?.name === 'object' && message.messageParams.name && 'messageKey' in message.messageParams.name && message.messageParams.name.messageKey === 'snippetCategoryIcons.snippet' ? 'newSnippet' : 'newTemplate', 'info'];
  if (message?.messageKey === 'mediaManagement.imageOperationCompletedTheIndependentArticleCopyIsUnchanged') choice = [isProductMessage(message.messageParams?.value) && message.messageParams.value.messageKey === 'mediaManagement.replacedWith' ? 'replaced' : 'renamed', 'success'];
  if (message?.messageKey === 'controller.imageOperationCompleted' && isProductMessage(message.messageParams?.value) && message.messageParams.value.messageKey === 'mediaManagement.replacedWith') choice = ['replaced', 'success'];
  if (message?.messageKey === 'controller.newImageSavedCurrentManuscriptReferencesWereUpdatedAndSavedOriginalFile' && message.messageParams?.indexNote || message?.messageKey === 'controller.newImageSavedReferencesInItsOwningArticleWereUpdatedAndSaved' && message.messageParams?.value) choice = ['indexRepair', 'warning'];
  const params = { ...message?.messageParams };
  if (message?.messageKey === 'controller.completed') {
    const done = Number(params.outcomes_filter_result_result_ok_Count) || 0, total = Number(params.operation_assetsCount) || 0;
    const detail = params.details;
    if (total === 1 && detail && typeof detail === 'object' && 'messageParts' in detail && Array.isArray(detail.messageParts) && detail.messageParts.length === 1) { const single = feedbackNotice(detail.messageParts[0], tone); if (params.operation === 'replace' && single.summary.messageKey === 'feedback.renamed') single.summary.messageKey = 'feedback.replaced'; return single; }
    choice = [done === total ? 'completedCount' : 'partial', done === total ? 'success' : done ? 'warning' : 'error']; Object.assign(params, { done, failed: Math.max(0, total - done) });
  }
  if (message?.messageKey === 'controller.sharedImagesImported') choice = [Number(params.failed) ? 'importedPartial' : 'importedCount', Number(params.failed) ? Number(params.resultImported) ? 'warning' : 'error' : 'success'];
  if (message?.messageKey === 'mediaGallery.downloadBatch') choice = [Number(params.failed) ? 'downloadsPartial' : 'downloadsStarted', Number(params.failed) ? Number(params.started) ? 'warning' : 'error' : 'success'];
  return { summary: { messageKey: 'feedback.' + (choice?.[0] ?? (tone === 'error' ? 'failed' : tone === 'success' ? 'completed' : 'review')), messageParams: params }, tone: tone && tone !== 'neutral' ? tone : choice?.[1] ?? (tone === 'neutral' ? 'info' : 'warning') };
}

export function formatBriefFeedback(summary: ProductMessageInfo, t: TFunction, locale: UILocale) {
  return formatProductMessage({ ...summary, messageParams: Object.fromEntries(Object.entries(summary.messageParams ?? {}).map(([key, value]) => [key, typeof value === 'number' ? formatUINumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 }) : value])) }, t);
}

export function additionalFeedback(value: unknown, heading: string, t: TFunction): string {
  if (Array.isArray(value)) return value.map(item => additionalFeedback(item, heading, t)).filter(Boolean).join('\n');
  const text = formatProductMessage(value, t).trim();
  return text === heading.trim() ? '' : text;
}
