import { ProductError } from '../i18n/productMessages';
import { readKnowledgeBinding, type ReadonlyKnowledgeSource } from './source';
import { knowledgeShardPath, type KnowledgeManifest } from './model';
import type { KnowledgeWorkerClient } from './workerClient';

export function assertIndexNotAborted(signal?: AbortSignal) { if (signal?.aborted) throw new ProductError('knowledge.indexCancelled'); }
export async function assertKnowledgeIndexTarget(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, signal?: AbortSignal) {
  assertIndexNotAborted(signal); await source.assertCurrent();
  if ((await readKnowledgeBinding(library))?.sourceId !== source.binding.sourceId) throw new ProductError('knowledge.indexSourceChanged');
  assertIndexNotAborted(signal);
}
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
async function childDirectory(parent: FileSystemDirectoryHandle, name: string, source: ReadonlyKnowledgeSource, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  await source.assertTargetOutsideSource(parent);
  let child;
  try { child = await parent.getDirectoryHandle(name); }
  catch (error) { if (!missing(error)) throw error; if (!create) return null; child = await parent.getDirectoryHandle(name, { create: true }); }
  await source.assertTargetOutsideSource(child); return child;
}
async function indexDirectory(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, create: boolean) {
  const knowledge = await childDirectory(library, 'knowledge', source, create);
  return knowledge ? childDirectory(knowledge, 'index', source, create) : null;
}
async function indexFile(parent: FileSystemDirectoryHandle, name: string, source: ReadonlyKnowledgeSource, create: boolean): Promise<FileSystemFileHandle | null> {
  await source.assertTargetOutsideSource(parent);
  let file;
  try { file = await parent.getFileHandle(name); }
  catch (error) { if (!missing(error)) throw error; if (!create) return null; file = await parent.getFileHandle(name, { create: true }); }
  await source.assertTargetOutsideSource(file); return file;
}
async function writeBlob(file: FileSystemFileHandle, blob: Blob, library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, signal?: AbortSignal) {
  await assertKnowledgeIndexTarget(library, source, signal); await source.assertTargetOutsideSource(file);
  const writer = await file.createWritable();
  try {
    await writer.write(blob); await assertKnowledgeIndexTarget(library, source, signal); await source.assertTargetOutsideSource(file);
    await writer.close();
  } catch (error) { try { await writer.abort(); } catch { /* preserve primary error */ } throw error; }
}
export async function readKnowledgeIndex(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, worker: KnowledgeWorkerClient, signal?: AbortSignal): Promise<KnowledgeManifest | null> {
  await assertKnowledgeIndexTarget(library, source, signal);
  const directory = await indexDirectory(library, source, false); if (!directory) return null;
  const handle = await indexFile(directory, 'manifest.json', source, false); if (!handle) return null;
  const manifest = await worker.request('manifest', [await handle.getFile(), source.binding.sourceId], signal);
  await assertKnowledgeIndexTarget(library, source, signal); return manifest;
}
export async function readKnowledgeShard(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, id: string, signal?: AbortSignal): Promise<File> {
  const [generation, name] = knowledgeShardPath(id);
  await assertKnowledgeIndexTarget(library, source, signal);
  const index = await indexDirectory(library, source, false);
  const generations = index && await childDirectory(index, 'generations', source, false);
  const directory = generations && await childDirectory(generations, generation, source, false);
  const handle = directory && await indexFile(directory, name, source, false);
  if (!handle) throw new ProductError('knowledge.indexCorruptShard');
  const file = await handle.getFile(); assertIndexNotAborted(signal); return file;
}
export async function writeKnowledgeShard(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, id: string, blob: Blob, signal?: AbortSignal): Promise<void> {
  const [generation, name] = knowledgeShardPath(id);
  await assertKnowledgeIndexTarget(library, source, signal);
  const index = (await indexDirectory(library, source, true))!;
  const generations = (await childDirectory(index, 'generations', source, true))!;
  const directory = (await childDirectory(generations, generation, source, true))!;
  // A generation is unique to one scan. Reusing a filename must never overwrite existing data.
  if (await indexFile(directory, name, source, false)) throw new ProductError('knowledge.indexInvalid');
  const file = (await indexFile(directory, name, source, true))!;
  await writeBlob(file, blob, library, source, signal);
}
export async function publishKnowledgeIndex(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, blob: Blob, signal?: AbortSignal) {
  await assertKnowledgeIndexTarget(library, source, signal);
  const index = (await indexDirectory(library, source, true))!;
  const previous = await indexFile(index, 'manifest.json', source, false);
  const file = previous ?? (await indexFile(index, 'manifest.json', source, true))!;
  try { await writeBlob(file, blob, library, source, signal); }
  catch (error) {
    if (!previous) try { await assertKnowledgeIndexTarget(library, source); await source.assertTargetOutsideSource(index); await index.removeEntry('manifest.json'); } catch { /* never clean an unauthorized target */ }
    throw error;
  }
}
export async function removeUncommittedKnowledgeGeneration(library: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, generation: string) {
  knowledgeShardPath(generation + '/part-0000.json');
  // Cleanup is a target write too: a changed/lost source must not trigger filesystem cleanup.
  await assertKnowledgeIndexTarget(library, source);
  const index = await indexDirectory(library, source, false);
  const generations = index && await childDirectory(index, 'generations', source, false);
  const directory = generations && await childDirectory(generations, generation, source, false);
  if (directory && generations) { await source.assertTargetOutsideSource(directory); await generations.removeEntry(generation, { recursive: true }); }
}
