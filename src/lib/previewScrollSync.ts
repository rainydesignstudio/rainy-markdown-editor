import { createSourceRectReader } from './sourceViewport';

type ScrollSurface = { root: Element; viewport: HTMLElement; ready?: boolean };
export type ScrollAnchor = { sourceTop: number; previewTop: number; line: number };
export function findScrollAnchor(anchors: readonly ScrollAnchor[], top: number): ScrollAnchor | null {
  let low = 0, high = anchors.length;
  while (low < high) { const middle = (low + high) >>> 1; if (anchors[middle].sourceTop <= top + 1) low = middle + 1; else high = middle; }
  return anchors[Math.max(0, low - 1)] ?? null;
}
export function sourceLineOffsets(source: string): number[] {
  return [0, ...[...source.matchAll(/\r\n|\r|\n/g)].map(match => match.index! + match[0].length)];
}
function surface(container: HTMLElement, canonical: HTMLElement): ScrollSurface | null {
  const dark = container.dataset.previewMode === 'dark';
  const frame = dark
    ? container.querySelector<HTMLIFrameElement>('iframe[data-article-frame="dark"],iframe[data-article-standalone-dark]') ?? container.querySelector<HTMLIFrameElement>('iframe[data-article-frame="light"]')
    : container.querySelector<HTMLIFrameElement>('iframe[data-article-frame="light"]');
  if (!frame) return dark ? null : { root: canonical, viewport: container };
  const doc = frame.contentDocument;
  if (!doc?.body || !doc.scrollingElement) return null;
  const root = doc.querySelector('[data-article-content-root]') ?? (canonical.id ? doc.getElementById(canonical.id) : doc.body.querySelector(canonical.tagName.toLowerCase()));
  return root ? { root, viewport: doc.scrollingElement as HTMLElement, ready: !frame.hasAttribute('data-article-standalone-dark') || doc.body.dataset.previewReady === 'true' } : null;
}

/** The source viewport is the sole driver. Scroll jobs read cached numbers only. */
export function connectPreviewScrollSync(options: {
  textarea: HTMLTextAreaElement;
  container: HTMLElement;
  getRoot: () => HTMLElement | null;
  getSource: () => string;
  onSample?: (sample: { durationMs: number; rebuilt: boolean; pending?: boolean; anchors: number; measuredSource: number; measuredPreview: number; wrote: boolean }) => void;
}): () => void {
  const viewport = options.textarea.closest<HTMLElement>('[data-source-viewport]');
  const layer = viewport?.querySelector<HTMLElement>('pre.editor-inner');
  if (!viewport || !layer) return () => {};
  const view = viewport.ownerDocument.defaultView!;
  let active = true, dirty = true, frameId = 0, timer = 0, lastEdit = -Infinity;
  let anchors: ScrollAnchor[] = [], lastSurface: ScrollSurface | null = null, maxScroll = 0;
  let building: {
    sourceNodes: Element[]; shownNodes: Element[]; offsets: number[];
    readRect: ReturnType<typeof createSourceRectReader>; sourceOrigin: number; previewOrigin: number;
    unique: Map<number, ScrollAnchor>; cursor: number;
  } | null = null;
  let observedRoot: HTMLElement | null = null, observedDocument: Document | null = null;
  const sourceObserver = new MutationObserver(() => { lastEdit = view.performance.now(); invalidate(); });
  const previewObserver = new MutationObserver(() => invalidate());
  const containerObserver = new MutationObserver(() => invalidate());
  const documentObserver = new MutationObserver(() => invalidate());
  const resize = new ResizeObserver(() => invalidate());
  const headObserver = new MutationObserver(() => invalidate());
  const schedule = (immediate = false) => {
    if (!active) return;
    if (timer) { view.clearTimeout(timer); timer = 0; }
    if (!immediate && view.performance.now() - lastEdit < 120) { timer = view.setTimeout(() => { timer = 0; schedule(true); }, 120); return; }
    if (!frameId) frameId = view.requestAnimationFrame(sync);
  };
  function invalidate() { dirty = true; building = null; schedule(); }
  function bind(root: HTMLElement, displayed: ScrollSurface | null) {
    if (observedRoot !== root) {
      previewObserver.disconnect(); if (observedRoot) resize.unobserve(observedRoot);
      observedRoot = root; previewObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true }); resize.observe(root); dirty = true; building = null;
    }
    const doc = displayed?.root.ownerDocument ?? null;
    if (doc !== observedDocument) {
      documentObserver.disconnect();
      if (observedDocument && observedDocument !== viewport!.ownerDocument) { observedDocument.removeEventListener('load', resourceReady, true); observedDocument.fonts?.removeEventListener('loadingdone', resourceReady); }
      observedDocument = doc;
      if (doc && doc !== viewport!.ownerDocument) {
        documentObserver.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
        doc.addEventListener('load', resourceReady, true); doc.fonts?.addEventListener('loadingdone', resourceReady);
      }
      dirty = true; building = null;
    }
  }
  function sync() {
    frameId = 0; if (!active) return;
    const started = options.onSample ? view.performance.now() : 0;
    const root = options.getRoot(); if (!root?.isConnected) return;
    const displayed = surface(options.container, root);
    bind(root, displayed);
    if (!displayed || displayed.ready === false) return;
    if (displayed.root !== lastSurface?.root || displayed.viewport !== lastSurface?.viewport) {
      dirty = true; building = null; lastSurface = displayed;
    }
    const rebuilt = dirty;
    let measuredSource = 0, measuredPreview = 0;
    if (dirty) {
      if (!building) {
        const sourceNodes = [root, ...root.querySelectorAll('*')], shownNodes = [displayed.root, ...displayed.root.querySelectorAll('*')];
        if (sourceNodes.length !== shownNodes.length || sourceNodes.some((node, index) => node.tagName !== shownNodes[index].tagName)) { anchors = []; return; }
        building = {
          sourceNodes, shownNodes, offsets: sourceLineOffsets(options.getSource()), readRect: createSourceRectReader(layer!),
          sourceOrigin: viewport!.getBoundingClientRect().top + viewport!.clientTop,
          previewOrigin: displayed.root.ownerDocument === viewport!.ownerDocument ? displayed.viewport.getBoundingClientRect().top + displayed.viewport.clientTop : 0,
          unique: new Map(), cursor: 0,
        };
      }
      const { sourceNodes, shownNodes, offsets, readRect, sourceOrigin, previewOrigin, unique } = building;
      const sliceStart = view.performance.now();
      while (building.cursor < sourceNodes.length) {
        // Initial/invalidated indexes are built in bounded slices, never a full long-document scroll job.
        if (view.performance.now() - sliceStart >= 4) break;
        const index = building.cursor++, node = sourceNodes[index];
        const line = Number(node.getAttribute('data-source-line'));
        if (!Number.isInteger(line) || line < 1 || line > offsets.length || unique.has(line) || node.closest('[data-preview-only]')) continue;
        const style = node.ownerDocument.defaultView!.getComputedStyle(node);
        if (style.display === 'none' || style.display === 'contents' || style.display.startsWith('inline') && !['IMG', 'svg', 'SVG', 'VIDEO', 'CANVAS', 'HR'].includes(node.tagName)) continue;
        const sourceRect = readRect(offsets[line - 1]), targetRect = shownNodes[index].getBoundingClientRect();
        measuredSource++; measuredPreview++;
        if (!sourceRect?.height || !targetRect.height) continue;
        unique.set(line, { line, sourceTop: sourceRect.top - sourceOrigin + viewport!.scrollTop, previewTop: targetRect.top - previewOrigin + displayed.viewport.scrollTop });
      }
      if (building.cursor < sourceNodes.length) {
        schedule(true);
        options.onSample?.({ durationMs: view.performance.now() - started, rebuilt: true, pending: true, anchors: unique.size, measuredSource, measuredPreview, wrote: false });
        return;
      }
      anchors = [...unique.values()].sort((a, b) => a.sourceTop - b.sourceTop || a.line - b.line);
      maxScroll = Math.max(0, displayed.viewport.scrollHeight - displayed.viewport.clientHeight);
      building = null; dirty = false;
    }
    const anchor = findScrollAnchor(anchors, viewport!.scrollTop);
    const target = anchor ? viewport!.scrollTop < anchors[0].sourceTop ? 0 : Math.max(0, Math.min(maxScroll, anchor.previewTop)) : null;
    const wrote = target !== null && Math.abs(displayed.viewport.scrollTop - target) > 1;
    if (wrote) displayed.viewport.scrollTop = target!;
    options.onSample?.({ durationMs: view.performance.now() - started, rebuilt, anchors: anchors.length, measuredSource, measuredPreview, wrote });
  }
  const scroll = () => schedule(true);
  const resourceReady = () => invalidate();
  viewport.addEventListener('scroll', scroll, { passive: true });
  options.container.addEventListener('load', resourceReady, true);
  options.container.addEventListener('error', resourceReady, true);
  sourceObserver.observe(layer, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
  containerObserver.observe(options.container, { childList: true, subtree: true, attributes: true });
  headObserver.observe(viewport.ownerDocument.head, { childList: true, subtree: true, characterData: true });
  resize.observe(viewport); resize.observe(layer); resize.observe(options.container);
  viewport.ownerDocument.fonts?.addEventListener('loadingdone', resourceReady);
  schedule(true);
  return () => {
    active = false; if (frameId) view.cancelAnimationFrame(frameId); if (timer) view.clearTimeout(timer);
    viewport.removeEventListener('scroll', scroll); options.container.removeEventListener('load', resourceReady, true); options.container.removeEventListener('error', resourceReady, true);
    sourceObserver.disconnect(); previewObserver.disconnect(); containerObserver.disconnect(); documentObserver.disconnect(); headObserver.disconnect(); resize.disconnect();
    if (observedDocument && observedDocument !== viewport.ownerDocument) { observedDocument.removeEventListener('load', resourceReady, true); observedDocument.fonts?.removeEventListener('loadingdone', resourceReady); }
    viewport.ownerDocument.fonts?.removeEventListener('loadingdone', resourceReady);
  };
}
