import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { DEFAULT_FORMAT_BUNDLE } from '../../src/lib/article-format/config.ts';

const engine = await readFile(new URL('../../public/format/article-format-engine.js', import.meta.url), 'utf8');

test('scrollable height is exempt only on that node; zero height and clipped children remain errors', async () => {
  const dom = new JSDOM(`<article>
    <section data-source-line="1" style="height:40px;overflow-y:auto">Scrollable text</section>
    <section data-source-line="2" style="height:40px;overflow-y:scroll">Scrollable text</section>
    <section data-source-line="3" style="height:0;overflow-y:auto">Zero height</section>
    <section data-source-line="4" style="height:40px;overflow-y:hidden">Clipped text</section>
    <section data-source-line="5" style="height:40px;overflow-y:clip">Clipped text</section>
    <section data-source-line="6" style="height:40px;overflow-y:auto"><p data-source-line="7" style="height:0;overflow-y:hidden">Child error</p></section>
  </article>`, { runScripts: 'outside-only' });
  try {
    dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
      return { top: 0, bottom: parseFloat(this.style.height) || 0, left: 0, right: 200, width: 200, height: parseFloat(this.style.height) || 0 };
    };
    dom.window.Range.prototype.getClientRects = () => [{ top: 0, bottom: 120, left: 0, right: 200, width: 200, height: 120 }];
    dom.window.eval(engine);
    const bundle = structuredClone(DEFAULT_FORMAT_BUNDLE);
    bundle.validator.rules = bundle.validator.rules.filter(rule => rule.id === 'height');
    bundle.support.manualReview = [];
    const result = await dom.window.ArticleFormatEngine.inspect(dom.window.document.querySelector('article'), bundle, '');
    assert.deepEqual(Array.from(result.checked), ['height']);
    assert.deepEqual(Array.from(result.issues, issue => issue.line), [3, 4, 5, 7]);
    assert.equal(result.resources.length, 0);
  } finally { dom.window.close(); }
});
