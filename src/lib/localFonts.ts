import { productCause, productMessage, type ProductMessageFields } from "./i18n/productMessages";
import { OPEN_FONT_ASSETS } from './fontCatalog';
import { fetchVerifiedFontFile, fontFileRequest, fontLicenseRequest, getFontSource, subscribeFontSource } from './fontSources';

const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';

type FontStatus = { root: FileSystemDirectoryHandle | null; phase: 'idle' | 'downloading' | 'ready' | 'error' | 'cancelled'; completed: number; total: number; notice: ProductMessageFields | null };
const initialStatus: FontStatus = Object.freeze({ root: null, phase: 'idle', completed: 0, total: 0, notice: null });
let status = initialStatus, generation = 0, active: AbortController | null = null;
const listeners = new Set<() => void>();
export const getLocalFontStatus = () => status;
export const getInitialLocalFontStatus = () => initialStatus;
export function subscribeLocalFontStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function cancelLocalFontDownload() { active?.abort(); }
function publish(value: FontStatus) { status = Object.freeze(value); listeners.forEach(listener => listener()); }

// The chosen source supplies only missing files. Existing fonts always belong to the user.
export async function initializeLocalFonts(root: FileSystemDirectoryHandle, current: () => boolean = () => true): Promise<void> {
  if (!current()) return;
  active?.abort(); const controller = new AbortController(); active = controller;
  const request = ++generation, source = getFontSource();
  const valid = () => current() && generation === request && !controller.signal.aborted && getFontSource() === source;
  const unsubscribe = subscribeFontSource(() => { if (getFontSource() !== source) controller.abort(); });
  let completed = 0, total = 0;
  try {
    const directory = await root.getDirectoryHandle('fonts', { create: true });
    const files = OPEN_FONT_ASSETS.flatMap(asset => [fontLicenseRequest(asset), fontFileRequest(asset, source)]);
    const pending = [];
    for (const file of files) {
      if (!valid()) return;
      try { await directory.getFileHandle(file.name); } catch (error) { if (!missing(error)) throw error; pending.push(file); }
    }
    total = pending.length;
    for (const file of pending) {
      if (!valid()) return;
      publish({ root, phase: 'downloading', completed, total, notice: null });
      const content = await fetchVerifiedFontFile(file, controller.signal);
      if (!valid()) return;
      // Recheck after downloading: a file supplied in the meantime must be retained.
      try { await directory.getFileHandle(file.name); completed++; continue; } catch (error) { if (!missing(error)) throw error; }
      const handle = await directory.getFileHandle(file.name, { create: true });
      const existing = await handle.getFile();
      if (existing.size > 0) { completed++; continue; }
      let writable: FileSystemWritableFileStream | undefined;
      try {
        if (!valid()) { if ((await handle.getFile()).size === 0) await directory.removeEntry(file.name); return; }
        writable = await handle.createWritable();
        if (!valid()) throw new DOMException('Font download cancelled', 'AbortError');
        await writable.write(content);
        if (!valid()) throw new DOMException('Font download cancelled', 'AbortError');
        await writable.close();
      } catch (error) {
        try { await writable?.abort(); } catch { /* retain the failure */ }
        try {
          const partial = new Uint8Array(await (await handle.getFile()).arrayBuffer()), expected = new Uint8Array(content);
          if (partial.length <= expected.length && partial.every((value, index) => value === expected[index])) await directory.removeEntry(file.name);
        } catch { /* Preserve files that no longer match this operation. */ }
        throw error;
      }
      completed++;
    }
    if (valid()) publish({ root, phase: 'ready', completed, total, notice: productMessage('localFonts.ready') });
  } catch (error) {
    if (!valid()) { if (generation === request) publish({ root, phase: 'cancelled', completed, total, notice: productMessage('localFonts.cancelled') }); return; }
    publish({ root, phase: 'error', completed, total, notice: productMessage('localFonts.failed', { cause: productCause(error) }) });
    throw error;
  } finally {
    unsubscribe(); if (active === controller) active = null;
    if (generation === request && !valid() && status.phase === 'downloading') publish({ root, phase: 'cancelled', completed, total, notice: productMessage('localFonts.cancelled') });
  }
}

type FontDocument = Pick<Document, 'fonts'>;
const activeFaces = new Set<FontFace>();
const previewFontSets = new Set<FontFaceSet>();

export function shareLocalFontsWithPreview(target: FontDocument): () => void {
  const fonts = target.fonts;
  previewFontSets.add(fonts);
  for (const face of activeFaces) fonts.add(face);
  return () => { previewFontSets.delete(fonts); for (const face of activeFaces) fonts.delete(face); };
}

// Load only via the authorized filesystem handle. Discard late results after a
// directory switch, and remove every registered face when that session closes.
export async function loadLocalFonts(root: FileSystemDirectoryHandle, current: () => boolean, target: FontDocument = document): Promise<() => void> {
  const faces: FontFace[] = [];
  const dispose = () => { for (const face of faces) { target.fonts.delete(face); activeFaces.delete(face); for (const fonts of previewFontSets) fonts.delete(face); } };
  try {
    const directory = await root.getDirectoryHandle('fonts');
    const loaded = await Promise.all(OPEN_FONT_ASSETS.map(async asset => {
      const source = await (await directory.getFileHandle(asset.file)).getFile();
      const face = new FontFace(asset.family, await source.arrayBuffer(), { style: 'normal', weight: asset.weight, display: 'swap' });
      return face.load();
    }));
    if (current()) for (const face of loaded) { target.fonts.add(face); faces.push(face); activeFaces.add(face); for (const fonts of previewFontSets) fonts.add(face); }
    return dispose;
  } catch (error) { dispose(); throw error; }
}
