import { readArticleDirectoryTree, sameArticleDirectoryTree } from './articleFolder';
import { getStoredArticleDirectory, indexEntry, readStoredArticleById, sanitizeFolderName, writeMonthIndexEntry } from './fileSystem';
import { editorArticleGroupKey, type ArticleOrganization } from './editorWorkspace';
import { updateSettingsDocument } from './settingsFile';
import { contentHash } from './article-format/styles';
import { queryDirectoryReadWritePermission } from './directoryBookmark';
import { ProductError, legacyProductMessage, productCause, productReference, type ProductMessageInfo } from './i18n/productMessages';
import type { ArticleSummary } from './types';

export const ARTICLE_TRASH_DIRECTORY = '_trash';
export const TRASH_CLEANUP_DURATION = 30000;
type Guard = () => boolean;
type Tree = Awaited<ReturnType<typeof readArticleDirectoryTree>>;
export type ArticleTrashEntry = {
  schemaVersion: 1; id: string; articleId: string; month: string; folder: string; title: string; deletedAt: string;
  organization: ArticleOrganization; orderIndex: number | null; orderBefore?: string[]; state: 'preparing' | 'ready' | 'restored';
  files: Record<string, string>; directories: string[];
};
export type ArticleTrashCleanup = {
  schemaVersion: 1; id: string; entryIds: string[]; entryHashes: Record<string, string>; createdAt: string;
  remainingMs: number; committing: boolean; removedIds: string[];
};
export type ArticleTrashListing = { entries: ArticleTrashEntry[]; cleanups: ArticleTrashCleanup[]; issues: ProductMessageInfo[] };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validPath = (value: string) => value.length > 0 && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');
const checkCurrent = (guard: Guard) => { if (!guard()) throw new ProductError('trash.changed'); };
const issue = (error: unknown) => productReference('trash.operationIssue', { cause: productCause(error) });
const cleanupName = (id: string) => { if (!uuid.test(id)) throw new ProductError('trash.invalidRecord'); return `cleanup-${id}.json`; };

async function writable(root: FileSystemDirectoryHandle, guard: Guard) {
  checkCurrent(guard);
  if ('queryPermission' in root && await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('trash.permission');
  checkCurrent(guard);
}
async function text(parent: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try { const file = await (await parent.getFileHandle(name)).getFile(); if (file.size > 4 * 1024 * 1024) throw new ProductError('trash.invalidRecord'); return await file.text(); }
  catch (error) { if (missing(error)) return null; throw error; }
}
async function jsonWrite(parent: FileSystemDirectoryHandle, name: string, value: unknown, expected: string | null, guard: Guard) {
  checkCurrent(guard); if (await text(parent, name) !== expected) throw new ProductError('trash.changed');
  const handle = await parent.getFileHandle(name, { create: true }); let stream: FileSystemWritableFileStream | undefined;
  try {
    if (expected === null && (await handle.getFile()).size !== 0) throw new ProductError('trash.changed');
    stream = await handle.createWritable(); checkCurrent(guard); await stream.write(JSON.stringify(value, null, 2) + '\n'); checkCurrent(guard);
    if (!await handle.isSameEntry(await parent.getFileHandle(name)) || await text(parent, name) !== (expected ?? '')) throw new ProductError('trash.changed');
    await stream.close();
  } catch (error) {
    try { await stream?.abort(); } catch { /* preserve cause */ }
    if (expected === null) try { if (await handle.isSameEntry(await parent.getFileHandle(name)) && (await handle.getFile()).size === 0) await parent.removeEntry(name); } catch { /* never remove a replacement */ }
    throw error;
  }
}
async function trashRoot(root: FileSystemDirectoryHandle, create = false) {
  try { return await root.getDirectoryHandle(ARTICLE_TRASH_DIRECTORY, { create }); }
  catch (error) { if (!create && missing(error)) return null; throw error; }
}
function decode(raw: string | null): Record<string, unknown> {
  try { const value = raw === null ? null : JSON.parse(raw); if (!object(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !uuid.test(value.id)) throw new Error(); return value; }
  catch { throw new ProductError('trash.invalidRecord'); }
}
function entryOf(raw: string | null, id: string): ArticleTrashEntry {
  const value = decode(raw);
  if (value.id !== id || typeof value.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) || typeof value.folder !== 'string' || !value.folder || sanitizeFolderName(value.folder) !== value.folder || value.articleId !== `${value.month}/${value.folder}` || typeof value.title !== 'string' || typeof value.deletedAt !== 'string' || !Number.isFinite(Date.parse(value.deletedAt)) || !['preparing', 'ready', 'restored'].includes(String(value.state))) throw new ProductError('trash.invalidRecord');
  if (!object(value.organization) || typeof value.organization.archived !== 'boolean' || (value.organization.projectId !== null && (typeof value.organization.projectId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,95}$/i.test(value.organization.projectId))) || (value.orderIndex !== null && (!Number.isSafeInteger(value.orderIndex) || Number(value.orderIndex) < 0))) throw new ProductError('trash.invalidRecord');
  if (value.orderBefore !== undefined && (!Array.isArray(value.orderBefore) || value.orderBefore.length > 10000 || new Set(value.orderBefore).size !== value.orderBefore.length || value.orderBefore.some(id => typeof id !== 'string' || !/^\d{4}-\d{2}\//.test(id) || !validPath(id)))) throw new ProductError('trash.invalidRecord');
  if (!object(value.files) || !Object.hasOwn(value.files, 'article.md') || Object.entries(value.files).some(([path, hash]) => !validPath(path) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) || !Array.isArray(value.directories) || value.directories.some(path => typeof path !== 'string' || !validPath(path)) || new Set(value.directories).size !== value.directories.length) throw new ProductError('trash.invalidRecord');
  return value as unknown as ArticleTrashEntry;
}
function cleanupOf(raw: string | null, id: string): ArticleTrashCleanup {
  const value = decode(raw);
  const ids = value.entryIds, hashes = value.entryHashes, removed = value.removedIds;
  if (value.id !== id || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(v => typeof v !== 'string' || !uuid.test(v)) || !object(hashes) || !Array.isArray(removed)) throw new ProductError('trash.invalidRecord');
  if (Object.keys(hashes).length !== ids.length || ids.some(v => typeof hashes[v] !== 'string' || !/^[a-f0-9]{64}$/.test(String(hashes[v]))) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.remainingMs !== 'number' || !Number.isFinite(value.remainingMs) || value.remainingMs < 0 || value.remainingMs > TRASH_CLEANUP_DURATION || typeof value.committing !== 'boolean' || removed.some(id => !ids.includes(id)) || new Set(removed).size !== removed.length) throw new ProductError('trash.invalidRecord');
  return value as unknown as ArticleTrashCleanup;
}
async function readEntry(base: FileSystemDirectoryHandle, id: string) {
  if (!uuid.test(id)) throw new ProductError('trash.invalidRecord');
  const directory = await base.getDirectoryHandle(id), raw = await text(directory, 'entry.json');
  return { directory, raw, entry: entryOf(raw, id) };
}
function matches(entry: ArticleTrashEntry, tree: Tree) {
  return tree.files.size === Object.keys(entry.files).length && tree.directories.size === entry.directories.length && entry.directories.every(path => tree.directories.has(path)) && [...tree.files].every(([path, file]) => entry.files[path] === file.hash);
}
async function payload(directory: FileSystemDirectoryHandle, entry: ArticleTrashEntry, guard: Guard) {
  const handle = await directory.getDirectoryHandle('article'), tree = await readArticleDirectoryTree(handle, () => checkCurrent(guard));
  if (!matches(entry, tree)) throw new ProductError('trash.contentChanged');
  return { handle, tree };
}
async function copyTree(tree: Tree, destination: FileSystemDirectoryHandle, guard: Guard) {
  for await (const _ of destination.entries()) throw new ProductError('trash.conflict');
  const directories = new Map([['', destination]]);
  for (const path of [...tree.directories].sort((a, b) => a.split('/').length - b.split('/').length)) {
    checkCurrent(guard); const parts = path.split('/'), name = parts.pop()!;
    directories.set(path, await directories.get(parts.join('/'))!.getDirectoryHandle(name, { create: true }));
  }
  for (const [path, source] of tree.files) {
    checkCurrent(guard); const parts = path.split('/'), name = parts.pop()!, parent = directories.get(parts.join('/'))!;
    if (await textExists(parent, name)) throw new ProductError('trash.changed');
    const stream = await (await parent.getFileHandle(name, { create: true })).createWritable();
    try { await stream.write(source.file); checkCurrent(guard); await stream.close(); }
    catch (error) { try { await stream.abort(); } catch { /* preserve cause */ } throw error; }
  }
}
async function textExists(parent: FileSystemDirectoryHandle, name: string) {
  try { await parent.getFileHandle(name); return true; } catch (error) { if (missing(error)) return false; throw error; }
}
async function discardOwnedPartial(parent: FileSystemDirectoryHandle, name: string, handle: FileSystemDirectoryHandle, expected: Tree) {
  const current = await readArticleDirectoryTree(handle, () => {}), empty = await contentHash('');
  if ([...current.directories].some(path => !expected.directories.has(path)) || [...current.files].some(([path, file]) => file.hash !== empty && file.hash !== expected.files.get(path)?.hash) || !await handle.isSameEntry(await parent.getDirectoryHandle(name))) throw new ProductError('trash.contentChanged');
  await parent.removeEntry(name, { recursive: true });
}

export async function listArticleTrash(root: FileSystemDirectoryHandle, guard: Guard = () => true): Promise<ArticleTrashListing> {
  const result: ArticleTrashListing = { entries: [], cleanups: [], issues: [] }, base = await trashRoot(root);
  if (!base) return result;
  for await (const [name, handle] of base.entries()) {
    checkCurrent(guard);
    try {
      if (handle.kind === 'directory' && uuid.test(name)) {
        const { entry } = await readEntry(base, name);
        if (entry.state === 'preparing') result.issues.push(productReference('trash.incomplete', { title: entry.title })); else result.entries.push(entry);
      } else if (handle.kind === 'file' && /^cleanup-.*\.json$/.test(name)) {
        const id = name.slice(8, -5); result.cleanups.push(cleanupOf(await text(base, name), id));
      } else if (name !== '.DS_Store') result.issues.push(productReference('trash.unknownEntry', { name }));
    } catch (error) { result.issues.push(issue(error)); }
  }
  result.entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return result;
}

export async function trashStoredArticle(root: FileSystemDirectoryHandle, article: ArticleSummary, organization: ArticleOrganization, orderIndex: number | null, guard: Guard = () => true, orderBefore?: string[]) {
  await writable(root, guard);
  const source = await getStoredArticleDirectory(root, article.month, article.folder, { requestPermission: false });
  const stored = await readStoredArticleById(root, article.month, article.folder);
  const before = await readArticleDirectoryTree(source, () => checkCurrent(guard));
  if (!before.files.has('article.md') || await before.files.get('article.md')!.file.text() !== stored.source) throw new ProductError('trash.sourceChanged');
  const base = (await trashRoot(root, true))!, id = crypto.randomUUID();
  for await (const [name] of base.entries()) if (name === id) throw new ProductError('trash.conflict');
  const directory = await base.getDirectoryHandle(id, { create: true });
  for await (const _ of directory.entries()) throw new ProductError('trash.conflict');
  const entry: ArticleTrashEntry = { schemaVersion: 1, id, articleId: article.id, month: article.month, folder: article.folder, title: article.parse.metadata.title, deletedAt: new Date().toISOString(), organization, orderIndex, ...(orderBefore ? { orderBefore: [...orderBefore] } : {}), state: 'preparing', files: Object.fromEntries([...before.files].map(([path, file]) => [path, file.hash])), directories: [...before.directories] };
  try { entryOf(JSON.stringify(entry), id); await jsonWrite(directory, 'entry.json', entry, null, guard); }
  catch (error) {
    try { let empty = true; for await (const _ of directory.entries()) empty = false; if (empty && await directory.isSameEntry(await base.getDirectoryHandle(id))) await base.removeEntry(id, { recursive: true }); } catch { /* preserve unowned or incomplete data */ }
    throw error;
  }
  const target = await directory.getDirectoryHandle('article', { create: true });
  let ready = false;
  try {
    await copyTree(before, target, guard);
    if (!sameArticleDirectoryTree(before, await readArticleDirectoryTree(target, () => checkCurrent(guard))) || !sameArticleDirectoryTree(before, await readArticleDirectoryTree(source, () => checkCurrent(guard)), true)) throw new ProductError('trash.sourceChanged');
    const preparingRaw = JSON.stringify(entry, null, 2) + '\n';
    entry.state = 'ready'; await jsonWrite(directory, 'entry.json', entry, preparingRaw, guard); ready = true;
  } catch (error) {
    if (!ready) try {
      if (!sameArticleDirectoryTree(before, await readArticleDirectoryTree(source, () => {}))) throw new ProductError('trash.sourceChanged');
      await discardOwnedPartial(directory, 'article', target, before);
      const raw = await text(directory, 'entry.json'), known = new Set([JSON.stringify({ ...entry, state: 'preparing' }, null, 2) + '\n', JSON.stringify({ ...entry, state: 'ready' }, null, 2) + '\n']);
      let owned = Boolean(raw && known.has(raw)); for await (const [name] of directory.entries()) if (name !== 'entry.json') owned = false;
      if (owned && await directory.isSameEntry(await base.getDirectoryHandle(id))) await base.removeEntry(id, { recursive: true });
    } catch { throw new ProductError('trash.recoveryRequired', { cause: productCause(error) }); }
    throw error;
  }
  const issues: ProductMessageInfo[] = []; let sourceRemoved = false;
  try {
    await writable(root, guard);
    const parent = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(article.month);
    if (!await source.isSameEntry(await parent.getDirectoryHandle(article.folder)) || !sameArticleDirectoryTree(before, await readArticleDirectoryTree(source, () => checkCurrent(guard)), true)) throw new ProductError('trash.sourceChanged');
    await payload(directory, entry, guard);
    if (await text(directory, 'entry.json') !== JSON.stringify(entry, null, 2) + '\n') throw new ProductError('trash.changed');
    checkCurrent(guard);
    await parent.removeEntry(article.folder, { recursive: true }); sourceRemoved = true;
    const index = await writeMonthIndexEntry(parent, article.folder, null);
    if (index.error || !index.updated) issues.push(productReference('trash.indexPending', { cause: legacyProductMessage(index.error ?? '') ?? index.error ?? '' }));
  } catch (error) { issues.push(issue(error)); }
  return { entry, sourceRemoved, issues };
}

export async function restoreTrashedArticle(root: FileSystemDirectoryHandle, id: string, guard: Guard = () => true) {
  await writable(root, guard); const base = await trashRoot(root); if (!base) throw new ProductError('trash.missing');
  const listing = await listArticleTrash(root, guard);
  for (const cleanup of listing.cleanups) if (cleanup.entryIds.includes(id)) {
    if (cleanup.committing) throw new ProductError('trash.cleanupRunning');
    await cancelTrashCleanup(root, cleanup.id, guard);
  }
  const record = await readEntry(base, id), entry = record.entry;
  const issues: ProductMessageInfo[] = [];
  if (entry.state === 'preparing') throw new ProductError('trash.invalidRecord');
  const original = await payload(record.directory, entry, guard);
  const parent = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(entry.month, { create: true });
  let target: FileSystemDirectoryHandle;
  if (entry.state === 'restored') {
    target = await parent.getDirectoryHandle(entry.folder);
    if (!matches(entry, await readArticleDirectoryTree(target, () => checkCurrent(guard)))) throw new ProductError('trash.conflict');
  } else {
    for await (const [name] of parent.entries()) if (name.normalize('NFKC').toLowerCase() === entry.folder.normalize('NFKC').toLowerCase()) throw new ProductError('trash.conflict');
    checkCurrent(guard); target = await parent.getDirectoryHandle(entry.folder, { create: true });
    try { await copyTree(original.tree, target, guard); if (!matches(entry, await readArticleDirectoryTree(target, () => checkCurrent(guard)))) throw new ProductError('trash.contentChanged'); }
    catch (error) { try { await payload(record.directory, entry, () => true); await discardOwnedPartial(parent, entry.folder, target, original.tree); } catch { throw new ProductError('trash.recoveryRequired', { cause: productCause(error) }); } throw error; }
    entry.state = 'restored';
    try { await jsonWrite(record.directory, 'entry.json', entry, record.raw, guard); } catch (error) { issues.push(issue(error)); }
  }
  const article = await readStoredArticleById(root, entry.month, entry.folder);
  if (!guard()) return { article, issues: [...issues, productReference('trash.changed')] };
  const index = await writeMonthIndexEntry(parent, entry.folder, indexEntry(article));
  if (index.error || !index.updated) issues.push(productReference('trash.indexPending', { cause: legacyProductMessage(index.error ?? '') ?? index.error ?? '' }));
  try {
    await updateSettingsDocument(root, current => {
      checkCurrent(guard);
      const workspace = current.workspace, projectId = entry.organization.projectId && workspace.projects.some(project => project.id === entry.organization.projectId) ? entry.organization.projectId : null;
      if (entry.organization.projectId && !projectId) issues.push(productReference('trash.projectMissing'));
      const group = editorArticleGroupKey(projectId), articleOrder = { ...workspace.articleOrder };
      if (entry.orderIndex !== null) {
        const order = (articleOrder[group] ?? []).filter(value => value !== entry.articleId), original = entry.orderBefore ?? [];
        const rank = new Map(original.map((id, index) => [id, index])), targetRank = rank.get(entry.articleId);
        const successor = targetRank === undefined ? -1 : order.findIndex(id => (rank.get(id) ?? -1) > targetRank);
        const predecessor = targetRank === undefined ? -1 : order.findLastIndex(id => rank.has(id) && rank.get(id)! < targetRank);
        order.splice(successor >= 0 ? successor : predecessor >= 0 ? predecessor + 1 : Math.min(entry.orderIndex, order.length), 0, entry.articleId); articleOrder[group] = order;
      }
      return { ...current, workspace: { ...workspace, articleOrganization: { ...workspace.articleOrganization, [entry.articleId]: { projectId, archived: entry.organization.archived } }, articleOrder } };
    });
  } catch (error) { issues.push(issue(error)); }
  if (!issues.length) {
    try {
      await writable(root, guard); await payload(record.directory, entry, guard);
      if (!matches(entry, await readArticleDirectoryTree(target, () => checkCurrent(guard))) || !await record.directory.isSameEntry(await base.getDirectoryHandle(id))) throw new ProductError('trash.contentChanged');
      await base.removeEntry(id, { recursive: true });
    } catch (error) { issues.push(issue(error)); }
  }
  return { article, issues };
}

export async function beginTrashCleanup(root: FileSystemDirectoryHandle, entryIds: string[], guard: Guard = () => true): Promise<ArticleTrashCleanup> {
  await writable(root, guard); const base = await trashRoot(root); if (!base || !entryIds.length || new Set(entryIds).size !== entryIds.length) throw new ProductError('trash.empty');
  const existing = await listArticleTrash(root, guard), reserved = new Set(existing.cleanups.flatMap(value => value.entryIds));
  const hashes: Record<string, string> = {};
  for (const id of entryIds) { if (reserved.has(id)) throw new ProductError('trash.cleanupRunning'); const value = await readEntry(base, id); if (value.entry.state === 'preparing') throw new ProductError('trash.invalidRecord'); await payload(value.directory, value.entry, guard); hashes[id] = await contentHash(value.raw!); }
  const value: ArticleTrashCleanup = { schemaVersion: 1, id: crypto.randomUUID(), entryIds: [...entryIds], entryHashes: hashes, createdAt: new Date().toISOString(), remainingMs: TRASH_CLEANUP_DURATION, committing: false, removedIds: [] };
  await jsonWrite(base, cleanupName(value.id), value, null, guard); return value;
}

export async function checkpointTrashCleanup(root: FileSystemDirectoryHandle, id: string, remainingMs: number, guard: Guard = () => true) {
  if (!Number.isFinite(remainingMs)) throw new ProductError('trash.invalidRecord');
  await writable(root, guard); const base = await trashRoot(root); if (!base) throw new ProductError('trash.missing');
  const name = cleanupName(id), raw = await text(base, name); if (raw === null) return null;
  const value = cleanupOf(raw, id); if (value.committing) return value;
  const next = { ...value, remainingMs: Math.min(value.remainingMs, Math.max(0, remainingMs)) };
  await jsonWrite(base, name, next, raw, guard); return next;
}

export async function cancelTrashCleanup(root: FileSystemDirectoryHandle, id: string, guard: Guard = () => true) {
  await writable(root, guard); const base = await trashRoot(root); if (!base) throw new ProductError('trash.missing');
  const name = cleanupName(id), raw = await text(base, name); if (raw === null) return;
  if (cleanupOf(raw, id).committing) throw new ProductError('trash.cleanupRunning');
  checkCurrent(guard); if (await text(base, name) !== raw) throw new ProductError('trash.changed'); await base.removeEntry(name);
}

export async function finishTrashCleanup(root: FileSystemDirectoryHandle, id: string, guard: Guard = () => true) {
  await writable(root, guard); const base = await trashRoot(root); if (!base) return { removed: 0, issues: [] as ProductMessageInfo[] };
  const name = cleanupName(id); let raw = await text(base, name); if (raw === null) return { removed: 0, issues: [] as ProductMessageInfo[] };
  let value = cleanupOf(raw, id);
  if (value.remainingMs > 0 && !value.committing) throw new ProductError('trash.windowActive');
  value = { ...value, committing: true }; await jsonWrite(base, name, value, raw, guard); raw = await text(base, name);
  const issues: ProductMessageInfo[] = []; let removed = 0;
  for (const entryId of value.entryIds) {
    if (value.removedIds.includes(entryId)) continue;
    try {
      await writable(root, guard); if (await text(base, name) !== raw) throw new ProductError('trash.changed');
      const record = await readEntry(base, entryId);
      if (await contentHash(record.raw!) !== value.entryHashes[entryId]) throw new ProductError('trash.contentChanged');
      await payload(record.directory, record.entry, guard);
      if (!await record.directory.isSameEntry(await base.getDirectoryHandle(entryId))) throw new ProductError('trash.changed');
      checkCurrent(guard); await base.removeEntry(entryId, { recursive: true }); removed++;
      value.removedIds.push(entryId); await jsonWrite(base, name, value, raw, guard); raw = await text(base, name);
    } catch (error) {
      const absent = missing(error) && await base.getDirectoryHandle(entryId).then(() => false, cause => { if (missing(cause)) return true; throw cause; });
      if (absent) { value.removedIds.push(entryId); await jsonWrite(base, name, value, raw, guard); raw = await text(base, name); }
      else issues.push(issue(error));
    }
  }
  if (value.removedIds.length === value.entryIds.length && !issues.length) { checkCurrent(guard); if (await text(base, name) !== raw) throw new ProductError('trash.changed'); await base.removeEntry(name); }
  return { removed, issues };
}
