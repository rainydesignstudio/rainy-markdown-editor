import { ProductError } from '../i18n/productMessages';
import { getResourceDirectory, type ResourceDestination } from '../resources/storage';
import type { ArticleWriteGuard } from '../fileSystem';
import { importBookmarks, scopedImportBookmark, type ImportBookmarkStore } from './bookmarks';
import type { ImportResource, ImportTask } from './model';
import type { ReadonlyImportSource } from './source';

type Reservation = { library: FileSystemDirectoryHandle; handle: FileSystemFileHandle; size: number; modified: number };
export async function rememberResourceReservation(root: FileSystemDirectoryHandle, task: ImportTask, resource: ImportResource, handle: FileSystemFileHandle, store: ImportBookmarkStore = importBookmarks) {
  const file = await handle.getFile();
  await store.save(`target:${task.id}:${resource.id}`, { library: root, handle, size: file.size, modified: file.lastModified });
}
export async function cleanInterruptedReservation(root: FileSystemDirectoryHandle, task: ImportTask, resource: ImportResource, destination: ResourceDestination, current: () => boolean, guard: ArticleWriteGuard, store: ImportBookmarkStore = importBookmarks) {
  const directory = await getResourceDirectory(root, destination, resource.storage, false, current, guard); if (!directory) return;
  let handle: FileSystemFileHandle;
  try { handle = await directory.getFileHandle(resource.fileName); }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return; throw error; }
  const path = ['articles', task.target.month, task.target.folder, 'media', resource.storage, resource.fileName]; await guard(handle, path);
  const saved = await scopedImportBookmark<Reservation>(store, `target:${task.id}:${resource.id}`, root), file = await handle.getFile();
  if (!saved || saved.handle?.kind !== 'file' || !await handle.isSameEntry(saved.handle) || saved.size !== 0 || file.size !== 0 || file.lastModified !== saved.modified) throw new ProductError('imports.existingResource', { name: resource.fileName });
  await guard(directory, path.slice(0, -1)); await guard(handle, path);
  if (!await handle.isSameEntry(await directory.getFileHandle(resource.fileName))) throw new ProductError('resources.changed');
  await directory.removeEntry(resource.fileName);
}

export async function chooseImportReplacement(root: FileSystemDirectoryHandle, task: ImportTask, resource: ImportResource, current: () => boolean, store: ImportBookmarkStore = importBookmarks) {
  const picker = (window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
  if (!picker) throw new ProductError('imports.pickerUnavailable');
  let files: FileSystemFileHandle[];
  try { files = await picker({ multiple: false }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error; }
  if (!current()) throw new ProductError('imports.changed');
  if (!files[0]) return null;
  const handle = files[0] as FileSystemFileHandle & { queryPermission: (options: { mode: 'read' }) => Promise<PermissionState> };
  if (await handle.queryPermission({ mode: 'read' }) !== 'granted') throw new ProductError('imports.sourceRequired');
  if (!current()) throw new ProductError('imports.changed');
  const file = await handle.getFile();
  await store.save(`replacement:${task.id}:${resource.id}`, { library: root, handle }); return { name: file.name, size: file.size, modified: file.lastModified };
}
export async function readImportReplacement(root: FileSystemDirectoryHandle, task: ImportTask, resource: ImportResource, store: ImportBookmarkStore = importBookmarks) {
  const saved = await scopedImportBookmark<{ library: FileSystemDirectoryHandle; handle: FileSystemFileHandle }>(store, `replacement:${task.id}:${resource.id}`, root);
  if (!saved || saved.handle?.kind !== 'file') return null;
  const handle = saved.handle as FileSystemFileHandle & { queryPermission: (options: { mode: 'read' }) => Promise<PermissionState> };
  if (await handle.queryPermission({ mode: 'read' }) !== 'granted') throw new ProductError('imports.sourceRequired');
  return { file: await handle.getFile(), assertTarget: async (target: FileSystemHandle) => { if (await handle.isSameEntry(target)) throw new ProductError('imports.sourceDirectoryMismatch'); } };
}

/** No original source is needed to retry HTTPS or individually selected files. */
export function unavailableImportSource(task: ImportTask, current: () => boolean): ReadonlyImportSource {
  const check = async () => { if (!current()) throw new ProductError('imports.changed'); };
  return Object.freeze({ origin: task.source, title: task.target.folder, directoryName: null, assertCurrent: check, assertTarget: check,
    readMarkdown: async () => { throw new ProductError('imports.sourceRequired'); }, readResource: async () => { throw new ProductError('imports.sourceDirectoryRequired'); } });
}
