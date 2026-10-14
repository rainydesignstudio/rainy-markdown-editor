import english from '../../resources/template/fresh-library/en-US/themes/preview.md';
import chinese from '../../resources/template/fresh-library/zh-CN/themes/preview.md';
import { LIBRARY_SEED_MARKER, resolveSeedLocale } from './librarySeeds';
import type { UILocale } from './i18n/preferences';
import { ProductError, productCause, productJoin, type ProductMessageValue } from './i18n/productMessages';
import { validateContentSource } from './contentValidation';

export const THEME_PREVIEW_FILE = 'preview.md';
export const MAX_THEME_PREVIEW_BYTES = 250_000;
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export function defaultThemePreviewSample(locale?: string | null): string {
  return resolveSeedLocale(locale) === 'zh-CN' ? chinese : english;
}

type SampleContent = { markdown: string | null; origin: 'library' | 'default'; locale: UILocale | null };
export type ThemePreviewSample = SampleContent & {
  id: number; library: string | null; status: 'loading' | 'ready' | 'error'; error: ProductMessageValue;
};
const initial: ThemePreviewSample = Object.freeze({ id: 0, library: null, status: 'ready', markdown: english, origin: 'default', locale: 'en-US', error: null });
let current = initial;
let generation = 0;
const listeners = new Set<() => void>();
export function getThemePreviewSample(): ThemePreviewSample { return current; }
export function getInitialThemePreviewSample(): ThemePreviewSample { return initial; }
export function subscribeThemePreviewSample(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function publish(value: Omit<ThemePreviewSample, 'id'>): ThemePreviewSample {
  current = Object.freeze({ ...value, id: ++generation });
  listeners.forEach(listener => listener());
  return current;
}
export function invalidateThemePreviewSample(library: string | null): ThemePreviewSample {
  return publish({ library, status: 'loading', markdown: null, origin: 'library', locale: null, error: null });
}

// This fallback only consumes the receipt's language. Unsupported or absent
// languages use English; malformed or unreadable files remain explicit errors.
async function fallbackLocale(root: FileSystemDirectoryHandle): Promise<UILocale> {
  try {
    const themes = await root.getDirectoryHandle('themes');
    const file = await (await themes.getFileHandle(LIBRARY_SEED_MARKER)).getFile();
    if (file.size > MAX_THEME_PREVIEW_BYTES) throw new ProductError('themeSample.receiptTooLarge');
    const record: unknown = JSON.parse(await file.text());
    return resolveSeedLocale(record && typeof record === 'object' && 'locale' in record && typeof record.locale === 'string' ? record.locale : null);
  } catch (error) { if (missing(error)) return 'en-US'; throw error; }
}

export async function readThemePreviewSample(root: FileSystemDirectoryHandle): Promise<SampleContent> {
  let markdown: string;
  try {
    const directory = await root.getDirectoryHandle('themes');
    const file = await (await directory.getFileHandle(THEME_PREVIEW_FILE)).getFile();
    if (file.size > MAX_THEME_PREVIEW_BYTES) throw new ProductError('themeSample.tooLarge', { limit: MAX_THEME_PREVIEW_BYTES });
    markdown = await file.text();
  } catch (error) {
    if (!missing(error)) throw error;
    const locale = await fallbackLocale(root);
    return { markdown: defaultThemePreviewSample(locale), origin: 'default', locale };
  }
  if (!markdown.trim() || markdown.includes('\0')) throw new ProductError('themeSample.invalidContent');
  const result = await validateContentSource('snippets', markdown);
  if (result.errors.length) throw new ProductError('themeSample.validationFailed', { cause: result.errorMessage ?? productJoin(result.errors, '；') });
  return { markdown, origin: 'library', locale: null };
}

export async function activateThemePreviewSample(root: FileSystemDirectoryHandle, isCurrent: () => boolean): Promise<ThemePreviewSample | null> {
  if (!isCurrent()) return null;
  const loading = invalidateThemePreviewSample(root.name);
  try {
    const sample = await readThemePreviewSample(root);
    if (!isCurrent() || current.id !== loading.id) return null;
    return publish({ ...sample, library: root.name, status: 'ready', error: null });
  } catch (error) {
    if (!isCurrent() || current.id !== loading.id) return null;
    return publish({ library: root.name, status: 'error', markdown: null, origin: 'library', locale: null, error: productCause(error) });
  }
}

// Called only by additive initialization or an explicitly authorized default
// sync. Opening an existing initialized library never writes a missing sample.
export async function initializeThemePreviewSample(root: FileSystemDirectoryHandle, locale: string): Promise<void> {
  const directory = await root.getDirectoryHandle('themes');
  try { await directory.getFileHandle(THEME_PREVIEW_FILE); return; }
  catch (error) { if (!missing(error)) throw error; }
  const file = await directory.getFileHandle(THEME_PREVIEW_FILE, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(defaultThemePreviewSample(locale));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* retain the write failure */ }
    try { await directory.removeEntry(THEME_PREVIEW_FILE); } catch { /* retain the write failure */ }
    throw error;
  }
}
