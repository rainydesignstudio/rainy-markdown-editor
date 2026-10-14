import { openBookmarkDatabase } from '../directoryBookmark';
import { ProductError } from '../i18n/productMessages';

export type KnowledgeBookmark = { library: FileSystemDirectoryHandle; source: FileSystemDirectoryHandle };
export type KnowledgeBookmarkStore = {
  load: (sourceId: string) => Promise<KnowledgeBookmark | null>;
  save: (sourceId: string, record: KnowledgeBookmark) => Promise<void>;
  remove: (sourceId: string) => Promise<void>;
};

async function record(sourceId: string, change?: { value: KnowledgeBookmark } | { remove: true }): Promise<unknown> {
  const database = await openBookmarkDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction, request: IDBRequest;
    try {
      transaction = database.transaction('handles', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('handles'), key = `knowledge:${sourceId}`;
      request = !change ? store.get(key) : 'remove' in change ? store.delete(key) : store.put(change.value, key);
    } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error ?? new ProductError('knowledge.bookmarkUnavailable')); };
  });
}

export const knowledgeBookmarks: KnowledgeBookmarkStore = {
  async load(id) {
    const value = await record(id) as Partial<KnowledgeBookmark> | undefined;
    return value?.library?.kind === 'directory' && value.source?.kind === 'directory' ? value as KnowledgeBookmark : null;
  },
  async save(id, value) { await record(id, { value }); },
  async remove(id) { await record(id, { remove: true }); },
};
