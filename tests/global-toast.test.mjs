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
import * as feedback from '../src/lib/i18n/feedback.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';

async function fixture({ native = true, strict = false, maxVisible = 3, initiallyReady = true, cssMotion = false, enterFrom = 'top', motionDurationMs = 240 } = {}) {
  const dom = new JSDOM('<header class="workspace-toolbar"></header><div id="root"></div>', { pretendToBeVisual: true });
  const { window } = dom, document = window.document, timers = new Map(), resizeCallbacks = new Set(), animations = [];
  let now = 0, sequence = 0, height = 72, locale = 'zh-CN', notify, childRenders = 0;
  const i18n = createUII18n('zh-CN');
  const originals = new Map();
  for (const [key, value] of Object.entries({ window, document, HTMLElement: window.HTMLElement, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const motionStyle = document.createElement('style'); motionStyle.textContent = '.toast-surface { transition-duration: .5s; transition-timing-function: ease-in-out; }' + (cssMotion ? '.toast-surface { transition-property: width,height,translate,opacity; }' : ''); document.head.append(motionStyle);
  window.setTimeout = (callback, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = callback => { queueMicrotask(() => callback(now)); return 1; };
  window.cancelAnimationFrame = () => {};
  window.SVGElement.prototype.animate = function (frames, options) { const record = { element: this, frames, options, cancelled: false }; animations.push(record); return { cancel() { record.cancelled = true; } }; };
  window.HTMLElement.prototype.animate = window.SVGElement.prototype.animate;
  const header = document.querySelector('header'); header.getBoundingClientRect = () => ({ bottom: height });
  const bounds = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute('data-toast-anchor')) {
      const open = this.closest('[data-toast-id]').querySelector('[aria-expanded="true"]'), actions = this.dataset.toastAnchor === 'actions';
      const animation = animations.findLast(value => value.element === this && !value.cancelled);
      const offset = animation?.frames[0].translate.split(' ').map(parseFloat) ?? [0, 0], factor = animation?.offsetFactor ?? 1;
      return { left: (actions ? open ? 380 : 160 : 16) + offset[0] * factor, top: (open ? 60 : 14) + offset[1] * factor };
    }
    if (this.parentElement?.hasAttribute('data-toast-id')) { const open = this.querySelector('[aria-expanded="true"]'); return { left: 0, top: 0, width: open ? 440 : 220, height: open ? 140 : 48 }; }
    return bounds.call(this);
  };
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
      if (!id.startsWith('.') || id.endsWith('/UILocaleProvider') || (id.endsWith('/i18n/productMessages') || id.endsWith('/i18n/feedback'))) continue;
      const target = path.resolve(path.dirname(file), id);
      let imported; for (const extension of ['.tsx', '.ts']) { try { imported = await load(target + extension); break; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      if (!imported) throw new Error('Missing test module: ' + id);
      imports.set(id, imported);
    }
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, window, document, Date: ClockDate, Node: window.Node, queueMicrotask, requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame, HTMLElement: window.HTMLElement, Element: window.Element, MutationObserver: window.MutationObserver, ResizeObserver,
      require(id) {
        if (id === 'react') return React;
        if (id === 'react/jsx-runtime') return jsxRuntime;
        if (id === 'react-dom') return reactDOM;
        if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => ({ locale }), useUITranslation: namespace => ({ t: i18n.getFixedT(locale, namespace) }) };
        if (id.endsWith('/i18n/feedback')) return feedback;
        if (id.endsWith('/i18n/productMessages')) return messages;
        if (imports.has(id)) return imports.get(id);
        throw new Error('Unexpected import ' + id);
      },
    }); cache.set(file, module.exports); return module.exports;
  }
  const { ToastProvider, ToastReadiness, useToast } = await load(path.resolve('src/components/global/Toast.tsx'));
  const { useDialogFocus } = await load(path.resolve('src/hooks/useDialogFocus.ts'));
  function Probe() { notify = useToast(); childRenders++; return null; }
  const root = createRoot(document.getElementById('root'));
  let currentChildren = null, availability = initiallyReady;
  async function render(children = currentChildren) { currentChildren = children; const app = React.createElement(ToastProvider, { maxVisible, initiallyReady, enterFrom, motionDurationMs }, React.createElement(ToastReadiness, { ready: availability }), React.createElement(Probe), children); await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, app) : app)); }
  await render();
  return {
    window, document, timers, animations, useDialogFocus, render, load,
    async ready(value) { availability = value; await render(); },
    get childRenders() { return childRenders; },
    get cards() { return [...document.querySelectorAll('[data-toast-id]')]; },
    get viewport() { return document.querySelector('[data-toast-viewport]'); },
    async sendStructured(value) { await React.act(async () => notify(value)); },
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

test('three notifications remain visible and excess notifications wait without evicting older operations', async () => {
  const f = await fixture();
  try {
    await f.send('first', 'First warning', 'warning'); await f.send('second', 'Second warning', 'warning');
    await f.send('third', messages.productText('articleFolder.exists', { name: 'User name' }), 'error');
    await f.send('fourth', 'Queued warning', 'warning');
    assert.equal(f.cards.length, 3); assert.match(f.cards[0].textContent, /User name/);
    assert.equal(f.cards[2].querySelector('p').textContent, 'First warning');
    assert.ok(!f.cards.some(card => card.textContent.includes('Queued warning')));
    await f.advance(60000); assert.equal(f.cards.length, 3);
    await React.act(async () => f.cards[0].querySelector('button').click()); assert.equal(f.cards.length, 3);
    assert.equal(f.cards[0].querySelector('p').textContent, 'Queued warning');
    assert.equal(f.cards[2].querySelector('p').textContent, 'First warning');
  } finally { await f.close(); }
});

test('language changes translate retained feedback and dismiss controls without restarting expiry; placement is fixed independently of the toolbar', async () => {
  const f = await fixture();
  try {
    await f.send('folder', messages.productText('articleFolder.renamed')); await f.advance(1000);
    await f.language('en-US'); assert.equal(f.cards[0].querySelector('p').textContent, 'Folder updated');
    assert.equal(f.cards[0].querySelector('button').getAttribute('aria-label'), 'Dismiss notification');
    assert.equal(f.viewport.style.top, ''); assert.ok(f.viewport.classList.contains('top-12')); await f.resize(96); assert.equal(f.viewport.style.top, '');
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
    await f.advance(3000); assert.equal(f.cards.length, 1, 'focused success is protected from automatic dismissal');
    await React.act(async () => field.focus()); await f.advance(3000); assert.equal(f.cards.length, 0);
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


test('brief feedback preserves nested bilingual details and keyed replacement removes processing notices', async () => {
  const f = await fixture();
  try {
    const detail = messages.productMessage('library.theLibraryFormatConfigurationIsUnavailable', { cause: messages.productReference('libraryConfiguration.identity') });
    await f.sendStructured({ key: 'format', label: '', summary: messages.productReference('feedback.formatUnavailable'), details: detail, tone: 'error' });
    assert.equal(f.cards[0].querySelector('p').textContent, '格式配置不可用');
    await f.language('en-US');
    assert.equal(f.cards[0].querySelector('p').textContent, 'Format unavailable');
    assert.doesNotMatch(f.cards[0].textContent, /\p{Script=Han}/u);
    assert.equal(f.cards[0].querySelector('details'), null);
    const disclosure = f.cards[0].querySelector('[aria-controls]');
    assert.equal(disclosure.getAttribute('aria-expanded'), 'false');
    assert.equal(f.document.getElementById(disclosure.getAttribute('aria-controls')).getAttribute('aria-hidden'), 'true');
    await React.act(async () => disclosure.click());
    assert.equal(disclosure.getAttribute('aria-expanded'), 'true');
    assert.match(f.document.getElementById(disclosure.getAttribute('aria-controls')).textContent, /config.json/);
    await f.sendStructured({ key: 'format', dismiss: true }); assert.equal(f.cards.length, 0);
    await f.sendStructured({ key: 'refresh', label: '', summary: messages.productReference('feedback.assetsRefreshing'), tone: 'info' });
    await f.advance(10000); assert.equal(f.cards.length, 1);
    await f.sendStructured({ key: 'refresh', label: '', summary: messages.productReference('feedback.assetsRefreshed'), tone: 'success' });
    assert.equal(f.cards.length, 1); await f.advance(3000); assert.equal(f.cards.length, 0);
  } finally { await f.close(); }
});

test('operation diagnostics update while typing without repeating Toast until the next explicit action', async () => {
  const f = await fixture();
  const { OperationFeedback } = await f.load(path.resolve('src/components/global/OperationFeedback.tsx'));
  try {
    const render = (notice, revision) => f.render(React.createElement(OperationFeedback, { id:'editor', notice, revision, tone:'warning' }));
    await render(messages.productReference('feedback.modified'), 1);
    const first = f.cards[0].dataset.toastId;
    await render(messages.productReference('themeLibrary.savingFailed', { cause:'new field diagnostic' }), 1);
    assert.equal(f.cards.length, 1); assert.equal(f.cards[0].dataset.toastId, first);
    await render(messages.productReference('themeLibrary.savingFailed', { cause:'new field diagnostic' }), 2);
    assert.equal(f.cards.length, 1); assert.notEqual(f.cards[0].dataset.toastId, first);
    await render(null, 3); assert.equal(f.cards.length, 0);
    await render(messages.productReference('feedback.modified'), 4); assert.equal(f.cards.length, 1);
    await f.render(null); assert.equal(f.cards.length, 1, 'page unmount alone does not cancel retained feedback');
    await render(null, 0); assert.equal(f.cards.length, 1, 'returning to a newly mounted page with no local result does not erase the retained operation');
    await f.sendStructured({ key: 'editor', dismiss: true }); assert.equal(f.cards.length, 0, 'an actual discarded-state change explicitly cancels its reminder');
  } finally { await f.close(); }
});


test('diagnostics opened inside a modal stay in its focus scope and Escape closes only that popup', async () => {
  const f = await fixture();
  const { OperationFeedback } = await f.load(path.resolve('src/components/global/OperationFeedback.tsx')); let parentClosed = 0;
  function Modal() {
    const panel = React.useRef(null); f.useDialogFocus(panel, () => parentClosed++);
    return React.createElement('section', { id:'diagnostic-owner', role:'dialog', 'aria-modal':'true', ref:panel }, React.createElement('input', { id:'first-field' }), React.createElement(OperationFeedback, { id:'diagnostics-test', label:'Index diagnostics', notice:messages.productReference('feedback.refreshPending'), onRetry() {} }));
  }
  try {
    await f.render(React.createElement(Modal));
    const trigger = f.document.querySelector('#diagnostic-owner button[aria-haspopup="dialog"]');
    await React.act(async () => { trigger.focus(); trigger.click(); });
    const popup = f.document.querySelector('#diagnostic-owner [role="dialog"]');
    assert.ok(popup); assert.equal(popup.getAttribute('popover'),'manual'); assert.equal(popup.openPopover,true);
    assert.ok(popup.contains(f.document.activeElement));
    await React.act(async () => f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true })));
    assert.equal(f.document.querySelector('#diagnostic-owner [role="dialog"]'),null); assert.equal(parentClosed,0);
    assert.ok(f.document.activeElement === trigger);
  } finally { await f.close(); }
});


test('detail animation has measured endpoints, remains readable through keyed updates, and resumes only its remaining lifetime', async () => {
  const f = await fixture();
  try {
    await f.render(React.createElement('button', { id:'outside' }, 'Outside'));
    const send = label => f.sendStructured({ key:'reading', label, tone:'success', details:messages.productReference('libraryConfiguration.identity') });
    await send('Saved'); await f.advance(1000);
    let card = f.cards[0], button = card.querySelector('[aria-controls]');
    assert.equal(card.style.width, '220px'); assert.equal(card.style.height, '48px');
    assert.ok(card.classList.contains('toast-surface'));
    const styles = await readFile('src/styles/components-controls.css', 'utf8');
    assert.match(styles, /transition-\[width,height,translate,opacity\]/);
    await React.act(async () => { button.focus(); button.click(); });
    assert.equal(card.style.width, '440px'); assert.equal(card.style.height, '140px');
    let body = f.document.getElementById(button.getAttribute('aria-controls'));
    assert.equal(body.getAttribute('aria-hidden'), 'false'); assert.equal(body.hasAttribute('inert'), false);
    assert.ok(body.classList.contains('toast-details'));
    assert.match(styles, /transition-opacity duration-500/);
    await f.advance(20000); assert.equal(f.cards.length,1);
    await send('Updated while reading'); card = f.cards[0]; button = card.querySelector('[aria-controls]');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    await f.language('en-US'); assert.equal(button.getAttribute('aria-label'),'Hide details');
    await React.act(async () => button.click());
    assert.equal(card.style.width, '220px'); assert.equal(card.style.height, '48px');
    body = f.document.getElementById(button.getAttribute('aria-controls')); assert.equal(body.getAttribute('aria-hidden'),'true'); assert.equal(body.hasAttribute('inert'),true);
    await f.advance(20000); assert.equal(f.cards.length,1,'focus still protects a collapsed notification');
    await React.act(async () => f.document.getElementById('outside').focus());
    await f.advance(1000);
    await React.act(async () => { button.focus(); button.click(); });
    await f.advance(10000); assert.equal(f.cards.length,1);
    await React.act(async () => { button.click(); f.document.getElementById('outside').focus(); });
    await f.advance(1999); assert.equal(f.cards.length,1);
    await f.advance(1); assert.equal(f.cards.length,0,'remaining two seconds resumes instead of a fresh timeout');
  } finally { await f.close(); }
});

test('status and action anchors share detail timing and reverse from their current visual positions', async () => {
  const f = await fixture();
  try {
    await f.sendStructured({ key: 'anchors', label: 'Saved', tone: 'success', details: 'Saved location' });
    const card = f.cards[0], button = card.querySelector('[aria-controls]');
    await React.act(async () => button.click());
    const anchors = f.animations.filter(value => value.element.hasAttribute('data-toast-anchor') && !value.cancelled);
    assert.equal(anchors.length, 2);
    for (const animation of anchors) { assert.equal(animation.options.duration, 500); assert.equal(animation.options.easing, 'ease-in-out'); animation.offsetFactor = .5; }
    assert.equal(anchors.find(value => value.element.dataset.toastAnchor === 'status').frames[0].translate, '0px -46px');
    assert.equal(anchors.find(value => value.element.dataset.toastAnchor === 'actions').frames[0].translate, '-220px -46px');
    await React.act(async () => button.click());
    const reversed = f.animations.filter(value => value.element.hasAttribute('data-toast-anchor') && !value.cancelled);
    assert.equal(reversed.find(value => value.element.dataset.toastAnchor === 'status').frames[0].translate, '0px 23px');
    assert.equal(reversed.find(value => value.element.dataset.toastAnchor === 'actions').frames[0].translate, '110px 23px');
    card.style.transitionDuration = '700ms'; card.style.transitionTimingFunction = 'linear';
    await React.act(async () => button.click());
    const retimed = f.animations.filter(value => value.element.hasAttribute('data-toast-anchor') && !value.cancelled);
    assert.ok(retimed.every(value => value.options.duration === 700 && value.options.easing === 'linear'), 'geometry follows the surface CSS timing');
    f.window.matchMedia = () => ({ matches: true });
    const before = f.animations.length;
    await React.act(async () => button.click());
    assert.equal(f.animations.length, before, 'reduced motion does not create geometry animations');
  } finally { await f.close(); }
});

test('hover pauses the countdown ring at the same fraction as expiry and leaving resumes the remaining duration', async () => {
  const f = await fixture();
  try {
    await f.send('hover', 'Saved');
    let card = f.cards[0], ring = card.querySelector('circle[pathLength]');
    assert.ok(ring && card.querySelector('button').contains(ring));
    assert.equal(f.animations.at(-1).options.duration, 3000);
    await f.advance(1200);
    await React.act(async () => card.dispatchEvent(new f.window.Event('pointerover', { bubbles: true })));
    assert.equal(f.animations.at(-1).cancelled, true);
    assert.ok(Math.abs(Number(ring.style.strokeDashoffset) - 0.4) < 1e-9);
    await f.advance(20000); assert.equal(f.cards.length, 1);
    assert.ok(Math.abs(Number(ring.style.strokeDashoffset) - 0.4) < 1e-9);
    await f.language('en-US'); assert.equal(f.cards.length, 1);
    await React.act(async () => card.dispatchEvent(new f.window.Event('pointerout', { bubbles: true })));
    assert.equal(f.animations.at(-1).options.duration, 1800);
    assert.equal(f.animations.at(-1).frames[1].strokeDashoffset, 1);
    await f.advance(1799); assert.equal(f.cards.length, 1);
    await f.advance(1); assert.equal(f.cards.length, 0);
    await f.send('persistent', 'Review required', 'warning');
    assert.equal(f.cards[0].querySelector('circle[pathLength]'), null);
  } finally { await f.close(); }
});

test('empty diagnostics disappear; actual details and retry remain available', async () => {
  const f = await fixture();
  const { OperationFeedback } = await f.load(path.resolve('src/components/global/OperationFeedback.tsx'));
  try {
    const render = props => f.render(React.createElement(OperationFeedback, { id: 'empty-entry', label: 'Index', announce: false, ...props }));
    await render({ children: [null, false, '', React.createElement('ul', null, [])] });
    assert.equal(f.document.querySelector('[aria-haspopup="dialog"]'), null);
    await f.language('en-US');
    assert.equal(f.document.querySelector('[aria-haspopup="dialog"]'), null);
    await render({ children: React.createElement('p', null, 'Useful details') });
    const trigger = f.document.querySelector('button[aria-haspopup="dialog"]');
    await React.act(async () => trigger.click());
    assert.ok(f.document.querySelector('[role="dialog"]')?.textContent.includes('Useful details'));
    await render({ children: null });
    assert.equal(f.document.querySelector('[role="dialog"]'), null);
    await render({ onRetry() {} });
    assert.ok(f.document.querySelector('button[aria-haspopup="dialog"]'));
  } finally { await f.close(); }
});

test('single results are direct, optional details exclude empty and duplicate text, and actions work without details', async () => {
  const f = await fixture();
  const { OperationFeedback } = await f.load(path.resolve('src/components/global/OperationFeedback.tsx'));
  let retried = 0;
  try {
    const notice = messages.productReference('controller.workflowSettingsLoadedForThisLibrary');
    await f.render(React.createElement(OperationFeedback, { id:'load-settings', notice, tone:'neutral' }));
    assert.equal(f.cards[0].querySelector('p').textContent, '已载入此资料目录的工作流设置。');
    assert.equal(f.cards[0].querySelector('[aria-expanded]'), null);
    await f.language('en-US');
    assert.equal(f.cards[0].querySelector('p').textContent, 'Workflow settings loaded for this library.');
    await f.advance(5000); assert.equal(f.cards.length, 0);
    await f.render(null);
    await f.render(React.createElement(OperationFeedback, { id:'load-settings', notice, tone:'neutral' }));
    assert.equal(f.cards.length, 0, 'remount does not replay an already consumed result');
    await f.render(React.createElement(OperationFeedback, { id:'reload-settings', notice:messages.productReference('formatPackage.loaded'), tone:'success' }));
    assert.equal(f.cards[0].querySelector('[aria-expanded]'), null, 'a successful single sentence needs no generic completed heading or details');
    await f.sendStructured({ key:'reload-settings', dismiss:true });
    for (const details of [undefined, '   ', [], [null, ' ', []], 'Done']) {
      await f.sendStructured({ key:'plain', label:'Done', details, tone:'success', actions:[{ id:'retry', label:messages.productReference('feedback.retryRefresh'), presentation:'icon', icon:'reset', run:() => retried++ }] });
      assert.equal(f.cards[0].querySelector('[aria-expanded]'), null);
    }
    const action = f.cards[0].querySelector('.toast-actions button');
    await React.act(async () => action.click()); assert.equal(retried,1);
    await f.sendStructured({ key:'plain', label:'2 completed, 1 failed', details:'item.md: permission denied', tone:'warning' });
    assert.ok(f.cards[0].querySelector('[aria-expanded="false"]'));
  } finally { await f.close(); }
});

test('configured capacity retains a locked operation and queued countdowns start only when displayed', async () => {
  const f = await fixture({ maxVisible: 1 });
  try {
    await f.sendStructured({ key: 'important', label: 'Writing', tone: 'info', lifetime: { mode: 'locked' } });
    const disabled = f.cards[0].querySelector('[aria-disabled="true"]'); assert.ok(disabled);
    await React.act(async () => disabled.click()); await f.advance(60000); assert.equal(f.cards.length, 1);
    await f.sendStructured({ key: 'undo', label: 'Trashed', tone: 'success', lifetime: { mode: 'auto', durationMs: 10000 } });
    await f.advance(60000); assert.equal(f.cards[0].querySelector('p').textContent, 'Writing');
    await f.sendStructured({ key: 'important', label: 'Ready', tone: 'success', lifetime: { mode: 'manual' } });
    assert.equal(f.cards.length, 1); assert.ok(!f.cards[0].querySelector('[aria-disabled="true"]'));
    await React.act(async () => f.cards[0].querySelector('button').click());
    assert.equal(f.cards[0].querySelector('p').textContent, 'Trashed');
    await f.advance(9999); assert.equal(f.cards.length, 1); await f.advance(1); assert.equal(f.cards.length, 0);
  } finally { await f.close(); }
});

test('action buttons prevent repeat submission, pause expiry while pending, and keep failures readable in both languages', async () => {
  const f = await fixture(); let finish, calls = 0;
  try {
    const action = { id: 'undo', label: messages.productReference('feedback.assetsRefreshed'), presentation: 'icon', icon: 'reset', run() { calls++; return new Promise(resolve => { finish = resolve; }); } };
    await f.sendStructured({ key: 'actions', label: 'Trashed', tone: 'success', lifetime: { mode: 'auto', durationMs: 10000 }, actions: [action] });
    await f.advance(5000); const button = f.cards[0].querySelector('button[aria-busy]');
    await React.act(async () => { button.click(); button.click(); }); assert.equal(calls, 1);
    await f.advance(60000); assert.equal(f.cards.length, 1);
    await React.act(async () => finish()); await f.advance(4999); assert.equal(f.cards.length, 1);
    await f.advance(1); assert.equal(f.cards.length, 0);
    await f.sendStructured({ key: 'failure', label: 'Try again', tone: 'warning', actions: [{ ...action, run() { throw new messages.ProductError('libraryConfiguration.identity'); } }] });
    await React.act(async () => f.cards[0].querySelector('button[aria-busy]').click());
    assert.equal(f.cards[0].dataset.tone, 'error'); assert.match(f.cards[0].textContent, /config.json/);
    assert.equal(f.cards[0].querySelector('[aria-controls]').getAttribute('aria-expanded'), 'true');
    assert.ok(!f.cards[0].querySelector('button[aria-busy]').disabled);
    await f.language('en-US'); assert.doesNotMatch(f.cards[0].textContent, /\p{Script=Han}/u);
  } finally { await f.close(); }
});

test('closing a notice does not end or commit its independently retained undo clock early', async () => {
  const f = await fixture(), { createToastCountdown } = await f.load(path.resolve('src/lib/toastCountdown.ts'));
  const countdown = createToastCountdown(30000); let completed = 0; countdown.onElapsed(() => completed++);
  try {
    await f.sendStructured({ key: 'cleanup', label: 'Trash emptied', tone: 'success', lifetime: { mode: 'auto', durationMs: 30000, countdown } });
    await f.advance(5000); await React.act(async () => f.cards[0].querySelector('button').click());
    assert.equal(f.cards.length, 0); assert.equal(completed, 0);
    await f.advance(24999); assert.equal(completed, 0); await f.advance(1); assert.equal(completed, 1);
  } finally { countdown.dispose(); await f.close(); }
});

test('local graph feedback uses the real shared card and clock, preserves five-second help across translation, and locks important states', async () => {
  const f = await fixture(), { GraphToast } = await f.load(path.resolve('src/components/knowledge/GraphToast.tsx')); let closed = 0;
  try {
    const render = (label, locked = false) => f.render(React.createElement(GraphToast, { label, tone: locked ? 'warning' : 'info', locked, duration: locked ? null : 5000, onClose() { closed++; } }));
    await render('Help'); await f.advance(2000); await render('帮助');
    assert.ok(f.document.querySelector('[data-graph-toast] .toast-surface'));
    await f.advance(2999); assert.equal(closed, 0); await f.advance(1); assert.equal(closed, 1);
    await render('Clipped', true); assert.ok(f.cards[0].querySelector('[aria-disabled="true"]'));
    await f.advance(60000); assert.equal(closed, 1);
    await f.render(null); assert.equal(f.cards.length, 0);
  } finally { await f.close(); }
});


test('startup drops notifications instead of queueing or replaying them; existing undo clocks pause while unavailable', async () => {
  const f = await fixture({ initiallyReady:false, maxVisible:1 });
  try {
    await f.send('load','Loading','info');
    await f.send('settings','Loaded settings','success');
    await f.send('files','1 file needs repair','warning');
    assert.equal(f.cards.length,0); assert.equal(f.viewport.hidden,true);
    await f.ready(true); assert.equal(f.cards.length,0);
    await f.send('manual','Saved','success'); await f.advance(1000);
    await f.ready(false); assert.equal(f.viewport.hidden,true);
    await f.send('transient','Loading again','info'); await f.advance(20000);
    assert.equal(f.cards.length,1);
    await f.ready(true); assert.equal(f.cards.length,1);
    await f.advance(1999); assert.equal(f.cards.length,1);
    await f.advance(1); assert.equal(f.cards.length,0,'neither blocked notification was queued');
  } finally { await f.close(); }
});

test('CSS motion preserves direction, capacity and lifetime without writing opacity or translate from JavaScript', async () => {
  const f = await fixture({ cssMotion:true, enterFrom:'right', motionDurationMs:160, maxVisible:1 });
  try {
    await f.send('one','First','success'); await f.send('two','Second','success');
    assert.equal(f.cards[0].dataset.enterFrom,'right'); assert.equal(f.cards[0].dataset.motionMs,'160');
    assert.equal(f.cards[0].style.opacity,''); assert.equal(f.cards[0].style.translate,'');
    await f.advance(160); await f.advance(2999); assert.equal(f.cards.length,1);
    await f.advance(1); assert.equal(f.cards[0].dataset.phase,'exiting');
    await f.advance(159); assert.match(f.cards[0].textContent,/First/);
    await f.advance(1); assert.match(f.cards[0].textContent,/Second/);
    assert.equal(f.animations.some(a => a.frames.some(frame => 'opacity' in frame || 'translate' in frame)),false);
  } finally { await f.close(); }
});

test('disclosure end states use data attributes and retain only measured intermediate geometry', async () => {
  const f = await fixture();
  const { useAnimatedMaxHeight } = await f.load(path.resolve('src/hooks/useAnimatedMaxHeight.ts'));
  function Panel({ open }) { const ref=useAnimatedMaxHeight(open); return React.createElement('div',{ id:'disclosure',ref },'Content'); }
  try {
    await f.render(React.createElement(Panel,{open:false}));
    const node=f.document.getElementById('disclosure');
    Object.defineProperty(node,'scrollHeight',{value:120}); node.getBoundingClientRect=()=>({height:60});
    assert.equal(node.dataset.disclosure,'closed'); assert.equal(node.style.maxHeight,'');
    await f.render(React.createElement(Panel,{open:true}));
    assert.equal(node.dataset.disclosure,'moving'); assert.equal(node.style.getPropertyValue('--disclosure-height'),'120px');
    await f.advance(220); assert.equal(node.dataset.disclosure,'open'); assert.equal(node.getAttribute('style'),'');
    await f.render(React.createElement(Panel,{open:false}));
    assert.equal(node.dataset.disclosure,'closed'); assert.equal(node.style.maxHeight,'');
    await f.advance(220); assert.equal(node.style.getPropertyValue('--disclosure-height'),'');
  } finally { await f.close(); }
});
