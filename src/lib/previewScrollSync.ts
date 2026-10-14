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

/** Exact unchanged lines only. Ambiguous middle lines remain unmapped. */
export function matchPreviewSourceLines(rendered: string, current: string): {
  toCurrent: Int32Array | null; prefix: number; changed: [number, number][];
} {
  if (rendered === current) return { toCurrent: null, prefix: Infinity, changed: [] };
  const before = rendered.split(/\r\n|\r|\n/), after = current.split(/\r\n|\r|\n/);
  const toCurrent = new Int32Array(before.length).fill(-1), matched = new Uint8Array(after.length);
  const pair = (oldLine: number, newLine: number) => { toCurrent[oldLine] = newLine; matched[newLine] = 1; };
  let prefix = 0, oldEnd = before.length, newEnd = after.length;
  while (prefix < oldEnd && prefix < newEnd && before[prefix] === after[prefix]) { pair(prefix, prefix); prefix++; }
  while (oldEnd > prefix && newEnd > prefix && before[oldEnd - 1] === after[newEnd - 1]) pair(--oldEnd, --newEnd);
  const unique = (lines: string[], end: number) => {
    const result = new Map<string, number>();
    for (let index = prefix; index < end; index++) if (lines[index].trim()) result.set(lines[index], result.has(lines[index]) ? -1 : index);
    return result;
  };
  const oldLines = unique(before, oldEnd), newLines = unique(after, newEnd);
  oldLines.forEach((oldLine, text) => { const newLine = newLines.get(text); if (oldLine >= 0 && newLine !== undefined && newLine >= 0) pair(oldLine, newLine); });
  const changed: [number, number][] = [];
  for (let index = 0; index < matched.length;) {
    if (matched[index]) { index++; continue; }
    const start = index;
    while (index < matched.length && !matched[index]) index++;
    changed.push([start, index]);
  }
  return { toCurrent, prefix, changed };
}

export function findNearestScrollAnchor(anchors: readonly ScrollAnchor[], top: number): ScrollAnchor | null {
  const previous = findScrollAnchor(anchors, top);
  if (!previous) return null;
  let low = 0, high = anchors.length;
  while (low < high) { const middle = (low + high) >>> 1; if (anchors[middle].sourceTop <= top) low = middle + 1; else high = middle; }
  const next = anchors[low];
  return next && Math.abs(next.sourceTop - top) < Math.abs(previous.sourceTop - top) ? next : previous;
}

function previewTree(root: HTMLElement): Node {
  const tree = root.getRootNode?.();
  return tree?.nodeType === 11 && 'host' in tree ? tree : root;
}
function surface(container: HTMLElement, canonical: HTMLElement): ScrollSurface | null {
  const dark = container.dataset.previewMode === 'dark';
  const tree = previewTree(canonical);
  const frameFor = (selector: string) => container.querySelector<HTMLIFrameElement>(selector)
    ?? (tree !== canonical ? (tree as ShadowRoot).querySelector<HTMLIFrameElement>(selector) : null);
  const frame = dark
    ? frameFor('iframe[data-article-frame="dark"],iframe[data-article-standalone-dark]') ?? frameFor('iframe[data-article-frame="light"]')
    : frameFor('iframe[data-article-frame="light"]');
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
  getRenderedSource?: () => string;
  onSample?: (sample: { durationMs: number; rebuilt: boolean; pending?: boolean; anchors: number; measuredSource: number; measuredPreview: number; wrote: boolean }) => void;
}): () => void {
  const viewport = options.textarea.closest<HTMLElement>('[data-source-viewport]');
  const layer = viewport?.querySelector<HTMLElement>('pre.editor-inner');
  if (!viewport || !layer) return () => {};
  const view = viewport.ownerDocument.defaultView!;
  let active = true, dirty = true, frameId = 0, timer = 0, lastEdit = -Infinity;
  let anchors: ScrollAnchor[] = [], lastSurface: ScrollSurface | null = null, maxScroll = 0, startsAtZero = true;
  let changedBounds: { start: number; end: number }[] = [];
  let building: {
    sourceNodes: Element[]; shownNodes: Element[]; offsets: number[];
    readRect: ReturnType<typeof createSourceRectReader>; sourceOrigin: number; previewOrigin: number;
    unique: Map<number, ScrollAnchor>; cursor: number;
    matching: ReturnType<typeof matchPreviewSourceLines>; bounds: { start: number; end: number }[]; gapCursor: number;
  } | null = null;
  let observedRoot: HTMLElement | null = null, observedTree: Node | null = null, observedDocument: Document | null = null;
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
    const tree = previewTree(root);
    if (observedRoot !== root || observedTree !== tree) {
      previewObserver.disconnect(); if (observedRoot) resize.unobserve(observedRoot);
      observedRoot = root; observedTree = tree;
      previewObserver.observe(tree, { childList: true, subtree: true, characterData: true, attributes: true }); resize.observe(root); dirty = true; building = null;
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
    const displayed = dirty || root !== observedRoot || !lastSurface || lastSurface.root.isConnected === false
      ? surface(options.container, root) : lastSurface;
    if (dirty || root !== observedRoot) bind(root, displayed);
    if (!displayed || displayed.ready === false) return;
    if (displayed.root !== lastSurface?.root || displayed.viewport !== lastSurface?.viewport) {
      dirty = true; building = null; lastSurface = displayed;
    }
    const rebuilt = dirty;
    let measuredSource = 0, measuredPreview = 0;
    if (dirty) {
      const sliceStart = options.onSample ? started : view.performance.now();
      if (!building) {
        const nodes = (element: Element) => [element, ...element.querySelectorAll('*')].filter(node => !node.closest?.('[data-preview-only]'));
        const sourceNodes = nodes(root), shownNodes = nodes(displayed.root);
        if (sourceNodes.length !== shownNodes.length || sourceNodes.some((node, index) => node.tagName !== shownNodes[index].tagName)) {
          anchors = []; changedBounds = []; building = null; dirty = false;
          options.onSample?.({ durationMs: view.performance.now() - started, rebuilt: true, anchors: 0, measuredSource: 0, measuredPreview: 0, wrote: false });
          return;
        }
        const source = options.getSource(), matching = matchPreviewSourceLines(options.getRenderedSource?.() ?? source, source);
        building = {
          sourceNodes, shownNodes, offsets: sourceLineOffsets(source), readRect: createSourceRectReader(layer!),
          sourceOrigin: viewport!.getBoundingClientRect().top + viewport!.clientTop,
          previewOrigin: displayed.root.ownerDocument === viewport!.ownerDocument ? displayed.viewport.getBoundingClientRect().top + displayed.viewport.clientTop : 0,
          unique: new Map(), cursor: 0, matching,
          bounds: matching.changed.map(() => ({ start: Infinity, end: Infinity })), gapCursor: 0,
        };
      }
      const { sourceNodes, shownNodes, offsets, readRect, sourceOrigin, previewOrigin, unique, matching } = building;
      while (building.cursor < sourceNodes.length) {
        // Initial/invalidated indexes are built in bounded slices, never a full long-document scroll job.
        if (view.performance.now() - sliceStart >= 4) break;
        const index = building.cursor++, node = sourceNodes[index];
        const renderedLine = Number(node.getAttribute('data-source-line'));
        const line = matching.toCurrent ? (matching.toCurrent[renderedLine - 1] ?? -1) + 1 : renderedLine;
        if (!Number.isInteger(line) || line < 1 || line > offsets.length || unique.has(line) || node.closest('[data-preview-only]')) continue;
        const style = node.ownerDocument.defaultView!.getComputedStyle(node);
        if (style.display === 'none' || style.display === 'contents' || style.display.startsWith('inline') && !['IMG', 'svg', 'SVG', 'VIDEO', 'CANVAS', 'HR'].includes(node.tagName)) continue;
        const sourceRect = readRect(offsets[line - 1]), targetRect = shownNodes[index].getBoundingClientRect();
        measuredSource++; measuredPreview++;
        if (!sourceRect?.height || !targetRect.height) continue;
        unique.set(line, { line, sourceTop: sourceRect.top - sourceOrigin + viewport!.scrollTop, previewTop: targetRect.top - previewOrigin + displayed.viewport.scrollTop });
      }
      while (building.cursor === sourceNodes.length && building.gapCursor < matching.changed.length * 2) {
        if (view.performance.now() - sliceStart >= 4) break;
        const job = building.gapCursor++, index = job >>> 1, end = Boolean(job & 1), sourceLine = matching.changed[index][end ? 1 : 0];
        if (sourceLine >= offsets.length) continue;
        const rect = readRect(offsets[sourceLine]); measuredSource++;
        if (rect?.height) building.bounds[index][end ? 'end' : 'start'] = rect.top - sourceOrigin + viewport!.scrollTop;
        else if (end) building.bounds[index].end = building.bounds[index].start;
      }
      if (building.cursor < sourceNodes.length || building.gapCursor < matching.changed.length * 2) {
        schedule(true);
        options.onSample?.({ durationMs: view.performance.now() - started, rebuilt: true, pending: true, anchors: unique.size, measuredSource, measuredPreview, wrote: false });
        return;
      }
      anchors = [...unique.values()].sort((a, b) => a.sourceTop - b.sourceTop || a.line - b.line);
      changedBounds = building.bounds.filter(bound => Number.isFinite(bound.start) && bound.end > bound.start).sort((a, b) => a.start - b.start);
      startsAtZero = (anchors[0]?.line ?? Infinity) <= matching.prefix;
      maxScroll = Math.max(0, displayed.viewport.scrollHeight - displayed.viewport.clientHeight);
      building = null; dirty = false;
    }
    const top = viewport!.scrollTop;
    let low = 0, high = changedBounds.length;
    while (low < high) { const middle = (low + high) >>> 1; if (changedBounds[middle].start <= top) low = middle + 1; else high = middle; }
    const gap = changedBounds[low - 1];
    const anchor = gap && top < gap.end ? findNearestScrollAnchor(anchors, top) : findScrollAnchor(anchors, top);
    const target = anchor ? startsAtZero && top < anchors[0].sourceTop ? 0 : Math.max(0, Math.min(maxScroll, anchor.previewTop)) : null;
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
