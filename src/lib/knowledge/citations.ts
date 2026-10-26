import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export type CitationEntry = { id: string; number: number; text: string };
const START = '<!-- rainy-citations -->', END = '<!-- /rainy-citations -->';
const anchor = /^<span id="(rme-cite-[a-f0-9-]+)"><\/span> \[(\d+)\] ?/gm;
const markdown = unified().use(remarkParse).use(remarkGfm);
export const isLegacyCitationMarker = (text: string) => /^(?:\[\d+\](?:\([^\r\n]*\)|\[[^\]\r\n]*\])?|\[\^[^\]\s]+\])$/.test(text);
export function readCitations(body: string) {
  const empty = () => ({ entries: [] as CitationEntry[], body, heading: '', start: body.length, end: body.length });
  if (!body.includes(START) && !body.includes(END)) return empty();
  const starts: number[] = [], ends: number[] = [], codes: { start: number; end: number }[] = [];
  const visit = (node: any) => {
    if (node.type === 'code' || node.type === 'inlineCode') { codes.push({ start: node.position.start.offset, end: node.position.end.offset }); return; }
    if (node.type === 'html' && (node.value.trimStart().startsWith(START) || node.value.trimStart().startsWith(END))) {
      for (const match of node.value.matchAll(/<!-- \/?rainy-citations -->/g)) (match[0] === START ? starts : ends).push(node.position.start.offset + match.index);
    }
    node.children?.forEach(visit);
  };
  visit(markdown.parse(body));
  if (!starts.length && !ends.length) return empty();
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) throw new Error('citationInvalid');
  const start = starts[0], end = ends[0], block = body.slice(start + START.length, end), seen = new Set<string>();
  let code = 0;
  const matches = [...block.matchAll(anchor)].filter(match => {
    const offset = start + START.length + match.index!;
    while (code < codes.length && codes[code].end <= offset) code++;
    return !codes[code] || codes[code].start > offset;
  });
  const entries = matches.map((match, i) => {
    const number = Number(match[2]);
    if (!number || !Number.isSafeInteger(number) || seen.has(match[1])) throw new Error('citationInvalid');
    seen.add(match[1]);
    return { id: match[1], number, text: block.slice(match.index! + match[0].length, matches[i + 1]?.index ?? block.length).trim() };
  });
  if (!matches.length && block.trim()) throw new Error('citationInvalid');
  return { entries, body: body.slice(0, start) + body.slice(end + END.length), heading: block.slice(0, matches[0]?.index ?? 0).trim(), start, end: end + END.length };
}
function region(heading: string, entries: CitationEntry[]) {
  return entries.length ? START + '\n' + heading + '\n\n' + entries.map(entry => '<span id="' + entry.id + '"></span> [' + entry.number + '] ' + entry.text).join('\n\n') + '\n' + END : '';
}
function replaceRegion(body: string, entries: CitationEntry[], heading: string) {
  const old = readCitations(body), block = region(old.heading || heading, entries);
  return old.start === body.length ? body + (body.endsWith('\n') ? '\n' : '\n\n') + block : body.slice(0, old.start) + block + body.slice(old.end);
}
export function setCitationText(body: string, id: string, text: string, heading: string) {
  const { entries } = readCitations(body);
  if (!entries.some(entry => entry.id === id)) throw new Error('citationMissing');
  return replaceRegion(body, entries.map(entry => entry.id === id ? { ...entry, text } : entry), heading);
}
export function insertCitation(body: string, selection: { start: number; end: number }, text: string, heading: string, excerpt = '', quote = false, reuse?: string, adoptLegacy = false) {
  const old = readCitations(body), entries = [...old.entries], existing = entries.find(entry => entry.id === reuse);
  if (reuse && !existing) throw new Error('citationMissing');
  const entry = existing ?? { id: 'rme-cite-' + crypto.randomUUID(), number: Math.max(0, ...entries.map(item => item.number)) + 1, text };
  if (!existing) entries.push(entry);
  const end = Math.max(0, Math.min(selection.end, old.start)), selectedStart = Math.max(0, Math.min(selection.start, end));
  if (adoptLegacy && !isLegacyCitationMarker(body.slice(selectedStart, end))) throw new Error('citationInvalid');
  const start = adoptLegacy ? selectedStart : end;
  const marker = '[[' + entry.number + ']](#' + entry.id + ')';
  const adopted = excerpt ? (quote ? excerpt.split('\n').map(line => '> ' + line).join('\n') : excerpt) + ' ' : '';
  const inserted = quote && excerpt ? '\n\n' + adopted + marker + '\n\n' : (excerpt && start && !/\s/.test(body[start - 1]) ? ' ' : '') + adopted + marker;
  const next = body.slice(0, start) + inserted + (old.entries.length && end === old.start ? '\n\n' : '') + body.slice(end);
  return { body: replaceRegion(next, entries, heading), id: entry.id, caret: start + inserted.length };
}
// Only actual links are managed; examples inside code and all unadopted legacy references stay untouched.
export function tidyCitations(body: string, heading: string) {
  const old = readCitations(body), entries = new Map(old.entries.map(entry => [entry.id, entry]));
  const references: { id: string; start: number; end: number }[] = [];
  const visit = (node: any) => {
    if (node.type === 'link' && node.position?.end.offset <= old.start && typeof node.url === 'string' && entries.has(node.url.slice(1)) && node.url.startsWith('#')) references.push({ id: node.url.slice(1), start: node.position.start.offset, end: node.position.end.offset });
    node.children?.forEach(visit);
  };
  visit(markdown.parse(body));
  const ordered = [...new Set(references.map(reference => reference.id))], numbers = new Map(ordered.map((id, i) => [id, i + 1]));
  let prefix = body.slice(0, old.start);
  for (const reference of references.reverse()) prefix = prefix.slice(0, reference.start) + '[[' + numbers.get(reference.id) + ']](#' + reference.id + ')' + prefix.slice(reference.end);
  return prefix + region(old.heading || heading, ordered.map(id => ({ ...entries.get(id)!, number: numbers.get(id)! }))) + body.slice(old.end);
}
