import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { createUII18n } from '../../src/lib/i18n/runtime.ts';
import * as model from '../../src/lib/knowledge/model.ts';
import * as messages from '../../src/lib/i18n/productMessages.ts';

async function moduleFrom(path, resolve) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8'), module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: resolve, console, AbortController, DOMException });
  return module.exports;
}
test('safe knowledge reading strips scripts, handler/style/class injection and remote media while reusing the scoped image loader', async () => {
  const instance = createUII18n('en-US'), images = [];
  const reader = await moduleFrom('../../src/components/knowledge/KnowledgeReader.tsx', id => {
    if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx;
    if (id === 'react-markdown') return { default: ReactMarkdown, __esModule: true };
    if (id === 'remark-gfm') return { default: remarkGfm, __esModule: true };
    if (id === 'rehype-raw') return { default: rehypeRaw, __esModule: true };
    if (id === 'rehype-sanitize') return { default: rehypeSanitize, defaultSchema, __esModule: true };
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: namespace => ({ t: instance.getFixedT('en-US', namespace) }) };
    if (id.endsWith('/knowledge/model')) return model;
    if (id.endsWith('/LibraryArticleImage')) return { LibraryArticleImage: props => { images.push(props); return jsx.jsx('span', { 'data-scoped-image': props.path }); } };
    throw new Error(id);
  });
  let reads = 0, writes = 0;
  const source = { readFile: async () => { reads++; }, createWritable: () => { writes++; } };
  const text = '# Safe\n\n<script>window.stolen=true</script>\n\n<div class="fixed inset-0" style="position:fixed" onclick="steal()">Visible text</div>\n\n[evil](javascript:alert(1))\n\n![local](../assets/picture.png)\n\n![remote](https://example.com/tracker.png)\n\n<video src="https://example.com/movie.mp4" autoplay></video>';
  const html = renderToStaticMarkup(jsx.jsx(reader.KnowledgeReader, { source, path: 'notes/A.md', text, manifest: null, onOpen() {}, onDownload() {} }));
  assert.match(html, /Visible text/); assert.doesNotMatch(html, /<script|onclick|position:fixed|fixed inset|<video|src="https|href="javascript/);
  assert.equal(images.length, 1); assert.equal(images[0].root, null); assert.equal(images[0].readFile, source.readFile); assert.equal(images[0].path, 'assets/picture.png'); assert.equal(images[0].defer, true);
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test('source selection requires a writable library, requests read mode and ignores a late picker from an old root', async () => {
  async function harness({ root = {}, granted = true, stale = false, cancel = false } = {}) {
    let selected = false, connects = 0, pickerCalls = 0, restored = 0, current = true;
    const source = {}, scope = { window: null };
    const react = { useRef: initial => ({ current: initial }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useCallback: callback => callback, useEffect() {} };
    const pickerWindow = { async showDirectoryPicker(options) { assert.equal(this, pickerWindow); pickerCalls++; assert.equal(options.mode, 'read'); assert.equal(options.id, 'rainy-knowledge-source'); if (cancel) throw new DOMException('cancelled', 'AbortError'); if (stale) current = false; selected = true; return source; } };
    const code = await readFile(new URL('../../src/hooks/knowledge/useKnowledgeLibrary.ts', import.meta.url), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      module, exports: module.exports, window: pickerWindow, AbortController, DOMException, require(id) {
        if (id === 'react') return react;
        if (id.endsWith('/directoryBookmark')) return { queryDirectoryReadWritePermission: async () => granted ? 'granted' : 'denied' };
        if (id.endsWith('/i18n/productMessages')) return messages;
        if (id.endsWith('/knowledge/source')) return { async connectKnowledgeSource(target, origin, _store, isCurrent) { assert.equal(target, root); assert.equal(origin, source); assert.equal(isCurrent(), true); connects++; }, async restoreKnowledgeSource() { restored++; return { status: granted ? 'unbound' : 'library-unavailable', binding: null, source: null }; } };
        if (id.endsWith('/knowledge/workerClient')) return { createKnowledgeWorker() { throw new Error('No worker needed before a source is ready'); } };
        if (id.endsWith('/knowledge/model')) return model;
        if (id.endsWith('/knowledge/indexing') || id.endsWith('/knowledge/store') || id.endsWith('/articleExport')) return {};
        throw new Error(id);
      },
    });
    const hook = module.exports.useKnowledgeLibrary(root, 1, () => current); await hook.connect();
    return { selected, connects, pickerCalls, restored };
  }
  assert.deepEqual(await harness(), { selected: true, connects: 1, pickerCalls: 1, restored: 1 });
  assert.equal((await harness({ root: null })).pickerCalls, 0);
  const denied = await harness({ granted: false }); assert.equal(denied.pickerCalls, 0); assert.equal(denied.connects, 0);
  const late = await harness({ stale: true }); assert.equal(late.pickerCalls, 1); assert.equal(late.connects, 0);
  const cancelled = await harness({ cancel: true }); assert.equal(cancelled.connects, 0); assert.equal(cancelled.restored, 0);
});
