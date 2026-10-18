export type RenderedPreviewImage = { src: string; alt: string; fileName: string; focus: () => void };
const sourceAttributes = new WeakMap<Element, Record<string, string | null>>();

export function restorePreviewImageAttributes(source: Element, copy: Element): void {
  for (const [name, value] of Object.entries(sourceAttributes.get(source) ?? {})) {
    if (value === null) copy.removeAttribute(name); else copy.setAttribute(name, value);
  }
}

/** Delegation also works in cloned dark documents, where React handlers do not exist. */
export function bindPreviewImages(root: HTMLElement, onOpen: (image: RenderedPreviewImage) => void, isCurrent: () => boolean = () => true): () => void {
  const originals = new Map<Element, Record<string, string | null>>();
  const attributes = { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' };
  const restore = (image: Element, saved: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(saved)) {
      if (image.getAttribute(key) !== attributes[key as keyof typeof attributes]) continue;
      if (value === null) image.removeAttribute(key); else image.setAttribute(key, value);
    }
  };
  const mark = () => {
    for (const [image, saved] of originals) if (!root.contains(image)) { restore(image, saved); originals.delete(image); sourceAttributes.delete(image); }
    for (const image of root.querySelectorAll('img')) if (!originals.has(image)) {
      originals.set(image, Object.fromEntries(Object.keys(attributes).map(key => [key, image.getAttribute(key)])));
      sourceAttributes.set(image, originals.get(image)!);
      for (const [key, value] of Object.entries(attributes)) image.setAttribute(key, value);
    }
  };
  const activate = (event: Event) => {
    const key = event as KeyboardEvent, pointer = event as MouseEvent;
    if (pointer.altKey || pointer.ctrlKey || pointer.metaKey || pointer.shiftKey || event.type === 'keydown' && !['Enter', ' '].includes(key.key) || !isCurrent()) return;
    const target = event.target as Element | null;
    const image = target?.nodeType === 1 ? target.closest('img') as HTMLImageElement | null : null;
    if (!image || !root.contains(image) || !image.complete || !image.naturalWidth) return;
    const src = image.currentSrc || image.src;
    if (!src) return;
    event.preventDefault(); event.stopPropagation();
    const original = image.getAttribute('data-local-asset-src') || image.getAttribute('data-library-asset-path') || src;
    let name = original.split('/').at(-1)?.split(/[?#]/)[0] ?? '';
    try { name = decodeURIComponent(name); } catch { /* Keep the authored name when it is not URI-encoded. */ }
    onOpen({ src, alt: image.alt, fileName: name || image.alt, focus: () => { if (image.isConnected) image.focus(); } });
  };
  mark();
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(mark);
  observer?.observe(root, { childList: true, subtree: true });
  root.addEventListener('click', activate, true); root.addEventListener('keydown', activate, true);
  return () => {
    observer?.disconnect(); root.removeEventListener('click', activate, true); root.removeEventListener('keydown', activate, true);
    for (const [image, saved] of originals) { restore(image, saved); sourceAttributes.delete(image); }
    originals.clear();
  };
}
