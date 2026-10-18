import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceOffsetRect, createSourceRectReader, revealSourceRect, visibleSourceGutterDigits } from '../src/lib/sourceViewport.ts';

function layer(parts) {
  const nodes = parts.map(([text, line, padding = false]) => ({
    length: text.length, line, parentElement: { closest: () => padding ? {} : null },
  }));
  const doc = {
    createTreeWalker() { let index = 0; return { nextNode: () => nodes[index++] ?? null }; },
    createRange() { let node, index; return {
      setStart(n, i) { node = n; index = i; }, collapse() {},
      getBoundingClientRect: () => ({ top: node.line * 28, bottom: node.line * 28 + 28, height: 28, left: index }),
    }; },
  };
  return { ownerDocument: doc };
}

test('caret offsets skip layout-only blank-line glyphs and still count real zero-width source characters', () => {
  const source = layer([['甲', 0], ['\n', 0], ['\u200b', 1, true], ['\n', 1], ['乙', 2]]);
  assert.equal(sourceOffsetRect(source, 2).top, 28);
  assert.equal(sourceOffsetRect(source, 3).top, 56);
  assert.equal(sourceOffsetRect(source, 4).left, 1);
  assert.equal(sourceOffsetRect(layer([['\u200bX', 0]]), 1).left, 1);
});

test('reveal changes only the common viewport and preserves the scroll position when already visible', () => {
  const viewport = { scrollTop: 500, clientHeight: 100, clientTop: 2, getBoundingClientRect: () => ({ top: 20 }) };
  revealSourceRect(viewport, { top: 50, bottom: 78, height: 28 });
  assert.equal(viewport.scrollTop, 500);
  revealSourceRect(viewport, { top: 5, bottom: 33, height: 28 });
  assert.equal(viewport.scrollTop, 483);
  revealSourceRect(viewport, { top: 150, bottom: 178, height: 28 });
  assert.equal(viewport.scrollTop, 539);
});

test('batched geometry reuses one text walk and preserves boundary/padding offsets', () => {
  const source = layer([['甲', 0], ['\n', 0], ['\u200b', 1, true], ['\n', 1], ['乙😀', 2]]);
  let walks = 0; const original = source.ownerDocument.createTreeWalker;
  source.ownerDocument.createTreeWalker = (...args) => { walks++; return original(...args); };
  const read = createSourceRectReader(source);
  assert.equal(read(2).top, 28); assert.equal(read(3).top, 56);
  assert.equal(read(5).left, 2); assert.equal(read(999).left, 3);
  assert.equal(walks, 1);
});

test('search centering uses the common viewport and clamps to the document boundaries', () => {
  const viewport = { scrollTop: 300, scrollHeight: 2000, clientHeight: 400, clientTop: 0, getBoundingClientRect: () => ({ top: 100 }) };
  revealSourceRect(viewport, { top: 430, bottom: 450, height: 20 }, 'center');
  assert.equal(viewport.scrollTop, 440);
  viewport.scrollTop = 0;
  revealSourceRect(viewport, { top: 100, bottom: 120, height: 20 }, 'center');
  assert.equal(viewport.scrollTop, 0);
  viewport.scrollTop = 1590;
  revealSourceRect(viewport, { top: 480, bottom: 500, height: 20 }, 'center');
  assert.equal(viewport.scrollTop, 1600);
});

test('visible line numbers expand at 1000 and 10000 with logarithmic reads, including soft-wrapped rows', () => {
  for (const [last, digits] of [[999, 3], [1000, 4], [1001, 4], [9999, 4], [10000, 5]]) {
    let reads = 0;
    const result = visibleSourceGutterDigits(10000, last * 28, i => { reads++; return i * 28; });
    assert.equal(result, digits); assert.ok(reads < 20);
  }
  assert.equal(visibleSourceGutterDigits(10000, 999 * 56, i => i * 56), 3);
  assert.equal(visibleSourceGutterDigits(10000, 1000 * 56, i => i * 56), 4);
});

test('visible gutter width includes folded metadata lines and their actual viewport position', () => {
  assert.equal(visibleSourceGutterDigits(100, 28, i => i * 28, 999), 4);
  assert.equal(visibleSourceGutterDigits(100, 28, i => i * 28, 9999), 5);
  assert.equal(visibleSourceGutterDigits(1000, 999 * 28, i => i * 28, 0), 3);
  assert.equal(visibleSourceGutterDigits(1000, 999 * 28, i => i * 28, 11), 4);
  assert.equal(visibleSourceGutterDigits(1000, 999 * 28, i => 400 + i * 28, 11), 3, 'expanded metadata moves body rows down in the same viewport');
});


test('floating find does not shift the viewport center but cannot cover a hit in a short viewport', () => {
  const viewport = { scrollTop: 300, scrollHeight: 2000, clientHeight: 400, clientTop: 0, getBoundingClientRect: () => ({ top: 100 }) };
  revealSourceRect(viewport, { top: 430, bottom: 450, height: 20 }, 'center', 100);
  assert.equal(viewport.scrollTop, 440, 'overlay height is not subtracted a second time');
  viewport.scrollTop = 300; viewport.clientHeight = 150;
  revealSourceRect(viewport, { top: 430, bottom: 450, height: 20 }, 'center', 100);
  assert.equal(viewport.scrollTop, 530, 'hit begins below the floating panel');
});
