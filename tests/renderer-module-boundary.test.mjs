import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as compiler from '../src/lib/article-format/renderer.ts';
import * as oldCompiler from '../src/lib/tailwind.ts';
import * as output from '../src/lib/article-format/output.ts';
import * as oldOutput from '../src/lib/render.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const compatibility = ['src/lib/tailwind.ts', 'src/lib/render.ts', 'src/hooks/useArticleRenderMount.ts', ...['ArticleDocument', 'MarkdownPreview', 'ArticleCodeBlock', 'LibraryArticleImage', 'LocalFileLink', 'MermaidDiagram'].map(name => `src/components/editor/${name}.tsx`)];

test('legacy compiler and output APIs forward to one implementation and one cache', () => {
  assert.equal(oldCompiler.compileArticleStyles, compiler.compileArticleStyles);
  assert.equal(oldCompiler.articleStyleCacheStats, compiler.articleStyleCacheStats);
  assert.equal(oldOutput.buildClipboardPayload, output.buildClipboardPayload);
  assert.equal(oldOutput.extractMarkdownClassCandidates, output.extractMarkdownClassCandidates);
});

test('active product imports use renderer modules while compatibility entries contain no duplicated implementation', async () => {
  const legacy = new Set(compatibility.map(name => path.join(root, name).replace(/\.(ts|tsx)$/, '')));
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = await readFile(file, 'utf8');
      if (legacy.has(file.replace(/\.(ts|tsx)$/, ''))) {
        assert.match(source, /export \* from /); assert.doesNotMatch(source, /export (?:async )?function |export const /); continue;
      }
      for (const match of source.matchAll(/\bfrom\s*['"](\.[^'"\n]+)['"]/g)) {
        assert.equal(legacy.has(path.resolve(path.dirname(file), match[1]).replace(/\.(ts|tsx)$/, '')), false, `${path.relative(root, file)} imports a compatibility entry`);
      }
    }
  }
  await visit(path.join(root, 'src'));
  assert.match(await readFile(path.join(root, 'src/styles/globals.css'), 'utf8'), /@source "\.\.\/lib\/article-format\/\*\.tsx"/);
});
