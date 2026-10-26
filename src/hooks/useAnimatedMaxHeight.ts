import { useLayoutEffect, useRef, useState } from 'react';

// Shared by the release notes and format check disclosures. Pixel endpoints animate while
// the expanded state settles at `none`, so later content changes cannot be clipped.
export function useAnimatedMaxHeight(open: boolean) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (!initialized.current) { initialized.current = true; node.dataset.disclosure = open ? 'open' : 'closed'; return; }
    node.style.setProperty('--disclosure-height', `${node.getBoundingClientRect().height}px`);
    node.dataset.disclosure = 'moving';
    node.getBoundingClientRect();
    if (open) node.style.setProperty('--disclosure-height', `${node.scrollHeight}px`);
    else node.dataset.disclosure = 'closed';
    const settle = (event?: TransitionEvent) => {
      if (event && (event.target !== node || event.propertyName !== 'max-height')) return;
      node.dataset.disclosure = open ? 'open' : 'closed';
      node.style.removeProperty('--disclosure-height');
    };
    node.addEventListener('transitionend', settle);
    const timer = window.setTimeout(settle, 220);
    return () => { node.removeEventListener('transitionend', settle); window.clearTimeout(timer); };
  }, [open]);
  return bodyRef;
}


/** Two-axis disclosure variant: measure the natural inner box independently of the animated surface. */
export function useAnimatedSize(revision: string) {
  const surfaceRef = useRef<HTMLElement>(null), bodyRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  useLayoutEffect(() => {
    const surface = surfaceRef.current, body = bodyRef.current, parent = surface?.parentElement;
    if (!surface || !body || !parent) return;
    const measure = () => {
      const style = window.getComputedStyle(surface), horizontal = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0), vertical = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      body.style.maxWidth = `${Math.max(0, (parent.clientWidth || window.innerWidth - 32) - horizontal)}px`;
      const bounds = body.getBoundingClientRect(), width = bounds.width + horizontal, height = bounds.height + vertical;
      setSize(previous => previous?.width === width && previous?.height === height ? previous : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(body); observer?.observe(parent);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [revision]);
  return { surfaceRef, bodyRef, size };
}
