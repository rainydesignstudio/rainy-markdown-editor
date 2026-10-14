import { ProductError, productJoin, productReference, productText } from "./i18n/productMessages";
import { getStoredArticleDirectory } from './fileSystem';
import { readRenderRecord, renderRecordMatches } from './article-format/renderRecords';
import { readLibraryFile, contentHash } from './article-format/styles';
import { parseArticle } from './frontMatter';
import { localResourceReference, resourceReferences } from './resources/references';
import { inspectArticleResources } from './resources/inspection';
import { resourceSessionReady, unfinishedResourceReferences } from './resources/state';
import { loadImportTaskRecords } from './imports/store';
import { resourceReference } from './resources/types';

export function articleMarkdownBody(source: string): string {
  const parsed = parseArticle(source);
  if (!parsed.canCopy) throw new ProductError("articleExport.metadataBoundariesOrContentAreInvalidTheMarkdownBodyCannotBeExtracted");
  return parsed.body;
}

const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;

export function articleExportBaseName(title: string): string {
  const name = title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ').replace(/^[. -]+|[. -]+$/g, '');
  return Array.from(name).slice(0, 80).join('') || 'article';
}

export function downloadArticleBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeArchiveName(name: string): string {
  if (!name || name === '.' || name === '..' || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw new ProductError("articleExport.unsafeResourceFilenameTheDocumentPackageWasNotGenerated", { "value": (name || productReference("articleExport.emptyName")) });
  }
  return name;
}

export async function createArticleDocumentPackage(source: string, root: FileSystemDirectoryHandle, month: string | null, folder: string | null, options: { isCurrent?: () => boolean; signal?: AbortSignal; exclude?: ReadonlySet<string>; allowIncomplete?: boolean } = {}): Promise<{ blob: Blob; mediaFiles: number }> {
  const check = () => { options.signal?.throwIfAborted(); if (options.isCurrent?.() === false) throw new ProductError('resources.changedDuringOutput'); };
  const owned = async (handle: FileSystemHandle, path: string[]) => { check(); const actual = await root.resolve(handle); if (actual?.join('/') !== path.join('/')) throw new ProductError('resources.unsafeTarget'); check(); };
  check();
  const issues = await inspectArticleResources(parseArticle(source).body, { root, month, folder }, { signal: options.signal, isCurrent: options.isCurrent, output: true });
  if (issues.some(issue => issue.resourceSource) && !options.allowIncomplete) throw new ProductError('resources.packageIncomplete');
  const excluded = new Set(options.exclude);
  for (const issue of issues) {
    if (!issue.resourceSource || issue.messageKey === 'resources.imageInFileStorage') continue;
    const local = localResourceReference(issue.resourceSource); if (local) excluded.add(resourceReference(local.storage, local.fileName, local.shared).replace(/^\//, ''));
  }
  if (month && folder) {
    const id = `${month}/${folder}`;
    if (resourceSessionReady(root)) for (const ref of unfinishedResourceReferences(root, id)) excluded.add(ref);
    else {
      const records = await loadImportTaskRecords(root, () => options.isCurrent?.() !== false && !options.signal?.aborted);
      for (const task of records.tasks) if (task.target.articleId === id) for (const resource of task.resources) if (resource.state !== 'complete') excluded.add(resource.reference);
    }
  }
  check();
  const entries: Record<string, Uint8Array> = {
    'article.md': new TextEncoder().encode(source),
    'media/': new Uint8Array(),
  };
  let totalBytes = entries['article.md'].byteLength;
  let mediaFiles = 0;
  const collect = async (directory: FileSystemDirectoryHandle, prefix: string, origin: string[]): Promise<void> => {
    await owned(directory, origin);
    for await (const [rawName, entry] of directory.entries()) {
      const name = safeArchiveName(rawName);
      const path = `${prefix}${name}`;
      if (excluded.has(path)) continue;
      if (entry.kind === 'directory') {
        entries[`${path}/`] = new Uint8Array();
        await collect(await directory.getDirectoryHandle(name), `${path}/`, [...origin, name]);
      } else {
        const handle = await directory.getFileHandle(name); await owned(handle, [...origin, name]); const file = await handle.getFile();
        totalBytes += file.size;
        if (totalBytes > MAX_PACKAGE_BYTES) throw new ProductError("articleExport.theDocumentPackageExceeds256MbAndCannotBeGeneratedCompletelyIn");
        entries[path] = new Uint8Array(await file.arrayBuffer());
        check();
        mediaFiles += 1;
      }
    }
  };
  if (month && folder) {
    const articleDirectory = await getStoredArticleDirectory(root, month, folder, { requestPermission: false });
    await owned(articleDirectory, ['articles', month, folder]);
    const include = async (name: string, file: Blob) => {
      totalBytes += file.size;
      if (totalBytes > MAX_PACKAGE_BYTES) throw new ProductError("articleExport.theDocumentPackageExceeds256MbAndWasNotGenerated");
      entries[name] = new Uint8Array(await file.arrayBuffer());
      check();
    };
    try { const theme = await articleDirectory.getFileHandle('theme.json'); await owned(theme, ['articles', month, folder, 'theme.json']); await include('theme.json', await theme.getFile()); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
    const record = await readRenderRecord(articleDirectory);
    if (record) {
      const theme = JSON.parse(await (await articleDirectory.getFileHandle('theme.json')).getFile().then(file => file.text()));
      if (!await renderRecordMatches(record, source, theme)) throw new ProductError("articleExport.theRenderRecordDoesNotMatchTheSourceBeingExportedUpdateStyles");
      const manifestPath = 'styles/.versions/' + record.environmentHash + '/manifest.json';
      const manifest = await readLibraryFile(root, manifestPath);
      if (await contentHash(await manifest.text()) !== record.environmentHash) throw new ProductError("articleExport.renderVersionManifestVerificationFailedTheDocumentPackageWasNotGenerated");
      await include('render.json', new Blob([JSON.stringify(record)]));
      await include(manifestPath, manifest);
      for (const asset of record.assets) {
        const name = 'assets/.objects/' + asset.hash;
        if (entries[name]) continue;
        const file = await readLibraryFile(root, name);
        if (await contentHash(file) !== asset.hash) throw new ProductError('shared.compose', { parts: productJoin([productReference("articleExport.renderResourceIsMissingOrDamaged"), asset.path]) });
        await include(name, file);
      }
    }
    let mediaDirectory: FileSystemDirectoryHandle | null = null;
    try {
      mediaDirectory = await articleDirectory.getDirectoryHandle('media');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    if (mediaDirectory) await collect(mediaDirectory, 'media/', ['articles', month, folder, 'media']);
  }
  // Explicit shared references travel with the package; no source library index or tasks are included.
  const shared = new Map<string, NonNullable<ReturnType<typeof localResourceReference>>>();
  for (const ref of resourceReferences(parseArticle(source).body)) { const local = localResourceReference(ref.url); if (local?.shared) shared.set(local.storage + '/' + local.fileName, local); }
  for (const [name, ref] of shared) {
    const archivePath = 'shared/' + name; if (excluded.has(archivePath)) continue;
    const directory = await root.getDirectoryHandle('shared'); await owned(directory, ['shared']);
    const storage = await directory.getDirectoryHandle(ref.storage); await owned(storage, ['shared', ref.storage]);
    const handle = await storage.getFileHandle(ref.fileName); await owned(handle, ['shared', ref.storage, ref.fileName]);
    const file = await handle.getFile(); totalBytes += file.size;
    if (totalBytes > MAX_PACKAGE_BYTES) throw new ProductError('articleExport.theDocumentPackageExceeds256MbAndWasNotGenerated');
    entries[archivePath] = new Uint8Array(await file.arrayBuffer()); check(); mediaFiles++;
  }
  check();
  const { zip } = await import('fflate');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => error ? reject(error) : resolve(data));
  });
  check();
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), mediaFiles };
}
