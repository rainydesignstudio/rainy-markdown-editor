import { unified } from 'unified';
import remarkParse from 'remark-parse';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCitations, insertCitation, setCitationText, tidyCitations, isLegacyCitationMarker } from '../../src/lib/knowledge/citations.ts';
test('free references insert plain text, explicitly reuse, edit and tidy only on request', () => {
  let first = insertCitation('Argument.', { start: 9, end: 9 }, '秦始皇，我自己写的，公元前五亿年', '## References', 'Excerpt');
  assert.match(first.body, /Argument. Excerpt \[\[1\]\]/); assert.equal(readCitations(first.body).entries[0].text, '秦始皇，我自己写的，公元前五亿年');
  let second = insertCitation(first.body, { start: 0, end: 0 }, 'Unspecified', '## References');
  assert.equal(readCitations(second.body).entries.length, 2); assert.ok(second.body.startsWith('[[2]]'));
  let reuse = insertCitation(second.body, { start: 0, end: 0 }, '', '## References', '', false, first.id);
  assert.equal(readCitations(reuse.body).entries.length, 2);
  const edited = setCitationText(reuse.body, first.id, 'Freely edited\nsecond line', '## References');
  assert.equal(readCitations(edited).entries[0].text, 'Freely edited\nsecond line');
  const tidy = tidyCitations(second.body, '## References');
  assert.ok(tidy.startsWith('[[1]](#' + second.id)); assert.equal(readCitations(tidy).entries[0].id, second.id);
});
test('tidying ignores legacy references, footnotes and code; removes orphaned managed entries', () => {
  const entry = insertCitation('Legacy [9] and footnote[^old].\n\n[^old]: Old footnote', { start: 0, end: 0 }, '', '## References');
  const without = entry.body.replace('[[1]](#' + entry.id + ')', '`[[1]](#' + entry.id + ')`');
  const tidy = tidyCitations(without, '## References');
  assert.equal(readCitations(tidy).entries.length, 0); assert.match(tidy, /Legacy \[9\]/); assert.match(tidy, /\[\^old\]: Old footnote/); assert.match(tidy, /`\[\[1\]\]/);
  assert.throws(() => tidyCitations('<!-- rainy-citations --> damaged', 'References'));
});
test('quoting and explicit adoption replace only the selected legacy marker', () => {
  const value = insertCitation('Text [7] and [8].', { start: 5, end: 8 }, 'free', '## References', 'One\nTwo', true, undefined, true);
  assert.match(value.body, /Text \n\n> One\n> Two \[\[1\]\]/); assert.match(value.body, /and \[8\]/);
});

test('rendered markers retain square brackets and quote adoption creates a real block quote', () => {
  const result = insertCitation('Before.', { start: 7, end: 7 }, '', '## References', 'A passage', true);
  const tree = unified().use(remarkParse).parse(result.body), links = [];
  const walk = node => { if (node.type === 'link') links.push(node); node.children?.forEach(walk); }; walk(tree);
  assert.equal(links[0].children[0].value, '[1]'); assert.ok(tree.children.some(node => node.type === 'blockquote'));
});

test('inserting at the reference region keeps its delimiter on a separate line', () => {
  const first = insertCitation('Argument.', { start: 9, end: 9 }, 'entry', '## References');
  const start = readCitations(first.body).start;
  const second = insertCitation(first.body, { start, end: start }, '', '## References', '', false, first.id);
  assert.match(second.body, /\)\n\n<!-- rainy-citations -->/);
  assert.equal(readCitations(second.body).entries.length, 1);
});

test('citation and excerpt insertion preserve the manuscript selection by default', () => {
  const body = 'Before Keep this argument after.', selection = { start: 7, end: 25 };
  const cite = insertCitation(body, selection, 'free', '## References');
  assert.ok(cite.body.startsWith('Before Keep this argument[[1]]')); assert.ok(cite.body.includes(' after.'));
  const excerpt = insertCitation(body, selection, 'free', '## References', 'Quoted material');
  assert.ok(excerpt.body.startsWith('Before Keep this argument Quoted material [[1]]'));
  assert.throws(() => insertCitation(body, selection, '', '## References', '', false, undefined, true));
  for (const value of ['[7]', '[7](#old)', '[7][old]', '[^old]']) assert.equal(isLegacyCitationMarker(value), true);
  assert.equal(isLegacyCitationMarker('Keep this argument'), false);
  const keep = insertCitation('Text [7] end', { start: 5, end: 8 }, '', '## References'); assert.ok(keep.body.startsWith('Text [7][[1]]'));
});
test('managed regions in fenced, indented and inline code remain examples', () => {
  const sample = insertCitation('Example.', { start: 8, end: 8 }, 'Example reference', '## References').body;
  for (const example of ['~~~markdown\n' + sample + '\n~~~', sample.split('\n').map(line => '    ' + line).join('\n'), '\x60<!-- rainy-citations -->\x60 and \x60<!-- /rainy-citations -->\x60']) {
    assert.equal(readCitations(example).entries.length, 0); assert.equal(tidyCitations(example, '## References'), example);
    const actual = insertCitation(example + '\n\nArgument.', { start: example.length + 11, end: example.length + 11 }, 'Real reference', '## References');
    assert.ok(actual.body.startsWith(example)); assert.equal(readCitations(actual.body).entries.length, 1);
    const edit = setCitationText(actual.body, actual.id, 'Changed reference', '## References'); assert.ok(edit.startsWith(example)); assert.ok(edit.includes('Changed reference'));
  }
});
test('example anchors inside reference wording do not create entries', () => {
  const wording = 'Free text\n\n~~~html\n<span id="rme-cite-example"></span> [9] sample\n~~~';
  const value = insertCitation('Argument.', { start: 9, end: 9 }, wording, '## References');
  assert.equal(readCitations(value.body).entries.length, 1); assert.equal(readCitations(tidyCitations(value.body, '## References')).entries[0].text, wording);
  assert.throws(() => readCitations(value.body + '\n' + value.body));
});
