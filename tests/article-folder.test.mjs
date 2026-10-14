import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArticleDirectoryName, renameStoredArticleDirectory } from '../src/lib/articleFolder.ts';
import { listArticleSummaries, readStoredArticleById, rebuildArticleIndexes, sanitizeFolderName, saveStoredArticle } from '../src/lib/fileSystem.ts';
import { createArticleSource, updateFrontMatter } from '../src/lib/frontMatter.ts';
import { getTheme } from '../src/lib/themes.ts';
import { createDefaultEditorWorkspace } from '../src/lib/editorWorkspace.ts';
import { DEFAULT_ARTICLE_SETTINGS } from '../src/lib/articleSettings.ts';
import { cleanInterruptedReservation } from '../src/lib/imports/recovery.ts';
import { importRecordGuard } from '../src/lib/imports/store.ts';

class Directory {
  kind = 'directory'; children = new Map();
  constructor(name, parent = null) { this.name = name; this.parent = parent; this.fs = parent?.fs ?? { modified: 1 }; }
  get path() { return this.parent ? this.parent.path + '/' + this.name : ''; }
  async queryPermission() { return 'granted'; }
  async isSameEntry(other) { return other === this; }
  async resolve(other) {
    if (other === this) return [];
    for (const [name, child] of this.children) {
      if (child === other) return [name];
      if (child.kind === 'directory') { const path = await child.resolve(other); if (path) return [name, ...path]; }
    }
    return null;
  }
  async getDirectoryHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) { if (existing.kind !== 'directory') throw new DOMException('wrong kind', 'TypeMismatchError'); return existing; }
    if (!options.create) throw new DOMException('missing', 'NotFoundError');
    const value = new Directory(name, this); this.children.set(name, value); return value;
  }
  async getFileHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) { if (existing.kind !== 'file') throw new DOMException('wrong kind', 'TypeMismatchError'); return existing; }
    if (!options.create) throw new DOMException('missing', 'NotFoundError');
    const value = new FileHandle(name, this); this.children.set(name, value); return value;
  }
  async *entries() { yield* this.children; }
  async removeEntry(name) { await this.fs.beforeRemove?.(this.path + '/' + name); if (!this.children.delete(name)) throw new DOMException('missing', 'NotFoundError'); }
}
class FileHandle {
  kind = 'file'; content = new Uint8Array(); modified = 1;
  constructor(name, parent) { this.name = name; this.parent = parent; }
  async isSameEntry(other) { return other === this; }
  async getFile() { return new File([this.content], this.name, { lastModified: this.modified }); }
  async createWritable() {
    let pending;
    return {
      write: async value => { pending = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value); },
      close: async () => { this.content = pending; this.modified = ++this.parent.fs.modified; await this.parent.fs.afterWrite?.(this.parent.path + '/' + this.name, this); },
      abort: async () => {},
    };
  }
}
async function directory(root, path) { for (const name of path.split('/')) root = await root.getDirectoryHandle(name, { create: true }); return root; }
async function write(root, path, value) { const parts = path.split('/'), name = parts.pop(); const parent = parts.length ? await directory(root, parts.join('/')) : root; const writer = await (await parent.getFileHandle(name, { create: true })).createWritable(); await writer.write(value); await writer.close(); }
async function read(root, path) { const parts = path.split('/'), name = parts.pop(); for (const part of parts) root = await root.getDirectoryHandle(part); return (await (await root.getFileHandle(name)).getFile()).text(); }
async function contents(root, prefix = '', result = {}) { for await (const [name, entry] of root.entries()) { const path = prefix + name; if (entry.kind === 'directory') await contents(entry, path + '/', result); else result[path] = Buffer.from(await (await entry.getFile()).arrayBuffer()).toString('hex'); } return result; }
async function fixture() {
  const root = new Directory('root'), theme = getTheme('basic');
  const source = updateFrontMatter(createArticleSource('Original', theme.id), { theme: { id: theme.id, version: theme.version } }) + '\n# Original\n';
  const { article } = await saveStoredArticle(root, source, theme, 'Original', '2026-10');
  const path = 'articles/2026-10/Original';
  await write(root, path + '/media/image/local.png', Uint8Array.of(137, 80, 78, 71, 0, 255));
  await write(root, path + '/media/file/empty.txt', '');
  await write(root, path + '/.history/one/article.md', source);
  await write(root, path + '/.history/one/theme.json', JSON.stringify(theme));
  const workspace = createDefaultEditorWorkspace(); workspace.articleOrganization[article.id] = { projectId: null, archived: false }; workspace.articleOrder.unclassified = [article.id, '2026-10/Other'];
  await write(root, 'settings.json', JSON.stringify({ ...DEFAULT_ARTICLE_SETTINGS, ...workspace, version: 2 }));
  return { root, article, path, options: { expectedSource: article.source, isCurrent: () => true } };
}
function taskFor(article, state = 'complete') {
  return { schemaVersion: 1, id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', target: { articleId: article.id, month: article.month, folder: article.folder }, source: { kind: 'local', sourceId: '22222222-2222-4222-8222-222222222222', path: 'draft.md', name: 'draft.md', hash: 'a'.repeat(64), size: 1, modified: 1 }, state, resources: [], diagnostics: [] };
}
const failure = key => error => error.messageKey === key;

test('legal Chinese punctuation survives rename, reread, save and index rebuild without compatibility folding', async () => {
  const { root, article, options } = await fixture();
  const name = '中文，句号。；：！？“引号”（括号）【书名】《文章》';
  assert.equal(normalizeArticleDirectoryName(name), name);
  assert.equal(sanitizeFolderName(name), name);
  const moved = await renameStoredArticleDirectory(root, article.month, article.folder, name, options);
  assert.equal(moved.article.folder, name);
  assert.equal((await readStoredArticleById(root, article.month, name)).folder, name);
  const saved = await saveStoredArticle(root, moved.article.source, moved.article.theme, name, article.month);
  assert.equal(saved.article.folder, name);
  await rebuildArticleIndexes(root, [article.month]);
  assert.deepEqual((await listArticleSummaries(root)).articles.map(value => value.folder), [name]);
  assert.ok(Object.hasOwn(JSON.parse(await read(root, 'articles/' + article.month + '/index.json')), name));
});

test('Chinese punctuation remains exact when creating an article, while invalid path characters are still rejected on rename', async () => {
  const { root, article, options } = await fixture();
  const name = '创建，保留。中文：标点！';
  const created = await saveStoredArticle(root, updateFrontMatter(article.source, { title: name }), article.theme);
  assert.equal(created.article.folder, name);
  for (const value of ['中文/目录', '中文\\目录', '中文:目录', '中文?目录', '中文|目录', '中文\u0000目录', '末尾.']) {
    assert.throws(() => normalizeArticleDirectoryName(value), failure('articleFolder.invalidName'));
  }
  await write(root, 'articles/' + article.month + '/已有,目录/article.md', article.source);
  const before = await contents(root);
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, '已有，目录', options), failure('articleFolder.exists'));
  assert.deepEqual(await contents(root), before, 'compatibility-equivalent collision is not overwritten');
});

test('directory rename preserves the complete article tree and moves index, project ordering and completed import identity', async () => {
  const { root, article, path, options } = await fixture(), task = taskFor(article);
  await write(root, 'imports/tasks/11111111-1111-4111-8111-111111111111.json', JSON.stringify(task));
  const before = await contents(await directory(root, path)), oldSettings = JSON.parse(await read(root, 'settings.json'));
  const result = await renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options);
  assert.equal(result.cleanupIssue, null); assert.equal(result.article.id, '2026-10/Renamed');
  const month = await directory(root, 'articles/2026-10'); assert.equal(month.children.has('Original'), false);
  assert.deepEqual(await contents(await month.getDirectoryHandle('Renamed')), before);
  const index = JSON.parse(await read(month, 'index.json')); assert.equal(Object.hasOwn(index, 'Original'), false); assert.equal(index.Renamed.title, 'Original');
  const settings = JSON.parse(await read(root, 'settings.json')); assert.deepEqual(settings.autoSave, oldSettings.autoSave); assert.deepEqual(settings.articleOrder.unclassified, ['2026-10/Renamed', '2026-10/Other']); assert.deepEqual(settings.articleOrganization['2026-10/Renamed'], { projectId: null, archived: false });
  assert.equal(JSON.parse(await read(root, 'imports/tasks/11111111-1111-4111-8111-111111111111.json')).target.articleId, '2026-10/Renamed');
});

test('invalid names, collisions, outdated source and unfinished imports do not modify existing files', async () => {
  const { root, article, options } = await fixture(), before = await contents(root);
  for (const name of ['', '../bad', 'bad/name', '.', 'name.', 'x'.repeat(81)]) await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, name, options), failure('articleFolder.invalidName'));
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', { ...options, expectedSource: 'stale' }), failure('articleFolder.sourceChanged'));
  assert.deepEqual(await contents(root), before);
  await write(root, 'articles/2026-10/TAKEN', 'other file'); const collision = await contents(root);
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'taken', options), failure('articleFolder.exists')); assert.deepEqual(await contents(root), collision);
  await write(root, 'imports/tasks/11111111-1111-4111-8111-111111111111.json', JSON.stringify(taskFor(article, 'paused'))); const pending = await contents(root);
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options), failure('articleFolder.pendingImports')); assert.deepEqual(await contents(root), pending);
});

test('a metadata close failure after committing bytes rolls back both the index and the copied directory', async () => {
  const { root, article, options } = await fixture(), before = await contents(root);
  let failed = false;
  root.fs.afterWrite = path => { if (!failed && path === '/articles/2026-10/index.json') { failed = true; throw new Error('close rejected after commit'); } };
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options), /close rejected/);
  assert.deepEqual(await contents(root), before);
});

test('external source edits survive and are never replaced by the staged copy', async () => {
  const { root, article, options, path } = await fixture(); let changed = false;
  root.fs.afterWrite = async value => { if (!changed && value === '/articles/2026-10/Renamed/media/image/local.png') { changed = true; await write(root, path + '/article.md', article.source + '\nExternal edit\n'); } };
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options), failure('articleFolder.sourceChanged'));
  assert.match(await read(root, path + '/article.md'), /External edit/);
  assert.equal((await directory(root, 'articles/2026-10')).children.has('Renamed'), false);
});

test('unknown target changes are retained, references roll back and the original tree remains complete', async () => {
  const { root, article, options, path } = await fixture(); const original = await contents(await directory(root, path)); let changed = false;
  root.fs.afterWrite = async value => { if (!changed && value === '/settings.json') { changed = true; await write(root, 'articles/2026-10/Renamed/media/image/local.png', 'external target edit'); } };
  await assert.rejects(renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options), failure('articleFolder.recoveryRequired'));
  assert.deepEqual(await contents(await directory(root, path)), original);
  assert.equal(await read(root, 'articles/2026-10/Renamed/media/image/local.png'), 'external target edit');
  assert.equal(Object.hasOwn(JSON.parse(await read(root, 'articles/2026-10/index.json')), 'Renamed'), false);
});

test('old-folder cleanup failures keep the verified new copy and a warning rather than deleting either copy', async () => {
  const { root, article, options, path } = await fixture(); const original = await contents(await directory(root, path));
  root.fs.beforeRemove = value => { if (value === '/articles/2026-10/Original') throw new Error('remove denied'); };
  const result = await renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', options);
  assert.ok(result.cleanupIssue); assert.deepEqual(await contents(await directory(root, path)), original);
  assert.deepEqual(await contents(await directory(root, 'articles/2026-10/Renamed')), original);
  assert.equal(Object.hasOwn(JSON.parse(await read(root, 'articles/2026-10/index.json')), 'Renamed'), true);
});

test('cancelled import reservations follow verified empty files and remain safe to retry', async () => {
  const { root, article, options, path } = await fixture(), task = taskFor(article, 'cancelled');
  task.resources = [{ id: '33333333-3333-4333-8333-333333333333', source: 'empty.txt', location: 'local', storage: 'file', fileName: 'empty.txt', reference: 'media/file/empty.txt', state: 'cancelled', receivedBytes: 0 }];
  await write(root, 'imports/tasks/11111111-1111-4111-8111-111111111111.json', JSON.stringify(task));
  const original = await (await directory(root, path + '/media/file')).getFileHandle('empty.txt'), file = await original.getFile();
  const entries = new Map([['target:11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333', { library: root, handle: original, size: 0, modified: file.lastModified }]]);
  const store = { load: async key => entries.get(key), save: async (key, value) => { entries.set(key, value); }, remove: async key => { entries.delete(key); } };
  await renameStoredArticleDirectory(root, article.month, article.folder, 'Renamed', { ...options, bookmarkStore: store });
  const next = JSON.parse(await read(root, 'imports/tasks/11111111-1111-4111-8111-111111111111.json'));
  const reservation = entries.get('target:11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333'); assert.notEqual(reservation.handle, original);
  await cleanInterruptedReservation(root, next, next.resources[0], { kind: 'article', ...next.target, title: 'Original' }, () => true, importRecordGuard(root, () => true), store);
  assert.equal((await directory(root, 'articles/2026-10/Renamed/media/file')).children.has('empty.txt'), false);
});

test('special object-key folder names remain ordinary own index keys', async () => {
  const { root, article, options } = await fixture();
  await renameStoredArticleDirectory(root, article.month, article.folder, '__proto__', options);
  const index = JSON.parse(await read(root, 'articles/2026-10/index.json'));
  assert.equal(Object.hasOwn(index, '__proto__'), true); assert.equal({}.summaryVersion, undefined);
});
