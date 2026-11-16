import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import { createPortal } from 'react-dom';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import * as model from '../src/lib/entryGuide.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import './prepared-library-fixture.mjs';
import { getFontPreloadState, preloadFonts } from '../src/lib/fontPreload.ts';
import { preloadPreparedLibraries } from '../src/lib/preparedLibrary.ts';
import { OPEN_FONT_ASSETS } from '../src/lib/fontCatalog.ts';
import { createHash } from 'node:crypto';

test('aggregate progress counts actual bytes and cannot complete before the readiness gate', () => {
  assert.equal(model.guidePreparationPercent({ loaded: 100, total: 200 }, { completedBytes: 50, totalBytes: 100 }, false), 50);
  assert.equal(model.guidePreparationPercent({ loaded: 200, total: 200 }, { completedBytes: 100, totalBytes: 100 }, false), 99);
  assert.equal(model.guidePreparationPercent({ loaded: 0, total: 200 }, { completedBytes: 100, totalBytes: 100, fontsReady: true }, true), 100);
  assert.equal(model.guidePreparationPercent({ loaded: 100, total: 200 }, {}, false), null);
  assert.equal(model.guidePreparationPercent({ loaded: 0, total: 0 }, { totalBytes: 100 }, false), 0);
});

test('one clock holds three seconds, then collapses and fades; reduced motion keeps the reading gate', () => {
  assert.deepEqual(model.guideOutroState(null, 100000), { closing: false, fading: false, removed: false });
  const clock = { startedAt: 0, reduced: false };
  assert.equal(model.guideOutroState(clock, 2999).closing, false);
  assert.deepEqual(model.guideOutroState(clock, 3000), { closing: true, fading: false, removed: false });
  assert.equal(model.guideOutroState(clock, 3400).fading, true);
  assert.equal(model.guideOutroState(clock, 3700).removed, true);
  assert.equal(model.guideOutroState({ ...clock, reduced: true }, 2999).closing, false);
  assert.equal(model.guideOutroState({ ...clock, reduced: true }, 3150).removed, true);
});

async function progressUI(t, initialProps, options = {}) {
  const dom = new JSDOM('<div data-guide-panel><h1 tabindex="-1">Preparation</h1><span data-guide-preload-target></span></div><main id="root"></main>', { pretendToBeVisual: true });
  const descriptors = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let now = 50000, nextId = 0;
  const timers = new Map();
  dom.window.setTimeout = (fn, delay = 0) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  dom.window.clearTimeout = id => timers.delete(id);
  dom.window.requestAnimationFrame = fn => dom.window.setTimeout(() => fn(now), 16);
  dom.window.cancelAnimationFrame = dom.window.clearTimeout;
  let reduced = options.reduced ?? false;
  const mediaListeners = new Set();
  const media = { get matches() { return reduced; }, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  dom.window.matchMedia = () => media;
  let target = { left: 200, top: 500, width: 400, height: 24 };
  const tooltipMeasurements = [];
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute('role') === 'tooltip') tooltipMeasurements.push({ positioned: this.dataset.positioned, open: this.dataset.open });
    if (this.hasAttribute('data-guide-preload-target')) return new dom.window.DOMRect(target.left, target.top, target.width, target.height);
    if (this.hasAttribute('data-guide-font-preload')) {
      const width = this.querySelector('button')?.dataset.expanded === 'true' ? 160 : 6;
      const center = this.style.left ? Number.parseFloat(this.style.left) : 400;
      return new dom.window.DOMRect(center - width / 2, this.style.top ? Number.parseFloat(this.style.top) : 700, width, 6);
    }
    return new dom.window.DOMRect(0, 0, 0, 0);
  };
  class ClockDate extends Date { static now() { return now; } }
  let locale = 'zh-CN';
  let state = { phase: 'downloading', runId: 1, source: 'google-fonts', loaded: 100, verified: 0, total: 200, percent: 50, current: 'last-font.ttf', completedAt: null, issue: null, ...options.state };
  const listeners = new Set(), module = { exports: {} };
  let realTooltip;
  const localeImports = withUILocaleImports(id => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsx;
    if (id === 'react-dom') return { createPortal };
    if (id.endsWith('/entryGuide')) return model;
    if (id.endsWith('/preparedLibrary')) return { preloadPreparedLibraries: options.preloadPreparedLibraries ?? (async () => {}) };
    if (id.endsWith('/fontPreload')) return { getFontPreloadState: () => state, getServerFontPreloadState: () => state, subscribeFontPreload: fn => { listeners.add(fn); return () => listeners.delete(fn); }, preloadFonts: options.preloadFonts ?? (async () => {}) };
    if (id.endsWith('/TooltipButton')) return realTooltip ?? { TooltipButton: ({ tooltip, animated, ...props }) => jsx.jsxs('div', { children: [jsx.jsx('button', props), jsx.jsx('div', { role: 'tooltip', children: tooltip })] }) };
    throw new Error(id);
  });
  const resolve = id => id.endsWith('/UILocaleProvider') ? { ...localeImports(id), useUILocale: () => ({ locale }) } : localeImports(id);
  const context = { require: resolve, window: dom.window, document: dom.window.document, Date: ClockDate, getComputedStyle: dom.window.getComputedStyle.bind(dom.window) };
  if (options.realTooltip) {
    const tooltipModule = { exports: {} }, tooltipSource = await readFile(new URL('../src/components/global/TooltipButton.tsx', import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(tooltipSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { ...context, module: tooltipModule, exports: tooltipModule.exports });
    realTooltip = tooltipModule.exports;
  }
  const source = await readFile(new URL('../src/components/onboarding/GuideFontPreload.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    ...context, module, exports: module.exports,
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let mount = 0;
  let props = { enabled: true, ...initialProps };
  const render = patch => React.act(async () => { props = { ...props, ...patch }; root.render(jsx.jsx(module.exports.GuideFontPreload, props, String(mount)));  });
  await render({});
  const advance = async ms => {
    const target = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= target);
      if (!next) break;
      timers.delete(next[0]); now = next[1].at;
      await React.act(async () => next[1].fn());
    }
    now = target;
  };
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  return { doc: dom.window.document, tooltipMeasurements, render, advance, now: () => now, target: patch => { target = { ...target, ...patch }; }, remount: () => { mount++; return render({}); }, motion: value => React.act(async () => { reduced = value; mediaListeners.forEach(fn => fn()); }), locale: value => { locale = value; return render({}); }, emit: patch => React.act(async () => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }) };
}

test('confirmed language starts both real preloads before visual landing and reuses downloads across rerenders and languages', async t => {
  const original = structuredClone(OPEN_FONT_ASSETS), bytes = new TextEncoder().encode('immediate guide preload');
  const hash = createHash('sha256').update(bytes).digest('hex');
  for (const asset of OPEN_FONT_ASSETS) Object.assign(asset, { size: bytes.length, sha256: hash, licenseSize: bytes.length, licenseSha256: hash });
  t.after(() => OPEN_FONT_ASSETS.forEach((asset, index) => Object.assign(asset, original[index])));
  const fixtureFetch = globalThis.fetch, requests = [], fontJobs = [], preparedJobs = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    requests.push(String(input)); await gate;
    return String(input).startsWith('/prepared-library/') ? fixtureFetch(input, options) : new Response(bytes);
  });
  const f = await progressUI(t, { enabled: false }, { state: { phase: 'idle' },
    preloadFonts: () => { const job = preloadFonts(); fontJobs.push(job); return job; },
    preloadPreparedLibraries: choice => { const job = preloadPreparedLibraries(choice); preparedJobs.push(job); return job; },
  });
  assert.equal(requests.length, 0);
  await f.render({ enabled: true });
  await f.emit(getFontPreloadState());
  assert.equal(f.now(), 50000, 'no visual time has elapsed');
  assert.equal(fontJobs.length, 1); assert.equal(preparedJobs.length, 1);
  assert.ok(requests.some(url => url.startsWith('https://')));
  assert.ok(requests.some(url => url.startsWith('/prepared-library/')));
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.bouncing, 'true');
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.render({ preparing: true });
  assert.equal(fontJobs.length, 1);
  await f.locale('en-US'); await f.locale('zh-CN');
  assert.ok(fontJobs.every(job => job === fontJobs[0]), 'language changes join the same effective font preload');
  assert.equal(preparedJobs[0], preparedJobs.at(-1), 'returning to a language joins its existing prepared closure');
  await f.advance(799); assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.advance(1); assert.equal(f.doc.querySelector('button').dataset.expanded, 'true');
  release(); await Promise.all([...fontJobs, ...preparedJobs]);
  assert.equal(requests.length, new Set(requests).size, 'pending and verified objects are not downloaded twice');
});

test('a completed preload never enters on first render or replay, including a replay during its old hold', async t => {
  const f = await progressUI(t, {}, { state: { phase: 'complete', completedAt: 49000 } });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.advance(10000); await f.remount();
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.emit({ phase: 'downloading', runId: 2, completedAt: null });
  assert.ok(f.doc.querySelector('[data-guide-font-preload]'));
  await f.emit({ phase: 'complete', completedAt: f.now() });
  await f.advance(1000); await f.remount();
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null, 'completed global state cannot replay an entrance');
  await f.render({ enabled: false }); await f.render({ enabled: true });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('unconfirmed language cannot display an unfinished global preload', async t => {
  const f = await progressUI(t, { enabled: false });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ enabled: true });
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.advance(400); await f.locale('en-US'); await f.render({ preparing: true });
  await f.advance(399); assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.advance(1); assert.equal(f.doc.querySelector('button').dataset.expanded, 'true', 'language and step redraws do not restart landing');
});

test('font completion has its own exact three-second hold and never waits for the welcome outro', async t => {
  const f = await progressUI(t, {});
  await f.advance(800);
  await f.emit({ phase: 'complete', completedAt: f.now(), percent: 100, loaded: 200, issue: 'old failure' });
  assert.equal(f.doc.querySelector('[role=tooltip]').textContent, '预载完成');
  await f.advance(1500); await f.locale('en-US'); await f.render({ preparing: true });
  await f.advance(1499); assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'false');
  await f.advance(1); assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'true');
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.advance(400); assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.fading, 'true');
  await f.advance(300); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ preparing: false }); await f.advance(10000);
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('source and same-source run identities isolate old completion timers and keep failures retryable', async t => {
  let retries = 0;
  const f = await progressUI(t, {}, { preloadFonts: async retry => { if (retry) retries++; } });
  await f.emit({ phase: 'complete', completedAt: f.now() });
  await f.advance(1000);
  await f.emit({ source: 'jsdmirror', runId: 2, phase: 'downloading', completedAt: null });
  await f.advance(10000);
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'false');
  await f.emit({ phase: 'failed', issue: 'Network failure' });
  await f.advance(10000);
  await React.act(async () => f.doc.querySelector('button').click());
  assert.equal(retries, 1);
  await f.emit({ runId: 3, phase: 'downloading', issue: null });
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'false', 'a new real job has a new entrance identity');
  await f.advance(800);
  await f.emit({ phase: 'complete', completedAt: f.now() });
  await f.advance(3699); assert.ok(f.doc.querySelector('[data-guide-font-preload]'));
  await f.advance(1); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('preparation completion closes immediately in place and does not reappear on welcome or Agent handoff', async t => {
  const f = await progressUI(t, { preparing: true, preparation: { completedBytes: 100, totalBytes: 100, localReady: true, fontsReady: false } }, { state: { phase: 'complete', percent: 100, loaded: 200, completedAt: 0 } });
  const bar = f.doc.querySelector('[data-guide-font-preload]');
  assert.equal(f.doc.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '99');
  assert.equal(f.doc.querySelector('[role=tooltip]').textContent, '准备 99%', 'workspace and font readiness still prevent completed preparation');
  assert.equal(bar.style.left, '400px'); assert.equal(bar.style.top, '509px');
  f.target({ top: 900, width: 800 });
  await f.render({ preparationReady: true, preparation: { localReady: true, fontsReady: true }, preparing: false });
  assert.equal(bar.dataset.hiding, 'true', 'actual readiness starts collapse without the three-second welcome hold');
  assert.equal(bar.style.left, '400px'); assert.equal(bar.style.top, '509px');
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'false');
  await f.advance(399); assert.equal(bar.dataset.fading, 'false');
  await f.advance(1); assert.equal(bar.dataset.fading, 'true');
  await f.advance(300); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ preparing: true }); await f.advance(10000);
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ preparationId: 2, preparationReady: false });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'false', 'only a new actual transaction can reopen preparation');
});

test('a preparation waits for its page location and retains failed readiness plus the existing retry action', async t => {
  let retries = 0;
  const f = await progressUI(t, { preparing: false, preparation: {}, preparationIssue: 'Network failure', onRetryPreparation: () => retries++ });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').getAttribute('aria-hidden'), 'true');
  await f.render({ preparing: true });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').getAttribute('aria-hidden'), 'false');
  assert.match(f.doc.querySelector('button').getAttribute('aria-label'), /准备尚未完成/);
  await f.advance(10000);
  await React.act(async () => f.doc.querySelector('button').click());
  assert.equal(retries, 1);
  await f.render({ preparationReady: true, preparationIssue: undefined });
  await f.advance(100);
  await f.render({ preparationReady: false, preparationIssue: 'Permission lost' });
  await f.advance(10000);
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'false', 'revoked readiness cancels a stale closing timer');
  assert.match(f.doc.querySelector('[role=tooltip]').textContent, /Permission lost/);
});

test('a preparation finished before a visible panel never flashes a closing bar at the viewport bottom', async t => {
  const f = await progressUI(t, { preparing: false, preparation: {} });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.located, 'false');
  await f.render({ preparationReady: true });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ preparing: true });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('overlapping progress has only the two short independent percentages, while a later standalone preparation omits preload', async t => {
  const f = await progressUI(t, { preparing: true, preparation: { preloadAtStart: 0.5, completedBytes: 20, totalBytes: 100 } });
  const tooltip = () => f.doc.querySelector('[role=tooltip]');
  assert.equal(tooltip().textContent, '预载 50% · 准备 20%');
  assert.equal(tooltip().children.length, 1, 'normal progress is one short row');
  assert.doesNotMatch(tooltip().textContent, /字节|last-font|正在核对|正在下载/);
  await f.emit({ phase: 'complete', percent: 100, completedAt: f.now() });
  assert.equal(tooltip().textContent, '预载 100% · 准备 20%');
  await f.render({ preparation: { completedBytes: 35, totalBytes: 100 } });
  assert.equal(tooltip().textContent, '准备 35%');
  await f.render({ preparation: {} });
  assert.equal(tooltip().textContent, '准备 …', 'unknown work is never presented as an invented percentage');
});

test('reduced motion preserves the independent completion time, and preparation only fades without a hold', async t => {
  const f = await progressUI(t, {});
  await f.emit({ phase: 'complete', completedAt: f.now() });
  await f.advance(1000); await f.motion(true);
  await f.advance(1999); assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.hiding, 'false');
  await f.advance(1); assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.fading, 'true');
  assert.equal(f.doc.querySelector('button').dataset.expanded, 'true');
  await f.advance(149); assert.ok(f.doc.querySelector('[data-guide-font-preload]'));
  await f.advance(1); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
  await f.render({ preparing: true, preparation: {} });
  await f.render({ preparationReady: true });
  assert.equal(f.doc.querySelector('[data-guide-font-preload]').dataset.fading, 'true');
  await f.advance(150); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('the actual popup closes and releases focus on the independent font exit', async t => {
  const f = await progressUI(t, {}, { realTooltip: true });
  await f.advance(800);
  await React.act(async () => f.doc.querySelector('button').focus());
  await f.advance(16);
  assert.equal(f.doc.querySelector('[role=tooltip]').dataset.open, 'true');
  await f.emit({ phase: 'complete', completedAt: f.now() });
  await f.advance(3000);
  assert.equal(f.doc.querySelector('[role=tooltip]').dataset.open, 'false');
  assert.equal(f.doc.activeElement.tagName, 'H1');
  await f.advance(150); assert.equal(f.doc.querySelector('[role=tooltip]'), null);
  await f.advance(550); assert.equal(f.doc.querySelector('[data-guide-font-preload]'), null);
});

test('the animated popup is measured while hidden and opens at its anchor without animating viewport coordinates', async t => {
  const f = await progressUI(t, {}, { realTooltip: true });
  await f.advance(800);
  await React.act(async () => f.doc.querySelector('button').focus());
  assert.deepEqual(f.tooltipMeasurements[0], { positioned: 'false', open: 'false' });
  const popup = f.doc.querySelector('[role=tooltip]');
  assert.equal(popup.dataset.positioned, 'true');
  assert.ok(Number.parseFloat(popup.style.left) >= 8);
  assert.ok(Number.parseFloat(popup.style.top) >= 8);
  const transition = popup.className.match(/transition-\[([^\]]+)\]/)?.[1].split(',');
  assert.ok(transition.includes('opacity'));
  assert.equal(transition.includes('left'), false); assert.equal(transition.includes('top'), false);
  await f.advance(16); assert.equal(popup.dataset.open, 'true');
  await React.act(async () => f.doc.querySelector('button').blur());
  await f.advance(150); assert.equal(f.doc.querySelector('[role=tooltip]'), null);
  const before = f.tooltipMeasurements.length;
  await React.act(async () => f.doc.querySelector('button').focus());
  assert.deepEqual(f.tooltipMeasurements[before], { positioned: 'false', open: 'false' }, 'reopening cannot reuse a stale position');
  await f.advance(16); assert.equal(f.doc.querySelector('[role=tooltip]').dataset.open, 'true');
});
