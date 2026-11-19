'use client';

import { useUITranslation } from '../global/UILocaleProvider';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTextInputHistory } from '../../hooks/useTextInputHistory';
import { IconButton } from '../global/IconButton';

import { ConfirmDialog } from '../global/ConfirmDialog';
import { ButtonBar } from '../global/ButtonBar';

export type ReplaceAllDecision = { source: string; query: string; replacement: string; matchCase: boolean; count: number; changed?: boolean };

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
    <ButtonBar label={t('common:actions.group')} className="min-w-0 flex-nowrap">
      <input ref={input} {...queryHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="search" value={query} placeholder={t('editor:find.placeholder')} aria-label={t('editor:find.query')} />
      <span className="shrink-0 font-mono text-2xs text-muted" role="status">{count ? `${index + 1}/${count}` : '0/0'}</span>
      <IconButton tooltip={t('editor:find.case')} icon="matchCase" aria-pressed={matchCase} onClick={onCase} />
      <IconButton tooltip={t('editor:find.previous')} icon="chevronUp" disabled={!count} onClick={() => onMove(-1)} />
      <IconButton tooltip={t('editor:find.next')} icon="chevronDown" disabled={!count} onClick={() => onMove(1)} />
      <IconButton tooltip={t('editor:find.close')} icon="close" onClick={onClose} />
    </ButtonBar>
    <ButtonBar label={t('common:actions.group')} className="min-w-0 flex-nowrap">
      <input ref={replacementInput} {...replacementHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="text" value={replacement} placeholder={t('editor:find.replacementPlaceholder')} aria-label={t('editor:find.replacement')} />
      <IconButton tooltip={disabled ? t('editor:find.readOnly') : t('editor:find.replace')} icon="replace" disabled={disabled || composing || inputComposing || !count} onClick={replaceCurrent} />
      <IconButton tooltip={disabled ? t('editor:find.readOnly') : t('editor:find.replaceAll')} icon="replaceAll" disabled={disabled || composing || inputComposing || !count} onClick={replaceAll} />
    </ButtonBar>
  </div>{decision && typeof document !== 'undefined' ? createPortal(<ConfirmDialog titleId="source-replace-all-title" descriptionId="source-replace-all-description" onClose={onCancelAll} title={t('editor:find.allTitle')} eyebrow={t('editor:find.eyebrow')}
        cancel={{ label: t('common:actions.cancel'), autoFocus: true, onClick: onCancelAll }} confirm={{ label: t('editor:find.replaceCount', { count: decision.count }), icon: "reset", onClick: onConfirmAll, disabled: disabled || composing || inputComposing || !decision.count, variant: "primary" }}>
        <div className="dialog-content">
      <p id="source-replace-all-description" className="text-sm text-muted">{t('editor:find.scope', { scope: scopeLabel })}</p>
      <dl className="grid min-w-0 gap-2 text-sm text-primary">
        <dt className="text-muted">{t('editor:find.queryLabel')}</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.query}</dd>
        <dt className="text-muted">{t('editor:find.replacementPlaceholder')}</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.replacement || t('editor:find.deleteMatches')}</dd>
      </dl>
      <p className="text-sm text-primary">{t('editor:find.matchCount', { count: decision.count })}</p>
      {decision.changed ? <p className="text-xs text-warning-strong" role="status">{t('editor:find.changed')}</p> : null}
    </div>
      </ConfirmDialog>, document.body) : null}</>;
}
