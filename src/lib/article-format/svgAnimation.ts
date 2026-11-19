type Attributes = Record<string, unknown>;
type SvgTree = { tagName?: string; properties?: Attributes; children?: SvgTree[] };

export const SVG_ANIMATION_TAGS = Object.freeze(['animate', 'animateTransform', 'set']);
export const SVG_ANIMATION_ATTRIBUTES = Object.freeze(['attributeName', 'from', 'to', 'values', 'dur', 'begin', 'end', 'repeatCount', 'repeatDur', 'keyTimes', 'calcMode', 'additive', 'type', 'restart']);
const ANIMATED_PROPERTIES = new Set(['opacity', 'fill', 'stroke', 'transform', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width', 'stroke-dashoffset']);

export function svgAnimatedProperties(node: Element,cache:WeakMap<Element,Set<string>>):Set<string>|undefined {
  let svg=node.namespaceURI==='http://www.w3.org/2000/svg'?node.closest('svg'):null;
  while(svg?.parentElement?.closest('svg'))svg=svg.parentElement.closest('svg');
  if(!svg)return;
  let properties=cache.get(svg);
  if(!properties){properties=new Set([...svg.querySelectorAll('set,animate,animateTransform')].map(entry=>entry.getAttribute('attributeName')??''));cache.set(svg,properties);}
  return properties;
}

// Declarative paint/geometry only. The same gate protects Markdown and package output.
export function isSafeSvgAnimation(tag: string, attributes: Attributes): boolean {
  const read = (key: string) => String(attributes[key] ?? attributes[key.toLowerCase()] ?? '').trim();
  const name = read('attributeName');
  for (const key of ['from', 'to', 'values']) if (/(?:url\s*\(|(?:java|vb)script\s*:|data\s*:)/i.test(read(key))) return false;
  if (tag === 'set') {
    const value = read('to');
    return name === 'visibility' ? /^(?:visible|hidden)$/.test(value)
      : name === 'opacity' && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
  }
  if (![read('from'), read('to'), read('values')].some(Boolean)) return false;
  if (tag.toLowerCase() === 'animatetransform') return name === 'transform' && /^(?:translate|scale|rotate|skewX|skewY)$/.test(read('type'));
  return tag === 'animate' && ANIMATED_PROPERTIES.has(name);
}

export function sanitizeSvgAnimations(html: string): string {
  if (!/<(?:set|animate(?:Transform)?)\b/i.test(html)) return html;
  const template = document.createElement('template'); template.innerHTML = html;
  for (const node of template.content.querySelectorAll('set,animate,animateTransform')) {
    const attributes = Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]));
    if (node.namespaceURI !== 'http://www.w3.org/2000/svg' || !isSafeSvgAnimation(node.localName, attributes)) node.remove();
  }
  return template.innerHTML;
}

// Built-in fragments stay independently editable; repeated insertions need local event IDs.
export function rehypeInteractiveSvgIds(options: { prefix: string }) {
  return (tree: SvgTree) => {
    let serial = 0;
    const visit = (node: SvgTree) => {
      if (node.tagName === 'svg' && node.properties?.dataRainyInteractive) {
        // Chromium timing parsing treats hyphens as offsets, even in valid XML IDs.
        const scope = `rmesvg${++serial}n`;
        const ids = new Map<string, string>();
        const walk = (n: SvgTree, action: (entry: SvgTree) => void) => { action(n); n.children?.forEach(child => walk(child, action)); };
        let index=0;
        walk(node, entry => { if (typeof entry.properties?.id === 'string') {
          const id=entry.properties.id,next=scope+index++;ids.set(id,next);
          if(options.prefix&&id.startsWith(options.prefix))ids.set(id.slice(options.prefix.length),next);
        } });
        walk(node, entry => {
          const p = entry.properties; if (!p) return;
          if (typeof p.id === 'string' && ids.has(p.id)) p.id = ids.get(p.id)!;
          for (const key of ['begin', 'end']) if (typeof p[key] === 'string') {
            p[key] = p[key].replace(/([\w-]+)\.(click|touchstart|touchend|mousedown|mouseup|pointerdown|pointerup|begin|end)(?=[+;\s-]|$)/g,
              (all, id: string, event: string) => ids.has(id) ? ids.get(id) + '.' + event : all);
          }
          for (const [key, value] of Object.entries(p)) if (typeof value === 'string' && key !== 'id' && key !== 'begin' && key !== 'end') {
            p[key] = value.replace(/url\(#([\w-]+)\)/g, (all, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : all);
            if(['href','xLinkHref'].includes(key)&&value.startsWith('#')&&ids.has(value.slice(1)))p[key]='#'+ids.get(value.slice(1));
          }
        });
        return;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
