import { ProductError, productCause, productMessage, productReference, productText } from "./i18n/productMessages";
import { articleImageReferences, articleLocalImageReferences, copyArticleImageAs, getSharedImageDirectory, importArticleImage, type LibraryMediaAsset, type MediaActionOutcome } from './articleMedia';
import { getArticleMediaDirectory, getStoredArticleDirectory } from './fileSystem';
import { listArticleHistory } from './articleHistory';
import type { ArticleFormatIssue } from './articleFormat';
import { getResourceDirectory, copyResourceFileAs, deleteResourceFile } from './resources/storage';
import { resourceReferences } from './resources/references';
import { parseArticle } from './frontMatter';
import { queryDirectoryReadWritePermission } from './directoryBookmark';

export type MediaDestination = { kind: 'shared' } | { kind: 'article'; articleId: string; month: string; folder: string; title: string };
export type MediaEditRequest = { type: 'rename' | 'replace' | 'describe' | 'delete' | 'transfer'; assets: LibraryMediaAsset[] };
export type MediaMutation = MediaEditRequest & { name?: string; file?: File; description?: string; destination?: MediaDestination };
export type MediaUsage = { body: number; history: number; issues: string[] };
export type MediaReferenceDocument = { source: string; month: string | null; folder: string | null };
export type MediaReferenceScan = { current: number | null; workspace: number; issues: string[] };
type Metadata = { version: 1; images: Record<string, { description?: string; [key: string]: unknown }>; [key: string]: unknown };
const missing = (error: unknown) => Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError');
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function mediaPath(asset: LibraryMediaAsset): string {
  const storage = asset.storage ?? 'image';
  return asset.kind === 'shared' ? `/shared/${storage}/${asset.fileName}` : `/articles/${asset.month}/${asset.folder}/media/${storage}/${asset.fileName}`;
}
function referencePath(url: string, month: string | null, folder: string | null): string | null {
  url = url.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  if (/^[a-z][a-z\d+.-]*:|^\/\/|[\\\u0000-\u001f]/i.test(url)) return null;
  try {
    const base = month && folder ? `/articles/${encodeURIComponent(month)}/${encodeURIComponent(folder)}/` : '/';
    const path = new URL(url, `https://media-library.invalid${base}`).pathname.split('/').map(decodeURIComponent);
    if (path.some(segment => /[\\/\u0000-\u001f]/.test(segment))) return null;
    return path.join('/');
  } catch { return null; }
}
function countReferences(document: MediaReferenceDocument, targets: ReadonlySet<string>): number {
  const filePath = (path: string) => /\/(?:media|shared)\/file\/[^/]+$/.test(path);
  const images = articleImageReferences(document.source).reduce((count, reference) => { const path = referencePath(reference.url, document.month, document.folder) ?? ''; return count + Number(!filePath(path) && targets.has(path)); }, 0);
  return images + resourceReferences(parseArticle(document.source).body).reduce((count, reference) => { const path = referencePath(reference.url, document.month, document.folder) ?? ''; return count + Number(filePath(path) && targets.has(path)) * (reference.uses ?? 1); }, 0);
}
/** Current draft only: no directory or file reads. Separate article copies have separate paths. */
export function countCurrentMediaReferences(assets: LibraryMediaAsset[], document: MediaReferenceDocument | null): number | null {
  return document ? countReferences(document, new Set(assets.map(mediaPath))) : null;
}
/** One explicit pass for the entire selection; reads source text only, never image bytes or themes. */
export async function scanWorkspaceMediaReferences(root: FileSystemDirectoryHandle, assets: LibraryMediaAsset[], document: MediaReferenceDocument | null, signal: AbortSignal, isCurrent: () => boolean): Promise<MediaReferenceScan> {
  const check = () => { if (signal.aborted) throw new DOMException(productText('mediaManagement.referenceScanCancelled'), 'AbortError'); if (!isCurrent()) throw new ProductError("mediaManagement.theLibraryOrCurrentManuscriptChangedScanAgain"); };
  check();
  if (assets.some(asset => asset.root !== root)) throw new ProductError("mediaManagement.theSelectedImageDoesNotBelongToThisLibrary");
  const targets = new Set(assets.map(mediaPath));
  const result: MediaReferenceScan = { current: document ? countReferences(document, targets) : null, workspace: 0, issues: [] };
  let articles: FileSystemDirectoryHandle;
  try { articles = await root.getDirectoryHandle('articles'); }
  catch (error) { check(); if (missing(error)) return result; throw error; }
  const read = async (directory: FileSystemDirectoryHandle, month: string, folder: string, label: string) => {
    check();
    try {
      const source = await (await (await directory.getFileHandle('article.md')).getFile()).text();
      check(); result.workspace += countReferences({ source, month, folder }, targets);
    } catch (error) { check(); result.issues.push(`${label}：${message(error)}`); }
  };
  for await (const [month, monthEntry] of articles.entries()) {
    check(); if (monthEntry.kind !== 'directory' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
    try {
      const monthDirectory = await articles.getDirectoryHandle(month);
      for await (const [folder, folderEntry] of monthDirectory.entries()) {
        check(); if (folderEntry.kind !== 'directory') continue;
        const label = `${month}/${folder}`;
        try {
          const article = await monthDirectory.getDirectoryHandle(folder);
          await read(article, month, folder, `${label}/article.md`);
          let history: FileSystemDirectoryHandle;
          try { history = await article.getDirectoryHandle('history'); }
          catch (error) { check(); if (!missing(error)) result.issues.push(`${label}/history：${message(error)}`); continue; }
          for await (const [id, entry] of history.entries()) {
            check(); if (entry.kind !== 'directory' || !id.startsWith('snapshot-')) continue;
            try { await read(await history.getDirectoryHandle(id), month, folder, `${label}/history/${id}/article.md`); }
            catch (error) { check(); result.issues.push(`${label}/history/${id}：${message(error)}`); }
          }
        } catch (error) { check(); result.issues.push(`${label}：${message(error)}`); }
      }
    } catch (error) { check(); result.issues.push(`${month}：${message(error)}`); }
  }
  check(); return result;
}

export async function mediaDirectory(asset: LibraryMediaAsset): Promise<FileSystemDirectoryHandle> {
  const directory = asset.storage === 'file' ? await getResourceDirectory(asset.root, asset.kind === 'shared' ? { kind: 'shared' } : { kind: 'article', articleId: asset.articleId, month: asset.month, folder: asset.folder, title: asset.articleTitle }, 'file', false)
    : asset.kind === 'shared' ? await getSharedImageDirectory(asset.root) : await getArticleMediaDirectory(asset.root, asset.month, asset.folder, false);
  if (!directory) throw new ProductError("mediaManagement.theAssetDirectoryDoesNotExist");
  return directory;
}
type MediaMetadataGuard = (handle: FileSystemHandle) => Promise<void>;
export function resourceMetadataGuard(root: FileSystemDirectoryHandle, destination: MediaDestination, current: () => boolean): MediaMetadataGuard {
  const base = destination.kind === 'shared' ? ['shared', 'file'] : ['articles', destination.month, destination.folder, 'media', 'file'];
  return async handle => {
    if (!current()) throw new ProductError('resources.changed');
    if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('resources.libraryRequired');
    const path = await root.resolve(handle), expected = handle.kind === 'directory' ? base : [...base, 'index.json'];
    if (!path || path.join('/') !== expected.join('/')) throw new ProductError('resources.unsafeTarget');
    if (!current()) throw new ProductError('resources.changed');
  };
}
export async function readMediaMetadata(directory: FileSystemDirectoryHandle, guard?: MediaMetadataGuard): Promise<Metadata> {
  let text: string;
  try { await guard?.(directory); const handle = await directory.getFileHandle('index.json'); await guard?.(handle); const file = await handle.getFile(); if (directory.name === 'file' && file.size > 8 * 1024 * 1024) throw new ProductError('mediaManagement.theAssetIndexJsonIsInvalidTheOriginalFileIsRetained'); text = await file.text(); }
  catch (error) { if (missing(error)) return { version: 1, images: {} }; throw error; }
  const data = JSON.parse(text), entries = directory.name === 'file' ? data?.files : data?.images;
  if (!data || data.version !== 1 || !entries || typeof entries !== 'object' || Array.isArray(entries) || Object.values(entries).some((value) => !value || typeof value !== 'object' || Array.isArray(value) || ('description' in value && typeof value.description !== 'string'))) throw new ProductError("mediaManagement.theAssetIndexJsonIsInvalidTheOriginalFileIsRetained");
  return { ...data, images: entries };
}
function mediaMetadataText(directory: FileSystemDirectoryHandle, metadata: Metadata): string {
  if (directory.name !== 'file') return JSON.stringify(metadata, null, 2) + '\n';
  const { images, ...rest } = metadata; return JSON.stringify({ ...rest, files: images }, null, 2) + '\n';
}
export async function saveMediaDescription(directory: FileSystemDirectoryHandle, fileName: string, description: string, isCurrent: () => boolean = () => true, guard?: MediaMetadataGuard): Promise<void> {
  const metadata = await readMediaMetadata(directory, guard);
  if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedTheDescriptionWasNotSaved");
  metadata.images = { ...metadata.images, [fileName]: { ...(Object.hasOwn(metadata.images, fileName) ? metadata.images[fileName] : {}), description } };
  let existed = true;
  try { await directory.getFileHandle('index.json'); } catch (error) { if (missing(error)) existed = false; else throw error; }
  await guard?.(directory); const handle = await directory.getFileHandle('index.json', { create: true }); await guard?.(handle);
  let writer: FileSystemWritableFileStream | null = null;
  try {
    writer = await handle.createWritable();
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedTheDescriptionWasNotSaved");
    await writer.write(mediaMetadataText(directory, metadata));
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedTheDescriptionWasNotSaved");
    await guard?.(handle); await writer.close();
  } catch (error) { try { await writer?.abort(); } catch {} if (!existed) try { if (!isCurrent()) throw error; await guard?.(directory); await guard?.(handle); await directory.removeEntry('index.json'); } catch {} throw error; }
}
export async function removeMediaDescription(directory: FileSystemDirectoryHandle, fileName: string, isCurrent: () => boolean, guard?: MediaMetadataGuard): Promise<void> {
  const metadata = await readMediaMetadata(directory, guard);
  if (!Object.hasOwn(metadata.images, fileName)) return;
  delete metadata.images[fileName];
  if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedTheDescriptionIndexWasNotCleaned");
  const handle = await directory.getFileHandle('index.json'); await guard?.(handle); const writer = await handle.createWritable();
  try { await writer.write(mediaMetadataText(directory, metadata)); if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedTheDescriptionIndexWasNotCleaned"); await guard?.(handle); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch {} throw error; }
}
export async function inspectMediaUsage(asset: LibraryMediaAsset, currentSource?: string): Promise<MediaUsage> {
  if (asset.kind === 'shared') return { body: asset.storage === 'file' && currentSource ? countReferences({ source: currentSource, month: null, folder: null }, new Set([mediaPath(asset)])) : 0, history: 0, issues: [] };
  const source = await (await (await (await getStoredArticleDirectory(asset.root, asset.month, asset.folder)).getFileHandle('article.md')).getFile()).text();
  const count = (text: string) => asset.storage === 'file' ? countReferences({ source: text, month: asset.month, folder: asset.folder }, new Set([mediaPath(asset)])) : articleLocalImageReferences(text).filter(reference => reference.fileName === asset.fileName).length;
  const history = await listArticleHistory(asset.root, asset.month, asset.folder);
  return { body: Math.max(count(source), currentSource === undefined ? 0 : count(currentSource)), history: history.snapshots.reduce((sum, snapshot) => sum + count(snapshot.source), 0), issues: history.issues.map(issue => issue.message) };
}
export async function transferMedia(asset: LibraryMediaAsset, destination: MediaDestination, usage: MediaUsage, isCurrent: () => boolean): Promise<MediaActionOutcome> {
  const targetId = destination.kind === 'shared' ? 'shared' : destination.articleId;
  const originId = asset.kind === 'shared' ? 'shared' : asset.articleId;
  if (originId === targetId) throw new ProductError("mediaManagement.destinationAndSourceAreTheSameNothingWasMoved");
  if (asset.storage === 'file' && asset.kind === 'shared') { const scan = await scanWorkspaceMediaReferences(asset.root, [asset], null, new AbortController().signal, isCurrent); usage = { ...usage, history: usage.history + scan.workspace, issues: [...usage.issues, ...scan.issues] }; }
  if (usage.issues.length) throw new ProductError("mediaManagement.someHistoryCouldNotBeCheckedTheSourceFileIsRetainedRepair");
  const original = await asset.handle.getFile();
  const sourceDirectory = await mediaDirectory(asset);
  const sourceDestination: MediaDestination = asset.kind === 'shared' ? { kind: 'shared' } : { kind: 'article', articleId: asset.articleId, month: asset.month, folder: asset.folder, title: asset.articleTitle };
  const sourceGuard = asset.storage === 'file' ? resourceMetadataGuard(asset.root, sourceDestination, isCurrent) : undefined;
  const targetGuard = asset.storage === 'file' ? resourceMetadataGuard(asset.root, destination, isCurrent) : undefined;
  await readMediaMetadata(sourceDirectory, sourceGuard);
  if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedNothingWasMoved");
  const target = asset.storage === 'file' ? await getResourceDirectory(asset.root, destination, 'file', true, isCurrent) : destination.kind === 'shared' ? await getSharedImageDirectory(asset.root, true) : await getArticleMediaDirectory(asset.root, destination.month, destination.folder, true);
  if (target) await readMediaMetadata(target, targetGuard);
  if (!target || !isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedNothingWasMoved");
  const copied = asset.storage === 'file' ? await copyResourceFileAs(asset, destination, asset.fileName, isCurrent) : await importArticleImage(target, new File([original], asset.fileName, { type: original.type }));
  let removed = false;
  try {
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChanged");
    if (asset.description) await saveMediaDescription(target, copied.fileName, asset.description, isCurrent, targetGuard);
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChanged");
    if (usage.body || usage.history) return { ok: true, tone: 'warning', ...productMessage("mediaManagement.copiedTheSourceIsReferencedByTheBodyOrHistoryAndIs", { "copiedFileName": copied.fileName }) };
    if (asset.storage === 'file') await deleteResourceFile(asset, isCurrent); else await sourceDirectory.removeEntry(asset.fileName); removed = true;
    await removeMediaDescription(sourceDirectory, asset.fileName, isCurrent, sourceGuard);
    return { ok: true, tone: 'success', ...productMessage("mediaManagement.moved", { "copiedFileName": copied.fileName }) };
  } catch (error) { return { ok: false, tone: 'warning', ...productMessage("mediaManagement.destinationWasWritten", { "copiedFileName": copied.fileName, "value": message(error), "value2": (removed ? productReference("mediaManagement.theSourceFileWasDeletedButTheDescriptionIndexWasNotCleaned") : productReference("mediaManagement.theSourceFileIsRetained")) }) }; }
}
export async function renameSharedMedia(asset: LibraryMediaAsset, name: string, isCurrent: () => boolean, replacement?: File, currentDocument: MediaReferenceDocument | null = null): Promise<MediaActionOutcome> {
  const directory = await mediaDirectory(asset);
  const guard = asset.storage === 'file' ? resourceMetadataGuard(asset.root, { kind: 'shared' }, isCurrent) : undefined;
  await readMediaMetadata(directory, guard);
  if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChangedNothingWasWritten");
  const created = asset.storage === 'file' ? await copyResourceFileAs(asset, { kind: 'shared' }, name, isCurrent, replacement) : replacement ? await importArticleImage(directory, new File([replacement], `${asset.fileName.replace(/\.[^.]+$/, '')}.${replacement.name.split('.').at(-1) ?? 'png'}`)) : await copyArticleImageAs(directory, asset.handle, name);
  let removed = false;
  try {
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChanged");
    if (asset.description) await saveMediaDescription(directory, created.fileName, asset.description, isCurrent, guard);
    if (!isCurrent()) throw new ProductError("mediaManagement.theLibrarySessionChanged");
    if (asset.storage === 'file') {
      const scan = await scanWorkspaceMediaReferences(asset.root, [asset], currentDocument, new AbortController().signal, isCurrent);
      if (scan.workspace || scan.current || scan.issues.length) return { ok: true, tone: 'warning', ...productMessage('resources.sharedOriginalRetained', { name: created.fileName }) };
      await deleteResourceFile(asset, isCurrent);
    } else await directory.removeEntry(asset.fileName);
    removed = true;
    await removeMediaDescription(directory, asset.fileName, isCurrent, guard);
    return { ok: true, tone: 'success', ...productMessage("mediaManagement.imageOperationCompletedTheIndependentArticleCopyIsUnchanged", { "value": (replacement ? productReference("mediaManagement.replacedWith") : productReference("mediaManagement.renamedTo")), "createdFileName": created.fileName }) };
  } catch (error) { return { ok: false, tone: 'warning', ...productMessage("mediaManagement.newFileWasSaved", { "createdFileName": created.fileName, "value": message(error), "value2": (removed ? productReference("mediaManagement.theOriginalFileWasDeletedButTheDescriptionIndexWasNotCleaned") : productReference("mediaManagement.theOriginalFileIsRetained")) }) }; }
}
export async function inspectLocalArticleImages(source: string, root: FileSystemDirectoryHandle | null, month: string | null, folder: string | null): Promise<ArticleFormatIssue[]> {
  const references = articleLocalImageReferences(source);
  if (!references.length) return [];
  const grouped = new Map<string, number[]>();
  for (const reference of references) grouped.set(reference.fileName, [...(grouped.get(reference.fileName) ?? []), reference.line]);
  let directory: FileSystemDirectoryHandle | null = null, directoryError: unknown = null;
  if (root && month && folder) { try { directory = await (await (await (await root.getDirectoryHandle('articles')).getDirectoryHandle(month)).getDirectoryHandle(folder)).getDirectoryHandle('media').then(media => media.getDirectoryHandle('image')); } catch (error) { directoryError = error; } }
  const issues: ArticleFormatIssue[] = [];
  for (const [fileName, lines] of grouped) {
    let error: unknown = directoryError;
    if (directory) { try { await (await directory.getFileHandle(fileName)).getFile(); continue; } catch (cause) { error = cause; } }
    const absent = Boolean(root && month && folder && missing(error));
    issues.push({ kind: 'element', name: `本地图片 ${fileName}`, source: '当前文章正文', tier: absent ? 'danger' : 'conditional', line: lines[0], lines: [...new Set(lines)], ...productMessage(absent ? 'diagnostic.imageMissing' : 'diagnostic.imageUnconfirmed', { fileName, cause: error ? productCause(error) : productReference('diagnostic.articleNotSaved') }), domain: 'product', resourceSource: 'media/image/' + fileName });
  }
  return issues;
}
