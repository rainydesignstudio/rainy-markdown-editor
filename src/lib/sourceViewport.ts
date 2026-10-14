/** Index the existing highlight text once for a batch of source measurements. */
export function createSourceRectReader(layer: HTMLElement): (offset: number) => DOMRect | null {
  const doc = layer.ownerDocument;
  const walker = doc.createTreeWalker(layer, 4); // NodeFilter.SHOW_TEXT
  const entries: { node: Text; start: number; end: number; padding: boolean }[] = [];
  let length = 0, last: Text | null = null, range: Range | undefined;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const padding = Boolean(node.parentElement?.closest('[data-source-padding]'));
    entries.push({ node, start: length, end: length + (padding ? 0 : node.length), padding });
    if (!padding) { length += node.length; last = node; }
  }
  return offset => {
    const position = Math.max(0, offset);
    let low = 0, high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1, entry = entries[middle];
      if (entry.end > position || entry.padding && entry.start === position) high = middle;
      else low = middle + 1;
    }
    const entry = entries[low], node = entry?.node ?? last;
    if (!node) return null;
    range ??= doc.createRange();
    range.setStart(node, entry ? entry.padding ? 0 : position - entry.start : node.length);
    range.collapse(true);
    return range.getBoundingClientRect();
  };
}

/** Measure a source offset against the existing highlight text, without another text mirror. */
export function sourceOffsetRect(layer: HTMLElement, offset: number): DOMRect | null {
  return createSourceRectReader(layer)(offset);
}

/** Change only the common viewport; never scroll the textarea or a passive text layer. */
export function revealSourceRect(viewport: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>): void {
  if (!rect.height || !viewport.clientHeight) return;
  const top = viewport.getBoundingClientRect().top + viewport.clientTop;
  const bottom = top + viewport.clientHeight;
  if (rect.top < top) viewport.scrollTop += rect.top - top;
  else if (rect.bottom > bottom) viewport.scrollTop += rect.bottom - bottom;
}
