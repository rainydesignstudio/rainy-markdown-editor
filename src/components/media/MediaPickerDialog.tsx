'use client';

import { formatProductMessage, productCause, productMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useMemo, useRef, useState } from 'react';
import type { LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import type { ArticleSummary } from '../../lib/types';
import { useMediaPreferences } from '../../hooks/useMediaPreferences';
import { useMediaPagination } from '../../hooks/useMediaPagination';
import { mediaDirectoryImages } from '../../lib/mediaBrowsing';
import type { MediaEditRequest, MediaMutation, MediaReferenceScan } from '../../lib/mediaManagement';
import { MediaToolbar, type MediaControl } from './MediaToolbar';
import { MediaPagination } from './MediaPagination';
import { MediaPreviewDialog } from './MediaPreviewDialog';
import { MediaManagementDialog } from './MediaManagementDialog';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { MediaDetails, MediaGallery, sortMediaAssets, MediaIcon, MediaImportButton, mediaAssetKey } from './MediaGallery';

export function MediaPickerDialog({ root, sessionKey, refreshSignal, articles, articleId, articleTitle, initialAsset, isCurrent, busy, onImport, onAdopt, onClose, onManage, currentReferenceCount, scanReferences }: {
  root: FileSystemDirectoryHandle;
  sessionKey: number;
  refreshSignal: number;
  articles: ArticleSummary[];
  articleId: string;
  articleTitle: string;
  initialAsset?: LibraryMediaAsset;
  isCurrent: () => boolean;
  busy: boolean;
  onImport: (files: File[]) => Promise<MediaActionOutcome>;
  onAdopt: (asset: LibraryMediaAsset) => Promise<MediaActionOutcome>;
  onClose: () => void;
  onManage: (operation: MediaMutation) => Promise<MediaActionOutcome>;
  currentReferenceCount: (assets: LibraryMediaAsset[]) => number | null;
  scanReferences: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
}) {
  const { t } = useUITranslation('dialogs');
  const [tab, setTab] = useState<'shared' | 'article'>(initialAsset?.kind ?? 'shared');
  const [query, setQuery] = useState('');
  const [activeControl, setActiveControl] = useState<MediaControl>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialAsset ? mediaAssetKey(initialAsset) : null);
  const [notice, setNotice] = useState<MediaActionOutcome | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const library = useMediaLibrary({ root, sessionKey, refreshSignal, articles, isRootCurrent: isCurrent });
  const [management, setManagement] = useState<MediaEditRequest | null>(null);
  const [previewing, setPreviewing] = useState<LibraryMediaAsset | null>(null);
  const [preferences, setPreferences] = useMediaPreferences();
  const locked = working || busy || Boolean(management) || Boolean(previewing);
  const edit = (type: MediaEditRequest['type'], asset: LibraryMediaAsset) => { if (!workingRef.current && !busy) { setActiveControl(null); setManagement({ type, assets: [asset] }); } };
  const manage = async (operation: MediaMutation) => { const result = await onManage(operation); if (isCurrent()) { setNotice(result); library.refresh(); if (result.ok) setSelectedKey(null); } return result; };
  const available = useMemo(() => library.assets.filter((asset) => asset.kind === 'shared' || asset.articleId === articleId), [library.assets, articleId]);
  const visible = sortMediaAssets(available.filter((asset) => asset.kind === tab && asset.fileName.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))), preferences);
  const pagination = useMediaPagination(visible, [root, sessionKey, articleId, tab, query, preferences.sort, preferences.descending]);
  const selected = available.find((asset) => mediaAssetKey(asset) === selectedKey) ?? (initialAsset && isCurrent() && selectedKey === mediaAssetKey(initialAsset) ? initialAsset : null);
  const importFiles = async (files: File[]) => {
    if (workingRef.current || busy) return { ok: false, ...productMessage("mediaPickerDialog.anotherAssetOperationIsInProgress"), tone: 'warning' as const };
    workingRef.current = true;
    setWorking(true); setNotice(null);
    try { const result = await onImport(files); if (isCurrent()) { setNotice(result); if (result.ok) { setTab('shared'); setQuery(''); setSelectedKey(null); } library.refresh(); } return result; }
    catch (error) { const result: MediaActionOutcome = { ok: false, ...productMessage("mediaLibrary.sharedImageImportFailed", { "cause": productCause(error) }), tone: 'error' }; if (isCurrent()) setNotice(result); return result; }
    finally { workingRef.current = false; setWorking(false); }
  };
  const adopt = async (image = selected) => {
    if (!image || workingRef.current || busy || !isCurrent()) return;
    workingRef.current = true;
    setWorking(true); setNotice(null);
    try { const result = await onAdopt(image); if (result.ok) onClose(); else if (isCurrent()) setNotice(result); }
    catch (error) { if (isCurrent()) setNotice({ ok: false, ...productMessage("mediaPickerDialog.imageInsertionFailedTheSelectedImageIsRetainedYouCanRetry", { "cause": productCause(error) }), tone: 'error' }); }
    finally { workingRef.current = false; setWorking(false); }
  };
  const dismiss = () => { if (!workingRef.current && !busy && !management && !previewing) onClose(); };
  return <><DialogFrame titleId="media-picker-title" descriptionId="media-picker-description" onClose={dismiss} dismissible={!locked} focusActive={!management && !previewing && !activeControl} large>
    <DialogHeader titleId="media-picker-title" eyebrow={t('common:eyebrows.imageLibrary')} title={t('dialogs:ui.chooseImages')} onClose={dismiss} closeDisabled={locked} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto md:overflow-hidden">
    <div className="grid shrink-0 gap-3 border-b border-line p-4">
      <p id="media-picker-description" className="break-words text-sm text-muted">{t('dialogs:ui.targetArticle')}<span className="text-secondary">{articleTitle}</span> {t('dialogs:ui.insertAtCurrentCaret')}</p>
      <MediaToolbar source={tab} articleLabel={t('dialogs:ui.currentArticle')} onSourceChange={kind => { setTab(kind); setSelectedKey(null); setNotice(null); }} query={query} onQueryChange={setQuery} preferences={preferences} onPreferencesChange={setPreferences} activeControl={activeControl} onControlChange={setActiveControl} disabled={locked} actions={<MediaImportButton disabled={!isCurrent()} busy={locked} onImport={importFiles} />} />
    </div>
    <div className="flex min-w-0 shrink-0 flex-col md:min-h-0 md:flex-1 md:flex-row md:overflow-hidden">
      <div className="flex min-w-0 flex-col md:min-h-0 md:flex-1"><div className="min-w-0 p-4 md:min-h-0 md:flex-1 md:overflow-x-clip md:overflow-y-auto">
        {library.issues.length ? <div className="mb-4 grid gap-2 text-xs text-warning-strong" role="status">{library.issues.map((issue) => <p key={issue}>{formatProductMessage(issue, t)}</p>)}<button className="button button-quiet" disabled={locked || library.loading} onClick={library.refresh}><MediaIcon name="refresh" />{t('dialogs:ui.retryLoading')}</button></div> : null}
        {visible.length ? <MediaGallery assets={pagination.items} selected={selectedKey} columns={preferences.columns} onRename={asset => edit('rename', asset)} onDelete={asset => edit('delete', asset)} onAdopt={asset => void adopt(asset)} onNotice={setNotice} onSelect={(asset) => { setSelectedKey(mediaAssetKey(asset)); setNotice(null); }} sessionKey={sessionKey} isCurrent={isCurrent} disabled={locked} /> : <div className="grid min-h-40 place-content-center gap-2 text-center text-sm text-muted" role="status"><MediaIcon name="image" /><p>{library.loading ? t('dialogs:ui.loadingImages') : query ? t('dialogs:ui.noMatchingImages') : tab === 'shared' ? t('dialogs:ui.noSharedImagesYetImportOneFirst') : t('dialogs:ui.thisArticleHasNoLocalImagesYet')}</p></div>}
      </div><MediaPagination {...pagination} disabled={locked || library.loading} /></div>
      <aside className="min-w-0 border-t border-line p-4 md:w-72 md:shrink-0 md:border-t-0 md:border-l md:overflow-x-clip md:overflow-y-auto" aria-label={t('dialogs:ui.selectedImagePreview')}>{selected ? <MediaDetails key={mediaAssetKey(selected)} disabled={locked} onRename={() => edit('rename', selected)} onDescribe={() => edit('describe', selected)} onReplace={() => edit('replace', selected)} onDelete={() => edit('delete', selected)} onPreview={() => setPreviewing(selected)} asset={selected} sessionKey={sessionKey} isCurrent={isCurrent} /> : <p className="text-sm text-muted">{t('dialogs:ui.selectAnImageToPreviewIt')}</p>}</aside>
    </div>
    </div>
    <DialogFooter><div className="py-3 text-xs text-muted" role="status" data-tone={notice?.tone}>{notice ? <p className="status-copy" data-tone={notice.tone}>{formatProductMessage(notice, t)}</p> : selected?.kind === 'article' ? t('dialogs:ui.useAnExistingArticleImageAndInsertAn') : t('dialogs:ui.adoptingSavesAnIndependentArticleCopyAndRetains')}</div><DialogActions><DialogButton disabled={locked} onClick={dismiss}><MediaIcon name="close" />{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" disabled={locked || !selected || !isCurrent()} onClick={() => void adopt()}><MediaIcon name="use" />{locked ? t('dialogs:ui.working') : t('dialogs:ui.useImage')}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>{previewing && isCurrent() ? <MediaPreviewDialog key={`${sessionKey}:${mediaAssetKey(previewing)}`} initial={previewing} images={sortMediaAssets(mediaDirectoryImages(library.assets, previewing), preferences)} sessionKey={sessionKey} isCurrent={isCurrent} onClose={() => setPreviewing(null)} /> : null}{management && isCurrent() ? <MediaManagementDialog request={management} articles={articles} busy={working || busy} isCurrent={isCurrent} currentReferences={currentReferenceCount(management.assets)} scanReferences={scanReferences} onSubmit={manage} onClose={() => setManagement(null)} /> : null}</>;
}
