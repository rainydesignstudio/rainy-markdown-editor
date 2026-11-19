import { ProductError } from '../i18n/productMessages';
import { queryDirectoryReadWritePermission } from '../directoryBookmark';
import { ARTICLE_TRASH_DIRECTORY } from '../articleTrash';
import { contentHash, readLibraryFile } from './styles';
import { canonicalFormatJson } from './config';
import { readRenderRecord, renderRecordFiles, readManifest, retainRenderDependencies, type RenderRecord, type LegacyRenderRecord } from './renderRecords';
import { RENDER_STORE, RENDER_OWNER, RENDER_HASH, isMissing, renderDirectory, ensureRenderStore } from './renderStore';
type Guard = () => boolean;
type Row = { path: string; dir: FileSystemDirectoryHandle; raw: string; record: RenderRecord; sourceHash: string; themeHash: string };
type Candidate = { path: string; bytes: number; hash: string };
export type RenderStorageScan = { files: number; bytes: number; reclaimBytes: number; legacyRecords: number; records: number; candidates: Candidate[]; identity: string };
function current(guard: Guard) { if (!guard()) throw new ProductError('renderCache.changed'); }
async function writable(root: FileSystemDirectoryHandle, guard: Guard) { current(guard); if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('renderCache.permission'); current(guard); }
async function optional(root: FileSystemDirectoryHandle, path: string) {
  try { return await renderDirectory(root, path); } catch (error) { if (isMissing(error)) return null; throw error; }
}
async function text(dir: FileSystemDirectoryHandle, name: string) { const file = await (await dir.getFileHandle(name)).getFile(); if (file.size > 8 * 1024 * 1024) throw new ProductError('renderCache.corrupt'); return file.text(); }
async function records(root: FileSystemDirectoryHandle, guard: Guard): Promise<Row[]> {
  const found: Row[] = [];
  const visit = async (dir: FileSystemDirectoryHandle, path: string, depth: number) => {
    current(guard); if (depth > 12 || found.length > 20000) throw new ProductError('renderCache.corrupt');
    if (path.startsWith(ARTICLE_TRASH_DIRECTORY + '/') && path.split('/').length === 2) {
      const entry = JSON.parse(await text(dir, 'entry.json'));
      if (entry.schemaVersion !== 1 || !['ready','restored'].includes(entry.state) || !entry.files || typeof entry.files !== 'object') throw new ProductError('renderCache.corrupt');
      for (const [name, hash] of Object.entries(entry.files)) {
        if (typeof hash !== 'string' || !RENDER_HASH.test(hash) || await contentHash(await readLibraryFile(root, path + '/article/' + name)) !== hash) throw new ProductError('renderCache.corrupt');
      }
    }
    for await (const [name, entry] of dir.entries()) {
      current(guard); if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new ProductError('renderCache.corrupt');
      if (entry.kind === 'directory') { if (name !== 'media') await visit(await dir.getDirectoryHandle(name), path + '/' + name, depth + 1); continue; }
      if (name !== 'render.json') continue;
      const raw = await text(dir, name), record = await readRenderRecord(dir);
      if (!record) throw new ProductError('renderCache.changed');
      found.push({ path: path + '/render.json', dir, raw, record, sourceHash: await contentHash(await text(dir, 'article.md')), themeHash: await contentHash(await text(dir, 'theme.json')) });
    }
  };
  for (const path of ['articles', ARTICLE_TRASH_DIRECTORY]) {
    const dir = await optional(root, path); if (dir) await visit(dir, path, 0);
  }
  return found;
}
async function unchanged(row: Row, guard: Guard) {
  current(guard);
  if (await text(row.dir, 'render.json') !== row.raw || await contentHash(await text(row.dir, 'article.md')) !== row.sourceHash || await contentHash(await text(row.dir, 'theme.json')) !== row.themeHash) throw new ProductError('renderCache.changed');
  current(guard);
}
export async function scanRenderStorage(root: FileSystemDirectoryHandle, guard: Guard = () => true): Promise<RenderStorageScan> {
  const rows = await records(root, guard), live = new Set<string>(), ownedLegacyObjects = new Set<string>(), inventory: Candidate[] = [];
  for (const row of rows) for (const [path] of await renderRecordFiles(root, row.record)) live.add(path);
  const legacy = await optional(root, 'styles/.versions');
  if (legacy) for await (const [name, entry] of legacy.entries()) {
    current(guard); if (entry.kind !== 'directory' || !RENDER_HASH.test(name)) continue;
    const path = 'styles/.versions/' + name + '/manifest.json';
    let file: File;
    try { file = await readLibraryFile(root, path); } catch (error) { if (isMissing(error)) continue; throw error; }
    if (file.size > 64 * 1024 * 1024) throw new ProductError('renderCache.corrupt');
    const data = JSON.parse(await file.text());
    if (data.owner !== RENDER_OWNER || data.schemaVersion !== 1 || await contentHash(file) !== name || !Array.isArray(data.assets)) throw new ProductError('renderCache.corrupt');
    for (const asset of data.assets) { if (!RENDER_HASH.test(asset.hash)) throw new ProductError('renderCache.corrupt'); ownedLegacyObjects.add(asset.hash); }
    inventory.push({ path, bytes: file.size, hash: name });
  }
  const store = await optional(root, RENDER_STORE); if (store) await ensureRenderStore(root);
  for (const path of [RENDER_STORE + '/manifests', RENDER_STORE + '/objects', 'assets/.objects']) {
    const dir = await optional(root, path); if (!dir) continue;
    for await (const [name, entry] of dir.entries()) {
      current(guard); if (entry.kind !== 'file') continue;
      const hash = path.endsWith('/manifests') ? name.replace(/\.json$/, '') : name;
      if (!RENDER_HASH.test(hash) || path === 'assets/.objects' && !ownedLegacyObjects.has(hash)) continue;
      const file = await (await dir.getFileHandle(name)).getFile();
      if (file.size > 256 * 1024 * 1024 || await contentHash(file) !== hash) throw new ProductError('renderCache.corrupt');
      if (path.endsWith('/manifests')) { const value = JSON.parse(await file.text()); if (value.owner !== RENDER_OWNER || value.schemaVersion !== 2) throw new ProductError('renderCache.corrupt'); }
      inventory.push({ path: path + '/' + name, bytes: file.size, hash });
    }
  }
  for (const row of rows) await unchanged(row, guard);
  const candidates = inventory.filter(row => !live.has(row.path));
  return { files: inventory.length, bytes: inventory.reduce((sum, row) => sum + row.bytes, 0), reclaimBytes: candidates.reduce((sum, row) => sum + row.bytes, 0), legacyRecords: rows.filter(row => row.record.schemaVersion === 1 && row.path.startsWith('articles/')).length, records: rows.length, candidates, identity: await contentHash(canonicalFormatJson({ rows: rows.map(row => [row.path, row.raw, row.sourceHash, row.themeHash]).sort(), inventory: inventory.sort((a,b) => a.path.localeCompare(b.path)) })) };
}
export async function migrateRenderStorage(root: FileSystemDirectoryHandle, guard: Guard = () => true, onCommit?: (count: number) => void) {
  await writable(root, guard); const rows = await records(root, guard);
  // Copy all dependency closures before switching the first pointer; old objects remain for explicit reclamation.
  const prepared = [];
  for (const row of rows) {
    current(guard); if (row.record.schemaVersion !== 1 || !row.path.startsWith('articles/')) { await renderRecordFiles(root, row.record); continue; }
    const manifest = await readManifest(root, row.record), files = await renderRecordFiles(root, row.record);
    const assets = manifest.assets.map(ref => ({ ...ref, blob: files.get('assets/.objects/' + ref.hash)!, url: '' }));
    prepared.push({ row, value: { record: row.record as LegacyRenderRecord, manifest, assets } });
  }
  const pointers: Array<{ row: Row; record: RenderRecord }> = [];
  for (const item of prepared) {
    current(guard); const record = await retainRenderDependencies(root, item.value); pointers.push({ row: item.row, record });
  }
  for (const row of rows) await unchanged(row, guard);
  let migrated = 0;
  for (const item of pointers) {
    await writable(root, guard); await unchanged(item.row, guard);
    const handle = await item.row.dir.getFileHandle('render.json'), stream = await handle.createWritable();
    try { current(guard); await stream.write(JSON.stringify(item.record)); current(guard); await stream.close(); migrated++; onCommit?.(migrated); }
    catch (error) { try { await stream.abort(); } catch { /* Keep valid copied dependencies and the original failure. */ } throw error; }
  }
  return migrated;
}
export async function reclaimRenderStorage(root: FileSystemDirectoryHandle, expected: RenderStorageScan, guard: Guard = () => true, onCommit?: (bytes: number) => void) {
  await writable(root, guard); const actual = await scanRenderStorage(root, guard);
  if (actual.identity !== expected.identity) throw new ProductError('renderCache.changed');
  let removed = 0;
  for (const row of actual.candidates) {
    await writable(root, guard);
    // Recheck reachability before each deletion, including any history created since inspection.
    const live = await records(root, guard);
    for (const record of live) if ((await renderRecordFiles(root, record.record)).has(row.path)) throw new ProductError('renderCache.changed');
    const file = await readLibraryFile(root, row.path); if (file.size !== row.bytes || await contentHash(file) !== row.hash) throw new ProductError('renderCache.changed');
    current(guard); const parts = row.path.split('/'), name = parts.pop()!, dir = await renderDirectory(root, parts.join('/')); current(guard); await dir.removeEntry(name); removed += row.bytes;
    onCommit?.(removed);
    if (row.path.startsWith('styles/.versions/')) {
      let empty = true; for await (const _ of dir.entries()) { empty = false; break; }
      if (empty) { const parent = await renderDirectory(root, 'styles/.versions'); current(guard); await parent.removeEntry(parts.at(-1)!); }
    }
  }
  return removed;
}
