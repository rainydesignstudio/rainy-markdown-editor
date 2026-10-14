import assert from 'node:assert/strict';
import test from 'node:test';
import { findScrollAnchor, sourceLineOffsets, connectPreviewScrollSync } from '../src/lib/previewScrollSync.ts';

test('block selection follows wrapped source heights and blank/code lines without proportional guessing', () => {
  const anchors = [{ line: 1, sourceTop: 16, previewTop: 28 }, { line: 5, sourceTop: 160, previewTop: 60 }, { line: 12, sourceTop: 220, previewTop: 400 }];
  assert.equal(findScrollAnchor([], 100), null);
  assert.equal(findScrollAnchor(anchors, 0).line, 1);
  assert.equal(findScrollAnchor(anchors, 150).line, 1);
  assert.equal(findScrollAnchor(anchors, 180).line, 5);
  assert.equal(findScrollAnchor(anchors, 999).line, 12);
  assert.deepEqual(sourceLineOffsets('甲\r\n😀\n乙\r末'), [0, 3, 6, 8]);
});

function fixture() {
  const observers = [], resizeObservers = [], frames = new Map(), listeners = new Map(), samples = [];
  let nextFrame = 0, clock = 0, sourceMeasurements = 0, previewMeasurements = 0;
  class MutationObserver { constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); } observe(target) { this.targets.push(target); } disconnect() { this.targets = []; } }
  class ResizeObserver { constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); } observe(target) { this.targets.push(target); } unobserve(target) { this.targets = this.targets.filter(x => x !== target); } disconnect() { this.targets = []; } }
  const view = { performance: { now: () => clock++ }, requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); }, clearTimeout() {}, setTimeout(fn) { fn(); return 1; }, getComputedStyle: () => ({ display: 'block' }) };
  const doc = { defaultView: view, head: {}, fonts: { addEventListener() {}, removeEventListener() {} }, createTreeWalker() { let index = 0; return { nextNode: () => [{ length: 5, parentElement: { closest: () => null } }][index++] ?? null }; }, createRange() { let offset; return { setStart(_node, value) { offset = value; }, collapse() {}, getBoundingClientRect() { sourceMeasurements++; return { top: 10 + offset * 50 - viewport.scrollTop, height: 20 }; } }; } };
  const layer = { ownerDocument: doc };
  const viewport = { ownerDocument: doc, scrollTop: 0, clientTop: 0, querySelector: () => layer, getBoundingClientRect: () => ({ top: 10 }), addEventListener(name, callback, options) { listeners.set(name, { callback, options }); }, removeEventListener(name) { listeners.delete(name); } };
  const element = (line, top) => ({ tagName: 'P', ownerDocument: doc, getAttribute: () => String(line), closest: () => null, getBoundingClientRect() { previewMeasurements++; return { top: top - container.scrollTop, height: 30 }; } });
  const nodes = [element(1, 0), element(3, 300)];
  const root = { isConnected: true, tagName: 'ARTICLE', ownerDocument: doc, id: '', getAttribute: () => null, querySelectorAll: () => nodes };
  const container = { dataset: { previewMode: 'light' }, ownerDocument: doc, clientTop: 0, clientHeight: 200, scrollHeight: 1000, scrollTop: 0, querySelector: () => null, getBoundingClientRect: () => ({ top: 0 }), addEventListener() {}, removeEventListener() {} };
  const textarea = { closest: () => viewport };
  const previousMutation = globalThis.MutationObserver, previousResize = globalThis.ResizeObserver;
  globalThis.MutationObserver = MutationObserver; globalThis.ResizeObserver = ResizeObserver;
  const dispose = connectPreviewScrollSync({ textarea, container, getRoot: () => root, getSource: () => 'a\nb\nc', onSample: value => samples.push(value) });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  return { viewport, container, listeners, observers, resizeObservers, frames, samples, flush, counts: () => [sourceMeasurements, previewMeasurements], dispose() { dispose(); globalThis.MutationObserver = previousMutation; globalThis.ResizeObserver = previousResize; } };
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
