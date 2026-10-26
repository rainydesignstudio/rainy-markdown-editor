'use client';
import { SelectField } from '../global/SelectField';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { TooltipButton } from '../global/TooltipButton';
import { IconButton } from '../global/IconButton';
import { ContentIcon } from '../global/ContentIcon';
import { readCitations, insertCitation, isLegacyCitationMarker, setCitationText, tidyCitations } from '../../lib/knowledge/citations';
import { insertUndoableText } from '../../lib/nativeTextareaEdit';
import type { KnowledgeCapture } from '../../lib/knowledge/model';
export type CitationRequest = { capture?: KnowledgeCapture; excerpt?: boolean; edit?: string };
export function CitationTools({ body, textareaRef, onChange, request, onConsumed, disabled, scope, onReferenced, loadChanges, icon }: {
  body: string; textareaRef: MutableRefObject<HTMLTextAreaElement | null>; onChange: (body: string) => void; request: CitationRequest | null; onConsumed: () => void; disabled: boolean; scope: string;
  loadChanges?: () => Promise<string[]>;
  onReferenced?: (capture: KnowledgeCapture, id: string) => void | Promise<void>;
  icon?: ReactNode;
}) {
  const { t } = useUITranslation('knowledge');
  const [open, setOpen] = useState(false), [chosen, setChosen] = useState(''), [text, setText] = useState(''), [quote, setQuote] = useState(false), [issue, setIssue] = useState('');
  const [changed, setChanged] = useState<string[]>([]);
  const [adoptLegacy, setAdoptLegacy] = useState(false);
  useEffect(() => { let active = true; if (open && loadChanges) void loadChanges().then(value => { if (active) setChanged(value); }).catch(() => {}); return () => { active = false; }; }, [open, scope]);
  const base = useRef(body);
  const pending = useRef<CitationRequest | null>(null), selection = useRef({ start: 0, end: 0 });
  const currentBody = useRef(body); currentBody.current = body;
  const { entries, invalid } = useMemo(() => {
    if (!open) return { entries: [], invalid: false };
    try { return { entries: readCitations(body).entries, invalid: false }; } catch { return { entries: [], invalid: true }; }
  }, [body, open]);
  const chosenEntry = entries.find(entry => entry.id === chosen);
  const dirty = Boolean(chosenEntry && text !== chosenEntry.text);
  const locked = disabled || invalid || body !== base.current;
  const begin = (value: CitationRequest = {}) => {
    const area = textareaRef.current;
    selection.current = { start: area?.selectionStart ?? body.length, end: area?.selectionEnd ?? body.length };
    let initialText = value.capture?.title ?? '';
    if (value.edit) try { initialText = readCitations(body).entries.find(entry => entry.id === value.edit)?.text ?? ''; } catch { /* the open dialog reports malformed managed text */ }
    base.current = body; pending.current = value; setChosen(value.edit ?? ''); setText(initialText); setQuote(false); setAdoptLegacy(false); setIssue(''); setOpen(true);
  };
  useEffect(() => { if (request && !disabled) begin(request); if (request) onConsumed(); }, [request]);
  useEffect(() => { setOpen(false); pending.current = null; }, [scope]);
  const change = (next: string, caret?: number) => {
    const area = textareaRef.current;
    if (disabled || !area || area.value !== body || currentBody.current !== body || !insertUndoableText(area, next, 0, body.length, () => currentBody.current, onChange)) { setIssue(t('citationInsertFailed')); return false; }
    if (caret !== undefined) requestAnimationFrame(() => area.setSelectionRange(caret, caret));
    return true;
  };
  const run = async (action: 'insert' | 'save' | 'tidy') => {
    try {
      if (disabled || action === 'insert' && dirty || action === 'save' && !dirty) return;
      if (body !== base.current) { setIssue(t('citationInsertFailed')); return; }
      if (invalid) throw new Error('citationInvalid');
      const heading = '## ' + t('references');
      if (action === 'tidy') { if (change(tidyCitations(body, heading))) setOpen(false); }
      else if (action === 'save') { if (change(setCitationText(body, chosen, text, heading))) setOpen(false); }
      else {
        const value = pending.current, result = insertCitation(body, selection.current, text, heading, value?.excerpt ? value.capture?.content : '', quote, chosen || undefined, adoptLegacy);
        if (change(result.body, result.caret)) { setOpen(false); if (value?.capture) await onReferenced?.(value.capture, result.id); }
      }
    } catch (error) { setIssue(error instanceof Error && error.message !== 'citationInvalid' && error.message !== 'citationMissing' ? t('citationTrackingFailed', { cause: error.message }) : t('citationInvalid')); }
  };
  return <>{!open && issue ? <span role="alert" className="text-xs text-danger">{issue}</span> : null}{icon ? <IconButton icon={icon} tooltip={t('citation')} disabled={disabled} onClick={() => begin()} /> : <button className="button button-quiet" type="button" disabled={disabled} onClick={() => begin()}>{t('citation')}</button>}
    {open && typeof document !== 'undefined' ? createPortal(<DialogFrame wide titleId="citation-title" onClose={() => setOpen(false)}><DialogHeader titleId="citation-title" eyebrow={t('eyebrow')} title={t('citation')} onClose={() => setOpen(false)} />
      <div className="grid gap-3 p-4"><p className="text-xs text-muted">{t('citationHelp')}</p>
        <label className="grid gap-1 text-xs text-muted">{t('citationChoose')}<SelectField label={t('citationChoose')} value={chosen} onChange={nextValue => { setChosen(nextValue); setText(entries.find(entry => entry.id === nextValue)?.text ?? pending.current?.capture?.title ?? ''); }} options={[{ value: "", label: t('citationNew') }, ...(entries.map(entry => ({ value: entry.id, label: ["[", entry.number, "] ", entry.text.slice(0, 80), changed.includes(entry.id) ? ' · ' + t('change.changed') : ''].join('') })) ?? [])]} /></label>
        <label className="grid gap-1 text-xs text-muted">{t('citationText')}<textarea className="field min-h-28 w-full resize-y" value={text} onChange={event => setText(event.target.value)} /></label>
        {pending.current?.excerpt ? <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-accent" checked={quote} onChange={event => setQuote(event.target.checked)} />{t('citationQuote')}</label> : null}
        {isLegacyCitationMarker(base.current.slice(selection.current.start, selection.current.end)) ? <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-accent" checked={adoptLegacy} onChange={event => setAdoptLegacy(event.target.checked)} />{t('citationAdoptLegacy')}</label> : null}
        <p className="text-xs text-muted">{t('citationLegacy')}</p>{issue || invalid ? <p role="alert" className="text-sm text-danger">{issue || t('citationInvalid')}</p> : null}
      </div><DialogFooter><DialogActions><TooltipButton className="button button-quiet" tooltip={t('citationTidyHelp')} disabled={locked} onClick={() => run('tidy')}><ContentIcon name="reset" />{t('citationTidy')}</TooltipButton><DialogButton disabled={locked || !dirty} onClick={() => run('save')}><ContentIcon name="save" />{t('citationSave')}</DialogButton><DialogButton variant="primary" disabled={locked || dirty} onClick={() => run('insert')}><ContentIcon name="apply" />{t('citationInsert')}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame>, document.body) : null}</>;
}
