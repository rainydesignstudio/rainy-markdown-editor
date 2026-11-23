/** Fixed virtual viewports can leave unused host space after fitting a narrow column.
 * Forward only parent-document wheel events; iframe events retain native scrolling. */
export function forwardPreviewWheel(event: WheelEvent, frame: HTMLIFrameElement | null): boolean {
  if (!frame?.isConnected || event.ctrlKey || event.metaKey || event.shiftKey || event.target === frame || !event.deltaY) return false;
  const doc = frame.contentDocument, scrolling = doc?.scrollingElement;
  if (!doc || !scrolling) return false;
  const unit = event.deltaMode === 2 ? scrolling.clientHeight
    : event.deltaMode === 1 ? Number.parseFloat(doc.defaultView?.getComputedStyle(doc.body).lineHeight ?? '') || 16 : 1;
  const previous = scrolling.scrollTop;
  scrolling.scrollTo({ top: previous + event.deltaY * unit, behavior: 'instant' });
  if (scrolling.scrollTop === previous) return false;
  event.preventDefault();
  return true;
}

/** Chrome can dispatch wheel inside the packaged iframe without applying the default scroll. */
export function bindPreviewDocumentWheel(frame: HTMLIFrameElement): () => void {
  const doc = frame.contentDocument;
  if (!doc) return () => {};

  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || !event.cancelable || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const target = event.target as Node | null;
    const start = target?.nodeType === 1 ? target as Element : target?.parentElement;
    for (let element = start; element && element !== doc.scrollingElement; element = element.parentElement) {
      if (element.scrollHeight <= element.clientHeight) continue;
      const overflow = doc.defaultView?.getComputedStyle(element).overflowY;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return;
    }

    forwardPreviewWheel(event, frame);
  };

  doc.addEventListener('wheel', onWheel, { passive: false });
  return () => doc.removeEventListener('wheel', onWheel);
}
