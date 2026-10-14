export const INLINE_FORMATS = {
  bold: { key: 'b', open: '**', close: '**' },
  italic: { key: 'i', open: '*', close: '*' },
  underline: { key: 'u', open: '<u>', close: '</u>' },
} as const;
export type InlineFormat = keyof typeof INLINE_FORMATS;
const HTML_FORMATS = {
  bold: { open: '<strong>', close: '</strong>' },
  italic: { open: '<em>', close: '</em>' },
  underline: { open: '<u>', close: '</u>' },
} as const;
function htmlTextSelection(source: string, start: number, end: number): boolean {
  if (!source.includes('<')) return false;
  // This runs only for an explicit formatting action, not on typing or scrolling.
  const block = unified().use(remarkParse).parse(source).children.find(node => node.type === 'html' &&
    typeof node.position?.start.offset === 'number' && typeof node.position.end.offset === 'number' &&
    node.position.start.offset <= start && node.position.end.offset >= end);
  if (!block?.position) return false;
  const offset = block.position.start.offset!;
  const tree = parseFragment(source.slice(offset, block.position.end.offset!), { sourceCodeLocationInfo: true });
  const visit = (node: DefaultTreeAdapterMap['node']): boolean => {
    if ('tagName' in node && (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ['script', 'style', 'code', 'pre', 'textarea'].includes(node.tagName))) return false;
    const location = node.sourceCodeLocation;
    if (node.nodeName === '#text' && location && offset + location.startOffset <= start && offset + location.endOffset >= end) return true;
    if (start === end && 'tagName' in node && !node.childNodes.length && location &&
      'startTag' in location && location.startTag && 'endTag' in location && location.endTag &&
      offset + location.startTag.endOffset === start && offset + location.endTag.startOffset === end) return true;
    if ('childNodes' in node) return node.childNodes.some(visit);
    return false;
  };
  return tree.childNodes.some(visit);
}
export function isInlineFormat(value: string): value is InlineFormat { return Object.hasOwn(INLINE_FORMATS, value); }
export function inlineFormatShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): InlineFormat | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
  return (Object.keys(INLINE_FORMATS) as InlineFormat[]).find(format => INLINE_FORMATS[format].key === event.key.toLowerCase()) ?? null;
}

/** One source edit, preserving chosen text and native input history. Offsets are UTF-16. */
export function formatInlineSelection(source: string, from: number, to: number, format: InlineFormat) {
  let start = Math.max(0, Math.min(source.length, Math.trunc(from)));
  let end = Math.max(start, Math.min(source.length, Math.trunc(to)));
  if (format !== 'underline' && end > start) {
    const raw = source.slice(start, end);
    if (!raw.trim()) start = end;
    else { start += raw.match(/^\s*/)?.[0].length ?? 0; end -= raw.match(/\s*$/)?.[0].length ?? 0; }
  }
  const selected = source.slice(start, end), alternate = HTML_FORMATS[format];
  const html = format === 'underline' || selected.startsWith(alternate.open) && selected.endsWith(alternate.close) ||
    source.slice(0, start).endsWith(alternate.open) && source.slice(end).startsWith(alternate.close) || htmlTextSelection(source, start, end);
  const { open, close } = html ? alternate : INLINE_FORMATS[format];
  const stars = (value: string, beginning: boolean) => value.match(beginning ? /^\*+/ : /\*+$/)?.[0].length ?? 0;
  const activeStars = (left: number, right: number) => format === 'italic' ? left % 2 === 1 && right % 2 === 1 : left >= 2 && right >= 2;
  const inside = selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length &&
    (html || activeStars(stars(selected, true), stars(selected, false)));
  const around = source.slice(Math.max(0, start - open.length), start) === open && source.slice(end, end + close.length) === close &&
    (html || activeStars(stars(source.slice(0, start), false), stars(source.slice(end), true)));
  if (inside) {
    const text = selected.slice(open.length, -close.length);
    return { start, end, text, caretOffset: 0, selectionEndOffset: text.length };
  }
  if (around) {
    start -= open.length; end += close.length;
    return { start, end, text: selected, caretOffset: 0, selectionEndOffset: selected.length };
  }
  return { start, end, text: open + selected + close, caretOffset: open.length, selectionEndOffset: open.length + selected.length };
}
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
