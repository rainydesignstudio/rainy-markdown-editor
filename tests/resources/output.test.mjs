import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { tree, allCounts, snapshot } from '../knowledge/fs-fixture.mjs';
import { beginResourceSession, publishResourceTasks, subscribeResources, subscribeResourceDocument, notifyResourceChanged, resourceState, resourceVersion, unfinishedResourceReferences } from '../../src/lib/resources/state.ts';
import { inspectArticleResources } from '../../src/lib/resources/inspection.ts';
import { readArticleImage } from '../../src/lib/resources/imageCache.ts';
import { readLinkedResource } from '../../src/lib/resources/download.ts';
import { createArticleDocumentPackage } from '../../src/lib/articleExport.ts';
import { openImportResource } from '../../src/lib/imports/download.ts';
import { resourceReference } from '../../src/lib/resources/types.ts';
import { ARTICLE_EXAMPLE_IMAGE } from '../../src/lib/articleExamples.ts';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { planMarkdownResources } from '../../src/lib/imports/plan.ts';
import { unsupportedResourceReferences, resourceReferenceIntent, localResourceReference } from '../../src/lib/resources/references.ts';
import { rehypeConfiguredNodeDefaults } from '../../src/lib/article-format/pipeline.ts';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const current = () => true, destination = { kind: 'article', articleId: '2026-10/one', month: '2026-10', folder: 'one', title: 'One' };
const media = root => ({ root, month: '2026-10', folder: 'one' });
const key = name => error => error.messageKey === name;
function fs(extra = {}) { return tree('library', { 'articles/2026-10/one/article.md': '# One', 'articles/2026-10/one/theme.json': '{}', ...extra }); }
function resource(name, state = 'pending', storage = 'file') { return { id: crypto.randomUUID(), source: name, location: 'local', storage, fileName: name, reference: resourceReference(storage, name), state, receivedBytes: 0 }; }
const task = resources => ({ target: { articleId: destination.articleId }, resources });

test('resource notifications affect only the referenced file/document and ignore byte-only progress', () => {
  const root = fs(); beginResourceSession(root, 1); const first = resource('one.png', 'running', 'image'), second = resource('two.png', 'running', 'image');
  let one = 0, two = 0, other = 0, document = 0;
  const clean = [subscribeResources(root, destination.articleId, [first.reference], () => one++), subscribeResources(root, destination.articleId, [second.reference], () => two++), subscribeResources(root, '2026-10/other', [first.reference], () => other++), subscribeResourceDocument(root, destination.articleId, () => document++)];
  publishResourceTasks(root, [task([first, second])]); assert.deepEqual([one, two, other, document], [1, 1, 0, 1]);
  first.receivedBytes = 1000; publishResourceTasks(root, [task([first, second])]); assert.deepEqual([one, two, other, document], [1, 1, 0, 1]);
  first.state = 'complete'; publishResourceTasks(root, [task([first, second])]); assert.deepEqual([one, two, other, document], [2, 1, 0, 2]);
  assert.deepEqual(unfinishedResourceReferences(root, destination.articleId), [second.reference]);
  clean.forEach(fn => fn()); notifyResourceChanged(root, destination.articleId, first.reference); assert.equal(one, 2);
});

test('pending/failed/cancelled imports are distinguished without reading partial files or starting browser work', async () => {
  const root = fs({ 'articles/2026-10/one/media/image/a.png': '' }); beginResourceSession(root, 1);
  const image = resource('a.png', 'running', 'image'); publishResourceTasks(root, [task([image])]);
  const source = 'Intro\n\n![a](media/image/a.png)', before = allCounts(root).reads;
  const pending = await inspectArticleResources(source, media(root)); assert.equal(pending[0].resourceState, 'pending'); assert.equal(pending[0].tier, 'conditional'); assert.equal(pending[0].line, 3); assert.equal(allCounts(root).reads, before);
  for (const state of ['failed', 'cancelled']) { image.state = state; image.error = { message: 'CORS blocked by source' }; publishResourceTasks(root, [task([image])]); const result = await inspectArticleResources(source, media(root)); assert.equal(result[0].resourceState, 'failed'); assert.equal(result[0].tier, 'danger'); assert.equal(result[0].messageParams.cause, 'CORS blocked by source'); }
  assert.equal(allCounts(root).reads, before);
});

test('invalid managed file URLs retain download interception instead of navigating out of the editor', () => {
  for (const source of ['media/file/%2e%2e%2fsecret.pdf', '/shared/file/bad%ZZ', './media/file/../outside.pdf']) { assert.equal(localResourceReference(source), null); assert.equal(resourceReferenceIntent(source), 'file'); }
  assert.equal(resourceReferenceIntent('https://example.test/media/file/one.pdf'), null);
});

test('ordinary attachments, missing files, invalid images and attachment-as-image references have distinct checks', async () => {
  const root = fs({ 'articles/2026-10/one/media/file/guide.pdf': 'PDF', 'articles/2026-10/one/media/image/bad.png': 'not PNG' }); beginResourceSession(root, 1); publishResourceTasks(root, []);
  assert.deepEqual(await inspectArticleResources('[Guide](media/file/guide.pdf)', media(root)), []);
  const absent = await inspectArticleResources('[Missing](media/file/missing.pdf)', media(root)); assert.equal(absent[0].messageKey, 'resources.missing');
  const invalid = await inspectArticleResources('![Bad](media/image/bad.png)', media(root)); assert.equal(invalid[0].messageKey, 'resources.invalid');
  const unsupported = await inspectArticleResources('![Not previewed](media/file/guide.pdf)', media(root)); assert.equal(unsupported[0].messageKey, 'resources.imageInFileStorage');
  assert.equal((await inspectArticleResources('[Escape](media/file/%2e%2e%2fsecret.pdf)', media(root)))[0].messageKey, 'resources.invalidReference');
});

test('the authoring probe cache rereads only a changed URI and is invalidated by explicit scope changes', async () => {
  const root = fs({ 'articles/2026-10/one/media/file/one.pdf': 'one', 'articles/2026-10/one/media/file/two.pdf': 'two' }); beginResourceSession(root, 1); publishResourceTasks(root, []);
  const source = '[1](media/file/one.pdf)\n[2](media/file/two.pdf)', cache = new Map(), options = { cache, cacheScope: 'scope-1', readTasks: false };
  await inspectArticleResources(source, media(root), options); const before = allCounts(root).reads;
  await inspectArticleResources(source + '\n\nTyping elsewhere.', media(root), options); assert.equal(allCounts(root).reads, before);
  notifyResourceChanged(root, destination.articleId, 'media/file/two.pdf'); await inspectArticleResources(source, media(root), options);
  assert.equal(allCounts(root).reads, before + 1);
  await inspectArticleResources(source, media(root), { ...options, cacheScope: 'focus-2' }); assert.equal(allCounts(root).reads, before + 3);
});

test('image File snapshots share one read within a scope, preserve independent URL ownership and reject stale permissions', async () => {
  const root = fs({ 'articles/2026-10/one/media/image/a.png': png });
  const values = await Promise.all([readArticleImage(root, destination, 'a.png', 'scope:1', current), readArticleImage(root, destination, 'a.png', 'scope:1', current)]);
  assert.equal(values[0], values[1]); const before = allCounts(root).reads;
  await readArticleImage(root, destination, 'a.png', 'scope:1', current); assert.equal(allCounts(root).reads, before);
  await readArticleImage(root, destination, 'a.png', 'scope:2', current); assert.equal(allCounts(root).reads, before + 1);
  root.permission = 'denied'; await assert.rejects(readArticleImage(root, destination, 'a.png', 'scope:2', current), key('resources.libraryRequired'));
});

test('attachment reads are explicit, do not materialize a payload and cannot read outside the owning library', async () => {
  const root = fs({ 'articles/2026-10/one/media/file/guide.pdf': 'PDF' }), before = snapshot(root);
  const file = await readLinkedResource(root, destination, 'guide.pdf', current); assert.equal(file.size, 3); assert.equal(allCounts(root).bodyReads, 0); assert.equal(snapshot(root), before);
  const directory = await (await (await (await root.getDirectoryHandle('articles')).getDirectoryHandle('2026-10')).getDirectoryHandle('one')).getDirectoryHandle('media').then(dir => dir.getDirectoryHandle('file'));
  const foreign = tree('source', { 'secret.pdf': 'private' }); directory.children.set('guide.pdf', await foreign.getFileHandle('secret.pdf'));
  await assert.rejects(readLinkedResource(root, destination, 'guide.pdf', current), key('resources.unsafeTarget')); assert.equal(allCounts(foreign).bodyReads, 0);
});

test('a package carries article and explicitly referenced shared attachments, but excludes all knowledge/task data', async () => {
  const source = '# One\n\n[Guide](media/file/guide.pdf)\n[Shared](/shared/file/note.txt)';
  const root = fs({ 'articles/2026-10/one/media/file/guide.pdf': 'PDF', 'shared/file/note.txt': 'note', 'knowledge/index/manifest.json': 'private index', 'imports/tasks/other.json': 'private task' }); beginResourceSession(root, 1); publishResourceTasks(root, []);
  const packed = await createArticleDocumentPackage(source, root, '2026-10', 'one'), entries = unzipSync(new Uint8Array(await packed.blob.arrayBuffer()));
  assert.equal(strFromU8(entries['article.md']), source); assert.equal(strFromU8(entries['media/file/guide.pdf']), 'PDF'); assert.equal(strFromU8(entries['shared/file/note.txt']), 'note');
  assert.ok(!Object.keys(entries).some(name => /^(knowledge|imports)\//.test(name))); assert.equal(packed.mediaFiles, 2);
});

test('packages require an explicit partial decision, skip unfinished reservations and never fabricate missing files', async () => {
  const root = fs({ 'articles/2026-10/one/media/file/pending.pdf': '', 'articles/2026-10/one/media/file/ready.pdf': 'ready' }); beginResourceSession(root, 1); publishResourceTasks(root, [task([resource('pending.pdf', 'running')])]);
  const source = '[Pending](media/file/pending.pdf)\n[Ready](media/file/ready.pdf)';
  await assert.rejects(createArticleDocumentPackage(source, root, '2026-10', 'one'), key('resources.packageIncomplete'));
  const packed = await createArticleDocumentPackage(source, root, '2026-10', 'one', { allowIncomplete: true }), entries = unzipSync(new Uint8Array(await packed.blob.arrayBuffer()));
  assert.equal(entries['media/file/pending.pdf'], undefined); assert.equal(strFromU8(entries['media/file/ready.pdf']), 'ready'); assert.equal(strFromU8(entries['article.md']), source);
  await assert.rejects(createArticleDocumentPackage('[Missing](media/file/missing.pdf)', root, '2026-10', 'one'), key('resources.packageIncomplete'));
});

test('a package retains an inert attachment even when the source incorrectly uses it as an image', async () => {
  const root = fs({ 'articles/2026-10/one/media/file/logo.svg': '<svg>inert</svg>' }); beginResourceSession(root, 1); publishResourceTasks(root, []);
  const packed = await createArticleDocumentPackage('![SVG](media/file/logo.svg)', root, '2026-10', 'one', { allowIncomplete: true }), entries = unzipSync(new Uint8Array(await packed.blob.arrayBuffer()));
  assert.equal(strFromU8(entries['media/file/logo.svg']), '<svg>inert</svg>');
});

test('the exact sample URI prefers authorized source bytes and never substitutes a stock image for a missing knowledge file', async () => {
  let fetches = 0;
  const knowledge = { origin: { kind: 'knowledge' }, readResource: async () => new File(['source image'], 'article-sample.png') };
  const opened = await openImportResource({ source: ARTICLE_EXAMPLE_IMAGE, location: 'local' }, knowledge, new AbortController().signal, async () => { fetches++; throw Error('must not fetch'); });
  assert.equal(opened.expectedBytes, 12); await opened.stream.cancel(); assert.equal(fetches, 0);
  knowledge.readResource = async () => { throw new DOMException('missing', 'NotFoundError'); };
  await assert.rejects(openImportResource({ source: ARTICLE_EXAMPLE_IMAGE, location: 'local' }, knowledge, new AbortController().signal, async () => { fetches++; throw Error('must not fetch'); })); assert.equal(fetches, 0);
});

test('unchanged Markdown and stable media scopes bypass reparsing; actual source, snapshot or authority changes do not', async () => {
  const source = await readFile(new URL('../../src/lib/article-format/MarkdownPreview.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('export function sameMarkdownPreviewInput'), end = source.indexOf('function MarkdownPreviewContent', start), context = {};
  vm.runInNewContext(ts.transpileModule(source.slice(start, end).replace('export function', 'function') + '\nglobalThis.compare=sameMarkdownPreviewInput;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const original = { source: '# Body', snapshot: {}, media: { root: {}, article: { id: 'one' }, articleTitle: 'One', sessionKey: 'base', onOpen() {} } };
  assert.equal(context.compare(original, { ...original, media: { ...original.media } }), true);
  for (const next of [{ ...original, source: '# Changed' }, { ...original, snapshot: {} }, { ...original, media: { ...original.media, sessionKey: 'mutated' } }, { ...original, media: { ...original.media, root: {} } }, { ...original, media: { ...original.media, onOpen: undefined } }]) assert.equal(context.compare(original, next), false);
});

test('unmigrated CSS and complex embeds retain source and report only the imported references still present', async () => {
  const body = '<section style="background:url(cover.png)">Text</section>\n\n<style>@import "extra.css"; @font-face{src:url(font.woff2)}</style>\n\n<iframe src="embedded.html"></iframe>\n\n`<section style="background:url(code.png)">`\n\n```html\n<iframe src="code.html"></iframe>\n```';
  const planned = planMarkdownResources(body);
  assert.equal(planned.body, body); assert.equal(planned.resources.length, 0);
  assert.deepEqual(unsupportedResourceReferences(body).map(item => item.source), ['cover.png', 'extra.css', 'font.woff2', 'embedded.html']);
  assert.ok(planned.diagnostics.every(item => item.reason === 'unsupported-embedded'));
  const root = fs(); beginResourceSession(root, 1); publishResourceTasks(root, [{ ...task([]), diagnostics: planned.diagnostics }]);
  const issues = await inspectArticleResources(body, media(root)); assert.equal(issues.length, 4); assert.ok(issues.every(item => item.messageKey === 'resources.embeddedNotImported'));
  assert.equal((await inspectArticleResources('Replaced content.', media(root))).length, 0);
  const ordinary = fs(); beginResourceSession(ordinary, 1); publishResourceTasks(ordinary, []);
  assert.equal((await inspectArticleResources(body, media(ordinary))).length, 0, 'ordinary library CSS is not mislabeled as an import failure');
});

test('output warns about local note/wiki links without crawling or rewriting them; code and web links stay excluded', async () => {
  const root = fs(); beginResourceSession(root, 1); publishResourceTasks(root, []);
  const body = '[Note](notes/One.md#part)\n\n[[Second|Alias]]\n\n[Web](https://example.test/a.md)\n\n`[Example](code.md)`\n\n```mermaid\n[[Code]]\n```';
  const before = allCounts(root).reads;
  assert.deepEqual(await inspectArticleResources(body, media(root)), []);
  const issues = await inspectArticleResources(body, media(root), { output: true });
  assert.equal(issues.length, 2); assert.ok(issues.every(item => item.messageKey === 'resources.documentLinkNotCarried')); assert.equal(allCounts(root).reads, before);
  await assert.rejects(createArticleDocumentPackage(body, root, '2026-10', 'one'), key('resources.packageIncomplete'));
  const output = await createArticleDocumentPackage(body, root, '2026-10', 'one', { allowIncomplete: true });
  assert.equal(strFromU8(unzipSync(new Uint8Array(await output.blob.arrayBuffer()))['article.md']), body);
});

test('website root-base link formatting preserves managed shared attachment links', () => {
  const node = href => ({ type: 'element', tagName: 'a', properties: { href } });
  const tree = { type: 'root', children: [node('/shared/file/manual.pdf'), node('/shared/image/a.png'), node('/shared/file/bad%ZZ'), node('/blog/article')] };
  rehypeConfiguredNodeDefaults({ link: { classes: [], rootBase: 'https://example.test', externalTarget: '_blank' } })(tree);
  assert.deepEqual(tree.children.map(item => item.properties.href), ['/shared/file/manual.pdf', '/shared/image/a.png', '/shared/file/bad%ZZ', 'https://example.test/blog/article']);
});
