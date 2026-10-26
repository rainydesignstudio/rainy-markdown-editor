'use client';
import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { SelectField } from '../global/SelectField';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { ButtonBar } from '../global/ButtonBar';
import { IconButton } from '../global/IconButton';
import { IconPopover } from '../global/IconPopover';
import { LibraryCardFrame, LibraryCardGrid } from '../global/LibraryCard';
import { ContentIcon } from '../global/ContentIcon';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { useToast } from '../global/Toast';
import { KnowledgeExcerpt, KnowledgeReader } from './KnowledgeReader';
import { ARTICLE_SORTS } from '../../lib/articleListSorting';
import { reorderCollectedKnowledge, sortCollectedKnowledge, transferCollectedKnowledge, type ResearchSort, type KnowledgeResearch, type KnowledgeTopic, type CollectedKnowledge } from '../../lib/knowledge/research';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';
import type { KnowledgeManifest } from '../../lib/knowledge/model';

const dragType = 'application/x-rainy-knowledge-capture';
const grip = <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" /></svg>;
export function KnowledgeTopics({ data, selected, onSelect, onChange, onOpen, onDownload, source, manifest, articles, busy, toolbarTarget }: {
  data: KnowledgeResearch; selected: string; onSelect: (id: string) => void; onChange: (mutate: (data: KnowledgeResearch) => void) => Promise<boolean>;
  onOpen: (path: string, line?: number, fragment?: string) => void; onDownload: (path: string) => void; source: ReadonlyKnowledgeSource; manifest: KnowledgeManifest | null;
  articles: { id: string; title: string }[]; busy: boolean; toolbarTarget?: HTMLElement | null;
}) {
  const { t } = useUITranslation('knowledge'), { locale } = useUILocale(), notify = useToast();
  const [name, setName] = useState(''), [creating, setCreating] = useState(false), [sort, setSort] = useState<ResearchSort>('manual'), [infoOpen, setInfoOpen] = useState(false);
  const [detailId, setDetailId] = useState(''), [note, setNote] = useState(''), [notesOpen, setNotesOpen] = useState(false), [transferOpen, setTransferOpen] = useState(false), [targetId, setTargetId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false), [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [dragged, setDragged] = useState(''), [order, setOrder] = useState<string[] | null>(null);
  const dragRef = useRef(''), orderRef = useRef<string[] | null>(null);
  const topic = data.topics.find(item => item.id === selected), detail = topic?.items.find(item => item.id === detailId), dirty = Boolean(detail && note !== detail.note);
  const items = useMemo(() => sortCollectedKnowledge(topic?.items ?? [], sort, locale), [topic, sort, locale]);
  const shown = order && sort === 'manual' ? order.map(id => items.find(item => item.id === id)).filter((item): item is CollectedKnowledge => Boolean(item)) : items;
  const targets = data.topics.filter(item => item.id !== selected);
  const edit = (mutate: (topic: KnowledgeTopic) => void) => onChange(value => { const current = value.topics.find(item => item.id === selected); if (!current) throw new Error('researchChanged'); mutate(current); });
  const success = (key: string) => notify({ key: 'knowledge-topic', label: t(key), tone: 'success' });
  const leave = (action: () => void) => { if (dirty) setLeaving(() => action); else action(); };
  const close = () => leave(() => { setDetailId(''); setTransferOpen(false); setConfirmRemove(false); });
  const open = (item: CollectedKnowledge) => { setDetailId(item.id); setNote(item.note); setNotesOpen(false); setConfirmRemove(false); setTransferOpen(false); };
  const saveNote = async () => {
    if (!detail || busy) return false;
    if (!dirty) return true;
    const id = detail.id, value = note;
    const ok = await edit(current => { const item = current.items.find(item => item.id === id); if (!item) throw new Error('researchChanged'); item.note = value; item.updatedAt = new Date().toISOString(); });
    if (ok) success('topicNoteSaved');
    return ok;
  };
  const transfer = async (copy: boolean) => {
    if (!detail || !targetId || busy || dirty) return;
    if (await onChange(value => transferCollectedKnowledge(value, selected, detail.id, targetId, copy))) { success(copy ? 'topicCopied' : 'topicMoved'); setTransferOpen(false); setDetailId(''); }
  };
  const remove = async () => {
    if (!detail || busy) return;
    const id = detail.id;
    if (await edit(current => { current.items = current.items.filter(item => item.id !== id); })) { success('topicRemoved'); setDetailId(''); setConfirmRemove(false); }
  };
  const startDrag = (id: string) => { dragRef.current = id; orderRef.current = topic?.items.map(item => item.id) ?? []; setDragged(id); setOrder(orderRef.current); };
  const resetDrag = () => { dragRef.current = ''; orderRef.current = null; setDragged(''); setOrder(null); };
  const movePreview = (target: string) => {
    const active = dragRef.current;
    if (!active || active === target) return;
    const ids = [...(orderRef.current ?? topic?.items.map(item => item.id) ?? [])], from = ids.indexOf(active), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]); orderRef.current = ids; setOrder(ids);
  };
  const commitOrder = async () => {
    const ids = orderRef.current; resetDrag();
    if (ids && await onChange(value => reorderCollectedKnowledge(value, selected, ids))) success('topicOrderSaved');
  };
  const dragStart = (event: DragEvent<HTMLElement>, id: string) => {
    if (busy || sort !== 'manual') { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(dragType, data.sourceId + ':' + selected + ':' + id);
    startDrag(id);
  };
  const dragKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (busy || sort !== 'manual') return;
    if (event.key === 'Escape' && dragRef.current) { event.preventDefault(); resetDrag(); return; }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (dragRef.current === id) void commitOrder(); else startDrag(id);
    } else if (dragRef.current === id && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const ids = orderRef.current ?? [], index = ids.indexOf(id), next = index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      if (next >= 0 && next < ids.length) movePreview(ids[next]);
    }
  };
  const controls = <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
    <SelectField label={t('topics')} className="min-w-0 basis-40 grow" value={selected} onChange={onSelect} disabled={busy} options={[{ value: '', label: t('topicChoose') }, ...data.topics.map(item => ({ value: item.id, label: item.name + ' · ' + item.items.length }))]} />
    <IconPopover label={t('topicCreate')} kind="dialog" open={creating} disabled={busy} onToggle={() => setCreating(value => !value)} onClose={() => setCreating(false)} icon={<ContentIcon name="plus" />}>
      <form className="grid gap-4 p-4" onSubmit={event => { event.preventDefault(); if (busy || !name.trim()) return; const id = crypto.randomUUID(); void onChange(value => { value.topics.push({ id, name: name.trim(), note: '', articleIds: [], items: [] }); }).then(ok => { if (ok) { onSelect(id); setName(''); setCreating(false); } }); }}>
        <label className="grid gap-2 text-xs text-muted">{t('topicName')}<input className="field w-full" maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label><button className="button button-primary" disabled={busy || !name.trim()}>{t('topicCreate')}</button>
      </form>
    </IconPopover>
    <SelectField label={t('topicSort')} className="w-40 shrink-0" value={sort} disabled={busy || !topic} onChange={value => { resetDrag(); setSort(value as ResearchSort); }} options={[{ value: 'manual', label: t('topicManual') }, ...ARTICLE_SORTS.map(value => ({ value, label: t('articles:sort.' + value) }))]} />
    <IconButton className="xl:hidden" tooltip={t('topicInfo')} icon={<ContentIcon name="info" />} aria-expanded={infoOpen} disabled={!topic} onClick={() => setInfoOpen(value => !value)} />
  </div>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {toolbarTarget ? createPortal(controls, toolbarTarget) : <div className="border-b border-line p-3">{controls}</div>}
    {topic ? <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
      <div data-info={infoOpen} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip p-4 data-[info=true]:hidden xl:data-[info=true]:block">
        {shown.length ? <LibraryCardGrid>{shown.map(item => <LibraryCardFrame key={item.id} data-dragged={dragged === item.id} className="data-[dragged=true]:border-accent-line" onDragOver={event => { if (!dragRef.current || sort !== 'manual') return; event.preventDefault(); movePreview(item.id); }} onDrop={event => { if (event.dataTransfer.getData(dragType) !== data.sourceId + ':' + selected + ':' + dragRef.current) return; event.preventDefault(); void commitOrder(); }}>
          <div role="button" tabIndex={0} aria-label={t('topicOpenCapture', { title: item.title || item.path })} className="aspect-video cursor-pointer overflow-hidden border-b border-line bg-list p-4 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent" onClick={() => open(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(item); } }}><KnowledgeExcerpt text={item.content} /></div>
          <ButtonBar label={t('topics')} className="p-3"><button className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm font-medium text-primary hover:text-accent-text focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent" type="button" title={item.title || item.path} onClick={() => open(item)}><ContentIcon name="document" /><span className="min-w-0 truncate">{item.title || item.path}</span></button><IconButton tooltip={t(sort === 'manual' ? 'topicDragHelp' : 'topicManualOnly')} icon={grip} className="cursor-grab active:cursor-grabbing" disabled={busy || sort !== 'manual'} aria-pressed={dragged === item.id} draggable={!busy && sort === 'manual'} onDragStart={event => dragStart(event, item.id)} onDragEnd={resetDrag} onKeyDown={event => dragKey(event, item.id)} /></ButtonBar>
          <p className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-3 text-2xs text-muted"><span className="rounded bg-canvas px-2 py-0.5">{item.whole ? t('captureWhole') : t('captureLines', { start: item.line, end: item.endLine })}</span>{item.note ? <span title={item.note}>{t('topicHasNote')}</span> : null}<span className="min-w-0 flex-1 truncate font-mono text-faint" title={item.path}>{item.path}</span></p>
        </LibraryCardFrame>)}</LibraryCardGrid> : <p className="text-sm text-muted">{t('topicCollectHelp')}</p>}
        <p className="sr-only" role="status" aria-live="polite">{dragged ? t('topicDragPosition', { index: (order ?? []).indexOf(dragged) + 1, total: shown.length }) : ''}</p>
      </div>
      <aside data-open={infoOpen} className="hidden min-h-0 min-w-0 flex-col gap-6 overflow-y-auto overflow-x-clip border-t border-line bg-list/30 p-4 data-[open=true]:flex xl:flex xl:w-72 xl:shrink-0 xl:border-t-0 xl:border-l" aria-label={t('topicInfo')}>
        <section className="grid min-w-0 gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><ContentIcon name="edit" />{t('topicNote')}</h3><label className="grid gap-2 text-xs text-muted"><span className="sr-only">{t('topicNote')}</span><textarea key={topic.id + ':note:' + topic.note} className="field min-h-32 w-full resize-y" defaultValue={topic.note} placeholder={t('topicNotePlaceholder')} maxLength={65536} disabled={busy} onBlur={event => { const value = event.target.value; if (value !== topic.note) void edit(current => { current.note = value; }); }} /></label></section>
        <section className="grid min-w-0 gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><ContentIcon name="link" /><span className="min-w-0 flex-1">{t('topicArticles')}</span><span className="text-xs text-faint">{topic.articleIds.length}</span></h3><SelectField label={t('topicLinkArticle')} className="w-full" value="" disabled={busy} onChange={id => { if (id) void edit(current => { if (!current.articleIds.includes(id)) current.articleIds.push(id); }); }} options={[{ value: '', label: t('topicLinkArticle') }, ...articles.filter(article => !topic.articleIds.includes(article.id)).map(article => ({ value: article.id, label: article.title }))]} />
          {topic.articleIds.length ? <ul className="grid min-w-0 gap-2">{topic.articleIds.map(id => <li key={id} className="flex min-w-0 items-start gap-2 rounded-md border border-line bg-panel p-2"><span className="min-w-0 flex-1 wrap-anywhere text-xs text-secondary">{articles.find(article => article.id === id)?.title ?? id}</span><IconButton tooltip={t('unlink')} disabled={busy} icon={<ContentIcon name="close" />} onClick={() => void edit(current => { current.articleIds = current.articleIds.filter(item => item !== id); })} /></li>)}</ul> : <p className="text-xs text-muted">{t('topicNoArticles')}</p>}
        </section>
      </aside>
    </div> : <p className="p-4 text-sm text-muted">{t('topicCollectHelp')}</p>}
    {detail && typeof document !== 'undefined' ? createPortal(<DialogFrame large titleId="knowledge-capture-title" onClose={close} dismissible={!busy} focusActive={!leaving}>
      <DialogHeader titleId="knowledge-capture-title" eyebrow={t('captureDetails')} title={detail.title || detail.path} onClose={close} closeDisabled={busy} actions={<>
        <IconPopover label={t('topicTransfer')} tooltip={dirty ? t('topicSaveFirst') : !targets.length ? t('topicNoOther') : t('topicTransfer')} kind="dialog" open={transferOpen} disabled={busy || dirty || !targets.length} onToggle={() => setTransferOpen(value => !value)} onClose={() => setTransferOpen(false)} icon={<ContentIcon name="copy" />}><div className="grid gap-4 p-4"><SelectField label={t('topicTarget')} className="w-full" value={targetId} disabled={busy} onChange={setTargetId} options={[{ value: '', label: t('topicTarget') }, ...targets.map(item => ({ value: item.id, label: item.name }))]} /><ButtonBar label={t('topicTransfer')}><button className="button button-quiet" type="button" disabled={busy || !targetId} onClick={() => void transfer(false)}>{t('topicMove')}</button><button className="button button-primary" type="button" disabled={busy || !targetId} onClick={() => void transfer(true)}>{t('topicCopy')}</button></ButtonBar></div></IconPopover>
        <IconButton tooltip={t('readOriginal')} icon={<ContentIcon name="document" />} disabled={busy} onClick={() => leave(() => { setDetailId(''); onOpen(detail.path, detail.line); })} />
        <IconButton tooltip={t(notesOpen ? 'topicHideNote' : 'topicViewNote')} icon={<ContentIcon name="edit" />} aria-pressed={notesOpen} disabled={busy} onClick={() => setNotesOpen(value => !value)} />
        <IconButton tooltip={dirty ? t('topicSaveFirst') : t('topicRemove')} tone="danger" icon={<ContentIcon name="delete" />} disabled={busy || dirty} onClick={() => setConfirmRemove(true)} />
      </>} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col"><p className="shrink-0 wrap-anywhere border-b border-line px-4 py-3 text-xs text-muted">{detail.whole ? t('captureWhole') : t('captureLines', { start: detail.line, end: detail.endLine })} · {detail.path}</p>
        {confirmRemove ? <div className="grid gap-4 p-4"><p className="text-sm text-secondary">{t('topicRemoveHelp')}</p><DialogActions><DialogButton disabled={busy} onClick={() => setConfirmRemove(false)}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="danger" disabled={busy} onClick={() => void remove()}>{t('topicRemove')}</DialogButton></DialogActions></div> : <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row"><KnowledgeReader source={source} path={detail.path} text={detail.content} manifest={manifest} onOpen={(path, line, fragment) => leave(() => { setDetailId(''); onOpen(path, line, fragment); })} onDownload={onDownload} variant="reference" />{notesOpen ? <aside className="flex min-h-0 min-w-0 shrink-0 flex-col gap-3 overflow-y-auto border-t border-line p-4 lg:w-72 lg:border-t-0 lg:border-l"><label className="grid gap-2 text-xs text-muted">{t('note')}<textarea className="field min-h-32 w-full resize-y" value={note} maxLength={65536} disabled={busy} onChange={event => setNote(event.target.value)} /></label><p className="text-xs text-faint">{t('topicNoteHelp')}</p></aside> : null}</div>}
      </div>
      {dirty ? <DialogFooter><DialogActions><DialogButton variant="primary" disabled={busy} onClick={() => void saveNote()}><ContentIcon name="save" />{t('topicSaveNote')}</DialogButton></DialogActions></DialogFooter> : null}
    </DialogFrame>, document.body) : null}
    {leaving && detail && typeof document !== 'undefined' ? createPortal(<UnsavedChangesDialog entries={[{ label: detail.title || detail.path, detail: t('note') }]} description={t('topicUnsavedNote')} onCancel={() => setLeaving(null)} onContinue={() => setLeaving(null)} onDiscard={() => { leaving(); setLeaving(null); }} onSave={async () => { if (!await saveNote()) return false; leaving(); setLeaving(null); return true; }} />, document.body) : null}
  </div>;
}
