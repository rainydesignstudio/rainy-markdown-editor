import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readKnowledgePreview } from '../../src/lib/knowledge/preview.ts';
import * as messages from '../../src/lib/i18n/productMessages.ts';

test('a focused local preview stays inert, repositions after loading and ignores a late result after blur', async () => {
  const dom = new JSDOM('<div id="app"></div>', { pretendToBeVisual: true });
  const previous = new Map(); let resize, tipHeight = 30, resolveFile, reads = 0;
  class Observer { constructor(callback) { resize = callback; } observe() {} disconnect() {} }
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, ResizeObserver: Observer, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  Object.defineProperty(dom.window, 'innerHeight', { value: 300 });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.getAttribute('role') === 'tooltip' ? { left: 0, top: 0, width: 240, height: tipHeight } : { left: 100, top: 170, bottom: 200, width: 80, height: 30 };
  };
  async function load(file, resolve) {
    const code = await readFile(new URL('../../src/components/' + file, import.meta.url), 'utf8'), module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, document: dom.window.document, window: dom.window, ResizeObserver: Observer,
      require(id) { if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx; if (id === 'react-dom') return { createPortal }; return resolve(id); },
    });
    return module.exports;
  }
  const { TooltipButton } = await load('global/TooltipButton.tsx', id => { throw new Error(id); });
  const { KnowledgeHoverPreview } = await load('knowledge/KnowledgeHoverPreview.tsx', id => {
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: key => key }) };
    if (id.endsWith('/knowledge/preview')) return { readKnowledgePreview };
    if (id.endsWith('/productMessages')) return messages;
    throw new Error(id);
  });
  const source = { binding: { name: 'Source A' }, readFile: () => { reads++; return new Promise(resolve => { resolveFile = resolve; }); }, assertCurrent: async () => {} };
  const root = createRoot(dom.window.document.getElementById('app'));
  const app = () => jsx.jsx(TooltipButton, { tooltip: jsx.jsx(KnowledgeHoverPreview, { source, path: 'a.md', title: 'A' }), children: 'Read A' });
  try {
    await React.act(async () => root.render(app())); assert.equal(reads, 0);
    const button = dom.window.document.querySelector('button');
    await React.act(async () => button.focus()); assert.equal(reads, 1);
    let tooltip = dom.window.document.querySelector('[role=tooltip]'); assert.equal(tooltip.style.top, '208px');
    tipHeight = 160;
    await React.act(async () => { resolveFile(new File(['<img src="https://example.test/tracker">Plain text'], 'a.md')); });
    await React.act(async () => resize());
    tooltip = dom.window.document.querySelector('[role=tooltip]');
    assert.equal(tooltip.style.top, '8px', 'asynchronous text growth is clamped above the trigger');
    assert.match(tooltip.textContent, /<img src=/); assert.equal(tooltip.querySelector('img'), null);
    await React.act(async () => button.blur()); assert.equal(dom.window.document.querySelector('[role=tooltip]'), null);
    await React.act(async () => button.focus());
    await React.act(async () => button.blur());
    await React.act(async () => resolveFile(new File(['Late stale text'], 'a.md')));
    assert.equal(dom.window.document.querySelector('[role=tooltip]'), null);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
