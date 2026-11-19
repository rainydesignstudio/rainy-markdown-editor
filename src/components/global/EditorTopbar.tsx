'use client';

import { ButtonBar } from './ButtonBar';
import { IconButton } from './IconButton';
import { ContentIcon } from './ContentIcon';
import { useUITranslation } from './UILocaleProvider';
import { useLibraryCapabilities } from '../../hooks/useLibraryCapability';
import { EXPORT_CAPABILITIES } from '../../lib/article-format/libraryConfiguration';

import type { MouseEvent } from 'react';
import { EditableArticleTitle } from '../editor/EditableArticleTitle';
import type { ArticleMode, ViewKey } from '../../hooks/useEditorController';
import type { WorkingArticle } from '../../lib/types';

type Props = {
  hidden?: boolean;
  view: ViewKey;
  articleMode: ArticleMode;
  currentTitle: string;
  currentProjectName: string | null;
  articleCollectionTitle: string;
  article: WorkingArticle;
  directory: FileSystemDirectoryHandle | null;
  currentArticleIsArchived: boolean;
  metadataWritable: boolean;
  mediaOperation: 'import' | 'rename' | null;
  historyBusy: boolean;
  isReadyToCopy: boolean;
  isCompiling: boolean;
  onToggleArticleSidebar: () => void;
  onShowOverview: () => void;
  onShowStatistics: () => void;
  onCreateTemplate: () => void;
  onExport: () => void;
  onChangeTitle: (value: string) => void;
  onOpenHistory: (event: MouseEvent<HTMLButtonElement>) => void;
  onSave: () => void;
  onCopy: () => void;
  onCompile: () => void;
  onCheckFormat: () => void;
};

export function EditorTopbar({
  hidden = false,
  view,
  articleMode,
  currentTitle,
  currentProjectName,
  articleCollectionTitle,
  article,
  directory,
  currentArticleIsArchived,
  metadataWritable,
  mediaOperation,
  historyBusy,
  isReadyToCopy,
  isCompiling,
  onToggleArticleSidebar,
  onShowOverview,
  onShowStatistics,
  onCreateTemplate,
  onExport,
  onChangeTitle,
  onOpenHistory,
  onSave,
  onCopy,
  onCompile,
  onCheckFormat,
}: Props) {
  const { t } = useUITranslation('shell');
  const capabilities = useLibraryCapabilities();
  const copyCapability = capabilities.get('copyRichText');
  const exportCapabilities = Object.values(EXPORT_CAPABILITIES).map(key => capabilities.get(key));
  const canExport = exportCapabilities.some(state => state.enabled);
  const exportReason = canExport ? undefined : exportCapabilities[0].reason;
  const disabled = mediaOperation !== null || historyBusy || currentArticleIsArchived;
  const isEditor = view === 'articles' && articleMode === 'editor';

  const viewTitle = view === 'articles' ? articleCollectionTitle : t('shell:views.' + view);

  return (
    <header hidden={hidden} className="workspace-toolbar">
      <div className="toolbar-context">
        {view === 'articles' ? (
          <IconButton variant="toolbar" icon="menu" className="article-sidebar-toggle" type="button" aria-label={t('articles:navigation.show')} tooltip={t('articles:navigation.label')} onClick={onToggleArticleSidebar}>
            <span className="toolbar-action-copy">{t('shell:navigation.articles')}</span>
          </IconButton>
        ) : null}
        {isEditor ? (
          <div className="title-stack">
            <button className="return-crumb" type="button" onClick={onShowOverview} aria-label={currentArticleIsArchived ? t('articles:returnArchive') : t('articles:returnOverview')} data-tooltip={t('common:actions.back')}>
              <span className="return-crumb-icon" aria-hidden="true"><ContentIcon name="back" /></span><span>{t('shell:navigation.articles')}</span>{currentArticleIsArchived ? <><span className="crumb-separator">/</span><span>{t('articles:collections.archived')}</span></> : null}{currentProjectName ? <><span className="crumb-separator">/</span><span className="crumb-project">{currentProjectName}</span></> : null}
            </button>
            {currentArticleIsArchived ? (
              <div className="flex min-w-0 items-center gap-2"><h1 className="font-heading truncate text-base font-semibold text-primary">{currentTitle}</h1><span className="shrink-0 rounded-md border border-line bg-rail px-2 py-0.5 text-xs font-semibold text-faint">{t('articles:readOnly')}</span></div>
            ) : <EditableArticleTitle value={currentTitle} onChange={onChangeTitle} disabled={!directory || disabled || !metadataWritable} />}
          </div>
        ) : (
          <div className="toolbar-title">
            <p className="eyebrow">{view === 'articles' ? t('shell:eyebrow.articles') : t('shell:eyebrow.workspace')}</p>
            <h1 className="font-heading toolbar-heading">{viewTitle}</h1>
          </div>
        )}
      </div>

      <ButtonBar className="w-full flex-nowrap overflow-x-auto md:w-auto md:justify-end md:overflow-visible" label={t('editor:toolbar.actions')} id={view === 'knowledge' ? 'knowledge-action-bar' : undefined}>
        {isEditor ? (
          <>
            <IconButton variant="toolbar" icon="statistics" type="button" aria-label={t('editor:toolbar.statistics')} tooltip={t('editor:toolbar.statistics')} onClick={onShowStatistics}><span className="toolbar-action-copy">{t('editor:toolbar.statistics')}</span></IconButton>
            <IconButton variant="toolbar" icon="history" type="button" aria-label={t('editor:toolbar.history')} tooltip={t('editor:toolbar.history')} data-history-trigger="true" disabled={disabled || !directory || !article.folder} onClick={onOpenHistory}><span className="toolbar-action-copy">{t('editor:toolbar.historyShort')}</span></IconButton>
            <IconButton variant="toolbar" icon="templateAdd" type="button" aria-label={t('editor:toolbar.createTemplate')} tooltip={t('editor:toolbar.template')} disabled={!directory || mediaOperation !== null || historyBusy} onClick={onCreateTemplate}><span className="toolbar-action-copy">{t('editor:toolbar.templateShort')}</span></IconButton>
            <span className="inline-flex" title={exportReason} tabIndex={!canExport ? 0 : undefined} aria-label={exportReason}><IconButton variant="toolbar" icon="download" type="button" aria-label={t('editor:toolbar.export')} tooltip={t('editor:toolbar.export')} disabled={!directory || mediaOperation !== null || historyBusy || !canExport} onClick={() => { if (canExport) onExport(); }}><span className="toolbar-action-copy">{t('common:actions.export')}</span></IconButton></span>
            <span className="toolbar-divider" aria-hidden="true" />
            <IconButton variant="toolbar" icon="reset" type="button" aria-label={t('editor:toolbar.updateStyles')} tooltip={isCompiling ? t('editor:toolbar.generating') : t('editor:toolbar.updateStyles')} disabled={disabled || isCompiling || !directory} onClick={onCompile}><span className="toolbar-action-copy">{isCompiling ? t('editor:toolbar.generatingShort') : t('editor:toolbar.updateStyles')}</span></IconButton>
            <IconButton variant="toolbar" icon="inspectDocument" type="button" aria-label={t('editor:toolbar.check')} tooltip={t('editor:toolbar.check')} disabled={!directory || mediaOperation !== null || historyBusy || isCompiling || !article.themeValid} onClick={onCheckFormat}><span className="toolbar-action-copy">{t('editor:toolbar.check')}</span></IconButton>
            <IconButton variant="toolbarPrimary" icon="save" type="button" aria-label={t('editor:toolbar.save')} tooltip={t('editor:toolbar.save')} disabled={!article.dirty || !directory || disabled} onClick={onSave}><span className="toolbar-action-copy">{t('common:actions.save')}</span></IconButton>
            <span className="inline-flex" title={copyCapability.reason} tabIndex={!copyCapability.enabled ? 0 : undefined} aria-label={copyCapability.reason}><IconButton variant="toolbar" icon="copy" type="button" aria-label={t('editor:toolbar.copy')} tooltip={t('editor:toolbar.copy')} disabled={!isReadyToCopy || isCompiling || disabled || !copyCapability.enabled} onClick={() => { if (copyCapability.enabled) onCopy(); }}><span className="toolbar-action-copy">{t('common:actions.copy')}</span></IconButton></span>
          </>
        ) : null}
      </ButtonBar>
    </header>
  );
}
