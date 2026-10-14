import test from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCE_TYPES, RESOURCE_FILE_LIMIT, validateResourceTypes, resourceType, resourceMime, resourceReference, validResourceLeaf } from '../../src/lib/resources/types.ts';
import { getResourceDirectory, inspectResourceFile, importResourceFile, writeResourceBlob, listResourceAssets, planResourceFileName, resourceAssetKey, resourceAssetReference } from '../../src/lib/resources/storage.ts';
import { getStoredArticleDirectory } from '../../src/lib/fileSystem.ts';
import { tree, snapshot, allCounts } from '../knowledge/fs-fixture.mjs';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const shared = { kind: 'shared' };
const article = { kind: 'article', articleId: '2026-10/first', month: '2026-10', folder: 'first', title: 'First' };
const current = () => true;
const errorKey = key => error => error.messageKey === key;
function filesystem(files = {}) {
  const root = tree('library', files), wrapped = new WeakSet();
  function wrap(directory) {
    if (wrapped.has(directory)) return directory; wrapped.add(directory);
    const getDirectory = directory.getDirectoryHandle, getFile = directory.getFileHandle;
    directory.getDirectoryHandle = async (...args) => wrap(await getDirectory(...args));
    directory.getFileHandle = async (...args) => { const file = await getFile(...args); file.isSameEntry ??= async other => file === other; return file; };
    return directory;
  }
  return wrap(root);
}
async function fileBytes(asset) { return new Uint8Array(await (await asset.handle.getFile()).arrayBuffer()); }
function registry() { return { schemaVersion: 1, types: structuredClone(RESOURCE_TYPES) }; }

test('classified resource registry covers common extensions and preserves an inert unknown-file fallback', () => {
  assert.ok(RESOURCE_TYPES.length >= 20);
  assert.ok(RESOURCE_TYPES.reduce((n, type) => n + Object.keys(type.extensions).length, 0) >= 200);
  for (const [name, id] of [['x.PNG', 'image'], ['x.svg', 'svg'], ['x.pdf', 'pdf'], ['x.docx', 'document'], ['x.xlsx', 'spreadsheet'], ['x.pptx', 'presentation'], ['x.md', 'markdown'], ['x.zip', 'archive'], ['x.mp4', 'video'], ['x.mp3', 'audio'], ['x.woff2', 'font'], ['x.css', 'stylesheet'], ['x.xyzzy', 'file']]) {
    const type = resourceType(name); assert.equal(type.id, id);
    if (id !== 'image') assert.equal(type.preview, 'none', name);
  }
  assert.equal(resourceType('unknown', 'application/pdf').id, 'pdf');
  assert.equal(resourceType('file.pdf', 'text/html').id, 'pdf', 'a declared MIME cannot opt a known attachment into an image preview');
  assert.equal(resourceType('unknown', 'application/octet-stream').id, 'file');
  assert.equal(resourceMime('report.pdf'), 'application/pdf');
  assert.equal(resourceMime('report.pdf', 'text/html'), 'application/pdf');
  assert.equal(resourceMime('data.unknown', 'TEXT/PLAIN; charset=utf-8'), 'text/plain');
  assert.equal(resourceMime('data.unknown', 'invalid'), 'application/octet-stream');
  assert.ok(Object.isFrozen(RESOURCE_TYPES)); assert.ok(Object.isFrozen(RESOURCE_TYPES[0].extensions));
  assert.throws(() => RESOURCE_TYPES[0].mimeAliases.push('text/html'), TypeError);
});

test('registry rejects missing, duplicate, unregistered and executable-preview definitions', () => {
  for (const alter of [
    value => { value.schemaVersion = 2; },
    value => { value.extra = true; },
    value => { value.types[0].unknown = true; },
    value => { value.types[1].id = value.types[0].id; },
    value => { value.types[1].extensions.png = 'image/png'; },
    value => { value.types[0].icon = 'invented'; },
    value => { value.types.find(x => x.id === 'pdf').preview = 'image'; },
    value => { value.types.find(x => x.id === 'svg').preview = 'image'; },
    value => { value.types = value.types.filter(x => x.id !== 'file'); },
    value => { value.types[0].extensions.bad = 'text/html\nX-Header: injected'; },
  ]) {
    const value = registry(); alter(value); assert.throws(() => validateResourceTypes(value), errorKey('resources.invalidRegistry'));
  }
});

test('MIME labels distinguish formats within a family and ambiguous names use conservative source metadata', () => {
  for (const [name, mime] of [
    ['x.dotx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template'],
    ['x.ott', 'application/vnd.oasis.opendocument.text-template'],
    ['x.xlsb', 'application/vnd.ms-excel.sheet.binary.macroenabled.12'],
    ['x.pptm', 'application/vnd.ms-powerpoint.presentation.macroenabled.12'],
    ['x.eot', 'application/vnd.ms-fontobject'], ['x.aiff', 'audio/x-aiff'],
    ['x.avi', 'video/x-msvideo'], ['x.ogv', 'video/ogg'], ['x.djvu', 'image/vnd.djvu'],
    ['x.mdb', 'application/x-msaccess'], ['x.ts', 'text/plain'], ['x.rs', 'text/plain'],
    ['x.stl', 'application/octet-stream'], ['x.mts', 'application/octet-stream'],
    ['x.obj', 'application/octet-stream'], ['x.fig', 'application/octet-stream'], ['x.sc', 'text/plain'],
    ['x.toml', 'application/octet-stream'], ['x.ini', 'text/plain'],
  ]) assert.equal(resourceMime(name), mime, name);
  for (const name of ['x.svg', 'x.heic', 'x.tiff', 'x.ico']) assert.equal(resourceType(name).preview, 'none');
});

test('references encode complete leaf names and planning is pure, unique, Unicode-safe and portable', () => {
  assert.equal(resourceReference('file', '方案 #1.pdf'), 'media/file/%E6%96%B9%E6%A1%88%20%231.pdf');
  assert.equal(resourceReference('image', 'one two.png', true), '/shared/image/one%20two.png');
  for (const name of ['', '..', '.hidden', '../outside', 'x/y', 'x\\y', 'x\u0000', 'x.', 'x ', 'CON.txt', 'LPT1', 'x'.repeat(121), '\ud800']) {
    assert.equal(validResourceLeaf(name), false, JSON.stringify(name)); assert.throws(() => resourceReference('file', name));
  }
  assert.throws(() => resourceReference('../file', 'good.pdf'));
  const first = planResourceFileName('C:\\path\\CON.pdf', 'file'), next = planResourceFileName('C:\\path\\CON.pdf', 'file');
  assert.ok(first.fileName.startsWith('file-CON-')); assert.notEqual(first.fileName, next.fileName); assert.ok(validResourceLeaf(first.fileName));
  assert.ok(planResourceFileName('😀'.repeat(60) + '.pdf', 'file').reference.includes('%F0%9F%98%80'));
});

test('image sniffing reuses the old 32-byte detector; attachments do not materialize a whole ArrayBuffer', async () => {
  const file = new File([png], 'wrong.extension', { type: 'text/plain' }); let reads = 0;
  file.arrayBuffer = async () => { throw Error('whole file read'); };
  const slice = file.slice.bind(file); file.slice = (start, end) => { reads++; assert.equal(start, 0); assert.equal(end, 32); return slice(start, end); };
  const inspected = await inspectResourceFile(file); assert.equal(inspected.storage, 'image'); assert.equal(inspected.extension, 'png'); assert.equal(reads, 1);
  const root = filesystem(); const asset = await importResourceFile(root, shared, file);
  assert.equal(asset.fileName, 'wrong.png'); assert.equal(asset.mimeType, 'image/png'); assert.equal(asset.typeId, 'image');
  assert.deepEqual(await fileBytes(asset), png);
  const pdf = new File(['%PDF-test'], 'guide.pdf'); pdf.arrayBuffer = async () => { throw Error('whole file read'); };
  const attached = await importResourceFile(root, shared, pdf); assert.equal(attached.storage, 'file'); assert.equal(attached.preview, 'none');
  assert.equal(resourceAssetReference(attached), '/shared/file/guide.pdf');
});

test('generic 64MiB import limit leaves the established raster-image policy intact', async () => {
  for (const delta of [0, 1]) {
    const file = new File(['attachment'], 'archive.zip'); Object.defineProperty(file, 'size', { value: RESOURCE_FILE_LIMIT + delta });
    if (delta) await assert.rejects(inspectResourceFile(file), errorKey('resources.tooLarge'));
    else assert.equal((await inspectResourceFile(file)).storage, 'file');
  }
  const image = new File([png], 'large.png'); Object.defineProperty(image, 'size', { value: RESOURCE_FILE_LIMIT + 1 });
  assert.equal((await inspectResourceFile(image)).storage, 'image');
  const root = filesystem(), huge = new Blob(['small']); Object.defineProperty(huge, 'size', { value: RESOURCE_FILE_LIMIT + 1 });
  await assert.rejects(writeResourceBlob(root, shared, 'file', 'large.zip', huge, current), errorKey('resources.tooLarge'));
  assert.equal(allCounts(root).creates, 0);
});

test('failed image headers and inaccessible file snapshots fail before creating target directories', async () => {
  const root = filesystem();
  await assert.rejects(importResourceFile(root, shared, new File(['html'], 'fake.png')), errorKey('articleMedia.fileContentCouldNotBeIdentifiedAsSupportedPngJpegGifWebp'));
  const unreadable = new File(['PDF'], 'guide.pdf'); unreadable.slice = () => ({ arrayBuffer: async () => { throw new DOMException('denied', 'NotReadableError'); } });
  await assert.rejects(importResourceFile(root, shared, unreadable), { name: 'NotReadableError' });
  await assert.rejects(writeResourceBlob(root, shared, 'image', 'fake.png', new Blob(['html']), current));
  assert.equal(allCounts(root).creates, 0);
});

test('old image paths are retained and new file directories are lazy; reads and missing targets create nothing', async () => {
  const root = filesystem({ 'articles/2026-10/first/article.md': '# Original' });
  assert.equal(await getResourceDirectory(root, shared, 'file'), null);
  assert.equal(await getResourceDirectory(root, article, 'image'), null);
  assert.equal(allCounts(root).creates, 0);
  const image = await importResourceFile(root, article, new File([png], 'cover.png'));
  assert.deepEqual(await root.resolve(image.handle), ['articles', '2026-10', 'first', 'media', 'image', 'cover.png']);
  const attachment = await importResourceFile(root, article, new File(['data'], 'notes.txt'));
  assert.deepEqual(await root.resolve(attachment.handle), ['articles', '2026-10', 'first', 'media', 'file', 'notes.txt']);
  const before = allCounts(root).creates; const listed = await listResourceAssets(root, article); assert.equal(allCounts(root).creates, before);
  assert.deepEqual(listed.map(x => x.storage).sort(), ['file', 'image']); assert.notEqual(resourceAssetKey(listed[0]), resourceAssetKey(listed[1]));
  assert.equal((await (await (await getStoredArticleDirectory(root, article.month, article.folder)).getFileHandle('article.md')).getFile()).size, 10);
});

test('target identity, unsafe month/folder and deleted manuscripts are rejected without creating articles', async () => {
  for (const destination of [
    { ...article, articleId: '2026-10/other' },
    { ...article, month: '../outside', articleId: '../outside/first' },
    { ...article, folder: '../outside', articleId: '2026-10/../outside' },
    { ...article, folder: 'missing', articleId: '2026-10/missing' },
  ]) {
    const root = filesystem({ 'articles/2026-10/first/article.md': '# Original' });
    await assert.rejects(importResourceFile(root, destination, new File(['data'], 'file.txt'))); assert.equal(allCounts(root).creates, 0);
  }
  const root = filesystem({ 'articles/2026-10/first/unrelated.txt': 'not a saved article' });
  await assert.rejects(importResourceFile(root, article, new File(['data'], 'file.txt')), { name: 'NotFoundError' });
  assert.equal(allCounts(root).creates, 0);
});

test('no prompt or write occurs for stale/ungranted libraries, including the new no-request article lookup', async () => {
  for (const permission of ['prompt', 'denied']) {
    const root = filesystem({ 'articles/2026-10/first/article.md': 'body' }); root.permission = permission;
    await assert.rejects(importResourceFile(root, shared, new File(['data'], 'file.txt')), errorKey('resources.libraryRequired'));
    await assert.rejects(getStoredArticleDirectory(root, article.month, article.folder, { requestPermission: false }));
    assert.equal(allCounts(root).creates, 0); assert.equal(allCounts(root).permission.filter(([action]) => action === 'request').length, 0);
  }
  const root = filesystem(); await assert.rejects(importResourceFile(root, shared, new File(['data'], 'file.txt'), () => false), errorKey('resources.changed')); assert.equal(allCounts(root).writes, 0);
});

test('the legacy article lookup still requests permission when explicitly used with its default behavior', async () => {
  const root = filesystem({ 'articles/2026-10/first/article.md': 'body' }); root.permission = 'prompt';
  assert.ok(await getStoredArticleDirectory(root, article.month, article.folder));
  assert.equal(root.counters.permission.filter(([action]) => action === 'request').length, 1);
});

test('concurrent filename reservations keep payload writes independent and never overwrite a sibling', { timeout: 2000 }, async () => {
  const root = filesystem({ 'shared/file/old.pdf': 'retain' }), directory = await getResourceDirectory(root, shared, 'file');
  let release, entered; const blocked = new Promise(resolve => { release = resolve; }), firstWrite = new Promise(resolve => { entered = resolve; });
  const original = directory.getFileHandle;
  directory.getFileHandle = async (...args) => {
    const handle = await original(...args);
    if (args[0] === 'same.pdf' && !handle.blocked) { handle.blocked = true; const create = handle.createWritable; handle.createWritable = async () => { const writer = await create(); const write = writer.write; writer.write = async value => { entered(); await blocked; await write(value); }; return writer; }; }
    return handle;
  };
  const first = importResourceFile(root, shared, new File(['first'], 'same.pdf')); await firstWrite;
  const second = await importResourceFile(root, shared, new File(['second'], 'same.pdf')); assert.equal(second.fileName, 'same-2.pdf');
  release(); const firstAsset = await first; assert.equal(firstAsset.fileName, 'same.pdf');
  assert.equal(new TextDecoder().decode(await fileBytes(firstAsset)), 'first'); assert.equal(new TextDecoder().decode(await fileBytes(second)), 'second');
  const index = await importResourceFile(root, shared, new File(['{}'], 'INDEX.JSON')); assert.equal(index.fileName, 'INDEX-2.json');
  assert.equal((await (await directory.getFileHandle('old.pdf')).getFile()).size, 6);
});

test('explicit planned filenames reject concurrent, casefold and normalized collisions', async () => {
  const root = filesystem({ 'shared/file/Guide.pdf': 'old' });
  await assert.rejects(writeResourceBlob(root, shared, 'file', 'Ｇｕｉｄｅ.pdf', new Blob(['new']), current), errorKey('resources.exists'));
  const results = await Promise.allSettled([writeResourceBlob(root, shared, 'file', 'next.pdf', new Blob(['one']), current), writeResourceBlob(root, shared, 'file', 'next.pdf', new Blob(['two']), current)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  for (const name of ['index.json', 'INDEX.JSON', '../x']) await assert.rejects(writeResourceBlob(root, shared, 'file', name, new Blob(['new']), current));
});

test('write/close/readback failures abort and remove only this new target; old resources remain', async () => {
  for (const stage of ['write', 'close', 'readback']) {
    const root = filesystem({ 'shared/file/old.txt': 'retain' }), directory = await getResourceDirectory(root, shared, 'file'), original = directory.getFileHandle;
    let aborted = 0;
    directory.getFileHandle = async (...args) => {
      const handle = await original(...args);
      if (args[0] === 'new.txt' && !handle.instrumented) { handle.instrumented = true; const create = handle.createWritable; handle.createWritable = async () => { const writer = await create(); return { write: async blob => { if (stage === 'write') throw Error('write failure'); await writer.write(stage === 'readback' ? new Blob(['x']) : blob); }, close: async () => { if (stage === 'close') throw Error('close failure'); await writer.close(); }, abort: async () => { aborted++; await writer.abort(); } }; }; }
      return handle;
    };
    await assert.rejects(writeResourceBlob(root, shared, 'file', 'new.txt', new Blob(['payload']), current));
    assert.equal(aborted, 1); assert.equal(directory.children.has('new.txt'), false); assert.equal(directory.children.get('old.txt').value, 'retain');
  }
});

test('loss of permission or session during writing cannot close or clean an unauthorized target', async () => {
  for (const loss of ['permission', 'session']) {
    const root = filesystem({ 'shared/file/old.txt': 'retain' }), directory = await getResourceDirectory(root, shared, 'file'), original = directory.getFileHandle;
    let active = true, closes = 0;
    directory.getFileHandle = async (...args) => {
      const handle = await original(...args);
      if (args[0] === 'new.txt' && !handle.instrumented) { handle.instrumented = true; const create = handle.createWritable; handle.createWritable = async () => { const writer = await create(); return { write: async blob => { await writer.write(blob); if (loss === 'permission') root.permission = 'denied'; else active = false; }, close: async () => { closes++; await writer.close(); }, abort: writer.abort }; }; }
      return handle;
    };
    await assert.rejects(writeResourceBlob(root, shared, 'file', 'new.txt', new Blob(['payload']), () => active));
    assert.equal(closes, 0); assert.equal(directory.children.get('new.txt').value, ''); assert.equal(directory.children.get('old.txt').value, 'retain');
    assert.equal(allCounts(root).permission.filter(([action]) => action === 'request').length, 0);
  }
});

test('an externally replaced target is not closed or removed by the stale writer', async () => {
  const root = filesystem({ 'shared/file/old.txt': 'retain' }), directory = await getResourceDirectory(root, shared, 'file'), original = directory.getFileHandle;
  let closes = 0;
  directory.getFileHandle = async (...args) => {
    const handle = await original(...args);
    if (args[0] === 'new.txt' && !handle.instrumented) { handle.instrumented = true; const create = handle.createWritable; handle.createWritable = async () => { const writer = await create(); return { write: async blob => { await writer.write(blob); directory.seed('new.txt', 'external replacement'); }, close: async () => { closes++; await writer.close(); }, abort: writer.abort }; }; }
    return handle;
  };
  await assert.rejects(writeResourceBlob(root, shared, 'file', 'new.txt', new Blob(['payload']), current), errorKey('resources.changed'));
  assert.equal(closes, 0); assert.equal(directory.children.get('new.txt').value, 'external replacement');
});

test('aliased directories and files are rejected before reading or writing another source or manuscript', async () => {
  const external = filesystem({ 'private.txt': 'do not read or write' }), before = snapshot(external), root = filesystem();
  root.children.set('shared', external);
  await assert.rejects(importResourceFile(root, shared, new File(['data'], 'file.txt')), errorKey('resources.unsafeTarget'));
  assert.equal(snapshot(external), before); assert.equal(allCounts(external).writes, 0);
  const siblings = filesystem({ 'articles/2026-10/first/article.md': 'first', 'articles/2026-10/other/article.md': 'other' });
  const month = await (await siblings.getDirectoryHandle('articles')).getDirectoryHandle('2026-10'); month.children.set('first', await month.getDirectoryHandle('other'));
  await assert.rejects(importResourceFile(siblings, article, new File(['data'], 'file.txt')), errorKey('resources.unsafeTarget')); assert.equal(allCounts(siblings).creates, 0);
  for (const storage of ['image', 'file']) {
    const target = filesystem({ ['shared/' + storage + '/keep.txt']: 'old' }), directory = await getResourceDirectory(target, shared, storage);
    directory.children.set('private.txt', await external.getFileHandle('private.txt'));
    const reads = allCounts(external).reads; await assert.rejects(listResourceAssets(target, shared), errorKey('resources.unsafeTarget')); assert.equal(allCounts(external).reads, reads);
  }
});

test('listing attachments reads metadata only and legacy image descriptions remain available', async () => {
  const root = filesystem({ 'shared/file/guide.pdf': 'PDF', 'shared/file/diagram.svg': '<svg/>', 'shared/image/cover.png': png, 'shared/image/index.json': JSON.stringify({ version: 1, images: { 'cover.png': { description: 'retained' } } }) });
  const before = allCounts(root), listed = await listResourceAssets(root, shared), after = allCounts(root);
  assert.equal(after.creates, before.creates); assert.equal(after.writes, before.writes);
  assert.equal(listed.find(x => x.fileName === 'guide.pdf').preview, 'none'); assert.equal(listed.find(x => x.fileName === 'diagram.svg').preview, 'none'); assert.equal(listed.find(x => x.fileName === 'cover.png').description, 'retained');
  assert.equal(after.bodyReads - before.bodyReads, 1, 'only the legacy metadata JSON is read in full');
});

test('files in attachment storage never gain preview capability from their filename or declared MIME', async () => {
  const root = filesystem({ 'shared/file/looks-like.png': 'not decoded', 'shared/file/script.svg': '<svg onload="alert(1)"/>' });
  const before = allCounts(root), listed = await listResourceAssets(root, shared), after = allCounts(root);
  assert.equal(listed.length, 2);
  assert.ok(listed.every(asset => asset.storage === 'file' && asset.preview === 'none'));
  assert.equal(after.bodyReads, before.bodyReads, 'listing does not parse or execute attachment bodies');
});

test('source File snapshots remain unchanged when copied to the target resource store', async () => {
  const source = filesystem({ 'manual.pdf': 'source contents' }), sourceBefore = snapshot(source), root = filesystem();
  const file = await (await source.getFileHandle('manual.pdf')).getFile(); const copied = await importResourceFile(root, shared, file);
  assert.equal(new TextDecoder().decode(await fileBytes(copied)), 'source contents'); assert.equal(snapshot(source), sourceBefore); assert.equal(allCounts(source).writes, 0); assert.equal(allCounts(source).creates, 0);
});
