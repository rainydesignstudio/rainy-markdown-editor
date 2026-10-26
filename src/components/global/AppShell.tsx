'use client';

import { formatProductMessage, productLabel, productReference } from "../../lib/i18n/productMessages";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useEditorControllerContext } from './AppProviders';
import { useToast } from './Toast';
import { OperationFeedback } from './OperationFeedback';
import { AppDialogs } from './AppDialogs';
import { ChangelogDialog } from './ChangelogDialog';
import { EditorTopbar } from './EditorTopbar';
import { MainSidebar } from './MainSidebar';
import { ArticleSidebar } from '../articles/ArticleSidebar';
import { ArticleHistoryView } from '../history/ArticleHistoryDialog';
import { ArticleStatisticsDialog } from '../editor/ArticleStatisticsDialog';
import { articleStatisticsFromPreview } from '../../lib/articleStatistics';
import { CreateTemplateFromArticleDialog } from '../content/CreateTemplateFromArticleDialog';
import { ArticleExportDialog } from '../editor/ArticleExportDialog';
import { getFormatSnapshot } from '../../lib/article-format/runtime';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { parseArticle } from '../../lib/frontMatter';
import { useUITranslation } from './UILocaleProvider';
import { articleCollectionLabel } from '../../lib/i18n/articleLabels';
import { useEditingDraft } from './EditingDrafts';
import { useSidebarPreferences } from '../../hooks/useSidebarPreferences';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useUITranslation('articles');
  const format = useFormatSnapshot();
  const controller = useEditorControllerContext();
  const notify = useToast();
  useEffect(() => { if (!format.loading && !format.error) notify({ key: 'format-problem', dismiss: true }); }, [format.loading, format.error, notify]);
  const statusEvent = useRef(0), lastStatus = useRef(controller.status);
  if (lastStatus.current !== controller.status) { lastStatus.current = controller.status; statusEvent.current++; }
  useEditingDraft(controller.article.dirty ? { kind: controller.articleDraftKind, objectId: controller.currentArticleId, root: controller.directory, resume: controller.resumeCurrentDraft } : null);
  const historyArticle = controller.article;
  const historyRoot = controller.directory;
  const historyViewOpen = Boolean(
    controller.historyDialogOpen && controller.view === 'articles' && controller.articleMode === 'editor'
    && historyRoot && historyArticle.month && historyArticle.folder,
  );
  const { preferences: { mainCollapsed, articleCollapsed: articleSidebarCollapsed }, toggle: toggleSidebar } = useSidebarPreferences();
  const [articleSidebarMobileOpen, setArticleSidebarMobileOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [templateSnapshot, setTemplateSnapshot] = useState<{ source: string; dirty: boolean; root: FileSystemDirectoryHandle; sessionKey: number; formatId: string } | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<{ source: string; body: string; title: string; dirty: boolean; root: FileSystemDirectoryHandle; month: string | null; folder: string | null; themeId: string; themeVersion: string; sessionKey: number; formatId: string } | null>(null);

  useEffect(() => {
    if (controller.view !== 'articles' || controller.articleMode !== 'editor') controller.setHistoryDialogOpen(false);
  }, [controller.articleMode, controller.setHistoryDialogOpen, controller.view]);

  const toggleArticleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(width < 48rem)').matches) {
      setArticleSidebarMobileOpen((open) => !open);
      return;
    }
    toggleSidebar('articleCollapsed');
  };

  const openHistory = (event: MouseEvent<HTMLButtonElement>) => {
    controller.historyOpenerRef.current = event.currentTarget;
    void controller.openArticleHistory();
  };

  const closeHistoryView = () => {
    controller.setHistoryDialogOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-history-trigger="true"]')?.focus());
  };

  return (
    <main className="app-shell">
      <div className="shell-frame">
        <MainSidebar
          view={controller.view}
          root={controller.directory}
          mediaOperation={controller.mediaOperation}
          collapsed={mainCollapsed}
          colorMode={controller.displayedEditorAppearance.colorMode}
          onNavigate={controller.navigateView}
          onToggleCollapsed={() => toggleSidebar('mainCollapsed')}
          onSetColorMode={controller.setEditorColorMode}
          onOpenChangelog={() => setChangelogOpen(true)}
        />
        {controller.view === 'articles' && !historyViewOpen ? (
          <ArticleSidebar
            collapsed={articleSidebarCollapsed}
            mobileOpen={articleSidebarMobileOpen}
            onToggleCollapsed={() => toggleSidebar('articleCollapsed')}
            onCloseMobile={() => setArticleSidebarMobileOpen(false)}
          />
        ) : null}
        <section className="workspace">
          <EditorTopbar
            hidden={historyViewOpen}
            view={controller.view}
            articleMode={controller.articleMode}
            currentTitle={controller.currentTitle}
            currentProjectName={controller.currentProjectName}
            articleCollectionTitle={articleCollectionLabel(controller.selectedArticleCollection, controller.articleCollectionTitle, t)}
            article={controller.article}
            directory={controller.directory}
            currentArticleIsArchived={controller.currentArticleIsArchived}
            metadataWritable={controller.parseErrors.length === 0}
            mediaOperation={controller.mediaOperation}
            historyBusy={controller.historyBusy}
            isReadyToCopy={controller.isReadyToCopy}
            isCompiling={controller.isCompiling}
            onToggleArticleSidebar={toggleArticleSidebar}
            onShowOverview={() => controller.navigateArticleMode('overview')}
            onShowStatistics={() => setStatisticsOpen(true)}
            onCreateTemplate={() => { if (controller.directory) setTemplateSnapshot({ source: controller.article.source, dirty: controller.article.dirty, root: controller.directory, sessionKey: controller.contentLibraryRootSession, formatId: getFormatSnapshot().id }); }}
            onExport={() => { if (controller.directory) setExportSnapshot({ source: controller.article.source, body: controller.parsed.body, title: controller.currentTitle, dirty: controller.article.dirty, root: controller.directory, month: controller.article.month, folder: controller.article.folder, themeId: controller.article.theme.id, themeVersion: controller.article.theme.version, sessionKey: controller.contentLibraryRootSession, formatId: getFormatSnapshot().id }); }}
            onChangeTitle={(value) => controller.changeField('title', value)}
            onOpenHistory={openHistory}
            onSave={() => void controller.saveCurrent()}
            onCopy={() => void controller.copyRichText()}
            onCompile={() => void controller.updateCurrentStyles()}
            onCheckFormat={() => void controller.checkCurrentFormat()}
          />
          <OperationFeedback hideTrigger id="editor-operation" revision={statusEvent.current} announce={controller.view === 'articles' && controller.articleMode === 'editor' && controller.status.formatRevision === undefined && controller.status.tone !== 'neutral' && controller.status.notify !== false} notice={controller.status} tone={controller.status.tone} />
          <OperationFeedback hideTrigger id="workflow-settings" announce={controller.settingsNotice.notify !== false} notice={controller.directory ? controller.settingsNotice : null} tone={controller.settingsNotice.tone} lifetime={controller.settingsBusy ? { mode: 'locked' } : undefined} />

          <div className="workspace-main" hidden={historyViewOpen}>{children}</div>
          {historyViewOpen && historyRoot && historyArticle.month && historyArticle.folder ? (
            <ArticleHistoryView
              articleTitle={controller.currentTitle}
              currentSource={historyArticle.source}
              currentTheme={historyArticle.theme}
              currentFormat={historyArticle.renderSnapshot ?? getFormatSnapshot()}
              currentThemeValid={historyArticle.themeValid}
              currentDirty={historyArticle.dirty}
              month={historyArticle.month}
              folder={historyArticle.folder}
              root={historyRoot}
              mediaArticle={{ id: controller.currentArticleId, month: historyArticle.month, folder: historyArticle.folder }}
              snapshots={controller.historySnapshots}
              issues={controller.historyIssues}
              selectedId={controller.historySelectedId}
              busy={controller.historyBusy}
              canRestore={!controller.currentArticleIsArchived && historyArticle.themeValid && controller.documentTokenRef.current?.root === historyRoot && !controller.mediaOperationRef.current}
              canDelete={!controller.currentArticleIsArchived && controller.documentTokenRef.current?.root === historyRoot && !controller.mediaOperationRef.current}
              canSaveAs={Boolean(controller.articleList.find((item) => item.id === controller.currentArticleId && controller.article.themeValid && !item.parse.diagnostics.some((diagnostic) => diagnostic.level === 'error')))}
              refreshPending={controller.historyRefreshPending}
              notice={controller.historyNotice}
              months={controller.articleList.map((item) => item.month)}
              onClose={closeHistoryView}
              getReturnFocus={() => controller.historyOpenerRef.current}
              onSelect={controller.setHistorySelectedId}
              onManualSnapshot={() => void controller.createManualHistorySnapshot()}
              onRestore={(target) => void controller.restoreHistorySnapshot(target)}
              onDelete={controller.deleteHistorySnapshot}
              onSaveAs={controller.saveHistoryAsArticle}
              onToggleRetention={(target, retained) => void controller.toggleHistoryRetention(target, retained)}
              onRefreshHistory={() => void controller.refreshArticleHistory()}
            />
          ) : null}
        </section>
      </div>
      {statisticsOpen ? <ArticleStatisticsDialog title={controller.currentTitle} dirty={controller.article.dirty} statistics={articleStatisticsFromPreview(controller.previewRef.current, controller.parsed.canCopy && controller.article.themeValid && controller.compiledRevision === controller.revision && !format.error)} issue={!controller.parsed.canCopy || !controller.article.themeValid ? t("messages:uiFeedback.repairBeforeStatistics") : undefined} onClose={() => setStatisticsOpen(false)} /> : null}
      {templateSnapshot ? <CreateTemplateFromArticleDialog source={templateSnapshot.source} dirty={templateSnapshot.dirty} root={templateSnapshot.root} categories={controller.templateCategories} templates={controller.templates} isCurrent={() => controller.directoryRef.current === templateSnapshot.root && controller.contentLibraryRootSessionRef.current === templateSnapshot.sessionKey} onCreated={(template, formatIssueCount, hasLocalMedia) => {
        if (controller.directoryRef.current === templateSnapshot.root && controller.contentLibraryRootSessionRef.current === templateSnapshot.sessionKey) {
          controller.setTemplates(previous => [...previous.filter(item => item.id !== template.id), template].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')));
          controller.setStatus({ ...productLabel("appShell.starterTemplateCreated", { "templateName": template.name, "value": (formatIssueCount ? productReference("appShell.formatConcerns", { "formatIssueCount": formatIssueCount }) : ''), "value2": (hasLocalMedia ? productReference("appShell.localMediaFilesWereNotSavedWithTheTemplate") : '') }), tone: formatIssueCount || hasLocalMedia ? 'warning' : 'success' });
        }
        setTemplateSnapshot(null);
      }} onClose={() => setTemplateSnapshot(null)} /> : null}
      {exportSnapshot ? <ArticleExportDialog theme={controller.article.theme} onTransform={controller.updateArticle} getResourceRevision={() => controller.mediaRefreshRevisionRef.current} focusActive={!controller.formatCheck} source={exportSnapshot.source} title={exportSnapshot.title} dirty={exportSnapshot.dirty} root={exportSnapshot.root} month={exportSnapshot.month} folder={exportSnapshot.folder} visualAvailable={controller.parsed.canCopy && controller.article.themeValid} previewRef={controller.previewRef} isCurrent={() => {
        const current = controller.articleRef.current;
        return getFormatSnapshot().id === exportSnapshot.formatId && controller.directoryRef.current === exportSnapshot.root && controller.contentLibraryRootSessionRef.current === exportSnapshot.sessionKey
          && current.month === exportSnapshot.month && current.folder === exportSnapshot.folder
          && current.theme.id === exportSnapshot.themeId && current.theme.version === exportSnapshot.themeVersion
          && current.source === exportSnapshot.source;
      }} prepareVisual={controller.prepareVisualExport} onExported={(fileName, mediaFiles) => controller.setStatus({ ...productLabel("appShell.exported", { "fileName": fileName, "value": (mediaFiles === undefined ? '' : productReference("appShell.includedMediaFiles", { "mediaFiles": mediaFiles })) }), tone: 'success' })} onClose={() => setExportSnapshot(null)} /> : null}
      {changelogOpen ? <ChangelogDialog onClose={() => setChangelogOpen(false)} /> : null}
      <AppDialogs />
    </main>
  );
}
