import { ProductError } from '../i18n/productMessages';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { inspectArticleImage } from '../articleMedia';
import { getResourceDirectory, type ResourceDestination } from './storage';

export type CachedArticleImage = { handle: FileSystemFileHandle; file: File; mimeType: string; size: number };
type Entry = { promise: Promise<CachedArticleImage>; value?: CachedArticleImage };
const roots = new WeakMap<FileSystemDirectoryHandle, Map<string, Entry>>();
const cacheKey = (articleId: string, name: string, scope: string | number) => JSON.stringify([articleId, name, scope]);
export function cachedArticleImage(root: FileSystemDirectoryHandle, articleId: string, name: string, scope: string | number): CachedArticleImage | null {
  return roots.get(root)?.get(cacheKey(articleId, name, scope))?.value ?? null;
}
/** Bounded immutable File snapshots; object URLs remain owned by each existing preview. */
export async function readArticleImage(root: FileSystemDirectoryHandle, destination: ResourceDestination & { kind: 'article' }, name: string, scope: string | number, current: () => boolean): Promise<CachedArticleImage> {
  if (!current()) throw new ProductError('resources.changed');
  if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('resources.libraryRequired');
  let cache = roots.get(root); if (!cache) { cache = new Map(); roots.set(root, cache); }
  const key = cacheKey(destination.articleId, name, scope); let entry = cache.get(key);
  if (entry) { cache.delete(key); cache.set(key, entry); }
  else {
    const row = {} as Entry;
    row.promise = (async () => {
      const directory = await getResourceDirectory(root, destination, 'image', false, current);
      if (!directory) throw new DOMException('Missing image directory', 'NotFoundError');
      const handle = await directory.getFileHandle(name), path = await root.resolve(handle);
      if (path?.join('/') !== ['articles', destination.month, destination.folder, 'media', 'image', name].join('/')) throw new ProductError('resources.unsafeTarget');
      const file = await handle.getFile(), format = await inspectArticleImage(file);
      if (!current()) throw new ProductError('resources.changed');
      row.value = { handle, file, mimeType: format.mimeType, size: file.size }; return row.value;
    })().catch(error => { if (cache!.get(key) === row) cache!.delete(key); throw error; });
    entry = row; cache.set(key, row);
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  const value = await entry.promise; if (!current()) throw new ProductError('resources.changed'); return value;
}
