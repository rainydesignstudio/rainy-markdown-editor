'use client';

import { formatProductMessage, productCause, productDiagnosticReference, productErrorMessage, productJoin, productMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useRef, useState } from 'react';
import type { ArticleSummary } from '../../lib/types';
import type { LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import type { MediaDestination, MediaEditRequest, MediaMutation, MediaReferenceScan } from '../../lib/mediaManagement';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { MediaIcon } from './MediaGallery';
export function MediaManagementDialog({ request, articles, busy, isCurrent, currentReferences, scanReferences, onSubmit, onClose }: {
  request: MediaEditRequest; articles: ArticleSummary[]; busy: boolean; isCurrent: () => boolean;
  currentReferences: number | null;
  scanReferences: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
  onSubmit: (operation: MediaMutation) => Promise<MediaActionOutcome>;
  onClose: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const asset = request.assets[0];
  const [name, setName] = useState(asset.fileName.replace(/\.[^.]+$/, ''));
  const [description, setDescription] = useState(asset.description ?? '');
  const [file, setFile] = useState<File | undefined>();
  const [destination, setDestination] = useState('');
  const [scanState, setScanState] = useState<{ request: MediaEditRequest; scanning: boolean; result?: MediaReferenceScan } | null>(null);
  const scanRef = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState<MediaActionOutcome | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const locked = busy || working;
  const scanning = scanState?.request === request && scanState.scanning;
  const scanned = scanState?.request === request ? scanState.result : undefined;
  const showReferences = request.type === 'delete' || request.type === 'transfer';
  useEffect(() => () => { scanRef.current?.abort(); }, [request]);
  const scan = async () => {
    if (workingRef.current || busy || !isCurrent() || scanRef.current && !scanRef.current.signal.aborted) return;
    const controller = new AbortController(); scanRef.current = controller;
    setScanState({ request, scanning: true }); setNotice(null);
    try {
      const result = await scanReferences(request.assets, controller.signal);
      if (!controller.signal.aborted && isCurrent()) {
        setScanState({ request, scanning: false, result });
        if (result.issues.length) setNotice({ ok: false, tone: 'warning', ...productMessage("mediaManagementDialog.filesThatCouldNotBeCheckedWorkspaceTotalsAreIncomplete", { "result_issuesCount": result.issues.length, "details": productJoin(result.issues.slice(0, 3).map(message => productDiagnosticReference({ message })), '；') }) });
      }
    } catch (error) {
      if (!controller.signal.aborted && isCurrent()) { setScanState({ request, scanning: false }); setNotice({ ok: false, tone: 'error', ...productMessage("mediaManagementDialog.referenceScanFailedYouCanRetry", { "cause": productCause(error) }) }); }
    } finally { if (scanRef.current === controller) scanRef.current = null; }
  };
  const close = () => { if (!workingRef.current && !busy) { scanRef.current?.abort(); onClose(); } };
  const submit = async () => {
    if (workingRef.current || busy || !isCurrent() || scanRef.current && !scanRef.current.signal.aborted) return;
    workingRef.current = true; setWorking(true); setNotice(null);
    const chosen = articles.find(article => article.id === destination);
    const target: MediaDestination | undefined = destination === 'shared' ? { kind: 'shared' } : chosen ? { kind: 'article', articleId: chosen.id, month: chosen.month, folder: chosen.folder, title: chosen.parse.metadata.title } : undefined;
    try { const result = await onSubmit({ ...request, name, description, file, destination: target }); if (isCurrent()) { setNotice(result); if (result.ok) onClose(); } }
    catch (error) { if (isCurrent()) setNotice({ ok: false, tone: 'error', ...productErrorMessage(error) }); }
    finally { workingRef.current = false; setWorking(false); }
  };
  const disabled = locked || scanning || !isCurrent() || request.type === 'rename' && !name.trim() || request.type === 'replace' && !file || request.type === 'transfer' && !destination;
  return <DialogFrame titleId="media-management-title" onClose={close} dismissible={!locked} role={request.type === 'delete' ? 'alertdialog' : 'dialog'}>
    <DialogHeader titleId="media-management-title" eyebrow={t('common:eyebrows.imageManagement')} title={t('dialogs:mediaTitles.' + request.type)} onClose={close} closeDisabled={locked} />
    <div className="grid min-w-0 gap-4 p-4">
      <p className="break-all text-sm text-secondary">{request.assets.length === 1 ? asset.fileName : t('dialogs:templates.selectedImages', { count: request.assets.length })}</p>
      {request.assets.length > 1 ? <ul className="max-h-28 overflow-x-clip overflow-y-auto break-all text-xs text-muted">{request.assets.map(asset => <li key={`${asset.kind}:${asset.kind === 'article' ? asset.articleId : 'shared'}:${asset.fileName}`}>{asset.fileName}</li>)}</ul> : null}
      {request.type === 'rename' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.filenameWithoutExtension')}</span><input autoFocus className="field" value={name} onChange={event => setName(event.target.value)} disabled={locked} /><span className="text-xs text-muted">{asset.kind === 'article' ? t('dialogs:ui.updateCurrentBodyReferencesAndRetainOriginalFiles') : t('dialogs:ui.renameTheSharedFileExistingAdoptedArticleCopies')}</span></label> : null}
      {request.type === 'describe' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.descriptionAlternative')}</span><textarea className="field min-h-28" value={description} onChange={event => setDescription(event.target.value)} disabled={locked} placeholder={t('dialogs:ui.optional')} /><span className="text-xs text-muted">{t('dialogs:ui.savedAsAssetMetadataExistingBodyAltText')}</span></label> : null}
      {request.type === 'replace' ? <><label className="field-stack"><span className="field-label">{t('dialogs:ui.chooseReplacementImage')}</span><input className="field" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif" disabled={locked} onChange={event => setFile(event.target.files?.[0])} /></label><p className="text-xs text-muted">{asset.kind === 'article' ? t('dialogs:ui.updateCurrentArticleImageReferencesAndRetainHistorical') : t('dialogs:ui.replaceTheSharedOriginalAdoptedArticleCopiesRemain')}</p></> : null}
      {request.type === 'transfer' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.destination')}</span><select className="field" value={destination} disabled={locked} onChange={event => setDestination(event.target.value)}><option value="">{t('dialogs:ui.choose')}</option><option value="shared">{t('dialogs:ui.sharedAssets')}</option>{articles.map(article => <option key={article.id} value={article.id}>{article.parse.metadata.title}</option>)}</select><span className="text-xs text-muted">{t('dialogs:ui.unreferencedFilesAreMovedReferencedFilesAreCopied')}</span></label> : null}
      {request.type === 'delete' ? <p className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">{t('dialogs:ui.confirmationPermanentlyDeletesSelectedImageFilesTheWorkspace')}</p> : null}
      {notice ? <p className="status-copy break-words text-sm" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
    </div>
    <DialogFooter><DialogActions>
      {showReferences ? <><p className="mr-auto min-w-0 basis-full self-center text-xs text-muted md:flex-1" role="status">{scanning ? t('dialogs:ui.scanningPleaseWait') : scanned ? t('dialogs:templates.workspaceReferences', { current: scanned.current === null ? t('dialogs:ui.noCurrentManuscriptOpen') : t('dialogs:templates.currentReferences', { count: scanned.current }), count: scanned.workspace, warning: scanned.issues.length ? t('dialogs:ui.someReferencesUnchecked') : '' }) : t('dialogs:templates.notScanned', { current: currentReferences === null ? t('dialogs:ui.noCurrentManuscriptOpen') : t('dialogs:templates.currentBodyReferences', { count: currentReferences }) })}</p><DialogButton disabled={locked || scanning} title={t('dialogs:ui.thisArticleUsesTheCurrentDraftWorkspaceCounts')} onClick={() => void scan()}><MediaIcon name="search" />{t('dialogs:ui.scanReferences')}</DialogButton></> : null}
      <DialogButton disabled={locked} onClick={close}><MediaIcon name="close" />{t('common:actions.cancel')}</DialogButton><DialogButton variant={request.type === 'delete' ? 'danger' : 'primary'} disabled={Boolean(disabled)} onClick={() => void submit()}>{locked ? t('dialogs:ui.working') : request.type === 'delete' ? t('dialogs:ui.confirmDeletion') : request.type === 'transfer' ? t('dialogs:ui.confirmMoveOrCopy') : t('dialogs:ui.saveChanges')}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
