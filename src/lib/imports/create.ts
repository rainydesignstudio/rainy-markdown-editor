import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { saveStoredArticle, type ArticleWriteGuard } from '../fileSystem';
import { parseArticle, replaceArticleBody } from '../frontMatter';
import { parseKnowledgeText } from '../knowledge/parse';
import { ProductError, productErrorMessage } from '../i18n/productMessages';
import type { ThemeConfig } from '../types';
import type { ReadonlyImportSource } from './source';
import { prepareMarkdownImport, readMarkdownImport } from './document';
import { planMarkdownResources } from './plan';
import { createImportTaskRecord } from './store';
import type { ImportTask } from './model';

export function importTargetGuard(root: FileSystemDirectoryHandle, source: ReadonlyImportSource, current: () => boolean): ArticleWriteGuard {
  return async (handle, path) => {
    if (!current()) throw new ProductError('imports.changed');
    if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('resources.libraryRequired');
    const actual = await root.resolve(handle);
    if (!actual || actual.length !== path.length || actual.some((part, index) => part !== path[index])) throw new ProductError('resources.unsafeTarget');
    await source.assertCurrent(); await source.assertTarget(handle);
    if (!current()) throw new ProductError('imports.changed');
  };
}

export async function createMarkdownImport(root: FileSystemDirectoryHandle, source: ReadonlyImportSource, theme: ThemeConfig, current: () => boolean) {
  const guard = importTargetGuard(root, source, current); await guard(root, []);
  const file = await source.readMarkdown(), content = await readMarkdownImport(file);
  if (content.hash !== source.origin.hash) throw new ProductError('imports.sourceChanged');
  const prepared = prepareMarkdownImport(content.text, source.origin.path, theme), plan = planMarkdownResources(parseArticle(prepared).body);
  const target = replaceArticleBody(prepared, plan.body);
  const links = parseKnowledgeText(content.text, source.origin.path).links.filter(link => link.kind === 'wiki' || !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(link.target) && /\.(?:md|markdown)(?:[?#]|$)/i.test(link.target));
  const result = await saveStoredArticle(root, target, theme, null, null, { guard, requestPermission: false });
  const now = new Date().toISOString();
  const task: ImportTask = {
    schemaVersion: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    target: { articleId: result.article.id, month: result.article.month, folder: result.article.folder },
    source: { ...source.origin }, state: plan.resources.length ? 'pending' : plan.diagnostics.length ? 'paused' : 'complete',
    resources: plan.resources,
    diagnostics: [...plan.diagnostics, ...links.map(link => ({ line: link.line, source: link.target.slice(0, 200), reason: 'document-link' as const }))],
  };
  let taskSaved = false, taskIssue: ReturnType<typeof productErrorMessage> | undefined;
  try { await createImportTaskRecord(root, task, guard); taskSaved = true; }
  catch (error) { taskIssue = productErrorMessage(error); }
  return { result, task, taskSaved, taskIssue };
}
