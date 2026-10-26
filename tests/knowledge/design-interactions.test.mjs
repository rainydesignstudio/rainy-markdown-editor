import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { captureKnowledgeSelection } from '../../src/lib/knowledge/selection.ts';
import { inspectCapture } from '../../src/lib/knowledge/research.ts';
import * as messages from '../../src/lib/i18n/productMessages.ts';
import * as model from '../../src/lib/knowledge/model.ts';

async function load(file, resolve, scope = {}) {
  const source = await readFile(new URL('../../src/' + file, import.meta.url), 'utf8'), module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, AbortController, DOMException, ...scope,
    require(id) { if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx; return resolve(id); },
  });
  return module.exports;
}
function environment() {
  const dom = new JSDOM('<button id="opener">Help</button><div id="app"></div><p id="outside">Outside</p>', { pretendToBeVisual: true });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  const root = createRoot(dom.window.document.getElementById('app'));
  return { ...dom, root, window: dom.window, document: dom.window.document, async close() { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
}

test('source captures use the selected block, fence content lines, and reject cross-document ranges', () => {
  const dom = new JSDOM('<div id="body"><p data-line="1">Repeat</p><p data-line="3">Repeat</p><pre data-line="5" data-source-column="1">first\nsecond\n</pre></div><p id="outside">Outside</p>');
  const document = dom.window.document, selected = dom.window.getSelection(), body = document.getElementById('body');
  const doc = { path: 'A.md', title: 'A', text: 'Repeat\r\n\r\nRepeat\r\n\r\n```txt\r\nfirst\r\nsecond\r\n```' };
  const select = (start, from, end = start, to = start.textContent.length) => { const range = document.createRange(); range.setStart(start, from); range.setEnd(end, to); selected.removeAllRanges(); selected.addRange(range); };
  try {
    select(body.querySelector('[data-line="3"]').firstChild, 0);
    const repeated = captureKnowledgeSelection(body, selected, doc, 'source');
    assert.equal(repeated.line, 3); assert.equal(repeated.original, 'Repeat');
    const code = body.querySelector('pre').firstChild; select(code, 0, code, 12);
    const capture = captureKnowledgeSelection(body, selected, doc, 'source');
    assert.equal(capture.line, 6); assert.equal(capture.endLine, 7);
    assert.equal(inspectCapture(capture, doc.text).changed, false, 'LF snapshots of unchanged CRLF passages remain unchanged');
    select(code, 0, document.getElementById('outside').firstChild, 3);
    assert.equal(captureKnowledgeSelection(body, selected, doc, 'source'), null);
    select(code, 0, code, 0); assert.equal(captureKnowledgeSelection(body, selected, doc, 'source'), null);
  } finally { dom.window.close(); }
});

test('fragment navigation keeps the loaded document mounted, while explicit reads and source switches invalidate it', async () => {
  const f = environment(), rootHandle = {}, sourceA = { readFile: async () => ({ name: 'A.md', size: 10, lastModified: 1 }) }, sourceB = { ...sourceA };
  let api, reads = 0;
  const { useKnowledgeLibrary } = await load('hooks/knowledge/useKnowledgeLibrary.ts', id => {
    if (id.endsWith('/directoryBookmark')) return { queryDirectoryReadWritePermission: async () => 'granted' };
    if (id.endsWith('/i18n/productMessages')) return messages;
    if (id.endsWith('/knowledge/model')) return model;
    if (id.endsWith('/knowledge/source')) return { readKnowledgeBindings: async () => [{ sourceId: 'a' }, { sourceId: 'b' }], restoreKnowledgeSource: async (_root, _store, _current, id) => ({ status: 'ready', binding: { sourceId: id }, source: id === 'a' ? sourceA : sourceB }) };
    if (id.endsWith('/knowledge/store')) return { readKnowledgeIndexStates: async () => ({}), readKnowledgeIndex: async () => ({ status: 'ready', documents: [] }) };
    if (id.endsWith('/knowledge/workerClient')) return { createKnowledgeWorker: () => ({ dispose() {}, request: async () => { reads++; return { text: '# One\n\n## Two', truncated: false }; } }) };
    if (id.endsWith('/knowledge/indexing') || id.endsWith('/articleExport')) return {};
    throw new Error(id);
  }, { window: f.window });
  function Probe() { api = useKnowledgeLibrary(rootHandle, 1, () => true); return jsx.jsx('span', { children: api.document?.text ?? 'none' }); }
  try {
    await React.act(async () => f.root.render(jsx.jsx(Probe, {})));
    await React.act(async () => api.select('a'));
    await React.act(async () => api.open('A.md'));
    const mutations = [], observer = new f.window.MutationObserver(() => mutations.push(f.document.querySelector('#app').textContent)); observer.observe(f.document.getElementById('app'), { childList: true, subtree: true });
    await React.act(async () => api.open('A.md', 1, 'two'));
    assert.equal(reads, 1); assert.equal(api.document.fragment, 'two'); assert.ok(mutations.every(value => value !== 'none'));
    await React.act(async () => api.open('A.md')); assert.equal(reads, 2, 'explicit reopen still checks the source');
    await React.act(async () => api.select('b')); assert.equal(api.document, null);
    await React.act(async () => api.open('A.md', 1, 'two')); assert.equal(reads, 3, 'cache never crosses source identities'); observer.disconnect();
  } finally { await f.close(); }
});
