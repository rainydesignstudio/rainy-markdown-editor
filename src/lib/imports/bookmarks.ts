import { openBookmarkDatabase } from '../directoryBookmark';
import { ProductError } from '../i18n/productMessages';

export type ImportBookmarkStore = { load: (key: string) => Promise<unknown>; save: (key: string, value: unknown) => Promise<void>; remove: (key: string) => Promise<void> };
async function record(key: string, change?: { value: unknown } | { remove: true }): Promise<unknown> {
  const database = await openBookmarkDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction, request: IDBRequest;
    try {
      transaction = database.transaction('handles', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('handles'), id = `markdown-import:${key}`;
      request = !change ? store.get(id) : 'remove' in change ? store.delete(id) : store.put(change.value, id);
    } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error ?? new ProductError('imports.bookmarkFailed')); };
  });
}
export const importBookmarks: ImportBookmarkStore = {
  load: key => record(key), save: async (key, value) => { await record(key, { value }); }, remove: async key => { await record(key, { remove: true }); },
};
export async function scopedImportBookmark<T extends { library: FileSystemDirectoryHandle }>(store: ImportBookmarkStore, key: string, library: FileSystemDirectoryHandle): Promise<T | null> {
  const value = await store.load(key) as T | null;
  return value?.library?.kind === 'directory' && await library.isSameEntry(value.library) ? value : null;
}
