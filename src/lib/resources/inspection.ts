import { ProductError, productCause, productMessage, productText } from '../i18n/productMessages';
import type { ArticleFormatIssue } from '../articleFormat';
import { resourceReferences, localResourceReference, resourceReferenceIntent, unsupportedResourceReferences } from './references';
import { resourceState, resourceSessionReady, importedResourceDiagnostics } from './state';
import { loadImportTaskRecords } from '../imports/store';
import { getResourceDirectory } from './storage';
import { inspectArticleImage } from '../articleMedia';
import type { ImportResource } from '../imports/model';
import { resourceReference } from './types';
import { parseKnowledgeText } from '../knowledge/parse';

export type ResourceProbeCache = Map<string, { version: string; issue: 'missing' | 'unconfirmed' | 'invalid' | null; cause?: unknown }>;
type Media = { root: FileSystemDirectoryHandle | null; month: string | null; folder: string | null };
export async function currentImportResource(root: FileSystemDirectoryHandle, id: string, url: string, current: () => boolean) {
  if (resourceSessionReady(root)) return resourceState(root, id, url);
  const local = localResourceReference(url); if (!local || local.shared) return null;
  const records = await loadImportTaskRecords(root, current);
  if (!current()) throw new ProductError('resources.changed');
  const reference = resourceReference(local.storage, local.fileName);
  return records.tasks.find(task => task.target.articleId === id && task.resources.some(resource => resource.reference === reference))?.resources.find(resource => resource.reference === reference) ?? null;
}
export async function inspectArticleResources(body: string, media: Media, options: {
  includeImages?: boolean; readTasks?: boolean; signal?: AbortSignal; isCurrent?: () => boolean;
  cache?: ResourceProbeCache; cacheScope?: string;
  output?: boolean;
} = {}): Promise<ArticleFormatIssue[]> {
  const refs = resourceReferences(body), result: ArticleFormatIssue[] = [], id = media.month && media.folder ? `${media.month}/${media.folder}` : 'draft';
  const current = () => !options.signal?.aborted && options.isCurrent?.() !== false;
  const check = () => { options.signal?.throwIfAborted(); if (!current()) throw new ProductError('resources.changed'); };
  const disk = new Map<string, ImportResource>();
  const unsupported = unsupportedResourceReferences(body);
  let diagnostics = media.root ? importedResourceDiagnostics(media.root, id) : [];
  if (media.root && options.readTasks !== false && !resourceSessionReady(media.root) && (unsupported.length || refs.some(ref => localResourceReference(ref.url)))) {
    try {
      const records = await loadImportTaskRecords(media.root, current); check();
      for (const task of records.tasks) if (task.target.articleId === id) for (const resource of task.resources) disk.set(resource.reference, resource);
      diagnostics = records.tasks.filter(task => task.target.articleId === id).flatMap(task => task.diagnostics);
    } catch { check(); /* actual per-file checks still report unconfirmed permission or paths */ }
  }
  for (const item of unsupported) if (diagnostics.some(issue => issue.reason === 'unsupported-embedded' && issue.source === item.source)) result.push({ kind: 'element', name: productText('resources.referenceName'), source: '当前文章正文', tier: 'conditional', line: item.line, ...productMessage('resources.embeddedNotImported', { source: item.source }), domain: 'product', resourceSource: item.source });
  if (options.output) for (const link of parseKnowledgeText(body, 'article.md').links) {
    if (localResourceReference(link.target) || link.kind !== 'wiki' && (!/\.(?:md|markdown)(?:[?#]|$)/i.test(link.target) || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(link.target))) continue;
    result.push({ kind: 'element', name: productText('resources.documentLinkName'), source: '当前文章正文', tier: 'conditional', line: link.line, ...productMessage('resources.documentLinkNotCarried', { target: link.target }), domain: 'product', resourceSource: link.target });
  }
  const grouped = new Map<string, typeof refs>();
  for (const ref of refs) { const rows = grouped.get(ref.url) ?? []; rows.push(ref); grouped.set(ref.url, rows); }
  if (options.cache) for (const url of options.cache.keys()) if (!grouped.has(url)) options.cache.delete(url);
  for (const [url, rows] of grouped) {
    check(); const local = localResourceReference(url);
    const intent = resourceReferenceIntent(url);
    if (!local && !intent || local?.storage === 'image' && options.includeImages === false) continue;
    const lines = [...new Set(rows.map(ref => ref.line))], kind = rows.some(ref => ref.kind === 'image') ? 'image' : 'file';
    const finding = (key: string, tier: ArticleFormatIssue['tier'], cause?: unknown, resourceStateValue?: 'pending' | 'failed') => {
      result.push({ kind: 'element', name: productText('resources.referenceName'), source: '当前文章正文', tier, line: lines[0], lines,
        ...productMessage(key, { name: local?.fileName ?? url, cause: cause ? productCause(cause) : '' }), domain: 'product', resourceSource: url, resourceKind: kind, resourceState: resourceStateValue });
    };
    if (!local) { finding('resources.invalidReference', 'danger'); continue; }
    if (kind === 'image' && local.storage === 'file') finding('resources.imageInFileStorage', 'danger');
    const entry = media.root ? resourceState(media.root, id, url) : null, stored = disk.get(resourceReference(local.storage, local.fileName, local.shared));
    const state = entry?.state ?? stored?.state;
    if (state === 'pending' || state === 'running') { finding('resources.importPending', 'conditional', undefined, 'pending'); continue; }
    if (state === 'failed' || state === 'cancelled') { finding('resources.importFailed', 'danger', entry?.error ?? stored?.error, 'failed'); continue; }
    const version = `${options.cacheScope ?? ''}:${entry?.version ?? 0}`;
    let probe = options.cache?.get(url);
    if (!probe || probe.version !== version) {
      probe = { version, issue: null };
      try {
        if (!media.root || !local.shared && (!media.month || !media.folder)) throw new ProductError('resources.linkUnavailable');
        const destination = local.shared ? { kind: 'shared' as const } : { kind: 'article' as const, articleId: id, month: media.month!, folder: media.folder!, title: media.folder! };
        const directory = await getResourceDirectory(media.root, destination, local.storage, false, current);
        if (!directory) throw new DOMException('Missing resource directory', 'NotFoundError');
        const handle = await directory.getFileHandle(local.fileName), path = await media.root.resolve(handle);
        const expected = local.shared ? ['shared', local.storage, local.fileName] : ['articles', media.month!, media.folder!, 'media', local.storage, local.fileName];
        if (path?.join('/') !== expected.join('/')) throw new ProductError('resources.unsafeTarget');
        const file = await handle.getFile(); check();
        if (local.storage === 'image') await inspectArticleImage(file);
      } catch (error) {
        check(); probe.issue = error instanceof DOMException && error.name === 'NotFoundError' ? 'missing' : error instanceof ProductError && error.messageKey === 'articleMedia.fileContentCouldNotBeIdentifiedAsSupportedPngJpegGifWebp' ? 'invalid' : 'unconfirmed'; probe.cause = error;
      }
      check(); options.cache?.set(url, probe);
    }
    if (probe.issue) finding('resources.' + probe.issue, probe.issue === 'unconfirmed' ? 'conditional' : 'danger', probe.cause);
  }
  check(); return result;
}
