'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { IconButton } from '../global/IconButton';
import { IconPopover } from '../global/IconPopover';
import { ContentIcon } from '../global/ContentIcon';
import { LibraryCardFrame, LibraryCardGrid } from '../global/LibraryCard';
import { useToast } from '../global/Toast';
import { productErrorMessage } from '../../lib/i18n/productMessages';
import { formatKnowledgeIssue } from '../../lib/knowledge/errors';
import { ButtonBar } from '../global/ButtonBar';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { inspectCapture, type KnowledgeResearch, type CollectedKnowledge } from '../../lib/knowledge/research';
import { diffLines } from '../../lib/textDiff';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';
type Review = { item: CollectedKnowledge; text: string; current: string; line: number; endLine: number };
export function KnowledgeChanges({ data, source, onChange, onOpen, toolbarTarget }: {
  data: KnowledgeResearch; source: ReadonlyKnowledgeSource; onChange: (mutate: (data: KnowledgeResearch) => void) => Promise<boolean>; onOpen: (path: string, line?: number) => void; toolbarTarget?: HTMLElement | null;
}) {
  const { t } = useUITranslation('knowledge'), notify = useToast(), [busy, setBusy] = useState(false), [issue, setIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null), [diagnosticsOpen, setDiagnosticsOpen] = useState(false), [review, setReview] = useState<Review | null>(null);
  const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const items = useMemo(() => [...data.topics.flatMap(topic => topic.items), ...data.citations], [data]);
  const rows = useMemo(() => review ? diffLines(review.item.original ?? review.item.content, review.current) : [], [review]);
  const read = async (path: string) => { const file = await source.readFile(path); if (file.size > 2 * 1024 * 1024) throw new Error('contentTruncated'); return file.text(); };
  const check = async () => {
    setBusy(true); setIssue(null); const checked = new Map<string, { original: string; change: CollectedKnowledge['change'] }>();
    try {
      for (const path of new Set(items.map(item => item.path))) {
        if (!active.current) return;
        let text: string | null = null;
        try { text = await read(path); } catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
        for (const item of items.filter(item => item.path === path)) checked.set(item.id, { original: item.original ?? item.content, change: text === null ? 'missing' : inspectCapture(item, text).changed ? 'changed' : 'same' });
      }
      if (!active.current) return;
      await onChange(value => { for (const item of [...value.topics.flatMap(topic => topic.items), ...value.citations]) { const result = checked.get(item.id); if (result && result.original === (item.original ?? item.content)) { item.change = result.change; item.checkedAt = new Date().toISOString(); } } });
    } catch (error) { if (active.current) setIssue(productErrorMessage(error)); }
    finally { if (active.current) setBusy(false); }
  };
  const inspect = async (item: CollectedKnowledge) => {
    setBusy(true); setIssue(null);
    try { const text = await read(item.path), result = inspectCapture(item, text); if (active.current) setReview({ item, text, current: result.changed ? result.content : item.original ?? item.content, line: result.line, endLine: result.endLine }); }
    catch (error) { if (active.current) setIssue(productErrorMessage(error)); }
    finally { if (active.current) setBusy(false); }
  };
  const update = async () => {
    if (!review) return; setBusy(true);
    try {
      if (await read(review.item.path) !== review.text) throw new Error('researchChanged');
      const saved = await onChange(value => { const target = [...value.topics.flatMap(topic => topic.items), ...value.citations].find(item => item.id === review.item.id); if (!target || (target.original ?? target.content) !== (review.item.original ?? review.item.content)) throw new Error('researchChanged'); if (target.content !== review.current || target.original !== undefined) target.updatedAt = new Date().toISOString(); target.content = review.current; delete target.original; target.line = review.line; target.endLine = review.endLine; target.change = 'same'; target.checkedAt = new Date().toISOString(); });
      if (active.current) { if (saved) setReview(null); else setIssue(productErrorMessage(new Error('researchChanged'))); }
    } catch (error) { if (active.current) setIssue(productErrorMessage(error)); }
    finally { if (active.current) setBusy(false); }
  };
  useEffect(() => { if (issue) notify({ key: 'knowledge-changes', label: t('notice.failed'), tone: 'error' }); }, [issue, notify, t]);
  const diagnostics = issue ? <IconPopover label={t('diagnostics')} kind="dialog" open={diagnosticsOpen} onToggle={() => setDiagnosticsOpen(value => !value)} onClose={() => setDiagnosticsOpen(false)} icon={<ContentIcon name="info" />}><p role="alert" className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words p-3 text-xs text-danger">{formatKnowledgeIssue(issue, t)}</p></IconPopover> : null;
  const controls = <div className="flex min-w-0 flex-1 items-center gap-2"><p className="min-w-0 flex-1 text-xs text-muted">{t('changesHelp')}</p>{!review ? diagnostics : null}<IconButton tooltip={t(busy ? 'checkingChanges' : 'checkChanges')} icon={<ContentIcon name="reset" />} disabled={busy || !items.length} onClick={() => void check()} /></div>;
  return <div className="flex min-h-0 flex-1 flex-col">{toolbarTarget ? createPortal(controls, toolbarTarget) : <div className="border-b border-line p-3">{controls}</div>}
    <LibraryCardGrid className="min-h-0 flex-1 overflow-y-auto overflow-x-clip p-3">{items.length ? items.map(item => <LibraryCardFrame key={item.id}><pre className="aspect-video overflow-y-auto overflow-x-clip whitespace-pre-wrap break-words border-b border-line bg-list p-4 font-article-source text-xs text-secondary" tabIndex={0} aria-label={t('retainedText')}>{item.content}</pre><ButtonBar label={t('changes')} className="p-3"><button className="flex min-w-0 flex-1 items-center gap-2 truncate rounded text-left text-sm font-medium text-primary hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent" type="button" title={t('readOriginal') + ' · ' + item.path} onClick={() => onOpen(item.path, item.line)}><ContentIcon name="document" /><span className="min-w-0 truncate">{item.title || item.path}</span></button><IconButton tooltip={t('reviewChanges')} icon={<ContentIcon name="changes" />} disabled={busy} onClick={() => void inspect(item)} /></ButtonBar><p className="flex flex-wrap items-center gap-2 px-3 pb-3 text-2xs text-muted"><span className="rounded bg-canvas px-2 py-0.5">{'articleId' in item ? t('citation') : item.whole ? t('captureWhole') : t('captureLines', { start: item.line, end: item.endLine })}</span><span data-changed={item.change === 'changed' || item.change === 'missing'} className="data-[changed=true]:text-warning">{t('change.' + (item.change ?? 'unchecked'))}</span><span className="min-w-0 flex-1 truncate font-mono text-faint" title={item.path}>{item.path}{'articleId' in item ? ' · ' + item.articleId : ''}</span></p></LibraryCardFrame>) : <p className="text-sm text-muted">{t('changesEmpty')}</p>}</LibraryCardGrid>
    {review && typeof document !== 'undefined' ? createPortal(<DialogFrame large titleId="knowledge-change-title" onClose={() => setReview(null)}><DialogHeader titleId="knowledge-change-title" eyebrow={t('changes')} title={review.item.title || review.item.path} onClose={() => setReview(null)} /><div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"><p className="text-xs text-muted">{t('changeLocationHelp')}</p>{!review.item.whole ? <div className="flex flex-wrap gap-2">{(['line', 'endLine'] as const).map(key => <label key={key} className="grid gap-1 text-xs text-muted">{t(key === 'line' ? 'startLine' : 'endLine')}<input className="field w-28" type="number" min={1} max={review.text.split('\n').length} value={review[key]} onChange={event => { const value = Math.max(1, Number(event.target.value) || 1), line = key === 'line' ? value : review.line, endLine = key === 'endLine' ? value : Math.max(value, review.endLine); setReview({ ...review, line, endLine, current: review.text.split(/\r?\n/).slice(line - 1, endLine).join('\n') }); }} /></label>)}</div> : null}
      <div className="history-diff-columns"><section><h4 className="font-heading">{t('retainedText')}</h4><pre className="history-diff-lines" tabIndex={0}>{rows.slice(0, 1000).map((row, index) => <span key={index} className="history-diff-row" data-kind={row.kind}><i>{row.left === null ? '' : index + 1}</i><code>{row.left ?? ' '}</code></span>)}</pre></section><section><h4 className="font-heading">{t('currentText')}</h4><pre className="history-diff-lines" tabIndex={0}>{rows.slice(0, 1000).map((row, index) => <span key={index} className="history-diff-row" data-kind={row.kind}><i>{row.right === null ? '' : index + 1}</i><code>{row.right ?? ' '}</code></span>)}</pre></section></div>{rows.length > 1000 ? <p className="text-xs text-warning">{t('diffTruncated')}</p> : null}</div>
      <DialogFooter>{diagnostics}<DialogActions><DialogButton onClick={() => setReview(null)}>{t('keepSnapshot')}</DialogButton><DialogButton variant="primary" disabled={busy || review.endLine < review.line} onClick={() => void update()}>{t('updateSnapshot')}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>, document.body) : null}
  </div>;
}
