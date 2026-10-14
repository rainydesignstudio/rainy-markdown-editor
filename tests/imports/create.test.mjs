import test from 'node:test';
import assert from 'node:assert/strict';
import { readMarkdownImport, prepareMarkdownImport } from '../../src/lib/imports/document.ts';
import { planMarkdownResources } from '../../src/lib/imports/plan.ts';
import { resourceReferences } from '../../src/lib/resources/references.ts';
import { createMarkdownImport } from '../../src/lib/imports/create.ts';
import { knowledgeImportSource, chooseMarkdownImport } from '../../src/lib/imports/source.ts';
import { connectKnowledgeSource } from '../../src/lib/knowledge/source.ts';
import { parseArticle } from '../../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../../src/lib/themes.ts';
import { monthKey } from '../../src/lib/fileSystem.ts';
import { tree, snapshot, allCounts } from '../knowledge/fs-fixture.mjs';

const key = name => error => error.messageKey === name;
const themed = { ...BASIC_THEME, id: 'chosen', name: 'Chosen theme', version: '2.3.4' };
async function setup(text, extra = {}) {
  const root = tree('library', extra), sourceRoot = tree('source', { 'notes/source.md': text, 'notes/picture.png': 'unread image' });
  const entries = new Map(), store = { save: async (id, item) => { entries.set(id, item); }, load: async id => entries.get(id), remove: async id => { entries.delete(id); } };
  let current = true;
  const knowledge = await connectKnowledgeSource(root, sourceRoot, store, () => current);
  const source = await knowledgeImportSource(knowledge, 'notes/source.md');
  return { root, sourceRoot, source, knowledge, stop: () => { current = false; } };
}

test('import metadata uses the chosen theme and new dates, preserving unknown YAML keys, comments and exact body', () => {
  const body = '\r\n# Heading *text*\r\n\r\nBody kept.\r\n';
  const original = '---\r\n# source comment\r\ntitle: Source title\r\ntheme: some-other-app\r\nauthor: [one, two]\r\ncategories: development\r\ncustom:\r\n  enabled: true\r\n---\r\n' + body;
  const now = '2026-10-10T12:00:00.000Z', prepared = prepareMarkdownImport(original, 'source.md', themed, now), parsed = parseArticle(prepared);
  assert.equal(parsed.canCopy, true); assert.equal(parsed.body, body);
  assert.equal(parsed.metadata.title, 'Source title'); assert.equal(parsed.metadata.author, '');
  assert.deepEqual(parsed.metadata.categories, ['development']); assert.deepEqual(parsed.metadata.custom, { enabled: true });
  assert.deepEqual(parsed.metadata.theme, { id: 'chosen', version: '2.3.4' }); assert.equal(parsed.metadata.createdAt, now); assert.equal(parsed.metadata.updatedAt, now);
  assert.match(prepared, /# source comment/);
  assert.equal(parseArticle(prepareMarkdownImport('# New *heading*\n\nBody', 'fallback.md', themed, now)).metadata.title, 'New heading');
  assert.equal(parseArticle(prepareMarkdownImport('Plain body', 'fallback.md', themed, now)).metadata.title, 'fallback');
});

test('invalid YAML, non-Markdown, oversized and malformed UTF-8 inputs fail before any target write', async () => {
  for (const text of ['---\ntitle: unfinished', '---\ntitle: one\ntitle: two\n---\nbody', '---\n- array\n---\nbody']) assert.throws(() => prepareMarkdownImport(text, 'source.md', themed), key('imports.invalidMarkdown'));
  await assert.rejects(readMarkdownImport(new File(['body'], 'source.txt')), key('imports.markdownOnly'));
  const large = new File(['x'], 'source.md'); Object.defineProperty(large, 'size', { value: 2 * 1024 * 1024 + 1 });
  large.arrayBuffer = () => { throw Error('oversized file must not be read'); };
  await assert.rejects(readMarkdownImport(large), key('imports.documentTooLarge'));
  await assert.rejects(readMarkdownImport(new File([Uint8Array.of(0xff, 0xfe)], 'source.md')), key('imports.utf8Required'));
});

test('source ranges cover Markdown, definitions and HTML URLs without rewriting code, ordinary pages or note links', () => {
  const body = '# Source\n\n![one](photo\\(1\\).png "caption")\n![again][picture]\n[pdf](manual.pdf#page=2 "PDF title")\n[note](other.md)\n[page](https://example.test/page)\n\n[picture]: photo\\(1\\).png "reference title"\n\n<img src="cover.png?size=2&amp;crop=1" alt="Keep alt" />\n<picture><source srcset="a.webp 1x, b.webp 2x"></picture>\n<svg><image href="static.svg" /></svg>\n\n`![code](untouched.png)`\n\n```mermaid\n![code](untouched.png)\n```\n<script>const x="<img src=untouched.png>"</script>';
  const refs = resourceReferences(body);
  assert.ok(refs.some(item => item.url === 'cover.png?size=2&crop=1'));
  assert.ok(refs.some(item => item.url === 'a.webp')); assert.ok(refs.some(item => item.url === 'static.svg'));
  assert.equal(refs.some(item => item.url.includes('untouched') || item.url === 'other.md' || item.url.endsWith('/page')), false);
  const planned = planMarkdownResources(body);
  assert.equal(planned.resources.length, 6, 'the duplicate inline and definition image shares one final name');
  const photo = planned.resources.find(item => item.source === 'photo(1).png');
  assert.equal(photo.storage, 'image'); assert.match(photo.reference, /photo%281%29-/);
  assert.equal((planned.body.match(new RegExp(photo.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length, 0, 'references use encoded leaf names');
  assert.ok(planned.body.includes(photo.reference)); assert.match(planned.body, /"caption"/); assert.match(planned.body, /"reference title"/); assert.match(planned.body, /alt="Keep alt"/);
  assert.match(planned.body, /#page=2/); assert.match(planned.body, /other\.md/); assert.match(planned.body, /!\[code\]\(untouched\.png\)/);
  assert.equal(planned.resources.find(item => item.source === 'static.svg').storage, 'file', 'SVG is carried as an inert attachment; click rendering stays frozen');
});

test('unsafe resources remain explicit diagnostics and resource limits do not silently claim complete migration', () => {
  const unsafe = planMarkdownResources('![empty]()\n![bad](javascript:alert)\n![file](file:///private/a.png)');
  assert.equal(unsafe.resources.length, 0); assert.equal(unsafe.diagnostics.length, 3);
  assert.match(unsafe.body, /javascript:alert/);
  const many = planMarkdownResources(Array.from({ length: 1002 }, (_, n) => `![${n}](p-${n}.png)`).join('\n'));
  assert.equal(many.resources.length, 1000); assert.equal(many.diagnostics[0].reason, 'resource-limit');
  assert.match(many.body, /\(p-1001\.png\)/);
});

test('a knowledge import creates the article, chosen snapshot, monthly index and durable resource plan before reading any resource', async () => {
  const f = await setup('---\ntitle: Copy\ncustom: retained\n---\n# Body\n\n![one](picture.png)\n[note](other.md)');
  const before = snapshot(f.sourceRoot), reads = allCounts(f.sourceRoot).bodyReads;
  const made = await createMarkdownImport(f.root, f.source, themed, () => true);
  assert.equal(made.result.sourceSaved, true); assert.equal(made.result.indexUpdated, true); assert.equal(made.result.article.themeValid, true); assert.equal(made.taskSaved, true);
  assert.equal(made.task.resources.length, 1); assert.equal(made.task.state, 'pending'); assert.equal(made.task.diagnostics[0].reason, 'document-link');
  const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(made.result.article.month), directory = await month.getDirectoryHandle(made.result.article.folder);
  assert.match(await (await directory.getFileHandle('article.md')).getFile().then(file => file.text()), /media\/image\/picture-/);
  assert.deepEqual(JSON.parse(await (await directory.getFileHandle('theme.json')).getFile().then(file => file.text())), themed);
  assert.ok(Object.hasOwn(JSON.parse(await (await month.getFileHandle('index.json')).getFile().then(file => file.text())), made.result.article.folder));
  const task = await (await (await f.root.getDirectoryHandle('imports')).getDirectoryHandle('tasks')).getFileHandle(made.task.id + '.json');
  assert.equal(JSON.parse(await (await task.getFile()).text()).target.articleId, made.result.article.id);
  assert.equal(snapshot(f.sourceRoot), before); assert.equal(allCounts(f.sourceRoot).writes, 0); assert.equal(allCounts(f.sourceRoot).creates, 0);
  assert.equal(allCounts(f.sourceRoot).bodyReads - reads, 1, 'only the Markdown is read; no asset payload, scan or download');
  assert.ok(allCounts(f.sourceRoot).permission.every(([, mode]) => mode === 'read'));
});

test('duplicate imports remain independent and prototype-like titles are real own index entries', async () => {
  const f = await setup('---\ntitle: __proto__\n---\nSame body');
  const first = await createMarkdownImport(f.root, f.source, themed, () => true), second = await createMarkdownImport(f.root, f.source, themed, () => true);
  assert.notEqual(first.result.article.id, second.result.article.id); assert.notEqual(first.task.id, second.task.id);
  const month = await (await f.root.getDirectoryHandle('articles')).getDirectoryHandle(first.result.article.month);
  const index = JSON.parse(await (await month.getFileHandle('index.json')).getFile().then(file => file.text()));
  assert.ok(Object.hasOwn(index, '__proto__')); assert.equal(Object.getPrototypeOf(index), Object.prototype);
});

test('source changes, stale sessions and denied target permission cannot create imported manuscripts', async () => {
  const changed = await setup('# Original');
  const notes = await changed.sourceRoot.getDirectoryHandle('notes'); notes.seed('source.md', '# Changed');
  const before = allCounts(changed.root).creates;
  await assert.rejects(createMarkdownImport(changed.root, changed.source, themed, () => true), key('imports.sourceChanged')); assert.equal(allCounts(changed.root).creates, before);
  const f = await setup('# Original'), count = allCounts(f.root).creates;
  await assert.rejects(createMarkdownImport(f.root, f.source, themed, () => false), key('imports.changed'));
  f.root.permission = 'denied'; await assert.rejects(createMarkdownImport(f.root, f.source, themed, () => true), key('resources.libraryRequired'));
  assert.equal(allCounts(f.root).creates, count); assert.equal(allCounts(f.root).permission.filter(([action]) => action === 'request').length, 0);
});

test('aliased article/task targets and index files cannot write or read the source; a failed task record retains the saved manuscript', async () => {
  const aliased = await setup('# Original'); aliased.root.children.set('articles', aliased.sourceRoot); const sourceBefore = snapshot(aliased.sourceRoot);
  await assert.rejects(createMarkdownImport(aliased.root, aliased.source, themed, () => true)); assert.equal(snapshot(aliased.sourceRoot), sourceBefore);
  const taskAlias = await setup('# Original'); taskAlias.root.children.set('imports', taskAlias.sourceRoot); const before = snapshot(taskAlias.sourceRoot);
  const saved = await createMarkdownImport(taskAlias.root, taskAlias.source, themed, () => true);
  assert.equal(saved.result.sourceSaved, true); assert.equal(saved.taskSaved, false); assert.ok(saved.taskIssue); assert.equal(snapshot(taskAlias.sourceRoot), before);
  const indexed = await setup('# Original', { ['articles/' + monthKey() + '/index.json']: '{}' });
  indexed.sourceRoot.seed('private.json', '{"private":"do not read"}');
  const privateFile = await indexed.sourceRoot.getFileHandle('private.json'), originalRead = privateFile.getFile; let privateReads = 0;
  privateFile.getFile = async () => { privateReads++; return originalRead(); };
  const month = await (await indexed.root.getDirectoryHandle('articles')).getDirectoryHandle(monthKey()); month.children.set('index.json', privateFile);
  const partial = await createMarkdownImport(indexed.root, indexed.source, themed, () => true);
  assert.equal(partial.result.sourceSaved, true); assert.equal(partial.result.indexUpdated, false); assert.ok(partial.result.indexError);
  assert.equal(privateReads, 0, 'an aliased index is not read during fallback reconstruction');
  assert.equal(allCounts(indexed.sourceRoot).writes, 0);
});

test('a theme write failure reports the partial manuscript without overwriting the source or claiming a complete snapshot', async () => {
  const f = await setup('# Original'), wrapped = new WeakSet();
  const wrap = directory => {
    if (wrapped.has(directory)) return directory; wrapped.add(directory);
    const getDirectory = directory.getDirectoryHandle, getFile = directory.getFileHandle;
    directory.getDirectoryHandle = async (...args) => wrap(await getDirectory(...args));
    directory.getFileHandle = async (...args) => { const handle = await getFile(...args); if (args[0] === 'theme.json') handle.createWritable = async () => { throw new Error('theme write failed'); }; return handle; };
    return directory;
  }; wrap(f.root);
  const before = snapshot(f.sourceRoot), made = await createMarkdownImport(f.root, f.source, themed, () => true);
  assert.equal(made.result.sourceSaved, true); assert.equal(made.result.article.themeValid, false); assert.equal(made.result.indexUpdated, false); assert.ok(made.result.indexError);
  assert.equal(snapshot(f.sourceRoot), before); assert.equal(allCounts(f.sourceRoot).writes, 0);
});

test('native file and directory picking request read only and never expose writable source handles', async () => {
  const originalWindow = globalThis.window, sourceRoot = tree('source', { 'source.md': '# Local', 'a.png': 'resource' });
  const file = await sourceRoot.getFileHandle('source.md'); file.queryPermission = async options => { assert.equal(options.mode, 'read'); return 'granted'; }; file.isSameEntry = async other => file === other;
  const calls = [];
  globalThis.window = { showOpenFilePicker: async options => { calls.push(options); return [file]; }, showDirectoryPicker: async options => { calls.push(options); return sourceRoot; } };
  try {
    const picked = await chooseMarkdownImport(() => true), connected = await picked.chooseDirectory();
    assert.deepEqual(calls[1], { mode: 'read' }); assert.equal(calls[0].multiple, false);
    assert.ok(!Object.hasOwn(connected, 'root')); assert.ok(!Object.hasOwn(connected, 'handle')); assert.ok(!Object.hasOwn(connected, 'write'));
    assert.equal((await connected.readResource('a.png')).size, 8);
    await assert.rejects(connected.readResource('../outside.png'), key('imports.unsafeResource'));
    await assert.rejects(connected.assertTarget(sourceRoot), key('imports.sourceDirectoryMismatch'));
    assert.equal(allCounts(sourceRoot).writes, 0); assert.equal(allCounts(sourceRoot).creates, 0);
  } finally { globalThis.window = originalWindow; }
});
