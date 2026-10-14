'use client';

import { formatProductMessage, productCause, productLabel, productMessage } from "../../lib/i18n/productMessages";

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { getArticleOrganization, type EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleSummary } from '../../lib/types';
import type { ArticleMediaAsset, LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import { PageHeading } from '../global/PageHeading';
import { MediaManagementDialog } from './MediaManagementDialog';
import type { MediaEditRequest, MediaMutation, MediaReferenceScan } from '../../lib/mediaManagement';
import { useMediaPreferences } from '../../hooks/useMediaPreferences';
import { useMediaPagination } from '../../hooks/useMediaPagination';
import { mediaDirectoryImages } from '../../lib/mediaBrowsing';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { MediaDetails, MediaGallery, sortMediaAssets, MediaIcon, MediaImportButton, formatMediaBytes, mediaAssetKey } from './MediaGallery';
import { MediaToolbar, type MediaControl } from './MediaToolbar';
import { ArticleImagePreview } from './ArticleImagePreview';
import { MediaPagination } from './MediaPagination';
import { MediaPreviewDialog } from './MediaPreviewDialog';

type Props = {
  root: FileSystemDirectoryHandle | null; sessionKey: number; refreshSignal: number;
  articles: ArticleSummary[]; workspace: EditorWorkspace;
  isRootCurrent: (root: FileSystemDirectoryHandle, sessionKey: number) => boolean;
  onImport: (files: File[]) => Promise<MediaActionOutcome>;
  onAdopt: (asset: LibraryMediaAsset) => void;
  onManage: (operation: MediaMutation) => Promise<MediaActionOutcome>;
  currentReferenceCount: (assets: LibraryMediaAsset[]) => number | null;
  scanReferences: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
  currentArticleId: string; currentArticleTitle: string; canAdopt: boolean; busy: boolean;
};
function formatBytes(size: number, locale: 'zh-CN' | 'en-US'): string { return formatMediaBytes(size, locale); }
export function MediaLibrary({ root, sessionKey, refreshSignal, articles, workspace, isRootCurrent, onImport, onAdopt, onManage, currentReferenceCount, scanReferences, currentArticleId, currentArticleTitle, canAdopt, busy }: Props) {
  const { t } = useUITranslation('media');
  const library = useMediaLibrary({ root, sessionKey, refreshSignal, articles, isRootCurrent });
  const initialArticle = articles.some(article => article.id === currentArticleId);
  const [tab, setTab] = useState<'shared' | 'article'>(initialArticle ? 'article' : 'shared');
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [articleFilter, setArticleFilter] = useState(initialArticle ? currentArticleId : 'all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [activeControl, setActiveControl] = useState<MediaControl>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [management, setManagement] = useState<MediaEditRequest | null>(null);
  const [notice, setNotice] = useState<MediaActionOutcome | null>(null);
  const [preferences, setPreferences] = useMediaPreferences();
  const isCurrent = () => Boolean(root && isRootCurrent(root, sessionKey));
  const articleOptions = articles.filter(article => groupFilter === 'all' || (getArticleOrganization(workspace, article.id).projectId ?? 'unclassified') === groupFilter);
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visible = sortMediaAssets(library.assets.filter(asset => asset.kind === tab && (asset.kind === 'shared' || (articleFilter === 'all' || asset.articleId === articleFilter) && articleOptions.some(article => article.id === asset.articleId)) && `${asset.fileName} ${asset.kind === 'article' ? asset.articleTitle : ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)), preferences);
  const pagination = useMediaPagination(visible, [root, sessionKey, tab, query, groupFilter, articleFilter, preferences.sort, preferences.descending]);
  const selected = visible.find(asset => mediaAssetKey(asset) === selectedKey) ?? null;
  const expanded = library.assets.find(asset => mediaAssetKey(asset) === expandedKey) ?? null;
  const preview = library.assets.find(asset => mediaAssetKey(asset) === previewKey) ?? null;
  const picked = visible.filter(asset => selectedKeys.has(mediaAssetKey(asset)));
  const canUse = (asset: LibraryMediaAsset) => canAdopt && (asset.kind === 'shared' || asset.articleId === currentArticleId);
  const clearSelection = () => { setSelectedKey(null); setSelectedKeys(new Set()); setSelecting(false); setActiveControl(null); };
  const toggleSelection = (asset: LibraryMediaAsset) => {
    const key = mediaAssetKey(asset);
    setSelectedKeys(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const checkImage = (asset: LibraryMediaAsset) => { setSelecting(true); setActiveControl('selection'); toggleSelection(asset); };
  const edit = (type: MediaEditRequest['type'], assets: LibraryMediaAsset[]) => {
    if (!assets.length || busy) return;
    if (assets.some(asset => asset.kind === 'article' && getArticleOrganization(workspace, asset.articleId).archived)) { setNotice({ ok: false, tone: 'warning', ...productMessage("mediaLibrary.selectedAssetsIncludeArchivedArticlesUnarchiveThemBeforeMakingChanges") }); return; }
    setActiveControl(null); setManagement({ type, assets });
  };
  const manage = async (operation: MediaMutation) => {
    const result = await onManage(operation);
    if (isCurrent()) { setNotice(result); library.refresh(); if (result.ok) clearSelection(); else if (result.failedKeys?.length) { const failed = new Set(result.failedKeys); setSelectedKeys(failed); setManagement({ type: operation.type, assets: operation.assets.filter(asset => failed.has(mediaAssetKey(asset))) }); } }
    return result;
  };
  const importFiles = async (files: File[]) => {
    try { const result = await onImport(files); if (isCurrent()) { setNotice(result); if (result.ok) { setTab('shared'); setQuery(''); clearSelection(); } library.refresh(); } return result; }
    catch (error) { const result: MediaActionOutcome = { ok: false, ...productMessage("mediaLibrary.sharedImageImportFailed", { "cause": productCause(error) }), tone: 'error' }; if (isCurrent()) setNotice(result); return result; }
  };
  const details = (asset: LibraryMediaAsset) => <div className="grid gap-4"><MediaDetails key={mediaAssetKey(asset)} asset={asset} sessionKey={sessionKey} isCurrent={isCurrent} disabled={busy} onPreview={() => setPreviewKey(mediaAssetKey(asset))} onRename={() => edit('rename', [asset])} onDescribe={() => edit('describe', [asset])} onReplace={() => edit('replace', [asset])} onDelete={() => edit('delete', [asset])} /><p className="break-words text-xs text-muted">{canAdopt ? t('media:templates.currentArticle', { name: currentArticleTitle }) : t('media:ui.openAnEditableArticleBeforeAdoptingAnImage')}</p><button className="button button-primary" disabled={busy || !canUse(asset)} onClick={() => { setExpandedKey(null); onAdopt(asset); }}><MediaIcon name="use" />{t('media:ui.useInArticle')}</button></div>;
  return <section className="page-card gap-4 overflow-hidden" aria-labelledby="media-library-title">
    <PageHeading><div className="min-w-0"><p className="eyebrow">{t('media:ui.imageLibrary')}</p><h2 id="media-library-title" className="page-title font-heading">{t('media:ui.assets')}</h2><p className="mt-3 text-sm text-muted">{t('media:ui.organizeArticleImagesAndKeepReusableImagesIn')}</p></div><div className="toolbar-actions"><button className="button button-quiet" disabled={!root || busy || library.loading} onClick={library.refresh}><MediaIcon name="refresh" />{t('media:ui.refreshAssets')}</button><MediaImportButton disabled={!root} busy={busy} onImport={importFiles} /></div></PageHeading>
    {!root ? <div className="empty-state"><div><strong>{t('media:ui.chooseALibraryToViewImages')}</strong><p>{t('media:ui.openOrCreateALibraryInSettings')}</p></div></div> : <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto lg:overflow-hidden">
      <div className="grid shrink-0 gap-3 border-b border-line p-4">
        <MediaToolbar source={tab} onSourceChange={kind => { setTab(kind); clearSelection(); }} query={query} onQueryChange={value => { setQuery(value); clearSelection(); }} preferences={preferences} onPreferencesChange={setPreferences} activeControl={activeControl} onControlChange={setActiveControl} disabled={busy} count={library.loading ? t('media:ui.loading') : t('media:templates.showImages', { count: visible.length })}
          groups={{ value: groupFilter, options: [{ value: 'all', label: t('media:ui.allGroups') }, { value: 'unclassified', label: t('media:ui.ungrouped') }, ...workspace.projects.map(project => ({ value: project.id, label: project.name }))], onChange: value => { setGroupFilter(value); setArticleFilter('all'); clearSelection(); } }}
          articles={{ value: articleFilter, options: [{ value: 'all', label: t('media:ui.allArticles') }, ...articleOptions.map(article => ({ value: article.id, label: article.parse.metadata.title }))], onChange: value => { setArticleFilter(value); clearSelection(); } }}
          selection={{ active: selecting, count: picked.length, hasVisible: Boolean(pagination.items.length), onEnable: () => setSelecting(true), onAll: () => setSelectedKeys(previous => new Set([...previous, ...pagination.items.map(mediaAssetKey)])), onTransfer: () => edit('transfer', picked), onDelete: () => edit('delete', picked), onCancel: clearSelection }} />
      </div>
      {library.issues.length ? <div className="media-library-issues shrink-0" role="status">{library.issues.map(issue => <p key={issue}>{formatProductMessage(issue, t)}</p>)}</div> : null}
      <div className="flex min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden"><div className="flex min-w-0 flex-1 flex-col lg:min-h-0"><div className="min-w-0 flex-1 p-4 lg:min-h-0 lg:overflow-x-clip lg:overflow-y-auto">
        {visible.length ? <MediaGallery assets={pagination.items} selected={selectedKey} selectedKeys={selecting ? selectedKeys : undefined} columns={preferences.columns} onToggleSelection={checkImage} onSelect={asset => { const key = mediaAssetKey(asset); if (selecting) { toggleSelection(asset); } else { setSelectedKey(key); if (window.matchMedia('(width < 64rem)').matches) setExpandedKey(key); } }} onRename={asset => edit('rename', [asset])} onDelete={asset => edit('delete', [asset])} onAdopt={onAdopt} canAdopt={canUse} onNotice={setNotice} sessionKey={sessionKey} isCurrent={isCurrent} disabled={busy} /> : <div className="grid min-h-48 place-content-center justify-items-center gap-3 text-center text-sm text-muted" role="status"><MediaIcon name="image" /><p>{library.loading ? t('media:ui.loadingImages') : normalizedQuery || articleFilter !== 'all' || groupFilter !== 'all' ? t('media:ui.noMatchingImagesTryClearingTheFilters') : tab === 'shared' ? t('media:ui.noSharedImagesYetImportImagesToReuse') : t('media:ui.noArticleImagesYetChooseImagesOrPaste')}</p></div>}
      </div><MediaPagination {...pagination} disabled={busy || library.loading} /></div><aside className="hidden min-h-0 w-80 shrink-0 overflow-x-clip overflow-y-auto border-l border-line p-4 lg:block" aria-label={t('media:ui.assetDetails')}>{selected ? details(selected) : <p className="text-sm text-muted">{t('media:ui.selectAnImageToViewDetails')}</p>}</aside></div>
      </div>
      {notice ? <p className="status-copy shrink-0 border-t border-line p-4" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
    </div>}
    {expanded && isCurrent() ? <DialogFrame titleId="media-detail-title" onClose={() => setExpandedKey(null)} dismissible={!busy && !management && !preview} focusActive={!management && !preview} large wide><DialogHeader titleId="media-detail-title" eyebrow={t('media:ui.imageDetailsAlternative')} title={t('media:ui.imageDetails')} onClose={() => setExpandedKey(null)} closeDisabled={busy || Boolean(management) || Boolean(preview)} /><div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto p-4">{details(expanded)}</div><DialogFooter><DialogActions><DialogButton disabled={busy || Boolean(management) || Boolean(preview)} onClick={() => setExpandedKey(null)}><MediaIcon name="close" />{t('common:actions.close')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}
    {management && isCurrent() ? <MediaManagementDialog request={management} articles={articles.filter(article => !getArticleOrganization(workspace, article.id).archived)} busy={busy} isCurrent={isCurrent} currentReferences={currentReferenceCount(management.assets)} scanReferences={scanReferences} onSubmit={manage} onClose={() => setManagement(null)} /> : null}
    {preview && isCurrent() ? <MediaPreviewDialog key={`${sessionKey}:${mediaAssetKey(preview)}`} initial={preview} images={sortMediaAssets(mediaDirectoryImages(library.assets, preview), preferences)} sessionKey={sessionKey} isCurrent={isCurrent} onClose={() => setPreviewKey(null)} /> : null}
  </section>;
}

export type MediaRenameOutcome = { fileCreated: boolean; fileName?: string; message: string; tone: 'success' | 'warning' };

export function MediaAssetDialog({
  asset,
  canRename,
  renameBlockedReason,
  busy,
  sessionKey,
  isCurrent,
  onClose,
  onRename,
}: {
  asset: ArticleMediaAsset;
  canRename: boolean;
  renameBlockedReason?: string;
  busy: boolean;
  sessionKey: number;
  isCurrent: () => boolean;
  onClose: () => void;
  onRename: (asset: ArticleMediaAsset, baseName: string) => Promise<MediaRenameOutcome>;
}) {
  const { locale } = useUILocale();
  const { t } = useUITranslation('dialogs');
  const [baseName, setBaseName] = useState(() => asset.fileName.replace(/\.[^.]+$/, ''));
  const [notice, setNotice] = useState<{ label: string; tone: 'success' | 'warning' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileCreated, setFileCreated] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef(onClose);
  const canRenameRef = useRef(canRename);
  closeRef.current = onClose;
  canRenameRef.current = canRename;
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const extension = asset.fileName.match(/\.[^.]+$/)?.[0] ?? '';

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => (canRenameRef.current ? inputRef.current : dialogRef.current)?.focus());
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  const saveAsNewImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRename || busy || saving || fileCreated) return;
    const nextBaseName = baseName.trim();
    if (!nextBaseName) {
      setNotice({ ...productLabel("mediaLibrary.theImageNameCannotBeEmpty"), tone: 'error' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const result = await onRename(asset, nextBaseName);
      setNotice({ label: result.message, tone: result.tone });
      if (result.fileCreated) {
        setFileCreated(true);
        if (result.fileName) setBaseName(result.fileName.replace(/\.[^.]+$/, ''));
      }
    } catch (error) {
      setNotice({ label: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !saving) onClose();
  };

  return (
    <div className="dialog-backdrop media-dialog-backdrop" role="presentation" onMouseDown={onBackdropMouseDown}>
      <section ref={dialogRef} className="dialog-card media-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="media-asset-title" aria-describedby="media-asset-description" tabIndex={-1}>
        <header className="dialog-header">
          <div>
            <p className="eyebrow">{t('common:eyebrows.localArticleImage')}</p>
            <h2 className="font-heading dialog-title" id="media-asset-title">{t('dialogs:imageRename.viewAndRename')}</h2>
          </div>
          <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>{t('common:actions.close')}</button>
        </header>
        <div className="media-asset-preview">
          <ArticleImagePreview handle={asset.handle} fileName={asset.fileName} alt={asset.fileName} variant="dialog" sessionKey={`${sessionKey}:${asset.articleId}:${asset.fileName}`} isCurrent={isCurrent} />
        </div>
        <div className="media-asset-details" id="media-asset-description">
          <strong>{asset.fileName}</strong>
          <span>{asset.articleTitle} · {asset.month}</span>
          <code>{`media/image/${asset.fileName}`} · {formatBytes(asset.size, locale)} · {asset.mimeType}</code>
        </div>
        <form className="media-asset-rename" onSubmit={(event) => void saveAsNewImage(event)}>
          <label className="field-stack">
            <span className="field-label">{t('dialogs:imageRename.namePlaceholder')}</span>
            <span className="media-asset-name-input">
              <input ref={inputRef} className="field" type="text" maxLength={80} value={baseName} onChange={(event) => setBaseName(event.target.value)} disabled={!canRename || busy || saving || fileCreated} />
              <code aria-hidden="true">{extension}</code>
            </span>
          </label>
          <p className="text-xs-note text-muted">{t('dialogs:imageRename.referenceScope')}</p>
          {!canRename && renameBlockedReason ? <p className="status-copy" data-tone="warning" role="status">{renameBlockedReason}</p> : null}
          {notice ? <p className="status-copy" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>{t('dialogs:imageRename.done')}</button>
            <button className="button button-primary" type="submit" disabled={!canRename || busy || saving || fileCreated}>{saving || busy ? t('dialogs:imageRename.saving') : fileCreated ? t('dialogs:imageRename.saved') : t('dialogs:imageRename.saveAsNew')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
