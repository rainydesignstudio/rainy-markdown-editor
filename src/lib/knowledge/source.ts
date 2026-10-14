import { knowledgePath, isKnowledgeId } from './model';
export { knowledgePath } from './model';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { ProductError, productErrorMessage, type ProductMessageFields } from '../i18n/productMessages';
import { knowledgeBookmarks, type KnowledgeBookmarkStore } from './bookmarks';

type ReadPermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
};
export type KnowledgeBinding = { schemaVersion: 1; sourceId: string; name: string };
export type KnowledgeEntry = { name: string; kind: 'file' | 'directory' };
// No writable handle, raw directory, create/rename/delete or ACL operation leaves this facade.
export type ReadonlyKnowledgeSource = Readonly<{
  binding: KnowledgeBinding;
  hasReadPermission: () => Promise<boolean>;
  requestReadPermission: () => Promise<boolean>;
  assertCurrent: () => Promise<void>;
  assertTargetOutsideSource: (target: FileSystemHandle) => Promise<void>;
  list: (path?: string) => AsyncIterable<KnowledgeEntry>;
  readFile: (path: string) => Promise<File>;
}>;
export type KnowledgeConnection = {
  status: 'unbound' | 'invalid' | 'library-unavailable' | 'needs-source' | 'needs-permission' | 'ready';
  binding: KnowledgeBinding | null;
  source: ReadonlyKnowledgeSource | null;
  issue?: ProductMessageFields | { message: string };
};
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export function validKnowledgeBinding(value: unknown): value is KnowledgeBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as KnowledgeBinding;
  return Object.keys(item).length === 3 && ['schemaVersion', 'sourceId', 'name'].every(key => Object.hasOwn(item, key)) && item.schemaVersion === 1 && typeof item.sourceId === 'string' &&
    isKnowledgeId(item.sourceId) &&
    typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 255 && !/[\u0000-\u001f]/.test(item.name);
}
async function readPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return await (handle as ReadPermissionHandle).queryPermission?.({ mode: 'read' }) === 'granted';
}
function alive(isCurrent: () => boolean) { if (!isCurrent()) throw new ProductError('knowledge.changed'); }
async function writableLibrary(library: FileSystemDirectoryHandle) {
  if (await queryDirectoryReadWritePermission(library) !== 'granted') throw new ProductError('knowledge.writableLibraryRequired');
}
async function separateRoots(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle) {
  const [same, belowLibrary, containsLibrary] = await Promise.all([library.isSameEntry(source), library.resolve(source), source.resolve(library)]);
  if (same || belowLibrary !== null || containsLibrary !== null) throw new ProductError('knowledge.overlappingRoots');
}
async function outsideSource(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle, target: FileSystemHandle) {
  const [inside, sameSource, belowSource] = await Promise.all([library.resolve(target), source.isSameEntry(target), source.resolve(target)]);
  if (inside === null || sameSource || belowSource !== null) throw new ProductError('knowledge.overlappingRoots');
}
function readonlySource(library: FileSystemDirectoryHandle, handle: FileSystemDirectoryHandle, binding: KnowledgeBinding, isCurrent: () => boolean): ReadonlyKnowledgeSource {
  const ready = async () => { alive(isCurrent); await writableLibrary(library); if (!await readPermission(handle)) throw new ProductError('knowledge.readRequired'); await separateRoots(library, handle); alive(isCurrent); };
  const directory = async (parts: string[]) => {
    let target = handle;
    for (const part of parts) { target = await target.getDirectoryHandle(part); if (await handle.resolve(target) === null) throw new ProductError('knowledge.invalidPath'); alive(isCurrent); }
    return target;
  };
  return Object.freeze({
    binding: Object.freeze({ ...binding }),
    async hasReadPermission() { alive(isCurrent); const granted = await readPermission(handle); alive(isCurrent); return granted; },
    async requestReadPermission() { alive(isCurrent); await writableLibrary(library); const result = await (handle as ReadPermissionHandle).requestPermission?.({ mode: 'read' }); alive(isCurrent); if (result === 'granted') await separateRoots(library, handle); return result === 'granted'; },
    async assertCurrent() { await ready(); },
    async assertTargetOutsideSource(target) { await ready(); await outsideSource(library, handle, target); alive(isCurrent); },
    async *list(path = '') {
      const parts = knowledgePath(path, true); await ready();
      for await (const [name, entry] of (await directory(parts)).entries()) { alive(isCurrent); if (await handle.resolve(entry) === null) throw new ProductError('knowledge.invalidPath'); yield Object.freeze({ name, kind: entry.kind }); }
    },
    async readFile(path) {
      const parts = knowledgePath(path); await ready();
      const parent = await directory(parts.slice(0, -1));
      const entry = await parent.getFileHandle(parts.at(-1)!);
      if (await handle.resolve(entry) === null) throw new ProductError('knowledge.invalidPath');
      const file = await entry.getFile();
      alive(isCurrent); return file;
    },
  });
}

export async function readKnowledgeBinding(library: FileSystemDirectoryHandle): Promise<KnowledgeBinding | null> {
  try {
    const directory = await library.getDirectoryHandle('knowledge');
    if (await library.resolve(directory) === null) throw new ProductError('knowledge.invalidBinding');
    const handle = await directory.getFileHandle('binding.json');
    if (await library.resolve(handle) === null) throw new ProductError('knowledge.invalidBinding');
    const file = await handle.getFile();
    if (file.size > 4096) throw new ProductError('knowledge.invalidBinding');
    const value: unknown = JSON.parse(await file.text());
    if (!validKnowledgeBinding(value)) throw new ProductError('knowledge.invalidBinding');
    return value;
  } catch (error) { if (missing(error)) return null; throw error instanceof ProductError ? error : new ProductError('knowledge.invalidBinding'); }
}

export async function connectKnowledgeSource(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true): Promise<ReadonlyKnowledgeSource> {
  alive(isCurrent); await writableLibrary(library);
  if (!await readPermission(source)) throw new ProductError('knowledge.readRequired');
  // Both containment directions matter: the source must never encompass writable library data.
  await separateRoots(library, source);
  alive(isCurrent);
  let previous: KnowledgeBinding | null = null, hadMetadata = false;
  try { previous = await readKnowledgeBinding(library); hadMetadata = previous !== null; }
  catch (error) { if (!(error instanceof ProductError) || error.messageKey !== 'knowledge.invalidBinding') throw error; hadMetadata = true; }
  const binding: KnowledgeBinding = { schemaVersion: 1, sourceId: crypto.randomUUID(), name: source.name };
  if (!validKnowledgeBinding(binding)) throw new ProductError('knowledge.invalidBinding');
  await store.save(binding.sourceId, { library, source });
  let file: FileSystemFileHandle | undefined, writer: FileSystemWritableFileStream | undefined, directory: FileSystemDirectoryHandle | undefined, createdMetadata = false;
  try {
    alive(isCurrent); await writableLibrary(library);
    if (!await readPermission(source)) throw new ProductError('knowledge.readRequired');
    alive(isCurrent);
    try { directory = await library.getDirectoryHandle('knowledge'); }
    catch (error) { if (!missing(error)) throw error; directory = await library.getDirectoryHandle('knowledge', { create: true }); }
    await outsideSource(library, source, directory);
    try { file = await directory.getFileHandle('binding.json'); }
    catch (error) { if (!missing(error)) throw error; file = await directory.getFileHandle('binding.json', { create: true }); createdMetadata = true; }
    await outsideSource(library, source, file);
    writer = await file.createWritable(); await writer.write(JSON.stringify(binding, null, 2) + '\n');
    alive(isCurrent); await writer.close();
  } catch (error) {
    try { await writer?.abort(); } catch { /* retain the primary failure */ }
    if (!hadMetadata && createdMetadata && file && directory) try { alive(isCurrent); await outsideSource(library, source, directory); await directory.removeEntry('binding.json'); } catch { /* failed new metadata remains visibly invalid */ }
    try { await store.remove(binding.sourceId); } catch { /* orphaned bookmark cannot bind without matching metadata */ }
    throw error;
  }
  if (previous) try { await store.remove(previous.sourceId); } catch { /* stale bookmark ID is no longer referenced */ }
  return readonlySource(library, source, binding, isCurrent);
}

export async function restoreKnowledgeSource(library: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true): Promise<KnowledgeConnection> {
  const empty = { binding: null, source: null };
  alive(isCurrent);
  if (await queryDirectoryReadWritePermission(library) !== 'granted') return { ...empty, status: 'library-unavailable' };
  let binding: KnowledgeBinding | null;
  try { binding = await readKnowledgeBinding(library); } catch (error) { return { ...empty, status: 'invalid', issue: productErrorMessage(error) }; }
  alive(isCurrent); if (!binding) return { ...empty, status: 'unbound' };
  try {
    const saved = await store.load(binding.sourceId); alive(isCurrent);
    if (!saved || !await library.isSameEntry(saved.library)) return { binding, source: null, status: 'needs-source' };
    const source = readonlySource(library, saved.source, binding, isCurrent), granted = await source.hasReadPermission();
    if (granted) await source.assertCurrent();
    alive(isCurrent); return { binding, source, status: granted ? 'ready' : 'needs-permission' };
  } catch (error) { alive(isCurrent); return { binding, source: null, status: 'needs-source', issue: productErrorMessage(error) }; }
}
