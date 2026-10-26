import type { KnowledgeCapture } from './model';

/** Both reference surfaces accept ranges wholly inside the current document. */
export function captureKnowledgeSelection(element: HTMLElement | null, selected: Selection | null, doc: { path: string; title: string; text: string }, sourceId: string): KnowledgeCapture | null {
  const range = selected?.rangeCount ? selected.getRangeAt(0) : null;
  if (!range || selected!.isCollapsed || !selected!.toString().trim() || !element?.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
  const lines = doc.text.split(/\r?\n/), content = selected!.toString();
  const lineAt = (node: Node, offset: number) => {
    const parent = node.nodeType === 1 ? node as Element : node.parentElement;
    const block = parent?.closest<HTMLElement>('[data-line]') ?? element;
    const prefix = range.cloneRange(); prefix.selectNodeContents(block); prefix.setEnd(node, offset);
    const first = Number(block.dataset.line) || 1, column = Number(block.dataset.sourceColumn) || 1;
    const fence = block.tagName === 'PRE' && /^\s*(?:`{3,}|~{3,})/.test((lines[first - 1] ?? '').slice(column - 1));
    return first + (fence ? 1 : 0) + prefix.toString().split('\n').length - 1;
  };
  const line = lineAt(range.startContainer, range.startOffset), endLine = Math.max(line, lineAt(range.endContainer, range.endOffset));
  return { sourceId, path: doc.path, title: doc.title, content, line, endLine, whole: false, original: lines.slice(line - 1, endLine).join('\n') };
}
