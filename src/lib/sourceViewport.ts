/** Shared source gutter geometry for editable and read-only source rows. */
export const SOURCE_LINE_NUMBER_CLASS = 'absolute top-0 -left-[calc(var(--spacing)*9+var(--source-gutter-extra))] w-[calc(var(--spacing)*5+var(--source-gutter-extra))] whitespace-nowrap pr-1 text-right font-article-source text-faint md:-left-[calc(var(--spacing)*12+var(--source-gutter-extra))] md:w-[calc(var(--spacing)*8+var(--source-gutter-extra))]';
export function sourceLinePaddingClass(showLineNumbers: boolean): string {
  return showLineNumbers ? 'pl-[calc(var(--spacing)*14+var(--source-gutter-extra))] md:pl-[calc(var(--spacing)*18+var(--source-gutter-extra))]' : 'pl-5 md:pl-8';
}

/** Find the last visible logical line without measuring every row. */
export function visibleSourceGutterDigits(total: number, bottom: number, lineTop: (index: number) => number, lineOffset = 0): number {
  let low = 0, high = total;
  while (low < high) { const middle = (low + high) >>> 1; if (lineTop(middle) < bottom) low = middle + 1; else high = middle; }
  return Math.max(3, String(lineOffset + Math.max(1, low)).length);
}

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
export function revealSourceRect(viewport: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, alignment: 'nearest' | 'center' = 'nearest', obscuredTop = 0): void {
  if (!rect.height || !viewport.clientHeight) return;
  const top = viewport.getBoundingClientRect().top + viewport.clientTop;
  const bottom = top + viewport.clientHeight;
  if (alignment === 'center') {
    // The floating search does not shrink the source viewport. Center in that
    // viewport, only moving the target lower if the overlay would cover it.
    const center = Math.min(bottom - rect.height / 2, Math.max((top + bottom) / 2, top + obscuredTop + rect.height / 2));
    viewport.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, viewport.scrollTop + (rect.top + rect.bottom) / 2 - center));
    return;
  }
  if (rect.top < top) viewport.scrollTop += rect.top - top;
  else if (rect.bottom > bottom) viewport.scrollTop += rect.bottom - bottom;
}
