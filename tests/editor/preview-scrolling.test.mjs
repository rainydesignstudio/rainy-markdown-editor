import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardPreviewWheel } from '../../src/lib/editor/previewScrolling.ts';
function fixture() {
  let top = 0;
  const scrolling = { clientHeight: 959, get scrollTop() { return top; }, set scrollTop(value) { top = Math.max(0, Math.min(5000, value)); } };
  const frame = { isConnected: true, contentDocument: { scrollingElement: scrolling, body: {}, defaultView: { getComputedStyle: () => ({ lineHeight: '24px' }) } } };
  const event = overrides => ({ target: {}, deltaY: 30, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() { this.prevented = true; }, ...overrides });
  return { frame, scrolling, event };
}
test('letterbox areas forward constant-cost wheel deltas without changing virtual viewport geometry', () => {
  const f = fixture(), event = f.event();
  assert.equal(forwardPreviewWheel(event, f.frame), true); assert.equal(f.scrolling.scrollTop, 30); assert.equal(event.prevented, true);
  assert.equal(f.scrolling.clientHeight, 959);
  forwardPreviewWheel(f.event({ deltaMode: 1, deltaY: 2 }), f.frame); assert.equal(f.scrolling.scrollTop, 78);
  forwardPreviewWheel(f.event({ deltaMode: 2, deltaY: 1 }), f.frame); assert.equal(f.scrolling.scrollTop, 1037);
});
test('native iframe input, zoom, horizontal intention, removed frames and scroll boundaries are not intercepted', () => {
  const f = fixture();
  for (const event of [f.event({ target: f.frame }), f.event({ ctrlKey: true }), f.event({ metaKey: true }), f.event({ shiftKey: true }), f.event({ deltaY: 0 }), f.event({ deltaY: -30 })]) {
    assert.equal(forwardPreviewWheel(event, f.frame), false); assert.notEqual(event.prevented, true);
  }
  f.frame.isConnected = false; assert.equal(forwardPreviewWheel(f.event(), f.frame), false); assert.equal(f.scrolling.scrollTop, 0);
});
