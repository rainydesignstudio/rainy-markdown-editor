import { ProductError } from '../i18n/productMessages';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { getStoredArticleDirectory, type ArticleWriteGuard } from '../fileSystem';
import { inspectArticleImage, sanitizeAssetBaseName, uniqueAssetFileName, libraryMediaAssetKey, type ImportedArticleImage, type LibraryMediaAsset } from '../articleMedia';
import { readMediaMetadata } from '../mediaManagement';
import { createArticleMutationQueue } from '../articleMutationQueue';
import { RESOURCE_FILE_LIMIT, resourceType, resourceMime, resourceExtension, resourceReference, validResourceLeaf, type ResourceStorage, type ResourceType } from './types';

export type ResourceDestination = Readonly<{ kind: 'shared' } | { kind: 'article'; articleId: string; month: string; folder: string; title: string }>;
export type ResourceFile = ImportedArticleImage & { storage: ResourceStorage; typeId: string; preview: 'image' | 'none' };
export type LibraryResourceAsset = ResourceFile & { root: FileSystemDirectoryHandle } & ({ kind: 'shared' } | { kind: 'article'; articleId: string; month: string; folder: string; articleTitle: string });
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const fold = (name: string) => name.normalize('NFKC').toLowerCase();
async function ready(root: FileSystemDirectoryHandle, isCurrent: () => boolean) {
  if (!isCurrent()) throw new ProductError('resources.changed');
  if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('resources.libraryRequired');
  if (!isCurrent()) throw new ProductError('resources.changed');
}
function destinationPath(destination: ResourceDestination): string[] {
  if (destination?.kind === 'shared') return ['shared'];
  if (destination?.kind !== 'article' || typeof destination.month !== 'string' || typeof destination.folder !== 'string' || typeof destination.title !== 'string') throw new ProductError('resources.unsafeTarget');
  if (destination.articleId !== `${destination.month}/${destination.folder}`) throw new ProductError('resources.identityMismatch');
  return ['articles', destination.month, destination.folder, 'media'];
}
function destinationSnapshot(destination: ResourceDestination): ResourceDestination {
  const scope = Object.freeze({ ...destination }); destinationPath(scope); return scope;
}
async function owned(root: FileSystemDirectoryHandle, handle: FileSystemHandle, expected: readonly string[]) {
  const actual = await root.resolve(handle);
  if (!actual || actual.length !== expected.length || actual.some((part, index) => part !== expected[index])) throw new ProductError('resources.unsafeTarget');
}
async function child(root: FileSystemDirectoryHandle, parent: FileSystemDirectoryHandle, expected: string[], create: boolean, isCurrent: () => boolean, guard?: ArticleWriteGuard) {
  await ready(root, isCurrent); await owned(root, parent, expected.slice(0, -1));
  await guard?.(parent, expected.slice(0, -1));
  let directory;
  try { directory = await parent.getDirectoryHandle(expected.at(-1)!); }
  catch (error) { if (!missing(error)) throw error; if (!create) return null; await ready(root, isCurrent); directory = await parent.getDirectoryHandle(expected.at(-1)!, { create: true }); }
  await ready(root, isCurrent); await owned(root, directory, expected); await guard?.(directory, expected); return directory;
}
export async function getResourceDirectory(root: FileSystemDirectoryHandle, destination: ResourceDestination, storage: ResourceStorage, create = false, isCurrent: () => boolean = () => true, guard?: ArticleWriteGuard): Promise<FileSystemDirectoryHandle | null> {
  destination = destinationSnapshot(destination);
  if (!['image', 'file'].includes(storage)) throw new ProductError('resources.unsafeTarget');
  const path = destinationPath(destination);
  await ready(root, isCurrent);
  let parent;
  if (destination.kind === 'shared') parent = await child(root, root, path, create, isCurrent, guard);
  else {
    parent = await getStoredArticleDirectory(root, destination.month, destination.folder, { requestPermission: false });
    await ready(root, isCurrent); await owned(root, parent, path.slice(0, -1));
    await guard?.(parent, path.slice(0, -1));
    // A deleted or not-yet-saved manuscript must never be recreated by a resource job.
    const article = await parent.getFileHandle('article.md'); await owned(root, article, [...path.slice(0, -1), 'article.md']);
    parent = await child(root, parent, path, create, isCurrent, guard);
  }
  return parent ? child(root, parent, [...path, storage], create, isCurrent, guard) : null;
}
export async function inspectResourceFile(file: File): Promise<{ storage: ResourceStorage; mimeType: string; extension: string; type: ResourceType }> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new ProductError('resources.tooLarge');
  const profile = resourceType(file.name, file.type);
  try {
    const image = await inspectArticleImage(file);
    return { storage: 'image', mimeType: image.mimeType, extension: image.extension, type: resourceType('image.' + image.extension, image.mimeType) };
  } catch (error) {
    if (!(error instanceof ProductError) || error.messageKey !== 'articleMedia.fileContentCouldNotBeIdentifiedAsSupportedPngJpegGifWebp' || profile.id === 'image') throw error;
  }
  if (file.size > RESOURCE_FILE_LIMIT) throw new ProductError('resources.tooLarge');
  return { storage: 'file', mimeType: resourceMime(file.name, file.type), extension: /^[a-z0-9][a-z0-9.+-]{0,23}$/.test(resourceExtension(file.name)) ? resourceExtension(file.name) : '', type: profile };
}
function baseName(name: string, extension: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').at(-1) ?? '';
  let base = sanitizeAssetBaseName(extension && leaf.toLowerCase().endsWith('.' + extension) ? leaf.slice(0, -(extension.length + 1)) : leaf, 'file');
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = 'file-' + base;
  return base;
}
export function planResourceFileName(originalName: string, storage: ResourceStorage): { fileName: string; reference: string } {
  const extension = /^[a-z0-9][a-z0-9.+-]{0,23}$/.test(resourceExtension(originalName)) ? resourceExtension(originalName) : storage === 'image' ? 'img' : '';
  const fileName = Array.from(baseName(originalName, extension)).slice(0, 48).join('') + '-' + crypto.randomUUID().replace(/-/g, '') + (extension ? '.' + extension : '');
  return { fileName, reference: resourceReference(storage, fileName) };
}
function asset(root: FileSystemDirectoryHandle, destination: ResourceDestination, file: ResourceFile): LibraryResourceAsset {
  return destination.kind === 'shared' ? { ...file, root, kind: 'shared' } : { ...file, root, kind: 'article', articleId: destination.articleId, month: destination.month, folder: destination.folder, articleTitle: destination.title };
}
export function resourceAssetKey(value: LibraryResourceAsset): string { return libraryMediaAssetKey(value); }
export function resourceAssetReference(value: LibraryResourceAsset): string { return resourceReference(value.storage, value.fileName, value.kind === 'shared'); }

// Serialize only filename reservation. Independent resource payloads can write concurrently.
const reservations = new WeakMap<FileSystemDirectoryHandle, ReturnType<typeof createArticleMutationQueue>>();
async function reserveResource(root: FileSystemDirectoryHandle, destination: ResourceDestination, storage: ResourceStorage, requestedName: string, isCurrent: () => boolean, uniqueBase?: string, guard?: ArticleWriteGuard) {
  destination = destinationSnapshot(destination);
  let queue = reservations.get(root);
  if (!queue) { queue = createArticleMutationQueue(); reservations.set(root, queue); }
  return queue.run(async () => {
    await ready(root, isCurrent);
    const directory = (await getResourceDirectory(root, destination, storage, true, isCurrent, guard))!;
    const fileName = uniqueBase === undefined ? requestedName : await uniqueAssetFileName(directory, uniqueBase, requestedName, ['index.json']);
    if (!validResourceLeaf(fileName) || fold(fileName) === 'index.json') throw new ProductError('resources.unsafeName');
    for await (const [name] of directory.entries()) if (fold(name) === fold(fileName)) throw new ProductError('resources.exists', { name: fileName });
    await ready(root, isCurrent);
    const path = [...destinationPath(destination), storage];
    await owned(root, directory, path);
    await guard?.(directory, path);
    const handle = await directory.getFileHandle(fileName, { create: true });
    await owned(root, handle, [...path, fileName]);
    await guard?.(handle, [...path, fileName]);
    return { directory, fileName, handle, path, destination };
  });
}
async function writeReservedResource(root: FileSystemDirectoryHandle, target: Awaited<ReturnType<typeof reserveResource>>, blob: Blob, isCurrent: () => boolean): Promise<FileSystemFileHandle> {
  const { directory, fileName, handle, path } = target;
  let writer: FileSystemWritableFileStream | null = null;
  const check = async () => {
    await ready(root, isCurrent); await owned(root, directory, path); await owned(root, handle, [...path, fileName]);
    if (!await handle.isSameEntry(await directory.getFileHandle(fileName))) throw new ProductError('resources.changed');
  };
  try {
    await check(); writer = await handle.createWritable(); await writer.write(blob);
    await check(); await writer.close();
    if ((await handle.getFile()).size !== blob.size) throw new ProductError('resources.incomplete');
    await ready(root, isCurrent); return handle;
  } catch (error) {
    try { await writer?.abort(); } catch { /* preserve original failure */ }
    try { await check(); await directory.removeEntry(fileName); } catch { /* never clean a stale, replaced or unauthorized target */ }
    throw error;
  }
}
export async function writeResourceBlob(root: FileSystemDirectoryHandle, destination: ResourceDestination, storage: ResourceStorage, fileName: string, blob: Blob, isCurrent: () => boolean): Promise<FileSystemFileHandle> {
  if (!validResourceLeaf(fileName) || fold(fileName) === 'index.json') throw new ProductError('resources.unsafeName');
  if (!Number.isSafeInteger(blob.size) || blob.size < 0 || (storage === 'file' && blob.size > RESOURCE_FILE_LIMIT)) throw new ProductError('resources.tooLarge');
  if (storage === 'image') await inspectArticleImage(blob);
  const target = await reserveResource(root, destination, storage, fileName, isCurrent);
  return writeReservedResource(root, target, blob, isCurrent);
}

/** Copy bounded chunks without retaining the payload. The final name was already placed in the manuscript. */
export async function writeResourceStream(root: FileSystemDirectoryHandle, destination: ResourceDestination, storage: ResourceStorage, fileName: string, stream: ReadableStream<Uint8Array>, options: {
  isCurrent: () => boolean; signal: AbortSignal; expectedBytes?: number; guard?: ArticleWriteGuard; onProgress?: (bytes: number) => void;
  onReserved?: (handle: FileSystemFileHandle) => Promise<void>;
}): Promise<FileSystemFileHandle> {
  const { isCurrent, signal, expectedBytes, guard } = options;
  const maximum = storage === 'file' ? RESOURCE_FILE_LIMIT : Number.MAX_SAFE_INTEGER;
  const checkSignal = () => { if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError'); };
  const reader = stream.getReader(); let writer: FileSystemWritableFileStream | null = null;
  let target: Awaited<ReturnType<typeof reserveResource>> | null = null, received = 0;
  let manuscript: FileSystemFileHandle | null = null;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const readChunk = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProductError('imports.resourceTimeout')), 30000); })]); }
    finally { clearTimeout(timer); }
  };
  const check = async (allowCancelled = false) => {
    if (!allowCancelled) checkSignal();
    await ready(root, isCurrent);
    if (!target) return;
    const { directory, handle, path } = target;
    await owned(root, directory, path); await owned(root, handle, [...path, fileName]);
    if (!await handle.isSameEntry(await directory.getFileHandle(fileName))) throw new ProductError('resources.changed');
    await guard?.(directory, path); await guard?.(handle, [...path, fileName]);
    if (destination.kind === 'article' && manuscript) {
      const folder = await getStoredArticleDirectory(root, destination.month, destination.folder, { requestPermission: false });
      if (!await manuscript.isSameEntry(await folder.getFileHandle('article.md'))) throw new ProductError('resources.changed');
    }
    if (!allowCancelled) checkSignal();
  };
  try {
    checkSignal();
    if (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maximum)) throw new ProductError('resources.tooLarge');
    let header = new Uint8Array(0), inspected = storage !== 'image';
    const buffered: Uint8Array[] = [];
    // At most 32 bytes are retained for signature detection; response chunks are not accumulated.
    while (!inspected) {
      const next = await readChunk(); checkSignal();
      if (next.done) { await inspectArticleImage(new Blob([header])); inspected = true; break; }
      if (!(next.value instanceof Uint8Array)) throw new ProductError('resources.incomplete');
      if (!next.value.length) continue;
      const amount = Math.min(32 - header.length, next.value.length), combined = new Uint8Array(header.length + amount);
      combined.set(header); combined.set(next.value.subarray(0, amount), header.length); header = combined;
      buffered.push(next.value);
      if (header.length >= 32) { await inspectArticleImage(new Blob([header])); inspected = true; }
    }
    await check();
    target = await reserveResource(root, destination, storage, fileName, isCurrent, undefined, guard);
    await options.onReserved?.(target.handle);
    if (destination.kind === 'article') manuscript = await (await getStoredArticleDirectory(root, destination.month, destination.folder, { requestPermission: false })).getFileHandle('article.md');
    await check(); writer = await target.handle.createWritable();
    const write = async (value: Uint8Array) => {
      if (!(value instanceof Uint8Array) || !Number.isSafeInteger(received + value.length) || received + value.length > maximum) throw new ProductError('resources.tooLarge');
      for (let offset = 0; offset < value.length; offset += 64 * 1024) {
        await check(); const chunk = value.subarray(offset, offset + 64 * 1024);
        await writer!.write(new Uint8Array(chunk)); received += chunk.length; options.onProgress?.(received);
      }
    };
    for (const value of buffered) await write(value); buffered.length = 0;
    while (true) { const next = await readChunk(); checkSignal(); if (next.done) break; await write(next.value); }
    if (expectedBytes !== undefined && received !== expectedBytes) throw new ProductError('resources.incomplete');
    await check(); await writer.close();
    if ((await target.handle.getFile()).size !== received) throw new ProductError('resources.incomplete');
    await check(); return target.handle;
  } catch (error) {
    try { await writer?.abort(); } catch { /* preserve primary failure */ }
    if (target) try { await check(true); await target.directory.removeEntry(fileName); } catch { /* never remove stale, replaced or unauthorized files */ }
    throw error;
  } finally { signal.removeEventListener('abort', cancel); try { await reader.cancel(); } catch { /* already closed */ } reader.releaseLock(); }
}
export async function importResourceFile(root: FileSystemDirectoryHandle, destination: ResourceDestination, file: File, isCurrent: () => boolean = () => true): Promise<LibraryResourceAsset> {
  destination = destinationSnapshot(destination);
  const format = await inspectResourceFile(file);
  const target = await reserveResource(root, destination, format.storage, format.extension, isCurrent, baseName(file.name, resourceExtension(file.name)));
  const handle = await writeReservedResource(root, target, file, isCurrent);
  return asset(root, destination, { fileName: target.fileName, mimeType: format.mimeType, size: file.size, handle, storage: format.storage, typeId: format.type.id, preview: format.type.preview });
}

export async function resourceAssetDirectory(source: LibraryMediaAsset, isCurrent: () => boolean): Promise<FileSystemDirectoryHandle> {
  if (source.storage !== 'file') throw new ProductError('resources.unsafeTarget');
  const origin: ResourceDestination = source.kind === 'shared' ? { kind: 'shared' } : { kind: 'article', articleId: source.articleId, month: source.month, folder: source.folder, title: source.articleTitle };
  const directory = await getResourceDirectory(source.root, origin, 'file', false, isCurrent);
  if (!directory) throw new ProductError('resources.changed');
  const path = [...destinationPath(origin), 'file', source.fileName];
  await owned(source.root, source.handle, path);
  if (!await source.handle.isSameEntry(await directory.getFileHandle(source.fileName))) throw new ProductError('resources.changed');
  await ready(source.root, isCurrent); return directory;
}
export async function deleteResourceFile(source: LibraryMediaAsset, isCurrent: () => boolean): Promise<void> {
  const directory = await resourceAssetDirectory(source, isCurrent); await directory.removeEntry(source.fileName);
}
export async function copyResourceFileAs(source: LibraryMediaAsset, destination: ResourceDestination, name: string, isCurrent: () => boolean, replacement?: File): Promise<LibraryResourceAsset> {
  await resourceAssetDirectory(source, isCurrent);
  const file = replacement ?? await source.handle.getFile();
  if (file.size > RESOURCE_FILE_LIMIT) throw new ProductError('resources.tooLarge');
  const extension = resourceExtension(replacement?.name ?? source.fileName);
  let base = name.trim().normalize('NFKC'); if (extension && base.toLowerCase().endsWith('.' + extension)) base = base.slice(0, -(extension.length + 1));
  if (!validResourceLeaf(base + (extension ? '.' + extension : ''))) throw new ProductError('resources.unsafeName');
  const target = await reserveResource(source.root, destination, 'file', extension, isCurrent, base);
  const handle = await writeReservedResource(source.root, target, file, isCurrent), type = resourceType(target.fileName, file.type);
  return asset(source.root, destination, { fileName: target.fileName, handle, size: file.size, mimeType: resourceMime(target.fileName, file.type), storage: 'file', typeId: type.id, preview: 'none' });
}

export async function listResourceAssets(root: FileSystemDirectoryHandle, destination: ResourceDestination, isCurrent: () => boolean = () => true, onMetadataIssue?: (error: unknown) => void): Promise<LibraryResourceAsset[]> {
  destination = destinationSnapshot(destination);
  const result: LibraryResourceAsset[] = [];
  const metadataFor = async (directory: FileSystemDirectoryHandle) => {
    try { return await readMediaMetadata(directory); }
    catch (error) {
      if (!onMetadataIssue || !(error instanceof SyntaxError || error instanceof ProductError && error.messageKey === 'mediaManagement.theAssetIndexJsonIsInvalidTheOriginalFileIsRetained')) throw error;
      onMetadataIssue(error); return { version: 1, images: {} as Record<string, { description?: string }> };
    }
  };
  const images = await getResourceDirectory(root, destination, 'image', false, isCurrent);
  if (images) {
    const path = [...destinationPath(destination), 'image'];
    try { await owned(root, await images.getFileHandle('index.json'), [...path, 'index.json']); } catch (error) { if (!missing(error)) throw error; }
    const metadata = await metadataFor(images);
    for await (const [fileName, entry] of images.entries()) {
      if (entry.kind !== 'file' || fold(fileName) === 'index.json' || !validResourceLeaf(fileName)) continue;
      await ready(root, isCurrent);
      const handle = await images.getFileHandle(fileName); await owned(root, handle, [...path, fileName]); const file = await handle.getFile();
      try {
        const format = await inspectArticleImage(file);
        result.push(asset(root, destination, { fileName, mimeType: format.mimeType, size: file.size, lastModified: file.lastModified, handle, storage: 'image', typeId: 'image', preview: 'image', description: metadata.images[fileName]?.description }));
      } catch (error) { if (!(error instanceof ProductError) || error.messageKey !== 'articleMedia.fileContentCouldNotBeIdentifiedAsSupportedPngJpegGifWebp') throw error; }
    }
  }
  const files = await getResourceDirectory(root, destination, 'file', false, isCurrent);
  if (files) {
    try { await owned(root, await files.getFileHandle('index.json'), [...destinationPath(destination), 'file', 'index.json']); } catch (error) { if (!missing(error)) throw error; }
    const metadata = await metadataFor(files);
    for await (const [fileName, entry] of files.entries()) {
    if (entry.kind !== 'file' || fold(fileName) === 'index.json' || !validResourceLeaf(fileName)) continue;
    await ready(root, isCurrent);
    const handle = await files.getFileHandle(fileName); await owned(root, handle, [...destinationPath(destination), 'file', fileName]); const file = await handle.getFile();
    const type = resourceType(fileName, file.type);
    result.push(asset(root, destination, { fileName, mimeType: resourceMime(fileName, file.type), size: file.size, lastModified: file.lastModified, handle, storage: 'file', typeId: type.id, preview: 'none', description: metadata.images[fileName]?.description }));
  } }
  await ready(root, isCurrent);
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true }) || a.storage.localeCompare(b.storage));
}
