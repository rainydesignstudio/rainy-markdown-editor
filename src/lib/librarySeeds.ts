import type { UILocale } from './i18n/preferences';
import { ProductError } from './i18n/productMessages';

// Extend the existing initialization receipt; no per-object locale or translation fields.
export const LIBRARY_SEED_MARKER = 'default-themes.loaded';
export function resolveSeedLocale(locale?: string | null): UILocale { return locale === 'zh-CN' ? 'zh-CN' : 'en-US'; }

export const CONTENT_SEED_PROFILES = ['rich', 'markdown'] as const;
export type ContentSeedProfile = typeof CONTENT_SEED_PROFILES[number];
export type LibrarySeedRecord = { version: 1; locale?: UILocale; initialized?: boolean; contentSeed?: ContentSeedProfile };
export async function readLibrarySeedRecord(root: FileSystemDirectoryHandle): Promise<LibrarySeedRecord | null> {
  try {
    const themes = await root.getDirectoryHandle('themes');
    const file = await themes.getFileHandle(LIBRARY_SEED_MARKER);
    const value = JSON.parse(await (await file.getFile()).text());
    if (!value || value.version !== 1 || (value.locale !== undefined && value.locale !== 'zh-CN' && value.locale !== 'en-US') || (value.initialized !== undefined && typeof value.initialized !== 'boolean') || (value.contentSeed !== undefined && !CONTENT_SEED_PROFILES.includes(value.contentSeed))) throw new ProductError('librarySeeds.invalidLocaleRecord');
    return value;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    if (error instanceof SyntaxError) throw new ProductError('librarySeeds.invalidLocaleRecord');
    throw error;
  }
}

export async function readLibrarySeedLocale(root: FileSystemDirectoryHandle): Promise<UILocale> {
  return resolveSeedLocale((await readLibrarySeedRecord(root))?.locale);
}
