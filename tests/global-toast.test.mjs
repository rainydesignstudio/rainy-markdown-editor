import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as reactDOM from 'react-dom';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';

async function fixture({ native = true, strict = false } = {}) {
  const dom = new JSDOM('<header class="workspace-toolbar"></header><div id="root"></div>', { pretendToBeVisual: true });
  const { window } = dom, document = window.document, timers = new Map(), resizeCallbacks = new Set();
  let now = 0, sequence = 0, height = 72, locale = 'zh-CN', notify, childRenders = 0;
  const i18n = createUII18n('zh-CN');
  const originals = new Map();
  for (const [key, value] of Object.entries({ window, document, HTMLElement: window.HTMLElement, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  window.setTimeout = (callback, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = callback => { queueMicrotask(() => callback(now)); return 1; };
  window.cancelAnimationFrame = () => {};
  const header = document.querySelector('header'); header.getBoundingClientRect = () => ({ bottom: height });
  const matches = window.HTMLElement.prototype.matches;
  window.HTMLElement.prototype.matches = function (selector) { return selector === ':popover-open' ? Boolean(this.openPopover) : matches.call(this, selector); };
  if (native) {
    window.HTMLElement.prototype.showPopover = function () { this.openPopover = true; this.style.display = 'grid'; };
    window.HTMLElement.prototype.hidePopover = function () { this.openPopover = false; this.style.removeProperty('display'); };
  }
  class ResizeObserver { constructor(callback) { this.callback = callback; resizeCallbacks.add(callback); } observe() {} disconnect() { resizeCallbacks.delete(this.callback); } }
  class ClockDate extends Date { static now() { return now; } }
  const cache = new Map();
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = await readFile(file, 'utf8'), imports = new Map();
    for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
      const id = match[1];
      if (!id.startsWith('.') || id.endsWith('/UILocaleProvider') || id.endsWith('/i18n/productMessages')) continue;
      const target = path.resolve(path.dirname(file), id);
      let imported; for (const extension of ['.tsx', '.ts']) { try { imported = await load(target + extension); break; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      if (!imported) throw new Error('Missing test module: ' + id);
      imports.set(id, imported);
    }
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, window, document, Date: ClockDate, HTMLElement: window.HTMLElement, Element: window.Element, MutationObserver: window.MutationObserver, ResizeObserver,
      require(id) {
        if (id === 'react') return React;
        if (id === 'react/jsx-runtime') return jsxRuntime;
        if (id === 'react-dom') return reactDOM;
        if (id.endsWith('/UILocaleProvider')) return { useUITranslation: namespace => ({ t: i18n.getFixedT(locale, namespace) }) };
        if (id.endsWith('/i18n/productMessages')) return messages;
        if (imports.has(id)) return imports.get(id);
        throw new Error('Unexpected import ' + id);
      },
    }); cache.set(file, module.exports); return module.exports;
  }
  const { ToastProvider, useToast } = await load(path.resolve('src/components/global/Toast.tsx'));
  const { useDialogFocus } = await load(path.resolve('src/hooks/useDialogFocus.ts'));
  function Probe() { notify = useToast(); childRenders++; return null; }
  const root = createRoot(document.getElementById('root'));
  async function render(children = null) { const app = React.createElement(ToastProvider, null, React.createElement(Probe), children); await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, app) : app)); }
  await render();
  return {
    window, document, timers, useDialogFocus, render,
    get childRenders() { return childRenders; },
    get cards() { return [...document.querySelectorAll('[data-toast-id]')]; },
    get viewport() { return document.querySelector('[data-toast-viewport]'); },
    async send(key, label, tone = 'success') { await React.act(async () => notify({ key, label, tone })); },
    async advance(ms) {
      const end = now + ms;
      while (true) { const pending = [...timers].filter(([, timer]) => timer.at <= end).sort((left, right) => left[1].at - right[1].at)[0]; if (!pending) break; now = pending[1].at; timers.delete(pending[0]); await React.act(async () => pending[1].callback()); }
      now = end;
    },
    async language(value) { locale = value; await render(); },
    async resize(value) { height = value; await React.act(async () => { for (const callback of resizeCallbacks) callback(); }); },
    async close() { await React.act(async () => root.unmount()); assert.equal(timers.size, 0); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; dom.window.close(); },
  };
}

test('success expires after three seconds without rerendering editor consumers; replacing an operation cancels its old deadline', async () => {
  const f = await fixture({ strict: true });
  try {
    const renders = f.childRenders;
    await f.send('folder', messages.productText('articleFolder.renamed'));
    assert.equal(f.cards[0].querySelector('p').textContent, '目录已修改');
    assert.equal(f.viewport.getAttribute('popover'), 'manual'); assert.equal(f.viewport.openPopover, true);
    await f.advance(2000); await f.send('folder', 'Latest success'); assert.equal(f.cards.length, 1);
    await f.advance(1000); assert.equal(f.cards[0].querySelector('p').textContent, 'Latest success');
    await f.advance(1999); assert.equal(f.cards.length, 1);
    await f.advance(1); assert.equal(f.cards.length, 0); assert.equal(f.viewport.hidden, true);
    assert.equal(f.childRenders, renders);
  } finally { await f.close(); }
});

test('warnings and errors stay until dismissed, preserve detailed messages, and the queue holds at most two distinct operations', async () => {
  const f = await fixture();
  try {
    await f.send('first', 'First warning', 'warning'); await f.send('second', 'Second warning', 'warning');
    await f.send('third', messages.productText('articleFolder.exists', { name: 'User name' }), 'error');
    assert.equal(f.cards.length, 2); assert.equal(f.cards[0].querySelector('p').textContent, 'Second warning');
    assert.match(f.cards[1].textContent, /User name/); await f.advance(60000); assert.equal(f.cards.length, 2);
    await React.act(async () => f.cards[1].querySelector('button').click()); assert.equal(f.cards.length, 1);
    assert.equal(f.cards[0].dataset.tone, 'warning');
  } finally { await f.close(); }
});

test('language changes translate retained feedback and dismiss controls without restarting expiry; geometry follows the toolbar', async () => {
  const f = await fixture();
  try {
    await f.send('folder', messages.productText('articleFolder.renamed')); await f.advance(1000);
    await f.language('en-US'); assert.equal(f.cards[0].querySelector('p').textContent, 'Folder updated');
    assert.equal(f.cards[0].querySelector('button').getAttribute('aria-label'), 'Dismiss notification');
    assert.equal(f.viewport.style.top, '72px'); await f.resize(96); assert.equal(f.viewport.style.top, '96px');
    assert.equal(f.viewport.style.maxHeight, `${f.window.innerHeight - 120}px`);
    await f.advance(2000); assert.equal(f.cards.length, 0);
  } finally { await f.close(); }
});

test('feedback follows the active nested dialog, keeps input focus, participates in Tab wrapping and preserves Escape/return focus', async () => {
  const f = await fixture();
  function Child({ onClose }) {
    const child = React.useRef(null); f.useDialogFocus(child, onClose);
    return React.createElement('section', { id: 'child', ref: child, role: 'alertdialog', 'aria-modal': 'true' }, React.createElement('input', { id: 'child-input' }));
  }
  function Dialogs() {
    const [nested, setNested] = React.useState(false);
    const parent = React.useRef(null);
    f.useDialogFocus(parent, () => {}, !nested);
    return React.createElement('section', { id: 'parent', ref: parent, role: 'dialog', 'aria-modal': !nested ? 'true' : undefined },
      React.createElement('input', { id: 'folder-name' }), React.createElement('button', { id: 'open-child', onClick: () => setNested(true) }, 'Open child'),
      nested ? React.createElement(Child, { onClose: () => setNested(false) }) : null);
  }
  try {
    await f.render(React.createElement(Dialogs)); const field = f.document.getElementById('folder-name'); field.focus();
    await f.send('folder', 'Invalid name', 'error'); assert.ok(f.document.activeElement === field, 'showing feedback preserves input focus');
    assert.equal(f.viewport.closest('[role="dialog"]').id, 'parent');
    const close = f.cards[0].querySelector('button'); await React.act(async () => close.focus());
    assert.ok(f.document.activeElement === close, 'toast dismissal can receive keyboard focus');
    const focusable = [...f.document.getElementById('parent').querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    assert.ok(focusable.at(-1) === close, 'toast dismissal is the last dialog control');
    const tab = new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); await React.act(async () => f.window.dispatchEvent(tab));
    assert.ok(f.document.activeElement === field, 'Tab wraps to the dialog input'); assert.equal(tab.defaultPrevented, true);
    await React.act(async () => { close.focus(); close.click(); }); assert.ok(f.document.activeElement === field, 'dismissal restores input focus');
    await f.send('folder', 'Updated'); await React.act(async () => f.cards[0].querySelector('button').focus());
    await f.advance(3000); assert.ok(f.document.activeElement === field, 'automatic dismissal restores input focus');
    const opener = f.document.getElementById('open-child'); opener.focus(); await React.act(async () => opener.click());
    await f.send('folder', 'Nested warning', 'warning'); assert.equal(f.viewport.closest('[role="alertdialog"]').id, 'child');
    await React.act(async () => f.cards[0].querySelector('button').focus());
    await React.act(async () => f.window.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(f.document.querySelector('#child'), null); assert.equal(f.viewport.closest('[role="dialog"]').id, 'parent');
    assert.ok(f.document.activeElement === opener, 'Escape returns to the child opener'); assert.equal(f.cards.length, 1);
  } finally { await f.close(); }
});

test('unmount clears pending timers and a browser without popover support retains the visible dismissible fallback', async () => {
  const f = await fixture({ native: false });
  try { await f.send('folder', 'Fallback success'); assert.equal(f.viewport.hasAttribute('popover'), false); assert.equal(f.viewport.hidden, false); assert.equal(f.timers.size, 1); }
  finally { await f.close(); }
});
