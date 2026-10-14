import { ProductError, productJoin, productReference, productText } from "./i18n/productMessages";
import { getStoredArticleDirectory } from './fileSystem';
import { readRenderRecord, renderRecordMatches } from './article-format/renderRecords';
import { readLibraryFile, contentHash } from './article-format/styles';
import { parseArticle } from './frontMatter';

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

export async function createArticleDocumentPackage(source: string, root: FileSystemDirectoryHandle, month: string | null, folder: string | null): Promise<{ blob: Blob; mediaFiles: number }> {
  const entries: Record<string, Uint8Array> = {
    'article.md': new TextEncoder().encode(source),
    'media/': new Uint8Array(),
  };
  let totalBytes = entries['article.md'].byteLength;
  let mediaFiles = 0;
  const collect = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const [rawName, entry] of directory.entries()) {
      const name = safeArchiveName(rawName);
      const path = `${prefix}${name}`;
      if (entry.kind === 'directory') {
        entries[`${path}/`] = new Uint8Array();
        await collect(await directory.getDirectoryHandle(name), `${path}/`);
      } else {
        const file = await (await directory.getFileHandle(name)).getFile();
        totalBytes += file.size;
        if (totalBytes > MAX_PACKAGE_BYTES) throw new ProductError("articleExport.theDocumentPackageExceeds256MbAndCannotBeGeneratedCompletelyIn");
        entries[path] = new Uint8Array(await file.arrayBuffer());
        mediaFiles += 1;
      }
    }
  };
  if (month && folder) {
    const articleDirectory = await getStoredArticleDirectory(root, month, folder);
    const include = async (name: string, file: Blob) => {
      totalBytes += file.size;
      if (totalBytes > MAX_PACKAGE_BYTES) throw new ProductError("articleExport.theDocumentPackageExceeds256MbAndWasNotGenerated");
      entries[name] = new Uint8Array(await file.arrayBuffer());
    };
    try { await include('theme.json', await (await articleDirectory.getFileHandle('theme.json')).getFile()); }
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
    if (mediaDirectory) await collect(mediaDirectory, 'media/');
  }
  const { zip } = await import('fflate');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => error ? reject(error) : resolve(data));
  });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), mediaFiles };
}
