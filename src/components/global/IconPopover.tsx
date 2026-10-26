'use client';

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEventHandler, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { TooltipButton } from './TooltipButton';

const PopoverOwner = createContext<string | null>(null);

export type PopoverSpace = { width: number; height: number };

/** Controlled by the toolbar so opening one control closes its sibling. */
export function IconPopover({ label, tooltip = label, icon, open, disabled = false, kind = 'menu', triggerVariant = 'surface', triggerChildren, triggerProps, onMeasure, onKeyDown, onToggle, onClose, children }: {
  label: string; tooltip?: ReactNode; icon: ReactNode; open: boolean; disabled?: boolean;
  kind?: 'menu' | 'dialog'; onToggle: () => void; onClose: () => void; children: ReactNode;
  triggerVariant?: 'surface' | 'inline' | 'preference' | 'field'; triggerChildren?: ReactNode;
  triggerProps?: ButtonHTMLAttributes<HTMLButtonElement>; onMeasure?: (space: PopoverSpace) => void; onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  const id = useId(), parentId = useContext(PopoverOwner);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const field = triggerVariant === 'field';
  const [target, setTarget] = useState<Element | null>(null);
  const [native, setNative] = useState(true);
  const topLayer = field || kind === 'dialog' && target !== null && target !== document.body;
  const measured = useRef(false);
  const measureRef = useRef(onMeasure); measureRef.current = onMeasure;
  const [position, setPosition] = useState<{ left: number; top: number; width?: number; maxHeight?: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) { measured.current = false; return; }
    setTarget(field || kind === 'dialog' ? triggerRef.current?.closest('[aria-modal="true"]') ?? document.body : document.body);
  }, [open, field, kind]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const element = panelRef.current;
    if (topLayer && native) {
      if (typeof element.showPopover === 'function') { if (!element.matches(':popover-open')) element.showPopover(); }
      else setNative(false);
    }
    const measure = () => {
      const trigger = (field ? triggerRef.current?.querySelector('button') : triggerRef.current)?.getBoundingClientRect();
      if (!trigger) return;
      const panel = element.getBoundingClientRect();
      const below = Math.max(0, window.innerHeight - trigger.bottom - 16), above = Math.max(0, trigger.top - 16);
      const width = Math.max(0, window.innerWidth - 16), height = Math.max(above, below);
      if (!measured.current) { measured.current = true; measureRef.current?.({ width, height }); }
      const panelWidth = field ? Math.min(width, Math.max(trigger.width, 320)) : panel.width;
      const panelHeight = field ? Math.min(element.scrollHeight || panel.height, height) : topLayer ? Math.min(panel.height, height, 320) : panel.height;
      const down = below >= panelHeight || below >= above;
      const anchorLeft = field && trigger.left + panelWidth + 8 > window.innerWidth ? trigger.right - panelWidth : trigger.left;
      const next = { left: Math.max(8, Math.min(anchorLeft, window.innerWidth - panelWidth - 8)), top: down ? trigger.bottom + 8 : Math.max(8, trigger.top - panelHeight - 8), ...(field ? { width: panelWidth, maxHeight: down ? below : above } : topLayer ? { maxHeight: Math.min(320, down ? below : above) } : {}) };
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = field && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => observer?.disconnect();
  }, [open, field, topLayer, native, target]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>('[aria-selected="true"]:not(:disabled):not([aria-disabled="true"]), [aria-checked="true"]') ?? panel?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? panel)?.focus();
    const contains = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return true;
      let owner = (target instanceof HTMLElement ? target : target.parentElement)?.closest<HTMLElement>('[data-popover-owner]');
      while (owner?.dataset.popoverOwner) {
        if (owner.dataset.popoverOwner === id) return true;
        owner = document.getElementById(owner.dataset.popoverOwner);
      }
      return false;
    };
    const outside = (event: PointerEvent) => {
      if (!contains(event.target)) closeRef.current();
    };
    const scroll = (event: Event) => { if (!contains(event.target)) closeRef.current(); };
    const resize = () => closeRef.current();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      queueMicrotask(() => { if (!panelRef.current?.isConnected && (document.activeElement === document.body || panel?.contains(document.activeElement))) triggerRef.current?.querySelector<HTMLElement>('button')?.focus(); });
    };
  }, [open, target]);

  return <>
    <span ref={triggerRef} className={field ? 'contents' : triggerVariant === 'preference' ? 'flex w-full shrink-0' : 'inline-flex shrink-0'}>{field
      ? <TooltipButton {...triggerProps} tooltip={tooltip} aria-label={label} role="combobox" aria-haspopup={kind} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={onToggle} className={`field flex min-w-0 items-center gap-2 text-left aria-disabled:cursor-not-allowed aria-disabled:opacity-55 ${triggerProps?.className ?? ''}`}>{triggerChildren}{icon}</TooltipButton>
      : <IconButton variant={triggerVariant} icon={icon} tooltip={tooltip} aria-label={label} aria-haspopup={kind} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={onToggle}>{triggerChildren}</IconButton>}</span>
    {open && typeof document !== 'undefined' ? createPortal(<div ref={panelRef} id={id} data-popover-owner={parentId ?? undefined} data-variant={triggerVariant} popover={topLayer && native ? 'manual' : undefined} role={kind} aria-label={label} tabIndex={-1} className={`fixed z-60 m-0 grid gap-0.5 overflow-x-clip overflow-y-auto rounded-lg border border-line-strong bg-popup-bg p-1.5 text-xs text-popup-text shadow-(--editor-popup-shadow) scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent ${field ? '' : 'max-h-80 w-56 data-[variant=preference]:w-max data-[variant=preference]:min-w-36 data-[variant=preference]:gap-1'}`} style={position} onKeyDown={event => {
      onKeyDown?.(event); if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (field && event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation();
        const trigger = triggerRef.current?.querySelector<HTMLElement>('button');
        const owner = trigger?.closest('[aria-modal="true"]') ?? document.body;
        const items = Array.from(owner.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(item => !panelRef.current?.contains(item) && !item.closest('[hidden], [aria-hidden="true"]') && item.getClientRects().length > 0);
        const index = trigger ? items.indexOf(trigger) : -1;
        const next = items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length];
        closeRef.current(); queueMicrotask(() => next?.focus()); return;
      }
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      if (event.key === 'Tab' && focusable.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
      }
      if (kind === 'menu' && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    }}><PopoverOwner.Provider value={id}>{children}</PopoverOwner.Provider></div>, target ?? document.body) : null}
  </>;
}
