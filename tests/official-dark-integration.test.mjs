import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';

const engineSource = await readFile(new URL('../public/format/article-format-engine.js', import.meta.url), 'utf8');
const adapterSource = await readFile(new URL('../resources/presets/platform/wechat-article/format/algorithms/mp-darkmode.adapter.js', import.meta.url), 'utf8');

function engine() {
  const calls = [], operations = [];
  class Element {
    constructor(name, computed = {}, children = []) {
      this.name = name; this.computed = computed; this.children = children;
      this.priorities = {};
      this.style = {
        getPropertyPriority: key => this.priorities[key] || '',
        setProperty: (key, value, priority) => operations.push(['write', name, key, value, priority]),
      };
    }
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
  }
  const window = {
    ArticleColorNormalizer: () => ({ normalizePaint: value => value }),
    Darkmode: { run: (nodes, options) => calls.push({ nodes, options }) },
  };
  vm.runInNewContext(engineSource, {
    window, document: {}, HTMLElement: Element,
    getComputedStyle: node => ({ getPropertyValue: key => { operations.push(['read', node.name, key]); return node.computed[key] || ''; } }),
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInNewContext(adapterSource, {
    window, document: {}, HTMLElement: Element, CSS: { supports: () => true },
    getComputedStyle: node => ({ getPropertyValue: key => { operations.push(['read', node.name, key]); return node.computed[key] || ''; } }),
  }, { codeGeneration: { strings: false, wasm: false } });
  const transform = (root, bundle) => {
    if (bundle.formatter.preview.dark.transform === 'preserve') return;
    const preview = bundle.formatter.preview;
    return window.ArticleAlgorithm.transform(root, { background: preview.dark.background, options: preview.dark.options, inlineProperties: bundle.formatter.output.inlineProperties });
  };
  return { Element, calls, operations, window, transform };
}

test('the distributed official algorithm and license are unchanged upstream artifacts', async () => {
  const [actual, upstream, license, upstreamLicense] = await Promise.all([
    '../resources/presets/platform/wechat-article/format/algorithms/mp-darkmode.js', '../node_modules/mp-darkmode/dist/darkmode.min.js',
    '../resources/presets/platform/wechat-article/format/algorithms/mp-darkmode.LICENSE', '../node_modules/mp-darkmode/LICENSE',
  ].map(path => readFile(new URL(path, import.meta.url))));
  assert.deepEqual(actual, upstream);
  assert.deepEqual(license, upstreamLicense);
});

test('the official default preset delegates text color to upstream instead of overriding it', () => {
  const bundle = compileFormatBundle(DEFAULT_FORMAT_BUNDLE);
  assert.equal(bundle.formatter.preview.dark.transform, 'mp-darkmode');
  assert.equal(bundle.formatter.preview.dark.options.mode, 'dark');
  assert.equal(Object.hasOwn(bundle.formatter.preview.dark.options, 'defaultDarkTextColor'), false);
});

test('the SDK receives the article root and descendants in document order, including root text and paint', () => {
  const api = engine();
  const child = new api.Element('child', { color: 'rgb(25, 25, 25)' });
  const root = new api.Element('root', { color: 'rgb(25, 25, 25)', border: '1px solid rgb(25, 25, 25)' }, [child]);
  const bundle = compileFormatBundle(DEFAULT_FORMAT_BUNDLE);
  api.transform(root, bundle);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].nodes[0], root);
  assert.equal(api.calls[0].nodes[1], child);
  assert.ok(api.operations.some(op => op[0] === 'write' && op[1] === 'root' && op[2] === 'border'));
  const firstWrite = api.operations.findIndex(op => op[0] === 'write');
  assert.ok(api.operations.slice(firstWrite).every(op => op[0] !== 'read'), 'capture the original computed paint before mutating ancestors');
  assert.throws(() => api.calls[0].options.error(new Error('SDK failure')), /SDK failure/);
});

test('explicit library options survive SDK invocation and the preserve strategy needs no SDK', () => {
  const api = engine(), root = new api.Element('root');
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  const options = raw.formatter.steps.find(step => step.operator === 'preview.dark-mode').parameters.options;
  options.defaultDarkTextColor = '#abcdef';
  options.defaultDarkBgColor = '#123456';
  options.whitelist = { attribute: ['data-custom-skip'], tagName: ['span'] };
  const bundle = compileFormatBundle(raw);
  const original = structuredClone(bundle.formatter.preview.dark.options);
  api.transform(root, bundle);
  assert.equal(api.calls[0].options.defaultDarkTextColor, '#abcdef');
  assert.equal(api.calls[0].options.defaultDarkBgColor, '#123456');
  assert.deepEqual(api.calls[0].options.whitelist, original.whitelist);
  assert.deepEqual(bundle.formatter.preview.dark.options, original);
  bundle.formatter.preview.dark.transform = 'preserve';
  delete api.window.Darkmode;
  api.transform(root, bundle);
  assert.equal(api.calls.length, 1);
  bundle.formatter.preview.dark.transform = 'mp-darkmode';
  assert.throws(() => api.transform(root, bundle), /unavailable/);
});

test('preparing inline paint preserves authored importance for the official SDK', () => {
  const api = engine(), root = new api.Element('root', { color: 'rgb(25, 25, 25)' });
  root.priorities.color = 'important';
  api.transform(root, compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
  assert.equal(api.operations.find(op => op[0] === 'write' && op[2] === 'color')[4], 'important');
});
