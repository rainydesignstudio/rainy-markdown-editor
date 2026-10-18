import assert from 'node:assert/strict';
import test from 'node:test';
import { articleStatisticsFromHtml, articleStatisticsFromPreview } from '../src/lib/articleStatistics.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { getFormatSnapshot, activateFormatBundle, bindArticleRenderSnapshot } from '../src/lib/article-format/runtime.ts';

test('article statistics count rendered content and exclude blank paragraphs and metadata styles', () => {
  const result = articleStatisticsFromHtml('<h1>标题</h1><p>你好 <a href="/">链接</a></p><p><br></p><p><img src="media/image/a.png" alt="示意图"></p><pre><code>A\nB</code></pre><style>不计</style>');
  assert.deepEqual(result, { characters: 8, readingMinutes: 1, headings: 1, paragraphs: 2, images: 1, links: 1, codeBlocks: 1 });
});

test('article reading estimate rounds up only when there is content', () => {
  assert.equal(articleStatisticsFromHtml('<p><br></p>').readingMinutes, 0);
  assert.equal(articleStatisticsFromHtml(`<p>${'字'.repeat(301)}</p>`).readingMinutes, 2);
});

test('local image loading placeholders count as images without adding status text', () => {
  const result = articleStatisticsFromHtml('<p><span data-local-asset-src="media/image/a.png">正在读取本地图片…</span></p>');
  assert.equal(result.characters, 0);
  assert.equal(result.paragraphs, 1);
  assert.equal(result.images, 1);
});

test('standard, configured body and website root containers share statistics without counting preview-only decoration', () => {
  const html = '<section data-preview-only="true"><h1>Decoration</h1></section><h2>正文</h2><p>文字</p>';
  for (const selector of ['.article-body', '[data-article-content-body]', null]) {
    const root = { isConnected: true, innerHTML: html, querySelector: value => value === selector ? { innerHTML: html } : null, hasAttribute: value => selector === null && value === 'data-article-content-root' };
    const stats = articleStatisticsFromPreview(root, true);
    assert.equal(stats.characters, 4); assert.equal(stats.headings, 1); assert.equal(stats.paragraphs, 1);
    assert.equal(articleStatisticsFromPreview(root, false), null);
    root.isConnected = false; assert.equal(articleStatisticsFromPreview(root, true), null);
  }
});

test('statistics reject an old configuration or an unrelated DOM container', () => {
  const root = { isConnected: true, innerHTML: '<p>Stale</p>', querySelector: () => null, hasAttribute: () => true };
  bindArticleRenderSnapshot(root, getFormatSnapshot());
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), 'next-library');
  assert.equal(articleStatisticsFromPreview(root, true), null);
  assert.equal(articleStatisticsFromPreview({ ...root, hasAttribute: () => false }, true), null);
});
