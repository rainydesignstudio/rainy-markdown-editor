import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARTICLE_EXAMPLE_IMAGE, isApplicationExampleImage } from '../src/lib/articleExamples.ts';
import { DEFAULT_ARTICLE_SNIPPETS } from '../src/lib/contentLibraries.ts';

test('only the exact public example URL is an application sample; legacy and genuine paths retain their identity', async () => {
  assert.equal(isApplicationExampleImage(ARTICLE_EXAMPLE_IMAGE), true);
  for (const path of ['/article-sample.png', 'media/image.png', 'media/image-a.png', './media/image-b.png']) assert.equal(isApplicationExampleImage(path), false);
  for (const path of ['media/image/photo.png', 'media/my-photo.png', 'https://example.test/media/image.png', 'data:image/png;base64,AAAA']) assert.equal(isApplicationExampleImage(path), false);
  const bytes = await readFile(new URL('../public' + ARTICLE_EXAMPLE_IMAGE, import.meta.url));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  for (const id of ['image-pair', 'captioned-image']) {
    const sample = DEFAULT_ARTICLE_SNIPPETS.find(s => s.id === id);
    assert.ok(sample.content.includes(ARTICLE_EXAMPLE_IMAGE));
    assert.ok(!sample.content.includes('media/image'));
  }
});
