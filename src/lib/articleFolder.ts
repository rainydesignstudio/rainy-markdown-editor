import { articleIdentityRename } from './articleIdentity';
import { ProductError, productCause, productText } from './i18n/productMessages';
import { getStoredArticleDirectory, indexEntry, readStoredArticleById, sanitizeFolderName } from './fileSystem';
import { contentHash } from './article-format/styles';
import { queryDirectoryReadWritePermission } from './directoryBookmark';
import { IMPORT_LIMITS, validateImportTask, type ImportTask } from './imports/model';
import { importBookmarks, scopedImportBookmark, type ImportBookmarkStore } from './imports/bookmarks';

type TreeFile = { handle: FileSystemFileHandle; file: File; hash: string };
type Tree = { directories: Set<string>; files: Map<string, TreeFile> };
type TextChange = { parent: FileSystemDirectoryHandle; name: string; before: string | null; after: string };
type Reservation = { library: FileSystemDirectoryHandle; handle: FileSystemFileHandle; size: number; modified: number };
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function normalizeArticleDirectoryName(input: string) {
  const name = input.trim();
  if (!name || name.length > 80 || sanitizeFolderName(name) !== name) throw new ProductError('articleFolder.invalidName');
  return name;
}
function json(value: string, file: string): unknown {
  try { return JSON.parse(value); } catch { throw new ProductError('articleFolder.invalidMetadata', { file }); }
}

async function readText(parent: FileSystemDirectoryHandle, name: string) {
  try { return await (await (await parent.getFileHandle(name)).getFile()).text(); }
  catch (error) { if (missing(error)) return null; throw error; }
}
async function writeText(parent: FileSystemDirectoryHandle, name: string, text: string) {
  const writer = await (await parent.getFileHandle(name, { create: true })).createWritable();
  try { await writer.write(text); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* preserve the write failure */ } throw error; }
}
async function tree(root: FileSystemDirectoryHandle, check: () => void, prefix = '', result: Tree = { directories: new Set(), files: new Map() }): Promise<Tree> {
  for await (const [name, handle] of root.entries()) {
    check(); const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') { result.directories.add(path); await tree(await root.getDirectoryHandle(name), check, path, result); }
    else { const fileHandle = await root.getFileHandle(name), file = await fileHandle.getFile(); result.files.set(path, { handle: fileHandle, file, hash: await contentHash(file) }); }
  }
  return result;
}
function sameTree(left: Tree, right: Tree, modified = false) {
  return left.directories.size === right.directories.size && [...left.directories].every(path => right.directories.has(path)) &&
    left.files.size === right.files.size && [...left.files].every(([path, entry]) => {
      const next = right.files.get(path);
      return next?.hash === entry.hash && (!modified || next.file.lastModified === entry.file.lastModified);
    });
}

export { tree as readArticleDirectoryTree, sameTree as sameArticleDirectoryTree };

export function replaceArticleFolderIdentity(value: unknown, previous: string, next: string): unknown {
  if (!object(value)) throw new ProductError('articleFolder.invalidMetadata', { file: 'settings.json' });
  const result = structuredClone(value);
  if (result.articleOrganization !== undefined) {
    if (!object(result.articleOrganization)) throw new ProductError('articleFolder.invalidMetadata', { file: 'settings.json' });
    if (Object.hasOwn(result.articleOrganization, next)) throw new ProductError('articleFolder.identityConflict');
    if (Object.hasOwn(result.articleOrganization, previous)) { result.articleOrganization[next] = result.articleOrganization[previous]; delete result.articleOrganization[previous]; }
  }
  if (result.articleOrder !== undefined) {
    if (!object(result.articleOrder)) throw new ProductError('articleFolder.invalidMetadata', { file: 'settings.json' });
    for (const [key, ids] of Object.entries(result.articleOrder)) {
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new ProductError('articleFolder.invalidMetadata', { file: 'settings.json' });
      if (ids.includes(next)) throw new ProductError('articleFolder.identityConflict');
      result.articleOrder[key] = ids.map(id => id === previous ? next : id);
    }
  }
  return result;
}

/** Copy and verify before changing identities. The original is retired only after every reference commits. */
export async function renameStoredArticleDirectory(root: FileSystemDirectoryHandle, month: string, folder: string, input: string,
  options: { expectedSource: string; isCurrent: () => boolean; bookmarkStore?: ImportBookmarkStore }) {
  const check = () => { if (!options.isCurrent()) throw new ProductError('articleFolder.changed'); };
  check();
  const nextFolder = normalizeArticleDirectoryName(input);
  const source = await getStoredArticleDirectory(root, month, folder, { requestPermission: false });
  const stored = await readStoredArticleById(root, month, folder);
  if (stored.source !== options.expectedSource) throw new ProductError('articleFolder.sourceChanged');
  if (nextFolder === folder) return { article: stored, cleanupIssue: null };
  const parent = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(month);
  for await (const [name] of parent.entries()) if (name.normalize('NFKC').toLowerCase() === nextFolder.normalize('NFKC').toLowerCase()) throw new ProductError('articleFolder.exists', { name: nextFolder });
  const before = await tree(source, check);
  const previousId = `${month}/${folder}`, nextId = `${month}/${nextFolder}`;
  const article = { ...stored, id: nextId, folder: nextFolder, filePath: `articles/${month}/${nextFolder}/article.md` };
  const changes: TextChange[] = [await articleIdentityRename(root, previousId, nextId)];
  const indexRaw = await readText(parent, 'index.json'), index = indexRaw === null ? {} : json(indexRaw, `articles/${month}/index.json`);
  if (!object(index) || !Object.hasOwn(index, folder)) throw new ProductError('articleFolder.invalidMetadata', { file: `articles/${month}/index.json` });
  if (Object.hasOwn(index, nextFolder)) throw new ProductError('articleFolder.identityConflict');
  const nextIndex = { ...index, [nextFolder]: indexEntry(article) }; delete nextIndex[folder];
  changes.push({ parent, name: 'index.json', before: indexRaw, after: JSON.stringify(nextIndex, null, 2) });
  const settingsRaw = await readText(root, 'settings.json');
  if (settingsRaw !== null) {
    const settings = json(settingsRaw, 'settings.json'), next = replaceArticleFolderIdentity(settings, previousId, nextId);
    if (JSON.stringify(settings) !== JSON.stringify(next)) changes.push({ parent: root, name: 'settings.json', before: settingsRaw, after: JSON.stringify(next, null, 2) });
  }
  const movedTasks: { before: ImportTask; after: ImportTask }[] = [];
  let tasks: FileSystemDirectoryHandle | null = null;
  try { tasks = await (await root.getDirectoryHandle('imports')).getDirectoryHandle('tasks'); }
  catch (error) { if (!missing(error)) throw error; }
  if (tasks) for await (const [name, entry] of tasks.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json')) continue;
    check(); const file = await (await tasks.getFileHandle(name)).getFile();
    if (file.size > IMPORT_LIMITS.taskBytes) throw new ProductError('imports.invalidTask');
    const raw = await file.text(), task = validateImportTask(JSON.parse(raw));
    if (name !== task.id + '.json') throw new ProductError('imports.invalidTask');
    if (task.target.articleId !== previousId) continue;
    if (!['complete', 'cancelled'].includes(task.state)) throw new ProductError('articleFolder.pendingImports');
    const next = { ...task, target: { ...task.target, articleId: nextId, folder: nextFolder } };
    changes.push({ parent: tasks, name, before: raw, after: JSON.stringify(next, null, 2) + '\n' });
    movedTasks.push({ before: task, after: next });
  }
  check();
  const target = await parent.getDirectoryHandle(nextFolder, { create: true });
  // An entry created concurrently is never adopted or cleaned up.
  for await (const _entry of target.entries()) throw new ProductError('articleFolder.exists', { name: nextFolder });
  const directories = new Map<string, FileSystemDirectoryHandle>([['', target]]);
  const ownedFiles = new Map<string, Set<string>>(), emptyHash = await contentHash('');
  const written: TextChange[] = [];
  const bookmarks: { key: string; before: Reservation; after: Reservation }[] = [];
  const bookmarkStore = options.bookmarkStore ?? importBookmarks;
  let referencesCommitted = false;
  try {
    for (const path of [...before.directories].sort((a, b) => a.split('/').length - b.split('/').length)) {
      check(); const parts = path.split('/'), name = parts.pop()!;
      directories.set(path, await directories.get(parts.join('/'))!.getDirectoryHandle(name, { create: true }));
    }
    for (const [path, entry] of before.files) {
      check(); const parts = path.split('/'), name = parts.pop()!, directory = directories.get(parts.join('/'))!;
      try { await directory.getFileHandle(name); throw new ProductError('articleFolder.changed'); } catch (error) { if (!missing(error)) throw error; }
      const handle = await directory.getFileHandle(name, { create: true }); ownedFiles.set(path, new Set([emptyHash, entry.hash]));
      const writer = await handle.createWritable();
      try { await writer.write(entry.file); check(); await writer.close(); }
      catch (error) { try { await writer.abort(); } catch { /* preserve the write failure */ } throw error; }
    }
    if (!sameTree(before, await tree(target, check)) || !sameTree(before, await tree(source, check), true)) throw new ProductError('articleFolder.sourceChanged');
    if (!await source.isSameEntry(await parent.getDirectoryHandle(folder))) throw new ProductError('articleFolder.sourceChanged');
    for (const { before: task, after } of movedTasks) if (task.state === 'cancelled') for (const resource of task.resources) {
      if (resource.state === 'complete') continue;
      const key = `target:${task.id}:${resource.id}`, reservation = await scopedImportBookmark<Reservation>(bookmarkStore, key, root);
      if (!reservation) continue;
      const path = `media/${resource.storage}/${resource.fileName}`, original = before.files.get(path);
      if (!original || !await reservation.handle.isSameEntry(original.handle)) continue;
      const handle = await directories.get(`media/${resource.storage}`)!.getFileHandle(resource.fileName), file = await handle.getFile();
      bookmarks.push({ key, before: reservation, after: { ...reservation, handle, modified: file.lastModified } });
      // The allocation and source identities remain unchanged; only the verified target handle moves.
      if (after.target.articleId !== nextId) throw new ProductError('imports.invalidTask');
    }
    for (const change of changes) {
      check(); if (await readText(change.parent, change.name) !== change.before) throw new ProductError('articleFolder.metadataChanged');
      written.push(change); await writeText(change.parent, change.name, change.after);
    }
    for (const bookmark of bookmarks) { check(); await bookmarkStore.save(bookmark.key, bookmark.after); }
    check();
    for (const change of written) if (await readText(change.parent, change.name) !== change.after) throw new ProductError('articleFolder.metadataChanged');
    if (await queryDirectoryReadWritePermission(root) !== 'granted' || !await source.isSameEntry(await parent.getDirectoryHandle(folder)) || !await target.isSameEntry(await parent.getDirectoryHandle(nextFolder)) || !sameTree(before, await tree(source, check), true) || !sameTree(before, await tree(target, check))) throw new ProductError('articleFolder.sourceChanged');
    referencesCommitted = true;
    try { await parent.removeEntry(folder, { recursive: true }); }
    catch (error) { return { article, cleanupIssue: productText('articleFolder.cleanupFailed', { name: folder, cause: productCause(error) }) }; }
    return { article, cleanupIssue: null };
  } catch (error) {
    if (referencesCommitted) throw error;
    let recovered = true;
    for (const bookmark of bookmarks.reverse()) {
      try {
        const current = await scopedImportBookmark<Reservation>(bookmarkStore, bookmark.key, root);
        if (current && await current.handle.isSameEntry(bookmark.after.handle)) await bookmarkStore.save(bookmark.key, bookmark.before);
        else if (!current || !await current.handle.isSameEntry(bookmark.before.handle)) recovered = false;
      } catch { recovered = false; }
    }
    for (const change of written.reverse()) {
      try {
        const current = await readText(change.parent, change.name);
        if (current === change.before) continue;
        if (current !== change.after) { recovered = false; continue; }
        if (change.before === null) await change.parent.removeEntry(change.name);
        else await writeText(change.parent, change.name, change.before);
      } catch { recovered = false; }
    }
    try {
      const current = await tree(target, () => {});
      const owned = [...current.directories].every(path => directories.has(path)) && [...current.files].every(([path, entry]) => ownedFiles.get(path)?.has(entry.hash));
      if (recovered && owned) await parent.removeEntry(nextFolder, { recursive: true });
      else recovered = false;
    } catch { recovered = false; }
    if (!recovered) throw new ProductError('articleFolder.recoveryRequired', { name: nextFolder, cause: productCause(error) });
    throw error;
  }
}
