'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { IconPopover, type PopoverSpace } from './IconPopover';
import { PanelHeading } from './CollapsiblePanel';
import { ContentIcon } from './ContentIcon';
import { useUITranslation } from './UILocaleProvider';

type ChoiceContent = { label: string; icon?: ReactNode; detail?: ReactNode; status?: ReactNode; disabled?: boolean };
export type SelectOption = ChoiceContent & { value: string | number; description?: string; tag?: ReactNode; children?: never };
type SelectSubdirectory = ChoiceContent & { id: string; children: readonly SelectOption[]; value?: never };
export type SelectDirectory = ChoiceContent & { id: string; children: readonly (SelectOption | SelectSubdirectory)[]; value?: never };
export type SelectItem = SelectOption | SelectDirectory;

function findOption(items: readonly SelectItem[], value: string, path: string[] = []): { option: SelectOption; path: string[] } | undefined {
  for (const item of items) {
    if (item.children) { const found = findOption(item.children, value, [...path, item.id]); if (found) return found; }
    else if (String(item.value) === value) return { option: item, path };
  }
}

/** One value model; the popup chooses its presentation once per opening. */
export function SelectField({ label, value, options, onChange, disabled = false, className = '', name, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'> & {
  label: string; value: string | number; options: readonly SelectItem[]; onChange: (value: string) => void;
}) {
  const { t } = useUITranslation('common');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'fold' | 'drill'>('fold');
  const [path, setPath] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const nodes = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const previousValue = useRef<string | null>(null);
  const selected = findOption(options, String(value));
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open || !nodes.current || nodes.current.contains(document.activeElement)) return;
    (nodes.current.querySelector<HTMLElement>('[aria-selected="true"]:not(:disabled)') ?? nodes.current.querySelector<HTMLElement>('[data-choice-row]:not(:disabled)'))?.focus();
  }, [open, mode, path, expanded]);
  const toggle = () => {
    if (!open) {
      if (previousValue.current !== String(value)) { const next = selected?.path ?? []; setPath(next); setExpanded(next); }
      previousValue.current = String(value); search.current = { text: '', time: 0 };
    }
    setOpen(current => !current);
  };
  const measure = ({ width, height }: PopoverSpace) => {
    const next = width >= 320 && height >= 320 ? 'fold' : 'drill';
    if (next === 'fold') setExpanded(previous => path.every(key => previous.includes(key)) ? previous : [...new Set([...previous, ...path])]);
    setMode(next);
  };
  const directories: SelectDirectory[] = [];
  let current = options;
  for (const key of path) { const directory = current.find(item => item.children && item.id === key) as SelectDirectory | undefined; if (!directory) break; directories.push(directory); current = directory.children; }
  const focus = (key?: string) => queueMicrotask(() => {
    const rows = Array.from(nodes.current?.querySelectorAll<HTMLElement>('[data-choice-row]') ?? []);
    (rows.find(row => row.dataset.choiceKey === key) ?? rows.find(row => row.getAttribute('aria-selected') === 'true') ?? rows.find(row => !row.hasAttribute('disabled')))?.focus();
  });
  const enter = (directory: SelectDirectory, ancestors: string[]) => {
    if (mode === 'drill') { setPath(previous => [...previous.slice(0, directories.length), directory.id]); focus(); }
    else { setPath(expanded.includes(directory.id) ? ancestors : [...ancestors, directory.id]); setExpanded(previous => previous.includes(directory.id) ? previous.filter(key => key !== directory.id) : [...previous, directory.id]); focus(directory.id); }
  };
  const back = () => { const key = directories.at(-1)?.id; setPath(previous => previous.slice(0, -1)); focus(key); };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const rows = Array.from(nodes.current?.querySelectorAll<HTMLButtonElement>('[data-choice-row]:not(:disabled)') ?? []);
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (['Enter', ' '].includes(event.key) && index >= 0) { event.preventDefault(); rows[index].click(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && rows.length) {
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next].focus(); return;
    }
    if (event.key === 'ArrowRight' && index >= 0 && rows[index].hasAttribute('aria-expanded')) {
      event.preventDefault(); if (rows[index].getAttribute('aria-expanded') === 'false' || mode === 'drill') rows[index].click(); else rows[index + 1]?.focus(); return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (mode === 'drill' && directories.length) back();
      else if (index >= 0 && rows[index].getAttribute('aria-expanded') === 'true') rows[index].click();
      else if (index >= 0) focus(rows[index].dataset.choiceParent);
      return;
    }
    if (event.key.length === 1 && event.key !== ' ') {
      const now = Date.now(); const text = now - search.current.time < 700 ? search.current.text + event.key : event.key;
      search.current = { text, time: now };
      const start = Math.max(index + 1, 0); const ordered = [...rows.slice(start), ...rows.slice(0, start)];
      const match = ordered.find(row => row.dataset.choiceLabel?.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()));
      if (match) { event.preventDefault(); match.focus(); }
    }
  };
  const renderItems = (items: readonly SelectItem[], depth = 1, parent?: string, parentDisabled = false, ancestors: string[] = []): ReactNode => items.map(item => item.children
    ? <div key={item.id} role="none"><PanelHeading variant="choice" title={item.label} icon={item.icon} role="treeitem" aria-level={depth} expanded={mode === 'fold' && expanded.includes(item.id)} aria-controls={`${id}-${item.id}`} disabled={parentDisabled || item.disabled} tabIndex={-1} data-choice-row data-choice-key={item.id} data-choice-parent={parent} data-choice-label={item.label} className="aria-[level=2]:pl-8 aria-[level=3]:pl-14 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => enter(item, ancestors)}><span className="shrink-0 text-faint">{item.detail}</span>{item.status}</PanelHeading>{mode === 'fold' && expanded.includes(item.id) && depth < 3 ? <div role="group" id={`${id}-${item.id}`}>{renderItems(item.children, depth + 1, item.id, parentDisabled || item.disabled, [...ancestors, item.id])}</div> : null}</div>
    : <button key={String(item.value)} type="button" role="treeitem" aria-level={depth} aria-selected={String(value) === String(item.value)} disabled={parentDisabled || item.disabled} tabIndex={-1} data-choice-row data-choice-key={String(item.value)} data-choice-parent={parent} data-choice-label={item.label} className="flex min-h-9 w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent aria-selected:bg-accent-soft aria-selected:text-accent-text aria-[level=2]:pl-8 aria-[level=3]:pl-14 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { if (String(item.value) !== String(value)) onChange(String(item.value)); setOpen(false); }}>{item.icon}<span className="min-w-0 flex-1"><span className="block wrap-anywhere">{item.label}</span>{item.description ? <span className="mt-1 block wrap-anywhere text-faint">{item.description}</span> : null}</span>{item.detail ? <span className="shrink-0 text-faint">{item.detail}</span> : null}{item.tag}{item.status}<span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">{String(value) === String(item.value) ? <ContentIcon name="check" /> : null}</span></button>);
  return <>
    {name ? <input type="hidden" name={name} value={String(value)} disabled={disabled} /> : null}
    <IconPopover label={disabled && selected ? `${label}: ${selected.option.label}` : label} tooltip={props.title ?? label} kind="dialog" triggerVariant="field" open={open} disabled={disabled} onToggle={toggle} onClose={() => setOpen(false)} onMeasure={measure} onKeyDown={keyDown}
      triggerProps={{ ...props, className, onKeyDown: event => { props.onKeyDown?.(event); if (!event.defaultPrevented && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); if (!open) toggle(); } } }}
      icon={<svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
      triggerChildren={<>{selected?.option.icon}<span className="min-w-0 flex-1 truncate">{selected?.option.label ?? label}</span></>}>
      <div ref={nodes} data-select-mode={mode}>
        {mode === 'drill' && directories.length ? <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent" onClick={back}><span aria-hidden="true">←</span>{t('selection.back')}<span className="min-w-0 truncate">{directories.at(-1)?.label}</span></button> : null}
        <div role="tree" aria-label={label}>{renderItems(mode === 'drill' ? current : options, 1, undefined, mode === 'drill' && directories.some(directory => directory.disabled))}</div>
        {!(mode === 'drill' ? current : options).length ? <p className="p-2 text-xs text-faint">{t('selection.empty')}</p> : null}
      </div>
    </IconPopover>
  </>;
}
