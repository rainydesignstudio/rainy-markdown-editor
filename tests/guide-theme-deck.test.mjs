import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import * as editorThemes from '../src/lib/editorThemes.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';

test('language revisit deals every theme from the same settled stack as the first entrance', async t => {
  const dom = new JSDOM('<main id="root"></main><div data-theme-stage></div><div data-scene-anchor></div>');
  const descriptors = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const doc = dom.window.document;
  doc.querySelector('[data-theme-stage]').getBoundingClientRect = () => new dom.window.DOMRect(48, 240, 1036, 340);
  doc.querySelector('[data-scene-anchor]').getBoundingClientRect = () => new dom.window.DOMRect(48, 300, 400, 400);
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const frames = new Map(); let serial = 0;
  const module = { exports: {} };
  const source = await readFile(new URL('../src/components/onboarding/GuideThemeDeck.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, window: dom.window, document: doc,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    require: withUILocaleImports(id => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return jsx;
      if (id.endsWith('/editorThemes')) return editorThemes;
      throw new Error(`Unexpected import ${id}`);
    }),
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(doc.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  let props = { expanded: true, visible: true, selectedId: '', scheme: 'dark', onSelect() {}, disabled: false };
  const render = async patch => { props = { ...props, ...patch }; await React.act(async () => root.render(jsx.jsx(module.exports.GuideThemeDeck, props))); };
  const frame = () => React.act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); });
  const geometry = () => [...doc.querySelectorAll('.guide-theme-card')].map(card => card.getAttribute('style'));
  await render({});
  const firstStack = geometry();
  assert.equal(doc.querySelector('.guide-deck').dataset.dealt, 'false');
  await frame(); assert.deepEqual(geometry(), firstStack, 'a full paint establishes the starting stack');
  await frame();
  const firstGrid = geometry(); assert.notDeepEqual(firstGrid, firstStack);
  const themes = editorThemes.getBuiltinEditorThemes('zh-CN');
  await render({ selectedId: themes[3].id, expanded: false });
  await render({ visible: false });
  assert.equal(doc.querySelector('.guide-deck').dataset.dealt, 'true', 'confirmation and busy states retain the existing deck transition');
  await render({ visible: true });
  assert.equal(doc.querySelector('.guide-deck').dataset.dealt, 'true');
  await render({ visible: false, selectedId: '', reset: true });
  await render({ expanded: true, visible: true, reset: false });
  assert.equal(doc.querySelector('.guide-deck').dataset.dealt, 'false', 'language return resets the entrance');
  assert.deepEqual(geometry(), firstStack, 'all cards including Dreaming share the original starting geometry');
  await frame(); assert.deepEqual(geometry(), firstStack);
  await frame(); assert.deepEqual(geometry(), firstGrid, 'the second deal ends at the same complete grid');
});
