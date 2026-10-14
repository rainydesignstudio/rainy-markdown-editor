import { parseDocument } from 'yaml';
import { parseArticle, createArticleSource, replaceArticleBody, updateFrontMatter } from '../frontMatter';
import { parseKnowledgeText, knowledgeHash } from '../knowledge/parse';
import { isMarkdownPath } from '../knowledge/model';
import { ProductError } from '../i18n/productMessages';
import type { ThemeConfig } from '../types';
import { IMPORT_LIMITS } from './model';

export async function readMarkdownImport(file: File): Promise<{ text: string; hash: string }> {
  if (!isMarkdownPath(file.name)) throw new ProductError('imports.markdownOnly');
  if (file.size > IMPORT_LIMITS.documentBytes) throw new ProductError('imports.documentTooLarge');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > IMPORT_LIMITS.documentBytes) throw new ProductError('imports.documentTooLarge');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ProductError('imports.utf8Required'); }
  return { text, hash: await knowledgeHash(bytes) };
}

/** Normalize only the target protocol's fields; unknown YAML keys and the body survive. */
export function prepareMarkdownImport(text: string, path: string, theme: ThemeConfig, now = new Date().toISOString()): string {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!header && /^---\r?\n/.test(text)) throw new ProductError('imports.invalidMarkdown');
  const parsedTitle = parseKnowledgeText(text, path).title;
  let result: string;
  if (!header) {
    result = replaceArticleBody(createArticleSource(parsedTitle, theme.id), text);
    result = updateFrontMatter(result, { title: parsedTitle, createdAt: now, updatedAt: now, theme: { id: theme.id, version: theme.version } });
  } else {
    try {
      const document = parseDocument(header[1], { schema: 'core', uniqueKeys: true });
      if (document.errors.length) throw new Error('invalid header');
      const meta: unknown = document.toJS({ maxAliasCount: 0 });
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('invalid metadata');
      const original = meta as Record<string, unknown>;
      document.set('title', parsedTitle);
      for (const field of ['description', 'author']) document.set(field, typeof original[field] === 'string' ? original[field] : '');
      document.set('categories', typeof original.categories === 'string' ? [original.categories] : Array.isArray(original.categories) ? original.categories.filter(value => typeof value === 'string') : []);
      document.set('createdAt', now); document.set('updatedAt', now); document.set('theme', { id: theme.id, version: theme.version });
      const eol = header[0].includes('\r\n') ? '\r\n' : '\n';
      result = `---${eol}${document.toString().trimEnd().replace(/\r?\n/g, eol)}${eol}---${eol}${text.slice(header[0].length)}`;
    } catch { throw new ProductError('imports.invalidMarkdown'); }
  }
  if (!parseArticle(result).canCopy) throw new ProductError('imports.invalidMarkdown');
  return result;
}
