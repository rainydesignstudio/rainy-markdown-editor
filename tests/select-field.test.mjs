import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as reactDOM from 'react-dom';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import * as formatters from '../src/lib/i18n/formatters.ts';

async function fixture({ width = 800, height = 900, modal = false, nested = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }), { window } = dom, document = window.document;
  const originals = new Map(), changes = [];
  for (const [key, value] of Object.entries({ window, document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let geometry = { left: 100, right: 340, top: 100, bottom: 140, width: 240, height: 40 }, currentValue = 'all', config;
  Object.defineProperties(window, { innerWidth: { writable: true, value: width }, innerHeight: { writable: true, value: height } });
  window.HTMLElement.prototype.getBoundingClientRect = function () { return this.getAttribute('role') === 'dialog' && !this.hasAttribute('aria-modal') ? { left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200 } : geometry; };
  window.HTMLElement.prototype.getClientRects = function () { return this.hidden || this.type === 'hidden' ? [] : [this.getBoundingClientRect()]; };
  const matches = window.HTMLElement.prototype.matches;
  window.HTMLElement.prototype.matches = function (selector) { return selector === ':popover-open' ? Boolean(this.openPopover) : matches.call(this, selector); };
  window.HTMLElement.prototype.showPopover = function () { this.openPopover = true; this.style.display = 'grid'; };
  const i18n = createUII18n('en-US'), cache = new Map();
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = await readFile(file, 'utf8'), imports = new Map();
    for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
      const id = match[1]; if (!id.startsWith('.') || id.endsWith('/UILocaleProvider') || id.endsWith('/i18n/formatters')) continue;
      let imported;
      for (const extension of ['.tsx', '.ts']) { try { imported = await load(path.resolve(path.dirname(file), id) + extension); break; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      assert.ok(imported, id); imports.set(id, imported);
    }
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, window, document, Node: window.Node, HTMLElement: window.HTMLElement, queueMicrotask,
      ResizeObserver: class { observe() {} disconnect() {} },
      require(id) {
        if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx; if (id === 'react-dom') return reactDOM;
        if (id.endsWith('/UILocaleProvider')) return { useUITranslation: ns => ({ t: i18n.getFixedT('en-US', ns) }), useUILocale: () => ({ locale: 'en-US' }) };
        if (id.endsWith('/i18n/formatters')) return formatters;
        if (imports.has(id)) return imports.get(id); throw new Error('Unexpected module ' + id);
      },
    }); cache.set(file, module.exports); return module.exports;
  }
  const { SelectField } = await load(path.resolve('src/components/global/SelectField.tsx'));
  const { IconPopover } = await load(path.resolve('src/components/global/IconPopover.tsx'));
  const { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('root'));
  function App() {
    const [value, setValue] = React.useState(currentValue), [parentOpen, setParentOpen] = React.useState(false);
    const field = React.createElement(SelectField, { label: 'Choose type', name: 'type', value, ...config, onChange(next) { changes.push(next); currentValue = next; setValue(next); } });
    return React.createElement('section', { id: 'owner', ...(modal ? { role: 'dialog', 'aria-modal': 'true' } : {}) },
      React.createElement('button', { id: 'before' }, 'Before'),
      React.createElement('form', { id: 'form' }, nested ? React.createElement(IconPopover, { label: 'Transfer', kind: 'dialog', open: parentOpen, onToggle: () => setParentOpen(v => !v), onClose: () => setParentOpen(false), icon: 'T' }, field) : field),
      React.createElement('button', { id: 'after' }, 'After'));
  }
  async function render(props, value = currentValue) { config = props; currentValue = value; await React.act(async () => root.render(React.createElement(App))); }
  const click = async element => { assert.ok(element); await React.act(async () => element.click()); };
  const key = async (key, extra = {}) => { await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }))); };
  return {
    window, document, render, click, key, changes,
    get trigger() { return document.querySelector('[role="combobox"]'); },
    get popup() { return document.querySelector('[data-variant="field"]'); },
    row(key) { return [...document.querySelectorAll('[data-choice-row]')].find(node => node.dataset.choiceKey === key); },
    async viewport(w, h, rect = geometry) { window.innerWidth = w; window.innerHeight = h; geometry = rect; await React.act(async () => window.dispatchEvent(new window.Event('resize'))); },
    async close() { await React.act(async () => root.unmount()); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; window.close(); },
  };
}

const hierarchy = [
  { value: 'all', label: 'All types' },
  { id: 'images', label: 'Images', icon: React.createElement('span', null, 'I'), detail: '2', status: 'Ready', children: [
    { id: 'vectors', label: 'Vectors', children: [{ value: 'svg', label: 'SVG', description: 'A long description', detail: 'Vector', tag: 'Tag', status: 'Available', icon: React.createElement('span', null, 'V') }] },
    { value: 'png', label: 'PNG' },
  ] },
  { value: 'disabled', label: 'Disabled', disabled: true },
];

test('flat fields preserve numeric/string and empty values, disabled choices, form data and native change semantics', async () => {
  const f = await fixture();
  try {
    const options = [{ value: '', label: 'Choose' }, { value: 2, label: 'Alpha' }, { value: 3, label: 'Beta' }, { value: 4, label: 'Disabled', disabled: true }];
    await f.render({ options }, 2); await f.click(f.trigger);
    await f.key('End'); assert.equal(f.document.activeElement.dataset.choiceKey, '3'); await f.key('Enter');
    assert.deepEqual(f.changes, ['3']); assert.equal(f.popup, null); assert.equal(f.document.activeElement, f.trigger);
    assert.equal(new f.window.FormData(f.document.querySelector('form')).get('type'), '3');
    await f.click(f.trigger); await f.click(f.row('3')); assert.deepEqual(f.changes, ['3']);
    await f.click(f.trigger); await f.key('a'); assert.equal(f.document.activeElement.dataset.choiceKey, '2'); await f.key('Enter'); assert.deepEqual(f.changes, ['3', '2']);
    await f.click(f.trigger); await f.key('Home'); await f.key('Enter'); assert.equal(f.changes.at(-1), '');
    await f.render({ options, disabled: true }); await f.click(f.trigger); assert.equal(f.popup, null); assert.equal(f.trigger.getAttribute('aria-disabled'), 'true');
    assert.equal(f.trigger.getAttribute('aria-label'), 'Choose type: Choose');
    assert.equal(new f.window.FormData(f.document.querySelector('form')).get('type'), null);
  } finally { await f.close(); }
});

test('folding supports two directories, third-level choices and keyboard navigation without committing directories', async () => {
  const f = await fixture();
  try {
    await f.render({ options: hierarchy }); await f.click(f.trigger); assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'fold');
    await f.key('ArrowDown'); assert.equal(f.document.activeElement.dataset.choiceKey, 'images'); await f.key('ArrowRight');
    await f.key('ArrowDown'); assert.equal(f.document.activeElement.dataset.choiceKey, 'vectors'); await f.key('ArrowRight');
    await f.key('ArrowDown'); assert.equal(f.document.activeElement.dataset.choiceKey, 'svg'); assert.equal(f.row('svg').getAttribute('aria-level'), '3');
    assert.match(f.row('svg').textContent, /A long description/); assert.match(f.row('svg').textContent, /VectorTagAvailable/); assert.deepEqual(f.changes, []);
    await f.key('Enter'); assert.deepEqual(f.changes, ['svg']); assert.match(f.trigger.textContent, /SVG/);
  } finally { await f.close(); }
});

test('cramped anchors use drill navigation, stay within the viewport and restore the same selected path in folding mode', async () => {
  const f = await fixture({ width: 280, height: 260 });
  try {
    await f.viewport(280, 260, { left: 230, right: 270, top: 210, bottom: 250, width: 40, height: 40 });
    await f.render({ options: hierarchy }); await f.click(f.trigger); assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'drill');
    assert.ok(Number.parseFloat(f.popup.style.left) >= 8); assert.ok(Number.parseFloat(f.popup.style.left) + Number.parseFloat(f.popup.style.width) <= 272);
    assert.ok(Number.parseFloat(f.popup.style.top) >= 8); assert.equal(f.popup.getAttribute('popover'), 'manual');
    await f.click(f.row('images')); await f.click(f.row('vectors')); assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'drill'); assert.deepEqual(f.changes, []);
    await f.key('ArrowLeft'); assert.ok(f.row('vectors')); await f.click(f.row('vectors')); await f.click(f.row('svg'));
    await f.viewport(900, 900); await f.click(f.trigger); assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'fold');
    assert.equal(f.document.activeElement.dataset.choiceKey, 'svg'); assert.equal(f.row('images').getAttribute('aria-expanded'), 'true'); assert.equal(f.row('vectors').getAttribute('aria-expanded'), 'true');
  } finally { await f.close(); }
});

test('popup belongs to its modal, Escape preserves the parent, Tab follows the field and outside/resize close it', async () => {
  const f = await fixture({ modal: true }); let escapes = 0;
  const parentKey = event => { if (event.key === 'Escape') escapes++; };
  f.window.addEventListener('keydown', parentKey);
  try {
    await f.render({ options: hierarchy }); await f.click(f.trigger); assert.equal(f.popup.parentElement.id, 'owner');
    await f.key('Escape'); assert.equal(escapes, 0); assert.equal(f.popup, null); assert.equal(f.document.activeElement, f.trigger);
    await f.click(f.trigger); await f.key('Tab'); assert.equal(f.document.activeElement.id, 'after');
    await f.click(f.trigger); await f.key('Tab', { shiftKey: true }); assert.equal(f.document.activeElement.id, 'before');
    await f.click(f.trigger); await React.act(async () => f.document.body.dispatchEvent(new f.window.Event('pointerdown', { bubbles: true }))); assert.equal(f.popup, null);
    await f.click(f.trigger); await f.viewport(500, 400); assert.equal(f.popup, null);
  } finally { f.window.removeEventListener('keydown', parentKey); await f.close(); }
});

test('changing presentation preserves a manually browsed directory even before selecting a value', async () => {
  const f = await fixture({ width: 280, height: 260 });
  try {
    await f.render({ options: hierarchy }); await f.click(f.trigger); await f.click(f.row('images'));
    assert.ok(f.row('vectors')); assert.deepEqual(f.changes, []);
    await f.viewport(900, 900); await f.click(f.trigger);
    assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'fold');
    assert.equal(f.row('images').getAttribute('aria-expanded'), 'true'); assert.ok(f.row('vectors'));
    await f.viewport(280, 260); await f.click(f.trigger);
    assert.equal(f.document.querySelector('[data-select-mode]').dataset.selectMode, 'drill'); assert.ok(f.row('vectors'));
    await f.click(f.row('vectors')); await f.viewport(900, 900); await f.click(f.trigger);
    assert.equal(f.row('vectors').getAttribute('aria-expanded'), 'true'); assert.ok(f.row('svg')); assert.deepEqual(f.changes, []);
  } finally { await f.close(); }
});

test('tool UI contains no native select/option definitions or programmatic native choice creation', async () => {
  async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat(); }
  const violations = [];
  for (const file of (await files('src')).filter(file => /\.[jt]sx?$/.test(file))) {
    const source = await readFile(file, 'utf8'), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ['select', 'option'].includes(node.tagName.getText(tree))) violations.push(file + ':' + node.tagName.getText(tree));
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createElement' && ts.isStringLiteral(node.arguments[0]) && ['select', 'option'].includes(node.arguments[0].text)) violations.push(file + ':createElement');
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(violations, []);
});


test('nested selectors keep their owning action popup open through pointer selection and scrolling', async () => {
  const f = await fixture({ modal: true, nested: true });
  try {
    await f.render({ options: [{ value: 'all', label: 'All' }, { value: 'other', label: 'Other shelf' }] });
    await f.click(f.document.querySelector('[aria-label="Transfer"]'));
    await f.click(f.trigger);
    await React.act(async () => f.row('other').dispatchEvent(new f.window.Event('scroll', { bubbles: true })));
    assert.ok(f.document.querySelector('[role="dialog"][aria-label="Transfer"]'));
    await React.act(async () => f.row('other').dispatchEvent(new f.window.MouseEvent('pointerdown', { bubbles: true })));
    await f.click(f.row('other'));
    assert.deepEqual(f.changes, ['other']);
    assert.ok(f.document.querySelector('[role="dialog"][aria-label="Transfer"]'), 'choosing a target must leave move/copy actions usable');
    await React.act(async () => f.document.getElementById('after').dispatchEvent(new f.window.MouseEvent('pointerdown', { bubbles: true })));
    assert.equal(f.document.querySelector('[role="dialog"][aria-label="Transfer"]'), null);
  } finally { await f.close(); }
});
