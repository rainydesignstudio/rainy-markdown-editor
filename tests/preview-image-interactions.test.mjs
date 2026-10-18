import assert from 'node:assert/strict';
import test from 'node:test';
import { bindPreviewImages, restorePreviewImageAttributes } from '../src/lib/article-format/previewImages.ts';

function fixture() {
  const attrs = new Map([['data-local-asset-src', 'media/image/cover%20one.png']]);
  let focused = 0, current = true;
  const opened = [], listeners = new Map();
  const image = { nodeType: 1, complete: true, naturalWidth: 800, currentSrc: 'blob:already-loaded-image', alt: 'Cover', isConnected: true,
    closest: selector => selector === 'img' ? image : null, focus: () => focused++,
    getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) };
  const root = { contains: item => item === image, querySelectorAll: () => [image],
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const stop = bindPreviewImages(root, value => opened.push(value), () => current);
  const event = (type = 'click', rest = {}) => {
    let prevented = false;
    listeners.get(type)?.({ type, target: image, preventDefault: () => prevented = true, stopPropagation() {}, ...rest });
    return prevented;
  };
  return { image, attrs, opened, listeners, stop, event, get focused() { return focused; }, expire: () => current = false };
}

test('loaded canonical and cloned iframe images use the same preview path without React image handlers', () => {
  const view = fixture();
  assert.equal(view.attrs.get('role'), 'button'); assert.equal(view.attrs.get('tabindex'), '0');
  assert.equal(view.event(), true);
  assert.equal(view.opened[0].src, 'blob:already-loaded-image');
  assert.equal(view.opened[0].fileName, 'cover one.png');
  view.opened[0].focus(); assert.equal(view.focused, 1);
  const copied = new Map(view.attrs);
  restorePreviewImageAttributes(view.image, { removeAttribute: key => copied.delete(key), setAttribute: (key, value) => copied.set(key, value) });
  assert.equal(copied.has('role'), false); assert.equal(copied.has('tabindex'), false); assert.equal(copied.has('aria-haspopup'), false);
  view.stop(); assert.equal(view.attrs.has('role'), false); assert.equal(view.listeners.size, 0);
});

test('preview image keyboard activation excludes unrelated shortcuts, unloaded images and expired sessions', () => {
  const view = fixture();
  assert.equal(view.event('keydown', { key: 'Enter' }), true);
  assert.equal(view.event('keydown', { key: ' ' }), true);
  for (const rest of [{ key: 'Tab' }, { key: 'Enter', ctrlKey: true }]) assert.equal(view.event('keydown', rest), false);
  view.image.naturalWidth = 0; assert.equal(view.event(), false);
  view.image.naturalWidth = 800; view.expire(); assert.equal(view.event(), false);
  assert.equal(view.opened.length, 2); view.stop();
});

test('cleanup retains an authored accessibility change rather than overwriting it', () => {
  const view = fixture(); view.attrs.set('role', 'presentation'); view.stop();
  assert.equal(view.attrs.get('role'), 'presentation');
});
