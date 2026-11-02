'use client';
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
import { ArticleExportForm } from './ArticleExportForm';

export function PackageOutputDialog({ snapshot, source, theme, title, root, month, folder, previewRef, prepareVisual, getResourceRevision, focusActive = true, dirty = false, isCurrent, onExported, onClose }: {
  snapshot: FormatSnapshot; source: string; theme: ThemeConfig; title: string; isCurrent: () => boolean;
  root: FileSystemDirectoryHandle; month: string | null; folder: string | null; previewRef: MutableRefObject<HTMLElement | null>; prepareVisual: () => Promise<boolean>; focusActive?: boolean; getResourceRevision?: () => number;
  dirty?: boolean; onExported: (name: string) => void; onClose: () => void;
}) {
  const { t } = useUITranslation('messages');
  const actions = snapshot.renderer!.declaration.actions.filter(a => a.kind === 'export');
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
      const result = await invokeRenderer(snapshot, action.id, { source, theme }, operation.current.signal, services);
      if (!current()) throw new Error(t('formatPackage.changed'));
      if (typeof result.data !== 'string') throw new Error(t('formatPackage.noResult'));
      const extension = result.extension ?? action.extension ?? 'txt', mime = result.mime ?? action.mime ?? 'text/plain';
      const name = articleExportBaseName(base) + '.' + extension;
      if (/^(?:html?|xhtml|svg)$/i.test(extension) || /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(mime)) {
        if (result.encoding === 'base64') throw new Error(t('formatPackage.noResult'));
        assertInertPackageMarkup(result.data, true, snapshot.renderer?.declaration.permissions);
      }
      const data = result.encoding === 'base64' ? Uint8Array.from(atob(result.data), char => char.charCodeAt(0)) : result.data;
      downloadArticleBlob(new Blob([data], { type: mime }), name); onExported(name);
      onClose();
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  const answer = (value: boolean) => { reviewAnswer.current?.(value); reviewAnswer.current = null; setReview(null); };
  return <><ArticleExportForm choices={actions.map(item => ({ id: item.id, title: item.label, extension: item.extension, detail: item.mime }))} selected={selected} onSelect={setSelected} filename={{ base, name: action?.extension ? articleExportBaseName(base) + '.' + action.extension : undefined, onChange: setBase }} dirty={dirty} busy={busy} disabled={!action || !current()} error={error} focusActive={focusActive && !review} onSubmit={() => void run()} onClose={onClose} />{review ? <DialogFrame titleId="package-resources-title" onClose={() => answer(false)}><DialogHeader eyebrow="EXPORT" titleId="package-resources-title" title={t('resources.packageReview')} onClose={() => answer(false)} /><div className="grid gap-4 p-4"><p className="text-sm text-muted">{t('resources.packageReviewHelp')}</p><ul className="grid max-h-64 gap-2 overflow-x-clip overflow-y-auto text-xs text-warning">{review.map((issue, index) => <li key={index}>{formatDiagnosticMessage(issue, t)}</li>)}</ul></div><DialogFooter><DialogActions><DialogButton onClick={() => answer(false)}><ContentIcon name="close" />{t('formatPackage.cancel')}</DialogButton><DialogButton variant="primary" onClick={() => answer(true)}>{t('resources.continuePartialPackage')}</DialogButton></DialogActions></DialogFooter></DialogFrame> : null}</>;
}
