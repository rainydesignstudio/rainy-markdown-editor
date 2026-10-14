import { ProductError } from '../i18n/productMessages';
import { getResourceDirectory, type ResourceDestination } from './storage';

export async function readLinkedResource(root: FileSystemDirectoryHandle, destination: ResourceDestination, fileName: string, current: () => boolean): Promise<File> {
  const directory = await getResourceDirectory(root, destination, 'file', false, current);
  if (!directory) throw new DOMException('Missing resource directory', 'NotFoundError');
  const handle = await directory.getFileHandle(fileName), path = await root.resolve(handle);
  const expected = destination.kind === 'shared' ? ['shared', 'file', fileName] : ['articles', destination.month, destination.folder, 'media', 'file', fileName];
  if (path?.join('/') !== expected.join('/')) throw new ProductError('resources.unsafeTarget');
  const file = await handle.getFile(); if (!current()) throw new ProductError('resources.changed'); return file;
}
