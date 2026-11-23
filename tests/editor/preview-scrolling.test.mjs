import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPreviewDocumentWheel, forwardPreviewWheel } from '../../src/lib/editor/previewScrolling.ts';
function fixture() {
  let top = 0;
  const scrolling = {
    clientHeight: 959,
    get scrollTop() { return top; },
    scrollTo({ top: value, behavior }) {
      assert.equal(behavior, 'instant');
      top = Math.max(0, Math.min(5000, value));
    },
  };
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

test('packaged iframe root wheel scrolls even when native scrolling does not run', () => {
  const f = fixture();
  const doc = f.frame.contentDocument;
  let wheel;
  doc.addEventListener = (type, listener, options) => {
    assert.equal(type, 'wheel');
    assert.deepEqual(options, { passive: false });
    wheel = listener;
  };
  doc.removeEventListener = (type, listener) => {
    assert.equal(type, 'wheel');
    assert.equal(listener, wheel);
    wheel = undefined;
  };
  doc.defaultView.getComputedStyle = element => ({ lineHeight: '24px', overflowY: element.overflowY });
  const stop = bindPreviewDocumentWheel(f.frame);

  const nested = { nodeType: 1, clientHeight: 60, scrollHeight: 90, overflowY: 'auto' };
  const event = overrides => f.event({ cancelable: true, deltaX: 0, ...overrides });
  for (const native of [
    event({ target: nested }),
    event({ ctrlKey: true }),
    event({ deltaX: 40 }),
    event({ cancelable: false }),
    event({ defaultPrevented: true }),
    event({ deltaY: -30 }),
  ]) {
    wheel(native);
    assert.equal(f.scrolling.scrollTop, 0);
    assert.notEqual(native.prevented, true);
  }

  const clipped = { ...nested, overflowY: 'hidden' };
  const down = event({ target: clipped, deltaMode: 1, deltaY: 2 });
  wheel(down);
  assert.equal(f.scrolling.scrollTop, 48);
  assert.equal(down.prevented, true);
  const up = event({ target: clipped, deltaY: -30 });
  wheel(up);
  assert.equal(f.scrolling.scrollTop, 18);
  assert.equal(up.prevented, true);
  stop();
  assert.equal(wheel, undefined);
});
