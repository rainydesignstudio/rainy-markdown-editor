'use client';

import { useEffect, useRef, useState } from 'react';
import { inspectArticleImage, type ArticleImageFormat, type MediaActionOutcome } from '../../lib/articleMedia';
import { formatProductMessage, productErrorMessage } from '../../lib/i18n/productMessages';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { formatMediaBytes, MediaIcon } from './MediaGallery';
import { inspectResourceFile } from '../../lib/resources/storage';
import { ResourceGlyph } from './ResourceGlyph';

type InspectedFile = { file: File; format: ArticleImageFormat | null; issue: ReturnType<typeof productErrorMessage> | null };

export function MediaImportDialog({ files, libraryName, busy, isCurrent, onImport, onClose, allResources = false }: {
  files: File[];
  libraryName: string;
  busy: boolean;
  isCurrent: () => boolean;
  onImport: (files: File[]) => Promise<MediaActionOutcome>;
  onClose: () => void;
  allResources?: boolean;
}) {
  const { t } = useUITranslation('media');
  const { locale } = useUILocale();
  const [rows, setRows] = useState<InspectedFile[] | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<MediaActionOutcome | null>(null);
  const workingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void Promise.all(files.map(async (file): Promise<InspectedFile> => {
      try { return { file, format: allResources ? await inspectResourceFile(file) : await inspectArticleImage(file), issue: null }; }
      catch (error) { return { file, format: null, issue: productErrorMessage(error) }; }
    })).then(next => { if (!cancelled && isCurrent()) setRows(next); });
    return () => { cancelled = true; };
    // Target changes unmount this dialog; the captured file list stays fixed.
  }, [files]);
  const valid = rows?.filter(row => row.format).map(row => row.file) ?? [];
  const locked = busy || working;
  const close = () => { if (!busy && !workingRef.current) onClose(); };
  const confirm = async () => {
    if (!rows || !valid.length || busy || workingRef.current || !isCurrent()) return;
    workingRef.current = true; setWorking(true); setNotice(null);
    try {
      const result = await onImport(valid);
      if (isCurrent()) { setNotice(result); if (result.ok) onClose(); }
    } catch (error) {
      if (isCurrent()) setNotice({ ok: false, tone: 'error', ...productErrorMessage(error) });
    } finally { workingRef.current = false; setWorking(false); }
  };
  return <DialogFrame titleId="media-import-title" descriptionId="media-import-description" onClose={close} dismissible={!locked}>
    <DialogHeader titleId="media-import-title" eyebrow={t('media:ui.imageLibrary')} title={t(allResources ? 'messages:resources.confirmImport' : 'media:upload.title')} onClose={close} closeDisabled={locked} />
    <div className="grid min-w-0 gap-4 p-4">
      <p id="media-import-description" className="text-sm text-secondary">{t('media:upload.description')}</p>
      <p className="break-words text-sm text-primary">{t('media:upload.destination', { name: libraryName })}</p>
      <ul className="grid max-h-72 gap-3 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-label={t('media:upload.files')}>
        {files.map((file, index) => <li key={index} className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-list/50 p-3">
          <span className="mt-0.5 text-faint">{allResources ? <span className="block size-12 overflow-hidden rounded-md"><ResourceGlyph compact fileName={file.name} mimeType={rows?.[index]?.format?.mimeType ?? file.type} /></span> : <MediaIcon name="image" />}</span>
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-primary">{file.name}</p><p className="mt-1 text-xs text-muted">{formatMediaBytes(file.size, locale)} · {rows?.[index]?.format?.mimeType ?? (file.type || t('media:upload.unknownFormat'))}</p>{rows?.[index]?.issue ? <p className="mt-1 break-words text-xs text-danger">{formatProductMessage(rows[index].issue!, t)}</p> : null}</div>
        </li>)}
      </ul>
      <p className="text-xs text-muted" role="status">{rows ? t(allResources ? 'messages:resources.importSummary' : 'media:upload.summary', { valid: valid.length, invalid: files.length - valid.length }) : t(allResources ? 'messages:resources.checkingFiles' : 'media:upload.checking')}</p>
      {notice ? <p className="status-copy" data-tone={notice.tone} role="status">{formatProductMessage(notice, t)}</p> : null}
    </div>
    <DialogFooter><DialogActions>
      <DialogButton disabled={locked} onClick={close}><MediaIcon name="close" />{t('common:actions.cancel')}</DialogButton>
      <DialogButton variant="primary" disabled={locked || !rows || !valid.length || !isCurrent()} onClick={() => void confirm()}><MediaIcon name="import" />{locked ? t('media:ui.working') : t(allResources ? 'messages:resources.importCount' : 'media:upload.confirm', { count: valid.length })}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
