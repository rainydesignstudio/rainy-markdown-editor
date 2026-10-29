import { appAssetPath } from './appBasePath';
import manifest from '../../resources/font-sources.json' with { type: 'json' };
import { ProductError } from './i18n/productMessages';

export type FontSourceId = 'google-fonts' | 'jsdmirror';
export const FONT_SOURCES = manifest.sources;
export const DEFAULT_FONT_SOURCE = manifest.defaultSource as FontSourceId;
export const FONT_SOURCE_STORAGE_KEY = 'rainy-font-source-v1';
const listeners = new Set<() => void>();
let selected: FontSourceId | null = null;
export function resolveFontSource(value: string | null): FontSourceId { return value === 'jsdmirror' ? value : DEFAULT_FONT_SOURCE; }
export function getFontSource(): FontSourceId {
  if (typeof window === 'undefined') return DEFAULT_FONT_SOURCE;
  if (selected) return selected;
  try { selected = resolveFontSource(window.localStorage.getItem(FONT_SOURCE_STORAGE_KEY)); }
  catch { selected = DEFAULT_FONT_SOURCE; }
  return selected;
}
export function setFontSource(value: FontSourceId): boolean {
  if (!FONT_SOURCES.some(source => source.id === value)) throw new ProductError('localFonts.invalidSource');
  selected = value;
  let saved = false;
  try { window.localStorage.setItem(FONT_SOURCE_STORAGE_KEY, value); saved = true; } catch { /* Keep the selection for this page session. */ }
  listeners.forEach(listener => listener());
  return saved;
}
function storageChanged(event: StorageEvent) {
  if (event.key !== null && event.key !== FONT_SOURCE_STORAGE_KEY) return;
  selected = null; listeners.forEach(listener => listener());
}
export function subscribeFontSource(listener: () => void) {
  if (!listeners.size && typeof window !== 'undefined') window.addEventListener('storage', storageChanged);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', storageChanged); };
}

export type FontFileRequest = { name: string; url: string; size: number; sha256: string };
export function fontFileRequest(asset: typeof manifest.fonts[number], source = getFontSource()): FontFileRequest {
  return { name: asset.file, url: asset.urls[source], size: asset.size, sha256: asset.sha256 };
}
export function fontLicenseRequest(asset: typeof manifest.fonts[number]): FontFileRequest {
  return { name: asset.license, url: appAssetPath(`/fonts/${asset.license}`), size: asset.licenseSize, sha256: asset.licenseSha256 };
}

/** Shared by library initialization and the README exporter. Nothing is written before verification. */
export async function fetchVerifiedFontFile(file: FontFileRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const interruption = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException('Font download cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new ProductError('localFonts.timeout', { name: file.name })); }, 30_000);
  });
  const download = async () => {
    if (signal?.aborted) { abort(); throw new DOMException('Font download cancelled', 'AbortError'); }
    const response = await fetch(file.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'force-cache' });
    if (!response.ok) throw new ProductError('localFonts.downloadFailed', { name: file.name, status: response.status });
    if (Number(response.headers?.get('Content-Length') ?? 0) > file.size) throw new ProductError('localFonts.invalidFile', { name: file.name });
    let bytes: Uint8Array<ArrayBuffer>;
    if (response.body) {
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const result = await reader.read(); if (result.done) break;
          size += result.value.length;
          if (size > file.size) throw new ProductError('localFonts.invalidFile', { name: file.name });
          chunks.push(result.value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } else bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== file.size) throw new ProductError('localFonts.invalidFile', { name: file.name });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== file.sha256) throw new ProductError('localFonts.invalidFile', { name: file.name });
    return bytes.buffer;
  };
  try { return await Promise.race([download(), interruption]); }
  finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
