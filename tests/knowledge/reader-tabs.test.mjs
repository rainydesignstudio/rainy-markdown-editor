import test from 'node:test';
import assert from 'node:assert/strict';
import { openReadingTab, rememberReadingFrame, backReadingTab, closeReadingTab } from '../../src/lib/knowledge/readerTabs.ts';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const frame = (sourceId, path, scroll = 0) => ({ sourceId, path, line: 1, mode: 'preview', scroll });
test('tabs keep identical paths from separate sources independent and retain their reading positions', () => {
  const a = crypto.randomUUID(), b = crypto.randomUUID(), first = openReadingTab([], '', frame(a, 'same.md'));
  const second = openReadingTab(first.tabs, first.activeId, frame(b, 'same.md'), true, frame(a, 'same.md', 320));
  assert.equal(second.tabs.length, 2); assert.notEqual(second.tabs[0].id, second.tabs[1].id); assert.equal(second.tabs[0].frame.scroll, 320); assert.equal(second.tabs[1].frame.sourceId, b);
  const next = rememberReadingFrame(second.tabs, second.activeId, { ...frame(b, 'same.md', 640), mode: 'source' });
  assert.equal(next[1].frame.scroll, 640); assert.equal(next[0].frame.scroll, 320);
});
test('default links reuse the active tab with its own history, while closing selects a neighbor', () => {
  const source = crypto.randomUUID(), first = openReadingTab([], '', frame(source, 'a.md'));
  const visited = openReadingTab(first.tabs, first.activeId, frame(source, 'b.md'), false, frame(source, 'a.md', 450));
  assert.equal(visited.tabs.length, 1); const back = backReadingTab(visited.tabs, visited.activeId); assert.equal(back.frame.path, 'a.md'); assert.equal(back.frame.scroll, 450);
  const second = openReadingTab(back.tabs, visited.activeId, frame(source, 'c.md'), true);
  const closed = closeReadingTab(second.tabs, second.activeId, second.activeId); assert.equal(closed.activeId, first.activeId);
  assert.equal(closeReadingTab(closed.tabs, closed.activeId, closed.activeId).activeId, '');
});
test('per-tab history remains bounded and closing another tab does not change the active one', () => {
  const source = crypto.randomUUID(); let state = openReadingTab([], '', frame(source, 'start.md'));
  for (let i = 0; i < 120; i++) state = openReadingTab(state.tabs, state.activeId, frame(source, i + '.md'));
  assert.equal(state.tabs[0].history.length, 100);
  const second = openReadingTab(state.tabs, state.activeId, frame(source, 'other.md'), true);
  assert.equal(closeReadingTab(second.tabs, state.activeId, second.activeId).activeId, state.activeId);
});

test('single reading hides the tab strip; plus reveals tabs with contained close actions and keyboard navigation', async () => {
  const dom = new JSDOM('<div id="app"></div>', { pretendToBeVisual: true }), previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const source = await readFile(new URL('../../src/components/knowledge/KnowledgeReaderTabs.tsx', import.meta.url), 'utf8'), module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, document: dom.window.document,
    require(id) {
      if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx;
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: (key, values) => values ? `${key}: ${values.title}` : key }) };
      if (id.endsWith('/ContentIcon')) return { ContentIcon: () => jsx.jsx('span', { 'aria-hidden': true, children: '×' }) };
      if (id.endsWith('/IconButton')) return { IconButton: ({ tooltip, icon, variant, ...props }) => jsx.jsx('button', { ...props, 'aria-label': tooltip, children: icon }) };
      throw new Error(id);
    },
  });
  let state, selections = 0;
  function App() {
    const [current, update] = React.useState(() => openReadingTab([], '', frame('a', 'first.md'))); state = current;
    return jsx.jsxs('div', { children: [
      jsx.jsx('h2', { id: 'reader-title', tabIndex: -1, children: 'Current reading' }),
      jsx.jsx('button', { id: 'plus', onClick: () => update(openReadingTab(current.tabs, current.activeId, frame('b', 'second.md'), true)), children: '+' }),
      jsx.jsx('button', { id: 'ordinary', onClick: () => update(openReadingTab(current.tabs, current.activeId, frame('a', 'next.md'))), children: 'Open current' }),
      jsx.jsx(module.exports.KnowledgeReaderTabs, { ...current, multipleSources: true, panelId: 'reader', onSelect: id => { selections++; update({ tabs: current.tabs, activeId: id }); }, onClose: id => update(closeReadingTab(current.tabs, current.activeId, id)) }),
    ] });
  }
  const root = createRoot(dom.window.document.getElementById('app')), doc = dom.window.document;
  const click = async node => React.act(async () => node.click());
  try {
    await React.act(async () => root.render(jsx.jsx(App, {})));
    assert.equal(doc.querySelector('[role=tablist]'), null);
    await click(doc.getElementById('ordinary')); assert.equal(state.tabs.length, 1); assert.equal(doc.querySelector('[role=tablist]'), null);
    await click(doc.getElementById('plus')); assert.equal(doc.querySelectorAll('[role=tab]').length, 2);
    const tabs = doc.querySelectorAll('[role=tab]');
    assert.equal(tabs[1].querySelector('button'), null, 'interactive controls are not nested');
    assert.ok(tabs[1].parentElement.querySelector('button[aria-label="closeReadingTab: second"]'), 'close action belongs to its tab frame');
    await React.act(async () => { tabs[0].focus(); tabs[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
    assert.equal(doc.activeElement.getAttribute('aria-selected'), 'true');
    const beforeClose = selections;
    await click(tabs[1].parentElement.querySelector('button[aria-label="closeReadingTab: second"]'));
    assert.equal(selections, beforeClose, 'close does not also select the tab');
    assert.equal(state.tabs.length, 1); assert.equal(doc.querySelector('[role=tablist]'), null);
    await click(doc.getElementById('plus')); assert.equal(doc.querySelectorAll('[role=tab]').length, 2);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
