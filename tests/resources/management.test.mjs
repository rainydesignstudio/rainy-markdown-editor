import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from '../ui-locale-fixture.mjs';
import { importResourceFile, listResourceAssets, copyResourceFileAs, deleteResourceFile } from '../../src/lib/resources/storage.ts';
import * as resourceTypes from '../../src/lib/resources/types.ts';
import { libraryMediaAssetKey, insertArticleImageReferences } from '../../src/lib/articleMedia.ts';
import { readMediaMetadata, saveMediaDescription, resourceMetadataGuard, inspectMediaUsage, transferMedia, renameSharedMedia, countCurrentMediaReferences } from '../../src/lib/mediaManagement.ts';
import { rewriteArticleFileReferences } from '../../src/lib/resources/references.ts';
import { mediaDirectoryImages } from '../../src/lib/mediaBrowsing.ts';
import { tree, snapshot, allCounts } from '../knowledge/fs-fixture.mjs';

const current = () => true, shared = { kind: 'shared' }, destination = { kind: 'article', articleId: '2026-10/one', month: '2026-10', folder: 'one', title: 'One' };
function fs(files = {}) {
  const root = tree('library', files), wrapped = new WeakSet();
  const wrap = directory => { if (wrapped.has(directory)) return directory; wrapped.add(directory); const getDir = directory.getDirectoryHandle, getFile = directory.getFileHandle;
    directory.getDirectoryHandle = async (...args) => wrap(await getDir(...args));
    directory.getFileHandle = async (...args) => { const file = await getFile(...args); file.isSameEntry ??= async other => file === other; return file; }; return directory; };
  return wrap(root);
}
const saved = () => fs({ 'articles/2026-10/one/article.md': '# One', 'articles/2026-10/two/article.md': '# Two' });
const key = name => error => error.messageKey === name;

test('attachment descriptions use a files index, survive listings and keep old image descriptions unchanged', async () => {
  const root = saved(), pdf = await importResourceFile(root, shared, new File(['PDF'], 'guide.pdf'));
  const directory = await (await root.getDirectoryHandle('shared')).getDirectoryHandle('file'), guard = resourceMetadataGuard(root, shared, current);
  await saveMediaDescription(directory, pdf.fileName, 'Reusable guide', current, guard);
  const value = JSON.parse(await (await directory.getFileHandle('index.json')).getFile().then(file => file.text()));
  assert.equal(value.files['guide.pdf'].description, 'Reusable guide'); assert.equal(value.images, undefined);
  assert.equal((await listResourceAssets(root, shared))[0].description, 'Reusable guide');
  assert.equal((await readMediaMetadata(directory, guard)).images['guide.pdf'].description, 'Reusable guide');
  directory.seed('index.json', '{broken'); const issues = [];
  assert.equal((await listResourceAssets(root, shared, current, error => issues.push(error))).length, 1); assert.equal(issues.length, 1);
  await assert.rejects(saveMediaDescription(directory, pdf.fileName, 'No overwrite', current, guard)); assert.equal(directory.children.get('index.json').value, '{broken');
});

test('a description index aliased outside the library cannot be read, overwritten or cleaned', async () => {
  const root = saved(), foreign = tree('source', { 'private.json': '{"private":true}' });
  await importResourceFile(root, shared, new File(['PDF'], 'guide.pdf')); const directory = await (await root.getDirectoryHandle('shared')).getDirectoryHandle('file');
  directory.children.set('index.json', await foreign.getFileHandle('private.json')); const before = snapshot(foreign), guard = resourceMetadataGuard(root, shared, current);
  await assert.rejects(saveMediaDescription(directory, 'guide.pdf', 'bad', current, guard), key('resources.unsafeTarget'));
  assert.equal(snapshot(foreign), before); assert.equal(allCounts(foreign).bodyReads, 0); assert.equal(allCounts(foreign).writes, 0);
});

test('copying and transferring attachments preserves files, descriptions and independent names without enabling previews', async () => {
  const root = saved(), pdf = await importResourceFile(root, destination, new File(['PDF-original'], 'guide.pdf'));
  const directory = await (await (await (await root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10')).getDirectoryHandle('one')).getDirectoryHandle('media').then(dir => dir.getDirectoryHandle('file'));
  await saveMediaDescription(directory, pdf.fileName, 'A guide', current, resourceMetadataGuard(root, destination, current)); pdf.description = 'A guide';
  const copied = await copyResourceFileAs(pdf, destination, 'renamed', current);
  assert.equal(copied.fileName, 'renamed.pdf'); assert.equal(copied.preview, 'none'); assert.equal(await (await copied.handle.getFile()).text(), 'PDF-original');
  const transferred = await transferMedia(pdf, shared, { body: 1, history: 0, issues: [] }, current);
  assert.equal(transferred.ok, true); assert.ok(directory.children.has('guide.pdf'));
  assert.equal((await listResourceAssets(root, shared))[0].description, 'A guide');
  const before = allCounts(root).creates; await assert.rejects(copyResourceFileAs(pdf, destination, '../escape', current), key('resources.unsafeName')); assert.equal(allCounts(root).creates, before);
});

test('shared attachment renames retain originals needed by saved or draft references; unreferenced originals can move', async () => {
  const root = saved(), pdf = await importResourceFile(root, shared, new File(['PDF'], 'guide.pdf'));
  const article = await (await (await root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10')).getDirectoryHandle('one'); article.seed('article.md', '[Guide](/shared/file/guide.pdf)');
  const result = await renameSharedMedia(pdf, 'renamed', current);
  assert.equal(result.ok, true); assert.equal(result.tone, 'warning');
  const directory = await (await root.getDirectoryHandle('shared')).getDirectoryHandle('file'); assert.ok(directory.children.has('guide.pdf')); assert.ok(directory.children.has('renamed.pdf'));
  article.children.get('article.md').value = '# One';
  const moved = await renameSharedMedia(pdf, 'moved', current); assert.equal(moved.ok, true); assert.equal(directory.children.has('guide.pdf'), false);
});

test('delete verifies the selected file handle and cannot remove a user replacement or a file after session loss', async () => {
  const root = saved(), file = await importResourceFile(root, shared, new File(['safe'], 'file.pdf'));
  const directory = await (await root.getDirectoryHandle('shared')).getDirectoryHandle('file'); directory.seed('file.pdf', 'user replacement');
  await assert.rejects(deleteResourceFile(file, current), key('resources.changed')); assert.equal(directory.children.get('file.pdf').value, 'user replacement');
  const fresh = (await listResourceAssets(root, shared))[0]; await assert.rejects(deleteResourceFile(fresh, () => false), key('resources.changed')); assert.ok(directory.children.has('file.pdf'));
});

test('attachment reference counts and renames include definitions, no-extension names and HTML but preserve metadata, code and other articles', () => {
  const root = {}, asset = { kind: 'article', root, articleId: '2026-10/file', month: '2026-10', folder: 'file', fileName: 'guide one.pdf', storage: 'file' };
  const source = '---\ntitle: Original\ncustom: media/file/guide%20one.pdf\n---\n[a](media/file/guide%20one.pdf#page=2)\n[b][p]\n[c][p]\n\n[p]: ./media/file/guide%20one.pdf "Title"\n[p]: unused.pdf\n\n<a href="media/file/guide%20one.pdf" download>Download</a>\n`[code](media/file/guide%20one.pdf)`\n[other](../other/media/file/guide%20one.pdf)';
  assert.equal(countCurrentMediaReferences([asset], { source, month: '2026-10', folder: 'file' }), 4);
  const changed = rewriteArticleFileReferences(source, asset.fileName, 'new.pdf'); assert.equal(changed.count, 4);
  assert.match(changed.source, /custom: media\/file\/guide%20one.pdf/); assert.match(changed.source, /new\.pdf#page=2/); assert.match(changed.source, /\[p\]: unused.pdf/); assert.match(changed.source, /`\[code\]\(media\/file\/guide%20one.pdf\)`/); assert.match(changed.source, /\.\.\/other\/media\/file\/guide%20one.pdf/);
  const noExtension = { ...asset, fileName: 'LICENSE' }; assert.equal(countCurrentMediaReferences([noExtension], { source: '[license](media/file/LICENSE)', month: '2026-10', folder: 'file' }), 1);
  const image = { ...asset, storage: 'image', fileName: 'one.png' }; assert.equal(countCurrentMediaReferences([image], { source: '![image](media/image/one.png)', month: '2026-10', folder: 'file' }), 1, 'a folder named file does not turn an image into an attachment');
  const inserted = insertArticleImageReferences('Text', ['guide [one].pdf'], { start: 4, end: 4 }, 'file');
  assert.match(inserted, /\[guide \\\[one\\\]\.pdf\]\(media\/file\/guide%20%5Bone%5D.pdf\)/); assert.ok(!inserted.includes('!['));
});

test('attachment file bytes and MIME labels cannot opt into a gallery or slideshow preview', async () => {
  const file = { kind: 'shared', root: {}, storage: 'file', fileName: 'looks-like-image.png', mimeType: 'image/png', size: 1, handle: { getFile() { throw Error('no automatic file read'); } } };
  const source = await readFile(new URL('../../src/components/media/MediaGallery.tsx', import.meta.url), 'utf8'), module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: withUILocaleImports(id => {
    if (id === 'react') return { useState: value => [value, () => {}], useRef: value => ({ current: value }) };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/articleMedia')) return { libraryMediaAssetKey };
    if (id.endsWith('/resources/types')) return resourceTypes;
    if (id.endsWith('/ArticleImagePreview')) return { ArticleImagePreview: 'automatic-image-preview' };
    if (id.endsWith('/ResourceGlyph')) return { ResourceGlyph: 'file-glyph' };
    if (id.endsWith('/IconButton')) return { IconButton: 'button' };
    if (id.endsWith('/TooltipButton')) return { TooltipButton: 'button' };
    throw Error(id);
  }) });
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const nodes = walk(module.exports.MediaGallery({ assets: [file], selected: null, onSelect() {}, sessionKey: 1, isCurrent: current, disabled: false }));
  assert.ok(nodes.some(node => node.type === 'file-glyph')); assert.ok(!nodes.some(node => node.type === 'automatic-image-preview'));
  assert.deepEqual(mediaDirectoryImages([file], file), []);
  assert.notEqual(libraryMediaAssetKey(file), libraryMediaAssetKey({ ...file, storage: 'image' }));
});
