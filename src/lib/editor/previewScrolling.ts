/** Fixed virtual viewports can leave unused host space after fitting a narrow column.
 * Forward only parent-document wheel events; iframe events retain native scrolling. */
export function forwardPreviewWheel(event: WheelEvent, frame: HTMLIFrameElement | null): boolean {
  if (!frame?.isConnected || event.ctrlKey || event.metaKey || event.shiftKey || event.target === frame || !event.deltaY) return false;
  const doc = frame.contentDocument, scrolling = doc?.scrollingElement;
  if (!doc || !scrolling) return false;
  const unit = event.deltaMode === 2 ? scrolling.clientHeight
    : event.deltaMode === 1 ? Number.parseFloat(doc.defaultView?.getComputedStyle(doc.body).lineHeight ?? '') || 16 : 1;
  const previous = scrolling.scrollTop;
  scrolling.scrollTop += event.deltaY * unit;
  if (scrolling.scrollTop === previous) return false;
  event.preventDefault();
  return true;
}
