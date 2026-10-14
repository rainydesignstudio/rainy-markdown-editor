'use client';

import { useUITranslation } from './UILocaleProvider';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ArticleMode, ViewKey } from '../../hooks/useEditorController';
import type { WorkingArticle } from '../../lib/types';

type IconName = 'menu' | 'back' | 'edit' | 'statistics' | 'history' | 'template' | 'export' | 'check' | 'save' | 'copy' | 'refresh';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'menu') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  if (name === 'back') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m10 5-7 7 7 7M3 12h18" /></svg>;
  if (name === 'edit') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m4 20 4.4-.9L19 8.5 15.5 5 4.9 15.6 4 20ZM13.5 7l3.5 3.5" /></svg>;
  if (name === 'statistics') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 20h16M6 17v-5h3v5M11 17V7h3v10M16 17v-8h3v8" /></svg>;
  if (name === 'history') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 8a9 9 0 1 1-1 5M4 4v4h4M12 7v5l3 2" /></svg>;
  if (name === 'template') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 3h9l4 4v4M14 3v4h4M5 3v18h8M8 11h5M8 15h3M18 15v7M14.5 18.5h7" /></svg>;
  if (name === 'export') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M5 3h14v7M5 3v18h8M8 7h7M8 11h4m2 6 3 3 5-6" /></svg>;
  if (name === 'save') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h13l3 3v13H4V4Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></svg>;
  if (name === 'copy') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>;
}

export { Icon as EditorActionIcon };

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
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(currentTitle);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const disabled = mediaOperation !== null || historyBusy || currentArticleIsArchived;
  const isEditor = view === 'articles' && articleMode === 'editor';

  useEffect(() => setTitleDraft(currentTitle), [currentTitle]);
  useEffect(() => { if (currentArticleIsArchived) setEditingTitle(false); }, [currentArticleIsArchived]);
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const finishTitleEdit = (commit: boolean) => {
    if (commit && titleDraft.trim()) onChangeTitle(titleDraft.trim());
    else setTitleDraft(currentTitle);
    setEditingTitle(false);
  };

  const viewTitle = view === 'articles' ? articleCollectionTitle : t('shell:views.' + view);

  return (
    <header hidden={hidden} className="workspace-toolbar">
      <div className="toolbar-context">
        {view === 'articles' ? (
          <button className="toolbar-icon-button article-sidebar-toggle" type="button" aria-label={t('articles:navigation.show')} data-tooltip={t('articles:navigation.label')} onClick={onToggleArticleSidebar}>
            <Icon name="menu" /><span className="toolbar-action-copy">{t('shell:navigation.articles')}</span>
          </button>
        ) : null}
        {isEditor ? (
          <div className="title-stack">
            <button className="return-crumb" type="button" onClick={onShowOverview} aria-label={currentArticleIsArchived ? t('articles:returnArchive') : t('articles:returnOverview')} data-tooltip={t('common:actions.back')}>
              <span className="return-crumb-icon" aria-hidden="true"><Icon name="back" /></span><span>{t('shell:navigation.articles')}</span>{currentArticleIsArchived ? <><span className="crumb-separator">/</span><span>{t('articles:collections.archived')}</span></> : null}{currentProjectName ? <><span className="crumb-separator">/</span><span className="crumb-project">{currentProjectName}</span></> : null}
            </button>
            {currentArticleIsArchived ? (
              <div className="flex min-w-0 items-center gap-2"><h1 className="font-heading truncate text-base font-semibold text-primary">{currentTitle}</h1><span className="shrink-0 rounded-md border border-line bg-rail px-2 py-0.5 text-xs font-semibold text-faint">{t('articles:readOnly')}</span></div>
            ) : editingTitle ? (
              <input
                ref={titleInputRef}
                className="title-edit-input font-heading"
                aria-label={t('editor:title.edit')}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  if (suppressBlurCommitRef.current) { suppressBlurCommitRef.current = false; return; }
                  finishTitleEdit(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); finishTitleEdit(true); }
                  if (event.key === 'Escape') { event.preventDefault(); suppressBlurCommitRef.current = true; finishTitleEdit(false); }
                }}
              />
            ) : (
              <button className="title-trigger font-heading" type="button" onClick={() => setEditingTitle(true)} data-tooltip={t('editor:title.change')} disabled={!directory || currentArticleIsArchived || !metadataWritable}>
                <span>{currentTitle}</span><span className="title-edit-icon" aria-hidden="true"><Icon name="edit" /></span>
              </button>
            )}
          </div>
        ) : (
          <div className="toolbar-title">
            <p className="eyebrow">{view === 'articles' ? t('shell:eyebrow.articles') : t('shell:eyebrow.workspace')}</p>
            <h1 className="font-heading toolbar-heading">{viewTitle}</h1>
          </div>
        )}
      </div>

      <div className="toolbar-actions">
        {isEditor ? (
          <>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.statistics')} data-tooltip={t('editor:toolbar.statistics')} onClick={onShowStatistics}><Icon name="statistics" /><span className="toolbar-action-copy">{t('editor:toolbar.statistics')}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.history')} data-tooltip={t('editor:toolbar.history')} data-history-trigger="true" disabled={disabled || !directory || !article.folder} onClick={onOpenHistory}><Icon name="history" /><span className="toolbar-action-copy">{t('editor:toolbar.historyShort')}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.createTemplate')} data-tooltip={t('editor:toolbar.template')} disabled={!directory || mediaOperation !== null || historyBusy} onClick={onCreateTemplate}><Icon name="template" /><span className="toolbar-action-copy">{t('editor:toolbar.templateShort')}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.export')} data-tooltip={t('editor:toolbar.export')} disabled={!directory || mediaOperation !== null || historyBusy} onClick={onExport}><Icon name="export" /><span className="toolbar-action-copy">{t('common:actions.export')}</span></button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.updateStyles')} data-tooltip={isCompiling ? t('editor:toolbar.generating') : t('editor:toolbar.updateStyles')} disabled={disabled || isCompiling || !directory} onClick={onCompile}><Icon name="refresh" /><span className="toolbar-action-copy">{isCompiling ? t('editor:toolbar.generatingShort') : t('editor:toolbar.updateStyles')}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.check')} data-tooltip={t('editor:toolbar.check')} disabled={!directory || mediaOperation !== null || historyBusy || isCompiling || !article.themeValid} onClick={onCheckFormat}><Icon name="check" /><span className="toolbar-action-copy">{t('editor:toolbar.check')}</span></button>
            <button className="toolbar-icon-button toolbar-icon-button--primary" type="button" aria-label={t('editor:toolbar.save')} data-tooltip={t('editor:toolbar.save')} disabled={!article.dirty || !directory || disabled} onClick={onSave}><Icon name="save" /><span className="toolbar-action-copy">{t('common:actions.save')}</span></button>
            <button className="toolbar-icon-button" type="button" aria-label={t('editor:toolbar.copy')} data-tooltip={t('editor:toolbar.copy')} disabled={!isReadyToCopy || isCompiling || disabled} onClick={onCopy}><Icon name="copy" /><span className="toolbar-action-copy">{t('common:actions.copy')}</span></button>
          </>
        ) : null}
      </div>
    </header>
  );
}
