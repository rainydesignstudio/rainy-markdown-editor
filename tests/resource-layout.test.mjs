import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';
import { DEFAULT_ARTICLE_SNIPPETS, DEFAULT_ARTICLE_TEMPLATES, DEFAULT_SNIPPET_CATEGORIES, DEFAULT_TEMPLATE_CATEGORIES } from '../src/lib/contentLibraries.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import { formatPreviewDocument } from '../src/lib/article-format/frame.ts';
import { ARTICLE_EXAMPLE_IMAGE, isApplicationExampleImage } from '../src/lib/articleExamples.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const fresh = path.join(root, 'resources/template/fresh-library');
test('file-based seeds contain the complete initial library and no manuscripts/history', async () => {
  assert.deepEqual((await readdir(fresh)).sort(), ['snippets', 'templates', 'themes']);
  for (const [kind, categories] of [['snippets', DEFAULT_SNIPPET_CATEGORIES], ['templates', DEFAULT_TEMPLATE_CATEGORIES]]) {
    const index = JSON.parse(await readFile(path.join(fresh, kind, 'index.json'), 'utf8'));
    assert.deepEqual(index.categories, categories); assert.equal(index.version, 1);
  }
  for (const snippet of DEFAULT_ARTICLE_SNIPPETS) {
    const file = JSON.parse(await readFile(path.join(fresh, 'snippets', snippet.categoryId, snippet.id + '.json'), 'utf8'));
    assert.equal(file.content, snippet.content); assert.equal(file.name, snippet.name); assert.equal(file.trigger, snippet.trigger);
  }
  for (const template of DEFAULT_ARTICLE_TEMPLATES) assert.equal(await readFile(path.join(fresh, 'templates', template.categoryId, template.id + '.md'), 'utf8'), template.source);
});
test('browser entry references resolve within public grouped directories without root aliases', async () => {
  const html = formatPreviewDocument('', '<article>body</article>', false, getFormatSnapshot());
  const scripts = parseFragment(html).childNodes.filter(node => node.tagName === 'script');
  const urls = scripts.flatMap(node => node.attrs.filter(attr => attr.name === 'src').map(attr => attr.value));
  assert.equal(urls.length, 3);
  for (const url of urls) { assert.match(url, /^\/(format|algorithm)\//); assert.ok((await stat(path.join(root, 'public', url.slice(1)))).isFile()); }
  const sandbox = path.join(root, 'public/algorithm/article-algorithm-sandbox.html');
  const source = await readFile(sandbox, 'utf8');
  for (const [, relative] of source.matchAll(/<script src="([^"]+)"/g)) assert.ok((await stat(path.resolve(path.dirname(sandbox), relative))).isFile());
  assert.equal(isApplicationExampleImage('/article-sample.png'), false);
  assert.ok((await stat(path.join(root, 'public', ARTICLE_EXAMPLE_IMAGE.slice(1)))).isFile());
});
