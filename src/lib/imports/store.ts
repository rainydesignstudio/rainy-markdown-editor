import { ProductError } from '../i18n/productMessages';
import { isKnowledgeId, knowledgePath } from '../knowledge/model';
import type { ArticleWriteGuard } from '../fileSystem';
import { IMPORT_LIMITS, validateImportTask, type ImportTask } from './model';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { productErrorMessage } from '../i18n/productMessages';

/** Persist the resource plan after the manuscript; never initialize a source directory. */
export async function createImportTaskRecord(root: FileSystemDirectoryHandle, task: ImportTask, guard: ArticleWriteGuard): Promise<void> {
  if (!isKnowledgeId(task.id) || task.schemaVersion !== 1 || task.target.articleId !== `${task.target.month}/${task.target.folder}`) throw new ProductError('imports.invalidTask');
  knowledgePath(task.target.articleId);
  const value = JSON.stringify(task, null, 2) + '\n';
  if (new TextEncoder().encode(value).length > IMPORT_LIMITS.taskBytes) throw new ProductError('imports.invalidTask');
  let parent = root;
  for (const [index, name] of ['imports', 'tasks'].entries()) {
    const path = ['imports', 'tasks'].slice(0, index + 1);
    await guard(parent, path.slice(0, -1));
    let next: FileSystemDirectoryHandle;
    try { next = await parent.getDirectoryHandle(name); }
    catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; await guard(parent, path.slice(0, -1)); next = await parent.getDirectoryHandle(name, { create: true }); }
    await guard(next, path); parent = next;
  }
  const name = task.id + '.json', path = ['imports', 'tasks', name];
  try { await parent.getFileHandle(name); throw new ProductError('resources.exists', { name }); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
  await guard(parent, path.slice(0, -1));
  const file = await parent.getFileHandle(name, { create: true }); await guard(file, path);
  const writer = await file.createWritable();
  try { await writer.write(value); await guard(file, path); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* keep primary failure */ } throw error; }
}

/** Update only the existing plan with the same target and source identity. */
export async function saveImportTaskRecord(root: FileSystemDirectoryHandle, task: ImportTask, guard: ArticleWriteGuard): Promise<void> {
  validateImportTask(task);
  const imports = await root.getDirectoryHandle('imports'); await guard(imports, ['imports']);
  const tasks = await imports.getDirectoryHandle('tasks'); await guard(tasks, ['imports', 'tasks']);
  const path = ['imports', 'tasks', task.id + '.json'], file = await tasks.getFileHandle(path[2]); await guard(file, path);
  const previous = await file.getFile();
  if (previous.size > IMPORT_LIMITS.taskBytes) throw new ProductError('imports.invalidTask');
  const record = validateImportTask(JSON.parse(await previous.text()));
  if (record.id !== task.id || record.source?.sourceId !== task.source.sourceId || record.target?.articleId !== task.target.articleId || record.createdAt !== task.createdAt) throw new ProductError('imports.invalidTask');
  const allocation = (value: ImportTask) => JSON.stringify({ target: value.target, source: value.source, resources: value.resources.map(({ id, source, location, storage, fileName, reference }) => ({ id, source, location, storage, fileName, reference })) });
  if (allocation(record) !== allocation(task)) throw new ProductError('imports.invalidTask');
  const value = JSON.stringify(task, null, 2) + '\n';
  if (new TextEncoder().encode(value).length > IMPORT_LIMITS.taskBytes) throw new ProductError('imports.invalidTask');
  await guard(file, path); const writer = await file.createWritable();
  try { await writer.write(value); await guard(file, path); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* preserve primary failure */ } throw error; }
}

export function importRecordGuard(root: FileSystemDirectoryHandle, current: () => boolean): ArticleWriteGuard {
  return async (handle, path) => {
    if (!current()) throw new ProductError('imports.changed');
    if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('resources.libraryRequired');
    const resolved = await root.resolve(handle);
    if (!resolved || resolved.join('/') !== path.join('/')) throw new ProductError('resources.unsafeTarget');
    if (!current()) throw new ProductError('imports.changed');
  };
}

export async function loadImportTaskRecords(root: FileSystemDirectoryHandle, current: () => boolean) {
  const guard = importRecordGuard(root, current), tasks: ImportTask[] = [], issues: ReturnType<typeof productErrorMessage>[] = [];
  await guard(root, []);
  let directory: FileSystemDirectoryHandle;
  try { const imports = await root.getDirectoryHandle('imports'); await guard(imports, ['imports']); directory = await imports.getDirectoryHandle('tasks'); await guard(directory, ['imports', 'tasks']); }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return { tasks, issues }; throw error; }
  const files: { handle: FileSystemFileHandle; file: File; id: string }[] = [];
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json') || !isKnowledgeId(name.slice(0, -5))) continue;
    const handle = await directory.getFileHandle(name); await guard(handle, ['imports', 'tasks', name]);
    files.push({ handle, file: await handle.getFile(), id: name.slice(0, -5) });
  }
  files.sort((a, b) => b.file.lastModified - a.file.lastModified || a.id.localeCompare(b.id));
  if (files.length > IMPORT_LIMITS.visibleTasks) issues.push(productErrorMessage(new ProductError('imports.taskLimit', { count: IMPORT_LIMITS.visibleTasks })));
  for (const { file, handle, id } of files.slice(0, IMPORT_LIMITS.visibleTasks)) {
    try {
      await guard(handle, ['imports', 'tasks', id + '.json']); if (file.size > IMPORT_LIMITS.taskBytes) throw new ProductError('imports.invalidTask');
      const task = validateImportTask(JSON.parse(await file.text())); if (task.id !== id) throw new ProductError('imports.invalidTask');
      const recovered = structuredClone(task);
      if (!['complete', 'cancelled'].includes(recovered.state)) { recovered.state = 'paused'; for (const resource of recovered.resources) if (resource.state === 'running') resource.state = 'pending'; }
      tasks.push(recovered);
    } catch (error) { if (!current()) throw new ProductError('imports.changed'); issues.push(productErrorMessage(error)); }
  }
  await guard(directory, ['imports', 'tasks']); return { tasks, issues };
}
