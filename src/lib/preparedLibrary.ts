import generated from '../../resources/prepared-library.generated.json' with { type: 'json' };
import { appAssetPath } from './appBasePath';
import { DEFAULT_ARTICLE_SETTINGS } from './articleSettings';
import { createDefaultEditorWorkspace } from './editorWorkspace';
import { resolveSeedLocale } from './librarySeeds';
import type { GuidePlan, GuidePreparationProgress } from './entryGuide';

type Component = { directories: string[]; files: Record<string, string>; sample?: { month: string; folder: string; themeId: string; themeVersion: string; templatePath: string } };
const catalog = generated as { schemaVersion: number; components: Record<string, Component>; blobs: Record<string, number>; fingerprint: string };
const objects = new Map<string, ArrayBuffer>(), requests = new Map<string, Promise<ArrayBuffer>>();
async function pool<T>(items: readonly T[], action: (item: T) => Promise<void>, concurrency = 8) {
  let index = 0, failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure) { const next = index++; if (next >= items.length) return; try { await action(items[next]); } catch (error) { failure ??= error; } }
  }));
  if (failure) throw failure;
}
async function object(id: string): Promise<ArrayBuffer> {
  const known = objects.get(id); if (known) return known;
  const active = requests.get(id); if (active) return active;
  const pending = (async () => {
    const expected = catalog.blobs[id];
    if (!/^[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(expected) || expected < 0) throw Error('Invalid prepared library object');
    const response = await fetch(appAssetPath(`/prepared-library/objects/${id}`), { cache: 'force-cache', credentials: 'same-origin', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error(`Prepared library download failed: ${response.status}`);
    if (Number(response.headers.get('Content-Length') ?? 0) > expected) throw Error('Prepared library size mismatch');
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      if (reader) for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > expected) throw Error('Prepared library size mismatch');
        chunks.push(next.value);
      }
      else { const bytes = new Uint8Array(await response.arrayBuffer()); size = bytes.length; chunks.push(bytes); }
    } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
    if (size !== expected) throw Error('Prepared library size mismatch');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== id) throw Error('Prepared library verification failed');
    objects.set(id, bytes.buffer); return bytes.buffer;
  })().finally(() => requests.delete(id));
  requests.set(id, pending); return pending;
}

const preloading = new Map<string, Promise<void>>();
/** The common base starts early; the selected profile warms its own closure. */
export function preloadPreparedLibraries(choice: PreparedLibraryChoice = { locale: 'en-US', preset: 'empty' }): Promise<void> {
  const key = `${resolveSeedLocale(choice.locale)}/${choice.guide?.profile ?? choice.profile ?? choice.preset}`;
  let active = preloading.get(key);
  if (!active) {
    const required = Object.values(componentOf(choice).files);
    active = pool([...new Set(required)], async id => { await object(id); }).catch(error => { preloading.delete(key); throw error; });
    preloading.set(key, active);
  }
  return active;
}
export type PreparedLibraryChoice = { locale: string; preset: string; profile?: string; guide?: GuidePlan };
type FreshGuide = NonNullable<Component['sample']> & { autoSave: boolean; autoSnapshot: boolean; createdAt: string; totalBytes: number };
const freshGuides = new WeakMap<FileSystemDirectoryHandle, FreshGuide>();
const createdDirectories = new WeakMap<FileSystemDirectoryHandle, Set<string>>();
export function getFreshGuide(root: FileSystemDirectoryHandle) { return freshGuides.get(root); }
export function preparedCreationDirectories(root: FileSystemDirectoryHandle): ReadonlySet<string> { return createdDirectories.get(root) ?? new Set(); }
const TIME = '2000-01-01T00:00:00.000Z', MONTH = '2000-01';
function componentOf(choice: PreparedLibraryChoice) {
  const key = `${resolveSeedLocale(choice.locale)}/${choice.guide?.profile ?? choice.profile ?? choice.preset}`;
  const component = catalog.components[key]; if (!component) throw Error('Prepared library choice is unavailable');
  return component;
}
export async function prepareBuiltinLibrary(choice: PreparedLibraryChoice, current: () => boolean = () => true) {
  const component = componentOf(choice);
  await pool([...new Set(Object.values(component.files))], async id => { if (current()) await object(id); });
  return component;
}
/** The caller owns an empty, explicitly named new directory. Existing-library paths never use this. */
export async function installPreparedLibrary(root: FileSystemDirectoryHandle, choice: PreparedLibraryChoice, current: () => boolean = () => true, onProgress?: (progress: GuidePreparationProgress) => void): Promise<void> {
  const component = await prepareBuiltinLibrary(choice, current), now = new Date(), stamp = now.toISOString(), month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const files = { ...component.files }, directories = new Map([['', root]]);
  const settings = structuredClone(DEFAULT_ARTICLE_SETTINGS), workspace = createDefaultEditorWorkspace();
  if (choice.guide) {
    settings.autoSave.enabled = choice.guide.autoSave; settings.autoSnapshot.enabled = choice.guide.autoSnapshot;
    workspace.appearance = { themeId: choice.guide.themeId, colorMode: choice.guide.colorMode, custom: null };
  }
  const { version: _settingsVersion, ...preferences } = settings, { version: _workspaceVersion, ...organization } = workspace;
  const settingsJson = JSON.stringify({ version: 2, ...preferences, ...organization }, null, 2);
  const totalBytes = Object.values(files).reduce((sum, id) => sum + objects.get(id)!.byteLength, 0) + new TextEncoder().encode(settingsJson).byteLength;
  let completedBytes = 0;
  const report = () => onProgress?.({ completedBytes, totalBytes, localReady: false, fontsReady: false });
  report();
  const ownedDirectories = new Set<string>(); createdDirectories.set(root, ownedDirectories);
  const check = () => { if (!current()) throw new DOMException('Library creation cancelled', 'AbortError'); };
  const targetPath = (name: string) => name.startsWith(`articles/${MONTH}`) ? `articles/${month}` + name.slice(`articles/${MONTH}`.length) : name;
  const folderNames = new Set(component.directories.map(targetPath));
  check();
  for (const name of [...folderNames].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    if (name.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) throw Error('Unsafe prepared library directory');
    const parts = name.split('/'), leaf = parts.pop()!; check();
    directories.set(name, await directories.get(parts.join('/'))!.getDirectoryHandle(leaf, { create: true }));
    ownedDirectories.add(name);
  }
  const write = async (name: string, bytes: ArrayBuffer | string) => {
    const parts = name.split('/'), leaf = parts.pop()!, parent = directories.get(parts.join('/'));
    if (!parent || !leaf || leaf === '.' || leaf === '..' || /[\\\0]/.test(leaf)) throw Error('Unsafe prepared library path');
    check(); const handle = await parent.getFileHandle(leaf, { create: true });
    if ((await handle.getFile()).size !== 0) throw Error('New library file changed during preparation');
    check(); const stream = await handle.createWritable();
    try { check(); await stream.write(bytes); check(); await stream.close(); completedBytes += typeof bytes === 'string' ? new TextEncoder().encode(bytes).byteLength : bytes.byteLength; report(); }
    catch (error) { try { await stream.abort(); } catch { /* retain failure */ } throw error; }
  };
  const receiptPath = 'themes/default-themes.loaded', receipt = files[receiptPath];
  if (!receipt) throw new Error('The prepared library has no seed receipt');
  delete files[receiptPath];
  const seedFiles = new Set(Object.keys(files).filter(name => /^(?:snippets\/|templates\/|themes\/.*\.(?:json|md)$)/.test(name)));
  let receiptTask: Promise<void> | null = null, receiptFailure: unknown, copyFailure: unknown;
  const commitSeeds = () => {
    if (!seedFiles.size && !receiptTask) receiptTask = write(receiptPath, objects.get(receipt)!).catch(error => { receiptFailure = error; });
  };
  commitSeeds();
  try {
    await pool(Object.entries(files), async ([name, id]) => {
      let bytes: ArrayBuffer | string = objects.get(id)!;
      if (name.startsWith(`articles/${MONTH}/`) && /(?:article\.md|index\.json)$/.test(name) || name.startsWith('templates/entry-guide/')) {
        bytes = new TextDecoder().decode(bytes).replaceAll(TIME, stamp).replaceAll(MONTH, month);
      }
      await write(targetPath(name), bytes);
      if (seedFiles.delete(name)) commitSeeds();
    }, 16);
  } catch (error) { copyFailure = error; }
  // Drain the separately committed receipt before reporting a copy failure.
  await receiptTask;
  if (copyFailure) throw copyFailure;
  if (receiptFailure) throw receiptFailure;
  await write('settings.json', settingsJson);
  check();
  if (component.sample && choice.guide) freshGuides.set(root, { ...component.sample, month, autoSave: choice.guide.autoSave, autoSnapshot: choice.guide.autoSnapshot, createdAt: stamp, totalBytes });
}
