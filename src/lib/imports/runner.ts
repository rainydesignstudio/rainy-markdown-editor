import { ProductError, productErrorMessage } from '../i18n/productMessages';
import { writeResourceStream, type ResourceDestination } from '../resources/storage';
import { importTargetGuard } from './create';
import { openImportResource } from './download';
import { saveImportTaskRecord, importRecordGuard } from './store';
import { cleanInterruptedReservation, readImportReplacement, rememberResourceReservation } from './recovery';
import { importBookmarks, type ImportBookmarkStore } from './bookmarks';
import { getStoredArticleDirectory } from '../fileSystem';
import type { ImportTask, ImportResource } from './model';
import type { ReadonlyImportSource } from './source';

export async function runImportResources(root: FileSystemDirectoryHandle, source: ReadonlyImportSource, plan: ImportTask, current: () => boolean, options: {
  signal: AbortSignal; onChange: (task: ImportTask) => void; onResource: (resource: ImportResource) => void;
  fetcher?: typeof fetch; persist?: (task: ImportTask) => Promise<void>; bookmarks?: ImportBookmarkStore;
}) {
  const task = structuredClone(plan), guard = importTargetGuard(root, source, current);
  const destination: ResourceDestination = { kind: 'article', ...task.target, title: task.target.folder };
  const bookmarks = options.bookmarks ?? importBookmarks;
  const persist = options.persist ?? (value => saveImportTaskRecord(root, value, importRecordGuard(root, current)));
  let lastNotice = -Infinity, lastDisk = -Infinity, disk = Promise.resolve();
  let diskError: ReturnType<typeof productErrorMessage> | undefined;
  const check = () => { if (options.signal.aborted) throw options.signal.reason; if (!current()) throw new ProductError('imports.changed'); };
  const notify = (force = false) => { const now = performance.now(); if (force || now - lastNotice >= 100) { lastNotice = now; options.onChange(structuredClone(task)); } };
  const save = (force = false) => {
    const now = performance.now(); if (!force && now - lastDisk < 400) return;
    lastDisk = now; task.updatedAt = new Date().toISOString(); const value = structuredClone(task);
    disk = disk.then(async () => { try { if (!current()) throw new ProductError('imports.changed'); await persist(value); diskError = undefined; } catch (error) { diskError = productErrorMessage(error); } });
  };
  task.state = 'running'; notify(true); save(true);
  const targetExists = async () => {
    try { const directory = await getStoredArticleDirectory(root, task.target.month, task.target.folder, { requestPermission: false }); await directory.getFileHandle('article.md'); return true; }
    catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return false; throw error; }
  };
  const cancelMissingTarget = () => { task.state = 'cancelled'; for (const resource of task.resources) if (resource.state !== 'complete') { resource.state = 'cancelled'; resource.error = productErrorMessage(new ProductError('imports.targetDeleted')); } };
  try { if (!await targetExists()) { cancelMissingTarget(); notify(true); save(true); await disk; return { task, diskError }; } }
  catch (error) { task.state = 'paused'; const resource = task.resources.find(item => item.state !== 'complete'); if (resource) resource.error = productErrorMessage(error); notify(true); save(true); await disk; return { task, diskError }; }
  let index = 0, pause = false;
  const run = async () => {
    while (index < task.resources.length) {
      const resource = task.resources[index++];
      if (resource.state !== 'pending') continue;
      if (pause || options.signal.aborted || !current()) return;
      resource.state = 'running'; resource.receivedBytes = 0; delete resource.error;
      notify(); save();
      let headerTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new AbortController();
      const signal = AbortSignal.any([options.signal, timeout.signal]);
      try {
        const replacement = await readImportReplacement(root, task, resource, bookmarks); check();
        const resourceGuard = async (handle: FileSystemHandle, path: readonly string[]) => { await guard(handle, path); await replacement?.assertTarget(handle); };
        await cleanInterruptedReservation(root, task, resource, destination, current, resourceGuard, bookmarks); check();
        headerTimer = setTimeout(() => timeout.abort(new ProductError('imports.resourceTimeout')), 30000);
        const opened = replacement ? { stream: replacement.file.stream(), expectedBytes: replacement.file.size } : await openImportResource(resource, source, signal, options.fetcher, task.source.kind);
        clearTimeout(headerTimer); check();
        resource.totalBytes = opened.expectedBytes;
        await writeResourceStream(root, destination, resource.storage, resource.fileName, opened.stream, {
          isCurrent: current, signal, expectedBytes: opened.expectedBytes, guard: resourceGuard,
          onReserved: handle => rememberResourceReservation(root, task, resource, handle, bookmarks),
          onProgress: bytes => { resource.receivedBytes = bytes; notify(); },
        });
        check(); resource.state = 'complete'; options.onResource({ ...resource });
      } catch (error) {
        resource.state = options.signal.aborted || !current() ? 'pending' : 'failed';
        resource.error = productErrorMessage(error);
        if (error instanceof ProductError && ['imports.changed', 'imports.sourceRequired', 'knowledge.readRequired', 'resources.libraryRequired'].includes(error.messageKey)) pause = true;
      } finally { clearTimeout(headerTimer); notify(); save(); }
    }
  };
  await Promise.all([run(), run()]);
  task.state = options.signal.aborted || !current() || task.resources.some(resource => resource.state !== 'complete') || task.diagnostics.some(issue => issue.reason !== 'document-link') ? 'paused' : 'complete';
  if (options.signal.aborted && options.signal.reason?.messageKey === 'imports.cancelled') { task.state = 'cancelled'; for (const resource of task.resources) if (resource.state !== 'complete') resource.state = 'cancelled'; }
  if (current()) try { if (!await targetExists()) cancelMissingTarget(); } catch { /* permission loss remains paused */ }
  notify(true); save(true); await disk;
  return { task, diskError };
}
