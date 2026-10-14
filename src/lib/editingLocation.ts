type Position = { node: HTMLElement; path: number[]; tag: string; top: number; left: number };
export type EditingLocation = { focus: Position | null; selection?: { start: number; end: number; direction: 'forward' | 'backward' | 'none' }; scroll: Position[] };
export type RememberedEditingLocation = { key: number | undefined; location: EditingLocation };

function position(root: HTMLElement, node: HTMLElement): Position {
  const path: number[] = [];
  for (let child: Element | null = node; child && child !== root; child = child.parentElement) {
    if (!child.parentElement) break;
    path.unshift(Array.prototype.indexOf.call(child.parentElement.children, child));
  }
  return { node, path, tag: node.tagName, top: node.scrollTop, left: node.scrollLeft };
}
export function captureEditingLocation(root: HTMLElement | null, preferred?: HTMLElement | null): EditingLocation | null {
  if (!root) return null;
  const active = preferred && root.contains(preferred) ? preferred : root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement as HTMLElement : null;
  const scroll: Position[] = [];
  for (let node = active ?? root; node && root.contains(node); node = node.parentElement!) {
    scroll.push(position(root, node));
    if (node === root) break;
  }
  const editable = active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT' ? active as HTMLTextAreaElement : null;
  return { focus: active ? position(root, active) : null, scroll,
    ...(editable?.selectionStart !== null && editable?.selectionStart !== undefined ? { selection: { start: editable.selectionStart, end: editable.selectionEnd, direction: editable.selectionDirection } } : {}) };
}
export function restoreEditingLocation(location: EditingLocation | null, getRoot: () => HTMLElement | null, focus = true) {
  if (!location || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const root = getRoot();
    if (!root?.isConnected) return;
    const resolve = (saved: Position) => {
      if (root.contains(saved.node)) return saved.node;
      let node: Element | undefined = root;
      for (const index of saved.path) node = node?.children[index];
      return node instanceof HTMLElement && node.tagName === saved.tag ? node : null;
    };
    const target = location.focus ? resolve(location.focus) : root;
    if (focus && target && !target.closest('[inert]')) {
      target.focus({ preventScroll: true });
      if (location.selection && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        try { (target as HTMLTextAreaElement).setSelectionRange(location.selection.start, location.selection.end, location.selection.direction); } catch { /* Non-text inputs have no selection. */ }
      }
    }
    const scroll = () => location.scroll.forEach(saved => { const node = resolve(saved); if (node) { node.scrollTop = saved.top; node.scrollLeft = saved.left; } });
    scroll();
    // Native selection events may reveal the caret; restore the user's viewport last.
    window.requestAnimationFrame(scroll);
  }));
}
