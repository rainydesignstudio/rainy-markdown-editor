import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { imageFitScale, imageWheelScale, useImageZoom } from '../../src/hooks/useImageZoom.ts';

test('article view fits width without shrinking a long image to the viewport height or enlarging small images', () => {
  assert.equal(imageFitScale(1000, 4000, { width: 500, height: 300 }, 'width'), 0.5);
  assert.equal(imageFitScale(1000, 4000, { width: 500, height: 300 }, 'contain'), 0.075);
  assert.equal(imageFitScale(32, 16, { width: 500, height: 300 }, 'width'), 1);
  assert.equal(imageWheelScale(8, -100, 0, 300), 8);
  assert.equal(imageWheelScale(0.01, 100, 0, 300), 0.01);
  assert.ok(imageWheelScale(1, -3, 1, 300) > 1);
  assert.ok(imageWheelScale(1, 1, 2, 300) < 1);
});

test('ordinary wheel remains scrolling, modified wheel zooms cumulatively, reset and image changes restore defaults', async () => {
  const dom = new JSDOM('<div id="test"></div>');
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback([{ contentRect: { width: 500, height: 300 } }]); } disconnect() {} } });
  dom.window.HTMLElement.prototype.scrollTo = function (left, top) { this.scrollLeft = left; this.scrollTop = top; };
  let model;
  function Viewer({ identity }) { model = useImageZoom('width', identity); return React.createElement('div', { ref: model.viewportRef }, React.createElement('img', { style: model.imageStyle })); }
  const root = createRoot(document.getElementById('test'));
  try {
    await act(async () => root.render(React.createElement(Viewer, { identity: 'first' })));
    await act(async () => model.onDimensions(1000, 4000));
    assert.equal(model.scale, 0.5);
    const plain = new dom.window.WheelEvent('wheel', { deltaY: -100, cancelable: true });
    await act(async () => model.viewportRef.current.dispatchEvent(plain));
    assert.equal(plain.defaultPrevented, false); assert.equal(model.scale, 0.5);
    await act(async () => {
      for (let i = 0; i < 3; i++) {
        const wheel = new dom.window.WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true });
        model.viewportRef.current.dispatchEvent(wheel); assert.equal(wheel.defaultPrevented, true);
      }
    });
    assert.ok(model.scale > 1, 'burst wheel events must accumulate before React paints');
    await act(async () => model.zoomTo(null)); assert.equal(model.scale, 0.5);
    await act(async () => model.zoomTo(1)); assert.equal(model.scale, 1);
    await act(async () => root.render(React.createElement(Viewer, { identity: 'second' })));
    assert.equal(model.dimensions.width, 0);
    await act(async () => model.onDimensions(32, 16)); assert.equal(model.scale, 1);
  } finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous); }
});
