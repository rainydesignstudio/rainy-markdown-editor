import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import parseInlineStyle from 'inline-style-parser';
import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle } from '../src/lib/article-format/config.ts';
import * as runtime from '../src/lib/article-format/runtime.ts';

const code = ts.transpileModule(await readFile(new URL('../src/lib/render.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
// JSDOM's CSSStyleDeclaration rotates repeated padding longhands. Inspect the emitted
// declarations here; actual computed geometry is checked separately in native Chrome.
const declaration = (element, property) => parseInlineStyle(element.getAttribute('style') ?? '').findLast(item => item.type === 'declaration' && item.property === property)?.value ?? '';
const markup = `<article data-article-content-root style="padding:7px;max-width:800px;color:rgb(38,38,38);font-size:16px">
  <div class="article-body" data-article-content-body style="padding:28px 20px 44px;margin:0 auto;max-width:672px;font-size:16px;line-height:25.6px">
    <section data-role="card" style="padding:20px 24px;margin:0 0 28px;max-width:600px">Card</section>
    <blockquote data-role="quote" style="color:rgb(23,23,23);background-color:rgb(226,232,240);margin:26px 0;padding:16px 24px 8px;border-left:0 none rgb(23,23,23);border-bottom:2px solid rgb(144,161,185);border-radius:8px">
      <p style="margin:0 0 10px">Quote <strong>emphasis</strong></p>
      <blockquote data-role="nested-quote" style="border-left:3px solid rgb(115,115,115);padding:4px 16px">Nested quote</blockquote>
    </blockquote>
    <pre><code>&lt;blockquote&gt;literal code&lt;/blockquote&gt;</code></pre>
  </div>
</article>`;

function harness(raw = DEFAULT_FORMAT_BUNDLE, html = markup) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const snapshot = { ...runtime.getFormatSnapshot(), bundle: compileFormatBundle(raw) };
  const purifier = createDOMPurify(dom.window), module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, window: dom.window,
    require: id => id.endsWith('/article-format/runtime') ? { getFormatSnapshot: () => snapshot, assertFormatReady: runtime.assertFormatReady }
      : id.endsWith('/article-format/sanitize') ? { sanitizeHtml: html => purifier.sanitize(html) }
        : id.endsWith('/articleDarkPreview') ? { createArticleColorNormalizer: () => ({ normalizePaint: value => value }) }
          : id.endsWith('/articleFormat') ? { articleFormatAllowsCssProperty: property => !snapshot.bundle.formatter.output.dropCssProperties.includes(property) }
            : (() => { throw new Error(id); })(),
  });
  const root = dom.window.document.querySelector('[data-article-content-root]');
  return { root, snapshot, copy: () => module.exports.buildClipboardPayload(root, snapshot) };
}

test('WeChat copy maps nested quotes after styling and removes only generated shell geometry', () => {
  const { root, copy } = harness(); const before = root.outerHTML;
  const payload = copy(), result = new JSDOM(payload.html).window.document;
  assert.equal(result.querySelectorAll('blockquote').length, 0);
  const quote = result.querySelector('[data-role="quote"]'), nested = result.querySelector('[data-role="nested-quote"]');
  assert.equal(quote.tagName, 'SECTION'); assert.equal(nested.tagName, 'SECTION');
  assert.equal(quote.style.borderBottomWidth, '2px'); assert.equal(quote.style.borderBottomColor, 'rgb(144, 161, 185)');
  assert.equal(quote.style.backgroundColor, 'rgb(226, 232, 240)'); assert.equal(quote.style.borderRadius, '8px');
  assert.equal(declaration(quote, 'padding-left'), '24px'); assert.equal(declaration(quote, 'margin-top'), '26px');
  assert.equal(nested.style.borderLeftWidth, '3px'); assert.equal(declaration(nested, 'padding-left'), '16px');
  assert.equal(quote.querySelector('strong').textContent, 'emphasis');
  const outer = result.body.firstElementChild, body = outer.firstElementChild;
  for (const shell of [outer, body]) for (const property of ['padding', 'padding-left', 'margin', 'margin-left', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height']) assert.equal(shell.style.getPropertyValue(property), '', property);
  assert.equal(body.style.fontSize, '16px'); assert.equal(body.style.lineHeight, '25.6px');
  assert.equal(declaration(result.querySelector('[data-role="card"]'), 'padding-left'), '24px');
  assert.equal(result.querySelector('[data-role="card"]').style.maxWidth, '600px');
  assert.equal(result.querySelector('code').textContent, '<blockquote>literal code</blockquote>');
  assert.ok(payload.text.includes('Quote emphasis')); assert.ok(payload.text.includes('Nested quote'));
  assert.equal(root.outerHTML, before, 'copy does not rewrite preview or source DOM');
});

test('old and other-platform configurations retain native quotes and shell layout unless explicitly configured', () => {
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  delete raw.formatter.steps.find(step => step.operator === 'output.html').parameters.tagMap;
  delete raw.formatter.steps.find(step => step.operator === 'output.css').parameters.rootStyleOmissions;
  for (const item of [raw.support, raw.validator, raw.formatter]) item.meta.id = 'other-platform';
  const { copy, snapshot } = harness(raw), result = new JSDOM(copy().html).window.document;
  assert.equal(Object.hasOwn(snapshot.bundle.formatter.output, 'tagMap'), false, 'legacy resolved snapshots do not gain new fields');
  assert.equal(Object.hasOwn(snapshot.bundle.formatter.output, 'rootStyleOmissions'), false);
  assert.equal(result.querySelectorAll('blockquote').length, 2);
  assert.equal(declaration(result.body.firstElementChild.firstElementChild, 'padding-left'), '20px');
  assert.equal(result.body.firstElementChild.firstElementChild.style.maxWidth, '672px');
  raw.formatter.steps.find(step => step.operator === 'output.html').parameters.tagMap = { blockquote: 'aside' };
  const custom = new JSDOM(harness(raw).copy().html).window.document;
  assert.equal(custom.querySelectorAll('blockquote').length, 0); assert.equal(custom.querySelectorAll('aside').length, 2, 'the engine consumes configuration, not a platform-name branch');
});

test('generated document markers identify native-policy shells without article-body class names', () => {
  const { copy } = harness(DEFAULT_FORMAT_BUNDLE, markup.replace('class="article-body"', 'class="custom-body"'));
  const result = new JSDOM(copy().html).window.document;
  assert.equal(result.body.firstElementChild.firstElementChild.style.paddingLeft, '');
  assert.equal(declaration(result.querySelector('[data-role="quote"]'), 'padding-left'), '24px');
});

test('output contracts reject unsafe tag mappings and invalid shell omission fields', () => {
  for (const tagMap of [{ blockquote: 'script' }, { iframe: 'section' }, { blockquote: 'img' }, { Blockquote: 'section' }, { blockquote: 5 }]) {
    const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.formatter.steps.find(step => step.operator === 'output.html').parameters.tagMap = tagMap;
    assert.throws(() => compileFormatBundle(raw));
  }
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE); raw.formatter.steps.find(step => step.operator === 'output.css').parameters.rootStyleOmissions = ['padding;display'];
  assert.throws(() => compileFormatBundle(raw));
});
