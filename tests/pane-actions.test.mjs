import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React, { act } from 'react';
import * as runtime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as inlineFormatting from '../src/lib/editor/inlineFormatting.ts';

test('pane actions cross 480px without remounting state, lose no focus and invoke original actions', async () => {
  const dom = new JSDOM('<section class="panel"><div id="root"></div></section>', { pretendToBeVisual: true });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let width = 481; const observers = [], cache = new Map();
  class ResizeObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} }
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 10, top: 10, right: width + 10, bottom: 50, width, height: 40 }; };
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden],.hidden') ? [] : [this.getBoundingClientRect()]; };
  const matches = dom.window.Element.prototype.matches;
  dom.window.Element.prototype.matches = function (selector) { return selector === ':popover-open' ? Boolean(this.openPopover) : matches.call(this, selector); };
  dom.window.HTMLElement.prototype.showPopover = function () { this.openPopover = true; this.style.display = 'grid'; };
  dom.window.HTMLElement.prototype.hidePopover = function () { this.openPopover = false; this.style.removeProperty('display'); };
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = await readFile(file, 'utf8'), dependencies = new Map();
    for (const [, name] of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
      dependencies.set(name, name === 'react' ? React : name === 'react-dom' ? ReactDOM : name.endsWith('/UILocaleProvider') ? { useUITranslation: () => ({ t: key => key }) } : name.endsWith('/inlineFormatting') ? inlineFormatting : await load(path.resolve(path.dirname(file), name + '.tsx')));
    }
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, require: name => name === 'react/jsx-runtime' ? runtime : dependencies.get(name), window, document, Element, HTMLElement, Node, ResizeObserver, queueMicrotask });
    cache.set(file, module.exports); return module.exports;
  }
  const { PaneActions } = await load(path.resolve('src/components/editor/PaneActions.tsx'));
  const { IconButton } = await load(path.resolve('src/components/global/IconButton.tsx'));
  const { InsertElementsMenu } = await load(path.resolve('src/components/editor/InsertElementsMenu.tsx'));
  let mounts = 0, calls = 0, images = 0;
  function Action() { React.useEffect(() => { mounts++; }, []); return React.createElement(IconButton, { icon: React.createElement('svg'), tooltip: 'Original action', onClick: () => calls++ }); }
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PaneActions, { label: 'Source actions' }, React.createElement(Action), React.createElement(InsertElementsMenu, { disabled: false, readOnly: false, onChooseImage() {}, onOpenMediaPicker() { images++; }, onOpenSnippetPicker() {}, onInsert() {}, onFormat() {} }))));
    const action = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Original action') || button.getAttribute('aria-label') === 'Original action');
    await act(async () => action().focus());
    await act(async () => { width = 480; observers[0].callback(); });
    assert.equal(document.querySelector('[data-pane-actions]').dataset.compact, 'true');
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Source actions');
    await act(async () => document.activeElement.click());
    assert.equal(document.activeElement.getAttribute('role'), 'menuitem');
    await act(async () => action().click()); assert.equal(calls, 1);
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Source actions');
    await act(async () => { width = 481; observers[0].callback(); });
    assert.equal(document.querySelector('[data-pane-actions]').dataset.compact, 'false');
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Original action');
    await act(async () => action().click()); assert.equal(calls, 2); assert.equal(mounts, 1);
    await act(async () => { width = 480; observers[0].callback(); });
    const toolbarTrigger = () => document.querySelector('button[aria-label="Source actions"]');
    await act(async () => toolbarTrigger().click());
    const insertTrigger = () => document.querySelector('button[aria-label="editor:insert.label"]');
    await act(async () => insertTrigger().click());
    assert.equal(toolbarTrigger().getAttribute('aria-expanded'), 'false', 'the folded menu closes before insertion choices are displayed');
    const popup = () => document.querySelector('[role="menu"][aria-label="editor:insert.label"]');
    assert.ok(popup()); assert.equal(popup().parentElement, document.body, 'insertion choices are a separate popup');
    const compactContents = popup().textContent;
    await act(async () => popup().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(popup(), null); assert.equal(document.activeElement, toolbarTrigger(), 'Escape returns to the visible folded-menu trigger');
    await act(async () => { width = 481; observers[0].callback(); });
    await act(async () => insertTrigger().click());
    assert.equal(popup().textContent, compactContents, 'wide and compact presentations share the same insert choices');
    const imageAction = [...popup().querySelectorAll('button')].find(button => button.textContent === 'editor:insert.fromLibrary');
    await act(async () => imageAction.click()); assert.equal(images, 1); assert.equal(popup(), null);
    assert.equal(mounts, 1);

  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
