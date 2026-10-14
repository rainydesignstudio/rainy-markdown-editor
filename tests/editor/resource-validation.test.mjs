import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { renderedResourceIssue, inspectArticleFormatReport } from '../../src/lib/articleFormatReport.ts';
import { createArticleSource } from '../../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../../src/lib/themes.ts';
import { formatDiagnosticMessage, formatDiagnosticName, formatDiagnosticSource } from '../../src/lib/i18n/productMessages.ts';
import { createUII18n } from '../../src/lib/i18n/runtime.ts';
const engine = await readFile(new URL('../../public/format/article-format-engine.js', import.meta.url), 'utf8');
function fixture(source = '/missing.png', complete = true, naturalWidth = 0, widthRule = true) {
  let timers = 0, cleared = 0, frames = 0, removed = 0, dark = 0;
  const handlers = new Map(), timeouts = new Map();
  const style = { width: '100px', height: '', getPropertyValue(name) { return this[name] || ''; } };
  const attrs = { src: source, 'data-source-line': '7' };
  const image = { tagName: 'IMG', complete, naturalWidth, style, currentSrc: '', parentElement: null,
    getAttribute: key => attrs[key] ?? null, closest: selector => selector === '[data-source-line]' ? image : null,
    matches: selector => selector === 'img', querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 }),
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const doc = { baseURI: 'http://127.0.0.1:3501/', styleSheets: [], createTreeWalker: () => ({ nextNode: () => null }), defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } };
  const root = { tagName: 'ARTICLE', ownerDocument: doc, style: { getPropertyValue: () => '' }, getAttribute: () => null,
    closest: () => null, matches: () => false, querySelector: () => null,
    querySelectorAll: selector => selector === 'img' || selector === '*' ? [image] : [],
    getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 300, width: 300, height: 300 }), outerHTML: '<article class="article-preview"><img></article>' };
  image.ownerDocument = doc; image.parentElement = root; doc.querySelector = () => root;
  const window = { ArticleAlgorithmHost: { run: async () => { dark++; return []; } } };
  const context = { window, URL, NodeFilter: { SHOW_TEXT: 4 }, WeakMap, setTimeout(fn) { timers++; timeouts.set(timers, fn); return timers; }, clearTimeout(id) { cleared++; timeouts.delete(id); },
    document: { createElement() { frames++; return { style: {}, contentDocument: doc, remove() { removed++; } }; }, body: { append(frame) { queueMicrotask(() => frame.onload()); } } } };
  vm.runInNewContext(engine, context);
  const rules = [];
  if (widthRule) rules.push({ id: 'width', enabled: true, stages: ['rendered'], operator: 'dom.responsive-width', parameters: {
    widths: [320, 375], imageLoadTimeoutMs: 2000, dimensionProperty: 'width', ignoredWidthValues: [], paragraphSelector: 'p', candidateSelector: 'img',
    exemptElements: [], overflowTolerance: 1, widthDifference: 1, ratioDifference: .1, responsiveFillTolerance: .1 } });
  rules.push({ id: 'dark', enabled: true, stages: ['rendered'], operator: 'official.dark-contrast', parameters: {} });
  const bundle = { validator: { rules }, support: { manualReview: [] }, formatter: { preview: { dark: { transform: 'test' } } } };
  return { image, root, handlers, bundle, timeout() { [...timeouts.values()].forEach(fn => fn()); }, run: () => window.ArticleFormatEngine.inspect(root, bundle, ''), counts: () => ({ timers, cleared, frames, removed, dark }) };
}
test('already failed images return a product error with zero dead-event timers across all width copies', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.resources[0].reason, 'failed'); assert.equal(result.resources[0].line, 7);
  assert.equal(f.counts().timers, 0); assert.equal(f.counts().frames, 2); assert.equal(f.counts().removed, 2);
  assert.equal(f.counts().dark, 0); assert.ok(result.issues.some(x => x.ruleId === 'dark' && x.outcome === 'incomplete'));
});

test('disabled platform standards still inspect broken resources without platform passes, manual checks or algorithm calls', async () => {
  const f = fixture(); f.bundle.validator.meta = { id: 'generic-platform', enabled: false };
  f.bundle.support.manualReview = [{ id: 'manual', selector: 'article' }]; f.root.matches = () => true;
  const result = await f.run();
  assert.equal(result.checked.length, 0); assert.equal(result.manual.length, 0); assert.equal(result.issues.length, 0);
  assert.equal(result.resources[0].reason, 'failed');
  assert.equal(f.counts().frames, 0); assert.equal(f.counts().dark, 0); assert.equal(f.counts().timers, 0);
});
test('empty and malformed image addresses are errors; a valid load failure settles immediately when its event fires', async () => {
  for (const [source, reason] of [['', 'empty'], ['https://', 'invalid']]) {
    const f = fixture(source, true, 0, false), result = await f.run();
    assert.equal(result.resources[0].reason, reason); assert.equal(f.counts().timers, 0);
  }
  const f = fixture('/delayed-missing.png', false, 0, false), pending = f.run();
  assert.equal(f.counts().timers, 1); f.image.complete = true; f.handlers.get('error')();
  const result = await pending;
  assert.equal(result.resources[0].reason, 'failed'); assert.equal(f.handlers.size, 0); assert.equal(f.counts().cleared, 1);
});
test('valid images remain eligible for checks while resource failures map to errors and pending resources remain unverified', async () => {
  const f = fixture('/ok.png', true, 100, false), result = await f.run();
  assert.equal(result.resources.length, 0); assert.equal(f.counts().dark, 1);
  for (const reason of ['empty', 'invalid', 'failed']) assert.equal(renderedResourceIssue({ source: '/bad', reason }).tier, 'danger');
  assert.equal(renderedResourceIssue({ source: '/pending', reason: 'loading' }).tier, 'conditional');
});
test('a known missing local file returns before any browser measurement or timeout can start', async () => {
  let reads = 0;
  const root = { getDirectoryHandle: async () => { reads++; throw new DOMException('missing', 'NotFoundError'); } };
  const report = await inspectArticleFormatReport(createArticleSource('test') + '\n![lost](media/image/missing.png)', BASIC_THEME, null,
    { root, month: '2026-10', folder: 'test' });
  assert.ok(reads > 0); assert.equal(report.complete, false);
  assert.ok(report.body.issues.some(x => x.resourceSource === 'media/image/missing.png' && x.tier === 'danger'));
  assert.ok(report.body.issues.some(x => x.messageKey === 'image.resourcesBlockRender'));
});

test('unsettled resources use one bounded wait and remain incomplete instead of starting width subframes', async () => {
  const f = fixture('/slow.png', false, 0, true), pending = f.run();
  assert.equal(f.counts().timers, 1); f.timeout(); const result = await pending;
  assert.equal(result.resources[0].reason, 'loading'); assert.equal(f.counts().frames, 0); assert.equal(f.counts().dark, 0);
  assert.ok(result.issues.some(x => x.ruleId === 'width' && x.outcome === 'incomplete'));
});
test('failed library image placeholders are product errors, not successful image measurements', async () => {
  const f = fixture('/unused.png', true, 100, false);
  const old = f.root.querySelectorAll;
  f.root.querySelectorAll = selector => selector === '[data-asset-state]' ? [{ getAttribute: key => ({ 'data-asset-state': 'error', 'data-local-asset-src': '/bad-folder/a.png' })[key] ?? null, closest: () => null }] : old(selector);
  const result = await f.run(); assert.ok(result.resources.some(x => x.source === '/bad-folder/a.png' && x.reason === 'failed'));
  assert.equal(f.counts().dark, 0);
});
test('SVG image hrefs use a bounded native image probe and report failed or empty sources', async () => {
  const f = fixture('/unused.png', true, 100, false), doc = f.root.ownerDocument;
  doc.defaultView.Image = class {
    complete = false; naturalWidth = 0; handlers = new Map();
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    removeEventListener(name) { this.handlers.delete(name); }
    removeAttribute() {}
    set src(_value) { this.complete = true; this.handlers.get('error')?.(); }
  };
  const nodes = ['/wrong.png', ''].map(source => ({ ownerDocument: doc, getAttribute: key => key === 'href' ? source : null, closest: () => null }));
  const old = f.root.querySelectorAll; f.root.querySelectorAll = selector => selector === 'svg image' ? nodes : old(selector);
  const result = await f.run();
  assert.ok(result.resources.some(x => x.source === '/wrong.png' && x.reason === 'failed'));
  assert.ok(result.resources.some(x => x.source === '' && x.reason === 'empty'));
});

test('stored product resource diagnostics translate their message, name and source without rerunning validation', () => {
  const issue = renderedResourceIssue({ source: '/missing.png', reason: 'failed', line: 4 });
  const english = createUII18n('en-US').t.bind(createUII18n('en-US'));
  assert.match(formatDiagnosticMessage(issue, english), /loading or decoding failed/);
  assert.equal(formatDiagnosticName(issue, english), 'Image resource');
  assert.equal(formatDiagnosticSource(issue.source, english), 'Current body resources');
  assert.equal(issue.line, 4); assert.equal(issue.resourceSource, '/missing.png');
});
