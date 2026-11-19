import { getDirectoryBookmarkId } from './directoryBookmark';
import { ProductError } from './i18n/productMessages';

export const BROWSER_CACHE_LIMIT = 128 * 1024 * 1024;
export type CacheKind = 'render' | 'compile' | 'resources';
type Value = string | Blob;
type Meta = { key: string; bytes: number; used: number };
type StoredValue = { value: Value; hash: string };
const memory = new Map<string, { value: Value; meta: Meta }>();
const scopes = new WeakMap<FileSystemDirectoryHandle, string>();
let clock = 0;
export function libraryCacheScope(root: FileSystemDirectoryHandle): string {
  const bookmark = getDirectoryBookmarkId(root); if (bookmark) return bookmark;
  let id = scopes.get(root); if (!id) { id = crypto.randomUUID(); scopes.set(root, id); } return id;
}
function key(kind: CacheKind, scope: string, identity: string) { return JSON.stringify([kind, scope, identity]); }
function size(value: Value) { return typeof value === 'string' ? new Blob([value]).size : value.size; }
async function digest(value: Value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (typeof value === 'string' ? new Blob([value]) : value).arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join(''); }
function now() { return clock = Math.max(Date.now(), clock + 1); }
async function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise(resolve => {
    let finished = false;
    const finish = (db: IDBDatabase | null) => { if (finished) { db?.close(); return; } finished = true; resolve(db); };
    try {
      const request = indexedDB.open('rainy-editor-cache', 1);
      request.onupgradeneeded = () => { for (const store of ['values', 'metadata']) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store); };
      request.onsuccess = () => finish(request.result);
      request.onerror = request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
}
function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let value: T;
    try {
      const tx = db.transaction(['values', 'metadata'], mode);
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Cache transaction failed')); };
      run(tx, result => { value = result; });
    } catch (error) { db.close(); reject(error); }
  });
}
function remember(id: string, value: Value) {
  const bytes = size(value); if (bytes > BROWSER_CACHE_LIMIT) return;
  memory.delete(id); memory.set(id, { value, meta: { key: id, bytes, used: now() } });
  let total = [...memory.values()].reduce((sum, x) => sum + x.meta.bytes, 0);
  while (total > BROWSER_CACHE_LIMIT || memory.size > 512) {
    const oldest = memory.keys().next().value!; total -= memory.get(oldest)!.meta.bytes; memory.delete(oldest);
  }
}
export async function readBrowserCache(kind: CacheKind, scope: string, identity: string): Promise<Value | null> {
  const id = key(kind, scope, identity), db = await database();
  if (db) try {
    const row = await transaction<StoredValue | null>(db, 'readwrite', (tx, done) => {
      const read = tx.objectStore('values').get(id);
      read.onsuccess = () => {
        const row = read.result as StoredValue | undefined, value = row?.value;
        if (!row || typeof row.hash !== 'string' || typeof value !== 'string' && !(value instanceof Blob)) { tx.objectStore('values').delete(id); tx.objectStore('metadata').delete(id); done(null); return; }
        tx.objectStore('metadata').put({ key: id, bytes: size(value), used: now() }, id); done(row);
      };
    });
    return row && await digest(row.value) === row.hash ? row.value : null;
  } catch { /* Optional cache failure falls back to bounded memory. */ }
  if (typeof indexedDB !== 'undefined') return null;
  const row = memory.get(id); if (!row) return null; remember(id, row.value); return row.value;
}
export async function writeBrowserCache(kind: CacheKind, scope: string, identity: string, value: Value): Promise<void> {
  const bytes = size(value); if (bytes > BROWSER_CACHE_LIMIT) return;
  const id = key(kind, scope, identity), db = await database();
  if (db) try {
    const hash = await digest(value);
    await transaction<void>(db, 'readwrite', (tx, done) => {
      const metadata = tx.objectStore('metadata'), request = metadata.getAll();
      request.onsuccess = () => {
        const rows = (request.result as Meta[]).filter(row => row.key !== id).sort((a, b) => a.used - b.used);
        let total = rows.reduce((sum, row) => sum + row.bytes, bytes);
        while (rows.length && (total > BROWSER_CACHE_LIMIT || rows.length >= 512)) {
          const row = rows.shift()!; total -= row.bytes; metadata.delete(row.key); tx.objectStore('values').delete(row.key);
        }
        tx.objectStore('values').put({ value, hash }, id); metadata.put({ key: id, bytes, used: now() }, id); done();
      };
    }); return;
  } catch { /* Quota/storage availability cannot turn a successful save into a failure. */ }
  if (typeof indexedDB !== 'undefined') return;
  remember(id, value);
}
export async function browserCacheUsage(): Promise<{ bytes: number; entries: number; persistent: boolean; limit: number }> {
  const db = await database();
  if (db) try { return await transaction<{ bytes: number; entries: number; persistent: boolean; limit: number }>(db, 'readonly', (tx, done) => {
    const request = tx.objectStore('metadata').getAll();
    request.onsuccess = () => done({ bytes: (request.result as Meta[]).reduce((sum, row) => sum + row.bytes, 0), entries: request.result.length, persistent: true, limit: BROWSER_CACHE_LIMIT });
  }); } catch { /* Report the memory fallback when storage is unavailable. */ }
  return { bytes: [...memory.values()].reduce((sum, row) => sum + row.meta.bytes, 0), entries: memory.size, persistent: false, limit: BROWSER_CACHE_LIMIT };
}
export async function clearBrowserCache(): Promise<void> {
  memory.clear(); const db = await database();
  if (!db && typeof indexedDB !== 'undefined') throw new ProductError('renderCache.unavailable');
  if (db) await transaction<void>(db, 'readwrite', (tx, done) => { tx.objectStore('values').clear(); tx.objectStore('metadata').clear(); done(); });
}
