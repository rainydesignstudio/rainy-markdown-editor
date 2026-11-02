import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export type EditorSourceTone = 'syntax' | 'heading' | 'quote';
export type EditorSourceSegment = { text: string; tone?: EditorSourceTone };

export function tokenizeEditorSource(value: string, extended = false): EditorSourceSegment[] {
  if (extended) return tokenizeArticleSource(value);
  const output: EditorSourceSegment[] = [];
  let fenced = false;
  value.split('\n').forEach((line, index, lines) => {
    const fence = /^\s*(?:`{3,}|~{3,})/.test(line);
    const heading = !fenced && !fence ? line.match(/^(#{1,6})(\s+)(.*)$/) : null;
    const quote = !fenced && !fence && !heading ? line.match(/^(\s*>\s?)(.*)$/) : null;
    const list = !fenced && !fence && !heading && !quote ? line.match(/^(\s*(?:[-*+]|\d+\.))(\s+)(.*)$/) : null;
    if (heading) output.push({ text: heading[1], tone: 'syntax' }, { text: heading[2] }, { text: heading[3], tone: 'heading' });
    else if (quote) output.push({ text: quote[1], tone: 'syntax' }, { text: quote[2], tone: 'quote' });
    else if (list) output.push({ text: list[1], tone: 'syntax' }, { text: list[2] }, { text: list[3] });
    else output.push({ text: line });
    if (index < lines.length - 1) output.push({ text: '\n' });
    if (fence) fenced = !fenced;
  });
  return output;
}

type Range = { start: number; end: number; tone?: EditorSourceTone; priority: number };
type SourceNode = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: SourceNode[] };
const markdown = unified().use(remarkParse).use(remarkGfm);

/** Parse positions only: never render authored HTML or change source bytes. */
function tokenizeArticleSource(value: string): EditorSourceSegment[] {
  const ranges: Range[] = [];
  const add = (start: number, end: number, tone: EditorSourceTone | undefined, priority = 2) => {
    if (end > start) ranges.push({ start, end, tone, priority });
  };
  const css = (start: number, end: number) => {
    const text = value.slice(start, end);
    // Quoted values and comments are consumed whole so punctuation inside them is not syntax.
    const pattern = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:--|[-a-zA-Z_])[-\w]*(?=\s*:)|[^{};]+(?=\{)|[{}:;]/g;
    for (const match of text.matchAll(pattern)) {
      if (/^(?:\/\*|["'])/.test(match[0])) continue;
      add(start + match.index, start + match.index + match[0].length, 'syntax');
    }
  };
  const html = (start: number, end: number) => {
    const text = value.slice(start, end);
    const tags = /<!--[\s\S]*?(?:-->|$)|<\/?[a-zA-Z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*(?:>|$)/g;
    let raw: 'pre' | 'code' | 'script' | null = null, styleStart: number | null = null;
    for (const match of text.matchAll(tags)) {
      const tagStart = start + match.index, tagEnd = tagStart + match[0].length;
      const tag = /^<(\/)?([\w:-]+)/.exec(match[0]);
      if (!tag) continue;
      const name = tag[2].toLowerCase(), closing = Boolean(tag[1]);
      if (raw) { if (closing && name === raw) raw = null; else continue; }
      if (styleStart !== null) {
        if (!(closing && name === 'style')) continue;
        css(styleStart, tagStart); styleStart = null;
      }
      add(tagStart, tagEnd, 'syntax');
      for (const attr of match[0].matchAll(/([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g)) {
        const from = tagStart + attr.index + attr[1].length + attr[2].length;
        add(from, from + attr[3].length, undefined, 3);
        if (attr[1].toLowerCase() === 'style') {
          const quoted = /^["']/.test(attr[3]);
          const before = ranges.length;
          css(from + Number(quoted), from + attr[3].length - Number(quoted));
          ranges.slice(before).forEach(range => { range.priority = 4; });
        }
      }
      if (!closing && !/\/\s*>$/.test(match[0])) {
        if (name === 'pre' || name === 'code' || name === 'script') raw = name;
        if (name === 'style') styleStart = tagEnd;
      }
    }
    if (styleStart !== null) css(styleStart, end);
  };
  const visit = (node: SourceNode) => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (node.type === 'code' || node.type === 'inlineCode') { add(start, end, undefined, 10); return; }
    if (node.type === 'html') { html(start, end); return; }
    if (node.type === 'heading') add(start, end, 'heading', 0);
    if (node.type === 'blockquote') add(start, end, 'quote', 0);
    if (['strong', 'emphasis', 'delete'].includes(node.type)) {
      const size = node.type === 'emphasis' ? 1 : 2;
      add(start, start + size, 'syntax'); add(end - size, end, 'syntax');
    }
    if (['link', 'image', 'linkReference', 'imageReference', 'thematicBreak'].includes(node.type)) add(start, end, 'syntax', 1);
    for (const child of node.children ?? []) visit(child);
  };
  visit(markdown.parse(value) as SourceNode);
  for (const match of value.matchAll(/^(?: {0,3}#{1,6}(?=\s)|\s*>\s?|\s*(?:[-*+]|\d+[.)])(?=\s))/gm)) add(match.index, match.index + match[0].length, 'syntax');
  for (const match of value.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) add(match.index, match.index + match[0].length, undefined, 10);
  for (const match of value.matchAll(/<(pre|code|script)\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)(<\/\1\s*>|$)/gi)) {
    const contentStart = match.index + match[0].length - match[2].length - match[3].length;
    add(contentStart, contentStart + match[2].length, undefined, 10);
  }
  const events = ranges.flatMap((range, id) => [{ at: range.start, id, range, entering: true }, { at: range.end, id, range, entering: false }]).sort((a, b) => a.at - b.at);
  const active = new Map<number, Range>();
  const output: EditorSourceSegment[] = [];
  const append = (start: number, end: number) => {
    if (start === end) return;
    let selected: Range | undefined;
    active.forEach(range => { if (!selected || range.priority >= selected.priority) selected = range; });
    const tone = selected?.tone, text = value.slice(start, end), previous = output.at(-1);
    if (previous && previous.tone === tone) previous.text += text;
    else output.push({ text, ...(tone ? { tone } : {}) });
  };
  let offset = 0;
  for (const event of events) { append(offset, event.at); offset = event.at; if (event.entering) active.set(event.id, event.range); else active.delete(event.id); }
  append(offset, value.length);
  return output;
}
