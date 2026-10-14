import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../public/algorithm/article-algorithm-host.js', import.meta.url), 'utf8');
const example = await readFile(new URL('../public/images/article-sample.png', import.meta.url));
function bridge(markup, failed = false) {
  const dom = new JSDOM('<article data-article-content-root>' + markup + '</article>', { url: 'http://localhost:3500/themes/' });
  const window = {}, fetched = [];
  vm.runInNewContext(source.replace('window.ArticleAlgorithmHost = {', 'window.ArticleAlgorithmHost = { prepareInput,'), {
    window, document: dom.window.document, URL,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    fetch: async url => { fetched.push(url); return { ok: !failed, blob: async () => new Blob([example], { type: 'image/png' }) }; },
  });
  return { prepare: () => window.ArticleAlgorithmHost.prepareInput(dom.window.document.querySelector('article'), 'sample-request'), fetched, original: dom.window.document.querySelector('article') };
}

test('the fixed application sample enters the opaque algorithm frame as bytes, with repeated references read once', async () => {
  const view = bridge('<img src="/images/article-sample.png"><img src="/images/article-sample.png">');
  const original = view.original.outerHTML;
  const result = await view.prepare();
  assert.deepEqual(view.fetched, ['/images/article-sample.png']);
  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0].mime, 'image/png');
  assert.deepEqual(Buffer.from(result.resources[0].bytes), example);
  assert.equal((result.html.match(/src="article-algorithm-asset:sample-request\/0"/g) ?? []).length, 2);
  assert.doesNotMatch(result.html, /src="\/images\/article-sample\.png"/);
  assert.equal(view.original.outerHTML, original, 'the trusted light document stays unchanged');
});

test('the matching same-origin absolute sample is supported without authorizing other network images', async () => {
  for (const path of ['https://untrusted.example/images/article-sample.png', '/images/other.png', '/images/article-sample.png?alternate=1', 'http://[']) {
    const view = bridge('<img src="' + path + '">');
    const result = await view.prepare();
    assert.deepEqual(view.fetched, []);
    assert.equal(result.resources.length, 0);
  }
  const view = bridge('<img src="http://localhost:3500/images/article-sample.png">');
  assert.equal((await view.prepare()).resources.length, 1);
  assert.deepEqual(view.fetched, ['http://localhost:3500/images/article-sample.png']);
});

test('a failed application image read rejects preparation instead of returning a successful placeholder', async () => {
  const view = bridge('<img src="/images/article-sample.png">', true);
  await assert.rejects(view.prepare(), /ALGORITHM_RESOURCE_UNAVAILABLE/);
});
