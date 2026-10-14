import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { articleExportBaseName, articleMarkdownBody, createArticleDocumentPackage } from '../src/lib/articleExport.ts';

test('website Markdown export preserves body bytes and rejects uncertain metadata boundaries', () => {
  const body = '# 标题\r\n\r\n<div class="callout">源码</div>\r\n![图](media/image/a.png)\r\n';
  assert.equal(articleMarkdownBody('---\r\ntitle: 文稿\r\n---\r\n' + body), body);
  assert.equal(articleMarkdownBody(body), body);
  assert.throws(() => articleMarkdownBody('---\ntitle: bad\n正文'), /元数据/);
});
import { articlePdfPageCuts } from '../src/lib/articleVisualExport.ts';

function directory(items) {
  const handles = new Map();
  const result = {
    kind: 'directory',
    name: 'root', parent: null,
    queryPermission: async () => 'granted',
    async resolve(other) { const path = []; for (let cursor = other; cursor; cursor = cursor.parent) { if (cursor === result) return path.reverse(); path.push(cursor.name); } return null; },
    async *entries() { for (const [name, value] of Object.entries(items)) yield [name, { kind: value.kind ?? 'file' }]; },
    async getDirectoryHandle(name) {
      const value = items[name];
      if (!value || value.kind !== 'directory') throw new DOMException('Not found', 'NotFoundError');
      return value;
    },
    async getFileHandle(name) {
      const value = items[name];
      if (!(value instanceof Blob)) throw new DOMException('Not found', 'NotFoundError');
      if (!handles.has(name)) handles.set(name, { name, parent: result, kind: 'file', async getFile() { return new File([value], name); } }); return handles.get(name);
    },
  };
  for (const [name, value] of Object.entries(items)) if (value.kind === 'directory') { value.name = name; value.parent = result; }
  return result;
}

test('document package preserves current markdown and the existing media tree', async () => {
  const png = [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3];
  const media = directory({ image: directory({ '封面.png': new Blob([Uint8Array.from(png)]) }), 'note.txt': new Blob(['附注']) });
  const root = directory({ articles: directory({ '2026-10': directory({ draft: directory({ media, 'article.md': new Blob(['saved']) }) }) }) });
  const source = '---\ntitle: "当前稿"\n---\n\n![封面](media/image/%E5%B0%81%E9%9D%A2.png)\n';
  const { blob, mediaFiles } = await createArticleDocumentPackage(source, root, '2026-10', 'draft');
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(strFromU8(entries['article.md']), source);
  assert.deepEqual(Array.from(entries['media/image/封面.png']), png);
  assert.equal(strFromU8(entries['media/note.txt']), '附注');
  assert.equal(mediaFiles, 2);
});

test('unsaved document package still contains markdown and an empty media directory', async () => {
  const { blob, mediaFiles } = await createArticleDocumentPackage('# 草稿\n', directory({}), null, null);
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(strFromU8(entries['article.md']), '# 草稿\n');
  assert.ok(entries['media/']);
  assert.equal(mediaFiles, 0);
  assert.equal(articleExportBaseName('  A/B: C  '), 'A-B- C');
});

test('PDF cuts prefer complete blocks within each A4 page', () => {
  assert.deepEqual(articlePdfPageCuts(2500, 1000, [800, 1700, 2400]), [800, 1700, 2500]);
});
