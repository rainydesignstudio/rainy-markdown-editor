'use client';

import { useUITranslation } from '../global/UILocaleProvider';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTextInputHistory } from '../../hooks/useTextInputHistory';
import { IconButton } from '../global/IconButton';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

export type ReplaceAllDecision = { source: string; query: string; replacement: string; matchCase: boolean; count: number; changed?: boolean };

export function FindIcon({ name = 'find' }: { name?: 'find' | 'up' | 'down' | 'close' | 'case' | 'replace' | 'all' }) {
  const paths = { find: 'm21 21-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', up: 'm5 15 7-7 7 7', down: 'm5 9 7 7 7-7', close: 'm6 6 12 12M18 6 6 18', case: 'm3 18 5-12 5 12M5 14h6M15 11h6M21 11v7M21 15h-3a3 3 0 0 0 0 6', replace: 'M4 7h13m-4-4 4 4-4 4M20 17H7m4-4-4 4 4 4', all: 'M3 6h13m-4-3 4 3-4 3M3 12h18M3 18h13m-4-3 4 3-4 3' };
  return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function SourceFindBar({ query, replacement, matchCase, count, index, disabled, composing, autoFocusQuery = true, focusQueryRef, open = true, panelRef, decision, scopeLabel, onConfirmAll, onCancelAll, onQuery, onReplacement, onCase, onMove, onReplace, onReplaceAll, onClose }: {
  query: string; replacement: string; matchCase: boolean; count: number; index: number; disabled: boolean; composing: boolean;
  open?: boolean; panelRef?: MutableRefObject<HTMLDivElement | null>;
  autoFocusQuery?: boolean; focusQueryRef?: MutableRefObject<(() => void) | null>;
  decision: ReplaceAllDecision | null; scopeLabel: string; onConfirmAll: () => void; onCancelAll: () => void;
  onQuery: (value: string) => void; onReplacement: (value: string) => void; onCase: () => void; onMove: (direction: 1 | -1) => void; onReplace: () => void; onReplaceAll: () => void; onClose: () => void;
}) {
  const { t } = useUITranslation('editor');
  const [inputComposing, setInputComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const queryHistory = useTextInputHistory(input, query, onQuery);
  const replacementHistory = useTextInputHistory(replacementInput, replacement, onReplacement);
  const hadDecision = useRef(false);
  const focusReplacement = () => replacementInput.current?.focus({ preventScroll: true });
  useEffect(() => {
    const focus = () => { if (open) { input.current?.focus({ preventScroll: true }); input.current?.select(); } };
    if (focusQueryRef) focusQueryRef.current = focus;
    if (autoFocusQuery) focus();
    return () => { if (focusQueryRef?.current === focus) focusQueryRef.current = null; };
  }, [open, autoFocusQuery, focusQueryRef]);
  useEffect(() => { if (hadDecision.current && !decision) focusReplacement(); hadDecision.current = Boolean(decision); }, [decision]);
  const replaceCurrent = () => { if (!disabled && !composing && !inputComposing && count) { onReplace(); focusReplacement(); } };
  const replaceAll = () => { if (!disabled && !composing && !inputComposing && count) onReplaceAll(); };
  return <><div ref={panelRef} data-open={open} inert={!open} aria-hidden={!open} className="pointer-events-none absolute inset-x-2 top-2 z-30 grid max-h-full -translate-y-3 gap-2 overflow-x-clip overflow-y-auto rounded-xl border border-line-strong bg-panel px-3 py-2 opacity-0 shadow-lg transition-[opacity,translate] duration-200 ease-out data-[open=true]:pointer-events-auto data-[open=true]:translate-y-0 data-[open=true]:opacity-100 motion-reduce:transition-none" role="search" aria-label={t('editor:find.label')} onCompositionStart={() => setInputComposing(true)} onCompositionEnd={() => setInputComposing(false)} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || composing || inputComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter' && event.target === replacementInput.current) {
      if (event.altKey) return;
      event.preventDefault(); event.stopPropagation();
      if (event.metaKey || event.ctrlKey) replaceAll(); else replaceCurrent();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); event.stopPropagation();
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onMove(event.shiftKey ? -1 : 1); }
  }}>
    <div className="flex min-w-0 items-center gap-1">
      <input ref={input} {...queryHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="search" value={query} placeholder={t('editor:find.placeholder')} aria-label={t('editor:find.query')} />
      <span className="shrink-0 font-mono text-2xs text-muted" role="status">{count ? `${index + 1}/${count}` : '0/0'}</span>
      <IconButton tooltip={t('editor:find.case')} icon={<FindIcon name="case" />} aria-pressed={matchCase} onClick={onCase} />
      <IconButton tooltip={t('editor:find.previous')} icon={<FindIcon name="up" />} disabled={!count} onClick={() => onMove(-1)} />
      <IconButton tooltip={t('editor:find.next')} icon={<FindIcon name="down" />} disabled={!count} onClick={() => onMove(1)} />
      <IconButton tooltip={t('editor:find.close')} icon={<FindIcon name="close" />} onClick={onClose} />
    </div>
    <div className="flex min-w-0 items-center gap-1">
      <input ref={replacementInput} {...replacementHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="text" value={replacement} placeholder={t('editor:find.replacementPlaceholder')} aria-label={t('editor:find.replacement')} />
      <IconButton tooltip={disabled ? t('editor:find.readOnly') : t('editor:find.replace')} icon={<FindIcon name="replace" />} disabled={disabled || composing || inputComposing || !count} onClick={replaceCurrent} />
      <IconButton tooltip={disabled ? t('editor:find.readOnly') : t('editor:find.replaceAll')} icon={<FindIcon name="all" />} disabled={disabled || composing || inputComposing || !count} onClick={replaceAll} />
    </div>
  </div>{decision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="source-replace-all-title" descriptionId="source-replace-all-description" onClose={onCancelAll}>
    <DialogHeader titleId="source-replace-all-title" eyebrow={t('editor:find.eyebrow')} title={t('editor:find.allTitle')} onClose={onCancelAll} />
    <div className="dialog-content">
      <p id="source-replace-all-description" className="text-sm text-muted">{t('editor:find.scope', { scope: scopeLabel })}</p>
      <dl className="grid min-w-0 gap-2 text-sm text-primary">
        <dt className="text-muted">{t('editor:find.queryLabel')}</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.query}</dd>
        <dt className="text-muted">{t('editor:find.replacementPlaceholder')}</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.replacement || t('editor:find.deleteMatches')}</dd>
      </dl>
      <p className="text-sm text-primary">{t('editor:find.matchCount', { count: decision.count })}</p>
      {decision.changed ? <p className="text-xs text-warning-strong" role="status">{t('editor:find.changed')}</p> : null}
    </div>
    <DialogFooter><DialogActions><DialogButton autoFocus onClick={onCancelAll}>{t('common:actions.cancel')}</DialogButton><DialogButton variant="primary" disabled={disabled || composing || inputComposing || !decision.count} onClick={onConfirmAll}>{t('editor:find.replaceCount', { count: decision.count })}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>, document.body) : null}</>;
}
