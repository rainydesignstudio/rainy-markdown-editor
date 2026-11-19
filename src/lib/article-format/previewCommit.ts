/** Update sanitized preview markup without navigating the visible document or reloading unchanged images. */
export function commitPreviewMarkup(target: HTMLElement, html: string): void {
  const doc = target.ownerDocument;
  const viewport = doc.scrollingElement;
  const top = viewport?.scrollTop ?? 0, left = viewport?.scrollLeft ?? 0;
  const hit = doc.elementFromPoint?.(Math.max(1, doc.documentElement.clientWidth / 2), 1);
  const anchor = hit?.closest('[data-source-line]');
  const anchorTop = anchor && target.contains(anchor) ? anchor.getBoundingClientRect().top : null;
  const template = doc.createElement('template');
  template.innerHTML = html;
  const svgMarkup=(element:Element)=>element.outerHTML.replace(/\sdata-source-line="\d+"/g,'');
  function matches(current: Node, next: Node): boolean {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) return false;
    if (current.nodeType !== 1) return true;
    const a = current as Element, b = next as Element;
    // A plain paragraph must not consume the wrapper of an existing animated graphic.
    if(a.namespaceURI==='http://www.w3.org/1999/xhtml'&&a.localName==='p'&&Boolean(a.querySelector('svg set,svg animate,svg animateTransform'))!==Boolean(b.querySelector('svg set,svg animate,svg animateTransform')))return false;
    // A changed animation graph needs a fresh SVG timeline; unchanged artwork keeps its state.
    if(a.namespaceURI==='http://www.w3.org/2000/svg'&&a.localName==='svg'&&svgMarkup(a)!==svgMarkup(b)&&(a.querySelector('set,animate,animateTransform')||b.querySelector('set,animate,animateTransform')))return false;
    return a.namespaceURI === b.namespaceURI && a.id === b.id &&
      (a.localName !== 'img' || a.getAttribute('src') === b.getAttribute('src'));
  }
  function sync(parent: Node, desired: Node): void {
    let current = parent.firstChild;
    for (const next of Array.from(desired.childNodes)) {
      if (!current || !matches(current, next)) {
        let candidate = current?.nextSibling ?? null;
        while (candidate && !matches(candidate, next)) candidate = candidate.nextSibling;
        const inserted = candidate ?? doc.importNode(next, true);
        parent.insertBefore(inserted, current);
        current = inserted;
      }
      if (current.nodeType === 1) {
        const element = current as Element, wanted = next as Element;
        const checkedChanged = element.localName === 'input' && element.hasAttribute('checked') !== wanted.hasAttribute('checked');
        for (const attribute of Array.from(element.attributes)) {
          if (!wanted.hasAttributeNS(attribute.namespaceURI, attribute.localName)) element.removeAttributeNS(attribute.namespaceURI, attribute.localName);
        }
        for (const attribute of Array.from(wanted.attributes)) {
          if (element.getAttributeNS(attribute.namespaceURI, attribute.localName) !== attribute.value) element.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
        }
        if (checkedChanged) (element as HTMLInputElement).checked = wanted.hasAttribute('checked');
        sync(element, wanted);
      } else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      current = current.nextSibling;
    }
    while (current) { const next = current.nextSibling; parent.removeChild(current); current = next; }
  }
  sync(target, template.content);
  if (viewport) {
    viewport.scrollTop = anchorTop !== null && anchor?.isConnected && target.contains(anchor)
      ? viewport.scrollTop + anchor.getBoundingClientRect().top - anchorTop : top;
    viewport.scrollLeft = left;
  }
}
