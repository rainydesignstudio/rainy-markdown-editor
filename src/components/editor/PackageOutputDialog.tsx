'use client';
import { SelectField } from '../global/SelectField';
import { ContentIcon } from '../global/ContentIcon';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { FormatSnapshot } from '../../lib/article-format/runtime';
import type { ThemeConfig } from '../../lib/types';
import { invokeRenderer } from '../../lib/article-format/package';
import { articleExportBaseName, downloadArticleBlob, createArticleDocumentPackage } from '../../lib/articleExport';
import { renderArticleExportCanvas, articleCanvasToPng } from '../../lib/articleVisualExport';
import { inspectArticleResources } from '../../lib/resources/inspection';
import { parseArticle } from '../../lib/frontMatter';
import { getArticleRenderSnapshot, getFormatSnapshot } from '../../lib/article-format/runtime';
import type { ArticleFormatIssue } from '../../lib/articleFormat';
import { formatDiagnosticMessage } from '../../lib/i18n/productMessages';
import { assertInertPackageMarkup } from '../../lib/article-format/packageRendering';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { useUITranslation } from '../global/UILocaleProvider';

export function PackageOutputDialog({ snapshot, source, theme, title, root, month, folder, previewRef, prepareVisual, getResourceRevision, focusActive = true, isCurrent, onTransform, onExported, onClose }: {
  snapshot: FormatSnapshot; source: string; theme: ThemeConfig; title: string; isCurrent: () => boolean;
  root: FileSystemDirectoryHandle; month: string | null; folder: string | null; previewRef: MutableRefObject<HTMLElement | null>; prepareVisual: () => Promise<boolean>; focusActive?: boolean; getResourceRevision?: () => number;
  onTransform: (source: string) => void; onExported: (name: string) => void; onClose: () => void;
}) {
  const { t } = useUITranslation('messages');
  const actions = snapshot.renderer!.declaration.actions.filter(a => ['format', 'export'].includes(a.kind));
  const [selected, setSelected] = useState(actions[0]?.id ?? ''), [base, setBase] = useState(articleExportBaseName(title)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const action = actions.find(a => a.id === selected);
  const operation = useRef<AbortController | null>(null), resourceRevision = useRef<number | undefined>(undefined);
  const active = useRef(true), running = useRef(false), reviewAnswer = useRef<((value: boolean) => void) | null>(null);
  const [review, setReview] = useState<ArticleFormatIssue[] | null>(null);
  useEffect(() => () => { active.current = false; operation.current?.abort(); reviewAnswer.current?.(false); }, []);
  const current = () => active.current && isCurrent() && getFormatSnapshot().id === snapshot.id && (!running.current || getResourceRevision?.() === resourceRevision.current);
  const encoded = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  };
  const services = {
    async 'capture-v1'(options: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      if (!current() || !await prepareVisual() || !current() || !previewRef.current) throw new Error(t('formatPackage.changed'));
      if (getArticleRenderSnapshot(previewRef.current).renderer?.fingerprint !== snapshot.renderer?.fingerprint) throw new Error(t('formatPackage.changed'));
      const parameters = options as { width: number; maxCanvasSide: number; background: string };
      const { canvas, blockEnds } = await renderArticleExportCanvas(previewRef.current, parameters);
      signal.throwIfAborted(); if (!current()) throw new Error(t('formatPackage.changed'));
      return { data: await encoded(await articleCanvasToPng(canvas)), width: canvas.width, height: canvas.height, blockEnds };
    },
    async 'archive-source-v1'(_input: unknown, signal: AbortSignal) {
      const available = () => current() && !signal.aborted;
      signal.throwIfAborted();
      if (!current()) throw new Error(t('formatPackage.changed'));
      const issues = await inspectArticleResources(parseArticle(source).body, { root, month, folder }, { output: true, isCurrent: available });
      let allowIncomplete = false;
      if (issues.length) {
        allowIncomplete = await new Promise<boolean>(resolve => { reviewAnswer.current = resolve; setReview(issues); });
        if (!allowIncomplete) throw new Error(t('formatPackage.cancelled'));
        const latest = await inspectArticleResources(parseArticle(source).body, { root, month, folder }, { output: true, isCurrent: available });
        if (JSON.stringify(latest) !== JSON.stringify(issues)) throw new Error(t('formatPackage.changed'));
      }
      const archive = await createArticleDocumentPackage(source, root, month, folder, { isCurrent: available, allowIncomplete });
      if (!current()) throw new Error(t('formatPackage.changed'));
      return { data: await encoded(archive.blob) };
    },
  };
  const run = async () => {
    if (!action || running.current || !current()) return;
    resourceRevision.current = getResourceRevision?.(); running.current = true; operation.current = new AbortController();
    setBusy(true); setError('');
    try {
      const result = await invokeRenderer(snapshot, action.id, { source, theme }, operation.current.signal, action.kind === 'export' ? services : {});
      if (!current()) throw new Error(t('formatPackage.changed'));
      if (action.kind === 'format') {
        if (typeof result.source !== 'string') throw new Error(t('formatPackage.noResult'));
        onTransform(result.source);
      } else {
        if (typeof result.data !== 'string') throw new Error(t('formatPackage.noResult'));
        const extension = result.extension ?? action.extension ?? 'txt', mime = result.mime ?? action.mime ?? 'text/plain';
        const name = articleExportBaseName(base) + '.' + extension;
        if (/^(?:html?|xhtml|svg)$/i.test(extension) || /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(mime)) {
          if (result.encoding === 'base64') throw new Error(t('formatPackage.noResult'));
          assertInertPackageMarkup(result.data, true, snapshot.renderer?.declaration.permissions);
        }
        const data = result.encoding === 'base64' ? Uint8Array.from(atob(result.data), char => char.charCodeAt(0)) : result.data;
        downloadArticleBlob(new Blob([data], { type: mime }), name); onExported(name);
      }
      onClose();
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  const answer = (value: boolean) => { reviewAnswer.current?.(value); reviewAnswer.current = null; setReview(null); };
  return <><DialogFrame titleId="package-output-title" onClose={onClose} focusActive={focusActive && !review} dismissible={!busy} className="flex min-h-0 max-w-lg flex-col overflow-hidden">
    <DialogHeader eyebrow="FORMAT" titleId="package-output-title" title={t('formatPackage.actions')} onClose={onClose} closeDisabled={busy} />
    <div className="grid min-h-0 gap-4 overflow-x-clip overflow-y-auto p-4"><label className="field-stack"><span className="field-label">{t('formatPackage.action')}</span><SelectField label={t('formatPackage.action')} value={selected} disabled={busy} onChange={nextValue => setSelected(nextValue)} options={[...(actions.map(item => ({ value: item.id, label: item.label })) ?? [])]} /></label>
      {action?.kind === 'export' ? <label className="field-stack"><span className="field-label">{t('formatPackage.filename')}</span><input className="field" value={base} disabled={busy} onChange={event => setBase(event.target.value)} /></label> : <p className="text-sm text-muted">{t('formatPackage.formatDraft')}</p>}
      {error ? <p role="alert" className="break-words text-sm text-danger">{error}</p> : null}</div>
    <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}><ContentIcon name="close" />{t('formatPackage.cancel')}</DialogButton><DialogButton variant="primary" disabled={busy || !action} onClick={() => void run()}><ContentIcon name="download" />{busy ? t('formatPackage.loading') : t('formatPackage.run')}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>{review ? <DialogFrame titleId="package-resources-title" onClose={() => answer(false)}><DialogHeader eyebrow="EXPORT" titleId="package-resources-title" title={t('resources.packageReview')} onClose={() => answer(false)} /><div className="grid gap-4 p-4"><p className="text-sm text-muted">{t('resources.packageReviewHelp')}</p><ul className="grid max-h-64 gap-2 overflow-x-clip overflow-y-auto text-xs text-warning">{review.map((issue, index) => <li key={index}>{formatDiagnosticMessage(issue, t)}</li>)}</ul></div><DialogFooter><DialogActions><DialogButton onClick={() => answer(false)}>{t('formatPackage.cancel')}</DialogButton><DialogButton variant="primary" onClick={() => answer(true)}>{t('resources.continuePartialPackage')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}</>;
}
