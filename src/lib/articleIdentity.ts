import { ProductError } from './i18n/productMessages';

type Entry = { path: string; aliases: string[] };
type Index = { schemaVersion: 1; articles: Record<string, Entry> };
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const pathValid = (path: string) => /^\d{4}-\d{2}\/[^/\\\u0000-\u001f]+$/.test(path) && !['.', '..'].includes(path.split('/')[1]);
const invalid = (): never => { throw new ProductError('articleFolder.invalidMetadata', { file: 'articles/index.json' }); };

async function readIndex(root: FileSystemDirectoryHandle) {
  let directory: FileSystemDirectoryHandle;
  try { directory = await root.getDirectoryHandle('articles'); } catch (error) { if (missing(error)) return { directory: null, raw: null, data: { schemaVersion: 1, articles: {} } as Index }; throw error; }
  if (await root.resolve(directory) === null) return invalid();
  let raw: string | null = null;
  try {
    const handle = await directory.getFileHandle('index.json');
    if (await root.resolve(handle) === null) return invalid();
    const file = await handle.getFile(); if (file.size > 2 * 1024 * 1024) return invalid(); raw = await file.text();
  } catch (error) { if (!missing(error)) throw error; }
  if (raw === null) return { directory, raw, data: { schemaVersion: 1, articles: {} } as Index };
  let data: Index; try { data = JSON.parse(raw); } catch { return invalid(); }
  if (!data || data.schemaVersion !== 1 || Object.keys(data).length !== 2 || !data.articles || typeof data.articles !== 'object' || Array.isArray(data.articles) || Object.keys(data.articles).length > 10000) return invalid();
  const paths = new Set<string>(), aliases = new Set<string>();
  for (const [id, entry] of Object.entries(data.articles)) {
    if (!/^[a-f0-9-]{36}$/.test(id) || !entry || Object.keys(entry).length !== 2 || typeof entry.path !== 'string' || !pathValid(entry.path) || !Array.isArray(entry.aliases) || entry.aliases.length > 1000) return invalid();
    if (paths.has(entry.path)) return invalid(); paths.add(entry.path);
    for (const path of entry.aliases) { if (typeof path !== 'string' || !pathValid(path) || path === entry.path || aliases.has(path)) return invalid(); aliases.add(path); }
  }
  return { directory, raw, data };
}

function mapping(data: Index, legacy = false, includeAliases = true) {
  const map = new Map<string, string>();
  if (includeAliases) for (const [id, entry] of Object.entries(data.articles)) for (const path of entry.aliases) map.set(path, id);
  for (const [id, entry] of Object.entries(data.articles)) map.set(entry.path, id);
  if (legacy) for (const [id, entry] of Object.entries(data.articles)) for (const path of entry.aliases) map.set(path, id);
  return map;
}
export async function articleIdentityMap(root: FileSystemDirectoryHandle, legacy = false) { return mapping((await readIndex(root)).data, legacy); }

export async function adoptArticleReferences(root: FileSystemDirectoryHandle, references: string[], assertCurrent: () => Promise<void>) {
  const { directory, raw, data } = await readIndex(root), map = mapping(data, false, false); let changed = false;
  if (!directory) return map;
  for (const path of new Set(references)) {
    if (map.has(path) || !pathValid(path)) continue;
    try {
      const [month, name] = path.split('/'), file = await (await (await directory.getDirectoryHandle(month)).getDirectoryHandle(name)).getFileHandle('article.md');
      if (await root.resolve(file) === null) return invalid();
    } catch (error) { if (missing(error)) continue; throw error; }
    const id = crypto.randomUUID(); data.articles[id] = { path, aliases: [] }; map.set(path, id); changed = true;
  }
  if (!changed) return map;
  await assertCurrent();
  let handle: FileSystemFileHandle, created = false;
  try { handle = await directory.getFileHandle('index.json'); } catch (error) { if (!missing(error)) throw error; handle = await directory.getFileHandle('index.json', { create: true }); created = true; }
  if (await root.resolve(handle) === null) return invalid();
  const initial = await handle.getFile(); let writer: FileSystemWritableFileStream | undefined;
  try {
    writer = await handle.createWritable();
    await writer.write(JSON.stringify(data, null, 2) + '\n'); await assertCurrent();
    if (await (await handle.getFile()).text() !== (raw ?? '')) throw new ProductError('articleFolder.changed');
    await writer.close();
  } catch (error) {
    try { await writer?.abort(); } catch { /* retain the primary failure */ }
    if (created) try {
      await assertCurrent();
      const current = await directory.getFileHandle('index.json'), snapshot = await current.getFile();
      if (await current.isSameEntry(handle) && snapshot.size === 0 && snapshot.lastModified === initial.lastModified) await directory.removeEntry('index.json');
    } catch { /* keep external replacements */ }
    throw error;
  }
  return map;
}

// Joins the existing article-directory transaction, including its rollback path.
export async function articleIdentityRename(root: FileSystemDirectoryHandle, previous: string, next: string) {
  if (!pathValid(previous) || !pathValid(next)) return invalid();
  const { directory, raw, data } = await readIndex(root); if (!directory) return invalid();
  const map = mapping(data, false, false), id = map.get(previous) ?? crypto.randomUUID();
  if (map.has(next) && map.get(next) !== id) throw new ProductError('articleFolder.identityConflict');
  const before = data.articles[id];
  const ownedAliases = new Set(Object.entries(data.articles).filter(([key]) => key !== id).flatMap(([, entry]) => entry.aliases));
  data.articles[id] = { path: next, aliases: [...new Set([...(before?.aliases ?? []), previous, before?.path ?? previous])].filter(path => path !== next && !ownedAliases.has(path)) };
  return { parent: directory, name: 'index.json', before: raw, after: JSON.stringify(data, null, 2) + '\n', id };
}
