'use client';

import { formatProductMessage, productCause, productLabel, productMessage } from "../../lib/i18n/productMessages";

import { useUITranslation, useUILocale } from '../global/UILocaleProvider';

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { getArticleOrganization, type EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleSummary } from '../../lib/types';
import type { ArticleMediaAsset, LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import { PageHeading } from '../global/PageHeading';
import { MediaManagementDialog } from './MediaManagementDialog';
import { useDraftLocation, useEditingDraft } from '../global/EditingDrafts';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
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
import { MediaImportDialog } from './MediaImportDialog';
import { RESOURCE_TYPES, resourceType } from '../../lib/resources/types';
import { useImageZoom } from '../../hooks/useImageZoom';
import { IconButton } from '../global/IconButton';
import { formatUINumber } from '../../lib/i18n/formatters';

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
  const [typeFilter, setTypeFilter] = useState('all');
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
  const [dropRequest, setDropRequest] = useState<{ files: File[]; root: FileSystemDirectoryHandle; sessionKey: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  useEffect(() => { setDropRequest(null); setDragging(false); dragDepth.current = 0; }, [root, sessionKey]);
  const [preferences, setPreferences] = useMediaPreferences();
  const isCurrent = () => Boolean(root && isRootCurrent(root, sessionKey));
  const dropIsCurrent = () => Boolean(dropRequest && dropRequest.root === root && dropRequest.sessionKey === sessionKey && isRootCurrent(dropRequest.root, dropRequest.sessionKey));
  const canDrop = Boolean(root && !busy && !management && !previewKey && !expandedKey && !dropRequest && isCurrent());
  const isFileDrag = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes('Files');
  const selectUpload = (files: File[]) => { if (root && files.length && canDrop) { setActiveControl(null); setDropRequest({ files, root, sessionKey }); } };
  const dropFiles = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false);
    if (!canDrop || !root) return;
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) { setNotice({ ok: false, tone: 'warning', ...productMessage('mediaLibrary.dropContainsNoFiles') }); return; }
    setActiveControl(null); setDropRequest({ files, root, sessionKey });
  };
  const articleOptions = articles.filter(article => groupFilter === 'all' || (getArticleOrganization(workspace, article.id).projectId ?? 'unclassified') === groupFilter);
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visible = sortMediaAssets(library.assets.filter(asset => asset.kind === tab && (typeFilter === 'all' || (asset.storage === 'file' ? resourceType(asset.fileName, asset.mimeType).id : 'image') === typeFilter) && (asset.kind === 'shared' || (articleFilter === 'all' || asset.articleId === articleFilter) && articleOptions.some(article => article.id === asset.articleId)) && `${asset.fileName} ${asset.kind === 'article' ? asset.articleTitle : ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)), preferences);
  const pagination = useMediaPagination(visible, [root, sessionKey, tab, query, typeFilter, groupFilter, articleFilter, preferences.sort, preferences.descending]);
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
    try { const result = await onImport(files); if (isCurrent()) { setNotice(result); if (result.ok) { setTab('shared'); setQuery(''); setTypeFilter('all'); clearSelection(); } library.refresh(); } return result; }
    catch (error) { const result: MediaActionOutcome = { ok: false, ...productMessage("mediaLibrary.sharedImageImportFailed", { "cause": productCause(error) }), tone: 'error' }; if (isCurrent()) setNotice(result); return result; }
  };
  const details = (asset: LibraryMediaAsset) => <div className="grid gap-4"><MediaDetails key={mediaAssetKey(asset)} asset={asset} sessionKey={sessionKey} isCurrent={isCurrent} onNotice={setNotice} disabled={busy} onPreview={asset.storage === 'file' ? undefined : () => setPreviewKey(mediaAssetKey(asset))} onRename={() => edit('rename', [asset])} onDescribe={() => edit('describe', [asset])} onReplace={() => edit('replace', [asset])} onDelete={() => edit('delete', [asset])} /><p className="break-words text-xs text-muted">{canAdopt ? t('media:templates.currentArticle', { name: currentArticleTitle }) : t('media:ui.openAnEditableArticleBeforeAdoptingAnImage')}</p><button className="button button-primary" disabled={busy || !canUse(asset)} onClick={() => { setExpandedKey(null); onAdopt(asset); }}><MediaIcon name="use" />{t('media:ui.useInArticle')}</button></div>;
  return <section className="page-card gap-4 overflow-hidden data-[dragging=true]:ring-2 data-[dragging=true]:ring-accent" data-dragging={dragging} aria-labelledby="media-library-title"
    onDragEnter={event => { if (isFileDrag(event)) { event.preventDefault(); if (canDrop) { dragDepth.current++; setDragging(true); } } }}
    onDragOver={event => { if (isFileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = canDrop ? 'copy' : 'none'; } }}
    onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
    onDrop={dropFiles}>
    <PageHeading><div className="min-w-0"><p className="eyebrow">{t('media:ui.imageLibrary')}</p><h2 id="media-library-title" className="page-title font-heading">{t('media:ui.assets')}</h2><p className="mt-3 text-sm text-muted">{t('media:ui.organizeArticleImagesAndKeepReusableImagesIn')}</p></div><div className="toolbar-actions"><button className="button button-quiet" disabled={!root || busy || library.loading} onClick={library.refresh}><MediaIcon name="refresh" />{t('media:ui.refreshAssets')}</button><MediaImportButton disabled={!root} busy={busy} allResources onSelect={selectUpload} /></div></PageHeading>
    {dragging ? <p className="text-sm text-accent-text" role="status">{t('media:upload.dropHint')}</p> : null}
    {!root ? <div className="empty-state"><div><strong>{t('media:ui.chooseALibraryToViewImages')}</strong><p>{t('media:ui.openOrCreateALibraryInSettings')}</p></div></div> : <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto lg:overflow-hidden">
      <div className="grid shrink-0 gap-3 border-b border-line p-4">
        <MediaToolbar resourceLabels source={tab} onSourceChange={kind => { setTab(kind); clearSelection(); }} query={query} onQueryChange={value => { setQuery(value); clearSelection(); }} preferences={preferences} onPreferencesChange={setPreferences} activeControl={activeControl} onControlChange={setActiveControl} disabled={busy} count={library.loading ? t('media:ui.loading') : t('media:templates.showImages', { count: visible.length })}
          types={{ value: typeFilter, options: [{ value: 'all', label: t('messages:resources.allTypes') }, ...RESOURCE_TYPES.map(type => ({ value: type.id, label: t('messages:resources.typeNames.' + type.id) }))], onChange: value => { setTypeFilter(value); clearSelection(); } }}
          groups={{ value: groupFilter, options: [{ value: 'all', label: t('media:ui.allGroups') }, { value: 'unclassified', label: t('media:ui.ungrouped') }, ...workspace.projects.map(project => ({ value: project.id, label: project.name }))], onChange: value => { setGroupFilter(value); setArticleFilter('all'); clearSelection(); } }}
          articles={{ value: articleFilter, options: [{ value: 'all', label: t('media:ui.allArticles') }, ...articleOptions.map(article => ({ value: article.id, label: article.parse.metadata.title }))], onChange: value => { setArticleFilter(value); clearSelection(); } }}
          selection={{ active: selecting, count: picked.length, hasVisible: Boolean(pagination.items.length), onEnable: () => setSelecting(true), onAll: () => setSelectedKeys(previous => new Set([...previous, ...pagination.items.map(mediaAssetKey)])), onTransfer: () => edit('transfer', picked), onDelete: () => edit('delete', picked), onCancel: clearSelection }} />
      </div>
      {library.issues.length ? <div className="media-library-issues shrink-0" role="status">{library.issues.map(issue => <p key={issue}>{formatProductMessage(issue, t)}</p>)}</div> : null}
      <div className="flex min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden"><div className="flex min-w-0 flex-1 flex-col lg:min-h-0"><div className="min-w-0 flex-1 p-4 lg:min-h-0 lg:overflow-x-clip lg:overflow-y-auto">
        {visible.length ? <MediaGallery assets={pagination.items} selected={selectedKey} selectedKeys={selecting ? selectedKeys : undefined} columns={preferences.columns} onToggleSelection={checkImage} onSelect={asset => { const key = mediaAssetKey(asset); if (selecting) { toggleSelection(asset); } else { setSelectedKey(key); if (window.matchMedia('(width < 64rem)').matches) setExpandedKey(key); } }} onRename={asset => edit('rename', [asset])} onDelete={asset => edit('delete', [asset])} onAdopt={onAdopt} canAdopt={canUse} onNotice={setNotice} sessionKey={sessionKey} isCurrent={isCurrent} disabled={busy} /> : <div className="grid min-h-48 place-content-center justify-items-center gap-3 text-center text-sm text-muted" role="status"><MediaIcon name="image" /><p>{library.loading ? t('media:ui.loadingImages') : normalizedQuery || typeFilter !== 'all' || articleFilter !== 'all' || groupFilter !== 'all' ? t('media:ui.noMatchingImagesTryClearingTheFilters') : tab === 'shared' ? t('media:ui.noSharedImagesYetImportImagesToReuse') : t('media:ui.noArticleImagesYetChooseImagesOrPaste')}</p></div>}
      </div><MediaPagination resourceLabels {...pagination} disabled={busy || library.loading} /></div><aside className="hidden min-h-0 w-80 shrink-0 overflow-x-clip overflow-y-auto border-l border-line p-4 lg:block" aria-label={t('media:ui.assetDetails')}>{selected ? details(selected) : <p className="text-sm text-muted">{t('media:ui.selectAnImageToViewDetails')}</p>}</aside></div>
      </div>
      {notice ? <p className="status-copy shrink-0 border-t border-line p-4" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
    </div>}
    {expanded && isCurrent() ? <DialogFrame titleId="media-detail-title" onClose={() => setExpandedKey(null)} dismissible={!busy && !management && !preview} focusActive={!management && !preview} large wide><DialogHeader titleId="media-detail-title" eyebrow={t(expanded.storage === 'file' ? 'messages:resources.fileDetailsEyebrow' : 'media:ui.imageDetailsAlternative')} title={t(expanded.storage === 'file' ? 'messages:resources.fileDetails' : 'media:ui.imageDetails')} onClose={() => setExpandedKey(null)} closeDisabled={busy || Boolean(management) || Boolean(preview)} /><div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto p-4">{details(expanded)}</div><DialogFooter><DialogActions><DialogButton disabled={busy || Boolean(management) || Boolean(preview)} onClick={() => setExpandedKey(null)}><MediaIcon name="close" />{t('common:actions.close')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}
    {management && isCurrent() ? <MediaManagementDialog request={management} articles={articles.filter(article => !getArticleOrganization(workspace, article.id).archived)} busy={busy} isCurrent={isCurrent} currentReferences={currentReferenceCount(management.assets)} scanReferences={scanReferences} onSubmit={manage} onClose={() => setManagement(null)} /> : null}
    {preview && isCurrent() ? <MediaPreviewDialog key={`${sessionKey}:${mediaAssetKey(preview)}`} initial={preview} images={sortMediaAssets(mediaDirectoryImages(library.assets, preview), preferences)} sessionKey={sessionKey} isCurrent={isCurrent} onClose={() => setPreviewKey(null)} /> : null}
    {dropRequest && dropIsCurrent() ? <MediaImportDialog allResources files={dropRequest.files} libraryName={dropRequest.root.name} busy={busy} isCurrent={dropIsCurrent} onImport={files => dropIsCurrent() ? importFiles(files) : Promise.resolve({ ok: false, tone: 'warning', ...productMessage('mediaLibrary.dropTargetChanged') })} onClose={() => setDropRequest(null)} /> : null}
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
  const [departure, setDeparture] = useState(false);
  const zoom = useImageZoom('width', `${sessionKey}:${asset.articleId}:${asset.fileName}`);
  const location = useDraftLocation(() => document.getElementById('media-asset-title')?.closest<HTMLElement>('[role=dialog]') ?? null);
  const dirty = canRename && !fileCreated && baseName !== asset.fileName.replace(/\.[^.]+$/, '');
  const resumeMedia = () => { setDeparture(false); location.restore(); };
  const close = () => { if (!saving && !busy) { if (dirty) { location.capture(); setDeparture(true); } else onClose(); } };
  useEditingDraft(dirty ? { kind: 'media', root: asset.root, objectId: mediaAssetKey({ ...asset, kind: 'article' }), resume: resumeMedia } : null);
  useEffect(() => { if (dirty && !departure) location.capture(); }, [baseName, dirty, departure]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saving]);
  const extension = asset.fileName.match(/\.[^.]+$/)?.[0] ?? '';

  const saveAsNewImage = async (event?: FormEvent<HTMLFormElement>): Promise<boolean> => {
    event?.preventDefault();
    if (!canRename || busy || saving || fileCreated) return false;
    const nextBaseName = baseName.trim();
    if (!nextBaseName) {
      setNotice({ ...productLabel("mediaLibrary.theImageNameCannotBeEmpty"), tone: 'error' });
      return false;
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
      return result.fileCreated;
    } catch (error) {
      setNotice({ label: error instanceof Error ? error.message : String(error), tone: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return <>
    <DialogFrame className="flex h-4/5 min-h-0 max-w-5xl flex-col overflow-hidden" titleId="media-asset-title" descriptionId="media-asset-description" onClose={close} dismissible={!saving && !busy} focusActive={!departure}>
        <DialogHeader titleId="media-asset-title" eyebrow={t('common:eyebrows.localArticleImage')} title={t('dialogs:imageRename.viewAndRename')} onClose={close} closeDisabled={saving || busy} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div ref={zoom.viewportRef} className="h-full min-h-0 min-w-0 overflow-auto overscroll-contain bg-list p-4 pb-16 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" role="region" tabIndex={0} aria-label={t('dialogs:ui.imagePreviewArea')}>
            <div className="grid min-w-full justify-items-center" style={zoom.imageStyle}>
              <ArticleImagePreview handle={asset.handle} fileName={asset.fileName} alt={asset.fileName} variant="dialog" sessionKey={`${sessionKey}:${asset.articleId}:${asset.fileName}`} isCurrent={isCurrent} onDimensions={zoom.onDimensions} imageProps={{ className: 'max-h-none max-w-none', style: zoom.imageStyle }} />
            </div>
          </div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-panel/95 p-1 shadow-(--editor-dialog-shadow)" role="group" aria-label={t('dialogs:ui.imageZoomActions')}>
            <IconButton type="button" className="rounded-full" tooltip={t('dialogs:ui.zoomOut')} disabled={!zoom.dimensions.width || zoom.scale <= 0.01} onClick={() => zoom.zoomTo(zoom.scale - 0.25)} icon={<span aria-hidden="true">−</span>} />
            <button type="button" className="button button-quiet min-h-9 gap-1 rounded-full px-2 py-1 text-xs" title={t('dialogs:ui.imageZoomHelp')} aria-label={t('dialogs:ui.imageZoomToggle')} aria-pressed={Math.abs(zoom.scale - zoom.fit) > 0.001} disabled={!zoom.dimensions.width} onClick={() => zoom.zoomTo(Math.abs(zoom.scale - zoom.fit) < 0.001 ? Math.min(8, zoom.fit * 2) : null)}>
              <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
              <span role="status">{formatUINumber(zoom.scale, locale, { style: 'percent', maximumFractionDigits: 0 })}</span>
            </button>
            <IconButton type="button" className="rounded-full" tooltip={t('dialogs:ui.zoomIn')} disabled={!zoom.dimensions.width || zoom.scale >= 8} onClick={() => zoom.zoomTo(zoom.scale + 0.25)} icon={<span aria-hidden="true">+</span>} />
            <IconButton type="button" className="rounded-full" tooltip={t('dialogs:ui.fitToWidth')} disabled={!zoom.dimensions.width} onClick={() => zoom.zoomTo(null)} icon={<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5v14M21 5v14M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3" /></svg>} />
          </div>
        </div>
        <div className="min-h-0 max-h-1/2 shrink-0 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" role="region" aria-label={t('dialogs:ui.imagePreviewActions')}>
        <div className="media-asset-details" id="media-asset-description">
          <strong>{asset.fileName}</strong>
          <span>{asset.articleTitle} · {asset.month}</span>
          <code>{`media/image/${asset.fileName}`} · {formatBytes(asset.size, locale)} · {asset.mimeType}</code>
        </div>
        <form className="media-asset-rename" onSubmit={(event) => void saveAsNewImage(event)}>
          <label className="field-stack">
            <span className="field-label">{t('dialogs:imageRename.namePlaceholder')}</span>
            <span className="media-asset-name-input">
              <input autoFocus={canRename} className="field" type="text" maxLength={80} value={baseName} onChange={(event) => setBaseName(event.target.value)} disabled={!canRename || busy || saving || fileCreated} />
              <code aria-hidden="true">{extension}</code>
            </span>
          </label>
          <p className="text-xs-note text-muted">{t('dialogs:imageRename.referenceScope')}</p>
          {!canRename && renameBlockedReason ? <p className="status-copy" data-tone="warning" role="status">{renameBlockedReason}</p> : null}
          {notice ? <p className="status-copy" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={close} disabled={saving || busy}>{t('dialogs:imageRename.done')}</button>
            <button className="button button-primary" type="submit" disabled={!canRename || busy || saving || fileCreated}>{saving || busy ? t('dialogs:imageRename.saving') : fileCreated ? t('dialogs:imageRename.saved') : t('dialogs:imageRename.saveAsNew')}</button>
          </div>
        </form>
        </div>
        </div>
    </DialogFrame>
    {departure ? <UnsavedChangesDialog entries={[{ label: asset.fileName, detail: t('dialogs:ui.mediaChangesUnsaved') }]} description={t('dialogs:ui.mediaUnsavedDescription')} saveDisabled={!canRename || busy || saving || !baseName.trim()} onCancel={() => setDeparture(false)} onContinue={resumeMedia} onDiscard={onClose} onSave={async () => { if (!await saveAsNewImage()) return false; onClose(); return true; }} /> : null}
  </>;
}
