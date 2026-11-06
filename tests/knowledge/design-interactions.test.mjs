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


test('cross-source search stays lazy, preserves identical paths and reports sources omitted from the result', async () => {
  const f = environment(), rootHandle = {}, restored = [], searched = [];
  let api;
  const bindings = ['a', 'b', 'c', 'd'].map(sourceId => ({ sourceId, name: 'Source ' + sourceId, directory: sourceId }));
  const sources = Object.fromEntries(bindings.map(binding => [binding.sourceId, { binding, readFile: async () => new File(['Body ' + binding.sourceId], 'same.md') }]));
  const { useKnowledgeLibrary } = await load('hooks/knowledge/useKnowledgeLibrary.ts', id => {
    if (id.endsWith('/directoryBookmark')) return { queryDirectoryReadWritePermission: async () => 'granted' };
    if (id.endsWith('/i18n/productMessages')) return messages;
    if (id.endsWith('/knowledge/model')) return model;
    if (id.endsWith('/knowledge/source')) return { readKnowledgeBindings: async () => bindings, restoreKnowledgeSource: async (_root, _store, isCurrent, sourceId) => { restored.push(sourceId); const source = sources[sourceId]; return { status: sourceId === 'c' ? 'needs-permission' : 'ready', binding: bindings.find(item => item.sourceId === sourceId), source: sourceId === 'c' ? null : { ...source, readFile: async () => { if (!isCurrent()) throw new messages.ProductError('knowledge.changed'); return source.readFile(); } } }; } };
    if (id.endsWith('/knowledge/store')) return { readKnowledgeIndexStates: async () => ({}), readKnowledgeIndex: async (_root, source) => source.binding.sourceId === 'd' ? null : { sourceId: source.binding.sourceId, status: 'ready', documents: [] } };
    if (id.endsWith('/knowledge/indexing')) return { searchKnowledgeIndex: async (_root, source, _index, query) => { searched.push([source.binding.sourceId, query.text]); return { hits: [{ path: 'same.md', title: 'Same', line: 2, snippet: 'Evidence', score: source.binding.sourceId === 'b' ? 20 : 10 }], total: 1 }; } };
    if (id.endsWith('/knowledge/workerClient')) return { createKnowledgeWorker: () => ({ dispose() {}, request: async (operation, args) => operation === 'rank' ? args[0].sort((a, b) => b.score - a.score) : { text: await args[0].text(), truncated: false } }) };
    if (id.endsWith('/articleExport')) return {};
    throw new Error(id);
  }, { window: f.window });
  function Probe() { api = useKnowledgeLibrary(rootHandle, 1, () => true); return jsx.jsx('span', { children: api.document?.text ?? '' }); }
  const settle = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
  try {
    await React.act(async () => f.root.render(jsx.jsx(Probe, {})));
    assert.equal(restored.length, 0, 'startup does not restore or scan every source');
    await React.act(async () => api.setQuery('Evidence')); await settle();
    assert.deepEqual(Array.from(api.results.hits, hit => hit.sourceId), ['b', 'a']);
    assert.equal(api.results.hits[0].sourceName, 'Source b');
    assert.equal(api.results.total, 2); assert.equal(api.results.incomplete, true);
    assert.deepEqual(Array.from(api.results.problems, problem => problem.reason), ['unavailable', 'indexMissing']);
    await React.act(async () => api.setScope('b')); await settle();
    assert.equal(api.results.total, 1); assert.equal(api.results.incomplete, false);
    assert.deepEqual(searched.at(-1), ['b', 'Evidence']);
    await React.act(async () => api.open('same.md', 2, undefined, 'a'));
    assert.equal(api.document.sourceId, 'a'); assert.equal(api.document.text, 'Body a');
    await React.act(async () => api.open('linked.md', 1, 'details', 'a'));
    assert.equal(api.document.path, 'linked.md', 'a second read keeps the restored source valid');
    assert.equal(api.issue, null);
    await React.act(async () => api.open('same.md', 2, undefined, 'b'));
    assert.equal(api.document.sourceId, 'b'); assert.equal(api.document.text, 'Body b');
    await React.act(async () => api.open('same.md', 2, undefined, 'c'));
    assert.equal(api.document, null, 'an unreadable tab cannot retain another source body');
    assert.equal(api.connection.status, 'needs-permission');
  } finally { await f.close(); }
});
