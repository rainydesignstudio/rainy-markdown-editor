import assert from 'node:assert/strict';
import test from 'node:test';
import { findScrollAnchor, findNearestScrollAnchor, sourceLineOffsets, matchPreviewSourceLines, connectPreviewScrollSync } from '../src/lib/previewScrollSync.ts';

test('block selection follows wrapped source heights and blank/code lines without proportional guessing', () => {
  const anchors = [{ line: 1, sourceTop: 16, previewTop: 28 }, { line: 5, sourceTop: 160, previewTop: 60 }, { line: 12, sourceTop: 220, previewTop: 400 }];
  assert.equal(findScrollAnchor([], 100), null);
  assert.equal(findScrollAnchor(anchors, 0).line, 1);
  assert.equal(findScrollAnchor(anchors, 150).line, 1);
  assert.equal(findScrollAnchor(anchors, 180).line, 5);
  assert.equal(findScrollAnchor(anchors, 999).line, 12);
  assert.deepEqual(sourceLineOffsets('甲\r\n😀\n乙\r末'), [0, 3, 6, 8]);
});

test('saved-source correspondence handles inserts, deletes, moves, ambiguous lines and CRLF', () => {
  assert.equal(matchPreviewSourceLines('a\nb', 'a\nb').toCurrent, null);
  assert.deepEqual([...matchPreviewSourceLines('a\nb\nc', 'new\na\nb\nc').toCurrent], [1, 2, 3]);
  assert.deepEqual([...matchPreviewSourceLines('a\nb\nc', 'a\nc').toCurrent], [0, -1, 1]);
  assert.deepEqual([...matchPreviewSourceLines('a\nb\nc', 'c\nb\na').toCurrent], [2, 1, 0]);
  assert.deepEqual([...matchPreviewSourceLines('a\nx\nx\nc', 'z\nx\nc').toCurrent], [-1, -1, 1, 2]);
  assert.deepEqual([...matchPreviewSourceLines('a\nx\nx\nc', 'z\nx\nq').toCurrent], [-1, -1, -1, -1]);
  assert.deepEqual([...matchPreviewSourceLines('a\r\nb\rc', 'a\nb\nc').toCurrent], [0, 1, 2]);
  const changed = matchPreviewSourceLines('a\nb\nc', 'a\nnew\nextra\nc');
  assert.deepEqual(changed.changed, [[1, 3]]);
  assert.equal(changed.prefix, 1);
  const anchors = [{ line: 1, sourceTop: 0, previewTop: 0 }, { line: 4, sourceTop: 300, previewTop: 300 }];
  assert.equal(findNearestScrollAnchor(anchors, 200).line, 4);
  assert.equal(findNearestScrollAnchor([], 10), null);
});

function fixture({ shadowFrame = false } = {}) {
  const observers = [], resizeObservers = [], frames = new Map(), listeners = new Map(), samples = [];
  let nextFrame = 0, clock = 0, sourceMeasurements = 0, previewMeasurements = 0, sourceReads = 0, currentSource = 'a\nb\nc', renderedSource = currentSource;
  class MutationObserver { constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); } observe(target) { this.targets.push(target); } disconnect() { this.targets = []; } }
  class ResizeObserver { constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); } observe(target) { this.targets.push(target); } unobserve(target) { this.targets = this.targets.filter(x => x !== target); } disconnect() { this.targets = []; } }
  const view = { performance: { now: () => clock++ }, requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); }, clearTimeout() {}, setTimeout(fn) { fn(); return 1; }, getComputedStyle: () => ({ display: 'block' }) };
  const doc = { defaultView: view, head: {}, fonts: { addEventListener() {}, removeEventListener() {} }, createTreeWalker() { let index = 0; return { nextNode: () => [{ length: currentSource.length, parentElement: { closest: () => null } }][index++] ?? null }; }, createRange() { let offset; return { setStart(_node, value) { offset = value; }, collapse() {}, getBoundingClientRect() { sourceMeasurements++; return { top: 10 + offset * 50 - viewport.scrollTop, height: 20 }; } }; } };
  const layer = { ownerDocument: doc };
  const viewport = { ownerDocument: doc, scrollTop: 0, clientTop: 0, querySelector: () => layer, getBoundingClientRect: () => ({ top: 10 }), addEventListener(name, callback, options) { listeners.set(name, { callback, options }); }, removeEventListener(name) { listeners.delete(name); } };
  const element = (line, top) => ({ tagName: 'P', ownerDocument: doc, getAttribute: () => String(line), closest: () => null, getBoundingClientRect() { previewMeasurements++; return { top: top - container.scrollTop, height: 30 }; } });
  const nodes = [element(1, 0), element(3, 300)];
  const root = { isConnected: true, tagName: 'ARTICLE', ownerDocument: doc, id: '', getAttribute: () => null, querySelectorAll: () => nodes };
  const container = { dataset: { previewMode: 'light' }, ownerDocument: doc, clientTop: 0, clientHeight: 200, scrollHeight: 1000, scrollTop: 0, querySelector: () => null, getBoundingClientRect: () => ({ top: 0 }), addEventListener() {}, removeEventListener() {} };
  const inner = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
  const foreign = { defaultView: view, body: {}, documentElement: {}, scrollingElement: inner, fonts: { addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {}, querySelector: () => shownRoot };
  const shownNodes = nodes.map((node, index) => ({ ...node, ownerDocument: foreign, getBoundingClientRect() { previewMeasurements++; return { top: index * 300 - inner.scrollTop, height: 30 }; } }));
  const shownRoot = { ...root, ownerDocument: foreign, querySelectorAll: () => shownNodes };
  const iframe = { contentDocument: foreign, hasAttribute: () => false };
  const shadow = { nodeType: 11, host: {}, querySelector: selector => selector.includes('dark') && container.dataset.previewMode === 'dark' ? iframe : null };
  if (shadowFrame) { container.dataset.previewMode = 'dark'; root.getRootNode = () => shadow; }
  const textarea = { closest: () => viewport };
  const previousMutation = globalThis.MutationObserver, previousResize = globalThis.ResizeObserver;
  globalThis.MutationObserver = MutationObserver; globalThis.ResizeObserver = ResizeObserver;
  const dispose = connectPreviewScrollSync({ textarea, container, getRoot: () => root, getSource: () => { sourceReads++; return currentSource; }, getRenderedSource: () => renderedSource, onSample: value => samples.push(value) });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const flushAll = () => { for (let attempts = 0; frames.size && attempts < 100; attempts++) flush(); assert.equal(frames.size, 0); };
  return { viewport, container, inner, shadow, listeners, observers, resizeObservers, frames, samples, flush, flushAll, sourceReads: () => sourceReads,
    setSource(value) { currentSource = value; observers[0].callback(); },
    counts: () => [sourceMeasurements, previewMeasurements], dispose() { dispose(); globalThis.MutationObserver = previousMutation; globalThis.ResizeObserver = previousResize; } };
}

test('rapid scroll events coalesce; warm jobs do not remeasure text/preview; cleanup removes every listener and observer', () => {
  const f = fixture();
  try {
    f.flush(); const initial = f.counts(); assert.equal(f.samples.at(-1).rebuilt, true);
    assert.deepEqual(f.listeners.get('scroll').options, { passive: true });
    f.viewport.scrollTop = 205;
    for (let i = 0; i < 100; i++) f.listeners.get('scroll').callback();
    assert.equal(f.frames.size, 1); f.flush();
    assert.equal(f.container.scrollTop, 300); assert.deepEqual(f.counts(), initial);
    assert.equal(f.samples.at(-1).rebuilt, false);
  } finally { f.dispose(); }
  assert.equal(f.frames.size, 0); assert.equal(f.listeners.size, 0);
  assert.ok(f.observers.every(observer => !observer.targets.length));
  assert.ok(f.resizeObservers.every(observer => !observer.targets.length));
});

test('frozen source inserts/deletes project only unchanged nodes; edited gaps use the nearest anchor', () => {
  const f = fixture();
  try {
    f.flushAll();
    f.setSource('new\na\nb\nc'); f.flushAll();
    f.viewport.scrollTop = 205; f.listeners.get('scroll').callback(); f.flushAll();
    assert.equal(f.container.scrollTop, 0, 'the inserted line cannot shift the old c anchor onto a');
    f.viewport.scrollTop = 405; f.listeners.get('scroll').callback(); f.flushAll();
    assert.equal(f.container.scrollTop, 300);
    f.setSource('a\nX\nY\nc'); f.flushAll();
    f.viewport.scrollTop = 200; f.listeners.get('scroll').callback(); f.flushAll();
    assert.equal(f.container.scrollTop, 300, 'the nearest valid following node wins in the changed gap');
    const reads = f.sourceReads(), measurements = f.counts();
    for (let i = 0; i < 30; i++) { f.viewport.scrollTop = i * 10; f.listeners.get('scroll').callback(); f.flushAll(); }
    assert.equal(f.sourceReads(), reads); assert.deepEqual(f.counts(), measurements);
    f.container.scrollTop = 123;
    f.setSource('no\nmatching\nlines'); f.flushAll();
    assert.equal(f.container.scrollTop, 123, 'no mapped node keeps the visible position');
    assert.equal(f.samples.at(-1).anchors, 0);
  } finally { f.dispose(); }
});

test('dark iframe inside a ShadowRoot drives its own scroller and rebinding preserves cache-only warm jobs', () => {
  const f = fixture({ shadowFrame: true });
  try {
    f.flushAll();
    assert.ok(f.observers[1].targets.includes(f.shadow), 'observe overlay insertion in the same shadow tree');
    f.viewport.scrollTop = 205; f.listeners.get('scroll').callback(); f.flushAll();
    assert.equal(f.inner.scrollTop, 300); assert.equal(f.container.scrollTop, 0);
    const measured = f.counts(), reads = f.sourceReads();
    for (let index = 0; index < 10; index++) { f.listeners.get('scroll').callback(); f.flushAll(); }
    assert.deepEqual(f.counts(), measured); assert.equal(f.sourceReads(), reads);
    f.container.dataset.previewMode = 'light'; f.observers[2].callback(); f.flushAll();
    assert.equal(f.container.scrollTop, 300);
    f.container.dataset.previewMode = 'dark'; f.observers[2].callback(); f.flushAll();
    assert.equal(f.inner.scrollTop, 300);
  } finally { f.dispose(); }
  assert.ok(f.observers.every(observer => !observer.targets.length));
});
