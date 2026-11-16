import { fetchVerifiedFontFile, type FontFileRequest, type FontFileProgress } from './fontSources';

/** Page-memory bytes only; consumers share transport but retain independent cancellation. */
export function createVerifiedResourceCache() {
  const bytes = new Map<string, ArrayBuffer>();
  type Pending = { controller: AbortController; promise: Promise<ArrayBuffer>; listeners: Set<(value: FontFileProgress) => void>; users: Set<symbol>; progress?: FontFileProgress; finished: boolean };
  const pending = new Map<string, Pending>();
  const identity = (file: FontFileRequest, scope: string) => JSON.stringify([scope, file.url, file.size, file.sha256]);
  const read = (file: FontFileRequest, scope: string) => bytes.get(identity(file, scope))?.slice(0) ?? null;
  function load(file: FontFileRequest, scope: string, signal?: AbortSignal, onProgress?: (value: FontFileProgress) => void): Promise<ArrayBuffer> {
    if (signal?.aborted) return Promise.reject(new DOMException('Resource consumer cancelled', 'AbortError'));
    const key = identity(file, scope), cached = bytes.get(key);
    if (cached) { onProgress?.({ loaded: file.size, phase: 'verifying' }); return Promise.resolve(cached.slice(0)); }
    let job = pending.get(key);
    if (!job || job.controller.signal.aborted) {
      const created: Pending = { controller: new AbortController(), promise: Promise.resolve(new ArrayBuffer(0)), listeners: new Set(), users: new Set(), finished: false };
      job = created; pending.set(key, created);
      created.promise = fetchVerifiedFontFile(file, created.controller.signal, value => {
        created.progress = value; created.listeners.forEach(listener => listener(value));
      }).then(value => {
        if (created.controller.signal.aborted) throw new DOMException('Resource download cancelled', 'AbortError');
        bytes.set(key, value.slice(0)); return value;
      }).finally(() => { created.finished = true; if (pending.get(key) === created) pending.delete(key); });
    }
    const task = job;
    return new Promise((resolve, reject) => {
      const user = Symbol(); task.users.add(user);
      let done = false;
      const release = () => {
        task.users.delete(user); if (onProgress) task.listeners.delete(onProgress);
        signal?.removeEventListener('abort', abort);
        if (!task.finished && !task.users.size) task.controller.abort();
      };
      const abort = () => { if (done) return; done = true; release(); reject(new DOMException('Resource consumer cancelled', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (onProgress) { task.listeners.add(onProgress); if (task.progress) onProgress(task.progress); }
      task.promise.then(value => { if (!done) { done = true; release(); resolve(value.slice(0)); } }, error => { if (!done) { done = true; release(); reject(error); } });
    });
  }
  return { read, load };
}
