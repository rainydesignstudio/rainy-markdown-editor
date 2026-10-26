import test from 'node:test';
import assert from 'node:assert/strict';
import { tree } from './knowledge/fs-fixture.mjs';
import { saveStoredArticle, readStoredArticleById } from '../src/lib/fileSystem.ts';
import { createArticleSource } from '../src/lib/frontMatter.ts';
import { getTheme } from '../src/lib/themes.ts';
import { createDefaultEditorWorkspace } from '../src/lib/editorWorkspace.ts';
import { DEFAULT_ARTICLE_SETTINGS, loadArticleSettings } from '../src/lib/articleSettings.ts';
import { updateSettingsDocument } from '../src/lib/settingsFile.ts';
import { listArticleTrash, trashStoredArticle, restoreTrashedArticle, beginTrashCleanup, cancelTrashCleanup, checkpointTrashCleanup, finishTrashCleanup } from '../src/lib/articleTrash.ts';

async function dir(root, path) { for (const name of path.split('/').filter(Boolean)) root = await root.getDirectoryHandle(name, { create: true }); return root; }
async function write(root, path, value) { const parts = path.split('/'), name = parts.pop(), parent = await dir(root, parts.join('/')); const stream = await (await parent.getFileHandle(name, { create: true })).createWritable(); await stream.write(value); await stream.close(); }
async function read(root, path) { const parts = path.split('/'), name = parts.pop(); for (const p of parts) root = await root.getDirectoryHandle(p); return (await (await root.getFileHandle(name)).getFile()).text(); }
async function bytes(root, prefix = '', result = {}) { for await (const [name, entry] of root.entries()) { const path = prefix + name; if (entry.kind === 'directory') await bytes(entry, path + '/', result); else result[path] = Buffer.from(await (await entry.getFile()).arrayBuffer()).toString('hex'); } return result; }
async function fixture() {
  const root = tree('isolated-trash'), theme = getTheme('basic');
  const { article } = await saveStoredArticle(root, createArticleSource('Original', 'basic') + '\n# Original\n', theme, 'Original', '2026-10');
  const path = 'articles/2026-10/Original', source = await dir(root, path);
  await write(root, path + '/media/image/local.png', Uint8Array.of(137, 80, 78, 71, 0, 255));
  await write(root, path + '/media/file/empty.txt', '');
  await write(root, path + '/.history/one/article.md', article.source);
  await write(root, path + '/.history/one/theme.json', JSON.stringify(theme));
  await dir(root, path + '/media/empty');
  const workspace = createDefaultEditorWorkspace(); workspace.articleOrganization[article.id] = { projectId: null, archived: true }; workspace.articleOrder.unclassified = ['2026-10/Before', article.id, '2026-10/After'];
  await write(root, 'settings.json', JSON.stringify({ ...DEFAULT_ARTICLE_SETTINGS, ...workspace, version: 2 }));
  return { root, article, source, path, before: await bytes(source), organization: workspace.articleOrganization[article.id] };
}
const move = f => trashStoredArticle(f.root, f.article, f.organization, 1);
const failure = key => error => error.messageKey === key;
async function entryDirectory(root, id) { return dir(root, '_trash/' + id); }

test('reading an absent recycle bin does not create directories or files', async () => {
  const root = tree('library'); assert.deepEqual(await listArticleTrash(root), { entries: [], cleanups: [], issues: [] }); assert.equal(root.children.size, 0); assert.equal(root.counters.creates, 0);
});

test('move and restore preserve every body, theme, binary, history byte and empty directory plus organization/order', async () => {
  const f = await fixture(), moved = await move(f);
  assert.equal(moved.sourceRemoved, true); assert.deepEqual(moved.issues, []);
  await assert.rejects(readStoredArticleById(f.root, '2026-10', 'Original'));
  const copy = await dir(f.root, '_trash/' + moved.entry.id + '/article'); assert.deepEqual(await bytes(copy), f.before); assert.ok(copy.children.get('media').children.has('empty'));
  await updateSettingsDocument(f.root, current => ({ ...current, workspace: { ...current.workspace, articleOrganization: {}, articleOrder: { unclassified: ['2026-10/Before', '2026-10/After'] } } }));
  const restored = await restoreTrashedArticle(f.root, moved.entry.id); assert.deepEqual(restored.issues, []);
  assert.deepEqual(await bytes(await dir(f.root, f.path)), f.before);
  const settings = JSON.parse(await read(f.root, 'settings.json')); assert.deepEqual(settings.articleOrganization[f.article.id], f.organization);
  assert.deepEqual(settings.articleOrder.unclassified, ['2026-10/Before', f.article.id, '2026-10/After']);
  assert.deepEqual((await listArticleTrash(f.root)).entries, []);
});

test('an occupied restore path is never overwritten and its complete trash copy remains', async () => {
  const f = await fixture(), moved = await move(f); await write(f.root, f.path + '/article.md', '# A different article');
  await assert.rejects(restoreTrashedArticle(f.root, moved.entry.id), failure('trash.conflict'));
  assert.equal(await read(f.root, f.path + '/article.md'), '# A different article');
  assert.deepEqual(await bytes(await dir(f.root, '_trash/' + moved.entry.id + '/article')), f.before);
});

test('separate restores use retained neighbours so multiple removals recover manual order in either order', async () => {
  const f = await fixture();
  const second = (await saveStoredArticle(f.root, createArticleSource('Second', 'basic'), getTheme('basic'), 'Second', '2026-10')).article;
  const original = [f.article.id, '2026-10/Between', second.id, '2026-10/After'];
  const firstMove = await trashStoredArticle(f.root, f.article, f.organization, 0, () => true, original);
  const secondMove = await trashStoredArticle(f.root, second, f.organization, 2, () => true, original);
  await updateSettingsDocument(f.root, current => ({ ...current, workspace: { ...current.workspace, articleOrganization: {}, articleOrder: { unclassified: ['2026-10/Between', '2026-10/After'] } } }));
  await restoreTrashedArticle(f.root, secondMove.entry.id);
  assert.deepEqual(JSON.parse(await read(f.root, 'settings.json')).articleOrder.unclassified, ['2026-10/Between', second.id, '2026-10/After']);
  await restoreTrashedArticle(f.root, firstMove.entry.id);
  assert.deepEqual(JSON.parse(await read(f.root, 'settings.json')).articleOrder.unclassified, original);
});

test('a receipt externally replaced during copying is never overwritten or used to retire the source', async () => {
  const f = await fixture(), base = await dir(f.root, '_trash'), allocate = base.getDirectoryHandle.bind(base);
  let record;
  base.getDirectoryHandle = async (...args) => {
    const destination = await allocate(...args), child = destination.getDirectoryHandle.bind(destination);
    destination.getDirectoryHandle = async (...childArgs) => {
      const result = await child(...childArgs);
      if (childArgs[0] === 'article' && childArgs[1]?.create) { record = destination.children.get('entry.json'); record.value = 'External replacement'; }
      return result;
    };
    return destination;
  };
  await assert.rejects(move(f)); assert.equal(record.value, 'External replacement');
  assert.deepEqual(await bytes(f.source), f.before);
});

test('copy-write failure retains the entire original and does not expose an incomplete copy as a recoverable article', async () => {
  const f = await fixture(), base = await dir(f.root, '_trash'), create = base.getDirectoryHandle.bind(base);
  base.getDirectoryHandle = async (id, options) => {
    const record = await create(id, options), original = record.getDirectoryHandle.bind(record);
    if (options?.create) record.getDirectoryHandle = async (name, request) => { const child = await original(name, request); if (name === 'article') child.failWrite = true; return child; };
    return record;
  };
  await assert.rejects(move(f)); assert.deepEqual(await bytes(f.source), f.before);
  assert.equal((await listArticleTrash(f.root)).entries.length, 0);
  assert.equal(base.children.size, 0, 'verified owned partial copies and receipts are removed');
  base.getDirectoryHandle = create; assert.equal((await move(f)).sourceRemoved, true);
});

test('first recovery-record writer failure removes only its empty allocation and retry remains possible', async () => {
  for (const replacement of [false, true]) {
    const f = await fixture(), base = await dir(f.root, '_trash'), create = base.getDirectoryHandle.bind(base);
    base.getDirectoryHandle = async (id, options) => {
      const record = await create(id, options), file = record.getFileHandle.bind(record);
      if (options?.create) record.getFileHandle = async (name, spec) => {
        const handle = await file(name, spec);
        if (spec?.create && name === 'entry.json') handle.createWritable = async () => { if (replacement) record.seed('entry.json', 'external recovery data'); throw new Error('record writer failed'); };
        return handle;
      };
      return record;
    };
    await assert.rejects(move(f), /record writer failed/); assert.deepEqual(await bytes(f.source), f.before);
    if (replacement) assert.equal(await read([...base.children.values()][0], 'entry.json'), 'external recovery data');
    else assert.equal(base.children.size, 0);
    base.getDirectoryHandle = create; assert.equal((await move(f)).sourceRemoved, true);
  }
});

test('a source changed during copy is retained with its changed contents and never retired', async () => {
  const f = await fixture(), base = await dir(f.root, '_trash'), create = base.getDirectoryHandle.bind(base); let changed = false;
  base.getDirectoryHandle = async (id, options) => {
    const record = await create(id, options), childDir = record.getDirectoryHandle.bind(record);
    if (options?.create) record.getDirectoryHandle = async (name, request) => {
      const child = await childDir(name, request), getFile = child.getFileHandle.bind(child);
      if (name === 'article') child.getFileHandle = async (fileName, spec) => {
        const file = await getFile(fileName, spec), makeWriter = file.createWritable.bind(file);
        if (spec?.create) file.createWritable = async () => { const writer = await makeWriter(); return { ...writer, close: async () => { await writer.close(); if (!changed) { changed = true; f.source.children.get('article.md').value = '# External update'; f.source.children.get('article.md').modified++; } } }; };
        return file;
      };
      return child;
    };
    return record;
  };
  await assert.rejects(move(f), failure('trash.recoveryRequired'));
  assert.equal(await read(f.root, f.path + '/article.md'), '# External update');
  assert.equal((await listArticleTrash(f.root)).entries.length, 0);
});

test('source retirement failure reports a retained original and a verified ready backup separately', async () => {
  const f = await fixture(), parent = await dir(f.root, 'articles/2026-10'); parent.removeEntry = async () => { throw new Error('source is busy'); };
  const moved = await move(f); assert.equal(moved.sourceRemoved, false); assert.equal(moved.issues.length, 1);
  assert.deepEqual(await bytes(f.source), f.before); assert.equal((await listArticleTrash(f.root)).entries[0].id, moved.entry.id);
});

test('restored contents are not rolled back on metadata failure and completing the retained receipt is retryable', async () => {
  const f = await fixture(), moved = await move(f); f.root.failWrite = true;
  const restored = await restoreTrashedArticle(f.root, moved.entry.id); assert.ok(restored.issues.length);
  assert.deepEqual(await bytes(await dir(f.root, f.path)), f.before); assert.equal((await listArticleTrash(f.root)).entries[0].state, 'restored');
  f.root.failWrite = false; const retried = await restoreTrashedArticle(f.root, moved.entry.id); assert.deepEqual(retried.issues, []);
  assert.deepEqual(await bytes(await dir(f.root, f.path)), f.before); assert.equal((await listArticleTrash(f.root)).entries.length, 0);
});

test('cleanup keeps its full payload during the undo window, persists remaining time, and cancels without deleting entries', async () => {
  const f = await fixture(), moved = await move(f), cleanup = await beginTrashCleanup(f.root, [moved.entry.id]);
  await assert.rejects(finishTrashCleanup(f.root, cleanup.id), failure('trash.windowActive'));
  await checkpointTrashCleanup(f.root, cleanup.id, 12000); assert.equal((await listArticleTrash(f.root)).cleanups[0].remainingMs, 12000);
  await cancelTrashCleanup(f.root, cleanup.id); assert.equal((await listArticleTrash(f.root)).cleanups.length, 0);
  assert.deepEqual(await bytes(await dir(f.root, '_trash/' + moved.entry.id + '/article')), f.before);
  assert.deepEqual(await finishTrashCleanup(f.root, cleanup.id), { removed: 0, issues: [] });
});

test('expiry permanently removes only the confirmed batch, keeping articles trashed afterward', async () => {
  const f = await fixture(), first = await move(f), cleanup = await beginTrashCleanup(f.root, [first.entry.id]);
  const { article } = await saveStoredArticle(f.root, createArticleSource('Later', 'basic') + '\n# Later\n', getTheme('basic'), 'Later', '2026-10');
  const later = await trashStoredArticle(f.root, article, { projectId: null, archived: false }, null);
  await checkpointTrashCleanup(f.root, cleanup.id, 0); const result = await finishTrashCleanup(f.root, cleanup.id);
  assert.deepEqual(result, { removed: 1, issues: [] });
  const listing = await listArticleTrash(f.root); assert.equal(listing.cleanups.length, 0); assert.deepEqual(listing.entries.map(v => v.id), [later.entry.id]);
  await assert.rejects((await dir(f.root, '_trash')).getDirectoryHandle(first.entry.id));
});

test('external payload changes and lost permission prevent permanent cleanup', async () => {
  const f = await fixture(), moved = await move(f), cleanup = await beginTrashCleanup(f.root, [moved.entry.id]);
  await checkpointTrashCleanup(f.root, cleanup.id, 0); f.root.permission = 'denied';
  await assert.rejects(finishTrashCleanup(f.root, cleanup.id), failure('trash.permission')); f.root.permission = 'granted';
  await write(f.root, '_trash/' + moved.entry.id + '/article/article.md', '# Changed backup');
  const result = await finishTrashCleanup(f.root, cleanup.id); assert.equal(result.removed, 0); assert.ok(result.issues.length);
  assert.equal(await read(f.root, '_trash/' + moved.entry.id + '/article/article.md'), '# Changed backup');
  assert.equal((await listArticleTrash(f.root)).cleanups[0].committing, true);
});

test('a missing nested payload file is not mistaken for a fully removed entry', async () => {
  const f = await fixture(), moved = await move(f), cleanup = await beginTrashCleanup(f.root, [moved.entry.id]);
  const media = await dir(f.root, '_trash/' + moved.entry.id + '/article/media/image'); await media.removeEntry('local.png');
  await checkpointTrashCleanup(f.root, cleanup.id, 0); const result = await finishTrashCleanup(f.root, cleanup.id);
  assert.equal(result.removed, 0); assert.ok(result.issues.length);
  assert.ok(await (await dir(f.root, '_trash')).getDirectoryHandle(moved.entry.id));
  assert.deepEqual((await listArticleTrash(f.root)).cleanups[0].removedIds, []);
});

test('malformed recovery paths are rejected without writing outside the trash partition', async () => {
  const f = await fixture(), moved = await move(f), record = await entryDirectory(f.root, moved.entry.id);
  const json = JSON.parse(await read(record, 'entry.json')); json.folder = '../escape';
  await write(record, 'entry.json', JSON.stringify(json)); const listing = await listArticleTrash(f.root);
  assert.equal(listing.entries.length, 0); assert.ok(listing.issues.length);
  await assert.rejects(restoreTrashedArticle(f.root, moved.entry.id), failure('trash.invalidRecord'));
  assert.equal(f.root.children.has('escape'), false);
});

test('older settings default trash to enabled without rewriting version-two files; invalid switches block instead of choosing permanent deletion', async () => {
  const f = await fixture(), value = JSON.parse(await read(f.root, 'settings.json')); delete value.trash;
  const original = JSON.stringify(value); await write(f.root, 'settings.json', original);
  assert.equal((await loadArticleSettings(f.root)).settings.trash.enabled, true); assert.equal(await read(f.root, 'settings.json'), original);
  value.trash = { enabled: 'false' }; await write(f.root, 'settings.json', JSON.stringify(value));
  assert.ok((await loadArticleSettings(f.root)).issue); assert.equal((await loadArticleSettings(f.root)).settings.trash.enabled, true);
});
