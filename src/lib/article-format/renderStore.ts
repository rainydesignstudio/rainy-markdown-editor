import { ProductError } from '../i18n/productMessages';
import { contentHash, normalizeLibraryPath, readLibraryFile, STYLE_LIMITS } from './styles';
import { canonicalFormatJson } from './config';

export const RENDER_STORE = 'cache/render';
export const RENDER_OWNER = 'wechat-article-editor-render';
export const RENDER_HASH = /^[a-f0-9]{64}$/;
export const isMissing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export async function renderDirectory(root: FileSystemDirectoryHandle, path: string, create = false) {
  let dir = root; for (const part of normalizeLibraryPath(path).split('/')) dir = await dir.getDirectoryHandle(part, { create }); return dir;
}
export async function renderWrite(target: FileSystemDirectoryHandle, name: string, value: string | Blob) {
  const handle = await target.getFileHandle(name, { create: true }), stream = await handle.createWritable();
  try { await stream.write(value); await stream.close(); } catch (error) { try { await stream.abort(); } catch { /* Keep the original failure. */ } throw error; }
}
export async function ensureRenderStore(root: FileSystemDirectoryHandle, create = false) {
  const dir = await renderDirectory(root, RENDER_STORE, create), marker = canonicalFormatJson({ owner: RENDER_OWNER, schemaVersion: 2 });
  let raw: string | null = null;
  try { const file = await (await dir.getFileHandle('owner.json')).getFile(); if (file.size > 1024) throw new ProductError('renderCache.foreignStore'); raw = await file.text(); } catch (error) { if (!isMissing(error)) throw error; }
  if (raw === null && create) {
    for await (const _ of dir.entries()) throw new ProductError('renderCache.foreignStore');
    try { await renderWrite(dir, 'owner.json', marker); }
    catch (error) { try { if ((await (await dir.getFileHandle('owner.json')).getFile()).size === 0) await dir.removeEntry('owner.json'); } catch { /* Preserve an unavailable or replaced marker. */ } throw error; }
    raw = await (await (await dir.getFileHandle('owner.json')).getFile()).text();
  }
  if (raw !== marker) throw new ProductError('renderCache.foreignStore');
  return dir;
}
export async function storeRenderObject(root: FileSystemDirectoryHandle, value: Blob | unknown): Promise<string> {
  await ensureRenderStore(root, true);
  const blob = value instanceof Blob ? value : new Blob([canonicalFormatJson(value)], { type: 'application/json' });
  const hash = await contentHash(blob), dir = await renderDirectory(root, RENDER_STORE + '/objects', true);
  await immutableWrite(dir, hash, blob); return hash;
}
export async function immutableWrite(dir: FileSystemDirectoryHandle, name: string, blob: Blob) {
  try {
    const existing = await (await dir.getFileHandle(name)).getFile();
    if (await contentHash(existing) !== await contentHash(blob)) throw new ProductError('renderCache.corrupt');
    return;
  } catch (error) { if (!isMissing(error)) throw error; }
  try { await renderWrite(dir, name, blob); }
  catch (error) { try { if ((await (await dir.getFileHandle(name)).getFile()).size === 0) await dir.removeEntry(name); } catch { /* Preserve an unavailable or replaced object. */ } throw error; }
  if (await contentHash(await (await dir.getFileHandle(name)).getFile()) !== await contentHash(blob)) throw new ProductError('renderCache.corrupt');
}
export async function readRenderObject(root: FileSystemDirectoryHandle, hash: string): Promise<File> {
  if (!RENDER_HASH.test(hash)) throw new ProductError('renderCache.corrupt');
  await ensureRenderStore(root);
  const file = await readLibraryFile(root, RENDER_STORE + '/objects/' + hash);
  if (await contentHash(file) !== hash) throw new ProductError('renderCache.corrupt'); return file;
}
export type StoredRenderManifest = { owner: string; schemaVersion: 2; parts: Record<string, string>; assets: Array<{ hash: string; path: string; mime: string }> };
const PARTS = ['rawFormatter', 'rawFiles', 'policy', 'candidates', 'compilerVersion', 'algorithms', 'renderer', 'configuration'];
export async function storeRenderManifest(root: FileSystemDirectoryHandle, manifest: Record<string, unknown>) {
  const parts: Record<string, string> = {};
  for (const name of PARTS) if (manifest[name] !== undefined) parts[name] = await storeRenderObject(root, manifest[name]);
  const stored = { owner: RENDER_OWNER, schemaVersion: 2, parts, assets: manifest.assets };
  const text = canonicalFormatJson(stored), hash = await contentHash(text);
  if (new Blob([text]).size > STYLE_LIMITS.cssBytes) throw new ProductError('renderCache.corrupt');
  const dir = await renderDirectory(root, RENDER_STORE + '/manifests', true);
  await immutableWrite(dir, hash + '.json', new Blob([text])); return hash;
}
export async function loadStoredRenderManifest(root: FileSystemDirectoryHandle, hash: string): Promise<StoredRenderManifest> {
  if (!RENDER_HASH.test(hash)) throw new ProductError('renderCache.corrupt');
  await ensureRenderStore(root);
  const file = await readLibraryFile(root, RENDER_STORE + '/manifests/' + hash + '.json');
  if (file.size > STYLE_LIMITS.cssBytes || await contentHash(file) !== hash) throw new ProductError('renderCache.corrupt');
  const value = JSON.parse(await file.text());
  if (value.owner !== RENDER_OWNER || value.schemaVersion !== 2 || !value.parts || !Array.isArray(value.assets) || Object.entries(value.parts).some(([k, v]) => !PARTS.includes(k) || typeof v !== 'string' || !RENDER_HASH.test(v))) throw new ProductError('renderCache.corrupt');
  return value;
}
export async function expandRenderManifest(root: FileSystemDirectoryHandle, hash: string): Promise<Record<string, unknown>> {
  const manifest = await loadStoredRenderManifest(root, hash), value: Record<string, unknown> = { owner: RENDER_OWNER, schemaVersion: 1, assets: manifest.assets };
  for (const [name, ref] of Object.entries(manifest.parts)) {
    const file = await readRenderObject(root, ref); if (file.size > 64 * 1024 * 1024) throw new ProductError('renderCache.corrupt');
    value[name] = JSON.parse(await file.text());
  }
  return value;
}
