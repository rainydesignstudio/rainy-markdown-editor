import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const code = ts.transpileModule(await readFile(new URL('../src/components/themes/LibraryCssEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
  dom.window.HTMLElement.prototype.attachEvent = dom.window.HTMLElement.prototype.detachEvent = () => {};
  const globals = ['window', 'document', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: callback => callback(), IS_REACT_ACT_ENVIRONMENT: true });
  const runtime = { snapshot: { id: 'first', renderer: {}, error: null } }, root = { name: 'test-library' }, ref = React.createRef(), states = [];
  let disk = 'p {color:red}', writes = 0, reloads = 0, input, saveWait, failReload = false, liveRoot = root;
  const props = { root, snapshot: runtime.snapshot, isRootCurrent: value => value === liveRoot, themeCss: '.theme {}', onThemeCss() {}, onState: value => states.push(value) };
  const module = { exports: {} };
  const message = value => typeof value === 'object' ? value?.messageKey ?? value?.message ?? '' : String(value ?? '');
  class ProductError extends Error { constructor(key) { super(key); this.messageKey = key; } }
  const element = (tag, p, children) => React.createElement(tag, p, children);
  const imports = {
    react: React, 'react/jsx-runtime': jsx,
    '../../lib/article-format/sourceStyles': { libraryCssPaths: () => ['format/shared.css'], readLibraryCss: async (root, snapshot, path) => ({ root, snapshot, path, text: disk, hash: 'hash' }), saveLibraryCss: async (_source, text, current) => { if (!current()) throw new Error('stale'); writes++; await saveWait; if (!current()) throw new Error('stale'); disk = text; } },
    '../../lib/article-format/library': { activateLibraryFormat: async () => { reloads++; if (failReload) return { snapshot: { error: 'reload-error' } }; runtime.snapshot = { id: 'reloaded-' + reloads, renderer: {}, error: null }; return { snapshot: runtime.snapshot }; } },
    '../../lib/article-format/package': { disposeRendererRunners() {} },
    '../../lib/article-format/runtime': { getFormatSnapshot: () => runtime.snapshot, invalidateFormatBundle() { runtime.snapshot = { id: 'loading', loading: true }; } },
    '../../lib/i18n/productMessages': { ProductError, productCause: message, productReference: key => ({ messageKey: key }) },
    '../global/UILocaleProvider': { useUITranslation: () => ({ t: key => key }) },
    '../global/SelectField': { SelectField: p => element('div', { 'data-choices': true }, p.options.map(option => element('button', { key: option.value, 'data-value': option.value, disabled: p.disabled, onClick: () => p.onChange(option.value) }, option.label))) },
    '../global/ContentIcon': { ContentIcon: () => null },
    '../global/IconButton': { IconButton: p => element('button', { 'data-reload': true, disabled: p.disabled, onClick: p.onClick }, p.tooltip) },
    '../global/OperationFeedback': { OperationFeedback: p => element('output', {}, message(p.notice)) },
    '../global/UnsavedChangesDialog': { UnsavedChangesDialog: p => element('div', { 'data-unsaved': true }, [element('button', { key: 'continue', onClick: p.onContinue }, 'continue'), element('button', { key: 'discard', onClick: p.onDiscard }, 'discard'), element('button', { key: 'save-leave', onClick: p.onSave }, 'save-leave')]) },
    '../content/SnippetTextarea': { SnippetTextarea: React.forwardRef((p, ref) => { input = p; return element('textarea', { ref, value: p.value, disabled: p.disabled, readOnly: true, 'aria-label': p.ariaLabel }); }) },
  };
  vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, requestAnimationFrame: callback => callback(), require(id) { if (!(id in imports)) throw new Error(id); return imports[id]; } });
  const mount = createRoot(dom.window.document.getElementById('root'));
  const render = () => mount.render(element(module.exports.LibraryCssEditor, { ...props, ref }));
  await React.act(async () => { render(); });
  t.after(async () => { await React.act(async () => mount.unmount()); dom.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const click = async label => { const button = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === label); assert.ok(button, label); await React.act(async () => button.click()); };
  return { ref, props, states, document: dom.window.document, writes: () => writes, reloads: () => reloads, disk: () => disk,
    edit: text => React.act(async () => input.onChange(text)), click,
    delaySave: value => { saveWait = value; }, failReload: value => { failReload = value; },
    render: async () => { props.snapshot = runtime.snapshot; await React.act(async () => render()); },
    switchRoot: async () => { liveRoot = props.root = { name: 'other-library' }; await React.act(async () => render()); },
  };
}

test('library CSS loads without a toast event; closing or switching source protects an unsaved draft', async t => {
  const f = await fixture(t);
  assert.equal(f.document.querySelector('textarea').value, 'p {color:red}');
  assert.equal(f.document.querySelector('output').textContent, '');
  assert.equal(f.writes(), 0);
  await f.edit('p {color:blue}');
  let closed = 0;
  await React.act(async () => f.ref.current.leave(() => closed++));
  assert.ok(f.document.querySelector('[data-unsaved]')); assert.equal(closed, 0);
  await f.click('continue'); assert.equal(f.document.querySelector('textarea').value, 'p {color:blue}');
  await f.click('libraryCss.themeSource'); assert.ok(f.document.querySelector('[data-unsaved]'));
  await f.click('discard');
  assert.equal(f.document.querySelector('textarea').value, '.theme {}'); assert.equal(f.writes(), 0);
});

test('the shared-scope explanation can close without changing the CSS draft', async t => {
  const f = await fixture(t); await f.edit('p {color:blue}');
  assert.match(f.document.body.textContent, /libraryCss.sharedScope/);
  await f.click('common:actions.close');
  assert.doesNotMatch(f.document.body.textContent, /libraryCss.sharedScope/);
  assert.equal(f.document.querySelector('textarea').value, 'p {color:blue}');
  assert.equal(f.writes(), 0); assert.equal(f.states.at(-1).dirty, true);
});

test('save locks duplicate clicks, reloads the new snapshot and makes the close guard clean', async t => {
  const f = await fixture(t); await f.edit('p {color:blue}');
  let finish; f.delaySave(new Promise(resolve => { finish = resolve; }));
  await f.click('libraryCss.save'); await f.click('ui.saving');
  assert.equal(f.writes(), 1); assert.equal(f.states.at(-1).busy, true);
  await React.act(async () => { finish(); }); await f.render();
  assert.equal(f.disk(), 'p {color:blue}'); assert.equal(f.states.at(-1).dirty, false);
  assert.equal(f.document.querySelector('output').textContent, 'libraryCss.saved');
  let closed = 0; await React.act(async () => f.ref.current.leave(() => closed++)); assert.equal(closed, 1);
});

test('a failed reload after a successful save retries reload without writing the source twice', async t => {
  const f = await fixture(t); await f.edit('p {color:blue}'); f.failReload(true);
  await f.click('libraryCss.save');
  assert.equal(f.writes(), 1); assert.equal(f.disk(), 'p {color:blue}'); assert.equal(f.states.at(-1).dirty, false);
  assert.equal(f.document.querySelector('output').textContent, 'libraryCss.reloadFailed');
  f.failReload(false);
  await React.act(async () => f.document.querySelector('[data-reload]').click());
  assert.equal(f.writes(), 1); assert.equal(f.reloads(), 2);
  assert.equal(f.document.querySelector('output').textContent, 'libraryCss.reloaded');
});

test('a library switch invalidates an in-flight CSS save and does not reload the new library', async t => {
  const f = await fixture(t); await f.edit('p {color:blue}');
  let finish; f.delaySave(new Promise(resolve => { finish = resolve; }));
  await f.click('libraryCss.save'); await f.switchRoot();
  await React.act(async () => { finish(); });
  assert.equal(f.disk(), 'p {color:red}'); assert.equal(f.reloads(), 0);
  assert.equal(f.document.querySelector('output').textContent, '');
});
