import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import * as messages from '../src/lib/i18n/productMessages.ts';
import * as sources from '../src/lib/fontSources.ts';
import * as fonts from '../src/lib/localFonts.ts';
import { OPEN_FONT_ASSETS } from '../src/lib/fontCatalog.ts';

const componentSource = await readFile(new URL('../src/components/settings/FontDownloadSettings.tsx', import.meta.url), 'utf8');
const componentCode = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function library(complete = false) {
  const existing = new Set(OPEN_FONT_ASSETS.flatMap(asset => complete ? [asset.file, asset.license] : [asset.license]));
  const writes = [];
  return {
    existing, writes,
    async getDirectoryHandle() { return { async getFileHandle(name, options) {
      if (options?.create) writes.push(name);
      if (existing.has(name)) return {};
      throw new DOMException('missing', 'NotFoundError');
    } }; },
  };
}

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const { window } = dom, document = window.document, originals = new Map();
  for (const [key, value] of Object.entries({ window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  sources.setFontSource('google-fonts');
  const { createRoot } = await import('react-dom/client');
  const i18n = createUII18n('zh-CN'); let locale = 'zh-CN', feedback;
  const module = { exports: {} };
  vm.runInNewContext(componentCode, { module, exports: module.exports, require(id) {
    if (id.endsWith('/OperationFeedback')) return { OperationFeedback: props => { feedback = props; return React.createElement('button', { 'data-diagnostics':true }, 'Details'); } };
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsxRuntime;
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: namespace => ({ t: i18n.getFixedT(locale, namespace) }) };
    if (id.endsWith('/i18n/productMessages')) return messages;
    if (id.endsWith('/fontSources')) return sources;
    if (id.endsWith('/localFonts')) return fonts;
    throw new Error('Unexpected font settings import: ' + id);
  } });
  const root = createRoot(document.getElementById('root'));
  const props = { root: null, onRetry: async () => true };
  const render = async () => { await React.act(async () => root.render(React.createElement(module.exports.FontDownloadSettings, props))); };
  await render();
  return {
    document, window, props, render, feedbackText: () => messages.formatProductMessage(feedback?.notice, i18n.getFixedT(locale, 'messages')),
    button(text) { return [...document.querySelectorAll('button')].find(button => button.textContent === text); },
    async click(element) { assert.ok(element); await React.act(async () => element.click()); },
    async language(value) { locale = value; await render(); },
    async close() {
      fonts.cancelLocalFontDownload(); await React.act(async () => root.unmount()); dom.window.close();
      for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    },
  };
}

test('font source is selectable before connecting; ready fonts expose no redundant download action or network request', async t => {
  const f = await fixture(); t.after(() => f.close());
  let fetches = 0; t.mock.method(globalThis, 'fetch', async () => { fetches++; throw new Error('unexpected fetch'); });
  assert.equal(f.document.querySelectorAll('input[type="radio"]').length, 2);
  assert.equal(f.document.querySelector('input:checked').value, 'google-fonts');
  await f.click(f.document.querySelector('input[value="jsdmirror"]'));
  assert.equal(f.window.localStorage.getItem(sources.FONT_SOURCE_STORAGE_KEY), 'jsdmirror');
  assert.equal(f.document.querySelectorAll('button:not([data-diagnostics])').length, 0);
  assert.match(f.document.body.textContent, /连接资料库后/);
  const directory = library(true); f.props.root = directory; await f.render();
  await React.act(async () => fonts.initializeLocalFonts(directory));
  assert.match(f.document.body.textContent, /字体已就绪/);
  assert.equal(f.document.querySelectorAll('button:not([data-diagnostics])').length, 0);
  assert.equal(fetches, 0); assert.deepEqual(directory.writes, []);
});

test('downloading shows progress and cancel; cancellation preserves retry and existing fonts', async t => {
  const f = await fixture(); t.after(() => f.close());
  const directory = library(); f.props.root = directory; f.props.onRetry = undefined; await f.render();
  let started; const fetching = new Promise(resolve => { started = resolve; });
  t.mock.method(globalThis, 'fetch', () => { started(); return new Promise(() => {}); });
  let pending;
  await React.act(async () => { pending = fonts.initializeLocalFonts(directory); await fetching; });
  assert.match(f.document.querySelector('[role="status"]').textContent, /正在下载字体 0／3/);
  assert.equal(f.feedbackText(), '', 'download progress does not emit repeated diagnostics');
  assert.equal(f.button('补充缺失字体'), undefined);
  await f.click(f.button('取消下载')); await React.act(async () => pending);
  assert.match(f.document.body.textContent, /下载未完成/);
  assert.equal(f.button('重试下载'), undefined); assert.equal(f.button('取消下载'), undefined);
  let retries = 0;
  for (const asset of OPEN_FONT_ASSETS) directory.existing.add(asset.file);
  f.props.onRetry = async () => { retries++; await fonts.initializeLocalFonts(directory); return true; }; await f.render();
  await f.click(f.button('重试下载'));
  assert.equal(retries, 1); assert.match(f.document.body.textContent, /字体已就绪/);
  assert.deepEqual(directory.writes, []);
});

test('errors retain their reason beside retry, translate in place and do not leak into a different library', async t => {
  const f = await fixture(); t.after(() => f.close());
  const directory = library(); f.props.root = directory; await f.render();
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await React.act(async () => { await assert.rejects(fonts.initializeLocalFonts(directory)); });
  assert.match(f.feedbackText(), /503/); assert.ok(f.button('重试下载'));
  await f.language('en-US');
  assert.match(f.feedbackText(), /503/); assert.ok(f.button('Retry download'));
  f.props.root = library(true); await f.render();
  assert.doesNotMatch(f.document.body.textContent + f.feedbackText(), /503|Download incomplete/);
  assert.match(f.document.body.textContent, /Not checked/); assert.ok(f.button('Download missing fonts'));
  assert.deepEqual(directory.writes, []);
});
