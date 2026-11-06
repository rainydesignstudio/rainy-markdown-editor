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
import * as editorThemes from '../src/lib/editorThemes.ts';
import { normalizeDataDirectoryName } from '../src/lib/fileSystem.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';

const providerTree = ts.createSourceFile('AppProviders.tsx', await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const readinessExpressions = [];
function findReadiness(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(providerTree) === 'workspaceReady') readinessExpressions.push(node.initializer.expression.getText(providerTree));
  ts.forEachChild(node, findReadiness);
}
findReadiness(providerTree); assert.equal(readinessExpressions.length, 1);
const actualWorkspaceReady = ({ loading = false, format = {}, controller = {} } = {}) => vm.runInNewContext(readinessExpressions[0], {
  loading, format: { loading: false, error: null, ...format }, controller: { directory: null, contentLibrariesState: 'idle', libraryLoadIssue: null, ...controller },
});

test('the actual provider permits a healthy empty workspace and keeps connected/loading/failure guards', () => {
  assert.equal(actualWorkspaceReady(), true);
  assert.equal(actualWorkspaceReady({ controller: { directory: {}, contentLibrariesState: 'ready' } }), true);
  for (const input of [
    { loading: true }, { format: { loading: true } }, { format: { error: 'Invalid format' } },
    { controller: { libraryLoadIssue: 'Read failed' } }, { controller: { contentLibrariesState: 'failed' } },
    { controller: { directory: {}, contentLibrariesState: 'idle' } }, { controller: { directory: {}, contentLibrariesState: 'loading' } },
    { controller: { directory: {}, contentLibrariesState: 'failed' } },
  ]) assert.equal(actualWorkspaceReady(input), false);
});

async function guide(t, overrides = {}, options = {}) {
  const dom = new JSDOM('<main id="root"></main>', { url: 'http://localhost:3510', pretendToBeVisual: true });
  // Match the browser's standard animation event before React selects its event name.
  dom.window.AnimationEvent = dom.window.Event;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolledTo = 'true'; };
  const descriptors = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let reduced = options.reduced ?? true;
  const mediaListeners = new Set();
  const media = { get matches() { return reduced; }, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  dom.window.matchMedia = () => media;
  const withGuideImports = resolver => {
    const resolve = withUILocaleImports(resolver);
    return id => { const value = resolve(id); return id.endsWith('/UILocaleProvider') ? { ...value, useUILocale: () => ({ ...value.useUILocale(), setLocale: options.setLocale ?? (async () => {}) }) } : value; };
  };
  dom.window.document.documentElement.dataset.editorColorScheme = 'dark';
  const timers = new Map(), sceneTimers = new Map(); let timerId = 0;
  dom.window.setTimeout = fn => { sceneTimers.set(++timerId, fn); return timerId; };
  dom.window.clearTimeout = id => sceneTimers.delete(id);
  dom.window.requestAnimationFrame = fn => { timers.set(++timerId, fn); return timerId; };
  dom.window.cancelAnimationFrame = id => timers.delete(id);
  let flightTime = 0;
  if (options.geometry) dom.window.HTMLElement.prototype.getAnimations = function () {
    return this.hasAttribute('data-guide-flight') ? [{ animationName: 'guide-collect', effect: { getComputedTiming: () => ({ localTime: flightTime, duration: 720 }) } }] : [];
  };
  if (options.geometry) dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.matches('nav')) return new dom.window.DOMRect(500, 20, 200, 48);
    if (this.matches('nav > .pointer-events-none')) return new dom.window.DOMRect(500, 20, 44, 0);
    if (this.hasAttribute('data-guide-dot')) return new dom.window.DOMRect(650, 40, 8, 8);
    return new dom.window.DOMRect(600, 400, 110, 24);
  };
  const notices = [], copied = [];
  let handoff, modeSwitch, tooltipButton, guideScene, guideWelcome;
  const requireComponent = withGuideImports(id => {
    if (id === 'react') return React;
    if (id === 'react-dom') return { createPortal };
    if (id === 'react/jsx-runtime') return jsx;
    if (id.endsWith('/editorThemes')) return editorThemes;
    if (id.endsWith('/GuideThemeDeck')) return { GuideThemeDeck: ({ expanded, onSelect }) => expanded ? jsx.jsx('div', { children: editorThemes.getBuiltinEditorThemes('zh-CN').map(theme => jsx.jsx('button', { 'aria-label': theme.name, onClick: () => onSelect(theme.id) }, theme.id)) }) : null };
    if (id.endsWith('/GuideHandoff')) return handoff;
    if (id.endsWith('/GuideWelcome')) return guideWelcome;
    if (id.endsWith('/GuideScene')) return guideScene ?? { GuideScene: 'guide-scene' };
    if (id.endsWith('/TooltipButton')) return tooltipButton ?? { TooltipButton: ({ tooltip, ...props }) => jsx.jsx('button', props) };
    if (id.endsWith('/entryGuide')) return model;
    if (id.endsWith('/fileSystem')) return { normalizeDataDirectoryName };
    if (id.endsWith('/ModeSwitch')) return modeSwitch;
    if (id.endsWith('/Toast')) return { useToast: () => notice => notices.push(notice) };
    throw new Error(`Unexpected import ${id}`);
  });
  const loadComponent = async file => {
    const source = await readFile(new URL(file, import.meta.url), 'utf8'), module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, structuredClone, window: dom.window, document: dom.window.document, getComputedStyle: element => { const style = dom.window.getComputedStyle(element); if (element?.parentElement?.hasAttribute('data-guide-welcome')) Object.defineProperty(style, 'animationDuration', { value: '3s' }); if (element?.hasAttribute('data-entry-guide') && element.dataset.complete === 'true') Object.defineProperty(style, 'animationDuration', { value: '3s' }); return style; }, DOMRect: dom.window.DOMRect,
      navigator: { clipboard: { writeText: async text => { if (options.copy) await options.copy(text); copied.push(text); } } },
      setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), require: requireComponent,
    });
    return module.exports;
  };
  if (options.realTooltips) tooltipButton = await loadComponent('../src/components/global/TooltipButton.tsx');
  if (options.realScene) guideScene = await loadComponent('../src/components/onboarding/GuideScene.tsx');
  modeSwitch = await loadComponent('../src/components/global/ModeSwitch.tsx');
  handoff = await loadComponent('../src/components/onboarding/GuideHandoff.tsx');
  guideWelcome = await loadComponent('../src/components/onboarding/GuideWelcome.tsx');
  const entry = await loadComponent('../src/components/onboarding/EntryGuide.tsx');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')), finished = [], appearance = [];
  let props = { workspaceReady: true, supported: true, onCreate: async () => ({ status: 'ready', resources: { templatePath: 'templates/entry-guide/entry-technical.md', samplePath: 'articles/2026-11/example/article.md', themeId: 'basic', themeVersion: '1.0.0', autoSave: false, autoSaveIntervalSeconds: 60, autoSnapshot: false, autoSnapshotIntervalMinutes: 30, autoSnapshotMaxCount: 20 } }), onOpen: async () => ({ status: 'ready' }), onFinish: value => finished.push(value), onAppearance: value => appearance.push(value), ...overrides };
  await React.act(async () => root.render(jsx.jsx(entry.EntryGuide, props)));
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const doc = dom.window.document;
  const button = label => [...doc.querySelectorAll('button')].find(node => node.textContent === label || node.getAttribute('aria-label') === label);
  const endTransition = (selector, pseudoElement = '') => React.act(async () => {
    const isDeparture = selector === '[data-entry-guide]';
    const event = new dom.window.Event(isDeparture ? 'animationend' : 'transitionend', { bubbles: true });
    if (isDeparture) Object.defineProperty(event, 'animationName', { value: pseudoElement ? 'unrelated' : 'guide-depart' });
    Object.defineProperty(event, 'propertyName', { value: 'opacity' });
    Object.defineProperty(event, 'pseudoElement', { value: pseudoElement });
    doc.querySelector(selector)?.dispatchEvent(event);
  });
  const advanceGreeting = () => React.act(async () => { const pending = [...sceneTimers.values()]; sceneTimers.clear(); for (const fn of pending) fn(); });
  const flush = async () => {
    await React.act(async () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); });
    if (doc.querySelector('[data-guide-welcome]')) await React.act(async () => doc.querySelector('[data-guide-welcome] > span').dispatchEvent(new dom.window.Event('animationend', { bubbles: true })));
    for (let count = 0; count < 100 && doc.querySelector('[data-guide-greeting-stage]:not([data-guide-greeting-stage=ready])') && sceneTimers.size; count++) await advanceGreeting();
    if (doc.querySelector('[data-guide-panel]')?.dataset.leaving === 'true') await endTransition('[data-guide-panel]');
  };
  const setReduced = value => React.act(async () => { reduced = value; for (const fn of mediaListeners) fn(); });
  const click = async node => { assert.ok(node, 'control must exist'); await React.act(async () => node.click()); };
  const enter = async () => {
    await flush(); await click(button('简体中文')); await click(button('继续')); await flush();
    if (options.geometry) await React.act(async () => { const event = new dom.window.Event('animationend', { bubbles: true }); Object.defineProperty(event, 'animationName', { value: 'guide-collect' }); doc.querySelector('[data-guide-flight]')?.dispatchEvent(event); });
    await click(button('Rainy Design · Slate')); await click(button('继续')); await flush();
  };
  const chooseWriter = async (value = 'workspace') => {
    await click(doc.querySelector(`input[name=writer][value=${value}]`)); await click(button('继续')); await flush();
  };
  const rerender = async patch => { props = { ...props, ...patch }; await React.act(async () => root.render(jsx.jsx(entry.EntryGuide, props))); };
  const setName = value => React.act(async () => {
    const input = doc.querySelector('#guide-library-name');
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  return { doc, button, click, flush, advanceGreeting, endTransition, setReduced, enter, setName, chooseWriter, rerender, notices, copied, finished, appearance, window: dom.window, advanceFlight: async time => { flightTime = time; await flush(); } };
}

test('existing-library card opens during its click, guards duplicates and returns to the same choices on cancel', async t => {
  let resolve, progress, calls = 0;
  const f = await guide(t, { onOpen: report => { calls++; progress = report; return new Promise(done => { resolve = done; }); } }, { reduced: false });
  await f.enter();
  await f.click(f.doc.querySelector('input[value=commerce]'));
  const open = f.button('我已经有资料库了');
  await React.act(async () => {
    open.click();
    assert.equal(calls, 1, 'picker is called before the click returns, preserving activation');
    open.click(); assert.equal(calls, 1);
  });
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '0');
  assert.equal(f.doc.querySelector('h1').textContent, '挑个业务场景。', 'native selection retains the current page');
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.selecting, 'true');
  assert.deepEqual(f.finished, []);
  await React.act(async () => resolve({ status: 'cancelled' }));
  assert.equal(f.doc.querySelector('h1').textContent, '挑个业务场景。');
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 2);
  assert.equal(f.doc.querySelector('input[value=commerce]').checked, true);
  assert.equal(f.button('我已经有资料库了').disabled, false);
  assert.equal(f.button('选择并打开'), undefined, 'there is no intermediate open page');
  await f.click(f.button('我已经有资料库了'));
  assert.equal(f.doc.querySelector('h1').textContent, '挑个业务场景。');
  await React.act(async () => progress('directory'));
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.leaving, 'true');
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('h1').textContent, '正在为你准备。', 'selection completion starts preparation');
  await React.act(async () => resolve({ status: 'error', message: 'read failed' }));
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('h1').textContent, '挑个业务场景。');
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=brief]')); await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter();
  assert.ok(f.button('自动保存'), 'saving choices precede naming');
  await f.click(f.button('继续')); await f.flush();
  assert.ok(f.doc.querySelector('#guide-library-name'), 'cancelled open restores the new-library path');
});

test('cancelled setup keeps choices; repeated submit is guarded; only real readiness finishes the guide', async t => {
  let resolve, progress, calls = 0, plan;
  const f = await guide(t, { onCreate: (value, report) => { calls++; plan = value; progress = report; return new Promise(done => { resolve = done; }); } }, { reduced: false });
  await f.enter();
  await f.click(f.doc.querySelector('input[value=commerce]'));
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=brief]'));
  await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter();
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'true');
  await f.click(f.button('自动快照'));
  await f.click(f.button('继续')); await f.flush();
  const input = f.doc.querySelector('input:not([type=radio])');
  const setName = value => React.act(async () => {
    Object.getOwnPropertyDescriptor(f.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new f.window.Event('input', { bubbles: true }));
  });
  await setName('invalid/name'); assert.equal(f.button('继续').disabled, true);
  await setName('Guide QA'); assert.equal(f.button('继续').disabled, false);
  await f.click(f.button('继续')); await f.flush();
  const submit = f.button('选择位置并准备');
  await React.act(async () => { submit.click(); submit.click(); });
  assert.equal(f.doc.querySelector('h1').textContent, '准备好了。', 'new-library selection also retains its confirmation');
  assert.equal(calls, 1); assert.equal(plan.profile, 'brief'); assert.equal(plan.name, 'Guide QA'); assert.equal(plan.autoSave, true); assert.equal(plan.autoSnapshot, false); assert.equal(plan.writer, 'workspace');
  assert.deepEqual(f.finished, []);
  await React.act(async () => resolve({ status: 'cancelled' }));
  assert.match(f.doc.body.textContent, /已取消选择/); assert.match(f.doc.body.textContent, /Guide QA/);
  await f.click(f.button('选择位置并准备')); assert.equal(calls, 2);
  await React.act(async () => progress('directory'));
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.leaving, 'true');
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('h1').textContent, '正在为你准备。');
  await React.act(async () => resolve({ status: 'ready' }));
  assert.deepEqual(f.finished, []);
  await f.flush(); assert.deepEqual(f.finished, []);
  await f.endTransition('[role=status]'); assert.deepEqual(f.finished, []);
  await f.endTransition('[data-entry-guide]', '::before'); assert.deepEqual(f.finished, []);
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [true]);
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [true]);
});

test('failed existing-library load exposes the reason and stays in the guide', async t => {
  const f = await guide(t, { onOpen: async () => ({ status: 'error', message: 'Permission denied' }) });
  await f.enter();
  await f.click(f.button('我已经有资料库了')); await f.flush();
  assert.match(f.doc.querySelector('[role=alert]').textContent, /Permission denied/);
  assert.equal(f.doc.activeElement, f.doc.querySelector('[role=alert]'));
  assert.equal(f.doc.activeElement.dataset.scrolledTo, 'true');
  assert.equal(f.button('我已经有资料库了').disabled, false); assert.deepEqual(f.finished, []);
  const scrollbox = f.doc.querySelector('[data-guide-panel] .overflow-y-auto');
  scrollbox.scrollTop = 123;
  await f.click(f.doc.querySelector('input[value=development]'));
  await f.click(f.button('继续')); await f.flush();
  assert.equal(scrollbox.scrollTop, 0, 'a new step starts at the beginning of its content');
});


test('returning to a choice node keeps that choice and clears subsequent unsubmitted settings', async t => {
  const f = await guide(t); await f.enter();
  await f.click(f.doc.querySelector('input[value=media]')); await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=wechat]')); await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter(); await f.click(f.button('自动保存'));
  await f.click(f.button('继续')); await f.flush(); await f.setName('A personal space');
  assert.equal(f.button('切换浅色与深色'), undefined);
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 7);
  await f.click(f.button('返回修改：公众号长文')); await f.flush();
  assert.equal(f.doc.querySelector('input[value=wechat]').checked, true);
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 3);
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelectorAll('input:checked').length, 0, 'later writer choice was cleared');
  assert.equal(f.button('继续').disabled, true);
  await f.chooseWriter();
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'true', 'the cleared manual override returns to the selected writer recommendation');
  await f.click(f.button('继续')); await f.flush(); assert.equal(f.doc.querySelector('#guide-library-name').value, '');
  await f.setName('Another space'); await f.click(f.button('继续')); await f.flush();
  await f.click(f.button('返回修改：文稿与分享')); await f.flush();
  assert.equal(f.doc.querySelector('input[value=media]').checked, true);
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelectorAll('input:checked').length, 0); assert.equal(f.button('继续').disabled, true);
  assert.deepEqual(f.finished, []);
});

test('returning to the language node clears purpose and later nodes; ordinary back retains input', async t => {
  const f = await guide(t);
  await f.enter();
  await f.click(f.doc.querySelector('input[value=development]'));
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=technical]'));
  await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter(); await f.click(f.button('继续')); await f.flush(); await f.setName('Keep on ordinary back');
  await f.click(f.button('返回')); await f.flush();
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelector('#guide-library-name').value, 'Keep on ordinary back');
  await f.click(f.button('返回修改：简体中文')); await f.flush();
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '-2');
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 0);
  assert.equal(f.doc.activeElement, f.doc.querySelector('h1'));
  assert.equal(f.button('简体中文').getAttribute('aria-pressed'), 'true');
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelectorAll('input:checked').length, 0);
  assert.equal(f.button('继续').disabled, true);
});

test('a created-but-incomplete library retries by opening it and never records false completion', async t => {
  let created = 0, opened = 0;
  const f = await guide(t, {
    onCreate: async () => { created++; return { status: 'error', created: true, message: 'Template write failed' }; },
    onOpen: async () => { opened++; return { status: 'ready' }; },
  });
  await f.enter();
  await f.click(f.doc.querySelector('input[value=development]'));
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=technical]'));
  await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter(); await f.click(f.button('继续')); await f.flush(); await f.setName('Recoverable');
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.button('选择位置并准备')); await f.flush();
  assert.equal(created, 1); assert.deepEqual(f.finished, []);
  assert.match(f.doc.querySelector('[role=alert]').textContent, /Template write failed/);
  await f.click(f.button('选择并打开')); await f.flush();
  assert.equal(opened, 1); assert.equal(created, 1); assert.deepEqual(f.finished, [true]);
});


test('language selection is confirmed explicitly; concurrent load and failed load are recoverable', async t => {
  let settle, calls=0;
  const f=await guide(t,{}, {setLocale:()=>{calls++;return new Promise((resolve,reject)=>{settle={resolve,reject};});}});
  await f.flush();assert.equal(f.button('继续').disabled,true);
  await React.act(async()=>{f.button('简体中文').click();f.button('English').click();});
  assert.equal(calls,1);assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'-2');
  await React.act(async()=>settle.reject(new Error('language unavailable')));
  assert.match(f.doc.querySelector('[role=alert]').textContent,/语言载入失败/);
  assert.equal(f.button('简体中文').disabled,false);assert.equal(f.button('继续').disabled,true);
  await f.click(f.button('简体中文'));await React.act(async()=>settle.resolve());
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'-2');
  assert.equal(f.button('继续').disabled,false);
  await f.click(f.button('继续'));await f.flush();
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'-1');
  assert.equal(f.button('继续').disabled,true);
});

test('attention previews do not commit a purpose or profile', async t => {
  const f=await guide(t);await f.enter();
  await React.act(async()=>f.doc.querySelector('input[value=commerce]').focus());
  assert.equal(f.doc.querySelector('guide-scene').getAttribute('purpose'),'commerce');
  assert.equal(f.doc.querySelectorAll('input:checked').length,0);assert.equal(f.button('继续').disabled,true);
  await f.click(f.doc.querySelector('input[value=commerce]'));
  await f.click(f.button('继续'));await f.flush();
  await React.act(async()=>f.doc.querySelector('input[value=brief]').focus());
  assert.equal(f.doc.querySelector('guide-scene').getAttribute('profileId'),'brief');
  assert.equal(f.doc.querySelectorAll('input:checked').length,0);
  await React.act(async()=>f.doc.querySelector('input[value=brief]').blur());
  assert.equal(f.doc.querySelector('guide-scene').getAttribute('profileId'),'');
});

test('reduced-motion changes and interrupted returns settle the latest transition without stale resets', async t => {
  const f=await guide(t,{}, {reduced:false});await f.enter();
  await f.click(f.doc.querySelector('input[value=media]'));await f.click(f.button('继续'));
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'0');
  assert.equal(f.doc.querySelector('input[value=media]').disabled,true);
  await f.setReduced(true);assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'1');
  await f.setReduced(false);await f.click(f.doc.querySelector('input[value=wechat]'));await f.click(f.button('继续'));
  await f.click(f.button('返回修改：简体中文'));
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'-2');
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step,'-2');
  await f.click(f.button('继续'));await f.flush();
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length,1);
  assert.equal(f.doc.querySelectorAll('input:checked').length,0);
});

test('switching reduced motion on after actual readiness completes once without waiting for opacity', async t => {
  const f=await guide(t,{}, {reduced:false});await f.enter();
  await f.click(f.button('我已经有资料库了'));await f.flush();
  assert.deepEqual(f.finished,[]);
  await f.setReduced(true);assert.deepEqual(f.finished,[true]);
  await f.endTransition('[data-entry-guide]');assert.deepEqual(f.finished,[true]);
});


test('appearance defaults to system, is chosen before purpose, and reaches the creation plan', async t => {
  let plan;
  const f = await guide(t, { onCreate: async value => { plan = value; return { status: 'cancelled' }; } });
  await f.flush(); await f.click(f.button('简体中文')); await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '-1');
  assert.equal(f.appearance[0], 'system');
  assert.equal(f.button('继续').disabled, true);
  await f.click(f.button('纸衫 · 彩调')); await f.click(f.button('切换浅色与深色'));
  assert.equal(f.appearance.at(-1), 'light');
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=development]')); await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=technical]')); await f.click(f.button('继续')); await f.flush();
  await f.chooseWriter(); await f.click(f.button('继续')); await f.flush(); await f.setName('R2 theme');
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.button('选择位置并准备'));
  assert.equal(plan.themeId, 'linen'); assert.equal(plan.colorMode, 'light');
  await f.click(f.button('返回修改：纸衫 · 彩调')); await f.flush();
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 1, 'only the language node remains accessible on return');
  assert.equal(f.button('继续').disabled, false, 'the returned choice is retained');
});


test('journey return reverses the flight, and revisiting never reveals a dot before arrival', async t => {
  const f = await guide(t, {}, { reduced: false, geometry: true });
  const endFlight = node => React.act(async () => {
    const event = new f.window.Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'guide-collect' }); node.dispatchEvent(event);
  });
  await f.enter();
  await f.click(f.doc.querySelector('input[value=development]'));
  await f.click(f.button('继续')); await f.flush();
  const forward = f.doc.querySelector('[data-guide-flight]');
  assert.equal(forward.dataset.direction, 'collect');
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'true');
  await endFlight(forward);
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'false');
  await f.click(f.button('返回修改：技术与开发'));
  assert.ok(f.doc.querySelector('[data-guide-return-anchor]'));
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'true');
  await f.flush(); await f.flush();
  const reverse = f.doc.querySelector('[data-guide-flight]');
  assert.equal(reverse.dataset.direction, 'return');
  assert.equal(f.doc.querySelector('input:checked + label [data-choice-title]').dataset.collecting, 'true');
  await endFlight(reverse);
  assert.equal(f.doc.querySelector('input:checked + label [data-choice-title]').dataset.collecting, 'false');
  await f.click(f.button('继续')); await f.flush();
  const repeated = f.doc.querySelector('[data-guide-flight]');
  assert.notEqual(repeated, forward);
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'true');
  await endFlight(forward);
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'true', 'obsolete completion cannot expose the new destination');
  await endFlight(repeated);
  assert.equal(f.doc.querySelector('[data-guide-dot="0"]').dataset.hidden, 'false');
});


async function reachSaving(f, writer = 'workspace') {
  await f.enter();
  await f.click(f.doc.querySelector('input[value=development]')); await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('input[value=technical]')); await f.click(f.button('继续')); await f.flush();
  assert.equal(f.button('继续').disabled, true, 'writing method requires an explicit choice');
  await f.chooseWriter(writer);
}

test('journey spacing waits for the actual flight to approach its landing', async t => {
  const f = await guide(t, {}, { reduced: false, geometry: true });
  await f.enter();
  await f.click(f.doc.querySelector('input[value=development]'));
  await f.click(f.button('继续')); await f.flush();
  const slot = f.doc.querySelector('[data-guide-slot="0"]');
  assert.equal(slot.dataset.visible, 'false', 'a newly collected decision does not immediately push existing dots');
  await f.advanceFlight(480);
  assert.equal(slot.dataset.visible, 'false', 'the rail stays centered during most of the flight');
  await f.advanceFlight(540);
  assert.equal(slot.dataset.visible, 'true', 'the destination opens as the dot approaches');
  assert.equal(slot.querySelector('[data-guide-dot]').dataset.hidden, 'true', 'the moving dot remains the only visible copy');
  await f.setReduced(true);
  assert.equal(f.doc.querySelector('[data-guide-flight]'), null);
  assert.equal(slot.dataset.visible, 'true');
});

test('jumping several stages retains departing dots for their fade and delays recentering', async t => {
  const f = await guide(t, {}, { geometry: true, realTooltips: true });
  await reachSaving(f);
  await f.click(f.button('继续')); await f.flush();
  await f.setName('A retained test'); await f.click(f.button('继续')); await f.flush();
  const retired = f.doc.querySelector('[data-guide-dot="4"]');
  const slot = f.doc.querySelector('[data-guide-slot="4"]');
  await f.setReduced(false);
  await f.click(f.button('返回修改：技术与开发'));
  assert.equal(slot.dataset.visible, 'true', 'the source row holds its formation while the return waits');
  await f.flush(); await f.flush();
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '0');
  assert.equal(f.doc.querySelector('[data-guide-dot="4"]'), retired, 'the same rendered dot remains available to animate out');
  assert.equal(retired.dataset.visible, 'true', 'departing dots hold their appearance while spacing is held');
  assert.equal(slot.getAttribute('aria-hidden'), 'true');
  assert.equal(slot.hasAttribute('inert'), true, 'departing choices cannot receive focus or clicks');
  await f.advanceFlight(50);
  assert.equal(slot.dataset.visible, 'true', 'no instant collapse at the start of departure');
  assert.equal(retired.dataset.visible, 'true', 'fading cannot precede recentering');
  await f.advanceFlight(110);
  assert.equal(slot.dataset.visible, 'false', 'remaining dots recenter once the returning dot leaves the rail');
  assert.equal(retired.dataset.visible, 'false', 'fade and recentering start in the same update');
  await f.setReduced(true);
  assert.equal(f.doc.querySelector('[data-guide-flight]'), null);
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 2);
  assert.equal(f.doc.querySelector('input[value=development]').checked, true);
  assert.equal(f.doc.querySelector('#guide-library-name'), null);
});

test('a rapid earlier jump supersedes the old flight and its spacing callback', async t => {
  const f = await guide(t, {}, { geometry: true });
  await reachSaving(f);
  await f.setReduced(false);
  await f.click(f.button('返回修改：技术笔记')); await f.flush(); await f.flush();
  const oldFlight = f.doc.querySelector('[data-guide-flight]');
  await f.click(f.button('返回修改：简体中文')); await f.flush(); await f.flush();
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '-2');
  const currentFlight = f.doc.querySelector('[data-guide-flight]');
  assert.notEqual(currentFlight, oldFlight);
  await React.act(async () => {
    const event = new f.window.Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'guide-collect' }); oldFlight.dispatchEvent(event);
  });
  assert.equal(f.doc.querySelector('[data-guide-flight]'), currentFlight);
  await f.advanceFlight(110);
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][data-visible=true]').length, 0);
  await f.setReduced(true); await f.flush();
  assert.equal(f.doc.querySelector('[data-guide-flight]'), null);
  assert.equal(f.doc.querySelectorAll('[data-guide-slot][aria-hidden=false]').length, 0);
});

async function prepareLibrary(f) {
  await f.click(f.button('继续')); await f.flush();
  await f.setName('Flow QA'); await f.click(f.button('继续')); await f.flush();
  await f.click(f.button('选择位置并准备')); await f.flush();
}

test('changing writing method reapplies both recommendations; ordinary back keeps manual settings', async t => {
  let plan;
  const f = await guide(t, { onCreate: async value => { plan = value; return { status: 'cancelled' }; } });
  await reachSaving(f, 'agent');
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'false');
  assert.equal(f.button('自动快照').getAttribute('aria-checked'), 'false');
  await f.click(f.button('自动保存').querySelector('[data-choice-title]'));
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'true', 'the title toggles the single switch once');
  await f.click(f.button('自动保存').querySelector('.mode-switch-track'));
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'false', 'the track also toggles only once');
  await f.click(f.button('返回')); await f.flush();
  await f.chooseWriter('workspace');
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'true', 'choosing workspace resets the previous manual off');
  assert.equal(f.button('自动快照').getAttribute('aria-checked'), 'true');
  await f.click(f.button('自动保存'));
  await f.click(f.button('继续')); await f.flush(); await f.setName('Keep my choice');
  await f.click(f.button('返回')); await f.flush();
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'false', 'ordinary back does not reapply a recommendation');
  await prepareLibrary(f);
  assert.equal(plan.writer, 'workspace'); assert.equal(plan.autoSave, false); assert.equal(plan.autoSnapshot, true);
});

test('each writer choice resets both switches and exposes its short recommendation and illustration state', async t => {
  const f = await guide(t, {}, { realScene: true });
  await reachSaving(f, 'workspace');
  await f.click(f.button('自动保存')); await f.click(f.button('自动快照'));
  assert.equal(f.doc.querySelector('.guide-scene').dataset.autoSave, 'false');
  await f.click(f.button('返回')); await f.flush();
  await f.click(f.doc.querySelector('input[name=writer][value=agent]'));
  assert.match(f.doc.querySelector('.guide-note').textContent, /建议关闭自动保存与自动快照/);
  await f.chooseWriter('agent');
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'false');
  assert.equal(f.button('自动快照').getAttribute('aria-checked'), 'false');
  await f.click(f.button('返回')); await f.flush();
  await f.click(f.doc.querySelector('input[name=writer][value=workspace]'));
  assert.match(f.doc.querySelector('.guide-note').textContent, /建议开启自动保存与自动快照/);
  assert.equal(f.doc.querySelector('.guide-scene').dataset.autoSave, 'true');
  assert.equal(f.doc.querySelector('.guide-scene').dataset.autoSnapshot, 'true');
  await f.chooseWriter('workspace');
  assert.equal(f.button('自动保存').getAttribute('aria-checked'), 'true');
  assert.equal(f.button('自动快照').getAttribute('aria-checked'), 'true');
});

test('labeled saving cards have no duplicate popup, while journey tooltips retain their behavior', async t => {
  const f = await guide(t, {}, { realTooltips: true });
  await reachSaving(f, 'agent');
  await React.act(async () => f.button('返回修改：交给 Agent').focus());
  assert.equal(f.doc.querySelector('[role=tooltip]')?.textContent, '交给 Agent');
  for (const label of ['自动保存', '自动快照']) {
    const button = f.button(label);
    await React.act(async () => { button.focus(); button.dispatchEvent(new f.window.Event('pointerover', { bubbles: true })); });
    assert.equal(button.getAttribute('aria-label'), label);
    assert.equal(f.doc.querySelector('[role=tooltip]'), null);
  }
});

test('scene exit begins before leaving for appearance and is cancelled cleanly by reduced motion', async t => {
  const f = await guide(t, {}, { reduced: false });
  await f.enter();
  assert.ok(f.doc.querySelector('[data-scene-anchor]'));
  await f.click(f.button('返回修改：Rainy Design · Slate'));
  assert.equal(f.doc.querySelector('[data-scene-anchor]').dataset.sceneLeaving, 'true');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '0', 'the scene stays mounted while fading out');
  await f.setReduced(true);
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.step, '-1');
  assert.equal(f.doc.querySelector('[data-scene-anchor]'), null);
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelector('[data-scene-anchor]').dataset.sceneLeaving, 'false');
});

test('saving comes before naming; returning to its node retains the policy and clears the later name', async t => {
  const f = await guide(t);
  await reachSaving(f, 'agent');
  assert.equal(f.doc.querySelector('h1').textContent, '改动怎么留？');
  assert.equal(f.doc.querySelector('#guide-library-name'), null);
  await f.click(f.button('自动快照'));
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelector('h1').textContent, '给资料库起个名字。');
  await f.setName('Later choice'); await f.click(f.button('继续')); await f.flush();
  await f.click(f.button('返回修改：自动快照')); await f.flush();
  assert.equal(f.button('自动快照').getAttribute('aria-checked'), 'true');
  await f.click(f.button('继续')); await f.flush();
  assert.equal(f.doc.querySelector('#guide-library-name').value, '');
  assert.equal(f.button('继续').disabled, true);
});

test('Agent handoff waits for workspace readiness, copies the full text once and never enters automatically', async t => {
  let resolveCopy, copyCalls = 0;
  const f = await guide(t, { workspaceReady: false }, { reduced: false, copy: () => { copyCalls++; return new Promise(resolve => { resolveCopy = resolve; }); } });
  await reachSaving(f, 'agent'); await prepareLibrary(f);
  assert.equal(f.doc.querySelector('h1').textContent, '正在为你准备。');
  assert.equal(f.doc.querySelector('[data-guide-handoff]'), null); assert.deepEqual(f.finished, []);
  await f.setReduced(true); assert.deepEqual(f.finished, [], 'reduced motion cannot bypass readiness');
  await f.rerender({ workspaceReady: true });
  assert.ok(f.doc.querySelector('[data-guide-handoff]')); assert.deepEqual(f.finished, []);
  assert.ok([...f.doc.querySelectorAll('nav button')].every(button => button.disabled), 'written setup choices cannot be edited from the handoff');
  assert.equal(f.doc.activeElement, f.doc.querySelector('h1'));
  const fullText = f.doc.querySelector('textarea').value;
  assert.match(fullText, /Flow QA/); assert.doesNotMatch(fullText, /占位/); assert.match(fullText, /articles\/2026-11\/example\/article\.md/); assert.match(fullText, /AGENT-GUIDE\.md/); assert.match(fullText, /不能用名称拼造路径/);
  await React.act(async () => { f.button('复制提示词').click(); f.button('复制提示词').click(); });
  assert.equal(copyCalls, 1); assert.equal(f.button('复制提示词').disabled, true);
  await React.act(async () => resolveCopy());
  assert.deepEqual(f.copied, [fullText]); assert.equal(f.notices.at(-1).tone, 'success'); assert.deepEqual(f.finished, []);
  await f.click(f.button('进入工作台')); assert.deepEqual(f.finished, [true]);
});

test('copy failure stays on the full prompt and entering without a successful copy is allowed', async t => {
  const f = await guide(t, {}, { copy: async () => { throw new Error('Clipboard denied'); } });
  await reachSaving(f, 'agent'); await prepareLibrary(f);
  await f.click(f.button('复制提示词'));
  assert.equal(f.notices.at(-1).tone, 'error'); assert.deepEqual(f.copied, []);
  assert.ok(f.doc.querySelector('[data-guide-handoff] textarea')); assert.equal(f.button('复制提示词').disabled, false);
  assert.deepEqual(f.finished, []);
  await f.click(f.button('进入工作台')); assert.deepEqual(f.finished, [true]);
});

test('partial initialization freezes committed choices and retries setup without opening an existing library', async t => {
  const plans = []; let opens = 0;
  const f = await guide(t, { onCreate: async plan => { plans.push(plan); return plans.length === 1 ? { status: 'error', created: true, resumable: true, message: 'Preview failed after saving source' } : { status: 'ready' }; }, onOpen: async () => { opens++; return { status: 'ready' }; } });
  await reachSaving(f, 'workspace'); await prepareLibrary(f);
  assert.match(f.doc.querySelector('[role=alert]').textContent, /已保存的模板和示例会保留/);
  assert.equal(f.button('返回').disabled, true);
  assert.ok([...f.doc.querySelectorAll('nav button')].every(button => button.disabled));
  await f.click(f.button('继续准备'));
  assert.equal(plans.length, 2); assert.deepEqual(plans[0], plans[1]); assert.equal(opens, 0);
  assert.deepEqual(f.finished, [true]);
});



test('readiness loss interrupts Agent exit and a late failure cannot show a successful handoff', async t => {
  const f = await guide(t, {}, { reduced: false });
  await reachSaving(f, 'agent'); await prepareLibrary(f);
  await f.click(f.button('进入工作台'));
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.leaving, 'true');
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'true');
  await f.rerender({ workspaceReady: false });
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, []);
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'false');
  assert.equal(f.doc.querySelector('[data-guide-handoff]'), null);
  await f.rerender({ workspaceIssue: 'Settings invalid' });
  await f.endTransition('[data-guide-panel]');
  assert.match(f.doc.querySelector('[role=alert]').textContent, /Settings invalid/);
  await f.rerender({ workspaceReady: true, workspaceIssue: undefined });
  assert.deepEqual(f.finished, []); assert.equal(f.doc.querySelector('[data-guide-handoff]'), null);
});


test('welcome remains silent and skipping it keeps the language choice unselected', async t => {
  const cues = []; let quiet = 0, primed = 0;
  const audio = { prime: () => primed++, play: (...cue) => cues.push(cue), quiet: () => quiet++ };
  const f = await guide(t, { audio });
  assert.deepEqual(cues, []);
  assert.equal(f.doc.querySelector('[data-guide-content]').hidden, true);
  assert.ok(f.doc.querySelector('[data-guide-content]').hasAttribute('inert'));
  await f.click(f.doc.querySelector('[data-guide-welcome]'));
  assert.ok(!f.doc.querySelector('[data-guide-welcome]'));
  assert.equal(f.doc.querySelector('[data-guide-content]').hidden, false);
  assert.equal(f.button('简体中文').getAttribute('aria-pressed'), 'false');
  assert.equal(f.button('继续').disabled, true); assert.equal(quiet, 0); assert.ok(primed);
  assert.deepEqual(cues, []);
});

test('welcome can finish or be skipped by Escape; configuration is silent and the ending has no duration argument', async t => {
  const cues = [];
  const audio = { prime() {}, play: (...cue) => cues.push(cue), quiet() {} };
  const f = await guide(t, { audio });
  await React.act(async () => f.doc.querySelector('[data-guide-welcome]').dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(!f.doc.querySelector('[data-guide-welcome]'));
  await reachSaving(f, 'workspace'); assert.deepEqual(cues, []);
  await prepareLibrary(f); assert.deepEqual(cues, [[]]); assert.deepEqual(f.finished, [true]);
});

test('sound controls and retry notices are absent without blocking the language choices', async t => {
  const f = await guide(t, { audio: { prime() {}, play() {}, quiet() {} } }); await f.flush();
  assert.equal(f.doc.querySelector('button[aria-label*=声音],button[aria-label=静音]'), null);
  assert.equal(f.notices.length, 0);
  await f.click(f.button('简体中文')); assert.equal(f.button('继续').disabled, false);
});

test('skipping only the logo keeps waving, typing and row reveals; language changes and returns never replay them', async t => {
  const f = await guide(t, {}, { reduced: false });
  const stage = () => f.doc.querySelector('[data-guide-greeting-stage]').dataset.guideGreetingStage;
  await f.click(f.doc.querySelector('[data-guide-welcome]'));
  assert.equal(stage(), 'wave');
  assert.equal(f.button('简体中文').disabled, true);
  assert.equal(f.doc.querySelector('[data-guide-line=brand]').getAttribute('aria-hidden'), 'true');
  await React.act(async () => f.doc.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(stage(), 'wave', 'Escape no longer skips the follow-on greeting');
  await f.advanceGreeting();
  assert.equal(stage(), 'typing'); assert.ok(f.doc.querySelector('[data-guide-cursor]'));
  assert.equal(f.doc.querySelector('[data-guide-typed]').textContent, '');
  await f.advanceGreeting();
  assert.equal(f.doc.querySelector('[data-guide-typed]').textContent, '你');
  while (stage() === 'typing') await f.advanceGreeting();
  assert.equal(stage(), 'settle');
  assert.equal(f.doc.querySelector('[data-guide-typed]').textContent, '你好，欢迎来到');
  assert.equal(f.doc.querySelector('[data-guide-cursor]'), null);
  await f.advanceGreeting(); assert.equal(stage(), 'reveal');
  assert.equal(f.button('简体中文').disabled, true, 'controls wait until their rows have appeared');
  await f.advanceGreeting(); assert.equal(stage(), 'ready');
  assert.equal(f.doc.activeElement, f.doc.querySelector('h1'));
  await f.click(f.button('English')); assert.equal(stage(), 'ready');
  await f.click(f.button('继续')); await f.flush();
  await f.click(f.doc.querySelector('button[data-back=true]')); await f.flush();
  assert.equal(stage(), 'ready'); assert.equal(f.doc.querySelector('[data-guide-cursor]'), null);
});

test('reduced motion settles a partially typed greeting and enables all language controls', async t => {
  const f = await guide(t, {}, { reduced: false });
  await f.click(f.doc.querySelector('[data-guide-welcome]')); await f.advanceGreeting(); await f.advanceGreeting();
  await f.setReduced(true);
  assert.equal(f.doc.querySelector('[data-guide-greeting-stage]').dataset.guideGreetingStage, 'ready');
  assert.equal(f.doc.querySelector('[data-guide-typed]').textContent, '你好，欢迎来到');
  assert.equal(f.button('简体中文').disabled, false);
  assert.equal(f.doc.querySelector('[data-guide-line=languages]').hasAttribute('inert'), false);
});

test('backgrounding during the greeting finishes it without replay or hidden-control focus', async t => {
  const f = await guide(t, {}, { reduced: false });
  await f.advanceGreeting();
  assert.equal(f.doc.querySelector('[data-guide-greeting-stage]').dataset.guideGreetingStage, 'wave');
  Object.defineProperty(f.doc, 'hidden', { configurable: true, value: true });
  await React.act(async () => f.doc.dispatchEvent(new f.window.Event('visibilitychange')));
  Object.defineProperty(f.doc, 'hidden', { configurable: true, value: false });
  await React.act(async () => f.doc.dispatchEvent(new f.window.Event('visibilitychange')));
  assert.equal(f.doc.querySelector('[data-guide-greeting-stage]').dataset.guideGreetingStage, 'ready');
  assert.equal(f.button('English').disabled, false);
  assert.equal(f.doc.querySelector('[data-guide-cursor]'), null);
});


test('explore resumes after readiness interruption without creating a library or remembering setup completion', async t => {
  let created = 0, opened = 0;
  const f = await guide(t, { workspaceReady: actualWorkspaceReady(), onCreate: async () => { created++; return { status: 'ready' }; }, onOpen: async () => { opened++; return { status: 'ready' }; } }, { reduced: false });
  await f.enter(); await f.click(f.button('先看看工作台'));
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'true');
  await f.rerender({ workspaceReady: false });
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'false');
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, []);
  await f.rerender({ workspaceReady: true });
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'true');
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [false]);
  assert.equal(created, 0); assert.equal(opened, 0);
});


test('preparation, Agent handoff and completion keep the outgoing panel until its fade ends', async t => {
  let progress, resolve;
  const cues = [];
  const audio = { prime() {}, play: (...cue) => cues.push(cue), quiet() {} };
  const f = await guide(t, { audio, onCreate: (_, report) => { progress = report; return new Promise(done => { resolve = done; }); } }, { reduced: false, realScene: true });
  await reachSaving(f, 'agent'); await prepareLibrary(f);
  const panel = f.doc.querySelector('[data-guide-panel]');
  await React.act(async () => progress('settings'));
  assert.equal(panel.dataset.view, 'steps'); assert.equal(panel.dataset.leaving, 'true'); assert.ok(panel.hasAttribute('inert'));
  assert.equal(f.doc.querySelector('h1').textContent, '准备好了。');
  await f.endTransition('[data-guide-panel]');
  assert.equal(panel.dataset.view, 'preparing'); assert.equal(panel.dataset.leaving, 'false');
  assert.equal(f.doc.querySelector('h1').textContent, '正在为你准备。');
  await React.act(async () => resolve({ status: 'ready' }));
  assert.equal(panel.dataset.view, 'preparing'); assert.equal(panel.dataset.leaving, 'true');
  await f.endTransition('[data-guide-panel]');
  assert.equal(panel.dataset.view, 'handoff');
  assert.equal(f.doc.activeElement, f.doc.querySelector('h1'));
  assert.match(f.button('复制提示词').textContent, /复制提示词/);
  await f.click(f.button('进入工作台'));
  assert.ok(f.doc.querySelector('[data-guide-handoff]'), 'prompt remains while fading out');
  assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'false');
  assert.equal(cues.length, 0);
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [], 'an old surface event cannot bypass the transition');
  await f.endTransition('[data-guide-panel]');
  const outro = f.doc.querySelector('[data-guide-outro=true]');
  assert.ok(outro.querySelector('svg')); assert.ok(outro.querySelector('h1')); assert.ok(outro.querySelector('p'), 'illustration and text share one packing animation');
  assert.equal(outro.querySelector('h1').nextElementSibling.nextElementSibling, null, 'no success check or spare spacer follows the text');
  assert.deepEqual(cues, [[]]);
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [true]);
});

test('a fast preparation failure cancels the pending page change and keeps the recoverable choices', async t => {
  let progress, resolve;
  const f = await guide(t, { onOpen: report => { progress = report; return new Promise(done => { resolve = done; }); } }, { reduced: false });
  await f.enter(); await f.click(f.button('我已经有资料库了'));
  await React.act(async () => progress('settings'));
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.leaving, 'true');
  await React.act(async () => resolve({ status: 'error', message: 'Preparation interrupted' }));
  await f.endTransition('[data-guide-panel]');
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.view, 'steps');
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.leaving, 'false');
  assert.equal(f.doc.activeElement, f.doc.querySelector('[role=alert]'));
  assert.match(f.doc.querySelector('[role=alert]').textContent, /Preparation interrupted/);
  assert.deepEqual(f.finished, []);
});

test('a rapid ready result settles through the transition fallback and reduced motion enters once', async t => {
  const f = await guide(t, {}, { reduced: false });
  await reachSaving(f, 'agent'); await prepareLibrary(f);
  await f.click(f.button('进入工作台'));
  await f.advanceGreeting();
  assert.equal(f.doc.querySelector('[data-guide-panel]').dataset.view, 'complete');
  await f.setReduced(true); assert.deepEqual(f.finished, [true]);
  await f.endTransition('[data-entry-guide]'); assert.deepEqual(f.finished, [true]);
});


test('entering waits for appearance adoption, clears the old mix and retries a failure without finishing', async t => {
  let resolve; const adopted = [], snapshots = [];
  const f = await guide(t, { onAdoptAppearance: (value, theme) => { adopted.push(value); snapshots.push(theme); return new Promise(done => { resolve = done; }); } });
  await f.enter(); await f.click(f.button('先看看工作台'));
  assert.deepEqual(JSON.parse(JSON.stringify(adopted)), [{ themeId: 'rainy-design-slate', colorMode: 'system', custom: null }]);
  const selected = (await import('../src/lib/editorThemes.ts')).getBuiltinEditorThemes('zh-CN').find(theme => theme.id === 'rainy-design-slate');
  assert.deepEqual(snapshots[0], selected); assert.notEqual(snapshots[0], selected);
  assert.equal(f.doc.querySelector('[data-entry-guide]').getAttribute('aria-busy'), 'true'); assert.deepEqual(f.finished, []);
  await f.click(f.button('先看看工作台')); assert.equal(adopted.length, 1);
  await React.act(async () => resolve(false));
  assert.match(f.doc.querySelector('[role=alert]').textContent, /所选外观未能应用/); assert.deepEqual(f.finished, []);
  await f.click(f.button('先看看工作台')); assert.equal(adopted.length, 2);
  await React.act(async () => resolve(true)); await f.flush(); assert.deepEqual(f.finished, [false]);
});

test('a readiness interruption during appearance adoption cannot complete the guide', async t => {
  let resolve;
  const f = await guide(t, { onAdoptAppearance: () => new Promise(done => { resolve = done; }) }, { reduced: false });
  await f.enter(); await f.click(f.button('先看看工作台')); await f.rerender({ workspaceReady: false });
  await React.act(async () => resolve(true)); await f.flush();
  assert.deepEqual(f.finished, []); assert.equal(f.doc.querySelector('[data-entry-guide]').dataset.complete, 'false');
});
