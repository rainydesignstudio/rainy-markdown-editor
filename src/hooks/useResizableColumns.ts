'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { clampEditorSourceRatio, editorSourceRatioFromPointer, getEditorSourceWidth, getEditorSplitLimits, resizeEditorSourceRatio } from '../lib/editorLayout';

export function useResizableColumns(initialRatio = 50, breakpoint = '(width >= 64rem)', identity?: unknown, axis: 'x' | 'y' = 'x') {
  const minimumPanel = axis === 'y' ? 160 : 360;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const captureRef = useRef<{ target: HTMLButtonElement; pointerId: number } | null>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const [width, setWidth] = useState(0);
  const [wideEnough, setWideEnough] = useState(false);
  const [dragging, setDragging] = useState(false);
  const releaseCapture = () => {
    const captured = captureRef.current;
    captureRef.current = null;
    if (!captured) return;
    try {
      if (captured.target.hasPointerCapture(captured.pointerId)) captured.target.releasePointerCapture(captured.pointerId);
    } catch { /* The browser may have already released a removed splitter. */ }
  };
  const stopDrag = () => { draggingRef.current = false; releaseCapture(); setDragging(false); };
  useEffect(() => {
    const finish = () => { if (draggingRef.current) stopDrag(); };
    const onVisibilityChange = () => { if (document.visibilityState !== 'visible') finish(); };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('blur', finish);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      draggingRef.current = false; releaseCapture();
    };
  }, []);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    stopDrag();
    const update = () => {
      const measured = element.getBoundingClientRect()[axis === 'y' ? 'height' : 'width'];
      const enough = (axis === 'y' || window.matchMedia(breakpoint).matches) && getEditorSplitLimits(measured, minimumPanel) !== null;
      setWidth(measured); setWideEnough(enough);
      if (enough) setRatio(current => clampEditorSourceRatio(measured, current, minimumPanel));
      else stopDrag();
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => { draggingRef.current = false; releaseCapture(); observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [breakpoint, identity, axis, minimumPanel]);
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false || !wideEnough) return;
    releaseCapture();
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { return; }
    captureRef.current = { target: event.currentTarget, pointerId: event.pointerId };
    draggingRef.current = true; setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setRatio(editorSourceRatioFromPointer(axis === 'y' ? event.clientY : event.clientX, axis === 'y' ? rect.top : rect.left, axis === 'y' ? rect.height : rect.width, minimumPanel));
  };
  const keyResize = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;
    if (!(axis === 'y' ? ['ArrowUp', 'ArrowDown', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'Home', 'End']).includes(event.key)) return;
    const next = resizeEditorSourceRatio(containerRef.current.getBoundingClientRect()[axis === 'y' ? 'height' : 'width'], ratio, event.key, minimumPanel);
    if (next === null) return;
    event.preventDefault(); setRatio(next);
  };
  const limits = getEditorSplitLimits(width, minimumPanel);
  const style = { [axis === 'y' ? '--editor-reference-height' : '--editor-source-width']: `${getEditorSourceWidth(width, ratio, minimumPanel)}px` } as CSSProperties;
  return { axis, containerRef, wideEnough, dragging, ratio, style, minRatio: limits?.minimumRatio ?? 50, maxRatio: limits?.maximumRatio ?? 50, startDrag, moveDrag, stopDrag, keyResize };
}
