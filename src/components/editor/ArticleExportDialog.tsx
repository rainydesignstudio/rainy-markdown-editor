'use client';

import { ProductError, formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { getArticleRenderSnapshot } from '../../lib/article-format/runtime';
import { assertLibraryCapability, libraryCapability, EXPORT_CAPABILITIES } from '../../lib/article-format/libraryConfiguration';

import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useRef, useState, type MutableRefObject, type ComponentProps } from 'react';
import { PackageOutputDialog } from './PackageOutputDialog';
import type { ThemeConfig } from '../../lib/types';
import { articleExportBaseName, articleMarkdownBody, createArticleDocumentPackage, downloadArticleBlob } from '../../lib/articleExport';
import { articleCanvasToPdf, articleCanvasToPng, renderArticleExportCanvas } from '../../lib/articleVisualExport';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { inspectArticleResources } from '../../lib/resources/inspection';
import { localResourceReference } from '../../lib/resources/references';
import { resourceReference } from '../../lib/resources/types';
import type { ArticleFormatIssue } from '../../lib/articleFormat';
import { formatDiagnosticMessage } from '../../lib/i18n/productMessages';

type Format = 'package' | 'markdown' | 'body' | 'png' | 'pdf';

const FORMATS: { id: Format; extension: string }[] = [
  { id: 'package', extension: 'zip' },
  { id: 'markdown', extension: 'md' },
  { id: 'body', extension: 'md' },
  { id: 'png', extension: 'png' },
  { id: 'pdf', extension: 'pdf' },
];

function LegacyArticleExportDialog({ source, title, dirty, root, month, folder, visualAvailable, previewRef, isCurrent, prepareVisual, onExported, onClose, focusActive = true, getResourceRevision }: {
  source: string;
  title: string;
  dirty: boolean;
  root: FileSystemDirectoryHandle;
  month: string | null;
  folder: string | null;
  visualAvailable: boolean;
  previewRef: MutableRefObject<HTMLElement | null>;
  isCurrent: () => boolean;
  prepareVisual: () => Promise<boolean>;
  onExported: (fileName: string, mediaFiles?: number) => void;
  onClose: () => void;
  focusActive?: boolean;
  getResourceRevision?: () => number;
}) {
  const { t } = useUITranslation('dialogs');
  const formatSnapshot = useFormatSnapshot();
  const [format, setFormat] = useState<Format>(() => FORMATS.find(item => libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[item.id]).enabled)?.id ?? 'package');
  const [fileBase, setFileBase] = useState(() => articleExportBaseName(title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resourceReview, setResourceReview] = useState<ArticleFormatIssue[] | null>(null);
  const exportingRef = useRef(false);
  const selected = FORMATS.find(item => item.id === format)!;
  const capability = libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[format]);
  const fileName = `${articleExportBaseName(fileBase)}.${selected.extension}`;
  const exportArticle = async (accepted = false) => {
    if (exportingRef.current || !isCurrent()) return;
    exportingRef.current = true;
    setBusy(true);
    setError('');
    let completed = false;
    try {
      assertLibraryCapability(formatSnapshot, EXPORT_CAPABILITIES[format]);
      let blob: Blob;
      let mediaFiles: number | undefined;
      if (format === 'markdown' || format === 'body') {
        blob = new Blob([format === 'body' ? articleMarkdownBody(source) : source], { type: 'text/markdown;charset=utf-8' });
      } else if (format === 'package') {
        const issues = await inspectArticleResources(parseBody(source), { root, month, folder }, { isCurrent, output: true });
        if (!isCurrent()) throw new ProductError('resources.changedDuringOutput');
        const signature = (rows: ArticleFormatIssue[]) => JSON.stringify(rows.map(issue => [issue.resourceSource, issue.tier, issue.message]));
        if (issues.length && (!accepted || !resourceReview || signature(resourceReview) !== signature(issues))) { setResourceReview(issues); return; }
        const exclude = new Set(issues.flatMap(issue => { const ref = issue.resourceSource && issue.messageKey !== 'resources.imageInFileStorage' ? localResourceReference(issue.resourceSource) : null; return ref ? [resourceReference(ref.storage, ref.fileName, ref.shared).replace(/^\//, '')] : []; }));
        const result = await createArticleDocumentPackage(source, root, month, folder, { isCurrent, exclude, allowIncomplete: accepted });
        blob = result.blob;
        mediaFiles = result.mediaFiles;
      } else {
        if (!visualAvailable || !await prepareVisual() || !isCurrent() || !previewRef.current) {
          throw new ProductError("articleExportDialog.theCurrentLayoutIsNotReadyResolveArticleOrThemeIssuesThen");
        }
        const renderSnapshot = getArticleRenderSnapshot(previewRef.current);
        const resourceRevision = getResourceRevision?.();
        const { canvas, blockEnds } = await renderArticleExportCanvas(previewRef.current);
        blob = format === 'png' ? await articleCanvasToPng(canvas) : await articleCanvasToPdf(canvas, blockEnds, renderSnapshot);
        if (getResourceRevision?.() !== resourceRevision) throw new ProductError('resources.changedDuringOutput');
      }
      if (!isCurrent()) throw new ProductError("articleExportDialog.theArticleOrLibraryChangedDuringExportPreviousContentWasNotDownloaded");
      assertLibraryCapability(formatSnapshot, EXPORT_CAPABILITIES[format]);
      downloadArticleBlob(blob, fileName);
      onExported(fileName, mediaFiles);
      completed = true;
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      exportingRef.current = false;
      if (!completed) setBusy(false);
    }
  };
  return <DialogFrame titleId="article-export-title" descriptionId="article-export-description" onClose={onClose} focusActive={focusActive} dismissible={!busy} className="flex min-h-0 max-w-2xl flex-col overflow-hidden">
    <DialogHeader titleId="article-export-title" eyebrow={t('common:eyebrows.exportArticle')} title={t('dialogs:ui.exportArticle')} onClose={onClose} closeDisabled={busy} />
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void exportArticle(); }}>
      <div className="grid min-h-0 gap-4 overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        <p id="article-export-description" className="text-sm text-muted">{t('dialogs:ui.exportTheCurrentDraft')}{dirty ? t('dialogs:ui.includingUnsavedChanges') : ''}{t('dialogs:ui.thisDoesNotSaveOrModifyTheLibrary')}</p>
        <label className="field-stack min-w-0"><span className="field-label">{t('dialogs:ui.downloadFilename')}</span><input className="field" value={fileBase} maxLength={80} onChange={event => setFileBase(event.target.value)} disabled={busy} /><span className="text-xs text-faint">{t('dialogs:templates.downloadAs', { name: fileName })}</span></label>
        <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-semibold text-primary">{t('dialogs:ui.format')}</legend>
          {FORMATS.map(item => <label key={item.id} title={formatProductMessage(libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[item.id]).reason, t) || undefined} tabIndex={!libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[item.id]).enabled ? 0 : undefined} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel p-3 hover:border-accent-line has-checked:border-accent-line has-checked:bg-accent-soft has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <input className="mt-1 accent-accent" type="radio" name="article-export-format" value={item.id} checked={format === item.id} onChange={() => { if (!libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[item.id]).enabled) return; setFormat(item.id); setResourceReview(null); }} disabled={busy || !libraryCapability(formatSnapshot, EXPORT_CAPABILITIES[item.id]).enabled || (item.id === 'png' || item.id === 'pdf') && !visualAvailable} />
            <span className="grid min-w-0 gap-1"><strong className="text-sm font-semibold text-primary">{t('dialogs:exportFormats.' + item.id + '.title')} <span className="font-mono text-xs font-normal text-muted">.{item.extension}</span></strong><span className="text-xs text-muted">{t('dialogs:exportFormats.' + item.id + '.detail')}</span></span>
          </label>)}
        </fieldset>
        {(format === 'png' || format === 'pdf') ? <p className="rounded-lg border border-line bg-list/50 p-3 text-xs text-muted">{t('dialogs:templates.visualWidth', { width: formatSnapshot.bundle.formatter.output.visual.width })}</p> : null}
        {format === 'package' && !folder ? <p className="rounded-lg border border-line bg-list/50 p-3 text-xs text-muted">{t('dialogs:ui.theManuscriptIsNotSavedYetThePackage')}</p> : null}
        {error ? <p className="rounded-lg border border-danger/30 bg-danger-surface p-3 text-sm text-danger" role="alert">{formatProductMessage(error, t)}</p> : null}
        {resourceReview?.length ? <section className="grid gap-2 rounded-lg border border-line bg-list/50 p-3" aria-label={t('messages:resources.packageReview')}><p className="text-sm text-primary">{t('messages:resources.packageReview')}</p><p className="text-xs text-muted">{t('messages:resources.packageReviewHelp')}</p><ul className="grid max-h-40 gap-2 overflow-x-clip overflow-y-auto text-xs text-warning">{resourceReview.map((issue, index) => <li key={index}>{formatDiagnosticMessage(issue, t)}</li>)}</ul></section> : null}
      </div>
      <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}>{t('common:actions.cancel')}</DialogButton>{resourceReview?.length ? <DialogButton variant="primary" disabled={busy || !isCurrent() || !capability.enabled} onClick={() => void exportArticle(true)}>{t('messages:resources.continuePartialPackage')}</DialogButton> : <DialogButton type="submit" variant="primary" disabled={busy || !isCurrent() || !capability.enabled}>{busy ? t('dialogs:ui.generating') : t('dialogs:templates.export', { name: t('dialogs:exportFormats.' + selected.id + '.title') })}</DialogButton>}</DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
function parseBody(source: string) { return articleMarkdownBody(source); }

export function ArticleExportDialog(props: ComponentProps<typeof LegacyArticleExportDialog> & { theme: ThemeConfig; onTransform: (source: string) => void }) {
  const active = useFormatSnapshot();
  let snapshot = active;
  if (!active.error && props.previewRef.current) {
    try { snapshot = getArticleRenderSnapshot(props.previewRef.current); } catch { /* The current source remains downloadable while the preview is stale. */ }
  }
  return snapshot.renderer ? <PackageOutputDialog getResourceRevision={props.getResourceRevision} root={props.root} month={props.month} folder={props.folder} previewRef={props.previewRef} prepareVisual={props.prepareVisual} focusActive={props.focusActive} snapshot={snapshot} source={props.source} theme={props.theme} title={props.title} isCurrent={props.isCurrent} onTransform={props.onTransform} onExported={props.onExported} onClose={props.onClose} /> : <LegacyArticleExportDialog {...props} />;
}
