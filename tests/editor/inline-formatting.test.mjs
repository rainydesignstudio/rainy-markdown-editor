import assert from 'node:assert/strict';
import test from 'node:test';
import { INLINE_FORMATS, formatInlineSelection, inlineFormatShortcut } from '../../src/lib/editor/inlineFormatting.ts';
function apply(source, start, end, format) {
  const p = formatInlineSelection(source, start, end, format);
  return { value: source.slice(0, p.start) + p.text + source.slice(p.end), start: p.start + p.caretOffset, end: p.start + p.selectionEndOffset };
}
test('B/I/U preserve selected Unicode text, selection offsets and surrounding source, and toggle back', () => {
  const source = '前 甲😀 后';
  for (const format of Object.keys(INLINE_FORMATS)) {
    const { open, close } = INLINE_FORMATS[format], next = apply(source, 2, 5, format);
    assert.equal(next.value, '前 ' + open + '甲😀' + close + ' 后');
    assert.equal(next.value.slice(next.start, next.end), '甲😀');
    assert.equal(apply(next.value, next.start, next.end, format).value, source);
    const empty = apply('前后', 1, 1, format);
    assert.equal(empty.value, '前' + open + close + '后'); assert.equal(empty.start, empty.end);
    assert.equal(apply(empty.value, empty.start, empty.end, format).value, '前后');
  }
});
test('whole marker selections and nested bold/italic toggle without deleting the underlying text', () => {
  assert.equal(apply('**word**', 0, 8, 'bold').value, 'word');
  assert.equal(apply('<u>word</u>', 0, 11, 'underline').value, 'word');
  const italic = apply('**word**', 2, 6, 'italic'); assert.equal(italic.value, '***word***');
  assert.equal(apply(italic.value, italic.start, italic.end, 'italic').value, '**word**');
  assert.equal(apply(italic.value, italic.start, italic.end, 'bold').value, '*word*');
});
test('Mac and Ctrl shortcuts share actions while ordinary, Alt and Shift chords remain untouched', () => {
  for (const [format, definition] of Object.entries(INLINE_FORMATS)) for (const modifier of ['metaKey', 'ctrlKey']) {
    const event = { key: definition.key.toUpperCase(), metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, [modifier]: true };
    assert.equal(inlineFormatShortcut(event), format);
    assert.equal(inlineFormatShortcut({ ...event, altKey: true }), null);
    assert.equal(inlineFormatShortcut({ ...event, shiftKey: true }), null);
  }
  assert.equal(inlineFormatShortcut({ key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), null);
});

test('Markdown whitespace stays outside delimiters and raw HTML paragraph text uses actual HTML emphasis', () => {
  assert.equal(apply(' hello ', 0, 7, 'bold').value, ' **hello** ');
  const html = '<section>\n<p>plain text</p>\n</section>', start = html.indexOf('plain');
  const strong = apply(html, start, start + 5, 'bold');
  assert.equal(strong.value, '<section>\n<p><strong>plain</strong> text</p>\n</section>');
  assert.equal(apply(strong.value, strong.start, strong.end, 'bold').value, html);
  const italic = apply(html, start, start + 5, 'italic');
  assert.ok(italic.value.includes('<em>plain</em>'));
  assert.equal(apply('<p></p>', 3, 3, 'bold').value, '<p><strong></strong></p>');
});
