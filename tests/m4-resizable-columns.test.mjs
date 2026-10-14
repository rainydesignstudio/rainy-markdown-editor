import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as sizing from '../src/lib/editorLayout.ts';

const source = await readFile(new URL('../src/hooks/useResizableColumns.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function pointerTarget() {
  let pointerId = null;
  return { releases: [], setPointerCapture(id) { pointerId = id; }, hasPointerCapture(id) { return pointerId === id; }, releasePointerCapture(id) { assert.equal(pointerId, id); pointerId = null; this.releases.push(id); }, captured() { return pointerId; } };
}

function columns() {
  let cursor = 0, layout, width = 1200, desktop = true, identity = 'first';
  const cells = [], effects = [], observers = [], listeners = new Map();
  const addListener = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
  const removeListener = (name, fn) => { listeners.get(name)?.delete(fn); if (!listeners.get(name)?.size) listeners.delete(name); };
  const document = { visibilityState: 'visible', addEventListener: addListener, removeEventListener: removeListener };
  const element = { getBoundingClientRect: () => ({ left: 100, width }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    ResizeObserver: class { constructor(update) { this.update = update; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    window: { matchMedia: () => ({ matches: desktop }), addEventListener: addListener, removeEventListener: removeListener }, document,
    require(id) {
      if (id.endsWith('/editorLayout')) return sizing;
      if (id === 'react') return {
        useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
        useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
        useEffect(effect, deps) { const index = cursor++, old = cells[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) { effects.push(() => { old?.cleanup?.(); cells[index] = { cleanup: effect(), deps }; }); } },
      };
      throw new Error(id);
    },
  });
  const render = () => { cursor = 0; layout = module.exports.useResizableColumns(100 / 3, '(width >= 48rem)', identity); layout.containerRef.current = element; while (effects.length) effects.shift()(); };
  render(); render();
  return { render, identity(next) { identity = next; render(); render(); }, get layout() { return layout; }, resize(nextWidth, nextDesktop = true) { width = nextWidth; desktop = nextDesktop; observers.at(-1).update(); render(); }, dispatch(name) { for (const fn of listeners.get(name) ?? []) fn(); }, hide() { document.visibilityState = 'hidden'; this.dispatch('visibilitychange'); }, unmount() { cells.forEach(cell => cell?.cleanup?.()); }, listeners, observers };
}

test('shared splitter captures drag, clamps both panes and supports the same keyboard boundaries', () => {
  const view = columns();
  assert.equal(view.layout.wideEnough, true);
  const target = pointerTarget();
  view.layout.startDrag({ button: 0, pointerId: 5, currentTarget: target }); view.render();
  assert.equal(target.captured(), 5); assert.equal(view.layout.dragging, true);
  view.layout.moveDrag({ buttons: 1, clientX: 5000 }); view.render();
  assert.ok(Math.abs(sizing.getEditorSourceWidth(1200, view.layout.ratio) - 828) < 0.001);
  view.layout.stopDrag(); view.render();
  assert.equal(view.layout.dragging, false); assert.deepEqual(target.releases, [5]);
  let prevented = false;
  view.layout.keyResize({ key: 'Home', preventDefault() { prevented = true; } }); view.render();
  assert.equal(prevented, true); assert.equal(sizing.getEditorSourceWidth(1200, view.layout.ratio), 360);
  view.layout.keyResize({ key: 'ArrowRight', preventDefault() {} }); view.render();
  assert.ok(sizing.getEditorSourceWidth(1200, view.layout.ratio) > 360);
  view.layout.keyResize({ key: 'End', preventDefault() {} }); view.render();
  assert.ok(Math.abs(sizing.getEditorSourceWidth(1200, view.layout.ratio) - 828) < 0.001);
  view.unmount();
});

test('narrowing or leaving the desktop breakpoint stops dragging and releases resize observers', () => {
  const view = columns();
  view.layout.startDrag({ button: 0, pointerId: 1, currentTarget: pointerTarget() }); view.render();
  view.resize(620);
  assert.equal(view.layout.wideEnough, false); assert.equal(view.layout.dragging, false);
  const ratio = view.layout.ratio;
  view.layout.moveDrag({ buttons: 1, clientX: 150 }); view.render();
  assert.equal(view.layout.ratio, ratio, 'late pointer move must not resize the stacked panes');
  view.resize(1200, false); assert.equal(view.layout.wideEnough, false);
  view.resize(1200, true); assert.equal(view.layout.wideEnough, true);
  view.unmount(); assert.equal(view.observers[0].disconnected, true); assert.equal(view.listeners.size, 0);
});

test('releasing outside the splitter or leaving the window restores preview interaction', () => {
  const view = columns();
  const capture = pointerTarget();
  view.layout.startDrag({ button: 0, pointerId: 1, currentTarget: capture }); view.render();
  assert.equal(view.layout.dragging, true);
  view.dispatch('pointerup'); view.render();
  assert.equal(view.layout.dragging, false);
  view.layout.startDrag({ button: 0, pointerId: 2, currentTarget: capture }); view.render();
  view.dispatch('blur'); view.render();
  assert.equal(view.layout.dragging, false);
  view.layout.startDrag({ button: 0, pointerId: 3, currentTarget: capture }); view.render();
  view.hide(); view.render();
  assert.equal(view.layout.dragging, false);
  view.unmount();
  assert.equal(view.listeners.size, 0);
});

test('changing a split-view identity while dragging clears drag and releases capture', () => {
  const view = columns();
  view.layout.startDrag({ button: 0, pointerId: 7, currentTarget: pointerTarget() }); view.render();
  assert.equal(view.layout.dragging, true);
  view.identity('second');
  assert.equal(view.layout.dragging, false);
  view.dispatch('pointerup'); view.render(); assert.equal(view.layout.dragging, false);
  const ratio = view.layout.ratio; view.layout.moveDrag({ buttons: 1, clientX: 5000 }); view.render();
  assert.equal(view.layout.ratio, ratio); view.unmount();
});

test('every external drag exit releases the actual pointer, and inactive pointers cannot start a drag', () => {
  for (const exit of [view => view.dispatch('pointerup'), view => view.dispatch('pointercancel'), view => view.dispatch('blur'), view => view.hide(), view => view.resize(620), view => view.identity('next'), view => view.unmount()]) {
    const view = columns(), target = pointerTarget();
    view.layout.startDrag({ button: 1, pointerId: 1, currentTarget: target }); view.render();
    assert.equal(target.captured(), null);
    view.layout.startDrag({ button: 0, isPrimary: false, pointerId: 2, currentTarget: target }); view.render();
    assert.equal(target.captured(), null);
    view.layout.startDrag({ button: 0, pointerId: 3, currentTarget: target }); view.render();
    exit(view); view.render();
    assert.equal(target.captured(), null); assert.deepEqual(target.releases, [3]);
    view.unmount();
  }
});
