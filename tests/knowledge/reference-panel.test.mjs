import { captureKnowledgeSelection } from '../../src/lib/knowledge/selection.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../../src/lib/i18n/runtime.ts';

test('light reference navigation preserves the grid and only adopts a real in-document selection', async () => {
  const dom = new JSDOM('<div id="app"></div><p id="outside">Other content</p>');
  const saved = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const i18n = createUII18n('en-US'), t = i18n.getFixedT('en-US', 'knowledge');
  const cite = [], reads = [];
  const document = dom.window.document;
  const library = { bindings: [{ sourceId: 'source', name: 'Source' }], selectedId: 'source', indexed: { source: true }, connection: { status: 'ready', source: {} }, manifest: { documents: [{ path: 'a.md', title: 'A' }, { path: 'b.md', title: 'B' }] }, loading: false, reading: false, document: null,
    select() {}, download() {}, open(path, line = 1) { reads.push(path); library.document = { path, title: path === 'a.md' ? 'A' : 'B', text: 'Repeat\n\nRepeat', line }; },
  };
  const module = { exports: {} };
  const source = await readFile(new URL('../../src/components/knowledge/KnowledgeReferencePanel.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, window: dom.window, document, Node: dom.window.Node,
    require(id) {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return jsx;
      if (id.endsWith('/useKnowledgeLibrary')) return { useKnowledgeLibrary: () => library };
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t }) };
      if (id.endsWith('/knowledge/selection')) return { captureKnowledgeSelection };
      if (id.endsWith('/Toast')) return { useToast: () => () => {} };
      if (id.endsWith('/productMessages')) return { formatProductMessage: String };
      if (id.endsWith('/ContentIcon')) return { ContentIcon: () => null };
      if (id.endsWith('/ScrollViewport')) return { ScrollViewport: 'div' };
      if (id.endsWith('/IconButton')) return { IconButton: ({ tooltip, icon, variant, ...props }) => jsx.jsx('button', { ...props, 'aria-label': tooltip }) };
      if (id.endsWith('/LibraryCard')) return { LibraryCard: ({ title, icon, collapsed, ...props }) => jsx.jsx('button', { ...props, 'aria-label': title, children: title }) };
      if (id.endsWith('/KnowledgeReader')) return { KnowledgeReader: () => jsx.jsxs('div', { 'data-knowledge-content': '', children: [jsx.jsx('p', { 'data-line': 1, children: 'Repeat' }), jsx.jsx('p', { 'data-line': 3, children: 'Repeat' })] }) };
      throw new Error(id);
    },
  });
  const Component = module.exports.KnowledgeReferencePanel, root = createRoot(document.getElementById('app'));
  const props = { root: {}, sessionKey: 1, scope: 'article', isRootCurrent: () => true, disabled: false, onCite: (...args) => cite.push(args) };
  const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label);
  try {
    await React.act(async () => root.render(jsx.jsx(Component, props)));
    assert.match(document.querySelector('h3').textContent, /No document/);
    assert.equal(button(t('adoptExcerpt')).disabled, true);
    assert.equal(document.querySelector('[role="tablist"]'), null);
    await React.act(async () => button(t('addCitation')).click());
    assert.equal(cite[0][0], undefined, 'free-text citation needs no selected source or passage');
    const grid = button('A').parentElement; grid.scrollTop = 77;
    await React.act(async () => button('A').click());
    assert.deepEqual(reads, ['a.md']); assert.equal(document.querySelector('h3').textContent, 'A');
    assert.equal(button(t('adoptExcerpt')).disabled, true);
    const select = async (node, from, to) => React.act(async () => {
      const range = document.createRange(); range.setStart(node, from); range.setEnd(node, to);
      const selection = dom.window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new dom.window.Event('selectionchange'));
    });
    await select(document.getElementById('outside').firstChild, 0, 5);
    assert.equal(button(t('adoptExcerpt')).disabled, true, 'selection outside the reader must not enable adoption');
    await select(document.querySelector('[data-line="3"]').firstChild, 0, 6);
    assert.equal(button(t('adoptExcerpt')).disabled, false);
    await React.act(async () => button(t('adoptExcerpt')).click());
    assert.equal(cite[1][0].content, 'Repeat'); assert.equal(cite[1][0].line, 3, 'duplicate text uses the selected source block, not its first occurrence');
    assert.equal(cite[1][0].endLine, 3); assert.equal(cite[1][1], true);
    await select(document.querySelector('[data-line="3"]').firstChild, 0, 0);
    assert.equal(button(t('adoptExcerpt')).disabled, true, 'cleared selection cannot reuse a stale capture');
    await React.act(async () => [...document.querySelectorAll('nav button')].find(node => node.textContent === 'Source').click());
    assert.equal(grid.scrollTop, 77); assert.match(document.querySelector('h3').textContent, /No document/);
    assert.equal(button(t('adoptExcerpt')).disabled, true);
    await React.act(async () => root.render(jsx.jsx(Component, { ...props, disabled: true })));
    assert.equal(button(t('addCitation')).disabled, true);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
