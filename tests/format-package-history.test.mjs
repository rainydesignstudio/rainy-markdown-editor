import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/components/history/HistorySnapshotPreview.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture({ packaged = true, record = true, reference = false } = {}) {
  const format = { id: 'format', renderer: packaged ? {} : undefined, algorithmSource: 'library', bundle: { formatter: { preview: { dark: { transform: 'preserve' } } } } };
  const referenceFormat = reference ? { ...format, renderer: { retained: true } } : undefined;
  const snapshot = { id: 'history', source: 'body', parsed: { body: 'body' }, theme: {}, renderRecord: record ? {} : null };
  const calls = [], effects = [], states = []; let state = 0;
  const rendition = record ? { id: 'history', css: 'p{}', html: '<math><mi>x</mi></math>', format } : null;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, Error, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (id === 'react') return { useRef: value => ({ current: value }), useState: () => [state++ === 0 ? rendition : '', value => states.push(value)], useEffect: callback => effects.push(callback) };
    if (id === 'react-dom') return { createPortal: node => node };
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: key => key }) };
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => format };
    if (id.endsWith('/useArticleRenderMount')) return { useArticleRenderMount: () => ({ target: {}, native: true, darkIssue: '' }) };
    if (id.endsWith('/preview')) return { previewSurfaceStyle: () => ({}) };
    if (id.endsWith('/renderer')) return { compileArticleStyles: async (_source, _theme, options) => { calls.push({ compiledWith: options?.snapshot }); calls.push('compiled-current'); return { css: '' }; } };
    if (id.endsWith('/sanitize')) return { sanitizeHtml: html => { calls.push('legacy-floor'); return html; } };
    if (id.endsWith('/packageRendering')) return { sanitizePackageHtml: html => { calls.push('package-floor'); return html; }, bindPackageInput: (element, input) => calls.push({ element, input }) };
    return {};
  } };
  vm.runInNewContext(compiled, context);
  const result = context.exports.HistorySnapshotPreview({ snapshot, root: {}, article: { id: 'article' }, articleTitle: 'Title', reference: referenceFormat });
  const find = node => Array.isArray(node) ? node.flatMap(find) : node?.props ? [node, ...find(node.props.children)] : [];
  return { calls, effects, states, node: find(result).find(node => node.props.dangerouslySetInnerHTML), format, referenceFormat };
}
test('retained package history uses the generic floor and binds its original source, CSS and interpreter for dark rendering', () => {
  const f = fixture(); assert.ok(f.calls.includes('package-floor')); assert.ok(!f.calls.includes('legacy-floor'));
  const element = {}; f.node.props.ref(element); const bound = f.calls.find(value => typeof value === 'object');
  assert.equal(bound.element, element); assert.equal(bound.input.source, 'body'); assert.equal(bound.input.css, 'p{}'); assert.equal(bound.input.snapshot, f.format);
});
test('legacy retained history keeps its original compatibility sanitizer', () => {
  const f = fixture({ packaged: false }); assert.ok(f.calls.includes('legacy-floor')); assert.ok(!f.calls.includes('package-floor'));
});
test('missing package dependencies fail explicitly instead of silently rebuilding; legacy fallback remains available', async () => {
  const f = fixture({ record: false }); f.effects[0](); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.states.includes('dialogs:history.packageDependenciesMissing')); assert.ok(!f.calls.includes('compiled-current'));
  const old = fixture({ record: false, packaged: false }); old.effects[0](); await new Promise(resolve => setImmediate(resolve)); assert.ok(old.calls.includes('compiled-current'));
});

test('the current comparison pane is explicit and compiles with its own retained interpreter, not the live replacement', async () => {
  const f = fixture({ record: false, reference: true }); f.effects[0](); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.calls.includes('compiled-current')); assert.equal(f.calls.find(call => call?.compiledWith)?.compiledWith, f.referenceFormat);
  assert.ok(!f.states.includes('dialogs:history.packageDependenciesMissing'));
});
