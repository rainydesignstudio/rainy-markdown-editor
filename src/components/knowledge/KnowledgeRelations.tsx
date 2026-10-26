'use client';
import { SelectField } from '../global/SelectField';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { ButtonBar } from '../global/ButtonBar';
import { IconButton } from '../global/IconButton';
import { ContentIcon } from '../global/ContentIcon';
import { LibraryCardFrame, LibraryCardGrid } from '../global/LibraryCard';
import { productErrorMessage } from '../../lib/i18n/productMessages';
import { formatKnowledgeIssue } from '../../lib/knowledge/errors';
import type { KnowledgeManifest } from '../../lib/knowledge/model';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';
export function KnowledgeRelations({ manifest, source, selected, onSelect, onOpen, onGraph, toolbarTarget }: {
  manifest: KnowledgeManifest; source: ReadonlyKnowledgeSource; selected: string; onSelect: (path: string) => void; onOpen: (path: string, line?: number) => void; onGraph: () => void; toolbarTarget?: HTMLElement | null;
}) {
  const { t } = useUITranslation('knowledge'), [page, setPage] = useState(1), [contexts, setContexts] = useState<Record<string, string>>({});
  const titles = useMemo(() => new Map(manifest.documents.map(doc => [doc.path, doc.title])), [manifest]);
  const edges = useMemo(() => manifest.edges.filter(edge => edge.from === selected || edge.to === selected), [manifest, selected]);
  const visible = useMemo(() => edges.slice((page - 1) * 25, page * 25), [edges, page]);
  useEffect(() => setPage(1), [selected, manifest]);
  useEffect(() => {
    let active = true; setContexts({});
    void (async () => {
      const values: Record<string, string> = {};
      for (const path of new Set(visible.map(edge => edge.from))) {
        try {
          const file = await source.readFile(path); if (!active) return;
          if (file.size > 2 * 1024 * 1024) throw new Error('contentTruncated');
          const lines = (await file.text()).split(/\r?\n/); if (!active) return;
          for (const edge of visible.filter(edge => edge.from === path)) values[path + ':' + edge.line] = lines.slice(Math.max(0, edge.line - 2), edge.line + 1).join('\n').slice(0, 2000);
        } catch (error) { if (!active) return; for (const edge of visible.filter(edge => edge.from === path)) values[path + ':' + edge.line] = t('relationUnavailable', { cause: formatKnowledgeIssue(productErrorMessage(error), t) }); }
      }
      if (active) setContexts(values);
    })();
    return () => { active = false; };
  }, [visible, source, t]);
  const controls = <ButtonBar label={t('relations')} className="min-w-0 flex-1"><label className="min-w-0 flex-1 text-xs text-muted"><span className="sr-only">{t('selectDocument')}</span><SelectField label={t('selectDocument')} className="w-full" value={selected} onChange={onSelect} options={manifest.documents.map(doc => ({ value: doc.path, label: doc.title, detail: doc.path }))} /></label><IconButton tooltip={t('relationGraph')} icon={<ContentIcon name="graph" />} disabled={!titles.has(selected)} onClick={onGraph} /></ButtonBar>;
  return <div className="flex min-h-0 flex-1 flex-col">{toolbarTarget ? createPortal(controls, toolbarTarget) : <div className="border-b border-line p-3">{controls}</div>}
    <LibraryCardGrid className="min-h-0 flex-1 overflow-y-auto overflow-x-clip p-3">{visible.length ? visible.map(edge => <LibraryCardFrame key={edge.from + ':' + edge.to + ':' + edge.line}>
      <button type="button" className="grid min-w-0 gap-3 p-4 text-left hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent" aria-label={t('relationSentence', { line: edge.line }) + ' · ' + (titles.get(edge.from) || edge.from)} onClick={() => onOpen(edge.from, edge.line)}><span className="text-2xs text-muted">{t(edge.from === selected ? 'outgoing' : 'incoming')}</span><span className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary"><ContentIcon name="quote" /><span className="min-w-0 truncate">{titles.get(edge.from) || edge.from}</span></span><span className="whitespace-pre-wrap break-words text-sm text-secondary">{contexts[edge.from + ':' + edge.line] ?? t('reading')}</span><span className="truncate font-mono text-2xs text-faint">{edge.from} · {t('location', { line: edge.line })}</span></button>
      <button type="button" className="flex min-w-0 items-center gap-3 border-t border-line p-4 text-left hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent" aria-label={t('relationTarget') + ' · ' + (titles.get(edge.to) || edge.to)} onClick={() => onOpen(edge.to)}><ContentIcon name="link" /><span className="grid min-w-0 gap-1"><span className="truncate text-sm font-medium text-primary">{titles.get(edge.to) || edge.to}</span><span className="truncate font-mono text-2xs text-faint">{edge.to}</span></span></button>
    </LibraryCardFrame>) : <p className="text-sm text-muted">{t('relationsEmpty')}</p>}</LibraryCardGrid>
    {edges.length > 25 ? <ButtonBar label={t('relations')} className="justify-between border-t border-line p-3"><button className="button button-quiet" type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</button><span className="text-xs text-muted">{t('page', { page, pages: Math.ceil(edges.length / 25) })}</span><button className="button button-quiet" type="button" disabled={page * 25 >= edges.length} onClick={() => setPage(value => value + 1)}>{t('next')}</button></ButtonBar> : null}
  </div>;
}
