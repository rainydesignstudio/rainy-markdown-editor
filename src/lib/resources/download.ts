import { ProductError } from '../i18n/productMessages';
import { getResourceDirectory, type ResourceDestination } from './storage';
import { localResourceReference } from './references';
import { currentImportResource } from './inspection';
import { productCause } from '../i18n/productMessages';
import type { ArticleMediaContext } from '../article-format/MarkdownPreview';

export async function readCurrentLinkedResource(href: string, media: ArticleMediaContext | null): Promise<{ file: File; name: string }> {
  const local = localResourceReference(href), id = media?.article?.id ?? 'draft';
  if (!local || local.storage !== 'file' || !media?.root || !media.isCurrent() || !local.shared && !media.article) throw new ProductError('resources.linkUnavailable');
  const latest = await currentImportResource(media.root, id, href, media.isCurrent);
  if (latest?.state === 'pending' || latest?.state === 'running') throw new ProductError('resources.importPending', { name: local.fileName });
  if (latest?.state === 'failed' || latest?.state === 'cancelled') throw new ProductError('resources.importFailed', { name: local.fileName, cause: latest.error ? productCause(latest.error) : '' });
  const destination = local.shared ? { kind: 'shared' as const } : { kind: 'article' as const, articleId: media.article!.id, month: media.article!.month, folder: media.article!.folder, title: media.articleTitle };
  return { file: await readLinkedResource(media.root, destination, local.fileName, media.isCurrent), name: local.fileName };
}

export async function readLinkedResource(root: FileSystemDirectoryHandle, destination: ResourceDestination, fileName: string, current: () => boolean): Promise<File> {
  const directory = await getResourceDirectory(root, destination, 'file', false, current);
  if (!directory) throw new DOMException('Missing resource directory', 'NotFoundError');
  const handle = await directory.getFileHandle(fileName), path = await root.resolve(handle);
  const expected = destination.kind === 'shared' ? ['shared', 'file', fileName] : ['articles', destination.month, destination.folder, 'media', 'file', fileName];
  if (path?.join('/') !== expected.join('/')) throw new ProductError('resources.unsafeTarget');
  const file = await handle.getFile(); if (!current()) throw new ProductError('resources.changed'); return file;
}
