'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function imageFitScale(width: number, height: number, viewport: { width: number; height: number }, mode: 'width' | 'contain') {
  if (!width || !height || !viewport.width) return 1;
  return Math.max(0.01, Math.min(1, viewport.width / width, mode === 'contain' && viewport.height ? viewport.height / height : 1));
}

export function imageWheelScale(scale: number, delta: number, mode: number, height: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return Math.max(0.01, Math.min(8, scale * Math.exp(-Math.max(-100, Math.min(100, pixels)) / 400)));
}

/** Shared geometry for image viewers; ordinary wheel events remain native scrolling. */
export function useImageZoom(mode: 'width' | 'contain', identity: string) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const fit = imageFitScale(dimensions.width, dimensions.height, viewport, mode);
  const scale = zoom ?? fit;
  const scaleRef = useRef(scale); scaleRef.current = scale;

  useLayoutEffect(() => {
    setDimensions({ width: 0, height: 0 }); setZoom(null); anchor.current = null;
    viewportRef.current?.scrollTo(0, 0);
  }, [identity]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomTo = useCallback((next: number | null, point?: { clientX: number; clientY: number }) => {
    const element = viewportRef.current, image = element?.querySelector('img');
    if (!dimensions.width) return;
    if (element && image && next !== null) {
      const rect = image.getBoundingClientRect(), box = element.getBoundingClientRect();
      const clientX = point?.clientX ?? box.left + element.clientWidth / 2;
      const clientY = point?.clientY ?? box.top + element.clientHeight / 2;
      if (rect.width && rect.height) anchor.current = { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)), clientX, clientY };
    } else { anchor.current = null; if (next === null) element?.scrollTo(0, 0); }
    const bounded = next === null ? null : Math.max(0.01, Math.min(8, next));
    if (bounded !== null) scaleRef.current = bounded;
    setZoom(bounded);
  }, [dimensions.width]);
  useLayoutEffect(() => {
    const point = anchor.current, element = viewportRef.current, image = element?.querySelector('img');
    anchor.current = null;
    if (!point || !element || !image) return;
    const rect = image.getBoundingClientRect();
    element.scrollLeft += rect.left + point.x * rect.width - point.clientX;
    element.scrollTop += rect.top + point.y * rect.height - point.clientY;
  }, [scale]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !dimensions.width || !event.deltaY) return;
      event.preventDefault();
      zoomTo(imageWheelScale(scaleRef.current, event.deltaY, event.deltaMode, element.clientHeight), event);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [dimensions.width, zoomTo]);

  const onDimensions = useCallback((width: number, height: number) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height }), []);
  return { viewportRef, dimensions, fit, scale, zoomTo, onDimensions, imageStyle: dimensions.width ? { width: dimensions.width * scale, height: dimensions.height * scale } : undefined };
}
