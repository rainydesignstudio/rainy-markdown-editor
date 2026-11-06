import test from 'node:test';
import assert from 'node:assert/strict';
import { readKnowledgePreview } from '../../src/lib/knowledge/preview.ts';
import { connectKnowledgeSource } from '../../src/lib/knowledge/source.ts';
import { tree, bookmarks, allCounts } from './fs-fixture.mjs';
test('hover previews are bounded plain text, do not require metadata and never write originals', async () => {
  const root = tree('library'), original = tree('source', { 'a.md': '---\ntitle: Optional\n---\n\nPlain original text', 'long.md': 'A'.repeat(100000) }), source = await connectKnowledgeSource(root, original, bookmarks());
  assert.equal((await readKnowledgePreview(source, 'a.md')).text, 'Plain original text');
  const long = await readKnowledgePreview(source, 'long.md'); assert.equal(long.text.length, 900); assert.equal(long.truncated, true); assert.equal(allCounts(original).writes, 0);
});
test('permission loss and a stale source reject previews rather than showing a late result', async () => {
  const root = tree('library'), original = tree('source', { 'a.md': 'Text' }); let current = true;
  const source = await connectKnowledgeSource(root, original, bookmarks(), () => current);
  current = false; await assert.rejects(readKnowledgePreview(source, 'a.md'));
  current = true; original.permission = 'denied'; await assert.rejects(readKnowledgePreview(source, 'a.md')); assert.equal(allCounts(original).writes, 0);
});
