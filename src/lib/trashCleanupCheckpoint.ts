type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const prefix = 'rainy-trash-cleanup-v1:';
const key = (libraryId: string, id: string) => prefix + libraryId + ':' + id;

/** A synchronous refresh journal for a file-backed receipt, never an independent deletion timer. */
export function saveTrashCleanupCheckpoint(storage: StorageLike | null, libraryId: string | null, id: string, createdAt: string, remainingMs: number) {
  if (!storage || !libraryId || !Number.isFinite(remainingMs) || remainingMs < 0) return;
  try { storage.setItem(key(libraryId, id), JSON.stringify({ version: 1, id, createdAt, remainingMs })); } catch { /* file-backed receipt still retains the data */ }
}
export function readTrashCleanupCheckpoint(storage: StorageLike | null, libraryId: string | null, id: string, createdAt: string, fileRemainingMs: number) {
  if (!storage || !libraryId) return fileRemainingMs;
  try {
    const value = JSON.parse(storage.getItem(key(libraryId, id)) ?? 'null');
    return value?.version === 1 && value.id === id && value.createdAt === createdAt && typeof value.remainingMs === 'number' && Number.isFinite(value.remainingMs) && value.remainingMs >= 0
      ? Math.min(fileRemainingMs, value.remainingMs) : fileRemainingMs;
  } catch { return fileRemainingMs; }
}
export function removeTrashCleanupCheckpoint(storage: StorageLike | null, libraryId: string | null, id: string) {
  if (!storage || !libraryId) return;
  try { storage.removeItem(key(libraryId, id)); } catch { /* an absent cache is not permission to remove data */ }
}
