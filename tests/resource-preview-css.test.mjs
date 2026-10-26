import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import { createUII18n } from '../src/lib/i18n/runtime.ts';

const code = ts.transpileModule(await readFile(new URL('../src/components/content/PreviewCssDetails.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function fixture() {
  const cells = [], module = { exports: {} }, i18n = createUII18n('en-US'); let cursor = 0, active = 'css-test';
  const props = { css: '.actual { color:red }', ready: true, revision: {}, snapshot: { id: active, bundle: { support: { meta: { id: 'test-library' } } } }, dark: false, hostRef: { current: null }, target: null };
  vm.runInNewContext(code, { module, exports: module.exports, document: { body: {} }, require(id) {
    if (id === 'react') return { useId: () => 'css-dialog', useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], next => cells[index] = next]; } };
    if (id === 'react/jsx-runtime') return jsx;
    if (id === 'react-dom') return { createPortal: node => node };
    if (id.endsWith('/runtime')) return { getFormatSnapshot: () => ({ id: active }) };
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: i18n.getFixedT('en-US','dialogs') }) };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id.endsWith('/ContentIcon')) return { ContentIcon: 'icon' };
    if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input' };
    if (id.endsWith('/DialogFrame')) return Object.fromEntries(['DialogFrame','DialogHeader','DialogFooter','DialogActions','DialogButton'].map(key => [key,key]));
    throw new Error(id);
  } });
  return { props, exports: module.exports, active(value) { active = value; }, render() { cursor = 0; return walk(module.exports.PreviewCssDetails(props)); } };
}

test('CSS inspection is read only, accepts successful empty CSS, and hides results when their preview identity becomes stale', () => {
  const f = fixture();
  f.render().find(node => node.type === 'icon-button').props.onClick();
  let nodes = f.render(), input = nodes.find(node => node.type === 'source-input');
  assert.equal(input.props.value, f.props.css); assert.equal(input.props.readOnly,true);
  assert.ok(nodes.some(node => node.type === 'p' && text(node).includes('No reliable mapping')));
  f.props.snapshot.environment = { policy:{entry:'./site.css'},rawFiles:{'site.css':'.actual{}'} };
  assert.ok(f.render().some(node => node.type === 'p' && text(node).includes('Stylesheet entry: ./site.css')));
  f.props.ready = false;
  assert.equal(f.render().some(node => node.type === 'source-input'),false);
  f.props.ready = true; f.props.revision = {};
  assert.equal(f.render().some(node => node.type === 'source-input'),false);
  f.props.css = ''; f.render().find(node => node.type === 'icon-button').props.onClick();
  nodes = f.render(); assert.equal(nodes.some(node => node.type === 'source-input'),false);
  assert.ok(nodes.some(node => node.type === 'p' && text(node).includes('generated empty CSS')));
  nodes.find(node => node.type === 'DialogFrame').props.onClose();
  f.active('other-library'); f.render().find(node => node.type === 'icon-button').props.onClick();
  assert.equal(f.render().some(node => node.type === 'DialogFrame'),false);
});

test('dark CSS is read only from a committed visible rendition and excludes inspection utilities', () => {
  const f = fixture(), light = new JSDOM('<iframe data-article-frame="light"></iframe>'), dark = new JSDOM('<style>.generated-dark{color:white}</style><style data-theme-inspection-utilities>.inspection{}</style>');
  try {
    const host = light.window.document.body, frame = { contentDocument: dark.window.document }, canonical = host.querySelector('iframe');
    assert.equal(f.exports.readPreviewCss('light-css',true,host,null,frame),null);
    canonical.inert = true;
    assert.equal(f.exports.readPreviewCss('light-css',true,host,null,frame),'.generated-dark{color:white}');
    assert.equal(f.exports.readPreviewCss('',false,null,null,null),'');
    assert.equal(f.exports.readPreviewCss('light-css',false,null,null,null),'light-css');
  } finally { light.window.close(); dark.window.close(); }
});
