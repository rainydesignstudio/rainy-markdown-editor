'use client';

import { OperationFeedback } from '../global/OperationFeedback';
import { SelectField } from '../global/SelectField';
import { formatProductMessage, productCause, productDiagnosticReference, productErrorMessage, productJoin, productMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useRef, useState } from 'react';
import type { ArticleSummary } from '../../lib/types';
import type { LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import type { MediaDestination, MediaEditRequest, MediaMutation, MediaReferenceScan } from '../../lib/mediaManagement';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { MediaIcon, mediaAssetKey } from './MediaGallery';
import { useDraftLocation, useEditingDraft } from '../global/EditingDrafts';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
export function MediaManagementDialog({ feedbackId = 'media-management', request, articles, busy, isCurrent, currentReferences, scanReferences, onSubmit, onClose }: {
  feedbackId?: string;
  request: MediaEditRequest; articles: ArticleSummary[]; busy: boolean; isCurrent: () => boolean;
  currentReferences: number | null;
  scanReferences: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
  onSubmit: (operation: MediaMutation) => Promise<MediaActionOutcome>;
  onClose: () => void;
}) {
  const { t } = useUITranslation('dialogs');
  const asset = request.assets[0];
  const hasFiles = request.assets.some(asset => asset.storage === 'file');
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
  const [departure, setDeparture] = useState(false);
  const location = useDraftLocation(() => document.getElementById('media-management-title')?.closest<HTMLElement>('[role=dialog]') ?? null);
  const dirty = request.type === 'rename' ? name !== asset.fileName.replace(/\.[^.]+$/, '') : request.type === 'describe' && description !== (asset.description ?? '');
  const resumeMedia = () => { setDeparture(false); location.restore(); };
  useEditingDraft(dirty ? { kind: 'media', root: asset.root, objectId: mediaAssetKey(asset), resume: resumeMedia } : null);
  useEffect(() => { if (dirty && !departure) location.capture(); }, [name, description, dirty, departure]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || workingRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
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
  const discard = () => { scanRef.current?.abort(); onClose(); };
  const close = () => { if (!workingRef.current && !busy) { if (dirty) { location.capture(); setDeparture(true); } else discard(); } };
  const submit = async (): Promise<boolean> => {
    if (workingRef.current || busy || !isCurrent() || scanRef.current && !scanRef.current.signal.aborted) return false;
    workingRef.current = true; setWorking(true); setNotice(null);
    const chosen = articles.find(article => article.id === destination);
    const target: MediaDestination | undefined = destination === 'shared' ? { kind: 'shared' } : chosen ? { kind: 'article', articleId: chosen.id, month: chosen.month, folder: chosen.folder, title: chosen.parse.metadata.title } : undefined;
    try { const result = await onSubmit({ ...request, name, description, file, destination: target }); if (isCurrent()) { setNotice(result); if (result.ok) onClose(); return result.ok; } return false; }
    catch (error) { if (isCurrent()) setNotice({ ok: false, tone: 'error', ...productErrorMessage(error) }); return false; }
    finally { workingRef.current = false; setWorking(false); }
  };
  const disabled = locked || scanning || !isCurrent() || request.type === 'rename' && !name.trim() || request.type === 'replace' && !file || request.type === 'transfer' && !destination;
  return <><DialogFrame titleId="media-management-title" focusActive={!departure} onClose={close} dismissible={!locked} role={request.type === 'delete' ? 'alertdialog' : 'dialog'}>
    <DialogHeader actions={<OperationFeedback id={feedbackId} notice={notice} tone={notice?.tone} />} titleId="media-management-title" eyebrow={t(hasFiles ? 'messages:resources.managementEyebrow' : 'common:eyebrows.imageManagement')} title={t((hasFiles ? 'messages:resources.managementTitles.' : 'dialogs:mediaTitles.') + request.type)} onClose={close} closeDisabled={locked} />
    <div className="grid min-w-0 gap-4 p-4">
      <p className="break-all text-sm text-secondary">{request.assets.length === 1 ? asset.fileName : t(hasFiles ? 'messages:resources.selectedFiles' : 'dialogs:templates.selectedImages', { count: request.assets.length })}</p>
      {request.assets.length > 1 ? <ul className="max-h-28 overflow-x-clip overflow-y-auto break-all text-xs text-muted">{request.assets.map(asset => <li key={`${asset.kind}:${asset.kind === 'article' ? asset.articleId : 'shared'}:${asset.fileName}`}>{asset.fileName}</li>)}</ul> : null}
      {request.type === 'rename' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.filenameWithoutExtension')}</span><input autoFocus className="field" value={name} onChange={event => setName(event.target.value)} disabled={locked} /><span className="text-xs text-muted">{asset.storage === 'file' ? t(asset.kind === 'article' ? 'messages:resources.renameHelp' : 'messages:resources.sharedRenameHelp') : asset.kind === 'article' ? t('dialogs:ui.updateCurrentBodyReferencesAndRetainOriginalFiles') : t('dialogs:ui.renameTheSharedFileExistingAdoptedArticleCopies')}</span></label> : null}
      {request.type === 'describe' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.descriptionAlternative')}</span><textarea className="field min-h-28" value={description} onChange={event => setDescription(event.target.value)} disabled={locked} placeholder={t('dialogs:ui.optional')} /><span className="text-xs text-muted">{t('dialogs:ui.savedAsAssetMetadataExistingBodyAltText')}</span></label> : null}
      {request.type === 'replace' ? <><label className="field-stack"><span className="field-label">{t(asset.storage === 'file' ? 'messages:resources.chooseReplacementFile' : 'dialogs:ui.chooseReplacementImage')}</span><input className="field" type="file" accept={asset.storage === 'file' ? undefined : 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif'} disabled={locked} onChange={event => setFile(event.target.files?.[0])} /></label><p className="text-xs text-muted">{asset.kind === 'article' ? t('dialogs:ui.updateCurrentArticleImageReferencesAndRetainHistorical') : t('dialogs:ui.replaceTheSharedOriginalAdoptedArticleCopiesRemain')}</p></> : null}
      {request.type === 'transfer' ? <label className="field-stack"><span className="field-label">{t('dialogs:ui.destination')}</span><SelectField label={t('dialogs:ui.destination')} value={destination} disabled={locked} onChange={nextValue => setDestination(nextValue)} options={[{ value: "", label: t('dialogs:ui.choose') }, { value: "shared", label: t('dialogs:ui.sharedAssets') }, ...(articles.map(article => ({ value: article.id, label: article.parse.metadata.title })) ?? [])]} /><span className="text-xs text-muted">{t('dialogs:ui.unreferencedFilesAreMovedReferencedFilesAreCopied')}</span></label> : null}
      {request.type === 'delete' ? <p className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">{t(hasFiles ? 'messages:resources.confirmDelete' : 'dialogs:ui.confirmationPermanentlyDeletesSelectedImageFilesTheWorkspace')}</p> : null}
    </div>
    <DialogFooter><DialogActions>
      {showReferences ? <><p className="mr-auto min-w-0 basis-full self-center text-xs text-muted md:flex-1" role="status">{scanning ? t('dialogs:ui.scanningPleaseWait') : scanned ? t('dialogs:templates.workspaceReferences', { current: scanned.current === null ? t('dialogs:ui.noCurrentManuscriptOpen') : t('dialogs:templates.currentReferences', { count: scanned.current }), count: scanned.workspace, warning: scanned.issues.length ? t('dialogs:ui.someReferencesUnchecked') : '' }) : t('dialogs:templates.notScanned', { current: currentReferences === null ? t('dialogs:ui.noCurrentManuscriptOpen') : t('dialogs:templates.currentBodyReferences', { count: currentReferences }) })}</p><DialogButton disabled={locked || scanning} title={t('dialogs:ui.thisArticleUsesTheCurrentDraftWorkspaceCounts')} onClick={() => void scan()}><MediaIcon name="search" />{t('dialogs:ui.scanReferences')}</DialogButton></> : null}
      <DialogButton disabled={locked} onClick={close}><MediaIcon name="close" />{t('common:actions.cancel')}</DialogButton><DialogButton variant={request.type === 'delete' ? 'danger' : 'primary'} disabled={Boolean(disabled)} onClick={() => void submit()}>{locked ? t('dialogs:ui.working') : request.type === 'delete' ? t('dialogs:ui.confirmDeletion') : request.type === 'transfer' ? t('dialogs:ui.confirmMoveOrCopy') : t('dialogs:ui.saveChanges')}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>
    {departure ? <UnsavedChangesDialog entries={[{ label: asset.fileName, detail: t('dialogs:ui.mediaChangesUnsaved') }]} description={t('dialogs:ui.mediaUnsavedDescription')} saveDisabled={Boolean(disabled)} onCancel={() => setDeparture(false)} onContinue={resumeMedia} onDiscard={discard} onSave={submit} /> : null}
  </>;
}
