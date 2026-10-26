import { getBuiltinEditorThemes } from './editorThemes';
import { getBuiltinArticleThemes } from '../themes/article-themes/index';
import { getThemeDirectory } from './themeDirectories';
import { ProductError, productDiagnosticReference, productErrorMessage, productJoin } from './i18n/productMessages';
import { initializeContentLibraries } from './contentLibraries';
import { initializeThemePreviewSample } from './themePreviewSample';

import { LIBRARY_SEED_MARKER as MARKER, readLibrarySeedLocale, readLibrarySeedRecord, resolveSeedLocale, type LibrarySeedRecord, type ContentSeedProfile } from './librarySeeds';
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export type ThemeDefaultResult = { added: number; skipped: number; issues: { file: string; message: string }[] };

export async function copyDefaultThemes(root: FileSystemDirectoryHandle, kind: 'article-themes' | 'editor-themes', locale?: string): Promise<ThemeDefaultResult> {
  const seedLocale = locale === undefined ? await readLibrarySeedLocale(root) : resolveSeedLocale(locale);
  const { directory } = await getThemeDirectory(root, kind);
  const result: ThemeDefaultResult = { added: 0, skipped: 0, issues: [] };
  const defaults = kind === 'article-themes' ? getBuiltinArticleThemes(seedLocale) : getBuiltinEditorThemes(seedLocale);
  for (const theme of defaults) {
    const name = `${theme.id}.json`;
    try {
      try { await directory.getFileHandle(name); result.skipped++; continue; }
      catch (error) { if (!missing(error)) throw error; }
      const file = await directory.getFileHandle(name, { create: true });
      let writable: FileSystemWritableFileStream | undefined;
      try { writable = await file.createWritable(); await writable.write(JSON.stringify(theme, null, 2)); await writable.close(); }
      catch (error) { try { await writable?.abort(); } catch { /* retain failure */ } try { await directory.removeEntry(name); } catch { /* retain failure */ } throw error; }
      result.added++;
    } catch (error) { result.issues.push({ file: name, ...productErrorMessage(error) }); }
  }
  return result;
}

async function writeSeedReceipt(themes: FileSystemDirectoryHandle, record: LibrarySeedRecord): Promise<void> {
  let created = false;
  let file: FileSystemFileHandle;
  try { file = await themes.getFileHandle(MARKER); }
  catch (error) { if (!missing(error)) throw error; file = await themes.getFileHandle(MARKER, { create: true }); created = true; }
  let writable: FileSystemWritableFileStream | undefined;
  try { writable = await file.createWritable(); await writable.write(JSON.stringify(record)); await writable.close(); }
  catch (error) {
    try { await writable?.abort(); } catch { /* retain failure */ }
    if (created) try { await themes.removeEntry(MARKER); } catch { /* retain failure */ }
    throw error;
  }
}

// Keep the seed choice through a failed initialization. Legacy receipts without
// `initialized` already mean complete and are never rewritten or reseeded.
export async function initializeThemeDefaults(root: FileSystemDirectoryHandle, locale: string = 'en-US', options: { previewSample?: boolean; contentSeed?: ContentSeedProfile } = {}): Promise<void> {
  const themes = await root.getDirectoryHandle('themes', { create: true });
  const record = await readLibrarySeedRecord(root);
  if (record && record.initialized !== false) return;
  const seedLocale = record?.locale ?? resolveSeedLocale(locale);
  const contentSeed = record?.contentSeed ?? options.contentSeed;
  const selection = contentSeed ? { contentSeed } : {};
  if (!record) await writeSeedReceipt(themes, { version: 1, locale: seedLocale, initialized: false, ...selection });
  const article = await copyDefaultThemes(root, 'article-themes', seedLocale);
  const editor = await copyDefaultThemes(root, 'editor-themes', seedLocale);
  if (article.issues.length || editor.issues.length) throw new ProductError('shared.compose', { parts: productJoin([...article.issues, ...editor.issues].map(issue => productJoin([issue.file, '：', productDiagnosticReference(issue)])), '；') });
  if (options.previewSample) await initializeThemePreviewSample(root, seedLocale);
  if (contentSeed) await initializeContentLibraries(root);
  await writeSeedReceipt(themes, { version: 1, locale: seedLocale, initialized: true, ...selection });
}
