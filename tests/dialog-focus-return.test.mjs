import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function fixture() {
  const source = await readFile(new URL('../src/hooks/useDialogFocus.ts', import.meta.url), 'utf8');
  const document = { activeElement: null }, listeners = new Set(), frames = new Map();
  let current, frameId = 0;
  class Element {
    isConnected = true;
    constructor(name) { this.name = name; this.children = []; }
    focus() { document.activeElement = this; }
    contains(element) { return element === this || this.children.includes(element); }
    getAttribute() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return this.children; }
  }
  const react = {
    useRef(value) { const i = current.cursor++; return current.refs[i] ??= { current: value }; },
    useEffect(effect, dependencies) {
      const i = current.cursor++, previous = current.effects[i];
      if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
      previous?.cleanup?.();
      current.effects[i] = { dependencies, cleanup: effect() };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, require: () => react, document, HTMLElement: Element,
    window: {
      requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame(id) { frames.delete(id); },
      addEventListener(_name, callback) { listeners.add(callback); },
      removeEventListener(_name, callback) { listeners.delete(callback); },
    },
  });
  const instance = dialog => {
    const state = { cursor: 0, refs: [], effects: [] }, ref = { current: dialog };
    return {
      render(active) { current = state; state.cursor = 0; module.exports.useDialogFocus(ref, () => {}, active); },
      unmount() { state.effects.forEach(effect => effect?.cleanup?.()); },
    };
  };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  const opener = new Element('page opener'), parent = new Element('parent'), swatch = new Element('color swatch'), parentClose = new Element('parent close');
  parent.children = [parentClose, swatch];
  const child = new Element('child'), childClose = new Element('child close'), childCancel = new Element('child cancel');
  child.children = [childClose, childCancel];
  opener.focus();
  return { document, listeners, flush, opener, parent, swatch, child, childClose, childCancel, parentHook: instance(parent), childHook: instance(child) };
}

test('suspending a parent preserves the child opener and returns focus after the child closes', async () => {
  const f = await fixture();
  f.parentHook.render(true); f.flush(); f.swatch.focus();
  f.parentHook.render(false);
  assert.equal(f.document.activeElement, f.swatch);
  f.childHook.render(true); f.flush();
  assert.equal(f.document.activeElement, f.childClose);
  assert.equal(f.listeners.size, 1);
  for (const callback of f.listeners) callback({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(f.document.activeElement, f.childCancel);
  f.child.isConnected = false; f.childHook.unmount();
  f.parentHook.render(true); f.flush();
  assert.equal(f.document.activeElement, f.swatch);
  f.parent.isConnected = false; f.parentHook.unmount();
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.listeners.size, 0);
});

test('closing a child and suspended parent together returns to the page opener', async () => {
  const f = await fixture();
  f.parentHook.render(true); f.flush(); f.swatch.focus();
  f.parentHook.render(false); f.childHook.render(true); f.flush();
  f.parent.isConnected = false; f.swatch.isConnected = false; f.child.isConnected = false;
  f.parentHook.unmount(); f.childHook.unmount();
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.listeners.size, 0);
});
