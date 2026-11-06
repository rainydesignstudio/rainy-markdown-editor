'use client';

import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { BrandMark } from '../global/BrandMark';

const regions = [
  { selector: '.sidebar', name: 'navigation' },
  { selector: '.article-sidebar', name: 'articles' },
  { selector: '.workspace-toolbar', name: 'toolbar' },
  { selector: '.workspace-main', name: 'content' },
] as const;
type Region = { name: string; style: CSSProperties; text: CSSProperties[]; controls: CSSProperties[]; brand?: CSSProperties };

export function GuideArrival() {
  const [frames, setFrames] = useState<Region[]>([]);
  useLayoutEffect(() => {
    const measure = () => setFrames(regions.flatMap(({ selector, name }) => {
      const element = document.querySelector(selector), rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width <= 0 || rect.height <= 0) return [];
      const geometry = new Map<Element, { style: CSSStyleDeclaration; rect: DOMRect }>();
      const relative = (box: DOMRect, owner: Element): CSSProperties | null => {
        if (box.width <= 1 || box.height <= 1) return null;
        let left = Math.max(box.left, rect.left), top = Math.max(box.top, rect.top);
        let right = Math.min(box.right, rect.right), bottom = Math.min(box.bottom, rect.bottom);
        // Nested scroll viewports can hide controls that still lie inside the outer region.
        for (let parent: Element | null = owner; parent; parent = parent.parentElement) {
          let cached = geometry.get(parent);
          if (!cached) { cached = { style: getComputedStyle(parent), rect: parent.getBoundingClientRect() }; geometry.set(parent, cached); }
          const { style, rect: bounds } = cached;
          if (style.visibility === 'hidden' || style.opacity === '0' || parent.getAttribute('aria-hidden') === 'true') return null;
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
          if (parent === element) break;
        }
        const width = right - left, height = bottom - top;
        return width > 1 && height > 1 ? { left: left - rect.left, top: top - rect.top, width, height } : null;
      };
      const controls = [...element.querySelectorAll('button, input, textarea, [role=button], [role=combobox]')].slice(0, 24)
        .filter(node => !node.closest('.brand-mark')).flatMap(node => { const box = relative(node.getBoundingClientRect(), node); return box ? [box] : []; });
      const text: CSSProperties[] = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Node | null, visited = 0;
      // Bound layout reads even when the real library contains a long article list. No text is copied.
      while ((node = walker.nextNode()) && text.length < 40 && visited++ < 160) {
        if (!node.textContent?.trim() || node.parentElement?.closest('svg, [aria-hidden=true], script, style')) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          const visible = node.parentElement ? relative(box, node.parentElement) : null;
          if (!visible) continue;
          const height = Number(visible.height) * 0.55;
          text.push({ ...visible, top: Number(visible.top) + (Number(visible.height) - height) / 2, height });
          if (text.length === 40) break;
        }
      }
      const mark = element.querySelector('.brand-mark');
      return [{ name, style: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, text, controls, brand: mark ? relative(mark.getBoundingClientRect(), mark) ?? undefined : undefined }];
    }));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const { selector } of regions) { const element = document.querySelector(selector); if (element) observer?.observe(element); }
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <div aria-hidden="true" data-guide-arrival className="absolute inset-0 overflow-hidden bg-canvas">
    {frames.map(frame => <div key={frame.name} data-region={frame.name} style={frame.style} className="absolute min-h-0 overflow-hidden border-r border-line bg-panel data-[region=navigation]:animate-guide-arrive data-[region=navigation]:bg-rail data-[region=articles]:animate-guide-arrive-later data-[region=toolbar]:animate-guide-toolbar data-[region=content]:animate-guide-content data-[region=content]:border-0 data-[region=content]:bg-canvas motion-reduce:animate-none">
      {frame.controls.map((style, index) => <span key={index} data-skeleton-control style={style} className="absolute rounded-md border border-line/60 bg-panel/50" />)}
      {frame.text.map((style, index) => <span key={index} data-skeleton-text style={style} className="absolute overflow-hidden rounded-full bg-line/60 before:absolute before:inset-0 before:animate-guide-sheen before:bg-linear-to-r before:from-transparent before:via-panel before:to-transparent motion-reduce:before:animate-none" />)}
      {frame.brand ? <span style={frame.brand} className="absolute text-on-accent"><BrandMark /></span> : null}
    </div>)}
  </div>;
}
