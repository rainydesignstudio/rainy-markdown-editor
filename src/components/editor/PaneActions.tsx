'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActionMenuAnchorContext, ActionMenuContext } from '../global/IconButton';
import { IconPopover } from '../global/IconPopover';
import { ButtonBar } from '../global/ButtonBar';

/** Keep action components mounted as the same toolbar becomes a compact menu. */
export function PaneActions({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false), [open, setOpen] = useState(false);
  const restoreFocus = useRef(false), compactRef = useRef(false);
  useLayoutEffect(() => {
    const pane = root.current?.closest<HTMLElement>('.panel');
    if (!pane) return;
    const measure = () => {
      const next = pane.getBoundingClientRect().width <= 480;
      if (compactRef.current !== next) {
        restoreFocus.current = Boolean(root.current?.contains(document.activeElement));
        setOpen(false); compactRef.current = next; setCompact(next);
      }
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(pane);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),summary') ?? []).find(element => element.getClientRects().length)?.focus({ preventScroll: true });
  }, [compact]);
  return <ButtonBar ref={root} label={label} className="flex-nowrap" data-pane-actions data-compact={compact}>
    <IconPopover label={label} inline={!compact} open={open} onToggle={() => setOpen(value => !value)} onClose={() => setOpen(false)}
      icon="more">
      <ActionMenuAnchorContext.Provider value={compact ? { anchor: () => root.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? null, close: () => setOpen(false) } : null}><ActionMenuContext.Provider value={compact}><ButtonBar label={label} className={compact ? 'grid gap-0.5' : 'flex-nowrap'} onClick={event => {
        if (compact && event.target instanceof Element && event.currentTarget.contains(event.target) && event.target.closest('button')) setOpen(false);
      }}>{children}</ButtonBar></ActionMenuContext.Provider></ActionMenuAnchorContext.Provider>
    </IconPopover>
  </ButtonBar>;
}
