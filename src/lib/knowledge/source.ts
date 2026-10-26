import { knowledgePath, isKnowledgeId } from './model';
export { knowledgePath } from './model';
import { contentHash } from '../article-format/styles';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { ProductError, productErrorMessage, type ProductMessageFields } from '../i18n/productMessages';
import { knowledgeBookmarks, type KnowledgeBookmarkStore } from './bookmarks';

type ReadPermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
};
export type KnowledgeBinding = { schemaVersion: 1; sourceId: string; name: string };
export type KnowledgeRegistration = KnowledgeBinding & { directory: string; disconnected?: boolean };
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
  const ready = async () => { alive(isCurrent); await writableLibrary(library); if (!await readPermission(handle)) throw new ProductError('knowledge.readRequired'); await separateRoots(library, handle); if (!(await readKnowledgeBinding(library, binding.sourceId))) throw new ProductError('knowledge.indexSourceChanged'); alive(isCurrent); };
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

const bindingOf = ({ sourceId, name }: KnowledgeBinding): KnowledgeBinding => ({ schemaVersion: 1, sourceId, name });
const invalidBinding = (): never => { throw new ProductError('knowledge.invalidBinding'); };
const localName = (name: string) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(name) && !['index', 'generations'].includes(name);
async function bindingDocument(library: FileSystemDirectoryHandle): Promise<{ raw: string; sources: KnowledgeRegistration[] }> {
  try {
    const directory = await library.getDirectoryHandle('knowledge'), handle = await directory.getFileHandle('binding.json');
    if (await library.resolve(directory) === null || await library.resolve(handle) === null) return invalidBinding();
    const file = await handle.getFile(); if (file.size > 128 * 1024) return invalidBinding();
    const raw = await file.text(), value = JSON.parse(raw);
    if (validKnowledgeBinding(value)) { if (file.size > 4096) return invalidBinding(); return { raw, sources: [{ ...value, directory: '' }] }; }
    if (!value || value.schemaVersion !== 2 || Object.keys(value).length !== 2 || !Array.isArray(value.sources) || value.sources.length > 100) return invalidBinding();
    const ids = new Set<string>(), paths = new Set<string>();
    for (const item of value.sources) {
      if (!item || item.schemaVersion !== 1 || Object.keys(item).some(key => !['schemaVersion', 'sourceId', 'name', 'directory', 'disconnected'].includes(key)) ||
        !validKnowledgeBinding(bindingOf(item)) || typeof item.directory !== 'string' || item.directory !== '' && !localName(item.directory) ||
        item.disconnected !== undefined && typeof item.disconnected !== 'boolean' || ids.has(item.sourceId) || paths.has(item.directory)) return invalidBinding();
      ids.add(item.sourceId); paths.add(item.directory);
    }
    return { raw, sources: value.sources };
  } catch (error) { if (missing(error)) return { raw: '', sources: [] }; throw error instanceof ProductError ? error : new ProductError('knowledge.invalidBinding'); }
}
export async function readKnowledgeBindings(library: FileSystemDirectoryHandle, includeDisconnected = false): Promise<KnowledgeRegistration[]> {
  return (await bindingDocument(library)).sources.filter(item => includeDisconnected || !item.disconnected);
}
export async function readKnowledgeBinding(library: FileSystemDirectoryHandle, sourceId?: string): Promise<KnowledgeBinding | null> {
  const items = await readKnowledgeBindings(library), item = sourceId ? items.find(value => value.sourceId === sourceId) : items[0];
  return item ? bindingOf(item) : null;
}
async function writeBindings(library: FileSystemDirectoryHandle, sources: KnowledgeRegistration[], previous: string, isCurrent: () => boolean) {
  alive(isCurrent); await writableLibrary(library);
  const directory = await library.getDirectoryHandle('knowledge', { create: true });
  if (await library.resolve(directory) === null) return invalidBinding();
  let file: FileSystemFileHandle, created = false;
  try { file = await directory.getFileHandle('binding.json'); } catch (error) { if (!missing(error)) throw error; file = await directory.getFileHandle('binding.json', { create: true }); created = true; }
  if (await library.resolve(file) === null) return invalidBinding();
  const initial = await file.getFile(); let writer: FileSystemWritableFileStream | undefined;
  try {
    writer = await file.createWritable();
    await writer.write(JSON.stringify({ schemaVersion: 2, sources }, null, 2) + '\n');
    alive(isCurrent); await writableLibrary(library);
    if (await (await file.getFile()).text() !== previous) throw new ProductError('knowledge.changed');
    await writer.close();
  } catch (error) {
    try { await writer?.abort(); } catch { /* retain the primary failure */ }
    if (created) try {
      alive(isCurrent); await writableLibrary(library);
      const current = await directory.getFileHandle('binding.json'), snapshot = await current.getFile();
      if (await current.isSameEntry(file) && snapshot.size === 0 && snapshot.lastModified === initial.lastModified) await directory.removeEntry('binding.json');
    } catch { /* retain replacements or data no longer owned by this attempt */ }
    throw error;
  }
}
export async function knowledgeSourceDirectory(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, create = false): Promise<FileSystemDirectoryHandle> {
  await source.assertCurrent();
  const entry = (await readKnowledgeBindings(library)).find(item => item.sourceId === source.binding.sourceId);
  if (!entry) throw new ProductError('knowledge.indexSourceChanged');
  const knowledge = await library.getDirectoryHandle('knowledge'); await source.assertTargetOutsideSource(knowledge);
  const directory = entry.directory ? await knowledge.getDirectoryHandle(entry.directory, { create }) : knowledge;
  await source.assertTargetOutsideSource(directory); return directory;
}

export async function connectKnowledgeSource(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true): Promise<ReadonlyKnowledgeSource> {
  alive(isCurrent); await writableLibrary(library);
  if (!await readPermission(source)) throw new ProductError('knowledge.readRequired');
  // Both containment directions matter: the source must never encompass writable library data.
  await separateRoots(library, source);
  alive(isCurrent);
  const currentBindings = await bindingDocument(library).catch(() => null);
  if (currentBindings && (currentBindings.sources.length > 1 || currentBindings.sources.some(item => item.directory))) return addKnowledgeSource(library, source, store, isCurrent, (await readKnowledgeBinding(library))?.sourceId);
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

export async function restoreKnowledgeSource(library: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true, sourceId?: string): Promise<KnowledgeConnection> {
  const empty = { binding: null, source: null };
  alive(isCurrent);
  if (await queryDirectoryReadWritePermission(library) !== 'granted') return { ...empty, status: 'library-unavailable' };
  let binding: KnowledgeBinding | null;
  try { binding = await readKnowledgeBinding(library, sourceId); } catch (error) { return { ...empty, status: 'invalid', issue: productErrorMessage(error) }; }
  alive(isCurrent); if (!binding) return { ...empty, status: 'unbound' };
  try {
    const saved = await store.load(binding.sourceId); alive(isCurrent);
    if (!saved || !await library.isSameEntry(saved.library)) return { binding, source: null, status: 'needs-source' };
    const source = readonlySource(library, saved.source, binding, isCurrent), granted = await source.hasReadPermission();
    if (granted) await source.assertCurrent();
    alive(isCurrent); return { binding, source, status: granted ? 'ready' : 'needs-permission' };
  } catch (error) { alive(isCurrent); return { binding, source: null, status: 'needs-source', issue: productErrorMessage(error) }; }
}

export async function reconnectKnowledgeSource(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true, sourceId?: string): Promise<ReadonlyKnowledgeSource> {
  alive(isCurrent); await writableLibrary(library);
  if (!await readPermission(source)) throw new ProductError('knowledge.readRequired');
  await separateRoots(library, source);
  const binding = await readKnowledgeBinding(library, sourceId);
  if (!binding) throw new ProductError('knowledge.invalidBinding');
  const saved = await store.load(binding.sourceId); alive(isCurrent);
  if (saved && (!await library.isSameEntry(saved.library) || !await source.isSameEntry(saved.source))) throw new ProductError('knowledge.relocateMismatch');
  await writableLibrary(library); await separateRoots(library, source); alive(isCurrent);
  if ((await readKnowledgeBinding(library, binding.sourceId))?.sourceId !== binding.sourceId) throw new ProductError('knowledge.changed');
  await store.save(binding.sourceId, { library, source });
  alive(isCurrent);
  if ((await readKnowledgeBinding(library, binding.sourceId))?.sourceId !== binding.sourceId) throw new ProductError('knowledge.changed');
  return readonlySource(library, source, binding, isCurrent);
}

async function localSourceStamp(library: FileSystemDirectoryHandle, entry: KnowledgeRegistration) {
  const knowledge = await library.getDirectoryHandle('knowledge'), origin = entry.directory ? await knowledge.getDirectoryHandle(entry.directory) : knowledge;
  const rows: string[] = [];
  const visit = async (folder: FileSystemDirectoryHandle, path = '', legacy = false) => {
    if (await library.resolve(folder) === null) return invalidBinding();
    for await (const [name, item] of folder.entries()) {
      if (legacy && name !== 'index' && name !== 'research-' + entry.sourceId + '.json') continue;
      const key = path + '/' + name;
      if (item.kind === 'directory') { rows.push(key + '/'); await visit(await folder.getDirectoryHandle(name), key); }
      else { const handle = await folder.getFileHandle(name); if (await library.resolve(handle) === null) return invalidBinding(); rows.push(key + ':' + await contentHash(await (await handle.getFile()).text())); }
    }
  };
  await visit(origin, '', !entry.directory); return rows.sort().join('\n');
}
async function copyLocalData(library: FileSystemDirectoryHandle, entry: KnowledgeRegistration, destination: FileSystemDirectoryHandle, check: () => void) {
  const before = await localSourceStamp(library, entry);
  const knowledge = await library.getDirectoryHandle('knowledge');
  const origin = entry.directory ? await knowledge.getDirectoryHandle(entry.directory) : knowledge;
  const copy = async (from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle, legacy = false) => {
    if (await library.resolve(from) === null || await library.resolve(to) === null) return invalidBinding();
    for await (const [name, item] of from.entries()) {
      check(); if (legacy && name !== 'index' && name !== 'research-' + entry.sourceId + '.json') continue;
      if (item.kind === 'directory') await copy(await from.getDirectoryHandle(name), await to.getDirectoryHandle(name, { create: true }));
      else {
        const file = await (await from.getFileHandle(name)).getFile(), target = await to.getFileHandle(name, { create: true });
        if (await library.resolve(target) === null) return invalidBinding();
        const writer = await target.createWritable();
        try { await writer.write(file); check(); await writableLibrary(library); await writer.close(); } catch (error) { try { await writer.abort(); } catch {} throw error; }
      }
    }
  };
  await copy(origin, destination, !entry.directory);
  if (await localSourceStamp(library, entry) !== before) throw new ProductError('knowledge.changed');
  return before;
}
async function newPartition(library: FileSystemDirectoryHandle, name: string) {
  if (!localName(name)) throw new ProductError('knowledge.partitionNameInvalid');
  const knowledge = await library.getDirectoryHandle('knowledge', { create: true });
  for await (const [existing] of knowledge.entries()) if (existing === name) throw new ProductError('knowledge.partitionExists');
  return knowledge.getDirectoryHandle(name, { create: true });
}
export async function addKnowledgeSource(library: FileSystemDirectoryHandle, source: FileSystemDirectoryHandle, store: KnowledgeBookmarkStore = knowledgeBookmarks, isCurrent: () => boolean = () => true, replaceId?: string): Promise<ReadonlyKnowledgeSource> {
  alive(isCurrent); await writableLibrary(library); if (!await readPermission(source)) throw new ProductError('knowledge.readRequired'); await separateRoots(library, source);
  const { raw, sources } = await bindingDocument(library);
  if (replaceId && !sources.some(item => item.sourceId === replaceId && !item.disconnected)) return invalidBinding();
  for (const entry of sources.filter(item => !item.disconnected)) {
    const saved = await store.load(entry.sourceId); alive(isCurrent);
    if (saved && await library.isSameEntry(saved.library)) {
      await separateRoots(library, saved.source);
      if (await source.isSameEntry(saved.source)) {
        if (replaceId && replaceId !== entry.sourceId) throw new ProductError('knowledge.sourceAlreadyConnected');
        return readonlySource(library, source, bindingOf(entry), isCurrent);
      }
    }
  }
  if (sources.length >= 100) throw new ProductError('knowledge.documentLimit');
  const binding = { schemaVersion: 1 as const, sourceId: crypto.randomUUID(), name: source.name };
  if (!validKnowledgeBinding(binding)) return invalidBinding();
  const entry: KnowledgeRegistration = { ...binding, directory: 'source-' + binding.sourceId.slice(0, 8) };
  await store.save(binding.sourceId, { library, source });
  const created: { entry: KnowledgeRegistration; stamp: string }[] = [];
  try {
    const partition = await newPartition(library, entry.directory); await outsideSource(library, source, partition);
    created.push({ entry, stamp: '' });
    const migrated: KnowledgeRegistration[] = [];
    for (const item of sources) {
      if (item.directory) { migrated.push(item); continue; }
      const directory = 'source-' + item.sourceId.slice(0, 8), target = await newPartition(library, directory);
      await outsideSource(library, source, target);
      const migratedEntry = { ...item, directory };
      created.push({ entry: migratedEntry, stamp: '' });
      await copyLocalData(library, item, target, () => alive(isCurrent));
      created[created.length - 1].stamp = await localSourceStamp(library, migratedEntry);
      migrated.push(migratedEntry);
    }
    alive(isCurrent); await separateRoots(library, source);
    await writeBindings(library, [...migrated.map(item => item.sourceId === replaceId ? { ...item, disconnected: true } : item), entry], raw, isCurrent);
    return readonlySource(library, source, binding, isCurrent);
  } catch (error) {
    try { await store.remove(binding.sourceId); } catch {}
    for (const owned of created) try {
      alive(isCurrent); await writableLibrary(library);
      const latest = await bindingDocument(library);
      if (!latest.sources.some(item => item.directory === owned.entry.directory) && await localSourceStamp(library, owned.entry) === owned.stamp) {
        const knowledge = await library.getDirectoryHandle('knowledge'); await outsideSource(library, source, knowledge); await knowledge.removeEntry(owned.entry.directory, { recursive: true });
      }
    } catch { /* retain anything no longer owned by this attempt */ }
    throw error;
  }
}
export async function updateKnowledgeSource(library: FileSystemDirectoryHandle, sourceId: string, input: { name: string; directory: string }, isCurrent: () => boolean = () => true) {
  alive(isCurrent); await writableLibrary(library);
  const { raw, sources } = await bindingDocument(library), current = sources.find(item => item.sourceId === sourceId && !item.disconnected);
  if (!current || !validKnowledgeBinding(bindingOf({ ...current, name: input.name.trim() }))) return invalidBinding();
  if (!localName(input.directory)) throw new ProductError('knowledge.partitionNameInvalid');
  let before: string | undefined;
  if (input.directory !== current.directory) {
    const target = await newPartition(library, input.directory);
    before = await copyLocalData(library, current, target, () => alive(isCurrent));
  }
  await writeBindings(library, sources.map(item => item.sourceId === sourceId ? { ...item, name: input.name.trim(), directory: input.directory } : item), raw, isCurrent);
  if (before !== undefined && current.directory && await localSourceStamp(library, current) === before) {
    alive(isCurrent); await writableLibrary(library);
    await (await library.getDirectoryHandle('knowledge')).removeEntry(current.directory, { recursive: true });
  }
}
export async function disconnectKnowledgeSource(library: FileSystemDirectoryHandle, sourceId: string, isCurrent: () => boolean = () => true) {
  alive(isCurrent); await writableLibrary(library);
  const { raw, sources } = await bindingDocument(library); if (!sources.some(item => item.sourceId === sourceId && !item.disconnected)) return invalidBinding();
  // Retain the partition and its stable pointer for already-adopted material.
  await writeBindings(library, sources.map(item => item.sourceId === sourceId ? { ...item, disconnected: true } : item), raw, isCurrent);
}
